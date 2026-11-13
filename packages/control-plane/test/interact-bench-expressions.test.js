// The expressions-only bench (scripts/interact/bench-expressions.mjs) proven at $0: the plan's own relations written as expressions pass at every oracle case (the three piecewise Drop quantities are a grammar gap,
// reported, not a failure); a wrong equation, a missing id and an unresolvable name each come back with the id, the case, got and expected.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLANS, benchContext } from '../../../scripts/interact/bench-author.mjs';
import { PIECEWISE, checkExpressions, expressionsAttempt, expressionsSchema, referenceReply, reportMarkdown, scriptedExpressionsAdapter } from '../../../scripts/interact/bench-expressions.mjs';
import { schemaProblems } from '../src/interact-model-adapters.js';
import { interactFixtures } from '../../web/src/interact-plan-fixtures.js';

const plans = async () => { const { referencePlans } = await interactFixtures(); return Object.fromEntries(Object.entries(PLANS).map(([name, { key }]) => [name, referencePlans[key]])); };
const attempt = (planName, model = 'gemini-3.5-flash-lite') => expressionsAttempt({ planName, model, ctx: benchContext({ model, env: {}, scripted: scriptedExpressionsAdapter() }), scripted: true });

test('the reference expressions pass on all three plans through the scripted adapter at $0; only Standard shows the piecewise gap', async () => {
  for (const planName of Object.keys(PLANS)) {
    const row = await attempt(planName);
    assert.equal(row.result, 'pass', `${planName}: ${row.firstProblem}`);
    assert.deepEqual([row.costUsd, row.timing, row.contract], [0, 'v3', 'expressions']);
    assert.ok(row.checkedValues > 10, `${planName}: ${row.checkedValues} values checked`);
    assert.ok(row.gapIds.every(id => PIECEWISE.has(id)), planName);
    assert.equal(row.gapIds.length > 0, planName === 'toss-standard', `${planName}: gap ids ${row.gapIds}`);
  }
});

test('a wrong equation, a missing id and an unresolvable name are named with their case, got and expected', async () => {
  const plan = (await plans())['toss-deep'], good = referenceReply(plan), lit = value => ({ op: 'literal', value });
  const wrong = structuredClone(good);
  wrong.quantities.velocity = { op: 'add', left: { op: 'input', id: 'launchSpeed' }, right: { op: 'multiply', left: { op: 'input', id: 'gravity' }, right: { op: 'input', id: 't' } } }; // u + g t: the sign flipped
  const c = checkExpressions(plan, wrong);
  assert.ok(c.wrongIds.length > 0 && c.wrongIds.every(w => w.id === 'velocity' && typeof w.case === 'string' && typeof w.got === 'number' && typeof w.expected === 'number'), JSON.stringify(c.wrongIds.slice(0, 2)));
  const missing = structuredClone(good); delete missing.quantities.force; delete missing.moments.top;
  assert.deepEqual(checkExpressions(plan, missing).missingIds, ['force', 'moment:top']);
  const unknown = structuredClone(good); unknown.quantities.height = { op: 'input', id: 'altitude' };
  assert.equal(checkExpressions(plan, unknown).unresolved[0].error, 'unknown_input');
  const moment = structuredClone(good); moment.moments.top = lit(1);
  assert.ok(checkExpressions(plan, moment).wrongIds.some(w => w.id === 'moment:top'));
});

test('the schema is keyed exactly by the plan ids and accepts the reference reply; a reply short of an id is refused', async () => {
  const plan = (await plans())['toss-standard'], schema = expressionsSchema(plan), good = referenceReply(plan);
  assert.deepEqual(schemaProblems(schema, good), []);
  const short = structuredClone(good); delete short.quantities.dropHeight;
  assert.match(schemaProblems(schema, short).join(';'), /quantities\.dropHeight: required/);
  assert.deepEqual(Object.keys(schema.properties.quantities.properties), plan.scene.quantities.map(q => q.id));
});

test('the report counts pass per model and depth and lists the failed ids of a model under 8 of 10', () => {
  const rows = [...Array.from({ length: 10 }, () => ({ model: 'm1', depth: 'brief', result: 'pass', msAuthor: 1000, costUsd: 0.001 })),
    ...Array.from({ length: 10 }, (_, i) => ({ model: 'm2', depth: 'brief', result: i < 5 ? 'pass' : 'fail', msAuthor: 2000, costUsd: 0.002, wrongIds: i < 5 ? [] : [{ id: 'height', case: 'start' }], missingIds: [], unresolved: [] }))];
  const md = reportMarkdown(rows);
  assert.match(md, /\| m1 \| brief \| 10 \| 10 \| 10\/10 \| 10\/10 \|/);
  assert.match(md, /\| m2 \| brief \| 10 \| 5 \| 5\/10 \| 5\/10 \|/);
  assert.match(md, /\*\*m2\*\* \(under 8\/10 at brief\): wrong height \(5\)/);
  assert.doesNotMatch(md, /\*\*m1\*\*/);
});
