// The real sandbox (spec §10.2), inside the rabbit-hole-motion-renderer image only. Run on the
// deployed dev machine as root or motion-svc, e.g.
//   fly ssh console -a rabbit-hole-motion-renderer-dev -C "sh -c 'cd /app/packages/learn-render && node --test motion/service/service.linux.test.mjs'"
// Elsewhere every test skips. service.test.mjs covers the HTTP contract on any host.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmodSync, chownSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LINUX_JOBS_DIR, motionRenderService } from './server.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const LAUNCHER = '/usr/local/sbin/motion-sandbox';
const skip = !(process.platform === 'linux' && existsSync(LAUNCHER)) && 'needs the Linux render image (motion-sandbox installed)';
const sh = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8' });
const idOf = (...args) => Number(sh('id', args).stdout.trim());
const sleep = ms => new Promise(r => setTimeout(r, ms));
const TOKEN = randomBytes(24).toString('hex');
const job = demo => {
  const f = name => readFileSync(join(HERE, '..', 'fixtures', demo, name), 'utf8');
  return { schema: 'motion-render/1', renderer: 'remotion', brief: JSON.parse(f('brief.json')), storyboard: JSON.parse(f('storyboard.json')), composition: { composition_id: demo, source: f('composition.jsx') } };
};

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
  // The limits the kernel applies to this child (cgroup v2 from motion-sandbox, rlimits from sandbox-init).
  assert.match(sandbox.limits.cgroup, /^\/motion\/[0-9a-f]{32}$/);
  assert.equal(sandbox.limits.memory_max, '3221225472');
  assert.equal(sandbox.limits.memory_swap_max ?? '0', '0');
  assert.equal(sandbox.limits.pids_max, '1024');
  assert.equal(sandbox.limits.cpu_max, '150000 100000');
  assert.equal(sandbox.limits.rlimit_nproc, '1024');
  assert.equal(sandbox.limits.rlimit_fsize, '67108864');
  assert.deepEqual(sandbox.breach, []);
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

test('render child: its own user, no network for the page or for Node, the service hidden, the renderer read-only, an empty environment', { skip, timeout: 180000 }, async t => {
  const { call } = await service(t);
  // The probe composition with the page CSP off, so only the OS boundary remains.
  const { run, result } = probeJob(t, 'network');
  assert.equal(run.status, 0, run.stderr);
  assert.equal(result.status, 'probe', JSON.stringify(result));
  assertSandboxed(result.sandbox);
  const page = result.probe.browser;
  assert.equal(result.probe.csp, false);
  for (const k of ['fetchOut', 'xhr', 'websocket', 'image', 'loopbackOtherPort']) assert.match(page[k], /^(failed|timeout|threw)/, `${k}: ${page[k]}`);
  assert.match(page.ownOrigin, /^reached 200/);
  assert.equal((await (await call('/health')).json()).ok, true);
});

test('resource limits hold: a spawn storm stops at the task limit, a 4 GiB allocation is OOM-killed, busy CPU is throttled', { skip, timeout: 300000 }, async t => {
  const { run, result, exit, id } = probeJob(t, 'resources');
  assert.equal(run.status, 0, run.stderr);
  assert.equal(result.status, 'probe', JSON.stringify(result));
  assertSandboxed(result.sandbox);
  const { processes, memory, cpu } = result.probe;
  assert.ok(processes.started < 1024 && processes.refused, `started ${processes.started}, refused ${processes.refused}`);
  assert.equal(memory.allocated, false);
  assert.equal(memory.signal, 'SIGKILL');
  assert.ok(cpu.throttled_periods > 0, `cpu.max did not throttle: ${JSON.stringify(cpu)}`);
  assert.ok(exit.oom_kills >= 1 && exit.pids_max_hits >= 1, JSON.stringify(exit));
  assert.deepEqual([exit.memory_max, exit.pids_max, exit.cpu_max], [3221225472, 1024, '150000 100000']);
  assert.equal(existsSync(`/sys/fs/cgroup/motion/${id}`), false, 'the job cgroup was not removed');
});

test('a real Demo A render through the sandboxed service: 1920x1080, 30 fps, 450 frames, deterministic, validated, cleaned up', { skip, timeout: 10 * 60 * 1000 }, async t => {
  const { call, until } = await service(t);
  const res = await call('/render', { method: 'POST', body: JSON.stringify(job('demo-a')) });
  assert.equal(res.status, 202);
  const { render_id } = await res.json();
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
  assert.equal(r.resources.oom_kills, 0);
  assert.equal(r.resources.pids_max_hits, 0);
  assert.ok(r.resources.memory_peak === null || r.resources.memory_peak < r.resources.memory_max);
  assert.equal((await (await call(r.artifacts.final)).arrayBuffer()).byteLength, r.output_bytes);
  assert.equal(existsSync(join(LINUX_JOBS_DIR, render_id)), false);
});

test('Demo B: JetBrains Mono comes from the bundled file and renders identically in two fresh contexts', { skip: skip || (!existsSync(join(HERE, '..', 'fixtures', 'demo-b', 'composition.jsx')) && 'no Demo B fixture'), timeout: 10 * 60 * 1000 }, async t => {
  const { call, until } = await service(t);
  const { render_id } = await (await call('/render', { method: 'POST', body: JSON.stringify(job('demo-b')) })).json();
  const r = await until(render_id);
  assert.equal(r.status, 'ready', `${r.error}: ${r.detail}`);
  assert.equal(r.determinism.identical, true);
  assert.match(r.fonts, /JetBrains Mono/);
  assert.match(r.fonts, /"check":true/);
});

test('timeout: the sandbox, Chromium and ffmpeg are gone and the job directory is removed', { skip, timeout: 120000 }, async t => {
  const { call, until } = await service(t, { timeoutMs: 20000 });
  const { render_id } = await (await call('/render', { method: 'POST', body: JSON.stringify(job('demo-a')) })).json();
  const r = await until(render_id);
  assert.equal(r.error, 'timeout');
  await sleep(6000);
  const left = sh('pgrep', ['-u', 'motion-render', '-l']);
  assert.equal(left.status, 1, `motion-render processes left: ${left.stdout}`);
  assert.equal(existsSync(join(LINUX_JOBS_DIR, render_id)), false);
});
