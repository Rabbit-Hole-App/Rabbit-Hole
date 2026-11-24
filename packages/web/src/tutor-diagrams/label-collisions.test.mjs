// LBL-1: three label collisions at the 408 px card width (found in the GEN-1 R2 bench sheets): each test draws the spec that showed it.
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderTutorDiagram } from './TutorDiagram.js';

const svgOf = spec => renderToStaticMarkup(renderTutorDiagram({ version: 1, diagram: spec }, 408).element);
// The centre y of the text element drawn with this string at this font size.
const centreY = (svg, text, size, weight = 500) => Number(svg.match(new RegExp(`<text[^>]* y="([\\d.]+)"[^>]*font-size="${size}" font-weight="${weight}"[^>]*><tspan[^>]*>${text.replace(/[-.]/g, '\\$&')}</tspan>`))?.[1]);

test('a negative bar\'s value never overlaps the category names (the bar reaches the axis end)', () => {
  const svg = svgOf({ kind: 'bar-chart', title: 'Token logits', bars: [{ label: 'the', value: 0.5 }, { label: 'cat', value: -0.1 }, { label: 'sat', value: 0.8 }] });
  const value = centreY(svg, '-0.1', 15, 600), name = centreY(svg, 'cat', 13);
  assert.ok(Number.isFinite(value) && Number.isFinite(name), `both texts are drawn (${value}, ${name})`);
  assert.ok(value + 7.5 <= name - 5, `the value (${value}) runs into the name (${name})`);
});

test('grouped bars: when a value would sit on a taller neighbour no value carries the unit and it is printed once after the top axis number; a chart where none touches keeps it on every value', () => {
  const svg = svgOf({ kind: 'bar-chart', variant: 'grouped', title: 'Full softmax and top-2 sampling', unit: '%', categories: ['on', 'near', 'under', 'by', 'in'],
    series: [{ label: 'Full softmax', values: [42, 28, 16, 8, 6] }, { label: 'Top-2 renormalized', values: [60, 40, 0, 0, 0] }] });
  for (const bare of ['42', '28', '60', '40', '16', '8', '6', '0']) assert.ok(centreY(svg, bare, 15, 600) > 0, `${bare} is drawn without its unit`);
  assert.equal((svg.match(/>[\d.]+ %</g) ?? []).length, 1, 'the unit is printed once');
  assert.ok(centreY(svg, '60 %', 15, 500) > 0, 'after the top axis number');
  const calm = svgOf({ kind: 'bar-chart', variant: 'grouped', title: 'Label-prior shift', unit: 'samples', categories: ['Class 0', 'Class 1'], series: [{ label: 'Reference window', values: [7, 3] }, { label: 'Current window', values: [3, 7] }] });
  assert.ok(centreY(calm, '7 samples', 15, 600) > 0, 'a chart where no value touches another bar is not changed');
});

test('coordinate plot: the curve\'s name keeps clear of the printed values (it stood on the 0.71 of the silhouette plot)', () => {
  const svg = svgOf({ kind: 'coordinate-plot', title: 'Silhouette compares candidate cluster counts', x: { label: 'Number of clusters', min: 2, max: 6 }, y: { label: 'Silhouette score', min: 0, max: 1 },
    series: [{ label: 'Silhouette', kind: 'line', points: [{ x: 2, y: 0.48 }, { x: 3, y: 0.71 }, { x: 4, y: 0.56 }, { x: 5, y: 0.42 }, { x: 6, y: 0.35 }] }] });
  const at = attr => { const tag = svg.match(new RegExp(`<text[^>]*${attr}[^>]*>`))[0]; return [Number(tag.match(/ x="([\d.]+)"/)[1]), Number(tag.match(/ y="([\d.]+)"/)[1])]; };
  const [nx, ny] = at('data-tutor-plot-curve-label'), values = [...svg.matchAll(/<text[^>]*data-tutor-plot-value[^>]*>/g)].map(([tag]) => [Number(tag.match(/ x="([\d.]+)"/)[1]), Number(tag.match(/ y="([\d.]+)"/)[1])]);
  assert.equal(values.length, 5);
  for (const [vx, vy] of values) assert.ok(Math.abs(nx - vx) >= 55 || Math.abs(ny - vy) >= 16, `the name (${nx}, ${ny}) is on the value at (${vx}, ${vy})`);
});

