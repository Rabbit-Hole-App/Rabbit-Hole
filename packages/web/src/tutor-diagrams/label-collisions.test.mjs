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

test('grouped bars: a value wider than its bar that would sit on a taller neighbour drops its unit; the others keep it', () => {
  const svg = svgOf({ kind: 'bar-chart', variant: 'grouped', title: 'Full softmax and top-2 sampling', unit: '%', categories: ['on', 'near', 'under', 'by', 'in'],
    series: [{ label: 'Full softmax', values: [42, 28, 16, 8, 6] }, { label: 'Top-2 renormalized', values: [60, 40, 0, 0, 0] }] });
  for (const bare of ['42', '28']) assert.ok(centreY(svg, bare, 15, 600) > 0, `${bare} is drawn without its unit`);
  for (const text of ['42 %', '28 %']) assert.ok(!(centreY(svg, text, 15, 600) > 0), `${text} runs over the taller bar next to it`);
  for (const text of ['60 %', '40 %', '16 %', '0 %']) assert.ok(centreY(svg, text, 15, 600) > 0, `${text} keeps its unit`);
});
