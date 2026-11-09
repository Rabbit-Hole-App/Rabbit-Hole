import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createShapes, validate, describe, visibleText } from './ml-plot-spec.js';
import { createLayouts } from './ml-plot-layouts.js';
import { references } from './ml-plot-references.js';
import { lineHeight, textWidth } from './primitives.js';
import { quantitativeLayouts } from './quantitative-layouts.js';

const text = max => z.string().min(1).max(max);
const numeric = z.number().min(-1e9).max(1e9);
const unit = text(12).optional();
const shapes = createShapes({ z, text, numeric, unit, id: text(32),
  titled: { title: text(90), caption: text(140).optional() },
  axes: z.strictObject({ label: text(36), min: numeric, max: numeric, unit }),
});
const schema = z.discriminatedUnion('kind', shapes).superRefine((diagram, ctx) =>
  validate(diagram, (path, message) => ctx.addIssue({ code: 'custom', path, message })));
const layouts = createLayouts({ legacy: quantitativeLayouts });
const plot = () => ({ kind: 'coordinate-plot', title: 'Known geometry',
  x: { label: 'X', min: 0, max: 10 }, y: { label: 'Y', min: 0, max: 10 },
  series: [{ label: 'Samples', kind: 'scatter', points: [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 10 }] }],
});
function render(d, width = 420) {
  const result = layouts[d.kind](schema.parse(d), width);
  return { ...result, svg: renderToStaticMarkup(h('svg', { viewBox: `0 0 ${result.width} ${result.height}` }, ...result.elements)) };
}
const marks = (svg, attr) => [...svg.matchAll(new RegExp(`<[^>]* ${attr}="([^"]*)"[^>]*>`, 'g'))].map(m => ({ tag: m[0], value: m[1] }));
const number = (tag, attr) => Number(tag.match(new RegExp(` ${attr}="([^"]+)"`))?.[1]);
const points = tag => tag.match(/ points="([^"]+)"/)[1].split(' ').map(pair => pair.split(',').map(Number));
const smoothVertices = d => d.split('C').map((piece, i) => { const n = piece.replace(/^M/, '').trim().split(/[ ,]+/).map(Number); return i ? n.slice(-2) : n; });
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const errors = d => schema.safeParse(d).error?.issues.map(i => i.message).join('; ') || '';

