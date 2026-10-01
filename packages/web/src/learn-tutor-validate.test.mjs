// Stage F action validator (docs/features/tutor-architecture-v2.md): schema -> route -> resource ->
// consent, one decision per proposed action.
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateActions } from './learn-tutor-validate.js';

const turn = (extra = {}) => ({ raw_user_message: 'Why?', constraints: [], canvas: { app: 'a', board: 'b' }, target: { block_id: 'blk' }, ...extra });
const routed = (row, allowed, claim = 'causal-mask/reads-self-and-earlier') => ({ row, strategy: 'feynman', allowed, claim });
const types = result => result.actions.map(action => action.type);

test('each proposed action gets one decision naming the stage that stopped it', () => {
  const result = validateActions({ actions: [
    { type: 'dance' },
    { type: 'respond_text', text: '  ' },
    { type: 'open_dive', concept: 'softmax', title: 'Softmax' },
    { type: 'suggest_depth', card: 'c11-causal-mask' },
    { type: 'show_authored_card', card: 'c99-made-up' },
    { type: 'respond_text', text: 'Row i keeps columns 0 to i.' },
  ] }, routed('uncertain', ['respond_text', 'show_authored_card']), turn());
  assert.deepEqual(result.decisions.map(d => [d.type, d.accepted, d.stage]), [
    ['dance', false, 'schema'], ['respond_text', false, 'schema'], ['open_dive', false, 'consent'],
    ['suggest_depth', false, 'route'], ['show_authored_card', false, 'resource'], ['respond_text', true, 'accepted'],
  ]);
  assert.deepEqual(types(result), ['respond_text']);
});

test('v2 resource checks: no ladder step, no practice task, a citation to no source', () => {
  const allowed = ['respond_text', 'suggest_depth', 'suggest_practice'];
  const result = validateActions({ actions: [
    { type: 'suggest_depth', card: 'depth-attention-deep', direction: 'deeper' },
    { type: 'suggest_practice', card: 'depth-attention-guided' },
    { type: 'respond_text', text: 'See the code.', cites: [{ card: 'c11-causal-mask', source_index: 0 }, { card: 'c11-causal-mask', source_index: 99 }] },
  ] }, routed('uncertain', allowed), turn());
  assert.deepEqual(result.decisions.map(d => d.stage), ['resource', 'resource', 'accepted']);
  assert.deepEqual(result.actions[0].cites, [{ card: 'c11-causal-mask', source_index: 0 }]);
});

test('"Don\'t quiz me" binds the same turn: the question the planner still adds is dropped', () => {
  const result = validateActions({ constraints_add: ['no_quiz'], actions: [{ type: 'respond_text', text: 'Row i keeps 0 to i.' }, { type: 'ask_question', text: 'Which row?', claim: 'causal-mask/reads-self-and-earlier' }] },
    routed('uncertain', ['respond_text', 'ask_question']), turn({ raw_user_message: "Don't quiz me. Just explain it." }));
  assert.deepEqual(types(result), ['respond_text']);
  assert.equal(result.decisions[1].reason, 'no_quiz');
});

test('consent: navigate without the learner\'s words is a suggestion; with them it navigates', () => {
  const show = { type: 'show_authored_card', card: 'depth-attention-deep', part_id: 'shapes', mode: 'navigate' };
  const unasked = validateActions({ actions: [show] }, routed('uncertain', ['show_authored_card']), turn());
  assert.equal(unasked.actions[0].mode, 'suggest');
  assert.equal(unasked.decisions[0].reason, 'downgraded to a suggestion');
  const asked = validateActions({ explicit_request: 'Show me the implementation', actions: [show] }, routed('not_yet_observed', ['respond_text']), turn({ raw_user_message: "Don't simplify. Show me the implementation." }));
  assert.equal(asked.actions[0].mode, 'navigate');
});

test('a Rabbit Hole is only suggested, anchored to the target card, with at most two sentences before it', () => {
  const result = validateActions({ actions: [{ type: 'respond_text', text: 'One. Two. Three.' }, { type: 'suggest_dive', concept: 'softmax', title: 'Softmax' }] }, routed('gap', ['respond_text', 'suggest_dive']), turn());
  assert.deepEqual(result.actions, [{ type: 'respond_text', text: 'One. Two.' }, { type: 'suggest_dive', concept: 'softmax', title: 'Softmax', from: { block_id: 'blk' } }]);
});
