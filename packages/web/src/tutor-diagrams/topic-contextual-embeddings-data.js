// Independent linear illustration, not real ELMo/LSTM outputs or learned semantic axes.
export const parameters = Object.freeze({ statePrecision: 4, scorePrecision: 3,
  directional: { contexts: [{ id: 'G', tokens: ['a', 'seal', 'glides'], cue: 'animal' }, { id: 'C', tokens: ['a', 'seal', 'cracks'], cue: 'gasket' }], selectedPosition: 1,
    lookup: [{ token: 'a', values: [0, 1] }, { token: 'seal', values: [1, 0] }, { token: 'glides', values: [2, 1] }, { token: 'cracks', values: [-1, 2] }], forward: .5, backward: .25, boundary: 0, depths: 2,
    taskA: { coefficients: [.2, .3, .5], gamma: 1 }, taskB: { coefficients: [.5, .3, .2], gamma: 1 } },
  // Separate synthetic frozen-feature cohort with supplied untrained heads, not encoder output.
  evaluation: { metric: 'F1', records: [{ id: 'u1', target: 1, layers: [[1, 0], [2, 0]] }, { id: 'u2', target: 1, layers: [[-1.5, 0], [1, 0]] }, { id: 'u3', target: 1, layers: [[2.5, 0], [-1, 0]] }, { id: 'u4', target: 0, layers: [[-1.5, 0], [1, 0]] }, { id: 'u5', target: 0, layers: [[1.5, 0], [-2, 0]] }, { id: 'u6', target: 0, layers: [[-1, 0], [-1, 0]] }],
    methods: [{ id: 'last', label: 'Last', operation: 'last', head: [1, 0] }, { id: 'sum', label: 'Sum', operation: 'sum', head: [1, 0] }, { id: 'join', label: 'Join', operation: 'join', head: [.5, 0, 1, 0] }], bias: 0, threshold: 0, reorder: ['u6', 'u2', 'u4', 'u1', 'u5', 'u3'] },
});
export const classifyLogit = logit => +(logit > parameters.evaluation.threshold);
export function derived() {
  const p = parameters, q = p.directional, e = p.evaluation, round = x => +x.toFixed(p.statePrecision), roundRow = row => row.map(round);
  const read = (values, scalar, reverse) => { const states = Array(values.length);let previous = q.boundary;for (let k = 0; k < values.length; k++) { const i = reverse ? values.length - 1 - k : k;states[i] = scalar * previous + values[i];previous = states[i]; }return states; };
  const mix = (operands, task) => { const products = operands.map((row, depth) => row.map(x => x * task.coefficients[depth])), output = operands[0].map((_, j) => task.gamma * products.reduce((sum, row) => sum + row[j], 0));return { products, output }; };
  const contexts = q.contexts.map(context => {
    const E = context.tokens.map(token => [...q.lookup.find(row => row.token === token).values]), F = [], B = [];
    for (let depth = 0; depth < q.depths; depth++) { F.push(read(depth ? F[depth - 1] : E.map(row => row[0]), q.forward, false));B.push(read(depth ? B[depth - 1] : E.map(row => row[1]), q.backward, true)); }
    const H = [E, ...F.map((states, depth) => states.map((value, i) => [value, B[depth][i]]))], mixes = E.map((_, i) => mix(H.map(layer => layer[i]), q.taskA));
    return { ...context, E, F, B, H, taskA: { coefficients: [...q.taskA.coefficients], gamma: q.taskA.gamma, products: mixes.map(m => m.products), outputs: mixes.map(m => m.output), displayProducts: mixes.map(m => m.products.map(roundRow)), displayOutputs: mixes.map(m => roundRow(m.output)) } };
  });
  const operands = contexts[0].H.map(H => [...H[q.selectedPosition]]), probe = mix(operands, q.taskB), delta = probe.output.map((x, j) => x - contexts[0].taskA.outputs[q.selectedPosition][j]);
  const evaluate = records => e.methods.map(method => {
    const rows = records.map(record => { const [L1, L2] = record.layers, feature = method.operation === 'last' ? [...L2] : method.operation === 'sum' ? L1.map((x, j) => x + L2[j]) : [...L1, ...L2];
      const logit = feature.reduce((sum, x, j) => sum + x * method.head[j], e.bias);return { id: record.id, target: record.target, feature, logit, prediction: classifyLogit(logit) }; });
    const counts = { TP: 0, FP: 0, FN: 0, TN: 0 };for (const row of rows) counts[row.target ? row.prediction ? 'TP' : 'FN' : row.prediction ? 'FP' : 'TN']++;
    const precision = counts.TP / (counts.TP + counts.FP), recall = counts.TP / (counts.TP + counts.FN), f1 = 2 * counts.TP / (2 * counts.TP + counts.FP + counts.FN);
    return { id: method.id, label: method.label, width: rows[0].feature.length, rows, counts, precision, recall, f1, displayF1: +f1.toFixed(p.scorePrecision) };
  });
  return { parameters: p, directional: { contexts, outputDelta: contexts[0].taskA.outputs.map((row, position) => row.map((x, j) => contexts[1].taskA.outputs[position][j] - x)), displayOutputDelta: contexts[0].taskA.outputs.map((row, position) => row.map((x, j) => round(contexts[1].taskA.outputs[position][j] - x))), taskProbe: { ...probe, operands, coefficients: [...q.taskB.coefficients], gamma: q.taskB.gamma, delta, displayOutput: roundRow(probe.output), displayProducts: probe.products.map(roundRow), displayDelta: roundRow(delta) } },
    evaluation: { base: evaluate(e.records), reordered: evaluate(e.reorder.map(id => e.records.find(record => record.id === id))) }, counts: { contexts: contexts.length, positions: contexts[0].tokens.length, features: contexts[0].E[0].length, depths: q.depths, cohort: e.records.length } };
}
