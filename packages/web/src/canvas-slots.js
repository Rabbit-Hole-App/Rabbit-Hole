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

// The slots once card `cardId` has taken slot `id`: that slot goes, and the slots made before it in front
// of the same block now stand in front of the new card, so nothing waiting jumps below it.
export function fillSlot(slots, id, cardId) {
  const filled = slots.find(slot => slot.id === id);
  if (!filled) return slots;
  const order = slots.indexOf(filled);
  return slots.filter(slot => slot !== filled).map(slot => (slots.indexOf(slot) < order && slot.before === filled.before ? { ...slot, before: cardId } : slot));
}

// A slot's size, the coming card's own (`types` is LearningBlocks' BLOCK_TYPES): the block type its
// palette sample makes, at that type's width and fixed height, else its auto-height cap. The cards drawn
// outside BLOCK_TYPES (a video moment, a Wikipedia article) at the size they open at. Unknown: a plain card.
// `samples`: the cards it can be (the Tutor's authored ones, each sized by its scene): their middle size.
export const GENERIC_SLOT = { w: 380, h: 420 };
export const OWN_SIZES = { videoMoment: { w: 560, h: 420 }, wiki: { w: 560, h: 640 } };
export function slotSize(card, types, samples = []) {
  const sized = samples.map(block => types[block.type]?.sizeFor?.(block)).filter(Boolean);
  const middle = values => values.sort((a, b) => a - b)[values.length >> 1];
  if (sized.length) return { w: middle(sized.map(size => size.width)), h: middle(sized.map(size => size.height)) };
  if (OWN_SIZES[card]) return OWN_SIZES[card];
  const spec = types[card];
  if (!spec) return GENERIC_SLOT;
  const type = types[spec.sample?.().type] || spec;
  return { w: type.width ?? GENERIC_SLOT.w, h: type.height ?? type.autoMax ?? GENERIC_SLOT.h };
}
