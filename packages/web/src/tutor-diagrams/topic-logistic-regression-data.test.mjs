import test from 'node:test';
import assert from 'node:assert';
import { toyData, extraData, illustration, metadata, derived } from './topic-logistic-regression-data.js';

const totalOf = values => values.reduce((a, b) => a + b, 0);
const meanOf = values => totalOf(values) / values.length;
const probability = z => Math.exp(z) / (1 + Math.exp(z));
const binaryLoss = (p, y) => y === 1 ? -Math.log(p) : -Math.log1p(-p);

function closeTree(actual, expected, path = 'derived') {
  if (typeof expected === 'number') {
    assert.strictEqual(typeof actual, 'number', path);
    assert.ok(Number.isFinite(actual), path);
    assert.ok(Math.abs(actual - expected) <= 1e-11 * Math.max(1, Math.abs(expected)), `${path}: ${actual} != ${expected}`);
    return;
  }
  if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual), path);
    assert.strictEqual(actual.length, expected.length, path);
    expected.forEach((value, index) => closeTree(actual[index], value, `${path}[${index}]`));
    return;
  }
  if (expected && typeof expected === 'object') {
    assert.deepStrictEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), path);
    for (const key of Object.keys(expected)) closeTree(actual[key], expected[key], `${path}.${key}`);
    return;
  }
  assert.strictEqual(actual, expected, path);
}

function independentFit(rows) {
  const n = rows.length;
  const xs = rows.map(row => row[0]);
  const ys = rows.map(row => row[1]);
  const sumX = totalOf(xs);
  const sumY = totalOf(ys);
  const sumXX = totalOf(xs.map(x => x ** 2));
  const sumXY = totalOf(rows.map(([x, y]) => x * y));
  const meanX = meanOf(xs);
  const meanY = meanOf(ys);
  const sxx = sumXX - sumX * sumX / n;
  const sxy = sumXY - sumX * sumY / n;
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX ** 2);
  const intercept = (sumY * sumXX - sumX * sumXY) / (n * sumXX - sumX ** 2);
  return { n, sumX, sumY, sumXX, sumXY, meanX, meanY, sxx, sxy, slope, intercept,
    cutoff: (0.5 - intercept) / slope, zeroCross: -intercept / slope, oneCross: (1 - intercept) / slope };
}

function independentClip(model, bounds) {
  const candidates = [
    { x: bounds.xMin, y: model.intercept + model.slope * bounds.xMin },
    { x: bounds.xMax, y: model.intercept + model.slope * bounds.xMax },
    { x: (bounds.yMin - model.intercept) / model.slope, y: bounds.yMin },
    { x: (bounds.yMax - model.intercept) / model.slope, y: bounds.yMax },
  ].filter(({ x, y }) => x >= bounds.xMin && x <= bounds.xMax && y >= bounds.yMin && y <= bounds.yMax);
  candidates.sort((a, b) => a.x - b.x);
  return [candidates[0], candidates.at(-1)];
}

function independentMetrics(rows, threshold) {
  const predictions = rows.map(([p, actual]) => ({ p, actual, predicted: p < threshold ? 0 : 1 }));
  let tp = 0;
  let fn = 0;
  let fp = 0;
  let tn = 0;
  for (const { actual, predicted } of predictions) {
    if (actual) { if (predicted) tp++; else fn++; }
    else { if (predicted) fp++; else tn++; }
  }
  const n = tp + fn + fp + tn;
  return { threshold, n, predictions, tp, fn, fp, tn, predictedPositive: tp + fp,
    predictedNegative: tn + fn, actualPositive: tp + fn, actualNegative: tn + fp,
    precision: tp + fp ? tp / (tp + fp) : 0,
    recall: tp + fn ? tp / (tp + fn) : 0,
    f1: 2 * tp + fp + fn ? 2 * tp / (2 * tp + fp + fn) : 0,
    accuracy: (tp + tn) / n };
}

function independentState(rows, w, b) {
  const scores = rows.map(([x]) => b + x * w);
  const probabilities = scores.map(probability);
  const losses = probabilities.map((p, index) => binaryLoss(p, rows[index][1]));
  return { w, b, scores, probabilities, losses, lossSum: totalOf(losses), loss: meanOf(losses) };
}

