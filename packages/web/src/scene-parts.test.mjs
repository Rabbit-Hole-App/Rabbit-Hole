// Sub-cards: one index input presented as a 'pager' pages a scene through 2-4
// parts. Objects that declare a part show only on it; objects without one show
// on every part; the frame is the same on every part; the pager is ordinary
// learner state (shared with every other input, persisted, written by the
// normal command path) but not part of the experiment Reset clears.
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyInputToBlock, evaluateScene } from './scene-evaluate.js';
import { sceneContentBounds } from './scene-layout.js';
import { validateScene } from './animation-scene.js';
import { describeAnimation } from './scene-describe.js';

const text = (id, value, y, extra = {}) => ({ id, type: 'text', initialState: { text: value, x: 40, y }, ...extra });
const paged = (overrides = {}) => ({
  id: 'paged', duration: 1, width: 960, height: 400,
  inputs: [
    { name: 'part', type: 'index', label: 'Deep dive', of: 'parts', default: 0, presentation: 'pager' },
    { name: 'k', type: 'bool', label: 'What-if', default: false },
  ],
  exampleData: { parts: ['Shapes', 'Mask', 'Memory'] },
  objects: [
    text('shared', 'Shared line', 20),
    text('a', 'Part one', 60, { part: 0 }),
    text('b', 'Part two, lower down', 300, { part: 1 }),
    text('c', 'Part three', 120, { part: 2 }),
  ],
  timeline: [{ at: 0, action: 'appear', target: 'b', duration: 0.2 }],
  ...overrides,
});
const shown = (scene, inputs) => evaluateScene(structuredClone(scene), scene.duration, inputs).state.objects
  .filter(object => object.visible && (object.opacity ?? 1) > 0).map(object => object.id).sort();

test('each part shows its own objects and every shared one', () => {
  assert.deepEqual(shown(paged(), { part: 0 }), ['a', 'shared']);
  assert.deepEqual(shown(paged(), { part: 1 }), ['b', 'shared']);
  assert.deepEqual(shown(paged(), { part: 2 }), ['c', 'shared']);
});

test('the frame is the same on every part, so paging never rescales the card', () => {
  const bounds = [0, 1, 2].map(part => { const { contributors: _c, ...box } = sceneContentBounds(evaluateScene(structuredClone(paged()), 1, { part }).scene); return box; });
  assert.deepEqual(bounds[0], bounds[1]);
  assert.deepEqual(bounds[1], bounds[2]);
});

test('a hidden part loses its timeline events', () => {
  const { scene } = evaluateScene(structuredClone(paged()), 1, { part: 0 });
  assert.equal(scene.timeline.some(event => event.target === 'b'), false);
  assert.equal(evaluateScene(structuredClone(paged()), 1, { part: 1 }).scene.timeline.some(event => event.target === 'b'), true);
});

test('the pager is learner state written by the normal command path', () => {
  const block = { scene: paged(), inputs: {} };
  const next = applyInputToBlock(block, 'part', 2);
  assert.equal(next.inputs.part, 2);
});

test('the pager and parts are validated', () => {
  const refuses = (scene, pattern) => assert.throws(() => evaluateScene(structuredClone(scene), 1, {}), pattern);
  refuses(paged({ exampleData: { parts: ['Only'] } }), /2 to 4 sub-cards/);
  refuses(paged({ exampleData: { parts: ['1', '2', '3', '4', '5'] } }), /2 to 4 sub-cards/);
  refuses(paged({ inputs: [{ name: 'part', type: 'index', label: 'Deep dive', of: 'parts', default: 0, presentation: 'pager', hidden: true }] }), /cannot be hidden/);
  refuses(paged({ inputs: [
    { name: 'part', type: 'index', label: 'Deep dive', of: 'parts', default: 0, presentation: 'pager' },
    { name: 'other', type: 'index', label: 'Other', of: 'parts', default: 0, presentation: 'pager' },
  ] }), /at most one pager/);
  refuses(paged({ inputs: [] }), /declares a part, but no input is presented as a pager/);
  refuses(paged({ objects: [text('z', 'Out of range', 20, { part: 3 })] }), /part 3 is not one of the 3 parts/);
});

test('at most 60 objects on screen at once: per part for a paged scene', () => {
  const many = (count, part) => Array.from({ length: count }, (unused, i) => text(`p${part}-${i}`, 'x', 20 + i, { part }));
  // 3 parts x 50 = 150 objects in the scene, 50 on screen at once: fine.
  assert.doesNotThrow(() => evaluateScene(structuredClone(paged({ objects: [...many(50, 0), ...many(50, 1), ...many(50, 2)], timeline: [] })), 1, {}));
  assert.throws(() => evaluateScene(structuredClone(paged({ objects: [...many(61, 0)], timeline: [] })), 1, {}), /61 objects on screen at once on part 1/);
});

test('paging clears a selection or marked region made on another sub-card', () => {
  const block = { scene: paged(), inputs: {}, selectedObject: 'a', marked: { x: 0, y: 0, w: 0.1, h: 0.1 } };
  const next = applyInputToBlock(block, 'part', 1);
  assert.equal(next.selectedObject, null);
  assert.equal(next.marked, null);
  assert.equal(applyInputToBlock(block, 'k', true).selectedObject, 'a', 'other inputs keep the selection');
});

test('the pager is never locked by a practice task; the task still shows its sub-card', () => {
  const block = { scene: paged(), inputs: {}, practiceActive: true, activity: { fixedInputs: { part: 2, k: true } } };
  assert.equal(applyInputToBlock(block, 'part', 1).inputs.part, 1, 'the learner can page while practising');
  assert.equal(applyInputToBlock(block, 'k', false), block, 'a task input stays locked');
});

test('a part needs a pager on every path, and a paged scene never moves the camera', () => {
  assert.throws(() => validateScene({ id: 'x', duration: 1, objects: [text('a', 'A', 20, { part: 0 })], timeline: [] }), /declares a part, but no input is presented as a pager/);
  assert.throws(() => evaluateScene(structuredClone(paged({ timeline: [{ at: 0, action: 'zoom_camera', value: { zoom: 2 } }] })), 1, {}), /cannot move the camera/);
});

test('the tutor is told which sub-card is showing, and only its objects', () => {
  const described = describeAnimation({ type: 'animation', title: 'Paged', scene: paged(), inputs: { part: 1 }, time: 1 }).text;
  assert.match(described, /Showing sub-card 2 of 3: Mask/);
  assert.doesNotMatch(described, /"id":"a"|Part one/);
});
