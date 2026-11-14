export const toyData = {
  rows: [[1, 0], [2, 0], [3, 0], [4, 0], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1]],
  features: ['hours'],
  label: 'pass',
  usedBy: [1, 2],
};

export const extraData = {
  rows: [[0.9, 1], [0.8, 1], [0.65, 1], [0.55, 0], [0.45, 1], [0.35, 0], [0.2, 0], [0.1, 0]],
  features: ['prob'],
  label: 'actual',
  usedBy: [11, 12],
};

export const metadata = {
  topic: 'logistic-regression',
  artifactTopic: 'logistic-regression',
  title: 'Logistic Regression',
  lessons: ['03'],
  sources: [{ kind: 'curriculum', path: 'phases/02-ml-fundamentals/03-logistic-regression/docs/en.md', revision: 'e7db050e64bde3be17a9381476f748da26d85692' }],
  briefLink: 'phases/02-ml-fundamentals/03-logistic-regression/docs/en.md',
};

export const illustration = {
  outlier: { hours: 50, label: 1 },
  score: { limit: 6, step: 2 },
  lossProbabilities: [0.01, 0.1, 0.25, 0.5, 0.75, 0.9, 0.99],
  thresholds: [0.3, 0.5, 0.7],
  learningRate: 0.1,
  imbalance: { total: 100, positiveRate: 0.05 },
};

const sum = values => values.reduce((total, value) => total + value, 0);
const sigmoid = z => 1 / (1 + Math.exp(-z));
const lossAt = (p, y) => -(y * Math.log(p) + (1 - y) * Math.log(1 - p));

function fit(rows) {
  const n = rows.length;
  const sumX = sum(rows.map(([x]) => x));
  const sumY = sum(rows.map(([, y]) => y));
  const sumXX = sum(rows.map(([x]) => x * x));
  const sumXY = sum(rows.map(([x, y]) => x * y));
  const meanX = sumX / n;
  const meanY = sumY / n;
  const sxx = sum(rows.map(([x]) => (x - meanX) ** 2));
  const sxy = sum(rows.map(([x, y]) => (x - meanX) * (y - meanY)));
  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;
  return { n, sumX, sumY, sumXX, sumXY, meanX, meanY, sxx, sxy, slope, intercept,
    cutoff: (0.5 - intercept) / slope,
    zeroCross: -intercept / slope,
    oneCross: (1 - intercept) / slope };
}

function clippedLine(model, domain) {
  const left = Math.max(domain.xMin, (domain.yMin - model.intercept) / model.slope);
  const right = Math.min(domain.xMax, (domain.yMax - model.intercept) / model.slope);
  return [left, right].map(x => ({ x, y: model.slope * x + model.intercept }));
}

function metrics(rows, threshold) {
  const predictions = rows.map(([p, actual]) => ({ p, actual, predicted: Number(p >= threshold) }));
  const count = (actual, predicted) => predictions.filter(row => row.actual === actual && row.predicted === predicted).length;
  const tp = count(1, 1);
  const fn = count(1, 0);
  const fp = count(0, 1);
  const tn = count(0, 0);
  const predictedPositive = tp + fp;
  const predictedNegative = fn + tn;
  const actualPositive = tp + fn;
  const actualNegative = fp + tn;
  const precision = predictedPositive ? tp / predictedPositive : 0;
  const recall = actualPositive ? tp / actualPositive : 0;
  const f1 = precision + recall ? 2 * precision * recall / (precision + recall) : 0;
  const n = rows.length;
  return { threshold, n, predictions, tp, fn, fp, tn, predictedPositive, predictedNegative,
    actualPositive, actualNegative, precision, recall, f1, accuracy: (tp + tn) / n };
}

function trainingState(rows, w, b) {
  const scores = rows.map(([x]) => w * x + b);
  const probabilities = scores.map(sigmoid);
  const losses = rows.map(([, y], index) => lossAt(probabilities[index], y));
  const lossSum = sum(losses);
  return { w, b, scores, probabilities, losses, lossSum, loss: lossSum / rows.length };
}

function displayValues(value) {
  if (typeof value === 'number') return Number(value.toFixed(3));
  if (Array.isArray(value)) return value.map(displayValues);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, displayValues(child)]));
  return value;
}

