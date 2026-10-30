// AN-06 MVP: source references are immutable ids, never links; attached assets are refused honestly; provenance names only what was read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ASSETS_UNAVAILABLE, SOURCE_LIMIT, admitSourceRefs, sourceKey, validateSourceRef } from './assets.js';
import { animationProvenance, provenanceText } from './context.js';

const NOTE = { role: 'context', kind: 'file', sourceId: 'file_1', revision: 'r3', title: 'Lever notes' };
const MODEL = { role: 'asset', kind: 'glb', sourceId: 'model_1', revision: 'r1' };

test('a reference is a stored id at an immutable revision, never a link', () => {
  assert.equal(validateSourceRef(NOTE).ok, true);
  for (const bad of ['https://example.com/a.glb', 'blob:https://x/1', 'data:model/gltf-binary;base64,AA', 'javascript:alert(1)']) {
    assert.equal(validateSourceRef({ ...NOTE, sourceId: bad }).ok, false, bad);
  }
  assert.equal(validateSourceRef({ ...NOTE, revision: undefined }).ok, false, 'revision required');
  assert.equal(validateSourceRef({ ...NOTE, url: 'x' }).ok, false, 'unknown key');
  assert.equal(validateSourceRef({ ...NOTE, kind: 'glb' }).ok, false, 'an asset kind is not a context kind');
});

test('the MVP refuses an attached asset with the honest message and admits context sources', () => {
  assert.deepEqual(admitSourceRefs([NOTE, NOTE]), { ok: true, refs: [NOTE] });
  const refused = admitSourceRefs([NOTE, MODEL]);
  assert.equal(refused.ok, false);
  assert.equal(refused.code, 'assets_unavailable');
  assert.equal(refused.message, ASSETS_UNAVAILABLE);
  assert.ok(!/\.\.\.|…/.test(ASSETS_UNAVAILABLE));
  assert.equal(admitSourceRefs([MODEL], { phase: 'assets' }).ok, true, 'reserved for the post-MVP phase');
  assert.equal(admitSourceRefs(Array.from({ length: SOURCE_LIMIT + 1 }, (_, i) => ({ ...NOTE, sourceId: `f${i}` }))).code, 'too_many_sources');
  assert.equal(admitSourceRefs([{ ...NOTE, sourceId: 'https://x' }]).code, 'invalid_source');
});

test('the source key is order-free and changes with any revision', () => {
  const other = { ...NOTE, sourceId: 'file_2' };
  assert.equal(sourceKey([NOTE, other]), sourceKey([other, NOTE]));
  assert.notEqual(sourceKey([NOTE]), sourceKey([{ ...NOTE, revision: 'r4' }]));
  assert.equal(sourceKey([]), '[]');
});

test('provenance: this artifact revision, its plan hash, and only the sources the server read', () => {
  const ref = { artifactId: 'res_1', revision: 'rev_1' };
  const answer = { identity: { resultId: 'res_1', revision: 'rev_1', planHash: 'plan_abc123' }, provenance: { sources: [
    { ...NOTE, read: true }, { ...NOTE, read: true }, { role: 'context', kind: 'link', sourceId: 'link_1', revision: 'r1', read: false }, { ...NOTE, sourceId: 'https://x', read: true },
  ] } };
  const got = animationProvenance(ref, answer);
  assert.deepEqual(got, { artifactId: 'res_1', revision: 'rev_1', planHash: 'plan_abc123', sources: [NOTE] });
  assert.equal(provenanceText(got), 'Made from: Lever notes.');
  assert.equal(animationProvenance(ref, { ...answer, identity: { ...answer.identity, revision: 'rev_2' } }), null, 'another revision');
  assert.equal(provenanceText(null), 'Its sources are not known on this page.');
  assert.equal(provenanceText({ ...got, sources: [] }), 'Made from your request only.');
});
