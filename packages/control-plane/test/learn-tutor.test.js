// Tutor v1 routes (docs/features/tutor-v1-locked-decisions.md §3, §4): the evaluation ladder
// JEV -> larger evaluator (only on JEV uncertain), and the one forced-tool planner call. Nothing is
// stored: evidence lives in the browser session.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { learnDb } from './learn-grade-fixture.js';
import { liveDb, liveRuns, readOnlyControlPlane } from './live-storage-spy.js';
import { tutorRoute, JEV_TIMEOUT_MS } from '../src/learn-tutor-routes.js';
import { tutorQuestions, evaluationFrom, TUTOR_TOOL } from '../src/agents/learn-tutor.js';
import { protocolFingerprint, GRADER_PROTOCOL_FINGERPRINT, JevError } from '../src/learn-grade-jev.js';

const SPEC = {
  answering: false,
  claims: [{ id: 'softmax/normalizes-to-one', concept: 'softmax', statement: 'Softmax exponentiates and divides by the sum.', ideas: ['each score is exponentiated', 'the weights add up to one'], misconceptions: [{ id: 'divides-raw-scores', check: 'says softmax divides the raw scores by their sum' }], drawn: 'the c21 card' }],
  gaps: [],
};
const answersOf = (values) => ({ answers: Object.fromEntries(Object.entries(values).map(([key, noul]) => [key, { type: 'noul', noul }])) });
const settledAnswers = { attempt: 0.95, c0_idea0: 0.9, c0_idea1: 0.92, c0_mis0: 0.05, c0_transfer: 0.9 };

