// The trusted /animation viewer (plan section 5, AN-02): one WebGL renderer for one card, drawing a scene compiled by scene.js.
// Render on demand only (a frame, a camera move, a resize); the runtime's clock drives applyFrame, so there is no second loop.
// The card owns the shared viewer slot (viewer-slots.js claimViewer/activateViewer, as ModelCard.jsx does): it creates this
// renderer only while it holds a slot, disposes it when the slot is taken back, and shows capturePoster()'s still meanwhile.
//   createAnimationRenderer({ container, assetResolver?, onSelect(nodeId | null), onGesture({ type, node, value }), onCameraChange(camera), onLost? })
//     load(artifact, { signal, generation }) -> Promise<{ ok: true } | { ok: false, code: 'invalid_artifact' | 'aborted', issues? }>
//       The new scene replaces the shown one only when it compiled and is still the newest load (generation, signal, not disposed);
//       otherwise everything it allocated is freed and the shown scene stays.
//     applyFrame(frame) -> { ok, issues? }   an invalid frame changes nothing
//     setCamera({ position, target, fov? }), getCamera() -> camera | null, interact(on), capturePoster() -> WebP data URL | null, dispose()
//     setOptionalLabels(visible), hasOptionalLabels() -> boolean (after a load; false when every label is essential or there are none)
//   The bitmap follows the card's on-screen size (effectiveRatio below), so it stays sharp at any canvas zoom.
// Pointer: with interaction on, a click on a selectable node calls onSelect (empty space: null); a left drag on a draggable node
// emits drag_start/drag_move/drag_end along its declared local axis, clamped to its range, and suspends orbit for that drag. The
// node moves only when a frame says so (one transform authority: the runtime).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildAnimationScene, canvasLabelTexture } from './scene.js';

const CLICK_PIXELS = 4; // a press that moves less than this is a click, not a drag
// Neutral tone mapping keeps declared colours' hue and brightness (ACES shifts and darkens them); sRGB output.
const defaultRenderer = () => {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  return renderer;
};

// Sharpness (owner review 2026-10-31): the card sits on a zoomable canvas that CSS-scales it, so a backing bitmap of its layout size
// is stretched (blurred) when zoomed in. The bitmap follows the on-screen size instead: devicePixelRatio x the container's CSS
// scale (on-screen width / layout width), rounded up to `step` (a tiny zoom change does not reallocate), at least 1, at most `max`
// and never past `pixels` backing pixels in all. A CSS transform fires no resize, so it is re-checked every `checkMs` and before
// every draw.
export const PIXEL_RATIO = Object.freeze({ max: 3, step: 0.25, pixels: 3840 * 2160, checkMs: 250 });
export function effectiveRatio({ devicePixelRatio = 1, scale = 1, width, height }) {
  const wanted = Math.max(1, (devicePixelRatio || 1) * (Number.isFinite(scale) && scale > 0 ? scale : 1));
  return Math.min(PIXEL_RATIO.max, Math.sqrt(PIXEL_RATIO.pixels / (width * height)), Math.ceil(wanted / PIXEL_RATIO.step - 1e-6) * PIXEL_RATIO.step);
}

