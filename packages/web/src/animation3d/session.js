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
// - Scene Reset restores simulation defaults and keeps the camera; Reset view changes only the camera.
// - Settled snapshots and the presentation go to persist (the card hands them to storage.js createAnimationSaver, which debounces
//   and flushes); camera saves never ask the runtime for anything.
import { resolveAnimationInputs, validateAnimationArtifact } from './contract.js';
import { accepted, cardModel, eventFor, failureOf, frameView, invalidArtifact } from './card.js';

export const DRAG_END_RETRIES = 20; // a drag end the runtime refused as busy is resent (runtime.js keeps no slot for it)
const RETRY_MS = 50;

const INITIAL = Object.freeze({
  artifact: null, model: null, failure: null, notice: '', runtime: 'off', renderer: 'off', frame: null, time: 0, readouts: [], goal: null,
  playing: false, speed: 1, inputs: null, pending: null, changed: false, camera: null, poster: null, selected: null,
});

export function createCardSession({ loadScene, createRuntime, createRenderer = null, onUpdate = () => {}, persist = {}, timers = globalThis }) {
  let state = INITIAL, block = null, saved = null, generation = 0, dead = false;
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
    set({ frame, time: Number.isFinite(meta?.time) ? meta.time : state.time, readouts: view.readouts, goal: view.goal });
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
    if (container && createRenderer) rendererStage(mine);
  }

  async function runtimeStage(mine) {
    dropRuntime();
    set({ runtime: 'loading', playing: false });
    const own = () => !stale(mine) && runtime === created;
    const created = createRuntime({
      artifact: state.artifact, saved,
      onFrame: (frame, meta) => { if (own()) showFrame(frame, meta); },
      onError: error => { if (own()) set({ runtime: 'failed', playing: false, failure: failureOf('runtime', error) }); },
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
    dropRenderer();
    const abort = abortRenderer = new AbortController(), mineRenderer = ++rendererGeneration;
    const own = () => !stale(mine) && renderer === created && mineRenderer === rendererGeneration;
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
      if (state.frame) created.applyFrame(state.frame);
      set({ renderer: 'ready' });
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
      block = next; saved = null;
      abortScene?.abort(); dropRuntime(); dropRenderer();
      state = INITIAL;
      onUpdate(state);
      return loadStage(mine);
    },
    // The viewport element while the card holds a WebGL slot; detach hands the slot back, keeping a poster and the camera.
    attach(element) { container = element; if (state.artifact && createRenderer && !renderer && state.failure?.stage !== 'renderer') return rendererStage(generation); return undefined; },
    async detach() {
      if (renderer) { const camera = (() => { try { return renderer.getCamera(); } catch { return null; } })(); if (camera) set({ camera }); await poster(); }
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
    // Restart: a seekable loop goes back to its start keeping its inputs and play state; a rule-based scene has no rewind, so it resets.
    async restart() {
      if (!runtime || state.runtime !== 'ready') return;
      if (!state.model?.loop?.seekable) { await resetScene(); return; }
      const result = await runtime.seek(0);
      if (!accepted(result)) set({ notice: 'Restart was not possible.' });
    },
    setSpeed(speed) {
      if (!runtime || !state.model?.loop?.speeds.includes(speed)) return;
      if (accepted(runtime.setSpeed(speed))) set({ speed }); else set({ notice: 'That speed is not supported for this scene.' });
    },
    reset: resetScene,
    resetView() {
      const camera = state.artifact?.camera ?? null;
      if (!renderer || !camera) return;
      try { renderer.setCamera(camera); } catch (error) { rendererFailed(error); return; }
      set({ camera });
      saveView();
    },
    // The renderer's camera controls follow the card's interaction (interaction.js); a release ends a drag or orbit in progress
    // (renderer.js interact(false) drops it) and hands control back only if the card still owns interaction.
    interact(active) { try { renderer?.interact(active); } catch (error) { rendererFailed(error); } },
    releaseGestures(active) { try { renderer?.interact(false); if (active) renderer?.interact(true); } catch { /* nothing held */ } },
    clearNotice() { if (state.notice) set({ notice: '' }); },
    dispose() {
      dead = true; generation += 1;
      abortScene?.abort(); dropRuntime(); dropRenderer();
    },
  };
}
