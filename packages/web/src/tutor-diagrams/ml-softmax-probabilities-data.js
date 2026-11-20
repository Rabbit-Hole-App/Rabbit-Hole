import { CalculationRefused } from './calculation.js';
import { normalise } from './derived.js';

// MVP4: the calculation of the softmax-probabilities reference. Inputs: one list of raw weights per vector (not drawn). Results: the two rows of probabilities, each adding to exactly 1
// (derived.js normalise: shares at two decimals by largest remainder). It refuses weights that cannot be right: a list shorter than two, a weight at or below 0, two lists of different length.
// Any number of items.
export function softmaxProbabilities({ weightsA, weightsB }) {
  for (const [name, weights] of [['weightsA', weightsA], ['weightsB', weightsB]]) {
    if (!Array.isArray(weights) || weights.length < 2) throw new CalculationRefused(`${name} needs at least two weights`);
    if (weights.some(weight => !(weight > 0))) throw new CalculationRefused(`${name} must hold weights above 0`);
  }
  if (weightsA.length !== weightsB.length) throw new CalculationRefused('the two weight lists must have the same length');
  return { probabilitiesA: normalise(weightsA, 2), probabilitiesB: normalise(weightsB, 2) };
}

export const softmaxWeights = { weightsA: [70, 20, 10], weightsB: [15, 60, 25] };
const worked = softmaxProbabilities(softmaxWeights);

// The limits are this reference's choice: a weight from 1 to 1000 (any scale gives the same shares), a probability from 0 to 1.
export const softmaxVariables = [
  { name: 'weightsA', role: 'input', type: 'float', min: 1, max: 1000, value: softmaxWeights.weightsA },
  { name: 'weightsB', role: 'input', type: 'float', min: 1, max: 1000, value: softmaxWeights.weightsB },
  { name: 'probabilitiesA', role: 'result', type: 'float', min: 0, max: 1, at: 'series.0.values' },
  { name: 'probabilitiesB', role: 'result', type: 'float', min: 0, max: 1, at: 'series.1.values' },
];
export const softmaxCalculation = { variables: softmaxVariables, run: softmaxProbabilities };
export const softmaxStored = { probabilitiesA: worked.probabilitiesA, probabilitiesB: worked.probabilitiesB };
