// Task 8.2: ordered state transitions and the saved state envelope, on the real host and packaged engine (a Worker stand-in).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sealProgram } from './contract.js';
import { LIMITS } from './limits.js';
import { PROGRAM_STAMPS, STATEFUL_PROGRAM_STAMPS } from './stamps.js';
import { createProgramHost } from './host.js';
import { loadEngine, runProgram } from './runtime.js';
import { ACTION_QUEUE_CAP, createInteractionController } from './interaction.js';
import { keptProgram, programStateFor, resetProgram, shownProgram } from './program-card.js';
import { growthFixture } from './fixtures.js';

const engine = loadEngine();
const GUEST_LIMITS = { ...LIMITS, interruptMs: 150 }; // test-only, below the 250 ms watchdog
const standIn = () => {
  const worker = {
    terminate() { worker.dead = true; },
    postMessage({ id, operation, source, request }) {
      engine.then(e => { const out = runProgram(e, { source, request, operation }, GUEST_LIMITS); setTimeout(() => !worker.dead && worker.onmessage?.({ data: { id, ...out } }), 0); });
    },
  };
  engine.then(() => setTimeout(() => worker.onmessage?.({ data: { ready: true } }), 0));
  return worker;
};

const MANIFEST = {
  title: 'Counter', summary: 'A count that buttons change.', assumptions: [], description: 'A number in a box.',
  inputs: [{ type: 'number', id: 'step', label: 'Step', default: 1, min: 1, max: 5 }], readouts: [], capabilities: [],
  viewport: { width: 400, height: 300 },
  actions: [{ id: 'add', label: 'Add' }, { id: 'roll', label: 'Roll' }, { id: 'explode', label: 'Explode' }, { id: 'undrawable', label: 'Undrawable' }],
  targets: [],
};
// The random draw advances by a counter kept in the state, so a seed and the same events give the same state.
const COUNTER = `export function initialState({ inputs, seed }) { return { count: 0, draws: [], n: 0, seed }; }
export function reduce({ state, event, inputs }) {
  if (event.type === 'input') return { ...state, step: event.value };
  if (event.action === 'add') return { ...state, count: state.count + inputs.step };
  if (event.action === 'explode') throw new Error('broken transition');
  if (event.action === 'undrawable') return { ...state, count: -1 };
  let r = 0; for (let i = 0; i <= state.n; i++) r = Math.random();
  return { ...state, n: state.n + 1, draws: [...state.draws, Math.floor(r * 1000)] };
}
export function evaluate({ state }) {
  if (state.count < 0) return { frame: { width: 400, height: 300, objects: [{ kind: 'nope', id: 'x' }] }, quantities: {} };
  return { frame: { width: 400, height: 300, objects: [sdk.text('n', 10, 20, String(state.count))] }, quantities: { count: state.count } };
}`;
const seal = async (source = COUNTER) => {
  const sealed = await sealProgram({ manifest: MANIFEST, source }, STATEFUL_PROGRAM_STAMPS);
  assert.equal(sealed.ok, true, sealed.issue);
  return sealed.value;
};
const INPUTS = { step: 2 };
const add = { type: 'action', action: 'add' };

// A controller on a real host, recording what it published and saved and every host call.
function card(artifact, { saved = null, seed = 0, cap, frames = true } = {}) {
  const host = createProgramHost({ artifact, createWorker: standIn });
  const calls = [], published = [], persisted = [], failures = [];
  const counted = Object.fromEntries(['initialize', 'reduce', 'evaluate'].map(op => [op, (raw, options) => { calls.push(op); return host[op](raw, options); }]));
  const controller = createInteractionController({
    host: counted, bundleHash: artifact.bundleHash, seed, saved, cap,
    publish: next => published.push(next), persist: next => persisted.push(JSON.parse(JSON.stringify(next))), fail: error => failures.push(error),
    // The card's frame check: the new state's frame through the same host, validated.
    check: frames ? async next => { await counted.evaluate({ requestId: `c${next.revision}`, inputs: INPUTS, time: 0, seed, state: next.state }, { supersede: false }); } : undefined,
  });
  // Settled: no new host call for 60 ms and nothing queued.
  const idle = async () => { let last = -1; while (last !== calls.length || controller.pending()) { last = calls.length; await new Promise(r => setTimeout(r, 60)); } };
  return { host, controller, calls, published, persisted, failures, idle, dispose: () => { controller.dispose(); host.dispose(); } };
}

