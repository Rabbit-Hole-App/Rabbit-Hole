import test from 'node:test';
import assert from 'node:assert/strict';
import { computeTable } from './inline-compute.js';
import { validateGraph } from '../../control-plane/src/learn-graph-schema.js';
const table = { columns: ['Time', 'Distance'], rows: [['0', '0.1'], ['1', '0.2'], ['2', '0.3']] };
const operation = { type: 'table_summary', targetId: 'measurements', columns: [1], units: ['m'] };
test('summaries read actual cells, preserve source and report units/count/calculated values', () => {
  const before = JSON.stringify(table), result = computeTable(table, operation);
  assert.equal(result.ok, true);
  assert.deepEqual(result.content.rows, [['Distance', 'm', '3', '0.6', '0.1', '0.3', '0.2']]);
  assert.equal(JSON.stringify(table), before);
  assert.deepEqual(result.evidence, { targetId: 'measurements', columns: [1], units: ['m'], rows: 3 });
});
test('compensated sum retains a small value between cancelling magnitudes', () => {
  const result = computeTable({ columns: ['Value'], rows: [['1000000000000'], ['0.1'], ['-1000000000000']] }, { ...operation, columns: [0] });
  assert.equal(result.ok, true); assert.equal(result.content.rows[0][3], '0.1');
});
test('plots use the existing schema and actual paired cells with no generated/interpolated values', () => {
  const result = computeTable(table, { ...operation, type: 'table_plot', xColumn: 0, xUnit: 's' });
  assert.equal(result.ok, true); validateGraph(result.content);
  assert.deepEqual(result.content.traces[0].x, [0, 1, 2]); assert.deepEqual(result.content.traces[0].y, [0.1, 0.2, 0.3]);
  assert.equal(result.content.traces[0].type, 'scatter');
});
test('missing or malformed values never silently coerce to zero', () => {
  for (const value of ['', ' ', '0x10', '3 m', 'NaN', 'Infinity', '1/2', '9007199254740993', '1e-999']) {
    assert.equal(computeTable({ columns: ['Value'], rows: [[value]] }, { ...operation, columns: [0] }).ok, false, value);
  }
});
test('model-provided answers, duplicate columns and implicit units are refused', () => {
  for (const patch of [{ result: 42 }, { columns: [1, 1], units: ['m', 'm'] }, { columns: [-1] }, { units: [''] }, { units: [' m'] }, { xColumn: 0 }])
    assert.equal(computeTable(table, { ...operation, ...patch }).ok, false);
});
test('plots refuse mixed units, absent X identity, and oversized tables rather than truncating', () => {
  const plot = { ...operation, type: 'table_plot', xColumn: 0, xUnit: 's' };
  assert.equal(computeTable(table, { ...plot, xUnit: '' }).ok, false);
  assert.equal(computeTable(table, { ...plot, xColumn: 1 }).ok, false);
  assert.equal(computeTable({ ...table, rows: Array.from({ length: 1001 }, () => ['1', '2']) }, plot).ok, false);
  assert.equal(computeTable({ columns: ['X', 'Y', 'Z'], rows: [['1', '2', '3']] }, { ...plot, columns: [1, 2], units: ['m', 's'] }).ok, false);
});
test('computed integer totals outside exact numeric range fail instead of rounding silently', () => {
  assert.equal(computeTable({ columns: ['Value'], rows: [['9007199254740991'], ['1']] }, { ...operation, columns: [0] }).ok, false);
});
test('a nonzero mean below representable range is refused instead of silently becoming zero', () => {
  assert.equal(computeTable({ columns: ['Value'], rows: [['5e-324'], ['0']] }, { ...operation, columns: [0] }).ok, false);
});
test('sparse input arrays and oversized generated graph payloads fail closed', () => {
  assert.equal(computeTable(table, { ...operation, columns: Array(1) }).ok, false);
  assert.equal(computeTable(table, { ...operation, units: Array(1) }).ok, false);
  assert.equal(computeTable({ ...table, rows: Array(1) }, operation).ok, false);
  assert.equal(computeTable({ ...table, columns: Array(2) }, operation).ok, false);
  const large = { columns: Array.from({ length: 9 }, (_, i) => `Column ${i}`), rows: Array.from({ length: 1000 }, () => Array(9).fill('0.1234567890123456')) };
  assert.equal(computeTable(large, { type: 'table_plot', targetId: 'measurements', columns: [1, 2, 3, 4, 5, 6, 7, 8], units: Array(8).fill('m'), xColumn: 0, xUnit: 's' }).ok, false);
});
