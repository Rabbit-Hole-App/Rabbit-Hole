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
