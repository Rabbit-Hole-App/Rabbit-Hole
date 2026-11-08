import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { diagramReferences, phase02LessonCoverage } from './reference-library.js';
import { parseTutorDiagram, tutorDiagramSchema, tutorDiagramJsonSchema, tutorDiagramVisibleText, describeTutorDiagram } from './spec.js';
import { renderTutorDiagram } from './TutorDiagram.js';

test('the production schema, reference registry and renderer agree on every kind and all 21 lessons', () => {
  const kinds = (tutorDiagramJsonSchema.properties.diagram.anyOf ?? tutorDiagramJsonSchema.properties.diagram.oneOf).map(s => s.properties.kind.const);
  assert.equal(kinds.length, 21);
  assert.equal(new Set(diagramReferences.map(r => r.id)).size, diagramReferences.length, 'unique stable reference IDs');
  for (const kind of kinds) assert.ok(diagramReferences.some(r => r.spec.diagram.kind === kind), `no author reference for ${kind}`);
  assert.equal(phase02LessonCoverage.length, 21);
  for (const row of phase02LessonCoverage) assert.ok(row.referenceIds.length, `lesson ${row.lesson} has no references`);
  // Providers receive a serializable, bounded, nonrecursive object schema.
  const schemaText = JSON.stringify(tutorDiagramJsonSchema);
  assert.ok(schemaText.length < 200_000, `schema unexpectedly large: ${schemaText.length}`);
  assert.doesNotMatch(schemaText, /"\$ref":"#"/, 'recursive root schema is not supported');
});

for (const reference of diagramReferences) {
  test(`${reference.id}: valid saved JSON, deterministic real SVG and readable context at narrow/card/wide widths`, () => {
    const parsed = parseTutorDiagram(reference.spec);
    const saved = JSON.stringify(parsed);
    assert.deepEqual(parseTutorDiagram(saved), parsed);
    const words = tutorDiagramVisibleText(parsed).filter(Boolean);
    assert.ok(words.includes(parsed.diagram.title));
    assert.ok(describeTutorDiagram(parsed).length > parsed.diagram.title.length);
    for (const available of [320, 408, 720]) {
      const result = renderTutorDiagram(saved, available);
      assert.ok(Number.isFinite(result.width) && result.width >= available);
      assert.ok(Number.isFinite(result.height) && result.height > 0);
      const svg = renderToStaticMarkup(result.element);
      assert.doesNotMatch(svg, /(?:NaN|Infinity|undefined)/);
      assert.match(svg, /role="img"/);
      assert.equal(svg, renderToStaticMarkup(renderTutorDiagram(parsed, available).element));
      assert.ok(svg.includes(`viewBox="0 0 ${result.width} ${result.height}"`));
    }
  });
}

test('nested children receive domain validation and count toward readable text', () => {
  const sample = diagramReferences.find(r => r.spec.diagram.kind === 'comparison' && r.spec.diagram.variant === 'panels');
  assert.ok(sample);
  const input = structuredClone(sample.spec);
  const child = input.diagram.panels.find(p => p.diagram.kind === 'coordinate-plot')?.diagram;
  assert.ok(child);
  const words = tutorDiagramVisibleText(parseTutorDiagram(input)).filter(Boolean);
  assert.ok(words.includes(child.title));
  child.series[0].points[0].x = child.x.max + 1;
  assert.throws(() => parseTutorDiagram(input), /bounds|domain|range/i);
});

test('object and saved-string inputs enforce the same diagram size limit', () => {
  const spec = structuredClone(diagramReferences[0].spec);
  spec.padding = 'x'.repeat(20_000);
  assert.throws(() => parseTutorDiagram(spec), /too long/);
  assert.throws(() => parseTutorDiagram(JSON.stringify(spec)), /too long/);
});


test('a mixed transformation representation returns validation errors instead of throwing from safeParse', () => {
  const reference = diagramReferences.find(r => r.spec.diagram.kind === 'transformation' && r.spec.diagram.variant === 'visual');
  const spec = structuredClone(reference.spec);
  delete spec.diagram.variant;
  spec.diagram.links = [{ from: 0, to: 0 }];
  const result = tutorDiagramSchema.safeParse(spec);
  assert.equal(result.success, false);
  assert.match(result.error.message, /item list/);
});
