import test from 'node:test';
import assert from 'node:assert';
import * as data from './topic-logistic-regression-data.js';
import { references, derived } from './topic-logistic-regression-references.js';
import replay from './topic-logistic-regression-replay-cases.json' with { type: 'json' };
test('the merged derived() carries every value of the data module', () => assert.deepStrictEqual(Object.fromEntries(Object.keys(data.derived()).map(key => [key, derived()[key]])), data.derived()));
{
const lrOneTestRows = replay.prompts.filter(row => ['1', '2', '3', '4'].includes(String(row.id)));
const lrOneTestRound = value => {
  if (typeof value === 'number') return Number(value.toFixed(3));
  if (Array.isArray(value)) return value.map(lrOneTestRound);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, lrOneTestRound(child)]));
  return value;
};
const lrOneTestNumbers = value => {
  if (typeof value === 'number') return [value];
  if (Array.isArray(value)) return value.flatMap(lrOneTestNumbers);
  if (value && typeof value === 'object') return Object.values(value).flatMap(lrOneTestNumbers);
  return [];
};
const lrOneTestTextNumbers = value => {
  if (typeof value === 'string') return [...value.matchAll(/-?\d+(?:\.\d+)?/g)].map(match => Number(match[0]));
  if (Array.isArray(value)) return value.flatMap(lrOneTestTextNumbers);
  if (value && typeof value === 'object') return Object.values(value).flatMap(lrOneTestTextNumbers);
  return [];
};
const lrOneTestSum = values => values.reduce((a, b) => a + b, 0);
function lrOneTestFit(rows) {
  const n = rows.length;
  const sx = lrOneTestSum(rows.map(([x]) => x));
  const sy = lrOneTestSum(rows.map(([, y]) => y));
  const sxxRaw = lrOneTestSum(rows.map(([x]) => x * x));
  const sxyRaw = lrOneTestSum(rows.map(([x, y]) => x * y));
  const denominator = n * sxxRaw - sx * sx;
  const slope = (n * sxyRaw - sx * sy) / denominator;
  const intercept = (sy * sxxRaw - sx * sxyRaw) / denominator;
  return { slope, intercept, sxx: sxxRaw - sx * sx / n, sxy: sxyRaw - sx * sy / n, cutoff: (0.5 - intercept) / slope };
}
function lrOneTestClip(model, bounds) {
  const candidates = [
    { x: bounds.xMin, y: model.intercept + model.slope * bounds.xMin },
    { x: bounds.xMax, y: model.intercept + model.slope * bounds.xMax },
    { x: (bounds.yMin - model.intercept) / model.slope, y: bounds.yMin },
    { x: (bounds.yMax - model.intercept) / model.slope, y: bounds.yMax }
  ].filter(({ x, y }) => x >= bounds.xMin && x <= bounds.xMax && y >= bounds.yMin && y <= bounds.yMax).sort((a, b) => a.x - b.x);
  return [candidates[0], candidates.at(-1)];
}
function lrOneTestExpected() {
  const rows = data.toyData.rows;
  const zero = Math.min(...rows.map(([, y]) => y));
  const one = Math.max(...rows.map(([, y]) => y));
  const two = new Set(rows.map(([, y]) => y)).size;
  const half = (zero + one) / two;
  const constants = { zero, one, two, half, quarter: half * half };
  const points = rows.map(([x, y]) => ({ x, y }));
  const originalFit = lrOneTestFit(rows);
  const linearDomain = { xMin: Math.min(...rows.map(([x]) => x)), xMax: Math.max(...rows.map(([x]) => x)), yMin: -half, yMax: one + half };
  const linearLine = [linearDomain.xMin, linearDomain.xMax].map(x => ({ x, y: originalFit.intercept + originalFit.slope * x }));
  const outlierPoint = { x: data.illustration.outlier.hours, y: data.illustration.outlier.label };
  const outlierFit = lrOneTestFit(rows.concat([[outlierPoint.x, outlierPoint.y]]));
  const outlierDomain = { xMin: zero, xMax: outlierPoint.x, yMin: zero, yMax: one + half };
  const sigmoidPoints = [];
  const derivativePoints = [];
  for (let x = -data.illustration.score.limit; x <= data.illustration.score.limit; x += data.illustration.score.step) {
    const exponential = Math.exp(x);
    sigmoidPoints.push({ x, y: exponential / (one + exponential) });
    derivativePoints.push({ x, y: exponential / (one + exponential) ** two });
  }
  return { constants, points, originalFit, linearDomain, linearLine, outlierPoint, outlierFit, outlierDomain,
    originalClipped: lrOneTestClip(originalFit, outlierDomain), refitClipped: lrOneTestClip(outlierFit, outlierDomain),
    sigmoidDomain: { xMin: -data.illustration.score.limit, xMax: data.illustration.score.limit, yMin: zero, yMax: one },
    sigmoidPoints, derivativePoints, midpoint: { x: zero, y: half }, derivativePeak: half * (one - half), scoreStep: data.illustration.score.step };
}

