import { test } from 'node:test';
import assert from 'node:assert/strict';
import { askJev, JEV_MODEL } from '../src/learn-grade-jev.js';

const ok = body => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
const failing = (code, headers = {}) => new Response(JSON.stringify({ message: `status ${code}`, error_type: 'x' }), { status: code, headers });

test('posts to the gateway with the key and returns the body and metadata', async () => {
  const calls = [];
  const result = await askJev({ VERCEL_TYPESAFE_API_KEY: 'vck_test' }, { model: JEV_MODEL, state: {}, questions: {} }, {
    fetchImpl: async (url, init) => { calls.push({ url, init }); return ok({ model: 'typesafe-ai/jev', answers: {}, usage: { input_tokens: 10 }, provider_metadata: { gateway: { cost: '0.00000042', generationId: 'gen_x' } } }); },
  });
  assert.equal(calls[0].url, 'https://ai-gateway.vercel.sh/typesafe/v1/systemone');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer vck_test');
  assert.equal(JSON.parse(calls[0].init.body).model, 'typesafe-ai/jev');
  assert.equal(result.generationId, 'gen_x');
  assert.equal(result.inputTokens, 10);
  assert.equal(typeof result.ms, 'number');
});

test('429 and 529 are retried exactly once, waiting at most one second', async () => {
  for (const code of [429, 529]) {
    const waits = [];
    let calls = 0;
    await askJev({}, {}, { sleep: async ms => { waits.push(ms); }, fetchImpl: async () => (++calls === 1 ? failing(code, { 'Retry-After': '5' }) : ok({ answers: {} })) });
    assert.equal(calls, 2);
    assert.deepEqual(waits, [1000]);
    calls = 0;
    await assert.rejects(askJev({}, {}, { sleep: async () => {}, fetchImpl: async () => { calls += 1; return failing(code); } }),
      error => error.code === 'http' && error.status === code);
    assert.equal(calls, 2);
  }
});

test('no Retry-After header means no wait before the one retry', async () => {
  const waits = [];
  let calls = 0;
  await askJev({}, {}, { sleep: async ms => { waits.push(ms); }, fetchImpl: async () => (++calls === 1 ? failing(429) : ok({ answers: {} })) });
  assert.deepEqual(waits, [0]);
});

// Review focus 3: every other status fails at once, with its message kept.
test('other statuses are never retried', async () => {
  for (const code of [400, 401, 402, 500]) {
    let calls = 0;
    await assert.rejects(askJev({}, {}, { fetchImpl: async () => { calls += 1; return failing(code); } }),
      error => error.code === 'http' && error.status === code && error.message === `Jev ${code} x: status ${code}`);
    assert.equal(calls, 1);
  }
});

test('a timeout is not retried and says so', async () => {
  let calls = 0;
  await assert.rejects(
    askJev({}, {}, { timeoutMs: 20, fetchImpl: (url, init) => { calls += 1; return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))); } }),
    error => error.code === 'timeout' && error.message === 'Jev timed out after 20 ms');
  assert.equal(calls, 1);
});

test('a network failure is reported as such', async () => {
  await assert.rejects(askJev({}, {}, { fetchImpl: async () => { throw new TypeError('fetch failed'); } }),
    error => error.code === 'network' && /fetch failed/.test(error.message));
});
