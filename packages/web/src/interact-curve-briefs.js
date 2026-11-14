// Approved stories and engineering settings. Output values, slopes, intervals
// and geometry are computed from formulas, never transcribed.
const formula = text => ({ formula: text, switchAt: null, formulaAfter: null });
const formulas = depth => {
  const fixed = depth === 'brief' ? { x0: 0, xMarker: 1 } : depth === 'balanced' ? { xMarker: 1 } : {};
  const rule = text => formula(text.replace(/\b(x0|xMarker)\b/g, name => Object.hasOwn(fixed, name) ? String(fixed[name]) : name));
  return {
  y: rule('1 / (1 + exp(-k * (x - x0)))'),
  // Equivalent to k*y*(1-y), within 32 nodes / 8 levels and no quantity names.
  slope: rule('k / (2 + exp(k * (x - x0)) + exp(-k * (x - x0)))'),
  yAtMarker: rule('1 / (1 + exp(-k * (xMarker - x0)))'),
  };
};
const k = () => ({ min: 0.5, max: 3, default: 1, step: 0.1 });
const x0 = () => ({ min: -2, max: 2, default: 0, step: 0.1 });
const xMarker = () => ({ min: -6, max: 6, default: 1, step: 0.1 });
const words = heading => ({
  heading, state_default: 'Default steepness', state_gentler: 'Gentler transition', state_steeper: 'Steeper transition',
  axis_x: 'Input x', axis_y: 'Output y', marker_heading: 'Marked input', marker_at: 'At x = ', readout_y: 'Output y',
});
const legend = { legend_curve: 'Curve', legend_tangent: 'Tangent', readout_slope: 'Slope dy/dx' };
export const curveBriefs = Object.freeze({
  brief: {
    title: 'Big inputs, bounded outputs.',
    story: 'A model gives you a raw score. A sigmoid bends it toward a lower or upper bound. Change steepness while watching the same marked input: the curve changes, but its bounds stay fixed.',
    cardDescription: 'A model gives you a raw score. A sigmoid bends it toward a lower or upper bound. Steepness changes how sharply it bends; the output stays between the bounds.',
    instructions: 'Move Steepness and watch the curve change. The marker keeps the same input, so you can compare its output.',
    k: k(), formulas: formulas('brief'), words: { ...words('Sigmoid curve'), marker_note: 'Between the bounds' },
  },
  balanced: {
    title: 'Shape the transition. Shift its middle.',
    story: 'Move the midpoint to the marked input. The marker sits halfway up the transition. Increase steepness there: the output stays halfway up while the tangent turns. Away from the midpoint, a steeper transition need not increase the local slope.',
    cardDescription: 'Steepness sharpens the sigmoid around its midpoint. Moving the midpoint shifts the whole curve. The tangent shows how quickly the output changes at the marked input.',
    instructions: 'Set Midpoint to the marked input, then change Steepness. The output stays halfway up while the tangent turns.',
    k: k(), x0: x0(), formulas: formulas('balanced'), words: { ...words('Sigmoid and tangent'), ...legend },
  },
  detailed: {
    title: 'The bounds stay fixed. The slope changes.',
    story: 'The exponential is positive, so its reciprocal with an added denominator stays strictly between the bounds. Move the marker into either tail: the curve flattens and its sensitivity fades. At the midpoint the slope is one quarter of steepness.',
    cardDescription: 'The exponential stays positive, so the output remains strictly between the bounds. The derivative is $dy/dx = k y (1 − y)$: sensitivity fades toward either end.',
    instructions: 'Move Marker x from the middle toward either end; compare output and slope. Change Steepness or Midpoint and repeat.',
    k: k(), x0: x0(), xMarker: xMarker(), formulas: formulas('detailed'), words: { ...words('y = 1 / (1 + exp(−k(x − x₀)))'), ...legend },
  },
});
