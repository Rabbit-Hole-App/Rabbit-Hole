// Small independent examples. No dimensions, coefficients or predictions
// are taken from the architecture figures.
export const round = value => Math.round(value * 1000) / 1000 || 0;

const previous = [[2, 0], [0, 2]];
const keep = [0.25, 0.75];
const key = [0.6, 0.8];
const target = [0.7, 1];
const strength = 0.5;
const carried = previous.map((row, i) => row.map(value => round(keep[i] * value)));
const residual = target.map((value, j) =>
  round(value - carried.reduce((sum, row, i) => sum + key[i] * row[j], 0)));
const correction = key.map(value => residual.map(error => round(strength * value * error)));
export const recurrentGate = {
  previous, keep, key, target, strength, carried, correction,
  next: carried.map((row, i) => row.map((value, j) => round(value + correction[i][j]))),
};

export const outputGate = [0.25, 0.75];
export const attentionReads = [
  { scope: 'Local with rotation', values: [0.6, 1.2] },
  { scope: 'Full without rotation', values: [1, -0.8] },
  { scope: 'Indexed subset', values: [0.4, 1.6] },
].map(({ scope, values }) => ({ scope, values, gated: values.map((value, i) => round(value * outputGate[i])) }));

const expertValues = [[3, 3], [2, -2]];
const weights = [0.6, 0.4];
const experts = expertValues.map((raw, i) => {
  const rms = Math.sqrt(raw.reduce((sum, value) => sum + value ** 2, 0) / raw.length);
  const normalized = raw.map(value => round(value / rms));
  return { raw, normalized, weighted: normalized.map(value => round(value * weights[i])) };
});
const mixed = experts[0].weighted.map((value, i) => round(value + experts[1].weighted[i]));
export const latentExperts = {
  widths: [4, 2], weights, experts, mixed,
  projected: [mixed[0], mixed[1], round(mixed[0] + mixed[1]), round(mixed[0] - mixed[1])],
};
