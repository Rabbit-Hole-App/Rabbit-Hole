import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { layouts } from './layouts.js';
import { textWidth } from './primitives.js';

// MAT-F: the headings of one header row share one size, the row headings share one, each the smallest any of them needs.
const texts = scene => [...renderToStaticMarkup(h('svg', null, ...scene.elements)).matchAll(/<text\b[^>]*font-size="([\d.]+)"[^>]*font-weight="(\d+)"[^>]*>(.*?)<\/text>/g)]
  .map(([, size, weight, body]) => ({ size: Number(size), weight: Number(weight), lines: [...body.matchAll(/<tspan[^>]*>(.*?)<\/tspan>/g)].map(line => line[1]) }));

const matrix = (columns, rows) => ({ kind: 'matrix', columns, rows: rows.map(heading => ({ heading, cells: columns.map(() => 'x') })) });
const heatmap = (columns, rows) => ({ kind: 'heatmap', columns, range: { min: 0, max: 9 }, rows: rows.map(label => ({ label, cells: columns.map(() => 5) })) });
// Headings are the weight-700 texts: the header row first, then one row heading per row.
const sizes = (items, columns, rows) => ({ columns: items.slice(0, columns).map(item => item.size), rows: items.slice(columns, columns + rows).map(item => item.size) });

const cases = [
  ['matrix', layouts.matrix(matrix(['Input', 'Extractor', 'Feature vector', 'Classifier'], ['Text', 'Image']), 408), 4, 2],
  ['matrix with two row headings of different need', layouts.matrix(matrix(['First sentence', 'Second sentence', 'Training label'], ['Actual continuation', 'Random sample']), 408), 3, 2],
  ['heatmap', layouts.heatmap({ ...heatmap(['Entrance', 'Center', 'Exit'], ['Morning', 'Midday', 'Afternoon']), rowLabel: 'Market period' }, 408), 4, 3],
];

for (const [name, scene, columns, rows] of cases) {
  test(`${name}: one header row, one size; the row headings, one size; the minimum holds`, () => {
    const items = texts(scene).filter(item => item.weight === 700);
    const { columns: header, rows: headings } = sizes(items, columns, rows);
    assert.equal(new Set(header).size, 1, `header row sizes ${header}`);
    assert.equal(new Set(headings).size, 1, `row heading sizes ${headings}`);
    for (const size of [...header, ...headings]) assert.ok(size >= 9, `size ${size} is under the 9 px minimum`);
  });
}

test('a heading still fits its cell at the shared size', () => {
  const scene = layouts.matrix(matrix(['Input', 'Extractor', 'Feature vector', 'Classifier'], ['Text', 'Image']), 408);
  const cell = scene.geometry.columnHeadings[0].width;
  for (const { size, lines } of texts(scene).filter(item => item.weight === 700)) {
    for (const line of lines) assert.ok(textWidth(line, size) <= cell - 12 + 1e-6, `"${line}" at ${size} is wider than its cell`);
  }
});

test('headings that need no step down stay at the body size', () => {
  const items = texts(layouts.matrix(matrix(['Name', 'Size'], ['Cat', 'Dog']), 408)).filter(item => item.weight === 700);
  assert.deepEqual(items.map(item => item.size), [15, 15, 15, 15]);
});

test('the shared size is the smallest any heading needs, not the largest', () => {
  const alone = texts(layouts.matrix(matrix(['Extractor'], ['Text']), 408)).filter(item => item.weight === 700)[0].size;
  const mixed = texts(layouts.matrix(matrix(['Input', 'Extractor', 'Feature vector', 'Classifier'], ['Text']), 408)).filter(item => item.weight === 700);
  assert.ok(mixed.slice(0, 4).every(item => item.size === Math.min(alone, mixed[0].size)));
  assert.ok(mixed[0].size < 15);
});
