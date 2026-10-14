// Matching the surroundings and finding free space for a new inline result (owner brief 2026-10-13 §7). Pure.
//   regionStyle: the local region's visual conventions - style context, kept apart from subject context.
//   placeResult: where a whole result goes near the insertion anchor, on the existing placer (inline-ai-apply.js).
import { freeSpot, inside, placeNote } from './inline-ai-apply.js';
import { FONT_KEYS, fontSize, hexColor } from './learn-rich-text.js';

// Our default look, for a blank canvas or a region with no shapes: the canvas tools' own defaults (ink, width 2, solid,
// no fill, elbow connectors) and the sizes the shape tools draw at.
export const DEFAULT_STYLE = Object.freeze({
  kind: 'rect', color: '#37352f', textColor: '#37352f', fill: null, width: 2, round: true, font: 'sans', fontSize: 14,
  route: 'elbow', lineColor: '#37352f', gap: 48, layerGap: 72, nodeW: 140, nodeH: 56, from: 0,
});
const CLOSED = new Set(['rect', 'ellipse', 'triangle', 'diamond', 'hexagon', 'star']);
const ROUTES = ['straight', 'curved', 'elbow'];
const REGION = 600; // world units around the anchor that count as "the region"
// placeNote's rings go 21 world units further out per step: 60 steps reach about 1,260 units from the anchor, a screen
// or more at normal zoom. ponytail: a fixed reach (about 480 tries); scale it by the viewport if boards get zoomed far out.
const REACH = 60;

// The most common valid value (first seen wins a tie), or the fallback.
const commonest = (values, fallback) => {
  const counts = new Map();
  for (const value of values) if (value != null) counts.set(value, (counts.get(value) || 0) + 1);
  let best = fallback, most = 0;
  for (const [value, n] of counts) if (n > most) { best = value; most = n; }
  return best;
};
const median = (values, fallback) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : fallback;
};
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// The conventions of the closed shapes near `at` (world units) and the connectors between them: shape kind, outline,
// fill, text colour, font, size, connector route and colour, and spacing. Only valid values are read; anything else keeps
// the default. board: the canvas's live lists ({ shapes, links }). Never subject matter: words are not read here.
export function regionStyle(board, at, { radius = REGION } = {}) {
  const box = shape => ({ x: Math.min(shape.x1, shape.x2), y: Math.min(shape.y1, shape.y2), w: Math.abs(shape.x2 - shape.x1), h: Math.abs(shape.y2 - shape.y1) });
  const near = (board.shapes || []).filter(shape => CLOSED.has(shape.kind) && [shape.x1, shape.y1, shape.x2, shape.y2].every(Number.isFinite))
    .map(shape => ({ shape, box: box(shape) }))
    .filter(({ box: b }) => Math.hypot(b.x + b.w / 2 - at.x, b.y + b.h / 2 - at.y) <= radius);
  if (!near.length) return DEFAULT_STYLE;
  const shapes = near.map(entry => entry.shape), ids = new Set(shapes.map(shape => shape.id));
  // An explanation's annotation connector is not the region's convention (canvas-semantics.js reads it the same way).
  const links = (board.links || []).filter(link => ids.has(link.from) && ids.has(link.to) && link.kind !== 'annotation' && !link.inline);
  // Spacing: each shape's clear gap to its nearest neighbour, the median of those.
  const gaps = near.map(({ box: a }, i) => Math.min(...near.filter((_, j) => j !== i).map(({ box: b }) =>
    Math.max(Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w), Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h)))));
  const gap = clamp(Math.round(median(gaps, DEFAULT_STYLE.gap)), 16, 240);
  const color = commonest(shapes.map(shape => hexColor(shape.color)), DEFAULT_STYLE.color);
  const fill = commonest(shapes.map(shape => hexColor(shape.fill) || 'none'), 'none');
  return {
    kind: commonest(shapes.map(shape => shape.kind), DEFAULT_STYLE.kind),
    color,
    textColor: commonest(shapes.map(shape => hexColor(shape.textColor)), DEFAULT_STYLE.textColor),
    fill: fill === 'none' ? null : fill,
    width: clamp(median(shapes.map(shape => shape.width), DEFAULT_STYLE.width), 1, 12),
    round: commonest(shapes.filter(shape => shape.kind === 'rect').map(shape => !!shape.round), DEFAULT_STYLE.round),
    font: commonest(shapes.map(shape => (FONT_KEYS.includes(shape.font) ? shape.font : null)), DEFAULT_STYLE.font),
    fontSize: fontSize(median(shapes.map(shape => shape.fontSize), DEFAULT_STYLE.fontSize)) || DEFAULT_STYLE.fontSize,
    route: commonest(links.map(link => (ROUTES.includes(link.route) ? link.route : null)), DEFAULT_STYLE.route),
    lineColor: commonest(links.map(link => hexColor(link.color)), color),
    gap, layerGap: Math.round(gap * 1.5),
    nodeW: clamp(Math.round(median(near.map(entry => entry.box.w), DEFAULT_STYLE.nodeW)), 40, 400),
    nodeH: clamp(Math.round(median(near.map(entry => entry.box.h), DEFAULT_STYLE.nodeH)), 24, 300),
    from: near.length,
  };
}

// Where a whole result goes: bounds is its box in its own frame (layoutDiagram's bounds, or a note's or card's size at
// 0,0); anchor the insertion point (world); obstacles everything on the board (obstaclesOf); viewport what the learner
// sees (world), or null. Centred on the anchor when that is free and in view; else the nearest free spot around the
// anchor by placeNote's rings, with the same margin to every obstacle; else beside everything on the board.
// Only a position: nothing on the board moves, and the result keeps its internal layout - callers translate the whole
// result by (dx, dy). offscreen: the spot is not fully in view, so the editor shows where it lands and offers to go there.
export function placeResult(bounds, anchor, obstacles, viewport = null) {
  const size = { w: bounds.w, h: bounds.h };
  const centred = { x: anchor.x - size.w / 2, y: anchor.y - size.h / 2 };
  const seen = !viewport || inside({ ...centred, ...size }, viewport);
  // A result larger than the view can never be wholly in it: centred on the anchor is then the nearest place it can go.
  const fits = !viewport || (size.w <= viewport.w && size.h <= viewport.h);
  const spot = freeSpot({ ...centred, ...size }, obstacles) && (seen || !fits)
    ? { ...centred, side: null, offscreen: !seen }
    : placeNote({ x: anchor.x, y: anchor.y, w: 0, h: 0 }, size, obstacles, viewport, REACH);
  return { x: spot.x, y: spot.y, dx: spot.x - bounds.x, dy: spot.y - bounds.y, side: spot.side, offscreen: spot.offscreen };
}
