// Trusted compilation of a validated animation3d artifact into Three.js objects (plan section 6 "Procedural creation", AN-02).
// No WebGL and no DOM here (label textures come from an injected labelTexture), so Node tests build the real objects. The artifact
// is validated first, so every budget (nodes, triangles, line points, labels) is checked before anything is allocated; the renderer
// builds exactly the segment counts contract.js triangleCost charges for.
//   buildAnimationScene(artifact, { labelTexture?(text, { pixels, ratio }), ratio? }) -> { ok: true, scene } | { ok: false, issues }
//   scene: { root, objects: Map<node id, Object3D>, pickables: Object3D[], apply(frame) -> { ok, issues? }, layoutLabels(view),
//            setOptionalLabels(on), hasOptionalLabels(), dispose(), owned() }
// Every node is a transform-only Group (its id in userData.nodeId); its drawable, if any, is a child with a fixed local shape, so a
// frame's position/quaternion/scale never rebuilds geometry. apply validates the frame against the artifact first; a frame that
// fails changes nothing.
import * as THREE from 'three';
import { contourPoints, validateAnimationArtifact, validateAnimationFrame } from './contract.js';

const ARROW_RADIAL = 8; // contract.js triangleCost: an arrow is 4 x 8 (shaft) + 2 x 8 (head) triangles
const TUBE_RADIAL = 8; // contract.js triangleCost: a curve with a radius is 2 x 8 triangles per segment

// Labels face the camera and draw over the scene, sized in CSS pixels on screen (review 2026-10-30: world-sized labels were
// unreadably small in one view and covered objects in another), but they follow the scene's apparent size (owner 2026-10-31: zoomed
// out, constant-size labels dominated the object): a plate is `share` of the scene's on-screen span (the projected diameter of its
// visible meshes and lines), times the size hint / 0.3 (kept within [0.75, 1.5]), in `step` buckets (each bucket re-rasterizes once)
// clamped to [min, max] (text is 0.64 of the plate: ~11.5 to 14 px). Room: all shown plates together cover at most `room` x span^2;
// essential labels (live values and captions: below) are admitted first and are never dropped, then optional ones by priority (larger
// size hint first, then scene order) until the next one would not fit, and that one and every lower one are hidden, as is any
// optional one that declutter cannot clear. Zooming out so drops the lowest optional labels instead of shrinking text. Every plate
// stays inside the viewport (`inset` from its edges): flipped to the other side of its point, pushed in, or reflowed onto more
// lines when it is wider than the viewport.
export const LABEL_PIXELS = Object.freeze({ min: 18, max: 22, step: 2, share: 0.06, room: 0.2, inset: 4 });
// A label that names an arrow (its node is a child of an arrow node) is kept in proportion to it, by the renderer, not the author (C9, owner; C7 job 2: a plate five times longer
// than a short arrow): hidden when the arrow is shorter than `hide` CSS pixels on screen, else wrapped to at most `cap` times the arrow's on-screen length (never narrower than `minWidth`).
export const ARROW_LABELS = Object.freeze({ hide: 24, cap: 3, minWidth: 72 });
export const labelPixels = (size, span) => {
  const { min, max, step, share } = LABEL_PIXELS;
  return Math.min(max, Math.max(min, Math.round(share * span * Math.min(1.5, Math.max(0.75, size / 0.3)) / step) * step));
};
// Where the plate sits relative to its node's origin (Sprite.center: the plate point placed on the origin), with a small gap, so a
// label beside the point it names does not cover it.
const PLACEMENT = Object.freeze({ above: [0.5, -0.2], below: [0.5, 1.2], left: [1.06, 0.5], right: [-0.06, 0.5], center: [0.5, 0.5] });

