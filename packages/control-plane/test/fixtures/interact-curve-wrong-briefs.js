// Six valid flat provider replies with deliberately wrong mathematics. Each is
// isolated so the first failure identifies the intended invariant and line.
import { curveBriefs } from '../../../web/src/interact-curve-briefs.js';
const brief = (rules, inputs = {}) => {
  const b = structuredClone(curveBriefs.detailed);
  for (const [role, formula] of Object.entries(rules)) b.formulas[role].formula = formula;
  return Object.assign(b, inputs);
};
const denominator = '(2 + exp(k * (x - x0)) + exp(-k * (x - x0)))';
export const wrongCurveBriefs = Object.freeze([
  { id: 'slope-sign', code: 'curve_derivative', path: 'formulas.slope.formula', brief: brief({ slope: '-k / ' + denominator }) },
  { id: 'slope-scale', code: 'curve_derivative', path: 'formulas.slope.formula', brief: brief({ slope: '2*k / ' + denominator }) },
  { id: 'output-bounds', code: 'curve_bounds', path: 'formulas.y.formula', brief: brief({
    y: '2 / (1 + exp(-k*(x-x0)))', slope: '2*k / ' + denominator, yAtMarker: '2 / (1 + exp(-k*(xMarker-x0)))',
  }) },
  { id: 'steepness-direction', code: 'curve_effect', path: 'formulas.slope.formula', brief: brief({
    y: '1 / (1 + exp((x0-x)/k))', slope: '(1/k) / (2 + exp((x-x0)/k) + exp((x0-x)/k))', yAtMarker: '1 / (1 + exp((x0-xMarker)/k))',
  }) },
  // Keep the midpoint near zero so k still steepens at the declared probe x0;
  // this isolates the reversed translation rather than also reversing k's effect.
  { id: 'midpoint-direction', code: 'curve_effect', path: 'formulas.y.formula', brief: brief({
    y: '1 / (1 + exp(-k*(x+x0)))', slope: 'k / (2 + exp(k*(x+x0)) + exp(-k*(x+x0)))', yAtMarker: '1 / (1 + exp(-k*(xMarker+x0)))',
  }, { x0: { ...curveBriefs.detailed.x0, min: -curveBriefs.detailed.x0.step, max: curveBriefs.detailed.x0.step } }) },
  { id: 'marker-offset', code: 'curve_marker', path: 'formulas.yAtMarker.formula', brief: brief({ yAtMarker: '1 / (1 + exp(-k*(xMarker-x0+1)))' }) },
]);
