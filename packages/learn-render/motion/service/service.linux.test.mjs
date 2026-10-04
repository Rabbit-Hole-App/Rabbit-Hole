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
  assert.deepEqual(sandbox.breach, []);
};

test('render child: its own user, no network for the page or for Node, the service hidden, the renderer read-only, an empty environment', { skip, timeout: 180000 }, async t => {
  const { call } = await service(t);
  const id = randomBytes(16).toString('hex'), dir = join(LINUX_JOBS_DIR, id);
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'out'), { recursive: true });
  for (const d of [dir, join(dir, 'out')]) { chownSync(d, idOf('-u', 'motion-svc'), idOf('-g', 'motion-render')); chmodSync(d, 0o2770); }
  // Proof-only job: the probe composition with the page CSP off, so only the OS boundary remains.
  writeFileSync(join(dir, 'job.json'), JSON.stringify({ render_id: id, probe: 'network' }), { mode: 0o644 });
  const run = process.getuid() === 0 ? sh(LAUNCHER, [id]) : sh('sudo', ['-n', LAUNCHER, id]);
  assert.equal(run.status, 0, run.stderr);
  const result = JSON.parse(readFileSync(join(dir, 'out', 'result.json'), 'utf8'));
  assert.equal(result.status, 'probe', JSON.stringify(result));
  assertSandboxed(result.sandbox);
  const page = result.probe.browser;
  assert.equal(result.probe.csp, false);
  for (const k of ['fetchOut', 'xhr', 'websocket', 'image', 'loopbackOtherPort']) assert.match(page[k], /^(failed|timeout|threw)/, `${k}: ${page[k]}`);
  assert.match(page.ownOrigin, /^reached 200/);
  assert.equal((await (await call('/health')).json()).ok, true);
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
