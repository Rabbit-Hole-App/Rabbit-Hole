// The fitted view of an /animation scene (quality correction 2026-10-31: generated scenes showed a tiny subject in a mostly empty
// view, or a camera under a huge ceiling). The camera keeps the authored viewing direction and field of view and is moved to frame
// the subject over its whole movement range, sampled ONCE per artifact by a short-lived runtime of its own (runtime.js over the
// same engine as the card, never the learner's runtime), so the view never zooms during playback or a parameter change.
//   fitAnimationView({ artifact, aspect, workerFactory?, createRuntime?, signal? }) -> Promise<{ position, target, fov } | null>
//     null: aborted, an invalid artifact or nothing drawable; keep the authored camera.
//   animationSubject({ artifact, workerFactory?, createRuntime?, signal? }) -> Promise<Vector3[] | null>   the sampled subject
//   fitCameraToPoints(points, camera, aspect) -> camera     that subject along one view's direction (the review page's two views)
//   sampleAnimationFrames(...) -> Promise<frame[] | null>,  subjectPoints(scene, frames) -> Vector3[] | null   (the two halves)
import * as THREE from 'three';
import { ANIMATION_CAPABILITIES } from './capabilities.js';
import { validateAnimationArtifact } from './contract.js';
import { createAnimationRuntime } from './runtime.js';
import { buildAnimationScene } from './scene.js';

// fill: the subject spans this share of the view's height or width (a 10% margin each side, room for a label plate beside an
// edge). sheet / dwarf: a backdrop is a flat mesh larger than sheet x, or any mesh larger than dwarf x, the rest of the scene.
export const FRAMING = Object.freeze({ fill: 0.8, samples: 24, budgetMs: 1500, ticks: 30, sheet: 1.25, dwarf: 3 });

const extent = box => { const size = box.getSize(new THREE.Vector3()); return Math.max(size.x, size.y, size.z); };

// The frames of the movement range, in priority order (the sample cap and time budget cut from the end): the initial frame and a
// seekable loop at 1/4, 1/2, 3/4; every number parameter at its max then its min (with the loop again); each number alone at
// each end; every other select and toggle value; each drag range end; each action once; a stepped scene advanced three times.
// Any refusal or error falls back to the initial frame only (none when the runtime never got ready); an abort answers null.
export async function sampleAnimationFrames({ artifact, workerFactory, createRuntime = createAnimationRuntime, signal, now = () => performance.now() }) {
  const parsed = validateAnimationArtifact(artifact);
  if (!parsed.ok) return null;
  const { parameters, actions, timeline, behavior, stepped, scene } = parsed.value;
  const frames = [], deadline = now() + FRAMING.budgetMs;
  let latest = null;
  const runtime = createRuntime({ artifact, workerFactory, onFrame: frame => { latest = frame; } });
  signal?.addEventListener('abort', () => runtime.dispose(), { once: true }); // a closed card stops the sample at once (its Worker too)
  const room = () => frames.length < FRAMING.samples && now() < deadline && !signal?.aborted;
  const accept = async pending => { const result = await pending; if (!result.accepted) throw new Error(result.reason); };
  const send = event => accept(runtime.dispatch(event));
  const set = (p, value) => send({ type: 'parameter', parameter: p.id, value });
  const capture = async step => { if (room()) { await step(); frames.push(latest); } };
  const times = timeline && ANIMATION_CAPABILITIES.seekBehaviors.includes(behavior) ? [0.25, 0.5, 0.75].map(f => f * timeline.duration) : [];
  const loop = async () => {
    if (!times.length || !room()) return;
    for (const time of times) await capture(() => accept(runtime.seek(time)));
    await accept(runtime.seek(0));
  };
  const numbers = parameters.filter(p => p.type === 'number');
  try {
    await runtime.ready;
    frames.push(latest);
    await loop();
    if (numbers.length) {
      for (const end of ['max', 'min']) { await capture(async () => { for (const p of numbers) await set(p, p[end]); }); await loop(); }
      if (room()) for (const p of numbers) await set(p, p.default);
    }
    if (numbers.length > 1) for (const p of numbers) { for (const end of ['max', 'min']) await capture(() => set(p, p[end])); if (room()) await set(p, p.default); }
    for (const p of parameters.filter(item => item.type !== 'number')) {
      for (const value of p.type === 'toggle' ? [!p.default] : p.options.map(o => o.value).filter(value => value !== p.default)) await capture(() => set(p, value));
      if (room()) await set(p, p.default);
    }
    for (const node of scene.nodes.filter(item => item.drag)) {
      for (const value of [node.drag.min, node.drag.max]) await capture(async () => { await send({ type: 'drag_start', node: node.id, value }); await send({ type: 'drag_end', node: node.id, value }); });
    }
    for (const action of actions) await capture(() => send({ type: 'action', action: action.id }));
    if (stepped) for (let i = 0; i < 3; i += 1) await capture(() => accept(runtime.advance(FRAMING.ticks)));
  } catch {
    if (!signal?.aborted) return frames.slice(0, 1);
  } finally {
    runtime.dispose();
  }
  return signal?.aborted ? null : frames;
}

