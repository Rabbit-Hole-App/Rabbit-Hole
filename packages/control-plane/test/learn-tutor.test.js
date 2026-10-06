// Tutor v1 routes (docs/features/tutor-v1-locked-decisions.md §3, §4): the evaluation ladder
// JEV -> larger evaluator (only on JEV uncertain), and the one forced-tool planner call. Nothing is
// stored: evidence lives in the browser session.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { learnDb } from './learn-grade-fixture.js';
import { liveDb, liveRuns, readOnlyControlPlane } from './live-storage-spy.js';
import { tutorRoute, JEV_TIMEOUT_MS, fastPlanProblem, plannerTier } from '../src/learn-tutor-routes.js';
import { tutorQuestions, evaluationFrom, TUTOR_TOOL, NEXT_STEP_SYSTEM, PLANNER_SYSTEM, plannerRequest } from '../src/agents/learn-tutor.js';
import { protocolFingerprint, GRADER_PROTOCOL_FINGERPRINT, JevError } from '../src/learn-grade-jev.js';
import { promptVersion } from '../src/learn-models.js';

const SPEC = {
  answering: false,
  claims: [{ id: 'softmax/normalizes-to-one', concept: 'softmax', statement: 'Softmax exponentiates and divides by the sum.', ideas: ['each score is exponentiated', 'the weights add up to one'], misconceptions: [{ id: 'divides-raw-scores', check: 'says softmax divides the raw scores by their sum' }], drawn: 'the c21 card' }],
  gaps: [],
};
const answersOf = (values) => ({ answers: Object.fromEntries(Object.entries(values).map(([key, noul]) => [key, { type: 'noul', noul }])) });
const settledAnswers = { attempt: 0.95, c0_idea0: 0.9, c0_contra0: 0.05, c0_idea1: 0.92, c0_contra1: 0.05, c0_mis0: 0.05, c0_transfer: 0.9 };

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
  assert.deepEqual(Object.keys(tutorQuestions(SPEC)), ['attempt', 'c0_idea0', 'c0_contra0', 'c0_idea1', 'c0_contra1', 'c0_mis0', 'c0_transfer']);
  assert.deepEqual(Object.keys(tutorQuestions({ ...SPEC, answering: true, gaps: [{ concept: 'softmax', statement: 's', claims: [] }] }))[0], 'non_attempt');
  assert.equal(await protocolFingerprint(), GRADER_PROTOCOL_FINGERPRINT);
  assert.equal(TUTOR_TOOL.name, 'tutor_response');
});

test('evaluationFrom: per-idea events, passes before negatives, transfer from its own check, unengaged claims untouched', () => {
  const { status, events } = evaluationFrom(SPEC, { attempt: 1, c0_idea0: 1, c0_contra0: 0, c0_idea1: 0, c0_contra1: 1, c0_mis0: 0, c0_transfer: 1 }, { yes: 0.7, no: 0.3 }, 'jev');
  assert.equal(status, 'settled');
  assert.deepEqual(events.map(event => [event.result, event.kind]), [['pass', 'demonstrated_in_transfer'], ['fail', null]]);
  assert.equal(evaluationFrom(SPEC, { attempt: 1, c0_idea0: 0, c0_idea1: 0, c0_mis0: 0, c0_transfer: 0 }, { yes: 0.7, no: 0.3 }, 'jev').events.length, 0);
  const question = evaluationFrom(SPEC, { attempt: 0, c0_idea0: 1, c0_idea1: 1, c0_mis0: 0, c0_transfer: 0 }, { yes: 0.7, no: 0.3 }, 'jev');
  assert.equal(question.events.length, 0, 'a question or a request is not an attempt');
  assert.equal(evaluationFrom(SPEC, { ...settledAnswers, c0_idea1: 0.5 }, { yes: 0.7, no: 0.3 }, 'jev').status, 'uncertain');
});

