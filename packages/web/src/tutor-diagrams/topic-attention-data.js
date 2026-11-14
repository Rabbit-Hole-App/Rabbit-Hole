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
