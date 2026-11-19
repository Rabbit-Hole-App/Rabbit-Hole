import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { lintDiagramContent } from './content-contract.js';
import { derived, skateRentals } from './gen-1-pool-2-histogram-data.js';
import { references } from './gen-1-pool-2-histogram-references.js';
import { parseTutorDiagram } from './spec.js';
import { renderTutorDiagram } from './TutorDiagram.js';

const { durations, binWidth } = skateRentals;
const bins = Math.ceil(Math.max(...durations) / binWidth);
const counts = Array(bins).fill(0);
for (const minutes of durations) counts[Math.min(bins - 1, Math.floor(minutes / binWidth))]++;
const shares = counts.map(count => count / durations.length);
const [reference] = references;

test('rental bins partition the input durations and the caption uses the computed peak', () => {
  const numbers = derived();
  assert.deepEqual(numbers.counts, counts);
  assert.equal(counts.reduce((sum, count) => sum + count, 0), durations.length);
  const ordered = durations.toSorted((a, b) => a - b);
  const middle = ordered.length / 2;
  assert.equal(numbers.median, (ordered[middle - 1] + ordered[middle]) / 2);
  const peakIndex = counts.indexOf(Math.max(...counts));
  assert.deepEqual(numbers.peak, {
    lower: peakIndex * binWidth,
    upper: (peakIndex + 1) * binWidth,
    count: counts[peakIndex],
    proportion: shares[peakIndex],
  });
  const { caption } = reference.depths.deep.spec.diagram;
  const shown = [...caption.matchAll(/\d+(?:\.\d+)?/g)].map(([number]) => Number(number));
  assert.deepEqual(shown, [numbers.total, numbers.peak.count, numbers.peak.lower, numbers.peak.upper, numbers.peak.proportion]);
});

test('all depths keep raw counts and the renderer fills bin proportions at 408 px', () => {
  assert.deepEqual(Object.keys(reference.depths), ['overview', 'standard', 'deep']);
  for (const { spec } of Object.values(reference.depths)) {
    assert.equal(spec.diagram.measure, 'proportion');
    assert.deepEqual(spec.diagram.series[0].values, counts);
    assert.deepEqual(lintDiagramContent(spec), []);
    const values = parseTutorDiagram(spec).diagram.series[0].values;
    assert.deepEqual(values, shares);
    assert.ok(Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) < 1e-12);
    const { element, width } = renderTutorDiagram(spec, 408);
    const svg = renderToStaticMarkup(element);
    const barMasses = [...svg.matchAll(/data-tutor-bin-mass="([^"]+)"/g)].map(([, value]) => Number(value));
    assert.equal(width, 408);
    assert.deepEqual(barMasses, shares);
    assert.deepEqual(spec.diagram.series[0].values, counts);
  }
});
