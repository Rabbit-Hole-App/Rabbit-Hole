// Stage C critical-path evaluation policy (docs/features/tutor-architecture-v2.md): evaluation blocks
// the reply only when it can change this turn's move; otherwise it runs beside the planner and its
// evidence is still stored.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cardBlock } from './nanogpt/board.js';
import { cardModule } from './learn-tutor-claims.js';
import { emptyStore } from './learn-tutor-evidence.js';
import { criticalPath, learnerIntent, runTurn } from './learn-tutor.js';
import { speakable } from './learn-tutor-validate.js';

const intent = (raw, extra = {}) => learnerIntent({ raw_user_message: raw, ...extra });
const NO_GAPS = { gaps: [] }, GAPS = { gaps: [{ concept: 'softmax' }] };

test('requests and "?" questions are off the critical path; explanations and answers are on it', () => {
  assert.deepEqual(criticalPath(intent('Show me the implementation.'), NO_GAPS), { blocking: false, reason: 'request' });
  assert.deepEqual(criticalPath(intent('What does softmax do?'), NO_GAPS), { blocking: false, reason: 'question' });
  assert.deepEqual(criticalPath(intent('Explain this.'), NO_GAPS), { blocking: false, reason: 'request' });
  assert.equal(criticalPath(intent('The mask happens after softmax.'), NO_GAPS).blocking, true);
  assert.equal(criticalPath(intent('When it reads a character it looks back at earlier ones.'), NO_GAPS).blocking, true, 'starts like a question, explains');
  assert.equal(criticalPath(intent('what does softmax do'), NO_GAPS).blocking, true, 'no "?": waits for JEV');
  assert.deepEqual(criticalPath(intent('Before softmax.', { answering: 'a1' }), NO_GAPS), { blocking: true, reason: 'answer' });
});

test('a question whose claims carry a prerequisite check waits: a gap changes the move', () => {
  assert.deepEqual(criticalPath(intent('Why do the weights add up to one?'), GAPS), { blocking: true, reason: 'gap_check' });
  assert.deepEqual(criticalPath(intent('OK, I am back.', { returned_from: { claim: 'x' } }), GAPS), { blocking: false, reason: 'returned' });
});

test('off the critical path the planner starts before evaluation lands, and the evidence is still stored', async () => {
  const order = [];
  let release;
  const landed = new Promise(resolve => { release = resolve; });
  const post = async (path, body) => {
    if (path === '/api/learn/tutor/evaluate') {
      order.push('evaluate:start');
      await landed;
      order.push('evaluate:end');
      // A question that JEV nonetheless reads as an attempt with a pass: evidence the next turn uses.
      const claim = body.spec.claims[0];
      return { status: 'settled', evaluator: 'jev', events: [{ concept: claim.concept, claim: claim.id, settled: true, evaluator: 'jev', source: 'free_text', result: 'pass', kind: 'demonstrated_here' }] };
    }
    order.push('planner');
    release();
    return { strategy: 'none', move: 'answer', reason: '', actions: [{ type: 'respond_text', text: 'Yes, every layer.' }] };
  };
  const block = cardBlock(cardModule('c10-weighted-values'));
  const result = await runTurn({ raw: 'Is the output always between the values?', canvas: { app: 'a', board: 'b' }, access: { app: 'a' }, block, store: emptyStore(), post });
  assert.deepEqual(order, ['evaluate:start', 'planner', 'evaluate:end']);
  assert.equal(result.bench.critical_path.blocking, false);
  assert.equal(result.store.events.filter(event => event.source === 'free_text').length, 1, 'the late evidence is stored');
  assert.deepEqual(result.bench.critical_path.miss, { planned: 'not_yet_observed', after: 'uncertain' }, 'a route the evidence would have changed is recorded');
});

