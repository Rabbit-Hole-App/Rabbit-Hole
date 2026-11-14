export const toyData = {
  rows: [[1, 2], [2, 4], [3, 5], [4, 4], [5, 5]],
  features: ['x'],
  label: 'y',
  usedBy: [1, 2, 3, 5, 6, 7, 9, 10, 11, 12],
};

export const metadata = {
  topic: 'linear-regression',
  artifactTopic: 'linear-regression',
  title: 'Linear Regression',
  lessons: ['02'],
  sources: [{
    kind: 'curriculum',
    path: 'phases/02-ml-fundamentals/02-linear-regression/docs/en.md',
    revision: 'e7db050e64bde3be17a9381476f748da26d85692',
  }],
  briefLink: null,
};

const sum = values => values.reduce((a, b) => a + b, 0);
const mean = values => sum(values) / values.length;
const point = (x, y) => ({ x, y });

function summarize(rows) {
  const xs = rows.map(row => row[0]);
  const ys = rows.map(row => row[1]);
  const meanX = mean(xs);
  const meanY = mean(ys);
  const sxx = sum(xs.map(x => (x - meanX) ** 2));
  const sxy = sum(rows.map(([x, y]) => (x - meanX) * (y - meanY)));
  const syy = sum(ys.map(y => (y - meanY) ** 2));
  return {
    sumX: sum(xs), sumY: sum(ys),
    sumXX: sum(xs.map(x => x ** 2)),
    sumXY: sum(rows.map(([x, y]) => x * y)),
    sumYY: sum(ys.map(y => y ** 2)),
    meanX, meanY, sxx, sxy, syy,
    varianceX: sxx / rows.length,
    varianceY: syy / rows.length,
    covarianceXY: sxy / rows.length,
    minX: Math.min(...xs), maxX: Math.max(...xs),
    minY: Math.min(...ys), maxY: Math.max(...ys),
  };
}

function solve(rows) {
  const summary = summarize(rows);
  const w = summary.sxy / summary.sxx;
  const b = summary.meanY - w * summary.meanX;
  return { summary, w, b };
}

function evaluate(rows, w, b) {
  const predictions = rows.map(([x]) => w * x + b);
  const residuals = rows.map(([, y], i) => y - predictions[i]);
  const squaredErrors = residuals.map(error => error ** 2);
  const sse = sum(squaredErrors);
  return { predictions, residuals, squaredErrors, sse, mse: sse / rows.length };
}

function newtonCoefficients(rows) {
  const coefficients = rows.map(row => row[1]);
  for (let order = 1; order < rows.length; order += 1) {
    for (let i = rows.length - 1; i >= order; i -= 1) {
      coefficients[i] = (coefficients[i] - coefficients[i - 1]) / (rows[i][0] - rows[i - order][0]);
    }
  }
  return coefficients;
}

function interpolate(rows, coefficients, x) {
  let y = coefficients.at(-1);
  for (let i = coefficients.length - 2; i >= 0; i -= 1) y = y * (x - rows[i][0]) + coefficients[i];
  return y;
}

function descentPath(initial, rate, curvature, iterations) {
  const path = [initial];
  for (let i = 0; i < iterations; i += 1) {
    const previous = path.at(-1);
    path.push(point(previous.x * (1 - rate), previous.y * (1 - rate * curvature)));
  }
  return path;
}

function clean(value) {
  if (typeof value === 'number') return Number(value.toFixed(12));
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clean(item)]));
  return value;
}

