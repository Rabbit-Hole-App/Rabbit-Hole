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

export const samplingTopK = {
  k, tokens, logits, full, filtered,
  fullPercent: full.map(percent),
  filteredPercent: filtered.map(percent),
  keptMassPercent: percent(keptMass),
};
