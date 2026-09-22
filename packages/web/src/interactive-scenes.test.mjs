// I01 attention explorer: independent mathematical oracles (spec §8-I01's
// table, computed here from scratch at full precision - never by calling the
// derive seam a second time), plus the same consistency and layout gates
// every lesson scene passes, evaluated at several input snapshots because an
// interactive scene IS a family of scenes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateScene } from './scene-evaluate.js';
import { checkSceneConsistency } from './scene-consistency.js';
import { checkLayoutLint } from './scene-layout-lint.js';
import { attentionExplorerScene, candidateFutureScene, patchExplorerScene } from './interactive-scenes.js';
import { describeAnimation } from './scene-describe.js';
import { applyInputToBlock } from './scene-evaluate.js';

const TOKENS = ['river', 'flows', 'south', 'today'];
const Q = [[1, 0], [0, 1], [1, 1], [1, -1]];
const K = [[1, 0], [0, 1], [1, 1], [-1, 1]];
const V = [[1, 0], [0, 1], [1, 1], [-1, 0]];

// The independent oracle: plain full-precision attention, masked or not.
function oracle(queryIndex, maskEnabled) {
  const scores = Q.map(q => K.map(k => (q[0] * k[0] + q[1] * k[1]) / Math.SQRT2));
  const row = scores[queryIndex].map((value, j) => (maskEnabled && j > queryIndex ? null : value));
  const kept = row.filter(value => value !== null);
  const max = Math.max(...kept);
  const exps = kept.map(value => Math.exp(value - max));
  const total = exps.reduce((sum, value) => sum + value, 0);
  let cursor = 0;
  const weights = row.map(value => (value === null ? null : exps[cursor++] / total));
  const output = [0, 1].map(dim => weights.reduce((sum, weight, i) => sum + (weight ?? 0) * V[i][dim], 0));
  return { weights, output };
}

// The seam rounds to 3 decimals at every named stage, so a two-stage result
// can sit up to ~1e-3 from the full-precision oracle. Anything past 2e-3 is
// a wrong number, not rounding.
const close = (actual, expected, label) => {
  assert.equal(actual === null, expected === null, `${label}: null/blank mismatch`);
  if (expected !== null) assert.ok(Math.abs(actual - expected) < 2e-3, `${label}: ${actual} vs ${expected}`);
};

const evaluated = (inputs = {}) => evaluateScene(structuredClone(attentionExplorerScene), 4, inputs);

test('query 0, mask on: weights [1,-,-,-], output [1,0] (spec oracle)', () => {
  const { derived } = evaluated({ queryIndex: 0, maskEnabled: true });
  assert.deepEqual(derived.wrow, [1, null, null, null]);
  assert.deepEqual(derived.output, [1, 0]);
});

test('query 2, mask on: weights and output match the spec oracle', () => {
  const { derived } = evaluated({ queryIndex: 2, maskEnabled: true });
  const truth = oracle(2, true);
  derived.wrow.forEach((weight, i) => close(weight, truth.weights[i], `weight[${i}]`));
  close(truth.weights[0], 0.248255, 'oracle self-check w0');
  close(truth.weights[2], 0.503490, 'oracle self-check w2');
  derived.output.forEach((value, i) => close(value, truth.output[i], `output[${i}]`));
  close(truth.output[0], 0.751745, 'oracle self-check out0');
});

test('query 2, mask off: the future position gets weight ~0.109057 and output shifts', () => {
  const { derived } = evaluated({ queryIndex: 2, maskEnabled: false });
  const truth = oracle(2, false);
  close(truth.weights[3], 0.109057, 'oracle self-check w3');
  derived.wrow.forEach((weight, i) => close(weight, truth.weights[i], `weight[${i}]`));
  derived.output.forEach((value, i) => close(value, truth.output[i], `output[${i}]`));
  close(truth.output[0], 0.560704, 'oracle self-check out0');
  close(truth.output[1], 0.669762, 'oracle self-check out1');
});

