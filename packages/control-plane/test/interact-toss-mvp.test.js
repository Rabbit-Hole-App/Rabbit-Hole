// The design MVP's pin family (owner brief 11, section 5): INTERACT_DESIGN_FIXTURE=toss-mvp pins a job's design to the plan in packages/web/src/interact-toss-mvp-plans.js by its Depth, the oracle of such a plan is
// the reference physics at the plan's own ranges plus the arrow rule (interact-oracle.js verticalThrowOracle, id toss-mvp-<depth>), and a toss-mvp job reaches ready on the template build with no model call.
// The data file holds the stand-in plans (extractBrief -> expandBrief of the pinned toss plans) until the bench's best plans are picked (scripts/interact/pick-mvp-plans.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { explainRoute } from '../src/explain-job.js';
import { planHash, planProblems } from '../../web/src/interact-plan.js';
import { interactFixtures } from '../../web/src/interact-plan-fixtures.js';
import { TOSS_MVP_PLANS } from '../../web/src/interact-toss-mvp-plans.js';
import { expandBrief, extractBrief } from '../../web/src/interact-plan-brief.js';
import { generateProgram } from '../../web/src/interact-templates/generate.js';
import { frameOverlaps } from '../../web/src/explain-program/frame-overlap.js';
import { OWNER, BOARD, designStack } from './interact-design-fixture.js';
import { MVP_DEPTHS, PIN_FIXTURES, designPinOf, pinnedFixtureId, pinnedPlan } from '../src/interact-design-pin.js';
import { buildInput, validateBuildOutput } from '../src/interact-build.js';
import { buildPlanCaptureCases, checkSceneAgainstPlan, headlessCaptureCard } from '../src/interact-checks.js';
import { fixtureContext } from '../src/interact-fixtures.js';
import { interactOracle, verticalThrowOracle, tossCasesOf } from '../src/interact-oracle.js';
import { pickPlans, dataFileText } from '../../../scripts/interact/pick-mvp-plans.mjs';

test.beforeEach(t => { const log = console.log; console.log = () => {}; t.after(() => { console.log = log; }); });

const { referencePlans, referenceCapabilities } = await interactFixtures();
const DEPTHS = ['brief', 'balanced', 'detailed'], PINNED = { brief: 'tossOverview', balanced: 'tossStandard', detailed: 'tossDeep' };

test('the toss-mvp family pins by the job\'s Depth, to the data file\'s plan; a depth with no plan there is not pinned; production never takes it', async () => {
  assert.ok(PIN_FIXTURES.includes('toss-mvp') && Object.values(MVP_DEPTHS).every(id => PIN_FIXTURES.includes(id)));
  assert.deepEqual(DEPTHS.map(d => pinnedFixtureId('toss-mvp', d)), ['toss-mvp-brief', 'toss-mvp-balanced', 'toss-mvp-detailed']);
  assert.deepEqual(['brief', 'balanced'].map(d => pinnedFixtureId('toss-mvp-balanced', d)), [null, 'toss-mvp-balanced'], 'a plan id answers its own Depth only');
  assert.equal(designPinOf({ SMALL_ENV: 'dev', INTERACT_DESIGN_FIXTURE: 'toss-mvp' }), 'toss-mvp');
  assert.equal(designPinOf({ INTERACT_DESIGN_FIXTURE: 'toss-mvp' }), null, 'neither dev/test nor diagnostics: not taken');
  assert.equal(designPinOf({ SMALL_ENV: 'production', INTERACT_DESIGN_FIXTURE: 'toss-mvp' }), null);
  for (const depth of DEPTHS) {
    const plan = await pinnedPlan('toss-mvp', { depth, evidence: [] });
    assert.equal(plan.depth, depth); assert.deepEqual(planProblems(plan), [], depth);
    assert.deepEqual(plan.claims.flatMap(c => c.evidenceIds), [], 'evidence the job did not supply is dropped');
    assert.deepEqual(Object.keys(TOSS_MVP_PLANS).sort(), [...DEPTHS].sort());
  }
});

test('the oracle of a family plan is the reference physics at its own ranges plus the arrow rule, with its own id; the stand-in plans give the pinned cards\' expected values', () => {
  for (const depth of DEPTHS) {
    const plan = TOSS_MVP_PLANS[depth], own = verticalThrowOracle(plan), pinned = interactOracle(referencePlans[PINNED[depth]]);
    assert.equal(own.id, `toss-mvp-${depth}`); assert.ok(own.expect.length >= 18 && own.arrows.length > 0, depth);
    const key = r => `${r.case}|${r.name}`, ours = new Map(own.expect.map(r => [key(r), r.expected]));
    for (const r of pinned.expect) assert.ok(Math.abs(ours.get(key(r)) - r.expected) < 1e-9, `${depth} ${key(r)}: ${ours.get(key(r))} vs ${r.expected}`);
    assert.deepEqual(own.arrows.map(a => [a.case, a.id, a.dir]), pinned.arrows.map(a => [a.case, a.id, a.dir]), `${depth}: the same arrow rule`);
    assert.ok(tossCasesOf(plan), `${depth}: capture cases`);
  }
});

