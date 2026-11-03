import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJson, sha256Hex } from '../explain-program/contract.js';
import { hashProgramSource } from './contract.js';
import { experimentFixture, gameFixture, watchFixture } from './fixtures.js';
import { reviewRequestProblem, runReviewProgram } from './review.js';

// The review capture's program half against the REAL pinned engine (an in-process stand-in for the page's blob: Worker, same
// protocol). The page around it (WebGL, screenshot) only runs in Browser Rendering.
let engineModule = null;
try { engineModule = await import('../explain-program/runtime.js'); } catch { engineModule = null; }
const run = engineModule ? test : test.skip;
let engine;
before(async () => { if (engineModule) engine = await engineModule.loadEngine(); });
after(() => engine?.dispose?.());

const workerFactory = () => {
  const worker = {
    terminated: false, terminate() { worker.terminated = true; },
    postMessage: message => queueMicrotask(() => { if (!worker.terminated) worker.onmessage?.({ data: { id: message.id, ...engineModule.runProgram(engine, message) } }); }),
  };
  queueMicrotask(() => worker.onmessage?.({ data: { ready: true } }));
  return worker;
};
const view = { name: 'default', position: [0, 2, 7], target: [0, 0, 0], fov: 50 };
const requestFor = async (artifact, change = {}) => ({
  artifact, artifactHash: await sha256Hex(canonicalJson(artifact)), view, inputs: {}, time: 0, events: [], ticks: 0, seed: artifact.seed, theme: 'light', width: 960, height: 540, ...change,
});
const withSource = async (artifact, source, change = () => {}) => {
  const copy = structuredClone(artifact);
  copy.program.source = source;
  copy.program.sourceHash = await hashProgramSource(source);
  change(copy);
  return copy;
};

run('an experiment capture runs at the requested inputs and echoes the hash, events and trace', async () => {
  const inputs = { leftMass: 1, leftDistance: 0.5, rightMass: 1, rightDistance: 0.5 };
  const request = await requestFor(experimentFixture.artifact, { inputs });
  const done = await runReviewProgram(request, { workerFactory });
  assert.equal(done.ok, true, JSON.stringify(done));
  assert.equal(done.artifactHash, request.artifactHash);
  assert.deepEqual(done.trace, { inputs, time: 0, events: [], ticks: 0, readouts: { leftMoment: 0.5, rightMoment: 0.5, tilt: 0 } });
});

run('a game capture applies the events in order and reports the goal and state hash', async () => {
  const events = ['east', 'east', 'east', 'south'].map(action => ({ type: 'action', action }));
  const done = await runReviewProgram(await requestFor(gameFixture.artifact, { events }), { workerFactory });
  assert.equal(done.ok, true, JSON.stringify(done));
  assert.deepEqual(done.trace.events, events);
  assert.deepEqual(done.trace.readouts, { moves: 4 });
  assert.equal(done.trace.goal.status, 'playing');
  assert.equal(done.trace.stateHash, await sha256Hex(canonicalJson({ x: 3, z: 1, moves: 4, status: 'playing' })));
  assert.deepEqual(done.frame.nodes.robot.position, [3, 0.3, 1]);
});

run('a watch capture is shown at the requested time; a stepped capture advances its ticks', async () => {
  const watch = await runReviewProgram(await requestFor(watchFixture.artifact, { time: 2 }), { workerFactory });
  assert.equal(watch.trace.time, 2);
  assert.ok(Math.abs(watch.frame.nodes.moon.position[2] - 3) < 1e-9);
  const stepped = await withSource(gameFixture.artifact, `export function initialState() { return { ticks: 0 }; }
export function reduce({ state, event }) { return event.type === 'step' ? { ticks: state.ticks + 1 } : state; }
export function evaluate({ state }) { return { readouts: { moves: state.ticks }, goal: { status: 'playing' } }; }
`, copy => { copy.stepped = true; });
  const done = await runReviewProgram(await requestFor(stepped, { ticks: 30 }), { workerFactory });
  assert.equal(done.trace.ticks, 30);
  assert.deepEqual(done.trace.readouts, { moves: 30 });
  assert.ok(Math.abs(done.trace.time - 1) < 1e-9);
});

