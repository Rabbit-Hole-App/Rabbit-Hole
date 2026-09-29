import test from 'node:test';
import assert from 'node:assert/strict';
import example from '../../lesson-renderer/example-scene.json' with { type: 'json' };
import { validateScene, sceneCacheKey } from '../src/learn-scene-schema.js';
import { LearnScenes, sceneFetch } from '../src/learn-scene.js';
import { validateBoardPlan } from '../src/learn-board.js';

test('scene schema permits deterministic geometry and rejects scripts, cycles, invalid animation and limits', () => {
  assert.equal(validateScene(example).output, 'glb');
  const plan = { summary: 'Explore projection', needsClarification: false, blocks: [{ kind: 'scene', text: 'Camera geometry', fromObjectId: null, operation: example }] };
  assert.equal(validateBoardPlan(plan, { relatedObjects: [] }), plan);
  for (const changed of [
    { ...example, python: 'import os' }, { ...example, output: 'both' }, { ...example, duration: 11 },
    { ...example, scene: { objects: [{ id: 'a', type: 'cube', parent: 'a' }] } },
    { ...example, scene: { objects: [{ id: 'a', type: 'cube', color: 'javascript:foo' }] } },
    { ...example, scene: { objects: [{ id: 'a', type: 'arrow', start: [0, 0, 0], end: [0, 0, 0] }] } },
    { ...example, scene: { objects: [{ id: 'a', type: 'camera_frustum', near: 4, far: 2 }] } },
    { ...example, scene: { ...example.scene, animations: [{ ...example.scene.animations[0], end: 8 }] } },
    { ...example, scene: { ...example.scene, objects: Array(25).fill(example.scene.objects[0]) } },
  ]) assert.throws(() => validateScene(changed));
});
test('scene cache ignores presentation ids/captions, normalizes key order and includes compiler version', async () => {
  const key = await sceneCacheKey(example, 'v1');
  assert.equal(key, await sceneCacheKey({ ...example, id: 'other', concept: 'Other caption', caption: 'Edited', scene: { animations: example.scene.animations, objects: example.scene.objects } }, 'v1'));
  assert.notEqual(key, await sceneCacheKey(example, 'v2'));
  assert.notEqual(key, await sceneCacheKey({ ...example, duration: 3 }, 'v1'));
});
function fixture() {
  const data = new Map(), assets = new Map(); let lock = Promise.resolve();
  const state = { id: 'test-scene', storage: { get: async k => structuredClone(data.get(k)), put: async (k, v) => data.set(k, structuredClone(v)), list: async ({ prefix }) => new Map([...data].filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k, structuredClone(v)])), setAlarm: async () => {} }, blockConcurrencyWhile: fn => { const result = lock.then(fn); lock = result.catch(() => {}); return result; } };
  const env = { SCENE_WORKER_URL: 'https://renderer.test', SCENE_WORKER_TOKEN: 'secret', RUNS: { put: async (k, bytes) => assets.set(k, bytes), get: async k => assets.has(k) ? { body: assets.get(k), size: assets.get(k).byteLength } : null } };
  return { data, assets, state, env, actor: new LearnScenes(state, env) };
}
const request = (body = {}) => new Request('https://dev.test/api/learn/scene?app=demo', { method: 'POST', body: JSON.stringify({ operation: example, lessonId: 'lesson', page: 'freeform', confirmed: true, ...body }) });
test('durable scene job queues asynchronously, deduplicates, stores GLB and retains camera state', async () => {
  const original = globalThis.fetch; let posts = 0;
  const bytes = new Uint8Array(24); new DataView(bytes.buffer).setUint32(0, 0x46546c67, true);
  globalThis.fetch = async (url, init) => {
    assert.equal(init.redirect, 'manual'); assert.equal(init.headers.Authorization, 'Bearer secret');
    if (String(url).endsWith('/health')) return Response.json({ version: 'blender-test' });
    if (init.method === 'POST') { posts++; return Response.json({ status: 'rendering' }, { status: 202 }); }
    if (String(url).endsWith('/asset')) return new Response(bytes);
    return Response.json({ status: 'ready' });
  };
  try {
    const f = fixture(); const result = await (await f.actor.fetch(request())).json();
    assert.equal(result.scenes[0].status, 'queued'); assert.equal(posts, 0);
    await Promise.all([f.actor.fetch(request()), f.actor.fetch(request())]); await f.actor.alarm(); assert.equal(posts, 1);
    await new LearnScenes(f.state, f.env).alarm(); assert.equal((await f.actor.list()).scenes[0].status, 'ready'); assert.equal(f.assets.size, 1);
    const viewState = { camera: { position: [1, 2, 3], target: [0, 0, 0] }, animation: { autoplay: false }, animationTime: 1 };
    await f.actor.fetch(request({ action: 'place', id: result.placementId, position: { x: 10, y: 20, w: 600, h: 420 }, viewState }));
    assert.deepEqual((await f.actor.list()).scenes[0].viewState, viewState);
    await f.actor.fetch(request()); assert.equal(posts, 1);
    assert.equal((await f.actor.fetch(new Request(`https://dev.test/api/learn/scene?asset=${result.scenes[0].key}`))).headers.get('Content-Type'), 'model/gltf-binary');
  } finally { globalThis.fetch = original; }
});
test('worker failure requires explicit retry with a new attempt key; access check happens first', async () => {
  const original = globalThis.fetch; let posts = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith('/health')) return Response.json({ version: 'test' });
    if (init.method === 'POST') { posts.push(JSON.parse(init.body).key); return Response.json({ status: 'rendering' }); }
    return Response.json({ status: 'failed', error: 'Export failed' });
  };
  try {
    const f = fixture(); await f.actor.fetch(request()); await f.actor.alarm(); await f.actor.alarm(); assert.equal((await f.actor.list()).scenes[0].status, 'failed');
    await f.actor.fetch(request()); await f.actor.alarm(); assert.equal(posts.length, 1);
    await f.actor.fetch(request({ retry: true })); await f.actor.alarm(); assert.equal(posts.length, 2); assert.notEqual(posts[0], posts[1]);
    const denied = await sceneFetch(new Request('https://dev.test/api/learn/scene?app=demo'), { CONTROL_PLANE: { fetch: async () => new Response('', { status: 403 }) } }); assert.equal(denied.status, 403);
  } finally { globalThis.fetch = original; }
});
test('a Blender scene never queues without the learner confirming it', async () => {
  const original = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ version: 'test' }); };
  try {
    const f = fixture();
    const response = await f.actor.fetch(request({ confirmed: false }));
    assert.equal(response.status, 428);
    assert.equal(calls, 0);
    assert.equal(f.data.size, 0);
  } finally { globalThis.fetch = original; }
});
