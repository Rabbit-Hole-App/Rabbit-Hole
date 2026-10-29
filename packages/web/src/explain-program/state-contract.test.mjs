// Task 8.1: the stateful contract (schema 2) beside an unchanged schema 1. State, events and manifest bounds; the exact version
// allowlist; initialize/reduce/evaluate through the real host on the packaged engine; the saved cooling card still runs as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CONTRACT_LIMITS, PROGRAM_VERSIONS, computeHashes, parseArtifact, parseEvent, parseGuestResult, parseManifest, parseState, sealProgram, stateProblem, verifyHashes,
} from './contract.js';
import { LIMITS } from './limits.js';
import { PROGRAM_STAMPS, STATEFUL_PROGRAM_STAMPS, SUPPORTED_PROGRAM_TUPLES } from './stamps.js';
import { createProgramHost } from './host.js';
import { loadEngine, runProgram } from './runtime.js';
import { growthFixture } from './fixtures.js';

const engine = loadEngine();
const GUEST_LIMITS = { ...LIMITS, interruptMs: 150 }; // test-only, below the 250 ms watchdog, so a loaded machine does not fail a valid run
const workers = new Set();
const standIn = () => {
  const worker = {
    terminate() { workers.delete(worker); worker.dead = true; },
    postMessage({ id, operation, source, request }) {
      engine.then(e => { const out = runProgram(e, { source, request, operation }, GUEST_LIMITS); setTimeout(() => !worker.dead && worker.onmessage?.({ data: { id, ...out } }), 0); });
    },
  };
  workers.add(worker);
  engine.then(() => setTimeout(() => worker.onmessage?.({ data: { ready: true } }), 0));
  return worker;
};
const settled = promise => promise.then(value => ({ value }), error => ({ error }));

const MANIFEST = {
  title: 'Counter', summary: 'A count that buttons change.', assumptions: [], description: 'A number in a box.',
  inputs: [{ type: 'number', id: 'step', label: 'Step', default: 1, min: 1, max: 5 }, { type: 'select', id: 'tone', label: 'Tone', default: 'calm', options: [{ value: 'calm', label: 'Calm' }, { value: 'loud', label: 'Loud' }] }],
  readouts: [], capabilities: [],
  viewport: { width: 400, height: 300 }, actions: [{ id: 'add', label: 'Add' }, { id: 'reset', label: 'Reset' }], targets: [{ id: 'count-box', label: 'The count' }],
};
const COUNTER = `export function initialState({ inputs }) { return { count: 0, selected: null, step: inputs.step }; }
export function reduce({ state, event, inputs }) {
  if (event.type === 'action' && event.action === 'add') return { ...state, count: state.count + inputs.step };
  if (event.type === 'action' && event.action === 'reset') return { ...state, count: 0 };
  if (event.type === 'select') return { ...state, selected: event.target };
  return { ...state, last: event.value };
}
export function evaluate({ state }) {
  return { frame: { width: 400, height: 300, objects: [sdk.box('count-box', 10, 10, 100, 40, { text: String(state.count) })] }, quantities: { count: state.count } };
}`;
const sealV2 = async (source = COUNTER, manifest = MANIFEST, stamps = STATEFUL_PROGRAM_STAMPS) => {
  const sealed = await sealProgram({ manifest, source }, stamps);
  assert.equal(sealed.ok, true, sealed.issue);
  return sealed.value;
};
const init = (n = 1) => ({ requestId: `i${n}`, inputs: { step: 2, tone: 'calm' }, seed: 0 });
const reduceReq = (n, state, event) => ({ requestId: `r${n}`, state, event, inputs: { step: 2, tone: 'calm' }, time: 0, seed: 0 });
const evalReq = (n, state) => ({ requestId: `e${n}`, inputs: { step: 2, tone: 'calm' }, time: 0, seed: 0, state });

// ---- state ------------------------------------------------------------------------------------------------------------

const nest = (objects, leaf) => { let value = leaf; for (let i = 0; i < objects; i++) value = { a: value }; return value; };

test('state: the largest valid state passes and one byte more fails, measured as canonical UTF-8', () => {
  assert.equal(CONTRACT_LIMITS.stateBytes, 32 * 1024);
  assert.equal(LIMITS.stateBytes, CONTRACT_LIMITS.stateBytes, 'one limit: the runtime policy reuses the contract value');
  const at = { s: 'x'.repeat(CONTRACT_LIMITS.stateBytes - 8) }; // {"s":"..."} is 8 bytes plus the string
  assert.equal(stateProblem(at), null);
  assert.match(stateProblem({ s: 'x'.repeat(CONTRACT_LIMITS.stateBytes - 7) }), /over 32768 bytes/);
  assert.match(stateProblem({ s: 'é'.repeat((CONTRACT_LIMITS.stateBytes - 8) / 2 + 1) }), /over 32768 bytes/, 'bytes, not characters');
});

