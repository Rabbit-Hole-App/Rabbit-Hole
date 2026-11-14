// The three reference toss-and-drop plans (owner 2026-11-13): toss-overview, toss-standard, toss-deep. They are the Interact implementation of the rows of
// docs/features/interact/references/tutor-scene-examples.md and the HTML references beside it, so the test reads the table's own numbers and pins the plans to them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evalScalar, parseScenePlan, planHash, planProblems, validatePlanBindings, captureBudgetProblems, descriptionFitProblems } from './interact-plan.js';
import { interactFixtures } from './interact-plan-fixtures.js';
import { measureInteractDescription } from './interact-description-fit.js';

const { referenceCapabilities: caps, referencePlans: plans, plans: older, capabilities } = await interactFixtures();
const NAMES = ['tossOverview', 'tossStandard', 'tossDeep'];
const TABLE = readFileSync(new URL('../../../docs/features/interact/references/tutor-scene-examples.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const at = (expr, values) => evalScalar(expr, values, {});
const control = (plan, id) => plan.controls.find(c => c.id === id);
const range = c => [c.default, c.min, c.max, c.step];

test('each reference plan is a valid ScenePlan against the catalogue it was designed for, with a stable hash and a card description the estimated fit accepts', async () => {
  for (const name of NAMES) {
    const plan = plans[name];
    assert.deepEqual(planProblems(plan), [], name);
    assert.deepEqual(validatePlanBindings(plan, caps), [], name);
    const parsed = parseScenePlan(plan, caps);
    assert.equal(parsed.ok, true, `${name}: ${JSON.stringify(parsed.problems?.slice(0, 3))}`);
    assert.match(await planHash(plan), /^[0-9a-f]{64}$/);
    assert.equal(await planHash(plan), await planHash(structuredClone(plan)), 'the hash is stable');
    assert.deepEqual(await descriptionFitProblems(plan, await measureInteractDescription(plan)), [], `${name}: description fit`);
    assert.deepEqual(captureBudgetProblems(plan), [], `${name}: the rendered review reads at most 6 images`);
    assert.ok(plan.instructions.length <= 300 && plan.instructions.split(/[.?!] /).length <= 4, `${name}: instructions are 2-3 short lines`);
  }
  assert.notEqual(caps.catalogueHash, capabilities.catalogueHash, 'the seek catalogue is a different catalogue: the older plans keep theirs');
  assert.ok(Object.values(older).every(plan => plan.controls.every(c => c.type !== 'seek')), 'the older plans have no seek control');
});

test('all three are mode Interact with ONE program frame: no supporting panels, one timeline at 0.2x that starts paused', () => {
  for (const name of NAMES) {
    const plan = plans[name], tl = plan.mode.timeline;
    assert.equal(plan.mode.kind, 'experiment', name);
    assert.deepEqual([plan.supportingVisuals.length, plan.scene.runtime.renderer, plan.scene.runtime.sdkVersion], [0, 'program', 'sdk-8'], name);
    assert.deepEqual([tl.playbackRate, tl.initialPlayback, tl.initialTime, tl.start], [0.2, 'paused', 0, 0], name);
    assert.deepEqual(plan.controls.map(c => c.type).filter(t => ['playback', 'scrubber', 'seek', 'reset'].includes(t)), ['playback', 'scrubber', 'seek', 'reset'], `${name}: transport, then At top, then Reset`);
    assert.equal(plan.controls.at(-1).type, 'reset');
    assert.ok(plan.scene.readoutIds.length <= 4 && plan.scene.entities.length <= 6 && tl.markers.length <= 3 && plan.scene.checkpoints.length <= 4, `${name}: inside the design author's size budget`);
  }
});

test('controls exactly as the references: launch speed 2.0-5.0 default 4.0 step 0.1 on all three, gravity 6.0-12.0 default 9.8 on Standard and Deep, mass 0.2-3.0 default 1.0 on Deep only', () => {
  for (const name of NAMES) assert.deepEqual(range(control(plans[name], 'speed')), [4, 2, 5, 0.1], `${name} launch speed`);
  assert.equal(control(plans.tossOverview, 'gravityControl'), undefined, 'the Overview has gravity fixed at 9.8');
  assert.equal(plans.tossOverview.mode.fixedValues.gravity, 9.8);
  for (const name of ['tossStandard', 'tossDeep']) assert.deepEqual(range(control(plans[name], 'gravityControl')), [9.8, 6, 12, 0.1], `${name} gravity`);
  assert.deepEqual(range(control(plans.tossDeep, 'massControl')), [1, 0.2, 3, 0.1]);
  assert.equal(control(plans.tossStandard, 'massControl'), undefined);
  assert.deepEqual(plans.tossOverview.mode.adjustableIds, ['launchSpeed']);
  assert.deepEqual(plans.tossStandard.mode.adjustableIds, ['launchSpeed', 'gravity']);
  assert.deepEqual(plans.tossDeep.mode.adjustableIds, ['launchSpeed', 'gravity', 'mass']);
  // The units and labels the references show.
  assert.deepEqual([control(plans.tossDeep, 'speed').unit, control(plans.tossDeep, 'gravityControl').unit, control(plans.tossDeep, 'massControl').unit], ['m/s', 'm/s^2', 'kg']);
  assert.deepEqual(plans.tossDeep.controls.filter(c => c.type === 'number').map(c => c.label), ['Launch speed', 'Gravity', 'Mass']);
});

test('changing an input returns to launch, paused, except the Deep mass, which pauses at the same time and keeps position and velocity', () => {
  for (const name of NAMES) for (const c of plans[name].controls.filter(x => x.type === 'number')) assert.equal(c.onChange, c.id === 'massControl' ? 'recompute_still' : 'reset_pause', `${name} ${c.id}`);
  for (const name of NAMES) assert.equal(plans[name].mode.onInputChange, 'reset_pause');
});

test('At top seeks the top marker; every marker the table pauses at is a pause marker and nothing else pauses', () => {
  const pauses = (plan, values) => plan.mode.timeline.markers.map(k => [k.id, k.pause === true, at(k.time, values)]);
  for (const name of NAMES) { const seek = control(plans[name], 'atTop'); assert.deepEqual([seek.label, seek.binding], ['At top', { kind: 'marker', id: 'top' }], name); }
  // Overview: pause exactly at the top u/g.
  assert.deepEqual(pauses(plans.tossOverview, { launchSpeed: 4 }).map(([id, p, t]) => [id, p, +t.toFixed(6)]), [['top', true, +(4 / 9.8).toFixed(6)]]);
  // Standard: -0.10, 0 and +0.10 s from the apex; the scrubber reads -u/g to +u/g.
  const std = plans.tossStandard.mode.timeline, v = { launchSpeed: 4, gravity: 9.8 }, top = 4 / 9.8;
  assert.deepEqual(pauses(plans.tossStandard, v).map(([, p, t]) => [p, +(t - top).toFixed(6)]), [[true, -0.1], [true, 0], [true, 0.1]]);
  assert.deepEqual([at(std.end, v), at(std.displayOffset, v)].map(n => +n.toFixed(6)), [+(2 * top).toFixed(6), +(-top).toFixed(6)], 'range -u/g to +u/g: about -0.408 to +0.408 s');
  assert.equal(std.label, 'Time from the top');
  // Deep: 0 to 2u/g with pauses at u/g - 0.10, u/g, u/g + 0.10.
  const deep = plans.tossDeep.mode.timeline;
  assert.deepEqual(pauses(plans.tossDeep, { ...v, mass: 1 }).map(([, p, t]) => [p, +(t - top).toFixed(6)]), [[true, -0.1], [true, 0], [true, 0.1]]);
  assert.deepEqual([at(deep.end, v), at(deep.displayOffset, v)].map(n => +n.toFixed(6)), [+(2 * top).toFixed(6), 0]);
  assert.equal(deep.label, 'Time since launch');
  assert.equal(plans.tossOverview.mode.timeline.label, 'Time since launch');
  // Every pause marker stays inside the flight over the whole admitted domain.
  for (const [u, g] of [[2, 12], [2, 6], [5, 6], [5, 12]]) for (const name of ['tossStandard', 'tossDeep']) {
    const tl = plans[name].mode.timeline, values = { launchSpeed: u, gravity: g, mass: 1 };
    for (const k of tl.markers) assert.ok(at(k.time, values) >= 0 && at(k.time, values) <= at(tl.end, values), `${name} ${k.id} at u=${u} g=${g}`);
  }
});

test('the table rows the plans implement are the ones read: the three Mode and Controls cells name these controls and defaults', () => {
  for (const needle of ['Launch speed, a labelled slider with default 4.0 m/s, range 2.0–5.0, and step 0.1', 'Gravity: labelled slider, default 9.8 m/s², range 6.0–12.0, step 0.1', 'Mass: slider, default 1.0 kg, range 0.2–3.0, step 0.1',
    'Start paused and play at 0.2× physical time', 'Automatically pause at −0.10 s, 0 s, and +0.10 s', 'u/g − 0.10 s', 'At top sits directly beside Mass']) assert.ok(TABLE.includes(needle), needle);
});

test('the numbers a builder must reproduce, as the plans say them: apex u/g, the four checkpoints, 0.98 / 0 / -0.98 and 9.8 N / 29.4 N', () => {
  const expected = (plan, id) => plan.scene.checkpoints.find(c => c.id === id).expected;
  assert.match(expected(plans.tossOverview, 'top'), /0\.408 s and 0\.816 m/);
  assert.match(expected(plans.tossOverview, 'fastTop'), /0\.510 s and 1\.276 m/);
  assert.match(expected(plans.tossStandard, 'before'), /\+0\.98 m\/s/);
  assert.match(expected(plans.tossStandard, 'after'), /-0\.98 m\/s/);
  assert.match(expected(plans.tossDeep, 'top'), /0\.408 s and 0\.816 m/);
  assert.match(expected(plans.tossDeep, 'top'), /9\.8 N/);
  assert.match(expected(plans.tossDeep, 'heavyTop'), /29\.4 N/);
  assert.match(plans.tossDeep.scene.observations.find(o => o.id === 'forceByMass').text, /9\.8 N at 1\.0 kg and 29\.4 N at 3\.0 kg/);
});

test('copy rules: no "..." or ellipsis in any visible label, a state readout never named by a number', () => {
  const strings = JSON.stringify(Object.values(plans));
  assert.ok(!/\.\.\.|…/.test(strings), 'no ellipsis anywhere in a reference plan');
  assert.deepEqual(plans.tossOverview.scene.readoutIds, ['motionState', 'gravityState']);
});
