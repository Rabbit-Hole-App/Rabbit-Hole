import test from 'node:test';
import assert from 'node:assert/strict';
import { NANOGPT_FIRST_BATCH, NANOGPT_LATER_BATCHES, nanogptDeepDiveBlocks } from './board.js';
import { assertCardPlan } from './card-gates.mjs';

test('every card authored after Phase 1 carries a reviewed plan', () => {
  for (const card of NANOGPT_LATER_BATCHES.flat()) assertCardPlan(card);
});

test('the board shows the first batch, then the later batches in order', () => {
  const ids = nanogptDeepDiveBlocks().map(block => block.scene.id);
  assert.deepEqual(ids, [...NANOGPT_FIRST_BATCH, ...NANOGPT_LATER_BATCHES.flat()].map(card => card.scene.id));
  assert.equal(new Set(ids).size, ids.length);
});
