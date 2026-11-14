// Brief 21 task 1: a family is added in ONE place (registerFamily) and everything else is derived from it: the pick's criteria, the template table, the template roles and words plan validation reads,
// the pins, the oracle lookup and the check-map rows. A stub family registered here shows up in all of them and leaves again when it is unregistered.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INTERACT_FAMILIES, registerFamily } from '../src/interact-families.js';
import { pickQuestions } from '../src/interact-design-pick.js';
import { interactOracle } from '../src/interact-oracle.js';
import { pinFixtures, pinnedFixtureId, pinnedPlan } from '../src/interact-design-pin.js';
import { TEMPLATES, TemplateError, generateProgram } from '../../web/src/interact-templates/generate.js';
import { TEMPLATE_ROLES, TEMPLATE_WORDS } from '../../web/src/interact-formula.js';
import { isRegisteredTemplate, registeredFamilies } from '../../web/src/interact-family-registry.js';
import { ScenePlanSchema } from '../../web/src/interact-plan.js';
import { applyFamilyRows, familyRows, missingRows } from '../../../scripts/ci/gen-family-check-map.mjs';
import { readFileSync } from 'node:fs';

const STUB_PLAN = { depth: 'brief', claims: [], mode: { kind: 'static', fixedValues: {} }, controls: [], supportingVisuals: [], scene: { template: 'stub-template', slots: {}, words: {}, quantities: [], runtime: {} }, stub: true };
const stubTemplate = { roles: ['y'], normalize: () => { throw new TemplateError('stub_normalize', 'the stub template was reached'); } };
const stubFamily = Object.freeze({
  id: 'stub-family', pickCriterion: 'A stub scene that shows nothing: only a registration test draws it.',
  templates: Object.freeze(['stub-template']),
  templateData: Object.freeze({ 'stub-template': Object.freeze({ lanes: 0, roles: Object.freeze(['y']), words: [['heading', 24, 'heading of the stub']] }) }),
  templateModules: Object.freeze({ 'stub-template': stubTemplate }),
  pins: Object.freeze({ families: Object.freeze({ 'stub-pin': Object.freeze({ brief: 'stub-brief' }) }), plans: Object.freeze({ 'stub-brief': ['stub-brief', 'brief', 'stubPlans'] }) }),
  fixtureGroups: () => ({ stubPlans: { 'stub-brief': STUB_PLAN } }),
  checkMap: Object.freeze({ 'packages/web/src/interact-family-stub.js': ['packages/control-plane/test/interact-family-registry.test.js'] }),
});
const mapText = readFileSync(new URL('../../../scripts/ci/check-map.json', import.meta.url), 'utf8');

test('the built-in families are registered through the same call and the derived tables list them in registration order', () => {
  assert.deepEqual(registeredFamilies().map(f => f.id), ['vertical-throw', 'curve-sliders']);
  assert.deepEqual(Object.keys(TEMPLATE_ROLES), ['one-body', 'two-lane', 'body-plot', 'curve-one', 'curve-compare', 'curve-readouts']);
  assert.deepEqual(Object.keys(TEMPLATES), Object.keys(TEMPLATE_ROLES));
  assert.deepEqual(Object.keys(TEMPLATE_WORDS), Object.keys(TEMPLATE_ROLES));
  assert.deepEqual(INTERACT_FAMILIES.map(f => f.id), ['vertical-throw', 'curve-sliders']);
  assert.ok(pinFixtures().includes('toss') && pinFixtures().includes('curve') && pinFixtures().includes('toss-mvp') && pinFixtures().includes('ledge-toss-moon'));
});

