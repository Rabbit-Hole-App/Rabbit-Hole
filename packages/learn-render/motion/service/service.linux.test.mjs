// The real sandbox (spec §10.2), inside the rabbit-hole-motion-renderer image only. Run on the
// deployed dev machine as root, which these tests need only to START things as the real users:
//   fly ssh console -a rabbit-hole-motion-renderer-dev -C "sh -c 'cd /app/packages/learn-render && node --test motion/service/service.linux.test.mjs'"
// Elsewhere every test skips. service.test.mjs covers the HTTP contract on any host.
//
// Real identities, never root: the service runs as motion-svc with only its primary group
// motion (as Fly starts it), job directories are created by motion-svc, and the launcher is
// reached through motion-svc's one sudo rule. (Running the service in-process as root once hid
// an EACCES on job.json.)
// Backend-aware: Fly Machines expose cgroup v1 (the default expectation); a host with delegated
// cgroup v2 sets MOTION_EXPECT_RESOURCE_BACKEND=cgroup-v2. The security invariants are the same.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LINUX_JOBS_DIR } from './server.mjs';
import { controllerFor, detect, procStatusField } from './resource-control.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const SERVER = join(HERE, 'server.mjs');
const LAUNCHER = '/usr/local/sbin/motion-sandbox';
const BACKEND = process.env.MOTION_EXPECT_RESOURCE_BACKEND || 'cgroup-v1';
const CONTROLLERS = { 'cgroup-v1': ['memory', 'memsw', 'pids', 'cpu', 'cpuacct'], 'cgroup-v2': ['memory', 'pids', 'cpu', 'memory.swap'] }[BACKEND];
const skip = !(process.platform === 'linux' && existsSync(LAUNCHER)) ? 'needs the Linux render image (motion-sandbox installed)'
  : process.getuid() !== 0 ? 'run as root: the tests start the service and jobs as motion-svc' : false;
const sh = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8' });
const idOf = (...args) => Number(sh('id', args).stdout.trim());
const AS_SVC = ['--reuid=motion-svc', '--regid=motion', '--clear-groups', '--'];
const asSvc = (cmd, args) => sh('setpriv', [...AS_SVC, cmd, ...args]);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const TOKEN = randomBytes(24).toString('hex');
const GIB3 = 3 * 1024 ** 3;
const job = demo => {
  const f = name => readFileSync(join(HERE, '..', 'fixtures', demo, name), 'utf8');
  return { schema: 'motion-render/1', renderer: 'remotion', brief: JSON.parse(f('brief.json')), storyboard: JSON.parse(f('storyboard.json')), composition: { composition_id: demo, source: f('composition.jsx') } };
};
const groupsGone = id => controllerFor(detect()).dirs(id).every(g => !existsSync(g));

