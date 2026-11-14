// Which boxes "Fit canvas" (Shift+1) frames (CV-7). A board with cards frames its cards (and their group frames): a text item, note or mark parked far from them (a stray
// text item at the top-left of a board whose cards were laid out thousands of pixels away) must not stretch the fit until the cards are a speck. A board with no card at all
// frames everything it has (a board of only stickies has to fit), as before.
export const fitBoxes = (blockBoxes, groupBoxes, otherBoxes) => (blockBoxes.length ? [...blockBoxes, ...groupBoxes] : [...groupBoxes, ...otherBoxes]);

// The first view of a board (CV-6). The opening camera is the top of the card column (homeView), so a board whose cards were moved away from it (laid out by dx and dy far to
// the right and down) opens on an empty surface. When the opening camera frames no card, the board opens on the top of its first file card (the markdown the explanations are
// about), else on its first card in reading order (topmost, then leftmost), at a legible zoom.
// `view` is the camera ({ x, y, z }: screen = world * z + offset), `area` the visible part of the surface in surface pixels, `boxes` the measured cards in world pixels.
export function framesAnyBlock(view, area, boxes) {
  const left = (area.left - view.x) / view.z, right = (area.right - view.x) / view.z, top = (area.top - view.y) / view.z, bottom = (area.bottom - view.y) / view.z;
  return boxes.some(box => box.x < right && box.x + box.w > left && box.y < bottom && box.y + box.h > top);
}

export function firstViewTarget(blocks, bounds) {
  const drawn = blocks.filter(block => bounds[block.id]);
  const file = drawn.find(block => block.type === 'file');
  if (file) return bounds[file.id];
  const boxes = drawn.map(block => bounds[block.id]).sort((a, b) => a.y - b.y || a.x - b.x);
  return boxes[0] || null;
}

// The camera that shows the top of `box`, centred on it, at the zoom that fits its width into the room but never below `minZoom` (a card wider than the room at that zoom is
// framed from its left edge) nor above 1 (a tall card, as a markdown file is, is entered from its top and scrolled, never zoomed out to fit).
export function topView(box, area, { pad = 48, minZoom = 0.5 } = {}) {
  const room = area.right - area.left, z = Math.min(1, Math.max(minZoom, (room - pad * 2) / Math.max(1, box.w)));
  return { x: area.left + Math.max(0, (room - box.w * z) / 2) - box.x * z, y: area.top + pad - box.y * z, z };
}
