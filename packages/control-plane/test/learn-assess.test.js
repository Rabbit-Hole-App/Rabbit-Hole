// POST /api/learn/assess, the visible Opus grade (owner decision 3, C6 in
// docs/features/learn-cleanup.md): one model call on today's default model with
// today's instruction text, no tools, no Learn system prompt, no thread, no app
// context, nothing stored anywhere.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { learnDb } from './learn-grade-fixture.js';
import { liveDb, liveRuns, readOnlyControlPlane } from './live-storage-spy.js';
import { assessAnswer } from '../src/learn-grade-routes.js';
import { challengePrompt } from '../src/agents/learn-grade.js';

// Records every model request; `replies` answers them in order (the last repeats).
function recordFetch(t, replies = [{ content: [{ type: 'text', text: 'VERDICT: good\nYou have it.' }], stop_reason: 'end_turn' }]) {
  const calls = [], original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), headers: options.headers || {}, body: JSON.parse(options.body) });
    const reply = replies[Math.min(calls.length - 1, replies.length - 1)];
    return reply instanceof Response ? reply : Response.json({ model: 'claude-opus-5', ...reply });
  };
  return calls;
}

function world(t, envExtra = {}) {
  const { sqlite, LEARN_DB } = learnDb(t);
  sqlite.exec(`INSERT INTO repository_apps(id,org,name,owner_email,repo,branch,commit_sha,status) VALUES(1,'team','repo-example','owner@test','example/project','main','${'a'.repeat(40)}','ready');
    INSERT INTO canvases(org,name,owner_email,title) VALUES('team','canvas-0a1b2c3d','owner@test','Board')`);
  const env = { LEARN_DB, DB: liveDb(), RUNS: liveRuns(), CONTROL_PLANE: readOnlyControlPlane({ apps: { 'demo-app': { hosting: null, kind: 'server' } } }), ANTHROPIC_API_KEY: 'k', ...envExtra };
  const post = body => assessAnswer(new Request('https://dev.test/api/learn/assess', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), env);
  const rows = () => ['threads', 'messages', 'learn_grades'].map(table => sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n);
  return { env, post, rows };
}
const events = async response => (await response.text()).split('\n\n').filter(Boolean).map(event => [event.match(/^event: (.+)$/m)[1], JSON.parse(event.match(/^data: (.+)$/m)[1])]);
const body = (overrides = {}) => ({ app: 'canvas-0a1b2c3d', mode: 'challenge', prompt: 'Why does softmax use exp?', expects: ['exp makes every score positive', 'dividing by the sum makes them add to one'], answer: 'exp keeps them positive', ...overrides });

test('a grade is one Auto call carrying only today\'s instruction, streamed as chunk then done, and nothing is stored, on every app kind', async t => {
  for (const app of ['canvas-0a1b2c3d', 'repo-example', 'demo-app']) {
    const calls = recordFetch(t);
    const w = world(t);
    const response = await w.post(body({ app }));
    assert.equal(response.status, 200, app);
    assert.equal(response.headers.get('Content-Type'), 'text/event-stream');
    assert.deepEqual(await events(response), [['chunk', { text: 'VERDICT: good\nYou have it.' }], ['done', { ok: true }]], app);
    assert.equal(calls.length, 1);
    const [{ url, headers, body: sent }] = calls;
    assert.equal(url, 'https://api.anthropic.com/v1/messages');
    assert.equal(headers['anthropic-beta'], 'server-side-fallback-2026-07-01');
    assert.deepEqual(sent, { model: 'claude-opus-5', fallbacks: 'default', max_tokens: 2400, messages: [{ role: 'user', content: challengePrompt(body(), 'exp keeps them positive') }] });
    assert.deepEqual(w.rows(), [0, 0, 0], app);
    assert.deepEqual([w.env.DB.calls, w.env.RUNS.calls, w.env.CONTROL_PLANE.refused], [[], [], []], app);
  }
});

test('explain-back and a block with no key ideas keep today\'s instruction, fallback text included', async t => {
  const calls = recordFetch(t);
  const w = world(t);
  for (const expects of [[], undefined]) assert.equal((await w.post(body({ mode: 'explain_back', expects }))).status, 200);
  const expected = challengePrompt({ mode: 'explain_back', prompt: 'Why does softmax use exp?', expects: [] }, 'exp keeps them positive');
  assert.match(expected, /covers: the mechanism being asked about/);
  assert.deepEqual(calls.map(call => call.body.messages[0].content), [expected, expected]);
});

