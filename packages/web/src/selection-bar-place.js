// Where the selection action bar goes (owner brief 2026-10-13): just above the selection, right-aligned to it, a small gap;
// below it when there is no room above; kept inside the view; never over the selection unless the selection fills the view.
// anchor: the selection's box and box: the view's size, both in the same pixels (the canvas surface's). size: the bar's.
// Pure, so it is tested without a browser (selection-bar-place.test.mjs).
// below: prefer under the selection (a narrow view, where an object's own row of controls takes the space above it).
// gap 20: above the selection the bar clears a comment pin centred on its top edge (30 px, pinTopCentre; owner, 2026-10-21).
// The bar's top limit (placeBar's `top`) in the surface's pixels: 8 px below the page header's opaque band where that band lies
// over the surface (owner 2026-10-29), else 8 px. header, frame: their client rects (either may be missing).
export const barCeiling = (header, frame, inset = 8) => Math.max(inset, header && frame ? header.bottom - frame.top + inset : inset);

// Where a card's own row of controls goes when it would lie under that band (34 px plus its 8 px gap above the card, both scaled
// with the zoom; owner 2026-10-29): its top in the card's own px, 8 px below the band, over this card's top and never over a
// neighbour; null when the row fits above the card. top: the card's top and band: the band's bottom, both in surface px (band 0:
// none over the surface).
export const rowUnderBand = (top, zoom, band) => (band > 0 && top - 42 * zoom < band ? (band + 8 - top) / zoom : null);

export function placeBar(anchor, size, box, { gap = 20, margin = 8, top: inset = 8, below = false } = {}) {
  const roomAbove = anchor.top - gap - size.h >= inset;
  const roomBelow = anchor.bottom + gap + size.h <= box.h - margin;
  const side = below ? (roomBelow ? 'below' : roomAbove ? 'above' : 'inside') : roomAbove ? 'above' : roomBelow ? 'below' : 'inside';
  const top = side === 'above' ? anchor.top - gap - size.h : side === 'below' ? anchor.bottom + gap : inset;
  const left = Math.min(Math.max(margin, anchor.right - size.w), Math.max(margin, box.w - size.w - margin));
  return { left, top, side };
}

// The union of boxes ({ x, y, w, h } in world units) as a box in view pixels: x * zoom + the view's offset.
export function anchorOf(boxes, view) {
  if (!boxes.length) return null;
  const left = Math.min(...boxes.map(box => box.x)), top = Math.min(...boxes.map(box => box.y));
  const right = Math.max(...boxes.map(box => box.x + box.w)), bottom = Math.max(...boxes.map(box => box.y + box.h));
  return { left: left * view.z + view.x, top: top * view.z + view.y, right: right * view.z + view.x, bottom: bottom * view.z + view.y };
}

// Whether object `id` shows the actions in its own row (a host) rather than the floating bar. Not on a narrow view (the row
// can run off the edge), and not on an object with a comment pin (owner ruling, 2026-10-21): the pin sits at its top centre at
// a constant screen size while the row scales with the zoom, so only the floating bar (placeBar) clears the pin at every zoom.
// cut(id): the object's row would stand past the surface's edge, under a side panel such as Chat (owner, 2026-10-28: "controls
// must be reachable with the chat panel open"), where the floating bar, kept inside the view, takes over.
export function usesHost({ sole, narrow = false, pinned = null, cut = null }, id) {
  return sole === id && !narrow && !pinned?.(id) && !cut?.(id);
}
