import { test } from 'node:test';
import assert from 'node:assert/strict';
import katex from 'katex';
import { getSceneState, plainMath, validateScene } from './animation-scene.js';
import { evaluateScene } from './scene-evaluate.js';
import { estimateTextBox } from './scene-layout.js';
import { EXPLAIN_EXAMPLES } from './explain-examples.js';

// EXP-T04 M1: typed math runs inside labels (shape: C:/s/spec/explain/runs-shape.md).

const one = (type, initialState, extra = {}) => validateScene({
  id: 'runs-probe', duration: 1, timeline: [],
  objects: [{ id: 'o', type, initialState: { x: 10, y: 10, ...initialState }, ...extra }],
});
const LAW = [{ kind: 'text', text: 'Period depends on the square root of length: ' }, { kind: 'math', tex: 'T = 2\\pi\\sqrt{L/g}' }];

test('runs are accepted on boxes, circles, text and connectors', () => {
  for (const [type, state] of [['box', { w: 200, h: 60 }], ['circle', { w: 60 }], ['text', {}], ['arrow', { from: { x: 0, y: 0 }, to: { x: 90, y: 0 } }], ['line', { from: { x: 0, y: 0 }, to: { x: 90, y: 0 } }]]) {
    assert.doesNotThrow(() => one(type, { ...state, runs: LAW }), type);
  }
});

test('code stays code: runs are refused on code, equations and data shapes', () => {
  assert.throws(() => one('code', { text: 'x = 1', runs: LAW }), /code cannot carry label runs/);
  assert.throws(() => one('equation', { w: 100, h: 40, text: 'x', runs: LAW }), /equation cannot carry label runs/);
  assert.throws(() => one('strip', { values: [1, 2], runs: LAW }), /strip cannot carry label runs/);
});

test('a run is exactly text or math, and a formula KaTeX cannot typeset is refused, not drawn raw', () => {
  assert.throws(() => one('text', { runs: [{ kind: 'html', text: '<b>x</b>' }] }), /Invalid animation/);
  assert.throws(() => one('text', { runs: [{ kind: 'math', tex: 'x', text: 'y' }] }), /Invalid animation/);
  assert.throws(() => one('text', { runs: [] }), /Invalid animation/);
  assert.throws(() => one('text', { runs: [{ kind: 'math', tex: '\\frac{1}{' }] }), /cannot be typeset/);
  assert.throws(() => one('text', { runs: [{ kind: 'math', tex: '\\href{https://example.com}{x}' }] }), /cannot be typeset/);
});

test('the plain label reads the formula, so the tutor, search and the text estimate see symbols, not LaTeX', () => {
  const state = getSceneState(one('text', { runs: LAW }), 1);
  assert.equal(state.objects[0].label, 'Period depends on the square root of length: T = 2π√(L/g)');
  assert.deepEqual(state.objects[0].runs, LAW);
  // An authored plain label stays the fallback.
  assert.equal(getSceneState(one('text', { text: 'T = 2 pi root(L/g)', runs: LAW }), 1).objects[0].label, 'T = 2 pi root(L/g)');
  const fontSize = 16;
  const typed = estimateTextBox({ text: state.objects[0].label, x: 0, y: 0, fontSize, anchor: 'start', baseline: 'auto' });
  const raw = estimateTextBox({ text: LAW.map(run => run.text ?? run.tex).join(''), x: 0, y: 0, fontSize, anchor: 'start', baseline: 'auto' });
  assert.ok(typed.xMax < raw.xMax, 'measured from the typeset reading, not the source');
});

test('plain readings cover fractions, subscripts, superscripts and Greek, unrelated to pendulums', () => {
  assert.equal(plainMath('\\frac{a}{b}'), 'a/b');
  assert.equal(plainMath('\\frac{1}{2} m v^{2}'), '1/2 m v^2');
  assert.equal(plainMath('x_{i}^2 + \\alpha'), 'x_i^2 + α');
  assert.equal(plainMath('\\sigma(x) = \\frac{1}{1+e^{-kx}}'), 'σ(x) = 1/(1+e^-kx)');
});

