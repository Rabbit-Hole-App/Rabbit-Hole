import test from 'node:test';
import assert from 'node:assert/strict';
import { columnEntries, fillSlot, pairStart, slotIndex, slotSize, GENERIC_SLOT } from './canvas-slots.js';

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

test('a slot is the coming card\'s size: exact when the type fixes it, its typical height when it grows (else its cap), a plain card when unknown', () => {
  const types = {
    graph: { width: 560, height: 520, autoMax: 900, sample: () => ({ type: 'graph' }) },
    plot: { width: 560, height: 480, sample: () => ({ type: 'graph' }) },
    explanation: { width: 440, autoMax: 520, typicalHeight: 330, sample: () => ({ type: 'explanation' }) },
    snippet: { width: 520, autoMax: 760 },
    paper: { width: 620, height: 560 },
    quiz: { sample: () => ({ type: 'quiz' }) },
  };
  assert.deepEqual(slotSize('graph', types), { w: 560, h: 520 });
  assert.deepEqual(slotSize('plot', types), { w: 560, h: 520 }, 'sized as the block type its sample makes');
  assert.deepEqual(slotSize('explanation', types), { w: 440, h: 330 }, 'the measured typical height, not the 520 cap');
  assert.deepEqual(slotSize('snippet', types), { w: 520, h: 760 }, 'no typical height measured: the cap');
  assert.deepEqual(slotSize('paper', types), { w: 620, h: 560 });
  assert.deepEqual(slotSize('quiz', types), GENERIC_SLOT, 'the CanvasNode defaults');
  assert.deepEqual(slotSize('wiki', types), { w: 560, h: 640 });
  assert.deepEqual(slotSize('videoMoment', types), { w: 560, h: 420 });
  assert.deepEqual(slotSize(null, types), GENERIC_SLOT);
  assert.deepEqual(slotSize('graph', types, [], 42), { w: 560, h: 562 }, 'a fixed-height card holds its Prompt row (card-prompt.md)');
  assert.deepEqual(slotSize('explanation', types, [], 42), { w: 440, h: 330 }, 'a measured height already leaves room');
});

// The guarantee is structural: what the canvas saves (localStorage, then a shared board's push and any fork
// of it), what undo snapshots and what counts as content (a pending Rabbit Hole persists on it) are built
// from the artifact lists alone, and slots live beside them.
test('slots never reach the save, the undo snapshot or the content count', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('./AdaptiveCanvas.jsx', import.meta.url), 'utf8');
  assert.match(source, /const state = \{ strokes, shapes, items, links, blocks: light, groups, areas, \.\.\.\(doc \? \{ doc \} : \{\}\) \};/);
  // UI-25: undo steps also carry groups (Undo after Ungroup brings the group back); still no slots.
  assert.match(source, /present\.current = \{ strokes, shapes, items, links, blocks, groups \};/);
  assert.match(source, /content = canvasObjects\(\{ blocks, exchanges, strokes, shapes, items, areas \}\);/);
  assert.match(source, /const \[slots, setSlots\] = useState\(\[\]\);/, 'component state, never read from storage or boardState');
  assert.doesNotMatch(source, /setBlocks\([^)]*slot:/);
});

test('a slot for one of several known cards (the Tutor\'s) is their middle size, each sized as it renders', async () => {
  const types = { animation: { width: 560, height: 460, typicalRows: 180, sizeFor: block => ({ width: block.w, height: block.h }) } };
  const samples = [[970, 748], [964, 997], [1040, 948]].map(([w, h]) => ({ type: 'animation', w, h }));
  assert.deepEqual(slotSize('animation', types, samples), { w: 970, h: 1128 }, 'the scene frame plus the rows below it');
  // The real slice: every card the Tutor may show, measured by its scene.
  const { showableCards } = await import('./learn-tutor.js');
  const { sceneLegibility } = await import('./scene-layout.js');
  const real = { animation: { sizeFor: block => { const r = sceneLegibility(block.scene); return { width: r.viewport.w, height: r.viewport.h }; } } };
  const size = slotSize('animation', real, showableCards());
  assert.ok(size.w > 560 && size.h > 460, `the slice's cards are larger than the animation default: ${size.w}x${size.h}`);
});

