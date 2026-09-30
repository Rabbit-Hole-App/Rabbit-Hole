// Step 6 evidence: the three remaining cases from the rerun list whose fixes
// are not arithmetic (case 07's differing head outputs, case 08's visual
// repetition). Case 01 and 03's evidence lives beside the consistency
// checker itself, in scene-consistency.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getSceneState, validateScene } from './animation-scene.js';
import { checkSceneConsistency } from './scene-consistency.js';
import { checkLayoutLint } from './scene-layout-lint.js';

const load = relativePath => JSON.parse(readFileSync(new URL(`../../../viz-benchmarks/illustrated-transformer/cases/${relativePath}`, import.meta.url), 'utf8'));
const CASE_PATHS = [
  '01-self-attention-computation-flow/generated/latest/scene-spec.json',
  '03-attention-score-matrix/generated/latest/scene-spec.json',
  '07-multi-head-attention/generated/latest/scene-spec.json',
  '08-transformer-block/generated/latest/scene-spec.json',
  '09-encoder-decoder-attention/generated/latest/scene-spec.json',
];

test('all five rerun cases pass both the consistency checker and the layout lint', () => {
  for (const path of CASE_PATHS) {
    const scene = validateScene(load(path));
    assert.deepEqual(checkSceneConsistency(scene), { passed: true, issues: [] }, `${path}: consistency`);
    assert.deepEqual(checkLayoutLint(scene), { passed: true, issues: [] }, `${path}: layout`);
  }
});

test('case 07: the three drawn head outputs (Z0, Z1, Z7) now resolve to three distinct identity slots, so they no longer render as the same fill', () => {
  const scene = validateScene(load('07-multi-head-attention/generated/latest/scene-spec.json'));
  const state = getSceneState(scene, scene.duration);
  const zBoxes = ['head0-z', 'head1-z', 'head7-z'].map(id => state.objects.find(o => o.id === id));
  assert.ok(zBoxes.every(Boolean), 'expected all three head-output boxes to exist');
  const slots = new Set(zBoxes.map(o => o.identitySlot));
  assert.equal(slots.size, 3, 'each head output needs its own identity slot to render as a different colour');
});

test('case 07: Wo, the head concatenation and the final output share one dimensional truth', () => {
  // The independent critic found Wo authored 4x2 while final-output was
  // drawn with 3 cells - two separately hand-typed numbers that disagreed
  // about the same matmul, the same defect class as a false arithmetic
  // result. There is no numeric $derive seam for a shape-only "values don't
  // matter yet" schematic (no values array to compute from), so the fix is
  // the same authoring discipline scene-consistency.js already enforces for
  // dot products: pin the relationship down here so it cannot silently
  // re-diverge, one example, one truth - (1xN concat) . (NxM Wo) = (1xM out).
  const scene = validateScene(load('07-multi-head-attention/generated/latest/scene-spec.json'));
  const state = getSceneState(scene, scene.duration);
  const concat = state.objects.find(o => o.id === 'concat');
  const wo = state.objects.find(o => o.id === 'wo');
  const finalOutput = state.objects.find(o => o.id === 'final-output');
  assert.ok(concat && wo && finalOutput, 'expected concat, wo and final-output to exist');
  assert.equal(concat.cols, wo.rows, 'the concatenated heads must feed exactly Wo\'s row count');
  assert.equal(wo.cols, finalOutput.cols, 'Wo\'s output width must match the drawn final-output cell count');
});

test('case 04: the output equals the sum of the displayed weight x value cells - the critic\'s .93-vs-.92 rounding-display artifact is now structurally impossible', () => {
  // The independent critic found the old, hand-authored contrib cells
  // (.91, .03, -.01 on screen) summed to .93 while the separately-authored
  // output read .92 - two independently rounded numbers that disagreed.
  // Both now come from the same derivation chain: output is literally
  // sum(contrib), so it cannot drift from what the contrib row shows.
  const scene = validateScene(load('04-softmax-attention-weights/generated/latest/scene-spec.json'));
  const state = getSceneState(scene, scene.duration);
  const contrib = state.objects.find(o => o.id === 'contrib').values;
  const output = state.objects.find(o => o.id === 'output').values;
  // Cells carry the canonical value (scene-derive.js's cellPool), so the
  // chain holds to float precision, not to three decimals.
  assert.equal(output.length, 1);
  assert.ok(Math.abs(output[0] - contrib.reduce((sum, v) => sum + v, 0)) < 1e-9, `${output[0]} is not the sum of ${contrib}`);
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
