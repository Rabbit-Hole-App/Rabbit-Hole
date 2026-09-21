import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSceneState, validateScene } from './animation-scene.js';
import { heatStyle } from './scene-style.js';

// VALUE's own scaling gate - see docs/superpowers/specs/2026-09-18-visual-
// language-and-motion-design.md's "A quantitative encoding optimises
// contrast subject to quantitative truth" section. Three things are proven
// here, each with its own test: the field is required, "local" is refused
// wherever it would be dishonest (not merely spelled out - see the human
// reviewer's note this closes, the same shape as the `illustrative` dodge
// scene-consistency.js already refuses), and the actual regression this
// whole axis exists to pin: within one scale group, a smaller value may
// never render more intensely than a larger one.

test('a heat object with no valueScale is refused at the gate, naming the fix', () => {
  // Built from a JSON string, deliberately - matrix-kind-declared.test.mjs's
  // repo-wide scan reads JS *source* for exactly the shape this test needs
  // to construct (a heat object with no valueScale), and a literal object
  // expression here would be indistinguishable from a real, accidental
  // omission to that scanner. Parsing a string at runtime is honest about
  // the difference: this omission is deliberate, not authored.
  const missingValueScale = JSON.parse(`{
    "id": "no-scale", "duration": 1,
    "objects": [{ "id": "g", "type": "grid", "initialState": { "rows": 1, "cols": 2, "values": [1, -1], "heat": { "mode": "signed" }, "matrixKind": "input" } }],
    "timeline": []
  }`);
  assert.throws(
    () => validateScene(missingValueScale),
    /Object "g": a heat object must declare valueScale: local, shared, or fixed/,
  );
});

// A DECLARATION IS NOT AUTOMATICALLY HONEST. Requiring the field stops the
// renderer choosing wrong semantics silently; it does not stop an author
// typing the wrong one deliberately. "local" is refused - not merely
// discouraged - wherever the object provably participates in a comparison.
test('"local" is refused when the object also names a valueScaleGroup - a stated contradiction', () => {
  assert.throws(
    () => validateScene({
      id: 'contradiction', duration: 1,
      objects: [
        { id: 'a', type: 'strip', initialState: { values: [0.5, 0.2], heat: true, valueScale: 'local', valueScaleGroup: 'pair' } },
        { id: 'b', type: 'strip', initialState: { values: [0.3], heat: true, valueScale: 'shared', valueScaleGroup: 'pair' } },
      ],
      timeline: [],
    }),
    /Object "a": shares valueScaleGroup "pair", so valueScale must be shared or fixed, not local - a grouped object cannot self-normalise/,
  );
});

// Mutation proof for the group-contradiction refusal above: an object that
// legitimately participates in a comparison (paired with another object in
// the same valueScaleGroup) is only caught while it actually declares that
// group. Removing the group removes the ONLY signal this particular gate
// looks at, so the same object with "local" alone must be accepted - proving
// the refusal fires because of the contradiction, not merely because "a" is
// heat-bearing.
test('mutation proof: dropping the valueScaleGroup from the same object makes "local" legal again', () => {
  const build = withGroup => validateScene({
    id: 'mutation-check', duration: 1,
    objects: [
      { id: 'a', type: 'strip', initialState: { values: [0.5, 0.2], heat: true, valueScale: 'local', ...(withGroup ? { valueScaleGroup: 'pair' } : {}) } },
    ],
    timeline: [],
  });
  assert.throws(() => build(true), /shares valueScaleGroup "pair"/);
  assert.doesNotThrow(() => build(false));
});

