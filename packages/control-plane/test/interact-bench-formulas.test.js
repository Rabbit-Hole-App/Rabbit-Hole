// bench-formulas.mjs harness proof ($0, no network): the scripted reference formulas pass at every case of the three toss plans, a wrong formula yields wrongIds, the plan the model sees carries no
// relation, formula, switchAt or formulaAfter and no moments, and the reply schema is flat strings keyed by exactly the plan's quantity ids.
import test from 'node:test';
import assert from 'node:assert/strict';
import { interactFixtures } from '../../web/src/interact-plan-fixtures.js';
import { PLANS, formulasAttempt, formulasInput, formulasSchema, referenceFormulas, reportMarkdown, scriptedFormulasAdapter } from '../../../scripts/interact/bench-formulas.mjs';
import { benchContext } from '../../../scripts/interact/bench-author.mjs';
import { schemaProblems } from '../src/interact-model-adapters.js';

const { referencePlans } = await interactFixtures();
const tossPlans = Object.entries(PLANS).filter(([, p]) => p.key.startsWith('toss'));

test('the scripted reference formulas pass at every oracle case of the three toss plans, $0', async () => {
  for (const [name] of tossPlans) {
    const row = await formulasAttempt({ planName: name, model: 'claude-sonnet-5-5', ctx: benchContext({ model: 'claude-sonnet-5-5', env: {}, scripted: scriptedFormulasAdapter() }), scripted: true });
    assert.equal(row.result, 'pass', `${name}: ${row.firstProblem}`);
    assert.ok(row.checkedValues > 5, `${name} checked ${row.checkedValues}`);
    assert.equal(row.costUsd ?? 0, 0);
  }
});

test('a wrong reply is a failed row with the id, case, got and expected', async () => {
  const wrongAdapter = (await import('../src/interact-fixtures.js')).scriptedAdapter({ build_author: ({ input }) => {
    const reply = referenceFormulas(input.__plan);
    reply.quantities.apexTime = { formula: 'launchSpeed * gravity', switchAt: null, formulaAfter: null };
    reply.quantities[Object.keys(reply.quantities).find(id => /Velocity$|^velocity$/.test(id))].formula = 'launchSpeed + gravity * t';
    return reply;
  } });
  const row = await formulasAttempt({ planName: 'toss-standard', model: 'claude-sonnet-5-5', ctx: benchContext({ model: 'claude-sonnet-5-5', env: {}, scripted: wrongAdapter }), scripted: true });
  assert.equal(row.result, 'fail');
  assert.ok(row.wrongIds.some(w => w.id === 'apexTime' && typeof w.got === 'number' && typeof w.expected === 'number' && w.case));
});

test('the model sees no relation, formula, switchAt, formulaAfter or moments; the schema is flat strings keyed by the plan\'s quantity ids', () => {
  for (const [, { key }] of tossPlans) {
    const plan = structuredClone(referencePlans[key]);
    for (const q of plan.scene.quantities) { q.formula = '1'; q.relation = 'x = 1'; }
    const input = formulasInput(plan), text = JSON.stringify(input);
    assert.ok(!/relation|formula|switchAt|moments/.test(text), key);
    assert.deepEqual(Object.keys(input.quantities[0]).sort(), ['id', 'label', 'meaning', 'reference', 'unit']);
    const schema = formulasSchema(plan), ids = plan.scene.quantities.map(q => q.id);
    assert.deepEqual(Object.keys(schema.properties.quantities.properties), ids);
    assert.deepEqual(schema.properties.quantities.required, ids);
    assert.ok(!JSON.stringify(schema).includes('$ref'), 'flat: no recursion');
    const good = { quantities: Object.fromEntries(ids.map(id => [id, { formula: 'launchSpeed', switchAt: null, formulaAfter: null }])) };
    assert.deepEqual(schemaProblems(schema, good), []);
    assert.ok(schemaProblems(schema, { quantities: { ...good.quantities, [ids[0]]: { formula: 3, switchAt: null, formulaAfter: null } } }).length > 0);
  }
});

test('the report lists pass counts and the failed ids per model and plan', () => {
  const md = reportMarkdown([
    { model: 'm', plan: 'toss-standard', result: 'pass', msAuthor: 1000, outTokens: 100, costUsd: 0.001 },
    { model: 'm', plan: 'toss-standard', result: 'fail', msAuthor: 2000, outTokens: 120, costUsd: 0.002, wrongIds: [{ id: 'dropHeight', case: 'end', got: 1, expected: 2 }], parseErrors: [], missingIds: [] },
  ]);
  assert.match(md, /\| m \| toss-standard \| 2 \| 1\/2 \|/);
  assert.match(md, /wrong dropHeight at end: got 1\.000, expected 2\.000/);
});
