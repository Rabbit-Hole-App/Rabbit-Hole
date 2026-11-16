// The scoped router's learn_option scope (docs/spec intake-run-or-learn section 3): routes come from the body, are validated and capped,
// and the answer carries the chosen route id plus the top two ranked ids. The JEV call is a stub; nothing reaches a provider.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chatRouteFetch, decideCodebaseUse, decideScoped } from '../src/chat-capability-route.js';
import { JevError } from '../src/learn-grade-jev.js';
import { LEARN_SCOPE, USE_SCOPE } from '../../web/src/codebase-use-route.js';

const untouchable = new Proxy({}, { get: (_, key) => { throw new Error(`touched ${String(key)}`); } });
const ENV = { INLINE_DECISION_KEY: 'k'.repeat(40), VERCEL_TYPESAFE_API_KEY: 'test-only', LEARN_DB: untouchable, DB: untouchable, LEARN_VIDEOS: untouchable };
const ROUTES = { 'learn:attention': { intent: 'how tokens attend' }, 'learn:tokenizer': { intent: 'how text becomes ids' }, 'cannot:serving': { intent: 'the learner asks about serving, which this repository does not have' } };
const jev = (choice, probabilities, confidence = 0.9) => ({ body: { model: 'jev-1.13.0', answers: { route: { type: 'choice', choice, confidence, probabilities } } }, ms: 40, model: 'jev-1.13.0', inputTokens: 600, cost: 0.0004 });
const counted = reply => { const ask = async (...args) => { ask.calls.push(args); if (reply instanceof Error) throw reply; return reply; }; ask.calls = []; return ask; };
const decide = (ask, over = {}) => decideScoped(ENV, { requestId: 'req-00000001', text: 'how do tokens look back', scope: LEARN_SCOPE, routes: ROUTES, ...over }, { ask });

test('learn_option: an above-threshold learn id is chosen, with route { scope, choice, confidence } and the top two ranked ids', async () => {
  const ask = counted(jev('learn:attention', { 'learn:attention': 0.9, 'learn:tokenizer': 0.07, 'cannot:serving': 0.02, none: 0.01 }));
  const out = await decide(ask);
  assert.deepEqual([out.use, out.via, out.route, out.ranked], ['learn:attention', 'jev', { scope: LEARN_SCOPE, choice: 'learn:attention', confidence: 0.9 }, ['learn:attention', 'learn:tokenizer']]);
  const criteria = ask.calls[0][1].questions.route.criteria;
  assert.deepEqual(Object.keys(criteria), ['learn:attention', 'learn:tokenizer', 'cannot:serving', 'several', 'none']);
  assert.equal(criteria['learn:tokenizer'], 'how text becomes ids', 'the body\'s own intents, no table of ours');
});

test('learn_option: a cannot id is chosen like any other; below threshold, several and none choose nothing', async () => {
  assert.equal((await decide(counted(jev('cannot:serving', { 'cannot:serving': 0.95 })))).use, 'cannot:serving');
  const low = await decide(counted(jev('learn:tokenizer', { 'learn:tokenizer': 0.4, 'learn:attention': 0.35, several: 0.2 })));
  assert.deepEqual([low.use, low.via, low.route, low.ranked], [null, 'jev-low', null, ['learn:tokenizer', 'learn:attention']]);
  const several = await decide(counted(jev('several', { several: 0.8, 'learn:attention': 0.1, 'learn:tokenizer': 0.1 })));
  assert.deepEqual([several.use, several.via, several.ranked.length], [null, 'jev-several', 2]);
  assert.equal((await decide(counted(jev('none', { none: 0.9 })))).via, 'jev-none');
});

test('learn_option: a failure, a timeout or no transport answers with nothing chosen', async () => {
  for (const error of [new JevError('timeout', 'slow'), new JevError('unavailable', 'down'), new Error('garbled')]) {
    const out = await decide(counted(error));
    assert.deepEqual([out.use, out.via, out.retryable, out.ranked, out.route], [null, 'fallback', true, [], null], error.message);
  }
  assert.equal((await decide(counted(new JevError('timeout', 'slow')))).code, 'timeout');
  const nothing = await decideScoped({ ...ENV, VERCEL_TYPESAFE_API_KEY: undefined, INLINE_DECISION_KEY: undefined }, { requestId: 'req-00000001', text: 'x', scope: LEARN_SCOPE, routes: ROUTES }, { ask: counted(null) });
  assert.deepEqual([nothing.use, nothing.via, nothing.code], [null, 'fallback', 'unavailable']);
});

test('the 14-use scope is unchanged: decideCodebaseUse still answers { use, route: { use, confidence } }', async () => {
  const out = await decideCodebaseUse(ENV, { requestId: 'req-00000002', text: 'I just want to see it run' }, { ask: counted(jev('use_codebase', { use_codebase: 0.96 })) });
  assert.deepEqual([out.use, out.via, out.route], ['use_codebase', 'jev', { use: 'use_codebase', confidence: 0.9 }]);
  const ask = counted(jev('use_codebase', { use_codebase: 0.96 }));
  await decideCodebaseUse(ENV, { requestId: 'req-00000002', text: 'x' }, { ask });
  assert.equal(Object.keys(ask.calls[0][1].questions.route.criteria).length, 16, 'the 14 uses plus several and none');
});

test('POST /api/learn/chat/route with scope learn_option: validated routes are decided, a bad shape is a 400 before any call', async () => {
  const authorize = async () => ({ email: 'owner@example.test', org: 'o', kind: 'owner' });
  const post = body => new Request('https://dev.test/api/learn/chat/route', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const base = { request_id: 'req-00000001', app: 'canvas-0a1b2c3d', text: 'how do tokens look back', mode: 'auto', scope: LEARN_SCOPE, routes: ROUTES };
  const ask = counted(jev('learn:attention', { 'learn:attention': 0.9 }));
  const res = await chatRouteFetch(post(base), ENV, { authorize, ask });
  assert.equal(res.status, 200);
  const out = await res.json();
  assert.deepEqual([out.use, out.route.scope, out.ranked], ['learn:attention', LEARN_SCOPE, ['learn:attention']]);
  const nine = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`learn:o${i}`, { intent: 'idea' }]));
  await chatRouteFetch(post({ ...base, routes: nine }), ENV, { authorize, ask });
  assert.equal(Object.keys(ask.calls[1][1].questions.route.criteria).length, 10, 'capped at 8 entries (plus several and none)');
  assert.equal(ask.calls.length, 2);
  for (const routes of [undefined, null, {}, [], { 'use_codebase': { intent: 'x' } }, { 'learn:Bad': { intent: 'x' } }, { 'learn:a': { intent: 'x'.repeat(301) } }, { 'learn:a': 'x' }]) {
    assert.equal((await chatRouteFetch(post({ ...base, routes }), ENV, { authorize, ask })).status, 400, JSON.stringify(routes));
  }
  assert.equal(ask.calls.length, 2, 'a bad shape never reaches the router');
  const use = await chatRouteFetch(post({ ...base, scope: USE_SCOPE, routes: undefined }), ENV, { authorize, ask: counted(jev('use_codebase', { use_codebase: 0.96 })) });
  assert.equal((await use.json()).use, 'use_codebase');
});