test('logistic-regression batch one independently recomputes all displayed arithmetic', () => {
  const actual = data.derived().display;
  const expected = lrOneTestRound(lrOneTestExpected());
  for (const key of Object.keys(expected.constants)) assert.strictEqual(actual.constants[key], expected.constants[key]);
  assert.deepStrictEqual(actual.dataset.points, expected.points);
  assert.deepStrictEqual(actual.linear.domain, expected.linearDomain);
  assert.deepStrictEqual(actual.linear.line, expected.linearLine);
  for (const key of Object.keys(expected.originalFit)) assert.strictEqual(actual.linear.fit[key], expected.originalFit[key]);
  assert.deepStrictEqual(actual.outlier.point, expected.outlierPoint);
  assert.deepStrictEqual(actual.outlier.domain, expected.outlierDomain);
  assert.deepStrictEqual(actual.outlier.originalLine, expected.originalClipped);
  assert.deepStrictEqual(actual.outlier.refitLine, expected.refitClipped);
  for (const key of Object.keys(expected.outlierFit)) assert.strictEqual(actual.outlier.fit[key], expected.outlierFit[key]);
  assert.deepStrictEqual(actual.sigmoid.domain, expected.sigmoidDomain);
  assert.deepStrictEqual(actual.sigmoid.points, expected.sigmoidPoints);
  assert.deepStrictEqual(actual.sigmoid.derivativePoints, expected.derivativePoints);
  assert.deepStrictEqual(actual.sigmoid.midpoint, expected.midpoint);
  assert.strictEqual(actual.sigmoid.derivativePeak, expected.derivativePeak);
  assert.strictEqual(actual.constants.two, expected.scoreStep);
  const recomputed = new Set(lrOneTestNumbers(expected));
  const produced = new Set(lrOneTestNumbers(data.derived()));
  for (const row of lrOneTestRows) {
    const ref = references.find(item => item.id === row.referenceId);
    assert.ok(ref);
    for (const item of [ref.depths.overview.spec, ref.spec, ref.depths.deep.spec]) {
      for (const number of [...lrOneTestNumbers(item.diagram), ...lrOneTestTextNumbers(item.diagram)]) {
        assert.ok(produced.has(number), `number absent from data.derived(): ${number}`);
        assert.ok(recomputed.has(number), `number not independently recomputed: ${number}`);
      }
    }
  }
});

