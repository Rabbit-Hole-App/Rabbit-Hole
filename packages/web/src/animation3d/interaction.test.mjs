// Gesture arbitration, focus ownership and release (plan section 4 "Stable control profiles"; AN-03). Pure rules first, then
// the hook's handlers, rendered through a probe (react-dom/server) so the handlers are the ones the card attaches.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { arbitrate, clickOrDrag, createSceneInteraction, editableTarget, wheelOwner } from './interaction.js';

test('arbitrate: before Interact every press is the canvas\'s; after it, object drag > orbit, right-drag pans, two fingers are a camera gesture', () => {
  for (const button of [0, 1, 2]) assert.deepEqual(arbitrate({ active: false, button, hit: { draggable: true } }), { owner: 'canvas', gesture: 'none' });
  assert.deepEqual(arbitrate({ active: true, button: 0, hit: { id: 'lever', draggable: true, selectable: true } }), { owner: 'object', gesture: 'drag' });
  assert.deepEqual(arbitrate({ active: true, button: 0, hit: { id: 'ball', selectable: true } }), { owner: 'object', gesture: 'select' });
  assert.deepEqual(arbitrate({ active: true, button: 0, hit: null }), { owner: 'camera', gesture: 'orbit' });
  assert.deepEqual(arbitrate({ active: true, button: 2, hit: { draggable: true } }), { owner: 'camera', gesture: 'pan' }, 'a right press on an object still pans');
  assert.deepEqual(arbitrate({ active: true, button: 1 }), { owner: 'camera', gesture: 'pan' });
  assert.deepEqual(arbitrate({ active: true, button: 3 }), { owner: 'canvas', gesture: 'none' }, 'back/forward buttons are not the scene\'s');
  assert.deepEqual(arbitrate({ active: true, pointerType: 'touch', touches: 1, hit: null }), { owner: 'camera', gesture: 'orbit' });
  assert.deepEqual(arbitrate({ active: true, pointerType: 'touch', touches: 2, hit: { draggable: true } }), { owner: 'camera', gesture: 'pinch' });
  assert.equal(clickOrDrag({ x: 0, y: 0 }, { x: 3, y: 0 }), 'click');
  assert.equal(clickOrDrag({ x: 0, y: 0 }, { x: 4, y: 4 }), 'drag');
});

test('the wheel zooms only while the scene interacts; otherwise the page and canvas keep it', () => {
  assert.equal(wheelOwner({ active: false }), 'pass');
  assert.equal(wheelOwner({ active: true }), 'zoom');
  const scene = createSceneInteraction();
  assert.equal(scene.wheel(), 'pass');
  scene.enter();
  assert.equal(scene.wheel(), 'zoom');
  scene.exit();
  assert.equal(scene.wheel(), 'pass');
});

test('text entry is never taken: editable targets and modified keys pass, and nothing is held before Interact', () => {
  const scene = createSceneInteraction();
  assert.equal(scene.keyDown({ key: 'w', target: { tagName: 'DIV' } }), 'pass', 'inactive');
  scene.enter();
  for (const target of [{ tagName: 'input' }, { tagName: 'TEXTAREA' }, { tagName: 'SELECT' }, { tagName: 'DIV', isContentEditable: true }]) {
    assert.equal(scene.keyDown({ key: 'w', target }), 'pass', JSON.stringify(target));
  }
  assert.equal(scene.keyDown({ key: 'c', ctrlKey: true, target: { tagName: 'DIV' } }), 'pass');
  assert.equal(scene.keyDown({ key: 'v', metaKey: true, target: { tagName: 'DIV' } }), 'pass');
  assert.equal(scene.keyDown({ key: 'ArrowLeft', target: { tagName: 'DIV' } }), 'held');
  assert.deepEqual(scene.held().keys, ['ArrowLeft']);
  scene.keyUp({ key: 'ArrowLeft' });
  assert.deepEqual(scene.held().keys, []);
  assert.equal(editableTarget(null), false);
});

test('Escape, blur, a hidden tab, unmount and a modal release every held key and pointer; Escape also exits', () => {
  for (const reason of ['blur', 'hidden', 'unmount', 'modal', 'focus', 'outside']) {
    const released = [], exits = [];
    const scene = createSceneInteraction({ onRelease: held => released.push(held), onExit: why => exits.push(why) });
    scene.enter();
    scene.keyDown({ key: 'ArrowUp', target: { tagName: 'DIV' } });
    scene.pointerDown({ pointerId: 7, button: 0 });
    if (reason === 'blur' || reason === 'hidden') scene.release(reason); else scene.exit(reason);
    assert.deepEqual(released, [{ reason, keys: ['ArrowUp'], pointers: [7] }], reason);
    assert.deepEqual(scene.held(), { keys: [], pointers: [] }, reason);
    assert.equal(scene.isActive(), reason === 'blur' || reason === 'hidden', `${reason}: a blur or hidden tab releases but keeps the interaction`);
    assert.deepEqual(exits, reason === 'blur' || reason === 'hidden' ? [] : [reason]);
  }
  const released = [], exits = [];
  const scene = createSceneInteraction({ onRelease: held => released.push(held), onExit: why => exits.push(why) });
  scene.enter();
  scene.keyDown({ key: 'd', target: { tagName: 'DIV' } });
  assert.equal(scene.keyDown({ key: 'Escape', target: { tagName: 'INPUT' } }), 'exit', 'Escape leaves even from a field inside the scene');
  assert.deepEqual(released, [{ reason: 'escape', keys: ['d'], pointers: [] }]);
  assert.deepEqual(exits, ['escape']);
  assert.equal(scene.isActive(), false);
  scene.exit('exit');
  assert.deepEqual(exits, ['escape'], 'exit is not reported twice');
});

