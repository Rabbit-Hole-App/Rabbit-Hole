import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { aisles, derived, spotTallies } from './gen-1-pool-2-heatmap-data.js';
import { references } from './gen-1-pool-2-heatmap-references.js';
import { parseTutorDiagram } from './spec.js';
import { renderTutorDiagram } from './TutorDiagram.js';

const cells = spotTallies.map(({ tallies }) => tallies.map(([first, second]) => first + second));
const flat = cells.flat().sort((a, b) => a - b);
const expectedRange = { min: flat[0], max: flat.at(-1) };

test('craft market cells, extremes and scale span follow the volunteer tallies', () => {
  const computed = derived();
  assert.deepEqual(computed.rows.map(row => row.cells), cells);
  assert.equal(computed.lowest.value, expectedRange.min);
  assert.equal(computed.highest.value, expectedRange.max);
  assert.equal(computed.spread, expectedRange.max - expectedRange.min);
  for (const { row, column, value } of [computed.lowest, computed.highest]) {
    assert.equal(cells[row][column], value);
  }
  assert.match(references[0].depths.deep.spec.diagram.caption,
    new RegExp(`show ${expectedRange.min} and ${expectedRange.max} visits\\. The scale spans ${computed.spread} visits\\.$`));
});

test('the parser fills the range from the cells and the renderer draws every tally at every depth', () => {
  for (const [level, { spec }] of Object.entries(references[0].depths)) {
    assert.equal(spec.diagram.range, undefined, level);
    assert.deepEqual(spec.diagram.columns, aisles, level);
    const parsed = parseTutorDiagram(spec);
    assert.deepEqual(parsed.diagram.range, expectedRange, level);
    assert.deepEqual(parsed.diagram.rows.map(row => row.cells), cells, level);
    const svg = renderToStaticMarkup(renderTutorDiagram(spec, 408).element);
    assert.equal([...svg.matchAll(/data-tutor-heatmap-cell=/g)].length, flat.length, level);
    assert.match(svg, new RegExp(`>${expectedRange.min}</tspan>`));
    assert.match(svg, new RegExp(`>${expectedRange.max}</tspan>`));
  }
});
