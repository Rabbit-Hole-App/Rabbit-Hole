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

// Task 9.3: a program card the learner asks the Tutor about rides as what this page loaded for it (manifest, settings, drawn
// readouts), never its source and never a second fetch; before it is loaded, as an honest partial description.
test('the Tutor\'s card context for a program card is its loaded explanation and controls, never source', async () => {
  const { cardContext } = await import('./learn-tutor.js');
  const { rememberProgram } = await import('./explain-program/program-card.js');
  const { parseManifest } = await import('./explain-program/contract.js');
  const { growthFixture } = await import('./explain-program/fixtures.js');
  const manifest = parseManifest(growthFixture.manifest).value;
  const block = { id: 'card-tutor-93', type: 'animation', title: 'Balance', program: { bundleHash: 'bh-t' }, explain: { resultId: 'er-t', revision: 'xr-t' }, inputs: { rate: 7 } };
  assert.match(cardContext(block), /not loaded on this page yet/);
  rememberProgram(block, manifest);
  const text = cardContext(block);
  assert.match(text, /Yearly rate: 7 %/);
  assert.ok(text.includes(manifest.summary));
  assert.equal(text.includes(growthFixture.source.slice(0, 40)), false);
});

// FX-61: a stateful card the learner acted on is named in the Tutor's card context by what they can see and did: its buttons and
// selectable parts by the card's own labels, and the target or button the shown state came from. Never the raw state or source,
// never an id the manifest does not label, and no model call (this is the selection/Tutor context path, cardContext).
test('the Tutor\'s card context names a selected stateful target by its label, bounded, with no raw state or source', async () => {
  const { cardContext } = await import('./learn-tutor.js');
  const { programActivity, rememberProgram, PROGRAM_DESCRIPTION } = await import('./explain-program/program-card.js');
  const { parseManifest, STATEFUL_SCHEMA_VERSION } = await import('./explain-program/contract.js');
  const { sortFixture, dragFixture } = await import('./explain-program/fixtures.js');
  const manifest = parseManifest(sortFixture.manifest, STATEFUL_SCHEMA_VERSION).value;
  const block = { id: 'card-fx61', type: 'animation', title: 'Sorting', program: { bundleHash: 'bh-fx61' }, explain: { resultId: 'er-fx61', revision: 'xr-fx61' },
    programState: { bundleHash: 'bh-fx61', state: { secretOrder: [5, 3, 1] }, revision: 4, seed: 0, inputs: {} } };
  rememberProgram(block, manifest);
  const before = cardContext(block);
  assert.match(before, /Buttons: Compare next pair, Shuffle/);
  assert.match(before, /Parts the learner can select: Bar 1, Bar 2, Bar 3, Bar 4, Bar 5, Bar 6/);
  assert.doesNotMatch(before, /last selected/, 'nothing committed on this page yet: no action is claimed');
  const shown = revision => rememberProgram(block, manifest, { inputs: {}, time: 0, readouts: [], revision });
  shown(5); programActivity(block, { type: 'select', target: 'bar-3' }, 5);
  assert.match(cardContext(block), /The learner last selected "Bar 4"; the picture shows the result\./);
  shown(6); programActivity(block, { type: 'action', action: 'step' }, 6);
  assert.match(cardContext(block), /The learner last pressed "Compare next pair"/);
  programActivity(block, { type: 'select', target: 'not-declared' }, 6);
  assert.doesNotMatch(cardContext(block), /not-declared|last selected/, 'an id the card does not label is never named');
  for (const leak of ['secretOrder', 'reduce', 'initialState', sortFixture.source.slice(0, 30)]) assert.equal(cardContext(block).includes(leak), false, leak);
  assert.ok(cardContext(block).length <= PROGRAM_DESCRIPTION);
  const drag = parseManifest(dragFixture.manifest, STATEFUL_SCHEMA_VERSION).value, dragged = { ...block, id: 'card-fx61-drag', program: { bundleHash: 'bh-drag' } };
  rememberProgram(dragged, drag);
  rememberProgram(dragged, drag, { inputs: {}, time: 0, readouts: [], revision: 3 });
  programActivity(dragged, { type: 'drag_end', target: 'handle', x: 10, y: 20 }, 3);
  assert.match(cardContext(dragged), /Handle can also be dragged/);
  assert.match(cardContext(dragged), /The learner last moved "Handle"/);
});

// REGRESSION (review of 0632b6a74): the action was published when its state committed, before its frame was drawn, and the drawn
// readouts were matched by inputs only, so the Tutor read "the picture shows the result" beside the previous state's values. The
// action and the readouts are now bound to the state revision of the frame actually displayed.
test('a committed action whose frame is not drawn yet is not described as shown, and the old state\'s readouts are not reported', async () => {
  const { cardContext } = await import('./learn-tutor.js');
  const { programActivity, rememberProgram } = await import('./explain-program/program-card.js');
  const { parseManifest, STATEFUL_SCHEMA_VERSION } = await import('./explain-program/contract.js');
  const { sortFixture } = await import('./explain-program/fixtures.js');
  const manifest = parseManifest(sortFixture.manifest, STATEFUL_SCHEMA_VERSION).value;
  const block = { id: 'card-fx61-late', type: 'animation', title: 'Sorting', program: { bundleHash: 'bh-late' }, explain: { resultId: 'er-late', revision: 'xr-late' } };
  rememberProgram(block, manifest, { inputs: {}, time: 0, readouts: [{ id: 'swaps', label: 'Swaps so far', text: '1' }], revision: 1 });
  programActivity(block, { type: 'action', action: 'step' }, 1);
  assert.match(cardContext(block), /Shown now: Swaps so far 1/);
  // The next press commits revision 2; its frame is still being drawn.
  programActivity(block, { type: 'action', action: 'shuffle' }, 2);
  const late = cardContext(block);
  assert.doesNotMatch(late, /the picture shows the result/);
  assert.doesNotMatch(late, /Shown now: Swaps so far 1/, 'the previous state\'s values are not reported as current');
  assert.match(late, /The learner last pressed "Shuffle"; its result is not drawn yet/);
  // Its frame arrives: the action and the values now describe the same displayed state.
  rememberProgram(block, manifest, { inputs: {}, time: 0, readouts: [{ id: 'swaps', label: 'Swaps so far', text: '0' }], revision: 2 });
  assert.match(cardContext(block), /The learner last pressed "Shuffle"; the picture shows the result\./);
  assert.match(cardContext(block), /Shown now: Swaps so far 0/);
});
