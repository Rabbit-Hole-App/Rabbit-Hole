// Canvas references, the card side (C:/s/spec/references-plan.md, Data contract and Client API): what canvasApi's addRef,
// removeRef and insertRefCard write, the copy re-id pasteIds gives refs, and the card= focus param. Pure, so the unit
// tests read it; AdaptiveCanvas and the pages wire it in.
import { placeNote } from './inline-ai-apply.js';

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
export const refCardSpot = (point, obstacles, visible = null) => placeNote({ x: point.x, y: point.y, w: 0, h: 0 }, REF_CARD, obstacles, visible);

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
