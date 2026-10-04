// ResourceController (spec §10.2): the kernel-enforced limits of ONE render job (memory with no
// swap allowance, a task limit, a CPU quota) and the cleanup of every process the job started.
// Two backends behind one interface, chosen by detection:
//   CgroupV2Controller   one delegated cgroup v2 hierarchy offering memory, pids and cpu
//   CgroupV1Controller   separate v1 hierarchies: memory (+memsw), pids, cpu + cpuacct, and
//                        freezer when present (Fly Machines)
// v2 wins when complete, v1 otherwise; neither -> resource_limits_unavailable. A job never runs
// without limits. Every job group is <hierarchy>/motion/<render id>; the id is validated here.
//
// Root CLI, called only by motion-sandbox:
//   node resource-control.mjs prepare <id> <shell-pid>           create the groups, set limits, attach the shell
//   node resource-control.mjs finish <id> <shell-pid> <status>   detach, stop every task left, record, remove the groups
import * as realFs from 'node:fs';
import { pathToFileURL } from 'node:url';

export const LIMITS = Object.freeze({ memory_bytes: 3 * 1024 ** 3, pids_max: 1024, cpu_period_us: 100000, cpu_quota_us: 150000 });
export const cpuQuota = (quotaUs, periodUs) => (quotaUs > 0 && periodUs > 0 ? quotaUs / periodUs : null);
const JOBS = '/var/motion/jobs';
const V1_REQUIRED = ['memory', 'pids', 'cpu', 'cpuacct'];
const V2_REQUIRED = ['memory', 'pids', 'cpu'];
// v1 reports "no limit" as a huge page-rounded number; anything past 2^62 is unlimited.
const UNLIMITED = 2 ** 62;

export class ResourceLimitsUnavailable extends Error {
  constructor(reason, detail) { super(detail); this.reason = reason; }
}

export function jobPath(id) {
  if (!/^[0-9a-f]{32}$/.test(String(id))) throw new Error('render id must be 32 lowercase hex');
  return `/motion/${id}`;
}

export function parseMounts(text) {
  return text.split('\n').filter(Boolean).map(line => {
    const [, mountPoint, type, options = ''] = line.split(' ');
    return { mountPoint, type, options: options.split(',') };
  });
}

const io = (fs, root) => ({
  path: p => root + p,
  read: p => { try { return fs.readFileSync(root + p, 'utf8').trim(); } catch { return null; } },
  exists: p => fs.existsSync(root + p),
  write: (p, v) => fs.writeFileSync(root + p, String(v)),
  mkdir: p => fs.mkdirSync(root + p, { recursive: true }),
  rmdir: p => { try { fs.rmdirSync(root + p); } catch { /* checked by the caller */ } },
  list: p => { try { return fs.readdirSync(root + p); } catch { return []; } },
});
const num = v => (v === null || v === undefined || v === '' || v === 'max' ? null : Number(v));
const keyed = text => Object.fromEntries((text || '').split('\n').filter(Boolean).map(l => l.trim().split(/\s+/)).map(([k, v]) => [k, Number(v)]));

// Which backend this kernel offers. Read-only: the service (health), the child (self-report)
// and the root CLI all call it.
export function detect({ fs = realFs, root = '', mounts } = {}) {
  const f = io(fs, root);
  mounts ??= parseMounts(f.read('/proc/mounts') || '');
  for (const m of mounts.filter(m => m.type === 'cgroup2')) {
    const offered = (f.read(`${m.mountPoint}/cgroup.controllers`) || '').split(/\s+/);
    if (V2_REQUIRED.every(c => offered.includes(c))) return { backend: 'cgroup-v2', mount: m.mountPoint, controllers: [...V2_REQUIRED, 'memory.swap'] };
  }
  const v1 = {};
  for (const m of mounts.filter(m => m.type === 'cgroup')) for (const c of [...V1_REQUIRED, 'freezer']) if (m.options.includes(c)) v1[c] ??= m.mountPoint;
  const missing = V1_REQUIRED.filter(c => !v1[c]);
  if (missing.length) return { backend: null, reason: 'controllers_missing', detail: `no complete cgroup v2 hierarchy and no cgroup v1 ${missing.join(', ')} controller` };
  // memsw exists only with swap accounting; without it a job could swap past its memory limit.
  if (!f.exists(`${v1.memory}/memory.memsw.limit_in_bytes`)) return { backend: null, reason: 'swap_controller_unavailable', detail: 'cgroup v1 memory has no memory.memsw.limit_in_bytes (swap accounting is off)' };
  return { backend: 'cgroup-v1', mounts: v1, controllers: ['memory', 'memsw', 'pids', 'cpu', 'cpuacct', ...(v1.freezer ? ['freezer'] : [])] };
}

