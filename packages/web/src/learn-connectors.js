// Connector geometry for the Learn canvas (docs/features/canvas-connectors.md):
// ports on the four sides of a shape, and the straight, curved and elbow routes
// a connector or a drawn arrow takes between two points.

export const SIDES = ['top', 'right', 'bottom', 'left'];
export const ROUTES = ['straight', 'curved', 'elbow'];
const DIRECTION = { top: { x: 0, y: -1 }, right: { x: 1, y: 0 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 } };
// How far an elbow runs straight out of a port before its first turn.
const STUB = 24;

export const shapeBox = shape => ({ x: Math.min(shape.x1, shape.x2), y: Math.min(shape.y1, shape.y2), w: Math.abs(shape.x2 - shape.x1), h: Math.abs(shape.y2 - shape.y1) });

export function sidePoint(box, side) {
  if (side === 'top') return { x: box.x + box.w / 2, y: box.y };
  if (side === 'bottom') return { x: box.x + box.w / 2, y: box.y + box.h };
  if (side === 'left') return { x: box.x, y: box.y + box.h / 2 };
  return { x: box.x + box.w, y: box.y + box.h / 2 };
}

// The side of a box facing a point: where a click-click connector lands.
export function nearestSide(box, point) {
  return SIDES.reduce((best, side) => {
    const at = sidePoint(box, side);
    const distance = Math.hypot(at.x - point.x, at.y - point.y);
    return !best || distance < best.distance ? { side, distance } : best;
  }, null).side;
}

// A loose end (the pointer while connecting) enters facing back at the start.
const entering = (a, b) => (Math.abs(b.x - a.x) > Math.abs(b.y - a.y)
  ? (b.x > a.x ? 'left' : 'right')
  : (b.y > a.y ? 'top' : 'bottom'));

const lengthOf = points => points.slice(1).reduce((sum, point, i) => sum + Math.hypot(point.x - points[i].x, point.y - points[i].y), 0);

// The point halfway along a polyline, by length.
export function polylineMid(points) {
  let left = lengthOf(points) / 2;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1], b = points[i];
    const step = Math.hypot(b.x - a.x, b.y - a.y);
    if (step >= left && step > 0) return { x: a.x + (b.x - a.x) * (left / step), y: a.y + (b.y - a.y) * (left / step) };
    left -= step;
  }
  return points[points.length - 1];
}

// Right-angle points from a (leaving towards aSide) to b (entering from bSide).
export function elbowPoints(a, aSide, b, bSide) {
  const da = DIRECTION[aSide], db = DIRECTION[bSide];
  const a1 = { x: a.x + da.x * STUB, y: a.y + da.y * STUB };
  const b1 = { x: b.x + db.x * STUB, y: b.y + db.y * STUB };
  const horizontal = side => side === 'left' || side === 'right';
  // A target behind the start port (e.g. a bottom port joined to a shape above
  // it) would make the run between the stubs double back through both shapes,
  // so it detours sideways, halfway between the ports, instead.
  // ponytail: no obstacle avoidance - shapes stacked exactly in line still cross.
  const backwards = (da.x && Math.sign(b1.x - a1.x) === -da.x) || (da.y && Math.sign(b1.y - a1.y) === -da.y);
  let middle;
  if (aSide === bSide) {
    // Same side: run out past the further stub, then across.
    const far = (p, q) => (aSide === 'bottom' || aSide === 'right' ? Math.max(p, q) : Math.min(p, q));
    if (horizontal(aSide)) { const x = far(a1.x, b1.x); middle = [{ x, y: a1.y }, { x, y: b1.y }]; }
    else { const y = far(a1.y, b1.y); middle = [{ x: a1.x, y }, { x: b1.x, y }]; }
  } else if (horizontal(aSide) && horizontal(bSide)) {
    middle = backwards ? [{ x: a1.x, y: (a.y + b.y) / 2 }, { x: b1.x, y: (a.y + b.y) / 2 }] : [{ x: (a1.x + b1.x) / 2, y: a1.y }, { x: (a1.x + b1.x) / 2, y: b1.y }];
  } else if (!horizontal(aSide) && !horizontal(bSide)) {
    middle = backwards ? [{ x: (a.x + b.x) / 2, y: a1.y }, { x: (a.x + b.x) / 2, y: b1.y }] : [{ x: a1.x, y: (a1.y + b1.y) / 2 }, { x: b1.x, y: (a1.y + b1.y) / 2 }];
  } else if (!horizontal(aSide)) {
    // Out vertically, in horizontally: one corner, unless that corner would
    // run back through the start (target behind the port) or arrive moving
    // away from the target's side; then a column between, or outside, them.
    const ahead = Math.sign(b1.y - a1.y) !== -da.y;
    const arrives = Math.sign(b1.x - a1.x) !== db.x;
    if (ahead && arrives) middle = [{ x: a1.x, y: b1.y }];
    else { const x = arrives ? (a1.x + b1.x) / 2 : (db.x < 0 ? Math.min(a1.x, b1.x) : Math.max(a1.x, b1.x)); middle = [{ x, y: a1.y }, { x, y: b1.y }]; }
  } else {
    const ahead = Math.sign(b1.x - a1.x) !== -da.x;
    const arrives = Math.sign(b1.y - a1.y) !== db.y;
    if (ahead && arrives) middle = [{ x: b1.x, y: a1.y }];
    else { const y = arrives ? (a1.y + b1.y) / 2 : (db.y < 0 ? Math.min(a1.y, b1.y) : Math.max(a1.y, b1.y)); middle = [{ x: a1.x, y }, { x: b1.x, y }]; }
  }
  const points = [a, a1, ...middle, b1, b];
  return points.filter((point, i) => i === 0 || point.x !== points[i - 1].x || point.y !== points[i - 1].y);
}

// The path of a connector: its SVG `d`, its middle (for the label) and the
// point its arrowhead points away from.
export function routePath(a, aSide, b, bSide, route) {
  const toSide = bSide || entering(a, b);
  if (route === 'straight') return { d: `M${a.x} ${a.y} L${b.x} ${b.y}`, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, from: a };
  if (route === 'elbow') {
    const points = elbowPoints(a, aSide, b, toSide);
    return { d: points.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' '), mid: polylineMid(points), from: points[points.length - 2] };
  }
  const bend = Math.max(40, Math.hypot(b.x - a.x, b.y - a.y) / 3);
  const c1 = { x: a.x + DIRECTION[aSide].x * bend, y: a.y + DIRECTION[aSide].y * bend };
  const c2 = { x: b.x + DIRECTION[toSide].x * bend, y: b.y + DIRECTION[toSide].y * bend };
  const mid = { x: 0.125 * a.x + 0.375 * c1.x + 0.375 * c2.x + 0.125 * b.x, y: 0.125 * a.y + 0.375 * c1.y + 0.375 * c2.y + 0.125 * b.y };
  return { d: `M${a.x} ${a.y} C${c1.x} ${c1.y},${c2.x} ${c2.y},${b.x} ${b.y}`, mid, from: c2 };
}

// A drawn elbow arrow has no ports: it leaves sideways towards its end.
export const freeElbow = ({ x1, y1, x2, y2 }) => {
  const mx = (x1 + x2) / 2;
  return [{ x: x1, y: y1 }, { x: mx, y: y1 }, { x: mx, y: y2 }, { x: x2, y: y2 }].filter((point, i, all) => i === 0 || point.x !== all[i - 1].x || point.y !== all[i - 1].y);
};
