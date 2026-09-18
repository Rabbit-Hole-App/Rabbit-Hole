import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ManimProvider, cacheKey } from '../src/math-provider.js';

const spec = { op: 'generate_math_animation', id: 'sigmoid', concept: 'Sigmoid', purpose: 'derivation', scene: { steps: [{ kind: 'equation', expressions: ['y = x'] }] } };
const env = { MATH_WORKER_URL: 'https://math.example/', MATH_WORKER_TOKEN: 'secret' };

// Each call answers the next queued response and records what it was asked.
const transport = responses => {
  const calls = [];
  const fake = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || 'GET', authorized: init.headers?.Authorization === 'Bearer secret', body: init.body && JSON.parse(init.body) });
    const next = responses.shift();
    if (typeof next === 'function') return next();
    return next;
  };
  fake.calls = calls;
  return fake;
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const video = bytes => new Response(bytes, { status: 200, headers: { 'Content-Type': 'video/mp4' } });

test('the cache key ignores presentation and follows the scene, key order and worker version', async () => {
  const base = await cacheKey(spec, 'v1');
  assert.equal(base.length, 64);
  assert.equal(base, await cacheKey({ ...spec, caption: 'different', id: 'renamed' }, 'v1'));
  assert.equal(base, await cacheKey({ scene: { steps: [{ expressions: ['y = x'], kind: 'equation' }] } }, 'v1'));
  assert.notEqual(base, await cacheKey({ scene: { steps: [{ kind: 'equation', expressions: ['y = 2x'] }] } }, 'v1'));
  assert.notEqual(base, await cacheKey(spec, 'v2'));
});

test('submitting reads the worker version first and sends it with the job', async () => {
  const fake = transport([json({ ok: true, version: 'math-1-abc/0.18.1' }), json({ key: 'k', status: 'rendering' }, 202)]);
  const ticket = await new ManimProvider(env, fake).submit({ spec });
  assert.equal(ticket.version, 'math-1-abc/0.18.1');
  assert.equal(ticket.id, await cacheKey(spec, 'math-1-abc/0.18.1'));
  assert.deepEqual(fake.calls.map(call => `${call.method} ${call.url}`), ['GET https://math.example/health', 'POST https://math.example/jobs']);
  assert.ok(fake.calls.every(call => call.authorized));
  assert.equal(fake.calls[1].body.version, 'math-1-abc/0.18.1');
  assert.equal(fake.calls[1].body.operation.scene.steps.length, 1);
});

test('a busy worker is a retryable message, not a lost animation', async () => {
  const fake = transport([json({ ok: true, version: 'v' }), json({ error: 'Worker is busy' }, 429)]);
  await assert.rejects(new ManimProvider(env, fake).submit({ spec }), /busy/);
});

test('polling returns nothing while rendering and the bytes once ready', async () => {
  const pending = new ManimProvider(env, transport([json({ status: 'rendering' })]));
  assert.equal(await pending.poll({ id: 'a'.repeat(64) }), null);

  const clip = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]);
  const ready = new ManimProvider(env, transport([json({ status: 'ready' }), video(clip)]));
  const result = await ready.poll({ id: 'a'.repeat(64) });
  assert.deepEqual(result.bytes, clip);
  assert.equal(result.provider, 'manim');
});

test('a failed render surfaces the worker reason, and a forgotten job says to generate again', async () => {
  const failed = new ManimProvider(env, transport([json({ status: 'failed', error: 'Rendering exceeded 420 seconds' })]));
  await assert.rejects(failed.poll({ id: 'a'.repeat(64) }), /exceeded 420 seconds/);

  const lost = new ManimProvider(env, transport([json({ error: 'Job not found' }, 404)]));
  await assert.rejects(lost.poll({ id: 'a'.repeat(64) }), /generate it again/);
});

test('an unconfigured or plaintext worker is refused before anything is sent', async () => {
  await assert.rejects(new ManimProvider({}, transport([])).submit({ spec }), /not configured/);
  await assert.rejects(new ManimProvider({ MATH_WORKER_URL: 'http://math.example/', MATH_WORKER_TOKEN: 't' }, transport([])).submit({ spec }), /HTTPS/);
});

test('a worker that answers with something other than a video is not stored as one', async () => {
  const wrong = new ManimProvider(env, transport([json({ status: 'ready' }), json({ sneaky: true })]));
  await assert.rejects(wrong.poll({ id: 'a'.repeat(64) }), /unavailable/);
});
