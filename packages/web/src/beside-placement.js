// Owner 2026-11-08/09: a card made from another card (Ask a follow up, a term's Explore) stands BESIDE its source: to the right, level with the source's top, one gutter away (the
// same GAP placeNote uses for a note beside its target), never over anything. Pure geometry in world units; the canvas stores the result as the card's offsets (dx, dy), as it does for a dragged card.
import { GAP, freeSpot } from './inline-ai-apply.js';
import { deliveredSpot } from './roadmap-placement.js';

// A card not yet written is as wide as a card with a picture (the widest ordinary Explanation card, explanation-card-width.js), so a wider result does not run into the next neighbour.
export const BESIDE_ASSUMED_W = 720; // CV-1 made the widest ordinary Explanation card FULL_WIDTH.preferred (a plot at its 4:3 room), no longer the 546 of a picture card
export const BESIDE_TRIES = 6;

// source: the source card's measured box { x, y, w, h }. size: the card's slot size { w, h }; its height is the source's (the placeholder is as tall as the source until the card is written and measured).
// obstacles: every other box on the board. Returns the top-left { x, y } of the first free place to the right in the source's row, or null when none of the first BESIDE_TRIES is free
// (the caller then keeps the column placement, below).
// dy: how far below the source's top the card starts (a card made from highlighted words starts level with that line); clamped inside the source's height.
export function besideSpot(source, size, obstacles, { gap = GAP, tries = BESIDE_TRIES, dy = 0, h: roomH = null } = {}) {
  if (!source || !(source.w > 0) || !(source.h > 0)) return null;
  const w = Math.max(size?.w || 0, BESIDE_ASSUMED_W), h = Math.round(roomH ?? source.h); // roomH: the height the new card is assumed to need (a typed /explain), else as tall as the source
  for (let k = 0; k < tries; k += 1) {
    const spot = { x: source.x + source.w + gap + k * (w + gap), y: source.y + Math.max(0, Math.min(dy || 0, source.h - 40)), w, h };
    if (freeSpot(spot, obstacles)) return { x: Math.round(spot.x), y: Math.round(spot.y) };
  }
  return null;
}

// Typed /explain (canvas-cards BUG 4): the next card goes to the right of the previous one, close and loosely scattered, never overlapping. A deterministic jitter per request:
// its hash sets how far below the source's top the card starts (0 to 0.35 of the source's height, never more than SCATTER_MAX_DY: a card lands level with the source's top region, also beside a 5,400 px tall Full markdown) and whether the gap is one GAP or two, so no two cards line up exactly and the
// row still reads left to right. The same request id always gives the same place.
export const SCATTER_MAX_DY = 120, BESIDE_ASSUMED_H = 720; // a typed card is assumed at most 720 x 720: beside a 10,500 px Full markdown it needs a free 720 px, not a free 10,500 px column
export function scatterOf(requestId, sourceHeight) {
  let hash = 2166136261;
  for (const char of String(requestId)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return { dy: Math.min(SCATTER_MAX_DY, Math.round(((hash % 1000) / 1000) * 0.35 * (sourceHeight || 0))), gap: (hash >>> 10) & 1 ? 2 * GAP : GAP };
}

// Where a typed request's card stands: beside the source (besideSpot with the scatter), or when the row is full a new row under it, right of the column
// (deliveredSpot around the source's bottom-right corner plus GAP); never the column. Returns { at, size } - `size` is the slot's, as tall as the source when it is beside it.
export function followPlace({ source, size, id, obstacles }) {
  const { dy, gap } = scatterOf(id, source.h);
  const room = Math.min(Math.round(source.h), BESIDE_ASSUMED_H);
  const spot = besideSpot(source, size, obstacles, { dy, gap, h: room });
  if (spot) return { at: spot, size: { ...size, h: room } };
  return { at: deliveredSpot(size, { x: source.x + source.w + GAP, y: source.y + source.h + GAP }, obstacles, null), size };
}
