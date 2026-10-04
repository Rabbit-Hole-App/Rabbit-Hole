import test from 'node:test';
import assert from 'node:assert/strict';
import { columnEntries, fillSlot, slotIndex, slotSize, GENERIC_SLOT } from './canvas-slots.js';

const blocks = ['a', 'b', 'c'].map(id => ({ id }));
const order = entries => entries.map(entry => entry.block?.id ?? entry.slot.id);

test('a slot stands where the card will land: in front of its block, or after the last one', () => {
  assert.deepEqual(order(columnEntries(blocks, [{ id: 's1', before: 'b' }])), ['a', 's1', 'b', 'c']);
  assert.deepEqual(order(columnEntries(blocks, [{ id: 's1', before: null }])), ['a', 'b', 'c', 's1']);
  // Two slots in front of one block keep the order they were made in.
  assert.deepEqual(order(columnEntries(blocks, [{ id: 's1', before: 'b' }, { id: 's2', before: 'b' }])), ['a', 's1', 's2', 'b', 'c']);
  // A slot whose block was deleted while it waited drops to the end, never out of sight.
  assert.deepEqual(order(columnEntries(blocks, [{ id: 's1', before: 'gone' }])), ['a', 'b', 'c', 's1']);
  // Slots are never blocks: the list the canvas saves is untouched.
  assert.deepEqual(blocks.map(block => block.id), ['a', 'b', 'c']);
});

test('the card that fills a slot takes its exact index; no new insertion point is computed', () => {
  assert.equal(slotIndex(blocks, { before: 'b' }), 1);
  assert.equal(slotIndex(blocks, { before: null }), 3);
  assert.equal(slotIndex([{ id: 'x' }, ...blocks], { before: 'b' }), 2); // a card added above meanwhile: still in front of b
});

test('filling one of two slots keeps the other in its place', () => {
  const slots = [{ id: 's1', before: 'b' }, { id: 's2', before: 'b' }];
  // s2 fills first: its card goes in front of b, and s1 (made earlier) now stands in front of that card.
  const after = fillSlot(slots, 's2', 'card2');
  assert.deepEqual(after, [{ id: 's1', before: 'card2' }]);
  const placed = [blocks[0], { id: 'card2' }, ...blocks.slice(1)];
  assert.deepEqual(order(columnEntries(placed, after)), ['a', 's1', 'card2', 'b', 'c']);
  // s1 fills first: s2 (made later) stays in front of b, after the new card.
  assert.deepEqual(fillSlot(slots, 's1', 'card1'), [{ id: 's2', before: 'b' }]);
  assert.equal(fillSlot(slots, 'unknown', 'x'), slots);
});

test('a slot is the coming card\'s size: exact when the type fixes it, its height cap when it grows, a plain card when unknown', () => {
  const types = {
    graph: { width: 560, height: 520, autoMax: 900, sample: () => ({ type: 'graph' }) },
    plot: { width: 560, height: 480, sample: () => ({ type: 'graph' }) },
    explanation: { width: 440, autoMax: 520, sample: () => ({ type: 'explanation' }) },
    paper: { width: 620, height: 560 },
    quiz: { sample: () => ({ type: 'quiz' }) },
  };
  assert.deepEqual(slotSize('graph', types), { w: 560, h: 520 });
  assert.deepEqual(slotSize('plot', types), { w: 560, h: 520 }, 'sized as the block type its sample makes');
  assert.deepEqual(slotSize('explanation', types), { w: 440, h: 520 });
  assert.deepEqual(slotSize('paper', types), { w: 620, h: 560 });
  assert.deepEqual(slotSize('quiz', types), GENERIC_SLOT, 'the CanvasNode defaults');
  assert.deepEqual(slotSize('wiki', types), { w: 560, h: 640 });
  assert.deepEqual(slotSize('videoMoment', types), { w: 560, h: 420 });
  assert.deepEqual(slotSize(null, types), GENERIC_SLOT);
});

// The guarantee is structural: what the canvas saves (localStorage, then a shared board's push and any fork
// of it), what undo snapshots and what counts as content (a pending Rabbit Hole persists on it) are built
// from the artifact lists alone, and slots live beside them.
test('slots never reach the save, the undo snapshot or the content count', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('./AdaptiveCanvas.jsx', import.meta.url), 'utf8');
  assert.match(source, /const state = \{ strokes, shapes, items, links, blocks: light, groups, areas \};/);
  assert.match(source, /present\.current = \{ strokes, shapes, items, links, blocks \};/);
  assert.match(source, /content = strokes\.length \+ shapes\.length \+ items\.length \+ blocks\.length;/);
  assert.match(source, /const \[slots, setSlots\] = useState\(\[\]\);/, 'component state, never read from storage or boardState');
  assert.doesNotMatch(source, /setBlocks\([^)]*slot:/);
});

test('a slot for one of several known cards (the Tutor\'s) is their middle size, each sized as it renders', async () => {
  const types = { animation: { width: 560, height: 460, sizeFor: block => ({ width: block.w, height: block.h }) } };
  const samples = [[970, 748], [964, 997], [1040, 948]].map(([w, h]) => ({ type: 'animation', w, h }));
  assert.deepEqual(slotSize('animation', types, samples), { w: 970, h: 948 });
  // The real slice: every card the Tutor may show, measured by its scene.
  const { showableCards } = await import('./learn-tutor.js');
  const { sceneLegibility } = await import('./scene-layout.js');
  const real = { animation: { sizeFor: block => { const r = sceneLegibility(block.scene); return { width: r.viewport.w, height: r.viewport.h }; } } };
  const size = slotSize('animation', real, showableCards());
  assert.ok(size.w > 560 && size.h > 460, `the slice's cards are larger than the animation default: ${size.w}x${size.h}`);
});
