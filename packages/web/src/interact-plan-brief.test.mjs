import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interactFixtures } from './interact-plan-fixtures.js';
import { planProblems } from './interact-plan.js';
import { TEMPLATE_WORDS } from './interact-formula.js';
import { FAMILY, briefSchema, expandBrief, extractBrief, familyDescription, referenceFormulaCheck } from './interact-plan-brief.js';

const { referencePlans, referenceCapabilities } = await interactFixtures();
const PLAN_OF = { brief: 'tossOverview', balanced: 'tossStandard', detailed: 'tossDeep' };
const brief = depth => extractBrief(referencePlans[PLAN_OF[depth]]);

test('briefSchema is strict, flat (strings, numbers, null, one nesting level) and keyed per depth', () => {
  for (const depth of Object.keys(FAMILY.depths)) {
    const { jsonSchema, keys } = briefSchema(depth);
    const walk = (node, level) => {
      if (node.type === 'object') {
        assert.equal(node.additionalProperties, false, `${depth}: strict`);
        assert.deepEqual([...node.required].sort(), Object.keys(node.properties).sort(), `${depth}: every key required`);
        assert.ok(level <= 2, `${depth}: at most formulas.<role>.formula deep`);
        for (const child of Object.values(node.properties)) walk(child, level + 1);
      } else if (node.anyOf) assert.deepEqual(node.anyOf.map(n => n.type), ['string', 'null']);
      else assert.ok(['string', 'number'].includes(node.type), `${depth}: ${node.type}`);
    };
    walk(jsonSchema, 0);
    assert.deepEqual(keys.words.map(w => w.key), TEMPLATE_WORDS[FAMILY.depths[depth].template].map(w => w.key), `${depth}: the word keys are the template's`);
    assert.deepEqual(keys.formulas.map(f => f.id), [...FAMILY.depths[depth].roles], depth);
    assert.equal('mass' in jsonSchema.properties, depth === 'detailed', `${depth}: mass only at detailed`);
    assert.deepEqual(Object.keys(jsonSchema.properties.gravity.properties), depth === 'brief' ? ['fixed'] : ['min', 'max', 'default', 'step'], depth);
    assert.equal(familyDescription(depth).split('\n').length, 5, `${depth}: the family description is five lines`);
  }
  assert.throws(() => briefSchema('deep'), /no depth/);
});

test('parse accepts a pinned brief and refuses a stray key, a missing or too long word, a bad range and a half piecewise formula', () => {
  for (const depth of Object.keys(FAMILY.depths)) {
    const { parse } = briefSchema(depth), good = brief(depth);
    assert.ok(parse(good).ok, depth);
    assert.equal(parse({ ...good, extra: 1 }).ok, false, `${depth}: stray key`);
    const key = TEMPLATE_WORDS[FAMILY.depths[depth].template][0].key;
    assert.equal(parse({ ...good, words: { ...good.words, [key]: 'x'.repeat(41) } }).ok, false, `${depth}: too long word`);
    const { [key]: gone, ...rest } = good.words;
    assert.equal(parse({ ...good, words: rest }).ok, false, `${depth}: missing word`);
    assert.equal(parse({ ...good, launchSpeed: { ...good.launchSpeed, min: 6 } }).ok, false, `${depth}: min above max`);
    assert.equal(parse({ ...good, launchSpeed: { ...good.launchSpeed, default: 9 } }).ok, false, `${depth}: default outside the range`);
    assert.equal(parse({ ...good, formulas: { ...good.formulas, apexTime: { formula: 'launchSpeed / gravity', switchAt: 'launchSpeed', formulaAfter: null } } }).ok, false, `${depth}: half a piecewise formula`);
  }
  assert.equal(briefSchema('balanced').parse({ ...brief('balanced'), mass: { min: 1, max: 2, default: 1, step: 0.1 } }).ok, false, 'no mass at balanced');
});

