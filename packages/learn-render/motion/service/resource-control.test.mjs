// ResourceController (spec §10.2) on fake cgroup trees under a temp root: backend detection
// (v2 preferred, v1 on Fly, fail closed), the v1 paths and values, the CPU quota, cleanup, the
// render-id path rule and the normalized self-report. The kernel side runs in service.linux.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  LIMITS, ResourceLimitsUnavailable, attach, cleanup, controllerFor, cpuQuota, detach, detect, jobPath, normalize, parseMounts,
  removeGroups, renderUserProcesses, selfLimits, unlimited,
} from './resource-control.mjs';

const ID = '0123456789abcdef0123456789abcdef';
const V1_MOUNTS = [
  'cgroup2 /sys/fs/cgroup/unified cgroup2 rw,nosuid,nodev,noexec,relatime 0 0',
  'cgroup /sys/fs/cgroup/memory cgroup rw,nosuid,nodev,noexec,relatime,memory 0 0',
  'cgroup /sys/fs/cgroup/pids cgroup rw,nosuid,nodev,noexec,relatime,pids 0 0',
  'cgroup /sys/fs/cgroup/cpu,cpuacct cgroup rw,nosuid,nodev,noexec,relatime,cpu,cpuacct 0 0',
  'cgroup /sys/fs/cgroup/freezer cgroup rw,nosuid,nodev,noexec,relatime,freezer 0 0',
];
// A fake root: files under it stand in for /proc and cgroupfs. rmdir behaves like cgroupfs
// (a group directory goes away with its control files).
function fakeRoot(t, files) {
  const root = mkdtempSync(join(tmpdir(), 'motion-rc-')).replaceAll('\\', '/');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [p, text] of Object.entries(files)) { mkdirSync(dirname(root + p), { recursive: true }); writeFileSync(root + p, text); }
  const fakeFs = { ...fs, rmdirSync: p => rmSync(p, { recursive: true, force: true }) };
  return { root, fs: fakeFs, opts: { root, fs: fakeFs }, read: p => readFileSync(root + p, 'utf8'), exists: p => existsSync(root + p) };
}
const v1Root = (t, extra = {}) => fakeRoot(t, {
  '/proc/mounts': V1_MOUNTS.join('\n'),
  '/sys/fs/cgroup/memory/memory.memsw.limit_in_bytes': '9223372036854771712',
  '/sys/fs/cgroup/memory/cgroup.procs': '', '/sys/fs/cgroup/pids/cgroup.procs': '', '/sys/fs/cgroup/cpu,cpuacct/cgroup.procs': '', '/sys/fs/cgroup/freezer/cgroup.procs': '',
  ...extra,
});

test('render-id paths: only 32 lowercase hex, never a user path fragment', () => {
  assert.equal(jobPath(ID), `/motion/${ID}`);
  for (const bad of ['../etc', `${ID}/..`, ID.toUpperCase(), ID.slice(1), '', null, `${ID}\n`]) assert.throws(() => jobPath(bad), /32 lowercase hex/, String(bad));
});

test('detection: a complete cgroup v2 hierarchy is preferred', t => {
  const { opts } = fakeRoot(t, {
    '/proc/mounts': [...V1_MOUNTS, 'cgroup2 /sys/fs/cgroup cgroup2 rw 0 0'].join('\n'),
    '/sys/fs/cgroup/cgroup.controllers': 'cpuset cpu io memory hugetlb pids rdma',
    '/sys/fs/cgroup/unified/cgroup.controllers': '',
    '/sys/fs/cgroup/memory/memory.memsw.limit_in_bytes': '1',
  });
  const d = detect(opts);
  assert.equal(d.backend, 'cgroup-v2');
  assert.equal(d.mount, '/sys/fs/cgroup');
});

test('detection: Fly-style v1 hierarchies (hybrid, empty unified mount) select cgroup v1', t => {
  const { opts } = v1Root(t, { '/sys/fs/cgroup/unified/cgroup.controllers': '' });
  const d = detect(opts);
  assert.equal(d.backend, 'cgroup-v1');
  assert.deepEqual(d.controllers, ['memory', 'memsw', 'pids', 'cpu', 'cpuacct', 'freezer']);
  assert.deepEqual(d.mounts, { memory: '/sys/fs/cgroup/memory', pids: '/sys/fs/cgroup/pids', cpu: '/sys/fs/cgroup/cpu,cpuacct', cpuacct: '/sys/fs/cgroup/cpu,cpuacct', freezer: '/sys/fs/cgroup/freezer' });
});