// The production service process, started exactly as Fly starts it: motion-svc, gid motion, no
// supplementary groups, the image's environment plus the token.
async function service(t, { timeoutMs } = {}) {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const env = { PATH: '/usr/local/bin:/usr/bin:/bin', NODE_ENV: 'production', MOTION_SANDBOX: 'linux', PORT: String(port), MOTION_RENDERER_TOKEN: TOKEN, ...(timeoutMs ? { MOTION_TIMEOUT_MS: String(timeoutMs) } : {}) };
  const proc = spawn('setpriv', [...AS_SVC, process.execPath, SERVER], { env, stdio: ['ignore', 'ignore', 'inherit'] });
  t.after(() => proc.kill('SIGTERM'));
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++, await sleep(100)) if (await fetch(`${base}/health`).then(r => r.ok, () => false)) break;
  const call = (path, init = {}) => fetch(base + path, { ...init, headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json', ...init.headers } });
  const until = async id => {
    for (;;) {
      const r = await (await call(`/render/${id}`)).json();
      // The service stays reachable over its own network while the child has none.
      assert.equal((await (await fetch(`${base}/health`)).json()).service, 'rabbit-hole-motion-renderer');
      if (r.status !== 'rendering') return r;
      await sleep(2000);
    }
  };
  return { call, until, pid: proc.pid };
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
  assert.deepEqual([resources.cleanup.remaining, resources.cleanup.groups_removed, resources.cleanup.render_user_processes, resources.cleanup.ok], [0, true, 0, true], JSON.stringify(resources.cleanup));
};

// Proof-only jobs (never accepted over HTTP), prepared exactly as the service prepares a job:
// motion-svc creates the 2770 directories and the 0640 job.json, then runs the launcher through
// its sudo rule. `mode` lets a test break the job input on purpose.
function probeJob(t, probe, { mode = 0o640, extra = {} } = {}) {
  const id = randomBytes(16).toString('hex'), dir = join(LINUX_JOBS_DIR, id);
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const prep = asSvc(process.execPath, ['-e', `const fs = require('fs'), [dir, body, mode] = process.argv.slice(1);
fs.mkdirSync(dir + '/out', { recursive: true });
for (const d of [dir, dir + '/out']) fs.chmodSync(d, 0o2770);
fs.writeFileSync(dir + '/job.json', body, { mode: Number(mode) }); fs.chmodSync(dir + '/job.json', Number(mode));`, dir, JSON.stringify({ render_id: id, probe, ...extra }), String(mode)]);
  assert.equal(prep.status, 0, prep.stderr);
  const run = asSvc('sudo', ['-n', LAUNCHER, id]);
  const read = f => (existsSync(join(dir, 'out', f)) ? JSON.parse(readFileSync(join(dir, 'out', f), 'utf8')) : null);
  return { run, result: read('result.json'), exit: read('sandbox-exit.json'), id };
}

test('identities: the service runs as motion-svc with only the motion group, the render user shares only that group', { skip }, async t => {
  const { pid } = await service(t);
  const status = readFileSync(`/proc/${pid}/status`, 'utf8');
  const ids = name => procStatusField(status, name).split(/\s+/).map(Number);
  assert.equal(ids('Uid')[0], idOf('-u', 'motion-svc'));
  assert.equal(ids('Gid')[0], idOf('-g', 'motion-svc'));
  assert.equal(procStatusField(status, 'Groups'), ''); // no supplementary groups
  assert.equal(idOf('-g', 'motion-svc'), idOf('-g', 'motion-render')); // the shared primary group: motion
  assert.equal(sh('id', ['-gn', 'motion-svc']).stdout.trim(), 'motion');
  assert.equal(sh('id', ['-Gn', 'motion-svc']).stdout.trim(), 'motion'); // no supplementary groups
  assert.equal(sh('id', ['-Gn', 'motion-render']).stdout.trim(), 'motion');
  assert.notEqual(idOf('-u', 'motion-svc'), idOf('-u', 'motion-render'));
});

test(`health names the resource backend (${BACKEND}) and its controllers, with no host paths`, { skip }, async t => {
  const { call } = await service(t);
  const health = await (await call('/health')).json();
  assert.equal(health.resource_backend, BACKEND);
  for (const c of CONTROLLERS) assert.ok(health.resource_controllers.includes(c), c);
  assert.ok(!JSON.stringify(health).includes('/sys/fs/cgroup'));
});

test('render child: reads its job input as motion-render; no network for the page or Node; the service hidden; the renderer read-only; an empty environment', { skip, timeout: 180000 }, async t => {
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

test('preflight: a world-readable job input never reaches the render child', { skip, timeout: 60000 }, t => {
  const { run, result } = probeJob(t, 'network', { mode: 0o644 });
  assert.notEqual(run.status, 0);
  assert.equal(result.error, 'workspace_preflight_failed');
  assert.match(result.detail, /0640/);
});

test('resource limits hold, one phase at a time: PID storm then settle, CPU quota then settle, 4 GiB OOM-killed, nothing escapes', { skip, timeout: 300000 }, async t => {
  const { call } = await service(t);
  const { run, result, exit, id } = probeJob(t, 'resources');
  assert.equal(run.status, 0, run.stderr);
  assert.equal(result.status, 'probe', JSON.stringify(result));
  assertSandboxed(result.sandbox);
  const { processes, memory, cpu } = result.probe;
  // PID: the kernel refuses before 1024 tasks (EAGAIN is the evidence), children stay in the job
  // groups, and pids.current returns to its baseline before the next phase starts.
  assert.ok(processes.started < 1024, `started ${processes.started}`);
  assert.equal(processes.refused, 'EAGAIN');
  assert.equal(processes.same_groups, true);
  assert.equal(processes.settled.ok, true, JSON.stringify(processes.settled));
  assert.ok(exit.pids_limit_hits >= 1, JSON.stringify(exit));
  // CPU: two busy workers against a 1.5-CPU quota are throttled; the counters move; the workers are reaped.
  assert.ok(cpu.periods > 0 && cpu.throttled_periods > 0, `quota did not throttle: ${JSON.stringify(cpu)}`);
  assert.equal(cpu.settled.ok, true);
  assert.ok(exit.cpu_throttled > 0 && exit.cpu_nr_periods > 0);
  // Memory: 3 GiB with no swap allowance; the 4 GiB process is killed and the OOM is recorded.
  assert.equal(memory.allocated, false);
  assert.equal(memory.signal, 'SIGKILL');
  assert.equal(memory.settled.ok, true);
  assert.ok(exit.oom_kills >= 1, JSON.stringify(exit));
  assertClean(exit);
  assert.equal(groupsGone(id), true);
  assert.equal((await (await call('/health')).json()).ok, true);
});

// A valid composition (it passes the request and static checks like any job) that tries to hold
// 4 GiB in the page. The job's 3 GiB memory limit, with memsw equal to it, must OOM-kill the
// renderer, and the result must travel the real path: controller record -> service mapping.
const MEMORY_HOG = `import { AbsoluteFill, useCurrentFrame } from 'remotion';
export const stage = { width: 1920, height: 1080, fps: 30, durationInFrames: 450 };
const held = [];
export default function MemoryHog() {
  const frame = useCurrentFrame();
  while (held.length < 16) held.push(new Uint8Array(256 * 1024 * 1024).fill(1));
  return <AbsoluteFill style={{ backgroundColor: 'white', fontFamily: 'Inter' }}>{frame + held.length}</AbsoluteFill>;
}
`;

test('a real kernel OOM in a render job is reported as memory_limit_exceeded through the service, which stays healthy', { skip, timeout: 300000 }, async t => {
  const { call, until } = await service(t);
  const res = await call('/render', { method: 'POST', body: JSON.stringify({ ...job('demo-a'), composition: { composition_id: 'memory-hog', source: MEMORY_HOG } }) });
  assert.equal(res.status, 202);
  const r = await until((await res.json()).render_id);
  assert.equal(r.status, 'failed');
  assert.equal(r.error, 'memory_limit_exceeded', `${r.error}: ${r.detail}`);
  assert.ok(r.resources.oom_kills >= 1, JSON.stringify(r.resources));
  assertClean(r.resources);
  assert.equal(r.artifacts, undefined);
  assert.equal((await (await call('/health')).json()).ok, true);
  assert.equal(sh('pgrep', ['-u', 'motion-render']).status, 1);
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
  assertClean(r.resources);
  assert.equal(r.resources.oom_kills, 0);
  assert.ok(!r.resources.pids_limit_hits);
  assert.ok(r.resources.memory_peak === null || r.resources.memory_peak < GIB3);
  assert.equal((await (await call(r.artifacts.final)).arrayBuffer()).byteLength, r.output_bytes);
  assert.equal(existsSync(join(LINUX_JOBS_DIR, render_id)), false);
  assert.equal(groupsGone(render_id), true);
});

test('a preview job (M6) in the sandbox: preview.mp4 and the contact sheet only, at preview scale, cleaned up', { skip, timeout: 5 * 60 * 1000 }, async t => {
  const { call, until } = await service(t);
  const { render_id } = await (await call('/render', { method: 'POST', body: JSON.stringify({ ...job('demo-a'), stage: 'preview' }) })).json();
  const r = await until(render_id);
  console.log(JSON.stringify({ stage: r.stage, status: r.status, preview: r.preview, timings: r.timings }, null, 2));
  assert.equal(r.status, 'ready', `${r.error}: ${r.detail}`);
  assert.equal(r.stage, 'preview');
  assert.deepEqual(Object.keys(r.artifacts).sort(), ['contact_sheet', 'preview']);
  assert.deepEqual([r.preview.width, r.preview.height, r.preview.frame_count], [864, 486, 450]);
  assertSandboxed(r.sandbox);
  assertClean(r.resources);
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

test('timeout: the sandbox, Chromium and ffmpeg are gone, cleanup is clean (no false failure), the service stays healthy', { skip, timeout: 120000 }, async t => {
  const { call, until } = await service(t, { timeoutMs: 20000 });
  const { render_id } = await (await call('/render', { method: 'POST', body: JSON.stringify(job('demo-a')) })).json();
  const r = await until(render_id);
  assert.equal(r.error, 'timeout');
  assertClean(r.resources);
  const left = sh('pgrep', ['-u', 'motion-render', '-l']);
  assert.equal(left.status, 1, `motion-render processes left: ${left.stdout}`);
  assert.equal(existsSync(join(LINUX_JOBS_DIR, render_id)), false);
  assert.equal(groupsGone(render_id), true);
  const health = await (await call('/health')).json();
  assert.equal(health.ok, true, JSON.stringify(health));
  assert.equal(health.degraded, undefined);
});

// M7B: the HyperFrames backend runs in the same sandbox, under the same rules.
const hfControl = () => ({
  schema: 'motion-render/1', renderer: 'hyperframes',
  brief: JSON.parse(readFileSync(join(HERE, '..', 'fixtures', 'm2', 'softmax-15s-attention.brief.json'), 'utf8')),
  storyboard: JSON.parse(readFileSync(join(HERE, '..', 'fixtures', 'm3', 'softmax-15s-attention.real.storyboard.json'), 'utf8')),
  composition: { composition_id: 'softmax-hyperframes-control', source: readFileSync(join(HERE, '..', 'fixtures', 'm7b', 'softmax-control.hyperframes.html'), 'utf8') },
});

test('HyperFrames render child: no network for the page with its CSP off, the sandbox intact', { skip, timeout: 120000 }, async t => {
  const { call } = await service(t);
  const { run, result, exit, id } = probeJob(t, 'network', { extra: { renderer: 'hyperframes' } });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(result.status, 'probe', JSON.stringify(result));
  assertSandboxed(result.sandbox);
  assert.deepEqual([result.probe.renderer, result.probe.csp], ['hyperframes', false]);
  const page = result.probe.browser;
  for (const k of ['fetchOut', 'xhr', 'websocket', 'image', 'loopbackOtherPort']) assert.match(page[k], /^(failed|timeout|threw)/, `${k}: ${page[k]}`);
  assert.match(page.ownOrigin, /^reached 200/);
  assertClean(exit);
  assert.equal(groupsGone(id), true);
  assert.equal((await (await call('/health')).json()).ok, true);
});

test('the HyperFrames control through the sandboxed service: 1920x1080, 30 fps, 450 frames, deterministic, covered, cleaned up', { skip, timeout: 10 * 60 * 1000 }, async t => {
  const { call, until } = await service(t);
  const res = await call('/render', { method: 'POST', body: JSON.stringify(hfControl()) });
  assert.equal(res.status, 202);
  const { render_id } = await res.json();
  const r = await until(render_id);
  console.log(JSON.stringify({ ...r, contact_sheet: `${r.contact_sheet?.length} tiles`, coverage: `${r.coverage?.observations?.length} observations` }, null, 2));
  assert.equal(r.status, 'ready', `${r.error}: ${r.detail}`);
  assert.equal(r.renderer.name, 'hyperframes');
  assert.deepEqual([r.width, r.height, r.fps, r.frame_count], [1920, 1080, 30, 450]);
  assert.equal(r.determinism.identical, true);
  assert.equal(r.final_validation.ok, true);
  assert.equal(r.preview_final_comparison.ok, true);
  assertSandboxed(r.sandbox);
  assertClean(r.resources);
  assert.equal(r.resources.oom_kills, 0);
  assert.equal(existsSync(join(LINUX_JOBS_DIR, render_id)), false);
  assert.equal(groupsGone(render_id), true);
});
