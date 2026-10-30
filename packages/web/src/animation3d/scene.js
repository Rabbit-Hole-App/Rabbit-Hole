// Trusted compilation of a validated animation3d artifact into Three.js objects (plan section 6 "Procedural creation", AN-02).
// No WebGL and no DOM here (label textures come from an injected labelTexture), so Node tests build the real objects. The artifact
// is validated first, so every budget (nodes, triangles, line points, labels) is checked before anything is allocated; the renderer
// builds exactly the segment counts contract.js triangleCost charges for.
//   buildAnimationScene(artifact, { labelTexture? }) -> { ok: true, scene } | { ok: false, issues }
//   scene: { root, objects: Map<node id, Object3D>, pickables: Object3D[], apply(frame) -> { ok, issues? }, dispose(), owned() }
// Every node is a transform-only Group (its id in userData.nodeId); its drawable, if any, is a child with a fixed local shape, so a
// frame's position/quaternion/scale never rebuilds geometry. apply validates the frame against the artifact first; a frame that
// fails changes nothing.
import * as THREE from 'three';
import { validateAnimationArtifact, validateAnimationFrame } from './contract.js';

const ARROW_RADIAL = 8; // contract.js triangleCost: an arrow is 4 x 8 (shaft) + 2 x 8 (head) triangles

// Labels are drawn at a constant on-screen size whatever the scene's scale or the camera distance (review 2026-10-30: world-sized
// labels were unreadably small in one view and covered objects in another). A label's plate is LABEL_PIXELS tall at the default
// size hint 0.3, scaled by size / 0.3 and clamped to [min, max] CSS pixels; it always faces the camera and draws over the scene.
export const LABEL_PIXELS = Object.freeze({ base: 28, min: 22, max: 40 });
export const labelPixels = size => Math.round(Math.min(LABEL_PIXELS.max, Math.max(LABEL_PIXELS.min, LABEL_PIXELS.base * size / 0.3)));
// Where the plate sits relative to its node's origin (Sprite.center: the plate point placed on the origin), with a small gap, so a
// label beside the point it names does not cover it.
const PLACEMENT = Object.freeze({ above: [0.5, -0.2], below: [0.5, 1.2], left: [1.06, 0.5], right: [-0.06, 0.5], center: [0.5, 0.5] });

// Screen-space declutter (review 2026-10-30: one label hid another in a particular view). plates: [{ x, y, w, h, placement }] in CSS
// pixels (x, y the top-left corner, y down), in scene order. Each plate that intersects an earlier, already placed one is pushed by
// the overlap, at most `steps` pushes, along its placement direction, then its two sides, then the opposite way; the first
// direction that clears every placed plate wins, and with none it stays where it was. Deterministic, O(n^2) for <= 24 labels.
// -> [{ dx, dy }] per plate, in order.
export const DECLUTTER = Object.freeze({ gap: 4, steps: 4 });
const DIRECTIONS = Object.freeze({ above: [0, -1], below: [0, 1], left: [-1, 0], right: [1, 0], center: [0, -1] });
export function declutterLabels(plates, { gap = DECLUTTER.gap, steps = DECLUTTER.steps } = {}) {
  const placed = [];
  const at = (plate, dx, dy) => ({ x: plate.x + dx, y: plate.y + dy, w: plate.w, h: plate.h });
  const blocker = r => placed.find(p => r.x < p.x + p.w + gap && p.x < r.x + r.w + gap && r.y < p.y + p.h + gap && p.y < r.y + r.h + gap);
  const clearAlong = (plate, [ux, uy]) => {
    let t = 0;
    for (let i = 0; i < steps; i += 1) {
      const r = at(plate, ux * t, uy * t), p = blocker(r);
      if (!p) return t;
      t += ux > 0 ? p.x + p.w + gap - r.x : ux < 0 ? r.x + r.w + gap - p.x : uy > 0 ? p.y + p.h + gap - r.y : r.y + r.h + gap - p.y;
    }
    return blocker(at(plate, ux * t, uy * t)) ? null : t;
  };
  return plates.map(plate => {
    const [px, py] = DIRECTIONS[plate.placement] ?? DIRECTIONS.above;
    let offset = { dx: 0, dy: 0 };
    for (const [ux, uy] of [[px, py], [py, px], [-py, -px], [-px, -py]]) {
      const t = clearAlong(plate, [ux, uy]);
      if (t !== null) { offset = { dx: ux * t + 0, dy: uy * t + 0 }; break; } // + 0: no -0
    }
    placed.push(at(plate, offset.dx, offset.dy));
    return offset;
  });
}

