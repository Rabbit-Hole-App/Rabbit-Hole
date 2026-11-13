import test from 'node:test';
import assert from 'node:assert';
import { toyData, metadata, derived } from './topic-linear-regression-data.js';

const add = values => values.reduce((accumulator, value) => accumulator + value, 0);
const average = values => add(values) / values.length;
const xy = (x, y) => ({ x, y });

function moments(rows) {
  const count = rows.length;
  const xs = rows.map(row => row[0]);
  const ys = rows.map(row => row[1]);
  const sumX = add(xs);
  const sumY = add(ys);
  const sumXX = add(xs.map(value => value * value));
  const sumXY = add(rows.map(row => row[0] * row[1]));
  const sumYY = add(ys.map(value => value * value));
  const sxx = sumXX - sumX * sumX / count;
  const sxy = sumXY - sumX * sumY / count;
  const syy = sumYY - sumY * sumY / count;
  return {
    sumX, sumY, sumXX, sumXY, sumYY,
    meanX: sumX / count, meanY: sumY / count,
    sxx, sxy, syy,
    varianceX: sxx / count, varianceY: syy / count, covarianceXY: sxy / count,
    minX: [...xs].sort((a, b) => a - b)[0],
    maxX: [...xs].sort((a, b) => b - a)[0],
    minY: [...ys].sort((a, b) => a - b)[0],
    maxY: [...ys].sort((a, b) => b - a)[0],
  };
}

function normalSolve(rows) {
  const s = moments(rows);
  const determinant = rows.length * s.sumXX - s.sumX * s.sumX;
  return {
    w: (rows.length * s.sumXY - s.sumX * s.sumY) / determinant,
    b: (s.sumXX * s.sumY - s.sumX * s.sumXY) / determinant,
  };
}

function errorsFor(rows, weight, intercept) {
  const predictions = rows.map(row => intercept + row[0] * weight);
  const residuals = rows.map((row, i) => row[1] - predictions[i]);
  const squaredErrors = residuals.map(value => value * value);
  return { predictions, residuals, squaredErrors, sse: add(squaredErrors), mse: average(squaredErrors) };
}

function lagrange(rows, x) {
  return add(rows.map(([node, target], i) => {
    let basis = 1;
    rows.forEach(([other], j) => { if (i !== j) basis *= (x - other) / (node - other); });
    return target * basis;
  }));
}

