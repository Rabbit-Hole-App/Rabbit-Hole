import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MotionProvider, motionCacheKey, validateMotionRender } from '../src/motion-provider.js';
import { LearnVideos } from '../src/learn-video.js';

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
