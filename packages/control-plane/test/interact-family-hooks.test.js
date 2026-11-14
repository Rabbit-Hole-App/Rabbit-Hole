// Brief 24 task 3: the three shared hooks a family with a typed composition needs (docs/features/interact/stepper-runtime-progress.md, 'Shared hooks still needed'):
// (1) briefSchema(depth, module) uses module.briefSchema(depth) when the family exports it; (2) plan.scene.data is admitted through the template's templateData[name].sceneDataSchema;
// (3) fillSystem takes the key description and teaching rules from the family (fillKeyLines, fillTeachingRules) and a { code, path, message } check result is reported by path.
// A stub family registered in the test exports all three; the toss and curve behaviour is unchanged (their snapshot, schema and plan-hash tests stay as they are).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { briefSchema } from '../../web/src/interact-plan-brief.js';
import { planProblems, planHash } from '../../web/src/interact-plan.js';
import { interactFixtures } from '../../web/src/interact-plan-fixtures.js';
import { TEMPLATE_ROLES, TEMPLATE_WORDS } from '../../web/src/interact-formula.js';
import { registerFamily, sceneDataSchemaOf } from '../../web/src/interact-family-registry.js';
import { INTERACT_FAMILIES } from '../src/interact-families.js';
import { fillSystem, formulaProblems } from '../src/interact-design-fill.js';

const { referencePlans } = await interactFixtures();
const oneBody = TEMPLATE_ROLES['one-body'], oneBodyWords = TEMPLATE_WORDS['one-body'].map(({ path, max, what }) => [path, max, what]);
const sceneDataSchema = z.object({ states: z.array(z.object({ id: z.string().min(1), label: z.string().min(1) }).strict()).min(1) }).strict();
const stubBrief = { jsonSchema: { type: 'object', title: 'stub brief' }, parse: raw => ({ ok: true, value: raw }), keys: { composition: 'the stub composition' } };
const stubFamily = Object.freeze({
  id: 'stub-hooks', pickCriterion: 'A stub scene that shows nothing: only the hook tests draw it.',
  templates: Object.freeze(['stub-body']),
  templateData: Object.freeze({ 'stub-body': Object.freeze({ lanes: oneBody.lanes, roles: oneBody.roles, words: oneBodyWords, sceneDataSchema }) }),
  briefSchema: depth => ({ ...stubBrief, depth }),
  fillKeyLines: keys => [`- composition: ${keys.composition}`],
  fillTeachingRules: depth => [`stub rule for ${depth}`],
  familyDescription: depth => `the stub family at ${depth}`,
});
const stubPlan = data => { const plan = structuredClone(referencePlans.tossOverview); plan.scene = { ...plan.scene, template: 'stub-body' }; if (data !== undefined) plan.scene.data = data; return plan; };
const lines = plan => planProblems(plan).map(p => `${Array.isArray(p.path) ? p.path.join('.') : p.path}: ${p.message}`);

test('hook 1: briefSchema(depth, module) uses the module\'s own briefSchema, and a family without one keeps the flat fallback', () => {
  assert.deepEqual(briefSchema('brief', stubFamily), { ...stubBrief, depth: 'brief' });
  const toss = INTERACT_FAMILIES[0].module, flat = briefSchema('balanced');
  assert.ok(flat.jsonSchema.properties.formulas, 'the toss default is the flat formula schema');
  assert.deepEqual(briefSchema('balanced', toss).jsonSchema, flat.jsonSchema, 'the registry entry\'s own wrapper still ends in the flat schema');
});

test('hook 2: scene.data is admitted through the template\'s sceneDataSchema, required for it, with unknown keys refused by path', () => {
  const unregister = registerFamily(stubFamily);
  try {
    assert.equal(sceneDataSchemaOf('stub-body'), sceneDataSchema);
    const good = { states: [{ id: 'a', label: 'First' }] };
    assert.deepEqual(lines(stubPlan(good)), [], 'valid data passes');
    assert.deepEqual(lines(stubPlan()), ['scene.data: template stub-body needs scene.data'], 'required for the template that declares a schema');
    assert.ok(lines(stubPlan({ states: [{ id: 'a', label: 'First', color: 'red' }] })).includes('scene.data.states.0.color: unknown key'), 'an unknown key keeps its own path');
    assert.ok(lines(stubPlan({ states: [{ id: 'a' }] })).some(l => l.startsWith('scene.data.states.0.label:')), 'a missing key is named by path');
    assert.ok(lines(stubPlan({ states: [{ id: 'a', label: 'First' }], extra: 1 })).includes('scene.data.extra: unknown key'));
    assert.notEqual(planHash(stubPlan(good)), planHash(stubPlan({ states: [{ id: 'b', label: 'First' }] })), 'the data is part of the plan hash');
  } finally { unregister(); }
  assert.equal(sceneDataSchemaOf('stub-body'), undefined);
});

test('hook 2: a template without a schema refuses scene.data entirely; a plan without it is unchanged', async () => {
  for (const name of ['tossOverview', 'tossStandard', 'tossDeep']) {
    const plan = structuredClone(referencePlans[name]);
    assert.ok(!('data' in plan.scene), `${name} has no scene.data`);
    assert.deepEqual(lines(plan), []);
    plan.scene.data = { anything: 1 };
    assert.deepEqual(lines(plan), ['scene.data: this template takes no data'], `${name} refuses unsolicited data`);
  }
});

test('hook 3: fillSystem takes the key description and teaching rules from the family; a family without them gets today\'s text', () => {
  const text = fillSystem('balanced', { keys: stubBrief.keys }, stubFamily);
  assert.ok(text.includes('- composition: the stub composition') && text.includes('## Rules\nstub rule for balanced') && text.includes('the stub family at balanced'));
  assert.ok(!text.includes('## Formulas') && !text.includes('A formula reads only'), 'no formula section for a family with its own rules');
  assert.ok(text.includes('## Limits'), 'the generic limits stay');
  const toss = fillSystem('balanced', briefSchema('balanced'), INTERACT_FAMILIES[0].module);
  assert.ok(toss.includes('## Formulas') && toss.includes('A formula reads only the names'), 'the toss keeps its formula sections (its snapshot test pins the exact text)');
});

test('hook 3: check results of the shape { code, path, message } are reported by path, never as formula undefined; formula failures keep their lines', () => {
  assert.deepEqual(formulaProblems([{ code: 'state_unnamed', path: 'data.states.2.sentence', message: 'the sentence does not mention its active part' }]), ['data.states.2.sentence: the sentence does not mention its active part']);
  assert.deepEqual(formulaProblems({ ok: false, failures: [{ code: 'x', path: ['data', 'variants', 0, 'label'], message: 'is empty' }] }), ['data.variants.0.label: is empty']);
  assert.deepEqual(formulaProblems({ ok: false, failures: [{ role: 'height', point: { t: 1 }, got: 2, expected: 3 }] }), ['formula height at {"t":1}: got 2, expected 3']);
  assert.deepEqual(formulaProblems({ ok: true, failures: [] }), []);
});