function independentResults() {
  const rows = toyData.rows;
  const n = rows.length;
  const f = toyData.features.length;
  const s = moments(rows);
  const { w, b } = normalSolve(rows);
  const scored = errorsFor(rows, w, b);
  const xs = rows.map(row => row[0]).sort((a, b) => a - b);
  const gap = Math.min(...xs.slice(1).map((value, i) => value - xs[i]));
  const externalX = xs.at(-1) + gap;
  const points = rows.map(([x, y], i) => ({ id: String.fromCharCode(65 + i), x, y }));
  const from = xy(s.meanX, s.meanX * w + b);
  const corner = xy(s.meanX + gap, from.y);
  const to = xy(s.meanX + gap, (s.meanX + gap) * w + b);
  const fit = {
    w, b, ...scored,
    intercept: xy(0, b),
    line: [xy(0, b), xy(externalX, externalX * w + b)],
    slope: { from, corner, to, run: gap, rise: w * gap },
  };
  const cumulativeSquares = scored.squaredErrors.map((value, i) => add(scored.squaredErrors.slice(0, i + 1)));
  const weights = rows.map((row, i) => w * i / 2);
  const profilePoints = weights.map(weight => xy(weight, (s.sxx * weight * weight - 2 * s.sxy * weight + s.syy) / n));
  const costProfile = {
    coefficients: { a: s.sxx, b: -2 * s.sxy, c: s.syy, divisor: n },
    points: profilePoints,
    intercepts: weights.map(weight => (s.sumY - weight * s.sumX) / n),
    minimum: xy(w, scored.mse), curvature: 2 * s.sxx / n,
  };
  const initial = {
    w: 0, b: 0, predictions: rows.map(() => 0),
    errors: rows.map(row => -row[1]),
    weightedErrors: rows.map(row => -row[0] * row[1]),
    sumErrors: -s.sumY, sumWeightedErrors: -s.sumXY,
    dw: -2 * s.sumXY / n, db: -2 * s.sumY / n,
    mse: s.sumYY / n,
  };
  const rates = [1 / 100, 1 / 10];
  const steps = rates.map(rate => {
    const nextW = rate * 2 * s.sumXY / n;
    const nextB = rate * 2 * s.sumY / n;
    const next = errorsFor(rows, nextW, nextB);
    return {
      rate, step: 1, w: nextW, b: nextB, deltaW: nextW, deltaB: nextB,
      predictions: next.predictions,
      errors: rows.map((row, i) => next.predictions[i] - row[1]),
      squaredErrors: next.squaredErrors, sse: next.sse, mse: next.mse,
      costChange: next.mse - initial.mse,
      trace: [xy(0, initial.mse), xy(1, next.mse)],
    };
  });
  const gradient = { initial, rates, steps };
  const span = Math.pow(10, n + f);
  const normalized = rows.map(row => (row[0] - xs[0]) / (xs.at(-1) - xs[0]));
  const scaleMean = average(normalized);
  const scaleSd = Math.sqrt(add(normalized.map(value => value * value)) / n - scaleMean * scaleMean);
  const curvature = Math.pow(2, s.meanX);
  const rawRate = 1 / n;
  const scaledRate = 1 / 2;
  const scaling = {
    illustrative: true, smallSpan: 1, largeSpan: span,
    normalized, largeFeature: normalized.map(value => value * span),
    mean: scaleMean, standardDeviation: scaleSd,
    largeMean: average(normalized.map(value => value * span)),
    largeStandardDeviation: Math.sqrt(average(normalized.map(value => (value * span - scaleMean * span) ** 2))),
    standardized: normalized.map(value => (value - scaleMean) / scaleSd),
    curvature, rawRate, scaledRate, rawIterations: n, scaledIterations: 2,
    rawPath: Array.from({ length: n + 1 }, (_, k) => xy(-s.meanX * (1 - rawRate) ** k, (1 - curvature * rawRate) ** k)),
    scaledPath: Array.from({ length: 3 }, (_, k) => xy(-s.meanX * (1 - scaledRate) ** k, (1 - scaledRate) ** k)),
    contours: [1, 2].map(radius => ({ radius, rawRadiusX: radius, rawRadiusY: Math.sqrt(radius * radius / curvature), scaledRadiusX: radius, scaledRadiusY: radius })),
  };
  const sampleStep = gap / 2;
  const samples = [];
  for (let x = xs[0]; x <= externalX; x += sampleStep) samples.push(xy(x, lagrange(rows, x)));
  const coefficients = rows.map((row, order) => {
    const prefix = rows.slice(0, order + 1);
    return add(prefix.map(([node, target], i) => {
      let denominator = 1;
      prefix.forEach(([other], j) => { if (i !== j) denominator *= node - other; });
      return target / denominator;
    }));
  });
  const polynomialTrainPredictions = rows.map(([x]) => lagrange(rows, x));
  const linePrediction = externalX * w + b;
  const polynomialPrediction = lagrange(rows, externalX);
  const newPoint = xy(externalX, Math.round(linePrediction));
  const polynomial = {
    illustrative: true, degree: n - 1, coefficients, nodes: rows.map(row => row[0]),
    sampleStep, sampleCount: samples.length, samples,
    trainPredictions: polynomialTrainPredictions,
    trainMse: average(rows.map((row, i) => (polynomialTrainPredictions[i] - row[1]) ** 2)),
    newPoint, linePrediction, polynomialPrediction,
    lineSquaredError: (linePrediction - newPoint.y) ** 2,
    polynomialSquaredError: (polynomialPrediction - newPoint.y) ** 2,
  };
  const deviations = rows.map(row => row[1] - s.sumY / n);
  const squaredDeviations = deviations.map(value => value * value);
  const total = s.sumYY - s.sumY * s.sumY / n;
  const rSquared = {
    baselineMean: s.sumY / n, deviations, squaredDeviations, total,
    residual: scored.sse, explained: total - scored.sse,
    unexplainedFraction: scored.sse / total, value: (total - scored.sse) / total,
    perfect: { sse: 0, value: 1 }, baseline: { sse: total, value: 0 },
  };
  const lambdas = [0, 1, 2, 4];
  const ridgePoints = lambdas.map(lambda => xy(lambda, (n * s.sumXY - s.sumX * s.sumY) / (n * s.sumXX - s.sumX * s.sumX + n * n * lambda)));
  const ridgeIntercepts = ridgePoints.map(({ y }) => (s.sumY - y * s.sumX) / n);
  const ridgeMse = ridgePoints.map(({ y }, i) => average(rows.map(([x, target]) => (target - y * x - ridgeIntercepts[i]) ** 2)));
  const penalties = ridgePoints.map(({ x, y }) => x * y * y);
  const ridge = {
    numerator: (s.sumXY - s.sumX * s.sumY / n) / n,
    denominator: (s.sumXX - s.sumX * s.sumX / n) / n,
    points: ridgePoints, intercepts: ridgeIntercepts, mse: ridgeMse, penalties,
    costs: ridgeMse.map((value, i) => value + penalties[i]), asymptote: 0,
  };
  const train = rows.filter((row, i) => i < n - 1);
  const held = rows.filter((row, i) => i === n - 1);
  const trainFit = normalSolve(train);
  const trainScore = errorsFor(train, trainFit.w, trainFit.b);
  const testScore = errorsFor(held, trainFit.w, trainFit.b);
  const holdout = {
    trainIds: points.filter((row, i) => i < n - 1).map(row => row.id),
    testIds: points.filter((row, i) => i === n - 1).map(row => row.id),
    trainCount: train.length, testCount: held.length,
    summary: moments(train), w: trainFit.w, b: trainFit.b,
    trainPredictions: trainScore.predictions, trainResiduals: trainScore.residuals,
    trainSquaredErrors: trainScore.squaredErrors, trainMse: trainScore.mse,
    testPredictions: testScore.predictions, testResiduals: testScore.residuals,
    testSquaredErrors: testScore.squaredErrors, testMse: testScore.mse,
  };
  const axes = {
    scatter: { xMin: 0, xMax: externalX, yMin: 0, yMax: s.maxY + gap },
    weight: { xMin: 0, xMax: w + rates[1], yMin: 0, yMax: 1 },
    costProfile: { xMin: 0, xMax: Math.max(...weights), yMin: 0, yMax: Math.max(...profilePoints.map(p => p.y)) },
    learning: { xMin: 0, xMax: 1, yMin: 0, yMax: Math.ceil(Math.max(initial.mse, ...steps.map(step => step.mse))) },
    scaling: { xMin: xs[0] - xs.at(-1), xMax: xs.at(-1) - xs[0], yMin: -2, yMax: 2 },
    polynomial: { xMin: xs[0], xMax: externalX, yMin: 0, yMax: Math.ceil(Math.max(newPoint.y, ...samples.map(p => p.y))) },
    ridge: { xMin: 0, xMax: lambdas.at(-1), yMin: 0, yMax: w },
    rSquared: { xMin: 0, xMax: 2, yMin: 0, yMax: total },
  };
  return {
    constants: { zero: 0, unit: 1, two: 2 },
    counts: { rows: n, features: f }, points, summary: s, fit,
    residualCost: { cumulativeSquares, count: n, sum: scored.sse, mean: scored.mse },
    costProfile, gradient, scaling, polynomial, rSquared, ridge, holdout, axes,
  };
}

