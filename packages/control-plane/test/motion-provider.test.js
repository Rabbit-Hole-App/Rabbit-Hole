import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MotionProvider, MotionRequestProvider, motionCacheKey, motionGrant, motionRequestCacheKey, motionReservationMicros, validateMotionRender, validateMotionRequest } from '../src/motion-provider.js';
import { signGrant } from '../../learn-render/motion/orchestrator.mjs';
import { LearnVideos, canvasRepository, withCanvasRepository } from '../src/learn-video.js';

const id = '0123456789abcdef0123456789abcdef';
const env = { MOTION_RENDERER_URL: 'https://motion.example/', MOTION_RENDERER_TOKEN: 'secret' };

// Each call answers the next queued response and records what it was asked.
const transport = responses => {
  const calls = [];
  const fake = async (url, init = {}) => {
    calls.push(`${init.method} ${url} ${init.headers?.Authorization === 'Bearer secret' ? 'authorized' : 'anonymous'}${init.body ? ' with body' : ''}`);
    return responses.shift();
  };
  fake.calls = calls;
  return fake;
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const video = (bytes, type = 'video/mp4') => new Response(bytes, { status: 200, headers: { 'Content-Type': type } });

test('the operation is exactly { op: motion_render, render_id } with a 32-hex id', () => {
  assert.deepEqual(validateMotionRender({ op: 'motion_render', render_id: id }), { op: 'motion_render', render_id: id });
  for (const bad of [null, [], {}, { op: 'motion_render' }, { op: 'generate_video', render_id: id }, { op: 'motion_render', render_id: id.toUpperCase() },
    { op: 'motion_render', render_id: `${id}0` }, { op: 'motion_render', render_id: '../x' }, { op: 'motion_render', render_id: id, source: 'export default 1' }]) {
    assert.throws(() => validateMotionRender(bad), /motion_render/);
  }
});

test('the cache key is the sha256 of motion-render|<render_id>', async () => {
  const key = await motionCacheKey({ render_id: id });
  assert.match(key, /^[a-f0-9]{64}$/);
  const expected = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`motion-render|${id}`)))].map(b => b.toString(16).padStart(2, '0')).join('');
  assert.equal(key, expected);
});

test('submit only reads the render: one authorized GET, no source sent', async () => {
  const fake = transport([json({ render_id: id, status: 'rendering' })]);
  assert.deepEqual(await new MotionProvider(env, fake).submit({ op: 'motion_render', render_id: id }), { id });
  assert.deepEqual(fake.calls, [`GET https://motion.example/render/${id} authorized`]);
  await assert.rejects(new MotionProvider(env, transport([json({ status: 'invalid', error: 'static check failed' })])).submit({ render_id: id }), /static check failed/);
});

test('poll: rendering is null, ready is the bytes', async () => {
  assert.equal(await new MotionProvider(env, transport([json({ render_id: id, status: 'rendering' })])).poll({ id }), null);
  const clip = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]);
  const fake = transport([json({ render_id: id, status: 'ready', duration_seconds: 15 }), video(clip)]);
  const result = await new MotionProvider(env, fake).poll({ id });
  assert.deepEqual(result, { bytes: clip, provider: 'motion', generationId: id });
  assert.equal(fake.calls[1], `GET https://motion.example/render/${id}/artifacts/final.mp4 authorized`);
});

test('failed, invalid, unknown and oversized renders are final; a wrong or missing asset is not', async () => {
  const poll = (...responses) => new MotionProvider(env, transport(responses)).poll({ id });
  await assert.rejects(poll(json({ status: 'failed', error: 'renderer crashed' })), e => e.final === true && /renderer crashed/.test(e.message));
  await assert.rejects(poll(json({ status: 'invalid' })), e => e.final === true);
  await assert.rejects(poll(json({ error: 'not found' }, 404)), e => e.final === true && /not found or has expired/.test(e.message));
  await assert.rejects(poll(json({ status: 'ready' }), video(new Uint8Array(25 * 1024 * 1024 + 1))), e => e.final === true && /too large/.test(e.message));
  await assert.rejects(poll(json({ status: 'ready' }), json({ sneaky: true })), e => !e.final && /unavailable/.test(e.message));
  await assert.rejects(poll(json({ status: 'ready' }), video(new Uint8Array(8), 'video/webm')), e => !e.final);
  await assert.rejects(poll(json({ error: 'x' }, 502)), e => !e.final);
});

