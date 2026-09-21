// Step 6 evidence: the three remaining cases from the rerun list whose fixes
// are not arithmetic (case 07's differing head outputs, case 08's visual
// repetition). Case 01 and 03's evidence lives beside the consistency
// checker itself, in scene-consistency.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getSceneState, validateScene } from './animation-scene.js';

const load = relativePath => JSON.parse(readFileSync(new URL(`../../../viz-benchmarks/illustrated-transformer/cases/${relativePath}`, import.meta.url), 'utf8'));

test('case 07: the three drawn head outputs (Z0, Z1, Z7) now resolve to three distinct identity slots, so they no longer render as the same fill', () => {
  const scene = validateScene(load('07-multi-head-attention/generated/latest/scene-spec.json'));
  const state = getSceneState(scene, scene.duration);
  const zBoxes = ['head0-z', 'head1-z', 'head7-z'].map(id => state.objects.find(o => o.id === id));
  assert.ok(zBoxes.every(Boolean), 'expected all three head-output boxes to exist');
  const slots = new Set(zBoxes.map(o => o.identitySlot));
  assert.equal(slots.size, 3, 'each head output needs its own identity slot to render as a different colour');
});

test('case 08: the repeated block carries a real, visible stack of ghost copies, not only its caption', () => {
  const scene = validateScene(load('08-transformer-block/generated/latest/scene-spec.json'));
  const state = getSceneState(scene, scene.duration);
  const ghosts = state.objects.filter(o => o.id.startsWith('block-repeat-') && o.type === 'box');
  assert.ok(ghosts.length >= 2, 'expected multiple ghost silhouettes behind the drawn block');
  // Every ghost sits at a distinct offset - a real stack, not copies drawn on
  // top of one another or on top of the real unit.
  const positions = new Set(ghosts.map(g => `${g.x},${g.y}`));
  assert.equal(positions.size, ghosts.length);
  // Still says so in words too - the pattern augments the caption, it does
  // not replace it.
  assert.ok(state.objects.some(o => o.id === 'note-repeat'));
});
