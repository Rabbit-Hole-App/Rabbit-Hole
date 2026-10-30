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

// A label's texture: dark text on a light rounded plate, readable on light and dark scenes. Browser only (a 2D canvas).
export function canvasLabelTexture(text) {
  const canvas = document.createElement('canvas'), context = canvas.getContext('2d'), height = 64, font = '500 36px system-ui, sans-serif';
  context.font = font;
  canvas.width = Math.ceil(context.measureText(text).width) + 32;
  canvas.height = height;
  context.font = font; // resizing the canvas reset it
  context.fillStyle = 'rgba(255, 255, 255, 0.88)';
  context.beginPath();
  context.roundRect(0, 0, canvas.width, height, 14);
  context.fill();
  context.fillStyle = '#1f2328';
  context.textBaseline = 'middle';
  context.fillText(text, 16, height / 2);
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
    const sprite = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true })));
    sprite.scale.set(g.size * aspect, g.size, 1);
    sprite.renderOrder = 1;
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
      dispose() { root.removeFromParent(); root.clear(); [...owned].forEach(release); },
      owned: () => owned.size,
    },
  };
}