test('an unconfigured or plaintext renderer is refused before anything is sent', async () => {
  await assert.rejects(new MotionProvider({}, transport([])).submit({ render_id: id }), /not configured/);
  await assert.rejects(new MotionProvider({ MOTION_RENDERER_URL: 'http://motion.example/', MOTION_RENDERER_TOKEN: 't' }, transport([])).submit({ render_id: id }), /HTTPS/);
});

// LearnVideos: the motion_render branch next to maths, with the existing gate and storage.
function fixture() {
  const data = new Map(); let lock = Promise.resolve();
  const state = { id: 'actor-test', storage: { get: async k => structuredClone(data.get(k)), put: async (k, v) => data.set(k, structuredClone(v)), list: async ({ prefix }) => new Map([...data].filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k, structuredClone(v)])), setAlarm: async () => {} }, blockConcurrencyWhile: fn => { const result = lock.then(fn); lock = result.catch(() => {}); return result; } };
  const assets = new Map();
  const env2 = { ...env, LEARN_MEDIA: { put: async (k, v) => assets.set(k, v) } };
  return { assets, data, actor: new LearnVideos(state, env2) };
}
const request = (extra = {}) => new Request('https://dev.test/api/learn/video?app=demo', { method: 'POST', body: JSON.stringify({ operation: { op: 'motion_render', render_id: id }, lessonId: 'adaptive-canvas', page: 'canvas', confirmed: true, ...extra }) });

test('LearnVideos fetches a ready Motion render into LEARN_MEDIA under its motion-render key', async () => {
  const original = globalThis.fetch; const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push(`${init.method} ${url}`);
    return String(url).endsWith('final.mp4') ? video(new Uint8Array([0, 0, 0, 24])) : json({ render_id: id, status: 'ready' });
  };
  try {
    const f = fixture();
    assert.equal((await f.actor.fetch(request({ confirmed: undefined }))).status, 428); // the paid gate stays
    const started = await (await f.actor.fetch(request())).json();
    const key = await motionCacheKey({ render_id: id });
    assert.equal(started.videos[0].key, key);
    assert.equal(started.videos[0].status, 'generating');
    assert.equal((await f.data.get(`job:${key}`)).provider, 'motion');
    await f.actor.alarm();
    assert.deepEqual([...f.assets.keys()], [`learn-video-dev/actor-test/${key}.mp4`]);
    assert.deepEqual((await f.actor.list()).videos.map(v => [v.status, v.provider, v.generationId]), [['ready', 'motion', id]]);
    assert.ok(calls.every(call => call.startsWith('GET ')), 'nothing is POSTed to the renderer');
    assert.equal((await f.actor.fetch(new Request('https://dev.test/api/learn/video', { method: 'POST', body: JSON.stringify({ operation: { op: 'motion_render', render_id: id, extra: 1 }, lessonId: 'l', page: 'p', confirmed: true }) }))).status, 400);
  } finally { globalThis.fetch = original; }
});

test('a Motion render that is missing at submit fails with its reason and stays retryable', async () => {
  const original = globalThis.fetch; let gets = 0;
  globalThis.fetch = async () => (++gets === 1 ? json({ error: 'not found' }, 404) : json({ status: 'rendering' }));
  try {
    const f = fixture();
    const failed = (await (await f.actor.fetch(request())).json()).videos[0];
    assert.equal(failed.status, 'failed');
    assert.match(failed.error, /not found or has expired/);
    assert.equal(failed.retryable, true);
    assert.equal((await (await f.actor.fetch(request({ retry: true }))).json()).videos[0].status, 'generating');
  } finally { globalThis.fetch = original; }
});