run('the page refuses a request it cannot honour before running anything', async () => {
  const base = await requestFor(gameFixture.artifact);
  const refusals = [
    [{ artifactHash: 'f'.repeat(64) }, 'artifact_hash_mismatch'],
    [{ events: Array(5).fill({ type: 'action', action: 'east' }) }, 'events must be a list'],
    [{ ticks: 3 }, 'ticks need a stepped scene'],
    [{ ticks: 91 }, 'ticks must be'],
    [{ leadTicks: 3 }, 'ticks need a stepped scene'],
    [{ leadTicks: 61, ticks: 30 }, 'leadTicks must be'],
    [{ seed: 2 }, 'seed_mismatch'],
    [{ events: [{ type: 'action', action: 'jump' }] }, 'events must be declared'],
    [{ view: { name: 'x', position: [0, 0], target: [0, 0, 0] } }, 'view must be'],
  ];
  for (const [change, expected] of refusals) {
    const done = await runReviewProgram({ ...base, ...change }, { workerFactory: () => assert.fail('no Worker for a refused request') });
    assert.equal(done.ok, false);
    assert.ok(done.error.includes(expected), `${expected}: ${done.error}`);
  }
  const incomplete = await requestFor(experimentFixture.artifact, { inputs: { leftMass: 1 } });
  assert.match((await runReviewProgram(incomplete, { workerFactory })).error, /complete, valid set/);
  assert.equal(reviewRequestProblem(null), 'request is not an object');
});

run('a failing program is a programError with its phase, never a pass', async () => {
  const cases = [
    ['export function evaluate( {', 'load'],
    ['export function evaluate() { return { nodes: { ghost: { visible: false } } }; }', 'evaluate'],
  ];
  for (const [source, phase] of cases) {
    const artifact = await withSource(experimentFixture.artifact, source);
    const done = await runReviewProgram(await requestFor(artifact, { inputs: { leftMass: 4, leftDistance: 1.5, rightMass: 2, rightDistance: 2 } }), { workerFactory });
    assert.equal(done.ok, false);
    assert.equal(done.programError.phase, phase, JSON.stringify(done));
  }
  const throwing = await withSource(gameFixture.artifact, gameFixture.artifact.program.source.replace("if (state.status !== 'playing'", "if (event.action === 'south') throw new Error('boom'); if (state.status !== 'playing'"));
  const done = await runReviewProgram(await requestFor(throwing, { events: [{ type: 'action', action: 'south' }] }), { workerFactory });
  assert.deepEqual({ code: done.programError.code, phase: done.programError.phase }, { code: 'runtime_error', phase: 'reduce' });
  assert.match(done.programError.diagnostic, /boom/);
});

// Round 4 (2026-11-03): a capture may spread its host steps over phases. { type: 'advance', ticks } runs steps at that point; { type: 'resume', action, probe }
// runs its probe steps and presses the action only if the state did not change over them, so a toggling action restarts a stopped scene and never pauses
// a running one. A scene that starts paused gains nothing from lead ticks before any action.
const TOGGLE = `export function initialState() { return { on: false, n: 0, saved: 0 }; }
export function reduce({ state, event }) {
  if (event.type === 'action' && event.action === 'run') return { ...state, on: !state.on };
  if (event.type === 'action' && event.action === 'save') return { ...state, saved: state.n, n: 0, on: false };
  if (event.type === 'step' && state.on) return { ...state, n: state.n + 1 };
  return state;
}
export function evaluate({ state }) {
  const s = state || initialState();
  return { nodes: { robot: { position: [s.n / 10, 0.3, 0] } }, readouts: { n: s.n, saved: s.saved, on: s.on ? 1 : 0 }, goal: { status: 'playing', message: 'x' } };
}
`;
const toggling = async () => {
  const { steppedGameArtifact } = await import('./testdata/stepped-game.mjs');
  const game = await steppedGameArtifact();
  return withSource(game, TOGGLE, copy => { copy.actions = [{ id: 'run', label: 'Run' }, { id: 'save', label: 'Save', startsMotion: false }]; copy.readouts = [{ id: 'n', label: 'N', decimals: 0 }, { id: 'saved', label: 'Saved', decimals: 0 }, { id: 'on', label: 'On', decimals: 0 }]; });
};
const act = action => ({ type: 'action', action }), advance = ticks => ({ type: 'advance', ticks }), resume = (action, probe) => ({ type: 'resume', action, probe });

