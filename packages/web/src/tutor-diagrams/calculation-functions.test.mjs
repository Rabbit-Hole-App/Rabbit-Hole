// The shares helper and the two functions (softmax probabilities, regression mean baseline; top-k is parked, docs/features/explain/parked.md). Every expected value below is worked out by hand in its comment, not read from the output.
import assert from 'node:assert/strict';
import test from 'node:test';
import { CalculationRefused, runCalculation } from './calculation.js';
import { evenPercents, evenShares } from './shares.js';
import { softmaxCalculation, softmaxInputs, softmaxProbabilities } from './ml-softmax-probabilities-data.js';
import { meanBaseline, meanBaselineCalculation } from './ml-regression-mean-baseline-data.js';
import { references as plotReferences } from './ml-plot-references.js';

const sum = values => values.reduce((total, value) => total + value, 0);
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message ?? ''} ${actual} != ${expected}`);

test('evenShares: equal weights show as equal shares, with one more decimal when two cannot', () => {
  // [18, 23, 18]: total 59, 18/59 = .30508, 23/59 = .38983. Two decimals give 31/39/30 (a unit left over goes to one of the 18s); three give 305/390/305 (999 + the unit to the 23's .83 remainder).
  assert.deepEqual(evenShares([18, 23, 18]), { shares: [0.305, 0.39, 0.305], places: 3 });
  // [13, 13, 14]: total 40, .325 / .325 / .35. Two decimals would give .33 / .32 / .35; three are exact.
  assert.deepEqual(evenShares([13, 13, 14]), { shares: [0.325, 0.325, 0.35], places: 3 });
  assert.deepEqual(evenShares([18, 18]), { shares: [0.5, 0.5], places: 2 }, 'two equal weights share one half each');
  // [39, 44, 30]: no two weights are equal, so two decimals stand. Total 113: 34.51, 38.94, 26.55 floor to 34/38/26 = 98; the two largest remainders (.94 and .55) make 39 and 27.
  assert.deepEqual(evenShares([39, 44, 30]), { shares: [0.34, 0.39, 0.27], places: 2 });
  // [1, 1, 1]: no decimal divides one into three equal parts; the finest (4 places) is used and still adds to one.
  const third = evenShares([1, 1, 1]);
  assert.equal(third.places, 4);
  near(sum(third.shares), 1);
});

test('evenShares: always adds to one; evenPercents is the same in percent', () => {
  for (const values of [[18, 23, 18], [13, 13, 14], [39, 44, 30], [1, 1, 1], [5, 3, 2], [7, 7, 7, 7, 1]]) near(sum(evenShares(values).shares), 1, values.join(','));
  assert.deepEqual(evenPercents([18, 23, 18]), [30.5, 39, 30.5]);
  assert.deepEqual(evenPercents([13, 13, 14]), [32.5, 32.5, 35]);
  assert.deepEqual(evenPercents([39, 44, 30]), [34, 39, 27]);
});

test('softmaxProbabilities: each row adds to one and equal weights give equal probabilities', () => {
  const stored = softmaxProbabilities(softmaxInputs);
  // 70 + 20 + 10 = 100: .7, .2, .1. 15 + 60 + 25 = 100: .15, .6, .25.
  assert.deepEqual(stored, { probabilitiesA: [0.7, 0.2, 0.1], probabilitiesB: [0.15, 0.6, 0.25] });
  const equal = softmaxProbabilities({ weightsA: [2, 2], weightsB: [3, 3] });
  assert.deepEqual(equal.probabilitiesA, [0.5, 0.5]);
  assert.deepEqual(equal.probabilitiesB, [0.5, 0.5]);
  // 13, 13, 14 over 40: the equal pair gets the same share (.325), which takes a third decimal.
  const three = softmaxProbabilities({ weightsA: [13, 13, 14], weightsB: [18, 23, 18] });
  assert.deepEqual(three.probabilitiesA, [0.325, 0.325, 0.35]);
  assert.deepEqual(three.probabilitiesB, [0.305, 0.39, 0.305]);
  for (const row of [stored.probabilitiesA, stored.probabilitiesB, three.probabilitiesA, three.probabilitiesB, softmaxProbabilities({ weightsA: [1, 1, 1], weightsB: [3, 1, 1] }).probabilitiesA]) near(sum(row), 1);
  // Any length: six weights.
  near(sum(softmaxProbabilities({ weightsA: [1, 2, 3, 4, 5, 6], weightsB: [6, 5, 4, 3, 2, 1] }).probabilitiesA), 1);
});

test('softmaxProbabilities refuses lists that cannot be right', () => {
  const refused = input => assert.throws(() => softmaxProbabilities(input), CalculationRefused, JSON.stringify(input));
  refused({ weightsA: [1], weightsB: [1] });
  refused({ weightsA: [1, 2], weightsB: [1, 2, 3] });
  refused({ weightsA: [1, 0], weightsB: [1, 2] });
  refused({ weightsA: [1, 2], weightsB: [1, -2] });
  refused({ weightsA: undefined, weightsB: [1, 2] });
});

test('softmax: the stored reference holds the function\'s rows, and running its function on the stored spec changes nothing', () => {
  const reference = plotReferences.find(ref => ref.id === 'softmax-probabilities');
  assert.deepEqual(reference.spec.diagram.series.map(series => series.values), [[0.7, 0.2, 0.1], [0.15, 0.6, 0.25]]);
  const run = runCalculation(reference.spec.diagram, softmaxCalculation);
  assert.deepEqual(run.overwritten, []);
});

test('meanBaseline: the mean of the targets, two decimals, any number of points from two', () => {
  assert.deepEqual(meanBaseline({ targets: [1, 4, 2, 5, 3] }), { mean: 3 }); // 15 / 5
  assert.deepEqual(meanBaseline({ targets: [1, 2] }), { mean: 1.5 });
  assert.deepEqual(meanBaseline({ targets: [1, 2, 2] }), { mean: 1.67 }); // 5 / 3 = 1.666..
  assert.deepEqual(meanBaseline({ targets: [-4, 2, 8, 6, 0, 2] }), { mean: 2.33 }); // 14 / 6 = 2.333..
  assert.throws(() => meanBaseline({ targets: [3] }), CalculationRefused);
  assert.throws(() => meanBaseline({ targets: [] }), CalculationRefused);
  assert.throws(() => meanBaseline({}), CalculationRefused);
});

test('regression mean baseline: the line value and its label follow the points the author drew', () => {
  const reference = plotReferences.find(ref => ref.id === 'regression-mean-baseline');
  const stored = reference.spec.diagram;
  assert.equal(stored.annotations[0].value, 3, 'stored: the mean of 1, 4, 2, 5, 3');
  assert.equal(stored.annotations[0].label, 'Mean prediction of 3');
  assert.deepEqual(runCalculation(stored, meanBaselineCalculation).overwritten, []);
  const drawn = structuredClone(reference.template.diagram);
  drawn.series[0].points.forEach((point, i) => { point.y = [2, 2, 2, 8, 6][i]; });
  const run = runCalculation(drawn, meanBaselineCalculation);
  assert.equal(run.problem, undefined);
  assert.equal(run.diagram.annotations[0].value, 4, '(2 + 2 + 2 + 8 + 6) / 5');
  assert.deepEqual(run.overwritten, ['mean']);
  drawn.series[0].points[0].y = 5000;
  assert.match(runCalculation(drawn, meanBaselineCalculation).problem, /input targets must be from -1000 to 1000 \(got 5000\)/);
});
