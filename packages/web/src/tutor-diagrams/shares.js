import { normalise } from './derived.js';

// Shares of a list of weights that add up to exactly 1 at `places` decimals (derived.js normalise, largest remainder). Equal weights must show as equal shares: when two equal weights would be shown as
// different shares (0.31 and 0.30 for two weights of 18) one more decimal place is used, up to two more. Three equal weights never divide 1 evenly at any decimal: the finest is then used.
// -> { shares, places }.
export function evenShares(values, places = 2) {
  for (let p = places; p <= places + 2; p++) {
    const shares = normalise(values, p);
    if (values.every((value, i) => values.every((other, j) => value !== other || shares[i] === shares[j]))) return { shares, places: p };
  }
  return { shares: normalise(values, places + 2), places: places + 2 };
}
// The same as percents (a share of 0.425 is 42.5).
export function evenPercents(values) {
  const { shares, places } = evenShares(values, 2);
  return shares.map(share => Number((share * 100).toFixed(places - 2)));
}
