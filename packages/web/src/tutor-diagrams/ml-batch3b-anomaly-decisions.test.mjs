import assert from 'node:assert/strict';
import test from 'node:test';
import { Children } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { lintDiagramContent } from '../../scripts/explanation-content-contract.mjs';
import { references } from './ml-batch3b-anomaly-decisions-references.js';
import { parseTutorDiagram } from './spec.js';
import { renderTutorDiagram } from './TutorDiagram.js';

const runId = 'ml-collective-anomaly-run';
const rankingId = 'ml-ranked-anomaly-scores';
const widths = [320, 408, 720];
const children = element => Children.toArray(element.props.children);
const lines = element => children(element).map(line => line.props.children).join(' ');

function referenceFor(id) {
  const reference = references.find(entry => entry.id === id);
  assert.ok(reference, `${id} must be available as an author reference`);
  return reference;
}

test('six consecutive individually normal counts trigger the first alert at minute 12', () => {
  const { lessons, prompts, spec: { diagram } } = referenceFor(runId);
  assert.deepEqual(lessons, ['16']);
  assert.deepEqual(prompts, ['How can several normal readings in a row be a collective anomaly?']);
  assert.equal(diagram.kind, 'coordinate-plot');
  assert.equal(diagram.series.length, 1);
  const [{ kind, points }] = diagram.series;
  assert.equal(kind, 'line');
  assert.deepEqual(points.map(({ x }) => x), Array.from({ length: 12 }, (_, i) => i + 1));
  assert.deepEqual(points.map(({ y }) => y), [2, 5, 4, 2, 5, 3, 5, 5, 5, 5, 5, 5]);
  assert.deepEqual([diagram.x.min, diagram.x.max], [1, 12]);
  assert.ok(diagram.y.min <= 0 && diagram.y.max >= 5);

  assert.match(diagram.caption, /\b0 to 5\b/);
  assert.match(diagram.caption, /6 consecutive minutes with 5 failures each/);
  assert.match(diagram.caption, /minute 12/);
  let streak = 0;
  const triggerMinutes = [];
  for (const { x: minute, y: count } of points) {
    assert.ok(count >= 0 && count <= 5);
    streak = count === 5 ? streak + 1 : 0;
    if (streak === 6) triggerMinutes.push(minute);
  }
  assert.deepEqual(triggerMinutes, [12]);
  const [trigger] = triggerMinutes;
  const band = diagram.annotations.find(annotation => annotation.kind === 'band');
  assert.deepEqual([band.axis, band.from, band.to], ['x', trigger - 5, trigger]);
  const flag = diagram.annotations.find(annotation => annotation.kind === 'point');
  assert.deepEqual([flag.x, flag.y], [trigger, points[trigger - 1].y]);
  assert.match(flag.label, /flag/i);
});

test('raising the review cutoff changes the cases selected from one fixed ranking', () => {
  const { lessons, prompts, spec: { diagram } } = referenceFor(rankingId);
  assert.deepEqual(lessons, ['16']);
  assert.deepEqual(prompts, ['How do I rank anomaly scores and decide which cases to review?']);
  assert.equal(diagram.kind, 'bar-chart');
  assert.deepEqual(diagram.bars.map(bar => [bar.label, bar.value]), [
    ['Case A', 0.92], ['Case B', 0.81], ['Case C', 0.7], ['Case D', 0.44], ['Case E', 0.27],
  ]);
  assert.match(diagram.caption, /Higher scores mean more unusual/);
  for (const [cutoff, cases, statedDecision] of [
    [0.75, ['Case A', 'Case B'], /minimum score of 0\.75, review A and B/],
    [0.85, ['Case A'], /minimum of 0\.85, review A only/],
  ]) {
    assert.deepEqual(diagram.bars.filter(({ value }) => value >= cutoff).map(({ label }) => label), cases);
    assert.match(diagram.caption, statedDecision);
  }
});

test('both references round-trip as lint-clean saved version 1 diagrams', () => {
  for (const id of [runId, rankingId]) {
    const { spec } = referenceFor(id);
    assert.equal(spec.version, 1);
    assert.deepEqual(parseTutorDiagram(JSON.stringify(spec)), spec);
    assert.deepEqual(lintDiagramContent(spec), [], id);
  }
});

function renderMarks(id, width) {
  const { spec } = referenceFor(id);
  const { element, width: renderedWidth, height } = renderTutorDiagram(JSON.stringify(spec), width);
  const svg = renderToStaticMarkup(element);
  assert.match(svg, /^<svg .*role="img"/);
  assert.doesNotMatch(svg, /NaN|Infinity|undefined|katex-error/);
  assert.ok(renderedWidth >= width && Number.isFinite(height) && height > 0);
  const frame = children(element);
  assert.equal(lines(frame.at(-1)), spec.diagram.caption);
  return children(frame.find(part => part.type === 'g'));
}

test('the run band and flag align with the observed counts at all three widths', () => {
  for (const width of widths) {
    const marks = renderMarks(runId, width);
    const observations = marks.filter(mark => mark.props['data-tutor-coordinate-point']);
    assert.deepEqual(observations.map(mark => mark.props['data-tutor-coordinate-point']), ['1,2', '12,5']);
    const [first, end] = observations;
    const runStart = first.props.cx + (end.props.cx - first.props.cx) * (6 / 11);
    const band = marks.find(mark => mark.props['data-tutor-plot-band']);
    const flag = marks.find(mark => mark.props['data-tutor-plot-point'] === '12,5');
    assert.ok(Math.abs(band.props.x - runStart) < 1e-9);
    assert.equal(band.props.width, end.props.cx - band.props.x);
    assert.deepEqual([flag.props.cx, flag.props.cy], [end.props.cx, end.props.cy]);
  }
});

test('one labeled bar per case shows the fixed score order at all three widths', () => {
  for (const width of widths) {
    const marks = renderMarks(rankingId, width);
    const bars = marks.flatMap((mark, i) => {
      if (mark.props['data-tutor-bar'] === undefined) return [];
      return [[lines(marks[i + 1]), lines(marks[i + 2]), mark.props.width]];
    });
    assert.deepEqual(bars.map(([name, score]) => [name, score]), [
      ['Case A', '0.92'], ['Case B', '0.81'], ['Case C', '0.7'], ['Case D', '0.44'], ['Case E', '0.27'],
    ]);
    assert.ok(bars.slice(1).every((bar, i) => bar[2] < bars[i][2]));
  }
});
