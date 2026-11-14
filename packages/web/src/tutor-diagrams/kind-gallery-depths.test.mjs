import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { lintDiagramContent } from './content-contract.js';
import { mathLabel } from './math.js';
import { parseTutorDiagram, tutorDiagramJsonSchema } from './spec.js';
import { renderTutorDiagram } from './TutorDiagram.js';

const gallery = JSON.parse(readFileSync(new URL('./kind-gallery.json', import.meta.url), 'utf8'));
const depthGallery = JSON.parse(readFileSync(new URL('./kind-gallery-depths.json', import.meta.url), 'utf8'));
const originalByKind = new Map(gallery.map(spec => [spec.diagram.kind, spec]));
const depths = ['overview', 'standard', 'deep'];

const editableLabels = new Set(['title', 'label', 'heading', 'claim', 'conclusion', 'operation', 'items', 'columns', 'steps', 'xLabel', 'name', 'dimensions', 'dims']);
const optionalCopy = new Set(['caption', 'detail']);
const authoredFields = new Set([...editableLabels, ...optionalCopy, 'time', 'unit', 'cells', 'account']);

function structuralData(value, field) {
  if (typeof value === 'string' && editableLabels.has(field)) return '';
  if (Array.isArray(value)) return value.map(item => structuralData(item, field));
  if (value && typeof value === 'object') {
    // Keep array lengths and structural strings, including times, units and the matrix's numeric cells.
    return Object.fromEntries(Object.entries(value)
      .filter(([key, entry]) => !(optionalCopy.has(key) && typeof entry === 'string'))
      .map(([key, entry]) => [key, structuralData(entry, key)]));
  }
  return value;
}

function authoredText(value, field) {
  if (typeof value === 'string') return authoredFields.has(field) ? [value] : [];
  if (Array.isArray(value)) return value.flatMap(item => authoredText(item, field));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, entry]) => authoredText(entry, key));
  }
  return [];
}

test('the depth gallery has one Brief, Balanced and Detailed spec for every supported kind', () => {
  const schema = tutorDiagramJsonSchema.properties.diagram;
  const kinds = (schema.anyOf ?? schema.oneOf).map(shape => shape.properties.kind.const);
  assert.equal(kinds.length, 25);
  assert.deepEqual(depthGallery.map(entry => entry.kind).sort(), kinds.sort());
  for (const entry of depthGallery) {
    assert.deepEqual(Object.keys(entry).sort(), ['deep', 'kind', 'overview', 'standard']);
    for (const depth of depths) {
      assert.equal(entry[depth].version, 1, `${entry.kind} ${depth}`);
      assert.equal(entry[depth].diagram.kind, entry.kind, `${entry.kind} ${depth}`);
    }
  }
});

const mathSymbols = /[$\\\p{Sm}¹²³\u2070-\u209f]/u;
const technicalTerms = /\b(?:veneer|evaporation|condensation|nucleus|membrane|pollination|interval|quadratic|debit|credit|quartile|histogram|interquartile|whisker)s?\b/iu;

for (const { kind, overview, standard, deep } of depthGallery) {
  test(`${kind} keeps the original Standard and shares its diagram data across depths`, () => {
    const original = originalByKind.get(kind);
    assert.equal(JSON.stringify(standard), JSON.stringify(original));
    const data = structuralData(original);
    assert.deepEqual(structuralData(overview), data);
    assert.deepEqual(structuralData(deep), data);
  });

  test(`${kind} uses everyday wording in Overview and typesettable math in Deep`, () => {
    // Inspect authored copy before the renderer adds diagram notation such as graph arrows.
    const overviewText = authoredText(overview);
    assert.notDeepEqual(overviewText, authoredText(standard));
    for (const label of overviewText) {
      assert.doesNotMatch(label, mathSymbols);
      assert.doesNotMatch(label, technicalTerms);
    }

    const math = authoredText(deep).flatMap(label => mathLabel(label).math);
    assert.ok(math.length > 0, 'Deep needs at least one inline formula');
    for (const { raw, set } of math) {
      assert.match(raw, /^\$[^$]+\$$/u);
      assert.ok(set, `KaTeX could not render ${raw}`);
    }
  });

  for (const [depth, spec] of Object.entries({ overview, standard, deep })) {
    test(`${kind} ${depth} parses, passes the content contract and renders at all gallery widths`, () => {
      const saved = JSON.stringify(spec);
      assert.deepEqual(parseTutorDiagram(saved), spec);
      assert.deepEqual(lintDiagramContent(spec), []);
      for (const available of [320, 408, 720]) {
        const { element, width, height } = renderTutorDiagram(saved, available);
        const svg = renderToStaticMarkup(element);
        assert.ok(Number.isFinite(width) && width >= available);
        assert.ok(Number.isFinite(height) && height > 0);
        assert.match(svg, /^<svg /u);
        assert.ok(svg.includes(`viewBox="0 0 ${width} ${height}"`));
        assert.ok(svg.includes(`data-tutor-diagram="${kind}"`));
        assert.doesNotMatch(svg, /NaN|Infinity|undefined/u);
        if (depth === 'deep') assert.match(svg, /<foreignObject\b/u);
      }
    });
  }
}