test('referenceFormulaCheck names the role and the point of a wrong formula, and a formula that does not parse', () => {
  const wrongSign = brief('brief'); wrongSign.formulas.velocity.formula = 'launchSpeed + gravity * t';
  const a = referenceFormulaCheck(wrongSign, 'brief');
  assert.equal(a.ok, false); assert.equal(a.failures[0].role, 'velocity'); assert.ok(a.failures[0].point.t > 0 && Number.isFinite(a.failures[0].got) && Number.isFinite(a.failures[0].expected));
  const unknown = brief('detailed'); unknown.formulas.force.formula = 'm * gravity';
  const b = referenceFormulaCheck(unknown, 'detailed');
  assert.deepEqual([b.ok, b.failures[0].role, b.failures[0].point], [false, 'force', null]); assert.match(b.failures[0].got, /unknown name "m"/);
  const notPiecewise = brief('balanced'); notPiecewise.formulas.dropVelocity = { formula: 'tossedVelocity', switchAt: null, formulaAfter: null };
  const c = referenceFormulaCheck(notPiecewise, 'balanced');
  assert.equal(c.ok, false); assert.ok(c.failures.length >= 1 && c.failures.length <= 12);
  const wrongHeight = brief('brief'); wrongHeight.launchHeight = 2; // the formulas say 0, the brief says the launch mark is 2 m up
  assert.equal(referenceFormulaCheck(wrongHeight, 'brief').failures.some(f => f.role === 'height'), true);
  // A different but correct set of numbers passes: a Moon throw from a 1.5 m ledge.
  const moon = brief('brief'); moon.launchHeight = 1.5; moon.gravity = { fixed: 1.62 }; moon.formulas.height.formula = '1.5 + launchSpeed * t - gravity * t^2 / 2'; moon.formulas.apexHeight.formula = '1.5 + launchSpeed^2 / (2 * gravity)';
  assert.deepEqual(referenceFormulaCheck(moon, 'brief'), { ok: true, failures: [] });
});

test('a plan names a word for each key of its template and no other: planProblems refuses a missing, an unknown, a too long and a template-less words', () => {
  const plan = structuredClone(referencePlans.tossOverview), problems = p => planProblems(p).map(x => `${x.path.join('.')}:${x.code}`);
  assert.deepEqual(problems(plan), []);
  const missing = structuredClone(plan); delete missing.scene.words.where_top;
  assert.deepEqual(problems(missing), ['scene.words.where_top:template_words']);
  const unknown = structuredClone(plan); unknown.scene.words.shiny = 'x';
  assert.deepEqual(problems(unknown), ['scene.words.shiny:template_words']);
  const long = structuredClone(plan); long.scene.words.lane = 'x'.repeat(25);
  assert.deepEqual(problems(long), ['scene.words.lane:template_words']);
  const none = structuredClone(plan); delete none.scene.words;
  assert.deepEqual(problems(none), ['scene.words:template_words']);
  const noTemplate = structuredClone(plan); delete noTemplate.scene.template; delete noTemplate.scene.slots;
  assert.deepEqual(problems(noTemplate), ['scene.words:template_words']);
});

test('expandBrief writes everything but the brief: the ranges and formulas are the brief\'s, the rest is the family\'s', () => {
  const b = brief('detailed'); b.launchSpeed = { min: 3, max: 6, default: 5, step: 0.5 }; b.gravity = { min: 4, max: 8, default: 6, step: 0.5 }; b.mass = { min: 1, max: 4, default: 2, step: 0.5 };
  const plan = expandBrief(b, 'detailed', { catalogueHash: referenceCapabilities.catalogueHash });
  assert.deepEqual(planProblems(plan), []);
  const control = id => plan.controls.find(c => c.id === id);
  assert.deepEqual([control('speed').min, control('speed').max, control('speed').default, control('speed').step], [3, 6, 5, 0.5]);
  assert.deepEqual([control('massControl').default, control('massControl').onChange], [2, 'recompute_still']);
  assert.match(control('resetAll').effect, /launch speed 5 m\/s, gravity 6 m\/s\^2, mass 2 kg/);
  assert.equal(plan.mode.timeline.playbackRate, 0.4, 'about two wall seconds to the top at the defaults: (5 / 6 s) / 2.04, one decimal');
  assert.equal(plan.scene.checkpoints.find(c => c.id === 'heavyTop').inputOverrides.mass, 4);
  assert.equal(plan.scene.checkpoints.find(c => c.id === 'fastTop').inputOverrides.launchSpeed, 6);
  assert.equal(plan.scene.checkpoints.find(c => c.id === 'fastTop').inputOverrides.gravity, 4);
  assert.throws(() => expandBrief(b, 'deep'), /no depth/);
});
