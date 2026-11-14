export const parameters = Object.freeze({ encoder: [1, -1, 2], initial: .5, inputs: [.25, -.5], recurrent: .5, queryShift: 1, precision: 3 });
export function derived() {
  const p = parameters, round = x => +x.toFixed(p.precision);
  const run = initial => { let state = initial; return p.inputs.map((input, i) => {
    const query = state, scores = p.encoder.map(x => query * x), max = Math.max(...scores), e = scores.map(x => Math.exp(x - max)), total = e.reduce((n, x) => n + x, 0), weights = e.map(x => x / total);
    const context = p.encoder.reduce((n, x, j) => n + weights[j] * x, 0); state = p.recurrent * query + input + context;
    return { step: i + 1, query, input, scores, weights, context, state, display: { weights: weights.map(round), context: round(context), state: round(state) } };
  }); };
  return { parameters: p, base: run(p.initial), probe: run(p.initial + p.queryShift), probeEncoder: [...p.encoder], positions: p.encoder.map((_, i) => 'E' + (i + 1)), counts: { steps: p.inputs.length, source: p.encoder.length } };
}
