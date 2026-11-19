// C02 toy inputs. Scores, scaling, softmax and display rounding are computed.
export const keys = Object.freeze([
  { label: 'A', key: [2, 0] },
  { label: 'B', key: [0, 1] },
  { label: 'C', key: [1, 2] },
]);
export const parameters = Object.freeze({ query: [1, 1], queryScale: 2, precision: 3 });

const sum = values => values.reduce((total, value) => total + value, 0);
const round = value => Number(value.toFixed(parameters.precision));

export function derived() {
  const headWidth = parameters.query.length;
  const divisor = Math.sqrt(headWidth);
  const score = query => {
    const terms = keys.map(({ key }) => key.map((value, i) => value * query[i]));
    const raw = terms.map(sum);
    const scaled = raw.map(value => value / divisor);
    const maximum = Math.max(...scaled);
    const exponentials = scaled.map(value => Math.exp(value - maximum));
    const denominator = sum(exponentials);
    const weights = exponentials.map(value => value / denominator);
    const total = sum(weights);
    return { query, terms, raw, scaled, maximum, exponentials, denominator, weights, total,
      display: { raw: raw.map(round), scaled: scaled.map(round), weights: weights.map(round), total: round(total) } };
  };
  return { parameters, keys, headWidth, divisor,
    counts: { rows: keys.length, features: headWidth },
    base: score([...parameters.query]),
    doubled: score(parameters.query.map(value => value * parameters.queryScale)),
  };
}

