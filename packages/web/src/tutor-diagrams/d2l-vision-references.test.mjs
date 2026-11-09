import assert from 'node:assert/strict';
import { test } from 'node:test';
import { d2lVisionReferences } from './d2l-vision-references.js';
import { pixels, sequenceReadings } from './d2l-vision-data.js';

const find = id => d2lVisionReferences.find(record => record.id === 'd2l-' + id);
const rows = (id, depth = 'standard', key = 'spec') => {
  const record = find(id);
  return (record.depths[depth] ?? record)[key].diagram.rows.map(row => row.cells);
};
const verifyProbabilities = cells => {
  for (const row of cells) {
    assert.ok(row.every(value => value === null || (value >= 0 && value <= 1)));
    assert.ok(Math.abs(row.reduce((sum, value) => sum + (value ?? 0), 0) - 1) < 1e-9);
  }
};

test('CNN references retain the worked convolution, channel and window results', () => {
  assert.deepEqual(rows('convolution-window-arithmetic').map(row => row[2]), ['4', '-1', '4', '0', '7']);
  assert.deepEqual(rows('convolution-input-channel-sum').map(row => row[0]), ['7', '4', '11']);
  const mixing = find('pointwise-channel-mixing').spec.diagram;
  assert.deepEqual(mixing.before.items[0].tensor.values, [2, 6]);
  assert.deepEqual(mixing.after.items[0].tensor.values, [-4, 10, 1]);
  const stride = rows('convolution-axis-strides', 'deep', 'detailSpec');
  assert.equal(stride.length, 4);
  assert.ok(stride.every(row => row.length === 3));
  const expectedMaxima = pixels.slice(0, -1).map((row, i) => row.slice(0, -1).map((value, j) =>
    Math.max(value, row[j + 1], pixels[i + 1][j], pixels[i + 1][j + 1])));
  assert.deepEqual(rows('max-pooling-windows', 'standard', 'detailSpec'), expectedMaxima);
});

test('forecast lines share a first estimate and separate only when measured inputs stop', () => {
  const [observed, refreshed, recursive] = find('forecast-feedback-error').spec.diagram.series;
  assert.deepEqual(observed.points.map(({ x, y }) => y === sequenceReadings[x - 1]), Array(6).fill(true));
  assert.deepEqual(refreshed.points[0], recursive.points[0]);
  assert.notEqual(refreshed.points[1].y, recursive.points[1].y);
  const [earlier, latest, output] = rows('forecast-feedback-error', 'deep', 'detailSpec')[0];
  assert.ok(Math.abs(Number(output) - (0.2 * Number(earlier) + 0.65 * Number(latest) + 0.45)) < 1e-9);
});

test('a local loss adds to the recurrent gradient arriving from the next state', () => {
  assert.deepEqual(rows('recurrent-weight-gradient-sum'), [
    ['0', '1', '0'], ['3', '2', '6'], ['6.5', '2', '13'], ['—', '—', '19'],
  ]);
});

test('the largest padded score is excluded before valid attention weights are normalized', () => {
  const raw = rows('attention-valid-length-padding', 'deep');
  assert.equal(raw[0][2], Math.max(...raw[0]));
  const normalized = rows('attention-valid-length-padding', 'deep', 'detailSpec');
  assert.deepEqual(normalized[0].slice(2), [null, null, null, null]);
  assert.deepEqual(normalized[1].slice(4), [null, null]);
  verifyProbabilities(normalized);
  const additive = rows('attention-additive-score-projection', 'standard', 'detailSpec');
  assert.equal(additive[0].at(-1), null);
  verifyProbabilities(additive);
  const cross = rows('transformer-cross-attention-grid-padding');
  assert.ok(cross.every(row => row.slice(4).every(value => value === null)));
  verifyProbabilities(cross);
});

test('the broader bandwidth moves share beyond the nearest keys', () => {
  const narrow = rows('attention-bandwidth-weight-spread');
  const broad = rows('attention-bandwidth-weight-spread', 'standard', 'detailSpec');
  verifyProbabilities(narrow);
  verifyProbabilities(broad);
  for (let i = 0; i < narrow.length; i++) {
    assert.ok(Math.max(...narrow[i]) > Math.max(...broad[i]));
  }
});
