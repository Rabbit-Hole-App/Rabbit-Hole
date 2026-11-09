import test from 'node:test';
import assert from 'node:assert/strict';
import { diagramReferences } from './reference-library.js';
import { parseTutorDiagram } from './spec.js';

test('the PSI table uses the shared histogram bins and sums the full-precision log terms', () => {
  const ref = diagramReferences.find(item => item.id === 'ml-psi-bin-contributions');
  assert.ok(ref, 'The worked PSI reference is registered');
  const [histogram, table] = parseTutorDiagram(ref.spec).diagram.panels.map(panel => panel.diagram);
  const source = diagramReferences.find(item => item.id === 'aligned-distribution-drift').spec.diagram;
  assert.deepEqual(histogram.binEdges, source.binEdges);
  assert.deepEqual(histogram.series.map(series => series.values), source.series.map(series => series.values));
  const [reference, current] = histogram.series.map(series => series.values);
  const sum = values => values.reduce((total, value) => total + value, 0);
  for (const shares of [reference, current]) {
    assert.ok(shares.every(share => share > 0));
    assert.ok(Math.abs(sum(shares) - 1) < 1e-12);
  }

  const parts = reference.map((p, i) => (current[i] - p) * Math.log(current[i] / p));
  assert.ok(parts.every(part => part >= 0));
  assert.equal(parts[2], 0, 'An unchanged share contributes zero');
  const total = table.rows.at(-1);
  const bins = table.rows.slice(0, -1);
  assert.equal(bins.length, parts.length);
  for (const [i, row] of bins.entries()) {
    const end = i === parts.length - 1 ? ']' : ')';
    assert.equal(row.heading, `[${histogram.binEdges[i]}, ${histogram.binEdges[i + 1]}${end}`);
    assert.deepEqual(row.cells, [`${reference[i] * 100}%`, `${current[i] * 100}%`, parts[i].toFixed(4)]);
  }
  assert.deepEqual(total.cells, ['100%', '100%', sum(parts).toFixed(4)]);
  assert.equal(total.cells[2], '0.6958');
  const largest = parts.indexOf(Math.max(...parts));
  assert.ok(table.emphasis.cells.some(cell => cell.row === bins[largest].id && cell.column === 2));
});