class CgroupV2Controller {
  constructor(d, f) { Object.assign(this, { backend: 'cgroup-v2', d, f, base: d.mount }); }
  dirs(id) { return [this.base + jobPath(id)]; }
  create(id) {
    const { f, base } = this, g = this.dirs(id)[0];
    f.mkdir(`${base}/motion`);
    for (const parent of [base, `${base}/motion`]) for (const c of V2_REQUIRED) {
      if ((f.read(`${parent}/cgroup.subtree_control`) || '').split(/\s+/).includes(c)) continue;
      try { f.write(`${parent}/cgroup.subtree_control`, `+${c}`); } catch { throw new ResourceLimitsUnavailable('controllers_missing', `cannot delegate the ${c} controller below ${parent}`); }
    }
    f.mkdir(g);
    if (!f.exists(`${g}/memory.swap.max`)) throw new ResourceLimitsUnavailable('swap_controller_unavailable', 'cgroup v2 memory has no memory.swap.max (swap accounting is off)');
    f.write(`${g}/memory.max`, LIMITS.memory_bytes);
    f.write(`${g}/memory.swap.max`, 0);
    f.write(`${g}/pids.max`, LIMITS.pids_max);
    f.write(`${g}/cpu.max`, `${LIMITS.cpu_quota_us} ${LIMITS.cpu_period_us}`);
  }
  root() { return [this.base]; }
  freeze(id, on) {
    const file = `${this.dirs(id)[0]}/cgroup.freeze`;
    if (!this.f.exists(file)) return false;
    this.f.write(file, on ? 1 : 0);
    return true;
  }
  frozen(id) { return keyed(this.f.read(`${this.dirs(id)[0]}/cgroup.events`)).frozen === 1; }
  stats(id) {
    const g = this.dirs(id)[0], f = this.f, cpu = keyed(f.read(`${g}/cpu.stat`)), max = f.read(`${g}/cpu.max`)?.split(' ') || [];
    return {
      memory_bytes: num(f.read(`${g}/memory.max`)), swap_bytes: num(f.read(`${g}/memory.swap.max`)),
      pids_max: num(f.read(`${g}/pids.max`)), cpu_period_us: num(max[1]), cpu_quota_us: num(max[0]),
      oom_kills: keyed(f.read(`${g}/memory.events`)).oom_kill ?? null, memory_peak: num(f.read(`${g}/memory.peak`)),
      swap_peak: num(f.read(`${g}/memory.swap.peak`)), memory_failcnt: keyed(f.read(`${g}/memory.events`)).max ?? null,
      pids_peak: num(f.read(`${g}/pids.peak`)), pids_limit_hits: keyed(f.read(`${g}/pids.events`)).max ?? null,
      cpu_nr_periods: cpu.nr_periods ?? null, cpu_throttled: cpu.nr_throttled ?? null,
      cpu_throttled_time_us: cpu.throttled_usec ?? null, cpu_usage_us: cpu.usage_usec ?? null,
    };
  }
}

