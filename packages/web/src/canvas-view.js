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
  const boxes = drawn.map(block => bounds[block.id]).sort(readingOrder);
  // PV-1: a board of chat exchanges only (measured with the cards, but not blocks) opens on the first of them.
  return boxes[0] || Object.values(bounds).sort(readingOrder)[0] || null;
}

const readingOrder = (a, b) => a.y - b.y || a.x - b.x;

// PV-1: a board with no card at all (text, notes, stickies, images, ink, frames only) opens on what it holds: the first box in reading order and every box that starts within
// what the visible area shows at the lowest legible zoom (`minZoom`) from it, as one box. A board spread over a huge area opens on its top-left cluster, not a speck.
export function clusterBox(boxes, area, minZoom = 0.5) {
  if (!boxes.length) return null;
  const [seed] = [...boxes].sort(readingOrder), reachX = (area.right - area.left) / minZoom, reachY = (area.bottom - area.top) / minZoom;
  const near = boxes.filter(box => box.x < seed.x + reachX && box.y < seed.y + reachY);
  const x = Math.min(...near.map(box => box.x)), y = Math.min(...near.map(box => box.y));
  return { x, y, w: Math.max(...near.map(box => box.x + box.w)) - x, h: Math.max(...near.map(box => box.y + box.h)) - y };
}

// The camera that shows the top of `box`, centred on it, at the zoom that fits its width into the room but never below `minZoom` (a card wider than the room at that zoom is
// framed from its left edge) nor above 1 (a tall card, as a markdown file is, is entered from its top and scrolled, never zoomed out to fit).
export function topView(box, area, { pad = 48, minZoom = 0.5 } = {}) {
  const room = area.right - area.left, z = Math.min(1, Math.max(minZoom, (room - pad * 2) / Math.max(1, box.w)));
  return { x: area.left + Math.max(0, (room - box.w * z) / 2) - box.x * z, y: area.top + pad - box.y * z, z };
}

// CK-4: the one camera for every FOCUS move (a card just made, Go to card, View passage or explanation, Focus): the thing goes to the middle of the visible `area` on both axes, at the
// learner's zoom (z never changes). A box already inside the area is centred too (panInto left it where it was). On an axis where the box is bigger than the area it starts at the area's
// edge (top / left), or, when `focus` (a box in the same world pixels: the passage) is given, that part is centred, so a tall card opens on the words and not on its top.
export function centerOnBox(box, view, area, focus = null) {
  const axis = (start, size, offset, lo, hi, part) => {
    const length = size * view.z;
    if (length > hi - lo) return part ? (lo + hi - part.size * view.z) / 2 - part.start * view.z : lo - start * view.z;
    return (lo + hi - length) / 2 - start * view.z;
  };
  return { ...view, x: axis(box.x, box.w, view.x, area.left, area.right, focus && { start: focus.x, size: focus.w }), y: axis(box.y, box.h, view.y, area.top, area.bottom, focus && { start: focus.y, size: focus.h }) };
}
