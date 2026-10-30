// UI test stand-ins for the three MVP variants and for lane R's runtime and renderer (AN-03). They exercise the card's own
// logic only; lane R's fixtures.js (contract-validated) replaces the artifacts once the contract lands.
// ponytail: artifact field names follow plan section 5 until contract.js is merged; switch these to fixtures.js then.

export const watchArtifact = () => ({
  schema: 'animation-scene/1', id: 'stub-watch', title: 'Earth and Moon orbit', experience: 'watch', fixture: true,
  description: 'The Moon circles the Earth once every 27 days while the Earth turns.',
  behavior: { kind: 'analytical', duration: 10, loop: true }, parameters: [], actions: [], camera: { position: [0, 4, 8], target: [0, 0, 0] },
  assumptions: ['Circular orbit; distances not to scale.'],
});
export const experimentArtifact = () => ({
  schema: 'animation-scene/1', id: 'stub-experiment', title: 'Lever balance', experience: 'experiment', fixture: true,
  description: 'Two masses on a lever; the readout compares their torques.',
  behavior: { kind: 'analytical' },
  parameters: [
    { id: 'left_mass', label: 'Left mass', type: 'number', min: 1, max: 10, step: 0.5, unit: 'kg', default: 2 },
    { id: 'left_distance', label: 'Left distance', type: 'number', min: 0.1, max: 2, step: 0.1, unit: 'm', default: 1 },
    { id: 'show_forces', label: 'Show force arrows', type: 'boolean', default: true },
  ],
  actions: [], camera: { position: [0, 2, 6], target: [0, 0, 0] },
});
export const gameArtifact = () => ({
  schema: 'animation-scene/1', id: 'stub-game', title: 'Balance the beam', experience: 'game', fixture: true,
  description: 'Place a weight so the beam balances.',
  behavior: { kind: 'rules' },
  parameters: [],
  actions: [{ id: 'place_left', label: 'Place on left' }, { id: 'place_right', label: 'Place on right' }, { id: 'check', label: 'Check' }],
  goal: { objective: 'Make the beam level using one weight.', hint: 'Torque is mass times distance.', checkAction: 'check' },
  camera: { position: [0, 3, 7], target: [0, 0, 0] },
});
export const inspectArtifact = () => ({ schema: 'animation-scene/1', id: 'stub-inspect', title: 'A cell', experience: 'inspect', description: 'A plant cell.', parameters: [], camera: { position: [0, 0, 5] } });

export const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

// A runtime with the plan section 5 interface. Its accepted state is { inputs, revision }; frames carry readouts computed from it.
// options.reject: parameter ids or action ids it refuses; options.hold: dispatches wait for release(); options.ready: a promise.
export function stubRuntimes({ reject = [], hold = false, ready = null, readouts = state => [{ id: 'torque', label: 'Left torque', value: (state.inputs.left_mass ?? 0) * (state.inputs.left_distance ?? 0), unit: 'N m' }], goal = null } = {}) {
  const made = [], log = [], waiting = [];
  const factory = options => {
    const defaults = Object.fromEntries((options.artifact.parameters ?? []).map(p => [p.id, p.default]));
    let state = options.snapshot ? structuredClone(options.snapshot) : { inputs: defaults, revision: 0, attempts: 0 };
    let disposed = false;
    const frame = () => ({ readouts: readouts(state), goal: goal ? goal(state) : undefined });
    const emit = () => { if (!disposed) options.onFrame(frame()); };
    const runtime = {
      options,
      ready: (ready ?? Promise.resolve()).then(() => emit()),
      async dispatch(event) {
        log.push(event);
        if (hold) { const gate = { event, ...deferred() }; waiting.push(gate); await gate.promise; }
        if (reject.includes(event.id)) return { accepted: false };
        if (event.type === 'parameter') state = { ...state, inputs: { ...state.inputs, [event.id]: event.value }, revision: state.revision + 1 };
        else state = { ...state, attempts: state.attempts + (event.id === 'check' ? 1 : 0), last: event.id, revision: state.revision + 1 };
        emit();
        return { accepted: true };
      },
      play() { log.push('play'); }, pause() { log.push('pause'); },
      async reset() { log.push('reset'); state = { inputs: defaults, revision: state.revision + 1, attempts: 0 }; emit(); },
      async seek(time) { log.push(['seek', time]); }, setSpeed(speed) { log.push(['speed', speed]); },
      snapshot: () => structuredClone(state), dispose() { disposed = true; log.push('dispose'); },
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