// Decision 1 (owner, 2026-10-01): an evaluation-independent first response may run beside evaluation;
// whatever depends on it waits for it.
test('D1: a question the prior evidence routes to a gap, misconception or uncertain move waits for evaluation', () => {
  for (const row of ['gap', 'gap_inline', 'misconception', 'misconception_explain', 'uncertain', 'uncertain_unsettled']) {
    assert.deepEqual(criticalPath(intent('What does softmax do?'), NO_GAPS, row), { blocking: true, reason: 'evidence_row' }, row);
  }
  for (const row of ['not_yet_observed', 'understood', 'off_slice']) assert.equal(criticalPath(intent('What does softmax do?'), NO_GAPS, row).blocking, false, row);
});

test('D1: speakable never lets an evidence-row sentence out while evaluation is pending', () => {
  assert.equal(speakable('Look at row 3.', { row: 'misconception_explain', allowed: ['respond_text'] }, { pending: true }), false);
  assert.equal(speakable('Look at row 3.', { row: 'misconception_explain', allowed: ['respond_text'] }, { pending: false }), true);
  assert.equal(speakable('Every layer uses it.', { row: 'not_yet_observed', allowed: ['respond_text'] }, { pending: true }), true);
});

// An off-path question whose evaluation lands after the planner: `pass` true makes the evidence change
// the route (a miss), false leaves it unchanged.
async function offPath(pass, plan, onSpeakable = null) {
  const order = [];
  let release;
  const landed = new Promise(resolve => { release = resolve; });
  const post = async (path, body, options) => {
    if (path === '/api/learn/tutor/evaluate') {
      order.push('evaluate:start');
      await landed;
      order.push('evaluate:end');
      const claim = body.spec.claims[0];
      return { status: 'settled', evaluator: 'jev', events: pass ? [{ concept: claim.concept, claim: claim.id, settled: true, evaluator: 'jev', source: 'free_text', result: 'pass', kind: 'demonstrated_here' }] : [] };
    }
    order.push('planner');
    if (options?.onSentence) options.onSentence({ text: plan.actions[0].text, action: plan.actions[0].type, constraints_add: [] });
    release();
    return plan;
  };
  const result = await runTurn({ raw: 'Is the output always between the values?', canvas: { app: 'a', board: 'b' }, access: { app: 'a' }, block: cardBlock(cardModule('c10-weighted-values')), store: emptyStore(), post, onSpeakable: onSpeakable && (text => onSpeakable(text, [...order])) });
  return { result, order };
}
const QUIZ_PLAN = { strategy: 'none', actions: [{ type: 'respond_text', text: 'Yes, always between them.' }, { type: 'ask_question', text: 'What if every weight were 0.25?', claim: 'attention-output/weighted-average', purpose: 'transfer' }] };

test('D1: the first safe sentence is spoken before evaluation lands; the evidence-dependent question is released after it', async () => {
  const heard = [];
  const { result, order } = await offPath(false, QUIZ_PLAN, (text, sofar) => heard.push([text, sofar]));
  assert.deepEqual(order, ['evaluate:start', 'planner', 'evaluate:end']);
  assert.deepEqual(heard, [['Yes, always between them.', ['evaluate:start', 'planner']]], 'spoken while evaluation was still running');
  assert.deepEqual(result.actions.map(action => action.type), ['respond_text', 'ask_question'], 'no miss: the question is released');
  const { ms } = result.bench;
  assert.ok(ms.to_first_safe_sentence <= ms.to_evidence_ready, 'first safe sentence no later than evidence');
  assert.ok(ms.to_first_evidence_action >= ms.to_evidence_ready, 'the evidence-dependent action only after evidence');
});

test('D1: after a miss the evidence-dependent action planned on stale evidence is dropped, the words stay', async () => {
  const { result } = await offPath(true, QUIZ_PLAN);
  assert.deepEqual(result.bench.critical_path.miss, { planned: 'not_yet_observed', after: 'uncertain' });
  assert.deepEqual(result.actions.map(action => action.type), ['respond_text']);
  assert.deepEqual(result.decisions.filter(decision => decision.stage === 'evidence').map(decision => decision.type), ['ask_question']);
  assert.equal(result.store.open, null, 'the dropped question is not left open');
  assert.equal(result.bench.ms.to_first_evidence_action, null);
});