function compare(actual, expected, path = 'derived') {
  if (typeof expected === 'number') {
    assert.strictEqual(typeof actual, 'number', path);
    assert.ok(Number.isFinite(actual), path);
    assert.ok(Math.abs(actual - expected) <= 1e-10 * Math.max(1, Math.abs(expected)), `${path}: ${actual} differs from ${expected}`);
    return;
  }
  if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual), path);
    assert.strictEqual(actual.length, expected.length, path);
    expected.forEach((value, i) => compare(actual[i], value, `${path}[${i}]`));
    return;
  }
  if (expected && typeof expected === 'object') {
    assert.deepStrictEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), path);
    Object.entries(expected).forEach(([key, value]) => compare(actual[key], value, `${path}.${key}`));
    return;
  }
  assert.strictEqual(actual, expected, path);
}

function numericPaths(value, path = '') {
  if (typeof value === 'number') return [path];
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, item]) => numericPaths(item, `${path}.${key}`));
}

test('the shared toy data and topic metadata retain their supplied structure', () => {
  assert.ok(toyData.rows.length <= 10);
  assert.ok(toyData.features.length <= 2);
  assert.strictEqual(toyData.features[0], 'x');
  assert.strictEqual(toyData.label, 'y');
  toyData.rows.forEach(row => {
    assert.strictEqual(row.length, toyData.features.length + 1);
    row.forEach(value => assert.ok(Number.isFinite(value)));
  });
  assert.strictEqual(metadata.topic, 'linear-regression');
  assert.strictEqual(metadata.artifactTopic, metadata.topic);
  assert.strictEqual(metadata.title, 'Linear Regression');
  assert.deepStrictEqual(metadata.lessons, ['02']);
  assert.strictEqual(metadata.sources.length, 1);
  assert.strictEqual(metadata.sources[0].kind, 'curriculum');
  assert.ok(metadata.sources[0].path.endsWith('/02-linear-regression/docs/en.md'));
  assert.match(metadata.sources[0].revision, /^[a-f0-9]{40}$/);
  assert.strictEqual(metadata.briefLink, null);
  assert.deepStrictEqual(toyData.usedBy, Array.from({ length: 12 }, (_, i) => i + 1).filter(id => id !== 4 && id !== 8));
});

