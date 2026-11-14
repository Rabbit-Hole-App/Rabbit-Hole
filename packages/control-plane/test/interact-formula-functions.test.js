// New grammar through the unchanged sealed sdk-8 template path, with no model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planHash, parseScenePlan } from '../../web/src/interact-plan.js';
import { interactFixtures } from '../../web/src/interact-plan-fixtures.js';
import { generateProgram } from '../../web/src/interact-templates/generate.js';
import { frameOverlaps } from '../../web/src/explain-program/frame-overlap.js';
import { buildInput, validateBuildOutput } from '../src/interact-build.js';
import { buildPlanCaptureCases, checkSceneAgainstPlan, headlessCaptureCard } from '../src/interact-checks.js';
import { fixtureContext } from '../src/interact-fixtures.js';
import { interactOracle } from '../src/interact-oracle.js';

test('all six functions seal/run on sdk-8; unary timeline nodes preserve every toss capture', async () => {
  const { referencePlans, referenceCapabilities } = await interactFixtures();
  const original = referencePlans.tossOverview, plan = structuredClone(original);
  // Same physics, written with every new operation; the pinned plan is untouched.
  const formulas = {
    launchSpeed: 'abs(launchSpeed)', gravity: 'sqrt(gravity^2)',
    height: '(launchSpeed * t - gravity * t^2 / 2) * exp(0)',
    velocity: 'min(launchSpeed - gravity * t, launchSpeed - gravity * t)',
    acceleration: '-abs(gravity)', apexTime: 'launchSpeed / gravity + log(1)',
    apexHeight: 'max(launchSpeed^2 / (2 * gravity), launchSpeed^2 / (2 * gravity))',
  };
  for (const q of plan.scene.quantities) q.formula = formulas[q.id];
  plan.mode.timeline.end = { op: 'multiply', left: plan.mode.timeline.end,
    right: { op: 'sqrt', arg: { op: 'divide', left: { op: 'input', id: 'launchSpeed' }, right: { op: 'input', id: 'launchSpeed' } } } };
  const parsed = parseScenePlan(plan, referenceCapabilities);
  assert.ok(parsed.ok, JSON.stringify(parsed.problems));
  const run = async p => {
    const job = { id: 'functions-through-template', plan: p, planHash: await planHash(p), capabilities: referenceCapabilities };
    const program = generateProgram(p, buildInput({}, p, job.planHash));
    const ctx = { ...fixtureContext(), adapter: undefined, adapters: {} }; // any role call fails
    const built = await validateBuildOutput(job, { main: { kind: 'program', program }, supporting: [] }, ctx);
    assert.ok(built.artifacts, JSON.stringify(built.details ?? built.problems));
    const { cases, probes } = buildPlanCaptureCases(p, built.composition, built.artifacts);
    const captures = await headlessCaptureCard({})({ composition: built.composition, artifacts: built.artifacts, cases: [...cases, ...probes] });
    const checked = checkSceneAgainstPlan({ plan: p, composition: built.composition, artifacts: built.artifacts,
      captures, cases, probes, oracle: interactOracle(p), allowPartialCard: true });
    assert.deepEqual(checked.problems, []);
    for (const c of captures) assert.deepEqual(frameOverlaps({ objects: c.trace.objects, ...c.trace.frame }, 100), []);
    return { program, captures };
  };
  const [before, after] = [await run(original), await run(plan)];
  for (const fn of ['exp', 'log', 'sqrt', 'abs', 'min', 'max']) assert.ok(after.program.source.includes('Math.' + fn + '('), fn);
  assert.equal(after.captures.length, before.captures.length);
  for (const c of before.captures) {
    const got = after.captures.find(x => x.caseId === c.caseId);
    assert.ok(got, c.caseId);
    assert.deepEqual(got.trace.objects, c.trace.objects, c.caseId + ': objects, text and geometry');
    assert.deepEqual(got.trace.readouts, c.trace.readouts, c.caseId + ': readouts');
    assert.deepEqual(got.trace.quantities, c.trace.quantities, c.caseId + ': quantities');
  }
});
