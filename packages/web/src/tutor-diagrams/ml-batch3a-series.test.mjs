import assert from 'node:assert/strict';
import test from 'node:test';
import { Children } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { references } from './ml-batch3a-series-references.js';
import { references as plotReferences } from './ml-plot-references.js';
import { parseTutorDiagram } from './spec.js';
import { TEACHING } from './teaching-theme.js';
import { renderTutorDiagram } from './TutorDiagram.js';

const additiveId = 'ml-time-series-additive-residuals';
const rollingId = 'ml-rolling-mean-feature';
const widths = [320, 408, 720];
const children = element => Children.toArray(element.props.children);
const textLines = element => children(element).map(line => line.props.children);
const referenceFor = id => {
  const reference = references.find(reference => reference.id === id);
  assert.ok(reference, `${id} must be available as an author reference`);
  return reference;
};

test('the additive example reconstructs every observation on its own date', () => {
  const { lessons, prompts, spec } = referenceFor(additiveId);
  assert.deepEqual(lessons, ['15']);
  assert.deepEqual(prompts, ['How do trend, seasonality and residuals add up to the original time series?']);
  const { panels, sharedAxes, caption } = spec.diagram;
  assert.deepEqual(panels.map(panel => panel.heading), ['Observed and trend', 'Seasonal contribution', 'Residuals']);
  assert.deepEqual(sharedAxes, ['x']);
  const [observedPlot, seasonalPlot, residualPlot] = panels.map(panel => panel.diagram);
  for (const plot of [observedPlot, seasonalPlot, residualPlot]) {
    assert.deepEqual([plot.x.label, plot.x.min, plot.x.max], ['Day', 1, 8]);
  }
  const [observed, trend] = observedPlot.series;
  const [seasonal] = seasonalPlot.series;
  const [residual] = residualPlot.series;
  const original = plotReferences.find(reference => reference.id === 'time-series-components');
  assert.deepEqual([trend, seasonal], original.spec.diagram.series.slice(0, 2));
  for (const series of [observed, trend, seasonal, residual]) {
    assert.deepEqual(series.points.map(point => point.x), [1, 2, 3, 4, 5, 6, 7, 8]);
  }
  assert.deepEqual(residual.points.map(point => point.y), [0.25, -0.25, 0, 0.5, -0.5, 0, 0.25, -0.25]);
  assert.deepEqual(observed.points.map(point => point.y), trend.points.map((point, i) => (
    point.y + seasonal.points[i].y + residual.points[i].y
  )));
  assert.equal(observed.points[3].y, 3);
  assert.match(caption, /On Day 4, 3\.5 − 1 \+ 0\.5 = 3/);
});

test('each rolling mean uses the three observed values strictly before the prediction day', () => {
  const { lessons, prompts, spec } = referenceFor(rollingId);
  assert.deepEqual(lessons, ['15']);
  assert.deepEqual(prompts, ['Which past values go into a three-day rolling average before a prediction?']);
  const { rows } = spec.diagram;
  const observations = [10, 13, 16, 19, 22, 25];
  assert.deepEqual(rows.map(row => row.heading), ['Day 4', 'Day 5', 'Day 6', 'Day 7']);
  assert.deepEqual(rows.map(row => Number(row.cells[1])), [13, 16, 19, 22]);
  for (const { heading, cells: [inputs, mean] } of rows) {
    const predictionDay = Number(heading.split(' ')[1]);
    const dates = [], values = [];
    for (const input of inputs.split(' ')) {
      const pair = input.match(/^D(\d+)=(\d+)$/);
      assert.ok(pair, `${input} must pair a dated input with its value`);
      const day = Number(pair[1]);
      const value = Number(pair[2]);
      dates.push(day);
      values.push(value);
      assert.equal(value, observations[day - 1]);
    }
    assert.deepEqual(dates, [predictionDay - 3, predictionDay - 2, predictionDay - 1]);
    assert.equal(Number(mean), values.reduce((sum, value) => sum + value, 0) / values.length);
  }
});

function renderSaved(id, width) {
  const { spec } = referenceFor(id);
  assert.equal(spec.version, 1);
  const saved = JSON.stringify(spec);
  assert.deepEqual(parseTutorDiagram(saved), spec);
  const result = renderTutorDiagram(saved, width);
  const svg = renderToStaticMarkup(result.element);
  assert.match(svg, /^<svg .*role="img"/);
  assert.ok(svg.includes(TEACHING.blue));
  assert.doesNotMatch(svg, /NaN|Infinity|undefined|katex-error/);
  assert.equal(svg, renderToStaticMarkup(renderTutorDiagram(spec, width).element));
  assert.ok(Number.isFinite(result.height) && result.height > 0);
  const frame = children(result.element);
  assert.equal(textLines(frame.at(-1)).join(' '), spec.diagram.caption);
  const body = frame.find(element => element.type === 'g');
  return { width: result.width, elements: children(body) };
}

test('the saved additive comparison keeps the three Day 4 guides aligned at 320, 408 and 720 px', () => {
  for (const width of widths) {
    const { elements, width: renderedWidth } = renderSaved(additiveId, width);
    assert.ok(renderedWidth >= width);
    const panels = elements.filter(element => element.props['data-tutor-composition-child'] !== undefined);
    assert.equal(panels.length, 3);
    const aligned = panels.map(panel => {
      const marks = children(panel);
      const area = marks.find(element => element.props['data-tutor-plot-area'] !== undefined);
      const guide = marks.find(element => element.props['data-tutor-plot-reference'] === 'x:4');
      assert.ok(area && guide, 'each panel renders its day axis and Day 4 guide');
      assert.equal(marks.filter(element => element.props['data-tutor-coordinate-point']).length,
        panel === panels[0] ? 16 : 8);
      const [, offset] = panel.props.transform.match(/^translate\(([^ ]+) /);
      return [Number(offset) + area.props.x, area.props.width, Number(offset) + guide.props.x1];
    });
    assert.deepEqual(aligned, [aligned[0], aligned[0], aligned[0]]);
  }
});

test('the saved rolling matrix keeps each dated value and mean visible at 320, 408 and 720 px', () => {
  const { rows } = referenceFor(rollingId).spec.diagram;
  for (const width of widths) {
    const { elements, width: renderedWidth } = renderSaved(rollingId, width);
    assert.equal(renderedWidth, width);
    const visible = Object.fromEntries(elements.flatMap((element, i) => {
      const key = element.props['data-tutor-matrix-row'] ?? element.props['data-tutor-matrix-cell'];
      if (!key) return [];
      const lines = textLines(elements[i + 1]);
      if (key.endsWith(':0')) assert.ok(lines.every(line => /^(D\d+=\d+)( D\d+=\d+)*$/.test(line)));
      return [[key, lines.join(' ')]];
    }));
    assert.deepEqual(visible, Object.fromEntries(rows.flatMap(({ id, heading, cells }) => [
      [id, heading], [`${id}:0`, cells[0]], [`${id}:1`, cells[1]],
    ])));
  }
});
