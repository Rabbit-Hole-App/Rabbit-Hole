// Sloppiness: how hand-drawn a shape, arrow or connector looks (Clean, Sketchy, Rough). It changes only the rendered stroke -
// geometry, bindings, labels, fills and hit areas stay the real ones. Pure and seeded: the same (geometry, roughness, seed)
// always gives the same path, so an object looks the same on every rerender, move, zoom, theme change, reload, share and
// fork. Clean is never drawn here: callers render the original element, so old canvases are pixel-identical.
//
// In-house rather than rough.js: displacing the real outline by a smooth seeded noise (and fading it to zero at the free
// ends of an open path) keeps every anchor exactly where it was, which is what keeps arrowheads attached, and adds no
// dependency. ponytail: no hachure fills - a fill stays the plain tint under the wobbled outline.

export const ROUGHNESS = [
  { value: 0, id: 'clean', label: 'Clean', tip: 'Clean: precise, smooth lines' },
  { value: 1, id: 'sketchy', label: 'Sketchy', tip: 'Sketchy: subtle hand-drawn irregularity' },
  { value: 2, id: 'rough', label: 'Rough', tip: 'Rough: more pronounced hand-drawn strokes' },
];

// Objects saved before Sloppiness carry neither field and stay Clean.
export const roughnessOf = entry => (entry?.roughness === 1 || entry?.roughness === 2 ? entry.roughness : 0);

const hashOf = text => {
  let h = 2166136261;
  for (const ch of String(text)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
};
// The stored seed, else one derived from the id (stable, so an object that never got one still looks the same each time).
export const seedOf = entry => (Number.isInteger(entry?.seed) ? entry.seed >>> 0 : hashOf(entry?.id ?? ''));
// The fields a style change writes. A seed is stored the first time an object goes sketchy, so a copy of it looks identical.
export const roughnessPatch = (entry, level) => (level ? { roughness: level, seed: seedOf(entry) } : { roughness: 0 });

const random = seed => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// amp: the furthest a point strays (px). knot: the distance between noise knots, so the wobble's wavelength.
const LEVELS = {
  1: { amp: 1.4, knot: 70, passes: 1 },
  2: { amp: 3, knot: 36, passes: 2 },
};
const SPACING = 8;

const round = value => Math.round(value * 100) / 100;

// Points no further apart than SPACING, keeping every original vertex.
function densify(points, closed) {
  const out = [];
  const count = closed ? points.length : points.length - 1;
  for (let i = 0; i < count; i += 1) {
    const a = points[i], b = points[(i + 1) % points.length];
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / SPACING));
    for (let s = 0; s < steps; s += 1) out.push({ x: a.x + (b.x - a.x) * s / steps, y: a.y + (b.y - a.y) * s / steps });
  }
  if (!closed) out.push(points[points.length - 1]);
  return out;
}

const smooth = t => t * t * (3 - 2 * t);

// One smooth random function of arc length: random knots, eased between. Closed paths wrap so the loop has no seam.
function noise(next, length, knot, closed) {
  const count = Math.max(2, Math.round(length / knot));
  const values = Array.from({ length: count + 1 }, () => next() * 2 - 1);
  if (closed) values[count] = values[0];
  return s => {
    const u = Math.min(count - 1e-9, (s / (length || 1)) * count);
    const i = Math.floor(u);
    return values[i] + (values[i + 1] - values[i]) * smooth(u - i);
  };
}

function pass(points, closed, level, seed) {
  const dense = densify(points, closed);
  const along = [0];
  const total = closed ? dense.length : dense.length - 1;
  for (let i = 1; i <= total; i += 1) along.push(along[i - 1] + Math.hypot(dense[i % dense.length].x - dense[i - 1].x, dense[i % dense.length].y - dense[i - 1].y));
  const length = along[total];
  if (!length) return dense;
  const { amp, knot } = LEVELS[level];
  // A small object wobbles in proportion, so it never turns into a scribble.
  const reach = Math.min(amp, length * 0.03);
  const next = random(seed);
  const nx = noise(next, length, knot, closed), ny = noise(next, length, knot, closed);
  // An open path's free ends are anchors (an arrowhead sits there): the wobble fades to nothing over the last stretch.
  const fade = Math.min(length / 2, 14);
  return dense.map((p, i) => {
    const edge = closed ? 1 : smooth(Math.min(1, along[i] / fade, (length - along[i]) / fade));
    return { x: p.x + reach * edge * nx(along[i]), y: p.y + reach * edge * ny(along[i]) };
  });
}

const pathOfPoints = (points, closed) => `${points.map((p, i) => `${i ? 'L' : 'M'}${round(p.x)} ${round(p.y)}`).join('')}${closed ? 'Z' : ''}`;