test('a stub family is found in the pick criteria, the template table, the template roles and words, the pins, the oracle lookup and the check-map rows, and leaves when unregistered', async () => {
  const unregister = registerFamily(stubFamily, { oracles: () => [plan => (plan.stub ? { id: 'stub-oracle' } : null)] });
  try {
    // (a) the pick's criteria list: a choice per registered family, written by the family
    assert.ok(INTERACT_FAMILIES.some(f => f.id === 'stub-family'));
    const criteria = pickQuestions(INTERACT_FAMILIES).family.criteria;
    assert.equal(criteria['stub-family'], stubFamily.pickCriterion);
    assert.deepEqual(Object.keys(criteria), ['vertical-throw', 'curve-sliders', 'stub-family', 'none']);
    // (b) the template table: generateProgram resolves the stub's template (it stops in the stub's own normalize), plan validation knows its roles, words and name
    assert.equal(TEMPLATES['stub-template'], stubTemplate);
    assert.deepEqual(TEMPLATE_ROLES['stub-template'], { lanes: 0, roles: ['y'] });
    assert.deepEqual(TEMPLATE_WORDS['stub-template'], [{ path: 'heading', key: 'heading', max: 24, what: 'heading of the stub' }]);
    assert.ok(isRegisteredTemplate('stub-template'));
    assert.throws(() => generateProgram(STUB_PLAN, {}), error => error.code === 'stub_normalize');
    // (c) the pins: the pin family, its depth plan and its fixtures group
    assert.ok(pinFixtures().includes('stub-pin') && pinFixtures().includes('stub-brief'));
    assert.equal(pinnedFixtureId('stub-pin', 'brief'), 'stub-brief');
    assert.equal(pinnedFixtureId('stub-pin', 'balanced'), null, 'the stub pins brief only');
    assert.deepEqual((await pinnedPlan('stub-brief', { depth: 'brief', evidence: [] })).stub, true);
    // (d) the oracle lookup
    assert.deepEqual(interactOracle(STUB_PLAN), { id: 'stub-oracle' });
    // (e) the check-map rows
    assert.deepEqual(missingRows(JSON.parse(mapText), registeredFamilies()).map(p => p.path), ['packages/web/src/interact-family-stub.js']);
    assert.deepEqual(missingRows(JSON.parse(applyFamilyRows(mapText, familyRows())), registeredFamilies()), []);
  } finally { unregister(); }
  assert.deepEqual(INTERACT_FAMILIES.map(f => f.id), ['vertical-throw', 'curve-sliders']);
  assert.ok(!isRegisteredTemplate('stub-template') && !('stub-template' in TEMPLATES) && !pinFixtures().includes('stub-pin'));
  assert.equal(interactOracle(STUB_PLAN) ?? null, null);
  assert.throws(() => generateProgram(STUB_PLAN, {}), error => error.code === 'no_template');
});

test('registration refuses a duplicate id, a template another family owns, and a family without its template data', () => {
  assert.throws(() => registerFamily({ ...stubFamily, id: 'vertical-throw' }), /already registered/);
  assert.throws(() => registerFamily({ ...stubFamily, templates: ['one-body'], templateData: { 'one-body': { roles: [] } }, templateModules: { 'one-body': {} } }), /already belongs/);
  assert.throws(() => registerFamily({ id: 'bare', templates: ['bare-template'], templateData: {}, templateModules: {} }), /needs its templateData/);
  assert.throws(() => registerFamily({ templates: [] }), /needs an id/);
  assert.deepEqual(registeredFamilies().map(f => f.id), ['vertical-throw', 'curve-sliders']);
});

test('plan validation accepts a registered template name and refuses an unknown one', () => {
  const unregister = registerFamily(stubFamily);
  try {
    const shape = template => ScenePlanSchema.safeParse({ scene: { template } });
    const issue = result => result.error?.issues.find(i => i.path.join('.') === 'scene.template');
    assert.ok(!issue(shape('stub-template')), 'a registered template name passes the name check');
    assert.match(issue(shape('orbit')).message, /not a registered template/);
  } finally { unregister(); }
  assert.match(ScenePlanSchema.safeParse({ scene: { template: 'stub-template' } }).error.issues.find(i => i.path.join('.') === 'scene.template').message, /not a registered template/);
});
