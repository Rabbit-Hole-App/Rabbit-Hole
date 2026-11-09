import { diagramReferences } from './reference-library.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import TutorDiagram, { renderTutorDiagram } from './TutorDiagram.js';
import { tutorDiagramJsonSchema } from './spec.js';
import { ILLUSTRATION_KINDS } from './illustration-kinds.js';
import kindGallery from './kind-gallery.json' with { type: 'json' };

const fixtures = JSON.parse(readFileSync(new URL('./examples.json', import.meta.url), 'utf8'));
for (const kind of ['heatmap', 'sample-set', 'histogram', 'box-plot']) fixtures.push(diagramReferences.find(r => r.spec.diagram.kind === kind).spec);

fixtures.push(...kindGallery.filter(spec => ILLUSTRATION_KINDS.includes(spec.diagram.kind)));

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

// Owner E2 (2026-11-08): the deterministic fixtures include a binary tree, a tree with a root-to-descendant highlightPath and maths in labels.
test('examples.json covers a binary tree, a highlighted search path and maths in labels', () => {
  const byTitle = title => fixtures.find(f => f.diagram.title === title);
  const bst = renderToStaticMarkup(renderTutorDiagram(byTitle('A binary search tree'), 408).element);
  for (const label of ['8', '3', '10', '1', '6', '14']) assert.equal(bst.split(`>${label}</tspan>`).length - 1, 1, label);
  const insert = byTitle('Inserting 7 into the search tree');
  assert.deepEqual(insert.diagram.highlightPath, ['n8', 'n3', 'n6', 'n7']);
  const path = renderToStaticMarkup(renderTutorDiagram(insert, 408).element);
  assert.ok(path.includes('data-tutor-path'), 'the search path is drawn');
  assert.ok(path.includes('7 &gt; 6'), 'the comparison is on its edge');
  const maths = renderToStaticMarkup(renderTutorDiagram(byTitle('One gradient descent step'), 408).element);
  assert.ok(maths.includes('foreignObject') && maths.includes('katex'), 'the formulas are typeset');
  assert.doesNotMatch(maths, /<tspan[^>]*>[^<]*[$]/, 'no drawn text keeps a raw delimiter');
});
