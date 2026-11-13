// The three scripted sdk-8 programs for the reference toss-and-drop plans (packages/web/src/interact-toss-programs.js): each seals with the plan's tuple, passes every deterministic check at every
// capture case of its plan (the layout rules of frame-overlap.js included) and reports the oracle's numbers (interact-oracle.js). No model call, no browser: the programs run in the pinned QuickJS engine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planHash } from '../../web/src/interact-plan.js';
import { interactFixtures } from '../../web/src/interact-plan-fixtures.js';
import { TOSS_PROGRAMS, sealTossProgram, tossDraft } from '../../web/src/interact-toss-programs.js';
import { frameOverlaps } from '../../web/src/explain-program/frame-overlap.js';
import { validateBuildOutput } from '../src/interact-build.js';
import { buildPlanCaptureCases, checkSceneAgainstPlan, headlessCaptureCard } from '../src/interact-checks.js';
import { fixtureContext } from '../src/interact-fixtures.js';
import { interactOracle } from '../src/interact-oracle.js';

const { referencePlans, referenceCapabilities } = await interactFixtures();
const NAMES = Object.keys(TOSS_PROGRAMS);
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);

async function build(name, edit = d => d) {
  const plan = structuredClone(referencePlans[name]), job = { id: `job-${name}`, plan, planHash: await planHash(referencePlans[name]), capabilities: referenceCapabilities };
  const draft = tossDraft(name); edit(draft);
  const built = await validateBuildOutput(job, draft, fixtureContext());
  assert.ok(built.artifacts, `${name} must pass the structural checks: ${JSON.stringify(built.details)}`);
  return { plan, ...built };
}
async function check(name, edit) {
  const b = await build(name, edit), { cases, probes, coverage } = buildPlanCaptureCases(b.plan, b.composition, b.artifacts);
  const captures = await headlessCaptureCard({})({ composition: b.composition, artifacts: b.artifacts, cases: [...cases, ...probes] });
  const det = checkSceneAgainstPlan({ plan: b.plan, composition: b.composition, artifacts: b.artifacts, captures, cases, probes, oracle: interactOracle(b.plan), allowPartialCard: true });
  return { ...b, cases, probes, coverage, captures, det };
}
const at = (r, id) => { const c = r.captures.find(x => x.caseId === id) ?? r.captures.find(x => r.cases.find(k => k.id === x.caseId)?.aliases.includes(id)); assert.ok(c, `capture ${id}`); return c.trace; };

test('each program seals with the sdk-8 tuple of its approved plan, declares the approved capabilities, and stays inside the program limits', async () => {
  for (const name of NAMES) {
    const sealed = await sealTossProgram(name), plan = referencePlans[name];
    assert.deepEqual([sealed.sdkVersion, sealed.schemaVersion], ['sdk-8', 1], name);
    assert.deepEqual(sealed.manifest.capabilities, plan.scene.runtime.requiredCapabilities);
    assert.ok(new TextEncoder().encode(TOSS_PROGRAMS[name].source).length <= 16 * 1024, `${name} source is within 16 KiB`);
    const b = await build(name);
    assert.equal(b.artifacts.main.program.bundleHash, sealed.bundleHash, 'the pipeline seals the same artifact');
  }
});

test('every capture case of every plan passes all deterministic checks, the layout rules included, and the oracle is checked', async () => {
  const expected = { tossOverview: 'toss-overview', tossStandard: 'toss-standard', tossDeep: 'toss-deep' };
  for (const name of NAMES) {
    const r = await check(name);
    assert.deepEqual(r.det.problems, [], `${name}: ${r.det.problems.map(p => p.message).join(' / ')}`);
    assert.equal(interactOracle(r.plan).id, expected[name]);
    assert.ok(r.det.coverage.oracle.checked >= 18, `${name} oracle rows checked: ${r.det.coverage.oracle.checked}`);
    assert.deepEqual([r.coverage.incomplete, r.coverage.problems], [false, []]);
    assert.deepEqual(r.det.coverage.effects.untested, [], `${name}: every adjustable input has an effect`);
    for (const c of r.captures) assert.deepEqual(frameOverlaps({ objects: c.trace.objects, ...c.trace.frame }, 100), [], `${name} ${c.caseId}: no layout rule fires (text-body, text-line, text-arrow, text-box, text-circle, text-text, text-frame)`);
  }
});

test('Standard: +0.98, 0.00 and -0.98 m/s at -0.10, 0 and +0.10 s from the top; the second ball is held, then equals the tossed ball (height, velocity, acceleration)', async () => {
  const r = await check('tossStandard'), q = id => at(r, id).quantities;
  near(q('cp-before').tossedVelocity, 0.98); near(q('cp-top').tossedVelocity, 0); near(q('cp-after').tossedVelocity, -0.98);
  for (const id of ['start', 'cp-before', 'cp-top', 'cp-after', 'end']) near(q(id).tossedAcceleration, -9.8);
  assert.deepEqual([q('cp-before').dropVelocity, q('cp-before').dropAcceleration], [0, 0]);
  near(q('cp-before').dropHeight, 16 / 19.6); near(q('cp-after').dropHeight, q('cp-after').tossedHeight);
  near(q('cp-after').dropVelocity, q('cp-after').tossedVelocity); near(q('cp-after').dropAcceleration, -9.8);
  const states = id => at(r, id).texts.filter(t => /^(At |Rising|Falling|Held|Just|Back)/.test(t));
  assert.deepEqual(states('start'), ['At launch', 'Held in place']);
  assert.deepEqual(states('cp-top'), ['At the top', 'Just released']);
  assert.deepEqual(states('cp-after'), ['Falling', 'Falling together']);
  assert.deepEqual(states('end'), ['At launch height', 'At launch height']);
});

