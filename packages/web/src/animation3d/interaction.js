// Who owns a pointer, wheel or key over an Animation scene card (plan section 4, "Stable control profiles"; AN-03).
// The rules are pure (arbitrate, wheelOwner, createSceneInteraction); useSceneInteraction binds them to one card's DOM.
//
// - One card owns inner interaction at a time: entering one ends another's (viewer-slots.js activateViewer, shared with
//   the CAD and model viewers).
// - Hit testing is resolved once: an active object drag wins over camera orbit, and camera orbit wins over the outer
//   canvas pan only while the scene's interaction is active. Before Interact every press belongs to the canvas.
// - The wheel and pinch zoom the scene only while its interaction is active; otherwise they are never taken from the page
//   or the canvas.
// - The context menu is suppressed only for the active scene's own right-drag.
// - No global listener consumes text-entry keys: keys are read on the scene's own element, and the window listener reads
//   Escape alone, only while this scene is interacting.
// - Held keys and pointers are released on Escape, window blur, a hidden tab, unmount, exit, and focus or a press moving
//   outside the scene (a modal taking focus included).
import { useEffect, useRef, useState } from 'react';
import { activateViewer, deactivateViewer } from '../viewer-slots.js';
import { holdContentGestures } from '../content-gestures.js';

// What a press does. hit: the declared object under the pointer ({ id, draggable, selectable }) or null for empty space.
// touches: how many touch points are down (a second finger turns a one-finger orbit into a camera gesture).
//   -> { owner: 'canvas' | 'object' | 'camera', gesture: 'none' | 'drag' | 'select' | 'orbit' | 'pan' | 'pinch' }
export function arbitrate({ active, button = 0, pointerType = 'mouse', touches = 1, hit = null }) {
  if (!active) return { owner: 'canvas', gesture: 'none' };
  if (pointerType === 'touch' && touches > 1) return { owner: 'camera', gesture: 'pinch' };
  if (button === 2 || button === 1) return { owner: 'camera', gesture: 'pan' };
  if (button !== 0) return { owner: 'canvas', gesture: 'none' };
  if (hit?.draggable) return { owner: 'object', gesture: 'drag' };
  // A press on a selectable object selects it on release; moved past the click slop it orbits instead (clickOrDrag).
  if (hit?.selectable) return { owner: 'object', gesture: 'select' };
  return { owner: 'camera', gesture: 'orbit' };
}

// A press that travels further than this (CSS pixels) is a drag, never a click (CadPreview uses the same 4 px).
export const CLICK_SLOP = 4;
export const clickOrDrag = (from, to) => (Math.hypot(to.x - from.x, to.y - from.y) > CLICK_SLOP ? 'drag' : 'click');

// The wheel over a scene: 'zoom' while it is interacting, else 'pass' (the canvas pans, the page scrolls).
export const wheelOwner = ({ active }) => (active ? 'zoom' : 'pass');

