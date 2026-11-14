// Trusted logistic values for the curve family. The generic invariants run
// first; a curve that fails them cannot silently fall through to no oracle.
import { curveSliders, referenceValue } from '../../web/src/interact-family-curve-sliders.js';
import { checkCurvePlan } from './interact-family-curve-check.js';

export class CurveInvariantError extends Error {
  constructor(failures) {
    super(failures.map(f => f.path + ': ' + f.code).join('; '));
    this.name = 'CurveInvariantError'; this.code = 'curve_invariant'; this.failures = failures;
  }
}
export function curveCasesOf(plan) {
  const depth = curveSliders.FAMILY.depths[plan?.depth];
  if (!depth || plan.scene?.template !== depth.template || plan.scene.runtime.renderer !== 'program' || plan.mode.timeline || plan.mode.kind !== 'static' || plan.supportingVisuals.length) return null;
  const controls = plan.controls.filter(c => c.type === 'number' && c.binding.kind === 'input');
  if (controls.map(c => c.binding.id).sort().join() !== depth.inputs.map(([id]) => id).sort().join()) return null;
  const defaults = Object.fromEntries(controls.map(c => [c.binding.id, c.default]));
  const cases = { default: defaults };
  for (const cp of plan.scene.checkpoints) cases['cp-' + cp.id] = { ...defaults, ...cp.inputOverrides };
  for (const c of controls) for (const [tag, value] of [['min', c.min], ['max', c.max]]) {
    // Trace probes cover every boundary even when its optional image is
    // outside the six-image budget. Do not claim an uncaptured image row.
    cases['probe-' + c.id + '-' + tag] = { ...defaults, [c.binding.id]: value };
  }
  return { cases, controls, defaults };
}
export function curveLogisticOracle(plan) {
  const ref = curveCasesOf(plan);
  if (!ref) return null;
  const invariants = checkCurvePlan(plan, curveSliders);
  if (!invariants.ok) throw new CurveInvariantError(invariants.failures);
  const expect = [], fixed = plan.mode.fixedValues, declared = new Set(plan.scene.quantities.map(q => q.id));
  for (const [caseId, inputs] of Object.entries(ref.cases)) {
    const values = { ...fixed, ...inputs }, x = values[curveSliders.markerInput];
    const outputs = { ...values, ...Object.fromEntries(['y', 'slope', 'yAtMarker'].map(role => [plan.scene.slots[role], referenceValue(role, x, values)])) };
    for (const [name, expected] of Object.entries(outputs)) if (declared.has(name)) expect.push({ case: caseId, panel: 'main', name, expected, tol: 1e-9 });
  }
  const p = { ...fixed, ...ref.defaults }, [left, right] = curveSliders.independent.domain;
  const valuesOf = id => { const c = ref.controls.find(c => c.binding.id === id); return c ? [c.min, c.max] : [fixed[id]]; };
  const edgeValues = [];
  for (const k of valuesOf('k')) for (const x0 of valuesOf('x0')) for (const x of [left, right]) edgeValues.push(referenceValue('y', x, { k, x0 }));
  return {
    id: 'curve-logistic-' + plan.depth, expect, invariants,
    bounds: {
      declared: curveSliders.bounds, xDomain: curveSliders.independent.domain,
      atDefaultInputs: [left, right].map(x => referenceValue('y', x, p)),
      overSliderDomain: [Math.min(...edgeValues), Math.max(...edgeValues)],
    },
  };
}