run('a capture with an advance entry runs host steps at that point: a paused scene gains nothing from lead ticks, a started one does', async () => {
  const artifact = await toggling();
  const lead = await runReviewProgram(await requestFor(artifact, { events: [act('run')], leadTicks: 20, ticks: 0 }), { workerFactory });
  assert.deepEqual([lead.ok, lead.trace.readouts.n], [true, 0], 'lead ticks before Run: the scene was paused');
  const started = await runReviewProgram(await requestFor(artifact, { events: [act('run'), advance(20)], ticks: 0 }), { workerFactory });
  assert.equal(started.ok, true, JSON.stringify(started));
  assert.deepEqual([started.trace.readouts.n, started.trace.ticks], [20, 20], 'Run, then 20 steps: the scene moved');
  assert.deepEqual(started.trace.events, [act('run'), advance(20)], 'the trace echoes the sequence in order');
});

run('a resume presses its action only when the scene is idle: a stopped scene restarts, a running one is not paused by a second press', async () => {
  const artifact = await toggling();
  // Run, 10 steps, Save (stops the scene), resume Run after a 5-step probe (idle: pressed), 10 more steps.
  const stopped = await runReviewProgram(await requestFor(artifact, { events: [act('run'), advance(10), act('save'), resume('run', 5)], ticks: 10 }), { workerFactory });
  assert.equal(stopped.ok, true, JSON.stringify(stopped));
  assert.deepEqual([stopped.trace.readouts.saved, stopped.trace.readouts.n, stopped.trace.readouts.on, stopped.trace.ticks], [10, 10, 1, 25], 'ten points saved, the run restarted and drew ten more; 10 + 5 probe + 10 steps');
  // Run, 10 steps, resume Run after a 5-step probe: the scene is running, so Run is NOT pressed again (it would pause it).
  const running = await runReviewProgram(await requestFor(artifact, { events: [act('run'), advance(10), resume('run', 5)], ticks: 10 }), { workerFactory });
  assert.deepEqual([running.trace.readouts.n, running.trace.readouts.on, running.trace.ticks], [25, 1, 25], 'still running: the probe steps and the final steps all counted');
});

test('the limits hold across every phase: four actions, ninety host steps in all, and whole numbers', async () => {
  const ok = await requestFor(gameFixture.artifact, { events: [act('a'), advance(30), act('b'), advance(30), act('c'), act('d')], ticks: 30 });
  assert.equal(reviewRequestProblem(ok), null, 'four actions and 90 steps in all');
  assert.match(reviewRequestProblem({ ...ok, events: [...ok.events, act('e')] }), /events must be a list of at most 4/, 'a fifth action');
  assert.match(reviewRequestProblem({ ...ok, ticks: 31 }), /at most 90 in all/, 'ninety steps across lead, advance and final');
  assert.match(reviewRequestProblem({ ...ok, events: [act('a'), resume('a', 61)], ticks: 30 }), /at most 90 in all/, 'a resume probe counts');
  assert.match(reviewRequestProblem({ ...ok, events: [{ type: 'advance', ticks: 1.5 }] }), /advance is/);
  assert.match(reviewRequestProblem({ ...ok, events: [{ type: 'resume', action: 'a' }] }), /resume is/);
});

run('an advance or resume needs a stepped scene, and a resume must name a declared action', async () => {
  const unstepped = await runReviewProgram(await requestFor(experimentFixture.artifact, { inputs: { leftMass: 1, leftDistance: 0.5, rightMass: 1, rightDistance: 0.5 }, events: [advance(3)] }), { workerFactory });
  assert.deepEqual([unstepped.ok, unstepped.error], [false, 'ticks need a stepped scene']);
  const unknown = await runReviewProgram(await requestFor(await toggling(), { events: [resume('nope', 3)] }), { workerFactory });
  assert.deepEqual([unknown.ok, unknown.error], [false, 'events must be declared, non-step contract events']);
});