// The subject over every frame (applied in order to `scene`, a scene.js build the caller owns; with no frames, the authored scene),
// as world points: each shown mesh or line's own (oriented) box corners in every frame, so a part turning about a diagonal never
// counts its axis-aligned box's empty corners. Never a label plate (constant screen size, no world size), but a label's anchor
// point, so a floating caption stays in view. Backdrops (a floor, ceiling or wall: a flat mesh larger than sheet x the rest of the
// scene; anything larger than dwarf x it, by swept box) are context, not subject, and so are the labels on them. -> Vector3[] | null
export function subjectPoints(scene, frames) {
  const swept = new Map(), anchors = [], sheets = new Set(), size = new THREE.Vector3(), scale = new THREE.Vector3();
  const drawableOf = holder => holder.children.find(child => child.userData.nodeId === holder.userData.nodeId); // not a child node's holder, nor a label's leader
  const shown = object => { let on = true; object.traverseAncestors(ancestor => { if (!ancestor.visible) on = false; }); return on; };
  const cornersOf = drawable => {
    const corners = [];
    drawable.traverse(part => {
      if (!part.geometry) return;
      const { min, max } = part.geometry.boundingBox ?? (part.geometry.computeBoundingBox(), part.geometry.boundingBox);
      for (let i = 0; i < 8; i += 1) corners.push(new THREE.Vector3(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z).applyMatrix4(part.matrixWorld));
    });
    return corners;
  };
  // A flat mesh: its thinnest side under a tenth of its middle one, which is at least half its longest (a slab, not a rod).
  const flat = mesh => {
    const [a, b, c] = mesh.geometry.boundingBox.getSize(size).multiply(mesh.getWorldScale(scale)).toArray().map(Math.abs).sort((p, q) => p - q);
    return a < 0.1 * b && b >= 0.5 * c;
  };
  const measure = () => {
    scene.root.updateWorldMatrix(true, true);
    for (const [id, holder] of scene.objects) {
      const drawable = drawableOf(holder);
      if (!drawable || !shown(drawable)) continue;
      if (drawable.isSprite) { anchors.push({ id, point: drawable.getWorldPosition(new THREE.Vector3()) }); continue; }
      const corners = cornersOf(drawable);
      if (!swept.has(id)) { swept.set(id, { box: new THREE.Box3(), points: [] }); if (drawable.isMesh && flat(drawable)) sheets.add(id); }
      const node = swept.get(id);
      for (const corner of corners) { node.box.expandByPoint(corner); node.points.push(corner); }
    }
  };
  if (!frames.length) measure();
  for (const frame of frames) { scene.apply(frame); measure(); }

  const ids = [...swept.keys()].filter(id => !swept.get(id).box.isEmpty());
  const context = new Set(ids.filter(id => {
    const rest = new THREE.Box3();
    for (const other of ids) if (other !== id) rest.union(swept.get(other).box);
    if (rest.isEmpty()) return false;
    const mine = extent(swept.get(id).box), theirs = extent(rest);
    return mine > FRAMING.dwarf * theirs || (sheets.has(id) && mine > FRAMING.sheet * theirs);
  }));
  const onContext = id => { for (let node = scene.nodes.get(id); node; node = scene.nodes.get(node.parent)) if (context.has(node.id)) return true; return false; };
  const points = [...ids.filter(id => !context.has(id)).flatMap(id => swept.get(id).points), ...anchors.filter(({ id }) => !onContext(id)).map(({ point }) => point)];
  return points.length && extent(new THREE.Box3().setFromPoints(points)) > 0 ? points : null;
}

// The camera on the authored direction (position - target) that frames every point at FRAMING.fill of both the vertical and the
// horizontal field of view, aimed at the points' box center, never inside their bounding sphere.
export function fitCameraToPoints(points, { position, target, fov = 50 }, aspect) {
  const center = new THREE.Box3().setFromPoints(points).getCenter(new THREE.Vector3());
  const back = new THREE.Vector3().fromArray(position).sub(new THREE.Vector3().fromArray(target));
  if (back.lengthSq() === 0) back.set(0, 0, 1);
  const right = new THREE.Vector3(), up = new THREE.Vector3(), toward = new THREE.Vector3(), offset = new THREE.Vector3();
  new THREE.Matrix4().lookAt(back, new THREE.Vector3(), THREE.Object3D.DEFAULT_UP).extractBasis(right, up, toward); // the camera's own axes
  const tanY = Math.tan(fov * Math.PI / 360) * FRAMING.fill, tanX = tanY * aspect;
  let distance = 0;
  for (const point of points) {
    offset.subVectors(point, center);
    const depth = offset.dot(toward); // toward the camera: a nearer point needs more room
    distance = Math.max(distance, offset.length(), depth + Math.abs(offset.dot(right)) / tanX, depth + Math.abs(offset.dot(up)) / tanY);
  }
  // ponytail: no far-plane check (renderer.js far = 2000); a subject that large keeps whatever the far plane clips.
  return { position: center.clone().addScaledVector(toward, distance).toArray(), target: center.toArray(), fov };
}

const plainLabel = () => ({ texture: new THREE.Texture(), aspect: 1 }); // a measuring scene is never drawn

export async function animationSubject({ artifact, workerFactory, createRuntime, signal }) {
  const frames = await sampleAnimationFrames({ artifact, workerFactory, createRuntime, signal });
  if (!frames || signal?.aborted) return null;
  const built = buildAnimationScene(artifact, { labelTexture: plainLabel });
  if (!built.ok) return null;
  try { return subjectPoints(built.scene, frames); } finally { built.scene.dispose(); }
}

export async function fitAnimationView({ artifact, aspect, workerFactory, createRuntime, signal }) {
  const parsed = validateAnimationArtifact(artifact);
  if (!parsed.ok || !(Number.isFinite(aspect) && aspect > 0)) return null;
  const points = await animationSubject({ artifact, workerFactory, createRuntime, signal });
  return points && !signal?.aborted ? fitCameraToPoints(points, parsed.value.camera, aspect) : null;
}
