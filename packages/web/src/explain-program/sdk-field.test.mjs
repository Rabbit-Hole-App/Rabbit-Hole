import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeFrame } from './frame.js';
import { SDK_SOURCE } from './sdk.js';
import { FIELD_SOURCE } from './sdk-field.js';
import { PLOT_SOURCE } from './sdk-plot.js';

const sdk = new Function(SDK_SOURCE + PLOT_SOURCE + FIELD_SOURCE + '\nreturn sdk;')();

const box = { x: 8, y: 8, w: 640, h: 400, xDomain: [-2, 2], yDomain: [-2, 2], xLabel: 'x', yLabel: 'y', xUnit: 'm', yUnit: 'm' };
const contour = { ...box, kind: 'contour', valueLabel: 'Potential', valueUnit: 'V', levels: [1, 2, 3] };
const vector = { ...box, kind: 'vector', yDomain: [-1, 1], valueLabel: 'Velocity', valueUnit: 'm/s', maxMagnitude: 4, samples: [3, 3] };
const objectsOf = (objects, kind) => objects.filter(object => object.kind === kind);
const near = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be near ${expected}`);
function axes(objects, id) {
  const x = objects.find(object => object.id === `field:${id}:axis:x`);
  const y = objects.find(object => object.id === `field:${id}:axis:y`);
  return { left: x.from.x, right: x.to.x, bottom: x.from.y, top: y.to.y };
}
function validFrame(objects) {
  const result = normalizeFrame({ width: 660, height: 430, objects });
  assert.equal(result.ok, true, result.issue);
}

test('a sampled radial potential draws closed, labeled levels that respond to a scalar offset', () => {
  let calls = 0;
  const draw = offset => sdk.field('potential', { ...contour, sample: (x, y) => { calls++; return x * x + y * y + offset; } });
  const first = draw(0);
  assert.equal(calls, 21 * 21);
  const second = draw(0.4);
  assert.deepEqual(draw(0), first);
  assert.ok(objectsOf(first, 'text').some(({ text }) => text === 'x (m)'));
  assert.ok(objectsOf(first, 'text').some(({ text }) => text === 'y (m)'));
  assert.ok(objectsOf(first, 'text').some(({ text }) => text === 'Potential (V)'));
  const { left, right, bottom, top } = axes(first, 'potential');
  const radiusSquared = ([x, y]) => ((x - left) * 4 / (right - left) - 2) ** 2 + ((bottom - y) * 4 / (bottom - top) - 2) ** 2;
  for (const [offset, objects] of [[0, first], [0.4, second]]) {
    const curves = objectsOf(objects, 'polyline');
    assert.equal(curves.length, 3);
    curves.forEach(({ points, role }, i) => {
      assert.deepEqual(points[0], points.at(-1));
      assert.ok(objectsOf(objects, 'text').some(({ text, role: labelRole }) => text === String(i + 1) && labelRole === role));
      for (const point of points) near(radiusSquared(point) + offset, i + 1, 0.011);
    });
    validFrame(objects);
  }
});

test('a sampled vortex reverses direction and changes arrow length against a fixed magnitude scale', () => {
  const draw = strength => sdk.field('vortex', { ...vector, sample: (x, y) => [-y * strength, x * strength] });
  const first = draw(1), second = draw(-2);
  const arrows = objectsOf(first, 'arrow'), reverse = objectsOf(second, 'arrow');
  const ids = arrows.map(({ id }) => id);
  assert.equal(arrows.length, 8, 'the stationary center should have no arrow');
  assert.deepEqual(ids, reverse.map(({ id }) => id));
  assert.deepEqual(draw(1), first);
  const { left, right, top, bottom } = axes(first, 'vortex');
  const east = arrows.find(({ from, to }) => (from.x + to.x) / 2 > (left + right) / 2 && Math.abs((from.y + to.y) / 2 - (top + bottom) / 2) < 1e-9);
  assert.ok(east);
  near(east.from.x, east.to.x);
  assert.ok(east.to.y < east.from.y, 'positive y points up');
  const reversed = reverse.find(({ id }) => id === east.id);
  near(reversed.to.y - reversed.from.y, 2 * (east.from.y - east.to.y));
  assert.ok(objectsOf(first, 'text').some(({ text }) => text === 'Velocity (m/s)'));
  assert.ok(objectsOf(first, 'text').some(({ text }) => text === 'Full arrow: 4 m/s'));
  for (const objects of [first, second]) validFrame(objects);
});

test('vectors use the axis aspect ratio and cap the displayed length at the labeled maximum', () => {
  const draw = component => sdk.field('scaled', { ...vector, maxMagnitude: Math.SQRT2, samples: [1, 1], sample: () => [component, component] });
  const objects = draw(1);
  const [arrow] = objectsOf(objects, 'arrow');
  const [capped] = objectsOf(draw(100), 'arrow');
  for (const endpoint of ['from', 'to']) {
    near(capped[endpoint].x, arrow[endpoint].x);
    near(capped[endpoint].y, arrow[endpoint].y);
  }
  const { left, right, top, bottom } = axes(objects, 'scaled');
  near((arrow.to.x - arrow.from.x) / (arrow.from.y - arrow.to.y), (right - left) / 4 / ((bottom - top) / 2));
});

test('a field can share a caller ID with a plain plot', () => {
  const plot = sdk.plot('same', { x: 8, y: 8, w: 320, h: 180, xDomain: [-2, 2], yDomain: [-2, 2],
    series: [{ id: 'line', points: [[-2, -2], [2, 2]] }] });
  const field = sdk.field('same', { ...contour, x: 336, w: 312, levels: [0], sample: (x, y) => x + y });
  validFrame([...plot, ...field]);
});

test('a sampled saddle joins the crossings around the low corners of a high-centered cell', () => {
  const objects = sdk.field('saddle', { ...contour, levels: [0], samples: [2, 2], sample: (x, y) => Math.sign(x) === Math.sign(y) ? 3 : -1 });
  const { left, right, top, bottom } = axes(objects, 'saddle');
  const border = ([x, y]) => x === left ? 'left' : x === right ? 'right' : y === top ? 'top' : y === bottom ? 'bottom' : 'interior';
  assert.deepEqual(objectsOf(objects, 'polyline').map(({ points }) => points.map(border).sort().join(',')).sort(), ['bottom,right', 'left,top']);
});

test('a contour can interpolate between opposite finite extremes without emitting non-finite geometry', () => {
  const max = Number.MAX_VALUE;
  const objects = sdk.field('wide', { ...contour, levels: [0], xDomain: [-max, max], samples: [2, 2], sample: x => x });
  const { left, right, top, bottom } = axes(objects, 'wide');
  const [line] = objectsOf(objects, 'polyline');
  assert.deepEqual(line.points.map(point => point[1]).sort((a, b) => a - b), [top, bottom]);
  for (const [x] of line.points) near(x, (left + right) / 2);
  validFrame(objects);
});

test('bounded field sampling rejects invalid configurations, values and excessive geometry', () => {
  const base = { ...contour, sample: (x, y) => x + y };
  assert.throws(() => sdk.field('bad', { ...base, xDomain: [1, 1] }), /Domain/);
  assert.throws(() => sdk.field('bad', { ...base, xUnit: undefined }), /xUnit/);
  assert.throws(() => sdk.field('bad', { ...base, levels: [1, 1] }), /levels/);
  assert.throws(() => sdk.field('bad', { ...base, levels: [1, , 3] }), /levels/);
  assert.throws(() => sdk.field('bad', { ...base, samples: [34, 3] }), /samples/);
  assert.throws(() => sdk.field('bad', { ...base, sample: () => NaN }), /finite scalar/);
  assert.throws(() => sdk.field('bad', { ...base, levels: [0], samples: [33, 33], sample: (x, y) => (x * 8 + y * 8) % 2 ? 1 : -1 }), /object budget/);
  assert.throws(() => sdk.field('bad', { ...vector, samples: [6, 5], sample: () => [1, 0] }), /samples/);
  assert.throws(() => sdk.field('bad', { ...vector, maxMagnitude: 0, sample: () => [1, 0] }), /maxMagnitude/);
  assert.throws(() => sdk.field('bad', { ...vector, sample: () => [1, Infinity] }), /finite pair/);
  assert.throws(() => sdk.field('bad', { ...vector, levels: [1], sample: () => [1, 0] }), /options/);
});