test('three fast clicks apply three transitions exactly once, in order, each to the state the previous one produced', async () => {
  const c = card(await seal());
  c.controller.start(INPUTS);
  assert.deepEqual([c.controller.dispatch(add, { inputs: INPUTS }), c.controller.dispatch(add, { inputs: INPUTS }), c.controller.dispatch(add, { inputs: INPUTS })], [true, true, true]);
  await c.idle();
  assert.equal(c.calls.filter(op => op === 'reduce').length, 3, 'one reduce per click');
  assert.deepEqual(c.persisted.map(e => [e.revision, e.state.count]), [[1, 2], [2, 4], [3, 6]]);
  assert.equal(c.controller.current().state.count, 6);
  assert.deepEqual(c.failures, []);
  c.dispose();
});

test('a full queue refuses the next event instead of growing; consecutive changes of one input coalesce, never across an action', async () => {
  assert.equal(ACTION_QUEUE_CAP, 16);
  const c = card(await seal(), { cap: 2 });
  c.controller.start(INPUTS);
  // Before initialization finishes nothing runs, so the queue fills.
  assert.deepEqual([add, add, add].map(event => c.controller.dispatch(event, { inputs: INPUTS })), [true, true, false]);
  await c.idle();
  assert.equal(c.controller.current().state.count, 4, 'the refused click never applied');
  const input = value => ({ type: 'input', input: 'step', value });
  const d = card(await seal());
  d.controller.start(INPUTS);
  for (const event of [input(2), input(3), input(4), add, input(5)]) d.controller.dispatch(event, { inputs: INPUTS });
  assert.equal(d.controller.pending(), 3, 'input 2..4 became one change; the action and the change after it stay');
  await d.idle();
  assert.deepEqual(d.persisted.map(e => [e.state.step, e.state.count]), [[4, 0], [4, 2], [5, 2]]);
  c.dispose(); d.dispose();
});

test('a failed transition or an undrawable state keeps the last accepted state', async () => {
  const c = card(await seal());
  c.controller.start(INPUTS);
  c.controller.dispatch(add, { inputs: INPUTS });
  c.controller.dispatch({ type: 'action', action: 'explode' }, { inputs: INPUTS });
  c.controller.dispatch(add, { inputs: INPUTS }); // dropped with the failure: the card stops and shows its message
  await c.idle();
  assert.deepEqual([c.failures.length, c.failures[0].code], [1, 'runtime_error']);
  assert.deepEqual([c.controller.current().revision, c.controller.current().state.count], [1, 2]);
  c.controller.dispatch({ type: 'action', action: 'undrawable' }, { inputs: INPUTS });
  await c.idle();
  assert.deepEqual([c.failures.length, c.failures[1].code], [2, 'invalid_output']);
  assert.equal(c.controller.current().state.count, 2, 'a state whose frame is invalid is never committed');
  assert.equal(c.persisted.length, 1, 'and never saved');
  c.dispose();
});

test('reset initializes again with the original seed; a transition asked before it never lands after it', async () => {
  const c = card(await seal(), { seed: 7 });
  c.controller.start(INPUTS);
  await c.idle();
  c.controller.dispatch(add, { inputs: INPUTS });
  c.controller.reset(INPUTS); // while that reduce may still be in flight
  await c.idle();
  const now = c.controller.current();
  assert.deepEqual([now.state.count, now.state.seed, now.seed], [0, 7, 7]);
  assert.ok(now.revision > 0, 'revisions only grow, so a frame of the state before reset cannot match');
  assert.equal(c.published.at(-1), now);
  c.dispose();
});

test('the same seed and the same ordered events reproduce the same state', async () => {
  const artifact = await seal();
  const runs = [];
  for (const seed of [3, 3, 4]) {
    const c = card(artifact, { seed });
    c.controller.start(INPUTS);
    for (let i = 0; i < 4; i++) c.controller.dispatch({ type: 'action', action: 'roll' }, { inputs: INPUTS });
    await c.idle();
    runs.push(c.controller.current().state.draws);
    c.dispose();
  }
  assert.deepEqual(runs[0], runs[1]);
  assert.equal(new Set(runs[0]).size, 4, 'the counter in the state advances the sequence');
  assert.notDeepEqual(runs[0], runs[2]);
});

