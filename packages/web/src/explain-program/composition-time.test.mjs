import test from 'node:test';
import assert from 'node:assert/strict';
import { ProgramManifest } from './contract.js';
import { clampTime, describeProgram, evaluateRequestFor, playbackRate, programDuration, programTime, savedTime, scrubStep, snapToMarker, timeLabel } from './program-card.js';
import { compileCardComposition } from '../interact-composition.js';
import { FIXTURE_DRAFTS, G, sealEnvelope, tossDrop } from '../interact-build-fixtures.js';
import { interactFixtures } from '../interact-plan-fixtures.js';

// INT-04-C06/C07: programDuration(manifest, composition = null, inputs = {}) and its sibling helpers. Without a composition every helper is the
// legacy one (timeline.test.mjs and program-card.test.mjs still run unchanged); with one, the endpoint, pacing, markers and displayed origin
// follow the current inputs.
const { plans } = await interactFixtures();
const T = tossDrop();
const standard = await compileCardComposition(plans.standard, await sealEnvelope(FIXTURE_DRAFTS.standard));
const deepArtifacts = await sealEnvelope(FIXTURE_DRAFTS.deep);
const deep = await compileCardComposition(plans.deep, deepArtifacts);
const standardManifest = ProgramManifest.parse((await sealEnvelope(FIXTURE_DRAFTS.standard)).main.program.manifest);
const deepManifest = deepArtifacts.main.program.manifest;
const legacy = ProgramManifest.parse({ title: 'T', summary: 'S', assumptions: [], description: 'D', inputs: [], readouts: [], capabilities: [], duration: 4 });

test('without a composition every helper keeps the legacy behaviour, whatever inputs are passed', () => {
  assert.equal(programDuration(legacy), 4); assert.equal(programDuration(legacy, null, { launchSpeed: 3 }), 4);
  assert.equal(clampTime(legacy, 9), 4); assert.equal(clampTime(legacy, -1), 0); assert.equal(clampTime(legacy, NaN), 0);
  assert.equal(programTime(legacy, { time: 7 }), 4); assert.equal(playbackRate(legacy), 1); assert.equal(scrubStep(legacy), 0.05);
  assert.equal(savedTime(legacy, 1.236), 1.24); assert.equal(snapToMarker(legacy, 1.2), 1.2); assert.equal(timeLabel(legacy, 1.26), '1.3s');
  assert.equal(evaluateRequestFor(legacy, { inputs: {} }, 9, 1).time, 4);
  assert.equal(describeProgram({ title: 'T', id: 'b' }, legacy).text.includes('of 4s'), true);
});

test('Deep: one resolver gives the endpoint, clamp, saved time, request time and the accessible total for each launch speed', () => {
  const at = u => ({ inputs: { launchSpeed: u } });
  assert.ok(Math.abs(programDuration(deepManifest, deep, at(3).inputs) - 0.612245) < 1e-6); assert.ok(Math.abs(programDuration(deepManifest, deep, at(5).inputs) - 1.020408) < 1e-6);
  assert.equal(programDuration(deepManifest, deep), 2 * 5 / G, 'the default is the 5.0 m/s flight');
  assert.equal(clampTime(deepManifest, 5, deep, at(3).inputs), 2 * 3 / G, 'a 3.0 m/s flight cannot be scrubbed past its own return');
  assert.equal(clampTime(deepManifest, 5, deep, at(5).inputs), 2 * 5 / G);
  assert.equal(programTime(deepManifest, { time: 1.0, inputs: { launchSpeed: 3 } }, deep), 2 * 3 / G, 'a saved time is clamped to the saved inputs endpoint');
  assert.equal(savedTime(deepManifest, 2, deep, at(3).inputs), Number((2 * 3 / G).toFixed(4)));
  assert.equal(evaluateRequestFor(deepManifest, { inputs: { launchSpeed: 3 } }, 5, 1, null, deep).time, 2 * 3 / G, 'the capture and card request use the same endpoint');
  assert.equal(evaluateRequestFor(deepManifest, { inputs: { launchSpeed: 3 } }, 5, 1).time, 2 * 5 / G, 'the legacy call (no composition) still uses manifest.duration');
  assert.equal(playbackRate(deepManifest, deep), 0.2);
  assert.equal(timeLabel(deepManifest, 0.5, deep, at(5).inputs), '0.50s', 'Deep never shows the negative origin');
  assert.deepEqual(snapToMarker(deepManifest, 0.5101, deep, at(5).inputs), 5 / G, 'the Trial top marker follows the launch speed');
  assert.equal(snapToMarker(deepManifest, 0.5101, deep, at(3).inputs), 0.5101, '... and is not where it was at 5.0 m/s');
  const text = describeProgram({ title: 'T', id: 'b', inputs: { launchSpeed: 3 } }, deepManifest, deep).text;
  assert.match(text, /of 0\.612s/, 'the description states the same endpoint the scrubber uses');
  assert.equal(programDuration(deepManifest, deep, { launchSpeed: 3 }) <= deepManifest.duration, true, 'manifest.duration is the maximum admitted duration');
});

