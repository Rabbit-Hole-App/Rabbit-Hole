// UI test stand-ins for lane R's runtime and renderer (AN-03), driven by the contract fixtures (fixtures.js). The stub runtime
// runs a fixture's own program source (imported as a module, in Node, no sandbox) so the card's readouts and goal come from
// the fixture's stated rule; it exercises the card's wiring only, never the QuickJS runtime (lane R's runtime tests do that).
import { ANIMATION_FIXTURES, experimentFixture, gameFixture, watchFixture } from '../fixtures.js';
import { resolveAnimationInputs, validateAnimationArtifact } from '../contract.js';

export const watchArtifact = () => structuredClone(watchFixture.artifact);
export const experimentArtifact = () => structuredClone(experimentFixture.artifact);
export const gameArtifact = () => structuredClone(gameFixture.artifact);
export const validated = artifact => { const out = validateAnimationArtifact(artifact); if (!out.ok) throw new Error(JSON.stringify(out.issues)); return out.value; };
export const fixtureByName = name => structuredClone(ANIMATION_FIXTURES.find(entry => entry.name === name).artifact);
// A static inspect scene: the watch fixture's scene with no behavior to run.
export const inspectArtifact = () => {
  const { program: _program, timeline: _timeline, ...rest } = watchArtifact();
  return { ...rest, artifactId: 'inspect-stub', experience: 'inspect', readouts: [], provenance: { origin: 'generated' } };
};

export const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const programs = new Map();
const programOf = source => {
  if (!programs.has(source)) programs.set(source, import(`data:text/javascript,${encodeURIComponent(source)}`));
  return programs.get(source);
};

// A runtime with the plan section 5 interface. Snapshot: { inputs, state, revision }. options: reject (parameter or action ids
// it refuses), hold (dispatches wait for release()), ready (a promise the runtime waits for before its first frame).
export function stubRuntimes({ reject = [], hold = false, ready = null } = {}) {
  const made = [], log = [], waiting = [];
  const factory = options => {
    const { artifact } = options;
    let snap = options.snapshot ? structuredClone(options.snapshot) : { inputs: resolveAnimationInputs(artifact, {}), state: null, revision: 0 };
    let disposed = false, module = null;
    const emit = () => { if (!disposed && module) options.onFrame(module.evaluate({ inputs: snap.inputs, time: 0, seed: artifact.seed, state: snap.state })); };
    const runtime = {
      options,
      ready: (async () => {
        await ready;
        module = artifact.program ? await programOf(artifact.program.source) : { evaluate: () => ({}) };
        if (snap.state === null && module.initialState) snap = { ...snap, state: module.initialState({ inputs: snap.inputs, seed: artifact.seed }) };
        emit();
      })(),
      async dispatch(event) {
        log.push(event);
        if (hold) { const gate = { event, ...deferred() }; waiting.push(gate); await gate.promise; }
        if (reject.includes(event.parameter ?? event.action)) return { accepted: false };
        if (event.type === 'parameter') snap = { ...snap, inputs: { ...snap.inputs, [event.parameter]: event.value }, revision: snap.revision + 1 };
        else snap = { ...snap, state: module.reduce ? module.reduce({ state: snap.state, event, inputs: snap.inputs, time: 0, seed: artifact.seed }) : snap.state, revision: snap.revision + 1 };
        emit();
        return { accepted: true };
      },
      play() { log.push('play'); }, pause() { log.push('pause'); },
      async reset() {
        log.push('reset');
        const inputs = resolveAnimationInputs(artifact, {});
        snap = { inputs, state: module.initialState ? module.initialState({ inputs, seed: artifact.seed }) : null, revision: snap.revision + 1 };
        emit();
      },
      async seek(time) { log.push(['seek', time]); }, setSpeed(speed) { log.push(['speed', speed]); },
      snapshot: () => structuredClone(snap), dispose() { disposed = true; log.push('dispose'); },
      fail(error) { options.onError(error); },
    };
    made.push(runtime);
    return runtime;
  };
  return { factory, made, log, release: () => { for (const gate of waiting.splice(0)) gate.resolve(); }, waiting };
}

// A renderer with the plan section 5 interface, recording what it was asked. options.load: what load resolves or rejects with.
export function stubRenderers({ load = null, poster = 'data:image/png;base64,AAAA' } = {}) {
  const made = [];
  const factory = options => {
    let camera = null;
    const renderer = {
      options, frames: [], cameras: [], interactive: [], disposed: false, cancelled: 0,
      load: (artifact, how) => { renderer.loaded = { artifact, ...how }; return load ? load(renderer) : Promise.resolve({ ok: true }); },
      applyFrame(frame) { renderer.frames.push(frame); },
      setCamera(next) { camera = next; renderer.cameras.push(next); },
      getCamera: () => camera ?? { position: [1, 2, 3], target: [0, 0, 0] },
      capturePoster: async () => poster,
      setInteractive(active) { renderer.interactive.push(active); },
      cancelGesture() { renderer.cancelled += 1; },
      dispose() { renderer.disposed = true; },
    };
    made.push(renderer);
    return renderer;
  };
  return { factory, made };
}