test('the context menu is suppressed only for the active scene\'s own right-drag, once', () => {
  const scene = createSceneInteraction();
  scene.pointerDown({ pointerId: 1, button: 2 });
  assert.equal(scene.contextMenu(), 'pass', 'inactive scene: the menu opens');
  scene.enter();
  assert.equal(scene.contextMenu(), 'pass', 'no right press yet');
  scene.pointerDown({ pointerId: 2, button: 2 });
  scene.pointerUp({ pointerId: 2 });
  assert.equal(scene.contextMenu(), 'suppress', 'Windows: the menu after the right release');
  assert.equal(scene.contextMenu(), 'pass', 'only that one');
  scene.pointerDown({ pointerId: 3, button: 2 });
  assert.equal(scene.contextMenu(), 'suppress', 'macOS/Linux: the menu on the right press');
  scene.pointerDown({ pointerId: 4, button: 2 });
  scene.pointerDown({ pointerId: 5, button: 0 });
  assert.equal(scene.contextMenu(), 'pass', 'a later left press clears it');
  scene.pointerDown({ pointerId: 6, button: 2 });
  scene.release('blur');
  assert.equal(scene.contextMenu(), 'pass', 'released: the menu opens');
});

test('pointers are held only for presses the scene owns', () => {
  const scene = createSceneInteraction();
  scene.pointerDown({ pointerId: 1, button: 0 });
  assert.deepEqual(scene.held().pointers, [], 'a press on an inactive scene is the canvas\'s');
  scene.enter();
  scene.pointerDown({ pointerId: 2, button: 0 });
  scene.pointerDown({ pointerId: 3, button: 2 });
  assert.deepEqual(scene.held().pointers, [2, 3]);
  scene.pointerUp({ pointerId: 2 });
  assert.deepEqual(scene.held().pointers, [3]);
});

// The hook, through the card's own handlers.
const dir = mkdtempSync(join(tmpdir(), 'animation-interaction-')), outfile = join(dir, 'hook.cjs');
await esbuild.build({
  stdin: { contents: "export { useSceneInteraction } from './interaction.js'; export { activeViewer, resetViewers } from '../viewer-slots.js'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent',
});
const H = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });
const hook = props => { let out = null; const Probe = () => { out = H.useSceneInteraction({ root: { current: null }, ...props }); return null; }; H.renderToStaticMarkup(H.createElement(Probe)); return out; };
const event = over => { const seen = { stopped: 0, prevented: 0 }; return { seen, pointerId: 1, button: 0, pointerType: 'mouse', stopPropagation() { seen.stopped += 1; }, preventDefault() { seen.prevented += 1; }, ...over }; };

test('the hook: presses reach the canvas until Interact; after it they stay in the scene, and a second card taking interaction ends the first', () => {
  H.resetViewers();
  const exits = [];
  const a = hook({ id: 'card-a', onExit: why => exits.push(['a', why]) });
  const before = event();
  a.handlers.onPointerDown(before);
  assert.equal(before.seen.stopped, 0, 'the canvas moves and selects the card');
  const menu = event({ button: 2 });
  a.handlers.onContextMenu(menu);
  assert.equal(menu.seen.prevented, 0);
  a.enter();
  assert.equal(H.activeViewer(), 'card-a');
  const inside = event();
  a.handlers.onPointerDown(inside);
  assert.equal(inside.seen.stopped, 1, 'the canvas neither pans nor drags the card');
  const right = event({ button: 2, pointerId: 2 });
  a.handlers.onPointerDown(right);
  const after = event();
  a.handlers.onContextMenu(after);
  assert.equal(after.seen.prevented, 1, 'the right-drag\'s menu is suppressed');
  const typing = event({ key: 'a', target: { tagName: 'INPUT' } });
  a.handlers.onKeyDown(typing);
  assert.equal(typing.seen.stopped, 0, 'typing in a field goes on as usual');
  const b = hook({ id: 'card-b', onExit: why => exits.push(['b', why]) });
  b.enter();
  assert.equal(H.activeViewer(), 'card-b');
  assert.deepEqual(exits, [['a', 'exit']], 'one card owns inner interaction at a time');
  const now = event();
  a.handlers.onPointerDown(now);
  assert.equal(now.seen.stopped, 0, 'card A is back to the canvas');
  b.exit('escape');
  assert.equal(H.activeViewer(), null);
});

test('the hook: Interact is not entered while the scene is not ready', () => {
  H.resetViewers();
  const a = hook({ id: 'card-c', ready: false });
  a.enter();
  assert.equal(H.activeViewer(), null);
  const press = event();
  a.handlers.onPointerDown(press);
  assert.equal(press.seen.stopped, 0);
});

// fast-e2e 41143743749 step 18: a capture-phase stop runs at React's root before the native press reaches the WebGL canvas, so
// OrbitControls (a native listener on that canvas) never saw a press and Interact could not orbit. The stop is bubble-phase only.
test('the hook stops a press in the bubble phase only, so the scene canvas still receives it', () => {
  H.resetViewers();
  const a = hook({ id: 'card-d' });
  assert.equal(typeof a.handlers.onPointerDown, 'function');
  assert.equal(a.handlers.onPointerDownCapture, undefined, 'no capture-phase press handler');
});