// The second way "local" is refused without being declared alongside a
// group: the scene's OWN derive graph already connects this object's values
// to another heat object's, whether or not anyone wrote valueScaleGroup - a
// chain is a comparison whether or not it was declared one (see scene-
// derive.js's computeValueChainGroups).
test('"local" is refused when the object\'s values are derived from, or feed into, another heat object in the scene\'s own computation chain', () => {
  const build = () => validateScene({
    id: 'chain', duration: 1,
    exampleData: { a: [1, 2] },
    derived: { s: { op: 'scale', args: ['a', 2] } },
    objects: [
      { id: 'oa', type: 'strip', initialState: { values: { $derive: 'a' }, heat: true, valueScale: 'local' } },
      { id: 'os', type: 'strip', initialState: { values: { $derive: 's' }, heat: true, valueScale: 'shared', valueScaleGroup: 'x' } },
    ],
    timeline: [],
  });
  assert.throws(build, /its values are derived from, or feed into, another heat object in this scene's computation chain, so valueScale must be shared or fixed, not local/);
});

test('a single heat object with no chain partner and no group may still declare "local"', () => {
  assert.doesNotThrow(() => validateScene({
    id: 'lone', duration: 1,
    objects: [{ id: 'g', type: 'grid', initialState: { rows: 1, cols: 2, values: [1, -1], heat: { mode: 'signed' }, matrixKind: 'input', valueScale: 'local' } }],
    timeline: [],
  }));
});

// "shared" resolves one common domain across every object naming the group -
// symmetric [-M, +M] for signed data, M the largest absolute value across
// the WHOLE group (not any one member's own extreme).
test('a shared group resolves a symmetric domain from the largest absolute value across every member', () => {
  const scene = validateScene({
    id: 'shared-domain', duration: 1,
    objects: [
      { id: 'a', type: 'strip', initialState: { values: [0.44, 0.1], heat: true, valueScale: 'shared', valueScaleGroup: 'g' } },
      { id: 'b', type: 'strip', initialState: { values: [-0.9, 0.2], heat: true, valueScale: 'shared', valueScaleGroup: 'g' } },
    ],
    timeline: [],
  });
  const [a, b] = getSceneState(scene, scene.duration).objects;
  assert.deepEqual(a.valueDomain, { min: -0.9, max: 0.9 });
  assert.deepEqual(b.valueDomain, { min: -0.9, max: 0.9 }, 'every member of the group carries the SAME domain');
});

// "fixed" is the one example the spec names: a known semantic domain,
// probabilities on [0, 1] - a constant, not negotiated from the scene's own
// values the way "shared" is.
test('a fixed group always resolves to [0, 1], regardless of the object\'s own values', () => {
  const scene = validateScene({
    id: 'fixed-domain', duration: 1,
    objects: [{ id: 'p', type: 'grid', initialState: { rows: 1, cols: 2, values: [0.1, 0.9], heat: { mode: 'magnitude' }, matrixKind: 'input', valueScale: 'fixed' } }],
    timeline: [],
  });
  assert.deepEqual(getSceneState(scene, scene.duration).objects[0].valueDomain, { min: 0, max: 1 });
});

// THE regression this axis exists to pin. Reconstructs the exact defect the
// spec quotes: object A holds [1.0, 0.44] and object B holds [0.34] - under
// the OLD per-object local normalisation, 0.44 shares an object with a
// LARGER value (1.0) and so paints at under half strength, while 0.34 is
// its own object's maximum and paints at full strength - a SMALLER value
// (0.34 < 0.44) rendering MORE intensely than a larger one. Real heatStyle
// (scene-style.js), never a re-implementation, is what actually computes
// the mix percent in both branches - only the DOMAIN fed into it differs.
test('within one shared group, a smaller value never renders more intensely than a larger one', () => {
  const scene = validateScene({
    id: 'ordering', duration: 1,
    objects: [
      { id: 'a', type: 'strip', initialState: { values: [1.0, 0.44], heat: true, valueScale: 'shared', valueScaleGroup: 'g' } },
      { id: 'b', type: 'strip', initialState: { values: [0.34], heat: true, valueScale: 'shared', valueScaleGroup: 'g' } },
    ],
    timeline: [],
  });
  const [a, b] = getSceneState(scene, scene.duration).objects;
  const domain = a.valueDomain; // validateScene already proved above this is shared and symmetric
  assert.deepEqual(domain, b.valueDomain);
  const percentOf044 = heatStyle(0.44, domain, 'magnitude').mixPercent;
  const percentOf034 = heatStyle(0.34, domain, 'magnitude').mixPercent;
  assert.ok(percentOf044 > percentOf034, `0.44 (${percentOf044}%) must render more intensely than 0.34 (${percentOf034}%)`);
});

// Mutation proof: restore the per-object normalisation this fix replaced -
// AnimatedScene.jsx's own prior line, `(object.values || []).reduce(...)`
// computing a domain from JUST that object's own values - and the SAME
// assertion, against the SAME two numbers, through the SAME real heatStyle,
// now fails. This is not a second implementation invented to fail on
// purpose: it is the literal domain computation this axis deleted, applied
// to the same scene the test above already proved fixed.
test('mutation proof: restoring per-object local normalisation on this exact scene fails the ordering invariant', () => {
  const localDomainOf = values => values.reduce(
    (range, entry) => entry == null ? range : { min: Math.min(range.min, entry), max: Math.max(range.max, entry) },
    { min: Infinity, max: -Infinity },
  );
  const domainA = localDomainOf([1.0, 0.44]); // object A's OWN extremes: {min: 0.44, max: 1.0}
  const domainB = localDomainOf([0.34]);      // object B's OWN extreme: {min: 0.34, max: 0.34}
  const percentOf044 = heatStyle(0.44, domainA, 'magnitude').mixPercent;
  const percentOf034 = heatStyle(0.34, domainB, 'magnitude').mixPercent;
  assert.ok(
    percentOf044 <= percentOf034,
    `expected the reverted per-object normalisation to reproduce the defect (0.34 at ${percentOf034}% must NOT be less than 0.44 at ${percentOf044}%) - if this fails, the mutation no longer reproduces the bug it is meant to prove`,
  );
  // Stated the other way round, quoting the exact prior bug: 0.34, the
  // smaller value, renders AT LEAST as intensely as 0.44, the larger one -
  // under local normalisation each object's own maximum always paints at
  // 100%, so 0.34 (its object's whole extent) hits the ceiling while 0.44
  // (dwarfed by 1.0 in the SAME object) does not.
  assert.equal(percentOf034, 100, "0.34 is object B's own maximum, so local normalisation paints it at full strength");
  assert.ok(percentOf044 < 100, "0.44 is NOT object A's own maximum (1.0 is), so local normalisation paints it under full strength");
});
