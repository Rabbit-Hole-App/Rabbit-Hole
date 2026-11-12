import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lessonDecisionTreesRegressionDemo as demo } from './lesson-decision-trees-regression-demo.js';
import { plotSeriesPoints } from './ml-plot-spec.js';

const depths = ['overview', 'standard', 'deep'];
const mean = numbers => numbers.reduce((sum, value) => sum + value, 0) / numbers.length;

function squaredError(numbers) {
  const center = mean(numbers);
  return numbers.reduce((total, value) => total + (value - center) ** 2, 0);
}

function expectedLeaves(targets, remainingDepth, start = 0, end = targets.length) {
  if (!remainingDepth) return [{ start, end }];
  const minimumChildSize = 2 ** (remainingDepth - 1);
  let bestCut;
  let bestError = Infinity;
  for (let cut = start + minimumChildSize; cut <= end - minimumChildSize; cut++) {
    const error = squaredError(targets.slice(start, cut)) + squaredError(targets.slice(cut, end));
    if (error < bestError - 1e-7) {
      bestCut = cut;
      bestError = error;
    }
  }
  assert.ok(bestCut, 'A cut leaves enough samples to complete both child subtrees');
  return [
    ...expectedLeaves(targets, remainingDepth - 1, start, bestCut),
    ...expectedLeaves(targets, remainingDepth - 1, bestCut, end),
  ];
}

test('the sine series has 25 equally spaced samples and both step fits predict the displayed leaf means', () => {
  for (const depth of depths) {
    const plot = demo.diagramAt(depth);
    assert.deepEqual(plot, JSON.parse(JSON.stringify(plot)));
    assert.deepEqual(plot.x, { label: 'Angle (degrees)', min: 0, max: 360 });
    const [sine, shallow, deep] = plot.series;
    const coordinates = plotSeriesPoints(sine).map(point => point.x);
    assert.deepEqual(coordinates, Array.from({ length: 25 }, (_, index) => 15 * index));
    assert.equal(sine.samples.divisor, 1000);
    const targets = coordinates.map(x => Math.round(Math.sin(x * Math.PI / 180) * 1000) + 0);
    assert.deepEqual(sine.samples.y, targets);
    assert.match(plot.caption, /4 leaves versus 16/);
    for (const [fit, maxDepth, maxLeaves] of [[shallow, 2, 4], [deep, 4, 16]]) {
      const leaves = expectedLeaves(targets, maxDepth);
      assert.equal(leaves.length, maxLeaves);
      assert.equal(fit.label, 'Depth ' + maxDepth);
      const boundaries = leaves.map(({ start }) => start === 0 ? coordinates[0] : (coordinates[start - 1] + coordinates[start]) / 2);
      boundaries.push(coordinates.at(-1));
      assert.equal(fit.kind, 'step');
      assert.equal(fit.samples.divisor, 1000);
      assert.deepEqual(plotSeriesPoints(fit).map(point => point.x), boundaries);
      assert.equal(fit.samples.y.length, maxLeaves + 1);
      for (const [index, left] of boundaries.slice(0, -1).entries()) {
        const right = boundaries[index + 1];
        const last = index === maxLeaves - 1;
        const members = targets.filter((_, i) => coordinates[i] >= left && (last ? coordinates[i] <= right : coordinates[i] < right));
        assert.ok(members.length);
        assert.equal(fit.samples.y[index], Math.round(mean(members)) + 0);
      }
      assert.equal(fit.samples.y.at(-1), fit.samples.y.at(-2));
    }
    assert.equal(shallow.samples.showValues === true, depth === 'deep');
    assert.equal(deep.samples.showValues, undefined);
  }
});
