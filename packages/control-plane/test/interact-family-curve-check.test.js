import { test } from 'node:test';
import assert from 'node:assert/strict';
import { curveBriefs } from '../../web/src/interact-curve-briefs.js';
import { curveSliders, expandBrief, referenceCheck } from '../../web/src/interact-family-curve-sliders.js';

test('the curve checker is generic data-driven code with a derivative, bound, effect and marker report', async () => {
  const m = await import('../src/interact-family-curve-check.js').catch(() => ({}));
  assert.equal(typeof m.checkCurvePlan, 'function', 'generic checker missing');
  for (const depth of ['brief', 'balanced', 'detailed']) {
    const result = m.checkCurvePlan(expandBrief(curveBriefs[depth], depth), curveSliders);
    assert.equal(result.ok, true, JSON.stringify(result.failures));
    assert.equal(result.samplePoints, 24);
    assert.ok(result.checked.derivative >= 24 && result.checked.bounds >= 24 && result.checked.marker >= 1 && result.checked.effects >= 1);
  }
});
test('six strict, deliberately wrong provider briefs each fail on the intended formula line', async () => {
  const { checkCurvePlan } = await import('../src/interact-family-curve-check.js');
  const { wrongCurveBriefs } = await import('./fixtures/interact-curve-wrong-briefs.js');
  const { briefSchema } = await import('../../web/src/interact-plan-brief.js');
  assert.equal(wrongCurveBriefs.length, 6);
  for (const bad of wrongCurveBriefs) {
    assert.equal(briefSchema('detailed', curveSliders).parse(bad.brief).ok, true, bad.id + ': still a valid flat brief');
    const result = checkCurvePlan(expandBrief(bad.brief, 'detailed'), curveSliders);
    assert.equal(result.ok, false, bad.id);
    assert.equal(result.failures[0].code, bad.code, bad.id + ': right invariant');
    assert.equal(result.failures[0].path, bad.path, bad.id + ': right line');
    assert.equal(referenceCheck(bad.brief, 'detailed').ok, false, bad.id + ': admission uses the checker');
  }
});
test('the same invariants work on a linear curve with different inputs, quantity ids and an independent z', async () => {
  const { checkCurvePlan } = await import('../src/interact-family-curve-check.js');
  const plan = {
    scene: { slots: { y: 'output', slope: 'gradient', yAtMarker: 'selectedOutput' }, quantities: [
      { id: 'output', formula: 'gain*z+shift' }, { id: 'gradient', formula: 'gain' }, { id: 'selectedOutput', formula: 'gain*selected+shift' },
    ] },
    controls: [
      { type: 'number', binding: { id: 'gain' }, min: 0.5, max: 2, default: 1 },
      { type: 'number', binding: { id: 'shift' }, min: -1, max: 1, default: 0 },
      { type: 'number', binding: { id: 'selected' }, min: -2, max: 2, default: 0 },
    ], mode: { fixedValues: {} },
  };
  const family = { independent: { id: 'z', domain: [-2, 2] }, bounds: [-5, 5], markerInput: 'selected', effects: [
    { input: 'gain', quantity: 'slope', direction: 'increasing' }, { input: 'shift', quantity: 'y', direction: 'increasing' }, { input: 'selected', quantity: 'yAtMarker', direction: 'increasing' },
  ] };
  assert.equal(checkCurvePlan(plan, family).ok, true);
  const falseEffect = { ...family, effects: [{ input: 'selected', quantity: 'yAtMarker', direction: 'decreasing' }] };
  const failure = checkCurvePlan(plan, falseEffect);
  assert.equal(failure.ok, false); assert.equal(failure.failures[0].code, 'curve_effect');
  assert.equal(failure.failures[0].path, 'formulas.yAtMarker.formula');
});
test('small slopes use a relative tolerance, and log/division domains are refused before numerical sampling', async () => {
  const { checkCurvePlan } = await import('../src/interact-family-curve-check.js');
  const plan = expandBrief(curveBriefs.detailed, 'detailed');
  const q = id => plan.scene.quantities.find(q => q.id === id);
  q('y').formula = '0.5 + 0.000001*x'; q('slope').formula = '0.000002'; q('yAtMarker').formula = '0.5 + 0.000001*xMarker';
  const noEffects = { ...curveSliders, effects: [] };
  const wrong = checkCurvePlan(plan, noEffects);
  assert.equal(wrong.failures[0].code, 'curve_derivative');
  q('slope').formula = '0.000001'; assert.equal(checkCurvePlan(plan, noEffects).ok, true);
  for (const formula of ['log(x)', '1/x']) {
    q('y').formula = formula;
    const bad = checkCurvePlan(plan, noEffects);
    assert.equal(bad.failures[0].code, 'curve_domain'); assert.equal(bad.failures[0].path, 'formulas.y.formula');
  }
});

test('family admission refuses a marker range outside the plotted independent domain', () => {
  const brief = structuredClone(curveBriefs.detailed);
  brief.xMarker.max = curveSliders.independent.domain[1] + brief.xMarker.step;
  const result = referenceCheck(brief, 'detailed');
  assert.equal(result.ok, false);
  assert.equal(result.failures[0].code, 'curve_marker_domain');
  assert.equal(result.failures[0].path, 'formulas.yAtMarker.formula');
});