// Text the learner types never reaches the scene: inputs, text areas, selects and editable content are left alone.
export function editableTarget(target) {
  if (!target || typeof target !== 'object') return false;
  if (target.isContentEditable) return true;
  const tag = String(target.tagName || '').toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

// One card's interaction state. release(reason) is the one place held keys and pointers end; onRelease hears what was held
// so the card can end a drag or orbit in progress, and onExit hears every exit.
//   createSceneInteraction({ onRelease({ reason, keys, pointers }), onExit(reason), onEnter() })
//     .enter()  .exit(reason)  .release(reason)  .isActive()
//     .pointerDown({ pointerId, button, pointerType, touches, hit }) -> arbitrate's decision (held while not 'canvas')
//     .pointerUp({ pointerId })  .contextMenu() -> 'suppress' | 'pass'  .wheel() -> 'zoom' | 'pass'
//     .keyDown({ key, target, ctrlKey, metaKey, altKey }) -> 'exit' | 'held' | 'pass'  .keyUp({ key })
//     .held() -> { keys: string[], pointers: number[] }
export const RELEASE_REASONS = Object.freeze(['escape', 'blur', 'hidden', 'unmount', 'exit', 'outside', 'focus', 'modal']);

export function createSceneInteraction({ onRelease = () => {}, onExit = () => {}, onEnter = () => {} } = {}) {
  let active = false, menu = false; // menu: the next context menu belongs to this scene's right-drag
  const keys = new Set(), pointers = new Map(); // pointerId -> { button, gesture }
  const release = reason => {
    const held = { reason, keys: [...keys], pointers: [...pointers.keys()] };
    keys.clear(); pointers.clear(); menu = false;
    if (held.keys.length || held.pointers.length) onRelease(held);
    return held;
  };
  return {
    isActive: () => active,
    held: () => ({ keys: [...keys], pointers: [...pointers.keys()] }),
    enter() { if (active) return; active = true; onEnter(); },
    exit(reason = 'exit') { if (!active) return; release(reason); active = false; onExit(reason); },
    release,
    pointerDown({ pointerId, button = 0, pointerType = 'mouse', touches = 1, hit = null }) {
      const decision = arbitrate({ active, button, pointerType, touches, hit });
      menu = false;
      if (decision.owner !== 'canvas') pointers.set(pointerId, { button, gesture: decision.gesture });
      if (decision.owner !== 'canvas' && button === 2) menu = true;
      return decision;
    },
    pointerUp({ pointerId }) { pointers.delete(pointerId); },
    // Windows raises contextmenu after the right button's release, macOS and Linux on its press: either way it follows
    // this scene's right press, and only that one is suppressed. Any other menu (a press elsewhere, an inactive scene) opens.
    contextMenu() { if (!active || !menu) return 'pass'; menu = false; return 'suppress'; },
    wheel: () => wheelOwner({ active }),
    keyDown({ key, target = null, ctrlKey = false, metaKey = false, altKey = false }) {
      if (!active) return 'pass';
      if (key === 'Escape') { this.exit('escape'); return 'exit'; }
      if (editableTarget(target) || ctrlKey || metaKey || altKey) return 'pass';
      keys.add(key);
      return 'held';
    },
    keyUp({ key }) { keys.delete(key); },
  };
}

// The thin React binding for one card. root: the card (its viewport, local controls and footer): a press or focus outside
// it ends the interaction. surface: the viewport, which takes focus, the wheel and pinch while interacting (default root).
// id: this card's viewer-slots identity. ready: a scene that can be interacted with (Interact is offered only then).
//   useSceneInteraction({ id, root, surface, ready, onRelease, onEnter, onExit })
//     -> { active, enter(), exit(reason), handlers: { onPointerDown, onPointerUpCapture, onPointerCancelCapture, onContextMenu, onKeyDown, onKeyUp } }
export function useSceneInteraction({ id, root, surface = root, ready = true, onRelease = () => {}, onEnter = () => {}, onExit = () => {} }) {
  const [active, setActive] = useState(false);
  const calls = useRef(null);
  calls.current = { onRelease, onEnter, onExit };
  const controller = useRef(null);
  controller.current ||= createSceneInteraction({
    onRelease: held => calls.current.onRelease(held),
    onEnter: () => { setActive(true); calls.current.onEnter(); },
    onExit: reason => { deactivateViewer(id); setActive(false); calls.current.onExit(reason); },
  });
  const scene = controller.current;
  const exit = (reason = 'exit') => scene.exit(reason);
  const enter = () => {
    if (!ready) return;
    activateViewer(id, () => scene.exit('exit')); // ends another card's interaction
    scene.enter();
    globalThis.requestAnimationFrame?.(() => surface.current?.focus({ preventScroll: true }));
  };
  useEffect(() => { if (!ready) scene.exit('exit'); }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { scene.exit('unmount'); deactivateViewer(id); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!active) return undefined;
    const element = root.current, viewport = surface.current;
    const inside = target => !!(element && target && element.contains(target));
    const outside = event => { if (!inside(event.target)) scene.exit('outside'); };
    // Focus moving out (Tab to the chat, a modal taking focus) hands the scene back; a modal is named as such.
    const focus = event => { if (!inside(event.target)) scene.exit(event.target?.closest?.('[role="dialog"],[aria-modal="true"]') ? 'modal' : 'focus'); };
    // Escape alone, from anywhere, while this scene interacts: it goes no further (it neither deselects the card nor
    // closes a panel). Every other key is left to whoever has focus.
    const escape = event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); scene.exit('escape'); } };
    const blur = () => scene.release('blur');
    const hidden = () => { if (document.hidden) scene.release('hidden'); };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('focusin', focus, true);
    window.addEventListener('keydown', escape, true);
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', hidden);
    // The wheel and pinch stay in the scene while it interacts (its camera zooms them); a native listener, so it holds
    // before the canvas's own wheel listener (content-gestures.js).
    const stopGestures = viewport ? holdContentGestures(viewport, { wheel: () => {}, scale: () => {} }) : () => {};
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('focusin', focus, true);
      window.removeEventListener('keydown', escape, true);
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', hidden);
      stopGestures();
    };
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  const handlers = {
    // While interacting every press inside the scene is the scene's (arbitrate never answers 'canvas' then), so the canvas
    // neither pans nor drags the card; before Interact the press goes on to the canvas untouched. Bubble phase, never capture:
    // React runs capture handlers from its root before the native event reaches the WebGL canvas, so a stop there kept every
    // press from OrbitControls' and the renderer's own listeners and Interact could not orbit (fast-e2e 41143743749, step 18).
    onPointerDown: event => {
      const decision = scene.pointerDown({ pointerId: event.pointerId, button: event.button, pointerType: event.pointerType, hit: null });
      if (decision.owner !== 'canvas') event.stopPropagation();
    },
    onPointerUpCapture: event => scene.pointerUp({ pointerId: event.pointerId }),
    onPointerCancelCapture: event => scene.pointerUp({ pointerId: event.pointerId }),
    onContextMenu: event => { if (scene.contextMenu() === 'suppress') { event.preventDefault(); event.stopPropagation(); } },
    onKeyDown: event => { if (scene.keyDown(event) === 'held') event.stopPropagation(); },
    onKeyUp: event => scene.keyUp(event),
  };
  return { active, enter, exit, handlers };
}