test('query 3: the mask toggle changes nothing - there is no future position', () => {
  const on = evaluated({ queryIndex: 3, maskEnabled: true });
  const off = evaluated({ queryIndex: 3, maskEnabled: false });
  assert.deepEqual(on.derived.wrow, off.derived.wrow);
  assert.deepEqual(on.derived.output, off.derived.output);
});

test('the mask toggle changes actual numbers, and Q/K/V fixtures never move', () => {
  const on = evaluated({ queryIndex: 2, maskEnabled: true });
  const off = evaluated({ queryIndex: 2, maskEnabled: false });
  assert.notDeepEqual(on.derived.wrow, off.derived.wrow);
  assert.notDeepEqual(on.derived.output, off.derived.output);
  assert.deepEqual(on.derived.Q, off.derived.Q);
  assert.deepEqual(on.derived.K, off.derived.K);
  assert.deepEqual(on.derived.V, off.derived.V);
});

test('every bound view reads the one snapshot: highlight row, caption word, weights bars', () => {
  const { state } = evaluated({ queryIndex: 2, maskEnabled: true });
  const objects = Object.fromEntries(state.objects.map(object => [object.semanticId, object]));
  assert.deepEqual(objects['query-matrix'].cellHighlight, { row: 2 });
  assert.deepEqual(objects['scores-matrix'].cellHighlight, { row: 2 });
  assert.equal(objects.tokens.cellHighlight, 2);
  assert.match(objects.caption.label, /south/);
  assert.match(objects['attention-weights'].label, /south/);
  assert.equal(objects['scores-matrix'].values[11], null, 'future score in row 2 stays masked');
  assert.deepEqual(objects['selected-query-vector'].values, [1, 1]);
});

// An interactive scene is a family of scenes: gate every snapshot the four
// review interactions actually visit, not only the default.
const SNAPSHOTS = [
  {}, { queryIndex: 2 }, { queryIndex: 2, maskEnabled: false }, { queryIndex: 3 }, { queryIndex: 1, maskEnabled: false },
];
for (const [index, inputs] of SNAPSHOTS.entries()) {
  test(`snapshot ${index} (${JSON.stringify(inputs)}): consistency and layout gates pass`, () => {
    const { scene } = evaluated(inputs);
    const consistency = checkSceneConsistency(scene);
    assert.deepEqual(consistency.issues, []);
    const layout = checkLayoutLint(scene);
    assert.deepEqual(layout.issues, []);
  });
}

// --- I02 image-patch explorer ------------------------------------------------

const evaluatedPatch = (inputs = {}) => evaluateScene(structuredClone(patchExplorerScene), 3, inputs);

test('I02: internal index 5 is Patch 6 of 16, row 2, column 2 - and the crop is that exact region', () => {
  const { state, derived } = evaluatedPatch({ patchIndex: 5 });
  assert.equal(derived.patch.human, 'Patch 6 of 16 · row 2, column 2');
  const objects = Object.fromEntries(state.objects.map(object => [object.semanticId, object]));
  assert.match(objects.caption.label, /Patch 6 of 16/);
  assert.deepEqual({ x: objects['patch-crop'].crop.x, y: objects['patch-crop'].crop.y }, { x: 0.25, y: 0.25 });
  assert.equal(objects['patch-grid'].cellHighlight, 5);
  assert.equal(objects['patch-positions'].cellHighlight, 5);
  // source and crop draw the same file - they cannot disagree
  assert.equal(objects['patch-crop'].src, objects['source-image'].src);
});

test('I02: the domain has real ends - 0 and 15 evaluate, out-of-range resets, nothing wraps', () => {
  assert.equal(evaluatedPatch({ patchIndex: 0 }).derived.patch.human, 'Patch 1 of 16 · row 1, column 1');
  assert.equal(evaluatedPatch({ patchIndex: 15 }).derived.patch.human, 'Patch 16 of 16 · row 4, column 4');
  assert.equal(evaluatedPatch({ patchIndex: 16 }).inputs.patchIndex, 0);
  assert.equal(evaluatedPatch({ patchIndex: -1 }).inputs.patchIndex, 0);
});

