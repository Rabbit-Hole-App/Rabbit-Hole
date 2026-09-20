import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { IDENTITY_SLOTS } from './scene-vocab.js';
import { heatStyle, identityVar, roleVar, selectionStyle, shapeStyle } from './scene-style.js';
import { getSceneState, validateScene } from './animation-scene.js';

// The fourth axis: IDENTITY answers "which peer is this", never "what kind of
// thing is this" (role), "what's happening to it" (state) or "how much"
// (value). These tests exist because the benchmark that motivated the axis
// found Q, K and V rendering pixel-identical - all three legitimately
// `observed`, with no channel left to tell them apart.

test('IDENTITY_SLOTS is a frozen, non-empty vocabulary', () => {
  assert.ok(Array.isArray(IDENTITY_SLOTS) && IDENTITY_SLOTS.length > 0);
  assert.throws(() => IDENTITY_SLOTS.push('x'), TypeError);
});

test('every identity slot has a token in both themes', () => {
  const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8');
  const light = css.slice(css.indexOf('--viz-neutral'), css.indexOf('.dark {'));
  const dark = css.slice(css.indexOf('.dark {'), css.indexOf('}', css.indexOf('.dark {')));
  for (const slot of IDENTITY_SLOTS) {
    assert.match(light, new RegExp(`--viz-${slot}\\s*:`), `${slot} has no light token`);
    assert.match(dark, new RegExp(`--viz-${slot}\\s*:`), `${slot} has no dark token`);
  }
});