test('fail closed: a missing v1 controller or missing swap accounting means no backend, never no limits', t => {
  const noPids = fakeRoot(t, { '/proc/mounts': V1_MOUNTS.filter(l => !l.includes(',pids ')).join('\n'), '/sys/fs/cgroup/memory/memory.memsw.limit_in_bytes': '1' });
  const d1 = detect(noPids.opts);
  assert.deepEqual([d1.backend, d1.reason], [null, 'controllers_missing']);
  assert.match(d1.detail, /pids/);
  assert.throws(() => controllerFor(d1, noPids.opts), e => e instanceof ResourceLimitsUnavailable && e.reason === 'controllers_missing');
  const noSwap = fakeRoot(t, { '/proc/mounts': V1_MOUNTS.join('\n') });
  const d2 = detect(noSwap.opts);
  assert.deepEqual([d2.backend, d2.reason], [null, 'swap_controller_unavailable']);
  assert.throws(() => controllerFor(d2, noSwap.opts), e => e.reason === 'swap_controller_unavailable');
  assert.equal(detect(fakeRoot(t, { '/proc/mounts': '' }).opts).backend, null);
});

test('cgroup v1: one logical job group across the memory, pids, cpu,cpuacct and freezer hierarchies, with the locked limits', t => {
  const f = v1Root(t);
  const ctl = controllerFor(detect(f.opts), f.opts);
  ctl.create(ID);
  const at = (h, file) => f.read(`/sys/fs/cgroup/${h}/motion/${ID}/${file}`);
  assert.equal(at('memory', 'memory.limit_in_bytes'), String(3 * 1024 ** 3));
  assert.equal(at('memory', 'memory.memsw.limit_in_bytes'), String(3 * 1024 ** 3)); // memsw == limit: no swap allowance
  assert.equal(at('pids', 'pids.max'), '1024');
  assert.equal(at('cpu,cpuacct', 'cpu.cfs_period_us'), '100000');
  assert.equal(at('cpu,cpuacct', 'cpu.cfs_quota_us'), '150000');
  attach(ctl, ID, 4242);
  for (const h of ['memory', 'pids', 'cpu,cpuacct', 'freezer']) assert.equal(at(h, 'cgroup.procs'), '4242', h);
  assert.deepEqual(ctl.dirs(ID), ['memory', 'pids', 'cpu,cpuacct', 'freezer'].map(h => `/sys/fs/cgroup/${h}/motion/${ID}`));
  detach(ctl, [4242]);
  assert.equal(f.read('/sys/fs/cgroup/memory/cgroup.procs'), '4242');
});

test('cgroup v2 (kept for delegated hosts): the same limits, and no swap accounting fails closed', t => {
  const files = { '/proc/mounts': 'cgroup2 /sys/fs/cgroup cgroup2 rw 0 0', '/sys/fs/cgroup/cgroup.controllers': 'cpu memory pids', '/sys/fs/cgroup/cgroup.subtree_control': '' };
  const f = fakeRoot(t, { ...files, [`/sys/fs/cgroup/motion/${ID}/memory.swap.max`]: 'max' }); // the kernel creates this file in every group
  const ctl = controllerFor(detect(f.opts), f.opts);
  ctl.create(ID);
  const at = file => f.read(`/sys/fs/cgroup/motion/${ID}/${file}`);
  assert.deepEqual([at('memory.max'), at('memory.swap.max'), at('pids.max'), at('cpu.max')], [String(3 * 1024 ** 3), '0', '1024', '150000 100000']);
  assert.deepEqual(ctl.dirs(ID), [`/sys/fs/cgroup/motion/${ID}`]);
  const noSwap = fakeRoot(t, files);
  assert.throws(() => controllerFor(detect(noSwap.opts), noSwap.opts).create(ID), e => e.reason === 'swap_controller_unavailable');
});

test('CPU quota: 150000 us per 100000 us period is 1.5 CPUs; no quota is no number', () => {
  assert.equal(cpuQuota(LIMITS.cpu_quota_us, LIMITS.cpu_period_us), 1.5);
  assert.equal(cpuQuota(-1, 100000), null);
  assert.equal(normalize('cgroup-v1', { cpu_quota_us: 150000, cpu_period_us: 100000 }).cpu_quota, 1.5);
});

test('cgroup v1 stats are normalized: no swap allowance, OOM kills, task-limit hits, throttling in microseconds', t => {
  const f = v1Root(t);
  const ctl = controllerFor(detect(f.opts), f.opts);
  ctl.create(ID);
  const put = (h, file, text) => writeFileSync(`${f.root}/sys/fs/cgroup/${h}/motion/${ID}/${file}`, text);
  put('memory', 'memory.oom_control', 'oom_kill_disable 0\nunder_oom 0\noom_kill 2');
  put('memory', 'memory.max_usage_in_bytes', '3221000000');
  put('memory', 'memory.failcnt', '17');
  put('pids', 'pids.events', 'max 5');
  put('cpu,cpuacct', 'cpu.stat', 'nr_periods 40\nnr_throttled 12\nthrottled_time 900000000');
  put('cpu,cpuacct', 'cpuacct.usage', '4500000000');
  const s = normalize('cgroup-v1', ctl.stats(ID));
  assert.deepEqual(
    [s.backend, s.memory_bytes, s.swap_bytes, s.memsw_limit, s.pids_max, s.cpu_quota, s.oom_kills, s.memory_peak, s.memory_failcnt, s.pids_limit_hits, s.cpu_nr_periods, s.cpu_throttled, s.cpu_throttled_time_us, s.cpu_usage_us],
    ['cgroup-v1', 3 * 1024 ** 3, 0, 3 * 1024 ** 3, 1024, 1.5, 2, 3221000000, 17, 5, 40, 12, 900000, 4500000],
  );
});

