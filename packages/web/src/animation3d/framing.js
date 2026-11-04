// The fitted view of an /animation scene (quality correction 2026-10-31: generated scenes showed a tiny subject in a mostly empty
// view, or a camera under a huge ceiling). The camera keeps the authored viewing direction and field of view and is moved to frame
// the subject as it moves at ONE set of parameter values (the defaults first: the default experience is the one made prominent),
// sampled by a short-lived runtime of its own (runtime.js over the same engine as the card, never the learner's runtime). The card
// fits again only when the learner changes a parameter and the bounds change substantially (session.js), never during playback or
// an action's motion, so the view never zooms continuously (owner 2026-11-01, aj_283c19f). That runtime is a background one: it
// runs only on a free engine and yields to any card that needs it (runtime.js), so a board of several cards frames each from the
// frame it shows instead.
//   fitAnimationView({ artifact, aspect, inputs?, frame?, workerFactory?, createRuntime?, signal? }) -> Promise<{ position, target, fov } | null>
//     inputs: the parameter values to frame (invalid or missing ones are the defaults). frame: the frame the card shows, the subject
//     when the sampler gets no frame of its own. null: aborted, an invalid artifact or nothing drawable; keep the authored camera.
//   animationSubject({ artifact, inputs?, frame?, workerFactory?, createRuntime?, signal? }) -> Promise<Vector3[] | null>   the sampled subject
//   fitCameraToPoints(points, camera, aspect) -> camera     that subject along one view's direction (the review page's two views)
//   sampleAnimationFrames(...) -> Promise<frame[] | null>,  subjectPoints(scene, frames) -> Vector3[] | null   (the two halves)
//   substantialRefit(current, next) -> boolean      whether a new fit differs enough from the shown one to move the camera
import * as THREE from 'three';
import { ANIMATION_CAPABILITIES } from './capabilities.js';
import { validateAnimationArtifact } from './contract.js';
import { createAnimationRuntime } from './runtime.js';
import { buildAnimationScene } from './scene.js';

// fill: the subject spans this share of the view's height or width (a 10% margin each side, room for a label plate beside an
// edge). sheet / dwarf: a backdrop is a flat mesh larger than sheet x, or any mesh larger than dwarf x, the rest of the scene.
// samples / budgetMs: the card waits for the fit before it first draws (session.js), so the sample is short. caption: a label anchor
// or an arrow counts only within this share of the subject's size beyond its box (aj_283c19f: result and hint text 20 m above a
// ground-level game framed the field into a thin strip under empty sky; aj_0b6ca2b5: arrows 3x the bowl framed the bowl small).
// refit: a new fit moves the camera only when its distance changes by more than this factor or its aim moves by more than this
// share of the distance (a small change keeps the view still). focus / near: when the scene's static parts span more than focus x
// what moves (aj_fac3ca4b: a 42 m floor and marks to 35 m around a 16 m flight), the subject is what moves at these inputs, what the
// inputs move, and the static parts within near x its size beyond it (FX-AN-025). budgetMs: 2000, since 90 steps of a stepped scene take
// about 1 s on the engine (aj_fac3ca4b: 320 ms per 30 steps, so a 1 s budget never saw the ball land).
// keep: every essential part (the whole subject: targets, play areas, reference marks; never a backdrop) stays inside this share of
// the view even when the focus is narrower (owner 2026-11-02: a 10° / 5 m/s shot cropped the target out of aj_fac3ca4b, and the grid
// robot's first move framed the robot without its target); the focus then fills as much of the view as that allows.
export const FRAMING = Object.freeze({ surfaceElevation: 25, fill: 0.8, keep: 0.96, samples: 12, budgetMs: 2000, ticks: 30, sheet: 1.25, dwarf: 3, caption: 0.25, focus: 2, near: 0.25, refit: Object.freeze({ distance: 1.2, aim: 0.15 }) });

const extent = box => { const size = box.getSize(new THREE.Vector3()); return Math.max(size.x, size.y, size.z); };

