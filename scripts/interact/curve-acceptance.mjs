// Hand-run acceptance evidence for the curve-sliders family (owner 2026-11-14 10:05), in-process, no network, no model:
//   node scripts/interact/curve-acceptance.mjs        prints a JSON report: round trip, zero-model build, oracle, the six wrong briefs
import { interactFixtures } from '../../packages/web/src/interact-plan-fixtures.js';
import { expandBrief, extractBrief, curveSliders } from '../../packages/web/src/interact-family-curve-sliders.js';
import { planHash } from '../../packages/web/src/interact-plan.js';
import { briefSchema } from '../../packages/web/src/interact-plan-brief.js';
import { buildTemplate } from '../../packages/control-plane/src/interact-template.js';
import { buildPlanCaptureCases, headlessCaptureCard, checkSceneAgainstPlan } from '../../packages/control-plane/src/interact-checks.js';
import { fixtureContext } from '../../packages/control-plane/src/interact-fixtures.js';
import { interactOracle } from '../../packages/control-plane/src/interact-oracle.js';
import { formulaProblems } from '../../packages/control-plane/src/interact-design-fill.js';
import { wrongCurveBriefs } from '../../packages/control-plane/test/fixtures/interact-curve-wrong-briefs.js';

const DEPTHS = ['brief', 'balanced', 'detailed'], fixtures = await interactFixtures(), capabilities = fixtures.referenceCapabilities;
let fetches = 0; const realFetch = globalThis.fetch; globalThis.fetch = (...a) => { fetches++; return realFetch(...a); };
const noModels = { ...fixtureContext(), adapters: {}, adapter: undefined };
const report = { roundTrip: [], zeroModelBuild: [], oracle: [], wrongBriefs: [] };
for (const depth of DEPTHS) {
  const id = `curve-logistic-${depth}`, plan = fixtures.curvePlans[id];
  const rebuilt = expandBrief(extractBrief(plan), depth, { catalogueHash: capabilities.catalogueHash });
  report.roundTrip.push({ id, equalPlanHash: await planHash(rebuilt) === await planHash(plan) });
  const job = { id, plan, planHash: await planHash(plan), capabilities }, before = fetches;
  const built = await buildTemplate(job, noModels);
  report.zeroModelBuild.push({ id, built: !!built.artifacts, problems: built.problems ?? null, template: plan.scene.template, fetchesDuringBuild: fetches - before });
  const { cases, probes } = buildPlanCaptureCases(plan, built.composition, built.artifacts);
  const captures = await headlessCaptureCard({})({ ...built, cases: [...cases, ...probes] });
  const oracle = interactOracle(plan), result = checkSceneAgainstPlan({ ...built, plan, captures, cases, probes, oracle, allowPartialCard: true });
  report.oracle.push({ id, oracleId: oracle.id, problems: result.problems, checked: result.coverage.oracle.checked, skipped: result.coverage.oracle.skipped, fetchesTotal: fetches });
}
for (const bad of wrongCurveBriefs) {
  const flat = briefSchema('detailed', curveSliders).parse(bad.brief).ok;
  const check = curveSliders.referenceCheck(bad.brief, 'detailed');
  const first = check.failures[0];
  report.wrongBriefs.push({ id: bad.id, validFlatBrief: flat, expected: { code: bad.code, path: bad.path }, actual: { code: first?.code ?? null, path: first?.path ?? null }, right: first?.code === bad.code && first?.path === bad.path, fillProblemLine: formulaProblems(check)[0] ?? null });
}
console.log(JSON.stringify(report, null, 1));
