// Oracles for the three reference toss-and-drop plans (owner 2026-11-13): trusted expected values from the equations, with the numbers the references state.
import test from 'node:test';
import assert from 'node:assert/strict';
import { interactOracle, tossOverviewOracle, tossStandardOracle, tossDeepOracle } from '../src/interact-oracle.js';
import { interactFixtures } from '../../web/src/interact-plan-fixtures.js';

const { referencePlans: plans, plans: older } = await interactFixtures();
const clone = value => structuredClone(value);
const get = (oracle, caseId, name) => oracle.expect.find(e => e.case === caseId && e.name === name)?.expected;
const near = (actual, expected, tol = 1e-9) => assert.ok(Math.abs(actual - expected) <= tol, `${actual} is not ${expected}`);

test('the three oracles each match their own reference plan only, and no older oracle claims a reference plan', () => {
  assert.deepEqual([interactOracle(plans.tossOverview).id, interactOracle(plans.tossStandard).id, interactOracle(plans.tossDeep).id], ['toss-overview', 'toss-standard', 'toss-deep']);
  assert.deepEqual([tossOverviewOracle(plans.tossStandard), tossOverviewOracle(plans.tossDeep), tossStandardOracle(plans.tossOverview), tossStandardOracle(plans.tossDeep), tossDeepOracle(plans.tossOverview), tossDeepOracle(plans.tossStandard)], [null, null, null, null, null, null]);
  for (const name of Object.keys(older)) for (const oracle of [tossOverviewOracle, tossStandardOracle, tossDeepOracle]) assert.equal(oracle(older[name]), null, `${name} is not a reference card`);
  assert.deepEqual(['overviewProgram', 'pendulum', 'standard', 'deep'].map(name => interactOracle(older[name])?.id), ['toss-drop-overview', 'pendulum-period', 'toss-drop-standard', 'toss-drop-deep'], 'the older oracles are unchanged');
});

test('Overview: the apex is u/g with v = 0, and the velocity at the rising and falling checkpoints is +-u/2', () => {
  const o = tossOverviewOracle(plans.tossOverview);
  near(get(o, 'start', 'velocity'), 4); near(get(o, 'cp-rising', 'velocity'), 2); near(get(o, 'cp-top', 'velocity'), 0); near(get(o, 'cp-falling', 'velocity'), -2); near(get(o, 'end', 'velocity'), -4);
  near(get(o, 'cp-top', 'apexTime'), 4 / 9.8); near(get(o, 'cp-top', 'apexHeight'), 16 / 19.6);
  near(get(o, 'cp-fastTop', 'apexTime'), 5 / 9.8); near(get(o, 'cp-fastTop', 'apexHeight'), 25 / 19.6); near(get(o, 'cp-fastTop', 'velocity'), 0);
  near(get(o, 'bound-speed-min', 'apexTime'), 2 / 9.8); near(get(o, 'bound-speed-max', 'apexTime'), 5 / 9.8);
  assert.equal(get(o, 'cp-top', 'gravity'), undefined, 'a fixed value is never an expected quantity');
  assert.equal(o.expect.every(e => e.panel === 'main' && e.tol === 1e-6), true);
});

