// The family contract (owner 2026-11-14 00:50): the brief schema, the fill text and the generator read the family module, and the vertical-throw family keeps what it gave before byte for byte.
// The snapshot (fixtures/toss-family-snapshot.json) was taken from the code BEFORE the change: the JSON schema, the key lists, the family description and the whole fill system text of each toss depth.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { briefSchema, referenceFormulaCheck } from '../../web/src/interact-plan-brief.js';
import { extractBrief, verticalThrow } from '../../web/src/interact-family-vertical-throw.js';
import { interactFixtures } from '../../web/src/interact-plan-fixtures.js';
import { planProblems } from '../../web/src/interact-plan.js';
import { generateProgram, TemplateError } from '../../web/src/interact-templates/generate.js';
import { fillSystem } from '../src/interact-design-fill.js';
import { INTERACT_FAMILIES } from '../src/interact-families.js';

const SNAPSHOT = JSON.parse(readFileSync(new URL('./fixtures/toss-family-snapshot.json', import.meta.url), 'utf8'));
const { referencePlans, plans } = await interactFixtures();

test('the toss keeps its brief schema, key lists, family description and fill text byte for byte, by default and through the registry', () => {
  for (const depth of ['brief', 'balanced', 'detailed']) {
    for (const family of [undefined, INTERACT_FAMILIES[0].module]) {
      const info = briefSchema(depth, family), s = SNAPSHOT[depth];
      assert.equal(JSON.stringify(info.jsonSchema), JSON.stringify(s.schema), `${depth} schema`);
      const { scalars, ...keys } = info.keys; assert.deepEqual(JSON.parse(JSON.stringify(keys)), s.keys, `${depth} keys`); assert.equal(scalars[0].id, 'launchHeight');
      assert.equal(verticalThrow.familyDescription(depth), s.description, `${depth} description`);
      assert.equal(fillSystem(depth, info, family), s.fill, `${depth} fill text`);
    }
  }
});

test('the reference check is the family\'s: the pinned plans pass it through referenceFormulaCheck and through module.referenceCheck', () => {
  for (const name of ['tossOverview', 'tossStandard', 'tossDeep']) {
    const plan = referencePlans[name], brief = extractBrief(plan);
    assert.equal(referenceFormulaCheck(brief, plan.depth).ok, true, name);
    assert.deepEqual(INTERACT_FAMILIES[0].module.referenceCheck(brief, plan.depth), referenceFormulaCheck(brief, plan.depth));
  }
});

test('a still scene: planProblems allows a plan with no timeline (static, controls bound), and the generator builds it from a family that declares an independent variable', () => {
  const still = plans.staticAdjustable;
  assert.equal(still.mode.timeline, null); assert.deepEqual(planProblems(still), []);
  // A stand-in family and template through the generator's registry seam; the plan is a toss plan with its timeline removed.
  const plan = structuredClone(referencePlans.tossOverview); plan.scene = { ...plan.scene, template: 'still-x', readoutIds: [] }; plan.mode = { ...plan.mode, timeline: null };
  const seen = {}, family = { templates: ['still-x'], independent: { id: 'x', domain: [-3, 3] }, context: args => { seen.args = args; return { range: { r: 1 }, units: { u: 'm' } }; } };
  const template = { roles: [], normalize: slots => slots, geometry: range => ({ g: range }), states: () => ({}), source: ctx => `still ${JSON.stringify(ctx.independent)} ${ctx.end} ${ctx.timeline}` };
  const out = generateProgram(plan, { controlBindings: [], timeline: null }, { templates: { 'still-x': template }, families: [family] });
  assert.equal(out.source, 'still {"id":"x","domain":[-3,3]} null null'); assert.equal(seen.args.endExpr, null);
  assert.equal('timeline' in out.manifest, false); assert.equal('duration' in out.manifest, false);
  // Without an independent variable a missing timeline is still our error, and a template no family draws is refused.
  assert.throws(() => generateProgram(plan, { controlBindings: [], timeline: null }, { templates: { 'still-x': template }, families: [{ ...family, independent: undefined }] }), e => e instanceof TemplateError && e.code === 'no_timeline');
  assert.throws(() => generateProgram(plan, { controlBindings: [], timeline: null }, { templates: { 'still-x': template }, families: [] }), e => e instanceof TemplateError && e.code === 'no_family');
});

test('the fill text reads only the family: the names sentence is derived (the independent variable plus the depth inputs, role ids refused) and no toss line leaks into another family', () => {
  const stub = { FAMILY: { depths: { balanced: { roles: ['y'], inputs: [['k', 'range'], ['x0', 'range']] } } }, independent: { id: 'x' }, scalars: [], familyDescription: () => 'a curve', formulaGrammar: ['grammar line'], formulaRules: () => ['rule line'] };
  const text = fillSystem('balanced', { keys: { text: [], inputs: [], formulas: [], words: [], scalars: [] } }, stub);
  assert.ok(text.includes('A formula reads only the names x, k, x0; any other name (y) is refused.'), text);
  assert.ok(!/gravity|launchSpeed|launchHeight|apexTime/.test(text.split('## Limits')[1]), 'no toss word after the limits header');
  const toss = fillSystem('detailed', briefSchema('detailed'));
  assert.ok(toss.includes('A formula reads only the names t, launchSpeed, gravity, mass;') && toss.includes('gravity: every value of its range is at least 4'));
  assert.ok(!fillSystem('brief', briefSchema('brief')).includes('every value of its range is at least 4'), 'the Overview fixes gravity');
});