test('logistic-regression batch one preserves prompts, provenance, keywords and planner kinds', () => {
  assert.strictEqual(lrOneTestRows.length, 4);
  const rendered = diagram => diagram.kind === 'flow' ? diagram.nodes.length + diagram.edges.length : diagram.series.reduce((n, series) => n + (series.points ? series.points.length : series.samples.y.length), 0) + (diagram.annotations || []).length;
  for (const row of lrOneTestRows) {
    const matches = references.filter(item => item.id === row.referenceId);
    assert.strictEqual(matches.length, 1);
    const ref = matches[0];
    assert.ok(ref.prompts.includes(row.prompt));
    assert.strictEqual(row.paraphrases.length, 5);
    assert.strictEqual(new Set(row.paraphrases).size, 5);
    for (const paraphrase of row.paraphrases) assert.ok(ref.prompts.includes(paraphrase));
    assert.ok(ref.keywords.length >= 2 && ref.keywords.length <= 3);
    assert.deepStrictEqual(ref.shortKeywords, ref.keywords);
    for (const keyword of ref.keywords) {
      assert.strictEqual(keyword, keyword.toLowerCase());
      assert.ok(keyword.trim().split(/\s+/).length <= 3);
      assert.ok(keyword.length > 0);
    }
    assert.deepStrictEqual(ref.lessons, data.metadata.lessons);
    assert.deepStrictEqual(ref.sources, data.metadata.sources);
    assert.strictEqual(ref.origin, 'lesson');
    assert.ok(ref.promptOrigins.some(origin => String(origin.id) === String(row.id) && origin.prompt === row.prompt && origin.origin === 'lesson' && origin.lesson === data.metadata.lessons[0]));
    assert.strictEqual(ref.depths.overview.spec.diagram.kind, 'flow');
    assert.strictEqual(ref.spec.diagram.kind, 'coordinate-plot');
    assert.strictEqual(ref.depths.deep.spec.diagram.kind, 'coordinate-plot');
    assert.ok(rendered(ref.depths.overview.spec.diagram) < rendered(ref.spec.diagram));
    assert.notStrictEqual(ref.depths.deep.spec.diagram.caption, ref.spec.diagram.caption);
    assert.ok(ref.depths.deep.spec.diagram.caption.includes('$'));
    for (const item of [ref.depths.overview.spec, ref.spec, ref.depths.deep.spec]) {
      if (String(row.id) !== '1') assert.ok(item.diagram.caption.startsWith('Illustrative values.'));
      if (item.diagram.kind === 'flow') {
        for (const node of item.diagram.nodes) assert.ok(!('side' in node));
        const incoming = id => item.diagram.edges.filter(edge => edge.to === id);
        const outgoing = id => item.diagram.edges.filter(edge => edge.from === id);
        for (const node of item.diagram.nodes.filter(node => node.role === 'merge')) {
          assert.ok(incoming(node.id).length >= 2);
          assert.strictEqual(outgoing(node.id).length, 1);
        }
      }
    }
  }
});
}
{
const b2ExpectedKeywords = {
  'ml-logistic-regression-model-pipeline': ['model pipeline', 'threshold decision', 'linear then sigmoid'],
  'ml-logistic-regression-log-loss': ['log loss', 'confident wrong', 'two curves'],
  'ml-logistic-regression-gradient-descent': ['gradient descent', 'training loop', 'weight update'],
  'ml-logistic-regression-linear-separator': ['decision boundary', 'two clusters', 'linear separator'],
};
const b2ExpectedKinds = {
  'ml-logistic-regression-model-pipeline': ['flow', 'flow', 'flow'],
  'ml-logistic-regression-log-loss': ['flow', 'coordinate-plot', 'coordinate-plot'],
  'ml-logistic-regression-gradient-descent': ['cycle', 'cycle', 'cycle'],
  'ml-logistic-regression-linear-separator': ['flow', 'coordinate-plot', 'coordinate-plot'],
};
const b2RoundTest = value => Number(value.toFixed(3));
const b2SumTest = values => values.reduce((a, b) => a + b, 0);
const b2ProbabilityTest = z => Math.exp(z) / (1 + Math.exp(z));
const b2RefTest = id => references.find(item => item.id === id);
const b2DiagramTest = (id, depth) => b2RefTest(id).depths[depth].spec.diagram;
function b2NumbersTest(value) {
  if (typeof value === 'number') return [value];
  if (Array.isArray(value)) return value.flatMap(b2NumbersTest);
  if (value && typeof value === 'object') return Object.values(value).flatMap(b2NumbersTest);
  return [];
}
function b2CloseTest(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-11, `${actual} differs from ${expected}`);
}
function b2IndependentTest() {
  const rows = data.toyData.rows;
  const labels = [...new Set(rows.map(row => row[1]))].sort();
  const zero = Math.min(...labels);
  const one = Math.max(...labels);
  const two = labels.length;
  const half = (zero + one) / two;
  const firstPositive = Math.min(...rows.filter(row => row[1] === one).map(row => row[0]));
  const x = firstPositive + two;
  const w = one;
  const b = -firstPositive;
  const z = w * x + b;
  const p = b2ProbabilityTest(z);
  const pipeline = { w, b, threshold: half, x, z, p, prediction: p >= half ? one : zero };
  const selected = data.illustration.lossProbabilities.filter((probability, index) => index % two === zero || probability === half);
  const loss = {
    x: selected,
    positive: selected.map(probability => -Math.log(probability)),
    negative: selected.map(probability => -Math.log1p(-probability)),
    max: Math.ceil(Math.max(...data.illustration.lossProbabilities.flatMap(probability => [-Math.log(probability), -Math.log1p(-probability)]))),
  };
  const n = rows.length;
  const initialP = b2ProbabilityTest(zero);
  const errors = rows.map(([, actual]) => initialP - actual);
  const sumDw = b2SumTest(rows.map(([hours], index) => hours * errors[index]));
  const sumDb = b2SumTest(errors);
  const dw = sumDw / n;
  const db = sumDb / n;
  const learningRate = data.illustration.learningRate;
  const training = { n, initialP, sumDw, sumDb, dw, db, learningRate,
    w: zero - learningRate * dw, b: zero - learningRate * db,
    sumMagnitude: Math.abs(sumDw), magnitude: Math.abs(dw) };
  const low = rows[one][zero];
  const high = firstPositive;
  const total = low + high;
  const midpoint = total / two;
  const clusters = [low, high].map(center => [
    { x: center, y: center },
    { x: center - half, y: center },
    { x: center, y: center + half },
  ]);
  const samples = [-half, zero, half].map(offset => {
    const coordinate = midpoint + offset;
    const score = coordinate + coordinate - total;
    const probability = b2ProbabilityTest(score);
    return { x: coordinate, y: coordinate, z: score, p: probability,
      prediction: probability >= half ? one : zero };
  });
  const boundary = { total, b: -total, midpoint, clusters, samples,
    line: [{ x: zero, y: total }, { x: total, y: zero }] };
  return { zero, one, two, half, pipeline, loss, training, boundary };
}
function b2VisibleNumbersTest(value, key = '') {
  if (typeof value === 'number') return [value];
  if (Array.isArray(value)) return value.flatMap(child => b2VisibleNumbersTest(child, key));
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([childKey, child]) => b2VisibleNumbersTest(child, childKey));
  if (typeof value === 'string' && ['title', 'caption', 'label', 'heading', 'cells', 'steps', 'columns'].includes(key)) {
    return [...value.matchAll(/[+-]?(?:\d+\.?\d*|\.\d+)/g)].map(match => Number(match[0]));
  }
  return [];
}
function b2ElementCountTest(diagram) {
  if (diagram.kind === 'flow') return diagram.nodes.length + diagram.edges.length;
  if (diagram.kind === 'cycle') return diagram.steps.length;
  return diagram.series.reduce((count, series) => count + (series.points ? series.points.length : series.samples.y.length), 0);
}