const cache = new Map();
// The path(s) to draw for an outline: one for Sketchy, two overlapping strokes for Rough. null for Clean.
export function sloppyPaths(points, { closed = false, roughness = 0, seed = 0 } = {}) {
  const level = roughness === 1 || roughness === 2 ? roughness : 0;
  if (!level || !points || points.length < 2) return null;
  const key = `${level}|${seed}|${closed ? 1 : 0}|${points.map(p => `${round(p.x)},${round(p.y)}`).join(' ')}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const result = Array.from({ length: LEVELS[level].passes }, (_, i) => pathOfPoints(pass(points, closed, level, seed + i * 7919), closed));
  if (cache.size > 800) cache.clear();
  cache.set(key, result);
  return result;
}

// A small seeded offset for a point that is not an anchor (the arms of an arrowhead).
export function jitterPoint(point, roughness, seed) {
  const level = roughness === 1 || roughness === 2 ? roughness : 0;
  if (!level) return point;
  const next = random(seed), reach = LEVELS[level].amp * 0.6;
  return { x: point.x + (next() * 2 - 1) * reach, y: point.y + (next() * 2 - 1) * reach };
}

// ---- Outlines: the real geometry of each kind, as points to wobble.
const ARC = 6;
function roundedRect(x, y, w, h, radius) {
  const r = Math.min(radius, w / 2, h / 2);
  if (r < 3) return [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
  const corners = [[x + w - r, y + r, -Math.PI / 2], [x + w - r, y + h - r, 0], [x + r, y + h - r, Math.PI / 2], [x + r, y + r, Math.PI]];
  return corners.flatMap(([cx, cy, from]) => Array.from({ length: ARC + 1 }, (_, i) => ({ x: cx + r * Math.cos(from + (Math.PI / 2) * i / ARC), y: cy + r * Math.sin(from + (Math.PI / 2) * i / ARC) })));
}
function ellipse(cx, cy, rx, ry) {
  const count = Math.min(120, Math.max(24, Math.ceil(Math.PI * (rx + ry) / 6)));
  return Array.from({ length: count }, (_, i) => ({ x: cx + rx * Math.cos(2 * Math.PI * i / count), y: cy + ry * Math.sin(2 * Math.PI * i / count) }));
}
const quad = (a, c, b, steps = 24) => Array.from({ length: steps + 1 }, (_, i) => {
  const t = i / steps, u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
});
const cubic = (a, c1, c2, b, steps) => Array.from({ length: steps + 1 }, (_, i) => {
  const t = i / steps, u = 1 - t;
  return { x: u ** 3 * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t ** 3 * b.x, y: u ** 3 * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t ** 3 * b.y };
});

// extra: { polygon: pairs of [u, v] fractions of the box, control: a curve's control point, elbow: an elbow's corner points }.
export function outlineOf(shape, { polygon = null, control = null, elbow = null } = {}) {
  const { kind, x1, y1, x2, y2 } = shape;
  const x = Math.min(x1, x2), y = Math.min(y1, y2), w = Math.abs(x2 - x1), h = Math.abs(y2 - y1);
  if (kind === 'rect') return { points: roundedRect(x, y, w, h, shape.round ? 14 : 0), closed: true };
  if (kind === 'ellipse') return { points: ellipse(x + w / 2, y + h / 2, w / 2, h / 2), closed: true };
  if (polygon) return { points: polygon.map(([u, v]) => ({ x: x + u * w, y: y + v * h })), closed: true };
  if (kind === 'curve' && control) return { points: quad({ x: x1, y: y1 }, control, { x: x2, y: y2 }), closed: false };
  if (kind === 'elbow' && elbow) return { points: elbow, closed: false };
  return { points: [{ x: x1, y: y1 }, { x: x2, y: y2 }], closed: false };
}

// The paths for a drawn shape or arrow, or null when it is Clean.
export function sloppyShape(shape, extra) {
  const roughness = roughnessOf(shape);
  if (!roughness) return null;
  const { points, closed } = outlineOf(shape, extra);
  return sloppyPaths(points, { closed, roughness, seed: seedOf(shape) });
}

// The points of an SVG path made of M, L, C and Q (the connector routes): curves sampled, every anchor kept.
export function pointsOfPath(d) {
  const tokens = String(d).match(/[MLCQ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || [];
  const points = [];
  let command = '', i = 0;
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/^[MLCQ]$/i.test(tokens[i])) { command = tokens[i++].toUpperCase(); continue; }
    if (command === 'M' || command === 'L') points.push({ x: num(), y: num() });
    else if (command === 'C') {
      const last = points[points.length - 1], c1 = { x: num(), y: num() }, c2 = { x: num(), y: num() }, b = { x: num(), y: num() };
      const span = Math.hypot(c1.x - last.x, c1.y - last.y) + Math.hypot(c2.x - c1.x, c2.y - c1.y) + Math.hypot(b.x - c2.x, b.y - c2.y);
      points.push(...cubic(last, c1, c2, b, Math.min(120, Math.max(8, Math.ceil(span / SPACING)))).slice(1));
    } else if (command === 'Q') {
      const last = points[points.length - 1], c = { x: num(), y: num() }, b = { x: num(), y: num() };
      points.push(...quad(last, c, b).slice(1));
    } else i += 1;
  }
  return points;
}

// The paths for a connector's SVG `d`, or null when it is Clean.
export function sloppyLink(d, link) {
  const roughness = roughnessOf(link);
  if (!roughness) return null;
  return sloppyPaths(pointsOfPath(d), { closed: false, roughness, seed: seedOf(link) });
}