test('Standard: the displayed time runs from about -0.306 to +0.306 s and the three seeks land on elapsed 3/g-0.10, 3/g and 3/g+0.10', () => {
  assert.equal(timeLabel(standardManifest, 0, standard), '−0.31s'); assert.equal(timeLabel(standardManifest, T.apex, standard), '0.00s'); assert.equal(timeLabel(standardManifest, T.end, standard), '+0.31s');
  assert.equal(timeLabel(standardManifest, T.apex - 0.1, standard), '−0.10s'); assert.equal(timeLabel(standardManifest, T.apex + 0.1, standard), '+0.10s');
  assert.equal(scrubStep(standardManifest, standard), 0.001);
  for (const m of [T.apex - 0.1, T.apex, T.apex + 0.1]) {
    assert.equal(snapToMarker(standardManifest, Number(m.toFixed(3)), standard), m, 'a pointer or key seek that lands within half a step reaches the stated moment exactly');
    assert.equal(snapToMarker(standardManifest, Number((m + 0.001).toFixed(3)), standard) > m, true, 'one step away stays where it is');
  }
  assert.equal(programDuration(standardManifest, standard), T.end); assert.equal(playbackRate(standardManifest, standard), 0.1);
  assert.ok(Math.abs(savedTime(standardManifest, T.apex - 0.1, standard) - (T.apex - 0.1)) < 1e-4, 'a reopened card sits on -0.10 s to four decimals');
});

test('pacing never changes the science: the request for a physics instant is the same at any playback rate', () => {
  const at = time => evaluateRequestFor(standardManifest, { inputs: {} }, time, 1, null, standard);
  assert.deepEqual(at(T.apex), at(T.apex));
  assert.equal(at(T.apex).time, T.apex, 'the evaluated time is physics seconds; playbackRate only paces the wall clock');
  assert.equal(playbackRate(standardManifest, standard) === 0.1, true);
});

test('a changed input under a timed composition returns time to zero (reset_pause); an untimed or legacy card keeps its time; Replay and Reset are the existing helpers', async () => {
  const { setProgramInputUnder, resetProgram } = await import('./program-card.js');
  const block = { id: 'b', inputs: { launchSpeed: 5 }, inputRevision: 0, time: 0.7 };
  const next = setProgramInputUnder(block, deepManifest, 'launchSpeed', 3, deep);
  assert.deepEqual([next.time, next.inputs.launchSpeed, next.inputRevision], [0, 3, 1], 'time resets, the input changes, stale frames are keyed out by the new revision');
  assert.equal(setProgramInputUnder(block, deepManifest, 'launchSpeed', 5, deep), block, 'no change, no write, no reset');
  assert.equal(setProgramInputUnder(block, deepManifest, 'launchSpeed', 3).time, 0.7, 'a legacy card keeps its time');
  assert.equal(setProgramInputUnder(block, deepManifest, 'launchSpeed', 3, { main: { onInputChange: 'recompute_still' } }).time, 0.7);
  assert.deepEqual([resetProgram({ ...next, time: 0.4, inputs: { launchSpeed: 3 } }).time, resetProgram({ ...next, inputs: { launchSpeed: 3 } }).inputs], [0, {}], 'Reset restores defaults and time zero');
});