test('logistic-regression batch preserves prompt routing, provenance and depth kinds', () => {
  const rows = replay.prompts.filter(row => Object.hasOwn(b2ExpectedKeywords, row.referenceId));
  assert.strictEqual(rows.length, Object.keys(b2ExpectedKeywords).length);
  for (const row of rows) {
    const ref = b2RefTest(row.referenceId);
    assert.ok(ref);
    assert.ok(ref.prompts.includes(row.prompt));
    assert.deepStrictEqual(ref.keywords, b2ExpectedKeywords[row.referenceId]);
    assert.deepStrictEqual(ref.shortKeywords, ref.keywords);
    for (const keyword of ref.keywords) {
      assert.strictEqual(keyword, keyword.toLowerCase());
      assert.ok(keyword.split(/\s+/).length <= 3);
    }
    assert.deepStrictEqual(ref.lessons, data.metadata.lessons);
    assert.deepStrictEqual(ref.sources, data.metadata.sources);
    assert.strictEqual(ref.origin, 'lesson');
    assert.ok(ref.promptOrigins.some(origin => origin.prompt === row.prompt && origin.origin === 'lesson' && origin.lesson === data.metadata.lessons[0]));
    assert.strictEqual(row.paraphrases.length, 5);
    assert.strictEqual(new Set(row.paraphrases).size, row.paraphrases.length);
    row.paraphrases.forEach(paraphrase => assert.ok(ref.prompts.includes(paraphrase)));
    const depths = ['overview', 'standard', 'deep'];
    assert.deepStrictEqual(depths.map(depth => ref.depths[depth].spec.diagram.kind), b2ExpectedKinds[row.referenceId]);
    assert.deepStrictEqual(ref.spec, ref.depths.standard.spec);
    assert.ok(b2ElementCountTest(ref.depths.overview.spec.diagram) < b2ElementCountTest(ref.spec.diagram));
    assert.notStrictEqual(ref.depths.deep.spec.diagram.caption, ref.spec.diagram.caption);
  }
});

test('logistic-regression batch independently recomputes every displayed number', () => {
  const expected = b2IndependentTest();
  const independentlyComputed = b2NumbersTest(expected).flatMap(value => [value, b2RoundTest(value), Math.abs(value), Math.abs(b2RoundTest(value))]);
  const supplied = [...b2NumbersTest(data.derived()), ...b2NumbersTest(derived())];
  for (const id of Object.keys(b2ExpectedKeywords)) {
    const ref = b2RefTest(id);
    for (const depth of Object.values(ref.depths)) {
      for (const visual of [depth.spec, depth.detailSpec].filter(Boolean)) {
        assert.ok(visual.diagram.caption.startsWith('Illustrative values;'));
        for (const value of b2VisibleNumbersTest(visual)) {
          assert.ok(independentlyComputed.some(expectedValue => Math.abs(value - expectedValue) < 1e-11), `${id}: ${value} was not independently recomputed`);
          assert.ok(supplied.some(suppliedValue => Math.abs(value - suppliedValue) < 1e-11), `${id}: ${value} is absent from derived results`);
        }
      }
    }
  }
  b2CloseTest(derived().logisticGradientSumMagnitude, expected.training.sumMagnitude);
  b2CloseTest(derived().logisticGradientMagnitude, expected.training.magnitude);
});