// The frames of the motion at the given inputs, in priority order (the sample cap and time budget cut from the end): the initial
// frame and a seekable loop at 1/4, 1/2, 3/4; each drag range end; the main (first) action, with the motion it starts (a stepped
// scene advanced three times after it); a stepped scene with no action advanced three times. Parameter extremes are not sampled: each set of
// values is fitted when the learner chooses it. With inputs other than the defaults, frames.reference is the initial frame at the
// defaults (taken last, outside the sample cap), so subjectPoints can tell what the inputs moved. Any refusal or error (no free
// engine included) falls back to the initial frame only (`frame` when the runtime never got ready); at the time budget the runtime
// is stopped and the frames already taken are kept; an abort answers null.
export async function sampleAnimationFrames({ artifact, inputs = undefined, frame = null, workerFactory, createRuntime = createAnimationRuntime, signal, now = () => performance.now() }) {
  const parsed = validateAnimationArtifact(artifact);
  if (!parsed.ok) return null;
  const { actions, timeline, behavior, stepped, scene, parameters } = parsed.value;
  const frames = [], deadline = now() + FRAMING.budgetMs;
  let latest = null, late = false;
  const runtime = createRuntime({ artifact, workerFactory, background: true, ...(inputs ? { inputs } : {}), onFrame: next => { latest = next; } });
  signal?.addEventListener('abort', () => runtime.dispose(), { once: true }); // a closed card stops the sample at once (its Worker too)
  const timer = setTimeout(() => { late = true; runtime.dispose(); }, FRAMING.budgetMs); // a slow boot or call never holds the card
  const fallback = kept => (kept.length || !frame ? kept : [frame]);
  const room = () => frames.length < FRAMING.samples && now() < deadline && !signal?.aborted;
  const accept = async pending => { const result = await pending; if (!result.accepted) throw new Error(result.reason); };
  const send = event => accept(runtime.dispatch(event));
  const capture = async step => { if (room()) { await step(); frames.push(latest); } };
  const times = timeline && ANIMATION_CAPABILITIES.seekBehaviors.includes(behavior) ? [0.25, 0.5, 0.75].map(f => f * timeline.duration) : [];
  const loop = async () => {
    if (!times.length || !room()) return;
    for (const time of times) await capture(() => accept(runtime.seek(time)));
    await accept(runtime.seek(0));
  };
  const motion = async () => { if (stepped) for (let i = 0; i < 3; i += 1) await capture(() => accept(runtime.advance(FRAMING.ticks))); };
  try {
    await runtime.ready;
    frames.push(latest);
    await loop();
    for (const node of scene.nodes.filter(item => item.drag)) {
      for (const value of [node.drag.min, node.drag.max]) await capture(async () => { await send({ type: 'drag_start', node: node.id, value }); await send({ type: 'drag_end', node: node.id, value }); });
    }
    // The main action (the first declared) and the motion it starts; the other actions rearrange the scene (a new target, a reset),
    // a change of state like a parameter, not the motion to keep in view (aj_fac3ca4b: New Target moved the target across the field).
    if (actions.length) { await capture(() => send({ type: 'action', action: actions[0].id })); await motion(); }
    else await motion();
    const moved = parameters.filter(p => inputs && Object.hasOwn(inputs, p.id) && inputs[p.id] !== p.default);
    if (moved.length && now() < deadline && !signal?.aborted) {
      await accept(runtime.reset()); // the defaults and the initial state
      frames.reference = latest;
    }
  } catch {
    if (!signal?.aborted) return fallback(late ? frames : frames.slice(0, 1));
  } finally {
    clearTimeout(timer);
    runtime.dispose();
  }
  return signal?.aborted ? null : fallback(frames);
}

