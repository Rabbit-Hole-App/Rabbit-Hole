// The real sandbox (spec §10.2), inside the rabbit-hole-motion-renderer image only. Run on the
// deployed dev machine as root or motion-svc, e.g.
//   fly ssh console -a rabbit-hole-motion-renderer-dev -C "sh -c 'cd /app/packages/learn-render && node --test motion/service/service.linux.test.mjs'"
// Elsewhere every test skips. service.test.mjs covers the HTTP contract on any host.
// Backend-aware: Fly Machines expose cgroup v1 (the default expectation); a host with delegated
// cgroup v2 sets MOTION_EXPECT_RESOURCE_BACKEND=cgroup-v2. The security invariants are the same.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmodSync, chownSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LINUX_JOBS_DIR, motionRenderService } from './server.mjs';
import { controllerFor, detect } from './resource-control.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const LAUNCHER = '/usr/local/sbin/motion-sandbox';
const BACKEND = process.env.MOTION_EXPECT_RESOURCE_BACKEND || 'cgroup-v1';
const CONTROLLERS = { 'cgroup-v1': ['memory', 'memsw', 'pids', 'cpu', 'cpuacct'], 'cgroup-v2': ['memory', 'pids', 'cpu', 'memory.swap'] }[BACKEND];
const skip = !(process.platform === 'linux' && existsSync(LAUNCHER)) && 'needs the Linux render image (motion-sandbox installed)';
const sh = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8' });
const idOf = (...args) => Number(sh('id', args).stdout.trim());
const sleep = ms => new Promise(r => setTimeout(r, ms));
const TOKEN = randomBytes(24).toString('hex');
const GIB3 = 3 * 1024 ** 3;
const job = demo => {
  const f = name => readFileSync(join(HERE, '..', 'fixtures', demo, name), 'utf8');
  return { schema: 'motion-render/1', renderer: 'remotion', brief: JSON.parse(f('brief.json')), storyboard: JSON.parse(f('storyboard.json')), composition: { composition_id: demo, source: f('composition.jsx') } };
};
// Every controller's job directory for this render is gone.
const groupsGone = id => controllerFor(detect()).dirs(id).every(g => !existsSync(g));

async function service(t, options = {}) {
  const svc = motionRenderService({ token: TOKEN, sandbox: 'linux', ...options });
  await new Promise(r => svc.server.listen(0, '127.0.0.1', r));
  t.after(() => { svc.stop(); svc.server.close(); });
  const base = `http://127.0.0.1:${svc.server.address().port}`;
  const call = (path, init = {}) => fetch(base + path, { ...init, headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json', ...init.headers } });
  const until = async id => {
    for (;;) {
      const r = await (await call(`/render/${id}`)).json();
      // The service stays reachable over its own network while the child has none.
      assert.equal((await (await fetch(`${base}/health`)).json()).ok, true);
      if (r.status !== 'rendering') return r;
      await sleep(2000);
    }
  };
  return { call, until };
}

const assertSandboxed = sandbox => {
  assert.equal(sandbox.mode, 'linux');
  assert.equal(sandbox.uid, idOf('-u', 'motion-render'));
  assert.equal(sandbox.gid, idOf('-g', 'motion-render'));
  assert.notEqual(sandbox.uid, idOf('-u', 'motion-svc'));
  assert.deepEqual(sandbox.env_keys, ['HOME', 'MOTION_SANDBOX', 'NODE_ENV', 'PATH', 'TMPDIR']);
  assert.match(sandbox.network, /^denied/);
  for (const [path, seen] of Object.entries(sandbox.hidden)) assert.notEqual(seen, 'VISIBLE', path);
  assert.match(sandbox.renderer_write, /^(EROFS|EACCES)$/);
  assert.ok(sandbox.processes < 64, `${sandbox.processes} processes visible`);
  // The limits the kernel applies to this child, read by the child itself.
  const l = sandbox.limits;
  assert.equal(l.backend, BACKEND);
  assert.match(l.group, /^\/motion\/[0-9a-f]{32}$/); // the same job group in every controller hierarchy
  assert.deepEqual([l.memory_bytes, l.swap_bytes, l.pids_max, l.cpu_quota], [GIB3, 0, 1024, 1.5]);
  assert.deepEqual([l.rlimit_nproc, l.rlimit_fsize], ['1024', '67108864']);
  assert.deepEqual(sandbox.breach, []);
};
const assertClean = resources => {
  assert.equal(resources.backend, BACKEND);
  assert.deepEqual([resources.memory_bytes, resources.swap_bytes, resources.pids_max, resources.cpu_quota], [GIB3, 0, 1024, 1.5]);
  assert.deepEqual([resources.cleanup.remaining, resources.cleanup.groups_removed, resources.cleanup.render_user_processes, resources.cleanup.ok], [0, true, 0, true]);
};
// Proof-only jobs (never accepted over HTTP): a job directory written here, run by the launcher.
function probeJob(t, probe) {
  const id = randomBytes(16).toString('hex'), dir = join(LINUX_JOBS_DIR, id);
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'out'), { recursive: true });
  for (const d of [dir, join(dir, 'out')]) { chownSync(d, idOf('-u', 'motion-svc'), idOf('-g', 'motion-render')); chmodSync(d, 0o2770); }
  writeFileSync(join(dir, 'job.json'), JSON.stringify({ render_id: id, probe }), { mode: 0o644 });
  const run = process.getuid() === 0 ? sh(LAUNCHER, [id]) : sh('sudo', ['-n', LAUNCHER, id]);
  const read = f => JSON.parse(readFileSync(join(dir, 'out', f), 'utf8'));
  return { run, result: read('result.json'), exit: read('sandbox-exit.json'), id };
}