test('logistic-regression pipeline substitutes the input before sigmoid and threshold', () => {
  const e = b2IndependentTest();
  const raw = data.derived().pipeline;
  b2CloseTest(raw.w, e.pipeline.w);
  b2CloseTest(raw.b, e.pipeline.b);
  const example = raw.examples.at(-1);
  for (const field of ['x', 'z', 'p', 'prediction']) b2CloseTest(example[field], e.pipeline[field]);
  const standard = b2DiagramTest('ml-logistic-regression-model-pipeline', 'standard');
  const deep = b2DiagramTest('ml-logistic-regression-model-pipeline', 'deep');
  assert.strictEqual(standard.nodes.find(node => node.id === 'q').label, `Is $p≥${e.half}$?`);
  assert.strictEqual(deep.nodes.find(node => node.id === 'x').label, `Take $x=${e.pipeline.x}$ hours`);
  assert.strictEqual(deep.caption, `Illustrative values; $z=${e.pipeline.w}×${e.pipeline.x}${e.pipeline.b}=${e.pipeline.z}$; $p≈${b2RoundTest(e.pipeline.p)}$; predict $${e.pipeline.prediction}$.`);
  const branches = standard.edges.filter(edge => edge.from === 'q');
  assert.deepStrictEqual(branches.map(edge => edge.label), ['Yes', 'No']);
  assert.strictEqual(standard.nodes.find(node => node.id === branches[0].to).label, `Predict $${e.one}$`);
  assert.strictEqual(standard.nodes.find(node => node.id === branches[1].to).label, `Predict $${e.zero}$`);
});

test('logistic-regression loss samples are recomputed logarithms, with a new Detailed formula', () => {
  const e = b2IndependentTest();
  for (const depth of ['standard', 'deep']) {
    const diagram = b2DiagramTest('ml-logistic-regression-log-loss', depth);
    assert.deepStrictEqual(diagram.x, { label: 'Predicted pass probability', min: e.zero, max: e.one });
    assert.deepStrictEqual(diagram.y, { label: 'Log loss (nats)', min: e.zero, max: e.loss.max });
    assert.deepStrictEqual(diagram.series[0].samples, { x: e.loss.x, y: e.loss.positive.map(b2RoundTest) });
    assert.deepStrictEqual(diagram.series[1].samples, { x: e.loss.x, y: e.loss.negative.map(b2RoundTest) });
    assert.strictEqual(diagram.series[0].label, `$y=${e.one}$`);
    assert.strictEqual(diagram.series[1].label, `$y=${e.zero}$`);
  }
  const caption = b2DiagramTest('ml-logistic-regression-log-loss', 'deep').caption;
  assert.ok(caption.includes('$L=-y\\ln(p)-(1-y)\\ln(1-p)$'));
  assert.ok(e.loss.positive[0] > e.loss.positive.at(-1));
  assert.ok(e.loss.negative[0] < e.loss.negative.at(-1));
});

test('logistic-regression gradient update includes independently recomputed magnitudes', () => {
  const e = b2IndependentTest();
  const t = e.training;
  const raw = data.derived().training;
  for (const field of ['n', 'sumDw', 'sumDb', 'dw', 'db', 'learningRate']) b2CloseTest(raw[field], t[field]);
  b2CloseTest(raw.after.w, t.w);
  b2CloseTest(raw.after.b, t.b);
  const r = b2RoundTest;
  const deep = b2DiagramTest('ml-logistic-regression-gradient-descent', 'deep');
  assert.strictEqual(deep.caption, `Illustrative values; $\\eta=${t.learningRate}$, $dw=${r(t.sumDw)}/${t.n}=${r(t.dw)}$, $db=${r(t.sumDb)}/${t.n}=${r(t.db)}$; $w'=${r(t.w)},b'=${r(t.b)}$. Stop when converged.`);
  assert.ok(deep.steps.some(step => step.includes('\\sum(p-y)x')));
  assert.ok(deep.steps.some(step => step.includes('\\eta dw')));
  const expectedStages = ['forward', 'loss', 'gradients', 'update'];
  assert.strictEqual(deep.steps.length, expectedStages.length);
});

