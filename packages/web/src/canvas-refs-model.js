// Canvas references, the card side (C:/s/spec/references-plan.md, Data contract and Client API): what canvasApi's addRef,
// removeRef and insertRefCard write, the copy re-id pasteIds gives refs, and the card= focus param. Pure, so the unit
// tests read it; AdaptiveCanvas and the pages wire it in.
import { freeSpot, placeNote } from './inline-ai-apply.js';

// The server's bound per card (it answers 413 too_many_refs beyond it).
export const MAX_REFS = 20;
// A standalone reference card's box for placement; the Toolbar's canvas-ref card renders at this width.
export const REF_CARD = { w: 320, h: 72 };
export const CARD_GONE = 'That card is no longer on this canvas.';

// The card's refs with one more to `target`, or why not: only a lesson or file card (a block) holds refs - a
// canvas-ref card has exactly its one; chat cards, items and shapes never reach here (not blocks).
// reason 'limit' (20 already) is the one reason beyond the contract's 'exists' and 'unsupported'.
export function withRef(block, target, id = crypto.randomUUID()) {
  if (!block || !target || block.type === 'canvas-ref') return { reason: 'unsupported' };
  const refs = block.refs || [];
  if (refs.some(ref => ref.target === target)) return { reason: 'exists' };
  if (refs.length >= MAX_REFS) return { reason: 'limit' };
  return { refs: [...refs, { id, target }] };
}

// The card's refs without refId, or null when it holds no such ref (nothing to undo).
export function withoutRef(block, refId) {
  const refs = (block?.refs || []).filter(ref => ref.id !== refId);
  return block?.refs && refs.length < block.refs.length ? refs : null;
}

// A copy's refs (Ctrl+V, Ctrl+D, Alt-drag): the same targets under new ref ids, so the copy's index rows never collide.
export const reIdRefs = refs => refs.map(ref => ({ ...ref, id: crypto.randomUUID() }));

// The standalone card's spot near a world point (the menu's, or the view's centre): free of every obstacle, visible
// when it can be (placeNote, as Open in notebook places). The point itself stays uncovered.
// Beside the point as placeNote places; when its rings find no free spot in view (a click hemmed in by cards, or near the
// view's edge), the free spot in view nearest the point, so the card never lands off-screen while the view has room.
export function refCardSpot(point, obstacles, visible = null) {
  const at = { x: point.x, y: point.y, w: 0, h: 0 }, near = placeNote(at, REF_CARD, obstacles, visible);
  if (!near.offscreen || !visible) return near;
  // ponytail: a 28-unit grid over the view, a few thousand boxes for one click; a spatial index if views get huge.
  let best = null, bestD = Infinity;
  for (let x = visible.x; x + REF_CARD.w <= visible.x + visible.w; x += 28) for (let y = visible.y; y + REF_CARD.h <= visible.y + visible.h; y += 28) {
    const d = Math.hypot(x + REF_CARD.w / 2 - point.x, y + REF_CARD.h / 2 - point.y);
    if (d < bestD && freeSpot({ x, y, ...REF_CARD }, obstacles, at)) { best = { x, y }; bestD = d; }
  }
  return best ? { side: 'near', ...best, offscreen: false } : near;
}

// card=<objectId> from a location search: the card a backlink focuses, or null. Ids are UUIDs or short seeded strings
// (the server bounds them at 200).
export function cardParam(search) {
  const id = new URLSearchParams(search).get('card')?.trim();
  return id && id.length <= 200 ? id : null;
}
// The same address without card=, for history.replaceState.
export function withoutCardParam(href) {
  const url = new URL(href);
  url.searchParams.delete('card');
  return url.pathname + url.search + url.hash;
}
