// AN-06 MVP: attached source references are immutable ids, never links, and are refused honestly in the MVP phase; provenance names
// only what the server read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAnimationPlan } from './contract.js';
import { watchFixture } from './fixtures.js';
import { ASSETS_UNAVAILABLE, admitSourceRefs, sourceKey, validateSourceRef } from './assets.js';
import { animationProvenance, provenanceText } from './context.js';

const MODEL = { sourceId: 'model_1', revision: 'r1' };

test('a reference is a stored id at an immutable revision, never a link', () => {
  assert.equal(validateSourceRef(MODEL).ok, true);
  for (const bad of ['https://example.com/a.glb', 'blob:https://x/1', 'data:model/gltf-binary;base64,AA', 'javascript:alert(1)']) {
    assert.equal(validateSourceRef({ ...MODEL, sourceId: bad }).ok, false, bad);
  }
  assert.equal(validateSourceRef({ sourceId: 'model_1' }).ok, false, 'revision required');
  assert.equal(validateSourceRef({ ...MODEL, url: 'x' }).ok, false, 'unknown key');
});

test('the MVP refuses an attached model with the honest message, as the contract does, and admits none', () => {
  assert.deepEqual(admitSourceRefs([]), { ok: true, refs: [] });
  const refused = admitSourceRefs([MODEL, MODEL]);
  assert.deepEqual(refused, { ok: false, code: 'assets_unavailable', message: ASSETS_UNAVAILABLE });
  assert.ok(!/\.\.\.|…/.test(ASSETS_UNAVAILABLE));
  assert.equal(validateAnimationPlan({ ...watchFixture.plan, sourceRefs: [MODEL] }).ok, false, 'the contract agrees');
  assert.equal(admitSourceRefs([{ ...MODEL, sourceId: 'https://x' }]).code, 'invalid_source');
});

test('the source key is order-free and changes with any revision', () => {
  const other = { sourceId: 'file_2', revision: 'r1' };
  assert.equal(sourceKey([MODEL, other]), sourceKey([other, MODEL]));
  assert.notEqual(sourceKey([MODEL]), sourceKey([{ ...MODEL, revision: 'r2' }]));
  assert.equal(sourceKey([]), '[]');
});

test('provenance: this artifact revision, its plan hash, and only the sources the server read', () => {
  const ref = { artifactId: 'res_1', revision: 3, planHash: 'a'.repeat(64) };
  const note = { sourceId: 'file_1', revision: 'r3', kind: 'file', title: 'Lever notes' };
  const got = animationProvenance(ref, [{ ...note, read: true }, { ...note, read: true }, { sourceId: 'link_1', revision: 'r1', read: false }, { ...note, sourceId: 'https://x', read: true }]);
  assert.deepEqual(got, { artifactId: 'res_1', revision: 3, planHash: 'a'.repeat(64), sources: [note] });
  assert.equal(provenanceText(got), 'Made from: Lever notes.');
  assert.deepEqual(animationProvenance(ref, 'nope').sources, []);
  assert.equal(provenanceText(null), 'Its sources are not known on this page.');
  assert.equal(provenanceText({ ...got, sources: [] }), 'Made from your request only.');
});