// The subject over every frame (applied in order to `scene`, a scene.js build the caller owns; with no frames, the authored scene),
// as world points: each shown mesh or line's own (oriented) box corners in every frame, so a part turning about a diagonal never
// counts its axis-aligned box's empty corners. Never a label plate (constant screen size, no world size), but a label's anchor
// point near the subject (FRAMING.caption), so a caption beside it stays in view; one floating far off never widens the view.
// Backdrops (a floor, ceiling or wall: a flat mesh larger than sheet x the rest of the scene; anything larger than dwarf x it, by swept
// box) are context, not subject, and so are the labels on them. Focus: a node moved when its box differs between the frames, or from
// frames.reference (the defaults: the inputs moved it); when the static parts span more than FRAMING.focus x what moved (expanded by
// FRAMING.near), the subject is what moved plus the static parts inside that expanded box, so the default action is what fills the
// view, not a field laid out for every setting. points.keep: the whole subject (with its nearby label anchors), which the fit keeps
// on screen (FRAMING.keep) whatever the focus. -> Vector3[] (with .keep) | null
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
  const boxes = new Map(); // id -> the box in each frame (null: hidden), to tell what moved
  const arrows = new Set(); // the arrow nodes (scene.js marks their drawable)
  const measure = (record = true) => {
    scene.root.updateWorldMatrix(true, true);
    const seen = new Map();
    for (const [id, holder] of scene.objects) {
      const drawable = drawableOf(holder);
      if (!drawable || !shown(drawable) || drawable.userData.empty) continue; // an empty trail has nothing to frame
      if (drawable.isSprite) { if (record) anchors.push({ id, point: drawable.getWorldPosition(new THREE.Vector3()) }); continue; }
      const corners = cornersOf(drawable);
      // A trail above the height a clamp holds the marker to is the diverged path (FX-AN-074): it is drawn where the program put it but the fit follows the clamped marker.
      const ceiling = drawable.userData.trail ? scene.clampCeiling?.() : null;
      if (ceiling != null) for (const corner of corners) corner.y = Math.min(corner.y, ceiling);
      seen.set(id, new THREE.Box3().setFromPoints(corners));
      if (!record) continue;
      if (!swept.has(id)) { swept.set(id, { box: new THREE.Box3(), points: [] }); if (drawable.isMesh && flat(drawable)) sheets.add(id); if (drawable.userData.arrow) arrows.add(id); }
      const node = swept.get(id);
      for (const corner of corners) { node.box.expandByPoint(corner); node.points.push(corner); }
    }
    return seen;
  };
  const shots = frames.length ? frames.map(frame => { scene.apply(frame); return measure(); }) : [measure()];
  const reference = frames.reference ? (scene.apply(frames.reference), measure(false)) : null;

  const ids = [...swept.keys()].filter(id => !swept.get(id).box.isEmpty());
  const context = new Set(ids.filter(id => {
    const rest = new THREE.Box3();
    for (const other of ids) if (other !== id) rest.union(swept.get(other).box);
    if (rest.isEmpty()) return false;
    const mine = extent(swept.get(id).box), theirs = extent(rest);
    return mine > FRAMING.dwarf * theirs || (sheets.has(id) && mine > FRAMING.sheet * theirs);
  }));
  const onContext = id => { for (let node = scene.nodes.get(id); node; node = scene.nodes.get(node.parent)) if (context.has(node.id)) return true; return false; };
  const same = (a, b) => (!a && !b) || (!!a && !!b && a.min.distanceTo(b.min) + a.max.distanceTo(b.max) < 1e-6 * (1 + extent(a)));
  const boxOf = list => list.reduce((box, id) => box.union(swept.get(id).box), new THREE.Box3());
  // An arrow is an annotation drawn proportional to its quantity, with no cap, so at a high rate it dwarfs the object it points from.
  // It is subject only within FRAMING.caption of what is not an arrow (a compass, an aim arrow: the view keeps them); one reaching
  // farther is not (aj_0b6ca2b5: arrows 3x the bowl at learning rate 1 left the bowl a small part of the view) and may run past the
  // edge. With nothing but arrows drawn they are the subject. ponytail: a tiny object with a long arrow is framed as the object.
  const solid = ids.filter(id => !context.has(id) && !arrows.has(id)), reach = solid.length ? boxOf(solid) : null;
  reach?.expandByScalar(FRAMING.caption * extent(reach));
  const subject = ids.filter(id => !context.has(id) && (!reach || !arrows.has(id) || reach.containsBox(swept.get(id).box)));
  const moved = new Set(subject.filter(id => shots.some(shot => !same(shot.get(id), shots[0].get(id))) || (reference && !same(reference.get(id), shots[0].get(id)))));
  let kept = subject;
  if (moved.size && moved.size < subject.length) {
    const focus = boxOf([...moved]), span = extent(focus);
    focus.expandByScalar(FRAMING.near * span);
    if (extent(boxOf(subject)) > FRAMING.focus * span) kept = subject.filter(id => moved.has(id) || focus.containsBox(swept.get(id).box));
  }
  const withAnchors = list => {
    const meshPoints = list.flatMap(id => swept.get(id).points);
    const near = meshPoints.length ? new THREE.Box3().setFromPoints(meshPoints) : null;
    if (near) near.expandByScalar(FRAMING.caption * extent(near));
    return [...meshPoints, ...anchors.filter(({ id, point }) => !onContext(id) && (!near || near.containsPoint(point))).map(({ point }) => point)];
  };
  const points = withAnchors(kept);
  if (!points.length || !(extent(new THREE.Box3().setFromPoints(points)) > 0)) return null;
  points.keep = kept === subject ? points : withAnchors(subject);
  points.surface = scene.hasSurface?.() === true; // a scene with a surface is never viewed from lower than FRAMING.surfaceElevation (raiseElevation)
  return points;
}

