// Brief 7 section 2 and 5: the pinned toss plans carry formulas, piecewise drop quantities, a template and its slots, and the fourth plan (ledge-toss-moon) rides the same one-body
// template. Every formula (the piecewise ones included) must reproduce the oracle at every case the oracle holds, within its tolerance; the plans are valid, the Moon plan has its own
// oracle and its pin, and nothing in a label carries an ellipsis.
import test from 'node:test';
import assert from 'node:assert/strict';
import { interactFixtures } from '../../web/src/interact-plan-fixtures.js';
import { captureBudgetProblems, descriptionFitProblems, parseScenePlan, planHash, validatePlanBindings } from '../../web/src/interact-plan.js';
import { measureInteractDescription } from '../../web/src/interact-description-fit.js';
import { evalQuantity, formulaScope, parseQuantity } from '../../web/src/interact-formula.js';
import { interactOracle, tossCasesOf } from '../src/interact-oracle.js';
import { LEDGE_DEPTHS, PIN_FIXTURES, pinnedFixtureId, pinnedPlan } from '../src/interact-design-pin.js';

const { referencePlans: plans, referenceCapabilities: caps } = await interactFixtures();
const NAMES = ['tossOverview', 'tossStandard', 'tossDeep', 'ledgeTossMoon'];

test('the four plans are valid ScenePlans with a stable hash, a description the estimated fit accepts and a template with its slots', async () => {
  for (const name of NAMES) {
    const plan = plans[name], parsed = parseScenePlan(plan, caps);
    assert.equal(parsed.ok, true, `${name}: ${JSON.stringify(parsed.problems?.slice(0, 3))}`);
    assert.deepEqual(validatePlanBindings(plan, caps), [], name);
    assert.match(await planHash(plan), /^[0-9a-f]{64}$/);
    assert.deepEqual(await descriptionFitProblems(plan, await measureInteractDescription(plan)), [], `${name}: description fit`);
    assert.deepEqual(captureBudgetProblems(plan), [], name);
    assert.ok(['one-body', 'two-lane', 'body-plot'].includes(plan.scene.template) && plan.scene.slots, `${name}: a template and its slots`);
  }
  assert.deepEqual(NAMES.map(name => plans[name].scene.template), ['one-body', 'two-lane', 'body-plot', 'one-body']);
  assert.ok(!/\.\.\.|…/.test(JSON.stringify(plans)), 'no ellipsis anywhere in a plan');
});

test('every formula reproduces the oracle at every case it holds, within its tolerance, the piecewise ones included', () => {
  for (const name of NAMES) {
    const plan = plans[name], oracle = interactOracle(plan), found = tossCasesOf(plan), { fixed } = formulaScope(plan);
    assert.ok(oracle && found, `${name}: an oracle and its cases`);
    const checked = new Set();
    for (const row of oracle.expect) {
      const quantity = plan.scene.quantities.find(q => q.id === row.name && q.formula !== undefined);
      if (!quantity) continue; // a readout the program reports as text, not a quantity formula
      const [inputs, t] = found.cases[row.case];
      const got = evalQuantity(quantity, inputs, t, found.domains, fixed);
      assert.ok(Math.abs(got - row.expected) <= row.tol, `${name} ${row.case} ${row.name}: got ${got}, the oracle has ${row.expected}`);
      checked.add(row.name);
    }
    assert.ok(checked.size >= 3, `${name}: ${[...checked].join(', ')}`);
    if (name === 'tossStandard') for (const id of ['dropVelocity', 'dropAcceleration', 'dropHeight', 'tossedHeight']) assert.ok(checked.has(id), `${id} is checked against the oracle`);
  }
});