test('state: the deepest valid state passes and one level more fails (the root is level 1, as for guest output)', () => {
  assert.equal(stateProblem(nest(CONTRACT_LIMITS.depth - 1, 1)), null, 'a number at level 32');
  assert.equal(stateProblem(nest(CONTRACT_LIMITS.depth - 1, {})), null, 'an empty object at level 32');
  assert.match(stateProblem(nest(CONTRACT_LIMITS.depth, 1)), /nested deeper than 32/);
  assert.match(stateProblem(nest(CONTRACT_LIMITS.depth, {})), /nested deeper than 32/);
});

test('state: non-finite numbers, non-JSON values and non-objects fail', () => {
  class Thing { constructor() { this.a = 1; } }
  for (const bad of [{ n: Number.NaN }, { n: Infinity }, { n: -Infinity }, { b: 10n }, { f: () => 1 }, { a: [undefined] }, { d: new Date(0) }, { m: new Map() }, new Thing(), { s: Symbol('s') }]) {
    assert.notEqual(stateProblem(bad), null, String(Object.keys(bad)));
    assert.equal(parseState(bad).error.code, 'invalid_output');
  }
  for (const notObject of [null, undefined, 1, 'state', true, [], [1]]) assert.match(stateProblem(notObject), /must be a JSON object/);
  assert.equal(parseState({ a: [1, 'two', null, true, { b: -0.5 }] }).ok, true);
});

// ---- events -----------------------------------------------------------------------------------------------------------

test('events: only declared actions, targets and allowed input values pass; drag is reserved; nothing else crosses', () => {
  const manifest = parseManifest(MANIFEST, 2).value;
  for (const ok of [{ type: 'action', action: 'add' }, { type: 'select', target: 'count-box' }, { type: 'input', input: 'step', value: 5 }, { type: 'input', input: 'tone', value: 'loud' }]) {
    assert.equal(parseEvent(ok, manifest).ok, true, JSON.stringify(ok));
  }
  const refused = [
    { type: 'action', action: 'delete' }, { type: 'select', target: 'other-box' }, { type: 'input', input: 'speed', value: 1 },
    { type: 'input', input: 'step', value: 6 }, { type: 'input', input: 'step', value: '3' }, { type: 'input', input: 'tone', value: 'quiet' },
    { type: 'action', action: 'add', target: 'count-box' }, { type: 'action', action: 'add', handler: 'x' }, { type: 'hover', target: 'count-box' },
    { type: 'select', target: { id: 'count-box' } }, { type: 'action' }, {}, null, 'add', [],
  ];
  for (const bad of refused) {
    const out = parseEvent(bad, manifest);
    assert.deepEqual([out.ok, out.error?.code], [false, 'invalid_program'], JSON.stringify(bad));
  }
  for (const type of ['drag_start', 'drag_move', 'drag_end']) assert.equal(parseEvent({ type, target: 'count-box', x: 1, y: 2 }, manifest).error.code, 'unsupported_capability');
});

// ---- manifest and artifact --------------------------------------------------------------------------------------------

test('schema 2 manifest: viewport required, at most 8 actions and 8 targets, unique ids, still inside 4 KiB; schema 1 unchanged', () => {
  assert.equal(parseManifest(MANIFEST, 2).ok, true, parseManifest(MANIFEST, 2).issue);
  const { viewport, ...noViewport } = MANIFEST;
  assert.equal(parseManifest(noViewport, 2).ok, false);
  const many = n => Array.from({ length: n }, (_, i) => ({ id: `a${i}`, label: `Item ${i}` }));
  assert.equal(parseManifest({ ...MANIFEST, actions: many(8), targets: many(8) }, 2).ok, true);
  assert.equal(parseManifest({ ...MANIFEST, actions: many(9) }, 2).ok, false);
  assert.equal(parseManifest({ ...MANIFEST, targets: many(9) }, 2).ok, false);
  assert.match(parseManifest({ ...MANIFEST, actions: [{ id: 'add', label: 'A' }, { id: 'add', label: 'B' }] }, 2).issue, /actions ids must be unique/);
  assert.equal(parseManifest({ ...MANIFEST, viewport: { width: 5000, height: 300 } }, 2).ok, false, 'the Frame dimension bound');
  const big = { ...MANIFEST, actions: many(8), targets: many(8), description: 'd'.repeat(600), summary: 's'.repeat(400), assumptions: Array.from({ length: 8 }, () => 'y'.repeat(300)) };
  assert.match(parseManifest(big, 2).issue, /over 4096 bytes/);
  // Schema 1 reads exactly as before: none of the schema 2 fields are known to it.
  assert.equal(parseManifest(growthFixture.manifest).ok, true);
  for (const key of ['viewport', 'actions', 'targets']) assert.equal(parseManifest({ ...growthFixture.manifest, [key]: MANIFEST[key] }).ok, false, key);
});

