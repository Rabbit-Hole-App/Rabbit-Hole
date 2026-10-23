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

// EXP-T26 acceptance (integrator ruling 2026-10-22 2:15 AM PT): the pendulum's length changes geometry, period and plot
// consistently in every admitted state - the drawn string is proportional to L, a quarter length halves the period, and the
// plot's highlighted bar is the period the readout states.
test('pendulum: drawn length is proportional to L, quarter length halves the period, plot and readout agree, in all 10 states', () => {
  const pendulum = EXPLAIN_EXAMPLES.find(example => example.id === 'pendulum').block.scene;
  const lengths = pendulum.exampleData.lengths;
  for (const compare of [true, false]) {
    const states = lengths.map((length, len) => ({ length, ...evaluateScene(pendulum, pendulum.duration, { len, compare }) }));
    const pxPerMetre = states.map(({ length, state }) => {
      const string = state.objects.find(object => object.id === 'string');
      const bob = state.objects.find(object => object.id === 'bob');
      assert.equal(bob.y, string.to.y, 'the bob hangs at the end of the string');
      return (string.to.y - string.from.y) / length;
    });
    for (const scale of pxPerMetre) assert.ok(Math.abs(scale - pxPerMetre[0]) < 1, `string length per metre ${pxPerMetre.join(', ')}`);
    for (const { length, derived } of states) {
      const quarter = states.find(entry => entry.length === length / 4);
      if (quarter) assert.ok(Math.abs(quarter.derived.T / derived.T - 0.5) < 0.01, `${length / 4} m vs ${length} m`);
    }
    for (const { state, derived } of states) {
      const chart = state.objects.find(object => object.id === 'chart');
      assert.equal(chart.values[chart.cellHighlight], derived.T, 'the highlighted bar is the period the readout states');
    }
    const ref = states[0].state.objects.find(object => object.id === 'refBob');
    assert.equal(ref.y, states[lengths.indexOf(1)].state.objects.find(object => object.id === 'bob').y, 'the 1.00 m reference bob sits where a 1.00 m bob does');
  }
});

// Owner refinement 2026-10-22: playback, steps, Reset and every control change are local state, never a model call. The card
// and everything it imports for playback, steps and controls hold no network path; the only way out is the callbacks the
// canvas passes in (onChange, onChangeQuiet, onAskRegion - the region ask adds a context target, it sends nothing).
test('playback, steps and controls make no model or network call: the scene card and its modules have no network path', async () => {
  const { readFileSync } = await import('node:fs');
  const files = ['AnimatedScene.jsx', 'SceneControls.jsx', 'scene-evaluate.js', 'animation-scene.js', 'scene-inputs.js', 'scene-activity.js',
    'scene-derive.js', 'scene-format.js', 'scene-layout.js', 'scene-style.js', 'scene-vocab.js', 'scene-legacy.js', 'scene-engine.js', 'scene-behaviors.js', 'scene-sound.js', 'learn-audio.js', 'inline-equation-result.js', 'scene-selection.js', 'storage-fallback.js'];
  for (const file of files) {
    const source = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /\bfetch\s*\(|\/api\/|XMLHttpRequest|sendBeacon|new WebSocket|EventSource/, `${file} has a network path`);
    for (const [, path] of source.matchAll(/^import [^'"]*['"](\.[^'"]+)['"]/gm)) {
      assert.ok(files.includes(path.replace(/^\.\//, '')) || /\.css$/.test(path), `${file} imports ${path}, which this test does not cover`);
    }
  }
});
