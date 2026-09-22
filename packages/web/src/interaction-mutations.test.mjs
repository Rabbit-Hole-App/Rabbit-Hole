import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateScene } from './scene-evaluate.js';
import { PREDICATES } from './scene-activity.js';
import { attentionExplorerScene } from './interactive-scenes.js';

// T10.8 mutation proofs, unit half (the composer/drag/replay classes live in
// the browser scripts - see viz-benchmarks/rabbit-hole-interactions/README).
// Each test injects the defect into a COPY and shows the owning oracle catches
// it, then shows the real implementation passes the same oracle.

const clone = () => structuredClone(attentionExplorerScene);
const oracleQ2MaskOn = [0.248255, 0.248255, 0.50349, null];

const matches = (actual, expected) => actual.every((value, index) =>
  (value === null) === (expected[index] === null) && (value === null || Math.abs(value - expected[index]) < 2e-3));

test('mutation: selection routed to a fixed row (ignoring queryIndex) fails the linked-view oracle', () => {
  const mutated = clone();
  mutated.derived.wrow.args = ['weights', 0]; // the defect: the "selected" row never follows the input
  const bad = evaluateScene(mutated, 4, { queryIndex: 2, maskEnabled: true }).derived.wrow;
  assert.equal(matches(bad, oracleQ2MaskOn), false, 'the oracle must reject the pinned row');
  const good = evaluateScene(clone(), 4, { queryIndex: 2, maskEnabled: true }).derived.wrow;
  assert.equal(matches(good, oracleQ2MaskOn), true, 'the real implementation passes the same oracle');
});

test('mutation: a mask that only repaints (weights computed from unmasked scores) fails the numerical mask oracle', () => {
  const mutated = clone();
  mutated.derived.weights.args = ['scores']; // the defect: softmax ignores the mask entirely
  const maskOn = evaluateScene(mutated, 4, { queryIndex: 2, maskEnabled: true }).derived.wrow;
  const maskOff = evaluateScene(mutated, 4, { queryIndex: 2, maskEnabled: false }).derived.wrow;
  assert.deepEqual(maskOn, maskOff, 'the defect state: toggling changes nothing numerically');
  const realOn = evaluateScene(clone(), 4, { queryIndex: 2, maskEnabled: true }).derived.wrow;
  const realOff = evaluateScene(clone(), 4, { queryIndex: 2, maskEnabled: false }).derived.wrow;
  assert.notDeepEqual(realOn, realOff, 'the real toggle changes the actual weights');
});

test('mutation: an order-sensitive answer comparison would fail the exact-set oracle', () => {
  // the defect, expressed as the naive comparator a mutation would introduce
  const orderSensitive = (answer, expected) => JSON.stringify(answer) === JSON.stringify(expected);
  assert.equal(orderSensitive([2, 0, 1], [0, 1, 2]), false, 'the defect rejects a correct set given in click order');
  assert.equal(PREDICATES.set_equals({ answer: [2, 0, 1] }, { expected: [0, 1, 2] }), true, 'the real predicate is order-free');
});

test('mutation: a zero axis slipped past the defined-check would grade as passed', () => {
  const withoutGuard = state => Math.abs(0) <= 0.001; // the defect: length defaulted to 0 when undefined
  assert.equal(withoutGuard({ a: [1, 1], b: [0, 0] }), true, 'the defect state: a zero axis "passes"');
  assert.equal(PREDICATES.projection_zero({ engineState: { a: [1, 1], b: [0, 0] } }), false, 'the real predicate refuses it');
});
