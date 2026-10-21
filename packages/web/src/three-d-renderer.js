import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { fetchGlb } from './three-d-asset.js';

export function disposeModel(gltf) {
  const disposed = new Set();
  const release = item => { if (!item || disposed.has(item)) return; disposed.add(item); item.dispose?.(); };
  for (const scene of gltf?.scenes || []) scene.traverse(object => {
    release(object.geometry); release(object.skeleton);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material) continue;
      for (const value of Object.values(material)) if (value?.isTexture) {
        for (const image of Array.isArray(value.source?.data) ? value.source.data : [value.source?.data]) if (image?.close && !disposed.has(image)) { disposed.add(image); image.close(); }
        release(value);
      }
      release(material);
    }
  });
}

// One demand-driven frame scheduler per mounted viewer; no loop for a static model.
// `options.load` (an imported model: model-loaders.js) replaces the GLB download of `initial.modelUrl`: it gets
// { renderer, scene } and resolves { object, animations, kind, dispose }. `options.onLost` hears a lost WebGL context;
// after it nothing more is persisted, so the saved card keeps its last good camera.
// `options.background`: the scene colour, or null for none (the page behind the canvas shows through); omitted, the
// imported-model viewer's grey.
export function createThreeDRenderer(host, initial, onChange, onReady, onError, options = {}) {
  const scene = new THREE.Scene();
  const paint = value => { scene.background = value === null ? null : new THREE.Color(value ?? '#f4f5f7'); };
  paint(options.background);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 10000);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); host.appendChild(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement); controls.enabled = false;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x667788, 2));
  const light = new THREE.DirectionalLight(0xffffff, 3); light.position.set(4, 6, 5); scene.add(light);
  let gltf, mixer, action, disposed = false, visible = true, frame = 0, last = 0, reported = 0, changing = false, lost = false, loaded = null, settleUntil = 0, fitView = null;
  let props = initial;
  const abort = new AbortController();
  const cameraState = () => ({ position: camera.position.toArray(), target: controls.target.toArray() });
  const finite = () => [...camera.position.toArray(), ...controls.target.toArray()].every(Number.isFinite);
  const persist = () => { if (!disposed && !lost && gltf && finite()) onChange({ camera: cameraState(), animationTime: action?.time || 0 }); };
  // A splat re-sorts in Spark's worker after a camera move, so it draws for a short settle window, then stops.
  const running = () => !!(props.animation.autoplay && action || props.autoRotate || performance.now() < settleUntil);
  const schedule = () => { if (!disposed && !lost && visible && !document.hidden && !frame) frame = requestAnimationFrame(render); };
  const settle = () => { if (loaded?.kind === 'splat') settleUntil = performance.now() + 1500; };
  const lose = event => { event.preventDefault(); lost = true; cancelAnimationFrame(frame); frame = 0; options.onLost?.(); };
  renderer.domElement.addEventListener('webglcontextlost', lose);
  function render(time) {
    frame = 0; if (disposed || lost || !visible || document.hidden) return;
    const delta = last ? Math.min((time - last) / 1000, 0.1) : 0; last = time;
    changing = true; controls.autoRotate = props.autoRotate; controls.update(delta); changing = false;
    if (props.animation.autoplay && action) mixer.update(delta);
    renderer.render(scene, camera); options.onFrame?.();
    if (running()) { if (time - reported > 500) { reported = time; persist(); } schedule(); }
  }
  const change = () => { if (!changing) { settle(); if (!options.load) persist(); schedule(); } };
  // An imported model's camera is saved when its interaction ends (the card reads camera()), not on every drag.
  controls.addEventListener('change', change); if (!options.load) controls.addEventListener('end', persist);
  const resize = () => { const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight); renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); schedule(); };
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(host);
  const visibility = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; last = 0; if (visible) schedule(); else { cancelAnimationFrame(frame); frame = 0; persist(); } }); visibility.observe(host);
  const documentVisibility = () => { last = 0; if (document.hidden) { cancelAnimationFrame(frame); frame = 0; persist(); } else schedule(); };
  document.addEventListener('visibilitychange', documentVisibility);
  const selectAnimation = () => {
    if (!gltf) return;
    const clip = gltf.animations.find(c => c.name === props.animation.clipName) || gltf.animations[0];
    if (action?.getClip() !== clip) { action?.stop(); action = clip ? mixer.clipAction(clip) : null; action?.play(); }
    if (action) { action.time = Math.max(0, props.animationTime || 0) % (clip.duration || 1); mixer.update(0); }
  };
  (async () => {
    if (options.load) {
      loaded = await options.load({ renderer, scene });
      if (disposed) { if (loaded.kind !== 'splat') disposeModel({ scenes: [loaded.object] }); loaded.dispose?.(); return; }
      gltf = { scene: loaded.object, scenes: [loaded.object], animations: loaded.animations || [] };
    } else {
      const data = await fetchGlb(initial.modelUrl, abort.signal);
      if (disposed) return;
      const manager = new THREE.LoadingManager();
      manager.setURLModifier(url => { if (!url.startsWith('blob:')) throw new Error('Only embedded GLB resources are supported'); return url; });
      gltf = await new GLTFLoader(manager).parseAsync(data, '');
      if (disposed) { disposeModel(gltf); return; }
    }
    scene.add(gltf.scene); mixer = new THREE.AnimationMixer(gltf.scene);
    const bounds = loaded?.kind === 'splat' && gltf.scene.getBoundingBox ? gltf.scene.getBoundingBox(true) : new THREE.Box3().setFromObject(gltf.scene);
    if (bounds.isEmpty()) bounds.set(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
    const center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    const radius = Math.max(size.length() / 2, options.load ? 1e-3 : 0.1);
    camera.near = radius / 1000; camera.far = radius * 1000; camera.updateProjectionMatrix();
    controls.minDistance = radius / 100; controls.maxDistance = radius * 100;
    fitView = () => { controls.target.copy(center); camera.position.copy(center).add(new THREE.Vector3(1, .7, 1.5).normalize().multiplyScalar(radius * 3)); };
    fitView();
    if (props.camera.target) controls.target.fromArray(props.camera.target);
    if (props.camera.position) camera.position.fromArray(props.camera.position);
    changing = true; controls.update(); changing = false; selectAnimation(); settle(); resize();
    onReady(gltf.animations.map(c => c.name), { size: size.toArray(), kind: loaded?.kind || 'mesh' }); if (!options.load) persist(); schedule();
  })().catch(error => { if (!disposed) { if (loaded?.kind !== 'splat') disposeModel(gltf); loaded?.dispose?.(); onError(error.message || 'Could not load the 3D model'); } });
  return {
    interact(value) { controls.enabled = value; },
    background(value) { paint(value); schedule(); },
    // Back to the framing the model opened with.
    fit() { if (!fitView) return; changing = true; fitView(); controls.update(); changing = false; settle(); schedule(); },
    // Model-space points -> CSS pixels in the host, for labels drawn over the view (CAD Show dimensions, options.onFrame).
    project(points) { const w = host.clientWidth, h = host.clientHeight; return points.map(point => { const v = new THREE.Vector3(...point).project(camera); return { x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h, visible: v.z > -1 && v.z < 1 }; }); },
    redraw() { schedule(); },
    camera() { return gltf && !lost && finite() ? cameraState() : null; },
    // A still of the current view (a WebP data URL) for the card's poster: drawn and read in one task, so no
    // preserveDrawingBuffer is needed.
    poster() { if (!gltf || lost || disposed) return null; try { renderer.render(scene, camera); return renderer.domElement.toDataURL('image/webp', 0.8); } catch { return null; } },
    update(next) {
      const prior = props; props = next;
      if (gltf) {
        changing = true;
        if (next.camera.position) camera.position.fromArray(next.camera.position);
        if (next.camera.target) controls.target.fromArray(next.camera.target);
        controls.update(); changing = false;
        if (prior.animation.clipName !== next.animation.clipName || (next.animationTime != null && Math.abs(next.animationTime - (action?.time || 0)) > .6)) selectAnimation();
      }
      schedule();
    },
    destroy() {
      disposed = true; abort.abort(); cancelAnimationFrame(frame); resizeObserver.disconnect(); visibility.disconnect(); document.removeEventListener('visibilitychange', documentVisibility);
      renderer.domElement.removeEventListener('webglcontextlost', lose);
      controls.dispose(); mixer?.stopAllAction(); if (gltf) mixer?.uncacheRoot(gltf.scene);
      if (loaded?.kind === 'splat') scene.remove(gltf?.scene); else disposeModel(gltf);
      loaded?.dispose?.();
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    },
  };
}