export function derived() {
  const rows = toyData.rows;
  const n = rows.length;
  const featureCount = toyData.features.length;
  const zero = n - n;
  const unit = n / n;
  const two = unit + unit;
  const { summary, w, b } = solve(rows);
  const points = rows.map(([x, y], i) => ({ id: String.fromCharCode(65 + i), x, y }));
  const result = evaluate(rows, w, b);
  const spacing = Math.min(...rows.slice(1).map((row, i) => row[0] - rows[i][0]));
  const externalX = summary.maxX + spacing;
  const slopeFrom = point(summary.meanX, w * summary.meanX + b);
  const slopeCorner = point(summary.meanX + spacing, slopeFrom.y);
  const slopeTo = point(slopeCorner.x, w * slopeCorner.x + b);
  const fit = {
    w, b, ...result,
    intercept: point(zero, b),
    line: [point(zero, b), point(externalX, w * externalX + b)],
    slope: { from: slopeFrom, corner: slopeCorner, to: slopeTo, run: spacing, rise: slopeTo.y - slopeFrom.y },
  };
  let running = zero;
  const cumulativeSquares = result.squaredErrors.map(value => (running += value));
  const profileWeights = Array.from({ length: n }, (_, i) => i * w / two);
  const profileIntercepts = profileWeights.map(weight => summary.meanY - weight * summary.meanX);
  const profilePoints = profileWeights.map((weight, i) => point(weight, evaluate(rows, weight, profileIntercepts[i]).mse));
  const costProfile = {
    coefficients: { a: summary.sxx, b: -two * summary.sxy, c: summary.syy, divisor: n },
    points: profilePoints,
    intercepts: profileIntercepts,
    minimum: point(w, result.mse),
    curvature: two * summary.varianceX,
  };
  const initialErrors = rows.map(([, y]) => -y);
  const weightedErrors = rows.map(([x], i) => x * initialErrors[i]);
  const sumErrors = sum(initialErrors);
  const sumWeightedErrors = sum(weightedErrors);
  const dw = two * sumWeightedErrors / n;
  const db = two * sumErrors / n;
  const initial = {
    w: zero, b: zero,
    predictions: rows.map(() => zero),
    errors: initialErrors, weightedErrors, sumErrors, sumWeightedErrors, dw, db,
    mse: evaluate(rows, zero, zero).mse,
  };
  const rates = [10 ** -2, 10 ** -1];
  const steps = rates.map(rate => {
    const deltaW = -rate * dw;
    const deltaB = -rate * db;
    const scored = evaluate(rows, deltaW, deltaB);
    return {
      rate, step: unit, w: deltaW, b: deltaB, deltaW, deltaB,
      predictions: scored.predictions,
      errors: scored.residuals.map(error => -error),
      squaredErrors: scored.squaredErrors,
      sse: scored.sse, mse: scored.mse,
      costChange: scored.mse - initial.mse,
      trace: [point(zero, initial.mse), point(unit, scored.mse)],
    };
  });
  const gradient = { initial, rates, steps };
  const span = 10 ** (n + featureCount);
  const normalized = rows.map(([x]) => (x - summary.minX) / (summary.maxX - summary.minX));
  const scalingMean = mean(normalized);
  const scalingSd = Math.sqrt(mean(normalized.map(value => (value - scalingMean) ** 2)));
  const curvature = two ** summary.meanX;
  const rawRate = unit / n;
  const scaledRate = unit / two;
  const scalingInitial = point(-summary.meanX, unit);
  const scaling = {
    illustrative: true,
    smallSpan: unit, largeSpan: span,
    normalized,
    largeFeature: normalized.map(value => value * span),
    mean: scalingMean, standardDeviation: scalingSd,
    largeMean: scalingMean * span, largeStandardDeviation: scalingSd * span,
    standardized: normalized.map(value => (value - scalingMean) / scalingSd),
    curvature, rawRate, scaledRate,
    rawIterations: n, scaledIterations: two,
    rawPath: descentPath(scalingInitial, rawRate, curvature, n),
    scaledPath: descentPath(scalingInitial, scaledRate, unit, two),
    contours: Array.from({ length: two }, (_, i) => ({
      radius: i + unit,
      rawRadiusX: i + unit,
      rawRadiusY: (i + unit) / Math.sqrt(curvature),
      scaledRadiusX: i + unit,
      scaledRadiusY: i + unit,
    })),
  };
  const coefficients = newtonCoefficients(rows);
  const sampleStep = spacing / two;
  const sampleCount = Math.round((externalX - summary.minX) / sampleStep) + unit;
  const polynomialSamples = Array.from({ length: sampleCount }, (_, i) => {
    const x = summary.minX + i * sampleStep;
    return point(x, interpolate(rows, coefficients, x));
  });
  const polynomialTrainPredictions = rows.map(([x]) => interpolate(rows, coefficients, x));
  const linePrediction = w * externalX + b;
  const polynomialPrediction = interpolate(rows, coefficients, externalX);
  const newPoint = point(externalX, Math.round(linePrediction));
  const polynomial = {
    illustrative: true,
    degree: n - unit, coefficients, nodes: rows.map(([x]) => x),
    sampleStep, sampleCount, samples: polynomialSamples,
    trainPredictions: polynomialTrainPredictions,
    trainMse: mean(rows.map(([, y], i) => (y - polynomialTrainPredictions[i]) ** two)),
    newPoint, linePrediction, polynomialPrediction,
    lineSquaredError: (newPoint.y - linePrediction) ** two,
    polynomialSquaredError: (newPoint.y - polynomialPrediction) ** two,
  };
  const deviations = rows.map(([, y]) => y - summary.meanY);
  const squaredDeviations = deviations.map(value => value ** two);
  const total = sum(squaredDeviations);
  const rSquared = {
    baselineMean: summary.meanY,
    deviations, squaredDeviations, total,
    residual: result.sse,
    explained: total - result.sse,
    unexplainedFraction: result.sse / total,
    value: unit - result.sse / total,
    perfect: { sse: zero, value: unit },
    baseline: { sse: total, value: zero },
  };
  const lambdas = [zero, ...Array.from({ length: two + unit }, (_, i) => two ** i)];
  const ridgePoints = lambdas.map(lambda => point(lambda, summary.covarianceXY / (summary.varianceX + lambda)));
  const ridgeIntercepts = ridgePoints.map(({ y: weight }) => summary.meanY - weight * summary.meanX);
  const ridgeMse = ridgePoints.map(({ y: weight }, i) => evaluate(rows, weight, ridgeIntercepts[i]).mse);
  const penalties = ridgePoints.map(({ x: lambda, y: weight }) => lambda * weight ** two);
  const ridge = {
    numerator: summary.covarianceXY, denominator: summary.varianceX,
    points: ridgePoints, intercepts: ridgeIntercepts,
    mse: ridgeMse, penalties,
    costs: ridgeMse.map((value, i) => value + penalties[i]),
    asymptote: zero,
  };
  const train = rows.slice(zero, -unit);
  const test = rows.slice(-unit);
  const trainFit = solve(train);
  const trainScore = evaluate(train, trainFit.w, trainFit.b);
  const testScore = evaluate(test, trainFit.w, trainFit.b);
  const holdout = {
    trainIds: points.slice(zero, -unit).map(({ id }) => id),
    testIds: points.slice(-unit).map(({ id }) => id),
    trainCount: train.length, testCount: test.length,
    summary: trainFit.summary, w: trainFit.w, b: trainFit.b,
    trainPredictions: trainScore.predictions,
    trainResiduals: trainScore.residuals,
    trainSquaredErrors: trainScore.squaredErrors,
    trainMse: trainScore.mse,
    testPredictions: testScore.predictions,
    testResiduals: testScore.residuals,
    testSquaredErrors: testScore.squaredErrors,
    testMse: testScore.mse,
  };
  const axes = {
    scatter: { xMin: zero, xMax: externalX, yMin: zero, yMax: summary.maxY + spacing },
    weight: { xMin: zero, xMax: w + rates.at(-1), yMin: zero, yMax: unit },
    costProfile: { xMin: zero, xMax: Math.max(...profileWeights), yMin: zero, yMax: Math.max(...profilePoints.map(({ y }) => y)) },
    learning: { xMin: zero, xMax: unit, yMin: zero, yMax: Math.ceil(Math.max(initial.mse, ...steps.map(step => step.mse))) },
    scaling: { xMin: -(summary.maxX - summary.minX), xMax: summary.maxX - summary.minX, yMin: -two, yMax: two },
    polynomial: { xMin: summary.minX, xMax: externalX, yMin: zero, yMax: Math.ceil(Math.max(...polynomialSamples.map(({ y }) => y), newPoint.y)) },
    ridge: { xMin: zero, xMax: Math.max(...lambdas), yMin: zero, yMax: w },
    rSquared: { xMin: zero, xMax: two, yMin: zero, yMax: total },
  };
  return clean({
    constants: { zero, unit, two },
    counts: { rows: n, features: featureCount },
    points, summary, fit,
    residualCost: { cumulativeSquares, count: n, sum: result.sse, mean: result.mse },
    costProfile, gradient, scaling, polynomial, rSquared, ridge, holdout, axes,
  });
}