test('Standard: +0.98, 0.00 and -0.98 m/s at -0.10, 0 and +0.10 s; the acceleration is -9.8 throughout; both balls are equal after the release', () => {
  const o = tossStandardOracle(plans.tossStandard);
  near(get(o, 'cp-before', 'tossedVelocity'), 0.98); near(get(o, 'cp-top', 'tossedVelocity'), 0); near(get(o, 'cp-after', 'tossedVelocity'), -0.98);
  for (const c of ['start', 'cp-before', 'cp-top', 'cp-after', 'end']) near(get(o, c, 'tossedAcceleration'), -9.8);
  // Before the release the second ball is held at the top height: velocity and acceleration zero.
  near(get(o, 'cp-before', 'dropVelocity'), 0); near(get(o, 'cp-before', 'dropAcceleration'), 0); near(get(o, 'cp-before', 'dropHeight'), 16 / 19.6); near(get(o, 'start', 'dropAcceleration'), 0);
  // At the instant of release the gate may switch at or just after zero: that one acceleration is not asserted.
  near(get(o, 'cp-top', 'dropVelocity'), 0); assert.equal(get(o, 'cp-top', 'dropAcceleration'), undefined);
  // After the release the two balls have equal height, velocity and acceleration.
  near(get(o, 'cp-after', 'dropVelocity'), get(o, 'cp-after', 'tossedVelocity')); near(get(o, 'cp-after', 'dropHeight'), get(o, 'cp-after', 'tossedHeight')); near(get(o, 'cp-after', 'dropAcceleration'), -9.8);
  near(get(o, 'cp-after', 'tossedHeight'), 16 / 19.6 - 9.8 * 0.01 / 2);
  near(get(o, 'end', 'dropVelocity'), -4); near(get(o, 'end', 'tossedVelocity'), -4); near(get(o, 'end', 'dropHeight'), 0);
  // Fast toss at weak gravity, at its own top: u = 5, g = 6.
  near(get(o, 'cp-fastTop', 'apexTime'), 5 / 6); near(get(o, 'cp-fastTop', 'apexHeight'), 25 / 12); near(get(o, 'cp-fastTop', 'tossedAcceleration'), -6); near(get(o, 'cp-fastTop', 'dropVelocity'), 0);
  assert.ok(25 / 12 <= 2.2, 'the highest top still fits the fixed 0 to 2.2 m height scale');
});

test('Deep: v = u - g t samples, F = m g at the top (9.8 N at the default, 29.4 N at 3 kg, the trajectory unchanged), a = -g', () => {
  const o = tossDeepOracle(plans.tossDeep);
  near(get(o, 'cp-before', 'velocity'), 0.98); near(get(o, 'cp-top', 'velocity'), 0); near(get(o, 'cp-top', 'height'), 16 / 19.6); near(get(o, 'cp-top', 'apexHeight'), 0.8163265306122449);
  near(get(o, 'cp-before', 'height'), 4 * (4 / 9.8 - 0.1) - 9.8 * (4 / 9.8 - 0.1) ** 2 / 2);
  near(get(o, 'cp-top', 'force'), 9.8); near(get(o, 'cp-heavyTop', 'force'), 29.4);
  for (const name of ['velocity', 'height', 'acceleration', 'apexTime']) near(get(o, 'cp-heavyTop', name), get(o, 'cp-top', name));
  for (const c of ['start', 'cp-before', 'cp-top', 'cp-heavyTop', 'end']) near(get(o, c, 'acceleration'), -9.8);
  near(get(o, 'cp-fastTop', 'force'), 6); near(get(o, 'cp-fastTop', 'acceleration'), -6); near(get(o, 'cp-fastTop', 'height'), 25 / 12); near(get(o, 'cp-fastTop', 'velocity'), 0);
  near(get(o, 'end', 'velocity'), -4); near(get(o, 'start', 'velocity'), 4);
  near(get(o, 'bound-massControl-max', 'force'), 3 * 9.8); near(get(o, 'bound-massControl-min', 'force'), 0.2 * 9.8);
});

