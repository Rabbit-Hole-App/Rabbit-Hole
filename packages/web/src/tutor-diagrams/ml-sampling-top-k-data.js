import { CalculationRefused } from './calculation.js';
import { normalise } from './derived.js';

const k = 2;
// Log-integer scores keep the worked example's percentages exact.
const candidates = [['on', 21], ['near', 14], ['under', 8], ['by', 4], ['in', 3]];
const tokens = candidates.map(([token]) => token);
const logits = candidates.map(([, weight]) => Math.log(weight));
const sum = values => values.reduce((total, value) => total + value, 0);
const percent = probability => Math.round(probability * 100);

const maxLogit = Math.max(...logits);
const exponentials = logits.map(logit => Math.exp(logit - maxLogit));
const denominator = sum(exponentials);
const full = exponentials.map(value => value / denominator);

const ranked = logits.map((_, i) => i).sort((i, j) => logits[j] - logits[i]);
const kept = new Set(ranked.slice(0, k));
const keptMass = sum(full.filter((_, i) => kept.has(i)));
const filtered = full.map((probability, i) => kept.has(i) ? probability / keptMass : 0);

// MVP4: the calculation of this reference. Inputs: the first row of shares (percent, adding to 100) and k. Results: the second row (the kept shares renormalized to add to exactly 100, the others 0)
// and the kept share. It refuses inputs that cannot be right: a k below 1 or not smaller than the number of items, a first row that does not add to 100. Any number of items.
export function topK({ full: row, k: keep }) {
  if (!Array.isArray(row) || row.length < 2) throw new CalculationRefused('the first row needs at least two items');
  if (!Number.isInteger(keep) || keep < 1 || keep >= row.length) throw new CalculationRefused(`k must be a whole number from 1 to ${row.length - 1}, below the ${row.length} items`);
  const total = sum(row);
  if (Math.abs(total - 100) > 0.01) throw new CalculationRefused(`the first row must add to 100 (it adds to ${Number(total.toFixed(6))})`);
  const order = row.map((_, i) => i).sort((i, j) => row[j] - row[i] || i - j);
  const keptAt = new Set(order.slice(0, keep));
  const keptShare = Number(sum(row.filter((_, i) => keptAt.has(i))).toFixed(6));
  if (!(keptShare > 0)) throw new CalculationRefused('the kept items hold no share');
  const shares = normalise(row.filter((_, i) => keptAt.has(i)), 2); // the kept shares as whole percents of the kept total, adding to exactly 1
  let next = 0;
  return { renormalized: row.map((_, i) => (keptAt.has(i) ? Math.round(shares[next++] * 100) : 0)), keptShare };
}

const fullPercent = full.map(percent);
const worked = topK({ full: fullPercent, k });

// The limits are this reference's choice: shares from 0 to 100, a k up to 7 (the bar chart holds at most 8 items), a kept share above 0.
export const topKVariables = [
  { name: 'full', role: 'input', type: 'float', min: 0, max: 100, at: 'series.0.values' },
  { name: 'k', role: 'input', type: 'int', min: 1, max: 7, value: k },
  { name: 'renormalized', role: 'result', type: 'float', min: 0, max: 100, at: 'series.1.values' },
  { name: 'keptShare', role: 'result', type: 'float', min: 1, max: 100, value: worked.keptShare },
];
export const topKCalculation = { variables: topKVariables, run: topK };

// The title and caption of each depth with the numbers written as {{v:name}} (what the author is shown); the stored text is these with the worked example's numbers filled in.
export const topKTemplates = {
  overview: { title: 'Keeping only the likeliest tokens',
    caption: 'Keep the top {{v:k}} tokens. The other tokens drop to zero, and each kept token gets a bigger share.' },
  standard: { title: 'Full softmax and top-{{v:k}} sampling',
    caption: 'The kept tokens originally hold {{v:keptShare}}% of the probability. Divide each kept probability by that total.' },
  deep: { title: 'Top-{{v:k}} renormalizes the kept mass',
    caption: `For a kept token, $p_i'=p_i/\\sum_{j\\in K}p_j$. For "${tokens[0]}", {{v:full.0}}% / {{v:keptShare}}% = {{v:renormalized.0}}%.` },
};

export const samplingTopK = {
  k, tokens, logits, full, filtered,
  fullPercent,
  filteredPercent: worked.renormalized,
  keptMassPercent: worked.keptShare,
};
