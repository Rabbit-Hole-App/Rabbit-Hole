import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseTutorDiagram, tutorDiagramJsonSchema } from './spec.js';
import { renderTutorDiagram } from './TutorDiagram.js';

const gallery = JSON.parse(readFileSync(new URL('./kind-gallery.json', import.meta.url), 'utf8'));
const budget = JSON.parse(readFileSync(new URL('./kind-gallery.token-budget.json', import.meta.url), 'utf8'));

test('the measured compact specs fit the 200-token budget', () => {
  assert.equal(budget.encoding, 'cl100k_base');
  assert.equal(budget.maxTokens, 200);
  assert.equal(Object.keys(budget.entries).length, gallery.length);
  for (const spec of gallery) {
    const { kind } = spec.diagram;
    const measured = budget.entries[kind];
    assert.equal(measured?.sha256, createHash('sha256').update(JSON.stringify(spec)).digest('hex'),
      `Recount tokens for the edited ${kind} spec`);
    assert.ok(Number.isInteger(measured.tokens) && measured.tokens > 0 && measured.tokens <= budget.maxTokens, kind);
  }
});

test('the gallery contains exactly one spec for each supported kind', () => {
  const diagramSchema = tutorDiagramJsonSchema.properties.diagram;
  const kinds = (diagramSchema.anyOf ?? diagramSchema.oneOf).map(shape => shape.properties.kind.const);
  assert.equal(kinds.length, 25);
  assert.deepEqual(gallery.map(spec => spec.diagram.kind).sort(), kinds.sort());
});

for (const spec of gallery) {
  const { kind, title } = spec.diagram;
  test(`${kind} gallery spec parses and renders at narrow, card and wide widths`, () => {
    const saved = JSON.stringify(spec);
    assert.deepEqual(parseTutorDiagram(saved), spec);
    for (const available of [320, 408, 720]) {
      const { element, width, height } = renderTutorDiagram(saved, available);
      const svg = renderToStaticMarkup(element);
      assert.ok(Number.isFinite(width) && width >= available);
      assert.ok(Number.isFinite(height) && height > 0);
      assert.ok(svg.startsWith('<svg '));
      assert.ok(svg.includes(`viewBox="0 0 ${width} ${height}"`));
      assert.ok(svg.includes(`data-tutor-diagram="${kind}"`));
      assert.ok(svg.includes(`<title>${title}</title>`));
      assert.match(svg, /role="img"/);
      assert.match(svg, /fill="var\(--viz-surface, #fbfbfa\)"/);
      assert.doesNotMatch(svg, /NaN|Infinity|undefined/);
    }
  });
}

test('the coordinate plot samples square area at nine side lengths and labels one point', () => {
  const spec = gallery.find(entry => entry.diagram.kind === 'coordinate-plot');
  assert.ok(spec, 'the gallery contains a coordinate plot');
  const { series } = parseTutorDiagram(spec).diagram;
  assert.equal(series.length, 1);
  const [curve] = series;
  assert.equal(curve.kind, 'line');
  assert.equal(curve.label, '$A=s^2$');
  assert.deepEqual(curve.points.map(({ x, y }) => [x, y]), [
    [0, 0], [1, 1], [2, 4], [3, 9], [4, 16], [5, 25], [6, 36], [7, 49], [8, 64],
  ]);
  assert.deepEqual(curve.points.filter(point => point.label), [{ x: 4, y: 16, label: '$s=4$' }]);
});