// ponytail: assetResolver is accepted for the post-MVP attached-source path (AN-09); MVP artifacts carry no sourceRefs, so it is unused.
export function createAnimationRenderer({
  container, assetResolver = null, onSelect = () => {}, onGesture = () => {}, onCameraChange = () => {}, onLost = () => {},
  createRenderer = defaultRenderer, labelTexture = canvasLabelTexture,
}) {
  void assetResolver;
  const view = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 2000);
  const renderer = createRenderer();
  const canvas = renderer.domElement;
  Object.assign(canvas.style, { display: 'block', width: '100%', height: '100%' }); // CSS size = the container; the bitmap is set by fit()
  container.appendChild(canvas);
  const controls = new OrbitControls(camera, canvas);
  controls.enabled = false;
  // Light for every scene: a soft studio environment (image-based, so physical materials show form and gentle highlights from every
  // side), a dim sky fill and one key light from above for shape. No shadows: they would need per-scene bounds tuning.
  view.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 0.5));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(4, 8, 5);
  view.add(sun);
  let environment = null;
  const light = () => { // again after a restored context: its render target's pixels are lost with the old one
    if (!renderer.isWebGLRenderer) return; // the Node stand-in has no GL
    const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment();
    environment?.dispose();
    environment = pmrem.fromScene(room, 0.04);
    view.environment = environment.texture;
    room.dispose();
    pmrem.dispose();
  };
  light();
  let shown = null, loads = 0, disposed = false, lost = false, frame = 0, drag = null, press = null, ratio = 0, size = '', optionalLabels = true;
  const raycaster = new THREE.Raycaster();

  // The bitmap for the container's layout size at its effective pixel ratio; true when that changed (the caller redraws).
  const fit = () => {
    const width = Math.max(1, container.clientWidth || 1), height = Math.max(1, container.clientHeight || 1);
    const box = container.getBoundingClientRect?.();
    const next = effectiveRatio({ devicePixelRatio: globalThis.devicePixelRatio, scale: box?.width ? box.width / width : 1, width, height });
    if (next === ratio && `${width}x${height}` === size) return false;
    ratio = next; size = `${width}x${height}`;
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    return true;
  };
  // Labels follow the view (scene.js layoutLabels), so they are sized for this viewport, pixel ratio and camera before every draw.
  const render = () => { fit(); shown?.layoutLabels({ width: container.clientWidth || 1, height: container.clientHeight || 1, camera, ratio }); renderer.render(view, camera); };
  const draw = () => { frame = 0; if (!disposed && !lost) render(); };
  const schedule = () => { if (!disposed && !lost && !frame) frame = globalThis.requestAnimationFrame ? requestAnimationFrame(draw) : (draw(), 0); };
  const cameraState = () => ({ position: camera.position.toArray(), target: controls.target.toArray(), fov: camera.fov });
  const resize = () => { fit(); schedule(); };
  const resizeObserver = globalThis.ResizeObserver ? new ResizeObserver(resize) : null;
  resizeObserver?.observe(container);
  resize();
  const zoomCheck = setInterval(() => { if (!disposed && !lost && fit()) schedule(); }, PIXEL_RATIO.checkMs);
  controls.addEventListener('change', schedule);
  controls.addEventListener('end', () => onCameraChange(cameraState()));
  const lose = event => { event.preventDefault(); lost = true; onLost(); };
  const restore = () => { lost = false; light(); schedule(); }; // three re-uploads geometry and textures on the restored context
  canvas.addEventListener('webglcontextlost', lose);
  canvas.addEventListener('webglcontextrestored', restore);

  // ---- pointer: select and constrained drag -------------------------------------------------------------------------------
  const pointerRay = event => {
    const box = canvas.getBoundingClientRect();
    view.updateMatrixWorld(); // a frame may have moved nodes since the last draw
    camera.updateMatrixWorld();
    raycaster.setFromCamera(new THREE.Vector2((event.clientX - box.left) / box.width * 2 - 1, -((event.clientY - box.top) / box.height) * 2 + 1), camera);
    return raycaster.ray;
  };
  const hitNode = event => {
    if (!shown) return null;
    pointerRay(event);
    return raycaster.intersectObjects(shown.pickables, true)[0]?.object.userData.nodeId ?? null;
  };
  // The drag value: where the pointer ray passes closest to the node's axis line, as a local coordinate in its parent, clamped.
  const axisValue = (event, state) => {
    const ray = pointerRay(event).clone().applyMatrix4(state.parentInverse);
    const axis = new THREE.Vector3().setComponent('xyz'.indexOf(state.drag.axis), 1);
    const w0 = state.origin.clone().sub(ray.origin), b = axis.dot(ray.direction), d = axis.dot(w0), e = ray.direction.dot(w0);
    const denominator = 1 - b * b; // both directions are unit length
    const along = denominator < 1e-6 ? 0 : (b * e - d) / denominator;
    const value = state.origin.getComponent('xyz'.indexOf(state.drag.axis)) + along;
    return Math.min(state.drag.max, Math.max(state.drag.min, value));
  };
  const down = event => {
    if (!controls.enabled || event.button !== 0) return;
    const id = hitNode(event), node = id && shown.nodes.get(id);
    press = { x: event.clientX, y: event.clientY, id };
    if (node?.drag) {
      const holder = shown.objects.get(id);
      holder.parent.updateWorldMatrix(true, false);
      drag = { id, drag: node.drag, origin: holder.position.clone(), parentInverse: holder.parent.matrixWorld.clone().invert(), started: false };
      controls.enabled = false; // the object drag wins over orbit for this gesture
      canvas.setPointerCapture?.(event.pointerId);
    }
  };
  const move = event => {
    if (!drag) return;
    if (!drag.started) {
      if (Math.hypot(event.clientX - press.x, event.clientY - press.y) < CLICK_PIXELS) return;
      drag.started = true;
      onGesture({ type: 'drag_start', node: drag.id, value: axisValue(event, drag) });
    }
    drag.last = axisValue(event, drag);
    onGesture({ type: 'drag_move', node: drag.id, value: drag.last });
  };
  // A cancelled gesture (pointercancel, or interaction turned off by Escape, blur, a hidden tab) is not a release: it carries no
  // usable pointer position, so a started drag ends where its last move put it (the object does not move) and nothing is selected.
  // Moves after it do nothing until a new pointerdown.
  const cancel = () => {
    if (drag) {
      if (drag.started) onGesture({ type: 'drag_end', node: drag.id, value: drag.last });
      controls.enabled = true;
    }
    drag = press = null;
  };
  const up = event => {
    if (drag) {
      if (drag.started) onGesture({ type: 'drag_end', node: drag.id, value: axisValue(event, drag) });
      controls.enabled = true;
    }
    const clicked = press && Math.hypot(event.clientX - press.x, event.clientY - press.y) < CLICK_PIXELS && !drag?.started;
    if (clicked) onSelect(press.id && shown?.nodes.get(press.id)?.selectable ? press.id : null);
    drag = press = null;
  };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', cancel);
  // Pointers held on the canvas, so turning interaction off (Escape, window blur, a hidden tab) ends OrbitControls' gesture too:
  // disabling it alone leaves its pointer tracked and a held drag orbits again once it is re-enabled (fast-e2e 41143743749).
  const held = new Set();
  const hold = event => held.add(event.pointerId), unhold = event => held.delete(event.pointerId);
  canvas.addEventListener('pointerdown', hold);
  canvas.addEventListener('pointerup', unhold);
  canvas.addEventListener('pointercancel', unhold);
  const cancelHeld = () => { for (const pointerId of [...held]) { held.delete(pointerId); try { if (globalThis.PointerEvent) canvas.dispatchEvent(new PointerEvent('pointercancel', { pointerId })); } catch { /* already released */ } } };

  function setCamera({ position, target, fov }) {
    camera.position.fromArray(position);
    controls.target.fromArray(target);
    if (fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    controls.update();
    schedule();
  }

  return {
    async load(artifact, { signal, generation } = {}) {
      const mine = ++loads;
      await null; // a load superseded or aborted before it starts allocates nothing
      const current = () => !disposed && mine === loads && !signal?.aborted;
      if (!current()) return { ok: false, code: 'aborted' };
      const built = buildAnimationScene(artifact, { labelTexture, ratio });
      if (!built.ok) return { ok: false, code: 'invalid_artifact', issues: built.issues };
      if (!current()) { built.scene.dispose(); return { ok: false, code: 'aborted' }; }
      shown?.dispose();
      shown = Object.assign(built.scene, { generation });
      shown.setOptionalLabels(optionalLabels);
      view.add(shown.root);
      setCamera(artifact.camera);
      return { ok: true };
    },
    applyFrame(next) {
      if (!shown) return { ok: false, issues: [{ path: '', code: 'not_declared', message: 'no scene is loaded' }] };
      const result = shown.apply(next);
      if (result.ok) schedule();
      return result;
    },
    setCamera,
    getCamera: () => (shown && !lost ? cameraState() : null),
    // The Labels toggle: object names on or off (scene.js keeps captions and live values); kept across frames and loads.
    setOptionalLabels(visible) { optionalLabels = !!visible; shown?.setOptionalLabels(optionalLabels); schedule(); },
    hasOptionalLabels: () => !!shown?.hasOptionalLabels(),
    // Off: end this renderer's own gesture first (cancel), then OrbitControls' held pointers (cancelHeld's synthetic pointercancel
    // then finds no drag to end).
    interact(on) { if (!on) { cancel(); cancelHeld(); } controls.enabled = !!on; },
    // Drawn and read in one task, so no preserveDrawingBuffer is needed. WebP 0.95 at the current pixel ratio: 0.8 visibly softened
    // label text; the poster lives only in the card's memory (session.js state), never stored or uploaded.
    capturePoster() {
      if (!shown || lost || disposed) return null;
      try { render(); return canvas.toDataURL('image/webp', 0.95); } catch { return null; }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (frame && globalThis.cancelAnimationFrame) cancelAnimationFrame(frame);
      clearInterval(zoomCheck);
      environment?.dispose();
      resizeObserver?.disconnect();
      for (const [type, handler] of [['webglcontextlost', lose], ['webglcontextrestored', restore], ['pointerdown', down], ['pointermove', move], ['pointerup', up], ['pointercancel', cancel], ['pointerdown', hold], ['pointerup', unhold], ['pointercancel', unhold]]) canvas.removeEventListener(type, handler);
      controls.dispose();
      shown?.dispose();
      shown = null;
      renderer.dispose();
      renderer.forceContextLoss?.();
      canvas.remove?.();
    },
  };
}
