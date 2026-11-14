// Small scalar recurrences; every reach mask and gradient is computed from these inputs.
export const horizonParameters = Object.freeze({ h0: .5, a: .5, inputs: [1, 2, 1, 3, 2, 1],
  schedules: [{ name: 'Full', boundaries: [0, 6] }, { name: 'Fixed', boundaries: [0, 2, 4, 6] },
    { name: 'Sample A', boundaries: [0, 1, 5, 6] }, { name: 'Sample B', boundaries: [0, 1, 2, 6] }] });
export const gradientParameters = Object.freeze({ h0: .5, a: .5, inputs: [1, 2], targets: [.25, 1.625], lossScale: .5, lossPower: 2 });
const statesFor = p => p.inputs.reduce((states, input) => [...states, p.a * states.at(-1) + input], [p.h0]);
export function derived() {
  const p = horizonParameters;
  const states = statesFor(p);
  const schedules = p.schedules.map(row => ({ ...row, states: [...states],
    segments: row.boundaries.slice(1).map((end, i) => ({ start: row.boundaries[i], end })),
    reachableCount: p.inputs.length - row.boundaries.at(-2),
    reach: p.inputs.map((_, i) => +(i + 1 > row.boundaries.at(-2))) }));
  const g = gradientParameters, h = statesFor(g);
  const errors = g.targets.map((target, i) => h[i + 1] - target);
  const sensitivities = errors.map((error, i) => h.map((_, j) => j <= i + 1 ? error * g.a ** (i + 1 - j) : null));
  const upstream = g.inputs.map((_, i) => errors.reduce((sum, error, j) => j >= i ? sum + error * g.a ** (j - i) : sum, 0));
  const perUse = upstream.map((gradient, i) => gradient * h[i]);
  return { horizons: { parameters: p, states, schedules, steps: p.inputs.map((_, i) => i + 1) },
    gradients: { parameters: g, states: h, predictions: h.slice(1), losses: errors.map(error => .5 * error ** 2),
      sensitivities, upstream, perUse, totalGradient: perUse.reduce((sum, value) => sum + value, 0) } };
}
