import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { experimentFixture, watchFixture } from './fixtures.js';
import { createAnimationRenderer } from './renderer.js';

// The renderer's bookkeeping with a stand-in WebGL renderer and canvas (no GPU in Node): load ordering, abort, frames, the
// constrained drag math and disposal. Real WebGL drawing, context loss and posters are covered by the CI browser check.
// cancelHeld() dispatches a synthetic PointerEvent('pointercancel', { pointerId }) with no coordinates, as a browser does. Node has none.
globalThis.PointerEvent ??= class PointerEvent { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } };

function harness(options = {}) {
  const docListeners = new Map();
  const doc = {
    addEventListener(type, handler) { docListeners.set(type, [...(docListeners.get(type) ?? []), handler]); },
    removeEventListener(type, handler) { docListeners.set(type, (docListeners.get(type) ?? []).filter(item => item !== handler)); },
  };
  const listeners = new Map();
  const canvas = {
    style: {}, ownerDocument: doc, getRootNode: () => doc,
    addEventListener(type, handler) { listeners.set(`${type}`, [...(listeners.get(type) ?? []), handler]); },
    removeEventListener(type, handler) { listeners.set(type, (listeners.get(type) ?? []).filter(item => item !== handler)); },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 300 }),
    toDataURL: () => 'data:image/webp;base64,AAAA', setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture: () => false,
    remove() { canvas.removed = true; },
    dispatchEvent(event) { (listeners.get(event.type) ?? []).forEach(handler => handler(event)); return true; },
  };
  const gl = { domElement: canvas, renders: 0, render() { gl.renders += 1; }, setSize() {}, dispose() { gl.disposed = true; }, forceContextLoss() {} };
  const events = { select: [], gesture: [] };
  const renderer = createAnimationRenderer({
    container: { clientWidth: 400, clientHeight: 300, appendChild() {} }, createRenderer: () => gl,
    labelTexture: text => ({ texture: new THREE.Texture(), aspect: text.length / 2 }),
    onSelect: id => events.select.push(id), onGesture: gesture => events.gesture.push(gesture), ...options,
  });
  const pointer = event => ({ button: 0, pointerId: 1, pointerType: 'mouse', preventDefault() {}, ...event });
  const fire = (type, event) => (listeners.get(type) ?? []).forEach(handler => handler(pointer(event)));
  const fireDocument = (type, event) => (docListeners.get(type) ?? []).forEach(handler => handler(pointer(event))); // OrbitControls tracks moves here
  return { renderer, gl, canvas, listeners, events, fire, fireDocument };
}

test('load shows the scene at its camera; frames redraw; an invalid frame or artifact changes nothing', async () => {
  const { renderer, gl } = harness();
  assert.deepEqual(await renderer.load(watchFixture.artifact, { generation: 1 }), { ok: true });
  assert.deepEqual(renderer.getCamera(), { position: [0, 6, 8], target: [0, 0, 0], fov: 50 });
  const before = gl.renders;
  assert.equal(renderer.applyFrame({ nodes: { moon: { position: [0, 0, 3] } } }).ok, true);
  assert.ok(gl.renders > before);
  assert.equal(renderer.applyFrame({ nodes: { ghost: {} } }).ok, false);
  const bad = await renderer.load({ ...watchFixture.artifact, behavior: 'physics' }, { generation: 2 });
  assert.equal(bad.code, 'invalid_artifact');
  assert.equal(renderer.applyFrame({ nodes: { moon: { visible: false } } }).ok, true, 'the shown scene stays after a failed load');
  assert.equal(renderer.capturePoster(), 'data:image/webp;base64,AAAA');
  renderer.dispose();
});

test('a superseded or aborted load allocates nothing and never replaces the newer scene', async () => {
  const { renderer } = harness();
  const first = renderer.load(watchFixture.artifact, { generation: 1 });
  const second = renderer.load(experimentFixture.artifact, { generation: 2 });
  assert.equal((await first).code, 'aborted');
  assert.equal((await second).ok, true);
  assert.equal(renderer.applyFrame({ nodes: { beam: { visible: true } } }).ok, true, 'the experiment is shown');
  const controller = new AbortController();
  const aborted = renderer.load(watchFixture.artifact, { signal: controller.signal, generation: 3 });
  controller.abort();
  assert.equal((await aborted).code, 'aborted');
  assert.equal(renderer.applyFrame({ nodes: { moon: { visible: true } } }).ok, false, 'still the experiment');
  renderer.dispose();
});

