import { SUPPORTED_PROGRAM_TUPLES } from './explain-program/stamps.js';
import { parseQuantity } from './interact-formula.js';
import { evalScalar, scalarInterval } from './interact-plan.js';
import { independent, bounds, effects, templates, curveRoles } from './interact-curve-data.js';
export { independent, bounds, effects, templates };

export const pickCriterion = 'One quantity as a function of another, drawn as a curve whose shape a few parameters change; no motion over time.';
export const FAMILY = Object.freeze({
  id: 'curve-sliders',
  depths: Object.freeze({
    brief: Object.freeze({ template: templates[0], roles: curveRoles, inputs: Object.freeze([['k', 'range']]) }),
    balanced: Object.freeze({ template: templates[1], roles: curveRoles, inputs: Object.freeze([['k', 'range'], ['x0', 'range']]) }),
    detailed: Object.freeze({ template: templates[2], roles: curveRoles, inputs: Object.freeze([['k', 'range'], ['x0', 'range'], ['xMarker', 'range']]) }),
  }),
});
export const ROLES = Object.freeze({
  y: { label: 'Output y', unit: '', meaning: 'Dimensionless output at x; strictly between zero and one for finite inputs. Positive is upward.', reference: 'y = 1 / (1 + exp(-k * (x - x0)))' },
  slope: { label: 'Slope dy/dx', unit: '', meaning: 'Signed derivative of y with respect to x. Positive means the curve rises to the right.', reference: 'slope = k / (2 + exp(k * (x - x0)) + exp(-k * (x - x0)))' },
  yAtMarker: { label: 'Output y', unit: '', meaning: 'Dimensionless output at the selected input xMarker; the same curve, not a second rule.', reference: 'yAtMarker = 1 / (1 + exp(-k * (xMarker - x0)))' },
});
export const INPUTS = Object.freeze({
  k: { label: 'Steepness k', unit: '', meaning: 'Positive steepness of the transition.', reference: 'At x0 the slope is k / 4.' },
  x0: { label: 'Midpoint x₀', unit: '', meaning: 'Input at the centre of the transition.', reference: 'The output at x0 is one half. Increasing x0 shifts the curve right.' },
  xMarker: { label: 'Marker x', unit: '', meaning: 'Input coordinate of the selected point on the curve.', reference: 'The marker readout is y evaluated at this input.' },
});
export const LIMITS = Object.freeze({});
export const scalars = Object.freeze([]);
export const formulaGrammar = Object.freeze([
  'A formula is text: numbers, names, + - * /, unary minus, parentheses, ^ with a literal integer exponent 2, 3 or 4; exp, log, sqrt and abs take one argument, min and max take two. No other functions or powers. At most 200 characters, 32 nodes and 8 levels.',
  'x is the independent variable over its domain [-6, 6], not elapsed time. Readable names are x, k, x0 and xMarker. This is an adjustable still scene with no timeline and no t. Use one continuous rule: switchAt and formulaAfter are null.',
]);
export const formulaRules = Object.freeze([
  'Use positive k. At Brief, x0 is fixed at zero and xMarker at one; at Balanced, xMarker is fixed at one. Detailed offers all three sliders. Fixed values are family data, not extra brief fields.',
  'The y and slope formulas read x, k and x0; yAtMarker substitutes xMarker for x. Do not reference another quantity such as y inside a formula.',
  'Write the derivative directly over the admitted names. Simplify it to fit the node and depth limits; computed quantities are not readable names.',
  'A callout locates the marker; the readouts row holds output and slope. Legend labels belong at Balanced and Detailed only. The subtitle names current steepness relative to its default.',
]);
const SHOWS = {
  brief: 'One curve, a fixed-input marker, a plain-word callout, an output readout and one steepness slider.',
  balanced: 'The same curve and fixed-input marker with a tangent, Curve/Tangent legend and output/slope readouts. Two sliders change steepness and midpoint.',
  detailed: 'A curve with its formula in the heading, a tangent and the same legend/readouts. Three sliders change steepness, midpoint and marker input.',
};
export function familyDescription(depth) {
  infoOf(depth);
  return [`Family ${FAMILY.id}. ${SHOWS[depth]}`, 'A 640 px adjustable still scene. x runs over [-6, 6]; there is no motion, playback, scrubber or timeline.', 'The logistic maps finite inputs strictly between zero and one; steepness changes sensitivity around the midpoint and midpoint shifts the transition.'].join('\n');
}
const fixedOf = depth => ({ ...(depth === 'brief' ? { x0: 0 } : {}), ...(depth !== 'detailed' ? { xMarker: 1 } : {}) });
function infoOf(depth) {
  const info = FAMILY.depths[depth];
  if (!info) throw new Error(`the family ${FAMILY.id} has no depth "${depth}"`);
  return info;
}
const affected = (kind, id) => ({ scope: 'main', kind, id });
export function expandBrief(brief, depth, { catalogueHash = '' } = {}) {
  const info = infoOf(depth), fixed = fixedOf(depth), ids = info.inputs.map(([id]) => id);
  const tuple = SUPPORTED_PROGRAM_TUPLES.find(t => t.schemaVersion === 1 && t.sdkVersion === 'sdk-8');
  const quantities = [
    ...Object.entries(INPUTS).map(([id, meta]) => ({ id, ...meta, formula: id })),
    ...info.roles.map(id => ({ id, ...ROLES[id], relation: `${id} = ${brief.formulas[id].formula}`, formula: brief.formulas[id].formula })),
  ];
  const controls = ids.map(id => ({
    id, label: INPUTS[id].label, unit: INPUTS[id].unit, type: 'number', nativeControlId: 'program.number', binding: { kind: 'input', id },
    purpose: INPUTS[id].meaning,
    selectionReason: 'A continuous slider exposes nearby values and intermediate changes in the curve.',
    ...brief[id], onChange: 'recompute_still',
    affects: [affected('entity', 'curve'), affected('entity', 'marker'), affected('quantity', id), affected('readout', 'yAtMarker'), ...(depth === 'brief' ? [] : [affected('readout', 'slope')])],
  }));
  controls.push({
    id: 'resetAll', label: 'Reset experiment', type: 'reset', nativeControlId: 'program.reset', binding: { kind: 'reset' },
    purpose: 'Restore the default parameters and marker.', selectionReason: 'One reset restores all linked settings together.',
    effect: 'Restores the default parameters and marker input.', affects: [affected('entity', 'curve'), affected('entity', 'marker')],
  });
  const checkpoint = (id, label, inputOverrides, expected) => ({ id, label, time: null, inputOverrides, actions: [], expected });
  const checkpoints = [
    checkpoint('default', 'Default curve', {}, 'The marker lies on the curve and its readout is the output at the marked input.'),
    checkpoint('gentle', 'Least steep', { k: brief.k.min }, 'The transition is gentler; its output stays within the same bounds.'),
    checkpoint('steep', 'Most steep', { k: brief.k.max }, 'The transition is sharper around its midpoint; its output stays within the same bounds.'),
    ...(depth === 'brief' ? [] : [checkpoint('shifted', 'Midpoint at marked input', { x0: Math.min(brief.x0.max, Math.max(brief.x0.min, fixed.xMarker ?? brief.xMarker.default)) }, 'The tangent and output change together at the selected input.')]),
    ...(depth === 'detailed' ? [
      checkpoint('left', 'Left edge', { xMarker: brief.xMarker.min }, 'The marker reaches the left end of its admitted input range.'),
      checkpoint('right', 'Right edge', { xMarker: brief.xMarker.max }, 'The marker reaches the right end of its admitted input range.'),
    ] : []),
  ];
  return {
    schemaVersion: 1, depth, title: brief.title, story: brief.story, cardDescription: brief.cardDescription, instructions: brief.instructions,
    learningGoal: depth === 'brief' ? 'Explain why changing steepness preserves the sigmoid bounds.' : 'Distinguish a shift of the transition from a change in sensitivity, using the marker and tangent.',
    supportingVisuals: [],
    scene: {
      description: SHOWS[depth],
      runtime: { renderer: 'program', schemaVersion: tuple.schemaVersion, sdkVersion: tuple.sdkVersion, programTuple: tuple, requiredHelpers: [], requiredCapabilities: ['number_inputs', 'props', 'figures'], catalogueHash },
      entities: [{ id: 'curve', label: 'Sigmoid curve', purpose: 'Show output as a function of input.' }, { id: 'marker', label: 'Selected point', purpose: 'Link an input coordinate to its output.' }, ...(depth === 'brief' ? [] : [{ id: 'tangent', label: 'Local tangent', purpose: 'Show the slope at the selected input.' }])],
      quantities, template: info.template, slots: { y: 'y', slope: 'slope', yAtMarker: 'yAtMarker' }, words: { ...brief.words },
      readoutIds: depth === 'brief' ? ['yAtMarker'] : ['yAtMarker', 'slope'],
      observations: [{ id: 'bounds', text: 'The output approaches either bound without reaching it at a finite input.', quantityIds: ['y'], readoutIds: ['yAtMarker'] }, ...(depth === 'brief' ? [] : [{ id: 'sensitivity', text: 'The tangent slope measures sensitivity at the marker.', quantityIds: ['slope'], readoutIds: ['slope'] }])],
      checkpoints,
    },
    mode: { kind: 'static', initialState: 'The curve at the default parameters with its linked marker; no elapsed time.', fixedValues: fixed, adjustableIds: ids, timeline: null, onInputChange: 'recompute_still' },
    controls,
    assumptions: ['Dimensionless logistic with positive steepness; a finite displayed input domain.'],
    limitations: ['The plot shows a finite input interval; its bounds describe the full logistic.'],
    claims: [{ id: 'boundedOutput', text: 'The output is strictly between zero and one for finite inputs with positive steepness.', evidenceIds: [], check: 'exp(z) > 0, hence 1 + exp(z) > 1 and its reciprocal is strictly between zero and one.' }],
  };
}
export function extractBrief(plan) {
  const info = infoOf(plan.depth), byId = new Map(plan.scene.quantities.map(q => [q.id, q]));
  const ranges = Object.fromEntries(info.inputs.map(([id]) => {
    const c = plan.controls.find(c => c.type === 'number' && c.binding.id === id);
    return [id, { min: c.min, max: c.max, default: c.default, step: c.step }];
  }));
  return {
    title: plan.title, story: plan.story, cardDescription: plan.cardDescription, instructions: plan.instructions, ...ranges,
    formulas: Object.fromEntries(info.roles.map(id => [id, { formula: byId.get(id).formula, switchAt: byId.get(id).switchAt ?? null, formulaAfter: byId.get(id).formulaAfter ?? null }])),
    words: { ...plan.scene.words },
  };
}
// Closed form is deliberately independent of the brief's formula strings.
export function referenceValue(role, x, p) {
  const y = z => 1 / (1 + Math.exp(-p.k * (z - p.x0)));
  if (role === 'y') return y(x);
  if (role === 'slope') { const value = y(x); return p.k * value * (1 - value); }
  if (role === 'yAtMarker') return y(p.xMarker);
  throw new Error(`unknown curve role ${role}`);
}
export function referenceCheck(brief, depth) {
  const info = infoOf(depth), fixed = fixedOf(depth), names = info.inputs.map(([id]) => id), parsed = {}, failures = [];
  for (const role of info.roles) {
    try {
      if (brief.formulas[role].switchAt !== null || brief.formulas[role].formulaAfter !== null) throw new Error('a still curve has one continuous rule');
      parsed[role] = parseQuantity({ id: role, formula: brief.formulas[role].formula }, { names: [...names, 'x'], fixed, time: false }).formula;
    } catch (e) { failures.push({ role, point: null, got: e.message, expected: 'one formula over x and the family inputs' }); }
  }
  for (let i = 0; i < 24; i++) {
    const values = { ...fixed, ...Object.fromEntries(names.map((id, j) => [id, [brief[id].min, brief[id].default, brief[id].max][(i + j) % 3]])) };
    const x = independent.domain[0] + (independent.domain[1] - independent.domain[0]) * i / 23;
    for (const [role, expr] of Object.entries(parsed)) {
      const expected = referenceValue(role, x, values);
      let got; try { got = evalScalar(expr, { ...values, x }); } catch (e) { got = e.message; }
      if (!(values.k > 0) || !Number.isFinite(got) || Math.abs(got - expected) > 1e-4 * Math.max(1, Math.abs(expected))) {
        if (failures.length < 12) failures.push({ role, point: { ...values, x }, got, expected });
      }
    }
  }
  return { ok: failures.length === 0, failures: failures.slice(0, 12) };
}
// No temporal geometry: interval arithmetic encloses y for x and every slider.
export function context({ slots, parsed, numberInputs, quantities }) {
  const domains = { [independent.id]: independent.domain, ...Object.fromEntries(numberInputs.map(c => [c.id, [c.min, c.max]])) };
  const y = scalarInterval(parsed[slots.y].formula, domains);
  const step = 0.25, axisY = [Math.floor(y[0] / step) * step, Math.ceil(y[1] / step) * step];
  if (axisY[0] === axisY[1]) axisY[1] += step;
  return {
    range: { x: independent.domain, y, axisY, kDefault: numberInputs.find(c => c.id === 'k').default },
    units: Object.fromEntries(['y', 'slope', 'yAtMarker'].map(role => [role, quantities.get(slots[role])?.unit ?? ''])),
  };
}
export const curveSliders = Object.freeze({ id: FAMILY.id, FAMILY, INPUTS, ROLES, LIMITS, scalars, referenceCheck, expandBrief, extractBrief, familyDescription, formulaGrammar, formulaRules, templates, context, independent, bounds, effects, pickCriterion });
