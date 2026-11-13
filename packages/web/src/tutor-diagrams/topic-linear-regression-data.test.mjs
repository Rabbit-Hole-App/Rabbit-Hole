import test from 'node:test';
import assert from 'node:assert';
import { toyData, metadata, derived } from './topic-linear-regression-data.js';

const total = values => values.reduce((a, b) => a + b, 0);

function moments(rows) {
  const n = rows.length;
  const sumX = total(rows.map(row => row[0]));
  const sumY = total(rows.map(row => row[1]));
  const sumXX = total(rows.map(row => row[0] ** 2));
  const sumXY = total(rows.map(row => row[0] * row[1]));
  const sumYY = total(rows.map(row => row[1] ** 2));
  return {
    n, sumX, sumY, sumXX, sumXY, sumYY,
    meanX: sumX / n,
    meanY: sumY / n,
    centeredX: rows.map(row => row[0] - sumX / n),
    centeredY: rows.map(row => row[1] - sumY / n),
    sxx: sumXX - sumX ** 2 / n,
    sxy: sumXY - sumX * sumY / n,
    syy: sumYY - sumY ** 2 / n,
  };
}

function solve(rows) {
  const m = moments(rows);
  const determinant = m.n * m.sumXX - m.sumX ** 2;
  return {
    w: (m.n * m.sumXY - m.sumX * m.sumY) / determinant,
    b: (m.sumXX * m.sumY - m.sumX * m.sumXY) / determinant,
  };
}

function score(rows, w, b) {
  const predictions = [];
  const residuals = [];
  const squares = [];
  for (const [x, y] of rows) {
    const prediction = x * w + b;
    predictions.push(prediction);
    residuals.push(y - prediction);
    squares.push((y - prediction) ** 2);
  }
  const sse = total(squares);
  return { predictions, residuals, squares, sse, mse: sse / rows.length };
}

function lagrange(rows, x) {
  return total(rows.map(([xi, yi], i) => {
    let term = yi;
    rows.forEach(([xj], j) => { if (i !== j) term *= (x - xj) / (xi - xj); });
    return term;
  }));
}

function forwardCoefficients(rows) {
  let differences = rows.map(row => row[1]);
  const h = rows[1][0] - rows[0][0];
  let factorial = 1;
  const coefficients = [];
  for (let order = 0; order < rows.length; order += 1) {
    if (order > 0) factorial *= order;
    coefficients.push(differences[0] / (factorial * h ** order));
    differences = differences.slice(1).map((value, i) => value - differences[i]);
  }
  return coefficients;
}

function iterativePath(hessian, rate, start, count) {
  const points = [];
  let [x, y] = start;
  for (let i = 0; i < count; i += 1) {
    points.push({ x, y });
    x -= rate * hessian[0] * x;
    y -= rate * hessian[1] * y;
  }
  return points;
}

