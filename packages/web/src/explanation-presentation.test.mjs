import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isStaticScene, presentationMode, stepAt, validateScene } from './animation-scene.js';
import { evaluateScene, experimentChanged, resetInputs } from './scene-evaluate.js';
import { EXPLAIN_EXAMPLES } from './explain-examples.js';

// EXP-T26 M1: a scene whose timeline only builds the picture up has no
// transport; Reset is offered only while a value differs from what it restores.

const base = timeline => validateScene({
  id: 'static-probe', duration: 3,
  objects: [
    { id: 'a', type: 'box', initialState: { label: 'A', x: 0, y: 0, opacity: 0 } },
    { id: 'b', type: 'strip', initialState: { label: 'B', x: 0, y: 100, values: [1, 2] } },
  ],
  timeline,
});

test('a build-only timeline is static; anything that changes, moves or sounds keeps its transport', () => {
  assert.equal(isStaticScene(base([])), true);
  assert.equal(isStaticScene(base([{ at: 0, action: 'appear', target: 'a', duration: 0.4 }, { at: 1, action: 'highlight', target: 'a' }, { at: 2, action: 'emphasize', target: 'b', duration: 0.5 }])), true);
  for (const event of [
    { at: 1, action: 'set_values', target: 'b', value: [3, 4] },
    { at: 1, action: 'move', target: 'a', value: { x: 10, y: 10 } },
    { at: 1, action: 'disappear', target: 'a' },
    { at: 1, action: 'unhighlight', target: 'a' },
    { at: 1, action: 'type_text', target: 'a', value: 'AB', duration: 1 },
    { at: 0, action: 'appear', target: 'a', sound: 'tick' },
  ]) assert.equal(isStaticScene(base([event])), false, event.action);
});

test('the six stored /explain answers are static: they reveal, they do not teach by time', () => {
  for (const example of EXPLAIN_EXAMPLES) {
    const { scene } = evaluateScene(example.block.scene, 0, {});
    assert.equal(isStaticScene(scene), true, example.id);
  }
});

const block = (extra = {}) => ({
  type: 'animation',
  scene: {
    id: 'reset-probe', duration: 1, objects: [], timeline: [],
    exampleData: { sizes: ['s', 'm', 'l'], parts: ['one', 'two'] },
    inputs: [
      { name: 'size', type: 'index', label: 'Size', of: 'sizes', default: 1 },
      { name: 'on', type: 'bool', label: 'On', default: true },
      { name: 'part', type: 'index', label: 'Part', of: 'parts', default: 0, presentation: 'pager' },
    ],
  },
  ...extra,
});

test('Reset is offered only while a value differs from its default', () => {
  assert.equal(experimentChanged(block()), false, 'no inputs stored');
  assert.equal(experimentChanged(block({ inputs: { size: 1, on: true } })), false, 'stored values equal to the defaults');
  assert.equal(experimentChanged(block({ inputs: { size: 2 } })), true);
  assert.equal(experimentChanged(block({ inputs: { on: false } })), true);
  assert.equal(experimentChanged(block({ inputs: { size: 9 } })), false, 'an out-of-domain value coerces to the default');
});

test('the sub-card being read is navigation: it neither shows Reset nor is reset', () => {
  assert.equal(experimentChanged(block({ inputs: { part: 1 } })), false);
  assert.deepEqual(resetInputs(block({ inputs: { part: 1, size: 2 } })), { part: 1 });
});

test('practice locks survive Reset and do not by themselves offer it', () => {
  const practising = extra => block({ practiceActive: true, activity: { fixedInputs: { size: 0 } }, ...extra });
  assert.deepEqual(resetInputs(practising({ inputs: { size: 0, on: false } })), { size: 0 });
  assert.equal(experimentChanged(practising({ inputs: { size: 0 } })), false, 'the locked value is where Reset would put it');
  assert.equal(experimentChanged(practising({ inputs: { size: 0, on: false } })), true);
});

test('a scene whose inputs do not validate offers no Reset', () => {
  assert.equal(experimentChanged({ scene: { inputs: [{ name: 'x', type: 'nope' }] }, inputs: { x: 1 } }), false);
});

