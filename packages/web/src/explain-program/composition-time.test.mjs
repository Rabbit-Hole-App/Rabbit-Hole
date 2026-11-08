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
