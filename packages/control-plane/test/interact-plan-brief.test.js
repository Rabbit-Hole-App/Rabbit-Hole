// The design MVP's first half (owner brief 11, section 1): a plan brief expands, in code, to the whole ScenePlan of the vertical-throw family. The round trip: for each of the four pinned plans, extractBrief ->
// briefSchema.parse -> referenceFormulaCheck -> expandBrief gives a plan that passes planProblems and ScenePlanSchema, builds on the template path (generateProgram) and draws the pinned plan's frames: the same object ids,
// kinds, texts and readouts, and the same reported quantities, at every capture case (the brief-9 comparison; coordinates are compared too, since both sides are the same template at the same ranges).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ScenePlanSchema, planHash, planProblems } from '../../web/src/interact-plan.js';
import { interactFixtures } from '../../web/src/interact-plan-fixtures.js';
import { briefSchema, expandBrief, extractBrief, referenceFormulaCheck } from '../../web/src/interact-plan-brief.js';
import { generateProgram } from '../../web/src/interact-templates/generate.js';
import { frameOverlaps } from '../../web/src/explain-program/frame-overlap.js';
import { buildInput, validateBuildOutput } from '../src/interact-build.js';
import { buildPlanCaptureCases, checkSceneAgainstPlan, headlessCaptureCard } from '../src/interact-checks.js';
import { fixtureContext } from '../src/interact-fixtures.js';
import { interactOracle } from '../src/interact-oracle.js';

const { referencePlans, referenceCapabilities } = await interactFixtures();
const NAMES = ['tossOverview', 'tossStandard', 'tossDeep', 'ledgeTossMoon'];
const expanded = name => expandBrief(extractBrief(referencePlans[name]), referencePlans[name].depth, { catalogueHash: referenceCapabilities.catalogueHash });

async function capture(plan) {
  const job = { id: `job-${plan.title}`, plan, planHash: await planHash(plan), capabilities: referenceCapabilities };
  const draft = { main: { kind: 'program', program: generateProgram(plan, buildInput({}, plan, 'hash')) }, supporting: [] };
  const built = await validateBuildOutput(job, draft, fixtureContext());
  assert.ok(built.artifacts, `${plan.title}: the generated program passes the structural checks: ${JSON.stringify(built.details ?? built.problems)}`);
  const { cases, probes } = buildPlanCaptureCases(plan, built.composition, built.artifacts);
  const captures = await headlessCaptureCard({})({ composition: built.composition, artifacts: built.artifacts, cases: [...cases, ...probes] });
  return { captures, cases, probes, composition: built.composition, artifacts: built.artifacts };
}

// Intended differences between an expanded plan and its pinned plan, by name (none that reach a frame): the playback rate (the pinned Moon card paces 0.5, the rule gives 0.6 from the top time), and the
// prose the model never writes (entity purposes, observations, the scene description, checkpoint expectations, claims): code-written generic text instead of the pinned numbers. A frame difference is not listed
// here: the comparison below must be empty.
const NOTE = 'the playbackRate rule (about 2 wall seconds to the top at the defaults) gives 0.6 for the Moon card, which pinned 0.5; prose is code-written and generic; neither reaches a frame';

