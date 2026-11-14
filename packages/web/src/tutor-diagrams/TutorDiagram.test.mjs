import { diagramReferences, illustrationReferences, transformerWalkthroughReferences } from './reference-library.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import TutorDiagram, { renderTutorDiagram } from './TutorDiagram.js';
import { tutorDiagramJsonSchema } from './spec.js';
import { ILLUSTRATION_KINDS } from './illustration-kinds.js';
import { lessonDecisionTreesReferences } from './lesson-decision-trees-references.js';
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

test('a narrow embedding caption keeps its complete native SVG fallback and inline math', () => {
  const reference = transformerWalkthroughReferences.find(({ id }) => id === 'ml-transformer-token-embeddings');
  const spec = structuredClone(reference.depths.deep.spec);
  spec.diagram.caption = 'Four entries shown per row. Add position with $x_p=e_p+PE_p$.';
  const { element } = renderTutorDiagram(spec, 320);
  const svg = renderToStaticMarkup(element);
  const caption = svg.slice(svg.lastIndexOf('<switch'));
  assert.match(caption, /requiredExtensions="http:\/\/www\.w3\.org\/1999\/xhtml"/);
  assert.match(caption, /<div xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"[^>]*>/);
  assert.match(caption, /data-tutor-tex="\$x_p=e_p\+PE_p\$"/);
  const fallback = caption.slice(caption.lastIndexOf('data-explanation-skip'));
  const lines = [...fallback.matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)].map(([, line]) => line);
  // Owner decision 2026-11-12 (readable fallback for maths): the native text writes subscripts and exponents as Unicode.
  assert.equal(lines.join(' '), 'Four entries shown per row. Add position with xₚ=eₚ+PEₚ.');
});

test('the Gini and entropy caption shows both formulas with and without XHTML support', () => {
  const ref = lessonDecisionTreesReferences.find(({ id }) => id === 'ml-trees-gini-vs-entropy');
  for (const spec of [ref.depths.overview.spec, ref.spec, ref.depths.deep.spec]) {
    const svg = renderToStaticMarkup(renderTutorDiagram(spec, 408).element);
    const caption = svg.slice(svg.lastIndexOf('<switch'));
    const [primary, fallback] = caption.split('data-explanation-skip');
    assert.ok((primary.match(/class="katex"/g) ?? []).length >= 2);
    const text = [...fallback.matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)].map(([, line]) => line).join(' ');
    assert.match(text, /G\(p\)=2p\(1-p\)/);
    assert.match(text, /H\(p\)=-p log₂ p-\(1-p\) log₂\(1-p\)/);
    assert.doesNotMatch(text, /\\[A-Za-z]+/);
  }
});

test('an unbreakable formula in a caption fits the SVG bounds, including in comparison panels', () => {
  const caption = 'Before $' + 'W'.repeat(42) + '$ after.';
  const tensor = { kind: 'tensor', title: 'Input', tensor: { dimensions: '1 × 2', rows: 1, columns: 2, values: [1, 2] } };
  const main = { version: 1, diagram: { ...tensor, caption } };
  const nested = { version: 1, diagram: { kind: 'comparison', variant: 'panels', title: 'Compare variants', panels: [
    { heading: 'One', diagram: { kind: 'block-stack', title: 'One', caption, blocks: [
      { id: 'a', label: 'Input' }, { id: 'b', label: 'Output' },
    ] } },
    { heading: 'Two', diagram: { kind: 'block-stack', title: 'Two', blocks: [
      { id: 'a', label: 'Embedding' }, { id: 'b', label: 'Prediction' },
    ] } },
  ] } };
  for (const spec of [main, nested]) {
    const { element, width, height } = renderTutorDiagram(spec, 320);
    const svg = renderToStaticMarkup(element);
    const formula = svg.match(/<foreignObject x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"/);
    assert.ok(formula);
    const [x, y, formulaWidth, formulaHeight] = formula.slice(1).map(Number);
    assert.ok(x >= 0 && x + formulaWidth <= width, svg.slice(0, 300));
    assert.ok(y >= 0 && y + formulaHeight <= height);
    assert.match(svg, /data-explanation-skip=""/);
  }
});

test('the exact local:global component label still fits the minimized Gemma diagram', () => {
  const reference = illustrationReferences.find(({ id }) => id === 'ml-gemma-decoder-stack');
  const spec = structuredClone(reference.depths.deep.spec);
  spec.diagram.blocks.find(({ id }) => id === 'att').diagram.steps[1].label =
    'Sliding-window + GQA attention (5:1 local:global)';
  assert.equal(renderTutorDiagram(spec, 320).width, 320);
});