test('schema 2 artifacts seal and hash with schemaVersion 2; versions and manifests never mix', async () => {
  const artifact = await sealV2();
  assert.equal(artifact.schemaVersion, 2);
  assert.equal(await verifyHashes(artifact), true);
  assert.equal(parseArtifact(artifact).ok, true);
  assert.equal((await sealProgram({ manifest: MANIFEST, source: COUNTER }, PROGRAM_STAMPS)).ok, false, 'a stateful manifest is not schema 1');
  assert.equal((await sealProgram(growthFixture, STATEFUL_PROGRAM_STAMPS)).ok, false, 'a schema 1 manifest has no viewport');
  assert.equal(parseArtifact({ ...artifact, schemaVersion: 1 }).ok, false);
  assert.equal(parseArtifact({ ...artifact, schemaVersion: 3 }).ok, false);
});

// ---- version allowlist ------------------------------------------------------------------------------------------------

test('the allowlist is exactly the old single stamp set plus its schema 2 twin', () => {
  assert.deepEqual(SUPPORTED_PROGRAM_TUPLES[0], { ...PROGRAM_VERSIONS, ...PROGRAM_STAMPS });
  assert.deepEqual(SUPPORTED_PROGRAM_TUPLES[1], { ...PROGRAM_VERSIONS, ...PROGRAM_STAMPS, schemaVersion: 2 });
  assert.equal(SUPPORTED_PROGRAM_TUPLES.length, 2);
  assert.equal(PROGRAM_STAMPS.runtimeVersion, 'quickjs-release-sync@0.32.0', 'the engine stays QuickJS 0.32.0');
});

test('a schema 2 artifact with any single stamp changed never starts a Worker', async () => {
  const { fingerprints, ...top } = STATEFUL_PROGRAM_STAMPS;
  const changes = [
    ...['runtimeVersion', 'runtimePolicyVersion', 'permissionProfileVersion'].map(key => ({ ...STATEFUL_PROGRAM_STAMPS, [key]: `${top[key]}-other` })),
    ...Object.keys(fingerprints).map(key => ({ ...STATEFUL_PROGRAM_STAMPS, fingerprints: { ...fingerprints, [key]: fingerprints[key].replace(/.$/, c => (c === '0' ? '1' : '0')) } })),
    { ...STATEFUL_PROGRAM_STAMPS, sdkVersion: 'sdk-2' }, { ...STATEFUL_PROGRAM_STAMPS, rendererVersion: 'renderer-2' },
    { ...STATEFUL_PROGRAM_STAMPS, runtimeVersion: 'quickjs-release-sync@0.32.1' }, // a "same major" engine is still another engine
  ];
  const before = workers.size;
  for (const stamps of changes) {
    const host = createProgramHost({ artifact: await sealV2(COUNTER, MANIFEST, stamps), createWorker: standIn });
    await assert.rejects(host.initialize(init()), { code: 'version_unavailable' }, JSON.stringify(stamps));
    host.dispose();
  }
  assert.equal(workers.size, before);
});

// ---- host operations --------------------------------------------------------------------------------------------------

