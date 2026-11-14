import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planProblems } from './interact-plan.js';
import { interactFixtures } from './interact-plan-fixtures.js';

// Plan-level validation of formulas, template and slots (interact-formula.js), on copies of the Standard reference plan: its fixture data is not edited here.
const { referencePlans } = await interactFixtures();
// The fixture now carries its formulas, drops and template (brief 7 section 2); these tests start from the same plan with that data taken off, so each case adds only what it names.
const base = structuredClone(referencePlans.tossStandard);
for (const q of base.scene.quantities) { delete q.formula; delete q.switchAt; delete q.formulaAfter; }
delete base.scene.template; delete base.scene.slots; delete base.scene.words;
const withQ = (id, patch) => { const plan = structuredClone(base); Object.assign(plan.scene.quantities.find(q => q.id === id), patch); return plan; };
// The words a template needs (scene.words) are checked in interact-plan-brief.test.mjs; this file is about formulas, templates and slots, so those problems are left out here.
const problemsOf = plan => planProblems(plan).filter(p => p.code !== 'template_words');
const messages = plan => problemsOf(plan).map(p => `${p.code}@${p.path.join('.')}: ${p.message}`);
const slots = { toss: { height: 'tossedHeight', velocity: 'tossedVelocity', acceleration: 'tossedAcceleration' }, drop: { height: 'dropHeight', velocity: 'dropVelocity', acceleration: 'dropAcceleration' } };
const oneBody = { height: 'tossedHeight', velocity: 'tossedVelocity', acceleration: 'tossedAcceleration' };
const templated = patch => { const plan = structuredClone(base); for (const q of plan.scene.quantities) q.formula = '0'; Object.assign(plan.scene, patch); return plan; };

test('plan validation parses every formula and names the quantity of the first problem', () => {
  assert.deepEqual(planProblems(base), [], 'the untouched plan is valid');
  assert.deepEqual(planProblems(withQ('tossedHeight', { formula: 'launchSpeed * t - gravity * t^2 / 2' })), []);
  assert.deepEqual(planProblems(withQ('dropHeight', { formula: 'launchSpeed^2 / (2 * gravity)', switchAt: 'launchSpeed / gravity', formulaAfter: 'launchSpeed * t - gravity * t^2 / 2' })), []);
  assert.match(messages(withQ('tossedHeight', { formula: 'launchSpeed * altitude' }))[0], /^formula_name@scene\.quantities\.\d+\.formula: quantity "tossedHeight" formula: unknown name "altitude"/);
  assert.match(messages(withQ('tossedHeight', { formula: '1 / 0' }))[0], /^division_by_zero@.*quantity "tossedHeight" formula: division by zero/);
  assert.match(messages(withQ('dropHeight', { formula: '1', switchAt: 't', formulaAfter: '2' }))[0], /^formula_name@scene\.quantities\.\d+\.switchAt: quantity "dropHeight" switchAt: .*not t/);
  assert.match(messages(withQ('dropHeight', { formula: '1', switchAt: '1' }))[0], /^formula_pair@.*switchAt and formulaAfter come together/);
  assert.match(messages(withQ('dropHeight', { switchAt: '1', formulaAfter: '2' }))[0], /^formula_pair@.*no formula/);
  assert.match(messages(withQ('dropHeight', { formula: '1 + 2 + 3 + 4 + 5 + 6 + 7 + 8 + 9' }))[0], /quantity "dropHeight" formula: this formula is 9 levels deep; at most 8/);
  assert.match(messages(withQ('dropHeight', { formula: `1${' + 1'.repeat(60)}` }))[0], /too_long|formula/, 'over 200 characters is refused (the schema bound or the parser)');
});

test('template and slots come together and are checked against the roles', () => {
  assert.deepEqual(problemsOf(templated({ template: 'two-lane', slots })), []);
  assert.deepEqual(problemsOf(templated({ template: 'one-body', slots: oneBody })), []);
  assert.match(messages(templated({ template: 'two-lane' }))[0], /^template_pair@scene\.slots/);
  assert.match(messages(templated({ slots }))[0], /^template_pair@scene\.template/);
  assert.match(messages(templated({ template: 'two-lane', slots: { toss: slots.toss } }))[0], /two-lane maps exactly 2 lanes/);
  assert.match(messages(templated({ template: 'two-lane', slots: { ...slots, drop: { height: 'dropHeight' } } }))[0], /two-lane needs the role "velocity"/);
  assert.match(messages(templated({ template: 'two-lane', slots: { ...slots, drop: { ...slots.drop, force: 'dropHeight' } } }))[0], /two-lane has no role "force"/);
  assert.match(messages(templated({ template: 'two-lane', slots: { ...slots, drop: { ...slots.drop, height: 'nothing' } } }))[0], /dangling_reference@.*"nothing", which the scene does not declare/);
  assert.match(messages(templated({ template: 'one-body', slots: { ...oneBody, extra: 'dropHeight' } }))[0], /one-body has no role "extra"/);
  assert.match(messages(templated({ template: 'one-body', slots }))[0], /one-body: height, velocity, acceleration each map to a quantity id/);
  const noFormula = templated({ template: 'one-body', slots: oneBody });
  delete noFormula.scene.quantities.find(q => q.id === 'tossedHeight').formula;
  assert.match(messages(noFormula)[0], /slot "height" names quantity "tossedHeight", which has no formula/);
});
