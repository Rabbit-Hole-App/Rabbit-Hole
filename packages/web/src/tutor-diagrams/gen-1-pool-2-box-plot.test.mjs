import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { lintDiagramContent } from './content-contract.js';
import { derived, observations } from './gen-1-pool-2-box-plot-data.js';
import { references } from './gen-1-pool-2-box-plot-references.js';
import { parseTutorDiagram } from './spec.js';
import { renderTutorDiagram } from './TutorDiagram.js';

function recompute({ readings }) {
  assert.equal(readings.length, 9);
  const ordered = readings.toSorted((a, b) => a - b);
  const q1 = (ordered[1] + ordered[2]) / 2;
  const q3 = (ordered[6] + ordered[7]) / 2;
  const iqr = q3 - q1;
  const lower = q1 - iqr - iqr / 2;
  const upper = q3 + iqr + iqr / 2;
  const inliers = ordered.filter(value => lower <= value && value <= upper);
  return {
    q1, median: ordered[4], q3, iqr, lower, upper,
    whiskerLow: Math.min(...inliers), whiskerHigh: Math.max(...inliers),
    outliers: ordered.filter(value => value < lower || value > upper),
  };
}

function marks(svg, name) {
  return [...svg.matchAll(new RegExp(`data-tutor-box-${name}="([^"]+)"`, 'g'))].map(match => Number(match[1]));
}

for (const { id, spec, depths } of references) {
  test(`${id} derives its summaries and caption numbers from the raw observations`, () => {
    const source = observations[id];
    const computed = derived()[id];
    const expected = source.groups.map(recompute);
    const allReadings = source.groups.flatMap(group => group.readings);
    assert.equal(computed.x.min, Math.min(...allReadings));
    assert.equal(computed.x.max, Math.max(...allReadings));
    assert.deepEqual(spec, depths.standard.spec);
    assert.deepEqual(Object.keys(depths), ['overview', 'standard', 'deep']);
    assert.equal(depths.overview.spec.diagram.boxes.length, 1);
    assert.equal(depths.standard.spec.diagram.boxes.length, source.groups.length);
    assert.equal(depths.deep.spec.diagram.boxes.length, source.groups.length);
    for (const [i, { box, lower, upper, iqr }] of computed.summaries.entries()) {
      const { label, outliers, ...quantiles } = box;
      assert.equal(label, source.groups[i].label);
      assert.deepEqual({ ...quantiles, lower, upper, iqr, outliers: outliers.map(outlier => outlier.value) }, expected[i]);
    }
    const focus = expected[0];
    const fence = focus.outliers[0] < focus.lower ? focus.lower : focus.upper;
    assert.deepEqual(depths.deep.spec.diagram.caption.match(/\d+/g).map(Number), [focus.iqr, fence, focus.outliers[0]]);
  });

  test(`${id} leaves fences to the parser and draws them beside observed outliers at every depth`, () => {
    for (const { spec: raw } of Object.values(depths)) {
      assert.deepEqual(lintDiagramContent(raw), []);
      assert.equal(raw.diagram.kind, 'box-plot');
      const expected = raw.diagram.boxes.map(box => recompute(observations[id].groups.find(group => group.label === box.label)));
      for (const box of raw.diagram.boxes) {
        assert.equal(Object.hasOwn(box, 'fences'), false);
        assert.equal(Object.hasOwn(box, 'values'), false);
      }
      const parsed = parseTutorDiagram(raw);
      assert.deepEqual(parsed.diagram.boxes.map(box => box.fences), expected.map(({ lower, upper }) => ({ lower, upper })));
      const rendered = renderTutorDiagram(raw, 408);
      assert.equal(rendered.width, 408);
      const svg = renderToStaticMarkup(rendered.element);
      assert.deepEqual(marks(svg, 'fence'), expected.flatMap(({ lower, upper }) => [lower, upper]));
      assert.deepEqual(marks(svg, 'outlier'), expected.flatMap(summary => summary.outliers));
    }
  });
}