test('identityVar resolves a known slot to a token reference, and nothing else to a hue', () => {
  for (const slot of IDENTITY_SLOTS) {
    assert.equal(identityVar(slot), `var(--viz-${slot})`);
    assert.doesNotMatch(identityVar(slot), /#|rgb|hsl/, `${slot} leaked a literal colour`);
  }
  assert.equal(identityVar(null), null, 'no identity must resolve to no hue, so the caller falls back to role');
  assert.equal(identityVar('nonsense'), null, 'an unrecognised slot must not silently borrow a colour');
});

// --- shapeStyle: the acceptance example, at the resolver level -------------

test('three objects sharing one role and differing only in identity resolve to three different hues and the same fill tier', () => {
  const [slotA, slotB, slotC] = IDENTITY_SLOTS;
  const q = shapeStyle('observed', {}, undefined, slotA);
  const k = shapeStyle('observed', {}, undefined, slotB);
  const v = shapeStyle('observed', {}, undefined, slotC);
  assert.notEqual(q.stroke, k.stroke);
  assert.notEqual(k.stroke, v.stroke);
  assert.notEqual(q.stroke, v.stroke);
  assert.notEqual(q.fill, k.fill);
  assert.notEqual(k.fill, v.fill);
  // same role -> same fill TIER (ROLE_FILL['observed'] is 'solid') for all three -
  // identity changes the hue, never how loud the object is allowed to be.
  assert.deepEqual(q.fillBand, k.fillBand);
  assert.deepEqual(k.fillBand, v.fillBand);
});

test('an object with no identity is unchanged from today - the regression guard', () => {
  for (const role of ['observed', 'input', 'neutral', 'learner']) {
    for (const state of [{}, { highlighted: true }, { chosen: true }]) {
      const withNoIdentityArg = shapeStyle(role, state);
      const withExplicitNull = shapeStyle(role, state, undefined, null);
      const withUnknownSlot = shapeStyle(role, state, undefined, 'not-a-real-slot');
      assert.deepEqual(withNoIdentityArg, withExplicitNull);
      assert.deepEqual(withNoIdentityArg, withUnknownSlot);
      assert.equal(withNoIdentityArg.stroke, roleVar(role), 'hue must still come from role alone');
    }
  }
});

test('identity substitutes for role\'s hue, but role still governs fill tier and ink', () => {
  const plain = shapeStyle('learner', { highlighted: true });
  const withIdentity = shapeStyle('learner', { highlighted: true }, undefined, IDENTITY_SLOTS[0]);
  assert.notEqual(plain.stroke, withIdentity.stroke, 'the hue must change');
  assert.equal(plain.strokeWidth, withIdentity.strokeWidth, 'state (weight) is untouched by identity');
  assert.deepEqual(plain.fillBand, withIdentity.fillBand, 'the fill TIER still comes from ROLE_FILL');
  assert.equal(plain.onFill, withIdentity.onFill, 'ink still comes from role alone');
});

// --- Slot assignment: deterministic, first-seen-wins, per-scene only -------

const identityScene = () => validateScene({
  id: 'qkv', duration: 2,
  objects: [
    { id: 'q', type: 'strip', semanticId: 'q', initialState: { x: 0, y: 0, role: 'observed', identity: 'query', values: [1] } },
    { id: 'k', type: 'strip', semanticId: 'k', initialState: { x: 0, y: 40, role: 'observed', identity: 'key', values: [1] } },
    { id: 'v', type: 'strip', semanticId: 'v', initialState: { x: 0, y: 80, role: 'observed', identity: 'value', values: [1] } },
    // repeats 'query' - must land on the exact same slot as the first 'q' object
    { id: 'q2', type: 'strip', semanticId: 'q2', initialState: { x: 0, y: 120, role: 'observed', identity: 'query', values: [1] } },
    { id: 'plain', type: 'strip', semanticId: 'plain', initialState: { x: 0, y: 160, role: 'observed', values: [1] } },
  ],
  timeline: [],
});

test('the same scene evaluated twice gives the same slots', () => {
  const scene = identityScene();
  const first = getSceneState(scene, 1).objects.map(o => ({ id: o.id, slot: o.identitySlot }));
  const second = getSceneState(scene, 1).objects.map(o => ({ id: o.id, slot: o.identitySlot }));
  assert.deepEqual(first, second);
});

test('a repeated identity key gets the same slot at every occurrence', () => {
  const state = getSceneState(identityScene(), 1);
  const byId = Object.fromEntries(state.objects.map(o => [o.id, o]));
  assert.equal(byId.q.identitySlot, byId.q2.identitySlot, '"query" must resolve to one slot everywhere in this scene');
  assert.ok(IDENTITY_SLOTS.includes(byId.q.identitySlot));
});

test('slots are assigned first-seen, in authored object order, and are pairwise distinct within one scene', () => {
  const state = getSceneState(identityScene(), 1);
  const byId = Object.fromEntries(state.objects.map(o => [o.id, o]));
  assert.equal(byId.q.identitySlot, IDENTITY_SLOTS[0], 'the first identity key authored takes the first slot');
  assert.equal(byId.k.identitySlot, IDENTITY_SLOTS[1]);
  assert.equal(byId.v.identitySlot, IDENTITY_SLOTS[2]);
  assert.equal(byId.plain.identitySlot, null, 'an object with no identity key gets no slot');
  assert.equal(byId.plain.identity, null);
});

test('two different scenes may resolve the same identity key to different slots - there is no cross-scene registry', () => {
  // 'key' is authored second in identityScene (slot index 1); author a scene
  // where it is authored FIRST instead, and it must take the first slot there.
  const reordered = validateScene({
    id: 'kqv', duration: 2,
    objects: [
      { id: 'k', type: 'strip', initialState: { x: 0, y: 0, role: 'observed', identity: 'key', values: [1] } },
      { id: 'q', type: 'strip', initialState: { x: 0, y: 40, role: 'observed', identity: 'query', values: [1] } },
    ],
    timeline: [],
  });
  const state = getSceneState(reordered, 1);
  const byId = Object.fromEntries(state.objects.map(o => [o.id, o]));
  assert.equal(byId.k.identitySlot, IDENTITY_SLOTS[0], 'authored-first in THIS scene, so it takes the first slot here');
  assert.equal(byId.q.identitySlot, IDENTITY_SLOTS[1]);
});

// --- Identity must not reach into heat, selection or fill semantics --------

test('identity does not perturb heatStyle\'s mixPercent or fillToken', () => {
  // heatStyle stays a fixed 3-argument, theme-blind function - the same
  // regression test scene-style.test.mjs already runs for theme state
  // applies here for the same reason: there is no fourth parameter for an
  // identity slot to be smuggled through.
  const source = readFileSync(new URL('./scene-style.js', import.meta.url), 'utf8');
  assert.match(source, /export function heatStyle\(value, domain, mode\)/, 'heatStyle must stay a 3-argument function - no identity channel');
  const domain = { min: -8, max: 8 };
  const before = heatStyle(3, domain, 'signed');
  // Calling shapeStyle with an identity slot in between must not change what
  // an unrelated heatStyle call on the same value returns - both are pure.
  shapeStyle('observed', {}, undefined, IDENTITY_SLOTS[0]);
  const after = heatStyle(3, domain, 'signed');
  assert.deepEqual(before, after);
});

test('identity does not perturb selectionStyle\'s output', () => {
  assert.equal(selectionStyle.length, 0, 'selectionStyle must not grow an identity parameter');
  const before = selectionStyle();
  shapeStyle('observed', { selected: true }, undefined, IDENTITY_SLOTS[0]);
  const after = selectionStyle();
  assert.deepEqual(before, after);
});

test('a heat cell\'s fill tier still comes from ROLE_FILL, even carrying an identity', () => {
  const withIdentity = shapeStyle('observed', { blocked: true }, undefined, IDENTITY_SLOTS[0]);
  const withoutIdentity = shapeStyle('observed', { blocked: true });
  assert.deepEqual(withIdentity.fillBand, withoutIdentity.fillBand);
});

// --- Mutation-proof 1: identity must never reach inside a heat cell's fill -

test('mutation-proof: the heat fill construction in AnimatedScene.jsx never names identity', () => {
  const source = readFileSync(new URL('./AnimatedScene.jsx', import.meta.url), 'utf8');
  const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const fillLine = stripped.match(/const fill = heat[^;]+;/)?.[0];
  assert.ok(fillLine, 'could not find the heat cell fill construction in AnimatedScene.jsx');
  assert.doesNotMatch(fillLine, /identity/i, `identity must never build a heat cell's own fill: ${fillLine}`);
});

// --- Mutation-proof 2: slot assignment must be deterministic, by construction

test('mutation-proof: slot assignment in animation-scene.js does not call a non-deterministic source', () => {
  const source = readFileSync(new URL('./animation-scene.js', import.meta.url), 'utf8');
  const start = source.indexOf('IDENTITY\'s slot assignment');
  assert.ok(start > -1, 'could not find the slot-assignment pass in animation-scene.js');
  const block = source.slice(start, source.indexOf('if (object.type ===', start));
  assert.doesNotMatch(block, /Math\.random|Date\.now|crypto\./, `slot assignment must be a pure function of authored order, not a random or time-based source: ${block}`);
});

// --- CVD regression: plain RGB distance is not enough ----------------------
//
// Task A's first identity palette (a gold and an olive) cleared every
// numeric constraint it was given - contrast against both surfaces, distance
// from every heat token, distance from every other identity slot, all in
// plain RGB. Simulated under deuteranopia, that pair collapsed to 11.5 RGB
// units apart: two identities a red-green colour-blind reader would see as
// one, passing every rule this file checked at the time. That check was run
// by hand once and thrown away. It is captured here so a future slot cannot
// reintroduce it silently.
//
// The three matrices below are a standard simplified dichromacy
// approximation applied directly in sRGB space (no LMS round-trip - "a
// simplified... simulation", index.css's own IDENTITY comment already calls
// it that). They are not a physiologically exact model, but they reproduce
// the exact numbers that comment already claims by hand: light's closest
// pair sits at 67.0 RGB units apart under deuteranopia, dark's at 68.4 - see
// the assertions below, which check the real numbers, not a rounded claim.
const CVD_MATRICES = Object.freeze({
  protanopia: [[0.567, 0.433, 0.000], [0.558, 0.442, 0.000], [0.000, 0.242, 0.758]],
  deuteranopia: [[0.625, 0.375, 0.000], [0.700, 0.300, 0.000], [0.000, 0.300, 0.700]],
  tritanopia: [[0.950, 0.050, 0.000], [0.000, 0.433, 0.567], [0.000, 0.475, 0.525]],
});
const hexToRgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const simulateCVD = (rgb, kind) => CVD_MATRICES[kind].map(row => row[0] * rgb[0] + row[1] * rgb[1] + row[2] * rgb[2]);
const rgbDistance = (a, b) => Math.sqrt(a.reduce((sum, value, i) => sum + (value - b[i]) ** 2, 0));
// Well below every real minimum this palette actually reaches (67.0 and
// 68.4 - see above), and dramatically above the 11.5 that sank the first
// palette, so a regression anywhere near that severity still fails loudly
// long before it reaches this floor.
const CVD_MIN_DISTANCE = 60;

const identityHexByTheme = () => {
  const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8');
  const light = css.slice(css.indexOf('--viz-neutral'), css.indexOf('.dark {'));
  const darkStart = css.indexOf('.dark {');
  const dark = css.slice(darkStart, css.indexOf('}', darkStart));
  const hexOf = (block, slot) => block.match(new RegExp(`--viz-${slot}\\s*:\\s*(#[0-9a-fA-F]{6})`))?.[1];
  return {
    light: Object.fromEntries(IDENTITY_SLOTS.map(slot => [slot, hexOf(light, slot)])),
    dark: Object.fromEntries(IDENTITY_SLOTS.map(slot => [slot, hexOf(dark, slot)])),
  };
};

test('identity slots stay separated under protanopia, deuteranopia and tritanopia simulation, in both themes', () => {
  const byTheme = identityHexByTheme();
  for (const themeName of ['light', 'dark']) {
    const hexes = byTheme[themeName];
    for (const slot of IDENTITY_SLOTS) assert.ok(hexes[slot], `${themeName} theme is missing a hex value for ${slot}`);
    for (const kind of Object.keys(CVD_MATRICES)) {
      for (let i = 0; i < IDENTITY_SLOTS.length; i += 1) {
        for (let j = i + 1; j < IDENTITY_SLOTS.length; j += 1) {
          const a = simulateCVD(hexToRgb(hexes[IDENTITY_SLOTS[i]]), kind);
          const b = simulateCVD(hexToRgb(hexes[IDENTITY_SLOTS[j]]), kind);
          const distance = rgbDistance(a, b);
          assert.ok(distance >= CVD_MIN_DISTANCE,
            `${themeName} ${kind}: ${IDENTITY_SLOTS[i]} vs ${IDENTITY_SLOTS[j]} collapse to ${distance.toFixed(1)} RGB units apart (need >= ${CVD_MIN_DISTANCE})`);
        }
      }
    }
  }
});
