// Decision 4 (owner, 2026-10-01, option B): constraint-first planner output. A Tutor question may be
// spoken before the plan is complete only once every deterministic constraint that could cancel it has
// passed: the learner's "don't quiz me", the route, the question budget, the Socratic-turn limit, a
// conflicting explicit request, required evidence, and (Decision 2) no pending Opus re-plan.
// The plan streams through the worker's real planTurn / firstSentence, as in the corpus runner.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cardBlock } from './nanogpt/board.js';
import { cardModule } from './learn-tutor-claims.js';
import { emptyStore } from './learn-tutor-evidence.js';
import { runTurn } from './learn-tutor.js';
import { questionBlocked, speakable } from './learn-tutor-validate.js';
import { planTurn } from '../../control-plane/src/learn-tutor-routes.js';
import { firstSentence } from '../../control-plane/src/agents/learn-tutor.js';

const CLAIM = 'causal-mask/reads-self-and-earlier';
const QUESTION = { type: 'ask_question', text: 'Which columns can row 3 read? Count them.', claim: CLAIM, purpose: 'predict' };
const plan = (actions, extra = {}) => ({ constraints_add: [], ...extra, strategy: 'feynman', actions });

// A tutor_response as an Anthropic SSE stream, written in small fragments, keys in the given order.
function sse(input, model = 'claude-opus-5-5') {
  const json = typeof input === 'string' ? input : JSON.stringify(input);
  const events = [{ type: 'message_start', message: { model, usage: {} } }, { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', name: 'tutor_response', input: {} } }];
  for (let at = 0; at < json.length; at += 6) events.push({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: json.slice(at, at + 6) } });
  events.push({ type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: {} });
  return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''));
}

// One turn on the causal-mask card. evaluation: what /evaluate returns (after `delay` planner calls
// have started, to model an evaluation still running); replies: the planner's SSE replies in order.
async function turn(raw, replies, { store = emptyStore(), env = {}, evaluation = { status: 'settled', evaluator: 'jev', events: [] }, slash = null } = {}) {
  const heard = [], order = [];
  const post = async (path, body, options) => {
    if (path === '/api/learn/tutor/evaluate') { order.push('evaluate'); return evaluation; }
    order.push('plan');
    return planTurn(env, body.context, { onSentence: options.onSentence, callModel: async () => replies.shift() });
  };
  const result = await runTurn({ raw, slash, canvas: { app: 'a', board: 'b' }, access: { app: 'a' }, block: cardBlock(cardModule('c11-causal-mask')), store, post, onSpeakable: text => heard.push(text) });
  return { result, heard, order };
}
const EXPLAIN = 'I think the mask hides the later positions from each row.';

test('D4-1: a question streams before the plan completes when every constraint allows it', async () => {
  const { result, heard } = await turn(EXPLAIN, [sse(plan([QUESTION, { type: 'focus_part', card: 'c11-causal-mask', part_id: 'nope', mode: 'suggest' }]))]);
  assert.equal(result.routed.row, 'not_yet_observed');
  assert.deepEqual(heard, ['Which columns can row 3 read?']);
  assert.deepEqual(result.bench.spoken, { chars: 29, action: 'ask_question', tier: null, consistent: true });
  assert.ok(result.actions.some(action => action.type === 'ask_question'), 'the validated plan keeps it');
});

test('D4-2: "don\'t quiz me" stops the question before speech - stated, reported, or already in the session', async () => {
  const stated = await turn(`${EXPLAIN} Please don't quiz me.`, [sse(plan([QUESTION]))]);
  assert.deepEqual(stated.heard, [], 'the learner\'s own words, even when the planner did not report no_quiz');
  assert.equal(stated.result.actions.some(action => action.type === 'ask_question'), false, 'and the final gate drops it too');
  assert.ok(stated.result.store.constraints.includes('no_quiz'), 'binding for the session');
  const reported = await turn(EXPLAIN, [sse(plan([QUESTION], { constraints_add: ['no_quiz'] }))]);
  assert.deepEqual(reported.heard, []);
  const session = await turn(EXPLAIN, [sse(plan([QUESTION]))], { store: { ...emptyStore(), constraints: ['just_answer'] } });
  assert.deepEqual(session.heard, []);
});

test('D4-3: a route that does not allow questions stops it before speech', async () => {
  const deeper = await turn('Go deeper.', [sse(plan([QUESTION]))], { slash: 'deeper' });
  assert.equal(deeper.result.routed.row, 'slash');
  assert.deepEqual(deeper.heard, []);
  assert.equal(questionBlocked({ text: 'Why?', action: 'ask_question', constraints_add: [] }, { row: 'gap', allowed: ['respond_text', 'suggest_dive'] }), 'route');
});