test('a schema 2 card initializes, reduces declared events and evaluates its state, all in the isolated runtime', async () => {
  const host = createProgramHost({ artifact: await sealV2(), createWorker: standIn });
  try {
    const first = await host.initialize(init());
    assert.deepEqual([first.requestId, first.state], ['i1', { count: 0, selected: null, step: 2 }]);
    const added = await host.reduce(reduceReq(1, first.state, { type: 'action', action: 'add' }));
    assert.deepEqual([added.requestId, added.state.count], ['r1', 2]);
    const selected = await host.reduce(reduceReq(2, added.state, { type: 'select', target: 'count-box' }));
    assert.equal(selected.state.selected, 'count-box');
    const changed = await host.reduce(reduceReq(3, selected.state, { type: 'input', input: 'tone', value: 'loud' }));
    assert.equal(changed.state.last, 'loud');
    const frame = await host.evaluate(evalReq(1, changed.state));
    assert.deepEqual([frame.requestId, frame.frame.width, frame.frame.height, frame.quantities.count], ['e1', 400, 300, 2]);
    // Refused before anything runs: a schema 2 evaluate without state, an undeclared event, an oversized state, drag.
    await assert.rejects(host.evaluate(evalReq(2, null)), { code: 'invalid_program' });
    await assert.rejects(host.reduce(reduceReq(4, first.state, { type: 'action', action: 'delete' })), { code: 'invalid_program' });
    await assert.rejects(host.reduce(reduceReq(5, { s: 'x'.repeat(LIMITS.stateBytes) }, { type: 'action', action: 'add' })), { code: 'invalid_program' });
    await assert.rejects(host.reduce(reduceReq(6, first.state, { type: 'drag_start', target: 'count-box' })), { code: 'unsupported_capability' });
  } finally { host.dispose(); }
});

test('state changes are never superseded: queued reduces all run in order, only waiting evaluates are dropped', async () => {
  const host = createProgramHost({ artifact: await sealV2(), createWorker: standIn });
  const state = { count: 0, selected: null, step: 2 };
  const calls = [
    host.reduce(reduceReq(1, state, { type: 'action', action: 'add' })), host.evaluate(evalReq(1, state)),
    host.reduce(reduceReq(2, state, { type: 'action', action: 'reset' })), host.evaluate(evalReq(2, state)), host.evaluate(evalReq(3, state)),
  ].map(settled);
  const [r1, e1, r2, e2, e3] = await Promise.all(calls);
  assert.deepEqual([r1.value?.requestId, r2.value?.requestId, e3.value?.requestId], ['r1', 'r2', 'e3']);
  assert.ok(e1.error?.name === 'AbortError' && e2.error?.name === 'AbortError', 'older waiting frames are superseded');
  host.dispose();
});

test('a frame that is not the declared viewport is invalid_output', async () => {
  const host = createProgramHost({ artifact: await sealV2(COUNTER.replace('width: 400, height: 300', 'width: 400, height: 301')), createWorker: standIn });
  await assert.rejects(host.evaluate(evalReq(1, { count: 0 })), { code: 'invalid_output' });
  host.dispose();
  const frame = { frame: { width: 960, height: 540, objects: [] }, quantities: {} };
  assert.equal(parseGuestResult(frame).ok, true, 'without a schema 2 manifest the old default size is fine');
  assert.match(parseGuestResult(frame, MANIFEST).issue, /viewport is 400 x 300/);
});