class CgroupV1Controller {
  constructor(d, f) { Object.assign(this, { backend: 'cgroup-v1', d, f }); }
  // cpu and cpuacct are usually one hierarchy ("cpu,cpuacct"); each distinct hierarchy gets one job group.
  hierarchies() { return [...new Set(['memory', 'pids', 'cpu', 'cpuacct', 'freezer'].map(c => this.d.mounts[c]).filter(Boolean))]; }
  dirs(id) { return this.hierarchies().map(h => h + jobPath(id)); }
  at(c, id) { return this.d.mounts[c] + jobPath(id); }
  create(id) {
    const { f } = this;
    for (const h of this.hierarchies()) { f.mkdir(`${h}/motion`); f.mkdir(h + jobPath(id)); }
    const mem = this.at('memory', id), cpu = this.at('cpu', id);
    // Limit first, then memory+swap at the same value: the job gets no swap allowance.
    f.write(`${mem}/memory.limit_in_bytes`, LIMITS.memory_bytes);
    f.write(`${mem}/memory.memsw.limit_in_bytes`, LIMITS.memory_bytes);
    f.write(`${this.at('pids', id)}/pids.max`, LIMITS.pids_max);
    f.write(`${cpu}/cpu.cfs_period_us`, LIMITS.cpu_period_us);
    f.write(`${cpu}/cpu.cfs_quota_us`, LIMITS.cpu_quota_us);
  }
  root() { return this.hierarchies(); }
  freeze(id, on) {
    if (!this.d.mounts.freezer) return false;
    this.f.write(`${this.at('freezer', id)}/freezer.state`, on ? 'FROZEN' : 'THAWED');
    return true;
  }
  // FREEZING until every task has stopped, then FROZEN.
  frozen(id) { return this.f.read(`${this.at('freezer', id)}/freezer.state`) === 'FROZEN'; }
  stats(id) {
    const { f } = this, mem = this.at('memory', id), cpu = this.at('cpu', id), pids = this.at('pids', id);
    const limit = num(f.read(`${mem}/memory.limit_in_bytes`)), memsw = num(f.read(`${mem}/memory.memsw.limit_in_bytes`)), st = keyed(f.read(`${cpu}/cpu.stat`));
    const usage = num(f.read(`${this.at('cpuacct', id)}/cpuacct.usage`));
    return {
      memory_bytes: limit, swap_bytes: limit !== null && memsw !== null ? memsw - limit : null, memsw_limit: memsw,
      pids_max: num(f.read(`${pids}/pids.max`)), cpu_period_us: num(f.read(`${cpu}/cpu.cfs_period_us`)), cpu_quota_us: num(f.read(`${cpu}/cpu.cfs_quota_us`)),
      oom_kills: keyed(f.read(`${mem}/memory.oom_control`)).oom_kill ?? null, memory_peak: num(f.read(`${mem}/memory.max_usage_in_bytes`)),
      memory_failcnt: num(f.read(`${mem}/memory.failcnt`)), memsw_peak: num(f.read(`${mem}/memory.memsw.max_usage_in_bytes`)),
      pids_peak: num(f.read(`${pids}/pids.peak`)), pids_limit_hits: keyed(f.read(`${pids}/pids.events`)).max ?? null,
      cpu_nr_periods: st.nr_periods ?? null, cpu_throttled: st.nr_throttled ?? null,
      cpu_throttled_time_us: st.throttled_time !== undefined ? Math.round(st.throttled_time / 1000) : null, cpu_usage_us: usage !== null ? Math.round(usage / 1000) : null,
    };
  }
}

export function controllerFor(d, { fs = realFs, root = '' } = {}) {
  if (!d.backend) throw new ResourceLimitsUnavailable(d.reason, d.detail);
  const f = io(fs, root);
  return d.backend === 'cgroup-v2' ? new CgroupV2Controller(d, f) : new CgroupV1Controller(d, f);
}

// Shared by both backends: membership and cleanup work on each job group's cgroup.procs.
const tasks = (ctl, id) => [...new Set(ctl.dirs(id).flatMap(g => (ctl.f.read(`${g}/cgroup.procs`) || '').split('\n').filter(Boolean).map(Number)))];
export function attach(ctl, id, pid) { for (const g of ctl.dirs(id)) ctl.f.write(`${g}/cgroup.procs`, pid); }
export function detach(ctl, pids) { for (const h of ctl.root()) for (const pid of pids) try { ctl.f.write(`${h}/cgroup.procs`, pid); } catch { /* already gone */ } }

const realSleep = ms => new Promise(r => setTimeout(r, ms));
// Poll kernel state until check() holds or the deadline passes. Every cleanup and probe wait
// goes through this: never a blind sleep that assumes the kernel has caught up.
export async function pollUntil(check, { timeoutMs, intervalMs = 100, sleep = realSleep, now = () => Date.now() } = {}) {
  const start = now();
  for (;;) {
    if (await check()) return { ok: true, waited_ms: now() - start };
    if (now() - start >= timeoutMs) return { ok: false, waited_ms: now() - start };
    await sleep(intervalMs);
  }
}

