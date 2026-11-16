import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { lintDiagramContent } from '../../scripts/explanation-content-contract.mjs';
import { references } from './ml-batch4a-logistic-references.js';
import { parseTutorDiagram } from './spec.js';
import { renderTutorDiagram } from './TutorDiagram.js';

const score = ({ x, y }) => x + y - 6;
const probability = point => 1 / (1 + Math.exp(-score(point)));

function referenceSpec() {
  const reference = references.find(item => item.id === 'ml-logistic-decision-boundary');
  assert.ok(reference, 'The worked logistic boundary reference is available');
  assert.deepEqual(reference.lessons, ['03']);
  return reference.spec;
}

test('the two linear boundaries have slope minus one and the correct cutoff probability', () => {
  const diagram = parseTutorDiagram(referenceSpec()).diagram;
  assert.deepEqual(diagram.x, { label: 'Hours studied', min: 0, max: 8 });
  assert.deepEqual(diagram.y, { label: 'Practice quizzes', min: 0, max: 8 });
  const lines = diagram.series.filter(series => series.kind === 'line');
  assert.equal(lines.length, 2);
  for (const [index, threshold, expectedScore] of [[0, 0.5, 0], [1, 0.75, Math.log(3)]]) {
    const { points, label } = lines[index];
    assert.ok(label.startsWith(`${100 * threshold}% cutoff`));
    assert.equal(points.length, 2);
    const [verticalIntercept, horizontalIntercept] = points;
    assert.equal(verticalIntercept.x, 0);
    assert.equal(horizontalIntercept.y, 0);
    assert.equal(verticalIntercept.y, horizontalIntercept.x);
    for (const point of points) {
      assert.ok(Math.abs(score(point) - expectedScore) < 1e-12);
      assert.ok(Math.abs(probability(point) - threshold) < 1e-12);
    }
  }
  assert.ok(lines[1].points[0].y > lines[0].points[0].y);
  assert.ok(lines[1].points[1].x > lines[0].points[1].x);
  assert.match(diagram.caption, /Predict Pass on or above/);
});

test('the fixed probe falls between cutoffs and flips class at the higher cutoff', () => {
  const { annotations } = parseTutorDiagram(referenceSpec()).diagram;
  const probe = annotations.find(annotation => annotation.kind === 'point');
  assert.ok(probe);
  assert.deepEqual([probe.x, probe.y], [3.5, 3]);
  assert.equal(score(probe), 0.5);
  const p = probability(probe);
  assert.equal((100 * p).toFixed(1), '62.2');
  assert.ok(p >= 0.5 && p < 0.75);
  assert.ok(probability({ x: probe.x, y: probe.y + 1 }) > 0.75);
  assert.match(probe.label, /62\.2\\%.*Pass at 50%.*Not pass at 75%/);
});

test('the saved reference passes content lint and draws the two distinguishable boundaries and probe', () => {
  const spec = referenceSpec();
  const saved = JSON.stringify(spec);
  assert.equal(spec.diagram.kind, 'coordinate-plot');
  assert.deepEqual(parseTutorDiagram(saved), spec);
  assert.deepEqual(lintDiagramContent(spec), []);
  for (const width of [320, 408, 720]) {
    const svg = renderToStaticMarkup(renderTutorDiagram(saved, width).element);
    assert.equal(svg, renderToStaticMarkup(renderTutorDiagram(spec, width).element));
    assert.doesNotMatch(svg, /NaN|Infinity|undefined|katex-error/);
    assert.equal(svg.match(/data-tutor-plot-area=""/g)?.length, 1);
    const lines = svg.match(/<path [^>]*data-tutor-plot-series="[^"\n]+"[^>]*>/g);
    assert.equal(lines?.length, 2);
    assert.doesNotMatch(lines[0], /stroke-dasharray/);
    assert.match(lines[1], /stroke-dasharray/);
    assert.match(svg, /data-tutor-plot-point="3.5,3"/);
    assert.ok(svg.includes(String.raw`data-tutor-tex="$x+y=6$"`));
    assert.ok(svg.includes(String.raw`data-tutor-tex="$x+y=6+\ln 3$"`));
    assert.ok(svg.includes(String.raw`data-tutor-tex="$p\approx62.2\%$"`));
  }
});
