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
export function createThreeDRenderer(host, initial, onChange, onReady, onError) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#f4f5f7');
  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 10000);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); host.appendChild(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement); controls.enabled = false;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x667788, 2));
  const light = new THREE.DirectionalLight(0xffffff, 3); light.position.set(4, 6, 5); scene.add(light);
  let gltf, mixer, action, disposed = false, visible = true, frame = 0, last = 0, reported = 0, changing = false;
  let props = initial;
  const abort = new AbortController();
  const cameraState = () => ({ position: camera.position.toArray(), target: controls.target.toArray() });
  const persist = () => { if (!disposed && gltf) onChange({ camera: cameraState(), animationTime: action?.time || 0 }); };
  const running = () => !!(props.animation.autoplay && action || props.autoRotate);
  const schedule = () => { if (!disposed && visible && !document.hidden && !frame) frame = requestAnimationFrame(render); };
  function render(time) {
    frame = 0; if (disposed || !visible || document.hidden) return;
    const delta = last ? Math.min((time - last) / 1000, 0.1) : 0; last = time;
    changing = true; controls.autoRotate = props.autoRotate; controls.update(delta); changing = false;
    if (props.animation.autoplay && action) mixer.update(delta);
    renderer.render(scene, camera);
    if (running()) { if (time - reported > 500) { reported = time; persist(); } schedule(); }
  }
  const change = () => { if (!changing) { persist(); schedule(); } };
  controls.addEventListener('change', change); controls.addEventListener('end', persist);
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
    const data = await fetchGlb(initial.modelUrl, abort.signal);
    if (disposed) return;
    const manager = new THREE.LoadingManager();
    manager.setURLModifier(url => { if (!url.startsWith('blob:')) throw new Error('Only embedded GLB resources are supported'); return url; });
    gltf = await new GLTFLoader(manager).parseAsync(data, '');
    if (disposed) { disposeModel(gltf); return; }
    scene.add(gltf.scene); mixer = new THREE.AnimationMixer(gltf.scene);
    const bounds = new THREE.Box3().setFromObject(gltf.scene), center = bounds.getCenter(new THREE.Vector3());
    const radius = Math.max(bounds.getSize(new THREE.Vector3()).length() / 2, 0.1);
    camera.near = radius / 1000; camera.far = radius * 1000;
    controls.minDistance = radius / 100; controls.maxDistance = radius * 100;
    controls.target.copy(center); camera.position.copy(center).add(new THREE.Vector3(1, .7, 1.5).normalize().multiplyScalar(radius * 3));
    if (props.camera.target) controls.target.fromArray(props.camera.target);
    if (props.camera.position) camera.position.fromArray(props.camera.position);
    changing = true; controls.update(); changing = false; selectAnimation(); resize();
    onReady(gltf.animations.map(c => c.name)); persist(); schedule();
  })().catch(error => { if (!disposed) { disposeModel(gltf); onError(error.message || 'Could not load the 3D model'); } });
  return {
    interact(value) { controls.enabled = value; },
    update(next) {
      const prior = props; props = next;
      if (gltf) {
        changing = true;
        if (next.camera.position) camera.position.fromArray(next.camera.position);
        if (next.camera.target) controls.target.fromArray(next.camera.target);
        controls.update(); changing = false;
        if (prior.animation.clipName !== next.animation.clipName || Math.abs((next.animationTime || 0) - (action?.time || 0)) > .6) selectAnimation();
      }
      schedule();
    },
    destroy() {
      disposed = true; abort.abort(); cancelAnimationFrame(frame); resizeObserver.disconnect(); visibility.disconnect(); document.removeEventListener('visibilitychange', documentVisibility);
      controls.dispose(); mixer?.stopAllAction(); if (gltf) mixer?.uncacheRoot(gltf.scene); disposeModel(gltf);
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    },
  };
}
