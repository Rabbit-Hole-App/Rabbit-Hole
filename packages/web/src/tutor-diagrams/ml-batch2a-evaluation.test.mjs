import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { diagramReferences } from './reference-library.js';
import { parseTutorDiagram } from './spec.js';
import { renderTutorDiagram } from './TutorDiagram.js';

const reference = id => {
  const ref = diagramReferences.find(ref => ref.id === id);
  assert.ok(ref, `${id} must be available to the author`);
  return ref;
};
const leaf = (ref, kind) => ref.spec.diagram.panels.find(panel => panel.diagram.kind === kind).diagram;
const close = (actual, expected, tolerance = 0.0005) => assert.ok(Math.abs(actual - expected) <= tolerance,
  `${actual} should equal ${expected} within ${tolerance}`);

test('confusion rates use the original actual/predicted orientation and correct denominators', () => {
  const ref = reference('ml-confusion-denominators');
  const matrix = leaf(ref, 'heatmap');
  const original = reference('confusion-matrix-counts').spec.diagram;
  assert.deepEqual(matrix.rows, original.rows);
  assert.deepEqual(matrix.columns, original.columns);
  assert.equal(matrix.rowLabel, 'Actual');
  assert.equal(matrix.columnLabel, 'Predicted');
  const actualPositive = matrix.rows.find(row => row.label === 'Positive');
  const actualNegative = matrix.rows.find(row => row.label === 'Negative');
  const positive = matrix.columns.indexOf('Positive'), negative = matrix.columns.indexOf('Negative');
  const tp = actualPositive.cells[positive], fn = actualPositive.cells[negative];
  const tn = actualNegative.cells[negative], fp = actualNegative.cells[positive];
  const expectations = { precision: [tp, tp + fp], recall: [tp, tp + fn], specificity: [tn, tn + fp] };
  const table = leaf(ref, 'matrix');
  for (const [id, [numerator, denominator]] of Object.entries(expectations)) {
    const row = table.rows.find(row => row.id === id);
    assert.ok(row);
    const fraction = row.cells[0].match(/\\frac\{(\d+)\}\{(\d+)\}/);
    assert.ok(fraction);
    assert.deepEqual(fraction.slice(1).map(Number), [numerator, denominator]);
    close(parseFloat(row.cells[1]) / 100, numerator / denominator, 0.00005);
  }
  assert.equal(tp + fp + fn + tn, 200);
});

test('MAE, MSE and RMSE derive from the same plotted residuals including a larger miss', () => {
  const ref = reference('ml-regression-error-metrics');
  const plot = leaf(ref, 'coordinate-plot');
  const prediction = plot.series.find(series => series.label === 'Prediction').points;
  const observations = plot.series.find(series => series.label === 'Observed').points;
  const original = reference('regression-residuals').spec.diagram;
  assert.deepEqual(prediction, original.series.find(series => series.label === 'Prediction').points);
  for (const point of original.series.find(series => series.label === 'Observed').points) {
    assert.ok(observations.some(value => value.id === point.id && value.x === point.x && value.y === point.y));
  }
  const [a, b] = prediction;
  const yhat = x => a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x);
  const errors = observations.map(point => point.y - yhat(point.x));
  const errorTable = ref.spec.diagram.panels.find(panel => panel.diagram.title === 'One row per residual').diagram;
  for (const [index, point] of observations.entries()) {
    const row = errorTable.rows.find(row => row.id === point.id);
    assert.deepEqual(row.cells.map(Number), [errors[index], Math.abs(errors[index]), errors[index] ** 2]);
    const segment = plot.annotations[index];
    assert.deepEqual(segment.from, { x: point.x, y: yhat(point.x) });
    assert.deepEqual(segment.to, { x: point.x, y: point.y });
  }
  const sum = values => values.reduce((total, value) => total + value, 0);
  const absolute = sum(errors.map(Math.abs));
  const squared = sum(errors.map(value => value ** 2));
  const n = observations.length;
  const metrics = ref.spec.diagram.panels.find(panel => panel.diagram.title === 'Average over all four samples').diagram;
  const expected = { mae: absolute / n, mse: squared / n, rmse: Math.sqrt(squared / n) };
  for (const [id, value] of Object.entries(expected)) {
    const row = metrics.rows.find(row => row.id === id);
    close(Number(row.cells[1]), value);
    assert.ok(row.cells[0].includes(`${id === 'mae' ? absolute : squared}/${n}`));
  }
  assert.ok(expected.rmse > expected.mae);
  assert.ok(errors.some(value => value < 0) && errors.some(value => value > 0));
  assert.ok(Math.max(...errors.map(Math.abs)) > Math.min(...errors.map(Math.abs)));
});

for (const id of ['ml-confusion-denominators', 'ml-regression-error-metrics']) {
  test(`${id}: saved JSON and actual SVG remain deterministic and readable`, () => {
    const { spec } = reference(id);
    const saved = JSON.stringify(spec);
    assert.deepEqual(parseTutorDiagram(saved), spec);
    for (const width of [320, 408, 720]) {
      const result = renderTutorDiagram(saved, width);
      const svg = renderToStaticMarkup(result.element);
      assert.ok(Number.isFinite(result.width) && Number.isFinite(result.height));
      assert.equal(svg, renderToStaticMarkup(renderTutorDiagram(spec, width).element));
      assert.doesNotMatch(svg, /NaN|Infinity|katex-error/);
      assert.match(svg, /#426db2/);
      assert.match(svg, /data-tutor-matrix-cell/);
      assert.match(svg, /data-tutor-tex/);
    }
  });
}
