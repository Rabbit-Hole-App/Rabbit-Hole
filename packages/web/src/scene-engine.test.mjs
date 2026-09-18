import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, prepareScene } from './scene-engine.js';
import { project, walkthrough } from './scene-behaviors.js';

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

const vectorSpec = () => ({
  type: 'interactive_scene',
  id: 'vector-experiment',
  schemaVersion: 1,
  behaviorId: 'vector_projection_v1',
  renderer: 'svg',
  initialState: { a: [2, 1], b: [1, 0] },
  interactions: [{ input: 'drag_handle', target: 'a', action: 'set_vector' }],
  execution: { mode: 'local_calculation' },
});

test('projection is computed, not scripted', () => {
  assert.deepEqual(project([2, 1], [1, 0]), { defined: true, scale: 2, vector: [2, 0], dot: 2, length: 2 });
  assert.deepEqual(project([1, 1], [0, 2]).vector, [0, 1]);
  assert.equal(project([3, 4], [3, 4]).scale, 1, 'a vector projects onto itself');
});

test('a zero-length axis has no projection', () => {
  const result = project([2, 1], [0, 0]);
  assert.equal(result.defined, false);
  assert.match(result.reason, /zero length/);
});

test('drag, keyboard and numbers all commit the same action', () => {
  const { spec, behavior, state } = prepareScene(vectorSpec());
  const dragged = applyAction(behavior, spec, state, { type: 'set_vector', target: 'a', value: [1, 3] }).state;
  const nudged = applyAction(behavior, spec, state, { type: 'nudge_vector', target: 'a', axis: 'y', by: 2 }).state;
  assert.deepEqual(dragged.a, [1, 3]);
  assert.deepEqual(nudged.a, [2, 3], 'nudging moves the same vector through the same state');
});

test('vectors are clamped and rubbish is refused', () => {
  const { spec, behavior, state } = prepareScene(vectorSpec());
  assert.deepEqual(applyAction(behavior, spec, state, { type: 'set_vector', target: 'a', value: [99, -99] }).state.a, [10, -10]);
  assert.match(applyAction(behavior, spec, state, { type: 'set_vector', target: 'a', value: ['x', 1] }).error, /two finite numbers/);
  assert.match(applyAction(behavior, spec, state, { type: 'set_vector', target: 'c', value: [1, 1] }).error, /only vectors a and b/);
  assert.match(applyAction(behavior, spec, state, { type: 'nudge_vector', target: 'a', axis: 'x', by: NaN }).error, /finite amount/);
});

test('reset restores the starter vectors', () => {
  const { spec, behavior, state } = prepareScene(vectorSpec());
  const moved = applyAction(behavior, spec, state, { type: 'set_vector', target: 'a', value: [-4, 4] }).state;
  const reset = applyAction(behavior, spec, moved, { type: 'reset_attempt' }).state;
  assert.deepEqual(reset.a, [2, 1]);
  assert.deepEqual(reset.b, [1, 0]);
});

test('an undefined projection is not counted as a finished artifact', () => {
  const { spec, behavior, state } = prepareScene(vectorSpec());
  const zeroed = applyAction(behavior, spec, state, { type: 'set_vector', target: 'b', value: [0, 0] }).state;
  assert.equal(behavior.progress(zeroed).complete, false);
  assert.equal(behavior.progress(state).complete, true);
});

const pipelineSpec = () => ({
  type: 'interactive_scene',
  id: 'inference-pipeline',
  schemaVersion: 1,
  behaviorId: 'pipeline_assembly_v1',
  renderer: 'dnd',
  initialState: {
    pieces: [{ id: 'a', label: 'tokenise' }, { id: 'b', label: 'embed' }, { id: 'c', label: 'score' }],
    slots: [{ id: 's1', accepts: 'a' }, { id: 's2', accepts: 'b' }, { id: 's3', accepts: 'c' }],
  },
  interactions: [{ input: 'drop_target', action: 'place_item' }],
  execution: { mode: 'local_calculation' },
});

test('a slot accepting an unknown piece is refused', () => {
  const broken = pipelineSpec();
  broken.initialState.slots[0].accepts = 'ghost';
  assert.throws(() => prepareScene(broken), /unknown piece/);
});

test('placement validates and counts wrong drops without blocking them', () => {
  const { spec, behavior, state } = prepareScene(pipelineSpec());
  const wrong = applyAction(behavior, spec, state, { type: 'place_item', slot: 's1', piece: 'b' }).state;
  assert.equal(wrong.mistakes, 1);
  assert.equal(behavior.progress(wrong).complete, false);
  assert.equal(behavior.describe(wrong).order[0].correct, false);
});

test('a piece moved to another slot leaves the first one empty', () => {
  const { spec, behavior, state } = prepareScene(pipelineSpec());
  let current = applyAction(behavior, spec, state, { type: 'place_item', slot: 's1', piece: 'b' }).state;
  current = applyAction(behavior, spec, current, { type: 'place_item', slot: 's2', piece: 'b' }).state;
  assert.equal(current.placed.s1, undefined);
  assert.equal(current.placed.s2, 'b');
});

test('the artifact is complete only when every slot is right', () => {
  const { spec, behavior, state } = prepareScene(pipelineSpec());
  let current = state;
  for (const [slot, piece] of [['s1', 'a'], ['s2', 'b'], ['s3', 'c']]) current = applyAction(behavior, spec, current, { type: 'place_item', slot, piece }).state;
  assert.deepEqual(behavior.progress(current), { complete: true, seen: 3, total: 3 });
  assert.equal(behavior.describe(current).unplaced.length, 0);
});

test('unknown slots and pieces are refused without changing the artifact', () => {
  const { spec, behavior, state } = prepareScene(pipelineSpec());
  assert.match(applyAction(behavior, spec, state, { type: 'place_item', slot: 'nowhere', piece: 'a' }).error, /no slot/);
  assert.match(applyAction(behavior, spec, state, { type: 'place_item', slot: 's1', piece: 'nothing' }).error, /no piece/);
  assert.deepEqual(applyAction(behavior, spec, state, { type: 'clear_slot', slot: 'nowhere' }).state, state);
});

test('reset empties the build but the pieces remain', () => {
  const { spec, behavior, state } = prepareScene(pipelineSpec());
  const filled = applyAction(behavior, spec, state, { type: 'place_item', slot: 's1', piece: 'a' }).state;
  const reset = applyAction(behavior, spec, filled, { type: 'reset_attempt' }).state;
  assert.deepEqual(reset.placed, {});
  assert.equal(reset.pieces.length, 3);
  assert.equal(reset.mistakes, 0);
});
