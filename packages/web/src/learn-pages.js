// Page guides: A4 outlines drawn in world units, so they pin to the content
// rather than to the camera. Snap-to-grid does the opposite - its dots are fixed
// to the viewport - and that difference is the whole point here. A boundary that
// slides when you pan is not a boundary, and one that keeps its size on screen
// while the cards shrink tells you nothing about how much page you have left.

// A4 portrait at 96dpi, the same basis a browser prints at.
export const PAGE_W = 794;
export const PAGE_H = 1123;
// Far beyond any real document; a guard against a runaway extent, not a product
// limit. ponytail: raise it if anyone ever writes a 200-page canvas.
export const PAGE_LIMIT = 200;

// `extent` is the lowest world y that has to be covered - the bottom of the
// content or of the viewport, whichever is further down.
export function pageRects(extent, columnWidth) {
  const bottom = Number.isFinite(extent) ? Math.max(0, extent) : 0;
  const count = Math.min(PAGE_LIMIT, Math.max(1, Math.ceil(bottom / PAGE_H)));
  // The column is centred on the paper, so the margin either side is the room
  // left before the content runs off the page.
  const x = (columnWidth - PAGE_W) / 2;
  return Array.from({ length: count }, (_, index) => ({ n: index + 1, x, y: index * PAGE_H, w: PAGE_W, h: PAGE_H }));
}