// Variants a model might write: other ranges and another gravity, the same family. Nothing here matches a pinned plan's ranges, so the family oracle is the one that answers.
const VARIANT = {
  brief: b => { b.launchSpeed = { min: 1, max: 4, default: 2, step: 0.1 }; b.gravity = { fixed: 3.7 }; },
  balanced: b => { b.launchSpeed = { min: 1.5, max: 4.5, default: 3, step: 0.1 }; b.gravity = { min: 5, max: 9, default: 7, step: 0.1 }; }, // the two-lane and plot templates draw the acceleration arrow at 3.4 px per m/s^2: below about 4 m/s^2 it is shorter than the arrow's minimum and not drawn (the arrow rule then fails, which is what the oracle is for)
  detailed: b => { b.launchSpeed = { min: 1, max: 3, default: 2, step: 0.1 }; b.gravity = { min: 4.5, max: 8, default: 6, step: 0.1 }; b.mass = { min: 0.5, max: 2, default: 1, step: 0.1 }; },
};
const variant = depth => { const b = extractBrief(referencePlans[PINNED[depth]]); VARIANT[depth](b); return expandBrief(b, depth, { catalogueHash: referenceCapabilities.catalogueHash }); };

async function check(plan) {
  const job = { id: `job-${plan.depth}`, plan, planHash: await planHash(plan), capabilities: referenceCapabilities };
  const built = await validateBuildOutput(job, { main: { kind: 'program', program: generateProgram(plan, buildInput({}, plan, 'hash')) }, supporting: [] }, fixtureContext());
  assert.ok(built.artifacts, `${plan.depth}: ${JSON.stringify(built.details ?? built.problems)}`);
  const { cases, probes } = buildPlanCaptureCases(plan, built.composition, built.artifacts);
  const captures = await headlessCaptureCard({})({ composition: built.composition, artifacts: built.artifacts, cases: [...cases, ...probes] });
  const det = checkSceneAgainstPlan({ plan, composition: built.composition, artifacts: built.artifacts, captures, cases, probes, oracle: interactOracle(plan), allowPartialCard: true });
  return { det, captures };
}

test('a plan with other ranges gets its own oracle (toss-mvp-<depth>), builds on the template path and passes it, the layout rules and the arrow rule; a tampered plan has no oracle', async () => {
  for (const depth of DEPTHS) {
    const plan = variant(depth), oracle = interactOracle(plan);
    assert.equal(oracle?.id, `toss-mvp-${depth}`, `${depth}: the family oracle answers, not a pinned card's`);
    assert.deepEqual(planProblems(plan), [], depth);
    const { det, captures } = await check(plan);
    assert.deepEqual(det.problems, [], `${depth}: ${det.problems.map(p => p.message).join(' / ')}`);
    assert.ok(det.coverage.oracle.checked >= 18, `${depth}: oracle rows checked ${det.coverage.oracle.checked}`);
    for (const c of captures) assert.deepEqual(frameOverlaps({ objects: c.trace.objects, ...c.trace.frame }, 100), [], `${depth} ${c.caseId}`);
    const tampered = structuredClone(plan); tampered.controls.find(c => c.type === 'number').onChange = 'recompute_still';
    assert.equal(interactOracle(tampered), null, `${depth}: a plan that is not the family's expansion has no oracle (never matched by guessing)`);
  }
});

test('a wrong formula in a family plan is caught by its oracle (the program computes the plan\'s formula, the oracle the physics)', async () => {
  const plan = variant('brief'); plan.scene.quantities.find(q => q.id === 'velocity').formula = 'launchSpeed + gravity * t';
  const { det } = await check(plan);
  assert.ok(det.problems.some(p => /velocity/.test(p.message)), det.problems.map(p => p.message).join(' / '));
});

