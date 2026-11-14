// checkQuantityFormulas (interact-formula-check.js): a correct set of formulas for the Standard toss plan, piecewise drop quantities included, matches the oracle at every case; a wrong sign, an unparsable
// formula, a missing id and a division by a literal zero are reported by id (and case). The reference formulas are written here from the physics, not read from the plan.
import test from 'node:test';
import assert from 'node:assert/strict';
import { interactFixtures } from '../../web/src/interact-plan-fixtures.js';
import { checkQuantityFormulas, planFormulas } from '../src/interact-formula-check.js';

const { referencePlans } = await interactFixtures();
const REFERENCE = {
  launchSpeed: { formula: 'launchSpeed' }, gravity: { formula: 'gravity' }, mass: { formula: 'mass' },
  apexTime: { formula: 'launchSpeed / gravity' }, apexHeight: { formula: 'launchSpeed^2 / (2 * gravity)' },
  velocity: { formula: 'launchSpeed - gravity * t' }, tossedVelocity: { formula: 'launchSpeed - gravity * t' },
  height: { formula: 'launchSpeed * t - gravity * t^2 / 2' }, tossedHeight: { formula: 'launchSpeed * t - gravity * t^2 / 2' },
  acceleration: { formula: '-gravity' }, tossedAcceleration: { formula: '-gravity' }, force: { formula: 'mass * gravity' },
  dropVelocity: { formula: '0', switchAt: 'launchSpeed / gravity', formulaAfter: '-gravity * (t - launchSpeed / gravity)' },
  dropAcceleration: { formula: '0', switchAt: 'launchSpeed / gravity', formulaAfter: '-gravity' },
  dropHeight: { formula: 'launchSpeed^2 / (2 * gravity)', switchAt: 'launchSpeed / gravity', formulaAfter: 'launchSpeed^2 / (2 * gravity) - gravity * (t - launchSpeed / gravity)^2 / 2' },
};
const plan = referencePlans.tossStandard;
const forPlan = () => Object.fromEntries(plan.scene.quantities.map(q => [q.id, REFERENCE[q.id] ?? { formula: '0' }]));

test('the physics written as formulas matches the oracle at every case, piecewise drop quantities included', () => {
  const result = checkQuantityFormulas(plan, forPlan());
  assert.deepEqual([result.ok, result.parseErrors, result.missingIds, result.wrongIds], [true, [], [], []]);
  assert.ok(result.checked >= 20, `checked ${result.checked} values`);
});

test('a wrong sign, a parse error, a missing id and a zero divisor are named by id', () => {
  const wrong = checkQuantityFormulas(plan, { ...forPlan(), tossedAcceleration: { formula: 'gravity' } });
  assert.equal(wrong.ok, false);
  assert.ok(wrong.wrongIds.every(w => w.id === 'tossedAcceleration') && wrong.wrongIds.length > 0 && wrong.wrongIds[0].expected < 0 && wrong.wrongIds[0].got > 0, JSON.stringify(wrong.wrongIds[0]));
  const parse = checkQuantityFormulas(plan, { ...forPlan(), tossedHeight: { formula: 'launchSpeed * sqrt(t)' } });
  assert.deepEqual(parse.parseErrors.map(e => e.id), ['tossedHeight']);
  const missing = forPlan(); delete missing.dropHeight;
  assert.deepEqual(checkQuantityFormulas(plan, missing).missingIds, ['dropHeight']);
  const zero = checkQuantityFormulas(plan, { ...forPlan(), apexTime: { formula: 'launchSpeed / 0' } });
  assert.ok(zero.parseErrors.some(e => e.id === 'apexTime'), JSON.stringify(zero.parseErrors));
  const heldOnly = checkQuantityFormulas(plan, { ...forPlan(), dropVelocity: { formula: '0' } });
  assert.ok(heldOnly.wrongIds.some(w => w.id === 'dropVelocity'), 'a piecewise quantity written without its after branch is wrong after the release');
});

test('planFormulas lists the plan\'s own formulas (none yet for a plan that carries none)', () => {
  const own = planFormulas(plan);
  for (const [id, f] of Object.entries(own)) assert.equal(typeof f.formula, 'string', id);
});
