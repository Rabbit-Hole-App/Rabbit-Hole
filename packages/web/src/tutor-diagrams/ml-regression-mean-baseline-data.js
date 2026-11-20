import { CalculationRefused } from './calculation.js';

// The calculation of the regression-mean-baseline reference. Input: the targets, drawn as the y of every point of the first series. Result: the mean line (the reference line's value, and the number its
// label names), rounded to two decimals. It follows from the points: the author chooses the points, the server writes the line. Any number of points from two.
export function meanBaseline({ targets }) {
  if (!Array.isArray(targets) || targets.length < 2) throw new CalculationRefused('the mean needs at least two points');
  return { mean: Number((targets.reduce((total, target) => total + target, 0) / targets.length).toFixed(2)) };
}

// The limits are this reference's choice: a target from -1000 to 1000. `at` is where the figure draws a number (`*`: every item of the list).
export const meanBaselineCalculation = {
  variables: [
    { name: 'targets', role: 'input', type: 'float', min: -1000, max: 1000, at: 'series.0.points.*.y' },
    { name: 'mean', role: 'result', type: 'float', min: -1000, max: 1000, at: 'annotations.0.value' },
  ],
  run: meanBaseline,
};
