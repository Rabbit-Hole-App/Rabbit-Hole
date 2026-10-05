// Reserved card slots (docs/features/canvas-skeleton-cards.md): while a card is on its way, a skeleton
// holds the place in the canvas column where it will land. A slot is the current viewer's UI only: it is
// never a block, so it is never saved, pushed to a shared board, undone, forked, counted as content or
// read by the Tutor. Pure; AdaptiveCanvas renders the slots and moves the camera.

// The column in render order: each slot in front of the block it was reserved before, in the order the
// slots were made; a slot reserved at the end, or whose block has gone, after the last block.
// ponytail: a slot whose block is deleted while it waits drops to the end; keep a second anchor if that shows up.
export function columnEntries(blocks, slots) {
  const ids = new Set(blocks.map(block => block.id));
  const out = [];
  for (const block of blocks) {
    for (const slot of slots) if (slot.before === block.id) out.push({ slot });
    out.push({ block });
  }
  for (const slot of slots) if (!ids.has(slot.before)) out.push({ slot });
  return out;
}

// Where the card that fills `slot` goes in `blocks`: exactly where the slot stands, never a new place.
export function slotIndex(blocks, slot) {
  const at = slot.before == null ? -1 : blocks.findIndex(block => block.id === slot.before);
  return at < 0 ? blocks.length : at;
}

// Where a card inserted right after block `id` goes (insertBlock's `after`: a journey section's steps under their
// heading, whatever the view): the next index, or the end of the flow when that block has gone.
export function indexAfter(blocks, id) {
  const at = blocks.findIndex(block => block.id === id);
  return at < 0 ? blocks.length : at + 1;
}

// The slots once card `cardId` has taken slot `id`: that slot goes, and the slots made before it in front
// of the same block now stand in front of the new card, so nothing waiting jumps below it.
export function fillSlot(slots, id, cardId) {
  const filled = slots.find(slot => slot.id === id);
  if (!filled) return slots;
  const order = slots.indexOf(filled);
  return slots.filter(slot => slot !== filled).map(slot => (slots.indexOf(slot) < order && slot.before === filled.before ? { ...slot, before: cardId } : slot));
}

// A slot's size, the coming card's typical one, from LearningBlocks' BLOCK_TYPES (`types`): the block type the
// card's palette sample makes, at that type's width and its fixed height - else its typicalHeight (measured), else
// its auto-height cap. The cards drawn outside BLOCK_TYPES (a video moment, a Wikipedia article) at the size they
// open at. `samples`: the cards it can be (the Tutor's authored ones): their middle size, each sized by its scene
// (sizeFor) plus the rows a card grows by below it (typicalRows). Unknown: a plain card.
export const GENERIC_SLOT = { w: 380, h: 420 };
export const OWN_SIZES = { videoMoment: { w: 560, h: 420 }, wiki: { w: 560, h: 640 } };
export function slotSize(card, types, samples = []) {
  const middle = values => values.sort((a, b) => a - b)[values.length >> 1];
  const sized = samples.map(block => [types[block.type], types[block.type]?.sizeFor?.(block)]).filter(([, size]) => size);
  if (sized.length) return { w: middle(sized.map(([, size]) => size.width)), h: middle(sized.map(([type, size]) => size.height + (type.typicalRows || 0))) };
  if (OWN_SIZES[card]) return OWN_SIZES[card];
  const spec = types[card];
  if (!spec) return GENERIC_SLOT;
  const type = types[spec.sample?.().type] || spec;
  return { w: type.width ?? GENERIC_SLOT.w, h: type.height ?? type.typicalHeight ?? type.autoMax ?? GENERIC_SLOT.h };
}

// The part of the canvas surface the learner can actually see, in surface px: the surface less what floats over
// it (the chat sheet above the composer, the Voice caption, the contents rail), each cut away from the side that
// keeps the most room, then `pad` in from every edge so nothing lands against the chat, the tools or the frame.
export function freeArea(surface, overlays, pad = 24) {
  let area = { left: 0, top: 0, right: surface.w, bottom: surface.h };
  const room = rect => Math.max(0, rect.right - rect.left) * Math.max(0, rect.bottom - rect.top);
  for (const over of overlays) {
    if (over.right <= area.left || over.left >= area.right || over.bottom <= area.top || over.top >= area.bottom) continue;
    area = [{ ...area, bottom: Math.min(area.bottom, over.top) }, { ...area, top: Math.max(area.top, over.bottom) },
      { ...area, right: Math.min(area.right, over.left) }, { ...area, left: Math.max(area.left, over.right) }]
      .reduce((best, cut) => (room(cut) > room(best) ? cut : best));
  }
  return { left: area.left + pad, top: area.top + pad, right: area.right - pad, bottom: area.bottom - pad };
}

// The camera that shows `box` (world px) inside `area` (surface px) at the learner's zoom - view { x, y, z }, z
// never changes. Per axis: left alone when already inside; else centred (`centre`: a skeleton just reserved),
// or nudged just inside when partly in view (a card correcting its skeleton's place) and centred when out of view;
// its start at the area's edge when it is bigger than the area.
export function panInto(box, view, area, centre = false) {
  const axis = (start, size, offset, lo, hi) => {
    const from = start * view.z + offset, length = size * view.z;
    if (from >= lo && from + length <= hi) return offset;
    if (length > hi - lo) return lo - start * view.z;
    if (!centre && from + length > lo && from < hi) return (from < lo ? lo : hi - length) - start * view.z;
    return (lo + hi - length) / 2 - start * view.z;
  };
  return { ...view, x: axis(box.x, box.w, view.x, area.left, area.right), y: axis(box.y, box.h, view.y, area.top, area.bottom) };
}

// Where a slot can stand without covering anything drawn in the column. A card keeps its dragged offset (dx, dy)
// from its flow place - a drag, or the gap rail's pull - so one dragged up can be drawn over the flow place in front of
// it, and a slot reserved there would sit under it. The slot takes the free place nearest the one insertAtView picks
// (`at`, a block index); when none is free, the end of the column, below whatever is drawn there (`top`).
// items: the column in render order - chat cards, then blocks - { id, block, flowTop, flowBottom } (their flow
// place, margin included) and { x, y, w, h } (where they are drawn). slot: { w, h }. Returns { at, top }.
export function freeSlot(items, at, slot, { column = 560, gap = 20 } = {}) {
  const blocks = items.filter(item => item.block);
  const left = slot.w > column ? 0 : (column - slot.w) / 2, right = left + slot.w;
  const end = items.length ? Math.max(...items.map(item => item.flowBottom)) + gap : 0;
  const topOf = k => (k < blocks.length ? blocks[k].flowTop : end);
  // What a slot at block index k, its top at `top`, would cover: the blocks from k on move down by the slot.
  const covered = (k, top) => {
    const moved = new Set(blocks.slice(k).map(block => block.id));
    return items.filter(item => {
      const y = item.y + (moved.has(item.id) ? slot.h + gap : 0);
      return item.x < right && item.x + item.w > left && y < top + slot.h && y + item.h > top;
    });
  };
  const order = [...Array(blocks.length + 1).keys()].sort((a, b) => Math.abs(topOf(a) - topOf(at)) - Math.abs(topOf(b) - topOf(at)) || b - a); // a tie: the later, reading on
  const free = order.find(k => !covered(k, topOf(k)).length);
  if (free != null) return { at: free, top: 0 };
  let top = end;
  for (let hits = covered(blocks.length, top); hits.length; hits = covered(blocks.length, top)) top = Math.max(...hits.map(item => item.y + item.h)) + gap;
  return { at: blocks.length, top: top - end };
}
