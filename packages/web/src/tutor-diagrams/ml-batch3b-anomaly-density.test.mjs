import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { lintDiagramContent } from '../../scripts/explanation-content-contract.mjs';
import { references } from './ml-batch3b-anomaly-density-references.js';
import { parseTutorDiagram } from './spec.js';
import { renderTutorDiagram } from './TutorDiagram.js';

const lofFormulas = [String.raw`$\mathrm{LOF}=(2/3)\div(2/9)=3$`, String.raw`$\mathrm{LOF}=(1/4)\div(1/4)=1$`];

function diagramFor(id) {
  const reference = references.find(item => item.id === id);
  assert.ok(reference, `The worked ${id} reference is available`);
  return parseTutorDiagram(reference.spec).diagram;
}

test('the normal density shows both strict three-sigma tails on the z-score axis', () => {
  const { x, y, series, annotations, caption } = diagramFor('ml-zscore-distribution-tails');
  assert.deepEqual(x, { label: 'Z-score', min: -4, max: 4 });
  assert.equal(y.label, 'Probability density');
  assert.equal(series.length, 1);
  const [{ kind, points }] = series;
  assert.equal(kind, 'line');
  assert.equal(points[0].x, -4);
  assert.equal(points.at(-1).x, 4);
  const densities = new Map(points.map(point => [point.x, point.y]));
  for (const [z, expected] of [[0, 0.398942], [1, 0.241971], [2, 0.053991], [3, 0.004432], [4, 0.000134]]) {
    assert.ok(Math.abs(densities.get(z) - expected) < 1e-6, `Density at ${z}`);
    assert.equal(densities.get(-z), densities.get(z));
  }
  for (const [index, point] of points.entries()) {
    assert.ok(point.y > 0);
    assert.equal(point.y, densities.get(-point.x));
    if (!index) continue;
    assert.ok(point.x > points[index - 1].x);
    assert.ok(point.x <= 0 ? point.y > points[index - 1].y : point.y < points[index - 1].y);
  }
  assert.deepEqual(annotations, [
    { kind: 'band', axis: 'x', from: -4, to: -3, label: '$z < -3$' },
    { kind: 'band', axis: 'x', from: 3, to: 4, label: '$z > 3$' },
  ]);
  assert.ok(caption.includes('$|z|>3$'));
});

test('the same nearest gap can have LOF 3 or 1 because the neighbourhood densities differ', () => {
  const { series, annotations, caption } = diagramFor('ml-local-outlier-factor');
  assert.deepEqual(series.map(row => row.points.map(point => point.x)), [[0, 1, 2, 3, 7], [15, 19, 23, 27, 31, 35, 39]]);
  const [denseRow, sparseRow] = series.map(row => row.points[0].y);
  assert.notEqual(denseRow, sparseRow);
  for (const row of series) assert.ok(row.points.every(point => point.y === row.points[0].y));
  assert.ok(caption.includes('$k=2$'));

  const samples = series.flatMap(row => row.points.map(point => point.x));
  const distance = (a, b) => Math.abs(a - b);
  const otherPoints = x => samples.filter(other => other !== x);
  const secondNearest = x => otherPoints(x).map(other => distance(x, other)).sort((a, b) => a - b)[1];
  const neighbours = x => otherPoints(x).filter(other => distance(x, other) <= secondNearest(x));
  const reachDistances = x => neighbours(x).map(other => Math.max(distance(x, other), secondNearest(other)));
  const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
  const density = x => 1 / mean(reachDistances(x));
  const lof = x => mean(neighbours(x).map(density)) / density(x);

  assert.deepEqual(neighbours(7), [2, 3]);
  assert.deepEqual(neighbours(7).map(secondNearest), [1, 2]);
  assert.deepEqual(reachDistances(7), [5, 4]);
  assert.deepEqual(neighbours(7).map(density), [2 / 3, 2 / 3]);
  assert.equal(density(7), 2 / 9);
  assert.equal(lof(7), 3);
  assert.deepEqual(neighbours(27), [23, 31]);
  assert.deepEqual(neighbours(27).map(secondNearest), [4, 4]);
  assert.deepEqual(reachDistances(27), [4, 4]);
  assert.deepEqual(neighbours(27).map(density), [1 / 4, 1 / 4]);
  assert.equal(density(27), 1 / 4);
  assert.equal(lof(27), 1);

  const gaps = annotations.filter(mark => mark.kind === 'segment');
  assert.deepEqual(gaps.map(({ from, to }) => [from, to]), [
    [{ x: 3, y: denseRow }, { x: 7, y: denseRow }],
    [{ x: 23, y: sparseRow }, { x: 27, y: sparseRow }],
  ]);
  assert.deepEqual(gaps.map(({ from, to }) => distance(from.x, to.x)), [4, 4]);
  const probes = annotations.filter(mark => mark.kind === 'point');
  assert.deepEqual(probes.map(({ x, y }) => [x, y]), [[7, denseRow], [27, sparseRow]]);
  assert.ok(probes[0].label.includes(`4 and 5. ${lofFormulas[0]}`));
  assert.ok(probes[1].label.includes(`4 and 4. ${lofFormulas[1]}`));
});

test('both lesson references round-trip, pass the content contract and render as single plots', () => {
  assert.equal(references.length, 2);
  for (const { id, lessons, spec } of references) {
    const saved = JSON.stringify(spec);
    assert.deepEqual(lessons, ['16']);
    assert.deepEqual(parseTutorDiagram(saved), spec);
    assert.deepEqual(lintDiagramContent(spec), []);
    for (const width of [320, 408, 720]) {
      const svg = renderToStaticMarkup(renderTutorDiagram(saved, width).element);
      assert.equal(svg, renderToStaticMarkup(renderTutorDiagram(spec, width).element));
      assert.doesNotMatch(svg, /NaN|Infinity|undefined|katex-error/);
      assert.equal(svg.match(/data-tutor-plot-area=""/g)?.length, 1, `${id} at ${width}px`);
      if (id === 'ml-zscore-distribution-tails') {
        assert.match(svg, /data-tutor-plot-band="\$z &lt; -3\$"/);
        assert.match(svg, /data-tutor-plot-band="\$z &gt; 3\$"/);
        assert.match(svg, /data-tutor-plot-series="Standard normal"/);
      } else {
        assert.equal(svg.match(/data-tutor-plot-segment="segment"/g)?.length, 2);
        assert.equal(svg.match(/data-tutor-plot-point=/g)?.length, 2);
        assert.equal(svg.match(/data-tutor-coordinate-point=/g)?.length, 12);
        for (const formula of lofFormulas) assert.ok(svg.includes(`data-tutor-tex="${formula}"`));
      }
    }
  }
});