export function derived() {
  const rows = toyData.rows;
  const zero = Math.min(...rows.map(([, label]) => label));
  const one = Math.max(...rows.map(([, label]) => label));
  const two = one + one;
  const half = one / two;
  const constants = { zero, one, two, half, quarter: half * half, hundred: illustration.imbalance.total };
  const points = rows.map(([x, y]) => ({ x, y }));
  const positive = sum(rows.map(([, label]) => label));
  const dataset = { n: rows.length, featureCount: toyData.features.length, positive,
    negative: rows.length - positive, points };
  const originalFit = fit(rows);
  const linearDomain = { xMin: Math.min(...rows.map(([x]) => x)), xMax: Math.max(...rows.map(([x]) => x)), yMin: -half, yMax: one + half };
  const line = [linearDomain.xMin, linearDomain.xMax].map(x => ({ x, y: originalFit.slope * x + originalFit.intercept }));
  const linear = { fit: originalFit, domain: linearDomain, line,
    below: [{ x: line[0].x, y: zero }, line[0], { x: originalFit.zeroCross, y: zero }],
    above: [{ x: originalFit.oneCross, y: one }, line[1], { x: line[1].x, y: one }] };
  const outlierPoint = { x: illustration.outlier.hours, y: illustration.outlier.label };
  const augmentedFit = fit([...rows, [outlierPoint.x, outlierPoint.y]]);
  const outlierDomain = { xMin: zero, xMax: outlierPoint.x, yMin: zero, yMax: one + half };
  const outlier = { point: outlierPoint, fit: augmentedFit, domain: outlierDomain,
    originalLine: clippedLine(originalFit, outlierDomain), refitLine: clippedLine(augmentedFit, outlierDomain),
    cutoffShift: augmentedFit.cutoff - originalFit.cutoff };
  const scores = Array.from({ length: two * illustration.score.limit / illustration.score.step + one }, (_, index) => -illustration.score.limit + index * illustration.score.step);
  const sigmoidPoints = scores.map(x => ({ x, y: sigmoid(x) }));
  const derivativePoints = sigmoidPoints.map(({ x, y }) => ({ x, y: y * (one - y) }));
  const sigmoidResult = { domain: { xMin: -illustration.score.limit, xMax: illustration.score.limit, yMin: zero, yMax: one },
    points: sigmoidPoints, derivativePoints, midpoint: { x: zero, y: sigmoid(zero) },
    derivativePeak: Math.max(...derivativePoints.map(point => point.y)),
    leftTail: derivativePoints[0].y, rightTail: derivativePoints.at(-one).y };
  const pipelineW = one;
  const pipelineB = -rows.find(([, label]) => label === one)[0];
  const pipeline = { w: pipelineW, b: pipelineB, threshold: half, classes: [zero, one],
    examples: [rows[two][0], -pipelineB, rows[two * two + two][0]].map(x => {
      const z = pipelineW * x + pipelineB;
      const p = sigmoid(z);
      return { x, z, p, prediction: Number(p >= half) };
    }) };
  const positiveLoss = illustration.lossProbabilities.map(x => ({ x, y: lossAt(x, one) }));
  const negativeLoss = illustration.lossProbabilities.map(x => ({ x, y: lossAt(x, zero) }));
  const loss = { positive: positiveLoss, negative: negativeLoss,
    domain: { xMin: zero, xMax: one, yMin: zero, yMax: Math.ceil(Math.max(...positiveLoss.map(point => point.y), ...negativeLoss.map(point => point.y))) },
    midpoint: { x: half, y: lossAt(half, one) } };
  const initial = trainingState(rows, zero, zero);
  const errors = rows.map(([, label], index) => initial.probabilities[index] - label);
  const dwTerms = rows.map(([x], index) => errors[index] * x);
  const sumDw = sum(dwTerms);
  const sumDb = sum(errors);
  const dw = sumDw / rows.length;
  const db = sumDb / rows.length;
  const updatedW = initial.w - illustration.learningRate * dw;
  const updatedB = initial.b - illustration.learningRate * db;
  const training = { n: rows.length, stageCount: two * two, learningRate: illustration.learningRate,
    initial, errors, dwTerms, sumDw, sumDb, dw, db, after: trainingState(rows, updatedW, updatedB) };
  const lowCenter = rows[one][0];
  const highCenter = -pipelineB;
  const boundarySum = lowCenter + highCenter;
  const midpoint = boundarySum / two;
  const centers = [{ x: lowCenter, y: lowCenter, label: zero }, { x: highCenter, y: highCenter, label: one }];
  const boundary = { w1: one, w2: one, b: -boundarySum, midpoint,
    domain: { xMin: zero, xMax: boundarySum, yMin: zero, yMax: boundarySum }, centers,
    points: centers.flatMap(center => [center, { ...center, x: center.x - half }, { ...center, y: center.y + half }]),
    line: [{ x: zero, y: boundarySum }, { x: boundarySum, y: zero }],
    samples: [midpoint - half, midpoint, midpoint + half].map(x => {
      const z = two * x - boundarySum;
      const p = sigmoid(z);
      return { x, y: x, z, p, prediction: Number(p >= half) };
    }) };
  const classScores = [two, one, zero];
  const exponentials = classScores.map(value => Math.exp(value));
  const denominator = sum(exponentials);
  const probabilities = exponentials.map(value => value / denominator);
  const softmax = { classes: classScores.map((_, index) => index), scores: classScores, exponentials,
    denominator, probabilities, total: sum(probabilities), winner: probabilities.indexOf(Math.max(...probabilities)), classCount: classScores.length };
  const total = illustration.imbalance.total;
  const minority = total * illustration.imbalance.positiveRate;
  const majority = total - minority;
  const imbalance = { total, positive: minority, negative: majority, tp: zero, fn: minority, fp: zero, tn: majority,
    accuracy: majority / total, recall: zero / minority,
    accuracyPercent: total * majority / total, recallPercent: total * zero / minority,
    negativePercent: total * majority / total, positivePercent: total * minority / total };
  const thresholds = illustration.thresholds.map(threshold => metrics(extraData.rows, threshold));
  const confusion = thresholds.find(result => result.threshold === half);
  const result = { constants, dataset, linear, outlier, sigmoid: sigmoidResult, pipeline, loss, training,
    boundary, softmax, imbalance, confusion, thresholds };
  return { ...result, display: displayValues(result) };
}
