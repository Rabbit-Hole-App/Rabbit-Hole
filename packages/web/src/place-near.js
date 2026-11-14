const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
// A floating control beside `rect` (client px): inside the visible reader `frame`, above the rect when there is room, else
// below it, else pinned to the nearest visible edge. `origin` is its positioned parent.
// UX-2: the control's style left/top are in the ORIGIN's own units, but the rectangles are client pixels: on a canvas zoomed to 60% a card's pixels are 0.6 of its own units, so a selection far
// down a card put its toolbar far too high. Everything is therefore converted to the origin's units first (scale = rendered width / layout width); at 100% (a reader, a card at zoom 1) nothing changes.
export function placeNear(el, rect, frame, origin) {
  if (!el || !rect || !frame || !origin) return;
  const vis = frame.getBoundingClientRect(), base = origin.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
  const scale = origin.offsetWidth > 0 && base.width > 0 ? base.width / origin.offsetWidth : 1;
  const x = n => (n - base.left) / scale, y = n => (n - base.top) / scale;
  const visLeft = x(vis.left), visRight = x(vis.right), visTop = y(vis.top), visBottom = y(vis.bottom);
  const left = clamp(x(rect.left) + rect.width / scale / 2 - w / 2, visLeft + 4, Math.max(visLeft + 4, visRight - w - 4));
  const above = y(rect.top) - h - 6, below = y(rect.bottom) + 6;
  const top = above >= visTop + 4 ? above : below + h <= visBottom - 4 ? below : clamp(above, visTop + 4, Math.max(visTop + 4, visBottom - h - 4));
  el.style.left = `${left}px`; el.style.top = `${top}px`;
}
