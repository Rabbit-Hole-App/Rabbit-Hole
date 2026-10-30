// One Animation card's live session (plan section 5 "State and recovery rules", AN-03/AN-04 UI half). No React: the card
// (Animation3DCard.jsx) mirrors its state. Three stages, each failing on its own and retried on its own:
//   artifact  loadArtifact(block, { signal })                              the accepted scene (or a fixture)
//   runtime   createRuntime({ artifact, snapshot, onFrame, onError })      lane R's runtime.js: behavior, inputs, frames
//   renderer  createRenderer({ container, onSelect, onGesture, onCameraChange }).load(artifact, { signal, generation })
// The renderer exists only while the card holds a WebGL slot (attach/detach); the runtime keeps the scene's state, inputs and
// readouts without it, so a lost slot, a failed 3D view or a browser without WebGL keeps a working, honest card.
//
// - Every async answer is checked against the generation it was asked in (a new block, a retry, dispose) and the instance it
//   came from: a late artifact, runtime or renderer answer never replaces newer state.
// - Inputs shown while a change is pending are the learner's; the accepted inputs come from the runtime's own snapshot after
//   it answers, so a rejected change returns the control to the last accepted value and a newer change is never undone.
// - Scene Reset restores simulation defaults and keeps the camera; Reset view changes only the camera.
// - Saves are the settled snapshot and the camera, debounced, flushed on dispose; never per frame, and camera saves never ask
//   the runtime for anything.
import { accepted, cardModel, defaultInputs, eventFor, failureOf, frameView, savedCamera, savedSnapshot } from './card.js';

export const SAVE_DELAY_MS = 800;

// A debounced save of the newest snapshot and camera: one write per settled change, flushed on demand.
export function createSaver({ save, delay = SAVE_DELAY_MS, timers = globalThis }) {
  let pending = null, timer = null;
  const flush = () => { if (timer !== null) timers.clearTimeout(timer); timer = null; if (!pending) return; const next = pending; pending = null; save(next); };
  return {
    queue(part) { pending = { ...pending, ...part }; if (timer !== null) timers.clearTimeout(timer); timer = timers.setTimeout(flush, delay); },
    flush,
    cancel() { if (timer !== null) timers.clearTimeout(timer); timer = null; pending = null; },
  };
}

const INITIAL = Object.freeze({
  artifact: null, model: null, failure: null, notice: '', runtime: 'off', renderer: 'off', frame: null, readouts: [], goal: null,
  playing: false, speed: 1, inputs: null, pending: null, changed: false, camera: null, poster: null, selected: null,
});

