import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lessonDecisionTreesAnalyticDemos as demos } from './lesson-decision-trees-analytic-demos.js';
import { decisionTreesLesson } from './lesson-decision-trees-data.js';

const depths = ['standard', 'overview', 'deep'];

function diagram(name, depth) {
  const demo = demos.find(entry => entry.name === name);
  assert.ok(demo, `Missing ${name} demo`);
  const plot = demo.diagramAt(depth);
  assert.equal(plot.kind, 'coordinate-plot');
  assert.match(plot.caption, /^Worked example\..*rounded/i);
  return plot;
}

function samples(series) {
  assert.equal(series.kind, 'line');
  assert.notEqual(series.smooth, false);
  const { x, y, divisor } = series.samples;
  assert.equal(divisor, 1000);
  assert.ok(y.every(Number.isInteger));
  return y.map((value, index) => [(x.start + index * x.step) / (x.divisor ?? 1), value / divisor]);
}

function closeToThreeDecimals(actual, exact) {
  assert.ok(Math.abs(actual - exact) <= 0.0005 + Number.EPSILON, `${actual} should round ${exact}`);
}

test('Gini and entropy use the same eleven fractions with exact peaks at one half', () => {
  const expectedFractions = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
  for (const depth of depths) {
    const plot = diagram('gini-vs-entropy', depth);
    assert.equal(plot.series.length, 2);
    const gini = samples(plot.series.find(series => /gini/i.test(series.label)));
    const entropy = samples(plot.series.find(series => /entropy/i.test(series.label)));
    for (const curve of [gini, entropy]) {
      assert.deepEqual(curve.map(([p]) => p), expectedFractions);
      assert.equal(curve[0][1], 0);
      assert.equal(curve.at(-1)[1], 0);
    }
    for (const [index, p] of expectedFractions.entries()) {
      const classes = [p, 1 - p];
      closeToThreeDecimals(gini[index][1], 1 - classes.reduce((sum, q) => sum + q ** 2, 0));
      closeToThreeDecimals(entropy[index][1], -classes.filter(Boolean).reduce((sum, q) => sum + q * Math.log(q) / Math.LN2, 0));
    }
    assert.deepEqual(gini[5], [0.5, 0.5]);
    assert.deepEqual(entropy[5], [0.5, 1]);
    assert.deepEqual(plot.annotations.filter(mark => mark.kind === 'point').map(({ x, y }) => [x, y]), [[0.5, 0.5], [0.5, 1]]);
    assert.ok(plot.caption.match(/\$[^$]+\$/g).length >= 2);
  }
});

test('bootstrap omission follows exact finite-size probabilities and the rounded limit', () => {
  for (const depth of depths) {
    const plot = diagram('bootstrap-coverage', depth);
    assert.equal(plot.series.length, 1);
    const curve = samples(plot.series[0]);
    assert.deepEqual(curve.map(([n]) => n), Array.from({ length: 20 }, (_, index) => index + 1));
    for (const [n, omission] of curve) {
      const exponent = BigInt(n);
      const omittedSequences = (exponent - 1n) ** exponent;
      const allSequences = exponent ** exponent;
      closeToThreeDecimals(omission, Number(omittedSequences) / Number(allSequences));
    }
    const limit = plot.annotations.find(mark => mark.kind === 'reference-line');
    assert.equal(limit.axis, 'y');
    assert.equal(limit.value, 0.368);
    closeToThreeDecimals(limit.value, 1 / Math.E);
    assert.ok(curve.every(([, omission]) => omission < limit.value));
    assert.match(plot.caption, /\$1-0\.368=0\.632\$/);
    if (depth === 'deep') {
      const highlighted = plot.annotations.find(mark => mark.kind === 'point');
      const n = decisionTreesLesson.train.length;
      assert.deepEqual([highlighted.x, highlighted.y], curve[n - 1]);
      assert.ok(plot.caption.includes(`$(${n - 1}/${n})^${n}$`));
    }
  }
});