test('D4-4: the question budget - only the first question within the first three actions is ever offered', () => {
  const four = { constraints_add: [], strategy: 'none', actions: [{ type: 'focus_part', card: 'c', part_id: 'p' }, { type: 'suggest_depth', card: 'c' }, { type: 'suggest_practice', card: 'c' }, QUESTION] };
  assert.equal(firstSentence(JSON.stringify(four)), null, 'past the three-action cap');
  const two = { constraints_add: [], strategy: 'none', actions: [{ ...QUESTION, text: 'First question? Yes.' }, { ...QUESTION, text: 'Second question?' }] };
  assert.equal(firstSentence(JSON.stringify(two)).text, 'First question?', 'a second question is never the one spoken');
});

test('D4-5: escalation to Opus holds the fast-tier question; nothing of it is spoken', async () => {
  const fastPlan = plan([QUESTION, { type: 'open_dive', concept: 'softmax' }]); // open_dive: outside the allowed types -> Opus
  const opusPlan = plan([{ type: 'respond_text', text: 'Row 3 reads columns 0 to 3. That is four cells.' }]);
  const { result, heard } = await turn('Is it the same mask in every layer?', [sse(fastPlan, 'claude-haiku-4-5-20251001'), sse(opusPlan)], { env: { TUTOR_PLANNER_FAST_MODEL: 'claude-haiku-4-5-20251001' } });
  assert.equal(result.response.telemetry.escalated, 'an action outside the allowed types');
  assert.deepEqual(heard, ['Row 3 reads columns 0 to 3.'], 'only Opus\'s validated sentence');
  assert.equal(result.bench.spoken.consistent, true);
});

test('D4-6: no question is spoken before the evaluation it depends on has landed', async () => {
  // A "?" question is off the critical path: evaluation runs beside the planner.
  let land;
  const landed = new Promise(resolve => { land = resolve; });
  const heard = [];
  const post = async (path, body, options) => {
    if (path === '/api/learn/tutor/evaluate') { await landed; return { status: 'settled', evaluator: 'jev', events: [] }; }
    const question = { type: 'ask_question', text: 'What if every weight were 0.25? Try it.', claim: 'attention-output/weighted-average', purpose: 'transfer' };
    const result = await planTurn({}, body.context, { onSentence: options.onSentence, callModel: async () => sse(plan([question])) });
    land();
    return result;
  };
  // c10's claims carry no prerequisite check, so this "?" question is off the critical path.
  const result = await runTurn({ raw: 'Is the output always between the values?', canvas: { app: 'a', board: 'b' }, access: { app: 'a' }, block: cardBlock(cardModule('c10-weighted-values')), store: emptyStore(), post, onSpeakable: text => heard.push(text) });
  assert.equal(result.bench.critical_path.blocking, false);
  assert.deepEqual(heard, [], 'the question waited for the evidence');
  assert.ok(result.actions.some(action => action.type === 'ask_question'), 'released once the evidence landed');
  assert.equal(questionBlocked({ text: 'Why?', action: 'ask_question', constraints_add: [] }, { row: 'not_yet_observed', allowed: ['ask_question'] }, { pending: true }), 'evidence_pending');
});

test('D4: the Socratic-turn limit, a conflicting explicit request and late constraints also stop an early question', async () => {
  const sentence = { text: 'Why?', action: 'ask_question', constraints_add: [] };
  assert.equal(questionBlocked(sentence, { row: 'misconception_explain', allowed: ['respond_text', 'ask_question', 'focus_part'] }), 'socratic_limit');
  assert.equal(questionBlocked(sentence, { row: 'misconception', allowed: ['ask_question', 'focus_part'] }), null, 'a Socratic turn may ask at once');
  assert.equal(questionBlocked(sentence, { row: 'not_yet_observed', allowed: ['ask_question'] }, { intent: { kind: 'request' } }), 'explicit_request');
  assert.equal(questionBlocked({ ...sentence, explicit_request: 'show me' }, { row: 'not_yet_observed', allowed: ['ask_question'] }), 'explicit_request');
  assert.equal(questionBlocked({ text: 'Why?', action: 'ask_question', constraints_add: null }, { row: 'not_yet_observed', allowed: ['ask_question'] }), 'constraints_unknown');
  const late = JSON.stringify({ strategy: 'none', actions: [QUESTION], constraints_add: ['no_quiz'] });
  assert.equal(firstSentence(late), null, 'constraints written after the actions: a question is never offered');
  const request = await turn('Show me how the mask is built.', [sse(plan([QUESTION]))]);
  assert.deepEqual(request.heard, []);
  assert.equal(speakable({ text: 'Row 3 reads 0 to 3.', action: 'respond_text' }, { row: 'misconception_explain', allowed: ['respond_text'] }), true, 'statements are unaffected');
});
