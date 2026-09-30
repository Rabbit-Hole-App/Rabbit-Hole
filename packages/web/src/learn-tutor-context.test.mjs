// Stage E Compact Teaching State (docs/features/tutor-architecture-v2.md): the planner gets the
// turn's intent, target, relevant evidence, route, allowed actions, relevant authored content,
// constraints, recent context and the hole - no unrelated cards, concepts or transcript.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cardBlock } from './nanogpt/board.js';
import { cardModule } from './learn-tutor-claims.js';
import { emptyStore, deriveClaimStates } from './learn-tutor-evidence.js';
import { buildTurn, learnerIntent, plannerContext, route } from './learn-tutor.js';

const contextOn = (card, raw, store = emptyStore()) => {
  const block = cardBlock(cardModule(card)), states = deriveClaimStates(store.events);
  const { turn, claims, selection } = buildTurn({ raw, canvas: { app: 'a', board: 'b' }, block, store: { ...store, turns: Array.from({ length: 6 }, (_, i) => ({ learner: `m${i}`, tutor: `r${i}` })) }, states });
  const selected = selection ? selection.selected : claims;
  const routed = route({ turn, claims: selected, states, evaluation: null, store });
  return plannerContext({ turn, routed, block, states, claims: selected, store });
};

test('the planner input has exactly the Teaching State fields', () => {
  const context = contextOn('c11-causal-mask', 'Why is the mask applied before softmax?');
  assert.deepEqual(Object.keys(context), ['learner_intent', 'target', 'relevant_evidence', 'route', 'allowed_actions', 'relevant_authored_content', 'learner_constraints', 'recent_relevant_context', 'dive_context']);
  assert.equal(context.learner_intent.kind, 'question');
  assert.equal(context.recent_relevant_context.turns.length, 2, 'two recent turns, not the transcript');
  assert.equal(context.dive_context, null);
});

test('only the concepts and cards this turn bears on', () => {
  const context = contextOn('c11-causal-mask', 'Why is the mask applied before softmax?');
  assert.deepEqual(Object.keys(context.relevant_evidence.concepts).sort(), ['causal-mask', 'softmax']);
  const cards = context.relevant_authored_content.cards.map(card => card.card);
  assert.ok(cards.includes('c11-causal-mask') && cards.includes('c21-temperature'));
  assert.ok(!cards.includes('c10-weighted-values') && !cards.includes('depth-attention-overview'));
  assert.ok(context.relevant_evidence.claims.every(claim => claim.concept === 'causal-mask' || claim.concept === 'softmax'));
});

test('learner intent: request, question, explanation', () => {
  const intent = raw => learnerIntent({ raw_user_message: raw });
  assert.equal(intent("Don't quiz me. Just explain it.").kind, 'request');
  assert.equal(intent('Show me the implementation.').kind, 'request');
  assert.equal(intent('Is it the same mask in every layer?').kind, 'question');
  assert.equal(intent('Each position reads itself and all earlier positions.').kind, 'explanation');
});
