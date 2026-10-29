// Task 8.3: the two hand-authored stateful fixtures (an algorithm stepped by ordered actions, a continuous numeric simulation) run
// through the real host on the packaged engine, every frame passes the Frame contract (viewport and stable target ids included), and
// the contract's own description of the stateful capability comes from the limits the schemas enforce.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONTRACT_LIMITS, STATEFUL_CONTRACT, draftSchemaVersion, parseGuestResult, parseManifest, sealProgram } from './contract.js';
import { LIMITS } from './limits.js';
import { PROGRAM_STAMPS, STATEFUL_PROGRAM_STAMPS } from './stamps.js';
import { createProgramHost } from './host.js';
import { loadEngine, runProgram } from './runtime.js';
import { normalizeFrame } from './frame.js';
import { resolveProgram } from './program-card.js';
import { FIXTURES, STATEFUL_FIXTURES, growthFixture, sortFixture, springFixture } from './fixtures.js';

const engine = loadEngine();
const GUEST_LIMITS = { ...LIMITS, interruptMs: 150 };
const standIn = () => {
  const worker = {
    terminate() { worker.dead = true; },
    postMessage({ id, operation, source, request }) { engine.then(e => { const out = runProgram(e, { source, request, operation }, GUEST_LIMITS); setTimeout(() => !worker.dead && worker.onmessage?.({ data: { id, ...out } }), 0); }); },
  };
  engine.then(() => setTimeout(() => worker.onmessage?.({ data: { ready: true } }), 0));
  return worker;
};
const inputsOf = manifest => Object.fromEntries(manifest.inputs.map(input => [input.id, input.default]));

// The card's own path: initialize, each event in order, then evaluate; every frame validated and normalised.
async function play(fixture, events = fixture.events, seed = 0) {
  const sealed = await sealProgram({ manifest: fixture.manifest, source: fixture.source }, STATEFUL_PROGRAM_STAMPS);
  assert.equal(sealed.ok, true, sealed.issue);
  const host = createProgramHost({ artifact: sealed.value, createWorker: standIn });
  let inputs = inputsOf(fixture.manifest);
  try {
    let { state } = await host.initialize({ requestId: 'i', inputs, seed });
    const frames = [];
    const draw = async () => {
      const reply = await host.evaluate({ requestId: `e${frames.length}`, inputs, time: 0, seed, state });
      assert.equal(normalizeFrame(reply.frame, sealed.value.manifest).ok, true);
      frames.push(reply);
    };
    await draw();
    for (const [n, event] of events.entries()) {
      if (event.type === 'input') inputs = { ...inputs, [event.input]: event.value };
      ({ state } = await host.reduce({ requestId: `r${n}`, state, event, inputs, time: 0, seed }));
      await draw();
    }
    return { state, frames, artifact: sealed.value };
  } finally { host.dispose(); }
}

test('both stateful fixtures are schema 2 by what they declare, and the schema 1 fixtures stay schema 1', () => {
  for (const fixture of STATEFUL_FIXTURES) {
    assert.equal(draftSchemaVersion(fixture), 2, fixture.id);
    assert.equal(parseManifest(fixture.manifest, 2).ok, true, fixture.id);
  }
  for (const fixture of FIXTURES) assert.equal(draftSchemaVersion(fixture), 1, fixture.id);
});

test('the algorithm fixture: ordered presses step the sort exactly, a selection is remembered, and the same events give the same state', async () => {
  const { state, frames } = await play(sortFixture, [{ type: 'action', action: 'step' }, { type: 'action', action: 'step' }, { type: 'action', action: 'step' }, { type: 'select', target: 'bar-2' }]);
  assert.deepEqual([state.values, state.i, state.swaps, state.selected], [[2, 5, 1, 6, 4, 3], 3, 2, 2]);
  assert.equal(frames.at(-1).quantities.swaps, 2);
  for (const frame of frames) for (const k of [0, 1, 2, 3, 4, 5]) assert.ok(frame.frame.objects.some(object => object.id === `bar-${k}`), 'every target in every frame');
  const again = await play(sortFixture, sortFixture.events, 0), other = await play(sortFixture, sortFixture.events, 9);
  assert.deepEqual(again.state, (await play(sortFixture, sortFixture.events, 0)).state);
  assert.notDeepEqual(again.state.values, other.state.values, 'a shuffle depends on the seed only');
  // Pressing until sorted ends sorted, with no further change.
  const done = await play(sortFixture, Array.from({ length: 20 }, () => ({ type: 'action', action: 'step' })));
  assert.deepEqual([done.state.values, done.state.sorted], [[1, 2, 3, 4, 5, 6], true]);
});

