// Fix C (T6/T7), part 1: the Tutor's offers as anchored placeholders on the canvas. Pure: the view -> placeholders, the plan against the slots the canvas holds,
// anchored slots in the column, and the source-relative position (one place for the proposal, the skeleton and the delivered card).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { canvasCardsOf, planSlots, slotIdOf, sourceBlockOf } from './roadmap-canvas.js';
import { anchoredSlots, columnEntries, fillSlot } from './canvas-slots.js';
import { deliveredSpot, proposalAnchor } from './roadmap-placement.js';

const DIR = fileURLToPath(new URL('../../../docs/features/explain-on-canvas/contracts/fixtures/', import.meta.url));
const view = name => JSON.parse(readFileSync(DIR + name + '.json', 'utf8')).response.body;
const STEP = 'st_a1b2c3d4e5f60718293a4b01';

test('a pending proposal is one placeholder with its type, title and description, keyed by the step, not accepting, with no failure', () => {
  const [card, ...rest] = canvasCardsOf(view('status-active-proposal-pending'));
  assert.equal(rest.length, 0);
  assert.deepEqual([card.key, card.stepId, card.state, card.format, card.acceptable, card.accepting], [STEP, STEP, 'pending', 'explanation', true, false]);
  assert.ok(card.title && card.description);
  assert.equal(card.sourceKey, 'file:fs_41c9e0a7d2b84f63a1c07e92');
  assert.equal(card.failure, undefined);
  assert.equal(canvasCardsOf(view('status-active-proposal-pending'), { busy: [`accept:${card.proposalId}:${card.version}`] })[0].accepting, true, 'acceptance in flight keeps the same placeholder');
});

test('the same step keeps its key through generating, checking and failed, so its place never changes', () => {
  assert.deepEqual(canvasCardsOf(view('accept-proposal-response-generating')).map(c => [c.key, c.state]), [[STEP, 'generating']]);
  assert.deepEqual(canvasCardsOf(view('status-held-for-checking')).map(c => [c.key, c.state]), [[STEP, 'checking']]);
  const [failed] = canvasCardsOf(view('status-failed-card'));
  assert.deepEqual([failed.key, failed.state], [STEP, 'failed']);
  assert.ok(failed.failure.message && Array.isArray(failed.recovery));
});

test('a delivered card, a card already on the canvas, a linked existing card, a cancelled or ended roadmap leave no placeholder', () => {
  const generating = view('accept-proposal-response-generating');
  const delivered = JSON.parse(JSON.stringify(generating));
  delivered.results[0].delivery = 'delivered';
  assert.deepEqual(canvasCardsOf(delivered), []);
  assert.deepEqual(canvasCardsOf(generating, { hasBlock: id => id === generating.results[0].slot.cardId }), []);
  const linked = JSON.parse(JSON.stringify(generating));
  linked.results[0].existingCard = true;
  assert.deepEqual(canvasCardsOf(linked), []);
  const ended = JSON.parse(JSON.stringify(generating));
  ended.roadmap.state = 'ended';
  assert.deepEqual(canvasCardsOf(ended), []);
  assert.deepEqual(canvasCardsOf(null), []);
  assert.deepEqual(canvasCardsOf(view('status-cancelled-paused')), []);
});

test('planSlots: add what is missing, update only what changed, remove what the view dropped, never touch another slot', () => {
  const [pending] = canvasCardsOf(view('status-active-proposal-pending'));
  const plain = { id: 'slot:other', before: null };
  assert.deepEqual(planSlots([plain], [pending]), { add: [pending], update: [], remove: [] });
  const held = { id: slotIdOf(pending.key), at: { x: 1, y: 2 }, roadmap: pending };
  assert.deepEqual(planSlots([plain, held], [pending]), { add: [], update: [], remove: [] }, 'nothing to do');
  const [generating] = canvasCardsOf(view('accept-proposal-response-generating'));
  const plan = planSlots([plain, held], [generating]);
  assert.deepEqual([plan.add.length, plan.update.map(u => [u.id, u.card.state]), plan.remove], [0, [[slotIdOf(STEP), 'generating']], []]);
  assert.deepEqual(planSlots([plain, held], []), { add: [], update: [], remove: [slotIdOf(STEP)] });
});

test('sourceBlockOf finds the file card by the server key, and nothing for an unknown key', () => {
  const blocks = [{ id: 'a', fileRef: { source: { id: 'fs_other' } } }, { id: 'b', fileRef: { source: { id: 'fs_41c9e0a7d2b84f63a1c07e92' } } }];
  assert.equal(sourceBlockOf(blocks, 'file:fs_41c9e0a7d2b84f63a1c07e92').id, 'b');
  assert.equal(sourceBlockOf(blocks, 'file:fs_missing'), null);
  assert.equal(sourceBlockOf(blocks, null), null);
});

test('an anchored slot stands outside the column flow: it takes no place, shifts nothing, and filling it moves nothing else', () => {
  const blocks = [{ id: 'b1' }, { id: 'b2' }];
  const anchored = { id: slotIdOf('s'), before: null, at: { x: 700, y: 40 } };
  const column = { id: 'slot:c', before: 'b2' };
  assert.deepEqual(columnEntries(blocks, [anchored, column]).map(e => e.block?.id || e.slot.id), ['b1', 'slot:c', 'b2']);
  assert.deepEqual(anchoredSlots([anchored, column]), [anchored]);
  assert.deepEqual(fillSlot([column, anchored], anchored.id, 'card'), [column], 'an anchored fill leaves the column slots as they were');
  assert.deepEqual(columnEntries(blocks, []).map(e => e.block.id), ['b1', 'b2'], 'no slots: unchanged');
});

test('the anchor is the source card, or a slab at the passage inside it; the card goes beside it in free space, not on anything', () => {
  const source = { x: 0, y: 0, w: 560, h: 900 };
  assert.deepEqual(proposalAnchor(source), source);
  assert.equal(proposalAnchor(null), null);
  assert.deepEqual(proposalAnchor(source, { x: 20, y: 300, w: 400, h: 60 }), { x: 0, y: 300, w: 560, h: 60 });
  assert.deepEqual(proposalAnchor(source, { x: 20, y: -500, w: 400, h: 40 }), { x: 0, y: 0, w: 560, h: 1 }, 'a passage above the card clamps to its top edge');
  const size = { w: 380, h: 420 };
  const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const spot = deliveredSpot(size, proposalAnchor(source, { x: 20, y: 300, w: 400, h: 60 }), [source]);
  assert.equal(hit({ ...spot, ...size }, source), false);
  assert.ok(spot.x >= source.w, 'beside the card (to its right, where the column leaves room)');
  assert.ok(Math.abs(spot.y + size.h / 2 - 330) <= 60, 'level with the passage');
  // The right side taken: it goes to the left, never on top of what is there.
  const taken = { x: 600, y: 0, w: 500, h: 900 };
  const left = deliveredSpot(size, proposalAnchor(source, { x: 20, y: 300, w: 400, h: 60 }), [source, taken]);
  assert.equal(hit({ ...left, ...size }, taken) || hit({ ...left, ...size }, source), false);
  assert.ok(left.x + size.w <= 0, 'to the left of the card');
  // The same inputs give the same place: the proposal, the skeleton and the delivered card agree.
  assert.deepEqual(deliveredSpot(size, proposalAnchor(source), [source, taken]), deliveredSpot(size, proposalAnchor(source), [source, taken]));
  // A point anchor (no source box) keeps the old behaviour.
  assert.deepEqual(deliveredSpot({ w: 300, h: 200 }, { x: 500, y: 400 }, []), { x: 350, y: 300 });
});
