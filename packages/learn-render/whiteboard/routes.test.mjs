// The /whiteboard routes on the render service (roadmap v1 section 6.2; W1.4), with a stub child that follows the job-directory protocol
// without rendering (as service.test.mjs does for Motion): auth, the gate, the job directory, 202 then ready, artifacts, 404, one render at a
// time, idempotency, the 16 MiB body cap, and Motion's /render untouched beside it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { motionRenderService } from '../motion/service/server.mjs';
import { LIMITS, RENDERER_VERSION } from './contracts.mjs';
import { requestFor, sampleManifest } from './test-requests.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const TOKEN = 't'.repeat(40);
const auth = { authorization: `Bearer ${TOKEN}` };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// The stub child echoes what the service gave it (job.json and the public dir listing) and leaves the three whiteboard artifacts.
const STUB = `import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'; import { join } from 'node:path';
const dir = process.argv[2], mode = process.argv[3], job = JSON.parse(readFileSync(join(dir, 'job.json'), 'utf8'));
if (mode === 'sleep') { setInterval(() => {}, 1000); } else {
  mkdirSync(join(dir, 'out'), { recursive: true });
  for (const [n, b] of [['final.mp4', 'mp4'], ['poster.png', 'png1'], ['contact-sheet.png', 'png2']]) writeFileSync(join(dir, 'out', n), b);
  const audio = readdirSync(join(dir, 'public', 'audio')).map(f => [f, readFileSync(join(dir, 'public', 'audio', f), 'utf8')]);
  writeFileSync(join(dir, 'out', 'result.json'), JSON.stringify(mode === 'failed' ? { status: 'failed', error: 'audio_mismatch', detail: 'b00' }
    : { status: 'ready', frame_count: job.manifest.timing.totalFrames, fps: 30, final_validation: { ok: true, checks: [] }, renderer: { echo: { type: job.type, job_id: job.job_id, segment: job.segment, audio } } }));
}`;

