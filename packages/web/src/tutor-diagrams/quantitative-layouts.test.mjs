import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { quantitativeLayouts } from './quantitative-layouts.js';

function render({ width, height, elements }) {
  return renderToStaticMarkup(h('svg', { viewBox: `0 0 ${width} ${height}` }, ...elements));
}

function marks(svg, attr) {
  return [...svg.matchAll(new RegExp(`<[^>]* ${attr}="([^"]*)"[^>]*>`, 'g'))]
    .map(match => ({ tag: match[0], value: match[1] }));
}

function number(tag, attr) {
  const value = tag.match(new RegExp(` ${attr}="([^"]+)"`))?.[1];
  assert.ok(value, `${attr} missing on ${tag}`);
  const n = Number(value);
  assert.ok(Number.isFinite(n), `${attr} must be finite on ${tag}`);
  return n;
}

const numberLine = {
  min: -2, max: 3,
  markers: [{ value: 0.5, label: 'Reading A' }, { value: 0.500001, label: 'Reading B' }],
  intervals: [{ from: -1, to: 0.5, startClosed: false, endClosed: true, label: 'Band' }],
};

test('number line keeps nearby values at their exact x coordinates with separate marker rows', () => {
  const svg = render(quantitativeLayouts['number-line'](numberLine, 320));
  const [a, b] = marks(svg, 'data-tutor-number-marker');
  assert.deepEqual([a.value, b.value], ['0.5', '0.500001']);
  assert.ok(number(a.tag, 'cx') < number(b.tag, 'cx'));
  assert.notEqual(number(a.tag, 'cy'), number(b.tag, 'cy'));
  assert.match(svg, /Reading A/);
  assert.match(svg, /0\.500001/);
  assert.match(svg, /\(-1, 0\.5\]/);
});

test('number line separates very close open and closed endpoints', () => {
  const svg = render(quantitativeLayouts['number-line']({
    min: 0, max: 10, markers: [],
    intervals: [{ from: 4, to: 4.00001, startClosed: false, endClosed: true, label: 'Tight range' }],
  }, 320));
  const [left, right] = marks(svg, 'data-tutor-endpoint');
  assert.deepEqual([left.value, right.value], ['open', 'closed']);
  assert.ok(number(left.tag, 'cx') < number(right.tag, 'cx'));
  assert.notEqual(number(left.tag, 'cy'), number(right.tag, 'cy'));
});

const coordinate = {
  x: { label: 'Time', min: -2, max: 2, unit: 's' },
  y: { label: 'Height', min: -3, max: 3, unit: 'm' },
  series: [
    { label: 'Model', kind: 'line', points: [{ x: -2, y: -3 }, { x: 0, y: 0 }, { x: 2, y: 3 }] },
    { label: 'Observed', kind: 'scatter', points: [{ x: 0, y: 0.0001 }] },
  ],
};

test('coordinate plot puts values on a linear scale and exposes exact values per point', () => {
  const svg = render(quantitativeLayouts['coordinate-plot'](coordinate, 320));
  const [a, b, c, d] = marks(svg, 'data-tutor-coordinate-point');
  assert.deepEqual([a.value, b.value, c.value, d.value], ['-2,-3', '0,0', '2,3', '0,0.0001']);
  assert.equal(number(b.tag, 'cx'), (number(a.tag, 'cx') + number(c.tag, 'cx')) / 2);
  assert.equal(number(b.tag, 'cy'), (number(a.tag, 'cy') + number(c.tag, 'cy')) / 2);
  assert.match(svg, /Time \(s\)/);
  assert.match(svg, /Height \(m\)/);
  assert.match(d.tag, /^<rect/);
});

test('coordinate plot emits finite geometry even for ranges crossing both finite extremes', () => {
  const min = -Number.MAX_VALUE;
  const max = Number.MAX_VALUE;
  const svg = render(quantitativeLayouts['coordinate-plot']({
    x: { label: 'X', min, max },
    y: { label: 'Y', min, max },
    series: [{ label: 'Line', kind: 'line', points: [{ x: min, y: max }, { x: max, y: min }] }],
  }, 320));
  assert.doesNotMatch(svg, /NaN|Infinity/);
});

test('bars start at a shared zero baseline and show signed and zero values', () => {
  const svg = render(quantitativeLayouts['bar-chart']({
    bars: [{ label: 'Loss', value: -4 }, { label: 'Flat', value: 0 }, { label: 'Gain', value: 2 }],
    unit: 'kg',
  }, 320));
  const [{ tag: baseline }] = marks(svg, 'data-tutor-bar-baseline');
  const [loss, flat, gain] = marks(svg, 'data-tutor-bar');
  const zero = number(baseline, 'x1');
  assert.deepEqual([loss.value, flat.value, gain.value], ['-4', '0', '2']);
  assert.equal(number(loss.tag, 'x') + number(loss.tag, 'width'), zero);
  assert.equal(number(flat.tag, 'cx'), zero);
  assert.equal(number(gain.tag, 'x'), zero);
  assert.match(svg, /-4 kg/);
  assert.match(svg, /0 kg/);
  assert.match(svg, /2 kg/);
});

test('all-zero bars have zero marks and finite geometry', () => {
  const svg = render(quantitativeLayouts['bar-chart']({
    bars: [{ label: 'Monday', value: 0 }, { label: 'Tuesday', value: 0 }],
  }, 320));
  assert.deepEqual(marks(svg, 'data-tutor-bar').map(({ tag }) => tag.slice(0, 7)), ['<circle', '<circle']);
  assert.doesNotMatch(svg, /NaN|Infinity/);
});

test('all three layouts keep SVG geometry within narrow and wide frames', () => {
  const entries = [
    ['number-line', numberLine],
    ['coordinate-plot', coordinate],
    ['bar-chart', { bars: [{ label: 'A', value: -1 }, { label: 'B', value: 3 }] }],
  ];
  for (const width of [320, 720]) {
    for (const [kind, diagram] of entries) {
      const frame = quantitativeLayouts[kind](diagram, width);
      assert.ok(frame.width >= width && Number.isFinite(frame.height) && frame.height > 0, kind);
      const svg = render(frame);
      assert.doesNotMatch(svg, /NaN|Infinity/, kind);
      for (const [tag] of svg.matchAll(/<rect\b[^>]*>/g)) {
        assert.ok(number(tag, 'x') >= 0 && number(tag, 'y') >= 0, tag);
        assert.ok(number(tag, 'x') + number(tag, 'width') <= frame.width + 0.01, tag);
        assert.ok(number(tag, 'y') + number(tag, 'height') <= frame.height + 0.01, tag);
      }
    }
  }
});