test('the pendulum law authored as runs typesets a real pi and radical', () => {
  const tex = LAW[1].tex;
  assert.doesNotThrow(() => one('text', { runs: LAW }));
  const html = katex.renderToString(tex, { throwOnError: true, output: 'html' });
  assert.match(html, /π/, 'a real pi glyph');
  assert.match(html, /class="mord sqrt"[\s\S]*<svg/, 'a real radical, drawn as KaTeX draws one');
  assert.doesNotMatch(html, /sqrt\(|\*pi/, 'not calculator syntax');
  for (const formula of ['\\frac{a}{b}', 'x_i^2', 'e^{-kx}', 'a_{n+1} = \\frac{a_n}{2}']) {
    assert.doesNotThrow(() => one('box', { w: 200, h: 60, runs: [{ kind: 'text', text: 'value ' }, { kind: 'math', tex: formula }] }), formula);
  }
});

test('a math run takes derived values like any other string', () => {
  const pendulum = EXPLAIN_EXAMPLES.find(example => example.id === 'pendulum').block.scene;
  const scene = structuredClone(pendulum);
  scene.objects.find(object => object.id === 'result').initialState = { ...scene.objects.find(object => object.id === 'result').initialState, runs: [{ kind: 'math', tex: 'T = {{T}}\\,\\mathrm{s}' }] };
  const { state } = evaluateScene(scene, 3, { len: 0 });
  assert.deepEqual(state.objects.find(object => object.id === 'result').runs, [{ kind: 'math', tex: 'T = 1.00\\,\\mathrm{s}' }]);
});

test('replacing the text through the timeline drops the runs: the new text is plain', () => {
  const scene = validateScene({ id: 'swap', duration: 2, objects: [{ id: 'o', type: 'text', initialState: { runs: LAW } }],
    timeline: [{ at: 1, action: 'change_text', target: 'o', value: 'plain now' }] });
  assert.ok(getSceneState(scene, 0.5).objects[0].runs);
  assert.equal(getSceneState(scene, 2).objects[0].runs, null);
  assert.equal(getSceneState(scene, 2).objects[0].label, 'plain now');
});

test('saved scenes without runs evaluate exactly as before: no runs, the same labels', () => {
  for (const example of EXPLAIN_EXAMPLES) {
    const { scene, state } = evaluateScene(example.block.scene, example.block.scene.duration, {});
    for (const object of state.objects) {
      assert.equal(object.runs, null, `${example.id}/${object.id}`);
      const authored = scene.objects.find(entry => entry.id === object.id).initialState;
      if (object.textProgress >= 1) assert.equal(object.label, authored.label ?? authored.text ?? '', `${example.id}/${object.id}`);
    }
  }
});

// EXP-T26/T04 pendulum fixture: quarter the length, half the period, in every
// admitted state of its two inputs (5 lengths x reference on/off).
test('pendulum fixture: a quarter of the length gives half the period in every admitted state', () => {
  const pendulum = EXPLAIN_EXAMPLES.find(example => example.id === 'pendulum').block.scene;
  const lengths = pendulum.exampleData.lengths;
  let compared = 0;
  for (const compare of [true, false]) {
    const period = {};
    for (let len = 0; len < lengths.length; len += 1) period[lengths[len]] = evaluateScene(pendulum, 0, { len, compare }).derived.T;
    for (const length of lengths) {
      if (period[length * 4] === undefined) continue;
      assert.ok(Math.abs(period[length] / period[length * 4] - 0.5) < 0.01, `${length} m vs ${length * 4} m: ${period[length]} s vs ${period[length * 4]} s`);
      compared += 1;
    }
  }
  assert.equal(compared, 6, 'three quarter-length pairs, with and without the reference');
});
