// Generic still-curve invariants. No logistic, parameter-name, title, template
// or subject matching: roles, independent domain, bounds and effects are data.
import { parseQuantity } from './interact-formula.js';
import { evalScalar, scalarInterval } from './interact-plan.js';

export const CURVE_SAMPLES = 24;
export const CURVE_RELATIVE_TOLERANCE = 1e-4;
const LIMIT = 12;
const points = ([a, b], n) => Array.from({ length: n }, (_, i) => a + (b - a) * i / (n - 1));
const roundoff = values => 8 * Number.EPSILON * Math.max(...values.map(Math.abs), Number.MIN_VALUE);

// Five-point central differences, then Richardson extrapolation. Difference
// pairs are subtracted before weighting to avoid cancelling large offsets.
// h and h/2 fit within the domain at every one of the 24 derivative samples.
export function numericDerivative(f, x, h) {
  const stencil = step => {
    const values = [f(x - 2 * step), f(x - step), f(x + step), f(x + 2 * step)];
    return { value: (8 * (values[2] - values[1]) - (values[3] - values[0])) / (12 * step), roundoff: roundoff(values) / step };
  };
  const wide = stencil(h), narrow = stencil(h / 2);
  return { value: narrow.value + (narrow.value - wide.value) / 15, roundoff: narrow.roundoff + wide.roundoff / 15 };
}

export function checkCurvePlan(plan, family) {
  const { independent, bounds, effects = [], markerInput } = family;
  const failures = [], checked = { bounds: 0, derivative: 0, marker: 0, effects: 0 };
  const result = () => ({ ok: failures.length === 0, failures, samplePoints: CURVE_SAMPLES, checked });
  const bad = (role, code, point, got, expected) => {
    if (failures.length < LIMIT) failures.push({ role, path: 'formulas.' + role + '.formula', code, point, got, expected });
  };
  if (!independent || !Array.isArray(independent.domain) || !(independent.domain[0] < independent.domain[1]) || !bounds || !(bounds[0] < bounds[1]) || !markerInput) {
    bad('y', 'curve_declaration', null, null, 'an independent domain, output bounds and marker input'); return result();
  }
  const inputs = plan.controls.filter(c => c.type === 'number').map(c => ({ ...c, id: c.binding.id }));
  const fixed = plan.mode.fixedValues, names = inputs.map(c => c.id);
  const domains = { [independent.id]: independent.domain, ...Object.fromEntries(inputs.map(c => [c.id, [c.min, c.max]])) };
  const quantities = new Map(plan.scene.quantities.map(q => [q.id, q])), trees = {};
  for (const role of ['y', 'slope', 'yAtMarker']) {
    const q = quantities.get(plan.scene.slots[role]);
    try {
      if (!q || q.switchAt !== undefined || q.formulaAfter !== undefined) throw new Error('a still curve role needs one continuous formula');
      const tree = parseQuantity(q, { names: [...names, independent.id], fixed, time: false });
      if (!tree) throw new Error('a curve role needs a formula');
      trees[role] = tree.formula;
      // Prove finite/domain-safe evaluation over the complete slider domain.
      scalarInterval(tree.formula, domains);
    } catch (e) { bad(role, 'curve_domain', null, e.message, 'a finite, domain-safe continuous formula'); }
  }
  if (failures.length) return result();
  const defaults = Object.fromEntries(inputs.map(c => [c.id, c.default]));
  let sets = [defaults];
  for (let bits = 0; bits < 2 ** inputs.length; bits++) sets.push(Object.fromEntries(inputs.map((c, i) => [c.id, bits >> i & 1 ? c.max : c.min])));
  sets = [...new Map(sets.map(p => [JSON.stringify(p), p])).values()];
  const [lo, hi] = independent.domain, h = (hi - lo) / 128;
  const xs = points([lo + 2 * h, hi - 2 * h], CURVE_SAMPLES);
  const value = (role, p, x) => evalScalar(trees[role], { ...fixed, ...p, [independent.id]: x });
  const marker = p => p[markerInput] ?? fixed[markerInput];
  const epsilon = roundoff(bounds);
  for (const p of sets) {
    for (const x of [lo, ...xs, hi]) {
      const got = value('y', p, x); checked.bounds++;
      if (got < bounds[0] - epsilon || got > bounds[1] + epsilon) bad('y', 'curve_bounds', { ...p, [independent.id]: x }, got, bounds);
    }
    for (const x of xs) {
      const d = numericDerivative(z => value('y', p, z), x, h), got = value('slope', p, x); checked.derivative++;
      // A relative test, not max(1,expected): even tiny nonzero slopes matter.
      const tolerance = CURVE_RELATIVE_TOLERANCE * Math.max(Math.abs(d.value), Math.abs(got)) + d.roundoff;
      if (Math.abs(got - d.value) > tolerance) bad('slope', 'curve_derivative', { ...p, [independent.id]: x }, got, d.value);
    }
    const x = marker(p);
    if (!Number.isFinite(x) || x < lo || x > hi) { bad('yAtMarker', 'curve_marker_domain', p, x, independent.domain); continue; }
    const got = value('yAtMarker', p, x), expected = value('y', p, x); checked.marker++;
    if (Math.abs(got - expected) > 1e-10 * Math.max(1, Math.abs(expected))) bad('yAtMarker', 'curve_marker', { ...p, [independent.id]: x }, got, expected);
  }
  // The interval, not only the samples, must enclose y within declared bounds.
  const enclosure = scalarInterval(trees.y, domains);
  if (enclosure[0] < bounds[0] - epsilon || enclosure[1] > bounds[1] + epsilon) bad('y', 'curve_bounds_unproved', null, enclosure, bounds);
  for (const effect of effects) {
    const input = inputs.find(c => c.id === effect.input);
    if (!input) continue; // a parameter fixed at this depth has no slider effect
    const levels = [...new Set([input.min, input.default, ...points([input.min, input.max], 5)])].sort((a, b) => a - b);
    for (const p of sets) for (const x of effect.at ? [0] : xs) {
      const values = levels.map(v => {
        const at = { ...p, [input.id]: v }, location = effect.at ? at[effect.at] ?? fixed[effect.at] : x;
        return value(effect.quantity, at, location);
      });
      const sign = effect.direction === 'increasing' ? 1 : -1, tolerance = roundoff(values);
      let holds = sign * (values.at(-1) - values[0]) > tolerance;
      for (let i = 1; i < values.length; i++) { checked.effects++; if (sign * (values[i] - values[i - 1]) < -tolerance) holds = false; }
      if (!holds) bad(effect.quantity, 'curve_effect', { ...p, ...(effect.at ? { at: effect.at } : { [independent.id]: x }), parameter: input.id }, values, effect.direction + ' as ' + input.id + ' increases');
    }
  }
  return result();
}
