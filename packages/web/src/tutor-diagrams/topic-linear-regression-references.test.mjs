import test from 'node:test';
import assert from 'node:assert';
import * as data from './topic-linear-regression-data.js';
import { references, derived } from './topic-linear-regression-references.js';
import replay from './topic-linear-regression-replay-cases.json' with { type: 'json' };
test('the merged derived() carries every value of the data module', () => assert.deepStrictEqual(Object.fromEntries(Object.keys(data.derived()).map(key => [key, derived()[key]])), data.derived()));
{
const lrOneIds = ['ml-linear-regression-line-meaning', 'ml-linear-regression-residual-cost', 'ml-linear-regression-cost-bowl', 'ml-linear-regression-training-loop'];
function lrOneNear(actual, expected) {
  assert.strictEqual(typeof actual, 'number');
  assert.ok(Number.isFinite(actual));
  assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} differs from ${expected}`);
}
function lrOneCompare(actual, expected) {
  if (typeof expected === 'number') return lrOneNear(actual, expected);
  if (Array.isArray(expected)) {
    assert.strictEqual(actual.length, expected.length);
    expected.forEach((item, i) => lrOneCompare(actual[i], item));
    return;
  }
  Object.entries(expected).forEach(([key, value]) => lrOneCompare(actual[key], value));
}
function lrOneNumbers(value) {
  if (typeof value === 'number') return [value];
  if (!value || typeof value !== 'object') return [];
  return Object.values(value).flatMap(lrOneNumbers);
}
function lrOneIndependent() {
  const rows = data.toyData.rows;
  const n = rows.length;
  const sum = values => values.reduce((a, b) => a + b, 0);
  const meanX = sum(rows.map(row => row[0])) / n;
  const meanY = sum(rows.map(row => row[1])) / n;
  const sxx = sum(rows.map(([x]) => (x - meanX) ** 2));
  const sxy = sum(rows.map(([x, y]) => (x - meanX) * (y - meanY)));
  const syy = sum(rows.map(([, y]) => (y - meanY) ** 2));
  const w = sxy / sxx;
  const b = meanY - w * meanX;
  const predictions = rows.map(([x]) => w * x + b);
  const residuals = rows.map(([, y], i) => y - predictions[i]);
  const squaredErrors = residuals.map(value => value * value);
  const sse = sum(squaredErrors);
  const mse = sse / n;
  const gap = Math.min(...rows.slice(1).map((row, i) => row[0] - rows[i][0]));
  const externalX = Math.max(...rows.map(row => row[0])) + gap;
  const from = { x: meanX, y: meanX * w + b };
  const corner = { x: meanX + gap, y: from.y };
  const to = { x: meanX + gap, y: (meanX + gap) * w + b };
  const profile = rows.map((row, i) => {
    const weight = i * w / 2;
    const intercept = meanY - weight * meanX;
    return { x: weight, y: sum(rows.map(([x, y]) => (weight * x + intercept - y) ** 2)) / n };
  });
  return {
    constants: { zero: n - n, unit: n / n, two: n / n + n / n },
    counts: { rows: n, features: data.toyData.features.length },
    points: rows.map(([x, y]) => ({ x, y })),
    summary: { meanX, meanY, sxx, sxy, syy },
    fit: { w, b, predictions, residuals, squaredErrors, sse, mse,
      intercept: { x: 0, y: b },
      line: [{ x: 0, y: b }, { x: externalX, y: externalX * w + b }],
      slope: { from, corner, to, run: gap, rise: w * gap } },
    residualCost: { count: n, sum: sse, mean: mse, cumulativeSquares: squaredErrors.map((value, i) => sum(squaredErrors.slice(0, i + 1))) },
    costProfile: { coefficients: { a: sxx, b: -2 * sxy, c: syy, divisor: n }, points: profile, minimum: { x: w, y: mse } },
    axes: {
      scatter: { xMin: 0, xMax: externalX, yMin: 0, yMax: Math.max(...rows.map(row => row[1])) + gap },
      costProfile: { xMin: 0, xMax: Math.max(...profile.map(p => p.x)), yMin: 0, yMax: Math.max(...profile.map(p => p.y)) },
    },
  };
}
function lrOneElements(entry) {
  return [entry.spec, entry.detailSpec].filter(Boolean).reduce((total, wrapper) => {
    const diagram = wrapper.diagram;
    return total + (diagram.steps?.length || 0) + (diagram.bars?.length || 0) + (diagram.annotations?.length || 0)
      + (diagram.columns || []).reduce((n, column) => n + column.items.length, 0)
      + (diagram.series || []).reduce((n, series) => n + (series.points?.length || series.samples?.y?.length || 0), 0);
  }, 0);
}
test('linear-regression batch one independently recomputes every displayed arithmetic input', () => {
  const expected = lrOneIndependent();
  lrOneCompare(data.derived(), expected);
  const d = data.derived();
  lrOneNear(d.fit.slope.rise / d.fit.slope.run, d.fit.w);
  lrOneNear(d.fit.b, d.summary.meanY - d.fit.w * d.summary.meanX);
  lrOneNear(d.residualCost.mean, d.residualCost.sum / data.toyData.rows.length);
  lrOneNear(2 * d.costProfile.coefficients.a * d.fit.w + d.costProfile.coefficients.b, 0);
  assert.ok(d.costProfile.coefficients.a > 0);
});
test('linear-regression batch one has only independently checked display numbers', () => {
  const independentlyComputed = lrOneNumbers(lrOneIndependent());
  const available = lrOneNumbers(data.derived());
  const contains = (values, number, absolute = false) => values.some(value => Math.abs((absolute ? Math.abs(value) : value) - number) < 1e-10);
  function inspect(value) {
    if (typeof value === 'number') {
      assert.ok(contains(available, value), `Missing derived number ${value}`);
      assert.ok(contains(independentlyComputed, value), `Unrecomputed display number ${value}`);
    } else if (typeof value === 'string') {
      for (const match of value.matchAll(/\d+(?:\.\d+)?/g)) {
        const number = Number(match[0]);
        assert.ok(contains(available, number, true), `Missing derived label number ${number}`);
        assert.ok(contains(independentlyComputed, number, true), `Unrecomputed label number ${number}`);
      }
    } else if (value && typeof value === 'object') Object.values(value).forEach(inspect);
  }
  references.filter(r => lrOneIds.includes(r.id)).forEach(r => {
    [r.depths.overview, r.depths.standard, r.depths.deep].forEach(entry => {
      inspect(entry.spec.diagram);
      if (entry.detailSpec) inspect(entry.detailSpec.diagram);
    });
  });
});
test('linear-regression batch one preserves its own prompts, keywords, origins and depths', () => {
  const ownRows = replay.prompts.filter(row => lrOneIds.includes(row.referenceId));
  assert.strictEqual(ownRows.length, lrOneIds.length);
  ownRows.forEach(row => {
    const matches = references.filter(r => r.id === row.referenceId);
    assert.strictEqual(matches.length, 1);
    const r = matches[0];
    assert.ok(r.prompts.includes(row.prompt));
    assert.deepStrictEqual(r.paraphrases, row.paraphrases);
    assert.strictEqual(row.paraphrases.length, 5);
    assert.strictEqual(new Set(row.paraphrases).size, row.paraphrases.length);
    assert.ok(r.keywords.length >= 2 && r.keywords.length <= 3);
    assert.deepStrictEqual(r.shortKeywords, r.keywords);
    const corpus = [row.prompt, ...row.paraphrases].join(' ').toLowerCase();
    r.keywords.forEach(keyword => {
      assert.strictEqual(keyword, keyword.toLowerCase());
      assert.ok(keyword.split(/\s+/).length <= 3);
      assert.ok(corpus.includes(keyword), `Missing learner keyword ${keyword}`);
    });
    assert.deepStrictEqual(r.lessons, data.metadata.lessons);
    assert.deepStrictEqual(r.sources, data.metadata.sources);
    assert.strictEqual(r.origin, 'lesson');
    assert.ok(r.promptOrigins.some(origin => origin.prompt === row.prompt && origin.origin === 'lesson' && origin.lesson === data.metadata.lessons[0]));
    const expectedKind = row.referenceId === 'ml-linear-regression-training-loop' ? 'cycle' : 'coordinate-plot';
    [r.depths.overview, r.depths.standard, r.depths.deep].forEach(entry => assert.strictEqual(entry.spec.diagram.kind, expectedKind));
    assert.ok(lrOneElements(r.depths.overview) < lrOneElements(r.depths.standard));
    assert.notDeepStrictEqual(r.depths.deep, r.depths.standard);
    assert.ok(JSON.stringify(r.depths.deep).includes('frac'));
    references.filter(other => other.id !== r.id).forEach(other => assert.ok(!other.prompts.includes(row.prompt)));
  });
});
test('linear-regression residual cost adds arithmetic in the main Detailed visual', () => {
  const r = references.find(item => item.id === 'ml-linear-regression-residual-cost');
  assert.ok(r);
  const d = data.derived();
  const expected = lrOneIndependent();
  const balanced = r.depths.standard.spec.diagram;
  const detailed = r.depths.deep.spec.diagram;
  assert.ok(!balanced.caption.includes('frac'));
  assert.ok(detailed.caption.includes('frac'));
  assert.ok(detailed.caption.includes(String(d.residualCost.sum)));
  assert.ok(detailed.caption.includes(String(d.residualCost.count)));
  assert.ok(detailed.caption.includes(String(d.residualCost.mean)));
  lrOneNear(d.residualCost.sum, expected.fit.squaredErrors.reduce((sum, square) => sum + square, 0));
  lrOneNear(d.residualCost.count, data.toyData.rows.length);
  lrOneNear(d.residualCost.mean, expected.residualCost.sum / data.toyData.rows.length);
  assert.strictEqual(r.depths.deep.detailSpec.diagram.unit, '$\\mathrm{target}^2$');
  r.depths.deep.detailSpec.diagram.bars.forEach((bar, i) => lrOneNear(bar.value, expected.fit.residuals[i] ** 2));
});
test('linear-regression line meaning adds slope arithmetic in the main Detailed visual', () => {
  const r = references.find(item => item.id === 'ml-linear-regression-line-meaning');
  assert.ok(r);
  const d = data.derived();
  const expected = lrOneIndependent();
  const formula = `$w=${d.fit.slope.rise}/${d.fit.slope.run}=${d.fit.w}$`;
  assert.ok(r.depths.deep.spec.diagram.caption.includes(formula));
  assert.ok(!JSON.stringify(r.depths.standard.spec.diagram).includes(formula));
  lrOneNear(d.fit.slope.rise, expected.fit.slope.to.y - expected.fit.slope.from.y);
  lrOneNear(d.fit.slope.run, expected.fit.slope.to.x - expected.fit.slope.from.x);
  lrOneNear(d.fit.w, (expected.fit.slope.to.y - expected.fit.slope.from.y) / (expected.fit.slope.to.x - expected.fit.slope.from.x));
});
}
{
const lrB2Add = values => values.reduce((total, value) => total + value, 0);
function lrB2Check(actual, expected, path = 'display data') {
  if (typeof expected === 'number') {
    assert.strictEqual(typeof actual, 'number', path);
    assert.ok(Math.abs(actual - expected) <= 1e-10 * Math.max(1, Math.abs(expected)), `${path}: ${actual} versus ${expected}`);
  } else if (Array.isArray(expected)) {
    assert.strictEqual(actual.length, expected.length, path);
    expected.forEach((value, index) => lrB2Check(actual[index], value, `${path}[${index}]`));
  } else {
    Object.entries(expected).forEach(([key, value]) => lrB2Check(actual[key], value, `${path}.${key}`));
  }
}
function lrB2Numbers(value) {
  if (typeof value === 'number') return [value];
  if (!value || typeof value !== 'object') return [];
  return Object.values(value).flatMap(lrB2Numbers);
}
test('linear-regression batch recomputes every displayed gradient and solver value', () => {
  const d = { ...data.derived(), ...derived() };
  const rows = data.toyData.rows;
  const n = rows.length;
  const xs = rows.map(row => row[0]);
  const ys = rows.map(row => row[1]);
  const sx = lrB2Add(xs);
  const sy = lrB2Add(ys);
  const sxxRaw = lrB2Add(xs.map(x => x * x));
  const sxyRaw = lrB2Add(rows.map(([x, y]) => x * y));
  const mx = sx / n;
  const my = sy / n;
  const sxx = sxxRaw - sx * sx / n;
  const sxy = sxyRaw - sx * sy / n;
  const w = (n * sxyRaw - sx * sy) / (n * sxxRaw - sx * sx);
  const b = (sxxRaw * sy - sx * sxyRaw) / (n * sxxRaw - sx * sx);
  const dw = -2 * sxyRaw / n;
  const db = -2 * sy / n;
  const cost = (weight, intercept) => lrB2Add(rows.map(([x, y]) => (weight * x + intercept - y) ** 2)) / n;
  const initialCost = cost(0, 0);
  lrB2Check(d.constants, { zero: n - n, unit: n / n, two: 2 * n / n });
  lrB2Check(d.counts, { rows: n, features: data.toyData.features.length });
  lrB2Check(d.summary, { meanX: mx, meanY: my, sxx, sxy });
  lrB2Check(d.fit, { w, b });
  lrB2Check(d.gradient.initial, { w: 0, b: 0, predictions: rows.map(() => 0), errors: ys.map(y => -y), weightedErrors: rows.map(([x, y]) => -x * y), sumErrors: -sy, sumWeightedErrors: -sxyRaw, dw, db, mse: initialCost });
  const expectedRates = [1 / 100, 1 / 10];
  lrB2Check(d.gradient.rates, expectedRates);
  const costs = expectedRates.map(rate => cost(-rate * dw, -rate * db));
  d.gradient.steps.forEach((step, i) => {
    const rate = expectedRates[i];
    const nextW = -rate * dw;
    const nextB = -rate * db;
    const predictions = rows.map(([x]) => nextW * x + nextB);
    const errors = rows.map(([, y], index) => predictions[index] - y);
    const squares = errors.map(error => error * error);
    lrB2Check(step, { rate, step: 1, w: nextW, b: nextB, deltaW: nextW, deltaB: nextB, predictions, errors, squaredErrors: squares, sse: lrB2Add(squares), mse: costs[i], costChange: costs[i] - initialCost, trace: [{ x: 0, y: initialCost }, { x: 1, y: costs[i] }] });
  });
  lrB2Check(d.axes.weight, { xMin: 0, xMax: w + expectedRates[1], yMin: 0, yMax: 1 });
  lrB2Check(d.axes.learning, { xMin: 0, xMax: 1, yMin: 0, yMax: Math.ceil(Math.max(initialCost, ...costs)) });
  assert.ok(costs[0] < initialCost);
  assert.ok(costs[1] > initialCost);
  assert.ok(d.gradient.steps[1].w > w);
});
test('linear-regression scaling overlay recomputes illustrative geometry and normalization', () => {
  const d = { ...data.derived(), ...derived() };
  const xs = data.toyData.rows.map(row => row[0]);
  const n = xs.length;
  const meanX = lrB2Add(xs) / n;
  const range = Math.max(...xs) - Math.min(...xs);
  const normalized = xs.map(x => (x - Math.min(...xs)) / range);
  const mean = lrB2Add(normalized) / n;
  const variance = lrB2Add(normalized.map(x => x * x)) / n - mean * mean;
  const sd = Math.sqrt(variance);
  const curvature = Math.pow(2, meanX);
  const rawRate = 1 / n;
  const scaledRate = 1 / 2;
  lrB2Check(d.scaling, {
    mean, standardDeviation: sd, curvature, rawRate, scaledRate,
    rawIterations: n, scaledIterations: 2,
    rawPath: Array.from({ length: n + 1 }, (_, k) => ({ x: -meanX * (1 - rawRate) ** k, y: (1 - rawRate * curvature) ** k })),
    scaledPath: Array.from({ length: 3 }, (_, k) => ({ x: -meanX * (1 - scaledRate) ** k, y: (1 - scaledRate) ** k })),
    contours: [1, 2].map(radius => ({ radius, rawRadiusX: radius, rawRadiusY: Math.sqrt(radius * radius / curvature), scaledRadiusX: radius, scaledRadiusY: radius })),
  });
  lrB2Check(d.axes.scaling, { xMin: -range, xMax: range, yMin: -2, yMax: 2 });
  assert.strictEqual(d.scaling.illustrative, true);
  const overlay = references.find(ref => ref.id === 'ml-linear-regression-feature-scaling-overlay');
  assert.ok(overlay.useWhen.includes('gradient-descent-contours'));
  for (const level of ['overview', 'standard', 'deep']) {
    const depth = overlay.depths[level];
    for (const visual of [depth.spec, depth.detailSpec]) {
      assert.ok(visual.diagram.caption.startsWith('Illustrative'));
      assert.strictEqual(visual.diagram.kind, 'coordinate-plot');
    }
  }
});
test('batch prompts, short learner keywords, origins and depth kinds are retained', () => {
  const expected = [
    ['ml-linear-regression-first-gradient-step', ['gradient step', 'weight update', 'first epoch'], 'coordinate-plot'],
    ['ml-linear-regression-rate-comparison', ['learning rate', 'overshoot', 'divergence'], 'coordinate-plot'],
    ['ml-linear-regression-normal-equation', ['normal equation', 'closed form', 'complexity'], 'comparison'],
    ['ml-linear-regression-feature-scaling-overlay', ['feature scaling', 'standardization', 'elongated contours'], 'coordinate-plot'],
  ];
  for (const [id, keywords, kind] of expected) {
    const ref = references.find(item => item.id === id);
    const row = replay.prompts.find(item => item.referenceId === id);
    assert.ok(ref && row, id);
    assert.ok(ref.prompts.includes(row.prompt), id);
    assert.deepStrictEqual(ref.keywords, keywords);
    assert.deepStrictEqual(ref.shortKeywords, keywords);
    assert.deepStrictEqual(ref.lessons, data.metadata.lessons);
    assert.deepStrictEqual(ref.sources, data.metadata.sources);
    assert.ok(ref.promptOrigins.some(origin => origin.prompt === row.prompt && origin.origin === 'lesson' && origin.lesson === data.metadata.lessons[0]));
    assert.strictEqual(row.paraphrases.length, 5);
    assert.strictEqual(new Set(row.paraphrases).size, row.paraphrases.length);
    row.paraphrases.forEach(prompt => assert.ok(ref.prompts.includes(prompt)));
    keywords.forEach(keyword => {
      assert.strictEqual(keyword, keyword.toLowerCase());
      assert.ok(keyword.split(/\s+/u).length <= 3);
    });
    for (const level of ['overview', 'standard', 'deep']) assert.strictEqual(ref.depths[level].spec.diagram.kind, kind);
    assert.notDeepStrictEqual(ref.depths.overview, ref.depths.standard);
    assert.notDeepStrictEqual(ref.depths.deep, ref.depths.standard);
  }
});
test('every visual number is supplied by the shared derivation or batch derivation', () => {
  const computed = { ...data.derived(), ...derived() };
  const numericValues = lrB2Numbers(computed);
  const magnitudes = new Set(numericValues.map(Math.abs));
  const wanted = new Set(['ml-linear-regression-first-gradient-step', 'ml-linear-regression-rate-comparison', 'ml-linear-regression-normal-equation', 'ml-linear-regression-feature-scaling-overlay']);
  function inspect(value, key = '') {
    if (typeof value === 'number') {
      assert.ok(numericValues.includes(value), `Missing numeric value ${value}`);
    } else if (typeof value === 'string' && ['title', 'caption', 'label', 'heading', 'items', 'unit'].includes(key)) {
      for (const match of value.matchAll(/\d+(?:\.\d+)?(?:e[+-]?\d+)?/giu)) assert.ok(magnitudes.has(Number(match[0])), `Missing displayed magnitude ${match[0]}`);
    } else if (Array.isArray(value)) value.forEach(item => inspect(item, key));
    else if (value && typeof value === 'object') Object.entries(value).forEach(([childKey, item]) => inspect(item, childKey));
  }
  references.filter(ref => wanted.has(ref.id)).forEach(ref => {
    Object.values(ref.depths).forEach(depth => {
      inspect(depth.spec);
      if (depth.detailSpec) inspect(depth.detailSpec);
    });
  });
});
}
{
const finalReferenceIds = ['ml-linear-regression-polynomial-overfit', 'ml-linear-regression-r-squared', 'ml-linear-regression-ridge-shrinkage', 'ml-linear-regression-held-out-row'];
const finalKeywords = [['polynomial regression', 'overfitting', 'degree'], ['r-squared', 'explained variance', 'baseline mean'], ['ridge regression', 'l2 penalty', 'weight shrinkage'], ['train test split', 'held out', 'generalization']];
const finalNear = (actual, expected) => assert.ok(Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected)), `${actual} differs from ${expected}`);
const finalSum = xs => xs.reduce((a, b) => a + b, 0);
const finalNumbers = value => typeof value === 'number' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(finalNumbers) : [];
const finalSpecs = ref => [ref.depths.overview.spec, ref.spec, ref.depths.deep.spec, ref.depths.deep.detailSpec].filter(Boolean);

test('final linear regression references preserve their own prompt routing and origin metadata', () => {
  finalReferenceIds.forEach((id, index) => {
    const ref = references.find(item => item.id === id);
    const row = replay.prompts.find(item => item.referenceId === id);
    assert.ok(ref && row);
    assert.ok(ref.prompts.includes(row.prompt));
    assert.strictEqual(references.filter(item => item.prompts.includes(row.prompt)).length, 1);
    assert.deepStrictEqual(ref.keywords, finalKeywords[index]);
    assert.deepStrictEqual(ref.shortKeywords, ref.keywords);
    ref.keywords.forEach(keyword => {
      assert.strictEqual(keyword, keyword.toLowerCase());
      assert.ok(keyword.split(/\s+/).length <= 3);
      assert.ok(ref.shortKeywords.includes(keyword));
    });
    assert.strictEqual(row.paraphrases.length, 5);
    assert.strictEqual(new Set(row.paraphrases).size, 5);
    row.paraphrases.forEach(text => assert.ok(ref.prompts.includes(text)));
    assert.deepStrictEqual(ref.lessons, data.metadata.lessons);
    assert.deepStrictEqual(ref.sources, data.metadata.sources);
    assert.strictEqual(ref.origin, 'lesson');
    assert.strictEqual(ref.promptOrigins[0].prompt, row.prompt);
    assert.strictEqual(ref.promptOrigins[0].origin, 'lesson');
    assert.strictEqual(ref.promptOrigins[0].lesson, data.metadata.lessons[0]);
    const expectedKinds = ['coordinate-plot', 'bar-chart', 'coordinate-plot', 'sample-set'];
    [ref.depths.overview.spec, ref.spec, ref.depths.deep.spec].forEach(s => assert.strictEqual(s.diagram.kind, expectedKinds[index]));
  });
});

test('polynomial samples and every displayed extrapolation error are independently recomputed', () => {
  const d = data.derived();
  const rows = data.toyData.rows;
  const interpolate = x => finalSum(rows.map(([node, target], i) => target * rows.reduce((basis, [other], j) => i === j ? basis : basis * (x - other) / (node - other), 1)));
  assert.strictEqual(d.polynomial.degree, rows.length - 1);
  assert.strictEqual(d.polynomial.sampleCount, d.polynomial.samples.length);
  d.polynomial.samples.forEach(p => finalNear(p.y, interpolate(p.x)));
  rows.forEach(([x, y], i) => {
    finalNear(interpolate(x), y);
    finalNear(d.polynomial.trainPredictions[i], y);
  });
  finalNear(d.polynomial.trainMse, finalSum(rows.map(([x, y]) => (interpolate(x) - y) ** 2)) / rows.length);
  const mx = finalSum(rows.map(r => r[0])) / rows.length;
  const my = finalSum(rows.map(r => r[1])) / rows.length;
  const sxx = finalSum(rows.map(([x]) => (x - mx) ** 2));
  const sxy = finalSum(rows.map(([x, y]) => (x - mx) * (y - my)));
  const w = sxy / sxx;
  const b = my - w * mx;
  finalNear(d.fit.w, w);
  finalNear(d.fit.b, b);
  rows.forEach(([x], i) => finalNear(d.fit.predictions[i], w * x + b));
  const gap = Math.min(...rows.slice(1).map((r, i) => r[0] - rows[i][0]));
  const externalX = Math.max(...rows.map(r => r[0])) + gap;
  finalNear(d.polynomial.newPoint.x, externalX);
  finalNear(d.polynomial.newPoint.y, Math.round(w * externalX + b));
  finalNear(d.polynomial.linePrediction, w * externalX + b);
  finalNear(d.polynomial.polynomialPrediction, interpolate(externalX));
  finalNear(d.polynomial.lineSquaredError, (w * externalX + b - d.polynomial.newPoint.y) ** 2);
  finalNear(d.polynomial.polynomialSquaredError, (interpolate(externalX) - d.polynomial.newPoint.y) ** 2);
  finalNear(d.fit.mse, finalSum(rows.map(([x, y]) => (w * x + b - y) ** 2)) / rows.length);
  finalNear(d.axes.polynomial.xMin, Math.min(...rows.map(r => r[0])));
  finalNear(d.axes.polynomial.xMax, externalX);
  finalNear(d.axes.polynomial.yMin, rows.length - rows.length);
  finalNear(d.axes.polynomial.yMax, Math.ceil(Math.max(d.polynomial.newPoint.y, ...d.polynomial.samples.map(p => interpolate(p.x)))));
  const ref = references.find(r => r.id === finalReferenceIds[0]);
  const balanced = ref.spec.diagram;
  assert.deepStrictEqual(balanced.series[0].samples.y, rows.map(r => r[1]));
  assert.deepStrictEqual(balanced.series[2].samples.y, d.polynomial.samples.map(p => p.y));
  assert.deepStrictEqual(balanced.series[3].points, [d.polynomial.newPoint]);
  assert.ok(ref.depths.overview.spec.diagram.series.length < balanced.series.length);
  assert.ok(ref.depths.overview.spec.diagram.series[2].samples.y.length < balanced.series[2].samples.y.length);
  assert.notStrictEqual(ref.depths.deep.spec.diagram.caption, balanced.caption);
  assert.strictEqual(ref.depths.deep.spec.diagram.caption, `Illustrative error $(${d.polynomial.polynomialPrediction}-${d.polynomial.newPoint.y})^2=${d.polynomial.polynomialSquaredError}$.`);
  assert.ok(ref.depths.deep.detailSpec.diagram.caption.startsWith('Illustrative'));
  assert.strictEqual(d.polynomial.illustrative, true);
});

test('explained variance bars and reference cases follow the mean baseline arithmetic', () => {
  const d = data.derived();
  const rows = data.toyData.rows;
  const n = rows.length;
  const sx = finalSum(rows.map(r => r[0]));
  const sy = finalSum(rows.map(r => r[1]));
  const sxx = finalSum(rows.map(r => r[0] ** 2));
  const sxy = finalSum(rows.map(r => r[0] * r[1]));
  const w = (n * sxy - sx * sy) / (n * sxx - sx ** 2);
  const b = (sy - w * sx) / n;
  const total = finalSum(rows.map(([, y]) => (y - sy / n) ** 2));
  const residual = finalSum(rows.map(([x, y]) => (y - w * x - b) ** 2));
  finalNear(d.rSquared.baselineMean, sy / n);
  finalNear(d.rSquared.total, total);
  finalNear(d.rSquared.residual, residual);
  finalNear(d.rSquared.explained, total - residual);
  finalNear(d.rSquared.value, 1 - residual / total);
  finalNear(d.rSquared.perfect.sse, finalSum(rows.map(([, y]) => (y - y) ** 2)));
  finalNear(d.rSquared.perfect.value, 1 - d.rSquared.perfect.sse / total);
  finalNear(d.rSquared.baseline.sse, total);
  finalNear(d.rSquared.baseline.value, 1 - total / total);
  const ref = references.find(r => r.id === finalReferenceIds[1]);
  assert.deepStrictEqual(ref.spec.diagram.bars.map(bar => bar.value), [d.rSquared.total, d.rSquared.residual, d.rSquared.explained]);
  assert.ok(ref.depths.overview.spec.diagram.bars.length < ref.spec.diagram.bars.length);
  assert.notStrictEqual(ref.depths.deep.spec.diagram.caption, ref.spec.diagram.caption);
});

test('ridge plotted solutions use mean squared error and an unpenalized intercept', () => {
  const d = data.derived();
  const rows = data.toyData.rows;
  const n = rows.length;
  const mx = finalSum(rows.map(r => r[0])) / n;
  const my = finalSum(rows.map(r => r[1])) / n;
  const variance = finalSum(rows.map(([x]) => (x - mx) ** 2)) / n;
  const covariance = finalSum(rows.map(([x, y]) => (x - mx) * (y - my))) / n;
  finalNear(d.ridge.numerator, covariance);
  finalNear(d.ridge.denominator, variance);
  finalNear(d.summary.meanX, mx);
  finalNear(d.summary.meanY, my);
  const expectedLambdas = [n - n, n / n, (n / n) * 2, ((n / n) * 2) ** 2];
  assert.deepStrictEqual(d.ridge.points.map(p => p.x), expectedLambdas);
  d.ridge.points.forEach(({ x: lambda, y: weight }, i) => {
    finalNear(weight, covariance / (variance + lambda));
    const intercept = my - weight * mx;
    finalNear(d.ridge.intercepts[i], intercept);
    finalNear(finalSum(rows.map(([x, y]) => weight * x + intercept - y)) / n, 0);
    finalNear(finalSum(rows.map(([x, y]) => (weight * x + intercept - y) * x)) / n + lambda * weight, 0);
  });
  finalNear(d.ridge.asymptote, n - n);
  finalNear(d.axes.ridge.xMin, n - n);
  finalNear(d.axes.ridge.xMax, Math.max(...expectedLambdas));
  finalNear(d.axes.ridge.yMin, n - n);
  finalNear(d.axes.ridge.yMax, covariance / variance);
  const ref = references.find(r => r.id === finalReferenceIds[2]);
  assert.deepStrictEqual(ref.spec.diagram.series[0].points.map(({ x, y }) => ({ x, y })), d.ridge.points);
  assert.ok(ref.depths.overview.spec.diagram.series[0].points.length < ref.spec.diagram.series[0].points.length);
  assert.notStrictEqual(ref.depths.deep.spec.diagram.caption, ref.spec.diagram.caption);
});

test('holdout membership, fitted coefficients and test squared error are recomputed without leakage', () => {
  const d = data.derived();
  const train = data.toyData.rows.slice(0, -1);
  const held = data.toyData.rows.slice(-1);
  const n = train.length;
  const mx = finalSum(train.map(r => r[0])) / n;
  const my = finalSum(train.map(r => r[1])) / n;
  const sxx = finalSum(train.map(([x]) => (x - mx) ** 2));
  const sxy = finalSum(train.map(([x, y]) => (x - mx) * (y - my)));
  const w = sxy / sxx;
  const b = my - w * mx;
  finalNear(d.holdout.trainCount, n);
  finalNear(d.holdout.testCount, held.length);
  finalNear(d.holdout.summary.meanX, mx);
  finalNear(d.holdout.summary.meanY, my);
  finalNear(d.holdout.summary.sxx, sxx);
  finalNear(d.holdout.summary.sxy, sxy);
  finalNear(d.holdout.w, w);
  finalNear(d.holdout.b, b);
  held.forEach(([x, y], i) => {
    finalNear(d.holdout.testPredictions[i], w * x + b);
    finalNear(d.holdout.testSquaredErrors[i], (w * x + b - y) ** 2);
  });
  finalNear(d.holdout.testMse, finalSum(held.map(([x, y]) => (w * x + b - y) ** 2)) / held.length);
  const ref = references.find(r => r.id === finalReferenceIds[3]);
  const diagram = ref.spec.diagram;
  assert.deepStrictEqual(diagram.samples.map(p => p.id), d.points.map(p => p.id));
  diagram.samples.forEach((sample, i) => assert.strictEqual(sample.label, `$(${data.toyData.rows[i][0]},${data.toyData.rows[i][1]})$`));
  assert.deepStrictEqual(diagram.groups[0].members, d.points.slice(0, -1).map(p => p.id));
  assert.deepStrictEqual(diagram.groups[1].members, d.points.slice(-1).map(p => p.id));
  diagram.groups[0].members.forEach(id => assert.ok(!diagram.groups[1].members.includes(id)));
  assert.ok(ref.depths.overview.spec.diagram.samples.length < diagram.samples.length);
  assert.notStrictEqual(ref.depths.deep.spec.diagram.caption, diagram.caption);
});

test('every displayed numeric field and label number is available from the shared derived results', () => {
  const values = finalNumbers(data.derived());
  const check = value => {
    if (typeof value === 'number') {
      assert.ok(values.some(expected => Math.abs(value - expected) < 1e-9), `Unproduced display number: ${value}`);
    } else if (typeof value === 'string') {
      const tokens = value.match(/\d+(?:\.\d+)?/g) || [];
      tokens.forEach(token => assert.ok(values.some(expected => Math.abs(Math.abs(expected) - Number(token)) < 1e-9), `Unproduced label number: ${token}`));
    } else if (value && typeof value === 'object') {
      Object.values(value).forEach(check);
    }
  };
  finalReferenceIds.forEach(id => finalSpecs(references.find(ref => ref.id === id)).forEach(s => check(s.diagram)));
});
}
