import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { lintDiagramContent } from '../../scripts/explanation-content-contract.mjs';
import { mleBernoulliReference } from './ml-mle-bernoulli-reference.js';
import { plotSeriesPoints } from './ml-plot-spec.js';
import { parseTutorDiagram } from './spec.js';
import { renderTutorDiagram } from './TutorDiagram.js';

const { spec, depths } = mleBernoulliReference;
const specs = [depths.overview.spec, spec, depths.deep.spec];

// Count outcomes exactly by treating each flip as ten equiprobable choices,
// of which biasTenths produce heads.
function sevenHeadOutcomes(biasTenths) {
  let counts = [1];
  for (let flips = 1; flips <= 10; flips++) {
    counts = Array.from({ length: flips + 1 }, (_, heads) =>
      (counts[heads] ?? 0) * (10 - biasTenths) + (counts[heads - 1] ?? 0) * biasTenths);
  }
  return counts[7];
}

test('coin likelihood varies only the bias and marks its maximum at seven tenths', () => {
  assert.equal(sevenHeadOutcomes(5) / 10 ** 10, 120 / 1024);
  assert.equal(sevenHeadOutcomes(7), 120 * 7 ** 7 * 3 ** 3);
  const rounded = p => Number((sevenHeadOutcomes(Math.round(10 * p)) / 10 ** 10).toFixed(4));
  for (const variant of specs) {
    const { diagram } = parseTutorDiagram(variant);
    const [likelihood] = diagram.series;
    assert.equal(likelihood.kind, 'line');
    assert.deepEqual(plotSeriesPoints(likelihood), Array.from({ length: 11 }, (_, i) => ({ x: i / 10, y: rounded(i / 10) })));
    const points = plotSeriesPoints(likelihood);
    const peak = diagram.annotations.find(mark => mark.kind === 'point' && mark.x === 7 / 10);
    assert.equal(peak.y, rounded(0.7));
    assert.ok(points.every(point => point.x === peak.x || point.y < peak.y));
    for (const mark of diagram.annotations) assert.equal(mark.y, rounded(mark.x));
  }
  assert.ok(spec.diagram.annotations.some(mark => mark.kind === 'point' && mark.x === 0.5));
});

test('the likelihood reference passes the content contract and renders at 408', () => {
  for (const variant of specs) {
    assert.deepEqual(lintDiagramContent(variant), []);
    assert.match(variant.diagram.caption, /^Worked example\./);
    const svg = renderToStaticMarkup(renderTutorDiagram(variant, 408).element);
    assert.match(svg, /Best bias/);
    assert.doesNotMatch(svg, /NaN|Infinity|katex-error/);
  }
  const detailed = renderToStaticMarkup(renderTutorDiagram(depths.deep.spec, 408).element);
  assert.match(detailed, /class="katex"/);
  const fallback = detailed.slice(detailed.lastIndexOf('data-explanation-skip'));
  // Owner decision 2026-11-12 (readable fallback for maths): the native text writes subscripts and exponents as Unicode.
  assert.match(fallback, /L\(p\)=120p⁷\(1-p\)³/);
});
