import test from 'node:test';
import assert from 'node:assert/strict';
import { diagramReferences } from './reference-library.js';
import { parseTutorDiagram } from './spec.js';

test('recursive forecasts consume prior predictions while direct forecasts keep the observed origin', () => {
  const ref = diagramReferences.find(item => item.id === 'ml-recursive-vs-direct-forecast');
  assert.ok(ref, 'The worked forecast comparison is registered');
  const [recursive, direct] = parseTutorDiagram(ref.spec).diagram.panels.map(panel => panel.diagram);
  const source = diagramReferences.find(item => item.id === 'forecast-horizon-uncertainty').spec.diagram;
  const origin = source.series[0].points.at(-1);
  assert.deepEqual(origin, { x: 4, y: 6 });
  assert.deepEqual(recursive.columns, direct.columns);
  assert.equal(recursive.rows.length, 3);
  assert.equal(direct.rows.length, 3);
  for (const [index, row] of recursive.rows.entries()) {
    const directRow = direct.rows[index];
    const day = origin.x + index + 1;
    assert.equal(row.heading, `Day ${day}`);
    assert.equal(directRow.heading, row.heading);
    assert.equal(directRow.id, row.id);
    const priorForecast = recursive.rows[index - 1]?.cells[2];
    assert.equal(row.cells[0], index ? `${priorForecast} pred.` : `${origin.y} actual`);
    assert.equal(directRow.cells[0], `${origin.y} actual`);
    assert.equal(Number(row.cells[1]), 0.5);
    for (const { cells: [input, offset, prediction] } of [row, directRow]) {
      assert.ok(Math.abs(Number.parseFloat(input) + Number(offset) - Number(prediction)) < 1e-12);
    }
  }
  assert.deepEqual(recursive.rows.map(row => Number(row.cells[2])), [6.5, 7, 7.5]);
  assert.deepEqual(direct.rows.map(row => Number(row.cells[2])), [6.5, 7.2, 7.8]);
});
