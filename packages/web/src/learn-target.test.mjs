import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTarget } from './learn-target.js';
import { cardBlock } from './nanogpt/board.js';
import * as causalMask from './nanogpt/cards/c11-causal-mask.js';
import * as tokenizer from './nanogpt/cards/c06-tokenizer.js';
import * as attentionDeep from './nanogpt/depth/attention/deep.js';
import * as attentionGuided from './nanogpt/depth/attention/guided.js';

test('the runtime scene id and the authored card id are resolved separately, never from the block id', () => {
  const block = cardBlock(causalMask);
  const target = resolveTarget(block);
  assert.equal(target.block_id, block.id);
  assert.equal(target.scene_id, 'nanogpt-c11-causal-mask');
  assert.equal(target.card_id, 'c11-causal-mask');
  assert.notEqual(target.block_id, target.scene_id);
  // c06 is the documented exception where both are the same string.
  assert.deepEqual([resolveTarget(cardBlock(tokenizer)).scene_id, resolveTarget(cardBlock(tokenizer)).card_id], ['c06-tokenizer', 'c06-tokenizer']);
  // Depth cards: equal ids and a depth.
  assert.deepEqual([resolveTarget(cardBlock(attentionGuided)).card_id, resolveTarget(cardBlock(attentionGuided)).depth], ['depth-attention-guided', 'Guided']);
});

test('part id is partIds[pager value], never the selected object; unpaged cards have none', () => {
  const deep = cardBlock(attentionDeep);
  assert.equal(resolveTarget(deep).part_id, 'shapes'); // the pager default
  assert.equal(resolveTarget({ ...deep, inputs: { part: 1 } }).part_id, 'causal-mask');
  assert.equal(resolveTarget({ ...deep, inputs: { part: 9 } }).part_id, null); // unknown index: the whole card
  const selected = resolveTarget({ ...cardBlock(causalMask), selectedObject: 'equal-scores' });
  assert.equal(selected.part_id, null);
  assert.equal(selected.selected_object, 'equal-scores');
});

test('concept ids are resolved from the objects: the selected object, else the shown part, else the card', () => {
  assert.deepEqual(resolveTarget(cardBlock(causalMask)).concept_ids, ['causal-mask']);
  assert.deepEqual(resolveTarget({ ...cardBlock(attentionDeep), inputs: { part: 1 } }).concept_ids, ['causal-mask']);
  const object = attentionDeep.scene.objects.find(item => item.conceptId && item.conceptId !== 'causal-mask');
  assert.deepEqual(resolveTarget({ ...cardBlock(attentionDeep), inputs: { part: 1 }, selectedObject: object.semanticId || object.id }).concept_ids, [object.conceptId]);
  assert.ok(resolveTarget(cardBlock(attentionDeep)).concept_ids.length > 0);
  // Interactive scenes carry spec.conceptIds.
  assert.deepEqual(resolveTarget({ id: 'x', type: 'scene', spec: { id: 'projection', conceptIds: ['vector-projection', 'dot-product'] } }).concept_ids, ['vector-projection', 'dot-product']);
});

test('a card the registry does not know keeps its block and scene, with no invented card id', () => {
  const target = resolveTarget({ id: 'b1', type: 'animation', scene: { id: 'generated-scene', objects: [] } });
  assert.deepEqual([target.block_id, target.scene_id, target.card_id, target.part_id, target.concept_ids], ['b1', 'generated-scene', null, null, []]);
});