for (const patchIndex of [0, 5, 15]) {
  test(`I02 snapshot patch ${patchIndex}: consistency and layout gates pass`, () => {
    const { scene } = evaluatedPatch({ patchIndex });
    assert.deepEqual(checkSceneConsistency(scene).issues, []);
    assert.deepEqual(checkLayoutLint(scene).issues, []);
  });
}

// --- I03 candidate-future explorer --------------------------------------------

const evaluatedFuture = (inputs = {}) => evaluateScene(structuredClone(candidateFutureScene), 3, inputs);

test('I03: costs 4, 1, 9 are derived mechanically from the terminal positions', () => {
  const { derived } = evaluatedFuture({ resultsRevealed: true });
  assert.deepEqual(derived.costs, [4, 1, 9]);
  // independent oracle: squared distance to the goal, from scratch
  const goal = [0, 0];
  for (const [id, terminal, expected] of [['A', [2, 0], 4], ['B', [1, 0], 1], ['C', [0, 3], 9]]) {
    const cost = (terminal[0] - goal[0]) ** 2 + (terminal[1] - goal[1]) ** 2;
    assert.equal(cost, expected, `oracle self-check ${id}`);
  }
});

test('I03: before reveal the costs are blank everywhere - display, and the tutor payload', () => {
  const { derived, state } = evaluatedFuture({ candidate: 'B' });
  assert.deepEqual(derived.shownCosts, [null, null, null]);
  assert.deepEqual(state.objects.find(object => object.semanticId === 'candidate-costs').values, [null, null, null]);
  const described = describeAnimation({ scene: structuredClone(candidateFutureScene), inputs: { candidate: 'B' }, time: 3, title: 'I03' });
  assert.ok(!described.text.includes('"costs"'), 'raw costs leaked into the payload');
  assert.ok(!/[^0-9]4,1,9|\[4, ?1, ?9\]/.test(described.text), 'cost numbers leaked into the payload');
  assert.match(described.text, /shownCosts.*\[null,null,null\]/s);
});

test('I03: choosing a candidate moves the inspection ring and every bound detail', () => {
  const b = evaluatedFuture({ candidate: 'B' });
  const c = evaluatedFuture({ candidate: 'C' });
  const ringB = b.state.objects.find(object => object.semanticId === 'inspecting-marker');
  const ringC = c.state.objects.find(object => object.semanticId === 'inspecting-marker');
  assert.notDeepEqual({ x: ringB.x, y: ringB.y }, { x: ringC.x, y: ringC.y });
  assert.match(b.state.objects.find(object => object.semanticId === 'caption').label, /path B: it ends at \(1, 0\)/);
  assert.match(c.state.objects.find(object => object.semanticId === 'caption').label, /path C: it ends at \(0, 3\), displacement to the goal \(0, 3\)/);
});

test('I03: the reveal latch cannot be written through the learner command path', () => {
  const block = { id: 'b', type: 'animation', scene: structuredClone(candidateFutureScene), inputs: {} };
  assert.equal(applyInputToBlock(block, 'resultsRevealed', true), block);
  // while the ordinary choice input still writes fine
  assert.equal(applyInputToBlock(block, 'candidate', 'C').inputs.candidate, 'C');
});

for (const inputs of [{}, { candidate: 'B' }, { candidate: 'C' }, { candidate: 'B', resultsRevealed: true }]) {
  test(`I03 snapshot ${JSON.stringify(inputs)}: consistency and layout gates pass`, () => {
    const { scene } = evaluatedFuture(inputs);
    assert.deepEqual(checkSceneConsistency(scene).issues, []);
    assert.deepEqual(checkLayoutLint(scene).issues, []);
  });
}

test('tokens list renaming still binds (anti-hardcoding: no shared code reads these words)', () => {
  const renamed = JSON.parse(JSON.stringify(attentionExplorerScene)
    .replaceAll('river', 'eins').replaceAll('flows', 'zwei').replaceAll('south', 'drei').replaceAll('today', 'vier'));
  const { state, derived } = evaluateScene(renamed, 4, { queryIndex: 2 });
  assert.match(state.objects.find(object => object.semanticId === 'caption').label, /drei/);
  assert.deepEqual(derived.wrow.map(w => w === null), [false, false, false, true]);
});
