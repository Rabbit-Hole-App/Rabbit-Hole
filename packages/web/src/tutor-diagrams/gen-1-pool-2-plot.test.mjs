import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { lintDiagramContent } from './content-contract.js';
import { derived, plotInputs } from './gen-1-pool-2-plot-data.js';
import { references } from './gen-1-pool-2-plot-references.js';
import { parseTutorDiagram } from './spec.js';
import { renderTutorDiagram } from './TutorDiagram.js';

const valueSet = derived();
const depths = ['overview', 'standard', 'deep'];

function renderDepth(spec) {
  assert.deepEqual(lintDiagramContent(spec), []);
  const { width, height, element } = renderTutorDiagram(spec, 408);
  assert.equal(width, 408);
  assert.ok(Number.isFinite(height) && height > 0);
  return renderToStaticMarkup(element);
}

test('rain barrel estimate is derived between the measured endpoints', () => {
  const reference = references.find(ref => ref.id === 'pool-rain-barrel-midpoint');
  const { interval, litres } = plotInputs.rain;
  const [early, late] = litres;
  const delta = late - early;
  for (let i = 1; i < litres.length; i++) assert.equal(litres[i] - litres[i - 1], delta);
  const midpoint = interval / 2;
  const expected = (early + late) / 2;
  const data = valueSet[reference.id];
  assert.equal(data.estimate, expected);
  assert.equal(data.halfway, midpoint);
  assert.equal(data.halfRise, delta / 2);
  assert.equal(data.risePerMinute, delta / interval);
  assert.equal(reference.spec, reference.depths.standard.spec);
  for (const depth of depths) {
    const { spec } = reference.depths[depth];
    const { series, annotations: [probe] } = spec.diagram;
    const displayed = depth === 'overview' ? litres.slice(0, 2) : litres;
    assert.deepEqual(series[0].points, displayed.map((y, index) => ({ x: index * interval, y })));
    assert.equal(Object.hasOwn(series[0], 'smooth'), false);
    assert.equal(probe.derive, 'series.0:on');
    assert.equal(probe.x, midpoint);
    assert.equal(Object.hasOwn(probe, 'y'), false);
    assert.equal(parseTutorDiagram(spec).diagram.annotations[0].y, expected);
    assert.equal(probe.label, `Estimated ${expected} L`);
    assert.ok(renderDepth(spec).includes(`data-tutor-plot-point="${midpoint},${expected}"`));
  }
  const caption = reference.depths.deep.spec.diagram.caption;
  assert.ok(caption.includes(`${delta / interval} L per minute`));
  assert.ok(caption.includes(`${midpoint} min`));
  assert.ok(caption.includes(`${delta / 2} L`));
});

test('dog park mean derives from the hours displayed in each plot', () => {
  const reference = references.find(ref => ref.id === 'pool-dog-park-gate-mean');
  const { openingHour, entries } = plotInputs.gate;
  let allEntries = 0;
  for (const count of entries) allEntries += count;
  assert.equal(valueSet[reference.id].totalEntries, allEntries);
  assert.equal(valueSet[reference.id].hours, entries.length);
  assert.equal(valueSet[reference.id].mean, allEntries / entries.length);
  assert.equal(reference.spec, reference.depths.standard.spec);
  for (const depth of depths) {
    const { spec } = reference.depths[depth];
    const { series, annotations: [meanLine] } = spec.diagram;
    const displayed = depth === 'overview' ? entries.slice(0, 4) : entries;
    let sum = 0;
    for (const count of displayed) sum += count;
    const expected = sum / displayed.length;
    assert.deepEqual(series[0].points, displayed.map((y, index) => ({ x: openingHour + index, y })));
    assert.equal(meanLine.derive, 'series.0:mean');
    assert.equal(Object.hasOwn(meanLine, 'value'), false);
    assert.equal(parseTutorDiagram(spec).diagram.annotations[0].value, expected);
    assert.equal(meanLine.label, `Mean ${expected} entries`);
    assert.ok(renderDepth(spec).includes(`data-tutor-plot-reference="y:${expected}"`));
  }
  const caption = reference.depths.deep.spec.diagram.caption;
  assert.ok(caption.includes(`${allEntries} entries`));
  assert.ok(caption.includes(`${entries.length} hours`));
});

test('farm stand peak derives from the warmest observed temperature', () => {
  const reference = references.find(ref => ref.id === 'pool-farm-stand-shelf-peak');
  const { firstHour, celsius } = plotInputs.shelf;
  const [peak] = [...celsius].sort((a, b) => b - a);
  const peakIndex = celsius.indexOf(peak);
  const drop = peak - celsius.at(-1);
  const hoursAfterPeak = celsius.length - 1 - peakIndex;
  assert.equal(valueSet[reference.id].peak, peak);
  assert.equal(valueSet[reference.id].peakHour, firstHour + peakIndex);
  assert.equal(valueSet[reference.id].cooling, drop);
  assert.equal(valueSet[reference.id].coolingHours, hoursAfterPeak);
  assert.equal(reference.spec, reference.depths.standard.spec);
  for (const depth of depths) {
    const { spec } = reference.depths[depth];
    const { series, annotations: [peakLine] } = spec.diagram;
    const displayed = depth === 'overview' ? celsius.slice(0, 3) : celsius;
    const [expected] = [...displayed].sort((a, b) => b - a);
    assert.deepEqual(series[0].points, displayed.map((y, index) => ({ x: firstHour + index, y })));
    assert.equal(peakLine.derive, 'series.0:max');
    assert.equal(Object.hasOwn(peakLine, 'value'), false);
    assert.equal(parseTutorDiagram(spec).diagram.annotations[0].value, expected);
    assert.equal(peakLine.label, `Peak reading ${expected} °C`);
    assert.ok(renderDepth(spec).includes(`data-tutor-plot-reference="y:${expected}"`));
  }
  const caption = reference.depths.deep.spec.diagram.caption;
  assert.ok(caption.includes(`${drop} °C`));
  assert.ok(caption.includes(`${hoursAfterPeak} h`));
});
