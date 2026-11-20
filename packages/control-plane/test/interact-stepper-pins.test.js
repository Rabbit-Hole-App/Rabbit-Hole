import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INTERACT_FAMILIES } from '../src/interact-families.js';
import { pickQuestions } from '../src/interact-design-pick.js';
import { fillSystem, formulaProblems } from '../src/interact-design-fill.js';
import { briefSchema } from '../../web/src/interact-plan-brief.js';
import { interactCapabilities } from '../../web/src/interact-control-catalogue.js';
import { interactFixtures } from '../../web/src/interact-plan-fixtures.js';
import { parseScenePlan, planHash, captureBudgetProblems } from '../../web/src/interact-plan.js';
import { expandBrief, extractBrief, referenceBrief, check, stepperStates } from '../../web/src/interact-family-stepper.js';
import { designPinOf, pinnedFixtureId, pinnedPlan, pinnedDesignCall } from '../src/interact-design-pin.js';
import { buildTemplate, templateGate } from '../src/interact-template.js';
import { fixtureContext } from '../src/interact-fixtures.js';

const id = 'stepper-merge-sort-brief';
const capabilities = await interactCapabilities({ renderers: ['program'], inputsV2: true });
const family = () => INTERACT_FAMILIES.find(f => f.id === stepperStates.id);
const withCatalogue = plan => {
  const copy = structuredClone(plan);
  copy.scene.runtime.catalogueHash = capabilities.catalogueHash;
  return copy;
};

test('the real built-in stepper exposes the typed brief and composing text to the pick and fill', () => {
  assert.ok(family(), 'stepper must be registered at startup without a test registration');
  assert.equal(pickQuestions(INTERACT_FAMILIES).family.criteria[stepperStates.id], stepperStates.pickCriterion);
  const module = family().module, info = briefSchema('brief', module);
  assert.ok(info.jsonSchema.properties.composition);
  assert.equal(info.jsonSchema.properties.formulas, undefined);
  assert.equal(info.parse(referenceBrief('merge-sort', 'brief')).ok, true);
  const system = fillSystem('brief', info, module);
  assert.match(system, /- composition:/);
  assert.match(system, /## Rules/);
  assert.match(system, /one aha/i);
  assert.doesNotMatch(system, /## Formulas|A formula reads only/);
  const wrong = referenceBrief('merge-sort', 'brief');
  wrong.composition.data.variants[0].states[0].active = ['missing-region'];
  assert.ok(formulaProblems(check(wrong, 'brief')).some(line => line.startsWith('composition.data.variants.0.states.0.active')));
});

test('the checked-in Brief plan is exposed by the family pin and admitted with its typed scene.data', async () => {
  assert.ok(family(), 'stepper must be a built-in family');
  const { STEPPER_PLANS } = await import('../../web/src/interact-stepper-plans.js');
  const fixtures = await interactFixtures();
  assert.deepEqual(Object.keys(STEPPER_PLANS), [id]);
  assert.equal(parseScenePlan(STEPPER_PLANS[id], capabilities).ok, true, 'the plan file itself passes ScenePlan admission');
  assert.deepEqual(Object.keys(fixtures.stepperPlans), [id, 'stepper-tree-trace-brief', 'stepper-tree-motion-brief', 'stepper-vote-motion-balanced', 'stepper-pendulum-detailed', 'stepper-blueprint-b41-pendulum-2-brief', 'stepper-blueprint-b41-pendulum-2-balanced', 'stepper-blueprint-b41-pendulum-2-detailed', 'stepper-attention-brief']); // brief 46: the three Depth plans of the pinned blueprint card
  assert.equal(designPinOf({ SMALL_ENV: 'test', INTERACT_DESIGN_FIXTURE: 'stepper' }), 'stepper');
  assert.equal(designPinOf({ INTERACT_DESIGN_FIXTURE: 'stepper' }), null);
  assert.equal(pinnedFixtureId('stepper', 'brief'), id);
  assert.equal(pinnedFixtureId(id, 'brief'), id);
  for (const depth of ['balanced', 'detailed']) assert.equal(pinnedFixtureId('stepper', depth), null);
  const pinned = await pinnedPlan('stepper', { depth: 'brief', evidence: [] });
  assert.deepEqual(pinned, fixtures.stepperPlans[id]);
  const plan = withCatalogue(pinned), admitted = parseScenePlan(plan, capabilities);
  assert.equal(admitted.ok, true, JSON.stringify(admitted.problems));
  assert.deepEqual(admitted.value.scene.data, STEPPER_PLANS[id].scene.data);
  assert.notEqual(plan.story, plan.cardDescription, 'the design story must remain separate from visible card copy');
  assert.deepEqual(plan, expandBrief({ ...referenceBrief('merge-sort', 'brief'), story: STEPPER_PLANS[id].story }, 'brief', { catalogueHash: capabilities.catalogueHash }));
  assert.equal(await planHash(expandBrief(extractBrief(plan), 'brief', { catalogueHash: capabilities.catalogueHash })), await planHash(plan));
  assert.deepEqual(captureBudgetProblems(plan), []);
  const wrong = structuredClone(plan);
  wrong.scene.data.data.variants[0].states[0].decoration = 'unbound';
  assert.ok(parseScenePlan(wrong, capabilities).problems.some(p => p.path === 'scene.data.data.variants.0.states.0.decoration'));
  delete wrong.scene.data;
  assert.ok(parseScenePlan(wrong, capabilities).problems.some(p => p.path === 'scene.data'));
  // Fixture data is cloned, and the actual design pin binds to the offered catalogue.
  pinned.scene.data.aha.stateId = 'changed';
  assert.notDeepEqual(pinned.scene.data, (await pinnedPlan(id, { depth: 'brief', evidence: [] })).scene.data);
  const quiet = console.log; console.log = () => {};
  try {
    const out = await pinnedDesignCall('stepper', { id: 'pin-proof', depth: 'brief', evidence: [] }, 'design_author', { input: { capabilities } });
    assert.deepEqual(out.output, plan);
  } finally { console.log = quiet; }
});

test('the admitted pin passes the real template gate and sealed build with no model or network', async t => {
  assert.ok(family(), 'stepper must be a built-in family');
  const plan = withCatalogue(await pinnedPlan(id, { depth: 'brief', evidence: [] }));
  assert.deepEqual(templateGate({ INTERACT_BUILD_KIND: 'template' }, plan), { ok: true, template: 'stepper-brief' });
  const sent = [], original = globalThis.fetch;
  globalThis.fetch = async url => { sent.push(String(url)); throw new Error('no model/network call allowed'); };
  t.after(() => { globalThis.fetch = original; });
  const built = await buildTemplate({ id, plan, planHash: await planHash(plan), capabilities }, { ...fixtureContext(), adapters: {}, adapter: undefined });
  assert.ok(built.artifacts, JSON.stringify(built.details ?? built.problems));
  assert.ok(built.composition);
  assert.deepEqual(sent, []);
});