function independentResults() {
  const rows = toyData.rows;
  const n = rows.length;
  const zero = n - n;
  const one = toyData.features.length;
  const two = one + one;
  const million = 10 ** 6;
  const points = rows.map(([x, y], index) => ({ id: String.fromCharCode(65 + index), x, y }));
  const summary = moments(rows);
  const { w, b } = solve(rows);
  const loss = score(rows, w, b);
  const baseline = { prediction: summary.meanY, ...score(rows, zero, summary.meanY) };
  const xs = rows.map(row => row[0]);
  const extensionX = Math.max(...xs) + one;
  const line = [{ x: zero, y: b }, { x: extensionX, y: extensionX * w + b }];
  const from = { x: summary.meanX, y: summary.meanY };
  const corner = { x: summary.meanX + one, y: summary.meanY };
  const to = { x: corner.x, y: summary.meanY + w * one };
  const fit = {
    w, b, ...loss, baseline,
    explainedSse: summary.syy - loss.sse,
    rSquared: summary.sxy ** 2 / (summary.sxx * summary.syy),
    unexplainedFraction: loss.sse / summary.syy,
    benchmarks: { perfectR2: one, meanR2: zero, perfectSse: zero, meanSse: summary.syy },
    intercept: { x: zero, y: b },
    triangle: { from, corner, to, run: one, rise: w * one },
    line,
  };
  const profileSamples = rows.map((row, index) => {
    const slope = w * index / two;
    const intercept = total(rows.map(([x, y]) => y - slope * x)) / n;
    return { w: slope, b: intercept, mse: score(rows, slope, intercept).mse };
  });
  const profile = {
    numerator: { quadratic: summary.sxx, linear: -two * summary.sxy, constant: summary.syy },
    divisor: n,
    curvature: two * (summary.sumXX / n - summary.meanX ** 2),
    samples: profileSamples,
  };
  const initialLoss = score(rows, zero, zero);
  const errors = rows.map(([, y]) => -y);
  const weightedErrors = rows.map(([x, y]) => -x * y);
  const sumErrors = -summary.sumY;
  const sumWeightedErrors = -summary.sumXY;
  const dw = -two * summary.sumXY / n;
  const db = -two * summary.sumY / n;
  const learningRates = [one / 100, one / 10];
  const steps = learningRates.map(rate => {
    const stepW = rate * two * summary.sumXY / n;
    const stepB = rate * two * summary.sumY / n;
    return { rate, step: one, w: stepW, b: stepB, deltaW: stepW, deltaB: stepB, ...score(rows, stepW, stepB) };
  });
  const descent = {
    learningRates,
    start: { w: zero, b: zero, ...initialLoss, errors, weightedErrors, sumErrors, sumWeightedErrors, dw, db },
    steps,
  };
  const ridgeSamples = [zero, one, two, n - one].map(lambda => {
    const ridgeW = (n * summary.sumXY - summary.sumX * summary.sumY) / (n * summary.sumXX - summary.sumX ** 2 + n ** 2 * lambda);
    const ridgeB = (summary.sumY - ridgeW * summary.sumX) / n;
    const mse = score(rows, ridgeW, ridgeB).mse;
    const penalty = lambda * ridgeW * ridgeW;
    return { lambda, w: ridgeW, b: ridgeB, mse, penalty, cost: mse + penalty };
  });
  const ridge = {
    numerator: summary.sumXY / n - summary.meanX * summary.meanY,
    denominatorBase: summary.sumXX / n - summary.meanX ** 2,
    asymptote: zero,
    samples: ridgeSamples,
  };
  const training = rows.filter((row, index) => index < n - one);
  const testing = rows.filter((row, index) => index >= n - one);
  const trainFit = solve(training);
  const trainLoss = score(training, trainFit.w, trainFit.b);
  const testLoss = score(testing, trainFit.w, trainFit.b);
  const holdout = {
    trainIds: points.filter((point, index) => index < n - one).map(point => point.id),
    testIds: points.filter((point, index) => index >= n - one).map(point => point.id),
    summary: moments(training),
    w: trainFit.w, b: trainFit.b,
    trainLoss, testLoss,
    prediction: trainFit.w * testing[0][0] + trainFit.b,
    actual: testing[0][1],
    residual: testing[0][1] - testLoss.predictions[0],
    squaredError: (testing[0][1] - testLoss.predictions[0]) ** 2,
    testMse: total(testLoss.squares) / testing.length,
  };
  const sampleCount = two * n + one + two;
  const polynomialSamples = Array.from({ length: sampleCount }, (_, index) => {
    const x = extensionX * index / (sampleCount - one);
    return { x, y: lagrange(rows, x) };
  });
  const fittedValues = xs.map(x => lagrange(rows, x));
  const trainSse = total(fittedValues.map((value, index) => (value - rows[index][1]) ** 2));
  const illustrativeY = extensionX * w + b;
  const extrapolated = lagrange(rows, extensionX);
  const polynomial = {
    illustrative: true,
    degree: rows.length - one,
    knots: xs,
    coefficients: forwardCoefficients(rows),
    samples: polynomialSamples,
    fittedValues,
    trainSse,
    trainMse: trainSse / n,
    newPoint: {
      x: extensionX, y: illustrativeY,
      linePrediction: illustrativeY,
      polynomialPrediction: extrapolated,
      lineSquaredError: zero,
      polynomialSquaredError: (extrapolated - illustrativeY) ** 2,
    },
  };
  const minX = Math.min(...xs);
  const spanX = Math.max(...xs) - minX;
  const minResidual = Math.min(...loss.residuals);
  const spanResidual = Math.max(...loss.residuals) - minResidual;
  const scalingRows = rows.map(([x, y]) => [
    (x - minX) / spanX,
    ((y - (w * x + b)) - minResidual) / spanResidual * million,
  ]);
  const columns = [scalingRows.map(row => row[0]), scalingRows.map(row => row[1])];
  const means = columns.map(column => total(column) / n);
  const standardDeviations = columns.map((column, index) => Math.sqrt(total(column.map(value => (value - means[index]) ** 2)) / n));
  const standardized = scalingRows.map(row => row.map((value, index) => (value - means[index]) / standardDeviations[index]));
  const radiusX = spanX / two;
  const radiusY = one / two;
  const rawHessian = [one, radiusX ** 2 / radiusY ** 2];
  const scaledHessian = [one, one];
  const rawRate = (two - one / n) / rawHessian[1];
  const scaledRate = one - one / (two * n);
  const start = [-summary.meanX / two, two / n];
  const scaling = {
    illustrative: true,
    geometry: 'Schematic contours and paths; synthesized features reuse the toy rows.',
    rows: scalingRows,
    featureCount: columns.length,
    ranges: columns.map(column => [Math.min(...column), Math.max(...column)]),
    means, standardDeviations, standardized,
    rawContour: { radiusX, radiusY },
    scaledContour: { radiusX, radiusY: radiusX },
    rawDescent: { hessian: rawHessian, rate: rawRate, points: iterativePath(rawHessian, rawRate, start, n - one) },
    scaledDescent: { hessian: scaledHessian, rate: scaledRate, points: iterativePath(scaledHessian, scaledRate, start, n - one) },
  };
  const axes = {
    toy: { xMin: zero, xMax: extensionX, yMin: zero, yMax: Math.ceil(Math.max(...rows.map(row => row[1]), ...line.map(point => point.y))) },
    profile: { xMin: zero, xMax: Math.max(...profileSamples.map(sample => sample.w)), yMin: zero, yMax: Math.max(...profileSamples.map(sample => sample.mse)) },
    weight: { min: zero, max: w + learningRates.at(-1) },
    learningCost: { xMin: zero, xMax: one, yMin: zero, yMax: Math.ceil(Math.max(initialLoss.mse, ...steps.map(step => step.mse))) },
    ridge: { xMin: zero, xMax: Math.max(...ridgeSamples.map(sample => sample.lambda)), yMin: zero, yMax: w },
    polynomial: { xMin: zero, xMax: extensionX, yMin: zero, yMax: Math.ceil(Math.max(...polynomialSamples.map(point => point.y), illustrativeY)) },
    contours: { xMin: -radiusX, xMax: radiusX, yMin: -radiusX, yMax: radiusX },
    errorTotals: { min: zero, max: summary.syy },
  };
  return {
    constants: { zero, one, two, million },
    points,
    counts: { rows: n, features: toyData.features.length, train: training.length, test: testing.length },
    summary, fit, profile, descent, ridge, holdout, polynomial, scaling, axes,
  };
}

