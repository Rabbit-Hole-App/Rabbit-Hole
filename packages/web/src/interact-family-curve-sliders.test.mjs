import { test } from 'node:test';
import assert from 'node:assert/strict';
import { curveSliders, FAMILY, independent, expandBrief, extractBrief, referenceCheck, context } from './interact-family-curve-sliders.js';
import { curveBriefs } from './interact-curve-briefs.js';
import { briefSchema } from './interact-plan-brief.js';
import { ScenePlanSchema, planProblems } from './interact-plan.js';
import { formulaScope, parseQuantity } from './interact-formula.js';

for (const depth of ['brief', 'balanced', 'detailed']) {
  test(`${depth}: a flat provider brief expands to a valid still scene and round trips exactly`, () => {
    const info = briefSchema(depth, curveSliders), brief = JSON.parse(JSON.stringify(curveBriefs[depth]));
    assert.deepEqual(info.parse(brief), { ok: true, value: brief });
    const plan = expandBrief(brief, depth, { catalogueHash: 'a'.repeat(64) });
    assert.deepEqual(planProblems(plan), []);
    assert.equal(ScenePlanSchema.safeParse(plan).success, true);
    assert.equal(plan.mode.timeline, null);
    assert.equal(plan.mode.onInputChange, 'recompute_still');
    assert.equal(plan.controls.filter(c => c.type === 'number').length, ['brief', 'balanced', 'detailed'].indexOf(depth) + 1);
    assert.equal(plan.controls.some(c => ['playback', 'scrubber', 'seek'].includes(c.type)), false);
    assert.equal(plan.scene.template, FAMILY.depths[depth].template);
    assert.deepEqual(extractBrief(plan), brief);
    assert.deepEqual(expandBrief(extractBrief(plan), depth, { catalogueHash: 'a'.repeat(64) }), plan);
  });
  test(`${depth}: the logistic reference check catches a false formula on its role`, () => {
    assert.deepEqual(referenceCheck(curveBriefs[depth], depth), { ok: true, failures: [] });
    const wrong = structuredClone(curveBriefs[depth]); wrong.formulas.y.formula = 'x';
    const result = referenceCheck(wrong, depth);
    assert.equal(result.ok, false);
    assert.equal(result.failures[0].role, 'y');
  });
  test(`${depth}: context proves axis bounds over every admitted slider value using intervals`, () => {
    const plan = expandBrief(curveBriefs[depth], depth), scope = formulaScope(plan);
    assert.ok(scope.names.includes('x'));
    const parsed = Object.fromEntries(plan.scene.quantities.map(q => [q.id, parseQuantity(q, scope)]));
    const numberInputs = plan.controls.filter(c => c.type === 'number').map(c => ({ ...c, id: c.binding.id }));
    const { range } = context({ parsed, numberInputs, slots: plan.scene.slots, quantities: new Map(plan.scene.quantities.map(q => [q.id, q])) });
    const extent = curveBriefs[depth].k.max * (independent.domain[1] + (depth === 'brief' ? 0 : curveBriefs[depth].x0.max));
    assert.deepEqual(range.x, independent.domain);
    assert.deepEqual(range.y, [1 / (1 + Math.exp(extent)), 1 / (1 + Math.exp(-extent))]);
    assert.deepEqual(range.axisY, [0, 1]);
    const corrupt = structuredClone(parsed); corrupt.y.formula = { op: 'log', arg: { op: 'input', id: 'x' } };
    assert.throws(() => context({ parsed: corrupt, numberInputs, slots: plan.scene.slots, quantities: new Map() }), /log/);
  });
}

test('schema remains strict, fixed zero midpoint is family data, and still formulas cannot read time', () => {
  const info = briefSchema('brief', curveSliders);
  assert.equal(info.parse({ ...curveBriefs.brief, launchHeight: 0 }).ok, false);
  const plan = expandBrief(curveBriefs.brief, 'brief');
  assert.deepEqual(plan.mode.fixedValues, { x0: 0, xMarker: 1 });
  const wrong = structuredClone(plan); wrong.scene.quantities.find(q => q.id === 'y').formula = 't';
  assert.ok(planProblems(wrong).some(p => p.code === 'formula_name'));
});