// A /motion request run by the Motion orchestrator. These are wiring tests with spend admission off (SMALL_ENV test);
// learn-allowance.test.js runs the same Durable Object against the real ledger.
const job = '89abcdef0123456789abcdef01234567';
const orch = { MOTION_ORCHESTRATOR_URL: 'https://orchestrator.example/', MOTION_ORCHESTRATOR_TOKEN: 'secret', MOTION_JOB_RESERVATION_USD: '2', SMALL_ENV: 'test' };
const spend = { opId: 'motion-0f0e0d0c-0b0a-4908-8706-050403020100', grant: { micros: 2000000, issued_at: 1, sig: 'x' } };
const line = '/motion 15s explain me softmax func';
const motionOp = { op: 'motion_request', request: line, location: { concept: 'Attention' } };
const ready = { job_id: job, status: 'ready', title: 'Softmax turns attention scores into weights', render_id: id, motion: { job_id: 'motion-job-1', duration_seconds: 15, renderer: 'remotion', source_refs: [{ id: 'S1', path: 'model.py', start_line: 62, end_line: 64 }] } };

test('motion_request is exactly {op, request: a /motion line, location: {concept}, context?}: never composition source', async () => {
  assert.deepEqual(validateMotionRequest(motionOp), { op: 'motion_request', request: line, location: { concept: 'Attention' } });
  assert.deepEqual(validateMotionRequest({ op: 'motion_request', request: `  ${line} ` }), { op: 'motion_request', request: line, location: { concept: null } });
  for (const bad of [null, { op: 'motion_request' }, { ...motionOp, request: 'explain softmax' }, { ...motionOp, request: '/motion' }, { ...motionOp, request: `/motion ${'x'.repeat(500)}` },
    { ...motionOp, source: 'export default 1' }, { ...motionOp, location: { concept: 'a', path: '/etc' } }, { ...motionOp, location: { concept: 'x'.repeat(101) } }, { ...motionOp, op: 'motion_render' }]) {
    assert.throws(() => validateMotionRequest(bad), /motion_request/);
  }
  const key = await motionRequestCacheKey(validateMotionRequest(motionOp));
  assert.equal(key, await motionRequestCacheKey(validateMotionRequest({ ...motionOp })));
  assert.notEqual(key, await motionRequestCacheKey(validateMotionRequest({ ...motionOp, location: { concept: 'Generation' } })));
  // The selected card (motion-grounding's context) passes through untouched, bounded in size, and is part of the key.
  const context = { selection: { cardId: 'c1', kind: 'note', title: 'Photosynthesis', text: 'Light reactions make ATP.' } };
  assert.deepEqual(validateMotionRequest({ ...motionOp, context }).context, context);
  assert.notEqual(key, await motionRequestCacheKey(validateMotionRequest({ ...motionOp, context })));
  for (const bad of [{ ...motionOp, context: [] }, { ...motionOp, context: 'x' }, { ...motionOp, context: { selection: { text: 'x'.repeat(12001) } } }, { ...motionOp, composition: { source: 'x' } }]) assert.throws(() => validateMotionRequest(bad), /motion_request/);
});

test('the per-job hold is configured, never unlimited, and the grant the worker signs is the one the orchestrator verifies', async () => {
  assert.deepEqual(['2', '2.5', ' 0.75 ', '25'].map(v => motionReservationMicros({ MOTION_JOB_RESERVATION_USD: v })), [2e6, 2.5e6, 750000, 25e6]);
  for (const bad of [undefined, '', '0', '-1', '25.01', 'Infinity', '1e3', '2 USD']) assert.equal(motionReservationMicros({ MOTION_JOB_RESERVATION_USD: bad }), null, String(bad));
  const token = 't'.repeat(40);
  const boot = 'b'.repeat(32);
  const grant = await motionGrant(token, spend.opId, 2000000, 1761000000, boot);
  assert.deepEqual(grant, { micros: 2000000, issued_at: 1761000000, boot, sig: signGrant(token, spend.opId, 2000000, 1761000000, boot) });
});

