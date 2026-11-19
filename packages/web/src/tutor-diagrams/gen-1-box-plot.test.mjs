import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { lintDiagramContent } from './content-contract.js';
import { firedTileWidths, sunflowerHeights } from './gen-1-box-plot-data.js';
import { references } from './gen-1-box-plot-references.js';
import { parseTutorDiagram } from './spec.js';
import { renderTutorDiagram } from './TutorDiagram.js';

const examples = new Map([
  ['pool-sunflower-tray-heights', sunflowerHeights],
  ['pool-fired-tile-widths', firedTileWidths],
]);

for (const ref of references) {
  const data = examples.get(ref.id);

  test(`${ref.id} derives quartiles, fences, whiskers and outliers from the raw sample`, () => {
    const drawn = [];
    for (const { readings, iqr, fences, box } of data.groups) {
      const ordered = readings.toSorted((a, b) => a - b);
      assert.equal(ordered.length % 4, 0);
      const [q1, median, q3] = [0.25, 0.5, 0.75].map(fraction => {
        const rank = fraction * ordered.length;
        return (ordered[rank - 1] + ordered[rank]) / 2;
      });
      const expectedIqr = q3 - q1;
      const lower = q1 - 1.5 * expectedIqr;
      const upper = q3 + 1.5 * expectedIqr;
      const whiskerLow = ordered.find(value => value >= lower);
      const whiskerHigh = ordered.findLast(value => value <= upper);
      const beyondWhiskers = ordered.filter(value => value < whiskerLow || value > whiskerHigh);
      assert.deepEqual([box.q1, box.median, box.q3], [q1, median, q3]);
      assert.equal(iqr, expectedIqr);
      assert.deepEqual(fences, { lower, upper });
      assert.deepEqual([box.whiskerLow, box.whiskerHigh], [whiskerLow, whiskerHigh]);
      assert.deepEqual((box.outliers ?? []).map(point => point.value), beyondWhiskers);
      drawn.push(...ordered);
      if (beyondWhiskers.length) drawn.push(lower, upper);
    }
    assert.equal(data.x.min, Math.floor(Math.min(...drawn) / 5) * 5);
    assert.equal(data.x.max, Math.ceil(Math.max(...drawn) / 5) * 5);
  });

  test(`${ref.id} renders each depth as one box plot at 408 px`, () => {
    assert.deepEqual(Object.keys(ref.depths), ['overview', 'standard', 'deep']);
    assert.equal(ref.spec, ref.depths.standard.spec);
    for (const { spec } of Object.values(ref.depths)) {
      const { diagram } = parseTutorDiagram(spec);
      assert.equal(diagram.kind, 'box-plot');
      assert.deepEqual(diagram.x, data.x);
      assert.deepEqual(lintDiagramContent(spec), []);
      for (const box of diagram.boxes) {
        const { box: authored, fences } = data.groups.find(group => group.box.label === box.label);
        assert.deepEqual(box, authored.outliers ? { ...authored, fences } : authored);
      }

      const { element, width } = renderTutorDiagram(spec, 408);
      assert.equal(width, 408);
      const svg = renderToStaticMarkup(element);
      assert.doesNotMatch(svg, /NaN|Infinity/);
      for (const box of diagram.boxes) assert.ok(svg.includes(`>${box.label}</tspan>`));
      const marks = key => [...svg.matchAll(new RegExp(`data-tutor-box-${key}="([^"]+)"`, 'g'))].map(match => Number(match[1]));
      assert.deepEqual(marks('median'), diagram.boxes.map(box => box.median));
      assert.deepEqual(marks('fence'), diagram.boxes.flatMap(box => box.fences ? [box.fences.lower, box.fences.upper] : []));
      assert.deepEqual(marks('outlier'), diagram.boxes.flatMap(box => (box.outliers ?? []).map(point => point.value)));
    }
  });
}