// Decision 7: an idea fails only when the learner contradicts it; an untouched idea gets no event.
const T = { yes: 0.7, no: 0.3 };
const OWNER = { answering: false, gaps: [], claims: [{ id: 'softmax/x', concept: 'softmax', statement: 's', ideas: ['softmax normalizes scores', 'outputs sum to one'], misconceptions: [{ id: 'divides-raw-scores', check: 'x' }], drawn: 'd' }] };
const ownerAnswers = extra => ({ attempt: 1, c0_idea0: 1, c0_contra0: 0, c0_idea1: 0, c0_contra1: 0, c0_mis0: 0, c0_transfer: 0, ...extra });
const results = events => events.map(event => [event.result, event.idea]);

test('evaluationFrom (D7): "Softmax turns the scores into probabilities." -> a pass on idea 0, no fail on the untouched idea 1', () => {
  assert.deepEqual(results(evaluationFrom(OWNER, ownerAnswers(), T, 'jev').events), [['pass', 0]]);
});

test('evaluationFrom (D7): contradicting idea 1 -> pass idea 0 and fail idea 1', () => {
  assert.deepEqual(results(evaluationFrom(OWNER, ownerAnswers({ c0_contra1: 1 }), T, 'jev').events), [['pass', 0], ['fail', 1]]);
  assert.deepEqual(results(evaluationFrom(OWNER, ownerAnswers({ c0_idea0: 0, c0_contra1: 1 }), T, 'jev').events), [['fail', 1]], 'a confident contradiction alone engages the claim');
  assert.deepEqual(evaluationFrom(OWNER, ownerAnswers({ c0_contra1: 0.5 }), T, 'jev').events.map(event => [event.result, event.settled]), [['pass', false]], 'an unsure contradiction is no fail');
});

test('evaluationFrom (D7): answering a tutor question while touching one idea fails nothing; an empty answer is still a non-attempt', () => {
  const answering = { ...OWNER, answering: true, question: 'What does softmax do to the scores?' };
  const { attempt, ...rest } = ownerAnswers({ c0_idea0: 0 });
  assert.deepEqual(evaluationFrom(answering, { non_attempt: 0, ...rest }, T, 'jev').events, [], 'engaged by the question, but nothing stated or contradicted');
  const { attempt: _, ...one } = ownerAnswers();
  assert.deepEqual(results(evaluationFrom(answering, { non_attempt: 0, ...one }, T, 'jev').events), [['pass', 0]]);
  assert.deepEqual(results(evaluationFrom(answering, { non_attempt: 1, ...rest }, T, 'jev').events), [['non_attempt', undefined]]);
});