test('an oracle never matches by guessing: a changed range, default, pause marker, rate or timeline origin returns null', () => {
  const broken = (name, edit) => { const plan = clone(plans[name]); edit(plan); return plan; };
  assert.equal(tossStandardOracle(broken('tossStandard', p => { p.controls.find(c => c.id === 'speed').max = 6; })), null);
  assert.equal(tossStandardOracle(broken('tossStandard', p => { p.controls.find(c => c.id === 'gravityControl').default = 9.0; })), null);
  assert.equal(tossStandardOracle(broken('tossStandard', p => { p.mode.timeline.markers[0].pause = false; })), null);
  assert.equal(tossStandardOracle(broken('tossStandard', p => { p.mode.timeline.markers[0].time = { op: 'literal', value: 0.1 }; })), null);
  assert.equal(tossStandardOracle(broken('tossStandard', p => { p.mode.timeline.playbackRate = 0.1; })), null);
  assert.equal(tossStandardOracle(broken('tossStandard', p => { p.mode.timeline.displayOffset = { op: 'literal', value: 0 }; })), null, 'Standard counts time from the top');
  assert.equal(tossDeepOracle(broken('tossDeep', p => { p.controls = p.controls.filter(c => c.id !== 'massControl'); })), null);
  assert.equal(tossOverviewOracle(broken('tossOverview', p => { p.mode.fixedValues.gravity = 8; })), null);
  assert.equal(tossOverviewOracle(broken('tossOverview', p => { p.supportingVisuals = [{}]; })), null, 'one program frame only');
  assert.equal(tossOverviewOracle(broken('tossOverview', p => { p.mode.timeline.markers.push({ id: 'extra', label: 'Extra', time: p.mode.timeline.end, pause: true }); })), null, 'the Overview pauses at the top only');
});

// ---- the pin family (interact-design-pin.js) ----
import { FIXTURE_DEPTHS, PIN_FIXTURES, designPinOf, pinnedDesignCall, pinnedFixtureId, pinnedPlan } from '../src/interact-design-pin.js';
import { fixtureRun, FIXTURE_IDS, LEGACY_OVERVIEW } from '../src/interact-fixtures.js';

test('one pin family: INTERACT_DESIGN_FIXTURE=toss pins by Depth (brief, balanced, detailed), a plan id pins its own Depth only, the older ids keep pinning the Standard', () => {
  assert.deepEqual(FIXTURE_DEPTHS, { brief: 'toss-overview', balanced: 'toss-standard', detailed: 'toss-deep' });
  assert.deepEqual(['brief', 'balanced', 'detailed', 'overview', 'standard', 'deep'].map(d => pinnedFixtureId('toss', d)), ['toss-overview', 'toss-standard', 'toss-deep', 'toss-overview', 'toss-standard', 'toss-deep'], 'the old Depth names resolve too');
  assert.deepEqual(['brief', 'balanced', 'detailed'].map(d => pinnedFixtureId('toss-standard', d)), [null, 'toss-standard', null]);
  assert.deepEqual(['brief', 'balanced', 'detailed'].map(d => pinnedFixtureId('toss-deep', d)), [null, null, 'toss-deep']);
  for (const old of ['toss-drop-standard', 'toss-drop-standard-controls']) assert.deepEqual(['brief', 'balanced', 'detailed'].map(d => pinnedFixtureId(old, d)), [null, old, null], old);
  assert.equal(pinnedFixtureId('toss', 'free'), null);
  for (const id of ['toss', 'toss-overview', 'toss-standard', 'toss-deep', 'toss-drop-standard', 'toss-drop-standard-controls']) assert.ok(PIN_FIXTURES.includes(id), id);
});

test('the pin is dev-only: SMALL_ENV dev/test or EXPLAIN_DIAGNOSTICS true; production and an unknown id never pin', () => {
  assert.equal(designPinOf({ SMALL_ENV: 'dev', INTERACT_DESIGN_FIXTURE: 'toss' }), 'toss');
  assert.equal(designPinOf({ SMALL_ENV: 'test', INTERACT_DESIGN_FIXTURE: 'toss' }), 'toss');
  assert.equal(designPinOf({ EXPLAIN_DIAGNOSTICS: 'true', INTERACT_DESIGN_FIXTURE: 'toss-deep' }), 'toss-deep');
  assert.equal(designPinOf({ INTERACT_DESIGN_FIXTURE: 'toss' }), null);
  assert.equal(designPinOf({ SMALL_ENV: 'production', EXPLAIN_DIAGNOSTICS: 'false', INTERACT_DESIGN_FIXTURE: 'toss' }), null);
  assert.equal(designPinOf({ SMALL_ENV: 'dev', INTERACT_DESIGN_FIXTURE: 'toss-unknown' }), null);
  assert.equal(designPinOf({ SMALL_ENV: 'dev', INTERACT_DESIGN_FIXTURE: 'toss-drop-overview-legacy' }), null, 'the retired static Overview is not in the pin list');
});

