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

test('one dominant pipeline: the selected query drives its score row, weights and output', () => {
  const { state } = evaluated({ queryIndex: 2, maskEnabled: true });
  const objects = Object.fromEntries(state.objects.map(object => [object.semanticId, object]));
  assert.equal(objects.tokens.cellHighlight, 2, 'the token is a highlighted label');
  assert.match(objects.caption.label, /south/);
  assert.deepEqual(objects['selected-query-vector'].values, [1, 1]);
  // the scores row is THIS query's scores against every key; its future is masked
  assert.equal(objects['scores-row'].values[3], null, 'the future key stays masked in the score row');
  assert.deepEqual(objects['scores-row'].values.slice(0, 3).map(v => Math.round(v * 100) / 100), [0.71, 0.71, 1.41]);
});

test('the full Q/K/V and score matrices are gone - one representation per teaching purpose', () => {
  const { state } = evaluated({});
  const ids = state.objects.map(object => object.semanticId);
  for (const gone of ['query-matrix', 'key-matrix', 'value-matrix', 'scores-matrix', 'full-picture-heading']) {
    assert.ok(!ids.includes(gone), `${gone} should not be duplicated in the pipeline view`);
  }
});

test('the query token chips are labels, not a second control: no pickInput on the tokens', () => {
  const chars = attentionExplorerScene.objects.find(object => object.id === 'chars');
  assert.equal(chars.initialState.pickInput, undefined, 'no in-diagram toolbar; the query control is the INTERACT picker');
});

// The tokens must not merely be inert - they must not LOOK like a control row.
// tokenStyle travels all the way to the renderer: validateScene's schema strips
// any key it does not declare, so an undeclared prop would silently vanish and
// the chips would still render as pills (exactly the review defect).
test('tokenStyle: labels survives validation into the evaluated object the renderer reads', () => {
  const chars = attentionExplorerScene.objects.find(object => object.id === 'chars');
  assert.equal(chars.initialState.tokenStyle, 'labels');
  const rendered = evaluated({}).state.objects.find(object => object.semanticId === 'tokens');
  assert.equal(rendered.tokenStyle, 'labels', 'a dropped prop would silently re-draw the chips as a control row');
});

test('the mask presentation follows the mask state - caption and legend are data the toggle selects', () => {
  const on = evaluated({ maskEnabled: true }).state.objects;
  const off = evaluated({ maskEnabled: false }).state.objects;
  assert.match(on.find(o => o.semanticId === 'scores-row').label, /future masked/);
  assert.match(off.find(o => o.semanticId === 'scores-row').label, /all visible/);
  assert.match(on.find(o => o.semanticId === 'mask-legend').label, /masked/);
  assert.match(off.find(o => o.semanticId === 'mask-legend').label, /mask off/);
});

test('counterfactual: toggling the mask changes the weights and output, not just paint', () => {
  const on = evaluated({ queryIndex: 2, maskEnabled: true }).derived;
  const off = evaluated({ queryIndex: 2, maskEnabled: false }).derived;
  assert.notDeepEqual(on.wrow, off.wrow, 'the attention distribution changes');
  assert.notDeepEqual(on.output, off.output, 'the output changes');
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

// --- I03 world-model planner --------------------------------------------------

const evaluatedFuture = (inputs = {}) => evaluateScene(structuredClone(candidateFutureScene), 3, inputs);

test('I03: total cost per action is derived (collision*wC + time*wT), not typed', () => {
  const { derived } = evaluatedFuture({}); // Safest goal: collision weight 8, time weight 1
  assert.deepEqual(derived.totals, [6, 3.8, 7.4]);
  // independent oracle from the raw example data
  const collision = [0.5, 0.1, 0.8], time = [2, 3, 1];
  const oracle = collision.map((c, i) => c * 8 + time[i] * 1);
  assert.deepEqual(derived.totals.map(v => Number(v.toFixed(2))), oracle);
  // every total stays under 10 so the grid cell and the readout format alike
  assert.ok(derived.totals.every(v => Math.abs(v) < 10));
});

test('I03 counterfactual: the same futures, a different objective, a different preferred action', () => {
  const safest = evaluatedFuture({ goal: 0 });
  const fastest = evaluatedFuture({ goal: 1 });
  // Safest rings Brake (index 1); Fastest rings Continue (index 2)
  assert.equal(safest.derived.preferredAt, 1);
  assert.equal(fastest.derived.preferredAt, 2);
  assert.equal(safest.derived.preferredName, 'Brake');
  assert.equal(fastest.derived.preferredName, 'Continue');
  // the rollouts themselves are unchanged by the goal - only the cost weighting moved
  assert.deepEqual(safest.derived.selRoll, fastest.derived.selRoll);
  assert.notDeepEqual(safest.derived.totals, fastest.derived.totals);
});

test('I03: choosing an action changes the predicted rollout, not just a highlight', () => {
  const left = evaluatedFuture({ action: 0 });
  const brake = evaluatedFuture({ action: 1 });
  const rollLeft = left.state.objects.find(object => object.semanticId === 'predicted-outcome').label;
  const rollBrake = brake.state.objects.find(object => object.semanticId === 'predicted-outcome').label;
  assert.match(rollLeft, /collision risk/);
  assert.match(rollBrake, /safe stop/);
  assert.notEqual(rollLeft, rollBrake, 'the outcome box text is the model prediction for that action');
  // and the cost readout tracks the selected action
  assert.equal(left.derived.selColl, 0.5);
  assert.equal(brake.derived.selColl, 0.1);
});

test('I03: the cost chart rings the planner-preferred action and is shown while exploring', () => {
  const { state } = evaluatedFuture({ goal: 1 }); // Fastest
  const chart = state.objects.find(object => object.semanticId === 'action-costs');
  assert.deepEqual(chart.values, [4.5, 6.1, 2.8]);
  assert.equal(chart.opacity, 1, 'no commit gate - costs are visible while exploring');
  assert.equal(chart.cellHighlight, 2, 'Continue (index 2) is cheapest when Fastest');
  assert.equal(chart.cellHighlightKind, 'select');
});

for (const inputs of [{}, { action: 1 }, { action: 2, goal: 1 }, { goal: 1 }]) {
  test(`I03 snapshot ${JSON.stringify(inputs)}: consistency and layout gates pass`, () => {
    const { scene } = evaluatedFuture(inputs);
    assert.deepEqual(checkSceneConsistency(scene).issues, []);
    assert.deepEqual(checkLayoutLint(scene).issues, []);
  });
}

// The four cards are explore-only - no practice tasks attach to them. The
// generic activity layer keeps its own tests in scene-activity.test.mjs.

test('tokens list renaming still binds (anti-hardcoding: no shared code reads these words)', () => {
  const renamed = JSON.parse(JSON.stringify(attentionExplorerScene)
    .replaceAll('river', 'eins').replaceAll('flows', 'zwei').replaceAll('south', 'drei').replaceAll('today', 'vier'));
  const { state, derived } = evaluateScene(renamed, 4, { queryIndex: 2 });
  assert.match(state.objects.find(object => object.semanticId === 'caption').label, /drei/);
  assert.deepEqual(derived.wrow.map(w => w === null), [false, false, false, true]);
});
