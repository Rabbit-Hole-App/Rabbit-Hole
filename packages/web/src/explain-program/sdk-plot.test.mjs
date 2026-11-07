import assert from 'node:assert/strict';
import test from 'node:test';
import { CONTRACT_LIMITS, parseFrame } from './contract.js';
import { normalizeFrame } from './frame.js';
import { SDK_SOURCE } from './sdk.js';
import { PLOT_SOURCE } from './sdk-plot.js';

// Only the trusted SDK and these hand-authored cases run natively.
const sdk = new Function(`${SDK_SOURCE}\n${PLOT_SOURCE}\nreturn sdk;`)();
const defaults = {
  x: 20, y: 30, w: 500, h: 320,
  xDomain: [-2, 6], yDomain: [-4, 4], xLabel: 'Time (s)', yLabel: 'Distance (m)',
  series: [
    { id: 'theory', points: [[-2, -4], [2, 0], [6, 4]], role: 'prediction' },
    { id: 'measurements', kind: 'scatter', points: [[0, 1], [4, 3]], role: 'observed' },
  ],
  marker: { x: 2, y: 0, role: 'output', label: 'Selected value' },
};

const options = overrides => ({ ...defaults, ...overrides });

test('plot objects are deterministic, namespaced and accepted by the frame and scene gates', () => {
  const objects = sdk.plot('growth', defaults);
  const other = sdk.plot('other', defaults);
  assert.deepEqual(objects, sdk.plot('growth', defaults));
  assert.ok(objects.every(object => object.id.startsWith('plot:growth:')));
  assert.equal(new Set([...objects, ...other].map(({ id }) => id)).size, objects.length + other.length);
  assert.ok(objects.every(({ kind }) => ['line', 'text', 'polyline', 'circle'].includes(kind)));
  const frame = sdk.frame(objects);
  assert.equal(parseFrame(frame).ok, true);
  const normalized = normalizeFrame(frame);
  assert.equal(normalized.ok, true, normalized.issue);
  assert.ok(normalized.state.objects.some(object => object.role === 'observed'));
});

test('axes orient data correctly, with aligned tick values and stable marker IDs', () => {
  const objects = sdk.plot('growth', defaults);
  const get = suffix => objects.find(object => object.id === 'plot:growth:' + suffix);
  const xAxis = get('axis:x'), yAxis = get('axis:y');
  const [left, right, bottom, top] = [xAxis.from.x, xAxis.to.x, yAxis.from.y, yAxis.to.y];
  const center = [(left + right) / 2, (top + bottom) / 2];
  assert.ok(left >= defaults.x && right <= defaults.x + defaults.w);
  assert.ok(top >= defaults.y && bottom <= defaults.y + defaults.h);
  assert.deepEqual(get('s:theory').points, [[left, bottom], center, [right, top]]);
  assert.deepEqual([get('marker').x, get('marker').y], center);
  assert.equal(get('title:x:0').text, 'Time (s)');
  assert.equal(get('title:y:0').text, 'Distance (m)');
  for (const [axis, domain] of [['x', defaults.xDomain], ['y', defaults.yDomain]]) {
    const labels = objects.filter(object => object.id.startsWith('plot:growth:tick:' + axis + ':') && object.kind === 'text');
    assert.equal(labels[0].text, String(domain[0]));
    assert.equal(labels.at(-1).text, String(domain[1]));
    assert.ok(labels.length >= 2 && labels.length <= 5);
    for (const tick of labels) {
      const ratio = (Number(tick.text) - domain[0]) / (domain[1] - domain[0]);
      const expected = axis === 'x' ? left + (right - left) * ratio : bottom + (top - bottom) * ratio;
      const position = axis === 'x' ? tick.x : get(tick.id.slice('plot:growth:'.length, -':label'.length)).from.y;
      assert.ok(Math.abs(position - expected) < 1e-9);
    }
  }
  const moved = sdk.plot('growth', options({ marker: { x: 6, y: 4, label: 'Now at an endpoint' } }));
  const marker = moved.find(object => object.id === get('marker').id);
  assert.deepEqual([marker.x, marker.y], [right, top]);
});

