// Benchmark measures for Jev vs Opus (docs/features/jev-grading.md). Every
// percentage travels with its raw k and N.
export const rate = (k, n) => ({ k, n, pct: n ? Math.round((k / n) * 1000) / 10 : null });

// Wilson 95%: (p + z²/(2N) ± z·√(p(1−p)/N + z²/(4N²))) / (1 + z²/N)
export function wilson(k, n, z = 1.96) {
  if (!n) return null;
  const p = k / n;
  const z2 = z * z;
  const centre = p + z2 / (2 * n);
  const spread = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  const denominator = 1 + z2 / n;
  return { low: (centre - spread) / denominator, high: (centre + spread) / denominator };
}

export function percentile(values, q) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))];
}

// Micro-averaged over (case, idea) items; positive = the gold idea is present.
export function prf(items, threshold) {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  for (const { p, gold } of items) {
    const yes = p >= threshold;
    if (yes && gold) tp += 1;
    else if (yes && !gold) fp += 1;
    else if (!yes && gold) fn += 1;
  }
  const precision = tp + fp ? tp / (tp + fp) : null;
  const recall = tp + fn ? tp / (tp + fn) : null;
  const f1 = precision != null && recall != null && precision + recall ? (2 * precision * recall) / (precision + recall) : null;
  return { threshold, tp, fp, fn, precision, recall, f1 };
}

// Descriptive only: never feeds back into THRESHOLDS.
export function bestThreshold(items) {
  let best = null;
  for (let step = 1; step <= 19; step += 1) {
    const result = prf(items, Math.round(step * 5) / 100);
    if (result.f1 != null && (!best || result.f1 > best.f1)) best = result;
  }
  return best;
}

export function calibration(items) {
  const buckets = Array.from({ length: 10 }, (_, index) => ({ low: index / 10, high: (index + 1) / 10, n: 0, sum: 0, positives: 0 }));
  for (const { p, gold } of items) {
    const bucket = buckets[Math.min(9, Math.floor(p * 10))];
    bucket.n += 1;
    bucket.sum += p;
    if (gold) bucket.positives += 1;
  }
  return buckets.map(({ low, high, n, sum, positives }) => ({ low, high, n, meanP: n ? sum / n : null, observed: n ? positives / n : null }));
}

export const brier = items => (items.length ? items.reduce((total, { p, gold }) => total + (p - (gold ? 1 : 0)) ** 2, 0) / items.length : null);

export const goldVerdict = gold => (gold.ideas.every(Boolean) && !gold.misconception && !gold.non_attempt ? 'good' : 'partial');

export function verdictAccuracy(cases, pick) {
  const k = cases.filter(item => pick(item) === goldVerdict(item.gold)).length;
  return { ...rate(k, cases.length), wilson: wilson(k, cases.length) };
}

export function confusion(cases, pick) {
  const table = { good: {}, partial: {} };
  for (const item of cases) {
    const row = table[goldVerdict(item.gold)];
    const got = pick(item);
    row[got] = (row[got] || 0) + 1;
  }
  return table;
}
