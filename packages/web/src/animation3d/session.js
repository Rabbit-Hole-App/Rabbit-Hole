// One Animation card's live session (plan section 5 "State and recovery rules", AN-03/AN-04 UI half). No React: the card
// (Animation3DCard.jsx) mirrors its state. Three stages, each failing on its own and retried on its own:
//   scene     loadScene(block, { signal }) -> { artifact, sim, view }    the saved artifact (storage.js hydrateAnimation) or a fixture
//   runtime   createRuntime({ artifact, saved, onFrame, onError })         runtime.js createAnimationRuntime: behavior, inputs, frames
//   renderer  createRenderer({ container, onSelect, onGesture, onCameraChange, onLost }).load(artifact, { signal, generation })
// The renderer exists only while the card holds a WebGL slot (attach/detach); the runtime keeps the scene's state, inputs and
// readouts without it, so a lost slot, a failed 3D view or a browser without WebGL keeps a working, honest card.
//
// - Every async answer is checked against the generation it was asked in (a new block, a retry, dispose) and the instance it
//   came from: a late scene, runtime or renderer answer never replaces newer state.
// - Inputs shown while a change is pending are the learner's; the accepted inputs are the runtime's own snapshot, so a refused
//   change returns the control to the last accepted value and a newer pending change is never undone by an older answer.
// - Scene Reset restores simulation defaults and keeps the camera; Reset view changes only the camera, back to the fitted view
//   (framing.js fitAnimationView, once per scene when no camera was saved) or else the authored one. The fit is asked after the
//   card's own runtime is ready and answered before the renderer is made, so the scene is first drawn fitted and never jumps.
// - Restart only rewinds a seekable loop (its inputs kept); a scene that cannot rewind has no Restart, never a hidden reset.
// - Optional labels (object names, annotations, their callouts): the learner's choice lives here and is applied to every renderer
//   the card builds, so it holds through playback, parameter changes, camera moves and a lost and retaken slot.
// - Settled snapshots and the presentation go to persist (the card hands them to storage.js createAnimationSaver, which debounces
//   and flushes); camera saves never ask the runtime for anything.
import { resolveAnimationInputs, validateAnimationArtifact } from './contract.js';
import { accepted, cardModel, eventFor, failureOf, frameView, invalidArtifact } from './card.js';
import { fitAnimationView } from './framing.js';

export const DRAG_END_RETRIES = 20; // a drag end the runtime refused as busy is resent (runtime.js keeps no slot for it)
const RETRY_MS = 50;
// The learner sees the fixed message; which limit or phase failed (runtime.js diagnostic, never shown) goes to the console, the only
// place a browser check can read it (CI fast-e2e 5a3c2e549 step 3 could not tell which deadline the card missed).
const logRuntime = error => console.warn(`animation runtime: ${[error?.code, error?.diagnostic, error?.phase].filter(Boolean).join(' / ')}`);

const INITIAL = Object.freeze({
  artifact: null, model: null, failure: null, notice: '', runtime: 'off', renderer: 'off', frame: null, time: 0, readouts: [], goal: null,
  playing: false, speed: 1, inputs: null, pending: null, changed: false, camera: null, poster: null, selected: null,
  labels: true, optionalLabels: false,
});