test('five line series use distinct strokes and right-edge labels keep clear of each other', () => {
  const d = plot();
  d.series = Array.from({ length: 5 }, (_, i) => ({
    kind: 'line', label: `Growth ${i + 1}`, endLabel: true,
    points: [{ x: 0, y: i }, { x: 5, y: 8 }, { x: 10, y: 10 }],
  }));
  const { svg, plotBounds } = render(d, 408);
  const paths = marks(svg, 'data-tutor-plot-series');
  const labels = marks(svg, 'data-tutor-plot-end-label');
  assert.equal(paths.length, 5);
  assert.equal(new Set(paths.map(({ tag }) => tag.match(/ stroke="([^"]+)"/)[1])).size, 5);
  assert.equal(labels.length, 5);
  assert.ok(labels.every(({ tag }) => number(tag, 'x') > plotBounds.right));
  const positions = labels.map(({ tag }) => number(tag, 'y'));
  assert.ok(positions.every((y, i) => i === 0 || y - positions[i - 1] >= 16));
  d.series.push({ ...d.series[0], label: 'Sixth line' });
  assert.notEqual(errors(d), '');
});

test('unchanged plots and bars delegate to the legacy layouts exactly', () => {
  for (const d of [plot(), { kind: 'bar-chart', title: 'Bars', bars: [{ label: 'A', value: -1 }, { label: 'B', value: 2 }] }]) {
    const old = quantitativeLayouts[d.kind](d, 320);
    assert.deepEqual(layouts[d.kind](d, 320), old);
    assert.equal(describe(d), null);
    assert.equal(visibleText(d), null);
  }
});

test('annotations and labelled samples share the same exact linear mapping', () => {
  const d = plot();
  d.series[0].points[1] = { x: 5, y: 5, id: 'sample1', label: 'Middle sample' };
  d.annotations = [
    { kind: 'point', x: 5, y: 5, label: 'Midpoint' },
    { kind: 'vector', from: { x: 0, y: 0 }, to: { x: 10, y: 10 }, label: 'Direction' },
    { kind: 'reference-line', axis: 'x', value: 5, label: 'Split' },
    { kind: 'rectangle', xMin: 2, xMax: 8, yMin: 3, yMax: 7, label: 'Region' },
    { kind: 'ellipse', center: { x: 5, y: 5 }, radiusX: 3, radiusY: 2, label: 'Contour' },
  ];
  const { svg } = render(d);
  const [a, mid, b] = marks(svg, 'data-tutor-coordinate-point').filter(m => /^<circle/.test(m.tag));
  const x0 = number(a.tag, 'cx'), x1 = number(b.tag, 'cx');
  const y0 = number(a.tag, 'cy'), y1 = number(b.tag, 'cy');
  close(number(mid.tag, 'cx'), (x0 + x1) / 2);
  close(number(mid.tag, 'cy'), (y0 + y1) / 2);
  const reference = marks(svg, 'data-tutor-plot-reference')[0];
  close(number(reference.tag, 'x1'), (x0 + x1) / 2);
  const rect = marks(svg, 'data-tutor-plot-rectangle')[0].tag;
  close(number(rect, 'x'), x0 + (x1 - x0) * 0.2);
  close(number(rect, 'width'), (x1 - x0) * 0.6);
  close(number(rect, 'height'), (y0 - y1) * 0.4);
  const ellipse = marks(svg, 'data-tutor-plot-ellipse')[0].tag;
  close(number(ellipse, 'rx'), (x1 - x0) * 0.3);
  close(number(ellipse, 'ry'), (y0 - y1) * 0.2);
  assert.match(svg, /data-tutor-arrowhead/);
  assert.match(svg, /Middle sample/);
  assert.ok(visibleText(d).join(' ').includes('Contour'));
  assert.ok(describe(d).join(' ').includes('sample1'));
});

test('a dense extended line marks its first and last point and labelled points, and retains the full curve', () => {
  const d = plot();
  d.series = [{ label: 'Dense line', kind: 'line', points: Array.from({ length: 7 }, (_, i) => ({ x: i, y: i % 3,
    ...(i === 2 ? { label: 'Peak' } : i === 3 ? { id: 'unlabelled' } : {}),
  })) }, { label: 'Stems', kind: 'stem', points: Array.from({ length: 7 }, (_, i) => ({ x: i, y: i + 1 })) }];
  const { svg, plotBounds } = render(d);
  assert.deepEqual(marks(svg, 'data-tutor-coordinate-point').map(mark => mark.value),
    ['0,0', '2,2', '6,0', '0,1', '1,2', '2,3', '3,4', '4,5', '5,6', '6,7']);
  assert.equal(marks(svg, 'data-tutor-plot-stem').length, 7);
  assert.match(svg, /Peak/);
  assert.match(svg, /Dense line/);
  assert.match(describe(d).join(' '), /unlabelled \(3, 0\)/);
  const path = smoothVertices(marks(svg, 'data-tutor-plot-series')[0].tag.match(/ d="([^"]+)"/)[1]); // the smooth curve passes through every vertex
  assert.equal(path.length, 7);
  const { left, right, top, bottom } = plotBounds;
  path.forEach(([x, y], i) => {
    close(x, left + (right - left) * i / 10);
    close(y, bottom - (bottom - top) * (i % 3) / 10);
  });
});

// logX (release 118, Codex ae9bf069d): a log x axis is labelled at its powers of ten plus the exact endpoints, thinned only when crowded, so it carries 2 to 7 ticks (a domain inside one decade: the two endpoints); linear axes keep 3 to 5.
function checkAxisTicks(frame, xDomain, yDomain, logX = false) {
  const labels = frame.elements.filter(({ type, props }) => type === 'text' && props.fontSize === 12).map(({ props }) => props);
  const bottomRow = Math.max(...labels.map(p => p.y));
  const x = labels.filter(p => p.y === bottomRow).sort((a, b) => a.x - b.x);
  const y = labels.filter(p => p.y !== bottomRow).sort((a, b) => b.y - a.y);
  const lines = p => [p.children].flat().map(span => span.props.children);
  for (const [ticks, domain] of [[x, xDomain], [y, yDomain]]) {
    const [few, many] = logX && ticks === x ? [2, 7] : [3, 5];
    assert.ok(ticks.length >= few && ticks.length <= many, `expected ${few}–${many} ticks, found ${ticks.length}`);
    const text = ticks.map(tick => lines(tick).join(''));
    assert.equal(new Set(text).size, ticks.length, 'each tick has a distinct label');
    assert.deepEqual([text[0], text.at(-1)].map(Number), domain, 'exact endpoints remain labelled');
  }
  const textBounds = (p, horizontal) => {
    if (!horizontal) {
      const halfHeight = lines(p).length * lineHeight(p.fontSize) / 2;
      return [p.y - halfHeight, p.y + halfHeight];
    }
    const width = Math.max(...lines(p).map(line => textWidth(line, p.fontSize)));
    const start = p.textAnchor === 'start' ? p.x : p.textAnchor === 'end' ? p.x - width : p.x - width / 2;
    return [start, start + width];
  };
  for (const [ticks, horizontal] of [[x, true], [[...y].reverse(), false]]) {
    const bounds = ticks.map(tick => textBounds(tick, horizontal));
    assert.ok(bounds.every(([start, end], i) => start >= 0 && end <= (horizontal ? frame.width : frame.height) &&
      (i === 0 || bounds[i - 1][1] + 4 <= start)), 'tick labels fit without overlap');
  }
}

test('linear and logarithmic plot axes have three to five readable ticks at each width', () => {
  for (const width of [320, 408, 720]) {
    for (const [x, y] of [
      [{ label: 'X', min: 0.0013, max: 0.0397 }, { label: 'Y', min: 3.1, max: 3.21 }],
      [{ label: 'X', min: 0.001, max: 100, scale: 'log' }, { label: 'Y', min: -0.0137, max: 0.3283 }],
    ]) {
      const d = { ...plot(), x, y, series: [{ label: 'Samples', kind: 'scatter', points: [{ x: x.min, y: y.min }, { x: x.max, y: y.max }] }] };
      checkAxisTicks(render(d, width), [x.min, x.max], [y.min, y.max], x.scale === 'log');
    }
  }
});

test('log axes put geometric means at visual midpoints and identify the scale', () => {
  const d = plot();
  d.x = { label: 'Strength', min: 1, max: 100, scale: 'log' };
  d.y = { label: 'Loss', min: 0.01, max: 1, scale: 'log' };
  d.series[0].points = [{ x: 1, y: 0.01 }, { x: 10, y: 0.1 }, { x: 100, y: 1 }];
  const { svg } = render(d);
  const [a, b, c] = marks(svg, 'data-tutor-coordinate-point');
  close(number(b.tag, 'cx'), (number(a.tag, 'cx') + number(c.tag, 'cx')) / 2);
  close(number(b.tag, 'cy'), (number(a.tag, 'cy') + number(c.tag, 'cy')) / 2);
  assert.match(svg, /log scale/);
});

test('very narrow positive log domains retain finite, distinct endpoints', () => {
  const d = plot();
  d.x = { label: 'X', min: 999999999.9999999, max: 1000000000, scale: 'log' };
  d.series[0].points = [{ x: d.x.min, y: 0 }, { x: d.x.max, y: 10 }];
  for (const width of [320, 408, 720]) {
    const frame = render(d, width);
    assert.doesNotMatch(frame.svg, /NaN|Infinity/);
    const [a, b] = marks(frame.svg, 'data-tutor-coordinate-point');
    assert.ok(number(a.tag, 'cx') < number(b.tag, 'cx'));
    checkAxisTicks(frame, [d.x.min, d.x.max], [d.y.min, d.y.max], true);
  }
});

test('log domains, stems, non-finite inputs and out-of-bounds annotations are rejected', () => {
  const d = plot(); d.x.scale = 'log';
  assert.match(errors(d), /positive/);
  d.x = { label: 'X', min: 1, max: 10, scale: 'log' };
  d.series[0].points = [{ x: 1, y: 1 }];
  d.annotations = [{ kind: 'circle', center: { x: 2, y: 5 }, radius: 3, label: 'Bad circle' }];
  assert.match(errors(d), /bounds/);
  d.annotations = [{ kind: 'reference-line', axis: 'x', value: 11, label: 'Outside' }];
  assert.match(errors(d), /bounds/);
  d.annotations = []; d.y.min = 1; d.series[0].kind = 'stem';
  assert.match(errors(d), /zero/);
  d.series[0].points[0].x = Infinity;
  assert.equal(schema.safeParse(d).success, false);
});

test('semantic structural fields reject SVG, CSS, arbitrary positions and malformed regions', () => {
  const d = plot();
  d.annotations = [{ kind: 'point', x: 1, y: 2, label: 'Point', fill: 'red' }];
  assert.equal(schema.safeParse(d).success, false);
  d.annotations = [{ kind: 'rectangle', xMin: 5, xMax: 2, yMin: 1, yMax: 3, label: 'Inverted' }];
  assert.match(errors(d), /increasing/);
  d.annotations = [{ kind: 'polygon', points: [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }], label: 'Collapsed' }];
  assert.match(errors(d), /area/);
  d.annotations = Array.from({ length: 17 }, () => ({ kind: 'point', x: 1, y: 1, label: 'Point' }));
  assert.equal(schema.safeParse(d).success, false);
});

test('step curves hold the previous value until the next x, with exact vertical jumps', () => {
  const d = plot(); d.series = [{ label: 'ECDF', kind: 'step', points: [{ x: 0, y: 2 }, { x: 4, y: 5 }, { x: 10, y: 9 }] }];
  for (const width of [320, 408, 720]) {
    const { svg } = render(d, width);
    const path = points(marks(svg, 'data-tutor-plot-series')[0].tag);
    const [a, b, c] = marks(svg, 'data-tutor-coordinate-point').map(({ tag }) => [number(tag, 'cx'), number(tag, 'cy')]);
    assert.deepEqual(path, [a, [b[0], a[1]], b, [c[0], b[1]], c]);
  }
  d.series[0].points[1].x = 0;
  assert.match(errors(d), /strictly increasing/);
});

test('uncertainty envelopes use low/high values and reject incomplete or inverted ranges', () => {
  const d = plot(); d.series = [{ label: 'Estimate', kind: 'line', points: [{ x: 0, y: 3, low: 1, high: 5 }, { x: 10, y: 6, low: 4, high: 8 }] }];
  const { svg } = render(d);
  const band = points(marks(svg, 'data-tutor-plot-uncertainty')[0].tag);
  assert.equal(band.length, 4);
  close(band[0][0], band[3][0]); close(band[1][0], band[2][0]);
  assert.ok(band[0][1] < band[3][1] && band[1][1] < band[2][1]);
  d.series[0].points[0].low = 4;
  assert.match(errors(d), /low ≤ y ≤ high/);
  delete d.series[0].points[0].low;
  assert.match(errors(d), /both low and high/);
});

test('stem series use one shared y=0 baseline and preserve signed observations', () => {
  const d = plot(); d.y.min = -10;
  d.series = [{ label: 'ACF', kind: 'stem', points: [{ x: 1, y: -5 }, { x: 2, y: 0 }, { x: 3, y: 8 }] }];
  const stems = marks(render(d).svg, 'data-tutor-plot-stem');
  assert.equal(stems.length, 3);
  const baseline = number(stems[0].tag, 'y1');
  stems.forEach(({ tag }) => close(number(tag, 'y1'), baseline));
  assert.ok(number(stems[0].tag, 'y2') > baseline);
  close(number(stems[1].tag, 'y2'), baseline);
  assert.ok(number(stems[2].tag, 'y2') < baseline);
});

test('sample identities are unique within each series while corresponding series may share them', () => {
  const d = plot(); d.series[0].points[0].id = 's1'; d.series[0].points[1].id = 's1';
  assert.match(errors(d), /unique/);
  d.series[0].points[1].id = 's2';
  d.series.push({ label: 'Predicted', kind: 'scatter', points: [{ x: 0, y: 1, id: 's1' }] });
  assert.equal(schema.safeParse(d).success, true);
});

const bars = variant => ({ kind: 'bar-chart', title: 'Class contributions', variant,
  categories: ['First', 'Second'], series: [{ label: 'A', values: [4, -2] }, { label: 'B', values: [-3, 5] }, { label: 'C', values: [2, -4] }],
});
test('grouped series share a zero baseline and retain category/series identity', () => {
  const { svg } = render(bars('grouped'));
  const values = marks(svg, 'data-tutor-grouped-bar');
  assert.equal(values.length, 6);
  const zero = number(marks(svg, 'data-tutor-bar-baseline')[0].tag, 'x1');
  for (const { tag, value } of values) {
    if (Number(value) > 0) close(number(tag, 'x'), zero);
    else close(number(tag, 'x') + number(tag, 'width'), zero);
  }
  assert.match(svg, /data-tutor-bar-category="First"/);
  assert.match(svg, /data-tutor-bar-series="B"/);
});

test('signed stacks accumulate positive and negative values independently', () => {
  const { svg } = render(bars('stacked'));
  const segments = marks(svg, 'data-tutor-stacked-bar');
  assert.equal(segments.length, 6);
  const first = segments.filter(m => /data-tutor-bar-category="First"/.test(m.tag));
  assert.deepEqual(first.map(({ tag }) => [number(tag, 'data-tutor-stack-from'), number(tag, 'data-tutor-stack-to')]), [[0, 4], [0, -3], [4, 6]]);
  close(number(first[0].tag, 'x') + number(first[0].tag, 'width'), number(first[2].tag, 'x'));
  close(number(first[1].tag, 'x') + number(first[1].tag, 'width'), number(first[0].tag, 'x'));
  const second = segments.filter(m => /data-tutor-bar-category="Second"/.test(m.tag));
  assert.deepEqual(second.map(({ tag }) => [number(tag, 'data-tutor-stack-from'), number(tag, 'data-tutor-stack-to')]), [[0, -2], [0, 5], [-2, -6]]);
  assert.match(svg, /net 3/);
  assert.match(svg, /net -1/);
});

test('stacked baselines stop before the value notes between categories', () => {
  const { svg } = render(bars('stacked'));
  const baselines = marks(svg, 'data-tutor-bar-baseline');
  assert.equal(baselines.length, 2);
  assert.ok(number(baselines[0].tag, 'y2') < number(baselines[1].tag, 'y1'));
  for (const { tag } of baselines) assert.ok(number(tag, 'y2') - number(tag, 'y1') <= 36);
});

test('bar variants reject mismatched values, duplicate labels and mixed legacy fields', () => {
  const d = bars('grouped'); d.series[0].values.pop();
  assert.match(errors(d), /categories/);
  d.series[0].values.push(2); d.categories[1] = d.categories[0];
  assert.match(errors(d), /unique/);
  d.categories[1] = 'Second'; d.bars = [{ label: 'A', value: 3 }, { label: 'B', value: 2 }];
  assert.match(errors(d), /legacy bars/);
  delete d.variant;
  assert.match(errors(d), /variant/);
});

test('all-zero multi-series bars emit finite zero marks', () => {
  for (const variant of ['grouped', 'stacked']) {
    const d = bars(variant); d.series.forEach(s => { s.values = [0, 0]; });
    const { svg } = render(d);
    assert.doesNotMatch(svg, /NaN|Infinity/);
    assert.equal(marks(svg, `data-tutor-${variant}-bar`).filter(m => m.tag.startsWith('<circle')).length, 6);
  }
});

test('annotations of every shape and long legends stay within finite narrow frames', () => {
  const d = plot(); d.annotations = [
    { kind: 'point', x: 0, y: 10, label: 'Boundary point label stays readable at the narrowest width' },
    { kind: 'segment', from: { x: 1, y: 1 }, to: { x: 9, y: 9 }, label: 'Residual' },
    { kind: 'polygon', points: [{ x: 1, y: 2 }, { x: 3, y: 8 }, { x: 5, y: 2 }], label: 'Decision region' },
    { kind: 'circle', center: { x: 5, y: 5 }, radius: 2, label: 'Neighbourhood' },
    { kind: 'band', axis: 'y', from: 4, to: 6, label: 'Tolerance' },
  ];
  for (const entry of [d, bars('grouped'), bars('stacked')]) {
    const { svg, width, height } = render(entry, 320);
    assert.ok(width >= 320 && height > 0);
    assert.doesNotMatch(svg, /NaN|Infinity/);
    for (const { tag } of marks(svg, 'data-tutor-plot-badge')) {
      assert.ok(number(tag, 'x') >= 0 && number(tag, 'y') >= 0);
      assert.ok(number(tag, 'x') + number(tag, 'width') <= width);
      assert.ok(number(tag, 'y') + number(tag, 'height') <= height);
    }
    for (const [tag] of svg.matchAll(/<text\b[^>]*>/g)) {
      assert.ok(number(tag, 'x') >= 0 && number(tag, 'x') <= width, tag);
      assert.ok(number(tag, 'y') >= 0 && number(tag, 'y') <= height, tag);
    }
  }
});

test('reference scenes validate, render at narrow/wide widths and cover the Phase 02 plot families', () => {
  assert.ok(references.length >= 25);
  assert.equal(new Set(references.map(r => r.id)).size, references.length);
  for (const reference of references) {
    assert.ok(reference.prompts.length && reference.keywords.length && reference.lessons.length, reference.id);
    assert.equal(reference.spec.version, 1);
    assert.doesNotThrow(() => schema.parse(reference.spec.diagram), reference.id);
    for (const width of [320, 720]) assert.doesNotMatch(render(reference.spec.diagram, width).svg, /NaN|Infinity/, reference.id);
  }
  for (const term of ['residual', 'sigmoid', 'svm', 'knn', 'k-means', 'gmm', 'smote', 'regularization', 'roc', 'pr', 'uncertainty', 'time series', 'importance'])
    assert.ok(references.some(r => r.keywords.includes(term)), term);
});


test('nearest-centroid reference computes each center from its displayed samples and puts the boundary at equal distance', () => {
  const d = references.find(r => r.id === 'nearest-centroid-boundary').spec.diagram;
  const centers = d.series.map(s => ({ x: s.points.reduce((sum, p) => sum + p.x, 0) / s.points.length,
    y: s.points.reduce((sum, p) => sum + p.y, 0) / s.points.length }));
  const annotations = d.annotations.filter(a => a.kind === 'point');
  centers.forEach((center, i) => { close(center.x, annotations[i].x); close(center.y, annotations[i].y); });
  const boundary = d.annotations.find(a => a.kind === 'reference-line');
  for (const y of [d.y.min, (d.y.min + d.y.max) / 2, d.y.max]) {
    const distance = c => (boundary.value - c.x) ** 2 + (y - c.y) ** 2;
    close(distance(centers[0]), distance(centers[1]));
  }
});
