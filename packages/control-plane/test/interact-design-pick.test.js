// Brief 13 section 1: the pick. A stubbed fetch only: no JEV call, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INTERACT_FAMILIES, verticalThrow } from '../src/interact-families.js';
import { NONE_CRITERION, PICK_THRESHOLD, pickFamily, pickQuestions } from '../src/interact-design-pick.js';

const ENV = { TYPESAFE_API_KEY: 'k-test' }, INPUT = { request: 'Why does a ball thrown straight up slow down?', depth: 'balanced' };
const answer = (choice, confidence, probabilities = { [choice]: confidence }) => async () => Response.json({ answers: { family: { choice, confidence, probabilities } } });
const CURVE = { id: 'curve-sliders', pickCriterion: 'One quantity as a function of another, drawn as a curve whose shape a few parameters change; no motion over time.' };
test.beforeEach(t => { const log = console.log; console.log = () => {}; t.after(() => { console.log = log; }); });

test('the registry has both families and the question has one criterion per family plus none', () => {
  assert.deepEqual(INTERACT_FAMILIES.map(f => f.id), ['vertical-throw', 'curve-sliders']);
  assert.equal(verticalThrow.module.family.id, 'vertical-throw');
  assert.deepEqual(pickQuestions().family.criteria, { 'vertical-throw': verticalThrow.pickCriterion, 'curve-sliders': CURVE.pickCriterion, none: NONE_CRITERION });
});

test('a second family is one more entry: a choice is added, no code changes', async () => {
  const two = [verticalThrow, CURVE];
  assert.deepEqual(Object.keys(pickQuestions(two).family.criteria), ['vertical-throw', 'curve-sliders', 'none']);
  const out = await pickFamily(ENV, INPUT, { families: two, fetchImpl: answer('curve-sliders', 0.9) });
  assert.equal(out.family, 'curve-sliders');
  const one = await pickFamily(ENV, INPUT, { families: [verticalThrow], fetchImpl: answer('curve-sliders', 0.9) });
  assert.equal(one.family, null); assert.equal(one.reason, 'unknown_choice');
});

test('the request: the planner transport, model, key name, state and questions', async () => {
  let seen;
  await pickFamily(ENV, INPUT, { fetchImpl: async (url, init) => { seen = { url, init }; return answer('vertical-throw', 0.9)(); } });
  assert.equal(seen.url, 'https://api.typesafe.ai/v1/systemone'); assert.equal(seen.init.method, 'POST');
  assert.equal(seen.init.headers.Authorization, 'Bearer k-test'); assert.ok(seen.init.signal);
  const body = JSON.parse(seen.init.body);
  assert.equal(body.model, 'jev-latest'); assert.deepEqual(body.state, INPUT); assert.deepEqual(body.questions, pickQuestions());
});

test('a fit: the chosen family with confidence at or above the threshold', async () => {
  const out = await pickFamily(ENV, INPUT, { fetchImpl: answer('vertical-throw', 0.93, { 'vertical-throw': 0.93, none: 0.07 }) });
  assert.deepEqual([out.family, out.confidence, out.reason], ['vertical-throw', 0.93, 'fit']);
  assert.deepEqual(out.probabilities, { 'vertical-throw': 0.93, none: 0.07 }); assert.equal(typeof out.ms, 'number');
});

test('the threshold boundary: one family uses 0.7, two use 0.9, and the threshold is an option', async () => {
  assert.equal(PICK_THRESHOLD, 0.7);
  assert.equal((await pickFamily(ENV, INPUT, { families: [verticalThrow], fetchImpl: answer('vertical-throw', 0.7) })).family, 'vertical-throw');
  assert.equal((await pickFamily(ENV, INPUT, { fetchImpl: answer('curve-sliders', 0.9) })).family, 'curve-sliders');
  assert.equal((await pickFamily(ENV, INPUT, { fetchImpl: answer('curve-sliders', 0.89) })).reason, 'below_threshold');
  const below = await pickFamily(ENV, INPUT, { fetchImpl: answer('vertical-throw', 0.69) });
  assert.deepEqual([below.family, below.reason, below.confidence], [null, 'below_threshold', 0.69]);
  assert.equal((await pickFamily(ENV, INPUT, { threshold: 0.5, fetchImpl: answer('vertical-throw', 0.69) })).family, 'vertical-throw');
});

test('none is a gap, however confident', async () => {
  const out = await pickFamily(ENV, INPUT, { fetchImpl: answer('none', 0.95) });
  assert.deepEqual([out.family, out.reason, out.confidence], [null, 'none', 0.95]);
});

test('a failure is a gap, logged as interact_pick_failed, never thrown', async () => {
  const lines = []; console.log = line => lines.push(line);
  const http = await pickFamily(ENV, INPUT, { fetchImpl: async () => new Response('no', { status: 503 }) });
  assert.deepEqual([http.family, http.reason, http.confidence], [null, 'http 503', null]);
  const bad = await pickFamily(ENV, INPUT, { fetchImpl: async () => Response.json({ answers: {} }) });
  assert.equal(bad.reason, 'incomplete answers');
  const thrown = await pickFamily(ENV, INPUT, { fetchImpl: async () => { throw new Error('network down'); } });
  assert.equal(thrown.reason, 'network down');
  const slow = await pickFamily(ENV, INPUT, { timeoutMs: 20, fetchImpl: (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason))) });
  assert.deepEqual([slow.family, slow.reason], [null, 'timeout']);
  assert.equal(lines.map(l => JSON.parse(l)).filter(l => l.event === 'interact_pick_failed').length, 4);
});