test('geometry remains finite over a domain spanning both finite extremes', () => {
  const min = -Number.MAX_VALUE, max = Number.MAX_VALUE;
  const plotted = sdk.plot('extremes', options({
    x: 0, y: 0, w: 960, h: 540,
    xDomain: [min, max], yDomain: [min, max],
    series: [{ id: 'extremes', points: [[min, min], [0, 0], [max, max]] }],
    marker: undefined,
  }));
  const line = plotted.find(object => object.kind === 'polyline');
  assert.ok(line.points.flat().every(Number.isFinite));
  assert.ok(line.points[0][0] < line.points[1][0] && line.points[1][0] < line.points[2][0]);
  assert.equal(parseFrame(sdk.frame(plotted)).ok, true);
});

test('rejects malformed options, domains, series, roles and markers', () => {
  const invalid = [
    null, {}, options({ x: Infinity }), options({ w: 60 }), options({ x: CONTRACT_LIMITS.coordinate }),
    options({ xDomain: [1, 1] }), options({ yDomain: [Infinity, 2] }), options({ xDomain: ['-2', 6] }),
    options({ yLabel: 'Text\nnext line' }), options({ xLabel: ' ' }), options({ extra: true }),
    options({ series: [] }), options({ series: [{ id: 'invalid:id', points: [[0, 0], [1, 1]] }] }),
    options({ series: [{ id: 'single', points: [[0, 0]] }] }),
    options({ series: [{ id: 'bad', kind: 'area', points: [[0, 0], [1, 1]] }] }),
    options({ series: [{ id: 'bad', points: [[0, 0], [7, 1]] }] }),
    options({ series: [{ id: 'bad', points: [[0, 0], [1, NaN]] }] }),
    options({ series: [{ id: 'bad', points: [[0, 0], [1, 1, 2]] }] }),
    options({ series: [{ id: 'bad', points: Array(2) }] }),
    options({ series: [{ id: 'bad', points: [[0, 0], [1, 1]], role: 'pink' }] }),
    options({ series: [defaults.series[0], defaults.series[0]] }),
    options({ marker: { x: -3, y: 0 } }), options({ marker: { x: 0, y: 0, label: 'a'.repeat(49) } }),
  ];
  for (const args of invalid) assert.throws(() => sdk.plot('bad', args), /sdk\.plot/);
  assert.throws(() => sdk.plot('bad:name', defaults), /sdk\.plot/);
});

test('bounds series, per-series samples and scatter objects under frame limits', () => {
  const points = Array.from({ length: 256 }, (_, index) => [-2 + (8 * index) / 255, -4 + (8 * index) / 255]);
  const lines = ['a', 'b', 'c'].map(id => ({ id, points }));
  const scatter = { id: 'observed', kind: 'scatter', points: points.slice(0, 20) };
  const objects = sdk.plot('bounded', options({ series: [...lines, scatter] }));
  assert.ok(objects.length < CONTRACT_LIMITS.objects);
  assert.equal(parseFrame(sdk.frame(objects)).ok, true);
  assert.throws(() => sdk.plot('over', options({ series: [...lines, { ...scatter, points: points.slice(0, 21) }] })), /scatter/);
  assert.throws(() => sdk.plot('over', options({ series: [{ id: 'dense', points: [...points, [6, 4]] }] })), /points/);
  assert.throws(() => sdk.plot('over', options({ series: [...lines, scatter, { ...scatter, id: 'extra' }] })), /series/);
});

test('the longest accepted plot and series names produce valid frame IDs', () => {
  const points = Array.from({ length: 20 }, (_, index) => [index / 10, 0]);
  const objects = sdk.plot('p'.repeat(32), options({
    series: [{ id: 's'.repeat(20), kind: 'scatter', points }],
  }));
  const frame = parseFrame(sdk.frame(objects));
  assert.equal(frame.ok, true, frame.issue);
  assert.ok(objects.every(({ id }) => id.length <= 64));
});
