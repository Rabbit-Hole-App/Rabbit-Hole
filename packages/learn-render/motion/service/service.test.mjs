// The dev render service (spec §10.2) on any host: HTTP contract, auth, validation, one render
// at a time, the timeout, the output cap, cleanup and the child's environment. The child is
// stub-child.mjs here (same job-directory protocol, no rendering); service.linux.test.mjs runs
// the real child in the Linux sandbox. MOTION_RENDER_TESTS=1 adds one real unsandboxed Demo A render.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { motionRenderService } from './server.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const TOKEN = 't'.repeat(40);
const fixture = f => readFileSync(join(HERE, '..', 'fixtures', 'demo-a', f), 'utf8');
const job = () => ({ schema: 'motion-render/1', renderer: 'remotion', brief: JSON.parse(fixture('brief.json')), storyboard: JSON.parse(fixture('storyboard.json')), composition: { composition_id: 'demo-a1', source: fixture('composition.jsx') } });
const auth = { authorization: `Bearer ${TOKEN}` };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };

async function start(t, mode, options = {}) {
  const jobsDir = mkdtempSync(join(tmpdir(), 'motion-svc-test-'));
  const svc = motionRenderService({ token: TOKEN, sandbox: 'none', jobsDir, childScript: join(HERE, 'stub-child.mjs'), childArgs: [mode], ...options });
  await new Promise(r => svc.server.listen(0, '127.0.0.1', r));
  t.after(() => { svc.stop(); svc.server.close(); });
  const base = `http://127.0.0.1:${svc.server.address().port}`;
  const call = (path, { headers = auth, ...init } = {}) => fetch(base + path, { headers, ...init });
  const post = (body, headers = auth) => call('/render', { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  const until = async (id, done = r => r.status !== 'rendering', ms = 20000) => {
    for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(100)) { const r = await (await call(`/render/${id}`)).json(); if (done(r)) return r; }
    throw new Error(`render ${id} did not finish`);
  };
  return { svc, jobsDir, call, post, until };
}

test('health: versioned, unauthenticated, no secrets', async t => {
  const { call } = await start(t, 'ready');
  const res = await call('/health', { headers: {} });
  assert.equal(res.status, 200);
  const text = await res.text(), body = JSON.parse(text);
  assert.equal(body.ok, true);
  assert.equal(body.service, 'rabbit-hole-motion-renderer');
  assert.match(body.version, /^motion-renderer-1-[0-9a-f]{12}\/remotion@/);
  assert.equal(body.busy, false);
  assert.deepEqual(body.limits, { timeout_seconds: 420, output_max_bytes: 25 * 1024 * 1024, body_max_bytes: 512 * 1024, concurrent_renders: 1 });
  assert.ok(!text.includes(TOKEN));
});

test('auth: missing or wrong bearer token is 401; the right one renders', async t => {
  const { post, call } = await start(t, 'ready');
  assert.equal((await post(job(), {})).status, 401);
  assert.equal((await post(job(), { authorization: `Bearer ${'x'.repeat(40)}` })).status, 401);
  assert.equal((await post(job(), { authorization: TOKEN })).status, 401);
  assert.equal((await call(`/render/${'0'.repeat(32)}`, { headers: {} })).status, 401);
  const ok = await post(job());
  assert.equal(ok.status, 202);
  assert.match((await ok.json()).render_id, /^[0-9a-f]{32}$/);
  assert.throws(() => motionRenderService({ token: 'short', sandbox: 'none' }), /at least 32 characters/);
});

test('validation: malformed, unknown fields, unsafe paths, wrong renderer, banned source, oversize', async t => {
  const { post } = await start(t, 'ready');
  const bad = async (body, status, re) => { const res = await post(body); assert.equal(res.status, status); assert.match(JSON.stringify(await res.json()), re); };
  await bad('{not json', 400, /malformed/);
  await bad({ ...job(), schema: 'motion-render/2' }, 400, /request\.schema/);
  await bad({ ...job(), dir: '../../etc' }, 400, /request\.dir: unknown field/);
  await bad({ ...job(), command: 'rm -rf /' }, 400, /request\.command: unknown field/);
  await bad({ ...job(), composition: { ...job().composition, path: '/etc/passwd' } }, 400, /composition\.path: unknown field/);
  await bad({ ...job(), composition: { ...job().composition, composition_id: '../escape' } }, 400, /composition_id/);
  await bad({ ...job(), renderer: 'hyperframes' }, 400, /only V1 renderer/);
  await bad({ ...job(), composition: { ...job().composition, source: job().composition.source.replace('export default', "fetch('https://example.com');\nexport default") } }, 400, /fetch/);
  await bad({ ...job(), composition: { ...job().composition, source: `${job().composition.source}\n// ${'x'.repeat(600 * 1024)}` } }, 413, /too_large/);
});

test('a preview job (M6) delivers only preview.mp4 and the contact sheet; a final job must deliver final.mp4', async t => {
  const { post, call, until } = await start(t, 'preview');
  assert.equal((await post({ ...job(), stage: 'draft' })).status, 400);
  const { render_id } = await (await post({ ...job(), stage: 'preview' })).json();
  const r = await until(render_id);
  assert.equal(r.status, 'ready');
  assert.equal(r.stage, 'preview');
  assert.deepEqual(Object.keys(r.artifacts).sort(), ['contact_sheet', 'preview']);
  assert.equal((await call(`/render/${render_id}/artifacts/preview.mp4`)).status, 200);
  assert.equal((await call(`/render/${render_id}/artifacts/final.mp4`)).status, 404);
  const final = await until((await (await post(job())).json()).render_id);
  assert.equal(final.stage, 'final');
  assert.equal(final.status, 'failed');
  assert.match(final.detail, /without final.mp4/);
});

test('paths: only a 32-hex render id and fixed artifact names are routable', async t => {
  const { post, call, until } = await start(t, 'ready');
  const { render_id } = await (await post(job())).json();
  await until(render_id);
  for (const path of ['/render/../../etc/passwd', `/render/${render_id}/artifacts/../job.json`, `/render/${render_id}/artifacts/..%2F..%2Fjob.json`,
    `/render/${render_id}/artifacts/job.json`, `/render/${render_id}/artifacts/result.json`, '/render/abc', `/render/${render_id.toUpperCase()}`, '/etc/passwd']) {
    assert.equal((await call(path)).status, 404, path);
  }
});

test('ready: metadata, artifact refs and bytes; the job directory is gone; unknown result fields dropped', async t => {
  const { post, call, until, jobsDir } = await start(t, 'ready');
  const { render_id } = await (await post(job())).json();
  const r = await until(render_id);
  assert.equal(r.status, 'ready');
  assert.equal(r.motion_job_id, job().brief.id);
  assert.equal(r.frame_count, 450);
  assert.equal(r.not_a_result_field, undefined);
  assert.deepEqual(r.artifacts, { final: `/render/${render_id}/artifacts/final.mp4`, preview: `/render/${render_id}/artifacts/preview.mp4`, contact_sheet: `/render/${render_id}/artifacts/contact-sheet.png`, poster: `/render/${render_id}/artifacts/poster.png` });
  const mp4 = await call(r.artifacts.final);
  assert.equal(mp4.headers.get('content-type'), 'video/mp4');
  assert.equal((await mp4.arrayBuffer()).byteLength, 64);
  assert.deepEqual(readdirSync(jobsDir), []);
});

test('the child gets no service environment and no secrets', async t => {
  process.env.FISH_AUDIO_API_KEY = 'fish-secret-not-for-children';
  t.after(() => delete process.env.FISH_AUDIO_API_KEY);
  const { post, until } = await start(t, 'ready');
  const { render_id } = await (await post(job())).json();
  const { sandbox } = await until(render_id);
  for (const k of ['MOTION_RENDERER_TOKEN', 'FISH_AUDIO_API_KEY']) assert.ok(!sandbox.env_keys.includes(k), k);
  const allowed = ['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'MOTION_SANDBOX', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATHEXT', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA',
    // libuv copies these Windows account basics into every child it starts; none is a secret.
    ...(process.platform === 'win32' ? ['HOMEDRIVE', 'HOMEPATH', 'LOGONSERVER', 'SYSTEMDRIVE', 'USERDOMAIN', 'USERNAME'] : [])];
  assert.deepEqual(sandbox.env_keys.filter(k => !allowed.includes(k.toUpperCase())), []);
  assert.equal(sandbox.mode, 'none');
});

test('the job workspace the child receives: 2770 directories and a 0640 job input (group-readable, never world-readable)', { skip: process.platform === 'win32' && 'POSIX modes' }, async t => {
  const { post, until } = await start(t, 'ready');
  const { render_id } = await (await post(job())).json();
  const { sandbox } = await until(render_id);
  assert.deepEqual(sandbox.job_modes, { dir: '2770', out: '2770', input: '640' });
});

test('one render at a time: a second POST while one runs is 429', async t => {
  const { post, call } = await start(t, 'sleep');
  const first = await post(job());
  assert.equal(first.status, 202);
  const second = await post(job());
  assert.equal(second.status, 429);
  const body = await second.json();
  assert.equal(body.error, 'busy');
  assert.equal(body.render_id, (await first.json()).render_id);
  assert.equal((await (await call('/health', { headers: {} })).json()).busy, true);
});

test('timeout: the child and its own children are killed, the directory removed, the status says timeout', async t => {
  const { post, until, jobsDir } = await start(t, 'tree', { timeoutMs: 1500 });
  const { render_id } = await (await post(job())).json();
  let pids;
  for (let i = 0; i < 100 && !pids; i++, await sleep(50)) { const f = join(jobsDir, render_id, 'out', 'pids.json'); if (existsSync(f)) pids = JSON.parse(readFileSync(f, 'utf8')); }
  assert.equal(pids.length, 2);
  const r = await until(render_id);
  assert.equal(r.status, 'failed');
  assert.equal(r.error, 'timeout');
  await sleep(300);
  for (const pid of pids) assert.equal(alive(pid), false, `pid ${pid} survived the timeout`);
  assert.deepEqual(readdirSync(jobsDir), []);
});

test('output cap: a final over the limit fails the job and leaves nothing behind', async t => {
  const { post, until, jobsDir } = await start(t, 'big', { outputMaxBytes: 1000 });
  const { render_id } = await (await post(job())).json();
  const r = await until(render_id);
  assert.equal(r.status, 'failed');
  assert.equal(r.error, 'output_too_large');
  assert.equal(r.artifacts, undefined);
  assert.deepEqual(readdirSync(jobsDir), []);
});

test('a crashed or failed render leaves the service healthy and free', async t => {
  for (const [mode, error] of [['crash', 'renderer_failure'], ['failed', 'nondeterministic']]) {
    const { post, call, until, jobsDir } = await start(t, mode);
    const { render_id } = await (await post(job())).json();
    const r = await until(render_id);
    assert.equal(r.status, 'failed');
    assert.equal(r.error, error);
    const health = await (await call('/health', { headers: {} })).json();
    assert.equal(health.ok, true);
    assert.equal(health.busy, false);
    assert.equal((await post(job())).status, 202);
    await until((await (await call(`/render/${render_id}`)).json()).render_id);
    assert.ok(readdirSync(jobsDir).length <= 1);
  }
});

test('resource limits: no limits means no render, never a silent unlimited one', async t => {
  const { post, until, jobsDir } = await start(t, 'nolimits');
  const { render_id } = await (await post(job())).json();
  const r = await until(render_id);
  assert.deepEqual([r.status, r.error], ['failed', 'resource_limits_unavailable']);
  assert.match(r.detail, /memory cgroup controller/);
  assert.deepEqual(readdirSync(jobsDir), []);
});

// The kernel's OOM count reaches the service through the real controller record
// (resource-control.mjs finishJob + normalize, as motion-sandbox writes it) and the real
// service mapping. service.linux.test.mjs drives the same mapping with a real kernel OOM.
test('a kernel OOM kill is reported as memory_limit_exceeded through the service, whether the child died or reported the broken render', async t => {
  for (const [mode, detail] of [['oom', /exited \(137\) without a result/], ['oom-result', /Target closed/]]) {
    const { post, call, until, jobsDir } = await start(t, mode);
    const { render_id } = await (await post(job())).json();
    const r = await until(render_id);
    assert.deepEqual([r.status, r.error], ['failed', 'memory_limit_exceeded'], mode);
    assert.match(r.detail, detail);
    assert.equal(r.artifacts, undefined);
    const res = r.resources;
    assert.deepEqual([res.backend, res.oom_kills, res.memory_bytes, res.swap_bytes, res.pids_max, res.cpu_quota], ['cgroup-v1', 1, 3 * 1024 ** 3, 0, 1024, 1.5]);
    assert.equal(res.cleanup.ok, true);
    // The service stays healthy and takes the next render.
    assert.equal((await (await call('/health', { headers: {} })).json()).ok, true);
    assert.equal((await post(job())).status, 202);
    assert.ok(readdirSync(jobsDir).length <= 1);
  }
});

test('cleanup that leaves anything behind fails the render, withholds its artifacts and stops new renders', async t => {
  const { post, call, until } = await start(t, 'dirty');
  const { render_id } = await (await post(job())).json();
  const r = await until(render_id);
  assert.equal(r.status, 'failed');
  assert.equal(r.error, 'cleanup_failed');
  assert.equal(r.artifacts, undefined);
  assert.equal(r.resources.cleanup.ok, false);
  const health = await (await call('/health', { headers: {} })).json();
  assert.equal(health.ok, false);
  assert.match(health.degraded, /left processes or groups behind/);
  const next = await post(job());
  assert.equal(next.status, 503);
  assert.equal((await next.json()).error, 'degraded');
});

test('health names the resource backend (none when unsandboxed)', async t => {
  const { call } = await start(t, 'ready');
  const health = await (await call('/health', { headers: {} })).json();
  assert.equal(health.resource_backend, 'none');
  assert.deepEqual(health.resource_controllers, []);
});

test('a real Demo A render through the service (unsandboxed authoring host)', { skip: process.env.MOTION_RENDER_TESTS !== '1' && 'set MOTION_RENDER_TESTS=1 (minutes)', timeout: 15 * 60 * 1000 }, async t => {
  const { post, call, until, jobsDir } = await start(t, null, { childScript: join(HERE, 'child.mjs'), childArgs: [] });
  const { render_id } = await (await post(job())).json();
  const r = await until(render_id, undefined, 14 * 60 * 1000);
  console.log(JSON.stringify({ ...r, contact_sheet: `${r.contact_sheet?.length} tiles` }, null, 2));
  assert.equal(r.status, 'ready', `${r.error}: ${r.detail}`);
  assert.equal(r.frame_count, 450);
  assert.equal(r.fps, 30);
  assert.deepEqual([r.width, r.height], [1920, 1080]);
  assert.equal(r.determinism.identical, true);
  assert.equal(r.final_validation.ok, true);
  assert.equal(r.preview_final_comparison.ok, true);
  assert.ok((await (await call(r.artifacts.final)).arrayBuffer()).byteLength === r.output_bytes);
  assert.deepEqual(readdirSync(jobsDir), []);
});
