import test from 'node:test';
import assert from 'node:assert/strict';
import kindGallery from '../../web/src/tutor-diagrams/kind-gallery.json' with { type: 'json' };
import { diagramReferences } from '../../web/src/tutor-diagrams/reference-library.js';
import { prepareArtifactAuthorRequest } from '../src/learn-artifact.js';
import { deriveVisualRequirements } from '../src/explanation-visuals.js';
import { diagramReferenceContext, selectDiagramReferences } from '../src/explanation-references.js';

test('each known required kind can use its compact shape when the topic is unmatched', () => {
  for (const spec of kindGallery) {
    const kind = spec.diagram.kind;
    const selected = selectDiagramReferences({ prompt: 'Explain parcel handoff.', requiredKinds: [kind] });
    assert.equal(selected.length, 1, kind);
    assert.equal(selected[0].id, `shape-${kind}`);
    assert.deepEqual(selected[0].spec, spec);
    assert.ok(diagramReferenceContext(selected).includes(JSON.stringify(selected[0].spec)));
  }
  assert.equal(selectDiagramReferences({ prompt: 'Explain parcel handoff.', requiredKinds: ['flow', 'tree', 'matrix'] }).length, 2);
});

test('explicit shape names select the gallery while matching worked topics keep their references', () => {
  assert.equal(selectDiagramReferences({ prompt: 'Show a sequence diagram.' })[0]?.id, 'shape-sequence');
  const legacy = diagramReferences.find(ref => ref.id.startsWith('general-sequence-'));
  assert.equal(selectDiagramReferences({ prompt: legacy.prompts[0] })[0]?.id, legacy.id);
  assert.equal(selectDiagramReferences({ prompt: 'how does attention work in a transformer?', requiredKinds: ['matrix'] })[0]?.id,
    'ml-transformer-attention');
  assert.deepEqual(selectDiagramReferences({ prompt: 'How do parakeets sleep?' }), []);
});

test('legacy kind hints keep their coverage with neutral shapes', () => {
  for (const [prompt, kind] of [
    ['How does the water cycle work?', 'cycle'],
    ['What are the layers of a neural network?', 'layers'],
  ]) {
    const selected = selectDiagramReferences({ prompt });
    assert.deepEqual(selected.map(ref => ref.id), [`shape-${kind}`]);
    assert.equal(selected[0].spec.diagram.kind, kind);
  }
});

test('the author receives the fallback through the normal flowchart request path', () => {
  const args = 'Draw a flowchart for sorting mail.';
  const prepared = prepareArtifactAuthorRequest({}, {
    command: 'explanation', args, visualRequirements: deriveVisualRequirements(args),
  });
  assert.ok(!prepared.result);
  assert.equal(prepared.diagramReferences[0]?.id, 'shape-flow');
  assert.ok(prepared.body.system.includes(JSON.stringify(prepared.diagramReferences[0].spec)));
});
