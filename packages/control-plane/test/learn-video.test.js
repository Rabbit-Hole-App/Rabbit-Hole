import test from 'node:test';
import assert from 'node:assert/strict';
import { validateVideo, videoCacheKey } from '../src/learn-video-schema.js';
import { FalSeedanceProvider } from '../src/video-provider.js';
import { LearnVideos, videoFetch } from '../src/learn-video.js';
import { validateBoardPlan, BOARD_SYSTEM } from '../src/learn-board.js';
import { liveRuns } from './live-storage-spy.js';

const op = { op: 'generate_video', id: 'motion', prompt: 'A pendulum swings from left to right. No text.', purpose: 'physical_process', duration: 2 };
test('generic operation validates and cache covers content and provider version, not placement or caption', async () => {
  const a = validateVideo(op);
  assert.equal(a.aspectRatio, '16:9');
  assert.equal(await videoCacheKey(a, 'v1'), await videoCacheKey({ ...a, id: 'other', caption: 'Other' }, 'v1'));
  for (const b of [{ ...a, duration: 3 }, { ...a, style: 'clay' }, { ...a, purpose: 'intuition' }, { ...a, referenceImages: ['https://images.pexels.com/photo.png'] }]) assert.notEqual(await videoCacheKey(a, 'v1'), await videoCacheKey(b, 'v1'));
  assert.notEqual(await videoCacheKey(a, 'v1'), await videoCacheKey(a, 'v2'));
  for (const b of [{ ...op, duration: 1 }, { ...op, model: 'secret' }, { ...op, referenceImages: ['http://localhost/private'] }]) assert.throws(() => validateVideo(b));
});
test('board accepts generic video and prohibits multiple clips; agent prompt has no provider-specific configuration', () => {
  const block = { kind: 'video', text: 'Pendulum motion', fromObjectId: null, operation: op };
  const plan = { summary: 'Motion intuition', needsClarification: false, blocks: [block] };
  assert.equal(validateBoardPlan(plan, { relatedObjects: [] }), plan);
  // The one-video cap clamps instead of failing the plan: the extra clip drops.
  assert.equal(validateBoardPlan({ ...plan, blocks: [block, { ...block }] }, { relatedObjects: [] }).blocks.filter(b => b.kind === 'video').length, 1);
  assert.doesNotMatch(BOARD_SYSTEM, /seedance|veo|fal-ai/i);
});
test('adapter translates duration and references, validates provider URLs, and polls without submitting again', async () => {
  const calls = [];
  const adapter = new FalSeedanceProvider({ FAL_API_KEY: 'test' }, async function (url, init) {
    assert.equal(this, undefined, 'Worker fetch must not receive the adapter as this');
    assert.equal(init.redirect, 'manual', 'Worker fetch does not implement redirect:error');
    calls.push([url, init]);
    return Response.json(init.method === 'POST' ? { request_id: 'test', status_url: 'https://queue.fal.run/status', response_url: 'https://queue.fal.run/result' } : url.endsWith('status') ? { status: 'COMPLETED' } : { video: { url: 'https://v3.fal.media/clip.mp4' } });
  });
  const ticket = await adapter.submit(validateVideo(op));
  assert.deepEqual(JSON.parse(calls[0][1].body).duration, '2');
  assert.equal(JSON.parse(calls[0][1].body).resolution, '480p');
  assert.equal((await adapter.poll(ticket)).generationId, 'test');
  assert.equal(calls.filter(c => c[1].method === 'POST').length, 1);
  await assert.rejects(() => adapter.poll({ statusUrl: 'https://evil.example/key' }), /Invalid provider/);
});

