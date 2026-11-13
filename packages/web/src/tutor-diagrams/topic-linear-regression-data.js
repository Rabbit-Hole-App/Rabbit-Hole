export const toyData = {
  rows: [[1, 2], [2, 4], [3, 5], [4, 4], [5, 5]],
  features: ['x'],
  label: 'y',
  usedBy: [1, 2, 3, 5, 6, 7, 9, 10, 11, 12],
};

const sources = [{
  kind: 'curriculum',
  path: 'phases/02-ml-fundamentals/02-linear-regression/docs/en.md',
  revision: 'e7db050e64bde3be17a9381476f748da26d85692',
}];

export const metadata = {
  topic: 'linear-regression',
  artifactTopic: 'linear-regression',
  title: 'Linear Regression',
  lessons: ['02'],
  sources,
  briefLink: sources[0].path,
};

const sum = values => values.reduce((total, value) => total + value, 0);

function summaryOf(rows) {
  const n = rows.length;
  const xs = rows.map(row => row[0]);
  const ys = rows.map(row => row[1]);
  const sumX = sum(xs);
  const sumY = sum(ys);
  const meanX = sumX / n;
  const meanY = sumY / n;
  const centeredX = xs.map(x => x - meanX);
  const centeredY = ys.map(y => y - meanY);
  return {
    n, sumX, sumY,
    sumXX: sum(xs.map(x => x * x)),
    sumXY: sum(rows.map(([x, y]) => x * y)),
    sumYY: sum(ys.map(y => y * y)),
    meanX, meanY, centeredX, centeredY,
    sxx: sum(centeredX.map(x => x * x)),
    sxy: sum(centeredX.map((x, i) => x * centeredY[i])),
    syy: sum(centeredY.map(y => y * y)),
  };
}

function fitOf(rows) {
  const summary = summaryOf(rows);
  const w = summary.sxy / summary.sxx;
  const b = summary.meanY - w * summary.meanX;
  return { summary, w, b };
}

function lossOf(rows, w, b) {
  const predictions = rows.map(([x]) => w * x + b);
  const residuals = rows.map(([, y], i) => y - predictions[i]);
  const squares = residuals.map(value => value * value);
  const sse = sum(squares);
  return { predictions, residuals, squares, sse, mse: sse / rows.length };
}

function newtonCoefficients(rows) {
  const work = rows.map(([, y]) => y);
  const coefficients = [work[0]];
  for (let order = 1; order < rows.length; order += 1) {
    for (let i = 0; i < rows.length - order; i += 1) {
      work[i] = (work[i + 1] - work[i]) / (rows[i + order][0] - rows[i][0]);
    }
    coefficients.push(work[0]);
  }
  return coefficients;
}

function interpolate(x, knots, coefficients) {
  let value = coefficients.at(-1);
  for (let i = coefficients.length - 2; i >= 0; i -= 1) {
    value = coefficients[i] + (x - knots[i]) * value;
  }
  return value;
}

function normalize(value) {
  if (typeof value === 'number') return value === 0 ? 0 : Number(value.toPrecision(12));
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalize(item)]));
  }
  return value;
}