test('an infinite reducer, oversized or non-finite state and a broken initialization fail cleanly; a valid card still works after', async () => {
  const cases = [
    ['infinite reducer', COUNTER.replace('export function reduce({ state, event, inputs }) {', 'export function reduce({ state, event, inputs }) { for (;;) {}'), 'reduce', 'runtime_limit', 'reduce'],
    ['infinite initialState', COUNTER.replace('{ return { count: 0', '{ for (;;) {} return { count: 0'), 'initialize', 'runtime_limit', 'initialize'],
    ['loop while the source loads', `for (;;) {}\n${COUNTER}`, 'reduce', 'runtime_limit', 'load'],
    ['loop while the state serializes', COUNTER.replace("return { ...state, count: 0 };", 'return { get count() { for (;;) {} } };'), 'reduce', 'runtime_limit', 'serialize'],
    ['oversized state', COUNTER.replace("return { ...state, count: 0 };", `return { s: 'x'.repeat(${LIMITS.stateBytes - 7}) };`), 'reduce', 'invalid_output', 'serialize'],
    ['too deep a state', COUNTER.replace("return { ...state, count: 0 };", `{ let v = 1; for (let i = 0; i < ${CONTRACT_LIMITS.depth}; i++) v = { a: v }; return v; }`), 'reduce', 'invalid_output', 'serialize'],
    ['non-finite state', COUNTER.replace("return { ...state, count: 0 };", 'return { count: 0 / 0 };'), 'reduce', 'invalid_output', 'serialize'],
    ['initialState throws', COUNTER.replace('{ return { count: 0', "{ throw new Error('broken'); return { count: 0"), 'initialize', 'runtime_error', 'initialize'],
    ['no initialState export', COUNTER.replace('export function initialState', 'function initialState'), 'initialize', 'invalid_program', 'load'],
    ['initialState returns a number', COUNTER.replace('{ return { count: 0, selected: null, step: inputs.step }; }', '{ return 5; }'), 'initialize', 'invalid_output', 'serialize'],
    ['initialState returns an array', COUNTER.replace('{ return { count: 0, selected: null, step: inputs.step }; }', '{ return [0]; }'), 'initialize', 'invalid_output', undefined],
  ];
  const state = { count: 0, selected: null, step: 2 };
  for (const [name, source, operation, code, phase] of cases) {
    const broken = createProgramHost({ artifact: await sealV2(source), createWorker: standIn });
    const run = operation === 'initialize' ? broken.initialize(init()) : broken.reduce(reduceReq(1, state, { type: 'action', action: 'reset' }));
    const { error } = await settled(run);
    assert.equal(error?.code, code, `${name}: ${error?.diagnostic}`);
    assert.equal(error.where?.phase, phase, name);
    assert.equal(JSON.stringify(error).includes('for (;;)'), false, 'the learner-facing error carries no source');
    broken.dispose();
  }
  // The deepest and the largest valid states come back from the guest unchanged.
  const ROOMY = `export function initialState() { return {}; }
export function reduce({ event }) {
  if (event.action === 'reset') return { s: 'x'.repeat(${LIMITS.stateBytes - 8}) };
  let v = 1; for (let i = 0; i < ${CONTRACT_LIMITS.depth - 1}; i++) v = { a: v }; return v;
}
export function evaluate() { return { frame: { width: 400, height: 300, objects: [] }, quantities: {} }; }`;
  const roomy = createProgramHost({ artifact: await sealV2(ROOMY), createWorker: standIn });
  assert.equal((await roomy.reduce(reduceReq(1, state, { type: 'action', action: 'reset' }))).state.s.length, LIMITS.stateBytes - 8);
  assert.deepEqual((await roomy.reduce(reduceReq(2, state, { type: 'action', action: 'add' }))).state, nest(CONTRACT_LIMITS.depth - 1, 1));
  roomy.dispose();
  const healthy = createProgramHost({ artifact: await sealV2(), createWorker: standIn });
  assert.equal((await healthy.reduce(reduceReq(9, state, { type: 'action', action: 'add' }))).state.count, 2);
  healthy.dispose();
  assert.equal(workers.size, 0, 'every Worker was terminated');
});

// ---- schema 1 compatibility -------------------------------------------------------------------------------------------

// The genuine sandbox-ex1-b cooling result, saved as test data (genuine-card.test.mjs).
const RECORDED = JSON.parse(readFileSync(new URL('./testdata/sandbox-ex1-b-job.json', import.meta.url), 'utf8'));
const COOLING = RECORDED.job.result.program;

test('the saved v1 cooling artifact still parses, hashes and runs unchanged, and has no state operations', async () => {
  const stored = structuredClone(COOLING);
  assert.equal(stored.schemaVersion, 1);
  assert.equal(parseArtifact(stored).ok, true);
  const { sourceHash, manifestHash, bundleHash } = stored;
  assert.deepEqual(await computeHashes(stored), { sourceHash, manifestHash, bundleHash });
  assert.equal(bundleHash, '62c202e9826cd30b8e9a49d5c4a896d19011ad4466c75574c306cdc420db434e');
  const request = { requestId: 'c1', inputs: { room: 10 }, time: 5, seed: 0, state: null };
  const host = createProgramHost({ artifact: stored, createWorker: standIn });
  try {
    const reply = await host.evaluate(request);
    const direct = runProgram(await engine, { source: stored.source, request }, GUEST_LIMITS);
    assert.equal(direct.ok, true, direct.detail);
    assert.deepEqual({ frame: reply.frame, quantities: reply.quantities }, parseGuestResult(direct.value).value, 'the host answers exactly what the runtime computes');
    await assert.rejects(host.evaluate({ ...request, state: {} }), { code: 'invalid_program' }, 'schema 1 state stays null');
    await assert.rejects(host.initialize({ requestId: 'c2', inputs: { room: 10 }, seed: 0 }), { code: 'unsupported_capability' });
    await assert.rejects(host.reduce({ ...request, event: { type: 'action', action: 'x' } }), { code: 'unsupported_capability' });
  } finally { host.dispose(); }
  assert.deepEqual(stored, COOLING, 'nothing rewrote the saved artifact');
});