function compareEveryValue(actual, expected, path = 'derived') {
  if (typeof expected === 'number') {
    assert.strictEqual(typeof actual, 'number', path);
    assert.ok(Number.isFinite(actual), path);
    const tolerance = 2e-11 * Math.max(1, Math.abs(expected));
    assert.ok(Math.abs(actual - expected) <= tolerance, `${path}: ${actual} versus independently recomputed ${expected}`);
    return;
  }
  if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual), path);
    assert.strictEqual(actual.length, expected.length, `${path}.length`);
    expected.forEach((value, index) => compareEveryValue(actual[index], value, `${path}[${index}]`));
    return;
  }
  if (expected && typeof expected === 'object') {
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), `${path}.keys`);
    Object.entries(expected).forEach(([key, value]) => compareEveryValue(actual[key], value, `${path}.${key}`));
    return;
  }
  assert.strictEqual(actual, expected, path);
}

function numericLeaves(value) {
  if (typeof value === 'number') return [value];
  if (Array.isArray(value)) return value.flatMap(numericLeaves);
  if (value && typeof value === 'object') return Object.values(value).flatMap(numericLeaves);
  return [];
}

test('linear-regression: every derived display value has independent arithmetic', () => {
  const actual = derived();
  const expected = independentResults();
  compareEveryValue(actual, expected);
  const available = numericLeaves(actual);
  for (const number of numericLeaves(expected)) {
    assert.ok(available.some(value => Math.abs(value - number) <= 2e-11 * Math.max(1, Math.abs(number))), `missing display value ${number}`);
  }
});

