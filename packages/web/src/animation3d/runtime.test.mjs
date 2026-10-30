import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { LIMITS } from '../explain-program/limits.js';
import { hashProgramSource, validateAnimationSnapshot } from './contract.js';
import { experimentFixture, gameFixture, watchFixture } from './fixtures.js';
import { createAnimationRuntime, liveAnimationWorkers, MAX_STEPS_PER_FRAME } from './runtime.js';

// The runtime against the REAL pinned QuickJS engine (explain-program/runtime.js runProgram, the same call worker.js makes). Only
// the Worker is an in-process stand-in speaking worker.js's message protocol; tamper lets a test drop, corrupt or precede a reply.
// The browser Worker itself is covered by CI browser checks. Skipped where the engine is not installed.
let engineModule = null;
try { engineModule = await import('../explain-program/runtime.js'); } catch { engineModule = null; }
const run = engineModule ? test : test.skip;
let engine;
before(async () => { if (engineModule) engine = await engineModule.loadEngine(); });
after(() => engine?.dispose?.());

const flush = async (rounds = 30) => { for (let i = 0; i < rounds; i += 1) await new Promise(resolve => setImmediate(resolve)); };
function workers({ tamper = data => data } = {}) {
  const log = { started: 0, operations: [] };
  const factory = () => {
    log.started += 1;
    const worker = {
      terminated: false,
      terminate() { worker.terminated = true; },
      postMessage(message) {
        log.operations.push(message.operation);
        queueMicrotask(() => {
          if (worker.terminated) return;
          const data = tamper({ id: message.id, ...engineModule.runProgram(engine, message) }, message, worker);
          if (data && !worker.terminated) worker.onmessage?.({ data });
        });
      },
    };
    queueMicrotask(() => worker.onmessage?.({ data: { ready: true } }));
    return worker;
  };
  return { factory, log };
}
function manualClock() {
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
const withSource = async (artifact, source, change = () => {}) => {
  const copy = structuredClone(artifact);
  copy.program.source = source;
  copy.program.sourceHash = await hashProgramSource(source);
  change(copy);
  return copy;
};
const start = (artifact, options = {}) => {
  const frames = [], errors = [];
  const runtime = createAnimationRuntime({ artifact, onFrame: (frame, meta) => frames.push({ frame, ...meta }), onError: error => errors.push(error), ...options });
  return { runtime, frames, errors };
};

run('admission: the artifact, its program tuple and its sourceHash are checked before any Worker starts', async () => {
  const { factory, log } = workers();
  const tampered = structuredClone(experimentFixture.artifact);
  tampered.program.source = tampered.program.source.replace('5 * (left - right)', '50 * (left - right)');
  await assert.rejects(start(tampered, { workerFactory: factory }).runtime.ready, { code: 'invalid_program' });
  const physics = { ...experimentFixture.artifact, behavior: 'physics' };
  await assert.rejects(start(physics, { workerFactory: factory }).runtime.ready, { code: 'invalid_artifact' });
  assert.equal(log.started, 0);
});

run('a watch scene starts paused at its initial frame with a valid snapshot', async () => {
  const { factory } = workers();
  const { runtime, frames } = start(watchFixture.artifact, { workerFactory: factory });
  await runtime.ready;
  assert.deepEqual(frames[0].frame.nodes.moon.position, [3, 0, 0]);
  const snapshot = runtime.snapshot();
  assert.equal(snapshot.paused, true);
  assert.equal(validateAnimationSnapshot(snapshot, watchFixture.artifact).ok, true);
  runtime.dispose();
});

run('rapid parameter input applies in order, coalesces and ends on the newest values', async () => {
  const { factory, log } = workers();
  const { runtime, frames } = start(experimentFixture.artifact, { workerFactory: factory });
  await runtime.ready;
  const results = await Promise.all([5, 6, 7].map(value => runtime.dispatch({ type: 'parameter', parameter: 'leftMass', value }))
    .concat(runtime.dispatch({ type: 'parameter', parameter: 'leftDistance', value: 2 })));
  assert.ok(results.every(result => result.accepted));
  assert.deepEqual(runtime.snapshot().inputs, { leftMass: 7, leftDistance: 2, rightMass: 2, rightDistance: 2 });
  assert.deepEqual(frames.at(-1).frame.readouts, { leftMoment: 14, rightMoment: 4, tilt: 20 });
  assert.equal(log.operations.filter(operation => operation === 'evaluate').length, 4, 'initial, 5, 7 (6 coalesced), distance');
  assert.equal((await runtime.dispatch({ type: 'parameter', parameter: 'leftMass', value: 11 })).reason, 'invalid_event');
  runtime.dispose();
});

run('game rules run through reduce; undeclared and host-owned events are refused without the Worker', async () => {
  const { factory, log } = workers();
  const { runtime, frames } = start(gameFixture.artifact, { workerFactory: factory });
  await runtime.ready;
  for (const action of ['east', 'east', 'east', 'south', 'south']) assert.equal((await runtime.dispatch({ type: 'action', action })).accepted, true);
  assert.deepEqual(frames.at(-1).frame.goal, { status: 'won', message: 'On target.' });
  assert.deepEqual(runtime.snapshot().state, { x: 3, z: 2, moves: 5, status: 'won' });
  const before = log.operations.length;
  assert.equal((await runtime.dispatch({ type: 'action', action: 'jump' })).reason, 'invalid_event');
  assert.equal((await runtime.dispatch({ type: 'step', tick: 1 })).reason, 'invalid_event', 'not a stepped scene');
  assert.equal(log.operations.length, before);
  runtime.dispose();
});

run('reset during a pending transition wins; the late result is stale and stamps keep growing', async () => {
  const { factory } = workers();
  const { runtime } = start(gameFixture.artifact, { workerFactory: factory });
  await runtime.ready;
  await runtime.dispatch({ type: 'action', action: 'east' });
  const stampBefore = runtime.snapshot().stamp;
  const pending = runtime.dispatch({ type: 'action', action: 'east' });
  const queued = runtime.dispatch({ type: 'action', action: 'south' });
  const reset = runtime.reset();
  assert.equal((await pending).reason, 'stale');
  assert.equal((await queued).reason, 'reset');
  assert.equal((await reset).accepted, true);
  const snapshot = runtime.snapshot();
  assert.deepEqual(snapshot.state, { x: 0, z: 0, moves: 0, status: 'playing' });
  assert.ok(snapshot.stamp > stampBefore);
  runtime.dispose();
});

run('invalid initial output fails ready; invalid reset output keeps the last good state', async () => {
  const bad = await withSource(experimentFixture.artifact, 'export function evaluate() { return { nodes: { ghost: { visible: false } } }; }');
  await assert.rejects(start(bad, { workerFactory: workers().factory }).runtime.ready, { code: 'invalid_output' });

  let initializes = 0;
  const { factory } = workers({ tamper: (data, message) => (message.operation === 'initialize' && ++initializes === 2 ? { ...data, value: 'not a state' } : data) });
  const { runtime, errors } = start(gameFixture.artifact, { workerFactory: factory });
  await runtime.ready;
  await runtime.dispatch({ type: 'action', action: 'east' });
  const good = runtime.snapshot();
  const reset = await runtime.reset();
  assert.equal(reset.accepted, false);
  assert.equal(reset.reason, 'invalid_output');
  assert.deepEqual(runtime.snapshot().state, good.state);
  assert.equal(runtime.snapshot().stamp, good.stamp);
  assert.equal(errors.at(-1).code, 'invalid_output');
  runtime.dispose();
});

run('a Worker that misses its watchdog is replaced; the failed event changes nothing', async () => {
  let reduces = 0;
  const { factory, log } = workers({ tamper: (data, message) => (message.operation === 'reduce' && ++reduces === 1 ? null : data) });
  const { runtime, errors } = start(gameFixture.artifact, { workerFactory: factory, limits: { ...LIMITS, watchdogMs: 40 } });
  await runtime.ready;
  const good = runtime.snapshot();
  const timedOut = await runtime.dispatch({ type: 'action', action: 'east' });
  assert.equal(timedOut.reason, 'runtime_limit');
  assert.equal(errors.at(-1).code, 'runtime_limit');
  assert.deepEqual(runtime.snapshot().state, good.state);
  assert.equal((await runtime.dispatch({ type: 'action', action: 'east' })).accepted, true);
  assert.equal(log.started, 2, 'a fresh Worker after the terminated one');
  runtime.dispose();
});

run('late and foreign Worker messages are ignored', async () => {
  const { factory } = workers({
    tamper: (data, message, worker) => {
      worker.onmessage?.({ data: { ...data, id: 'old', value: { x: 9, z: 9, moves: 99, status: 'won' } } });
      worker.onmessage?.({ data: { ...data, operation: message.operation === 'reduce' ? 'evaluate' : 'reduce', value: {} } });
      return data;
    },
  });
  const { runtime } = start(gameFixture.artifact, { workerFactory: factory });
  await runtime.ready;
  await runtime.dispatch({ type: 'action', action: 'south' });
  assert.deepEqual(runtime.snapshot().state, { x: 0, z: 1, moves: 1, status: 'playing' });
  runtime.dispose();
});

run('a watch loop maps time into its duration without drift and never erases inputs', async () => {
  const source = `export function evaluate({ inputs, time }) {
  const a = 2 * Math.PI * time / 8;
  return { nodes: { moon: { position: [inputs.radius * Math.cos(a), 0, inputs.radius * Math.sin(a)] } }, readouts: { angle: 360 * time / 8 } };
}
`;
  const artifact = await withSource(watchFixture.artifact, source, copy => { copy.parameters = [{ type: 'number', id: 'radius', label: 'Radius', min: 1, max: 5, default: 3 }]; });
  const clock = manualClock();
  const { factory } = workers();
  const { runtime, frames } = start(artifact, { workerFactory: factory, clock });
  await runtime.ready;
  assert.equal(runtime.play().accepted, true);
  assert.equal((await runtime.dispatch({ type: 'parameter', parameter: 'radius', value: 4 })).accepted, true);
  clock.frame(16);
  await flush();
  clock.frame(3 * 8000 + 2000 - 16); // three whole loops and two seconds
  await flush();
  const last = frames.at(-1);
  assert.equal(last.time, 2);
  assert.ok(Math.abs(last.frame.nodes.moon.position[2] - 4) < 1e-9 && Math.abs(last.frame.nodes.moon.position[0]) < 1e-9);
  assert.deepEqual(runtime.snapshot().inputs, { radius: 4 });
  assert.equal(runtime.setSpeed(2).accepted, true);
  assert.equal(runtime.setSpeed(3).reason, 'invalid_speed');
  runtime.pause();
  clock.t += 5000;
  assert.equal(runtime.snapshot().time, 2, 'pause keeps the moment');
  assert.equal(runtime.snapshot().paused, true);
  assert.equal((await runtime.seek(4)).accepted, true);
  assert.deepEqual(runtime.snapshot().time, 4);
  runtime.dispose();
});

run('seek, speed and play are refused where the behavior does not support them', async () => {
  const game = start(gameFixture.artifact, { workerFactory: workers().factory });
  const experiment = start(experimentFixture.artifact, { workerFactory: workers().factory });
  await Promise.all([game.runtime.ready, experiment.runtime.ready]);
  assert.equal(game.runtime.setSpeed(2).reason, 'unsupported');
  assert.equal((await game.runtime.seek(1)).reason, 'unsupported');
  assert.equal(game.runtime.play().reason, 'unsupported');
  assert.equal(experiment.runtime.play().reason, 'unsupported');
  game.runtime.dispose();
  experiment.runtime.dispose();
});

run('a stepped rules scene advances a fixed dt, at most two steps per displayed frame, and pauses on sustained overload', async () => {
  const source = `export function initialState() { return { ticks: 0 }; }
export function reduce({ state, event }) { return event.type === 'step' ? { ticks: state.ticks + 1 } : state; }
export function evaluate({ state }) { return { nodes: { robot: { position: [state.ticks / 30, 0.3, 0] } }, readouts: { moves: state.ticks }, goal: { status: 'playing' } }; }
`;
  const artifact = await withSource(gameFixture.artifact, source, copy => { copy.stepped = true; });
  const clock = manualClock();
  const { factory, log } = workers();
  const { runtime, errors } = start(artifact, { workerFactory: factory, clock });
  await runtime.ready;
  assert.equal(runtime.play().accepted, true);
  for (let i = 0; i < 2; i += 1) {
    const reducesBefore = log.operations.filter(operation => operation === 'reduce').length;
    clock.frame(100); // 3 steps owed, at most 2 run
    await flush();
    assert.equal(log.operations.filter(operation => operation === 'reduce').length - reducesBefore, MAX_STEPS_PER_FRAME);
  }
  assert.equal(runtime.snapshot().tick, 4);
  assert.ok(Math.abs(runtime.snapshot().time - 4 / 30) < 1e-12);
  clock.frame(250);
  clock.frame(250);
  clock.frame(250); // the queued steps have not run: the backlog passes OVERLOAD_STEPS
  await flush();
  assert.equal(errors.at(-1).code, 'overloaded');
  assert.equal(runtime.snapshot().paused, true);
  assert.equal(runtime.snapshot().tick, 6, 'the accepted steps are kept');
  runtime.dispose();
});

run('a saved snapshot restores paused without initialize; dispose settles pending work and frees the Worker', async () => {
  const first = start(gameFixture.artifact, { workerFactory: workers().factory });
  await first.runtime.ready;
  await first.runtime.dispatch({ type: 'action', action: 'south' });
  const saved = first.runtime.snapshot();
  first.runtime.dispose();
  const { factory, log } = workers();
  const second = start(gameFixture.artifact, { workerFactory: factory, saved });
  await second.runtime.ready;
  assert.deepEqual(second.runtime.snapshot().state, saved.state);
  assert.ok(!log.operations.includes('initialize'));
  const pending = second.runtime.dispatch({ type: 'action', action: 'east' });
  second.runtime.dispose();
  assert.equal((await pending).accepted, false);
  assert.equal(liveAnimationWorkers(), 0);
  const stale = start(gameFixture.artifact, { workerFactory: workers().factory, saved: { ...saved, revision: 2 } });
  await stale.runtime.ready;
  assert.deepEqual(stale.runtime.snapshot().state, { x: 0, z: 0, moves: 0, status: 'playing' }, 'a snapshot of another revision starts fresh');
  stale.runtime.dispose();
});
