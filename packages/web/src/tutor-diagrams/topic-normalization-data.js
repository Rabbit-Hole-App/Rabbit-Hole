export const parameters = Object.freeze({ input: [1, 3], update: [1, 1], shift: 2, epsilon: 0, affine: false, precision: 3 });
export function derived() {
  const p = parameters, round = x => +x.toFixed(p.precision);
  const normalize = input => { const sum = input.map((x, i) => x + p.update[i]), count = sum.length, mean = sum.reduce((n, x) => n + x, 0) / count;
    const variance = sum.reduce((n, x) => n + (x - mean) ** 2, 0) / count, std = Math.sqrt(variance), normalized = sum.map(x => (x - mean) / std);
    return { input, update: [...p.update], sum, mean, variance, std, normalized, display: { input: input.map(round), update: p.update.map(round), sum: sum.map(round), mean: round(mean), variance: round(variance), std: round(std), normalized: normalized.map(round) } }; };
  return { parameters: p, base: normalize([...p.input]), probe: normalize(p.input.map(x => x + p.shift)), counts: { features: p.input.length } };
}