test('evaluationFrom (D7): a misconception-only message keeps its misconception event and fails no idea', () => {
  const { events } = evaluationFrom(OWNER, ownerAnswers({ c0_idea0: 0, c0_mis0: 1 }), T, 'jev');
  assert.deepEqual(events.map(event => [event.result, event.misconception_id]), [['misconception', 'divides-raw-scores']]);
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
  assert.deepEqual({ ...jev, ms: typeof jev.ms }, { called: true, ms: 'number', outcome: 'settled', claims: 1, ideas: 2, questions: 7, error: null });
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
  const calls = recordFetch(t, { model: 'claude-opus-5-5', usage: { input_tokens: 812, output_tokens: 64 }, content: [{ type: 'text', text: '{"attempt":"yes","c0_idea0":"yes","c0_contra0":"no","c0_idea1":"yes","c0_contra1":"no","c0_mis0":"no","c0_transfer":"no"}' }], stop_reason: 'end_turn' });
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
  const w = world(t, { TUTOR_PLANNER_FAST_MODEL: 'off', TUTOR_PLANNER_CACHE: 'off' }); // the Opus-only call shape (Baseline A; F opts out)
  const response = await w.post('/api/learn/tutor/plan', { app: 'canvas-0a1b2c3d', context: { turn: { raw_user_message: 'hi' } } });
  const { telemetry, ...body } = await response.json();
  assert.deepEqual(body, turn);
  // Before Professor Next Steps Task 6: { ms: 'number', requested_model: 'claude-opus-5-5', effort: null, served_model: 'claude-opus-5-5',
  // input_tokens: 3100, output_tokens: 120, stop_reason: 'tool_use', outcome: 'ok' }. Task 6 (TutorDecisionEvent versions) adds
  // prompt_version (the system and tool sent) and cost_usd (Opus 5.5, 3100 in and 120 out: $0.0148).
  assert.match(telemetry.prompt_version, /^[0-9a-f]{12}$/);
  assert.equal(telemetry.prompt_version, await promptVersion(calls[0].body.system, calls[0].body.tools));
  assert.deepEqual({ ...telemetry, ms: typeof telemetry.ms }, { ms: 'number', requested_model: 'claude-opus-5-5', effort: null, served_model: 'claude-opus-5-5', input_tokens: 3100, output_tokens: 120, stop_reason: 'tool_use', outcome: 'ok', prompt_version: telemetry.prompt_version, cost_usd: 0.0148 });
  assert.equal(calls[0].body.model, 'claude-opus-5-5');
  assert.equal('fallbacks' in calls[0].body, false, 'no silent fallback');
  assert.deepEqual(calls[0].body.tool_choice, { type: 'auto' });
  assert.match(calls[0].body.system, /authored/i);
  assert.equal('output_config' in calls[0].body, false, 'no effort set: the model default (Baseline A)');
  // Decision 4 (constraint-first): the fields that can cancel a question come before the actions.
  assert.deepEqual(Object.keys(TUTOR_TOOL.input_schema.properties).slice(0, 5), ['constraints_add', 'constraints_remove', 'explicit_request', 'strategy', 'actions'], 'control fields, then actions');
  assert.deepEqual(TUTOR_TOOL.input_schema.required, ['constraints_add', 'strategy', 'actions']);
  // Voice Mode (docs/features/voice-tutor-mvp.md §1): one line, keyed on the v2 learner_intent, read only on voice turns.
  assert.equal(calls[0].body.system.split('\n').filter(line => /input_modality/.test(line)).length, 1);
  assert.match(calls[0].body.system, /When context\.learner_intent\.input_modality is "voice", respond_text is spoken aloud: at most two short sentences of plain speech, with no markdown, code or equations read out; show cards rather than narrate them; always speak English, whatever language the transcript seems to be in\./);
});

test('plan: TUTOR_PLANNER_EFFORT sets output_config.effort; an unknown value is ignored (v2 checkpoint G)', async t => {
  const turn = { strategy: 'none', actions: [{ type: 'respond_text', text: 'Hi.' }] };
  const calls = recordFetch(t, { model: 'claude-opus-5-5', usage: {}, content: [{ type: 'tool_use', name: 'tutor_response', input: turn }], stop_reason: 'tool_use' });
  const low = await (await world(t, { TUTOR_PLANNER_EFFORT: 'low' }).post('/api/learn/tutor/plan', { app: 'canvas-0a1b2c3d', context: { turn: {} } })).json();
  assert.deepEqual(calls[0].body.output_config, { effort: 'low' });
  assert.equal(low.telemetry.effort, 'low');
  await world(t, { TUTOR_PLANNER_EFFORT: 'turbo' }).post('/api/learn/tutor/plan', { app: 'canvas-0a1b2c3d', context: { turn: {} } });
  assert.equal('output_config' in calls[1].body, false);
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
  const w = world(t, { TUTOR_PLANNER_FAST_MODEL: 'off', TUTOR_PLANNER_CACHE: 'off' });
  const response = await w.post('/api/learn/tutor/plan', { app: 'canvas-0a1b2c3d', context: { turn: { raw_user_message: 'hi' } } });
  assert.equal(response.status, 502);
  const { error, telemetry } = await response.json();
  assert.match(error, /no turn/);
  // Before Task 6: { ms: 'number', requested_model: 'claude-opus-5-5', effort: null, served_model: 'claude-opus-5', input_tokens: 3000,
  // output_tokens: 9, stop_reason: 'max_tokens', outcome: 'invalid' }. Task 6 adds prompt_version and cost_usd, priced at the
  // requested claude-opus-5-5 (3000 in, 9 out: $0.01218); a failed call's telemetry carries both too.
  assert.match(telemetry.prompt_version, /^[0-9a-f]{12}$/);
  assert.deepEqual({ ...telemetry, ms: typeof telemetry.ms }, { ms: 'number', requested_model: 'claude-opus-5-5', effort: null, served_model: 'claude-opus-5', input_tokens: 3000, output_tokens: 9, stop_reason: 'max_tokens', outcome: 'invalid', prompt_version: telemetry.prompt_version, cost_usd: 0.01218 });
});