test('the visible area leaves out the chat sheet over the composer, and a margin', async () => {
  const { freeArea } = await import('./canvas-slots.js');
  const surface = { w: 1440, h: 800 };
  // The Rabbit Hole sheet: 780 wide, centred, over the lower 340 px. Cutting below it keeps the most room.
  assert.deepEqual(freeArea(surface, [{ left: 330, top: 460, right: 1110, bottom: 800 }]), { left: 24, top: 24, right: 1416, bottom: 436 });
  // A small caption at the lower left costs a strip on its side, not the whole lower band.
  assert.deepEqual(freeArea(surface, [{ left: 0, top: 600, right: 200, bottom: 800 }]), { left: 224, top: 24, right: 1416, bottom: 776 });
  assert.deepEqual(freeArea(surface, []), { left: 24, top: 24, right: 1416, bottom: 776 });
});

// Owner decision 2026-10-22: the surface no longer starts after an 84 px tools gutter and below the header row; it fills the
// workspace and they float over it. The opening camera is compensated so a saved board does not jump: every saved world point
// lands on the same pixel of the canvas workspace as in the old layout, at every width (narrow ones hit the 24 px minimum).
test('homeView: a saved board opens with every object where the old gutter layout drew it', async () => {
  const { homeView } = await import('./canvas-slots.js');
  const GUTTER = 84, HEADER = 44;
  const oldView = width => ({ x: Math.max(24, (width - 560) / 2), y: 24, z: 1 }); // the old opening camera, on the old surface
  for (const workspace of [640, 700, 784, 1032, 1440, 1720]) {
    const was = oldView(workspace - GUTTER), now = homeView({ left: GUTTER, top: HEADER, right: workspace, bottom: 900 });
    for (const point of [{ x: 0, y: 0 }, { x: 560, y: 1200 }, { x: -300, y: -80 }]) {
      // Workspace px: old surface origin (GUTTER, HEADER) + old camera; new surface origin (0, 0) + new camera.
      assert.deepEqual({ x: now.x + point.x * now.z, y: now.y + point.y * now.z }, { x: GUTTER + was.x + point.x * was.z, y: HEADER + was.y + point.y * was.z }, `${workspace} px at ${JSON.stringify(point)}`);
    }
    assert.equal(now.z, 1);
  }
  // Nothing floating (a read-only board, no header over it): the column centres in the whole surface.
  assert.deepEqual(homeView({ left: 0, top: 0, right: 1200, bottom: 800 }), { x: 320, y: 24, z: 1 });
  // A toolbar docked right: the column centres in what it leaves.
  assert.deepEqual(homeView({ left: 0, top: 44, right: 1116, bottom: 800 }), { x: 278, y: 68, z: 1 });
});

test('the camera pans a card into the visible area and never changes the zoom', async () => {
  const { panInto } = await import('./canvas-slots.js');
  const area = { left: 24, top: 24, right: 1416, bottom: 436 };
  const view = { x: 440, y: 0, z: 0.8 };
  // Already inside: nothing moves.
  assert.deepEqual(panInto({ x: 0, y: 100, w: 560, h: 300 }, view, area), view);
  // Out of view: centred in the visible area, same zoom.
  const far = panInto({ x: 0, y: 5000, w: 560, h: 300 }, view, area);
  assert.equal(far.z, 0.8);
  assert.equal(5000 * 0.8 + far.y + 300 * 0.8 / 2, (24 + 436) / 2);
  // Partly behind the chat sheet: nudged just above it, no further.
  const behind = panInto({ x: 0, y: 400, w: 560, h: 200 }, view, area);
  assert.equal(400 * 0.8 + behind.y + 200 * 0.8, 436);
  assert.equal(behind.x, view.x, 'a card already in view sideways stays where it is');
  // A skeleton just reserved is centred, even when it was partly in view.
  const reserved = panInto({ x: 0, y: 400, w: 560, h: 200 }, view, area, true);
  assert.equal(400 * 0.8 + reserved.y + 200 * 0.8 / 2, (24 + 436) / 2);
  // Taller than the visible area: its top at the area's top.
  const tall = panInto({ x: 0, y: 900, w: 560, h: 1000 }, view, area);
  assert.equal(900 * 0.8 + tall.y, 24);
});

