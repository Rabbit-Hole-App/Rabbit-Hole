import test from 'node:test';
import assert from 'node:assert/strict';
import { diagramReferences } from './reference-library.js';
import { parseTutorDiagram } from './spec.js';

test('repeated fits, mean and range follow the displayed training samples', () => {
  const reference = diagramReferences.find(ref => ref.id === 'ml-repeated-sample-fits');
  assert.ok(reference, 'The worked repeated-fit reference is registered');
  const [samples, predictions, aggregate] = parseTutorDiagram(reference.spec).diagram.panels.map(panel => panel.diagram);
  assert.deepEqual(predictions.x, aggregate.x);
  assert.deepEqual(predictions.y, aggregate.y);
  const fits = predictions.series;
  const [summary] = aggregate.series;
  assert.equal(fits.length, 3);

  const training = samples.rows.map(row => row.cells.map(Number));
  for (const [index, [left, right]] of training.entries()) {
    assert.equal(fits[index].label, samples.rows[index].heading);
    assert.deepEqual(fits[index].points, [{ x: 0, y: left }, { x: 4, y: right }]);
  }

  // The upper envelope switches from B to C at x = 1.
  assert.deepEqual(summary.points.map(point => point.x), [0, 1, 4]);
  for (const { x, y, low, high } of summary.points) {
    const values = training.map(([left, right]) => left + (right - left) * x / 4);
    assert.equal(y, values.reduce((sum, value) => sum + value, 0) / values.length);
    assert.equal(low, Math.min(...values));
    assert.equal(high, Math.max(...values));
  }
  assert.deepEqual(summary.points.at(-1), { x: 4, y: 6, low: 5, high: 8 });
});
