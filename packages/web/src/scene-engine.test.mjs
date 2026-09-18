import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, prepareScene } from './scene-engine.js';
import { walkthrough } from './scene-behaviors.js';

const spec = () => ({
  type: 'interactive_scene',
  id: 'token-walk',
  schemaVersion: 1,
  behaviorId: 'walkthrough_v1',
  renderer: 'svg',
  conceptIds: ['token-embeddings'],
  initialState: { steps: [{ label: 'token ids' }, { label: 'embeddings' }, { label: 'logits' }] },
  interactions: [{ input: 'button', label: 'Next', action: 'advance_step' }],
  execution: { mode: 'illustration' },
});

test('a valid spec prepares with its behaviour', () => {
  const prepared = prepareScene(spec());
  assert.equal(prepared.behavior.id, 'walkthrough_v1');
  assert.equal(prepared.state.step, 0);
  assert.deepEqual(prepared.state.visited, [0]);
});

test('an unknown behaviour fails loudly', () => {
  assert.throws(() => prepareScene({ ...spec(), behaviorId: 'make_it_up_v9' }), /no behaviour/);
});

test('an unsupported renderer fails loudly', () => {
  assert.throws(() => prepareScene({ ...spec(), renderer: 'plotly' }), /Invalid activity specification at renderer|cannot use/);
});

test('an interaction naming an unknown action fails loudly', () => {
  assert.throws(() => prepareScene({ ...spec(), interactions: [{ input: 'button', action: 'teleport' }] }), /has no action/);
});

test('an empty walkthrough is rejected', () => {
  assert.throws(() => prepareScene({ ...spec(), initialState: { steps: [] } }), /non-empty steps/);
});

test('steps advance, clamp and record what was visited', () => {
  const { spec: valid, behavior, state } = prepareScene(spec());
  let current = state;
  for (const type of ['advance_step', 'advance_step', 'advance_step']) current = applyAction(behavior, valid, current, { type }).state;
  assert.equal(current.step, 2, 'stops at the last step');
  assert.deepEqual(current.visited, [0, 1, 2]);
  assert.equal(behavior.progress(current).complete, true);
  current = applyAction(behavior, valid, current, { type: 'previous_step' }).state;
  assert.equal(current.step, 1);
});

test('go_to_step rejects an out of range or non-integer index', () => {
  const { spec: valid, behavior, state } = prepareScene(spec());
  assert.match(applyAction(behavior, valid, state, { type: 'go_to_step', index: 9 }).error, /outside this walkthrough/);
  assert.match(applyAction(behavior, valid, state, { type: 'go_to_step', index: 1.5 }).error, /whole number/);
  assert.equal(applyAction(behavior, valid, state, { type: 'go_to_step', index: 9 }).state.step, 0, 'state is unchanged');
});

test('an unknown action is refused without changing state', () => {
  const { spec: valid, behavior, state } = prepareScene(spec());
  const result = applyAction(behavior, valid, state, { type: 'set_vector', value: [1, 2] });
  assert.match(result.error, /Unknown action/);
  assert.equal(result.state, state);
});

test('reset returns to the start and keeps the artifact usable', () => {
  const { spec: valid, behavior, state } = prepareScene(spec());
  const moved = applyAction(behavior, valid, state, { type: 'advance_step' }).state;
  const reset = applyAction(behavior, valid, moved, { type: 'reset_attempt' }).state;
  assert.equal(reset.step, 0);
  assert.deepEqual(reset.visited, [0]);
  assert.equal(reset.steps.length, 3);
});

test('the tutor sees semantic state, not internals', () => {
  const { spec: valid, behavior, state } = prepareScene(spec());
  const described = walkthrough.describe(applyAction(behavior, valid, state, { type: 'advance_step' }).state, valid);
  assert.equal(described.step, 2);
  assert.equal(described.currentLabel, 'embeddings');
  assert.deepEqual(described.visitedSteps, ['token ids', 'embeddings']);
});
