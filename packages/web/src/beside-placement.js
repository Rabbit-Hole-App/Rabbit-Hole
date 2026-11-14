// Owner 2026-11-08/09: a card made from another card (Ask a follow up, a term's Explore) stands BESIDE its source: to the right, level with the source's top, one gutter away (the
// same GAP placeNote uses for a note beside its target), never over anything. Pure geometry in world units; the canvas stores the result as the card's offsets (dx, dy), as it does for a dragged card.
import { GAP, freeSpot } from './inline-ai-apply.js';

// A card not yet written is as wide as a card with a picture (the widest ordinary Explanation card, explanation-card-width.js), so a wider result does not run into the next neighbour.
export const BESIDE_ASSUMED_W = 546;
export const BESIDE_TRIES = 6;

// source: the source card's measured box { x, y, w, h }. size: the card's slot size { w, h }; its height is the source's (the placeholder is as tall as the source until the card is written and measured).
// obstacles: every other box on the board. Returns the top-left { x, y } of the first free place to the right in the source's row, or null when none of the first BESIDE_TRIES is free
// (the caller then keeps the column placement, below).
// dy: how far below the source's top the card starts (a card made from highlighted words starts level with that line); clamped inside the source's height.
export function besideSpot(source, size, obstacles, { gap = GAP, tries = BESIDE_TRIES, dy = 0 } = {}) {
  if (!source || !(source.w > 0) || !(source.h > 0)) return null;
  const w = Math.max(size?.w || 0, BESIDE_ASSUMED_W), h = Math.round(source.h);
  for (let k = 0; k < tries; k += 1) {
    const spot = { x: source.x + source.w + gap + k * (w + gap), y: source.y + Math.max(0, Math.min(dy || 0, source.h - 40)), w, h };
    if (freeSpot(spot, obstacles)) return { x: Math.round(spot.x), y: Math.round(spot.y) };
  }
  return null;
}
