// A card the learner has dragged is anchored (canvas-cards BUG 3): `at` is its world top-left, saved with the board like dx and dy. Its dx and dy are offsets from its
// flow place in the column, and the flow place moves when a card is inserted above it (or grows), which used to carry every arranged card with it. Each measure re-offsets an
// anchored card by however far its flow place moved since the last one, so it stays where the learner put it. A card never dragged has no `at` and keeps the column behaviour;
// a board saved before this loads unchanged. The insertion index logic is not involved.

// `box` is the card as drawn ({ x, y, w, h } in the world), the flow place is that less its offsets.
export const flowPlace = (box, block) => ({ x: box.x - (block.dx || 0), y: box.y - (block.dy || 0) });

// What dragging gives a card: its new offsets and the world position they put it at (`box`: where it is drawn now, at its current offsets).
export const dragged = (block, box, dx, dy) => ({ ...block, dx, dy, ...(box ? { at: { x: Math.round(box.x + dx - (block.dx || 0)), y: Math.round(box.y + dy - (block.dy || 0)) } } : null) });

// The re-offsets for one measure: a Map id -> { dx, dy, at } for each anchored card whose flow place moved while its own offsets did not (an offset that changed is a drag or
// another writer moving the card, not the column moving under it). `seen` (id -> flow place and offsets at the previous measure) is updated in place; a card seen for the
// first time (a board just loaded, or just dragged) only records.
export function holdAnchors(blocks, bounds, seen) {
  const moves = new Map();
  for (const block of blocks) {
    const box = bounds[block.id];
    if (!block.at) { seen.delete(block.id); continue; }
    if (!box) continue;
    const flow = flowPlace(box, block), before = seen.get(block.id), dx = block.dx || 0, dy = block.dy || 0;
    seen.set(block.id, { ...flow, dx, dy });
    if (!before || before.dx !== dx || before.dy !== dy) continue;
    const ddx = Math.round(flow.x - before.x), ddy = Math.round(flow.y - before.y);
    if (ddx || ddy) moves.set(block.id, { dx: dx - ddx, dy: dy - ddy, at: { x: Math.round(box.x - ddx), y: Math.round(box.y - ddy) } });
  }
  return moves;
}