// LBL-2: one rule per chart: every bar carries its value or none does.
const valueLabels = svg => (svg.match(/font-size="15" font-weight="600"/g) ?? []).length;
test('grouped bars: a value that does not fit its bar ("0.65" where "0.2" does) takes every other value with it: none is printed', () => {
  const heads = { kind: 'bar-chart', variant: 'grouped', title: 'Attention weights by head and token', categories: ['the_1', 'cat', 'sat', 'on', 'the_2', 'mat'],
    series: [{ label: 'Head A', values: [0.05, 0.65, 0.2, 0.05, 0.02, 0.03] }, { label: 'Head B', values: [0.38, 0.17, 0.09, 0.05, 0.08, 0.23] }] };
  assert.equal(valueLabels(svgOf(heads)), 0, 'mixed labelling (0.2 on one bar of twelve) is gone');
});

test('bars: when every value fits every one is printed, and a unit that does not fit moves to the top axis number with the bare values', () => {
  const fits = { kind: 'bar-chart', variant: 'grouped', title: 'Label-prior shift', unit: 'samples', categories: ['Class 0', 'Class 1'], series: [{ label: 'Reference window', values: [7, 3] }, { label: 'Current window', values: [3, 7] }] };
  assert.equal(valueLabels(svgOf(fits)), 4);
  const loans = svgOf({ kind: 'bar-chart', variant: 'grouped', title: 'Loans', unit: 'books', categories: ['Mon', 'Tue', 'Wed'], series: [{ label: 'Town', values: [9, 7, 11] }, { label: 'Park', values: [7, 12, 8] }] });
  assert.equal(valueLabels(loans), 6, 'the bare values all fit');
  assert.ok(centreY(loans, '12.5 books', 15, 500) > 0, 'the unit is printed once, after the top axis number');
  const logits = { kind: 'bar-chart', title: 'Vocabulary logits', bars: [{ label: 'the', value: 0.501 }, { label: 'cat', value: -0.108 }, { label: 'sat', value: 0.78 }, { label: 'on', value: 1.745 }, { label: 'mat', value: 0.201 }, { label: 'slept', value: -0.495 }] };
  assert.equal(valueLabels(svgOf(logits)), 6, 'a negative value goes under its bar end, so all six are printed');
});

test('a plain chart: a negative bar value stands under the bar end (not above), the category names move down to make room, and a chart where a value truly cannot be placed prints none', () => {
  const logits = svgOf({ kind: 'bar-chart', title: 'Vocabulary logits', bars: [{ label: 'the', value: 0.501 }, { label: 'cat', value: -0.108 }, { label: 'sat', value: 0.78 }, { label: 'on', value: 1.745 }, { label: 'mat', value: 0.201 }, { label: 'slept', value: -0.495 }] });
  const barEnd = value => { const [, y, height] = logits.match(new RegExp('<rect[^>]* y="([0-9.]+)"[^>]* height="([0-9.]+)"[^>]*data-tutor-bar="' + value + '"')); return Number(y) + Number(height); };
  for (const [text, value] of [['-0.108', -0.108], ['-0.495', -0.495]]) assert.ok(centreY(logits, text, 15, 600) - 7.5 >= barEnd(value), `${text} stands under its bar end`);
  assert.ok(centreY(logits, '-0.495', 15, 600) + 7.5 <= centreY(logits, 'slept', 13) - 5, 'the names moved down clear of it');
  // a value wider than its whole slot cannot be placed: none is printed
  const crowded = svgOf({ kind: 'bar-chart', title: 'Wide values', bars: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((label, i) => ({ label, value: i % 2 ? -0.123456 : 0.123456 })) });
  assert.equal(valueLabels(crowded), 0, 'eight wide values in 408 px: none is printed');
});