function recordFetch(t, reply) {
  const calls = [], original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), body: JSON.parse(options.body) });
    return Response.json({ model: 'claude-opus-5', ...reply });
  };
  return calls;
}
function world(t, envExtra = {}) {
  const { sqlite, LEARN_DB } = learnDb(t);
  sqlite.exec("INSERT INTO canvases(org,name,owner_email,title) VALUES('team','canvas-0a1b2c3d','owner@test','Board')");
  const env = { LEARN_DB, DB: liveDb(), RUNS: liveRuns(), CONTROL_PLANE: readOnlyControlPlane({ apps: {} }), ANTHROPIC_API_KEY: 'k', TYPESAFE_API_KEY: 'jev', ...envExtra };
  const post = (path, body, deps) => tutorRoute(path, new Request(`https://dev.test${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), env, deps);
  return { env, post };
}

test('the Tutor has its own JEV question set; the grader protocol is untouched', async () => {
  assert.deepEqual(Object.keys(tutorQuestions(SPEC)), ['attempt', 'c0_idea0', 'c0_idea1', 'c0_mis0', 'c0_transfer']);
  assert.deepEqual(Object.keys(tutorQuestions({ ...SPEC, answering: true, gaps: [{ concept: 'softmax', statement: 's', claims: [] }] }))[0], 'non_attempt');
  assert.equal(await protocolFingerprint(), GRADER_PROTOCOL_FINGERPRINT);
  assert.equal(TUTOR_TOOL.name, 'tutor_response');
});

test('evaluationFrom: per-idea events, passes before negatives, transfer from its own check, unengaged claims untouched', () => {
  const { status, events } = evaluationFrom(SPEC, { attempt: 1, c0_idea0: 1, c0_idea1: 0, c0_mis0: 0, c0_transfer: 1 }, { yes: 0.7, no: 0.3 }, 'jev');
  assert.equal(status, 'settled');
  assert.deepEqual(events.map(event => [event.result, event.kind]), [['pass', 'demonstrated_in_transfer'], ['fail', null]]);
  assert.equal(evaluationFrom(SPEC, { attempt: 1, c0_idea0: 0, c0_idea1: 0, c0_mis0: 0, c0_transfer: 0 }, { yes: 0.7, no: 0.3 }, 'jev').events.length, 0);
  const question = evaluationFrom(SPEC, { attempt: 0, c0_idea0: 1, c0_idea1: 1, c0_mis0: 0, c0_transfer: 0 }, { yes: 0.7, no: 0.3 }, 'jev');
  assert.equal(question.events.length, 0, 'a question or a request is not an attempt');
  assert.equal(evaluationFrom(SPEC, { ...settledAnswers, c0_idea1: 0.5 }, { yes: 0.7, no: 0.3 }, 'jev').status, 'uncertain');
});

test('evaluate: a settled JEV answer ends the ladder - one batched 800 ms request, no retry, no model call', async t => {
  const calls = recordFetch(t, {});
  const w = world(t);
  const asked = [];
  const ask = async (env, request, options) => { asked.push({ request, options }); return { body: answersOf(settledAnswers) }; };
  const response = await w.post('/api/learn/tutor/evaluate', { app: 'canvas-0a1b2c3d', message: 'With scores 2, 1, 0 ...', spec: SPEC }, { ask });
  const result = await response.json();
  assert.equal(result.status, 'settled');
  assert.equal(result.evaluator, 'jev');
  assert.deepEqual(result.events.map(event => event.result), ['pass', 'pass']);
  assert.equal(asked.length, 1);
  assert.equal(asked[0].options.timeoutMs, JEV_TIMEOUT_MS);
  assert.equal(asked[0].options.transport, 'direct');
  await assert.rejects(asked[0].options.sleep(), /busy/, 'a 429 is not retried inside the budget');
  assert.equal(asked[0].request.state.learner_answer, 'With scores 2, 1, 0 ...');
  assert.equal(calls.length, 0);
  const { jev, larger } = result.telemetry;
  assert.deepEqual({ ...jev, ms: typeof jev.ms }, { called: true, ms: 'number', outcome: 'settled', claims: 1, ideas: 2, questions: 5, error: null });
  assert.deepEqual(larger, { called: false, ms: null, outcome: null, reason: null, requested_model: null, served_model: null, input_tokens: null, output_tokens: null, error: null });
});

test('evaluate: JEV uncertain on a low-consequence check -> no larger evaluator; its events stay unsettled (v2 Stage C)', async t => {
  const calls = recordFetch(t, {});
  const w = world(t);
  const ask = async () => ({ body: answersOf({ ...settledAnswers, c0_idea1: 0.55 }) });
  const result = await (await w.post('/api/learn/tutor/evaluate', { app: 'canvas-0a1b2c3d', message: 'kind of in the middle', spec: SPEC }, { ask })).json();
  assert.equal(result.evaluator, 'jev');
  assert.equal(result.status, 'uncertain');
  assert.deepEqual(result.escalation, { escalate: false, reason: 'low_consequence', uncertain: ['c0_idea1'] });
  assert.ok(result.events.every(event => event.settled === false));
  assert.equal(calls.length, 0);
});

test('evaluate: JEV uncertain on a contradiction -> the larger evaluator on Opus 5.5 (no fallback), structured, settles it', async t => {
  const calls = recordFetch(t, { model: 'claude-opus-5-5', usage: { input_tokens: 812, output_tokens: 64 }, content: [{ type: 'text', text: '{"attempt":"yes","c0_idea0":"yes","c0_idea1":"yes","c0_mis0":"no","c0_transfer":"no"}' }], stop_reason: 'end_turn' });
  const w = world(t);
  const ask = async () => ({ body: answersOf({ ...settledAnswers, c0_mis0: 0.55 }) });
  const result = await (await w.post('/api/learn/tutor/evaluate', { app: 'canvas-0a1b2c3d', message: 'kind of in the middle', spec: SPEC }, { ask })).json();
  assert.equal(result.evaluator, 'larger');
  assert.equal(result.status, 'settled');
  assert.deepEqual(result.events.map(event => [event.result, event.kind, event.evaluator]), [['pass', 'demonstrated_here', 'larger'], ['pass', 'demonstrated_here', 'larger']]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.tools, undefined, 'the evaluator task keeps no tools');
  assert.match(calls[0].body.messages[0].content, /Reply with only a JSON object/);
  assert.equal(calls[0].body.model, 'claude-opus-5-5');
  assert.equal('fallbacks' in calls[0].body, false, 'no silent fallback');
  assert.equal(calls[0].body.max_tokens, 2400);
  const { jev, larger } = result.telemetry;
  assert.equal(jev.outcome, 'uncertain');
  assert.deepEqual({ ...larger, ms: typeof larger.ms }, { called: true, ms: 'number', outcome: 'settled', reason: 'contradiction', requested_model: 'claude-opus-5-5', served_model: 'claude-opus-5-5', input_tokens: 812, output_tokens: 64, error: null });
});

test('evaluate: no JEV key, or a JEV failure, is an error - nothing settled, no model call', async t => {
  const calls = recordFetch(t, {});
  const w = world(t, { TYPESAFE_API_KEY: undefined, VERCEL_TYPESAFE_API_KEY: undefined });
  const result = await (await w.post('/api/learn/tutor/evaluate', { app: 'canvas-0a1b2c3d', message: 'x', spec: SPEC })).json();
  assert.equal(result.status, 'error');
  assert.deepEqual(result.events, []);
  assert.deepEqual(result.telemetry.jev, { called: false, ms: null, outcome: null, claims: 1, ideas: 2, questions: 0, error: 'Jev is not configured on this worker.' });
  const failing = world(t);
  const timedOut = await (await failing.post('/api/learn/tutor/evaluate', { app: 'canvas-0a1b2c3d', message: 'x', spec: SPEC }, { ask: async () => { throw new JevError('timeout', 'Jev timed out after 800 ms'); } })).json();
  assert.equal(timedOut.status, 'error');
  assert.equal(timedOut.telemetry.jev.outcome, 'timeout');
  assert.equal(timedOut.telemetry.larger.called, false);
  const broken = await (await failing.post('/api/learn/tutor/evaluate', { app: 'canvas-0a1b2c3d', message: 'x', spec: SPEC }, { ask: async () => { throw new JevError('http', 'Jev 500: request failed', 500); } })).json();
  assert.deepEqual([broken.telemetry.jev.outcome, broken.telemetry.jev.error], ['error', 'Jev 500: request failed']);
  assert.equal(calls.length, 0);
});

test('evaluate: the larger evaluator timing out is telemetry outcome timeout; JEV events are kept', async t => {
  const bodies = [], original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, options) => { bodies.push(JSON.parse(options.body)); return new Promise(() => {}); };
  const w = world(t);
  const ask = async () => ({ body: answersOf({ ...settledAnswers, c0_mis0: 0.55 }) });
  const result = await (await w.post('/api/learn/tutor/evaluate', { app: 'canvas-0a1b2c3d', message: 'x', spec: SPEC }, { ask, timeoutMs: 5 })).json();
  assert.equal(result.evaluator, 'jev');
  assert.equal(result.larger_error, 'The evaluator timed out');
  assert.deepEqual([result.telemetry.larger.outcome, result.telemetry.larger.reason, result.telemetry.larger.served_model], ['timeout', 'contradiction', null]);
  assert.equal(bodies.length, 1);
});

test('evaluate: the larger evaluator failing keeps JEV\'s unsettled events', async t => {
  recordFetch(t, { content: [{ type: 'text', text: 'no json here' }], stop_reason: 'end_turn' });
  const w = world(t);
  const ask = async () => ({ body: answersOf({ ...settledAnswers, c0_mis0: 0.55 }) });
  const result = await (await w.post('/api/learn/tutor/evaluate', { app: 'canvas-0a1b2c3d', message: 'x', spec: SPEC }, { ask })).json();
  assert.equal(result.evaluator, 'jev');
  assert.equal(result.status, 'uncertain');
  assert.ok(result.events.every(event => event.settled === false));
  assert.match(result.larger_error, /no JSON/);
});

test('plan: one forced tutor_response call on Opus 5.5 (no fallback); its input is the TutorResponse, plus telemetry', async t => {
  const turn = { strategy: 'none', move: 'answer', reason: 'r', actions: [{ type: 'respond_text', text: 'Hi.' }] };
  const calls = recordFetch(t, { model: 'claude-opus-5-5', usage: { input_tokens: 3100, output_tokens: 120 }, content: [{ type: 'tool_use', name: 'tutor_response', input: turn }], stop_reason: 'tool_use' });
  const w = world(t);
  const response = await w.post('/api/learn/tutor/plan', { app: 'canvas-0a1b2c3d', context: { turn: { raw_user_message: 'hi' } } });
  const { telemetry, ...body } = await response.json();
  assert.deepEqual(body, turn);
  assert.deepEqual({ ...telemetry, ms: typeof telemetry.ms }, { ms: 'number', requested_model: 'claude-opus-5-5', served_model: 'claude-opus-5-5', input_tokens: 3100, output_tokens: 120, stop_reason: 'tool_use', outcome: 'ok' });
  assert.equal(calls[0].body.model, 'claude-opus-5-5');
  assert.equal('fallbacks' in calls[0].body, false, 'no silent fallback');
  assert.deepEqual(calls[0].body.tool_choice, { type: 'auto' });
  assert.match(calls[0].body.system, /authored/i);
});

test('plan: switched-on canvas context documents come first, then the context (canvas-context-docs.md)', async t => {
  const turn = { strategy: 'none', move: 'answer', reason: 'r', actions: [{ type: 'respond_text', text: 'Hi.' }] };
  const calls = recordFetch(t, { model: 'claude-opus-5-5', usage: {}, content: [{ type: 'tool_use', name: 'tutor_response', input: turn }], stop_reason: 'tool_use' });
  const w = world(t);
  const doc = { type: 'document', title: 'notes.md', source: { type: 'text', media_type: 'text/plain', data: 'softmax' } };
  await w.post('/api/learn/tutor/plan', { app: 'canvas-0a1b2c3d', context: { turn: { raw_user_message: 'hi' } } }, { documents: async () => [doc] });
  const content = calls[0].body.messages[0].content;
  assert.deepEqual(content[0], doc);
  assert.match(content.at(-1).text, /^Compose this turn/);
});

test('plan: no usable tutor_response is a 502 with telemetry outcome invalid; a different served model shows', async t => {
  recordFetch(t, { model: 'claude-opus-5', usage: { input_tokens: 3000, output_tokens: 9 }, content: [{ type: 'text', text: 'hello' }], stop_reason: 'max_tokens' });
  const w = world(t);
  const response = await w.post('/api/learn/tutor/plan', { app: 'canvas-0a1b2c3d', context: { turn: { raw_user_message: 'hi' } } });
  assert.equal(response.status, 502);
  const { error, telemetry } = await response.json();
  assert.match(error, /no turn/);
  assert.deepEqual({ ...telemetry, ms: typeof telemetry.ms }, { ms: 'number', requested_model: 'claude-opus-5-5', served_model: 'claude-opus-5', input_tokens: 3000, output_tokens: 9, stop_reason: 'max_tokens', outcome: 'invalid' });
});

test('the routes refuse bad input and apps the learner cannot reach', async t => {
  recordFetch(t, {});
  const w = world(t);
  assert.equal((await w.post('/api/learn/tutor/evaluate', { app: 'canvas-0a1b2c3d', message: '', spec: SPEC })).status, 400);
  assert.equal((await w.post('/api/learn/tutor/plan', { app: 'canvas-0a1b2c3d', context: 'x' })).status, 400);
  assert.ok((await w.post('/api/learn/tutor/plan', { app: 'canvas-ffffffff', context: {} })).status >= 400);
  assert.equal(await tutorRoute('/api/learn/other', new Request('https://dev.test/api/learn/other'), w.env), null);
});