// grading-4, context-20: the answer has its own 1-4000 limit; the instruction
// around it no longer counts, so a long answer on a schema-max card is graded.
test('the answer is bounded on its own: 3500 characters on a schema-max card grade; 0 or 4001 are 400 with no call', async t => {
  const calls = recordFetch(t);
  const w = world(t);
  const card = { prompt: 'p'.repeat(600), expects: Array.from({ length: 6 }, (_, i) => `${i}`.repeat(200)) };
  assert.ok(challengePrompt(card, 'a'.repeat(3500)).length > 4000);
  assert.equal((await w.post(body({ ...card, answer: 'a'.repeat(3500) }))).status, 200);
  assert.equal(calls.length, 1);
  for (const [overrides, error] of [
    [{ answer: '' }, 'answer must be 1-4000 characters'], [{ answer: 'a'.repeat(4001) }, 'answer must be 1-4000 characters'],
    [{ mode: 'quiz' }, 'mode must be challenge or explain_back'], [{ prompt: 7 }, 'prompt must be a string of at most 4000 characters'],
    [{ expects: ['x'.repeat(301)] }, 'expects must be at most 8 ideas of at most 300 characters'],
  ]) {
    const response = await w.post(body(overrides));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error });
  }
  assert.equal(calls.length, 1);
});

test('subscription mode serves only its owner, through the bridge; other callers get 403 and no call', async t => {
  const calls = recordFetch(t, [{ billing: 'claude-subscription', content: [{ type: 'text', text: 'VERDICT: partial\nAlmost.' }], stop_reason: 'end_turn' }]);
  const w = world(t, { SUBSCRIPTION_ONLY: 'true', SUBSCRIPTION_OWNER_EMAIL: 'someone@else', SUBSCRIPTION_BRIDGE_URL: 'https://bridge.test', SUBSCRIPTION_BRIDGE_TOKEN: 't' });
  const refused = await w.post(body());
  assert.equal(refused.status, 403);
  assert.equal(calls.length, 0);
  w.env.SUBSCRIPTION_OWNER_EMAIL = 'owner@test';
  assert.deepEqual((await events(await w.post(body())))[0], ['chunk', { text: 'VERDICT: partial\nAlmost.' }]);
  assert.equal(new URL(calls[0].url).host, 'bridge.test');
});

test('a model failure, a cut answer or an empty reply ends in one error event; a thinking-only turn is replayed once', async t => {
  const w = world(t);
  for (const [reply, message] of [
    [new Response(JSON.stringify({ error: { message: 'overloaded' } }), { status: 529 }), /Grading unavailable \(model HTTP 529: overloaded\)/],
    [{ content: [{ type: 'text', text: 'VERDICT: go' }], stop_reason: 'max_tokens' }, /cut short/],
    [{ content: [], stop_reason: 'end_turn' }, /No verdict returned/],
  ]) {
    recordFetch(t, [reply]);
    const out = await events(await w.post(body()));
    assert.equal(out.length, 1);
    assert.equal(out[0][0], 'error');
    assert.match(out[0][1].error, message);
  }
  const thinking = { type: 'thinking', thinking: 'hmm', signature: 's' };
  const calls = recordFetch(t, [{ content: [thinking], stop_reason: 'end_turn' }, { content: [{ type: 'text', text: 'VERDICT: good\nYes.' }], stop_reason: 'end_turn' }]);
  assert.deepEqual((await events(await w.post(body())))[0], ['chunk', { text: 'VERDICT: good\nYes.' }]);
  assert.deepEqual(calls[1].body.messages.slice(1), [{ role: 'assistant', content: [thinking] }, { role: 'user', content: 'Continue with your final answer now, as plain text.' }]);
});

test('the diagnostic line names the grading task and never carries the answer', async t => {
  recordFetch(t);
  const w = world(t);
  const lines = [], log = console.log;
  console.log = line => lines.push(String(line));
  try { await (await w.post(body({ answer: 'a secret learner answer' }))).text(); } finally { console.log = log; }
  const diagnostic = lines.map(line => { try { return JSON.parse(line); } catch { return null; } }).find(line => line?.event === 'learn_model');
  assert.equal(diagnostic.task, 'grading');
  assert.equal(diagnostic.fallback, 'default');
  assert.equal(lines.some(line => line.includes('secret learner answer')), false);
});

// dev-worker.js cannot load under node (it imports built HTML), so its routing is pinned by source text.
test('only the dev worker routes /api/learn/assess, ahead of the live proxy; production small-cp has no such route', async () => {
  const worker = readFileSync(new URL('../../web/dev-worker.js', import.meta.url), 'utf8');
  const route = worker.indexOf("if (path === '/api/learn/assess') return assessAnswer(req, env);");
  assert.ok(route > 0 && route < worker.indexOf('return env.CONTROL_PLANE.fetch(req);'));
  assert.equal(readFileSync(new URL('../src/index.js', import.meta.url), 'utf8').includes('/api/learn/assess'), false);
});