export function createCardSession({ loadArtifact, createRuntime, createRenderer = null, onUpdate = () => {}, save = () => {}, saveDelay = SAVE_DELAY_MS, timers = globalThis }) {
  let state = INITIAL, block = null, generation = 0, dead = false;
  let runtime = null, renderer = null, container = null, abortArtifact = null, abortRenderer = null, rendererGeneration = 0, ticket = 0;
  const saver = createSaver({ save, delay: saveDelay, timers });
  const set = patch => { state = { ...state, ...patch }; if (!dead) onUpdate(state); };
  const stale = mine => dead || mine !== generation;
  const dropRuntime = () => { const old = runtime; runtime = null; try { old?.dispose(); } catch { /* already gone */ } };
  const dropRenderer = () => { abortRenderer?.abort(); abortRenderer = null; const old = renderer; renderer = null; try { old?.dispose(); } catch { /* already gone */ } };
  const snapshot = () => { try { return runtime?.snapshot() ?? null; } catch { return null; } };
  const settled = () => { const snap = snapshot(); if (snap) saver.queue({ snapshot: snap }); return snap; };

  function showFrame(frame) {
    const view = frameView(frame);
    try { renderer?.applyFrame(frame); } catch (error) { rendererFailed(error); }
    set({ frame, readouts: view.readouts, goal: view.goal });
  }

  async function loadStage(mine) {
    abortArtifact?.abort();
    const abort = abortArtifact = new AbortController();
    try {
      const artifact = await loadArtifact(block, { signal: abort.signal });
      if (stale(mine)) return;
      set({ artifact, model: cardModel(artifact) });
    } catch (error) {
      if (!stale(mine) && error?.name !== 'AbortError') set({ failure: failureOf('artifact', error) });
      return;
    }
    await runtimeStage(mine);
    if (container && createRenderer) rendererStage(mine);
  }

  async function runtimeStage(mine) {
    dropRuntime();
    set({ runtime: 'loading' });
    const own = () => !stale(mine) && runtime === created;
    const created = createRuntime({
      artifact: state.artifact, snapshot: savedSnapshot(block),
      onFrame: frame => { if (own()) showFrame(frame); },
      onError: error => { if (own()) { set({ runtime: 'failed', playing: false, failure: failureOf('runtime', error) }); } },
    });
    runtime = created;
    try {
      await created.ready;
      if (!own()) return;
      set({ runtime: 'ready', inputs: snapshot()?.inputs ?? defaultInputs(state.model), pending: null, changed: !!savedSnapshot(block) });
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
      onGesture: () => {}, // ponytail: object drag events are post-MVP (AN-10); orbit stays presentation state
      onCameraChange: camera => { if (own()) { state = { ...state, camera }; saver.queue({ camera }); } },
    });
    renderer = created;
    set({ renderer: 'loading' });
    try {
      const out = await created.load(state.artifact, { signal: abort.signal, generation: mineRenderer });
      if (!own()) return;
      if (out && out.ok === false) throw out.error ?? out;
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
    const ok = accepted(result), snap = ok ? settled() : snapshot();
    const patch = { inputs: snap?.inputs ?? state.inputs };
    if (ok) patch.changed = true;
    // Only the newest change decides what the controls show: an older answer never clears a newer pending value.
    if (mine === ticket) { patch.pending = null; patch.notice = ok ? '' : input ? 'That value was not accepted. The last accepted value is kept.' : 'That action was not accepted.'; }
    set(patch);
    return ok;
  }

  // Scene Reset: the declared starting conditions and seed; the camera stays. A failed reset keeps the last good state.
  async function resetScene() {
    if (!runtime || state.runtime !== 'ready') return false;
    const from = runtime;
    ticket += 1; // a pending change from before the reset no longer decides the controls
    try { await from.reset(); } catch { if (runtime === from && !dead) set({ notice: 'Reset did not complete. The last good state is kept.' }); return false; }
    if (runtime !== from || dead) return false;
    const snap = settled();
    set({ inputs: snap?.inputs ?? defaultInputs(state.model), pending: null, changed: false, notice: '', selected: null });
    return true;
  }

  function select(id) { set({ selected: id }); return dispatch(eventFor.select(id)); }

  return {
    state: () => state,
    // A new or changed saved scene: everything restarts from its saved state. The same reference is not reloaded.
    start(next) {
      const mine = ++generation;
      block = next;
      saver.cancel();
      abortArtifact?.abort(); dropRuntime(); dropRenderer();
      state = { ...INITIAL, camera: savedCamera(next) };
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
      if (stage === 'runtime') return runtimeStage(generation);
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
    play() { if (runtime && state.runtime === 'ready') { runtime.play(); set({ playing: true }); } },
    pause() { if (runtime && state.playing) { runtime.pause(); set({ playing: false }); } },
    // Restart: a seekable loop goes back to its start keeping its inputs; a rule-based scene has no rewind, so it resets.
    async restart() {
      if (!runtime || state.runtime !== 'ready') return;
      if (state.model?.loop?.seekable) { try { await runtime.seek(0); } catch (error) { set({ notice: error?.message || 'Restart was not possible.' }); } return; }
      await resetScene();
    },
    setSpeed(speed) { if (!runtime || !state.model?.loop?.speeds.includes(speed)) return; try { runtime.setSpeed(speed); set({ speed }); } catch (error) { set({ notice: error?.message || 'That speed is not supported.' }); } },
    reset: resetScene,
    resetView() {
      const camera = state.model?.camera ?? null;
      if (!renderer || !camera) return;
      try { renderer.setCamera(camera); } catch (error) { rendererFailed(error); return; }
      set({ camera });
      saver.queue({ camera });
    },
    // The renderer's camera controls follow the card's interaction (interaction.js); a release ends an orbit or drag in progress.
    // ponytail: setInteractive/cancelGesture are requested from lane R's renderer; optional until it lands.
    interact(active) { try { renderer?.setInteractive?.(active); } catch (error) { rendererFailed(error); } },
    releaseGestures() { try { renderer?.cancelGesture?.(); } catch { /* nothing held */ } },
    clearNotice() { if (state.notice) set({ notice: '' }); },
    flush: () => saver.flush(),
    dispose() {
      saver.flush();
      dead = true; generation += 1;
      abortArtifact?.abort(); dropRuntime(); dropRenderer();
    },
  };
}