test('the continuous fixture: each advance integrates a tenth of a second at the snapshot stiffness, a kick adds speed', async () => {
  const sim = (x, v, k) => { for (let n = 0; n < 10; n++) { v -= k * x * 0.01; x += v * 0.01; } return [x, v]; };
  const { state, frames } = await play(springFixture);
  let [x, v] = sim(1, 0, 4); v += 1; [x, v] = sim(x, v, 9);
  assert.ok(Math.abs(state.x - x) < 1e-12 && Math.abs(state.v - v) < 1e-12, JSON.stringify(state));
  assert.equal(state.t, 0.2);
  assert.ok(Math.abs(frames.at(-1).quantities.position - x) < 1e-12);
  assert.equal(frames.at(-1).frame.width, 960);
});

test('every frame must have the declared viewport and draw every declared target under its own id', () => {
  const manifest = parseManifest(sortFixture.manifest, 2).value;
  const frame = objects => ({ frame: { width: 720, height: 360, objects }, quantities: {} });
  const bars = [0, 1, 2, 3, 4, 5].map(k => ({ kind: 'box', id: `bar-${k}`, x: k * 100, y: 0, w: 50, h: 50 }));
  assert.equal(parseGuestResult(frame(bars), manifest).ok, true);
  assert.match(parseGuestResult(frame(bars.slice(1)), manifest).issue, /declared targets are not drawn: bar-0/);
  assert.match(parseGuestResult({ ...frame(bars), frame: { ...frame(bars).frame, width: 700 } }, manifest).issue, /viewport/);
  assert.equal(parseGuestResult(frame([])).ok, true, 'without a stateful manifest nothing more is asked');
});

test('the author is told the stateful contract from the enforced limits', () => {
  assert.match(STATEFUL_CONTRACT.manifest, new RegExp(`at most ${CONTRACT_LIMITS.actions} buttons`));
  assert.match(STATEFUL_CONTRACT.manifest, new RegExp(`at most ${CONTRACT_LIMITS.targets};`));
  assert.match(STATEFUL_CONTRACT.state, new RegExp(`${CONTRACT_LIMITS.stateBytes} bytes`));
  assert.equal(STATEFUL_CONTRACT.events.length, 4, 'action, select, input and drag (Task 8.4)');
});

test('fixture cards seal by what they declare: schema 2 for the stateful ones, the schema 1 ones exactly as before', async () => {
  const card = fixtureId => ({ id: 'c', type: 'animation', program: { fixtureId } });
  const sort = await resolveProgram(card('fixture-sort'), { fixtures: true, stamps: PROGRAM_STAMPS });
  assert.deepEqual([sort.ok, sort.artifact.schemaVersion], [true, 2]);
  const growth = await resolveProgram(card('fixture-growth'), { fixtures: true, stamps: PROGRAM_STAMPS });
  const direct = await sealProgram({ manifest: growthFixture.manifest, source: growthFixture.source }, PROGRAM_STAMPS);
  assert.deepEqual([growth.artifact.schemaVersion, growth.artifact.bundleHash], [1, direct.value.bundleHash]);
});

// Owner acceptance for R3: the picture, its readouts and the review's replay all come from the same accepted state and inputs.
test('the review replay draws exactly the frame and readouts the card draws for the same accepted state', async () => {
  const { replayTransitions } = await import('./interaction.js');
  const events = [{ type: 'action', action: 'advance' }, { type: 'action', action: 'kick' }, { type: 'action', action: 'advance' }];
  const card = await play(springFixture, events);
  const host = createProgramHost({ artifact: card.artifact, createWorker: standIn });
  try {
    const review = await replayTransitions({ host, manifest: card.artifact.manifest, inputs: inputsOf(springFixture.manifest), seed: 0, events });
    assert.deepEqual(review.state, card.state);
    assert.deepEqual(review.reply.frame, card.frames.at(-1).frame, 'the same picture');
    assert.deepEqual(review.view.readouts, normalizeFrame(card.frames.at(-1).frame, card.artifact.manifest).readouts, 'the same readouts');
  } finally { host.dispose(); }
});