test('the orchestrator provider: one authorized POST to start, GETs to poll, the final MP4 and its provenance once ready', async () => {
  const fake = transport([json({ job_id: job, status: 'running' }, 202)]);
  const input = validateMotionRequest(motionOp);
  const sent = [];
  const recording = async (url, init) => { sent.push(JSON.parse(init.body)); return fake(url, init); };
  assert.deepEqual(await new MotionRequestProvider(orch, recording).submit(input, spend), { id: job });
  assert.deepEqual(fake.calls, ['POST https://orchestrator.example/jobs authorized with body']);
  assert.deepEqual(sent, [{ request: line, location: { concept: 'Attention' }, idempotency_key: spend.opId, grant: spend.grant }], 'the line, the concept, the key and the grant: nothing else');
  assert.equal(await new MotionRequestProvider(orch, transport([json({ status: 'running', stage: 'authoring' })])).poll({ id: job }), null);
  const clip = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]);
  const done = transport([json(ready), video(clip)]);
  const result = await new MotionRequestProvider(orch, done).poll({ id: job });
  assert.deepEqual(result, { bytes: clip, provider: 'motion', generationId: id, motion: { title: ready.title, ...ready.motion } });
  assert.equal(done.calls[1], `GET https://orchestrator.example/jobs/${job}/final.mp4 authorized`);
});

test('the orchestrator provider: refusals are definite (nothing started), outcomes are final, plaintext is refused', async () => {
  const input = validateMotionRequest(motionOp);
  await assert.rejects(new MotionRequestProvider(orch, transport([json({ error: 'busy', detail: 'one Motion job at a time' }, 429)])).submit(input, spend), e => e.definite === true && e.code === 'busy' && /one Motion job at a time/.test(e.message));
  await assert.rejects(new MotionRequestProvider(orch, transport([json({ error: 'renderer_unavailable', detail: 'the Motion renderer is unavailable; nothing was started' }, 503)])).submit(input, spend), e => e.definite === true && e.code === 'renderer_unavailable');
  await assert.rejects(new MotionRequestProvider(orch, async () => { throw new Error('socket hang up'); }).submit(input, spend), e => !e.definite);
  await assert.rejects(new MotionRequestProvider({}, transport([])).submit(input, spend), e => e.definite === true && /not available in this environment/.test(e.message));
  await assert.rejects(new MotionRequestProvider({ ...orch, MOTION_ORCHESTRATOR_URL: 'http://orchestrator.example/' }, transport([])).submit(input, spend), /HTTPS/);
  const poll = (...responses) => new MotionRequestProvider(orch, transport(responses)).poll({ id: job });
  await assert.rejects(poll(json({ status: 'failed', failure_reason: 'still blocking after the repair round: blank_frame' })), e => e.final && /still blocking after the repair round/.test(e.message));
  await assert.rejects(poll(json({ status: 'cancelled' })), e => e.final && e.message === 'Stopped.');
  await assert.rejects(poll(json({ status: 'needs_clarification', clarification: { question: 'Softmax in CausalSelfAttention.forward or in GPT.generate?' } })), e => e.final && /GPT\.generate/.test(e.message));
  await assert.rejects(poll(json({ error: 'not_found' }, 404)), e => e.final && /restarted/.test(e.message));
  await assert.rejects(poll(json(ready), json({ sneaky: true })), e => !e.final);
});