// v1 has no cgroup.kill: freeze (when available) and wait until the kernel says frozen, SIGTERM
// every task still in a job group, thaw, give them up to graceMs to leave, SIGKILL the
// survivors, then poll until every group is empty (re-sending SIGKILL), up to killWaitMs.
export async function cleanup(ctl, id, { kill = (pid, sig) => process.kill(pid, sig), sleep = realSleep, now = () => Date.now(), graceMs = 2000, killWaitMs = 5000 } = {}) {
  const signal = (pid, sig) => { try { kill(pid, sig); } catch { /* exited */ } };
  const poll = (check, timeoutMs, intervalMs = 100) => pollUntil(check, { timeoutMs, intervalMs, sleep, now });
  const frozen = ctl.freeze(id, true);
  if (frozen) await poll(() => ctl.frozen(id), 1000, 20);
  const first = tasks(ctl, id);
  for (const pid of first) signal(pid, 'SIGTERM');
  if (frozen) ctl.freeze(id, false);
  if (first.length) await poll(() => !tasks(ctl, id).length, graceMs);
  const survivors = tasks(ctl, id);
  for (const pid of survivors) signal(pid, 'SIGKILL');
  if (survivors.length) await poll(() => { const left = tasks(ctl, id); for (const pid of left) signal(pid, 'SIGKILL'); return !left.length; }, killWaitMs, 200);
  return { freezer: frozen ? 'used' : 'unavailable', terminated: first.length, killed: survivors.length, remaining: tasks(ctl, id).length };
}

// After the sandbox exits: detach the launcher, stop every task, then let the kernel finish.
// A process in the middle of its exit (State Z or X) still shows in /proc for a moment, so
// poll until the job groups are empty AND the render user owns no process, up to settleMs.
// Anything still there after that is a real leak: cleanup fails closed. Stats are read
// before the groups are removed; removal is polled and checked too.
export async function finishJob(ctl, id, { detachPids = [], renderProcs = () => renderUserProcesses(), settleMs = 5000, sleep = realSleep, now = () => Date.now(), ...opts } = {}) {
  detach(ctl, detachPids);
  const clean = await cleanup(ctl, id, { sleep, now, ...opts });
  let lingering = [];
  const settled = await pollUntil(() => { lingering = renderProcs() || []; return !tasks(ctl, id).length && !lingering.length; }, { timeoutMs: settleMs, sleep, now });
  const remaining = tasks(ctl, id).length;
  const stats = ctl.stats(id);
  const removed = (await pollUntil(() => removeGroups(ctl, id), { timeoutMs: settleMs, sleep, now })).ok;
  return {
    stats,
    cleanup: { ...clean, remaining, settle_ms: settled.waited_ms, groups_removed: removed, render_user_processes: lingering.length,
      ...(lingering.length ? { lingering: lingering.slice(0, 10) } : {}), ok: settled.ok && remaining === 0 && removed && !lingering.length },
  };
}
export function removeGroups(ctl, id) {
  for (const g of ctl.dirs(id)) ctl.f.rmdir(g);
  return ctl.dirs(id).every(g => !ctl.f.exists(g));
}

// The normalized, host-detail-free record every render returns as `resources`.
export function normalize(backend, s) {
  return { backend, ...s, cpu_quota: cpuQuota(s.cpu_quota_us, s.cpu_period_us) };
}

// What the CURRENT process runs under (the render child's self-report): its groups from
// /proc/self/cgroup and the limits read from them. No paths leave this function except the
// cpu.stat file the resource probe needs.
export function selfLimits({ fs = realFs, root = '' } = {}) {
  const d = detect({ fs, root });
  if (!d.backend) return { report: { backend: null, reason: d.reason }, cpuStat: null, pidsCurrent: null };
  const f = io(fs, root);
  const lines = (f.read('/proc/self/cgroup') || '').split('\n').filter(Boolean).map(l => { const [h, c, ...p] = l.split(':'); return { h, c: c.split(','), path: p.join(':') }; });
  const group = c => (d.backend === 'cgroup-v2' ? lines.find(l => l.h === '0') : lines.find(l => l.c.includes(c)))?.path ?? null;
  const groups = Object.fromEntries((d.backend === 'cgroup-v2' ? ['unified'] : V1_REQUIRED).map(c => [c, group(c)]));
  const paths = Object.values(groups);
  const common = paths.every(p => p === paths[0]) ? paths[0] : null;
  let s = {};
  if (common && /^\/motion\/[0-9a-f]{32}$/.test(common)) {
    const id = common.slice('/motion/'.length);
    const ctl = controllerFor(d, { fs, root });
    s = ctl.stats(id);
    const dir = c => (d.backend === 'cgroup-v2' ? ctl.dirs(id)[0] : ctl.at(c, id));
    return { report: { ...normalize(d.backend, s), group: common, controllers: d.controllers }, cpuStat: root + dir('cpu') + '/cpu.stat', pidsCurrent: root + dir('pids') + '/pids.current' };
  }
  return { report: { backend: d.backend, group: common, groups, controllers: d.controllers }, cpuStat: null, pidsCurrent: null };
}
export const unlimited = v => v === null || v === undefined || v >= UNLIMITED || v < 0;