// TutorDecisionEvent versions (contract §3.1, Ruling T6): prompt_version hashes every system block and the tool actually sent.
test('plan: prompt_version - a hook turn counts its uncached NEXT_STEP_SYSTEM block; cache and stream settings never change it', async t => {
  const turn = { strategy: 'none', actions: [{ type: 'respond_text', text: 'Hi.' }] };
  const calls = recordFetch(t, { model: 'claude-opus-5-5', usage: { input_tokens: 10, output_tokens: 2 }, content: [{ type: 'tool_use', name: 'tutor_response', input: turn }], stop_reason: 'tool_use' });
  const version = async (env, context) => (await (await world(t, { TUTOR_PLANNER_FAST_MODEL: 'off', ...env }).post('/api/learn/tutor/plan', { app: 'canvas-0a1b2c3d', context })).json()).telemetry.prompt_version;
  const typed = { learner_intent: { kind: 'question' } }, hook = { learner_intent: { kind: 'next_step' } };
  const cachedTyped = await version({}, typed), cachedHook = await version({}, hook), plainHook = await version({ TUTOR_PLANNER_CACHE: 'off' }, hook);
  assert.deepEqual(calls[1].body.system.map(block => block.text), [PLANNER_SYSTEM, NEXT_STEP_SYSTEM], 'the hook turn sent two system blocks');
  assert.equal(cachedHook, await promptVersion(calls[1].body.system, calls[1].body.tools));
  assert.notEqual(cachedHook, cachedTyped);
  assert.equal(plainHook, cachedHook, 'one string or two blocks of the same text: the same version');
  const streamed = plannerRequest(hook, 100, [], { stream: true, cache: true });
  assert.equal(await promptVersion(streamed.system, streamed.tools), cachedHook);
});

test('the routes refuse bad input and apps the learner cannot reach', async t => {
  recordFetch(t, {});
  const w = world(t);
  assert.equal((await w.post('/api/learn/tutor/evaluate', { app: 'canvas-0a1b2c3d', message: '', spec: SPEC })).status, 400);
  assert.equal((await w.post('/api/learn/tutor/plan', { app: 'canvas-0a1b2c3d', context: 'x' })).status, 400);
  assert.ok((await w.post('/api/learn/tutor/plan', { app: 'canvas-ffffffff', context: {} })).status >= 400);
  assert.equal(await tutorRoute('/api/learn/other', new Request('https://dev.test/api/learn/other'), w.env), null);
});

// v2 checkpoint H: the tiered planner.
function replies(t, list) {
  const calls = [], original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, options = {}) => {
    const body = JSON.parse(options.body);
    calls.push(body);
    const input = list[calls.length - 1];
    return Response.json({ model: body.model, usage: {}, content: [{ type: 'tool_use', name: 'tutor_response', input }], stop_reason: 'tool_use' });
  };
  return calls;
}
const routine = { learner_intent: { kind: 'question' }, route: { row: 'not_yet_observed' }, allowed_actions: ['respond_text', 'ask_question', 'show_authored_card', 'suggest_depth'] };
const answer = { strategy: 'none', actions: [{ type: 'respond_text', text: 'Every layer uses the same mask.' }] };