test('Deep: F = m g at the top (9.8 N at 1 kg, 29.4 N at 3 kg) with the trajectory unchanged, a = -g throughout, and the plot point is the ball velocity', async () => {
  const r = await check('tossDeep'), q = id => at(r, id).quantities;
  near(q('cp-top').force, 9.8); near(q('cp-heavyTop').force, 29.4);
  for (const k of ['velocity', 'height', 'acceleration']) near(q('cp-heavyTop')[k], q('cp-top')[k]);
  near(q('cp-top').velocity, 0); near(q('cp-before').velocity, 0.98);
  const plot = at(r, 'cp-before').objects.find(o => o.id === 'plot.vt');
  assert.deepEqual(plot.series.map(s => s.label), ['v = u − g t', 'now']);
  assert.equal(at(r, 'cp-top').readouts.motionState, 'At the top');
});

test('the plan\'s inputs and timeline reach the program: every probe pair differs, and Overview has one input only (gravity is fixed at 9.8)', async () => {
  const o = await check('tossOverview');
  assert.deepEqual(o.plan.controls.filter(c => c.binding.kind === 'input').map(c => c.binding.id), ['launchSpeed']);
  assert.deepEqual(o.det.coverage.effects.tested, ['speed']);
  const s = await check('tossStandard'), d = await check('tossDeep');
  assert.deepEqual(s.det.coverage.effects.tested, ['speed', 'gravityControl']);
  assert.deepEqual(d.det.coverage.effects.tested, ['speed', 'gravityControl', 'massControl']);
});

// The layout rules hold at every state, not only at the plan's capture cases: a grid of speeds, gravities, masses and times (around the top, the launch and the end included).
test('no layout rule fires anywhere on a grid of inputs and times', async () => {
  for (const name of NAMES) {
    const b = await build(name), cases = [];
    const gs = name === 'tossOverview' ? [9.8] : [6, 7.5, 9.8, 12], ms = name === 'tossDeep' ? [0.2, 3] : [1];
    for (const launchSpeed of [2, 3, 4, 5]) for (const gravity of gs) for (const mass of ms) {
      const top = launchSpeed / gravity, end = 2 * top, inputs = { launchSpeed, gravity, mass };
      for (const f of [0, 0.05, 0.15, 0.3, 0.45, 0.5, 0.55, 0.7, 0.85, 0.95, 1]) cases.push({ id: `u${launchSpeed}-g${gravity}-m${mass}-f${f}`, inputs, time: f * end, events: [] });
      for (const dt of [-0.1, 0, 0.1, -0.03, 0.03, -0.5, 0.5]) if (top + dt >= 0 && top + dt <= end) cases.push({ id: `u${launchSpeed}-g${gravity}-m${mass}-top${dt}`, inputs, time: top + dt, events: [] });
    }
    const captures = await headlessCaptureCard({})({ composition: b.composition, artifacts: b.artifacts, cases });
    assert.equal(captures.length, cases.length);
    for (const c of captures) {
      assert.equal(c.trace.error, undefined, `${name} ${c.caseId}`);
      assert.deepEqual(frameOverlaps({ objects: c.trace.objects, ...c.trace.frame }, 100), [], `${name} ${c.caseId}`);
    }
  }
});

// A lane is a container: the v and a letters beside the arrows and "Launch height" under the ground line sit inside their lane and no layout rule fires (frame-overlap.js skips the lane's own box).
test('every program draws its v and a letters and "Launch height" inside the lane, and the layout rules pass', async () => {
  for (const [name, letters] of [['tossOverview', ['vec.vL', 'vec.aL']], ['tossStandard', ['vec.v.tossL', 'vec.a.tossL', 'vec.v.dropL', 'vec.a.dropL']], ['tossDeep', ['vec.vL', 'vec.aL']]]) {
    const b = await build(name);
    const [capture] = await headlessCaptureCard({})({ composition: b.composition, artifacts: b.artifacts, cases: [{ id: 'mid', inputs: { launchSpeed: 4, gravity: 9.8, mass: 1 }, time: 0.6, events: [] }] });
    const objects = capture.trace.objects, lanes = objects.filter(o => o.kind === 'box' && objects.some(t => t.id === `${o.id}.title`));
    assert.deepEqual(frameOverlaps({ objects, ...capture.trace.frame }, 100), [], name);
    const inLane = id => { const t = objects.find(o => o.id === id); return t && lanes.some(l => t.x >= l.x && t.x <= l.x + l.w && t.y >= l.y && t.y <= l.y + l.h); };
    const launch = objects.filter(o => o.id.startsWith('label.launch')).map(o => o.id);
    assert.ok(launch.length, `${name}: Launch height is drawn`);
    for (const id of [...letters, ...launch]) assert.ok(inLane(id), `${name}: ${id} is inside a lane`);
  }
});