test(`health names the resource backend (${BACKEND}) and its controllers, with no host paths`, { skip }, async t => {
  const { call } = await service(t);
  const health = await (await call('/health')).json();
  assert.equal(health.resource_backend, BACKEND);
  for (const c of CONTROLLERS) assert.ok(health.resource_controllers.includes(c), c);
  assert.ok(!JSON.stringify(health).includes('/sys/fs/cgroup'));
});

test('render child: its own user, no network for the page or for Node, the service hidden, the renderer read-only, an empty environment', { skip, timeout: 180000 }, async t => {
  const { call } = await service(t);
  // The probe composition with the page CSP off, so only the OS boundary remains.
  const { run, result, exit, id } = probeJob(t, 'network');
  assert.equal(run.status, 0, run.stderr);
  assert.equal(result.status, 'probe', JSON.stringify(result));
  assertSandboxed(result.sandbox);
  const page = result.probe.browser;
  assert.equal(result.probe.csp, false);
  for (const k of ['fetchOut', 'xhr', 'websocket', 'image', 'loopbackOtherPort']) assert.match(page[k], /^(failed|timeout|threw)/, `${k}: ${page[k]}`);
  assert.match(page.ownOrigin, /^reached 200/);
  assertClean(exit);
  assert.equal(groupsGone(id), true);
  assert.equal((await (await call('/health')).json()).ok, true);
});

test('resource limits hold: a spawn storm stops at the task limit, a 4 GiB allocation is OOM-killed, busy CPU is throttled, nothing escapes', { skip, timeout: 300000 }, async t => {
  const { call } = await service(t);
  const { run, result, exit, id } = probeJob(t, 'resources');
  assert.equal(run.status, 0, run.stderr);
  assert.equal(result.status, 'probe', JSON.stringify(result));
  assertSandboxed(result.sandbox);
  const { processes, memory, cpu } = result.probe;
  // PID: the kernel refuses before 1024 tasks, the refusal is visible, children stay in the job groups.
  assert.ok(processes.started < 1024 && processes.refused, `started ${processes.started}, refused ${processes.refused}`);
  assert.equal(processes.same_groups, true);
  assert.ok(exit.pids_limit_hits >= 1, JSON.stringify(exit));
  // Memory: 3 GiB with no swap allowance; the 4 GiB process is killed and the OOM is recorded.
  assert.equal(memory.allocated, false);
  assert.equal(memory.signal, 'SIGKILL');
  assert.ok(exit.oom_kills >= 1, JSON.stringify(exit));
  // CPU: two busy workers against a 1.5-CPU quota are throttled, and the counters move.
  assert.ok(cpu.periods > 0 && cpu.throttled_periods > 0, `quota did not throttle: ${JSON.stringify(cpu)}`);
  assert.ok(exit.cpu_throttled > 0 && exit.cpu_nr_periods > 0);
  assertClean(exit);
  assert.equal(groupsGone(id), true);
  // The service survives the probe.
  assert.equal((await (await call('/health')).json()).ok, true);
});