// Every process the render user still owns, with its state (Z or X while the kernel finishes an
// exit). After cleanup this must be empty.
export function renderUserProcesses({ fs = realFs, root = '', user = 'motion-render' } = {}) {
  const f = io(fs, root);
  const uid = (f.read('/etc/passwd') || '').split('\n').map(l => l.split(':')).find(p => p[0] === user)?.[2];
  if (uid === undefined) return null;
  return f.list('/proc').filter(n => /^\d+$/.test(n)).flatMap(pid => {
    const status = f.read(`/proc/${pid}/status`) || '';
    if (!new RegExp(`^Uid:\\s+${uid}\\s`, 'm').test(status)) return [];
    const field = name => status.match(new RegExp(`^${name}:\\s+(.+)$`, 'm'))?.[1] ?? null;
    return [{ pid: Number(pid), name: field('Name'), state: field('State')?.[0] ?? null }];
  });
}

// One field of /proc/<pid>/status (the Linux identity tests). Only horizontal whitespace
// follows the colon: with \s an empty field ("Groups:" on a process with no supplementary
// groups) swallows the newline and reads the next line ("NStgid: ...") as its value.
// ponytail: renderUserProcesses above keeps its own \s+ patterns for Uid/Name/State, which are
// never empty; move it onto this helper with the next runtime change.
export function procStatusField(status, name) {
  const m = status.match(new RegExp(`^${name}:[ \\t]*(.*)$`, 'm'));
  return m ? m[1].trim() : null;
}

async function cli([cmd, id, shell, status]) {
  jobPath(id);
  if (!/^[1-9]\d*$/.test(String(shell))) throw new Error('shell pid must be a positive integer');
  const exitFile = `${JOBS}/${id}/out/sandbox-exit.json`;
  const out = obj => realFs.writeFileSync(exitFile, `${JSON.stringify(obj)}\n`);
  const d = detect();
  if (cmd === 'prepare') {
    try {
      const ctl = controllerFor(d);
      // Old job groups are empty once their processes are gone.
      for (const h of ctl.root()) for (const old of ctl.f.list(`${h}/motion`)) if (/^[0-9a-f]{32}$/.test(old)) ctl.f.rmdir(`${h}/motion/${old}`);
      ctl.create(id);
      // The launcher shell joins every group before it starts anything: the job is limited from its first instruction.
      attach(ctl, id, Number(shell));
      const s = ctl.stats(id);
      if (unlimited(s.memory_bytes) || s.swap_bytes !== 0 || unlimited(s.pids_max) || !cpuQuota(s.cpu_quota_us, s.cpu_period_us)) throw new ResourceLimitsUnavailable('limits_not_applied', 'the kernel did not keep a memory, swap, task or CPU limit');
      return 0;
    } catch (error) {
      try { const ctl = controllerFor(d); detach(ctl, [Number(shell)]); removeGroups(ctl, id); } catch { /* nothing was created */ }
      out({ error: 'resource_limits_unavailable', reason: error.reason || 'setup_failed', detail: error.message, backend: d.backend });
      console.error(`motion-sandbox: resource limits unavailable: ${error.reason || 'setup_failed'}: ${error.message}`);
      return 70;
    }
  }
  if (cmd === 'finish') {
    const ctl = controllerFor(d);
    // This helper was started by the launcher shell, so it begins inside the job groups too.
    const { stats, cleanup: proof } = await finishJob(ctl, id, { detachPids: [Number(shell), process.pid] });
    out({ exit_status: Number(status), ...normalize(d.backend, stats), controllers: d.controllers, cleanup: proof });
    return 0;
  }
  throw new Error('usage: resource-control.mjs prepare <id> <shell-pid> | finish <id> <shell-pid> <status>');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(await cli(process.argv.slice(2)));
