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

test('matching worked topics and the kind-word examples keep their picks; the gallery shape is only the fallback when nothing scores', () => {
  // Codex's version also dropped the bare kind word from the general-* keywords so these prompts reached the gallery; that moves picks the selector bench protects, so it is not taken.
  const legacy = diagramReferences.find(ref => ref.id.startsWith('general-sequence-'));
  assert.equal(selectDiagramReferences({ prompt: 'Show a sequence diagram.' })[0]?.id, legacy.id);
  assert.equal(selectDiagramReferences({ prompt: legacy.prompts[0] })[0]?.id, legacy.id);
  assert.equal(selectDiagramReferences({ prompt: 'how does attention work in a transformer?', requiredKinds: ['matrix'] })[0]?.id,
    'ml-transformer-attention');
  assert.deepEqual(selectDiagramReferences({ prompt: 'How do parakeets sleep?' }), []);
  assert.deepEqual(selectDiagramReferences({ prompt: 'Show a flow diagram.', requiredKinds: ['flow'], shapeFallback: false }).map(ref => ref.id).filter(id => id.startsWith('shape-')), []);
});

test('the fallback is off when a plan supplies the kind (shapeFallback: false)', () => {
  for (const kind of ['flow', 'tree', 'matrix']) {
    assert.deepEqual(selectDiagramReferences({ prompt: 'Explain parcel handoff.', requiredKinds: [kind], shapeFallback: false }), []);
    assert.equal(selectDiagramReferences({ prompt: 'Explain parcel handoff.', requiredKinds: [kind] })[0]?.id, `shape-${kind}`);
  }
});

test('the author receives the fallback through the normal flowchart request path, only when the planner was asked and gave no plan', () => {
  const args = 'Draw a flowchart for sorting mail.';
  const input = { command: 'explanation', args, visualRequirements: deriveVisualRequirements(args) };
  // planner off (never asked): no learner-word fallback (owner 2026-11-08); a plan present is covered by the shapeFallback: false test above
  assert.ok(!prepareArtifactAuthorRequest({}, input).diagramReferences.some(ref => ref.id.startsWith('shape-')));
  // planner asked, timed out or failed: no plan, the fallback runs
  const prepared = prepareArtifactAuthorRequest({}, { ...input, planned: true, plan: null });
  assert.ok(!prepared.result);
  assert.equal(prepared.diagramReferences[0]?.id, 'shape-flow');
  assert.ok(prepared.body.system.includes(JSON.stringify(prepared.diagramReferences[0].spec)));
});
