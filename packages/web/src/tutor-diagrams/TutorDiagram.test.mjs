import { diagramReferences } from './reference-library.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import TutorDiagram, { renderTutorDiagram } from './TutorDiagram.js';
import { tutorDiagramJsonSchema } from './spec.js';

const fixtures = JSON.parse(readFileSync(new URL('./examples.json', import.meta.url), 'utf8'));
for (const kind of ['heatmap', 'sample-set', 'histogram', 'box-plot']) fixtures.push(diagramReferences.find(r => r.spec.diagram.kind === kind).spec);

test('every fixture renders deterministically, with a readable SVG and the shared surface', () => {
  const shapes = tutorDiagramJsonSchema.properties.diagram;
  const kinds = (shapes.anyOf ?? shapes.oneOf).map(shape => shape.properties.kind.const);
  assert.deepEqual(new Set(fixtures.map(fixture => fixture.diagram.kind)), new Set(kinds));
  for (const fixture of fixtures) {
    const { element, width, height } = renderTutorDiagram(fixture, 408);
    const markup = renderToStaticMarkup(element);
    assert.equal(markup, renderToStaticMarkup(renderTutorDiagram(JSON.stringify(fixture), 408).element));
    assert.ok(width >= 408 && height > 100);
    assert.match(markup, /<svg[^>]+role="img"/);
    assert.match(markup, /fill="var\(--viz-surface, #fbfbfa\)"/);
    assert.ok(markup.includes(fixture.diagram.title), fixture.diagram.title);
    assert.ok(!markup.includes('NaN'), fixture.diagram.kind);
  }
});

test('the drop-in component renders escaped text and uses the caller fallback for invalid input', () => {
  const spec = {
    version: 1, diagram: { kind: 'cycle', title: 'Render <script> as text', steps: ['A & B', 'Review'] },
  };
  const html = renderToStaticMarkup(createElement(TutorDiagram, { spec }));
  assert.match(html, /Render &lt;script&gt; as text/);
  assert.match(html, /A &amp; B/);
  assert.ok(!html.includes('<script>'));
  const fallback = createElement('p', null, 'Existing explanation');
  const invalid = renderToStaticMarkup(createElement(TutorDiagram, { spec: { version: 2 }, fallback }));
  assert.equal(invalid, '<p>Existing explanation</p>');
});

test('a wide matrix retains its native text size in the horizontally scrollable host', () => {
  const columns = ['One', 'Two', 'Three', 'Four', 'Five'];
  const spec = {
    version: 1, diagram: {
      kind: 'matrix', title: 'Wide matrix', columns,
      rows: ['Input', 'Output'].map(heading => ({ heading, cells: columns })),
    },
  };
  const { width, element } = renderTutorDiagram(spec, 320);
  assert.ok(width > 320);
  const svg = renderToStaticMarkup(element);
  assert.ok(svg.includes(`width="${width}"`));
  assert.match(svg, /font-size="14"/);
  assert.match(renderToStaticMarkup(createElement(TutorDiagram, { spec })), /overflow-x:auto/);
});