// C07 independent cases. The original C02 exports and derived() above are unchanged.
export const compositionParameters = Object.freeze({ precision: 3,
  matching: { order: ['A', 'B'], query: [1, -1], keys: [[2, 1], [1, 1]], values: [[2, -1], [0, 3]], queryScale: 2, changedValue: 1, valueDelta: [1, -2] },
  additive: { query: [1, -1], keys: [[1, 0, 1], [0, 1, -1], [0, 0, 0]], Wq: [[1, 0], [0, 1]], Wk: [[1, 0], [0, 1], [1, -1]], v: [1, -.5], eligible: [true, true, false], padProbe: [99, -99, 99] },
  connectivity: { positions: [1, 2, 3], radius: 1, widerRadius: 2, basePair: [1, 3], nearPair: [1, 2] },
  causal: { queries: [1, 1, -1], keys: [0, 1, 2], values: [1, 2, -1], focus: 1, futureKey: 100, futureValue: 999 },
  packed: { inputs: [1, 2], Wq: [1, 0], Wk: [0, 1], Wv: [1, -1], activeIndex: 1, secondInput: 3, secondWq: [-1, 1], secondWk: [1, 1], secondWv: [0, 2] },
  allQuery: { queries: [[1], [-1]], keys: [[0], [1]], values: [[2, -1], [0, 3]], rowOffsets: [2, -3] },
});
const c07Sum = values => values.reduce((s, x) => s + x, 0);
const c07Dot = (a, b) => c07Sum(a.map((x, i) => x * b[i]));
const c07Round = x => Number(x.toFixed(compositionParameters.precision));
const c07Display = rows => rows.map(row => Array.isArray(row) ? row.map(x => x === null ? null : c07Round(x)) : c07Round(row));
function c07Softmax(scores, eligible = scores.map(() => true)) {
  const max = Math.max(...scores.filter((_, i) => eligible[i]));
  const e = scores.map((x, i) => eligible[i] ? Math.exp(x - max) : 0), total = c07Sum(e);
  return e.map(x => x / total);
}
function c07Match(query, keys, values, order = compositionParameters.matching.order) {
  const terms = keys.map(row => row.map((x, i) => x * query[i])), scores = terms.map(c07Sum), weights = c07Softmax(scores);
  const products = values.map((row, i) => row.map(x => x * weights[i]));
  const output = values[0].map((_, j) => c07Sum(products.map(row => row[j])));
  return { order: [...order], query, keys, values, terms, scores, weights, products, output,
    display: { terms: c07Display(terms), scores: c07Display(scores), weights: c07Display(weights), products: c07Display(products), output: c07Display(output) } };
}
function c07Additive(keys) {
  const p = compositionParameters.additive;
  const project = (row, W) => W[0].map((_, j) => c07Sum(row.map((x, i) => x * W[i][j])));
  const projectedQuery = project(p.query, p.Wq), projectedKeys = keys.map(row => project(row, p.Wk));
  const combined = projectedKeys.map(row => row.map((x, j) => x + projectedQuery[j])), activated = combined.map(row => row.map(Math.tanh));
  const scores = activated.map(row => c07Dot(row, p.v)), weights = c07Softmax(scores, p.eligible);
  return { projectedQuery, projectedKeys, combined, activated, scores, weights,
    display: { combined: c07Display(combined), activated: c07Display(activated), scores: c07Display(scores), weights: c07Display(weights) } };
}
function c07Path(adjacency, source, target) {
  const queue = [[source]], seen = new Set([source]);
  while (queue.length) {
    const path = queue.shift(), last = path.at(-1); if (last === target) return path;
    adjacency.forEach((row, i) => { if (row[last] && !seen.has(i)) { seen.add(i); queue.push([...path, i]); } });
  }
  return null;
}
function c07Causal(keys, values) {
  const p = compositionParameters.causal;
  const rawScores = p.queries.map(q => keys.map(k => q * k));
  const maskedScores = rawScores.map((row, i) => row.map((x, j) => j <= i ? x : null));
  const weights = rawScores.map((row, i) => c07Softmax(row, row.map((_, j) => j <= i))), outputs = weights.map(row => c07Dot(row, values));
  return { rawScores, maskedScores, weights, outputs,
    display: { maskedScores: c07Display(maskedScores), weights: c07Display(weights), outputs: c07Display(outputs) } };
}
function c07AllQuery(scores) {
  const p = compositionParameters.allQuery, weights = scores.map(row => c07Softmax(row));
  const outputs = weights.map(row => p.values[0].map((_, j) => c07Sum(p.values.map((v, i) => row[i] * v[j]))));
  return { scores, weights, outputs, display: { scores: c07Display(scores), weights: c07Display(weights), outputs: c07Display(outputs) } };
}
export function compositionDerived() {
  const p = compositionParameters, m = p.matching, base = c07Match(m.query, m.keys, m.values);
  const changedValues = m.values.map((row, i) => row.map((x, j) => x + (i === m.changedValue ? m.valueDelta[j] : 0)));
  const permuted = c07Match(m.query, [...m.keys].reverse(), [...m.values].reverse(), [...m.order].reverse());
  const positions = p.connectivity.positions;
  const local = radius => positions.map((i) => positions.map(j => +(Math.abs(i - j) <= radius)));
  const rules = [{ id: 'conv', label: 'Conv', adjacency: local(p.connectivity.radius) },
    { id: 'rnn', label: 'RNN', adjacency: positions.map(i => positions.map(j => +(i === j + 1))) },
    { id: 'global', label: 'Attention', adjacency: positions.map(() => positions.map(() => 1)) }];
  const wideLocal = local(p.connectivity.widerRadius), paths = rules.map(rule => c07Path(rule.adjacency, 0, positions.length - 1));
  const hop = (A, pair) => c07Path(A, pair[0] - 1, pair[1] - 1).length - 1;
  const c = p.causal, futureKeys = [...c.keys], futureValues = [...c.values]; futureKeys[c.focus + 1] = c.futureKey; futureValues[c.focus + 1] = c.futureValue;
  const k = p.packed, jointWeights = [...k.Wq, ...k.Wk, ...k.Wv];
  const ranges = [{ key: 'queries', label: 'Q', start: 0, end: k.Wq.length }, { key: 'keys', label: 'K', start: k.Wq.length, end: k.Wq.length + k.Wk.length }, { key: 'values', label: 'V', start: k.Wq.length + k.Wk.length, end: jointWeights.length }];
  const project = (input, Wq, Wk, Wv) => ({ input, Wq, Wk, Wv, queries: Wq.map(w => input * w), keys: Wk.map(w => input * w), values: Wv.map(w => input * w), joint: [...Wq, ...Wk, ...Wv].map(w => input * w) });
  const active = { ...project(k.inputs[k.activeIndex], k.Wq, k.Wk, k.Wv), position: 'P' + (k.activeIndex + 1) };
  const layers = [{ ...active, label: 'Layer A', provided: true }, { ...project(k.secondInput, k.secondWq, k.secondWk, k.secondWv), position: active.position, label: 'Layer B', provided: true }];
  const channels = jointWeights.map((w, i) => { const range = ranges.find(r => i >= r.start && i < r.end); return { label: range.label + (i - range.start), cells: k.inputs.map(x => x * w) }; });
  const a = p.allQuery, headWidth = a.queries[0].length, scores = a.queries.map(q => a.keys.map(key => c07Dot(q, key) / Math.sqrt(headWidth)));
  return { parameters: p,
    matching: { base, valueProbe: c07Match(m.query, m.keys, changedValues), scaledQuery: c07Match(m.query.map(x => x * m.queryScale), m.keys, m.values), permuted },
    additive: { base: c07Additive(p.additive.keys), probe: c07Additive(p.additive.keys.map((row, i) => p.additive.eligible[i] ? row : p.additive.padProbe)), widths: { query: p.additive.query.length, key: p.additive.keys[0].length, hidden: p.additive.v.length }, coefficientMagnitudes: p.additive.v.map(Math.abs) },
    connectivity: { rules, paths, wideLocal, base: rules.map(r => hop(r.adjacency, p.connectivity.basePair)), near: rules.map(r => hop(r.adjacency, p.connectivity.nearPair)), wide: rules.map((r, i) => hop(i === 0 ? wideLocal : r.adjacency, p.connectivity.basePair)) },
    causal: { base: c07Causal(c.keys, c.values), probe: c07Causal(futureKeys, futureValues), positions: c.keys.map((_, i) => 'P' + (i + 1)) },
    packed: { channels, ranges, active, layers, jointWeights, jointRows: k.inputs.map(x => jointWeights.map(w => w * x)), positions: k.inputs.map((_, i) => 'P' + (i + 1)) },
    allQuery: { headWidth, base: c07AllQuery(scores), probe: c07AllQuery(scores.map((row, i) => row.map(x => x + a.rowOffsets[i]))) },
  };
}
