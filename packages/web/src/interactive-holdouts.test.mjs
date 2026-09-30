import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateScene } from './scene-evaluate.js';
import { checkSceneConsistency } from './scene-consistency.js';
import { checkLayoutLint } from './scene-layout-lint.js';
import { repoNavigatorScene, cnnInspectorScene } from './interactive-holdouts.js';

// The holdout scenes prove the interaction vocabulary generalizes: built
// only from existing input types (index) and existing derive ops, no new
// primitive. These tests assert the coordination the reviewer asked for.

test('H1 repo navigator: one index coordinates breadcrumb, architecture highlight and code', () => {
  const at = i => evaluateScene(structuredClone(repoNavigatorScene), 2, { nodeIndex: i });
  const leaf = at(3);
  const objects = Object.fromEntries(leaf.state.objects.map(o => [o.semanticId, o]));
  assert.match(objects.caption.label, /forward\(\)/);
  assert.match(objects['code-excerpt'].label, /def forward/);
  assert.equal(objects['symbol-path'].cellHighlight, 3);
  assert.deepEqual(objects.architecture.cellHighlight, { row: 3 });
  // a different node moves every view together
  const root = at(0);
  const rootObjects = Object.fromEntries(root.state.objects.map(o => [o.semanticId, o]));
  assert.match(rootObjects.caption.label, /model\.py/);
  assert.match(rootObjects['code-excerpt'].label, /class GPT/);
  assert.deepEqual(rootObjects.architecture.cellHighlight, { row: 0 });
});

test('H2 CNN inspector: (layer, channel) select the feature map through nested pick', () => {
  const at = (layerIndex, channelIndex) => evaluateScene(structuredClone(cnnInspectorScene), 2, { layerIndex, channelIndex });
  const a = at(0, 0).derived.featureMap;
  const b = at(2, 3).derived.featureMap;
  assert.equal(a.length, 16);
  assert.equal(b.length, 16);
  assert.notDeepEqual(a, b, 'different layer/channel gives a different map');
  // the caption names the current layer and channel
  const caption = at(2, 3).state.objects.find(o => o.semanticId === 'caption').label;
  assert.match(caption, /parts/);
  assert.match(caption, /channel 3/);
});

for (const [name, scene, snaps] of [
  ['repo', repoNavigatorScene, [{}, { nodeIndex: 1 }, { nodeIndex: 3 }]],
  ['cnn', cnnInspectorScene, [{}, { layerIndex: 1, channelIndex: 2 }, { layerIndex: 2, channelIndex: 3 }]],
]) {
  for (const inputs of snaps) {
    test(`${name} snapshot ${JSON.stringify(inputs)}: consistency and layout gates pass`, () => {
      const { scene: built } = evaluateScene(structuredClone(scene), 2, inputs);
      assert.deepEqual(checkSceneConsistency(built).issues, []);
      assert.deepEqual(checkLayoutLint(built).issues, []);
    });
  }
}