export function derived() {
  const { rows, features } = toyData;
  const n = rows.length;
  const zero = n - n;
  const one = features.length;
  const two = one + one;
  const million = 10 ** 6;
  const points = rows.map(([x, y], i) => ({ id: String.fromCharCode(65 + i), x, y }));
  const { summary, w, b } = fitOf(rows);
  const fittedLoss = lossOf(rows, w, b);
  const baseline = { prediction: summary.meanY, ...lossOf(rows, zero, summary.meanY) };
  const xMin = Math.min(...rows.map(([x]) => x));
  const xMax = Math.max(...rows.map(([x]) => x));
  const extensionX = xMax + one;
  const line = [zero, extensionX].map(x => ({ x, y: w * x + b }));
  const from = { x: summary.meanX, y: w * summary.meanX + b };
  const corner = { x: from.x + one, y: from.y };
  const to = { x: corner.x, y: w * corner.x + b };
  const fit = {
    w, b, ...fittedLoss, baseline,
    explainedSse: baseline.sse - fittedLoss.sse,
    rSquared: one - fittedLoss.sse / baseline.sse,
    unexplainedFraction: fittedLoss.sse / baseline.sse,
    benchmarks: { perfectR2: one, meanR2: zero, perfectSse: zero, meanSse: baseline.sse },
    intercept: { x: zero, y: b },
    triangle: { from, corner, to, run: corner.x - from.x, rise: to.y - corner.y },
    line,
  };
  const profileSamples = Array.from({ length: n }, (_, i) => {
    const slope = w * i / two;
    const intercept = summary.meanY - slope * summary.meanX;
    const mse = (summary.sxx * slope ** 2 - two * summary.sxy * slope + summary.syy) / n;
    return { w: slope, b: intercept, mse };
  });
  const profile = {
    numerator: { quadratic: summary.sxx, linear: -two * summary.sxy, constant: summary.syy },
    divisor: n,
    curvature: two * summary.sxx / n,
    samples: profileSamples,
  };
  const initialLoss = lossOf(rows, zero, zero);
  const errors = initialLoss.residuals.map(value => -value);
  const weightedErrors = errors.map((value, i) => value * rows[i][0]);
  const sumErrors = sum(errors);
  const sumWeightedErrors = sum(weightedErrors);
  const dw = two * sumWeightedErrors / n;
  const db = two * sumErrors / n;
  const learningRates = [10 ** -2, 10 ** -1];
  const steps = learningRates.map(rate => {
    const deltaW = -rate * dw;
    const deltaB = -rate * db;
    return { rate, step: one, w: deltaW, b: deltaB, deltaW, deltaB, ...lossOf(rows, deltaW, deltaB) };
  });
  const descent = {
    learningRates,
    start: { w: zero, b: zero, ...initialLoss, errors, weightedErrors, sumErrors, sumWeightedErrors, dw, db },
    steps,
  };
  const ridgeSamples = [zero, one, two, n - one].map(lambda => {
    const ridgeW = summary.sxy / (summary.sxx + n * lambda);
    const ridgeB = summary.meanY - ridgeW * summary.meanX;
    const mse = lossOf(rows, ridgeW, ridgeB).mse;
    const penalty = lambda * ridgeW ** 2;
    return { lambda, w: ridgeW, b: ridgeB, mse, penalty, cost: mse + penalty };
  });
  const ridge = {
    numerator: summary.sxy / n,
    denominatorBase: summary.sxx / n,
    asymptote: zero,
    samples: ridgeSamples,
  };
  const trainRows = rows.slice(0, -one);
  const testRows = rows.slice(-one);
  const trainFit = fitOf(trainRows);
  const trainLoss = lossOf(trainRows, trainFit.w, trainFit.b);
  const testLoss = lossOf(testRows, trainFit.w, trainFit.b);
  const holdout = {
    trainIds: points.slice(0, -one).map(point => point.id),
    testIds: points.slice(-one).map(point => point.id),
    summary: trainFit.summary,
    w: trainFit.w, b: trainFit.b,
    trainLoss, testLoss,
    prediction: testLoss.predictions[0],
    actual: testRows[0][1],
    residual: testLoss.residuals[0],
    squaredError: testLoss.squares[0],
    testMse: testLoss.mse,
  };
  const knots = rows.map(([x]) => x);
  const coefficients = newtonCoefficients(rows);
  const polynomialAt = x => interpolate(x, knots, coefficients);
  const sampleCount = two * n + one + two;
  const polynomialSamples = Array.from({ length: sampleCount }, (_, i) => {
    const x = extensionX * i / (sampleCount - one);
    return { x, y: polynomialAt(x) };
  });
  const fittedValues = knots.map(polynomialAt);
  const polynomialSse = sum(fittedValues.map((value, i) => (value - rows[i][1]) ** 2));
  const illustrativeY = w * extensionX + b;
  const extrapolated = polynomialAt(extensionX);
  const polynomial = {
    illustrative: true,
    degree: n - one,
    knots, coefficients, samples: polynomialSamples, fittedValues,
    trainSse: polynomialSse,
    trainMse: polynomialSse / n,
    newPoint: {
      x: extensionX, y: illustrativeY,
      linePrediction: illustrativeY,
      polynomialPrediction: extrapolated,
      lineSquaredError: (illustrativeY - illustrativeY) ** 2,
      polynomialSquaredError: (extrapolated - illustrativeY) ** 2,
    },
  };
  const residualMin = Math.min(...fittedLoss.residuals);
  const residualSpan = Math.max(...fittedLoss.residuals) - residualMin;
  const scalingRows = rows.map(([x], i) => [
    (x - xMin) / (xMax - xMin),
    million * (fittedLoss.residuals[i] - residualMin) / residualSpan,
  ]);
  const means = [zero, one].map(column => sum(scalingRows.map(row => row[column])) / n);
  const standardDeviations = means.map((mean, column) => Math.sqrt(sum(scalingRows.map(row => (row[column] - mean) ** 2)) / n));
  const standardized = scalingRows.map(row => row.map((value, column) => (value - means[column]) / standardDeviations[column]));
  const radiusX = (xMax - xMin) / two;
  const radiusY = one / two;
  const rawHessian = [one, (radiusX / radiusY) ** 2];
  const scaledHessian = [one, one];
  const rawRate = (two - one / n) / rawHessian[1];
  const scaledRate = one - one / (two * n);
  const start = [-summary.meanX / two, two / n];
  const path = (hessian, rate) => Array.from({ length: n - one }, (_, i) => ({
    x: start[0] * (one - rate * hessian[0]) ** i,
    y: start[1] * (one - rate * hessian[1]) ** i,
  }));
  const scaling = {
    illustrative: true,
    geometry: 'Schematic contours and paths; synthesized features reuse the toy rows.',
    rows: scalingRows,
    featureCount: scalingRows[0].length,
    ranges: [zero, one].map(column => [Math.min(...scalingRows.map(row => row[column])), Math.max(...scalingRows.map(row => row[column]))]),
    means, standardDeviations, standardized,
    rawContour: { radiusX, radiusY },
    scaledContour: { radiusX, radiusY: radiusX },
    rawDescent: { hessian: rawHessian, rate: rawRate, points: path(rawHessian, rawRate) },
    scaledDescent: { hessian: scaledHessian, rate: scaledRate, points: path(scaledHessian, scaledRate) },
  };
  const axes = {
    toy: { xMin: zero, xMax: extensionX, yMin: zero, yMax: Math.ceil(Math.max(...rows.map(([, y]) => y), ...line.map(point => point.y))) },
    profile: { xMin: zero, xMax: Math.max(...profileSamples.map(sample => sample.w)), yMin: zero, yMax: Math.max(...profileSamples.map(sample => sample.mse)) },
    weight: { min: zero, max: w + learningRates.at(-1) },
    learningCost: { xMin: zero, xMax: one, yMin: zero, yMax: Math.ceil(Math.max(initialLoss.mse, ...steps.map(step => step.mse))) },
    ridge: { xMin: zero, xMax: Math.max(...ridgeSamples.map(sample => sample.lambda)), yMin: zero, yMax: w },
    polynomial: { xMin: zero, xMax: extensionX, yMin: zero, yMax: Math.ceil(Math.max(...polynomialSamples.map(point => point.y), illustrativeY)) },
    contours: { xMin: -radiusX, xMax: radiusX, yMin: -radiusX, yMax: radiusX },
    errorTotals: { min: zero, max: baseline.sse },
  };
  return normalize({
    constants: { zero, one, two, million },
    points,
    counts: { rows: n, features: features.length, train: trainRows.length, test: testRows.length },
    summary, fit, profile, descent, ridge, holdout, polynomial, scaling, axes,
  });
}