function expectedResults() {
  const rows = toyData.rows;
  const labels = [...new Set(rows.map(row => row[1]))].sort();
  const [zero, one] = labels;
  const two = labels.length;
  const half = meanOf(labels);
  const constants = { zero, one, two, half, quarter: half ** 2, hundred: illustration.imbalance.total };
  const dataset = { n: rows.length, featureCount: toyData.features.length,
    positive: rows.filter(row => row[1] === one).length,
    negative: rows.filter(row => row[1] === zero).length,
    points: rows.map(([x, y]) => ({ x, y })) };
  const model = independentFit(rows);
  const xs = rows.map(row => row[0]).sort((a, b) => a - b);
  const domain = { xMin: xs[0], xMax: xs.at(-1), yMin: -half, yMax: one + half };
  const line = [xs[0], xs.at(-1)].map(x => ({ x, y: model.intercept + x * model.slope }));
  const linear = { fit: model, domain, line,
    below: [{ x: xs[0], y: zero }, line[0], { x: model.zeroCross, y: zero }],
    above: [{ x: model.oneCross, y: one }, line[1], { x: xs.at(-1), y: one }] };
  const point = { x: illustration.outlier.hours, y: illustration.outlier.label };
  const augmented = independentFit(rows.concat([[point.x, point.y]]));
  const outlierBounds = { xMin: zero, xMax: point.x, yMin: zero, yMax: one + half };
  const outlier = { point, fit: augmented, domain: outlierBounds,
    originalLine: independentClip(model, outlierBounds), refitLine: independentClip(augmented, outlierBounds),
    cutoffShift: augmented.cutoff - model.cutoff };
  const sigmoidPoints = [];
  const derivativePoints = [];
  for (let x = -illustration.score.limit; x <= illustration.score.limit; x += illustration.score.step) {
    sigmoidPoints.push({ x, y: probability(x) });
    derivativePoints.push({ x, y: Math.exp(x) / (1 + Math.exp(x)) ** 2 });
  }
  const sigmoid = { domain: { xMin: -illustration.score.limit, xMax: illustration.score.limit, yMin: zero, yMax: one },
    points: sigmoidPoints, derivativePoints, midpoint: { x: zero, y: half },
    derivativePeak: half ** 2, leftTail: derivativePoints[0].y, rightTail: derivativePoints.at(-1).y };
  const firstPositiveHour = Math.min(...rows.filter(row => row[1] === one).map(row => row[0]));
  const pipeline = { w: one, b: -firstPositiveHour, threshold: half, classes: [zero, one],
    examples: [firstPositiveHour - two, firstPositiveHour, firstPositiveHour + two].map(x => {
      const z = x - firstPositiveHour;
      return { x, z, p: probability(z), prediction: z >= zero ? one : zero };
    }) };
  const positiveLoss = illustration.lossProbabilities.map(x => ({ x, y: -Math.log(x) }));
  const negativeLoss = illustration.lossProbabilities.map(x => ({ x, y: -Math.log1p(-x) }));
  const loss = { positive: positiveLoss, negative: negativeLoss,
    domain: { xMin: zero, xMax: one, yMin: zero, yMax: Math.ceil(-Math.log(Math.min(...illustration.lossProbabilities))) },
    midpoint: { x: half, y: Math.log(two) } };
  const initial = independentState(rows, zero, zero);
  const errors = rows.map(([, y]) => half - y);
  const dwTerms = rows.map(([x, y]) => half * x - y * x);
  const sumDw = half * totalOf(xs) - totalOf(rows.map(([x, y]) => x * y));
  const sumDb = rows.length * half - dataset.positive;
  const dw = sumDw / rows.length;
  const db = sumDb / rows.length;
  const training = { n: rows.length, stageCount: ['forward', 'loss', 'gradient', 'update'].length,
    learningRate: illustration.learningRate, initial, errors, dwTerms, sumDw, sumDb, dw, db,
    after: independentState(rows, -illustration.learningRate * dw, -illustration.learningRate * db) };
  const lowCenter = xs[one];
  const highCenter = firstPositiveHour;
  const boundarySum = lowCenter + highCenter;
  const midpoint = meanOf([lowCenter, highCenter]);
  const centers = [lowCenter, highCenter].map((x, label) => ({ x, y: x, label }));
  const boundary = { w1: one, w2: one, b: -boundarySum, midpoint,
    domain: { xMin: zero, xMax: boundarySum, yMin: zero, yMax: boundarySum }, centers,
    points: centers.flatMap(({ x, y, label }) => [{ x, y, label }, { x: x - half, y, label }, { x, y: y + half, label }]),
    line: [{ x: zero, y: boundarySum }, { x: boundarySum, y: zero }],
    samples: [-half, zero, half].map(offset => {
      const x = midpoint + offset;
      const z = x + x - boundarySum;
      return { x, y: x, z, p: probability(z), prediction: z < zero ? zero : one };
    }) };
  const classScores = [two, one, zero];
  const exponentials = classScores.map(z => Math.E ** z);
  const denominator = totalOf(exponentials);
  const stableDenominator = totalOf(classScores.map(z => Math.exp(z - two)));
  const probabilities = classScores.map(z => Math.exp(z - two) / stableDenominator);
  const winner = classScores.findIndex(z => z === Math.max(...classScores));
  const softmax = { classes: classScores.map((_, index) => index), scores: classScores, exponentials,
    denominator, probabilities, total: totalOf(probabilities), winner, classCount: classScores.length };
  const total = illustration.imbalance.total;
  const positive = total * illustration.imbalance.positiveRate;
  const negative = total * (one - illustration.imbalance.positiveRate);
  const imbalance = { total, positive, negative, tp: zero, fn: positive, fp: zero, tn: negative,
    accuracy: one - illustration.imbalance.positiveRate, recall: zero,
    accuracyPercent: (one - illustration.imbalance.positiveRate) * total, recallPercent: zero,
    negativePercent: negative / total * constants.hundred, positivePercent: positive / total * constants.hundred };
  const thresholds = illustration.thresholds.map(threshold => independentMetrics(extraData.rows, threshold));
  const confusion = independentMetrics(extraData.rows, half);
  return { constants, dataset, linear, outlier, sigmoid, pipeline, loss, training, boundary, softmax, imbalance, confusion, thresholds };
}

