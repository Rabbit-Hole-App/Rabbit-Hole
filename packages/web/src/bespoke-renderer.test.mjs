import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkBespokeRenderer, findBespokeComparisons } from '../scripts/check-bespoke-renderer.mjs';

// "No custom React, no scene-specific renderer" is a constraint every
// benchmark case's own target.json declares (noSceneSpecificRenderer: true)
// and the exported critic packet has no way to verify, because the packet
// never ships renderer source (see docs/superpowers/specs/2026-09-18-
// visual-language-and-motion-design.md - source architecture rules are
// better enforced mechanically than by a visual critic guessing at intent
// from pixels). This is that mechanical gate: every RENDERER_FILES entry
// (render-fingerprint.mjs - the same files that determine a rendered pixel)
// must contain no comparison of an object's own identity (id, semanticId,
// conceptId, label, text) against a hardcoded string literal, which is what
// a scene being special-cased by name would look like.

const WEB_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

test('no renderer file compares an object\'s identity field against a hardcoded string literal', () => {
  const result = checkBespokeRenderer(WEB_ROOT);
  assert.deepEqual(result.violations, [], `bespoke per-case renderer logic found:\n${JSON.stringify(result.violations, null, 2)}`);
  assert.equal(result.passed, true);
});

test('the result carries provenance - a hash per scanned file, so "the gate ran" is itself checkable', () => {
  const result = checkBespokeRenderer(WEB_ROOT);
  assert.ok(result.scannedFiles.length >= 7, 'expected every RENDERER_FILES entry to be scanned and hashed');
  for (const entry of result.scannedFiles) {
    assert.match(entry.sha256, /^[0-9a-f]{64}$/, `${entry.file} did not carry a real sha256`);
  }
});

// Ordinary type/role/mode dispatch must NOT be flagged - that is the shared
// vocabulary the renderer is built on, not a per-case special case. Proves
// the gate is scoped to identity fields, not every string comparison.
test('type, role and heat-mode dispatch is not flagged - only identity fields are', () => {
  const source = `
    function draw(object) {
      if (object.type === 'grid') return 'grid';
      if (object.role === 'observed') return 'observed';
      if (object.heat?.mode === 'signed') return 'signed';
    }
  `;
  assert.deepEqual(findBespokeComparisons(source, 'js'), []);
});

// Mutation proof: the exact shape a real regression would take - a branch
// naming one specific authored object by id, the kind of thing a scene
// author or an over-eager renderer patch could introduce to make one
// benchmark case look right without going through the vocabulary. Injected
// as source text (a hypothetical patch), not applied to the real file - the
// point is proving the DETECTOR catches this shape, the same way matrix-
// kind-declared.test.mjs's own mutation proof works against a throwaway
// fixture rather than a real committed file for its own JS-source scanner.
test('mutation proof: a hardcoded per-object id comparison - the shape a scene-specific patch would take - is caught', () => {
  const mutated = `
    function draw(object) {
      // a hypothetical scene-specific patch, exactly the anti-pattern this gate exists to catch
      if (object.id === 'case01-south-token') return specialSouthTokenLayout(object);
      return ordinaryLayout(object);
    }
  `;
  const violations = findBespokeComparisons(mutated, 'js');
  assert.equal(violations.length, 1);
  assert.equal(violations[0].property, 'id');
  assert.equal(violations[0].comparedAgainst, 'case01-south-token');
});

// Two spellings of the same branch the gate used to miss entirely: a scene's
// TITLE names one authored thing exactly as its id does, and a hardcoded
// membership list is `id === 'a' || id === 'b'` written shorter. Either would
// have let a per-scene typography or fit special-case through.
test('mutation proof: a scene title comparison and a hardcoded id membership list are both caught', () => {
  const mutated = `
    function fit(scene, object) {
      if (scene.title === 'nanoGPT — Transformer Block') return wideCamera();
      if (['caption', 'note'].includes(object.semanticId)) return bigFont();
    }
  `;
  const violations = findBespokeComparisons(mutated, 'js');
  assert.deepEqual(violations.map(v => v.property).sort(), ['semanticId', 'title']);
});

// ...and a membership test against a list that is not hardcoded - a set of
// visible ids the scene itself produced - is ordinary generic work.
test('a membership test against a non-literal list is not flagged', () => {
  assert.deepEqual(findBespokeComparisons(`function f(o, shown) { if (shown.includes(o.id)) return 1; }`, 'js'), []);
});

// The same proof, the other direction: semanticId, conceptId, label and
// text are all identity fields too - a scene could be special-cased by any
// of them, not only `id`.
test('mutation proof: semanticId, conceptId, label and text comparisons are all caught, not only id', () => {
  const mutated = `
    function draw(object) {
      if (object.semanticId === 'query-vector') return 1;
      if (object.conceptId === 'qkv-projection') return 2;
      if (object.label === 'embedding (X)') return 3;
      if (object.text === 'softmax(QK^T)V') return 4;
    }
  `;
  const violations = findBespokeComparisons(mutated, 'js');
  assert.deepEqual(violations.map(v => v.property).sort(), ['conceptId', 'label', 'semanticId', 'text']);
});