test('pinnedPlan answers the plan of the job Depth, keeps only the claim evidence the job supplied, and leaves the fixture untouched', async () => {
  const evidence = [{ id: 'kinematics_note' }];
  for (const [depth, name] of [['brief', 'tossOverview'], ['balanced', 'tossStandard'], ['detailed', 'tossDeep']]) {
    const plan = await pinnedPlan('toss', { depth, evidence });
    assert.deepEqual([plan.title, plan.claims.map(c => c.evidenceIds)], [plans[name].title, plans[name].claims.map(c => c.evidenceIds)], 'the supplied id stays');
    const bare = await pinnedPlan('toss', { depth, evidence: [] });
    assert.ok(bare.claims.every(c => c.evidenceIds.length === 0), 'an evidence id the job did not supply is dropped');
    assert.ok(plans[name].claims.every(c => c.evidenceIds.length === 1), 'the shared fixture is not mutated');
  }
  assert.match((await pinnedPlan('toss-drop-standard', { depth: 'balanced', evidence })).cardDescription, /^A ball tossed at 3\.0 m\/s has zero velocity at its top/, 'the original Standard keeps its short pinned copy');
});

test('pinnedDesignCall answers all three design roles with no model call at the pinned Depth and returns null (the real call) at any other', async () => {
  const job = depth => ({ id: 'job-1', depth, evidence: [{ id: 'kinematics_note' }] });
  const quiet = console.log; console.log = () => {};
  try {
    for (const [depth, title] of [['brief', plans.tossOverview.title], ['balanced', plans.tossStandard.title], ['detailed', plans.tossDeep.title]]) {
      const author = await pinnedDesignCall('toss', job(depth), 'design_author', { input: { capabilities: { catalogueHash: 'a'.repeat(64) } } });
      assert.equal(author.output.title, title);
      assert.equal(author.output.scene.runtime.catalogueHash, 'a'.repeat(64), 'the plan binds to the catalogue the job was offered');
      assert.equal((await pinnedDesignCall('toss', job(depth), 'design_review', { input: { planHash: 'h' } })).output.verdict, 'pass');
      assert.deepEqual((await pinnedDesignCall('toss', job(depth), 'design_revise', { input: { plan: { x: 1 } } })).output, { plan: { x: 1 }, changes: [], unresolvedFindingIds: [] });
      assert.equal(await pinnedDesignCall('toss', job(depth), 'build_author', {}), null, 'a build role is never pinned here');
    }
    assert.equal(await pinnedDesignCall('toss-deep', job('balanced'), 'design_author', {}), null);
    assert.equal(await pinnedDesignCall('toss-drop-standard', job('detailed'), 'design_author', {}), null, 'the old id stays balanced only');
  } finally { console.log = quiet; }
});

test('item 6: the old static Moment Overview is out of the pin list and keeps its scripted fixture under a legacy id', async () => {
  assert.ok(!PIN_FIXTURES.includes(LEGACY_OVERVIEW) && FIXTURE_IDS.includes(LEGACY_OVERVIEW));
  const fx = await fixtureRun(LEGACY_OVERVIEW);
  assert.equal(fx.oracle.id, 'toss-drop-overview');
  const { plan } = await fx.designRoles.design({ request: { depth: 'brief' } });
  assert.equal(plan.mode.kind, 'static');
  await assert.rejects(fx.designRoles.design({ request: { depth: 'balanced' } }), /has depths brief only/);
  const standard = await fixtureRun('toss-drop-standard', 'balanced');
  await assert.rejects(standard.designRoles.design({ request: { depth: 'brief' } }), /balanced, detailed only/, 'toss-drop-standard no longer answers brief');
});