test('every available display number has a complete independent arithmetic recomputation', () => {
  const actual = derived();
  const expected = independentResults();
  assert.deepStrictEqual(numericPaths(actual).sort(), numericPaths(expected).sort());
  compare(actual, expected);
  assert.deepStrictEqual(derived(), actual);
});

test('least squares residuals are orthogonal to the intercept and input', () => {
  const d = derived();
  compare(add(d.fit.residuals), 0);
  compare(add(d.fit.residuals.map((error, i) => error * toyData.rows[i][0])), 0);
  compare(d.fit.mse, add(d.fit.squaredErrors) / toyData.rows.length);
  compare(d.residualCost.cumulativeSquares.at(-1), d.fit.sse);
  compare(d.fit.slope.rise / d.fit.slope.run, d.fit.w);
  compare(d.costProfile.minimum.y, d.fit.mse);
  compare(2 * d.costProfile.coefficients.a * d.fit.w + d.costProfile.coefficients.b, 0);
});

test('the simultaneous first gradient updates agree with a direct loss calculation', () => {
  const d = derived();
  const loss = (weight, intercept) => average(toyData.rows.map(([x, y]) => (weight * x + intercept - y) ** 2));
  const h = 1 / 10000;
  compare((loss(h, 0) - loss(-h, 0)) / (2 * h), d.gradient.initial.dw);
  compare((loss(0, h) - loss(0, -h)) / (2 * h), d.gradient.initial.db);
  d.gradient.steps.forEach(step => {
    compare(step.w, d.gradient.initial.w - step.rate * d.gradient.initial.dw);
    compare(step.b, d.gradient.initial.b - step.rate * d.gradient.initial.db);
    compare(step.mse, loss(step.w, step.b));
  });
  assert.ok(d.gradient.steps[0].mse < d.gradient.initial.mse);
  assert.ok(d.gradient.steps[1].mse > d.gradient.initial.mse);
  assert.ok(d.gradient.steps[1].w > d.fit.w);
});

test('ridge stationarity uses mean loss and leaves the intercept unpenalized', () => {
  const d = derived();
  d.ridge.points.forEach(({ x: lambda, y: weight }, i) => {
    const intercept = d.ridge.intercepts[i];
    const errors = toyData.rows.map(([x, y]) => weight * x + intercept - y);
    compare(average(errors), 0);
    compare(average(errors.map((error, j) => error * toyData.rows[j][0])) + lambda * weight, 0);
    compare(d.ridge.costs[i], average(errors.map(error => error * error)) + lambda * weight * weight);
    if (i) assert.ok(weight < d.ridge.points[i - 1].y);
  });
});

test('the polynomial interpolates training rows but its new target is explicitly illustrative', () => {
  const d = derived();
  toyData.rows.forEach((row, i) => compare(d.polynomial.trainPredictions[i], row[1]));
  compare(d.polynomial.trainMse, 0);
  assert.strictEqual(d.polynomial.illustrative, true);
  assert.ok(d.polynomial.newPoint.x > Math.max(...toyData.rows.map(row => row[0])));
  assert.ok(d.polynomial.polynomialSquaredError > d.polynomial.lineSquaredError);
  assert.strictEqual(d.scaling.illustrative, true);
  compare(average(d.scaling.standardized), 0);
  compare(average(d.scaling.standardized.map(value => value * value)), 1);
});

test('the held-out row does not affect the training solution or its summary', () => {
  const d = derived();
  const training = toyData.rows.slice(0, -1);
  const held = toyData.rows.at(-1);
  const independentFit = normalSolve(training);
  compare(d.holdout.w, independentFit.w);
  compare(d.holdout.b, independentFit.b);
  compare(d.holdout.summary, moments(training));
  compare(d.holdout.testPredictions[0], independentFit.w * held[0] + independentFit.b);
  compare(d.holdout.testMse, (d.holdout.testPredictions[0] - held[1]) ** 2);
  assert.ok(!d.holdout.trainIds.includes(d.holdout.testIds[0]));
  assert.strictEqual(d.holdout.trainCount + d.holdout.testCount, toyData.rows.length);
  assert.notStrictEqual(d.holdout.w, d.fit.w);
});
