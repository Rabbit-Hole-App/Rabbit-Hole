// Stage C critical-path evaluation policy (docs/features/tutor-architecture-v2.md): evaluation blocks
// the reply only when it can change this turn's move; otherwise it runs beside the planner and its
// evidence is still stored.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cardBlock } from './nanogpt/board.js';
import { cardModule } from './learn-tutor-claims.js';
import { emptyStore } from './learn-tutor-evidence.js';
import { criticalPath, learnerIntent, runTurn } from './learn-tutor.js';

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
