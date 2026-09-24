import test from 'node:test';
import assert from 'node:assert/strict';
import { formatCell } from './scene-format.js';
import { evaluateScene } from './scene-evaluate.js';
import { round } from './scene-derive.js';

test('cells keep the leading zero and two decimals at every magnitude', () => {
  const cases = [[0, '0.00'], [0.04, '0.04'], [0.9, '0.90'], [1, '1.00'], [9.99, '9.99'], [10.01, '10.01'], [19.795, '19.80'], [123.4, '123.40']];
  for (const [value, text] of cases) assert.equal(formatCell(value), text, String(value));
});

test('negative decimals keep sign and leading zero; a value rounding to zero is not "-0.00"', () => {
  assert.equal(formatCell(-0.25), '-0.25');
  assert.equal(formatCell(-0.81), '-0.81');
  assert.equal(formatCell(-2.5), '-2.50');
  assert.equal(formatCell(-10.01), '-10.01');
  assert.equal(formatCell(-0.001), '0.00');
  assert.equal(formatCell(-0), '0.00');
});

test('whole numbers only where the object asks for them', () => {
  assert.equal(formatCell(14, 'integer'), '14');
  assert.equal(formatCell(50256, 'integer'), '50256');
  assert.equal(formatCell(-0.2, 'integer'), '0');
  assert.equal(formatCell(10), '10.00', 'size alone never makes a cell an integer');
});

// A value just past a half step used to be rounded twice - to three decimals by
// the derive op, then to two by the cell - and printed its neighbour's digit:
// 0.0451 -> 0.045 -> "0.04". The cell now formats the canonical value once.
test('no double rounding: a derived cell prints the canonical value\'s own last digit', () => {
  assert.equal(round(0.0451).toFixed(2), '0.04', 'the old two-step path, for the record');
  const scene = {
    id: 'double-rounding', title: 'double rounding', width: 200, height: 80, duration: 1,
    exampleData: { raw: [0.451, 0.449, 3.3851] },
    derived: { scaled: { op: 'scale', args: ['raw', 0.1] }, caption: { op: 'pick', args: ['scaled', 0] } },
    objects: [
      { id: 'cells', type: 'grid', initialState: { x: 10, y: 10, rows: 1, cols: 3, cell: 40, matrixKind: 'derived', values: { $derive: 'scaled' } } },
      { id: 'note', type: 'text', initialState: { x: 10, y: 70, text: 'first = {{caption}}' } },
    ],
    timeline: [],
  };
  const { state } = evaluateScene(scene, 1, {});
  const cells = state.objects.find(o => o.id === 'cells').values.map(value => formatCell(value));
  assert.deepEqual(cells, ['0.05', '0.04', '0.34']);
  // Captions keep the rounding they were authored against: three decimals.
  assert.equal(state.objects.find(o => o.id === 'note').label, 'first = 0.045');
});