// fitView: framing.js fitAnimationView (tests inject a stand-in).
export function createCardSession({ loadScene, createRuntime, createRenderer = null, onUpdate = () => {}, persist = {}, timers = globalThis, fitView = fitAnimationView }) {
  let state = INITIAL, block = null, saved = null, generation = 0, dead = false, fitted; // fitted: this scene's fitted camera, null: none, undefined: not asked
  let runtime = null, renderer = null, container = null, abortScene = null, abortRenderer = null, rendererGeneration = 0, ticket = 0;
  const set = patch => { state = { ...state, ...patch }; if (!dead) onUpdate(state); };
  const stale = mine => dead || mine !== generation;
  const saveSimulation = snapshot => { if (snapshot) persist.simulation?.(snapshot); };
  const saveView = () => persist.view?.({ camera: state.camera, selection: state.selected });
  const dropRuntime = () => { const old = runtime; runtime = null; try { old?.dispose(); } catch { /* already gone */ } };
  const dropRenderer = () => { abortRenderer?.abort(); abortRenderer = null; const old = renderer; renderer = null; try { old?.dispose(); } catch { /* already gone */ } };
  const snapshot = () => { try { return runtime?.snapshot() ?? null; } catch { return null; } };
  const defaults = () => resolveAnimationInputs(state.artifact, {});

  function showFrame(frame, meta) {
    const view = frameView(frame, state.model);
    try { renderer?.applyFrame(frame); } catch (error) { rendererFailed(error); }
    // A loop that ran to its end stopped itself (runtime.js): the shown play state follows the runtime's own.
    const stopped = state.playing && snapshot()?.paused === true;
    set({ frame, time: Number.isFinite(meta?.time) ? meta.time : state.time, readouts: view.readouts, goal: view.goal, ...(stopped ? { playing: false } : {}) });
  }

  async function loadStage(mine) {
    abortScene?.abort();
    const abort = abortScene = new AbortController();
    try {
      const loaded = await loadScene(block, { signal: abort.signal });
      if (stale(mine)) return;
      // Malformed output never reaches the runtime or renderer: the contract checks it first.
      const checked = validateAnimationArtifact(loaded.artifact);
      if (!checked.ok) throw invalidArtifact(checked.issues);
      saved = loaded.sim ?? null;
      set({ artifact: checked.value, model: cardModel(checked.value), camera: loaded.view?.camera ?? null, selected: loaded.view?.selection ?? null });
    } catch (error) {
      if (!stale(mine) && error?.name !== 'AbortError') set({ failure: failureOf('artifact', error) });
      return;
    }
    await runtimeStage(mine);
    // A newer start (a new block, the board's context arriving) owns the card now: this one must not touch its renderer.
    if (!stale(mine) && container && createRenderer) rendererStage(mine);
  }

  async function runtimeStage(mine) {
    dropRuntime();
    set({ runtime: 'loading', playing: false });
    const own = () => !stale(mine) && runtime === created;
    const created = createRuntime({
      artifact: state.artifact, saved,
      onFrame: (frame, meta) => { if (own()) showFrame(frame, meta); },
      onError: error => { if (own()) { logRuntime(error); set({ runtime: 'failed', playing: false, failure: failureOf('runtime', error) }); } }, // a failed start too
    });
    runtime = created;
    try {
      await created.ready;
      if (!own()) return;
      set({ runtime: 'ready', inputs: snapshot()?.inputs ?? defaults(), pending: null, changed: !!saved });
    } catch (error) {
      if (own()) set({ runtime: 'failed', failure: failureOf('runtime', error) });
    }
  }

  function rendererFailed(error) { if (renderer) set({ renderer: 'off', failure: failureOf('renderer', error) }); dropRenderer(); }

  async function rendererStage(mine) {
    if (stale(mine)) return; // never drop the current renderer for a superseded start (CI fast-e2e 41141201411)
    dropRenderer();
    const abort = abortRenderer = new AbortController(), mineRenderer = ++rendererGeneration;
    const current = () => !stale(mine) && mineRenderer === rendererGeneration && !abort.signal.aborted;
    // The fit before the first draw (CI fast-e2e 5c79023f7 steps 17 and 19: a fit landing late moved an idle scene), and only once
    // the card's runtime is ready: its sampler never competes with this card's own start or a saved state's restore.
    if (!state.camera && fitted === undefined) {
      try { await runtime?.ready; } catch { /* the fit then has no shown frame */ }
      if (!current()) return;
      const camera = await fitView({ artifact: state.artifact, aspect: container.clientWidth / container.clientHeight, frame: state.frame, createRuntime, signal: abort.signal }).catch(() => null);
      if (!current()) return;
      fitted = camera;
    }
    const own = () => current() && renderer === created;
    const created = createRenderer({
      container,
      onSelect: id => { if (own()) select(id); },
      onGesture: event => { if (own()) gesture(event); },
      onCameraChange: camera => { if (own()) { state = { ...state, camera }; saveView(); } },
      onLost: () => { if (own()) rendererFailed(Object.assign(new Error('The graphics context was lost.'), { code: 'context_lost' })); },
    });
    renderer = created;
    set({ renderer: 'loading' });
    try {
      const out = await created.load(state.artifact, { signal: abort.signal, generation: mineRenderer });
      if (!own() || out?.code === 'aborted') return;
      if (out && out.ok === false) throw Object.assign(new Error(out.issues?.[0]?.message || 'The scene could not be drawn.'), { code: out.code });
      if (state.camera) created.setCamera(state.camera);
      else if (fitted) created.setCamera(fitted);
      if (state.frame) created.applyFrame(state.frame);
      const optional = typeof created.hasOptionalLabels === 'function' && !!created.hasOptionalLabels();
      if (optional && typeof created.setOptionalLabels === 'function') created.setOptionalLabels(state.labels);
      set({ renderer: 'ready', optionalLabels: optional });
      poster();
    } catch (error) {
      if (own() && error?.name !== 'AbortError') rendererFailed(error);
    }
  }

  async function poster() {
    const from = renderer;
    try { const image = await from?.capturePoster(); if (image && from === renderer && !dead) set({ poster: image }); } catch { /* the previous poster stays */ }
  }

  async function dispatch(event, { input = null } = {}) {
    if (!runtime || state.runtime !== 'ready') return false;
    const from = runtime, mine = ++ticket;
    let result;
    try { result = await from.dispatch(event); } catch (error) { result = { accepted: false, reason: error?.message }; }
    if (dead || runtime !== from) return false;
    const ok = accepted(result), snap = result?.snapshot ?? snapshot();
    if (ok) saveSimulation(snap);
    const patch = { inputs: snap?.inputs ?? state.inputs };
    if (ok) patch.changed = true;
    // Only the newest change decides what the controls show: an older answer never clears a newer pending value.
    if (mine === ticket) { patch.pending = null; patch.notice = ok ? '' : input ? 'That value was not accepted. The last accepted value is kept.' : 'That action was not accepted.'; }
    set(patch);
    return ok;
  }

  function select(id) {
    set({ selected: id });
    saveView();
    const node = state.artifact?.scene.nodes.find(item => item.id === id);
    return id === null || node?.selectable ? dispatch(eventFor.select(id)) : Promise.resolve(false);
  }

  // A drag on a draggable node (renderer.js gestures). Moves coalesce in the runtime; an end refused as busy is resent so the
  // program is never left mid-drag.
  async function gesture(event, tries = 0) {
    if (!runtime || state.runtime !== 'ready') return;
    const from = runtime;
    let result;
    try { result = await from.dispatch(event); } catch { return; }
    if (dead || runtime !== from) return;
    if (accepted(result)) { saveSimulation(result.snapshot ?? snapshot()); set({ changed: true, inputs: (result.snapshot ?? snapshot())?.inputs ?? state.inputs }); return; }
    if (event.type === 'drag_end' && result?.reason === 'busy' && tries < DRAG_END_RETRIES) timers.setTimeout(() => gesture(event, tries + 1), RETRY_MS);
  }

  // Scene Reset: the declared starting conditions and seed; the camera stays. A failed reset keeps the last good state.
  async function resetScene() {
    if (!runtime || state.runtime !== 'ready') return false;
    const from = runtime;
    ticket += 1; // a pending change from before the reset no longer decides the controls
    let result;
    try { result = await from.reset(); } catch { result = null; }
    if (runtime !== from || dead) return false;
    if (!accepted(result)) { set({ notice: 'Reset did not complete. The last good state is kept.' }); return false; }
    const snap = result.snapshot ?? snapshot();
    saveSimulation(snap);
    set({ inputs: snap?.inputs ?? defaults(), pending: null, changed: false, notice: '', playing: false });
    return true;
  }

  return {
    state: () => state,
    // A new or changed saved scene: everything restarts from its saved state.
    start(next) {
      const mine = ++generation;
      block = next; saved = null; fitted = undefined;
      abortScene?.abort(); dropRuntime(); dropRenderer();
      state = INITIAL;
      onUpdate(state);
      return loadStage(mine);
    },
    // The viewport element while the card holds a WebGL slot; detach hands the slot back, keeping a poster and the camera.
    attach(element) { container = element; if (state.artifact && createRenderer && !renderer && state.failure?.stage !== 'renderer') return rendererStage(generation); return undefined; },
    // Synchronous: the viewport is cleared at once, so an attach right after (the slot taken again) always rebuilds the 3D view.
    detach() {
      if (renderer) {
        const camera = (() => { try { return renderer.getCamera(); } catch { return null; } })();
        const image = (() => { try { return renderer.capturePoster(); } catch { return null; } })();
        if (camera) set({ camera });
        Promise.resolve(image).then(still => { if (still && !dead) set({ poster: still }); }, () => {});
      }
      container = null; dropRenderer(); if (!dead) set({ renderer: 'off' });
    },
    // Retry repeats only the stage that failed: never a page reload, never a new generation request.
    retry() {
      const stage = state.failure?.stage;
      set({ failure: null, notice: '' });
      if (stage === 'artifact') return loadStage(generation);
      if (stage === 'runtime') { saved = snapshot() ?? saved; return runtimeStage(generation); }
      if (stage === 'renderer' && container && createRenderer) return rendererStage(generation);
      return undefined;
    },
    setParameter(id, value) {
      if (state.runtime !== 'ready') return Promise.resolve(false);
      set({ pending: { ...(state.pending ?? state.inputs), [id]: value } });
      return dispatch(eventFor.parameter(id, value), { input: id });
    },
    action: id => dispatch(eventFor.action(id)),
    select,
    play() { if (runtime && state.runtime === 'ready' && accepted(runtime.play())) set({ playing: true }); },
    pause() { if (runtime && state.playing) { runtime.pause(); set({ playing: false }); const snap = snapshot(); if (snap) saveSimulation(snap); } },
    // Restart: a seekable loop goes back to its start keeping its inputs and play state. A rule-based scene cannot rewind (runtime.js
    // reset() always returns to the defaults), so it offers no Restart and this does nothing there.
    async restart() {
      if (!runtime || state.runtime !== 'ready' || !state.model?.loop?.seekable) return;
      const result = await runtime.seek(0);
      if (!accepted(result)) set({ notice: 'Restart was not possible.' });
    },
    setSpeed(speed) {
      if (!runtime || !state.model?.loop?.speeds.includes(speed)) return;
      if (accepted(runtime.setSpeed(speed))) set({ speed }); else set({ notice: 'That speed is not supported for this scene.' });
    },
    reset: resetScene,
    resetView() {
      const camera = fitted ?? state.artifact?.camera ?? null;
      if (!renderer || !camera) return;
      try { renderer.setCamera(camera); } catch (error) { rendererFailed(error); return; }
      set({ camera });
      saveView();
    },
    // The renderer's camera controls follow the card's interaction (interaction.js); a release ends a drag or orbit in progress
    // (renderer.js interact(false) drops it) and hands control back only if the card still owns interaction.
    interact(active) { try { renderer?.interact(active); } catch (error) { rendererFailed(error); } },
    releaseGestures(active) { try { renderer?.interact(false); if (active) renderer?.interact(true); } catch { /* nothing held */ } },
    // Optional labels on or off: the renderer's own toggle (renderer.js setOptionalLabels); measurements and instructions stay.
    setLabels(visible) {
      set({ labels: !!visible });
      try { if (typeof renderer?.setOptionalLabels === 'function') renderer.setOptionalLabels(!!visible); } catch (error) { rendererFailed(error); }
    },
    clearNotice() { if (state.notice) set({ notice: '' }); },
    dispose() {
      dead = true; generation += 1;
      abortScene?.abort(); dropRuntime(); dropRenderer();
    },
  };
}
