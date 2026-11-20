import { CalculationRefused } from './calculation.js';
import { evenShares } from './shares.js';

// The calculation of the softmax-probabilities reference. Inputs: one list of raw weights per vector (not drawn: any positive numbers). Results: the two rows of probabilities, each adding to exactly 1
// (shares.js: shares of the total at two decimals by largest remainder; equal weights show as equal shares, with one more decimal when two decimals cannot). It refuses weights that cannot be right: a list
// shorter than two, a weight at or below 0, two lists of different length. Any number of items.
export function softmaxProbabilities({ weightsA, weightsB }) {
  for (const [name, weights] of [['weightsA', weightsA], ['weightsB', weightsB]]) {
    if (!Array.isArray(weights) || weights.length < 2) throw new CalculationRefused(`${name} needs at least two weights`);
    if (weights.some(weight => !(weight > 0))) throw new CalculationRefused(`${name} must hold weights above 0`);
  }
  if (weightsA.length !== weightsB.length) throw new CalculationRefused('the two weight lists must have the same length');
  return { probabilitiesA: evenShares(weightsA, 2).shares, probabilitiesB: evenShares(weightsB, 2).shares };
}

export const softmaxInputs = { weightsA: [70, 20, 10], weightsB: [15, 60, 25] };

// The limits are this reference's choice: a weight from 1 to 1000 (any scale gives the same shares), a probability from 0 to 1.
export const softmaxCalculation = {
  variables: [
    { name: 'weightsA', role: 'input', type: 'float', min: 1, max: 1000, drawn: false },
    { name: 'weightsB', role: 'input', type: 'float', min: 1, max: 1000, drawn: false },
    { name: 'probabilitiesA', role: 'result', type: 'float', min: 0, max: 1, at: 'series.0.values' },
    { name: 'probabilitiesB', role: 'result', type: 'float', min: 0, max: 1, at: 'series.1.values' },
  ],
  run: softmaxProbabilities,
};
