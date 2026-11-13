// The template build (packages/web/src/interact-templates/): generateProgram(plan, buildInput) writes the program for a plan that names a template, with no model. The strong test: for each of the
// three reference toss plans the generated program and the hand-written scripted program (interact-toss-programs.js, the one the owner approved on canvas) are run through the same headless capture
// at every capture case and must draw the same frames; the generated programs then pass the real validate, the layout rules and the oracles like the scripted ones.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planHash } from '../../web/src/interact-plan.js';
import { interactFixtures } from '../../web/src/interact-plan-fixtures.js';
import { tossDraft } from '../../web/src/interact-toss-programs.js';
import { TEMPLATES, TemplateError, generateProgram } from '../../web/src/interact-templates/generate.js';
import { frameOverlaps } from '../../web/src/explain-program/frame-overlap.js';
import { buildInput, validateBuildOutput } from '../src/interact-build.js';
import { buildPlanCaptureCases, checkSceneAgainstPlan, headlessCaptureCard } from '../src/interact-checks.js';
import { fixtureContext } from '../src/interact-fixtures.js';
import { interactOracle } from '../src/interact-oracle.js';

const { referencePlans, referenceCapabilities } = await interactFixtures();
const NAMES = ['tossOverview', 'tossStandard', 'tossDeep'], TEMPLATE_OF = { tossOverview: 'one-body', tossStandard: 'two-lane', tossDeep: 'body-plot' };
const inputOf = plan => buildInput({}, plan, 'hash');

async function runDraft(name, draft) {
  const plan = structuredClone(referencePlans[name]), job = { id: `job-${name}`, plan, planHash: await planHash(referencePlans[name]), capabilities: referenceCapabilities };
  const built = await validateBuildOutput(job, draft, fixtureContext());
  assert.ok(built.artifacts, `${name} must pass the structural checks: ${JSON.stringify(built.details ?? built.problems)}`);
  const { cases, probes } = buildPlanCaptureCases(plan, built.composition, built.artifacts);
  const captures = await headlessCaptureCard({})({ composition: built.composition, artifacts: built.artifacts, cases: [...cases, ...probes] });
  const det = checkSceneAgainstPlan({ plan, composition: built.composition, artifacts: built.artifacts, captures, cases, probes, oracle: interactOracle(plan), allowPartialCard: true });
  return { plan, captures, cases, det };
}
const generatedDraft = name => ({ main: { kind: 'program', program: generateProgram(referencePlans[name], inputOf(referencePlans[name])) }, supporting: [] });

test('each reference toss plan names its template and the slots it reads', () => {
  for (const name of NAMES) assert.equal(referencePlans[name].scene.template, TEMPLATE_OF[name], name);
});

test('the generated programs pass validate, every deterministic check, the layout rules and the oracle, with no model call and no repair', async () => {
  for (const name of NAMES) {
    const r = await runDraft(name, generatedDraft(name));
    assert.deepEqual(r.det.problems, [], `${name}: ${r.det.problems.map(p => p.message).join(' / ')}`);
    assert.ok(r.det.coverage.oracle.checked >= 18, `${name} oracle rows checked: ${r.det.coverage.oracle.checked}`);
    assert.deepEqual(r.det.coverage.effects.untested, [], `${name}: every adjustable input has an effect`);
    for (const c of r.captures) assert.deepEqual(frameOverlaps({ objects: c.trace.objects, ...c.trace.frame }, 100), [], `${name} ${c.caseId}: no layout rule fires`);
  }
});

test('a fourth plan on the same one-body template (a ball thrown up from a 1 m ledge on the Moon) is built with no change to the template', async () => {
  const plan = referencePlans.ledgeTossMoon;
  assert.ok(plan, 'the ledge plan is a reference plan'); assert.equal(plan.scene.template, 'one-body');
  const r = await runDraft('ledgeTossMoon', { main: { kind: 'program', program: generateProgram(plan, inputOf(plan)) }, supporting: [] });
  assert.deepEqual(r.det.problems, [], r.det.problems.map(p => p.message).join(' / '));
  assert.ok(r.det.coverage.oracle.checked >= 10, `oracle rows checked: ${r.det.coverage.oracle.checked}`);
});

