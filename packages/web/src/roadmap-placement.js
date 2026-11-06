// Pure geometry for the roadmap's overlay and delivered cards. Screen rects are { left, top, width, height } (getBoundingClientRect).
import { placeResult } from './inline-placement.js';

const inside = (rect, area) => rect.left < area.left + area.width && rect.left + rect.width > area.left && rect.top < area.top + area.height && rect.top + rect.height > area.top;
// The proposal's anchor (its source card) against the canvas surface. No anchor card: the overlay is pinned in view, never offscreen.
export const anchorState = (anchor, surface) => (!anchor || !surface ? { visible: true, offscreen: false } : { visible: inside(anchor, surface), offscreen: !inside(anchor, surface) });
// Below the anchor when it fits, else above, else pinned to the surface bottom edge; always clamped inside the surface.
export function overlayPosition(anchor, surface, { width = 280, height = 150, gap = 8 } = {}) {
  const w = Math.min(width, surface.width - 16), clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  if (!anchor) return { left: surface.left + (surface.width - w) / 2, top: surface.top + surface.height - height - 24, width: w };
  const below = anchor.top + anchor.height + gap, above = anchor.top - gap - height;
  const top = below + height <= surface.top + surface.height ? below : above >= surface.top ? above : surface.top + surface.height - height - 8;
  return { left: clamp(anchor.left, surface.left + 8, surface.left + surface.width - w - 8), top, width: w };
}
// Where a delivered card of `size` goes: around the source/anchor point where there is free space (placeResult rings), not a
// mandatory side; nothing existing moves. obstacles: boxes of everything on the board (obstaclesOf); viewport may be null.
export const deliveredSpot = (size, anchor, obstacles, viewport = null) => {
  const spot = placeResult({ x: 0, y: 0, w: size.w, h: size.h }, anchor, obstacles, viewport);
  return { x: spot.x, y: spot.y };
};