test('a drag on a draggable node follows its local axis, clamped, and a click selects', async () => {
  const draggable = structuredClone(experimentFixture.artifact);
  Object.assign(draggable.scene.nodes[2], { selectable: true, drag: { axis: 'x', min: -3, max: -0.5 } });
  const { renderer, events, fire } = harness();
  await renderer.load(draggable, {});
  renderer.interact(true);
  const camera = new THREE.PerspectiveCamera(50, 400 / 300, 0.05, 2000);
  camera.position.set(0, 2, 7);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const screen = point => { const v = new THREE.Vector3(...point).project(camera); return { clientX: (v.x + 1) / 2 * 400, clientY: (1 - v.y) / 2 * 300 }; };
  const weight = [-1.5, 0.3, 0]; // beam at y 0.05, weight 0.25 above it
  fire('pointerdown', screen(weight));
  fire('pointerup', screen(weight));
  assert.deepEqual(events.select, ['leftWeight']);
  fire('pointerdown', screen(weight));
  fire('pointermove', screen([-2.5, 0.3, 0]));
  fire('pointermove', screen([-9, 0.3, 0]));
  fire('pointerup', screen([-9, 0.3, 0]));
  assert.deepEqual(events.gesture.map(gesture => gesture.type), ['drag_start', 'drag_move', 'drag_move', 'drag_end']);
  assert.ok(Math.abs(events.gesture[1].value + 2.5) < 1e-6, `drag value ${events.gesture[1].value}`);
  assert.equal(events.gesture[3].value, -3, 'clamped to the declared range');
  fire('pointerdown', { clientX: 5, clientY: 5 });
  fire('pointerup', { clientX: 5, clientY: 5 });
  assert.equal(events.select.at(-1), null, 'a click on empty space clears the selection');
  renderer.dispose();
});

test('dispose releases the renderer, its listeners and the canvas', async () => {
  const { renderer, gl, canvas, listeners } = harness();
  await renderer.load(watchFixture.artifact, {});
  renderer.dispose();
  assert.equal(gl.disposed, true);
  assert.equal(canvas.removed, true);
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'webglcontextlost']) assert.equal((listeners.get(type) ?? []).length, 0, type);
  assert.equal(renderer.capturePoster(), null);
  assert.equal((await renderer.load(watchFixture.artifact, {})).code, 'aborted');
});

// The draggable left weight of the experiment and where points of the scene land on the 400 x 300 canvas.
async function dragScene() {
  const draggable = structuredClone(experimentFixture.artifact);
  Object.assign(draggable.scene.nodes[2], { selectable: true, drag: { axis: 'x', min: -3, max: -0.5 } });
  const h = harness();
  await h.renderer.load(draggable, {});
  h.renderer.interact(true);
  const camera = new THREE.PerspectiveCamera(50, 400 / 300, 0.05, 2000);
  camera.position.set(0, 2, 7);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const screen = point => { const v = new THREE.Vector3(...point).project(camera); return { clientX: (v.x + 1) / 2 * 400, clientY: (1 - v.y) / 2 * 300 }; };
  h.fire('pointerdown', screen([-1.5, 0.3, 0]));
  h.fire('pointermove', screen([-2.5, 0.3, 0]));
  return { ...h, screen };
}

test('a cancelled object drag ends at its last accepted position, selects nothing, and later moves do nothing', async () => {
  // Escape and Exit turn interaction off; blur and a hidden tab release held gestures (session.js releaseGestures: off, then on again).
  const cancels = {
    'interact(false)': h => h.renderer.interact(false),
    'release then resume': h => { h.renderer.interact(false); h.renderer.interact(true); },
    'pointercancel': h => h.fire('pointercancel', {}), // no coordinates, as a real cancel may carry none usable
  };
  for (const [name, cancel] of Object.entries(cancels)) {
    const h = await dragScene();
    cancel(h);
    const ends = h.events.gesture.filter(gesture => gesture.type === 'drag_end');
    assert.equal(ends.length, 1, `${name}: one drag_end`);
    assert.ok(Math.abs(ends[0].value + 2.5) < 1e-6, `${name}: ends at the last move, not at a synthetic point (${ends[0].value})`);
    assert.deepEqual(h.events.select, [], `${name}: nothing selected`);
    const count = h.events.gesture.length;
    h.fire('pointermove', h.screen([-2, 0.3, 0]));
    h.fire('pointerup', h.screen([-2, 0.3, 0]));
    assert.equal(h.events.gesture.length, count, `${name}: moves and a release after the cancel do nothing`);
    assert.deepEqual(h.events.select, [], `${name}: still nothing selected`);
    h.renderer.dispose();
  }
});

test('a normal release still commits the final drag position', async () => {
  const h = await dragScene();
  h.fire('pointermove', h.screen([-2, 0.3, 0]));
  h.fire('pointerup', h.screen([-2, 0.3, 0]));
  const end = h.events.gesture.at(-1);
  assert.equal(end.type, 'drag_end');
  assert.ok(Math.abs(end.value + 2) < 1e-6, `release value ${end.value}`);
  h.renderer.dispose();
});

test('cancelling a held orbit ends it: later pointer moves do not turn the camera', async () => {
  const h = harness();
  await h.renderer.load(watchFixture.artifact, {});
  h.renderer.interact(true);
  h.fire('pointerdown', { clientX: 5, clientY: 5 }); // empty space: an orbit
  h.fireDocument('pointermove', { clientX: 120, clientY: 5 });
  const turned = h.renderer.getCamera().position;
  assert.notDeepEqual(turned, [0, 6, 8], 'the orbit turned the camera');
  h.renderer.interact(false);
  h.renderer.interact(true);
  h.fireDocument('pointermove', { clientX: 300, clientY: 5 });
  h.fire('pointermove', { clientX: 300, clientY: 5 });
  assert.deepEqual(h.renderer.getCamera().position, turned, 'the released orbit no longer follows the pointer');
  assert.deepEqual(h.events.select, [], 'a cancelled orbit selects nothing');
  h.renderer.dispose();
});