test('disposal and an owner reload restore the accepted state without initializing again', async () => {
  const artifact = await seal();
  const first = card(artifact);
  first.controller.start(INPUTS);
  for (let i = 0; i < 3; i++) first.controller.dispatch(add, { inputs: INPUTS });
  await first.idle();
  // The owner's quiet save, then the board reloads as JSON and the card mounts on a new host.
  const block = JSON.parse(JSON.stringify({ id: 'card-1', type: 'animation', program: { bundleHash: artifact.bundleHash }, programState: first.persisted.at(-1) }));
  first.dispose();
  const saved = programStateFor(block, artifact);
  assert.deepEqual(saved, first.persisted.at(-1));
  const second = card(artifact, { saved, seed: saved.seed });
  second.controller.start(INPUTS);
  assert.equal(second.controller.current().state.count, 6, 'rehydrated at once');
  second.controller.dispatch(add, { inputs: INPUTS });
  await second.idle();
  assert.equal(second.calls.includes('initialize'), false, 'a restart is not a replay');
  assert.deepEqual([second.controller.current().revision, second.controller.current().state.count], [4, 8]);
  second.dispose();
});

test('a saved state is used only for its own artifact and only while it fits the state rule', async () => {
  const artifact = await seal();
  const good = { bundleHash: artifact.bundleHash, state: { count: 1 }, revision: 2, seed: 0 };
  assert.deepEqual(programStateFor({ programState: good }, artifact), good);
  assert.equal(programStateFor({ programState: { ...good, bundleHash: 'f'.repeat(64) } }, artifact), null, 'another artifact: incompatible');
  assert.equal(programStateFor({ programState: good }, { ...artifact, schemaVersion: 1 }), null, 'a schema 1 card has no state');
  for (const bad of [{ state: { n: 'x'.repeat(LIMITS.stateBytes) } }, { state: [] }, { revision: -1 }, { revision: 1.5 }, { seed: -1 }, { seed: 2 ** 32 }]) {
    assert.equal(programStateFor({ programState: { ...good, ...bad } }, artifact), null, JSON.stringify(bad).slice(0, 60));
  }
  assert.deepEqual(Object.keys(programStateFor({ programState: { ...good, source: 'export function evaluate() {}' } }, artifact)), ['bundleHash', 'state', 'revision', 'seed'], 'nothing else is carried');
  assert.equal(resetProgram({ id: 'c', programState: good, inputs: { step: 3 }, time: 2 }).programState, undefined, 'reset drops the saved state');
});

test('a share-link visitor keeps their state in memory: a reload shows the saved shared card and nothing is written', async () => {
  const artifact = await seal();
  const savedCard = { id: 'card-1', type: 'animation', program: { bundleHash: artifact.bundleHash }, explain: { resultId: 'er_1' }, programState: { bundleHash: artifact.bundleHash, state: { count: 10, draws: [], n: 0, seed: 0 }, revision: 5, seed: 0 } };
  const before = JSON.stringify(savedCard);
  let kept = null; // ProgramScene's local copy for a token visitor: its persist is keep, never the board save
  const c = card(artifact, { saved: programStateFor(savedCard, artifact) });
  c.controller.start(INPUTS);
  c.controller.dispatch(add, { inputs: INPUTS });
  await c.idle();
  kept = keptProgram(savedCard, { ...shownProgram(savedCard, kept), programState: c.persisted.at(-1) });
  assert.equal(shownProgram(savedCard, kept).programState.state.count, 12, 'the visitor sees their own click');
  assert.equal(JSON.stringify(savedCard), before, 'the saved shared card is not changed');
  // Reload: nothing kept, so the card is exactly the saved shared card, at the owner's saved state.
  kept = null;
  assert.equal(shownProgram(savedCard, kept), savedCard);
  assert.equal(programStateFor(shownProgram(savedCard, kept), artifact).state.count, 10);
  c.dispose();
});

test('a schema 1 card never takes a saved state', async () => {
  const sealed = await sealProgram({ manifest: growthFixture.manifest, source: growthFixture.source }, PROGRAM_STAMPS);
  assert.equal(sealed.ok, true, sealed.issue);
  assert.equal(programStateFor({ programState: { bundleHash: sealed.value.bundleHash, state: {}, revision: 0, seed: 0 } }, sealed.value), null);
});
