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
// Pointer: with interaction on, a click on a selectable node calls onSelect (empty space: null); a left drag on a draggable node
// emits drag_start/drag_move/drag_end along its declared local axis, clamped to its range, and suspends orbit for that drag. The
// node moves only when a frame says so (one transform authority: the runtime).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildAnimationScene, canvasLabelTexture } from './scene.js';

const CLICK_PIXELS = 4; // a press that moves less than this is a click, not a drag
const defaultRenderer = () => {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
  return renderer;
};

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
  container.appendChild(canvas);
  const controls = new OrbitControls(camera, canvas);
  controls.enabled = false;
  view.add(new THREE.HemisphereLight(0xffffff, 0x667788, 2));
  const sun = new THREE.DirectionalLight(0xffffff, 2.5);
  sun.position.set(4, 8, 5);
  view.add(sun);
  let shown = null, loads = 0, disposed = false, lost = false, frame = 0, drag = null, press = null;
  const raycaster = new THREE.Raycaster();

  // Labels keep a constant screen size (scene.js layoutLabels), so they are sized for this viewport and camera before every draw.
  const render = () => { shown?.layoutLabels({ height: container.clientHeight || 1, fov: camera.fov }); renderer.render(view, camera); };
  const draw = () => { frame = 0; if (!disposed && !lost) render(); };
  const schedule = () => { if (!disposed && !lost && !frame) frame = globalThis.requestAnimationFrame ? requestAnimationFrame(draw) : (draw(), 0); };
  const cameraState = () => ({ position: camera.position.toArray(), target: controls.target.toArray(), fov: camera.fov });
  const resize = () => {
    const width = Math.max(1, container.clientWidth || 1), height = Math.max(1, container.clientHeight || 1);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    schedule();
  };
  const resizeObserver = globalThis.ResizeObserver ? new ResizeObserver(resize) : null;
  resizeObserver?.observe(container);
  resize();
  controls.addEventListener('change', schedule);
  controls.addEventListener('end', () => onCameraChange(cameraState()));
  const lose = event => { event.preventDefault(); lost = true; onLost(); };
  const restore = () => { lost = false; schedule(); }; // three re-uploads geometry and textures on the restored context
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
    onGesture({ type: 'drag_move', node: drag.id, value: axisValue(event, drag) });
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
  canvas.addEventListener('pointercancel', up);

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
      const built = buildAnimationScene(artifact, { labelTexture });
      if (!built.ok) return { ok: false, code: 'invalid_artifact', issues: built.issues };
      if (!current()) { built.scene.dispose(); return { ok: false, code: 'aborted' }; }
      shown?.dispose();
      shown = Object.assign(built.scene, { generation });
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
    interact(on) { controls.enabled = !!on; if (!on) { drag = press = null; } },
    // Drawn and read in one task, so no preserveDrawingBuffer is needed.
    capturePoster() {
      if (!shown || lost || disposed) return null;
      try { render(); return canvas.toDataURL('image/webp', 0.8); } catch { return null; }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (frame && globalThis.cancelAnimationFrame) cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      for (const [type, handler] of [['webglcontextlost', lose], ['webglcontextrestored', restore], ['pointerdown', down], ['pointermove', move], ['pointerup', up], ['pointercancel', up]]) canvas.removeEventListener(type, handler);
      controls.dispose();
      shown?.dispose();
      shown = null;
      renderer.dispose();
      renderer.forceContextLoss?.();
      canvas.remove?.();
    },
  };
}
