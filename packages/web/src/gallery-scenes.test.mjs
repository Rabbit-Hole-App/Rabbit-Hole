// Static App Review Gallery (docs/features/static-app-review-gallery.md):
// every scene the ?board=static-app-review board shows must pass the same
// two gates any other lesson scene does - checkSceneConsistency (does the
// scene lie about arithmetic it visibly performs) and the layout lint (does
// an edge cross a label it shouldn't). Canvas 1 (causalAttentionScene) is
// the one that motivated writing this file: it shipped as the product's
// original scene, was never in any benchmark repair set, and failed both
// gates - provenance-required, matrix-vector-count, edge-crosses-label,
// text-exceeds-box - until the app-review repair pass. This pins that fix
// down the same way scene-consistency.test.mjs pins its own case 03 fix.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateScene } from './animation-scene.js';
import { checkSceneConsistency } from './scene-consistency.js';
import { checkLayoutLint } from './scene-layout-lint.js';
import { causalAttentionScene } from './reference-scenes.js';
import { transformerBlockScene, vlmScene, worldModelScene, codebaseOrientationScene } from './gallery-scenes.js';

const SCENES = {
  'canvas 1 - causal self-attention': causalAttentionScene,
  'canvas 2 - transformer block': transformerBlockScene,
  'canvas 3 - VLM image to LLM': vlmScene,
  'canvas 4 - world model branching futures': worldModelScene,
  'canvas 5 - codebase architecture orientation': codebaseOrientationScene,
};

for (const [name, raw] of Object.entries(SCENES)) {
  test(`${name}: passes checkSceneConsistency with zero issues`, () => {
    const scene = validateScene(structuredClone(raw));
    const { passed, issues } = checkSceneConsistency(scene);
    assert.deepEqual(issues, [], `${name} consistency issues`);
    assert.equal(passed, true);
  });

  test(`${name}: passes the layout lint with zero issues`, () => {
    const scene = validateScene(structuredClone(raw));
    const { passed, issues } = checkLayoutLint(scene);
    assert.deepEqual(issues, [], `${name} layout issues`);
    assert.equal(passed, true);
  });
}