const BOOT = 'b'.repeat(32);
function orchestratorStub({ submit = () => json({ job_id: job, status: 'running' }, 202), states = ['running', 'ready'], close = () => json({ job_id: job, status: 'running', boot: BOOT }) } = {}) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const path = new URL(url).pathname;
    calls.push(`${init.method} ${path}`);
    if (path === '/health') return json({ ok: true, active: false, boot: BOOT });
    if (path.startsWith('/keys/')) return close();
    if (path === '/jobs') return submit();
    if (path.endsWith('/cancel')) return json({ status: 'stopping' }, 202);
    if (path.endsWith('/final.mp4')) return video(new Uint8Array([0, 0, 0, 24]));
    const status = states.length > 1 ? states.shift() : states[0];
    return json(status === 'ready' ? ready : { job_id: job, status, ...(status === 'failed' ? { failure_reason: 'still blocking after the repair round: blank_frame' } : {}) });
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}
function requestFixture(env = orch) {
  const data = new Map(); let lock = Promise.resolve();
  const state = { id: 'actor-test', storage: { get: async k => structuredClone(data.get(k)), put: async (k, v) => data.set(k, structuredClone(v)), list: async ({ prefix }) => new Map([...data].filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k, structuredClone(v)])), setAlarm: async () => {} }, blockConcurrencyWhile: fn => { const result = lock.then(fn); lock = result.catch(() => {}); return result; } };
  const assets = new Map();
  return { assets, data, actor: new LearnVideos(state, { ...env, LEARN_MEDIA: { put: async (k, v) => assets.set(k, v) } }) };
}
const post = body => new Request('https://dev.test/api/learn/video?app=demo', { method: 'POST', body: JSON.stringify(body) });
const motionRequest = (extra = {}) => post({ operation: motionOp, lessonId: 'adaptive-canvas', page: 'canvas', confirmed: true, ...extra });
const otherRequest = () => post({ operation: { ...motionOp, request: '/motion 10s explain me GPT.generate' }, lessonId: 'adaptive-canvas', page: 'canvas', confirmed: true });
const stopRequest = placement => post({ action: 'cancel', id: placement });

test('LearnVideos runs a /motion request once: the paid gate, one submit for duplicate Generates, the MP4 into LEARN_MEDIA with its title and sources', async () => {
  const o = orchestratorStub();
  try {
    const f = requestFixture();
    assert.equal((await f.actor.fetch(motionRequest({ confirmed: undefined }))).status, 428, 'nothing starts without Generate');
    assert.deepEqual(o.calls, []);
    const [a, b] = await Promise.all([f.actor.fetch(motionRequest()), f.actor.fetch(motionRequest())]).then(rs => Promise.all(rs.map(r => r.json())));
    assert.equal(a.placementId, b.placementId);
    assert.deepEqual(o.calls, ['GET /health', 'POST /jobs'], 'one orchestrator job for two Generates, its grant bound to the run that answered /health');
    const key = await motionRequestCacheKey(validateMotionRequest(motionOp));
    assert.equal((await f.data.get(`job:${key}`)).provider, 'motion_request');
    await f.actor.alarm();
    assert.equal((await f.actor.list()).videos[0].status, 'generating');
    await f.actor.alarm();
    assert.deepEqual([...f.assets.keys()], [`learn-video-dev/actor-test/${key}.mp4`]);
    const v = (await f.actor.list()).videos[0];
    assert.deepEqual([v.status, v.provider, v.generationId, v.motion.title, v.motion.duration_seconds, v.motion.source_refs[0].path], ['ready', 'motion', id, ready.title, 15, 'model.py']);
    assert.equal((await f.actor.fetch(motionRequest())).status, 202);
    assert.equal(o.calls.filter(c => c === 'POST /jobs').length, 1, 'a ready request is served again, never re-rendered');
  } finally { o.restore(); }
});

test('Stop: the orchestrator is told, the job fails as Stopped and stays retryable, nothing is stored, and a new request may start', async () => {
  const o = orchestratorStub({ states: ['running'] });
  try {
    const f = requestFixture();
    const { placementId } = await (await f.actor.fetch(motionRequest())).json();
    assert.equal((await f.actor.fetch(otherRequest())).status, 409, 'one generating job at a time');
    const stopped = await (await f.actor.fetch(stopRequest(placementId))).json();
    const v = stopped.videos.find(x => x.id === placementId);
    assert.deepEqual([v.status, v.error, v.retryable], ['failed', 'Stopped.', true]);
    assert.ok(o.calls.includes(`POST /jobs/${job}/cancel`));
    await f.actor.alarm();
    assert.equal(f.assets.size, 0, 'a stopped job stores nothing');
    // Owner 2026-10-21 10:35 (settle actual usage): a stopped job is polled, never fetched, until its cost can be settled.
    assert.deepEqual(o.calls.filter(c => c.startsWith('GET /jobs')), [`GET /jobs/${job}`], 'polled for its cost, its video never fetched');
    assert.equal((await f.actor.fetch(stopRequest(placementId))).status, 409, 'nothing left to stop');
    assert.equal((await f.actor.fetch(otherRequest())).status, 202, 'the slot is free');
    assert.equal((await f.actor.fetch(stopRequest('nope'))).status, 404);
  } finally { o.restore(); }
});