// Screen-space declutter (review 2026-10-30: one label hid another in a particular view). plates: [{ x, y, w, h, placement, essential? }]
// in CSS pixels (x, y the top-left corner, y down), in priority order. Each plate that intersects an earlier, already placed one is
// pushed by the overlap, at most `steps` pushes, along its placement direction, then its two sides, then the opposite way; the first
// direction that clears every placed plate wins; with none it gets null (no room: the scene hides it) and takes no room.
// bounds ({ x, y, w, h }, the viewport less its inset; none: unbounded): a plate must also lie inside it, never clipped. One that
// would not is tried flipped to the other side of its point (the placement mirrored), then clamped in; an essential plate with no
// clear spot is still placed (clamped, overlapping) rather than dropped (the scene shows live values and captions always).
// obstacles ([{ x1, y1, x2, y2, half }]: arrow shafts, base to tip, in the same pixels, thickened by `half`): a plate must also keep `gap`
// clear of every one, the whole shaft and its head, not only the ends (review of the SGD cards: the status label sat on the arrows and hid the
// downhill one). A plate that meets one is moved to the free spot nearest its own point (its own spot, flipped, or pushed along a shaft-free
// direction), never over its own point (a centered plate excepted); an essential plate with no such spot falls back to the spot the plates alone
// allow (it overlaps an arrow rather than being dropped), an optional one is left out. No obstacles: exactly the behavior above.
// A soft obstacle ({ ..., soft: true }, a small marker: a dot or ball drawn as a point x1 = x2, y1 = y2 with its radius as `half`) is kept off the
// same way, but only as far as room allows: with none, any plate (optional too) falls back to avoiding the arrows alone, so a marker never costs a
// label its place. A plate's own marker, the one its point sits on (within its radius + 2 px), is not an obstacle for it: the label stays beside what
// it names, and the other markers (the trail, the saved path) stay uncovered.
// Deterministic, O(n^2) for <= 24 labels. -> [{ dx, dy } | null] per plate, in order.
// A trail tube is drawn at most this share of the radius of the smallest sphere clamped to the same surface (the marker that walks it), whatever the artifact declares (C12, owner order).
export const TRAIL_RADIUS_SHARE = 0.35;
// reach (C10, owner; FX-AN-104): the most a plate may lie from the point it names, in CSS pixels from the plate's nearest edge to the anchor; a clear spot farther away is not taken.
export const DECLUTTER = Object.freeze({ gap: 4, steps: 4, reach: 48 });
const MARKER_SHARE = 0.1; // a mesh is a small marker when its projected diameter is at most this share of the scene's span
const LEADER_PIXELS = 6; // a moved plate this close to its point needs no leader
const DIRECTIONS = Object.freeze({ above: [0, -1], below: [0, 1], left: [-1, 0], right: [1, 0], center: [0, -1] });
export function declutterLabels(plates, { gap = DECLUTTER.gap, steps = DECLUTTER.steps, reach = DECLUTTER.reach, bounds = null, obstacles = [] } = {}) {
  const placed = [];
  let level = 0, mine = []; // level 0: every obstacle is avoided, 1: the arrows only, 2: none (an essential plate's last resort); mine: this plate's own markers
  const at = (plate, dx, dy) => ({ x: plate.x + dx, y: plate.y + dy, w: plate.w, h: plate.h });
  // Does the segment s, thickened by s.half + gap, meet the rect r? Liang-Barsky: clip s against r grown by that margin.
  const meets = (r, s) => {
    const m = s.half + gap, dx = s.x2 - s.x1, dy = s.y2 - s.y1;
    let t0 = 0, t1 = 1;
    for (const [d, q] of [[-dx, s.x1 - r.x + m], [dx, r.x + r.w + m - s.x1], [-dy, s.y1 - r.y + m], [dy, r.y + r.h + m - s.y1]]) {
      if (d === 0) { if (q < 0) return false; continue; }
      const t = q / d;
      if (d < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
      if (t0 > t1) return false;
    }
    return true;
  };
  const blocker = r => placed.find(p => r.x < p.x + p.w + gap && p.x < r.x + r.w + gap && r.y < p.y + p.h + gap && p.y < r.y + r.h + gap) ?? (level < 2 ? obstacles.find(s => !(level && s.soft) && !mine.includes(s) && meets(r, s)) : undefined);
  // The push that takes r clear of the arrow s along (ux, uy): the first whole pixel (it cannot take longer than s and r are big).
  const leave = (r, ux, uy, s) => { let t = 1; for (const end = Math.hypot(s.x2 - s.x1, s.y2 - s.y1) + r.w + r.h + 2 * (s.half + gap); t < end && meets(at(r, ux * t, uy * t), s); t += 1); return t; };
  const inside = r => !bounds || (r.x >= bounds.x && r.y >= bounds.y && r.x + r.w <= bounds.x + bounds.w && r.y + r.h <= bounds.y + bounds.h);
  const clearAlong = (plate, [ux, uy]) => {
    let t = 0;
    for (let i = 0; i < steps; i += 1) {
      const r = at(plate, ux * t, uy * t), p = blocker(r);
      if (!inside(r)) return null;
      if (!p) return t;
      t += p.half !== undefined ? leave(r, ux, uy, p) : ux > 0 ? p.x + p.w + gap - r.x : ux < 0 ? r.x + r.w + gap - p.x : uy > 0 ? p.y + p.h + gap - r.y : r.y + r.h + gap - p.y;
    }
    const last = at(plate, ux * t, uy * t);
    return inside(last) && !blocker(last) ? t : null;
  };
  // Where a plate may start: its own spot, the same plate on the other side of its point (PLACEMENT is symmetric, so the mirror of a
  // center c is 1 - c), then that spot clamped into the bounds.
  const starts = plate => {
    if (!bounds) return [[0, 0]];
    const [cx, cy] = PLACEMENT[plate.placement] ?? PLACEMENT.above, r = at(plate, 0, 0);
    const clampX = Math.max(bounds.x, Math.min(bounds.x + bounds.w - plate.w, plate.x)) - plate.x, clampY = Math.max(bounds.y, Math.min(bounds.y + bounds.h - plate.h, plate.y)) - plate.y;
    return [[0, 0], [(2 * cx - 1) * plate.w, (1 - 2 * cy) * plate.h], [clampX, clampY]].filter(([dx, dy], i, all) => (i === 2 || inside(at(r, dx, dy))) && all.findIndex(([x, y]) => x === dx && y === dy) === i);
  };
  return plates.map(plate => {
    const [px, py] = DIRECTIONS[plate.placement] ?? DIRECTIONS.above;
    const done = (dx, dy) => { const offset = { dx: dx + 0, dy: dy + 0 }; placed.push(at(plate, offset.dx, offset.dy)); return offset; }; // + 0: no -0
    const spots = starts(plate);
    // With arrows to avoid: of every free spot the one nearest the plate's own point (the point from its placement), not the first.
    const [cx, cy] = PLACEMENT[plate.placement] ?? PLACEMENT.above, ax = plate.x + cx * plate.w, ay = plate.y + (1 - cy) * plate.h;
    const away = (dx, dy) => { const r = at(plate, dx, dy); return Math.hypot(Math.max(r.x - ax, 0, ax - r.x - r.w), Math.max(r.y - ay, 0, ay - r.y - r.h)); };
    mine = obstacles.filter(s => s.soft && (Math.hypot(s.x1 - ax, s.y1 - ay) <= s.half + 2 || Math.hypot(s.x2 - ax, s.y2 - ay) <= s.half + 2)); // a marker at the plate's point, or a path that ends there
    for (level = obstacles.length ? 0 : 2; level <= 2; level += 1) {
      if (level === 1 && !obstacles.some(s => s.soft)) continue; // the same as level 0
      if (level === 2 && obstacles.length && !plate.essential) break; // an optional plate with no arrow-free spot is left out; an essential one tries again, ignoring them
      const nearest = level < 2 && obstacles.some(s => !s.soft); // arrows: the free spot nearest the point; markers alone: the first free spot, as ever
      let best = null;
      for (const [bx, by] of spots) {
        const base = at(plate, bx, by);
        for (const [ux, uy] of [[px, py], [py, px], [-py, -px], [-px, -py]]) {
          const t = clearAlong(base, [ux, uy]), dx = bx + ux * t, dy = by + uy * t;
          if (t === null || away(dx, dy) > reach || (nearest && plate.placement !== 'center' && away(dx, dy) <= 0)) continue; // never over its own point, never far from it
          if (!nearest || !(dx || dy)) return done(dx, dy);
          if (!best || away(dx, dy) < away(...best)) best = [dx, dy];
        }
      }
      if (best) return done(...best);
    }
    // ponytail: an essential plate wider or taller than the bounds is left-/top-aligned and clipped; layoutLabels reflows long text first.
    return plate.essential && bounds ? done(...spots.at(-1)) : null;
  });
}

// Reflow: a label wider than the viewport goes onto more lines instead of running off it. Greedy words, at most `limit` measured units a
// line (a word wider than that stays whole on its own line). Each extra line adds LABEL_LINE of the plate's one-line height.
export const LABEL_LINE = 0.75;
export function wrapLabel(text, measure, limit) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && measure(next) > limit) { lines.push(line); line = word; } else line = next;
  }
  lines.push(line);
  return lines;
}

// A label's texture: dark text on a light, subtle rounded plate, readable on light and dark scenes. Browser only (a 2D canvas).
// Rasterized at the plate's device-pixel size (pixels CSS tall x ratio device pixels per CSS pixel) and sampled without mipmaps, so
// with the plate on whole device pixels (layoutLabels) each texel is one screen pixel: no resampling blur. Text, padding and corner
// scale together with the plate. maxWidth (CSS pixels): the plate wraps to fit it, rows = the plate's height in one-line heights.
export function canvasLabelTexture(text, { pixels = LABEL_PIXELS.max, ratio = 1, maxWidth = Infinity } = {}) {
  const canvas = document.createElement('canvas'), context = canvas.getContext('2d'), height = Math.max(1, Math.round(pixels * ratio));
  const pad = Math.round(height * 0.38), edge = Math.max(1, Math.round(ratio)), font = `500 ${(height * 0.64).toFixed(2)}px system-ui, sans-serif`;
  context.font = font;
  const lines = wrapLabel(text, string => context.measureText(string).width, maxWidth * ratio - 2 * pad);
  canvas.width = Math.ceil(Math.max(...lines.map(line => context.measureText(line).width))) + 2 * pad;
  canvas.height = Math.round(height * (1 + (lines.length - 1) * LABEL_LINE));
  context.font = font; // resizing the canvas reset it
  context.fillStyle = 'rgba(255, 255, 255, 0.84)';
  context.strokeStyle = 'rgba(31, 35, 40, 0.16)';
  context.lineWidth = edge;
  context.beginPath();
  context.roundRect(edge / 2, edge / 2, canvas.width - edge, canvas.height - edge, height * 0.3);
  context.fill();
  context.stroke();
  context.fillStyle = '#1f2328';
  context.textBaseline = 'middle';
  lines.forEach((line, index) => context.fillText(line, pad, height / 2 + index * LABEL_LINE * height));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return { texture, aspect: canvas.width / canvas.height, rows: canvas.height / height };
}

