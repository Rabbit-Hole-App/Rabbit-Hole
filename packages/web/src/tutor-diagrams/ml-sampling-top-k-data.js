import { CalculationRefused } from './calculation.js';
import { evenPercents } from './shares.js';

const k = 2;
// Log-integer scores keep the worked example's percentages exact: the weights are the integers whose logarithms are the scores.
const candidates = [['on', 21], ['near', 14], ['under', 8], ['by', 4], ['in', 3]];
const tokens = candidates.map(([token]) => token);
const weights = candidates.map(([, weight]) => weight);
const logits = weights.map(weight => Math.log(weight));
const sum = values => values.reduce((total, value) => total + value, 0);

// The calculation of this reference. Inputs: a list of raw weights (not drawn: any positive numbers) and k (the number of items kept; not drawn). Results: the first row (every weight's share of the
// total, in percent, adding to exactly 100), the second row (the kept items' shares of the kept total, the others 0, adding to exactly 100) and the kept share (what the kept items hold of the first
// row). Inputs are free numbers: nothing about their sum is refused; only a k that cannot keep some and drop some. Equal weights show as equal shares (shares.js). Any number of items.
export function topK({ weights: raw, k: keep }) {
  if (!Array.isArray(raw) || raw.length < 2) throw new CalculationRefused('the weights need at least two items');
  if (!Number.isInteger(keep) || keep < 1 || keep >= raw.length) throw new CalculationRefused(`k must be a whole number from 1 to ${raw.length - 1}, below the ${raw.length} weights`);
  if (raw.some(weight => !(weight > 0))) throw new CalculationRefused('every weight must be above 0');
  const full = evenPercents(raw);
  const order = raw.map((_, i) => i).sort((i, j) => raw[j] - raw[i] || i - j);
  const keptAt = new Set(order.slice(0, keep));
  const kept = evenPercents(raw.filter((_, i) => keptAt.has(i)));
  let next = 0;
  return { full, renormalized: raw.map((_, i) => (keptAt.has(i) ? kept[next++] : 0)), keptShare: Number(sum(full.filter((_, i) => keptAt.has(i))).toFixed(6)) };
}

// The limits are this reference's choice: a weight from 1 to 1000, a k up to 7 (the bar chart holds at most 8 items), shares from 0 to 100, a kept share above 0. `at` is where the figure draws a number.
export const topKCalculation = {
  variables: [
    { name: 'weights', role: 'input', type: 'float', min: 1, max: 1000, drawn: false },
    { name: 'k', role: 'input', type: 'int', min: 1, max: 7, drawn: false },
    { name: 'full', role: 'result', type: 'float', min: 0, max: 100, at: 'series.0.values' },
    { name: 'renormalized', role: 'result', type: 'float', min: 0, max: 100, at: 'series.1.values' },
    { name: 'keptShare', role: 'result', type: 'float', min: 1, max: 100, drawn: false },
  ],
  run: topK,
};
export const topKInputs = { weights, k };

const worked = topK(topKInputs);
export const samplingTopK = {
  k, tokens, logits,
  full: weights.map(weight => weight / sum(weights)),
  filtered: worked.renormalized.map(share => share / 100),
  fullPercent: worked.full,
  filteredPercent: worked.renormalized,
  keptMassPercent: worked.keptShare,
};