function independentlyRounded(value) {
  if (typeof value === 'number') return Math.round(value * 1000) / 1000;
  if (Array.isArray(value)) return value.map(independentlyRounded);
  if (value && typeof value === 'object') {
    const result = {};
    for (const key of Object.keys(value)) result[key] = independentlyRounded(value[key]);
    return result;
  }
  return value;
}

test('logistic-regression preserves supplied data dimensions and lesson provenance', () => {
  for (const dataset of [toyData, extraData]) {
    assert.ok(dataset.rows.length <= 10);
    assert.ok(dataset.features.length <= 2);
    assert.ok(dataset.rows.every(row => row.length === dataset.features.length + 1));
    assert.ok(dataset.rows.every(row => row.at(-1) === 0 || row.at(-1) === 1));
  }
  assert.deepStrictEqual(toyData.features, ['hours']);
  assert.deepStrictEqual(extraData.features, ['prob']);
  assert.deepStrictEqual(toyData.usedBy, [1, 2]);
  assert.deepStrictEqual(extraData.usedBy, [11, 12]);
  assert.strictEqual(metadata.topic, 'logistic-regression');
  assert.strictEqual(metadata.artifactTopic, metadata.topic);
  assert.strictEqual(metadata.title, 'Logistic Regression');
  assert.deepStrictEqual(metadata.lessons, ['03']);
  assert.strictEqual(metadata.sources[0].kind, 'curriculum');
  assert.strictEqual(metadata.sources[0].revision, 'e7db050e64bde3be17a9381476f748da26d85692');
  assert.strictEqual(metadata.briefLink, metadata.sources[0].path);
});

test('logistic-regression independently recomputes every derived and display value', () => {
  const actual = derived();
  const expected = expectedResults();
  const { display, ...raw } = actual;
  closeTree(raw, expected);
  closeTree(display, independentlyRounded(expected), 'display');
  assert.deepStrictEqual(derived(), actual);
});

test('logistic-regression teaching relationships follow the recomputed arithmetic', () => {
  const d = derived();
  assert.ok(d.linear.line[0].y < d.constants.zero);
  assert.ok(d.linear.line.at(-1).y > d.constants.one);
  assert.ok(d.outlier.fit.slope < d.linear.fit.slope);
  assert.ok(d.outlier.fit.cutoff < d.linear.fit.cutoff);
  assert.ok(d.training.after.loss < d.training.initial.loss);
  assert.ok(d.sigmoid.derivativePeak > d.sigmoid.leftTail);
  assert.ok(d.sigmoid.derivativePeak > d.sigmoid.rightTail);
  assert.ok(d.loss.positive[0].y > d.loss.positive.at(-1).y);
  assert.ok(d.loss.negative[0].y < d.loss.negative.at(-1).y);
  for (const point of d.boundary.line) closeTree(point.x + point.y + d.boundary.b, d.constants.zero);
  closeTree(totalOf(d.softmax.probabilities), d.constants.one);
  for (const result of d.thresholds) {
    assert.strictEqual(result.tp + result.fn + result.fp + result.tn, extraData.rows.length);
    assert.strictEqual(result.predictedPositive + result.predictedNegative, result.n);
    assert.strictEqual(result.actualPositive + result.actualNegative, result.n);
  }
  for (let index = 1; index < d.thresholds.length; index++) {
    assert.ok(d.thresholds[index].precision >= d.thresholds[index - 1].precision);
    assert.ok(d.thresholds[index].recall <= d.thresholds[index - 1].recall);
  }
  closeTree(d.confusion.precision, d.confusion.recall);
  closeTree(d.confusion.f1, d.confusion.precision);
  assert.strictEqual(d.imbalance.tp + d.imbalance.fn + d.imbalance.fp + d.imbalance.tn, d.imbalance.total);
});
