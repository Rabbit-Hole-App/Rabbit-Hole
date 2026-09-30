// Guided inputs are bounded to [-2, 4], so raw exponential weights are safe
// and match the intermediate values displayed on the teaching card.
export function softmaxValues(scores) {
  const weights = scores.map(value => Math.exp(value));
  const sum = weights.reduce((total, value) => total + value, 0);
  return { weights, sum, probabilities: weights.map(value => value / sum) };
}
