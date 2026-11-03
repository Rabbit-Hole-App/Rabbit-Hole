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