test('cleanup: freeze, SIGTERM, thaw, SIGKILL the survivors, prove every group empty, remove every group', async t => {
  const f = v1Root(t);
  const ctl = controllerFor(detect(f.opts), f.opts);
  ctl.create(ID);
  const groups = ctl.dirs(ID);
  for (const g of groups) writeFileSync(`${f.root}${g}/cgroup.procs`, '101\n102');
  const signals = [], freezer = [];
  const origWrite = ctl.f.write;
  ctl.f.write = (p, v) => { if (p.endsWith('freezer.state')) freezer.push(String(v)); return origWrite(p, v); };
  // 101 exits on SIGTERM; 102 ignores it and needs SIGKILL.
  const kill = (pid, sig) => {
    signals.push(`${pid}:${sig}`);
    if (sig === 'SIGKILL' || pid === 101) for (const g of groups) writeFileSync(`${f.root}${g}/cgroup.procs`, readFileSync(`${f.root}${g}/cgroup.procs`, 'utf8').split('\n').filter(x => x && Number(x) !== pid).join('\n'));
  };
  const result = await cleanup(ctl, ID, { kill, sleep: async () => {}, graceMs: 0 });
  assert.deepEqual(freezer, ['FROZEN', 'THAWED']);
  assert.deepEqual(signals, ['101:SIGTERM', '102:SIGTERM', '102:SIGKILL']);
  assert.deepEqual(result, { freezer: 'used', terminated: 2, killed: 1, remaining: 0 });
  assert.equal(removeGroups(ctl, ID), true);
  for (const g of groups) assert.equal(f.exists(g), false, g);
});

test('cleanup without a freezer still empties the groups and says the freezer was unavailable', async t => {
  const f = fakeRoot(t, { '/proc/mounts': V1_MOUNTS.filter(l => !l.includes('freezer')).join('\n'), '/sys/fs/cgroup/memory/memory.memsw.limit_in_bytes': '1' });
  const ctl = controllerFor(detect(f.opts), f.opts);
  ctl.create(ID);
  for (const g of ctl.dirs(ID)) writeFileSync(`${f.root}${g}/cgroup.procs`, '');
  const result = await cleanup(ctl, ID, { kill: () => {}, sleep: async () => {} });
  assert.deepEqual(result, { freezer: 'unavailable', terminated: 0, killed: 0, remaining: 0 });
});

test('self-report: the child reads its own groups and limits; split or foreign groups never pass as a job group', t => {
  const f = v1Root(t, {
    '/proc/self/cgroup': [`12:memory:/motion/${ID}`, `6:pids:/motion/${ID}`, `3:cpu,cpuacct:/motion/${ID}`, `9:freezer:/motion/${ID}`, '1:name=systemd:/', '0::/'].join('\n'),
  });
  controllerFor(detect(f.opts), f.opts).create(ID);
  const { report, cpuStat } = selfLimits(f.opts);
  assert.deepEqual([report.backend, report.group, report.memory_bytes, report.swap_bytes, report.pids_max, report.cpu_quota], ['cgroup-v1', `/motion/${ID}`, 3 * 1024 ** 3, 0, 1024, 1.5]);
  assert.equal(cpuStat, `${f.root}/sys/fs/cgroup/cpu,cpuacct/motion/${ID}/cpu.stat`);
  assert.ok(!JSON.stringify(report).includes('/sys/fs/cgroup'), 'no host paths in the report');
  writeFileSync(`${f.root}/proc/self/cgroup`, [`12:memory:/motion/${ID}`, '6:pids:/', `3:cpu,cpuacct:/motion/${ID}`].join('\n'));
  assert.equal(selfLimits(f.opts).report.group, null);
  assert.equal(unlimited(9223372036854771712), true);
  assert.equal(unlimited(null), true);
  assert.equal(unlimited(1024), false);
});

test('render-user processes are counted from /proc after cleanup', t => {
  const f = fakeRoot(t, {
    '/etc/passwd': 'root:x:0:0::/root:/bin/sh\nmotion-svc:x:10011:10010::/var/motion:/usr/sbin/nologin\nmotion-render:x:10012:10010::/nonexistent:/usr/sbin/nologin',
    '/proc/1/status': 'Name:\tinit\nUid:\t0\t0\t0\t0', '/proc/77/status': 'Name:\tnode\nUid:\t10011\t10011\t10011\t10011',
    '/proc/88/status': 'Name:\tchrome\nUid:\t10012\t10012\t10012\t10012',
  });
  assert.equal(renderUserProcesses(f.opts), 1);
});

test('parseMounts keeps the type and every option', () => {
  assert.deepEqual(parseMounts('cgroup /sys/fs/cgroup/cpu,cpuacct cgroup rw,cpu,cpuacct 0 0'), [{ mountPoint: '/sys/fs/cgroup/cpu,cpuacct', type: 'cgroup', options: ['rw', 'cpu', 'cpuacct'] }]);
});