// Intended differences from the scripted program, by plan: none today. A difference is listed here with the reason, never skipped silently.
const INTENDED = { tossOverview: { quantities: new Set(['acceleration']) } }; // the Overview plan now carries an acceleration quantity (-gravity) for its slots; the scripted program predates it

function framesEqual(name, scripted, generated) {
  const diffs = [], intended = INTENDED[name]?.quantities ?? new Set();
  const cmp = (a, b, path) => {
    if (typeof a === 'number' && typeof b === 'number') { if (Math.abs(a - b) > 1e-6) diffs.push(`${path}: ${a} vs ${b}`); return; }
    if (a && b && typeof a === 'object' && typeof b === 'object') { for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) cmp(a[k], b[k], `${path}.${k}`); return; }
    if (a !== b) diffs.push(`${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
  };
  for (const c of scripted.captures) {
    const g = generated.captures.find(x => x.caseId === c.caseId);
    assert.ok(g, `${name}: the generated card has the capture ${c.caseId}`);
    const byId = trace => Object.fromEntries(trace.objects.map(o => [o.id, o]));
    cmp(byId(c.trace), byId(g.trace), `${c.caseId}.objects`);
    cmp(c.trace.frame, g.trace.frame, `${c.caseId}.frame`);
    cmp(c.trace.readouts, g.trace.readouts, `${c.caseId}.readouts`);
    const ids = new Set([...Object.keys(c.trace.quantities), ...Object.keys(g.trace.quantities)].filter(id => !intended.has(id)));
    for (const id of ids) cmp(c.trace.quantities[id], g.trace.quantities[id], `${c.caseId}.quantities.${id}`);
  }
  return diffs;
}

test('the generated program draws the same frames as the scripted program at every capture case (same object ids, kinds, text; numbers within 1e-6)', async () => {
  for (const name of NAMES) {
    const [scripted, generated] = [await runDraft(name, tossDraft(name)), await runDraft(name, generatedDraft(name))];
    assert.ok(scripted.captures.length >= 8, `${name}: ${scripted.captures.length} cases compared`);
    assert.deepEqual(framesEqual(name, scripted, generated).slice(0, 12), [], `${name}: the generated frames differ from the scripted ones`);
  }
});

test('a generated program holds no model-written code: only the sdk, numeric literals and the plan\'s names reach it, and it is within the program size limit', () => {
  for (const name of NAMES) {
    const { source } = generateProgram(referencePlans[name], inputOf(referencePlans[name]));
    assert.doesNotMatch(source, /\b(eval|Function|import|require|fetch|globalThis|process)\b/, name);
    assert.ok(new TextEncoder().encode(source).length <= 16 * 1024, `${name} source is within 16 KiB`);
  }
});

test('a plan the template cannot build is a TemplateError, not a repair: unknown template, a slot naming no quantity, a quantity with no formula', () => {
  const base = () => structuredClone(referencePlans.tossOverview);
  const code = plan => { try { generateProgram(plan, inputOf(plan)); } catch (error) { assert.ok(error instanceof TemplateError, String(error)); return error.code; } return 'built'; };
  assert.equal(code({ ...base(), scene: { ...base().scene, template: 'nope' } }), 'no_template');
  const slot = base(); slot.scene.slots.height = 'noSuchQuantity';
  assert.equal(code(slot), 'slot_missing');
  const bare = base(); delete bare.scene.quantities.find(q => q.id === 'velocity').formula;
  assert.equal(code(bare), 'no_formula');
});

test('the geometry follows the plan: a larger input range shrinks the scale so the highest rise still fits, a plan with the same range keeps the template\'s own scale', () => {
  assert.equal(TEMPLATES['one-body'].geometry({ rise: 1.28 }).scale, 200);
  assert.ok(TEMPLATES['one-body'].geometry({ rise: 3.8 }).scale < 70);
  const standard = TEMPLATES['two-lane'].geometry({ rise: 25 / 12 });
  assert.deepEqual([standard.scale, standard.axisMax, standard.ticks], [105, 2.2, [0, 0.5, 1, 1.5, 2]]);
  const deep = TEMPLATES['body-plot'].geometry({ rise: 25 / 12, end: 10 / 6, plotted: 5 });
  assert.deepEqual([deep.axisMax, deep.timeMax, deep.valueMax], [2.2, 1.8, 5.5]);
});