test('a /motion failure: the reason on the card, nothing stored, retryable; a refused start is retryable, an unknown one is not', async () => {
  const o = orchestratorStub({ states: ['failed'] });
  try {
    const f = requestFixture();
    await f.actor.fetch(motionRequest());
    await f.actor.alarm();
    const v = (await f.actor.list()).videos[0];
    assert.deepEqual([v.status, v.retryable], ['failed', true]);
    assert.match(v.error, /still blocking after the repair round: blank_frame/);
    assert.equal(f.assets.size, 0);
  } finally { o.restore(); }
  const busy = orchestratorStub({ submit: () => json({ error: 'busy', detail: 'one Motion job at a time' }, 429) });
  try {
    const v = (await (await requestFixture().actor.fetch(motionRequest())).json()).videos[0];
    assert.deepEqual([v.status, v.retryable], ['failed', true]);
    assert.match(v.error, /one Motion job at a time/);
  } finally { busy.restore(); }
  // Owner review MOT-07 (message 27, 2026-10-21) replaces the resend of owner item 2: an unconfirmed start is never resent; the
  // alarm closes its key, which answers the job that key already started, so it never becomes a second job.
  const lost = orchestratorStub({ submit: () => { throw new Error('socket hang up'); } });
  try {
    const f = requestFixture();
    const v = (await (await f.actor.fetch(motionRequest())).json()).videos[0];
    assert.equal(v.status, 'generating', 'the job may have started: it is reconciled, not failed or restarted');
    await f.actor.alarm();
    const key = (await f.data.get(`job:${await motionRequestCacheKey(validateMotionRequest(motionOp))}`)).spend.opId;
    assert.deepEqual(lost.calls.slice(0, 4), ['GET /health', 'POST /jobs', `POST /keys/${key}/close`, `GET /jobs/${job}`], 'one POST, then the key closed and the job it started followed');
    assert.equal(lost.calls.filter(c => c === 'POST /jobs').length, 1);
    assert.equal((await f.actor.list()).videos[0].status, 'generating');
  } finally { lost.restore(); }
});

test('with no orchestrator (a dev clone, preview, production), Generate starts nothing: the card says Motion is not available here, retryable', async () => {
  const o = orchestratorStub();
  try {
    const f = requestFixture({});
    const v = (await (await f.actor.fetch(motionRequest())).json()).videos[0];
    assert.deepEqual([v.status, v.retryable, v.error], ['failed', true, 'Motion is not available in this environment yet. Nothing was started.']);
    assert.deepEqual(o.calls, [], 'no request leaves the worker');
    await f.actor.alarm();
    assert.equal(f.assets.size, 0);
  } finally { o.restore(); }
});

test('Stop is refused for providers that cannot stop', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => json({ render_id: id, status: 'rendering' });
  try {
    const f = fixture();
    const { placementId } = await (await f.actor.fetch(request())).json();
    assert.equal((await f.actor.fetch(stopRequest(placementId))).status, 409);
  } finally { globalThis.fetch = original; }
});