test('linear-regression: toy constraints and supplied metadata survive', () => {
  assert.ok(toyData.rows.length <= 10);
  assert.ok(toyData.features.length <= 2);
  toyData.rows.forEach(row => assert.strictEqual(row.length, toyData.features.length + 1));
  assert.deepEqual(Object.keys(metadata).sort(), ['topic', 'artifactTopic', 'title', 'lessons', 'sources', 'briefLink'].sort());
  assert.strictEqual(metadata.topic, 'linear-regression');
  assert.strictEqual(metadata.artifactTopic, metadata.topic);
  assert.strictEqual(metadata.title, 'Linear Regression');
  assert.deepEqual(metadata.lessons, ['02']);
  assert.strictEqual(metadata.sources[0].kind, 'curriculum');
  assert.ok(metadata.sources[0].path.includes(metadata.topic));
  assert.ok(/^[a-f0-9]{40}$/.test(metadata.sources[0].revision));
  assert.strictEqual(metadata.briefLink, metadata.sources[0].path);
  assert.ok(new Set(toyData.usedBy).size === toyData.usedBy.length);
});

test('linear-regression: fitted normal equations, bowl minimum, and ridge stationarity', () => {
  const d = derived();
  const rows = toyData.rows;
  const m = moments(rows);
  const residualSum = total(rows.map(([x, y]) => y - d.fit.w * x - d.fit.b));
  const weightedResidualSum = total(rows.map(([x, y]) => x * (y - d.fit.w * x - d.fit.b)));
  assert.ok(Math.abs(residualSum) < 1e-10);
  assert.ok(Math.abs(weightedResidualSum) < 1e-10);
  assert.ok(d.profile.curvature > 0);
  assert.strictEqual(d.profile.samples[2].w, d.fit.w);
  assert.ok(d.profile.samples.every(sample => sample.mse >= d.fit.mse - 1e-10));
  d.ridge.samples.forEach(sample => {
    const stationarity = (m.sxx * sample.w - m.sxy) / m.n + sample.lambda * sample.w;
    assert.ok(Math.abs(stationarity) < 1e-10);
  });
  for (let index = 1; index < d.ridge.samples.length; index += 1) {
    assert.ok(d.ridge.samples[index].w < d.ridge.samples[index - 1].w);
  }
});

test('linear-regression: independent held-out fit, cost directions, and illustrative extrapolation', () => {
  const d = derived();
  const training = toyData.rows.slice(0, -1);
  const heldOut = toyData.rows.at(-1);
  const fitted = solve(training);
  const prediction = fitted.w * heldOut[0] + fitted.b;
  compareEveryValue(d.holdout.testMse, (prediction - heldOut[1]) ** 2, 'held-out mse');
  assert.ok(d.descent.steps[0].mse < d.descent.start.mse);
  assert.ok(d.descent.steps[1].mse > d.descent.start.mse);
  assert.ok(d.descent.steps[1].w > d.fit.w);
  assert.ok(d.polynomial.trainMse < 1e-20);
  assert.strictEqual(d.polynomial.illustrative, true);
  assert.ok(d.polynomial.newPoint.polynomialSquaredError > d.polynomial.newPoint.lineSquaredError);
  assert.strictEqual(d.scaling.illustrative, true);
  d.scaling.standardDeviations.forEach(value => assert.ok(value > 0));
  for (let column = 0; column < d.scaling.featureCount; column += 1) {
    const values = d.scaling.standardized.map(row => row[column]);
    assert.ok(Math.abs(total(values) / values.length) < 1e-10);
    assert.ok(Math.abs(total(values.map(value => value ** 2)) / values.length - 1) < 1e-10);
  }
});