test('plannerTier: routine questions, requests, slashes and openings on fixed-move rows go fast; the rest stay on Opus', () => {
  assert.equal(plannerTier(routine).tier, 'fast');
  assert.equal(plannerTier({ learner_intent: { kind: 'slash' }, route: { row: 'slash' } }).tier, 'fast');
  assert.equal(plannerTier({ learner_intent: { kind: 'question' }, route: { row: 'misconception' } }).tier, 'opus');
  assert.equal(plannerTier({ learner_intent: { kind: 'question' }, route: { row: 'uncertain' } }).tier, 'opus');
  assert.equal(plannerTier({ learner_intent: { kind: 'explanation' }, route: { row: 'understood' } }).tier, 'opus');
  assert.equal(plannerTier({ learner_intent: { kind: 'returned' }, route: { row: 'returned' } }).tier, 'opus');
});

test('plan: with TUTOR_PLANNER_FAST_MODEL a routine turn is planned by the fast model with the same prompt and tool', async t => {
  const calls = replies(t, [answer]);
  const body = await (await world(t, { TUTOR_PLANNER_FAST_MODEL: 'claude-haiku-4-5-20251001', TUTOR_PLANNER_CACHE: 'off' }).post('/api/learn/tutor/plan', { app: 'canvas-0a1b2c3d', context: routine })).json();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, 'claude-haiku-4-5-20251001');
  assert.equal(calls[0].tools[0].name, 'tutor_response');
  assert.match(calls[0].system, /router has already chosen/);
  assert.equal('output_config' in calls[0], false, 'no fast effort set');
  assert.deepEqual([body.telemetry.tier, body.telemetry.escalated, body.telemetry.requested_model], ['fast', null, 'claude-haiku-4-5-20251001']);
});

test('plan: an unusable fast plan is re-planned on Opus 5.5; a non-routine turn goes straight to Opus', async t => {
  const calls = replies(t, [{ strategy: 'none', actions: [{ type: 'open_dive', concept: 'softmax' }] }, answer]);
  const w = world(t, { TUTOR_PLANNER_FAST_MODEL: 'claude-haiku-4-5-20251001' });
  const body = await (await w.post('/api/learn/tutor/plan', { app: 'canvas-0a1b2c3d', context: routine })).json();
  assert.deepEqual(calls.map(call => call.model), ['claude-haiku-4-5-20251001', 'claude-opus-5-5']);
  assert.deepEqual([body.telemetry.tier, body.telemetry.escalated, body.telemetry.fast.requested_model], ['opus', 'an action outside the allowed types', 'claude-haiku-4-5-20251001']);
  assert.deepEqual(body.actions, answer.actions);
  const graded = await (await w.post('/api/learn/tutor/plan', { app: 'canvas-0a1b2c3d', context: { ...routine, route: { row: 'misconception' } } })).json();
  assert.equal(calls[2].model, 'claude-opus-5-5');
  assert.equal(graded.telemetry.tier, 'opus');
  assert.equal(fastPlanProblem({ actions: [{ type: 'show_authored_card', card: 'c' }] }, routine), 'no words');
});

test('plan: an unknown fast model name tiers nothing', async t => {
  const calls = replies(t, [answer]);
  const body = await (await world(t, { TUTOR_PLANNER_FAST_MODEL: 'claude-haiku-9' }).post('/api/learn/tutor/plan', { app: 'canvas-0a1b2c3d', context: routine })).json();
  assert.equal(calls[0].model, 'claude-opus-5-5');
  assert.equal('tier' in body.telemetry, false);
});
