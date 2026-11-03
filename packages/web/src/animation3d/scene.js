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
import { validateAnimationArtifact, validateAnimationFrame } from './contract.js';

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
// Deterministic, O(n^2) for <= 24 labels. -> [{ dx, dy } | null] per plate, in order.
export const DECLUTTER = Object.freeze({ gap: 4, steps: 4 });
const LEADER_PIXELS = 6; // a moved plate this close to its point needs no leader
const DIRECTIONS = Object.freeze({ above: [0, -1], below: [0, 1], left: [-1, 0], right: [1, 0], center: [0, -1] });
export function declutterLabels(plates, { gap = DECLUTTER.gap, steps = DECLUTTER.steps, bounds = null } = {}) {
  const placed = [];
  const at = (plate, dx, dy) => ({ x: plate.x + dx, y: plate.y + dy, w: plate.w, h: plate.h });
  const blocker = r => placed.find(p => r.x < p.x + p.w + gap && p.x < r.x + r.w + gap && r.y < p.y + p.h + gap && p.y < r.y + r.h + gap);
  const inside = r => !bounds || (r.x >= bounds.x && r.y >= bounds.y && r.x + r.w <= bounds.x + bounds.w && r.y + r.h <= bounds.y + bounds.h);
  const clearAlong = (plate, [ux, uy]) => {
    let t = 0;
    for (let i = 0; i < steps; i += 1) {
      const r = at(plate, ux * t, uy * t), p = blocker(r);
      if (!inside(r)) return null;
      if (!p) return t;
      t += ux > 0 ? p.x + p.w + gap - r.x : ux < 0 ? r.x + r.w + gap - p.x : uy > 0 ? p.y + p.h + gap - r.y : r.y + r.h + gap - p.y;
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
    for (const [bx, by] of spots) {
      const base = at(plate, bx, by);
      for (const [ux, uy] of [[px, py], [py, px], [-py, -px], [-px, -py]]) {
        const t = clearAlong(base, [ux, uy]);
        if (t !== null) return done(bx + ux * t, by + uy * t);
      }
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
      for (const part of shapeOf(g)) drawable.add(new THREE.Mesh(part, surfaces.get(node.material) ?? fallback));
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
          if (update.position) holder.position.fromArray(update.position);
          if (update.quaternion) holder.quaternion.fromArray(update.quaternion);
          if (update.scale) holder.scale.fromArray(update.scale);
          if (update.visible !== undefined) holder.visible = update.visible;
          const tag = labels.get(id)?.userData.label;
          if (update.text !== undefined && tag) tag.essential = true; // a live value
          if (update.text !== undefined && tag && tag.text !== update.text) Object.assign(tag, { text: update.text, painted: null }); // repainted at the next layout
        }
        for (const [id, update] of Object.entries(checked.value.materials)) {
          for (const material of [surfaces.get(id), strokes.get(id)].filter(Boolean)) {
            if (update.color) material.color.set(update.color);
            if (update.opacity !== undefined) { material.opacity = update.opacity; material.transparent = update.opacity < 1; }
          }
        }
        return checked;
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
        for (const [id, drawable] of labels) {
          const tag = drawable.userData.label, pixels = labelPixels(tag.size, across);
          if (!optional && !tag.essential) { drawable.visible = tag.leader.visible = false; continue; } // off: takes no room either
          const painted = `${pixels}@${ratio}@${bounds.w}`;
          if (tag.painted !== painted) paint(drawable, pixels, bounds.w, painted);
          const h = Math.round(Math.round(pixels * ratio) * tag.rows) / ratio, w = h * tag.aspect, tall = 2 * h / (f * h0); // the painted height, exactly
          drawable.parent.getWorldScale(world);
          drawable.scale.set(tall * tag.aspect / (world.x || 1), tall / (world.y || 1), 1);
          const [cx, cy] = PLACEMENT[tag.placement];
          drawable.center.set(cx, cy);
          drawable.visible = tag.leader.visible = false;
          let shown = true;
          drawable.traverseAncestors(ancestor => { if (!ancestor.visible) shown = false; });
          drawable.getWorldPosition(point).project(camera);
          if (!shown || point.z < -1 || point.z > 1 || Math.abs(point.x) > 1 || Math.abs(point.y) > 1) continue;
          const sx = (point.x + 1) / 2 * w0, sy = (1 - point.y) / 2 * h0;
          candidates.push({ id, drawable, x: sx - cx * w, y: sy - (1 - cy) * h, w, h, sx, sy, z: point.z, placement: tag.placement, size: tag.size, essential: tag.essential });
        }
        candidates.sort((a, b) => b.essential - a.essential || b.size - a.size); // stable: equal hints keep scene order
        let room = LABEL_PIXELS.room * across * across;
        const plates = [], boxes = [];
        for (const plate of candidates) { room -= plate.w * plate.h; if (room < 0 && !plate.essential) break; plates.push(plate); } // an essential one never falls to the budget
        const left = new Set(candidates.filter(plate => !plates.includes(plate)));
        left.forEach(({ id, drawable, x, y, w, h, essential }) => boxes.push({ id, text: drawable.userData.label.text, essential, shown: false, x, y, w, h }));
        declutterLabels(plates, { bounds }).forEach((offset, index) => {
          const { id, drawable, x, y, w, h, sx, sy, z, essential } = plates[index], { leader } = drawable.userData.label;
          if (!offset) { boxes.push({ id, text: drawable.userData.label.text, essential, shown: false, x, y, w, h }); return; }
          const at = Math.round((x + offset.dx) * ratio) / ratio, top = Math.round((y + offset.dy) * ratio) / ratio;
          boxes.push({ id, text: drawable.userData.label.text, essential, shown: true, x: at, y: top, w, h });
          drawable.center.set((sx - at) / w, 1 - (sy - top) / h);
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
      setOptionalLabels(on) { optional = !!on; }, // applied at the next layoutLabels
      hasOptionalLabels: () => [...labels.values()].some(sprite => !sprite.userData.label.essential),
      dispose() { root.removeFromParent(); root.clear(); [...owned].forEach(release); },
      owned: () => owned.size,
    },
  };
}
