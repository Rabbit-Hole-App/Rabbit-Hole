import test from 'node:test';
import assert from 'node:assert/strict';
import kindGallery from '../../web/src/tutor-diagrams/kind-gallery.json' with { type: 'json' };
import { diagramReferences } from '../../web/src/tutor-diagrams/reference-library.js';
import { diagramReferenceContext, selectDiagramReferences } from '../src/explanation-references.js';

test('each offline neutral shape fits the existing author reference context', () => {
  for (const spec of kindGallery) {
    const kind = spec.diagram.kind;
    const ref = { id: `shape-${kind}`, spec };
    const context = diagramReferenceContext([ref]);
    assert.ok(context.includes(JSON.stringify(ref)), kind);
    assert.ok(context.length <= 14_000, kind);
  }
});

test('the offline gallery is separate from the registered author references', () => {
  const legacy = diagramReferences.find(ref => ref.id.startsWith('general-sequence-'));
  assert.equal(selectDiagramReferences({ prompt: legacy.prompts[0] })[0]?.id, legacy.id);
  assert.deepEqual(selectDiagramReferences({ prompt: 'Explain parcel handoff.', requiredKinds: ['flow'] }), []);
});