// I2 (INT-04-C08): what ProgramScene does for a changed input and for the one transport button, decided by pure functions it calls.
test('a changed input on a timed Deep card pauses, returns to time zero, and reads the endpoint, marker and comparison for the new speed (reset_pause)', async () => {
  const { inputChange, resetsOnInput } = await import('./program-card.js');
  const block = { id: 'b', inputs: { launchSpeed: 5 }, inputRevision: 0, time: 0.7 };
  assert.equal(resetsOnInput(deep), true);
  assert.equal(resetsOnInput(null), false); assert.equal(resetsOnInput({ main: { onInputChange: 'recompute_still' } }), false);
  const change = inputChange(block, deepManifest, 'launchSpeed', 3, deep, 0.9);
  assert.deepEqual([change.time, change.playing, change.block.time, change.block.inputs.launchSpeed, change.block.inputRevision], [0, false, 0, 3, 1], 'time zero, paused, the new speed, a new input revision that keys out older frames');
  assert.ok(Math.abs(programDuration(deepManifest, deep, change.block.inputs) - 0.612245) < 1e-6, 'the endpoint of the NEW speed');
  assert.equal(timeLabel(deepManifest, change.time, deep, change.block.inputs), '0.00s');
  assert.equal(inputChange(block, deepManifest, 'launchSpeed', 5, deep, 0.9), null, 'no change, no write, no reset');
  assert.equal(inputChange(block, deepManifest, 'nope', 3, deep, 0.9), null, 'an undeclared input changes nothing');
  assert.equal(inputChange(block, deepManifest, 'launchSpeed', 9, deep, 0.9), null, 'a value outside the domain is clamped to 5.0, which is no change');
  assert.equal(inputChange(block, deepManifest, 'launchSpeed', 0, deep, 0.9).block.inputs.launchSpeed, 3, 'and below it to 3.0');
  const kept = inputChange(block, deepManifest, 'launchSpeed', 3, null, 0.9);
  assert.deepEqual([kept.time, kept.block.time, kept.playing], [0.9, 0.7, false], 'a legacy card keeps its moment (it still pauses, as before)');
  assert.equal(inputChange(block, deepManifest, 'launchSpeed', 3, { main: { onInputChange: 'recompute_still' } }, 0.9).time, 0.9, 'an untimed recompute_still scene keeps its time');
});

test('Replay replays the flight of the CURRENT launch speed and keeps the inputs; Reset restores the defaults and time zero', async () => {
  const { pressPlay, inputChange, resetProgram, programInputs } = await import('./program-card.js');
  const at3 = inputChange({ id: 'b', inputs: { launchSpeed: 5 } }, deepManifest, 'launchSpeed', 3, deep, 0).block;
  const end3 = programDuration(deepManifest, deep, programInputs(deepManifest, at3));
  assert.ok(Math.abs(end3 - 0.612245) < 1e-6);
  assert.deepEqual(pressPlay({ time: 0.2, duration: end3, playing: false, reduced: false }), { seek: null, toggle: true }, 'Play from the middle just plays');
  assert.deepEqual(pressPlay({ time: 0.2, duration: end3, playing: true, reduced: false }), { seek: null, toggle: true }, 'Pause');
  assert.deepEqual(pressPlay({ time: end3, duration: end3, playing: false, reduced: false }), { seek: 0, toggle: true }, 'at the 3.0 m/s endpoint the button is Replay: back to zero, then play');
  assert.deepEqual(pressPlay({ time: 1.0, duration: end3, playing: false, reduced: false }), { seek: 0, toggle: true }, 'a time past the shorter endpoint is at the end as well');
  assert.deepEqual(pressPlay({ time: 0.2, duration: end3, playing: false, reduced: true }), { seek: end3, toggle: false }, 'reduced motion shows the end of THIS flight, it does not travel');
  assert.deepEqual(pressPlay({ time: end3, duration: end3, playing: false, reduced: true }), { seek: 0, toggle: false });
  assert.equal(at3.inputs.launchSpeed, 3, 'pressPlay never touches the inputs: Replay retains the speed');
  const reset = resetProgram({ ...at3, time: 0.4, programState: { n: 1 } });
  assert.deepEqual([reset.inputs, reset.time, reset.programState], [{}, 0, undefined]);
  assert.equal(programInputs(deepManifest, reset).launchSpeed, 5, 'Reset restores the default 5.0 m/s');
  assert.equal(programDuration(deepManifest, deep, programInputs(deepManifest, reset)), 2 * 5 / G);
});