test('a slot never stands under a card drawn over its flow place (a dragged card keeps its offset)', async () => {
  const { freeSlot } = await import('./canvas-slots.js');
  // Two explanation cards (440 wide, centred in the 560 column), 520 tall, one gap apart.
  const card = (id, flowTop, { dx = 0, dy = 0, h = 520 } = {}) => ({ id, block: true, flowTop, flowBottom: flowTop + h, x: 60 + dx, y: flowTop + dy, w: 440, h });
  const slot = { w: 440, h: 330 };
  assert.deepEqual(freeSlot([card('a', 0), card('b', 540)], 1, slot), { at: 1, top: 0 }, 'nothing dragged: where insertAtView picks');
  assert.deepEqual(freeSlot([card('a', 0), card('b', 540)], 0, slot), { at: 0, top: 0 }, 'before the first card');
  assert.deepEqual(freeSlot([], 0, slot), { at: 0, top: 0 }, 'an empty column');
  // b was dragged 250 up: in front of it, b would be drawn over the slot; the nearest free place is after it.
  assert.deepEqual(freeSlot([card('a', 0), card('b', 540, { dy: -250 })], 1, slot), { at: 2, top: 0 });
  // a was dragged 300 down, over b's flow place: the slot cannot stand in front of b; the end is as near as the top.
  assert.deepEqual(freeSlot([card('a', 0, { dy: 300 }), card('b', 540)], 1, slot), { at: 2, top: 0 });
  // A card dragged sideways, clear of the column, covers nothing.
  assert.deepEqual(freeSlot([card('a', 0), card('b', 540, { dx: 700, dy: -250 })], 1, slot), { at: 1, top: 0 });
  // A chat card drawn over every place: the end, below it.
  const chat = { id: 'c', block: false, flowTop: 0, flowBottom: 200, x: 0, y: 0, w: 560, h: 3000 };
  assert.deepEqual(freeSlot([chat, card('a', 220)], 1, slot), { at: 1, top: 3020 - 760 });
});

// pdf-to-canvas.md follow-up 4: a page label and its page are one placement boundary.
test('an insert never lands between a PDF page and its label', () => {
  const set = [{ id: 'n', type: 'note' }, { id: 'l12', type: 'divider', label: 'Page 12', pdf: 'doc:ctx:0123456789ab' }, { id: 'p12', type: 'slide', number: 12, pdf: 'doc:ctx:0123456789ab' },
    { id: 'l13', type: 'divider', label: 'Page 13', pdf: 'doc:ctx:0123456789ab' }, { id: 'p13', type: 'slide', number: 13, pdf: 'doc:ctx:0123456789ab' }];
  assert.equal(pairStart(set, 2), 1, 'before page 12 is before its label');
  assert.equal(pairStart(set, 4), 3, 'before page 13 is before its label');
  for (const at of [0, 1, 3, 5]) assert.equal(pairStart(set, at), at, `between pairs (${at}) stays`);
  const other = [{ id: 'l', type: 'divider', label: 'Page 2', pdf: 'pdf:upload:0123456789ab' }, { id: 'p', type: 'slide', number: 2, pdf: 'doc:ctx:0123456789ab' }];
  assert.equal(pairStart(other, 1), 1, 'a label of another PDF is not its label');
  assert.equal(pairStart([{ id: 'h', type: 'divider' }, { id: 'p', type: 'slide', number: 1 }], 1), 1, 'a plain divider is no label');
});
