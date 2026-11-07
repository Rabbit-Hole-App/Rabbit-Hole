// Pure geometry for the roadmap's overlay and delivered cards. Screen rects are { left, top, width, height } (getBoundingClientRect).
import { placeResult } from './inline-placement.js';
import { placeNote } from './inline-ai-apply.js';

const inside = (rect, area) => rect.left < area.left + area.width && rect.left + rect.width > area.left && rect.top < area.top + area.height && rect.top + rect.height > area.top;
// The proposal's anchor (its source card) against the canvas surface. No anchor card: the overlay is pinned in view, never offscreen.
export const anchorState = (anchor, surface) => (!anchor || !surface ? { visible: true, offscreen: false } : { visible: inside(anchor, surface), offscreen: !inside(anchor, surface) });
// Whether the fixed proposal overlay is drawn: the proposal's source card is on screen, or the learner opened the editor (Chat's Edit can open it while the
// source is offscreen; the editor lives in the overlay, which is always kept inside the surface, so it must not be invisible).
export const overlayShown = ({ pill, visible, editing = false }) => !!pill && (!!visible || !!editing);
// Below the anchor when it fits, else above, else pinned to the surface bottom edge; always clamped inside the surface.
export function overlayPosition(anchor, surface, { width = 280, height = 150, gap = 8 } = {}) {
  const w = Math.min(width, surface.width - 16), clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  if (!anchor) return { left: surface.left + (surface.width - w) / 2, top: surface.top + surface.height - height - 24, width: w };
  const below = anchor.top + anchor.height + gap, above = anchor.top - gap - height;
  const top = below + height <= surface.top + surface.height ? below : above >= surface.top ? above : surface.top + surface.height - height - 8;
  return { left: clamp(anchor.left, surface.left + 8, surface.left + surface.width - w - 8), top, width: w };
}
// Where a delivered card of `size` goes: around the source/anchor where there is free space, not a mandatory side; nothing existing moves.
// obstacles: boxes of everything on the board (obstaclesOf); viewport may be null (a proposal's place never depends on the camera, so it is the same
// for the pending proposal, the generating skeleton and the delivered card). anchor: a point { x, y } (placeResult rings around it) or a box
// { x, y, w, h } (placeNote: right, left, below, above it, then rings). Returns { x, y } (top-left, world units).
export const deliveredSpot = (size, anchor, obstacles, viewport = null) => {
  const spot = anchor && anchor.w > 0 && anchor.h > 0
    ? placeNote(anchor, size, obstacles, viewport, 60)
    : placeResult({ x: 0, y: 0, w: size.w, h: size.h }, anchor, obstacles, viewport);
  return { x: Math.round(spot.x), y: Math.round(spot.y) };
};
// The box a proposal is placed beside, in world units. source: the source card's box. passage: the passage's box when it is drawn (a rect in the same
// units), else null. A passage inside the card makes a slab as wide as the card at the passage's height (clamped to the card), so the proposal goes
// beside the relevant paragraph, not beside the card's middle; without a passage it is the card. No source: null (the caller falls back to a point).
export function proposalAnchor(source, passage = null) {
  if (!source) return null;
  if (!passage || !(passage.h > 0)) return { x: source.x, y: source.y, w: source.w, h: source.h };
  const top = Math.min(Math.max(passage.y, source.y), source.y + source.h - 1), bottom = Math.min(Math.max(passage.y + passage.h, top + 1), source.y + source.h);
  return { x: source.x, y: top, w: source.w, h: bottom - top };
}
