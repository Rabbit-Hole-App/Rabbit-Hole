// Test stand-ins for the card (AN-03), on the contract fixtures (fixtures.js).
// - realRuntimes: runtime.js createAnimationRuntime itself, over the pinned QuickJS engine with an in-process Worker speaking
//   worker.js's protocol (as runtime.test.mjs does). The card's readouts and goal then come from the fixture's own program.
// - stubRuntimes: the same interface with dispatches the test holds or refuses, for ordering and refusal cases.
// - stubRenderers: renderer.js's interface, recording what it was asked (no WebGL in Node).
import { experimentFixture, gameFixture, watchFixture } from '../fixtures.js';
import { resolveAnimationInputs, validateAnimationArtifact } from '../contract.js';
import { createAnimationRuntime } from '../runtime.js';

export const watchArtifact = () => structuredClone(watchFixture.artifact);
export const experimentArtifact = () => structuredClone(experimentFixture.artifact);
export const gameArtifact = () => structuredClone(gameFixture.artifact);
export const validated = artifact => { const out = validateAnimationArtifact(artifact); if (!out.ok) throw new Error(JSON.stringify(out.issues)); return out.value; };
// A static inspect scene: the watch fixture's scene with no behavior to run.
export const inspectArtifact = () => {
  const { program: _program, timeline: _timeline, ...rest } = watchArtifact();
  return { ...rest, artifactId: 'inspect-stub', experience: 'inspect', readouts: [], provenance: { origin: 'generated' } };
};
export const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

let engine = null;
export async function loadEngine() {
  if (!engine) engine = await (await import('../../explain-program/runtime.js')).loadEngine();
  return engine;
}
const { runProgram } = await import('../../explain-program/runtime.js');
const inProcessWorker = () => {
  const worker = {
    terminated: false,
    terminate() { worker.terminated = true; },
    postMessage(message) {
      queueMicrotask(() => { if (!worker.terminated) worker.onmessage?.({ data: { id: message.id, ...runProgram(engine, message) } }); });
    },
  };
  queueMicrotask(() => worker.onmessage?.({ data: { ready: true } }));
  return worker;
};
export function manualClock() {
  let next = 0;
  const callbacks = new Map();
  return {
    t: 0,
    now() { return this.t; },
    request(callback) { callbacks.set(++next, callback); return next; },
    cancel(handle) { callbacks.delete(handle); },
    frame(ms) { this.t += ms; const due = [...callbacks.values()]; callbacks.clear(); due.forEach(callback => callback()); },
  };
}
// Call loadEngine() first (a test's before()).
export function realRuntimes({ clock = manualClock() } = {}) {
  const made = [];
  const factory = options => { const runtime = createAnimationRuntime({ ...options, workerFactory: inProcessWorker, clock }); made.push({ options, runtime }); return runtime; };
  return { factory, made, clock };
}

// The runtime.js interface with test-held dispatches. Snapshot: { inputs, state, revision }. reject: parameter or action ids it
// refuses; hold: dispatches wait for release(); evaluate(snapshot) -> frame.
export function stubRuntimes({ reject = [], hold = false, evaluate = () => ({}) } = {}) {
  const made = [], log = [], waiting = [];
  const factory = options => {
    const { artifact } = options;
    let snap = options.saved ? structuredClone(options.saved) : { inputs: resolveAnimationInputs(validated(artifact), {}), state: null, revision: 0 };
    let disposed = false;
    const emit = () => { if (!disposed) options.onFrame(evaluate(snap), { time: 0, stamp: snap.revision }); };
    const runtime = {
      options,
      ready: Promise.resolve().then(emit),
      async dispatch(event) {
        log.push(event);
        if (hold) { const gate = { event, ...deferred() }; waiting.push(gate); await gate.promise; }
        if (reject.includes(event.parameter ?? event.action)) return { accepted: false, reason: 'invalid_event' };
        if (event.type === 'parameter') snap = { ...snap, inputs: { ...snap.inputs, [event.parameter]: event.value } };
        snap = { ...snap, revision: snap.revision + 1 };
        emit();
        return { accepted: true, snapshot: structuredClone(snap) };
      },
      play() { log.push('play'); return { accepted: true }; }, pause() { log.push('pause'); return { accepted: true }; },
      async reset() { log.push('reset'); snap = { inputs: resolveAnimationInputs(validated(artifact), {}), state: null, revision: snap.revision + 1 }; emit(); return { accepted: true, snapshot: structuredClone(snap) }; },
      async seek(time) { log.push(['seek', time]); return { accepted: true }; },
      setSpeed(speed) { log.push(['speed', speed]); return { accepted: true }; },
      snapshot: () => structuredClone(snap), dispose() { disposed = true; log.push('dispose'); },
      fail(error) { options.onError(error); },
    };
    made.push(runtime);
    return runtime;
  };
  return { factory, made, log, release: () => { for (const gate of waiting.splice(0)) gate.resolve(); }, waiting };
}

// renderer.js's interface, recording what it was asked. options.load: what load resolves or rejects with.
export function stubRenderers({ load = null, poster = 'data:image/webp;base64,AAAA' } = {}) {
  const made = [];
  const factory = options => {
    let camera = null;
    const renderer = {
      options, frames: [], cameras: [], interactive: [], disposed: false,
      load: (artifact, how) => { renderer.loaded = { artifact, ...how }; return load ? load(renderer) : Promise.resolve({ ok: true }); },
      applyFrame(frame) { renderer.frames.push(frame); return { ok: true }; },
      setCamera(next) { camera = next; renderer.cameras.push(next); },
      getCamera: () => camera ?? { position: [1, 2, 3], target: [0, 0, 0], fov: 50 },
      capturePoster: () => poster,
      interact(on) { renderer.interactive.push(!!on); },
      dispose() { renderer.disposed = true; },
    };
    made.push(renderer);
    return renderer;
  };
  return { factory, made };
}
