// No Anthropic key on a deployment (the dev preview before its key; owner, 2026-10-08): no model request may leave the
// worker, and every AI feature answers "AI answers aren't configured on this preview." - never a raw "model HTTP 401".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anthropic } from '../src/ask.js';
import { MODEL_NOT_CONFIGURED, notConfiguredMessage } from '../src/learn-models.js';
import { modelFailure } from '../src/learn-research.js';

// Every outbound request this test's code makes, refused: a missing key must never reach here.
const outbound = t => {
  const calls = [], original = globalThis.fetch;
  globalThis.fetch = async input => { calls.push(String(input?.url ?? input)); return Response.json({ error: { message: 'invalid x-api-key' } }, { status: 401 }); };
  t.after(() => { globalThis.fetch = original; });
  return calls;
};

test('the model chokepoint answers for Anthropic without asking it when there is no key', async t => {
  const calls = outbound(t);
  const reply = await anthropic({ SMALL_ENV: 'test' }, { messages: [{ role: 'user', content: 'Why does this exist?' }], max_tokens: 10 });
  assert.equal(reply.status, 503);
  assert.equal(await notConfiguredMessage(reply), MODEL_NOT_CONFIGURED);
  assert.equal((await modelFailure(reply, 'Learn answer unavailable')).message, MODEL_NOT_CONFIGURED, 'the sentence alone, no HTTP code');
  assert.deepEqual(calls, [], 'zero outbound requests');
  assert.equal(MODEL_NOT_CONFIGURED, 'AI answers aren’t configured on this preview.');
});

test('a real upstream failure keeps its code: only the missing key reads as not configured', async t => {
  outbound(t);
  const reply = await anthropic({ SMALL_ENV: 'test', ANTHROPIC_API_KEY: 'k' }, { messages: [{ role: 'user', content: 'x' }], max_tokens: 10 });
  assert.equal(reply.status, 401, 'with a key the request is made (here refused by the stub)');
  assert.equal(await notConfiguredMessage(reply), null);
  assert.match((await modelFailure(reply, 'Learn answer unavailable')).message, /model HTTP 401/);
});