// A label's texture: dark text on a light rounded plate with a thin edge, readable on light and dark scenes. Browser only (a 2D canvas).
export function canvasLabelTexture(text) {
  const canvas = document.createElement('canvas'), context = canvas.getContext('2d'), height = 64, font = '600 36px system-ui, sans-serif';
  context.font = font;
  canvas.width = Math.ceil(context.measureText(text).width) + 36;
  canvas.height = height;
  context.font = font; // resizing the canvas reset it
  context.fillStyle = 'rgba(255, 255, 255, 0.92)';
  context.strokeStyle = 'rgba(31, 35, 40, 0.28)';
  context.lineWidth = 2;
  context.beginPath();
  context.roundRect(1, 1, canvas.width - 2, height - 2, 14);
  context.fill();
  context.stroke();
  context.fillStyle = '#1f2328';
  context.textBaseline = 'middle';
  context.fillText(text, 18, height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return { texture, aspect: canvas.width / height };
}

function meshGeometry(g) {
  switch (g.kind) {
    case 'box': return new THREE.BoxGeometry(...g.size);
    case 'sphere': return new THREE.SphereGeometry(g.radius, g.widthSegments, g.heightSegments);
    case 'cylinder': return new THREE.CylinderGeometry(g.radius, g.radius, g.height, g.radialSegments, 1);
    case 'cone': return new THREE.ConeGeometry(g.radius, g.height, g.radialSegments, 1);
    case 'plane': return new THREE.PlaneGeometry(g.width, g.height);
    case 'line': return new THREE.BufferGeometry().setFromPoints(g.points.map(point => new THREE.Vector3(...point)));
    case 'curve': return new THREE.BufferGeometry().setFromPoints(new THREE.CatmullRomCurve3(g.points.map(point => new THREE.Vector3(...point)), g.closed).getPoints(g.segments));
    default: return null; // arrow and label are composed below
  }
}

export function buildAnimationScene(artifact, { labelTexture = canvasLabelTexture } = {}) {
  const parsed = validateAnimationArtifact(artifact);
  if (!parsed.ok) return parsed;
  const { scene } = parsed.value;
  const owned = new Set(); // every geometry, material and texture this scene allocated, disposed exactly once
  const own = item => (owned.add(item), item);

  const surfaces = new Map(scene.materials.map(m => [m.id, own(new THREE.MeshStandardMaterial({ color: m.color, opacity: m.opacity, transparent: m.opacity < 1, side: THREE.DoubleSide }))]));
  const strokes = new Map(); // line materials, made on first use, follow their surface material's color and opacity
  const fallback = own(new THREE.MeshStandardMaterial({ color: '#9aa4b2', side: THREE.DoubleSide }));
  const stroke = id => {
    if (!strokes.has(id)) {
      const surface = surfaces.get(id) ?? fallback;
      strokes.set(id, own(new THREE.LineBasicMaterial({ color: surface.color, opacity: surface.opacity, transparent: surface.transparent })));
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
  const objects = new Map(), labels = new Map(), pickables = [];

  const label = (node, g, text) => {
    const { texture, aspect } = labelTexture(text);
    own(texture);
    const sprite = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: texture, sizeAttenuation: false, depthTest: false, depthWrite: false, transparent: true })));
    sprite.center.fromArray(PLACEMENT[g.placement]);
    sprite.userData.label = { aspect, pixels: labelPixels(g.size), placement: g.placement };
    sprite.renderOrder = 10; // after every mesh, over the scene
    return sprite;
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
    if (g?.kind === 'label') { drawable = label(node, g, g.text); labels.set(node.id, { drawable, g, text: g.text }); }
    else if (g?.kind === 'line' || g?.kind === 'curve') drawable = new THREE.Line(shapeOf(g), stroke(node.material));
    else if (g?.kind === 'arrow') {
      drawable = new THREE.Group();
      for (const part of shapeOf(g)) drawable.add(new THREE.Mesh(part, surfaces.get(node.material) ?? fallback));
    } else if (g) drawable = new THREE.Mesh(shapeOf(g), surfaces.get(node.material) ?? fallback);
    if (drawable) {
      drawable.traverse(child => { child.userData.nodeId = node.id; });
      holder.add(drawable);
      if (node.selectable || node.drag) pickables.push(drawable);
    }
    objects.set(node.id, holder);
  }
  const root = new THREE.Group();
  for (const node of scene.nodes) (node.parent === null ? root : objects.get(node.parent)).add(objects.get(node.id));

  const release = item => { if (owned.delete(item)) item.dispose(); };
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
          const tag = labels.get(id);
          if (update.text !== undefined && tag && tag.text !== update.text) {
            const next = label({ id }, tag.g, update.text);
            next.userData.nodeId = id;
            holder.remove(tag.drawable);
            release(tag.drawable.material.map);
            release(tag.drawable.material);
            holder.add(next);
            Object.assign(tag, { drawable: next, text: update.text });
          }
        }
        for (const [id, update] of Object.entries(checked.value.materials)) {
          for (const material of [surfaces.get(id), strokes.get(id)].filter(Boolean)) {
            if (update.color) material.color.set(update.color);
            if (update.opacity !== undefined) { material.opacity = update.opacity; material.transparent = update.opacity < 1; }
          }
        }
        return checked;
      },
      // Size every label for a viewport of width x height CSS pixels and this camera, cancelling its parents' world scale (without
      // size attenuation a sprite's scale is a fraction of the view: plate pixels = scale.y x f / 2 x height), then declutter the
      // plates on screen by shifting each sprite's center (its point stays where the scene put it). A hidden label, or one behind
      // the camera or off screen, takes no part and keeps its placement. The renderer calls this before every draw.
      layoutLabels({ width, height, camera }) {
        const f = 1 / Math.tan(camera.fov * Math.PI / 360), world = new THREE.Vector3(), point = new THREE.Vector3();
        root.updateWorldMatrix(true, true);
        camera.updateMatrixWorld();
        const plates = [];
        for (const { drawable } of labels.values()) {
          const { aspect, pixels, placement } = drawable.userData.label, tall = 2 * pixels / (f * Math.max(1, height));
          drawable.parent.getWorldScale(world);
          drawable.scale.set(tall * aspect / (world.x || 1), tall / (world.y || 1), 1);
          const [cx, cy] = PLACEMENT[placement];
          drawable.center.set(cx, cy);
          let shown = true;
          drawable.traverseAncestors(ancestor => { if (!ancestor.visible) shown = false; });
          drawable.getWorldPosition(point).project(camera);
          if (!shown || point.z < -1 || point.z > 1 || Math.abs(point.x) > 1 || Math.abs(point.y) > 1) continue;
          const w = pixels * aspect, h = pixels, sx = (point.x + 1) / 2 * width, sy = (1 - point.y) / 2 * height;
          plates.push({ drawable, x: sx - cx * w, y: sy - (1 - cy) * h, w, h, placement });
        }
        declutterLabels(plates).forEach(({ dx, dy }, index) => {
          const { drawable, w, h } = plates[index];
          drawable.center.set(drawable.center.x - dx / w, drawable.center.y + dy / h); // right/down on screen
        });
      },
      dispose() { root.removeFromParent(); root.clear(); [...owned].forEach(release); },
      owned: () => owned.size,
    },
  };
}