async function start(t, mode = 'ready') {
  const jobsDir = mkdtempSync(join(tmpdir(), 'wb-routes-'));
  const child = join(jobsDir, '..', `wb-stub-${process.pid}-${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(child, STUB);
  const svc = motionRenderService({ token: TOKEN, sandbox: 'none', jobsDir, childScript: child, childArgs: [mode] });
  await new Promise(r => svc.server.listen(0, '127.0.0.1', r));
  t.after(() => { svc.stop(); svc.server.close(); });
  const base = `http://127.0.0.1:${svc.server.address().port}`;
  const call = (path, { headers = auth, ...init } = {}) => fetch(base + path, { headers, ...init });
  const post = (body, headers = auth) => call('/whiteboard/render', { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  const until = async id => {
    for (let i = 0; i < 400; i++, await sleep(50)) { const r = await (await call(`/whiteboard/${id}`)).json(); if (r.status !== 'rendering') return r; }
    throw new Error('still rendering');
  };
  return { call, post, until, jobsDir };
}

test('/health reports the whiteboard renderer version', async t => {
  const { call } = await start(t);
  const health = await (await call('/health', { headers: {} })).json();
  assert.equal(health.whiteboard, RENDERER_VERSION);
  assert.equal(health.whiteboard, 'whiteboard-renderer-1');
  assert.deepEqual(health.limits.body_max_bytes, 512 * 1024, 'Motion\'s body limit is untouched');
});

test('auth: no or wrong bearer token is 401 on every whiteboard route', async t => {
  const { post, call } = await start(t);
  assert.equal((await post(requestFor(sampleManifest()), {})).status, 401);
  assert.equal((await post(requestFor(sampleManifest()), { authorization: `Bearer ${'x'.repeat(40)}` })).status, 401);
  assert.equal((await call(`/whiteboard/${'0'.repeat(32)}`, { headers: {} })).status, 401);
  assert.equal((await call(`/whiteboard/${'0'.repeat(32)}/artifacts/final.mp4`, { headers: {} })).status, 401);
});

test('validation: an invalid request is 400 with its errors and nothing is started; malformed JSON is 400; GET on /whiteboard/render is 405', async t => {
  const { post, call, jobsDir } = await start(t);
  const bad = requestFor(sampleManifest());
  bad.manifest.timing.totalFrames = 301;
  bad.manifest.scenes[0].primitives[0].x = '1';
  const res = await post(bad);
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error, 'invalid_job');
  assert.equal(body.schema, 'whiteboard-render/1');
  assert.ok(body.errors.some(e => /must be a finite number/.test(e)), body.errors.join('\n'));
  assert.equal((await post('{not json')).status, 400);
  assert.equal((await call('/whiteboard/render')).status, 405);
  assert.deepEqual(readdirSync(jobsDir), [], 'no job directory was written');
});

test('a body over 16 MiB is 413 before it is parsed', async t => {
  const { post } = await start(t);
  const res = await post(`{"pad":"${'a'.repeat(LIMITS.bodyBytes)}"}`);
  assert.equal(res.status, 413);
  assert.equal((await res.json()).error, 'too_large');
});

test('202 then ready: the job dir carries type whiteboard, the segment and one MP3 per narrated beat; artifacts are served; the dir is removed', async t => {
  const { post, call, until, jobsDir } = await start(t);
  const req = requestFor(sampleManifest(), key => Buffer.from(`mp3 for ${key}`).toString('base64'));
  const res = await post(req);
  assert.equal(res.status, 202);
  const accepted = await res.json();
  assert.match(accepted.render_id, /^[0-9a-f]{32}$/);
  assert.equal(accepted.poll, `/whiteboard/${accepted.render_id}`);
  assert.equal(accepted.deadline_seconds, 420);
  const done = await until(accepted.render_id);
  assert.equal(done.status, 'ready', JSON.stringify(done));
  assert.equal(done.type, 'whiteboard');
  assert.equal(done.whiteboard_job_id, 'wj_test');
  assert.equal(done.frame_count, 300);
  assert.deepEqual(done.renderer.echo.segment, { index: 0, of: 1, startFrame: 0, endFrame: 300 });
  assert.equal(done.renderer.echo.type, 'whiteboard');
  assert.deepEqual(done.renderer.echo.audio, [['b00.mp3', `mp3 for ${req.audio[0].beat}`], ['b01.mp3', `mp3 for ${req.audio[1].beat}`]]);
  const id = accepted.render_id;
  assert.deepEqual(done.artifacts, { final: `/whiteboard/${id}/artifacts/final.mp4`, contact_sheet: `/whiteboard/${id}/artifacts/contact-sheet.png`, poster: `/whiteboard/${id}/artifacts/poster.png` });
  const mp4 = await call(done.artifacts.final);
  assert.equal(mp4.status, 200);
  assert.equal(mp4.headers.get('content-type'), 'video/mp4');
  assert.equal(await mp4.text(), 'mp4');
  assert.equal(await (await call(done.artifacts.poster)).text(), 'png1');
  assert.equal((await call(`/whiteboard/${id}/artifacts/preview.mp4`)).status, 404, 'only the whiteboard artifacts');
  assert.equal((await call(`/whiteboard/${id}/artifacts/..%2Fjob.json`)).status, 404);
  assert.deepEqual(readdirSync(jobsDir), [], 'the job directory is removed after the render');
});

test('a failed child is a failed render with its error', async t => {
  const { post, until } = await start(t, 'failed');
  const done = await until((await (await post(requestFor(sampleManifest()))).json()).render_id);
  assert.equal(done.status, 'failed');
  assert.equal(done.error, 'audio_mismatch');
  assert.equal(done.artifacts, undefined);
});

test('an unknown or malformed render id is 404', async t => {
  const { call } = await start(t);
  assert.equal((await call(`/whiteboard/${'a'.repeat(32)}`)).status, 404);
  assert.equal((await call(`/whiteboard/${'a'.repeat(32)}/artifacts/final.mp4`)).status, 404);
  assert.equal((await call('/whiteboard/not-an-id')).status, 404);
  assert.equal((await call(`/whiteboard/${'a'.repeat(32)}`, { method: 'DELETE' })).status, 404);
});

test('one render at a time: a second whiteboard POST, or a Motion POST, while one runs is 429; DELETE stops it and frees the slot', async t => {
  const { post, call, until } = await start(t, 'sleep');
  const first = await (await post(requestFor(sampleManifest()))).json();
  assert.equal((await post(requestFor(sampleManifest()))).status, 429);
  const fixture = f => readFileSync(join(HERE, '..', 'motion', 'fixtures', 'demo-a', f), 'utf8');
  const motion = { schema: 'motion-render/1', renderer: 'remotion', brief: JSON.parse(fixture('brief.json')), storyboard: JSON.parse(fixture('storyboard.json')), composition: { composition_id: 'demo-a1', source: fixture('composition.jsx') } };
  assert.equal((await call('/render', { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify(motion) })).status, 429, 'the slot is shared with Motion');
  const stop = await call(`/whiteboard/${first.render_id}`, { method: 'DELETE' });
  assert.equal(stop.status, 202);
  assert.equal((await until(first.render_id)).error, 'cancelled');
  assert.equal((await post(requestFor(sampleManifest()))).status, 202, 'the slot is free again');
});

test('Idempotency-Key: the same key and body replay the same render; a different body under it is 409', async t => {
  const { post, until } = await start(t);
  const key = { ...auth, 'idempotency-key': 'wj_test:1:0' };
  const first = await (await post(requestFor(sampleManifest()), key)).json();
  await until(first.render_id);
  const again = await post(requestFor(sampleManifest()), key);
  assert.equal(again.status, 202);
  assert.deepEqual([(await again.json()).render_id], [first.render_id]);
  const other = requestFor(sampleManifest());
  other.job_id = 'wj_other';
  assert.equal((await post(other, key)).status, 409);
  assert.equal((await post(requestFor(sampleManifest()), { ...auth, 'idempotency-key': 'bad key!' })).status, 400);
});

test('Motion\'s /render is unaffected: it still validates its own schema and renders beside the whiteboard routes', async t => {
  const { call } = await start(t);
  const res = await call('/render', { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify(requestFor(sampleManifest())) });
  assert.equal(res.status, 400, 'a whiteboard body is not a Motion job');
  assert.equal((await res.json()).schema, 'motion-render/1');
  assert.equal((await call('/render', { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: `{"pad":"${'a'.repeat(600 * 1024)}"}` })).status, 413, 'Motion keeps its 512 KiB cap');
});
