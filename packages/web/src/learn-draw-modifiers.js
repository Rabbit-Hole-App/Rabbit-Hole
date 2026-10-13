// Drawing modifiers (docs/features/canvas-editing.md): Shift squares a box or snaps a line to 45 degrees, Alt/Option
// draws or resizes from the centre, both combine. Pure geometry in world units, so the live preview and the saved shape
// come from the same call - whichever way the pointer crosses the start - and zoom never enters it.

const STEP = Math.PI / 4;

// A vector snapped to the nearest 45-degree direction, its length kept.
export function snapAngle(dx, dy) {
  const length = Math.hypot(dx, dy);
  if (!length) return { dx: 0, dy: 0 };
  const angle = Math.round(Math.atan2(dy, dx) / STEP) * STEP;
  // Rounded so a horizontal or vertical snap is exactly flat, not 1e-15 off.
  return { dx: Math.round(Math.cos(angle) * length * 1000) / 1000, dy: Math.round(Math.sin(angle) * length * 1000) / 1000 };
}

// A box vector made square: the longer side on both axes, each keeping its direction.
function square(dx, dy) {
  const side = Math.max(Math.abs(dx), Math.abs(dy));
  return { dx: (dx < 0 ? -1 : 1) * side, dy: (dy < 0 ? -1 : 1) * side };
}

// The shape a drag from `start` to `point` draws. Linear kinds keep x1,y1 as the start (the arrowhead goes at x2,y2).
export function drawGeometry(linear, start, point, { shift = false, alt = false } = {}) {
  let dx = point.x - start.x, dy = point.y - start.y;
  if (shift) ({ dx, dy } = linear ? snapAngle(dx, dy) : square(dx, dy));
  if (alt) return { x1: start.x - dx, y1: start.y - dy, x2: start.x + dx, y2: start.y + dy };
  return { x1: start.x, y1: start.y, x2: start.x + dx, y2: start.y + dy };
}

// A closed shape resized from one corner. `box` is the shape as it was when the drag began; `corner` is the corner
// dragged ([0|1, 0|1]: right? bottom?), `point` where it is now. Shift keeps the box's proportions, Alt keeps its
// centre. `min(w)` gives the smallest { w, h } allowed at a width (text inside a shape needs its height); the anchor -
// the opposite corner, or the centre - never moves for it.
export function resizeBox(box, corner, point, { shift = false, alt = false } = {}, min = () => ({ w: 8, h: 8 })) {
  const left = Math.min(box.x1, box.x2), top = Math.min(box.y1, box.y2), right = Math.max(box.x1, box.x2), bottom = Math.max(box.y1, box.y2);
  const anchor = alt ? { x: (left + right) / 2, y: (top + bottom) / 2 } : { x: corner[0] ? left : right, y: corner[1] ? top : bottom };
  let dx = point.x - anchor.x, dy = point.y - anchor.y;
  if (shift) {
    // The original proportions: the larger pull, as a share of each side, decides; signs follow the pointer.
    const w = right - left || 1, h = bottom - top || 1;
    const scale = Math.max(Math.abs(dx) / w, Math.abs(dy) / h);
    const sx = dx < 0 ? -1 : dx > 0 ? 1 : (corner[0] ? 1 : -1), sy = dy < 0 ? -1 : dy > 0 ? 1 : (corner[1] ? 1 : -1);
    dx = sx * w * scale; dy = sy * h * scale;
  }
  const span = alt ? 2 : 1;
  let w = Math.abs(dx) * span, h = Math.abs(dy) * span;
  const floor = min(Math.max(w, 1));
  if (w < floor.w) { w = floor.w; dx = (dx < 0 ? -1 : 1) * w / span; }
  const floorH = min(w).h;
  // ponytail: a floor beats Shift's ratio (text that needs the room wins over the proportions).
  if (h < floorH) { h = floorH; dy = (dy < 0 ? -1 : 1) * h / span; }
  if (alt) return { x1: anchor.x - Math.abs(dx), y1: anchor.y - Math.abs(dy), x2: anchor.x + Math.abs(dx), y2: anchor.y + Math.abs(dy) };
  return { x1: Math.min(anchor.x, anchor.x + dx), y1: Math.min(anchor.y, anchor.y + dy), x2: Math.max(anchor.x, anchor.x + dx), y2: Math.max(anchor.y, anchor.y + dy) };
}

// A line's end moved: Shift snaps it to 45 degrees around the other end, Alt moves both ends about the middle.
export function moveEnd(line, end, point, { shift = false, alt = false } = {}) {
  const other = end === 'start' ? { x: line.x2, y: line.y2 } : { x: line.x1, y: line.y1 };
  const centre = { x: (line.x1 + line.x2) / 2, y: (line.y1 + line.y2) / 2 };
  const pivot = alt ? centre : other;
  let dx = point.x - pivot.x, dy = point.y - pivot.y;
  if (shift) ({ dx, dy } = snapAngle(dx, dy));
  const moved = { x: pivot.x + dx, y: pivot.y + dy };
  const opposite = alt ? { x: pivot.x - dx, y: pivot.y - dy } : other;
  return end === 'start' ? { x1: moved.x, y1: moved.y, x2: opposite.x, y2: opposite.y } : { x1: opposite.x, y1: opposite.y, x2: moved.x, y2: moved.y };
}