test('a real Demo A render through the sandboxed service: 1920x1080, 30 fps, 450 frames, deterministic, one at a time, cleaned up', { skip, timeout: 10 * 60 * 1000 }, async t => {
  const { call, until } = await service(t);
  const res = await call('/render', { method: 'POST', body: JSON.stringify(job('demo-a')) });
  assert.equal(res.status, 202);
  const { render_id } = await res.json();
  assert.equal((await call('/render', { method: 'POST', body: JSON.stringify(job('demo-a')) })).status, 429);
  const r = await until(render_id);
  console.log(JSON.stringify({ ...r, contact_sheet: `${r.contact_sheet?.length} tiles` }, null, 2));
  assert.equal(r.status, 'ready', `${r.error}: ${r.detail}`);
  assert.deepEqual([r.width, r.height, r.fps, r.frame_count], [1920, 1080, 30, 450]);
  assert.equal(r.determinism.identical, true);
  assert.equal(r.final_validation.ok, true);
  assert.equal(r.preview_final_comparison.ok, true);
  assert.ok(r.output_bytes <= 25 * 1024 * 1024);
  assertSandboxed(r.sandbox);
  // A normal render stays inside the limits it ran under.
  assertClean(r.resources);
  assert.equal(r.resources.oom_kills, 0);
  assert.ok(!r.resources.pids_limit_hits);
  assert.ok(r.resources.memory_peak === null || r.resources.memory_peak < GIB3);
  assert.equal((await (await call(r.artifacts.final)).arrayBuffer()).byteLength, r.output_bytes);
  assert.equal(existsSync(join(LINUX_JOBS_DIR, render_id)), false);
  assert.equal(groupsGone(render_id), true);
});

test('Demo B: JetBrains Mono comes from the bundled file and renders identically in two fresh contexts', { skip: skip || (!existsSync(join(HERE, '..', 'fixtures', 'demo-b', 'composition.jsx')) && 'no Demo B fixture'), timeout: 10 * 60 * 1000 }, async t => {
  const { call, until } = await service(t);
  const { render_id } = await (await call('/render', { method: 'POST', body: JSON.stringify(job('demo-b')) })).json();
  const r = await until(render_id);
  assert.equal(r.status, 'ready', `${r.error}: ${r.detail}`);
  assert.equal(r.determinism.identical, true);
  assert.match(r.fonts, /JetBrains Mono/);
  assert.match(r.fonts, /"check":true/);
  assertClean(r.resources);
});

test('timeout: the sandbox, Chromium and ffmpeg are gone, every job group removed, the job directory removed', { skip, timeout: 120000 }, async t => {
  const { call, until } = await service(t, { timeoutMs: 20000 });
  const { render_id } = await (await call('/render', { method: 'POST', body: JSON.stringify(job('demo-a')) })).json();
  const r = await until(render_id);
  assert.equal(r.error, 'timeout');
  assertClean(r.resources);
  await sleep(2000);
  const left = sh('pgrep', ['-u', 'motion-render', '-l']);
  assert.equal(left.status, 1, `motion-render processes left: ${left.stdout}`);
  assert.equal(existsSync(join(LINUX_JOBS_DIR, render_id)), false);
  assert.equal(groupsGone(render_id), true);
});