// Round 4b (2026-11-03, FX-AN-039): whether a scene is running cannot be read from whole-state hash equality over the probe. A periodic motion whose period divides the
// probe returns to the same state (equal hashes: it was taken for stopped, and a second press paused it); a paused scene whose hidden clock advances with every host step
// changes its state (unequal hashes: it was taken for running and never restarted). The drawn scene is what moves: the guard steps the probe one step at a time and the scene
// is running when its drawn nodes change between two consecutive steps, whatever the period; hidden state alone is not motion.
const PERIODIC = `export function initialState() { return { on: false, n: 0 }; }
export function reduce({ state, event }) {
  if (event.type === 'action' && event.action === 'run') return { ...state, on: !state.on };
  if (event.type === 'step' && state.on) return { ...state, n: (state.n + 1) % 6 };
  return state;
}
export function evaluate({ state }) {
  const s = state || initialState();
  return { nodes: { robot: { position: [s.n / 10, 0.3, 0] } }, readouts: { n: s.n, saved: 0, on: s.on ? 1 : 0 }, goal: { status: 'playing', message: 'x' } };
}
`;
const CLOCKED = `export function initialState() { return { on: false, n: 0, saved: 0, clock: 0 }; }
export function reduce({ state, event }) {
  if (event.type === 'action' && event.action === 'run') return { ...state, on: !state.on };
  if (event.type === 'action' && event.action === 'save') return { ...state, saved: state.n, n: 0, on: false };
  if (event.type === 'step') return { ...state, clock: state.clock + 1, n: state.on ? state.n + 1 : state.n };
  return state;
}
export function evaluate({ state }) {
  const s = state || initialState();
  return { nodes: { robot: { position: [s.n / 10, 0.3, 0] } }, readouts: { n: s.n, saved: s.saved, on: s.on ? 1 : 0 }, goal: { status: 'playing', message: 'x' } };
}
`;
const withProgram = async source => {
  const { steppedGameArtifact } = await import('./testdata/stepped-game.mjs');
  return withSource(await steppedGameArtifact(), source, copy => { copy.actions = [{ id: 'run', label: 'Run' }, { id: 'save', label: 'Save', startsMotion: false }]; copy.readouts = [{ id: 'n', label: 'N', decimals: 0 }, { id: 'saved', label: 'Saved', decimals: 0 }, { id: 'on', label: 'On', decimals: 0 }]; });
};

run('a periodic motion whose period divides the probe is still running: the resume does not press the toggle and pause it', async () => {
  const artifact = await withProgram(PERIODIC);
  // Run, 10 steps (n = 4), a 12-step probe: n returns to 4 (equal state hashes), but the scene moved at every step. Not pressed: still on.
  const done = await runReviewProgram(await requestFor(artifact, { events: [act('run'), advance(10), resume('run', 12)], ticks: 6 }), { workerFactory });
  assert.equal(done.ok, true, JSON.stringify(done));
  assert.deepEqual([done.trace.readouts.on, done.trace.ticks], [1, 28], 'running after the resume: 10 + 12 probe + 6 steps, never paused');
});

run('a paused scene whose clock advances with every host step is idle: the resume presses the action and the scene restarts', async () => {
  const artifact = await withProgram(CLOCKED);
  // Run, 10 steps, Save (stops it; the clock still ticks), resume Run after a 5-step probe: the state changes every step but nothing is drawn moving. Pressed.
  const done = await runReviewProgram(await requestFor(artifact, { events: [act('run'), advance(10), act('save'), resume('run', 5)], ticks: 10 }), { workerFactory });
  assert.equal(done.ok, true, JSON.stringify(done));
  assert.deepEqual([done.trace.readouts.saved, done.trace.readouts.n, done.trace.readouts.on], [10, 10, 1], 'ten saved, the run restarted and drew ten more');
});
