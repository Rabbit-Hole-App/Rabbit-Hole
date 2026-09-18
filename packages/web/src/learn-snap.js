// Alignment snapping for canvas drags. A dragged box is compared against every
// other box on six lines - left, centre, right and top, middle, bottom - and
// pulled flush when one comes within tolerance, with a guide drawn to say why.
// Everything here is world units; the caller divides the pixel tolerance by the
// current zoom so the pull feels the same at any magnification.

export const SNAP_TOLERANCE = 6; // screen pixels
// Matches the dot grid in index.css, so snapping lands on dots you can see.
export const GRID = 18;

// Centre first, so a tie between "line the middles up" and "line the left edges
// up" resolves to the middle - that is the one people are reaching for.
const edges = (start, size) => [start + size / 2, start, start + size];

function nearest(moving, others, tolerance, axis) {
  const horizontal = axis === 'x';
  const start = horizontal ? moving.x : moving.y;
  const size = horizontal ? moving.w : moving.h;
  const offsets = [size / 2, 0, size];
  let best = null;
  for (const other of others) {
    const otherEdges = edges(horizontal ? other.x : other.y, horizontal ? other.w : other.h);
    for (const edge of otherEdges) {
      for (const offset of offsets) {
        const delta = edge - (start + offset);
        if (Math.abs(delta) > tolerance) continue;
        if (!best || Math.abs(delta) < Math.abs(best.delta)) best = { delta, at: edge, other };
      }
    }
  }
  return best;
}

export function snapMove(moving, others, tolerance = SNAP_TOLERANCE) {
  const x = nearest(moving, others, tolerance, 'x');
  const y = nearest(moving, others, tolerance, 'y');
  const box = { ...moving, x: moving.x + (x ? x.delta : 0), y: moving.y + (y ? y.delta : 0) };
  const lines = [];
  // A guide runs the length of the two boxes it relates, the way Figma draws it,
  // so it is obvious which object the snap answered to.
  if (x) lines.push({ axis: 'x', at: x.at, from: Math.min(box.y, x.other.y), to: Math.max(box.y + box.h, x.other.y + x.other.h) });
  if (y) lines.push({ axis: 'y', at: y.at, from: Math.min(box.x, y.other.x), to: Math.max(box.x + box.w, y.other.x + y.other.w) });
  return { x: box.x, y: box.y, lines };
}

export function snapGrid(x, y, step = GRID) {
  return { x: Math.round(x / step) * step, y: Math.round(y / step) * step, lines: [] };
}
