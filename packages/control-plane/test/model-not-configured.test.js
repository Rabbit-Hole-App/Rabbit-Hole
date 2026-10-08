// No Anthropic key on a deployment (the dev preview before its key; owner, 2026-10-08): no model request may leave the
// worker, and every AI feature answers "AI answers aren't configured on this preview." - never a raw "model HTTP 401".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anthropic } from '../src/ask.js';
import { MODEL_NOT_CONFIGURED, notConfiguredMessage } from '../src/learn-models.js';
import { modelFailure } from '../src/learn-research.js';
import { tutorRoute } from '../src/learn-tutor-routes.js';
import { learnDb } from './learn-grade-fixture.js';
import { liveDb, liveRuns, readOnlyControlPlane } from './live-storage-spy.js';

// Every outbound request this test's code makes, refused: a missing key must never reach here.
const outbound = t => {
  const calls = [], original = globalThis.fetch;
  globalThis.fetch = async input => { calls.push(String(input?.url ?? input)); return Response.json({ error: { message: 'invalid x-api-key' } }, { status: 401 }); };
  t.after(() => { globalThis.fetch = original; });
  return calls;
};

test('the model chokepoint answers for Anthropic without asking it when there is no key', async t => {
  const calls = outbound(t);
  const reply = await anthropic({}, { messages: [{ role: 'user', content: 'Why does this exist?' }], max_tokens: 10 });
  assert.equal(reply.status, 503);
  assert.equal(await notConfiguredMessage(reply), MODEL_NOT_CONFIGURED);
  assert.equal((await modelFailure(reply, 'Learn answer unavailable')).message, MODEL_NOT_CONFIGURED, 'the sentence alone, no HTTP code');
  assert.deepEqual(calls, [], 'zero outbound requests');
  assert.equal(MODEL_NOT_CONFIGURED, 'AI answers aren’t configured on this preview.');
});

test('a real upstream failure keeps its code: only the missing key reads as not configured', async t => {
  outbound(t);
  const reply = await anthropic({ ANTHROPIC_API_KEY: 'k' }, { messages: [{ role: 'user', content: 'x' }], max_tokens: 10 });
  assert.equal(reply.status, 401, 'with a key the request is made (here refused by the stub)');
  assert.equal(await notConfiguredMessage(reply), null);
  assert.match((await modelFailure(reply, 'Learn answer unavailable')).message, /model HTTP 401/);
});

test('a Tutor turn with no key: the learner reads the sentence, and nothing left the worker', async t => {
  const calls = outbound(t);
  const { sqlite, LEARN_DB } = learnDb(t);
  sqlite.exec("INSERT INTO canvases(org,name,owner_email,title) VALUES('team','canvas-0a1b2c3d','owner@test','Board')");
  const env = { LEARN_DB, DB: liveDb(), RUNS: liveRuns(), CONTROL_PLANE: readOnlyControlPlane({ apps: {} }), TUTOR_PLANNER_FAST_MODEL: 'off', TUTOR_PLANNER_CACHE: 'off' };
  const response = await tutorRoute('/api/learn/tutor/plan', new Request('https://dev.test/api/learn/tutor/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ app: 'canvas-0a1b2c3d', context: { turn: { raw_user_message: 'What is a tensor?' } } }) }), env);
  assert.equal(response.ok, false);
  assert.match(JSON.stringify(await response.json()), new RegExp(MODEL_NOT_CONFIGURED.replace(/[.?]/g, '\\$&')));
  assert.deepEqual(calls, [], 'zero outbound requests');
});
