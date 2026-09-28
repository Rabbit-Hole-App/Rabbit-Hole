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

// A card in a sequence carries its place in it to the card header
// ("Self-attention · 2 of 3"); one outside a sequence carries nothing.
test('sequence cards name their sequence and position; the positions of one sequence run 1..of', () => {
  const blocks = nanogptDeepDiveBlocks();
  const bySequence = {};
  for (const block of blocks.filter(b => b.sequence)) (bySequence[block.sequence.name] ||= []).push(block.sequence);
  assert.deepEqual(blocks.find(b => b.scene.id === 'nanogpt-c12-score-scaling').sequence, { name: 'Self-attention', position: 2, of: 3 });
  assert.deepEqual(blocks.find(b => b.scene.id === 'nanogpt-c05-position-mixing').sequence, { name: 'The MLP', position: 1, of: 2 });
  assert.equal(blocks.find(b => b.scene.id === 'nanogpt-c01-forward-pass').sequence, undefined, 'a card outside any sequence carries none');
  for (const [name, entries] of Object.entries(bySequence)) {
    assert.deepEqual(entries.map(e => e.position), entries.map((unused, i) => i + 1), `${name} in board order`);
    assert.ok(entries.every(e => e.of === entries.length), `${name}: every card says of ${entries.length}`);
  }
});