test('logistic-regression separator and sample probabilities follow the illustrative model', () => {
  const e = b2IndependentTest();
  const raw = data.derived().boundary;
  b2CloseTest(raw.b, e.boundary.b);
  b2CloseTest(raw.midpoint, e.boundary.midpoint);
  for (const depth of ['standard', 'deep']) {
    const diagram = b2DiagramTest('ml-logistic-regression-linear-separator', depth);
    assert.deepStrictEqual(diagram.x, { label: 'Study time (hours)', min: e.zero, max: e.boundary.total });
    assert.deepStrictEqual(diagram.y, { label: 'Practice time (hours)', min: e.zero, max: e.boundary.total });
    e.boundary.clusters.forEach((points, index) => {
      assert.deepStrictEqual(diagram.series[index].samples, { x: points.map(point => point.x), y: points.map(point => point.y) });
    });
    assert.deepStrictEqual(diagram.series.at(-1).points, e.boundary.line);
    diagram.series.at(-1).points.forEach(point => b2CloseTest(point.x + point.y + e.boundary.b, e.zero));
  }
  assert.strictEqual(b2DiagramTest('ml-logistic-regression-linear-separator', 'deep').caption, `Illustrative values; $x_1+x_2${e.boundary.b}=0$ gives $p=${e.half}$ on the line.`);
  const detail = b2RefTest('ml-logistic-regression-linear-separator').depths.deep.detailSpec.diagram;
  assert.deepStrictEqual(detail.series[0].points, e.boundary.line);
  assert.deepStrictEqual(detail.series[1].points, e.boundary.samples.map(sample => ({ x: sample.x, y: sample.y, label: `$z=${sample.z},p≈${b2RoundTest(sample.p)}$` })));
  raw.samples.forEach((sample, index) => {
    for (const field of ['x', 'y', 'z', 'p', 'prediction']) b2CloseTest(sample[field], e.boundary.samples[index][field]);
  });
});
}
{
const lr3Near = (a, b) => assert.ok(Math.abs(a - b) <= 1e-11 * Math.max(1, Math.abs(b)), `${a} != ${b}`);
const lr3Round = n => Math.round(n * 1000) / 1000;
const lr3Sum = values => values.reduce((a, b) => a + b, 0);
function lr3IndependentMetrics(threshold) {
  const predictions = data.extraData.rows.map(([p, actual]) => ({ p, actual, predicted: p < threshold ? 0 : 1 }));
  let tp = 0, fn = 0, fp = 0, tn = 0;
  for (const row of predictions) {
    if (row.actual) { if (row.predicted) tp++; else fn++; }
    else { if (row.predicted) fp++; else tn++; }
  }
  const predictedPositive = tp + fp;
  const predictedNegative = tn + fn;
  const actualPositive = tp + fn;
  const actualNegative = tn + fp;
  return { threshold, n: predictions.length, predictions, tp, fn, fp, tn, predictedPositive, predictedNegative, actualPositive, actualNegative,
    precision: predictedPositive ? tp / predictedPositive : 0,
    recall: actualPositive ? tp / actualPositive : 0,
    f1: 2 * tp + fp + fn ? 2 * tp / (2 * tp + fp + fn) : 0,
    accuracy: (tp + tn) / predictions.length };
}
function lr3Independent() {
  const labels = [...new Set(data.toyData.rows.map(row => row.at(-1)))].sort();
  const [zero, one] = labels;
  const scores = [labels.length, one, zero];
  const classes = scores.map((_, i) => i);
  const exponentials = scores.map(z => Math.E ** z);
  const denominator = lr3Sum(exponentials);
  const shifted = scores.map(z => Math.exp(z - Math.max(...scores)));
  const probabilities = shifted.map(value => value / lr3Sum(shifted));
  const softmax = { classes, scores, exponentials, denominator, probabilities, total: lr3Sum(probabilities), winner: scores.indexOf(Math.max(...scores)), classCount: classes.length };
  const total = data.illustration.imbalance.total;
  const positive = total * data.illustration.imbalance.positiveRate;
  const negative = total - positive;
  const imbalance = { total, positive, negative, tp: zero, fn: positive, fp: zero, tn: negative,
    accuracy: negative / total, recall: zero / positive,
    accuracyPercent: negative / total * total, recallPercent: zero / positive * total,
    negativePercent: negative / total * total, positivePercent: positive / total * total };
  return { constants: { zero, one, two: labels.length, half: (zero + one) / labels.length }, softmax, imbalance,
    confusion: lr3IndependentMetrics((zero + one) / labels.length),
    thresholds: data.illustration.thresholds.map(lr3IndependentMetrics) };
}
function lr3Compare(actual, expected) {
  if (typeof expected === 'number') { lr3Near(actual, expected); return; }
  if (Array.isArray(expected)) {
    assert.strictEqual(actual.length, expected.length);
    expected.forEach((value, i) => lr3Compare(actual[i], value));
    return;
  }
  for (const [key, value] of Object.entries(expected)) lr3Compare(actual[key], value);
}
function lr3Rounded(value) {
  if (typeof value === 'number') return lr3Round(value);
  if (Array.isArray(value)) return value.map(lr3Rounded);
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, lr3Rounded(child)]));
}
function lr3Numbers(value) {
  if (typeof value === 'number') return [value];
  if (!value || typeof value !== 'object') return [];
  return Object.values(value).flatMap(lr3Numbers);
}
function lr3Displayed(value) {
  if (typeof value === 'number') return [value];
  if (typeof value === 'string') return [...value.matchAll(/-?\d+(?:\.\d+)?/g)].map(match => Number(match[0]));
  if (!value || typeof value !== 'object') return [];
  return Object.values(value).flatMap(lr3Displayed);
}
function lr3Elements(diagram) {
  if (diagram.kind === 'bar-chart') return diagram.bars ? diagram.bars.length : diagram.categories.length * diagram.series.length;
  if (diagram.kind === 'matrix') return diagram.rows.reduce((n, row) => n + row.cells.length, 0);
  return diagram.series.reduce((n, series) => n + (series.points ? series.points.length : series.samples.y.length), 0) + (diagram.annotations || []).length;
}
const lr3Routes = [
  ['9', 'ml-logistic-regression-softmax', ['softmax', 'probabilities sum', 'multi class'], ['bar-chart', 'bar-chart', 'bar-chart']],
  ['10', 'ml-logistic-regression-accuracy-trap', ['class imbalance', 'accuracy trap', 'zero recall'], ['bar-chart', 'bar-chart', 'bar-chart']],
  ['11', 'ml-logistic-regression-confusion-matrix', ['confusion matrix', 'true positive', 'false negative'], ['matrix', 'matrix', 'matrix']],
  ['12', 'ml-logistic-regression-threshold-tradeoff', ['threshold tuning', 'precision recall', 'tradeoff'], ['matrix', 'coordinate-plot', 'coordinate-plot']],
];
test('logistic-regression batch metrics independently reproduce derived and rounded values', () => {
  const expected = lr3Independent();
  const d = derived();
  const shared = data.derived();
  lr3Compare(d, expected);
  lr3Compare(d.display, lr3Rounded(expected));
  for (const key of ['softmax', 'imbalance', 'confusion', 'thresholds']) assert.deepStrictEqual(d[key], shared[key]);
  lr3Near(lr3Sum(expected.softmax.probabilities), expected.constants.one);
  assert.strictEqual(expected.softmax.winner, expected.softmax.probabilities.indexOf(Math.max(...expected.softmax.probabilities)));
  for (const m of expected.thresholds) {
    assert.strictEqual(m.tp + m.fn + m.fp + m.tn, data.extraData.rows.length);
    lr3Near(m.f1, m.precision + m.recall ? 2 * m.precision * m.recall / (m.precision + m.recall) : 0);
  }
});
test('logistic-regression batch preserves own prompts, short keywords and provenance at every depth', () => {
  for (const [promptId, referenceId, keywords, kinds] of lr3Routes) {
    const ref = references.find(item => item.id === referenceId);
    const row = replay.prompts.find(item => String(item.id) === promptId);
    assert.ok(ref && row);
    assert.strictEqual(row.referenceId, referenceId);
    assert.ok(ref.prompts.includes(row.prompt));
    assert.deepStrictEqual(ref.keywords, keywords);
    assert.deepStrictEqual(ref.shortKeywords, keywords);
    assert.strictEqual(row.paraphrases.length, 5);
    assert.strictEqual(new Set(row.paraphrases).size, 5);
    for (const phrase of row.paraphrases) assert.ok(ref.prompts.includes(phrase));
    for (const keyword of keywords) {
      assert.strictEqual(keyword, keyword.toLowerCase());
      assert.ok(keyword.split(/\s+/).length <= 3);
    }
    assert.deepStrictEqual(ref.lessons, data.metadata.lessons);
    assert.deepStrictEqual(ref.sources, data.metadata.sources);
    assert.strictEqual(ref.origin, 'lesson');
    assert.strictEqual(ref.lesson, data.metadata.lessons[0]);
    assert.strictEqual(ref.promptOrigins[0].prompt, row.prompt);
    assert.strictEqual(String(ref.promptOrigins[0].id), promptId);
    assert.strictEqual(ref.promptOrigins[0].origin, 'lesson');
    ['overview', 'standard', 'deep'].forEach((depth, i) => {
      assert.strictEqual(ref.depths[depth].spec.diagram.kind, kinds[i]);
      assert.ok(ref.depths[depth].spec.diagram.caption.length <= 280);
    });
    assert.deepStrictEqual(ref.spec, ref.depths.standard.spec);
    assert.ok(lr3Elements(ref.depths.overview.spec.diagram) < lr3Elements(ref.spec.diagram));
    assert.notStrictEqual(ref.depths.deep.spec.diagram.caption, ref.spec.diagram.caption);
  }
});
test('logistic-regression every displayed batch number is independently recomputed and present in derived', () => {
  const expected = lr3Independent();
  const expectedNumbers = [...lr3Numbers(expected), ...lr3Numbers(lr3Rounded(expected))];
  const producedNumbers = lr3Numbers(derived());
  for (const [, id] of lr3Routes) {
    const ref = references.find(item => item.id === id);
    for (const depth of ['overview', 'standard', 'deep']) {
      for (const value of lr3Displayed(ref.depths[depth].spec.diagram)) {
        assert.ok(expectedNumbers.some(n => Math.abs(n - value) <= 1e-11), `${id}: unrecomputed display ${value}`);
        assert.ok(producedNumbers.some(n => Math.abs(n - value) <= 1e-11), `${id}: absent from derived ${value}`);
      }
    }
  }
});
test('logistic-regression plotted values and confusion cells match their arithmetic', () => {
  const expected = lr3Rounded(lr3Independent());
  const find = id => references.find(ref => ref.id === id);
  const softmax = find('ml-logistic-regression-softmax');
  assert.deepStrictEqual(softmax.depths.overview.spec.diagram.bars.map(bar => bar.value), expected.softmax.probabilities);
  for (const depth of ['standard', 'deep']) {
    const diagram = softmax.depths[depth].spec.diagram;
    assert.ok(diagram.unit.length <= 12);
    assert.deepStrictEqual(diagram.categories, expected.softmax.classes.map(c => `Class ${c}`));
    assert.deepStrictEqual(diagram.series.map(series => series.values), [expected.softmax.scores, expected.softmax.probabilities]);
    const imbalance = find('ml-logistic-regression-accuracy-trap').depths[depth].spec.diagram;
    assert.deepStrictEqual(imbalance.series.map(series => series.values), [[expected.imbalance.tn, expected.imbalance.tp], [expected.imbalance.fp, expected.imbalance.fn]]);
    const m = expected.confusion;
    const matrix = find('ml-logistic-regression-confusion-matrix').depths[depth].spec.diagram;
    assert.deepStrictEqual(matrix.rows.map(row => row.cells), [[`TP ${m.tp}`, `FN ${m.fn}`, String(m.actualPositive)], [`FP ${m.fp}`, `TN ${m.tn}`, String(m.actualNegative)]]);
    const plot = find('ml-logistic-regression-threshold-tradeoff').depths[depth].spec.diagram;
    assert.deepStrictEqual(plot.series.map(series => series.samples.x), [expected.thresholds.map(m => m.threshold), expected.thresholds.map(m => m.threshold)]);
    assert.deepStrictEqual(plot.series.map(series => series.samples.y), [expected.thresholds.map(m => m.precision), expected.thresholds.map(m => m.recall)]);
    assert.strictEqual(plot.annotations[0].x, m.threshold);
    assert.strictEqual(plot.annotations[0].y, m.precision);
  }
  const briefImbalance = find('ml-logistic-regression-accuracy-trap').depths.overview.spec.diagram;
  assert.deepStrictEqual(briefImbalance.bars.map(bar => bar.value), [expected.imbalance.negative, expected.imbalance.positive]);
  const m = expected.confusion;
  assert.deepStrictEqual(find('ml-logistic-regression-confusion-matrix').depths.overview.spec.diagram.rows.map(row => row.cells), [[`TP ${m.tp}`, `FN ${m.fn}`], [`FP ${m.fp}`, `TN ${m.tn}`]]);
  const ends = [expected.thresholds[0], expected.thresholds.at(-1)];
  assert.deepStrictEqual(find('ml-logistic-regression-threshold-tradeoff').depths.overview.spec.diagram.rows.map(row => row.cells), ends.map(m => [String(m.precision), String(m.recall)]));
});
}