function meshGeometry(g) {
  switch (g.kind) {
    case 'box': return new THREE.BoxGeometry(...g.size);
    case 'sphere': return new THREE.SphereGeometry(g.radius, g.widthSegments, g.heightSegments);
    case 'cylinder': return new THREE.CylinderGeometry(g.radius, g.radius, g.height, g.radialSegments, 1);
    case 'cone': return new THREE.ConeGeometry(g.radius, g.height, g.radialSegments, 1);
    case 'plane': return new THREE.PlaneGeometry(g.width, g.height);
    case 'line': return new THREE.BufferGeometry().setFromPoints(g.points.map(point => new THREE.Vector3(...point)));
    case 'curve': {
      const path = new THREE.CatmullRomCurve3(g.points.map(point => new THREE.Vector3(...point)), g.closed);
      return g.radius ? new THREE.TubeGeometry(path, g.segments, g.radius, TUBE_RADIAL, g.closed) : new THREE.BufferGeometry().setFromPoints(path.getPoints(g.segments));
    }
    default: return null; // arrow and label are composed below
  }
}

// surface_grid: the height field as an indexed mesh of exactly the contract's 2(rows - 1)(cols - 1) triangles. Vertex (r, c) is at
// x = (c / (cols - 1) - 1/2) width, y = heights[r][c], z = (r / (rows - 1) - 1/2) depth (contract.js), wound so the front faces +Y.
function surfaceGeometry(g) {
  const rows = g.heights.length, cols = g.heights[0].length, position = new Float32Array(rows * cols * 3), index = [];
  for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) position.set([(c / (cols - 1) - 0.5) * g.width, g.heights[r][c], (r / (rows - 1) - 0.5) * g.depth], (r * cols + c) * 3);
  for (let r = 0; r < rows - 1; r += 1) for (let c = 0; c < cols - 1; c += 1) { const a = r * cols + c, d = a + cols; index.push(a, d, a + 1, a + 1, d, d + 1); }
  const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(position, 3)).setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}
// The contour lines: marching squares at `contours` levels evenly spaced strictly between the lowest and highest height, as segment endpoints
// (two points per segment), at most contract.js contourPoints(g) points per level so the contract's line-point charge holds. Lifted a hair so the
// lines do not z-fight the surface. -> Float32Array
function contourPositions(g) {
  const rows = g.heights.length, cols = g.heights[0].length, flat = g.heights.flat(), lo = Math.min(...flat), hi = Math.max(...flat), out = [];
  if (!g.contours || !(hi > lo)) return new Float32Array(0);
  const at = (r, c) => [(c / (cols - 1) - 0.5) * g.width, (r / (rows - 1) - 0.5) * g.depth];
  for (let k = 1; k <= g.contours; k += 1) {
    const level = lo + (k / (g.contours + 1)) * (hi - lo), y = level + (hi - lo) * 0.003;
    let left = contourPoints(g) / 2;
    const cross = (r1, c1, r2, c2) => { // the point on a cell edge where the height is `level`, or null
      const h1 = g.heights[r1][c1], h2 = g.heights[r2][c2];
      if ((h1 < level) === (h2 < level)) return null;
      const t = (level - h1) / (h2 - h1), [x1, z1] = at(r1, c1), [x2, z2] = at(r2, c2);
      return [x1 + (x2 - x1) * t, y, z1 + (z2 - z1) * t];
    };
    for (let r = 0; r < rows - 1 && left > 0; r += 1) {
      for (let c = 0; c < cols - 1 && left > 0; c += 1) {
        const top = cross(r, c, r, c + 1), right = cross(r, c + 1, r + 1, c + 1), bottom = cross(r + 1, c, r + 1, c + 1), side = cross(r, c, r + 1, c);
        const found = [top, right, bottom, side].filter(Boolean);
        let pairs = [];
        if (found.length === 2) pairs = [found];
        else if (found.length === 4) { // a saddle: corner (r, c) joins the middle when it is on the middle's side of the level
          const middle = (g.heights[r][c] + g.heights[r][c + 1] + g.heights[r + 1][c] + g.heights[r + 1][c + 1]) / 4;
          pairs = (g.heights[r][c] < level) === (middle < level) ? [[top, right], [bottom, side]] : [[top, side], [right, bottom]];
        }
        for (const [from, to] of pairs) if (left > 0) { out.push(...from, ...to); left -= 1; }
      }
    }
  }
  return Float32Array.from(out);
}
// trail_points: a buffer allocated once for `max` points (a line of max points, or a tube of TUBE_RADIAL sides with the contract's 2 x 8 x (max - 1)
// triangles) that each frame's points fill from the start; the draw range shows only those. -> { geometry, set(points) }
function trailBuffers(g, radius) {
  const tube = radius > 0, sides = TUBE_RADIAL, per = tube ? sides : 1, position = new Float32Array(g.max * per * 3);
  const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(position, 3));
  const normal = new Float32Array(tube ? position.length : 0); // a lit tube needs them (FX-AN-092): the unit direction from the path out to each ring vertex
  if (tube) {
    geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
    const index = [];
    for (let i = 0; i < g.max - 1; i += 1) for (let s = 0; s < sides; s += 1) { const a = i * sides + s, b = i * sides + ((s + 1) % sides), c = a + sides, d = b + sides; index.push(a, c, b, b, c, d); }
    geometry.setIndex(index);
  }
  geometry.setDrawRange(0, 0);
  const tangent = new THREE.Vector3(), u = new THREE.Vector3(), v = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3(1, 0, 0);
  return {
    geometry,
    set(points) {
      const n = Math.min(points.length, g.max), box = new THREE.Box3();
      for (let i = 0; i < n; i += 1) {
        const [x, y, z] = points[i];
        box.expandByPoint(u.set(x, y, z));
        if (!tube) { position.set([x, y, z], i * 3); continue; }
        const before = points[Math.max(0, i - 1)], after = points[Math.min(n - 1, i + 1)];
        tangent.set(after[0] - before[0], after[1] - before[1], after[2] - before[2]);
        if (tangent.lengthSq() === 0) tangent.copy(up); else tangent.normalize();
        u.crossVectors(tangent, Math.abs(tangent.y) > 0.99 ? side : up).normalize();
        v.crossVectors(tangent, u);
        for (let s = 0; s < sides; s += 1) {
          const angle = (s / sides) * 2 * Math.PI, cos = Math.cos(angle) * radius, sin = Math.sin(angle) * radius;
          position.set([x + u.x * cos + v.x * sin, y + u.y * cos + v.y * sin, z + u.z * cos + v.z * sin], (i * sides + s) * 3);
          normal.set([u.x * Math.cos(angle) + v.x * Math.sin(angle), u.y * Math.cos(angle) + v.y * Math.sin(angle), u.z * Math.cos(angle) + v.z * Math.sin(angle)], (i * sides + s) * 3);
        }
      }
      geometry.attributes.position.needsUpdate = true;
      if (tube) geometry.attributes.normal.needsUpdate = true;
      geometry.setDrawRange(0, tube ? (n >= 2 ? (n - 1) * sides * 6 : 0) : n);
      if (n) box.expandByScalar(radius);
      geometry.boundingBox = box; // the zero-filled tail of the buffer must not widen it
      geometry.boundingSphere = n ? box.getBoundingSphere(new THREE.Sphere()) : new THREE.Sphere();
      return n;
    },
  };
}

