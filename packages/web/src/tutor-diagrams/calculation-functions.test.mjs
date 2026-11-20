// The shares helper and the three functions (top-k, softmax probabilities, regression mean baseline). Every expected value below is worked out by hand in its comment, not read from the output.
import assert from 'node:assert/strict';
import test from 'node:test';
import { CalculationRefused, runCalculation } from './calculation.js';
import { evenPercents, evenShares } from './shares.js';
import { samplingTopK, topK, topKCalculation, topKInputs } from './ml-sampling-top-k-data.js';
import { softmaxCalculation, softmaxInputs, softmaxProbabilities } from './ml-softmax-probabilities-data.js';
import { meanBaseline, meanBaselineCalculation } from './ml-regression-mean-baseline-data.js';
import { samplingTopKReference } from './ml-sampling-top-k-reference.js';
import { references as plotReferences } from './ml-plot-references.js';

const sum = values => values.reduce((total, value) => total + value, 0);
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message ?? ''} ${actual} != ${expected}`);
const nearList = (actual, expected) => { assert.equal(actual.length, expected.length); actual.forEach((value, i) => near(value, expected[i], `item ${i}`)); };

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

test('topK: the worked example is the stored numbers 42/28/16/8/6, 60/40 and 70', () => {
  // Weights 21, 14, 8, 4, 3 add to 50: 21/50 = 42%, 14/50 = 28%, 8/50 = 16%, 4/50 = 8%, 3/50 = 6%. k = 2 keeps 21 and 14 (35): 60% and 40%; the kept hold 42 + 28 = 70.
  assert.deepEqual(topKInputs, { weights: [21, 14, 8, 4, 3], k: 2 });
  assert.deepEqual(topK(topKInputs), { full: [42, 28, 16, 8, 6], renormalized: [60, 40, 0, 0, 0], keptShare: 70 });
  const stored = samplingTopKReference.spec.diagram.series;
  assert.deepEqual(stored[0].values, [42, 28, 16, 8, 6]);
  assert.deepEqual(stored[1].values, [60, 40, 0, 0, 0]);
  assert.deepEqual([samplingTopK.fullPercent, samplingTopK.filteredPercent, samplingTopK.keptMassPercent], [[42, 28, 16, 8, 6], [60, 40, 0, 0, 0], 70]);
  assert.match(samplingTopKReference.depths.standard.spec.diagram.caption, /hold 70% of the probability/);
});

test('topK takes any number of items: six items and three items', () => {
  // Six: 30, 20, 20, 10, 10, 10 add to 100, so the first row is those numbers. k = 3 keeps 30, 20, 20 (70): 30/70 = 42.857, 20/70 = 28.571. Two decimals of a share would show the equal 20s as 29 and 28,
  // so three are used: 428/285/285 plus the two units to the larger remainders (.571 .714 .714 -> the two 20s) = 42.8, 28.6, 28.6 percent. The kept hold 70.
  const six = topK({ weights: [30, 20, 20, 10, 10, 10], k: 3 });
  nearList(six.full, [30, 20, 20, 10, 10, 10]);
  nearList(six.renormalized, [42.8, 28.6, 28.6, 0, 0, 0]);
  near(six.keptShare, 70);
  near(sum(six.renormalized), 100);
  // Three: 5, 3, 2 add to 10: 50/30/20. k = 1 keeps the 5: all of the kept (100). The kept hold 50.
  assert.deepEqual(topK({ weights: [5, 3, 2], k: 1 }), { full: [50, 30, 20], renormalized: [100, 0, 0], keptShare: 50 });
});

test('topK: weights are free: a first row that does not add to 100 is not refused', () => {
  // 30, 30, 30, 5 add to 95, not 100; shares are of the total: 31.58, 31.58, 31.58, 5.26 -> every row still adds to exactly 100.
  const result = topK({ weights: [30, 30, 30, 5], k: 2 });
  near(sum(result.full), 100);
  near(sum(result.renormalized), 100);
  assert.equal(result.renormalized.filter(share => share > 0).length, 2);
  // 10, 20, 30 add to 60: 16.67, 33.33, 50 -> 17, 33, 50 (the unit goes to the .67). k = 2 keeps 30 and 20 (50): 60 and 40; the kept hold 33 + 50 = 83.
  assert.deepEqual(topK({ weights: [10, 20, 30], k: 2 }), { full: [17, 33, 50], renormalized: [0, 40, 60], keptShare: 83 });
});

test('topK: equal weights are kept in order and show as equal shares', () => {
  const result = topK({ weights: [13, 13, 14], k: 2 });
  assert.deepEqual(result.full, [32.5, 32.5, 35], 'equal weights, equal shares');
  // k = 2 keeps the 14 and the first 13: 13/27 = 48.15, 14/27 = 51.85 -> 48.15 needs two decimals of a share: 48 and 52.
  assert.deepEqual(result.renormalized, [48, 0, 52]);
  assert.deepEqual(topK({ weights: [10, 10, 10], k: 1 }).renormalized, [100, 0, 0], 'a tie keeps the earlier item');
});

test('topK refuses a k that cannot keep some and drop some, a weight at or below 0, and fewer than two weights', () => {
  const refused = input => assert.throws(() => topK(input), CalculationRefused, JSON.stringify(input));
  refused({ weights: [5, 3, 2], k: 0 });
  refused({ weights: [5, 3, 2], k: 3 });
  refused({ weights: [5, 3, 2], k: 4 });
  refused({ weights: [5, 3, 2], k: 1.5 });
  refused({ weights: [5, 3, 2], k: '1' });
  refused({ weights: [5, 0, 2], k: 1 });
  refused({ weights: [5, -3, 2], k: 1 });
  refused({ weights: [5, NaN, 2], k: 1 });
  refused({ weights: [5], k: 1 });
  refused({ weights: [], k: 1 });
  refused({ weights: 'x', k: 1 });
  assert.throws(() => topK({ weights: [5, 3, 2], k: 3 }), /k must be a whole number from 1 to 2, below the 3 weights/);
});

test('topK through runCalculation: weights and k read from the variables list; the kept share lands in the list; limits hold', () => {
  const diagram = structuredClone(samplingTopKReference.spec.diagram);
  const set = (name, value) => { diagram.variables.find(v => v.name === name).value = value; };
  set('weights', [30, 25, 25, 10, 10]); set('k', 2);
  const run = runCalculation(diagram, topKCalculation);
  assert.equal(run.problem, undefined);
  assert.deepEqual(run.diagram.series[0].values, [30, 25, 25, 10, 10]);
  assert.deepEqual(run.diagram.series[1].values, [55, 45, 0, 0, 0], '30/55 = 54.5, 25/55 = 45.5 -> 55 and 45 at two decimals of a share');
  assert.equal(run.values.keptShare, 55);
  set('k', 8);
  assert.match(runCalculation(diagram, topKCalculation).problem, /input k must be from 1 to 7 \(got 8\)/);
  set('k', 5);
  assert.match(runCalculation(diagram, topKCalculation).problem, /the inputs are refused: k must be a whole number from 1 to 4/);
  set('k', 2); set('weights', [30, 0, 25, 10, 10]);
  assert.match(runCalculation(diagram, topKCalculation).problem, /input weights must be from 1 to 1000 \(got 0\)/);
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