// Owner activation GO (2026-10-21): only the production app config names the production orchestrator and its hold; no dev,
// preview or local config points at an orchestrator or turns the development /motion flag on.
test('only the production app config points at the Motion orchestrator, with a configured hold; no other checked-in config does', async () => {
  const { readdirSync, readFileSync } = await import('node:fs');
  const dirs = ['../', '../../web/'].map(d => new URL(d, import.meta.url));
  const configs = dirs.flatMap(dir => readdirSync(dir).filter(f => /^wrangler.*\.jsonc?$/.test(f)).map(f => [new URL(f, dir).pathname, readFileSync(new URL(f, dir), 'utf8')]));
  assert.ok(configs.length >= 10);
  for (const [name, text] of configs) {
    assert.doesNotMatch(text, /VITE_MOTION_DEV|MOTION_ORCHESTRATOR_TOKEN"\s*:/, name);
    if (name.endsWith('/web/wrangler.rabbit-hole-prod.jsonc')) {
      assert.match(text, /"MOTION_ORCHESTRATOR_URL": "https:\/\/rabbit-hole-motion-orchestrator\.fly\.dev"/);
      assert.ok(motionReservationMicros({ MOTION_JOB_RESERVATION_USD: text.match(/"MOTION_JOB_RESERVATION_USD": "([^"]+)"/)?.[1] }) > 0, 'a valid hold');
      // Owner message 28: new generation paused in production until MOT-06/07 are fixed; dev, preview and local stay unpaused.
      assert.match(text, /"MOTION_GENERATION_PAUSED": "0"/);
      // Owner message 32: the confirmation's estimate, a typical job's actual cost (about 100 credits).
      assert.match(text, /"MOTION_ESTIMATE_USD": "1\.00"/);
    } else assert.doesNotMatch(text, /MOTION_ORCHESTRATOR|MOTION_JOB_RESERVATION|MOTION_GENERATION_PAUSED|MOTION_ESTIMATE/, name);
  }
});

// Owner brief 2026-10-21 message 7 item 4: the selected card rides as context.selection (motion-context.js), validated
// here, part of the job's identity, and sent to the orchestrator unchanged.
test('motion_request context: the selected card is kept, keyed and submitted; crafted repository evidence is refused', async () => {
  const selection = { cardId: 'c-photo', kind: 'Explanation', title: 'Photosynthesis', text: 'Plants turn light into glucose.' };
  const withCard = validateMotionRequest({ ...motionOp, context: { selection } });
  assert.deepEqual(withCard.context, { selection });
  const code = { cardId: 'code-1', kind: 'repo-code', sourceRefs: [{ commit: 'a'.repeat(40), path: 'model.py', start: 62, end: 71 }] };
  assert.deepEqual(validateMotionRequest({ ...motionOp, context: { selection: code } }).context, { selection: { ...code, text: '' } });
  assert.deepEqual(validateMotionRequest({ ...motionOp, context: {} }), validateMotionRequest(motionOp), 'an empty context is no context');
  for (const context of [
    { selection: { ...selection, sourceRefs: code.sourceRefs } }, // refs on a card that is not a repository card
    { selection, repository_context: { commit: 'a'.repeat(40) } },
    { selection: { ...selection, evidence: 'x' } },
    { selection: { ...selection, text: 'x'.repeat(4001) } },
    { selection: { ...selection, text: '' } },
    { selection: { ...code, sourceRefs: Array(9).fill(code.sourceRefs[0]) } },
    { selection: { ...code, sourceRefs: [{ ...code.sourceRefs[0], path: '/etc/passwd' }] } },
    { selection: { ...code, sourceRefs: [{ ...code.sourceRefs[0], end: 400 }] } },
    'about the selected canvas material',
  ]) assert.throws(() => validateMotionRequest({ ...motionOp, context }), /motion_request\.context/, JSON.stringify(context).slice(0, 80));
  const key = await motionRequestCacheKey(validateMotionRequest(motionOp));
  assert.equal(key, await motionRequestCacheKey(validateMotionRequest({ ...motionOp, context: {} })), 'no selection keeps the old key');
  const photo = await motionRequestCacheKey(withCard);
  assert.notEqual(photo, key);
  assert.notEqual(photo, await motionRequestCacheKey(validateMotionRequest({ ...motionOp, context: { selection: { ...selection, cardId: 'c-other' } } })), 'another card is another job');
  const sent = [];
  const capture = async (url, init) => { sent.push(JSON.parse(init.body)); return json({ job_id: job, status: 'running' }, 202); };
  await new MotionRequestProvider(orch, capture).submit(withCard, spend);
  await new MotionRequestProvider(orch, capture).submit(validateMotionRequest(motionOp), spend);
  const hold = { idempotency_key: spend.opId, grant: spend.grant };
  assert.deepEqual(sent, [{ request: line, location: { concept: 'Attention' }, context: { selection }, ...hold }, { request: line, location: { concept: 'Attention' }, ...hold }]);
});

// mgrnd ruling (2026-10-21): a canvas's repository is resolved by the worker from its own records (a repository canvas's row,
// a course canvas's pinned source), forwarded in one server-set header that a browser cannot supply, and sent to the
// orchestrator with the job.
test('the canvas repository: from the server records only; a browser-sent header is replaced, never trusted', async () => {
  const sha = '3adf61e154c3fe3fca428ad6bc3818b27a3b8291';
  assert.deepEqual(await canvasRepository({}, { kind: 'repository', repo: 'karpathy/minGPT', repo_commit: 'b'.repeat(40) }), { repo: 'karpathy/minGPT', commit: 'b'.repeat(40) });
  assert.equal(await canvasRepository({}, { kind: 'repository', repo: 'x', repo_commit: 'main' }), null, 'a malformed record is no repository');
  const DB = source => ({ prepare: () => ({ bind: () => ({ first: async () => (source ? { source_version: source } : null) }) }) });
  assert.deepEqual(await canvasRepository({ DB: DB(sha) }, { id: 7, name: 'canvas-1' }), { repo: 'karpathy/nanoGPT', commit: sha }, 'a course canvas: its pinned source');
  assert.equal(await canvasRepository({ DB: DB(null) }, { id: 7, name: 'canvas-1' }), null, 'an ordinary canvas has none');
  assert.equal(await canvasRepository({ DB: { prepare: () => { throw new Error('D1 down'); } } }, { id: 7 }), null);
  const forged = () => new Request('https://dev.test/api/learn/video', { method: 'POST', headers: { 'x-rh-canvas-repository': JSON.stringify({ repo: 'evil/repo', commit: 'c'.repeat(40) }) }, body: '{}' });
  assert.equal(withCanvasRepository(forged(), null).headers.get('x-rh-canvas-repository'), null, 'a browser cannot claim a repository');
  assert.equal(withCanvasRepository(forged(), { repo: 'karpathy/nanoGPT', commit: sha }).headers.get('x-rh-canvas-repository'), JSON.stringify({ repo: 'karpathy/nanoGPT', commit: sha }));
  const bodies = [];
  const o = orchestratorStub();
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => { if (new URL(url).pathname === '/jobs') bodies.push(JSON.parse(init.body)); return original(url, init); };
  try {
    await requestFixture().actor.fetch(withCanvasRepository(motionRequest(), { repo: 'karpathy/nanoGPT', commit: sha }));
    assert.deepEqual(bodies[0].repository, { repo: 'karpathy/nanoGPT', commit: sha });
  } finally { globalThis.fetch = original; o.restore(); }
});

test('MOT-07 only a verified refusal is a no-start: a 500, a 502, a malformed success or a lost answer may have started the job', async () => {
  const input = validateMotionRequest(motionOp);
  const submit = response => new MotionRequestProvider(orch, transport([response])).submit(input, spend);
  for (const [status, error] of [[400, 'invalid_request'], [401, 'unauthorized'], [403, 'grant_refused'], [429, 'busy'], [503, 'renderer_unavailable'], [503, 'not_configured']]) {
    await assert.rejects(submit(json({ error, detail: 'nothing was started' }, status)), e => e.definite === true && e.code === error, `${status} ${error}`);
  }
  for (const response of [json({ error: 'orchestrator_failure' }, 500), new Response('<html>502 Bad Gateway</html>', { status: 502 }), json({ status: 'running' }, 202),
    new Response('{"job_id": "', { status: 202 }), json({ error: 'busy' }, 502), json({}, 503), json({ error: 'not_found' }, 404)]) {
    await assert.rejects(submit(response), e => !e.definite, `HTTP ${response.status}`);
  }
});
