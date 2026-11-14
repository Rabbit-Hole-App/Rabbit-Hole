import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interactFixtures } from '../../web/src/interact-plan-fixtures.js';
import { expandBrief, extractBrief, curveSliders } from '../../web/src/interact-family-curve-sliders.js';
import { parseScenePlan, planHash, captureBudgetProblems, descriptionFitProblems } from '../../web/src/interact-plan.js';
import { descriptionFit } from '../../web/src/interact-description-fit.js';
import { designPinOf, pinnedFixtureId, pinnedPlan } from '../src/interact-design-pin.js';
import { interactOracle } from '../src/interact-oracle.js';
import { buildTemplate, templateGate } from '../src/interact-template.js';
import { buildPlanCaptureCases, headlessCaptureCard, checkSceneAgainstPlan } from '../src/interact-checks.js';
import { fixtureContext } from '../src/interact-fixtures.js';
import { designStack } from './interact-design-fixture.js';

const fixtures = await interactFixtures(), capabilities = fixtures.referenceCapabilities;
const depths = ['brief', 'balanced', 'detailed'];
const idOf = depth => 'curve-logistic-' + depth;
const noModels = { ...fixtureContext(), adapters: {}, adapter: undefined };
test('the three curve plans are registered with the curve pin and have valid hashes, bindings, capture budgets and description fit', async () => {
  assert.ok(fixtures.curvePlans, 'curve plans missing');
  assert.deepEqual(Object.keys(fixtures.curvePlans), depths.map(idOf));
  assert.equal(designPinOf({ SMALL_ENV: 'test', INTERACT_DESIGN_FIXTURE: 'curve' }), 'curve');
  assert.equal(designPinOf({ INTERACT_DESIGN_FIXTURE: 'curve' }), null);
  for (const depth of depths) {
    const id = idOf(depth), plan = fixtures.curvePlans[id];
    assert.equal(pinnedFixtureId('curve', depth), id);
    assert.equal(pinnedFixtureId(id, depth), id);
    assert.equal(pinnedFixtureId(id, depths.find(d => d !== depth)), null);
    assert.deepEqual(await pinnedPlan('curve', { depth }), plan);
    const checked = parseScenePlan(plan, capabilities);
    assert.equal(checked.ok, true, JSON.stringify(checked.problems));
    assert.deepEqual(captureBudgetProblems(plan), []);
    assert.deepEqual(await descriptionFitProblems(plan, await descriptionFit(plan)), []);
    const rebuilt = expandBrief(extractBrief(plan), depth, { catalogueHash: capabilities.catalogueHash });
    assert.equal(await planHash(rebuilt), await planHash(plan));
    assert.deepEqual(templateGate({ INTERACT_BUILD_KIND: 'template' }, plan), { ok: true, template: plan.scene.template });
  }
});
for (const depth of depths) test(depth + ': real zero-model template build passes validation, layout, effects and a complete closed-form oracle', async t => {
  const plan = fixtures.curvePlans?.[idOf(depth)];
  assert.ok(plan, 'pinned curve missing');
  const job = { id: idOf(depth), plan, planHash: await planHash(plan), capabilities };
  const built = await buildTemplate(job, noModels);
  assert.ok(built.artifacts, JSON.stringify(built.details ?? built.problems));
  const { cases, probes } = buildPlanCaptureCases(plan, built.composition, built.artifacts);
  t.diagnostic(depth + ': ' + cases.length + ' image cases + ' + probes.length + ' trace probes');
  const captures = await headlessCaptureCard({})({ ...built, cases: [...cases, ...probes] });
  const oracle = interactOracle(plan);
  assert.equal(oracle.id, idOf(depth));
  assert.equal(oracle.invariants.ok, true);
  assert.deepEqual(oracle.bounds.declared, [0, 1]);
  assert.ok(oracle.bounds.overSliderDomain[0] > 0 && oracle.bounds.overSliderDomain[1] < 1);
  const extent = curveSliders.independent.domain[1] + (depth === 'brief' ? 0 : plan.controls.find(c => c.binding.id === 'x0').max);
  const maxK = plan.controls.find(c => c.binding.id === 'k').max;
  assert.deepEqual(oracle.bounds.overSliderDomain, [1 / (1 + Math.exp(maxK * extent)), 1 / (1 + Math.exp(-maxK * extent))]);
  assert.deepEqual(oracle.bounds.atDefaultInputs, [1 / (1 + Math.exp(6)), 1 / (1 + Math.exp(-6))]);
  const check = () => checkSceneAgainstPlan({ ...built, plan, captures, cases, probes, oracle, allowPartialCard: true });
  const result = check();
  assert.deepEqual(result.problems, [], JSON.stringify(result.problems));
  assert.ok(result.coverage.oracle.checked >= 30);
  assert.deepEqual(result.coverage.oracle.skipped, []);
  const at = captures.find(c => c.caseId === 'default').trace.quantities;
  assert.ok(Math.abs(at.yAtMarker - Math.E / (1 + Math.E)) < 1e-12);
  assert.ok(Math.abs(at.slope - Math.E / (1 + Math.E) ** 2) < 1e-12);
  // The oracle compares runtime numbers, not its own prose or plan formulas.
  captures[0].trace.quantities.yAtMarker += 0.01;
  assert.ok(check().problems.some(p => p.code === 'numeric_mismatch' && p.path.endsWith('.yAtMarker')));
});
test('a curve with false invariant mathematics cannot acquire a trusted oracle', async () => {
  const plan = structuredClone(fixtures.curvePlans?.[idOf('detailed')]);
  assert.ok(plan);
  plan.scene.quantities.find(q => q.id === 'slope').formula = '0';
  assert.throws(() => interactOracle(plan), error => error.code === 'curve_invariant' && error.failures[0].path === 'formulas.slope.formula');
});
test('the curve pin reaches ready at every depth through the real job path with zero model calls and no outbound fetch', async t => {
  const quiet = console.log; console.log = () => {}; t.after(() => { console.log = quiet; });
  const sent = [];
  for (const depth of depths) {
    const s = designStack(t);
    delete s.deps.descriptionFit; s.deps.buildScene = undefined;
    Object.assign(s.env, { INTERACT_DESIGN_FIXTURE: 'curve', INTERACT_BUILD_KIND: 'template', EXPLAIN_DIAGNOSTICS: 'true', INTERACT_DESCRIPTION_FIT: 'estimate', INTERACT_RUN: 'headless', INTERACT_REVIEW: 'shadow' });
    const original = globalThis.fetch;
    globalThis.fetch = async url => { sent.push(String(url)); throw new Error('no model/network call allowed'); };
    t.after(() => { globalThis.fetch = original; });
    const { body } = await s.create({ depth });
    const id = body.job.id;
    assert.equal((await s.design(id)).job.stage, 'awaiting_approval');
    assert.equal((await s.approve(id)).status, 202);
    for (let i = 0; i < 30; i++) {
      await s.actor.alarm();
      const job = s.state.data.get('job:' + id);
      if (['ready', 'failed', 'cancelled'].includes(job.stage) && !job.inFlight) break;
    }
    const job = s.state.data.get('job:' + id);
    assert.equal(job.stage, 'ready', depth + ': ' + JSON.stringify([job.stopReason, job.failure, job.findings]));
    assert.deepEqual(job.build.counts, { build_author: 0, build_review: 0, build_repair: 0 });
    assert.equal(job.calls.length, 0);
    assert.deepEqual(s.model.roles(), []);
    assert.equal(job.build.kind, 'template');
  }
  assert.deepEqual(sent, []);
});