// EXP-T26 M2: the declared presentation (saved-scene form of ExplanationPresentation).
const declared = presentation => validateScene({
  id: 'declared', duration: 4,
  objects: [{ id: 'a', type: 'strip', initialState: { label: 'A', x: 0, y: 0, values: [1, 2] } }],
  timeline: [{ at: 1, action: 'set_values', target: 'a', value: [2, 1] }],
  presentation,
});

test('a declared mode wins; a saved scene without one keeps the static reading', () => {
  assert.equal(presentationMode(declared({ mode: 'static' })), 'static', 'declared static shows the finished frame though the timeline changes values');
  assert.equal(presentationMode(declared(undefined)), 'time');
  assert.equal(presentationMode(base([])), 'static');
  assert.equal(presentationMode(declared({ mode: 'steps', steps: [{ id: 'a', title: 'before', at: 0 }, { id: 'b', title: 'after', at: 2 }] })), 'steps');
});

test('steps are named, increasing moments inside the scene; other modes take none', () => {
  assert.throws(() => declared({ mode: 'steps', steps: [{ id: 'a', title: 'only', at: 0 }] }), /at least 2 named steps/);
  assert.throws(() => declared({ mode: 'steps', steps: [{ id: 'a', title: 'x', at: 2 }, { id: 'b', title: 'y', at: 1 }] }), /must come after/);
  assert.throws(() => declared({ mode: 'steps', steps: [{ id: 'a', title: 'x', at: 0 }, { id: 'b', title: 'y', at: 9 }] }), /past the 4s scene/);
  assert.throws(() => declared({ mode: 'steps', steps: [{ id: 'a', title: 'x', at: 0 }, { id: 'a', title: 'y', at: 1 }] }), /unique id/);
  assert.throws(() => declared({ mode: 'time', steps: [{ id: 'a', title: 'x', at: 0 }, { id: 'b', title: 'y', at: 1 }] }), /time mode takes no steps/);
  assert.throws(() => declared({ mode: 'slideshow' }), /Invalid animation at presentation/);
  assert.throws(() => declared({ mode: 'static', css: 'x' }), /Invalid animation at presentation/);
});

test('the step a moment is on is the last one reached, so a reload lands where the learner left it', () => {
  const steps = [{ at: 0 }, { at: 1.5 }, { at: 3 }];
  assert.deepEqual([0, 1.4, 1.5, 2.9, 3, 4].map(time => stepAt(steps, time)), [0, 0, 1, 1, 2, 2]);
});

test('an experiment names objects that exist and a control the learner can move', () => {
  const experiment = extra => ({ id: 'e', input: 'size', purpose: 'Why?', affects: ['a'], contrasts: ['small', 'big'], ...extra });
  assert.throws(() => declared({ mode: 'static', experiments: [experiment({ affects: ['ghost'] })] }), /unknown object "ghost"/);
  assert.throws(() => declared({ mode: 'static', experiments: [experiment({ contrasts: [] })] }), /Invalid animation at presentation/);
  const raw = extra => ({
    id: 'exp', duration: 1, objects: [{ id: 'a', type: 'box', initialState: { label: '{{label}}', x: 0, y: 0 } }], timeline: [],
    exampleData: { sizes: ['s', 'm'], parts: ['one', 'two'] },
    derived: { label: { op: 'pick', args: ['sizes', 'size'] } },
    inputs: [{ name: 'size', type: 'index', label: 'Size', of: 'sizes', default: 0 }, { name: 'part', type: 'index', label: 'Part', of: 'parts', default: 0, presentation: 'pager' }],
    presentation: { mode: 'static', experiments: [experiment(extra)] },
  });
  assert.doesNotThrow(() => evaluateScene(raw(), 1, {}));
  assert.throws(() => evaluateScene(raw({ input: 'nope' }), 1, {}), /names no visible control/);
  assert.throws(() => evaluateScene(raw({ input: 'part' }), 1, {}), /names no visible control/);
});