test('Standard\'s drop quantities are piecewise on the top: held before, free fall from it (the boundary takes the after branch), written out with no reference to another quantity', () => {
  const plan = plans.tossStandard, scope = formulaScope(plan), inputs = { launchSpeed: 4, gravity: 9.8 }, top = 4 / 9.8;
  for (const id of ['dropVelocity', 'dropAcceleration', 'dropHeight']) {
    const quantity = plan.scene.quantities.find(q => q.id === id);
    assert.ok(quantity.switchAt && quantity.formulaAfter, id);
    assert.ok(parseQuantity(quantity, scope).formulaAfter, `${id}: the after formula parses against the inputs alone`);
    assert.ok(![...plan.scene.quantities.map(q => q.id)].some(other => other !== 'launchSpeed' && other !== 'gravity' && new RegExp(`\\b${other}\\b`).test(`${quantity.formula} ${quantity.switchAt} ${quantity.formulaAfter}`)), `${id}: no reference to another quantity`);
  }
  const of = id => plan.scene.quantities.find(q => q.id === id), at = (id, t) => evalQuantity(of(id), inputs, t, {}, {});
  assert.deepEqual([at('dropVelocity', 0), at('dropAcceleration', 0.2), at('dropHeight', 0.2)], [0, 0, 16 / (2 * 9.8)]);
  assert.equal(at('dropVelocity', top) + 0, 0, 'at the top the free-fall velocity is zero');
  assert.equal(at('dropAcceleration', top), -9.8, 'at the boundary the after branch applies');
  assert.ok(Math.abs(at('dropVelocity', top + 0.1) + 0.98) < 1e-9);
  assert.ok(Math.abs(at('dropHeight', top + 0.1) - (16 / 19.6 - 0.049)) < 1e-9);
});

test('the Moon ledge plan: its own closed forms at start, top, end and the bounds, one pause at the top, the arrow rule', () => {
  const plan = plans.ledgeTossMoon, oracle = interactOracle(plan), found = tossCasesOf(plan);
  assert.equal(oracle.id, 'ledge-toss-moon');
  assert.deepEqual(plan.mode.fixedValues, { gravity: 1.62 });
  assert.deepEqual(plan.controls.filter(c => c.type === 'number').map(c => [c.binding.id, c.min, c.max, c.default]), [['launchSpeed', 1, 3, 2]]);
  assert.deepEqual(plan.mode.timeline.markers.filter(m => m.pause).map(m => m.id), ['top']);
  const g = 1.62, rows = (caseId, name) => oracle.expect.find(r => r.case === caseId && r.name === name)?.expected;
  const top = 2 / g;
  assert.ok(Math.abs(rows('cp-top', 'apexTime') - top) < 1e-12 && Math.abs(rows('cp-top', 'apexHeight') - (1 + 4 / (2 * g))) < 1e-12);
  assert.ok(Math.abs(rows('start', 'height') - 1) < 1e-12 && Math.abs(rows('start', 'velocity') - 2) < 1e-12, 'at launch the ball is on the 1.0 m ledge moving at the launch speed');
  assert.ok(Math.abs(rows('end', 'height') - 1) < 1e-9 && Math.abs(rows('end', 'velocity') + 2) < 1e-9, 'the flight ends back at ledge height, moving down at the launch speed');
  assert.ok(Math.abs(rows('cp-fastTop', 'apexHeight') - (1 + 9 / (2 * g))) < 1e-12, 'at the maximum speed the top is 1 + 9 / 3.24 m');
  assert.deepEqual(Object.keys(found.cases).filter(id => id.startsWith('bound-')).sort(), ['bound-speed-max', 'bound-speed-min']);
  const arrows = id => oracle.arrows.filter(a => a.case === id).map(a => `${a.id}:${a.dir}`).sort();
  assert.deepEqual(arrows('cp-top'), ['vec.a:down', 'vec.v:none']);
  assert.deepEqual(arrows('cp-rising'), ['vec.a:down', 'vec.v:up']);
  assert.deepEqual(arrows('cp-falling'), ['vec.a:down', 'vec.v:down']);
});

test('the ledge pin: INTERACT_DESIGN_FIXTURE=ledge answers brief only, with the Moon plan; the toss family is unchanged', async () => {
  assert.deepEqual(LEDGE_DEPTHS, { brief: 'ledge-toss-moon' });
  assert.deepEqual(['brief', 'balanced', 'detailed'].map(d => pinnedFixtureId('ledge', d)), ['ledge-toss-moon', null, null]);
  assert.deepEqual(['brief', 'balanced', 'detailed'].map(d => pinnedFixtureId('toss', d)), ['toss-overview', 'toss-standard', 'toss-deep']);
  assert.deepEqual(['brief', 'balanced'].map(d => pinnedFixtureId('ledge-toss-moon', d)), ['ledge-toss-moon', null]);
  assert.ok(PIN_FIXTURES.includes('ledge') && PIN_FIXTURES.includes('ledge-toss-moon'));
  const plan = await pinnedPlan('ledge', { depth: 'brief', evidence: [] });
  assert.equal(plan.title, plans.ledgeTossMoon.title);
  assert.deepEqual(plan.claims.flatMap(c => c.evidenceIds), [], 'evidence the job did not supply is dropped');
});