// FX-AN-097 (Gate 2 on C6 and C4: an authored camera at 15 to 25 degrees hid the trail and collapsed the zig-zag behind the bowl): the camera lifted to at least `degrees` above the
// horizon by rotating its position about the target: the azimuth, the distance, the target and the fov are kept. One already at or above it is returned as it is.
export function raiseElevation(camera, degrees) {
  const { position, target } = camera, offset = position.map((value, axis) => value - target[axis]), length = Math.hypot(...offset), flat = Math.hypot(offset[0], offset[2]);
  const minimum = degrees * Math.PI / 180;
  if (!(length > 0) || Math.atan2(offset[1], flat) >= minimum) return camera;
  const [x, z] = flat > 1e-9 ? [offset[0] / flat, offset[2] / flat] : [0, 1]; // straight above or below has no azimuth: look from +z
  const raised = [x * length * Math.cos(minimum), length * Math.sin(minimum), z * length * Math.cos(minimum)];
  return { ...camera, position: raised.map((value, axis) => target[axis] + value) };
}

// The camera on the authored direction (position - target) that frames every point at FRAMING.fill of both the vertical and the
// horizontal field of view, never inside their bounding sphere, and every points.keep point inside FRAMING.keep of it: aimed along
// the line from the points' box center to the keep box center where that needs the shortest distance (11 steps).
export function fitCameraToPoints(points, camera, aspect) {
  const { position, target, fov = 50 } = points.surface ? raiseElevation(camera, FRAMING.surfaceElevation) : camera;
  const back = new THREE.Vector3().fromArray(position).sub(new THREE.Vector3().fromArray(target));
  if (back.lengthSq() === 0) back.set(0, 0, 1);
  const right = new THREE.Vector3(), up = new THREE.Vector3(), toward = new THREE.Vector3(), offset = new THREE.Vector3();
  new THREE.Matrix4().lookAt(back, new THREE.Vector3(), THREE.Object3D.DEFAULT_UP).extractBasis(right, up, toward); // the camera's own axes
  const half = Math.tan(fov * Math.PI / 360);
  const distanceFor = (list, center, fill) => {
    const tanY = half * fill, tanX = tanY * aspect;
    let distance = 0;
    for (const point of list) {
      offset.subVectors(point, center);
      const depth = offset.dot(toward); // toward the camera: a nearer point needs more room
      distance = Math.max(distance, offset.length(), depth + Math.abs(offset.dot(right)) / tanX, depth + Math.abs(offset.dot(up)) / tanY);
    }
    return distance;
  };
  const focus = new THREE.Box3().setFromPoints(points).getCenter(new THREE.Vector3());
  const keep = points.keep && points.keep !== points ? points.keep : null;
  let best = { center: focus, distance: distanceFor(points, focus, FRAMING.fill) };
  if (keep) {
    const whole = new THREE.Box3().setFromPoints(keep).getCenter(new THREE.Vector3());
    best = null;
    for (let i = 0; i <= 10; i += 1) {
      const center = focus.clone().lerp(whole, i / 10);
      const distance = Math.max(distanceFor(points, center, FRAMING.fill), distanceFor(keep, center, FRAMING.keep));
      if (!best || distance < best.distance - 1e-9) best = { center, distance };
    }
  }
  // ponytail: no far-plane check (renderer.js far = 2000); a subject that large keeps whatever the far plane clips.
  return { position: best.center.clone().addScaledVector(toward, best.distance).toArray(), target: best.center.toArray(), fov };
}

const plainLabel = () => ({ texture: new THREE.Texture(), aspect: 1 }); // a measuring scene is never drawn

export async function animationSubject({ artifact, inputs, frame, workerFactory, createRuntime, signal }) {
  const frames = await sampleAnimationFrames({ artifact, inputs, frame, workerFactory, createRuntime, signal });
  if (!frames || signal?.aborted) return null;
  const built = buildAnimationScene(artifact, { labelTexture: plainLabel });
  if (!built.ok) return null;
  try { return subjectPoints(built.scene, frames); } finally { built.scene.dispose(); }
}

export async function fitAnimationView({ artifact, aspect, inputs, frame, workerFactory, createRuntime, signal }) {
  const parsed = validateAnimationArtifact(artifact);
  if (!parsed.ok || !(Number.isFinite(aspect) && aspect > 0)) return null;
  const points = await animationSubject({ artifact, inputs, frame, workerFactory, createRuntime, signal });
  return points && !signal?.aborted ? fitCameraToPoints(points, parsed.value.camera, aspect) : null;
}

export function substantialRefit(current, next) {
  if (!next) return false;
  if (!current) return true;
  const [a, b] = [current, next].map(c => ({ target: new THREE.Vector3().fromArray(c.target), distance: new THREE.Vector3().fromArray(c.position).distanceTo(new THREE.Vector3().fromArray(c.target)) }));
  const ratio = b.distance / a.distance;
  return ratio > FRAMING.refit.distance || ratio < 1 / FRAMING.refit.distance || a.target.distanceTo(b.target) > FRAMING.refit.aim * a.distance;
}