// ---- the job: a toss-mvp job reaches ready on the real stack with zero model calls, at each depth ------------------------------------------------------------------------------------------------
const PIN = { INTERACT_DESIGN_FIXTURE: 'toss-mvp', EXPLAIN_DIAGNOSTICS: 'true', INTERACT_DESCRIPTION_FIT: 'estimate', INTERACT_SEEK: 'on', INTERACT_RUN: 'headless', INTERACT_REVIEW: 'shadow', INTERACT_BUILD_KIND: 'template' };
const media = () => { const data = new Map(); return { put: async (key, bytes) => { data.set(key, bytes); }, get: async key => (data.has(key) ? { arrayBuffer: async () => data.get(key).buffer } : null), delete: async key => { data.delete(key); } }; };
function stack(t) {
  const s = designStack(t);
  delete s.deps.descriptionFit;
  s.deps.buildScene = undefined; // the real build, not a test's legacy-shaped seam
  Object.assign(s.env, PIN, { ASSETS: { fetch: async () => new Response('x') }, LEARN_MEDIA: media() });
  const real = globalThis.fetch, sent = [];
  globalThis.fetch = async url => { sent.push(String(url)); throw new Error(`a template job must not call out: ${url}`); };
  t.after(() => { globalThis.fetch = real; });
  const route = async path => {
    const e = { ...s.env, EXPLAIN_JOBS: { idFromName: name => name, get: () => ({ fetch: (url, init) => s.actor.fetch(new Request(url, init)) }) } };
    const response = await explainRoute(`/api/learn/explain/jobs${path.split('?')[0]}`, new Request(`https://dev.test/api/learn/explain/jobs${path}`), e, { identity: async () => OWNER });
    return { status: response.status, body: await response.json() };
  };
  return { ...s, sent, route, jobOf: id => s.state.data.get(`job:${id}`) };
}

test('Brief, Balanced and Detailed toss-mvp jobs reach ready on the template build with ZERO model calls; the ledger row names the pinned card and the real oracle ran', async t => {
  for (const depth of DEPTHS) {
    const s = stack(t), { body } = await s.create({ depth }), id = body.job.id;
    assert.equal((await s.design(id)).job.stage, 'awaiting_approval');
    assert.equal((await s.approve(id)).status, 202);
    for (let i = 0; i < 30; i++) { await s.actor.alarm(); const job = s.jobOf(id); if (['ready', 'failed', 'cancelled'].includes(job.stage) && !job.inFlight) break; }
    const job = s.jobOf(id);
    assert.equal(job.stage, 'ready', `${depth}: ${JSON.stringify([job.stopReason, job.failure, job.findings])}`);
    assert.equal(job.build.kind, 'template');
    assert.deepEqual(job.build.counts, { build_author: 0, build_review: 0, build_repair: 0 });
    assert.deepEqual(s.sent, [], `${depth}: no outbound call at all`);
    await s.actor.alarm();
    const { ledger } = (await s.route(`/${id}?board=${BOARD.id}&detail=1`)).body.diagnostics;
    assert.deepEqual([ledger.fixture, ledger.authorModel, ledger.buildKind, ledger.repairs, ledger.result, ledger.oracleFailed], [`toss-mvp-${depth}`, 'template', 'template', 0, 'ready', 0], depth);
    assert.ok(ledger.oracleChecked > 0);
  }
});

// ---- the picker: the best passing plan per depth from the bench rows -----------------------------------------------------------------------------------------------------------------------------
test('pick-mvp-plans: the best Flash Lite pass per depth (smallest msTotal), a Sonnet pass when Flash Lite has none, a depth with no pass is left out and named', () => {
  const plan = tag => ({ tag }), rows = [
    { model: 'gemini-3.5-flash-lite', depth: 'brief', result: 'pass', expandedPlanPath: 'a', msTotal: 900, ts: '1' }, { model: 'gemini-3.5-flash-lite', depth: 'brief', result: 'pass', expandedPlanPath: 'b', msTotal: 700, msFill: 640, ts: '2' },
    { model: 'gemini-3.5-flash-lite', depth: 'brief', result: 'fail', expandedPlanPath: 'x', msTotal: 100, ts: '3' }, { model: 'claude-sonnet-5-5', depth: 'brief', result: 'pass', expandedPlanPath: 's', msTotal: 50, ts: '4' },
    { model: 'claude-sonnet-5-5', depth: 'balanced', result: 'pass', expandedPlanPath: 'c', msTotal: 3000, ts: '5' }, { model: 'gemini-3.5-flash-lite', depth: 'detailed', result: 'fail', expandedPlanPath: 'd', ts: '6' },
  ];
  const { picked, missing } = pickPlans(rows, path => plan(path));
  assert.deepEqual([picked.brief.model, picked.brief.plan], ['gemini-3.5-flash-lite', plan('b')]);
  assert.deepEqual([picked.balanced.model, picked.balanced.plan], ['claude-sonnet-5-5', plan('c')]);
  assert.deepEqual([Object.keys(picked), missing], [['brief', 'balanced'], ['detailed']]);
  const text = dataFileText(Object.fromEntries(Object.entries(picked).map(([d, p]) => [d, { source: p.model, meta: { designModel: p.model, msFill: p.msFill, jobTs: p.ts }, plan: p.plan }])), 'test');
  assert.match(text, /export const TOSS_MVP_PLANS = Object\.freeze\(/); assert.match(text, /"tag": "b"/); assert.doesNotMatch(text, /"detailed"/);
  assert.match(text, /export const TOSS_MVP_META = Object\.freeze\(/); assert.match(text, /"designModel": "gemini-3\.5-flash-lite"/); assert.match(text, /"msFill": 640/); assert.equal(picked.brief.msFill, 640);
});