test('the brief of each pinned plan parses, its formulas match the reference physics, and the expansion passes planProblems and the plan schema', () => {
  for (const name of NAMES) {
    const plan = referencePlans[name], brief = extractBrief(plan), parsed = briefSchema(plan.depth).parse(brief);
    assert.ok(parsed.ok, `${name}: ${JSON.stringify(parsed.problems)}`);
    assert.deepEqual(referenceFormulaCheck(brief, plan.depth), { ok: true, failures: [] }, name);
    const out = expanded(name);
    assert.deepEqual(planProblems(out), [], name);
    const schema = ScenePlanSchema.safeParse(out);
    assert.ok(schema.success, `${name}: ${JSON.stringify(schema.error?.issues.slice(0, 3))}`);
    assert.equal(out.scene.template, plan.scene.template, name);
    assert.deepEqual(out.scene.slots, plan.scene.slots, name);
    assert.deepEqual(out.scene.words, plan.scene.words, name);
    assert.deepEqual(out.scene.readoutIds, plan.scene.readoutIds, name);
    assert.deepEqual(out.controls.map(c => [c.id, c.type, c.binding, c.min, c.max, c.default, c.step, c.unit]), plan.controls.map(c => [c.id, c.type, c.binding, c.min, c.max, c.default, c.step, c.unit]), `${name}: the same controls, bindings and ranges`);
    // Intended difference: an input quantity (launchSpeed, gravity, mass) the pinned Standard plan leaves without a formula carries its bare name here; the template reads both as the input.
    const row = q => [q.id, q.formula ?? (['launchSpeed', 'gravity', 'mass'].includes(q.id) ? q.id : undefined), q.switchAt, q.formulaAfter, q.unit, q.label];
    assert.deepEqual(out.scene.quantities.map(row), plan.scene.quantities.map(row), `${name}: the same quantities and formulas`);
    assert.deepEqual(out.mode.fixedValues, plan.mode.fixedValues, name);
    assert.deepEqual(out.mode.timeline.markers, plan.mode.timeline.markers, name);
    assert.deepEqual([out.mode.timeline.label, out.mode.timeline.end, out.mode.timeline.displayOffset], [plan.mode.timeline.label, plan.mode.timeline.end, plan.mode.timeline.displayOffset], name);
    assert.deepEqual(out.scene.checkpoints.map(c => [c.id, c.time, c.inputOverrides]), plan.scene.checkpoints.map(c => [c.id, c.time, c.inputOverrides]), `${name}: the same checkpoint times and overrides`);
    if (name !== 'ledgeTossMoon') assert.equal(out.mode.timeline.playbackRate, plan.mode.timeline.playbackRate, name);
    else assert.deepEqual([plan.mode.timeline.playbackRate, out.mode.timeline.playbackRate], [0.5, 0.6], NOTE);
  }
});

test('the expanded plans build on the template path and draw the pinned plans frames: ids, kinds, texts, readouts and quantities at every capture case', async () => {
  for (const name of NAMES) {
    const pinned = await capture(referencePlans[name]), mine = await capture(expanded(name));
    assert.deepEqual(mine.cases.map(c => c.caseId ?? c.id), pinned.cases.map(c => c.caseId ?? c.id), `${name}: the same capture cases`);
    assert.equal(mine.captures.length, pinned.captures.length, name);
    for (const c of pinned.captures) {
      const g = mine.captures.find(x => x.caseId === c.caseId);
      assert.ok(g, `${name}: the expanded card has the capture ${c.caseId}`);
      const content = trace => Object.fromEntries(trace.objects.map(o => [o.id, { kind: o.kind, ...(o.kind === 'text' ? { text: o.text } : {}) }]));
      assert.deepEqual(content(g.trace), content(c.trace), `${name} ${c.caseId}: object ids, kinds and texts`);
      assert.deepEqual(g.trace.readouts, c.trace.readouts, `${name} ${c.caseId}: readouts`);
      assert.deepEqual(g.trace.quantities, c.trace.quantities, `${name} ${c.caseId}: quantities`);
      assert.deepEqual(g.trace.objects, c.trace.objects, `${name} ${c.caseId}: even the geometry is the same (same template, same ranges)`);
    }
  }
});

test('the expanded plans pass the real checks: the layout rules, the oracle and the arrow rule, with no model call', async () => {
  for (const name of NAMES) {
    const plan = expanded(name), r = await capture(plan);
    // The oracle (interact-oracle.js) is keyed by the plan the three cards were approved against; an expanded plan has the same title and checkpoints, so it reads the same cases.
    const det = checkSceneAgainstPlan({ plan, composition: r.composition, artifacts: r.artifacts, captures: r.captures, cases: r.cases, probes: r.probes, oracle: interactOracle(plan), allowPartialCard: true });
    assert.deepEqual(det.problems, [], `${name}: ${det.problems.map(p => p.message).join(' / ')}`);
    for (const c of r.captures) assert.deepEqual(frameOverlaps({ objects: c.trace.objects, ...c.trace.frame }, 100), [], `${name} ${c.caseId}: no layout rule fires`);
  }
});