// Every surface is a matte, non-metal physical material (lit by the renderer's soft environment and key light): roughness 1 (three's
// default) read as flat chalk, 0.55 gives soft highlights that show shape.
const SURFACE = Object.freeze({ roughness: 0.55, metalness: 0 });

export function buildAnimationScene(artifact, { labelTexture = canvasLabelTexture, ratio = 1 } = {}) {
  const parsed = validateAnimationArtifact(artifact);
  if (!parsed.ok) return parsed;
  const { scene } = parsed.value;
  const owned = new Set(); // every geometry, material and texture this scene allocated, disposed exactly once
  const own = item => (owned.add(item), item);
  const release = item => { if (owned.delete(item)) item.dispose(); };

  const surfaces = new Map(scene.materials.map(m => [m.id, own(new THREE.MeshStandardMaterial({ ...SURFACE, color: m.color, opacity: m.opacity, transparent: m.opacity < 1, side: THREE.DoubleSide }))]));
  const strokes = new Map(); // line materials, made on first use, follow their surface material's color and opacity
  const fronts = new Map(); // a surface node's own front-side-only clone of its material (FX-AN-094), made on first use, follows it too
  const front = id => {
    if (!fronts.has(id)) fronts.set(id, own(Object.assign((surfaces.get(id) ?? fallback).clone(), { side: THREE.FrontSide }))); // a height field seen from outside is its back face: not drawn
    return fronts.get(id);
  };
  const fallback = own(new THREE.MeshStandardMaterial({ ...SURFACE, color: '#9aa4b2', side: THREE.DoubleSide }));
  const stroke = id => {
    if (!strokes.has(id)) {
      const surface = surfaces.get(id) ?? fallback;
      // Not tone mapped: a 1 px line keeps its declared colour at full contrast.
      strokes.set(id, own(new THREE.LineBasicMaterial({ color: surface.color, opacity: surface.opacity, transparent: surface.transparent, toneMapped: false })));
    }
    return strokes.get(id);
  };
  const geometries = new Map();
  const shapeOf = g => {
    if (!geometries.has(g.id)) {
      if (g.kind === 'arrow') {
        const head = g.length * 0.25, radius = g.length * 0.03;
        const shaft = own(new THREE.CylinderGeometry(radius, radius, g.length - head, ARROW_RADIAL, 1).translate(0, (g.length - head) / 2, 0));
        const tip = own(new THREE.ConeGeometry(radius * 2.5, head, ARROW_RADIAL, 1).translate(0, g.length - head / 2, 0));
        geometries.set(g.id, [shaft, tip]);
      } else if (g.kind !== 'label') geometries.set(g.id, own(meshGeometry(g)));
    }
    return geometries.get(g.id);
  };
  const byGeometry = new Map(scene.geometries.map(g => [g.id, g]));
  const objects = new Map(), labels = new Map(), pickables = []; // labels: node id -> its sprite
  const nodeById = new Map(scene.nodes.map(node => [node.id, node]));
  const trails = new Map(), tops = new Map(), surfaceDefs = new Map(), truth = new Map(); // trail node -> set(points); surface node -> its mesh; clamped node -> the position the program gave
  // arrow_anchor (FX-AN-072): an arrow's offset is a distance outside the node's scale, so an arrow drawn as a unit arrow under scale [1, length, 1] still starts `offset`
  // from its origin; its tip is offset + length x scale up +Y. placers move each arrow's drawable and each tip label to match the arrow's current scale.
  const placers = [], bases = new Map(); // bases: tip label node id -> the position the program gave (before the tip shift)
  const surfaceLocal = new THREE.Vector3(); // the world y of a surface under (or over) a world point (buried, the rim hold)
  const scaleHolder = new THREE.Vector3(), shownNode = holder => { let on = holder.visible; holder.traverseAncestors(ancestor => { if (!ancestor.visible) on = false; }); return on; }; // a node and every ancestor shown
  const surfaceAt = (id, point) => { // the world y of the surface under (or over) this world point, or null when the point is off its footprint
    const mesh = tops.get(id), g = surfaceDefs.get(id);
    if (!mesh) return null;
    mesh.worldToLocal(surfaceLocal.copy(point));
    const rows = g.heights.length, cols = g.heights[0].length, col = (surfaceLocal.x / g.width + 0.5) * (cols - 1), row = (surfaceLocal.z / g.depth + 0.5) * (rows - 1);
    if (!(col >= 0 && col <= cols - 1 && row >= 0 && row <= rows - 1)) return null;
    const c = Math.min(Math.floor(col), cols - 2), r = Math.min(Math.floor(row), rows - 2), u = col - c, v = row - r, h = g.heights;
    const y = u + v <= 1 ? h[r][c] + u * (h[r][c + 1] - h[r][c]) + v * (h[r + 1][c] - h[r][c]) : h[r + 1][c + 1] + (1 - u) * (h[r + 1][c] - h[r + 1][c + 1]) + (1 - v) * (h[r][c + 1] - h[r + 1][c + 1]); // the two triangles of a cell
    return mesh.localToWorld(surfaceLocal.set(surfaceLocal.x, y, surfaceLocal.z)).y;
  };
  let ceiling = null, footprint = null; // the highest world y any clamp held a node to in the last frame, and the surface footprint it held x and z to, for the camera fit (FX-AN-074, decision 30)
  const clamps = scene.nodes.filter(node => node.clampTo).map(node => ({ id: node.id, target: node.clampTo.node, max: node.clampTo.max }));

  // A label's texture is painted by layoutLabels (its plate size depends on the view) and repainted only when its text, size bucket
  // or pixel ratio changes. Its leader: a thin line from the node's point to the plate, shown only when declutter moved the plate away.
  // Essential labels always show: a scene-level caption or instruction (a label node with no parent: the contract has no role
  // field, and an object's name is its child) and a live value (a label whose text a frame has set: essential from that frame on,
  // so it never flickers off). Every other label names an object and is optional: setOptionalLabels(false) hides it with its leader.
  let leaderMaterial = null, optional = true;
  const label = (node, g, text) => {
    const sprite = new THREE.Sprite(own(new THREE.SpriteMaterial({ sizeAttenuation: false, depthTest: false, depthWrite: false, transparent: true, toneMapped: false })));
    sprite.center.fromArray(PLACEMENT[g.placement]);
    sprite.renderOrder = 10; // after every mesh, over the scene
    leaderMaterial ??= own(new THREE.LineBasicMaterial({ color: '#1f2328', opacity: 0.4, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    const leader = new THREE.Line(own(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(6, 3))), leaderMaterial);
    Object.assign(leader, { visible: false, renderOrder: 9, frustumCulled: false }); // its points change every layout
    leader.userData.leader = true;
    sprite.userData.label = { text, size: g.size, placement: g.placement, aspect: 1, rows: 1, painted: null, leader, essential: node.parent === null };
    return sprite;
  };
  const paint = (sprite, pixels, maxWidth, painted) => {
    const tag = sprite.userData.label, old = sprite.material.map;
    const { texture, aspect, rows = 1 } = labelTexture(tag.text, { pixels, ratio, maxWidth });
    sprite.material.map = own(texture);
    Object.assign(tag, { aspect, rows, painted });
    if (old) release(old);
  };
  for (const node of scene.nodes) {
    const holder = new THREE.Group();
    holder.name = node.id;
    holder.userData.nodeId = node.id;
    holder.position.fromArray(node.position);
    const g0 = node.geometry === undefined ? null : byGeometry.get(node.geometry), above = byGeometry.get(nodeById.get(node.parent)?.geometry);
    if (g0?.kind === 'label' && g0.anchor === 'tip' && above?.kind === 'arrow') bases.set(node.id, node.position); // arrow_anchor: placed at the arrow's tip by its placer
    if (node.clampTo) truth.set(node.id, node.position);
    holder.quaternion.fromArray(node.quaternion);
    holder.scale.fromArray(node.scale);
    holder.visible = node.visible;
    const g = node.geometry === undefined ? null : byGeometry.get(node.geometry);
    let drawable = null;
    if (g?.kind === 'label') { drawable = label(node, g, g.text); labels.set(node.id, drawable); }
    else if (g?.kind === 'line' || (g?.kind === 'curve' && !g.radius)) drawable = new THREE.Line(shapeOf(g), stroke(node.material));
    else if (g?.kind === 'arrow') {
      drawable = new THREE.Group();
      drawable.userData.arrow = g.length;
      drawable.userData.arrowOffset = g.offset ?? 0;
      placers.push(() => {
        const along = (g.offset ?? 0) / (holder.scale.y || 1); // the offset in the node's own (scaled) units
        drawable.position.y = along;
        if (above?.kind === 'sphere') {
          // C12 (e2, owner; C11 Gate 2 jobs 1 and 2: a tiny arrow next to its label, a 2x arrow inside the ball): an arrow drawn from a sphere (its parent) whose drawn length is under that sphere's
          // diameter (its widest world scale) is not drawn, and neither is its tip label (layoutLabels); arrowsHidden() lists it. Exactly the diameter is drawn. A non-sphere parent: unchanged.
          const length = g.length * holder.getWorldScale(scaleHolder).y, diameter = 2 * above.radius * Math.max(...objects.get(node.parent).getWorldScale(scaleHolder).toArray());
          const hidden = length < diameter * (1 - 1e-9);
          drawable.visible = !hidden;
          drawable.userData.hidden = hidden ? { length, diameter } : null;
        }
        for (const [labelId, base] of bases) {
          const tag = objects.get(labelId);
          if (tag && tag.parent === holder) tag.position.set(base[0], base[1] + along + g.length, base[2]);
        }
      });
      for (const part of shapeOf(g)) drawable.add(new THREE.Mesh(part, surfaces.get(node.material) ?? fallback));
    } else if (g?.kind === 'surface') {
      // The surface mesh, and its contour lines in the surface colour darkened so they read against it (own material: a frame's colour change reaches the mesh only).
      drawable = new THREE.Group();
      const mesh = new THREE.Mesh(own(surfaceGeometry(g)), front(node.material)), lines = contourPositions(g);
      drawable.add(mesh);
      tops.set(node.id, mesh);
      surfaceDefs.set(node.id, g);
      if (lines.length) {
        const base = surfaces.get(node.material) ?? fallback;
        drawable.add(new THREE.LineSegments(own(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(lines, 3))), own(new THREE.LineBasicMaterial({ color: base.color.clone().multiplyScalar(0.5), toneMapped: false }))));
      }
    } else if (g?.kind === 'trail') {
      // The node's material for a trail; a ghost is the same at 40% opacity and half the radius (own material, so a frame's material update does not reach it).
      // C12: the tube is at most TRAIL_RADIUS_SHARE of the smallest ball clamped to the surface this trail follows (the first clamp target, else the scene's only surface), in the trail's own scale.
      const surfaceIds = scene.nodes.filter(n => byGeometry.get(n.geometry)?.kind === 'surface').map(n => n.id), followedId = clamps[0]?.target ?? (surfaceIds.length === 1 ? surfaceIds[0] : null);
      const balls = scene.nodes.filter(n => n.clampTo?.node === followedId && byGeometry.get(n.geometry)?.kind === 'sphere').map(n => byGeometry.get(n.geometry).radius * Math.max(...n.scale));
      const drawnRadius = g.radius && balls.length ? Math.min(g.radius, TRAIL_RADIUS_SHARE * Math.min(...balls) / Math.max(...node.scale)) : g.radius;
      const ghost = g.style === 'ghost', radius = drawnRadius ? drawnRadius * (ghost ? 0.5 : 1) : 0, base = surfaces.get(node.material) ?? fallback;
      const buffers = trailBuffers(g, radius);
      const material = radius
        ? (ghost ? own(Object.assign(base.clone(), { transparent: true, opacity: base.opacity * 0.4 })) : base)
        : (ghost ? own(new THREE.LineBasicMaterial({ color: base.color, transparent: true, opacity: base.opacity * 0.4, toneMapped: false })) : stroke(node.material));
      drawable = radius ? new THREE.Mesh(own(buffers.geometry), material) : new THREE.Line(own(buffers.geometry), material);
      drawable.frustumCulled = false; // its bounds follow its points
      drawable.visible = false; // nothing to draw until a frame carries points
      drawable.userData.empty = true;
      drawable.userData.trail = true;
      trails.set(node.id, points => { const n = buffers.set(points); drawable.visible = n >= (radius ? 2 : 1); drawable.userData.empty = !drawable.visible; drawable.userData.points = points.slice(0, n); }); // kept for the labels: the path is an obstacle (layoutLabels)
    } else if (g) drawable = new THREE.Mesh(shapeOf(g), surfaces.get(node.material) ?? fallback);
    if (drawable) {
      drawable.traverse(child => { child.userData.nodeId = node.id; });
      holder.add(drawable);
      if (drawable.userData.label) holder.add(drawable.userData.label.leader); // a sibling, never picked
      if (node.selectable || node.drag) pickables.push(drawable);
    }
    objects.set(node.id, holder);
  }
  const root = new THREE.Group();
  for (const node of scene.nodes) (node.parent === null ? root : objects.get(node.parent)).add(objects.get(node.id));
  for (const place of placers) place(); // each arrow at its offset, each tip label at its tip

  const bounds = new THREE.Box3(), sphere = new THREE.Sphere();
  // The scene's on-screen span in CSS pixels: the projected diameter of the bounding sphere of its visible meshes and lines (labels
  // and leaders excluded). Infinite with the camera inside it; the viewport height for a scene of labels only.
  const span = (f, height, camera) => {
    bounds.makeEmpty();
    root.traverseVisible(object => { if ((object.isMesh || object.isLine) && !object.userData.leader) bounds.expandByObject(object); });
    if (bounds.isEmpty()) return height;
    bounds.getBoundingSphere(sphere);
    const depth = -sphere.center.applyMatrix4(camera.matrixWorldInverse).z;
    return depth <= sphere.radius ? Infinity : sphere.radius * f * height / depth;
  };
  return {
    ok: true,
    scene: {
      root, objects, pickables, nodes: new Map(scene.nodes.map(node => [node.id, node])),
      apply(frame) {
        const checked = validateAnimationFrame(frame, parsed.value);
        if (!checked.ok) return checked;
        for (const [id, update] of Object.entries(checked.value.nodes)) {
          const holder = objects.get(id);
          if (update.position) { holder.position.fromArray(update.position); if (bases.has(id)) bases.set(id, update.position); if (truth.has(id)) truth.set(id, update.position); }
          if (update.quaternion) holder.quaternion.fromArray(update.quaternion);
          if (update.scale) holder.scale.fromArray(update.scale);
          if (update.visible !== undefined) holder.visible = update.visible;
          const tag = labels.get(id)?.userData.label;
          if (update.text !== undefined && tag) tag.essential = true; // a live value
          if (update.text !== undefined && tag && tag.text !== update.text) Object.assign(tag, { text: update.text, painted: null }); // repainted at the next layout
          if (update.points !== undefined) trails.get(id)?.(update.points);
        }
        for (const place of placers) place(); // arrows and their tip labels follow the scale a frame may have changed
        for (const [id, update] of Object.entries(checked.value.materials)) {
          for (const material of [surfaces.get(id), strokes.get(id), fronts.get(id)].filter(Boolean)) {
            if (update.color) material.color.set(update.color);
            if (update.opacity !== undefined) { material.opacity = update.opacity; material.transparent = update.opacity < 1; }
          }
        }
        // clamp: after the program's frame, a sphere bound to a surface is held at the surface's top (or at `max`), in world y. The node keeps the position the
        // program gave (truth), so a frame that does not move it is clamped again; clamped lists what was held: the true and the clamped world y.
        const clamped = [];
        ceiling = null; footprint = null;
        if (clamps.length) {
          root.updateWorldMatrix(true, true);
          for (const { id, target, max } of clamps) {
            const holder = objects.get(id), mesh = tops.get(target), world = new THREE.Vector3();
            holder.position.fromArray(truth.get(id));
            holder.userData.diverged = false; holder.userData.heldXZ = false;
            if (!mesh) continue;
            holder.parent.updateWorldMatrix(true, false);
            holder.updateWorldMatrix(false, false);
            holder.getWorldPosition(world);
            // Owner decision 30: held at the bowl's rim in x and z as well as y. The footprint is the surface's world box; a marker inside it and under the ceiling is untouched.
            const box = new THREE.Box3().setFromObject(mesh), limit = max ?? box.max.y;
            ceiling = Math.max(ceiling ?? -Infinity, limit);
            footprint = footprint ? { minX: Math.min(footprint.minX, box.min.x), maxX: Math.max(footprint.maxX, box.max.x), minZ: Math.min(footprint.minZ, box.min.z), maxZ: Math.max(footprint.maxZ, box.max.z) } : { minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z };
            const held = world.clone();
            held.x = Math.min(box.max.x, Math.max(box.min.x, world.x)); held.z = Math.min(box.max.z, Math.max(box.min.z, world.z));
            // C12 (FX-AN-116, the owner's exact fix): a marker that is held (beyond the rim, or above the ceiling) is drawn no higher than the clamp's explicit `max`, else no higher than the
            // SURFACE at its drawn x and z (the height where its path ends), not at the corner height of the surface's box; a marker that is not held is untouched.
            if (held.x !== world.x || held.z !== world.z || world.y > limit) held.y = Math.min(world.y, max ?? surfaceAt(target, held) ?? limit);
            const axes = ['x', 'y', 'z'].filter(axis => held[axis] !== world[axis]);
            if (!axes.length) continue;
            holder.userData.heldXZ = axes.includes('x') || axes.includes('z'); // it left the bowl: held at the rim, so it is not a marker drawn under the surface it sits on (buried)
            clamped.push({ node: id, axes, trueY: world.y, y: held.y, trueAt: world.toArray(), drawnAt: held.toArray() });
            world.copy(held);
            holder.position.copy(holder.parent.worldToLocal(world));
            holder.userData.diverged = true;
            holder.updateWorldMatrix(false, false);
          }
        }
        return { ...checked, clamped };
      },
      // Size every label for a viewport of width x height CSS pixels at `ratio` device pixels per CSS pixel and this camera
      // (LABEL_PIXELS), cancelling its parents' world scale (without size attenuation a sprite's scale is a fraction of the view:
      // plate pixels = scale.y x f / 2 x height), admit labels into the room the scene's span allows (essential ones first and always;
      // the rest by priority), declutter the admitted plates on screen, inside the viewport, by shifting each sprite's center (its
      // point stays where the scene put it) and put each plate on whole device pixels. An optional label left out is hidden; one
      // hidden by its node, behind the camera or off screen also keeps its placement. The renderer calls this before every draw.
      // -> [{ id, text, essential, shown, x, y, w, h }]: every label in the viewport's reach, its plate (CSS pixels, top-left) as drawn.
      layoutLabels({ width, height, camera, ratio: next = 1 }) {
        ratio = next;
        const f = 1 / Math.tan(camera.fov * Math.PI / 360), world = new THREE.Vector3(), point = new THREE.Vector3();
        // The drawing buffer is whole device pixels (three floors width x ratio), so screen positions use its exact CSS size.
        const w0 = Math.max(1, Math.floor(width * ratio)) / ratio, h0 = Math.max(1, Math.floor(height * ratio)) / ratio;
        root.updateWorldMatrix(true, true);
        camera.updateMatrixWorld();
        const across = span(f, h0, camera), candidates = [];
        const { inset } = LABEL_PIXELS, bounds = { x: inset, y: inset, w: Math.max(1, w0 - 2 * inset), h: Math.max(1, h0 - 2 * inset) };
        const arrowEnds = [new THREE.Vector3(), new THREE.Vector3()];
        const arrowPixels = arrow => { // the arrow's length on screen, in CSS pixels; Infinity when an end is out of the camera's depth range
          arrow.localToWorld(arrowEnds[0].set(0, 0, 0)).project(camera);
          arrow.localToWorld(arrowEnds[1].set(0, arrow.userData.arrow, 0)).project(camera);
          return Math.abs(arrowEnds[0].z) > 1 || Math.abs(arrowEnds[1].z) > 1 ? Infinity : Math.hypot((arrowEnds[1].x - arrowEnds[0].x) * w0 / 2, (arrowEnds[1].y - arrowEnds[0].y) * h0 / 2);
        };
        for (const [id, drawable] of labels) {
          const tag = drawable.userData.label, pixels = labelPixels(tag.size, across);
          if (!optional && !tag.essential) { drawable.visible = tag.leader.visible = false; continue; } // off: takes no room either
          let cap = bounds.w;
          const arrow = drawable.parent?.parent?.children.find(child => child.userData.arrow !== undefined); // the arrow this label names, if its node is a child of an arrow node
          if (arrow) {
            if (arrow.userData.hidden) { drawable.visible = tag.leader.visible = false; continue; } // C12 (e2): the arrow is not drawn, so its label is not either
            const length = arrowPixels(arrow);
            if (length < ARROW_LABELS.hide) { drawable.visible = tag.leader.visible = false; continue; } // no arrow to name: no label, and no room taken
            cap = Math.min(bounds.w, Math.max(ARROW_LABELS.minWidth, Math.round(ARROW_LABELS.cap * length / 8) * 8)); // buckets of 8 px: it repaints only when the cap moves
          }
          const painted = `${pixels}@${ratio}@${cap}`;
          if (tag.painted !== painted) paint(drawable, pixels, cap, painted);
          const h = Math.round(Math.round(pixels * ratio) * tag.rows) / ratio, w = h * tag.aspect, tall = 2 * h / (f * h0); // the painted height, exactly
          drawable.parent.getWorldScale(world);
          drawable.scale.set(tall * tag.aspect / (world.x || 1), tall / (world.y || 1), 1);
          const [cx, cy] = PLACEMENT[tag.placement];
          drawable.center.set(cx, cy);
          drawable.visible = tag.leader.visible = false;
          let shown = true;
          drawable.traverseAncestors(ancestor => { if (!ancestor.visible) shown = false; });
          drawable.getWorldPosition(point).project(camera);
          // An essential label (a live value or a caption: always shown) whose point has left the view but is in front of the camera is drawn at the viewport
          // edge nearest it (a diverged ball above the frame keeps its "Diverged"); an optional one (an object name) is left out as before. FX-AN-040.
          const off = Math.abs(point.x) > 1 || Math.abs(point.y) > 1;
          if (!shown || point.z < -1 || point.z > 1 || (off && !tag.essential)) continue;
          const tx = (point.x + 1) / 2 * w0, ty = (1 - point.y) / 2 * h0; // where the point really projects (the sprite stays anchored there)
          const sx = Math.min(w0 - inset, Math.max(inset, tx)), sy = Math.min(h0 - inset, Math.max(inset, ty)); // where the plate is laid out: the point, or the edge nearest it
          candidates.push({ id, drawable, x: sx - cx * w, y: sy - (1 - cy) * h, w, h, sx, sy, tx, ty, z: point.z, placement: tag.placement, size: tag.size, essential: tag.essential });
        }
        // Arrow shafts, base to tip on screen (userData.arrow is the arrow's length), thickened by the head's half width: plates keep off them.
        const obstacles = [], head = new THREE.Vector3(), tail = new THREE.Vector3();
        root.traverseVisible(arrow => {
          if (arrow.userData.arrow === undefined) return;
          arrow.localToWorld(tail.set(0, 0, 0)); // the drawable sits at the arrow's offset
          const depth = -world.copy(tail).applyMatrix4(camera.matrixWorldInverse).z, radius = arrow.children[1].geometry.parameters.radius * arrow.getWorldScale(world).x;
          arrow.localToWorld(head.set(0, arrow.userData.arrow, 0));
          tail.project(camera); head.project(camera);
          if (depth <= 0 || Math.abs(tail.z) > 1 || Math.abs(head.z) > 1) return;
          obstacles.push({ x1: (tail.x + 1) / 2 * w0, y1: (1 - tail.y) / 2 * h0, x2: (head.x + 1) / 2 * w0, y2: (1 - head.y) / 2 * h0, half: radius * f * h0 / (2 * depth) });
        });
        // Trail polylines (C9, owner): a label keeps off the path where there is room. Soft obstacles like markers, so a plate with no clear spot keeps its place instead of vanishing,
        // and the path that ends at a label's own point does not count against it (declutterLabels `mine`). At most 256 segments per trail.
        root.traverseVisible(trail => {
          const points = trail.userData.points;
          if (!trail.userData.trail || !points || points.length < 2) return;
          const stride = Math.max(1, Math.ceil((points.length - 1) / 256)), picked = [];
          for (let i = 0; i < points.length; i += stride) picked.push(i);
          if (picked.at(-1) !== points.length - 1) picked.push(points.length - 1);
          let before = null;
          for (const i of picked) {
            trail.localToWorld(world.set(points[i][0], points[i][1], points[i][2])).project(camera);
            const here = Math.abs(world.z) <= 1 ? { x: (world.x + 1) / 2 * w0, y: (1 - world.y) / 2 * h0 } : null;
            if (before && here) obstacles.push({ x1: before.x, y1: before.y, x2: here.x, y2: here.y, half: 2, soft: true });
            before = here;
          }
        });
        // Small markers (a dot, a ball, a puck): visible meshes that are not an arrow's parts and whose projected diameter is at most MARKER_SHARE of
        // the scene's span (a bowl, a floor or a bar is far larger), as soft point obstacles of their projected radius. Skipped when the camera is inside.
        if (Number.isFinite(across)) {
          const ball = new THREE.Sphere();
          root.traverseVisible(mesh => {
            if (!mesh.isMesh || mesh.parent.userData.arrow !== undefined) return;
            mesh.geometry.boundingSphere ?? mesh.geometry.computeBoundingSphere();
            ball.copy(mesh.geometry.boundingSphere).applyMatrix4(mesh.matrixWorld);
            const depth = -world.copy(ball.center).applyMatrix4(camera.matrixWorldInverse).z, half = ball.radius * f * h0 / (2 * depth);
            if (depth <= 0 || 2 * half > MARKER_SHARE * across) return;
            const at = ball.center.project(camera);
            if (Math.abs(at.z) <= 1) obstacles.push({ x1: (at.x + 1) / 2 * w0, y1: (1 - at.y) / 2 * h0, x2: (at.x + 1) / 2 * w0, y2: (1 - at.y) / 2 * h0, half, soft: true });
          });
        }
        candidates.sort((a, b) => b.essential - a.essential || b.size - a.size); // stable: equal hints keep scene order
        let room = LABEL_PIXELS.room * across * across;
        const plates = [], boxes = [];
        for (const plate of candidates) { room -= plate.w * plate.h; if (room < 0 && !plate.essential) break; plates.push(plate); } // an essential one never falls to the budget
        const left = new Set(candidates.filter(plate => !plates.includes(plate)));
        left.forEach(({ id, drawable, x, y, w, h, essential }) => boxes.push({ id, text: drawable.userData.label.text, essential, shown: false, x, y, w, h }));
        declutterLabels(plates, { bounds, obstacles }).forEach((offset, index) => {
          const { id, drawable, x, y, w, h, sx, sy, tx, ty, z, essential } = plates[index], { leader } = drawable.userData.label;
          if (!offset) { boxes.push({ id, text: drawable.userData.label.text, essential, shown: false, x, y, w, h }); return; }
          const at = Math.round((x + offset.dx) * ratio) / ratio, top = Math.round((y + offset.dy) * ratio) / ratio;
          boxes.push({ id, text: drawable.userData.label.text, essential, shown: true, x: at, y: top, w, h });
          drawable.center.set((tx - at) / w, 1 - (ty - top) / h);
          drawable.visible = true;
          if (!offset.dx && !offset.dy) return;
          // Moved away: a leader from the point to the nearest edge of its plate, at the point's depth, in the node's own space.
          const ex = Math.min(at + w, Math.max(at, sx)), ey = Math.min(top + h, Math.max(top, sy));
          if (Math.hypot(ex - sx, ey - sy) < LEADER_PIXELS) return;
          const end = drawable.parent.worldToLocal(new THREE.Vector3(ex / w0 * 2 - 1, 1 - ey / h0 * 2, z).unproject(camera));
          leader.geometry.attributes.position.setXYZ(1, end.x, end.y, end.z);
          leader.geometry.attributes.position.needsUpdate = true;
          leader.visible = true;
        });
        return boxes;
      },
      // C9 (owner; C7 job 3: a surface drawn at twice the height the program uses, balls and trails buried): the markers and path points drawn below the surface they sit on, in the
      // frame last applied. A sphere with clampTo is checked against its target; a trail against the first clamp target (or the scene's only surface). Below = more than half the
      // marker's radius (a path: its radius), and never less than 2% of the surface's height range, which absorbs a coarse grid's chord error; a point off the surface's footprint is not on it. -> [{ node, y, surfaceY }], the
      // worst point of a path, in scene order, rounded to 4 decimals.
      buried() {
        root.updateWorldMatrix(true, true);
        const found = [], world = new THREE.Vector3(), scale = new THREE.Vector3(), ranges = new Map(), round = value => Math.round(value * 1e4) / 1e4;
        const range = id => { if (!ranges.has(id)) { const flat = surfaceDefs.get(id).heights.flat(); ranges.set(id, (Math.max(...flat) - Math.min(...flat)) * Math.abs(tops.get(id).getWorldScale(scale).y)); } return ranges.get(id); };
        const followed = clamps[0]?.target ?? (tops.size === 1 ? [...tops.keys()][0] : null);
        for (const node of scene.nodes) {
          const g = byGeometry.get(node.geometry), holder = objects.get(node.id), widest = Math.max(...holder.getWorldScale(scale).toArray());
          if (g?.kind === 'sphere' && node.clampTo && tops.has(node.clampTo.node)) {
            if (holder.userData.heldXZ) continue;
            holder.getWorldPosition(world);
            const top = surfaceAt(node.clampTo.node, world);
            if (top !== null && world.y < top - Math.max(0.5 * g.radius * widest, 0.02 * range(node.clampTo.node))) found.push({ node: node.id, y: round(world.y), surfaceY: round(top) });
          } else if (g?.kind === 'trail' && followed) {
            const drawable = holder.children.find(child => child.userData.points), points = drawable?.userData.points ?? [];
            const slack = Math.max((g.radius ?? 0) * (g.style === 'ghost' ? 0.5 : 1) * widest, 0.02 * range(followed));
            let worst = null;
            for (const point of points) {
              drawable.localToWorld(world.set(point[0], point[1], point[2]));
              const top = surfaceAt(followed, world), depth = top === null ? 0 : top - world.y;
              if (depth > slack && (!worst || depth > worst.depth)) worst = { depth, y: world.y, surfaceY: top };
            }
            if (worst) found.push({ node: node.id, y: round(worst.y), surfaceY: round(worst.surfaceY) });
          }
        }
        return found;
      },
      // C12 (b)(iii): sphere markers whose drawn centres lie within half the smaller radius of each other, both shown and neither a ghost (a node named ghost, or a translucent material):
      // one hides the other (C11 jobs 3 and 7: twin balls at the initial capture). -> [{ a, b, distance }] in scene order, at most 4, distance rounded to 4 decimals.
      overlaps() {
        root.updateWorldMatrix(true, true);
        const spheres = scene.nodes.filter(n => byGeometry.get(n.geometry)?.kind === 'sphere' && !/ghost/i.test(`${n.id} ${n.name ?? ''}`) && (surfaces.get(n.material)?.opacity ?? 1) >= 1 && shownNode(objects.get(n.id)))
          .map(n => ({ id: n.id, at: objects.get(n.id).getWorldPosition(new THREE.Vector3()), radius: byGeometry.get(n.geometry).radius * Math.max(...objects.get(n.id).getWorldScale(scaleHolder).toArray()) }));
        const found = [];
        for (let i = 0; i < spheres.length; i += 1) for (let j = i + 1; j < spheres.length; j += 1) {
          const distance = spheres[i].at.distanceTo(spheres[j].at);
          if (distance < 0.5 * Math.min(spheres[i].radius, spheres[j].radius)) found.push({ a: spheres[i].id, b: spheres[j].id, distance: Math.round(distance * 1e4) / 1e4 });
        }
        return found.slice(0, 4);
      },
      // C12 (e): the arrows drawn with their tip or middle below the surface the markers sit on (the arrow's own clamp, else the first clamp target, else the scene's only surface) at that
      // x and z (C11 job 2: a 4x step arrow, drawn flat at the ball's height, ran into the rising wall). Below = more than 2% of the surface's height range, as buried(). An arrow the renderer
      // hides (arrowsHidden) is not drawn, so it is not listed. -> [{ id, point: 'tip' | 'middle' (the worse), tip: [x, y, z] world, under }], at most 4, rounded to 4 decimals.
      arrowsUnder() {
        root.updateWorldMatrix(true, true);
        const found = [], tail = new THREE.Vector3(), tip = new THREE.Vector3(), middle = new THREE.Vector3(), round = value => Math.round(value * 1e4) / 1e4 || 0;
        for (const node of scene.nodes) {
          const holder = objects.get(node.id), drawable = byGeometry.get(node.geometry)?.kind === 'arrow' ? holder.children.find(child => child.userData.arrow !== undefined) : null;
          const surfaceId = node.clampTo?.node ?? clamps[0]?.target ?? (tops.size === 1 ? [...tops.keys()][0] : null);
          if (!drawable || !drawable.visible || !shownNode(holder) || !tops.has(surfaceId)) continue;
          const flat = surfaceDefs.get(surfaceId).heights.flat(), slack = 0.02 * (Math.max(...flat) - Math.min(...flat)) * Math.abs(tops.get(surfaceId).getWorldScale(scaleHolder).y);
          drawable.localToWorld(tail.set(0, 0, 0)); drawable.localToWorld(tip.set(0, drawable.userData.arrow, 0)); middle.addVectors(tail, tip).multiplyScalar(0.5);
          let worst = null;
          for (const [point, at] of [['tip', tip], ['middle', middle]]) {
            const top = surfaceAt(surfaceId, at), under = top === null ? 0 : top - at.y;
            if (under > slack && (!worst || under > worst.under)) worst = { point, under };
          }
          if (worst) found.push({ id: node.id, point: worst.point, tip: tip.toArray().map(round), under: round(worst.under) });
        }
        return found.slice(0, 4);
      },
      // C12 (e2): the arrows the renderer does not draw because they are shorter than the diameter of the sphere they come from (a node the program hides is not listed).
      // -> [{ id, hidden: true, length, diameter }] in world units, at most 4, rounded to 4 decimals.
      arrowsHidden() {
        root.updateWorldMatrix(true, true);
        const found = [], round = value => Math.round(value * 1e4) / 1e4;
        for (const node of scene.nodes) {
          const holder = objects.get(node.id), hidden = byGeometry.get(node.geometry)?.kind === 'arrow' && shownNode(holder) ? holder.children.find(child => child.userData.arrow !== undefined)?.userData.hidden : null;
          if (hidden) found.push({ id: node.id, hidden: true, length: round(hidden.length), diameter: round(hidden.diameter) });
        }
        return found.slice(0, 4);
      },
      clampCeiling: () => ceiling,
      clampFootprint: () => footprint, // { minX, maxX, minZ, maxZ } of the surface a clamp held a node to in the last frame, or null (framing.js) // the highest world y a clamp held a node to in the last frame, or null: the camera fit does not follow a trail above it (framing.js)
      setOptionalLabels(on) { optional = !!on; }, // applied at the next layoutLabels
      hasOptionalLabels: () => [...labels.values()].some(sprite => !sprite.userData.label.essential),
      hasSurface: () => tops.size > 0, // framing.js: a scene with a surface node is viewed from at least FRAMING.surfaceElevation
      dispose() { root.removeFromParent(); root.clear(); [...owned].forEach(release); },
      owned: () => owned.size,
    },
  };
}