function fixture() {
  const data = new Map(); let lock = Promise.resolve();
  const state = { id: 'actor-test', storage: { get: async k => structuredClone(data.get(k)), put: async (k, v) => data.set(k, structuredClone(v)), list: async ({ prefix }) => new Map([...data].filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k, structuredClone(v)])), setAlarm: async () => {} }, blockConcurrencyWhile: fn => { const result = lock.then(fn); lock = result.catch(() => {}); return result; } };
  const assets = new Map();
  const env = { LEARN_VIDEO_PROVIDER: 'fal-seedance-lite', FAL_API_KEY: 'test', LEARN_MEDIA: { put: async (k, v) => assets.set(k, v), get: async k => ({ body: assets.get(k), size: assets.get(k).byteLength }) }, RUNS: liveRuns() };
  return { state, env, assets, data, actor: new LearnVideos(state, env) };
}
const request = (extra = {}) => new Request('https://dev.test/api/learn/video?app=demo', { method: 'POST', body: JSON.stringify({ operation: op, lessonId: 'lesson', page: 'freeform', confirmed: true, ...extra }) });
test('concurrent duplicate requests submit once; durable completion copies the asset and reload reuses it', async () => {
  const original = globalThis.fetch; let submissions = 0;
  globalThis.fetch = async (url, init = {}) => {
    if (init.method === 'POST') { submissions++; return Response.json({ request_id: 'generation-1', status_url: 'https://queue.fal.run/status', response_url: 'https://queue.fal.run/result' }); }
    if (url.endsWith('/status')) return Response.json({ status: 'COMPLETED' });
    if (url.endsWith('/result')) return Response.json({ video: { url: 'https://v3.fal.media/clip.mp4' } });
    return new Response(new Uint8Array([0, 0, 0, 24]), { headers: { 'Content-Type': 'video/mp4' } });
  };
  try {
    const f = fixture();
    const responses = await Promise.all([f.actor.fetch(request()), f.actor.fetch(request())]);
    assert.equal(submissions, 1);
    assert.equal((await responses[0].json()).videos[0].status, 'generating');
    await new LearnVideos(f.state, f.env).alarm();
    assert.equal(f.assets.size, 1);
    assert.match([...f.assets.keys()][0], /^learn-video-dev\//);
    assert.deepEqual(f.env.RUNS.calls, [], 'the clip never reaches the live bucket');
    const ready = await (await new LearnVideos(f.state, f.env).fetch(request())).json();
    assert.equal(ready.videos[0].status, 'ready');
    assert.equal(ready.videos[0].generationId, 'generation-1');
    assert.equal(submissions, 1);
    const id = ready.placementId;
    await f.actor.fetch(request({ action: 'place', id, position: { x: 10, y: 20, w: 600, h: 340 } }));
    assert.equal((await f.actor.list()).videos[0].position.w, 600);
  } finally { globalThis.fetch = original; }
});
test('unknown submission fails closed instead of incurring another charge', async () => {
  const original = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('connection lost after POST'); };
  try {
    const f = fixture();
    assert.equal((await (await f.actor.fetch(request())).json()).videos[0].status, 'failed');
    assert.equal((await f.actor.fetch(request({ retry: true }))).status, 409);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});
test('provider-declared failure offers explicit retry; polling does not automatically regenerate', async () => {
  const original = globalThis.fetch; let calls = 0;
  globalThis.fetch = async (url, init = {}) => {
    if (init.method === 'POST') { calls++; return Response.json({ request_id: `g${calls}`, status_url: 'https://queue.fal.run/status', response_url: 'https://queue.fal.run/result' }); }
    return Response.json({ status: 'COMPLETED', error: 'generation failed' });
  };
  try {
    const f = fixture(); await f.actor.fetch(request()); await f.actor.alarm();
    assert.equal((await f.actor.list()).videos[0].status, 'failed'); assert.equal(calls, 1);
    await f.actor.fetch(request({ retry: true })); assert.equal(calls, 2);
  } finally { globalThis.fetch = original; }
});
test('authentication precedes video storage and generation', async () => {
  const result = await videoFetch(new Request('https://dev.test/api/learn/video?app=demo'), { CONTROL_PLANE: { fetch: async () => new Response('', { status: 403 }) } });
  assert.equal(result.status, 403);
});
test('a paid clip never starts without the learner confirming it', async () => {
  const original = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({}); };
  try {
    const f = fixture();
    const response = await f.actor.fetch(request({ confirmed: undefined }));
    assert.equal(response.status, 428);
    assert.equal((await response.json()).needsConfirm, true);
    assert.equal(calls, 0);
    assert.equal(f.data.size, 0);
  } finally { globalThis.fetch = original; }
});