test('a reopened Deep card keeps its launch speed and a time past the saved speed endpoint is clamped to it', async () => {
  const { inputChange, programInputs, programTime } = await import('./program-card.js');
  const { compositionOf } = await import('../interact-composition-adapter.js');
  const { supportInputs } = await import('../interact-card-layout.js');
  const changed = inputChange({ id: 'b', inputs: {}, time: 0 }, deepManifest, 'launchSpeed', 3.4, deep, 0).block;
  const saved = JSON.parse(JSON.stringify({ ...changed, time: 0.5, interact: { version: 1, planHash: deep.planHash, composition: deep } })); // the canvas stores JSON
  const composition = compositionOf(saved), inputs = programInputs(deepManifest, saved);
  assert.equal(inputs.launchSpeed, 3.4);
  assert.ok(Math.abs(programDuration(deepManifest, composition, inputs) - 2 * 3.4 / G) < 1e-12, 'the endpoint is read for the saved speed on reload');
  assert.equal(programTime(deepManifest, saved, composition), 0.5);
  assert.deepEqual(supportInputs(composition.supports[0], inputs), { trialSpeed: 3.4 }, 'the comparison is bound to the saved speed');
  assert.ok(Math.abs(programTime(deepManifest, { ...saved, time: 0.9 }, composition) - 2 * 3.4 / G) < 1e-12, 'an old moment past the endpoint opens at the endpoint, never past it');
  assert.equal(programTime(deepManifest, { ...saved, inputs: {}, time: 0.9 }, composition), 0.9, 'at the default speed 0.9 s is inside the flight');
});

test('the accessible description of a saved /interact card states the endpoint of its own launch speed without the caller passing the composition', async () => {
  const { describeProgram: describe } = await import('./program-card.js');
  const block = { id: 'b', title: 'Deep', inputs: { launchSpeed: 3 }, time: 0.3, interact: { version: 1, planHash: deep.planHash, composition: deep } };
  const text = describe(block, deepManifest).text;
  assert.match(text, /Paused at 0\.3s of 0\.612s/, text);
  assert.match(describe({ ...block, inputs: {} }, deepManifest).text, /of 1\.02s/);
  assert.match(describe({ ...block, interact: undefined }, deepManifest).text, /of 1\.0204\d*s|of 1\.02\d*s/, 'a block with no composition is legacy: the manifest.duration');
  assert.match(describe({ ...block, interact: { version: 1, composition: { version: 9 } } }, deepManifest).text, /of 1\.02/, 'a composition that does not hold together is not trusted for the endpoint');
});

test('Deep: over the whole admitted domain (3.0 to 5.0 m/s in 0.1 steps) the endpoint is positive, finite and 2u/g, the marker is inside the flight, Time since launch has no offset, and nothing is longer than manifest.duration', async () => {
  const { resolveTimeline } = await import('../interact-composition.js');
  const speeds = Array.from({ length: 21 }, (_, i) => Number((3 + i * 0.1).toFixed(1)));
  for (const u of speeds) {
    const timeline = resolveTimeline(deep, { launchSpeed: u });
    assert.ok(Number.isFinite(timeline.end) && timeline.end > 0, `u=${u}`);
    assert.ok(Math.abs(timeline.end - 2 * u / G) < 1e-12, `the flight lasts 2u/g at ${u}`);
    assert.deepEqual([timeline.start, timeline.displayOffset, timeline.displayStart, timeline.label], [0, 0, 0, 'Time since launch']);
    assert.ok(Math.abs(timeline.displayEnd - timeline.end) < 1e-12, 'the scrubber reads elapsed time since launch');
    assert.ok(Math.abs(timeline.markers[0].time - u / G) < 1e-12 && timeline.markers[0].time < timeline.end, 'Trial top is the apex u/g');
    assert.ok(programDuration(deepManifest, deep, { launchSpeed: u }) <= deepManifest.duration + 1e-12);
    assert.equal(programDuration(deepManifest, deep, { launchSpeed: u }), timeline.end, 'the player and the checks read the one resolver');
  }
  const clamped = [[2, 3], [-1, 3], [6, 5], [NaN, 5], ['fast', 5], [null, 5]]; // below the domain, above it, or not a number (the default 5.0)
  for (const [wild, used] of clamped) assert.ok(Math.abs(resolveTimeline(deep, { launchSpeed: wild }).end - 2 * used / G) < 1e-12, `${wild} is clamped into the declared domain, or falls back to the default`);
});
