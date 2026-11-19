// Independent invented translation parameters; all attention results are derived.
export const parameters = Object.freeze({
  source: ['we', 'read', 'maps'], padding: '<pad>', target: ['nous', 'lisons', 'cartes'],
  shiftedPrefix: ['<bos>', 'nous', 'lisons'], queryTokens: ['nous', 'lisons'],
  queries: [[1, 0], [0, 1]], keys: [[2, 0], [0, 2], [1, 1], [20, 20]],
  values: [[2, 0], [0, 2], [1, 1], [9, 9]], broadQueryScale: 0.25, precision: 3,
  current: ['we', 'read', 'maps'], prior: ['old', 'maps'], focus: 'read',
  slots: ['[CLS]', 'we', 'read', '[SEP]'], features: ['Feature 1', 'Feature 2'], layers: ['W_1', 'W_2'],
  slotLookups: [[1, 0], [0, 1], [2, 0], [0, 2]],
  slotMixWeights: [
    [[1, 0], [0, 1]],
    [[0, 1], [1, 0]],
  ],
  architectures: { causal: 'GPT-2', bidirectional: 'BERT', memory: 'Transformer-XL' },
});
const sum = values => values.reduce((total, value) => total + value, 0);
const round = value => Number(value.toFixed(parameters.precision));
function attend(scale) {
  const scores = parameters.queries.map(query => parameters.keys.slice(0, parameters.source.length).map(key =>
    sum(key.map((value, i) => value * query[i] * scale)) / Math.sqrt(query.length)));
  const weights = scores.map(row => {
    const exps = row.map(score => Math.exp(score - Math.max(...row)));
    return exps.map(value => value / sum(exps));
  });
  const contexts = weights.map(row => parameters.values[0].map((_, column) =>
    sum(row.map((weight, i) => weight * parameters.values[i][column]))));
  const displayWeights = weights.map(row => row.map(round));
  return { scores, weights, contexts, grid: displayWeights.map(row => [...row, null]),
    display: { weights: displayWeights, contexts: contexts.map(row => row.map(round)) } };
}

function contextualLayers(causal) {
  const layers = [parameters.slotLookups];
  for (const weights of parameters.slotMixWeights) {
    const previous = layers.at(-1);
    layers.push(previous.map((own, i) => {
      const left = previous[i - 1];
      const right = causal ? undefined : previous[i + 1];
      const context = own.map((_, column) => (left?.[column] ?? 0) + (right?.[column] ?? 0));
      return weights.map((row, column) => own[column] + sum(row.map((weight, feature) => weight * context[feature])));
    }));
  }
  return layers;
}

export function derived() {
  const causal = parameters.current.map((_, i) => parameters.current.map((_, j) => j <= i ? 1 : null));
  const bidirectional = parameters.current.map(() => parameters.current.map(() => 1));
  const memory = causal.map(row => [...parameters.prior.map(() => 1), ...row]);
  return { parameters, sourceTokens: [...parameters.source], targetQueries: [...parameters.queryTokens],
    counts: { source: parameters.source.length, queries: parameters.queries.length, headWidth: parameters.queries[0].length,
      slots: parameters.slots.length, features: parameters.features.length, layers: parameters.layers.length },
    focus: parameters.current.indexOf(parameters.focus), base: attend(1), broad: attend(parameters.broadQueryScale),
    slotStates: { bidirectional: contextualLayers(false), causal: contextualLayers(true) },
    masks: { causal, bidirectional, memory,
      visibleCounts: Object.fromEntries(Object.entries({ causal, bidirectional, memory }).map(([name, rows]) => [name, rows.map(row => row.filter(value => value !== null).length)])) } };
}
