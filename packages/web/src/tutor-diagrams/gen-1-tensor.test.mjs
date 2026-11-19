import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderTutorDiagram } from './TutorDiagram.js';
import { lintDiagramContent } from './content-contract.js';
import { bookletJobs, granolaBatches, stereoFrame } from './gen-1-tensor-data.js';
import { references } from './gen-1-tensor-references.js';
import { parseTutorDiagram } from './spec.js';

function checkGrid(tensor, grid) {
  assert.equal(tensor.rows, grid.length);
  assert.equal(tensor.columns, grid[0].length);
  assert.equal(tensor.dimensions, `${grid.length} × ${grid[0].length}`);
  assert.deepEqual(tensor.values, grid.flat());
  assert.equal(tensor.values.length, tensor.rows * tensor.columns);
}

test('stereo frame preserves both channels and the spacing between sample instants', () => {
  checkGrid(stereoFrame.tensor, [[0, 3 * 10, -10, -2 * 10], [2 * 10, -2 * 10, 10, 0]]);
  assert.equal(stereoFrame.sampleIntervalUs * 8_000, 1_000_000);
  assert.equal(stereoFrame.frameSpanUs, 375);
  assert.equal(stereoFrame.frameSpanUs, (stereoFrame.tensor.columns - 1) * stereoFrame.sampleIntervalUs);
});

test('granola rows scale both ingredients and the largest batch sums to its column amounts', () => {
  assert.deepEqual(granolaBatches.scales, [1, 2, 3]);
  assert.equal(granolaBatches.oatsGrams, 15);
  assert.equal(granolaBatches.raisinsGrams, 8);
  checkGrid(granolaBatches.tensor, [[15, 8], [15 + 15, 8 + 8], [15 + 15 + 15, 8 + 8 + 8]]);
  assert.equal(granolaBatches.largestBatchGrams, 45 + 24);
});

test('booklet job rows convert folded sheets to pages and the queue totals agree', () => {
  assert.equal(bookletJobs.pagesPerSheet, 2 + 2);
  checkGrid(bookletJobs.tensor, [3, 5, 2, 4].map(sheets => [sheets * 4]));
  assert.equal(bookletJobs.totalSheets, 3 + 5 + 2 + 4);
  assert.equal(bookletJobs.totalPages, 12 + 20 + 8 + 16);
  assert.equal(bookletJobs.totalPages, bookletJobs.totalSheets * bookletJobs.pagesPerSheet);
});

const expected = {
  'pool-stereo-audio-frame': stereoFrame.tensor,
  'pool-granola-batch-ingredients': granolaBatches.tensor,
  'pool-booklet-press-pages': bookletJobs.tensor,
};

for (const reference of references) {
  test(`${reference.id} renders the same populated grid at native 408 px through all depths`, () => {
    assert.deepEqual(Object.keys(reference.depths), ['overview', 'standard', 'deep']);
    assert.equal(reference.spec, reference.depths.standard.spec);
    const { rows, columns, dimensions, values } = expected[reference.id];
    for (const { spec } of Object.values(reference.depths)) {
      const { diagram } = parseTutorDiagram(spec);
      assert.deepEqual(lintDiagramContent(spec), []);
      assert.equal(diagram.kind, 'tensor');
      assert.equal(diagram.tensor.rows, rows);
      assert.equal(diagram.tensor.columns, columns);
      assert.equal(diagram.tensor.dimensions, dimensions);
      assert.deepEqual(diagram.tensor.values, values);

      const { element, width } = renderTutorDiagram(spec, 408);
      assert.equal(width, 408);
      const svg = renderToStaticMarkup(element);
      assert.doesNotMatch(svg, /NaN|Infinity|undefined/);
      assert.deepEqual([...svg.matchAll(/data-tutor-tensor-cell="([0-9]+)"/g)].map(([, i]) => Number(i)),
        values.map((_, i) => i));
      for (const value of values) assert.ok(svg.includes(`>${value}</tspan>`));
      assert.ok(svg.includes(`>${dimensions}</tspan>`));
    }
  });
}
