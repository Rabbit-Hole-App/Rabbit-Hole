import test from 'node:test';
import assert from 'node:assert';
import * as data from './topic-linear-regression-data.js';
import { references, derived } from './topic-linear-regression-references.js';
import replay from './topic-linear-regression-replay-cases.json' with { type: 'json' };
test('the merged derived() carries every value of the data module', () => assert.deepStrictEqual(Object.fromEntries(Object.keys(data.derived()).map(key => [key, derived()[key]])), data.derived()));
{
const lrNumbers = value => typeof value === 'number' ? [value] : Array.isArray(value) ? value.flatMap(lrNumbers) : value && typeof value === 'object' ? Object.values(value).flatMap(lrNumbers) : [];
const lrClose = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
const lrTotal = values => values.reduce((a, b) => a + b, 0);
const lrRows = data.toyData.rows;
const lrN = lrRows.length;
const lrSX = lrTotal(lrRows.map(([x]) => x));
const lrSY = lrTotal(lrRows.map(([, y]) => y));
const lrXX = lrTotal(lrRows.map(([x]) => x * x));
const lrXY = lrTotal(lrRows.map(([x, y]) => x * y));
const lrYY = lrTotal(lrRows.map(([, y]) => y * y));
const lrMX = lrSX / lrN;
const lrMY = lrSY / lrN;
const lrSxx = lrXX - lrSX * lrSX / lrN;
const lrSxy = lrXY - lrSX * lrSY / lrN;
const lrSyy = lrYY - lrSY * lrSY / lrN;
const lrW = (lrN * lrXY - lrSX * lrSY) / (lrN * lrXX - lrSX * lrSX);
const lrB = (lrXX * lrSY - lrSX * lrXY) / (lrN * lrXX - lrSX * lrSX);
const lrPredictions = lrRows.map(([x]) => lrW * x + lrB);
const lrGaps = lrRows.map(([, y], i) => y - lrPredictions[i]);
const lrSquares = lrGaps.map(gap => gap * gap);
const lrSse = lrTotal(lrSquares);
const lrMse = lrSse / lrN;
const lrOne = data.toyData.features.length;
const lrZero = lrN - lrN;
const lrEndX = Math.max(...lrRows.map(([x]) => x)) + lrOne;
const lrEndY = lrW * lrEndX + lrB;
const lrToyYMax = Math.ceil(Math.max(lrEndY, ...lrRows.map(([, y]) => y)));
const lrProfile = Array.from({ length: lrN }, (_, i) => {
  const w = lrW * i / 2;
  const b = lrTotal(lrRows.map(([x, y]) => y - w * x)) / lrN;
  const mse = lrTotal(lrRows.map(([x, y]) => (y - w * x - b) ** 2)) / lrN;
  return { w, b, mse };
});
const lrIndependent = lrNumbers({ rows: lrRows, n: lrN, zero: lrZero, one: lrOne, two: 2, negativeOne: -lrOne, w: lrW, b: lrB, predictions: lrPredictions, gaps: lrGaps, squares: lrSquares, sse: lrSse, mse: lrMse, line: [lrZero, lrEndX, lrB, lrEndY], triangle: [lrMX, lrMX + lrOne, lrMY, lrMY + lrW * lrOne, lrW * lrOne], axes: [lrToyYMax, Math.max(...lrProfile.map(p => p.w)), Math.max(...lrProfile.map(p => p.mse))], profile: lrProfile, numerator: [lrSxx, -2 * lrSxy, Math.abs(-2 * lrSxy), lrSyy], means: [lrMX, lrMY] });
const lrModuleNumbers = lrNumbers([data.derived(), derived()]);
const lrBatchIds = new Set(replay.prompts.filter(row => ['ml-linear-regression-slope-intercept', 'ml-linear-regression-residual-mse', 'ml-linear-regression-cost-bowl', 'ml-linear-regression-training-loop'].includes(row.referenceId)).map(row => row.referenceId));

test('linear-regression batch: recomputed fit, gaps, profile, and display derivations', () => {
  const d = data.derived();
  assert.ok(lrClose(d.fit.w, lrW));
  assert.ok(lrClose(d.fit.b, lrB));
  assert.ok(lrClose(d.fit.sse, lrSse));
  assert.ok(lrClose(d.fit.mse, lrMse));
  assert.strictEqual(d.counts.rows, lrN);
  assert.ok(lrClose(d.fit.triangle.run, lrOne));
  assert.ok(lrClose(d.fit.triangle.rise, lrW * lrOne));
  assert.ok(lrClose(d.fit.intercept.x, lrZero));
  assert.ok(lrClose(d.fit.intercept.y, lrB));
  assert.ok(lrClose(d.axes.toy.xMax, lrEndX));
  assert.ok(lrClose(d.axes.toy.yMax, lrToyYMax));
  lrRows.forEach(([x, y], i) => {
    assert.strictEqual(d.points[i].x, x);
    assert.strictEqual(d.points[i].y, y);
    assert.ok(lrClose(d.fit.predictions[i], lrPredictions[i]));
    assert.ok(lrClose(d.fit.residuals[i], lrGaps[i]));
    assert.ok(lrClose(d.fit.squares[i], lrSquares[i]));
  });
  lrProfile.forEach((point, i) => {
    for (const key of ['w', 'b', 'mse']) assert.ok(lrClose(d.profile.samples[i][key], point[key]));
  });
  assert.ok(lrClose(d.profile.numerator.quadratic, lrSxx));
  assert.ok(lrClose(d.profile.numerator.linear, -2 * lrSxy));
  assert.ok(lrClose(d.profile.numerator.constant, lrSyy));
  assert.strictEqual(d.profile.divisor, lrN);
  assert.ok(lrNumbers(derived()).some(value => lrClose(value, Math.abs(-2 * lrSxy))));
  assert.ok(lrSxx > 0);
  assert.ok(lrProfile.every(point => point.mse >= lrMse - 1e-9));
});

function lrCheckDisplay(value) {
  if (typeof value === 'number') {
    assert.ok(lrModuleNumbers.some(number => lrClose(number, value)), `not in derived(): ${value}`);
    assert.ok(lrIndependent.some(number => lrClose(number, value)), `not independently recomputed: ${value}`);
  } else if (typeof value === 'string') {
    for (const match of value.matchAll(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi)) {
      const number = Math.abs(Number(match[0]));
      assert.ok(lrModuleNumbers.some(candidate => lrClose(Math.abs(candidate), number)), `label number absent from derived(): ${match[0]}`);
      assert.ok(lrIndependent.some(candidate => lrClose(Math.abs(candidate), number)), `label arithmetic not recomputed: ${match[0]}`);
    }
  } else if (Array.isArray(value)) value.forEach(lrCheckDisplay);
  else if (value && typeof value === 'object') Object.values(value).forEach(lrCheckDisplay);
}

function lrVisible(diagram) {
  if (diagram.kind === 'cycle') return diagram.steps.length;
  return diagram.series.reduce((count, series) => count + (series.points ? series.points.length : series.samples.y.length), 0) + (diagram.annotations || []).length;
}

test('linear-regression batch: every depth uses derived display numbers and adds technical depth', () => {
  for (const ref of references.filter(item => lrBatchIds.has(item.id))) {
    const overview = ref.depths.overview.spec.diagram;
    const standard = ref.spec.diagram;
    const deep = ref.depths.deep.spec.diagram;
    for (const diagram of [overview, standard, deep]) lrCheckDisplay(diagram);
    assert.ok(lrVisible(overview) < lrVisible(standard), ref.id);
    assert.notStrictEqual(deep.caption, standard.caption, ref.id);
    const balancedText = JSON.stringify(standard);
    const detailedText = JSON.stringify(deep);
    const balancedNumbers = new Set((balancedText.match(/\d+(?:\.\d+)?/g) || []));
    assert.ok((detailedText.match(/\d+(?:\.\d+)?/g) || []).some(number => !balancedNumbers.has(number)), `${ref.id}: Detailed needs new arithmetic`);
  }
});

test('linear-regression batch: prompt origins, learner keywords, and depth replay coverage', () => {
  assert.strictEqual(lrBatchIds.size, 4);
  for (const row of replay.prompts.filter(item => lrBatchIds.has(item.referenceId))) {
    const matches = references.filter(ref => ref.id === row.referenceId);
    assert.strictEqual(matches.length, 1);
    const ref = matches[0];
    assert.ok(ref.prompts.includes(row.prompt));
    assert.strictEqual(row.paraphrases.length, 5);
    assert.strictEqual(new Set(row.paraphrases).size, 5);
    row.paraphrases.forEach(text => assert.ok(ref.prompts.includes(text)));
    assert.ok(ref.keywords.length >= 2 && ref.keywords.length <= 3);
    ref.keywords.forEach(keyword => {
      assert.strictEqual(keyword, keyword.toLowerCase());
      assert.ok(keyword.trim().split(/\s+/).length <= 3);
      assert.ok(ref.shortKeywords.includes(keyword));
    });
    assert.deepEqual(ref.lessons, data.metadata.lessons);
    assert.deepEqual(ref.sources, data.metadata.sources);
    assert.ok(ref.promptOrigins.some(origin => origin.prompt === row.prompt && origin.origin === 'lesson' && origin.lesson === data.metadata.lessons[0]));
    for (const depth of ['overview', 'standard', 'deep']) {
      const diagram = ref.depths[depth].spec.diagram;
      assert.strictEqual(diagram.kind, row.referenceId.endsWith('training-loop') ? 'cycle' : 'coordinate-plot');
      if (diagram.x) assert.ok(!/units|48ths|7\.5°/i.test(diagram.x.label));
      if (diagram.y) assert.ok(!/units|48ths|7\.5°/i.test(diagram.y.label));
    }
  }
});
}
{
const lr2Sum = xs => xs.reduce((a, b) => a + b, 0);
const lr2Close = (a, b, label) => assert.ok(Math.abs(a - b) <= 2e-10 * Math.max(1, Math.abs(b)), `${label}: ${a} versus ${b}`);
const lr2Leaves = value => typeof value === 'number' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(lr2Leaves) : [];
function lr2CheckSubset(actual, expected, path = 'derived') {
  if (typeof expected === 'number') return lr2Close(actual, expected, path);
  Object.entries(expected).forEach(([key, value]) => lr2CheckSubset(actual[key], value, `${path}.${key}`));
}
function lr2Independent() {
  const rows = data.toyData.rows;
  const n = rows.length;
  const xs = rows.map(row => row[0]);
  const ys = rows.map(row => row[1]);
  const meanX = lr2Sum(xs) / n;
  const meanY = lr2Sum(ys) / n;
  const sxx = lr2Sum(xs.map(x => (x - meanX) ** 2));
  const sxy = lr2Sum(rows.map(([x, y]) => (x - meanX) * (y - meanY)));
  const sumXY = lr2Sum(rows.map(([x, y]) => x * y));
  const w = sxy / sxx;
  const b = meanY - w * meanX;
  const initialCost = lr2Sum(ys.map(y => y ** 2)) / n;
  const dw = -2 * sumXY / n;
  const db = -2 * lr2Sum(ys) / n;
  const steps = [1 / 100, 1 / 10].map(rate => {
    const stepW = -rate * dw;
    const stepB = -rate * db;
    const mse = lr2Sum(rows.map(([x, y]) => (stepW * x + stepB - y) ** 2)) / n;
    return { rate, step: 1, w: stepW, b: stepB, deltaW: stepW, mse };
  });
  const radiusX = (Math.max(...xs) - Math.min(...xs)) / 2;
  const radiusY = 1 / 2;
  const rawHessian = [1, radiusX ** 2 / radiusY ** 2];
  const rawRate = (2 - 1 / n) / rawHessian[1];
  const scaledHessian = [1, 1];
  const scaledRate = 1 - 1 / (2 * n);
  function path(hessian, rate) {
    let x = -meanX / 2;
    let y = 2 / n;
    const points = [];
    for (let i = 0; i < n - 1; i += 1) {
      points.push({ x, y });
      x -= rate * hessian[0] * x;
      y -= rate * hessian[1] * y;
    }
    return points;
  }
  return {
    constants: { zero: 0, one: 1, two: 2 },
    counts: { rows: n },
    summary: { meanX, meanY, sxx, sxy, sumXY },
    fit: { w, b },
    descent: { start: { w: 0, b: 0, mse: initialCost, dw, db }, steps },
    axes: {
      weight: { min: 0, max: w + steps[1].rate },
      learningCost: { xMin: 0, xMax: 1, yMin: 0, yMax: Math.ceil(Math.max(initialCost, ...steps.map(step => step.mse))) },
      contours: { xMin: -radiusX, xMax: radiusX, yMin: -radiusX, yMax: radiusX }
    },
    scaling: {
      rawContour: { radiusX, radiusY },
      scaledContour: { radiusX, radiusY: radiusX },
      rawDescent: { points: path(rawHessian, rawRate) },
      scaledDescent: { points: path(scaledHessian, scaledRate) }
    }
  };
}
const lr2Ids = ['ml-linear-regression-first-step', 'ml-linear-regression-learning-rate', 'ml-linear-regression-normal-equation', 'ml-linear-regression-feature-scaling'];
function lr2Visuals(ref) {
  return ['overview', 'standard', 'deep'].flatMap(depth => {
    const entry = ref.depths[depth];
    return [entry.spec, entry.detailSpec].filter(Boolean);
  });
}
test('linear-regression batch: independently recompute every displayed quantity', () => {
  const expected = lr2Independent();
  const actual = data.derived();
  lr2CheckSubset(actual, expected);
  const computed = lr2Leaves(expected);
  const exported = lr2Leaves([actual, derived()]);
  const contains = (values, number) => values.some(value => Math.abs(value - number) <= 2e-10 * Math.max(1, Math.abs(number)));
  function inspect(value) {
    if (typeof value === 'number') {
      assert.ok(contains(computed, value), `unrecomputed display number ${value}`);
      assert.ok(contains(exported, value), `display number absent from derived(): ${value}`);
    } else if (typeof value === 'string') {
      const numbers = value.match(/\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi) || [];
      for (const token of numbers) {
        const number = Number(token);
        assert.ok(contains(computed.map(Math.abs), number), `unrecomputed numeric label ${token}`);
        assert.ok(contains(exported.map(Math.abs), number), `numeric label absent from derived(): ${token}`);
      }
    } else if (value && typeof value === 'object') Object.values(value).forEach(inspect);
  }
  references.filter(ref => lr2Ids.includes(ref.id)).forEach(ref => lr2Visuals(ref).forEach(inspect));
  assert.ok(actual.descent.steps[0].mse < actual.descent.start.mse);
  assert.ok(actual.descent.steps[1].mse > actual.descent.start.mse);
  assert.ok(actual.descent.steps[0].w < actual.fit.w);
  assert.ok(actual.descent.steps[1].w > actual.fit.w);
});
test('linear-regression batch: prompt, learner keywords, origin and replay routes survive', () => {
  const expectedKeywords = [
    ['gradient step', 'weight update', 'first epoch'],
    ['learning rate', 'overshoot', 'cost increase'],
    ['normal equation', 'closed form', 'direct solve'],
    ['feature scaling', 'standardization', 'elongated contours']
  ];
  for (const [index, id] of lr2Ids.entries()) {
    const ref = references.find(item => item.id === id);
    const row = replay.prompts.find(item => item.referenceId === id);
    assert.ok(ref && row, id);
    assert.ok(ref.prompts.includes(row.prompt));
    assert.deepEqual(ref.keywords, expectedKeywords[index]);
    assert.deepEqual(ref.shortKeywords, expectedKeywords[index]);
    assert.strictEqual(row.paraphrases.length, 5);
    assert.strictEqual(new Set(row.paraphrases).size, row.paraphrases.length);
    row.paraphrases.forEach(prompt => assert.ok(ref.prompts.includes(prompt)));
    assert.deepEqual(ref.lessons, data.metadata.lessons);
    assert.deepEqual(ref.sources, data.metadata.sources);
    assert.ok(ref.promptOrigins.some(origin => origin.prompt === row.prompt && origin.origin === 'lesson' && origin.lesson === data.metadata.lessons[0]));
    ref.keywords.forEach(keyword => {
      assert.strictEqual(keyword, keyword.toLowerCase());
      assert.ok(keyword.split(/\s+/).length <= 3);
    });
    ['overview', 'standard', 'deep'].forEach(depth => assert.ok(ref.depths[depth].spec));
  }
});
test('linear-regression batch: depth reduction, arithmetic and schematic disclosure', () => {
  const get = id => references.find(ref => ref.id === id);
  const first = get(lr2Ids[0]);
  assert.strictEqual(first.depths.overview.spec.diagram.kind, 'flow');
  assert.strictEqual(first.spec.diagram.kind, 'number-line');
  assert.ok(first.depths.overview.spec.diagram.nodes.length < first.spec.diagram.markers.length);
  assert.ok(first.depths.deep.spec.diagram.caption.includes('\\frac'));
  assert.ok(first.depths.overview.spec.diagram.nodes.every(node => !/^start\b/i.test(node.label)));
  const rate = get(lr2Ids[1]);
  assert.strictEqual(rate.depths.overview.spec.diagram.kind, 'comparison');
  assert.strictEqual(rate.spec.diagram.kind, 'coordinate-plot');
  assert.ok(rate.depths.deep.spec.diagram.caption.includes('\\sum'));
  const normal = get(lr2Ids[2]);
  assert.ok(normal.depths.overview.spec.diagram.columns[0].items.length < normal.spec.diagram.columns[0].items.length);
  assert.ok(JSON.stringify(normal.depths.deep).includes('\\frac'));
  const scaling = get(lr2Ids[3]);
  assert.strictEqual(scaling.depths.overview.spec.diagram.kind, 'flow');
  for (const depth of ['standard', 'deep']) {
    assert.ok(scaling.depths[depth].detailSpec);
    for (const entry of [scaling.depths[depth].spec, scaling.depths[depth].detailSpec]) {
      const diagram = entry.diagram;
      assert.ok(diagram.caption.startsWith('Illustrative values;'));
      assert.ok(diagram.x.unit.length <= 12);
      assert.ok(diagram.y.unit.length <= 12);
      const ellipse = diagram.annotations[0];
      assert.ok(ellipse.radiusX <= diagram.x.max);
      assert.ok(ellipse.radiusY <= diagram.y.max);
    }
  }
  assert.ok(scaling.depths.deep.detailSpec.diagram.caption.includes('\\sigma'));
});
}
{
const lrEndCases = [
  { id: 'ml-linear-regression-polynomial-overfit', prompt: 'how can a high-degree polynomial pass through every toy point and still predict badly?', keywords: ['polynomial regression', 'overfitting', 'degree'] },
  { id: 'ml-linear-regression-r-squared', prompt: 'what does an r-squared of 0.6 say about the toy fit compared with predicting the mean?', keywords: ['r-squared', 'explained variance', 'baseline mean'] },
  { id: 'ml-linear-regression-ridge-shrinkage', prompt: 'how does the ridge penalty lambda shrink the toy weight toward zero?', keywords: ['ridge regression', 'l2 penalty', 'weight shrinkage'] },
  { id: 'ml-linear-regression-held-out-row', prompt: 'what happens when one toy row is held out as a test point before fitting?', keywords: ['train test split', 'held out', 'generalization'] },
];
const lrEndNumeric = value => {
  if (typeof value === 'number') return [value];
  if (Array.isArray(value)) return value.flatMap(lrEndNumeric);
  if (value && typeof value === 'object') return Object.values(value).flatMap(lrEndNumeric);
  return [];
};
const lrEndNear = (actual, expected, path) => assert.ok(Math.abs(actual - expected) <= 2e-10 * Math.max(1, Math.abs(expected)), `${path}: ${actual} versus ${expected}`);
const lrEndCompare = (actual, expected, path = 'display') => {
  if (typeof expected === 'number') return lrEndNear(actual, expected, path);
  if (Array.isArray(expected)) {
    assert.strictEqual(actual.length, expected.length, path);
    expected.forEach((value, i) => lrEndCompare(actual[i], value, `${path}[${i}]`));
  } else if (expected && typeof expected === 'object') {
    Object.entries(expected).forEach(([key, value]) => lrEndCompare(actual[key], value, `${path}.${key}`));
  } else assert.strictEqual(actual, expected, path);
};
function lrEndIndependent() {
  const rows = data.toyData.rows;
  const n = rows.length;
  const one = data.toyData.features.length;
  const zero = n - n;
  const two = one + one;
  const total = values => values.reduce((a, b) => a + b, zero);
  const moments = entries => {
    const count = entries.length;
    const sx = total(entries.map(([x]) => x));
    const sy = total(entries.map(([, y]) => y));
    const sxxRaw = total(entries.map(([x]) => x * x));
    const sxyRaw = total(entries.map(([x, y]) => x * y));
    return { meanX: sx / count, meanY: sy / count, sxx: sxxRaw - sx * sx / count, sxy: sxyRaw - sx * sy / count };
  };
  const m = moments(rows);
  const w = m.sxy / m.sxx;
  const b = m.meanY - w * m.meanX;
  const sse = total(rows.map(([x, y]) => (y - w * x - b) ** two));
  const baselineSse = total(rows.map(([, y]) => (y - m.meanY) ** two));
  const extensionX = Math.max(...rows.map(([x]) => x)) + one;
  const target = w * extensionX + b;
  const lagrange = input => total(rows.map(([xi, yi], i) => {
    let term = yi;
    rows.forEach(([xj], j) => { if (i !== j) term *= (input - xj) / (xi - xj); });
    return term;
  }));
  const sampleCount = two * n + one + two;
  const samples = Array.from({ length: sampleCount }, (_, i) => {
    const x = extensionX * i / (sampleCount - one);
    return { x, y: lagrange(x) };
  });
  const polynomialSse = total(rows.map(([x, y]) => (lagrange(x) - y) ** two));
  const ridgeSamples = [zero, one, two, n - one].map(lambda => ({ lambda, w: (m.sxy / n) / (m.sxx / n + lambda) }));
  const training = rows.slice(zero, n - one);
  const testing = rows.slice(n - one);
  const train = moments(training);
  const trainW = train.sxy / train.sxx;
  const trainB = train.meanY - trainW * train.meanX;
  const prediction = trainW * testing[zero][zero] + trainB;
  const actual = testing[zero][one];
  return {
    constants: { zero, one, two },
    counts: { rows: n, train: training.length, test: testing.length },
    points: rows.map(([x, y], i) => ({ id: String.fromCharCode(65 + i), x, y })),
    fit: {
      w, b, sse, mse: sse / n,
      baseline: { prediction: m.meanY, sse: baselineSse },
      explainedSse: baselineSse - sse,
      rSquared: (baselineSse - sse) / baselineSse,
      benchmarks: { perfectR2: one, meanR2: zero },
      line: [{ x: zero, y: b }, { x: extensionX, y: target }],
    },
    polynomial: {
      degree: n - one,
      trainMse: polynomialSse / n,
      samples,
      newPoint: { x: extensionX, y: target, linePrediction: target, polynomialPrediction: lagrange(extensionX), lineSquaredError: zero, polynomialSquaredError: (lagrange(extensionX) - target) ** two },
    },
    ridge: { numerator: m.sxy / n, denominatorBase: m.sxx / n, asymptote: zero, samples: ridgeSamples },
    holdout: { summary: train, w: trainW, b: trainB, prediction, actual, testMse: total(testing.map(([x, y]) => (y - trainW * x - trainB) ** two)) / testing.length },
    axes: {
      polynomial: { xMin: zero, xMax: extensionX, yMin: zero, yMax: Math.ceil(Math.max(...samples.map(point => point.y), target)) },
      ridge: { xMin: zero, xMax: Math.max(...ridgeSamples.map(sample => sample.lambda)), yMin: zero, yMax: w },
    },
  };
}
function lrEndDisplayNumbers(value) {
  if (typeof value === 'number') return [value];
  if (typeof value === 'string') return Array.from(value.matchAll(/(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi), match => Number(match[0]));
  if (Array.isArray(value)) return value.flatMap(lrEndDisplayNumbers);
  if (value && typeof value === 'object') return Object.values(value).flatMap(lrEndDisplayNumbers);
  return [];
}
function lrEndElements(diagram) {
  if (diagram.kind === 'comparison') return diagram.columns.reduce((count, column) => count + column.items.length + 1, 0);
  if (diagram.kind === 'flow') return diagram.nodes.length + diagram.edges.length;
  if (diagram.kind === 'sample-set') return diagram.samples.length + diagram.groups.length;
  if (diagram.kind === 'bar-chart') return diagram.bars.length;
  if (diagram.kind === 'coordinate-plot') return diagram.series.reduce((count, series) => count + (series.points ? series.points.length : series.samples.y.length), 0) + (diagram.annotations || []).length;
  return 0;
}
test('linear-regression tail: independently recompute every displayed value', () => {
  const expected = lrEndIndependent();
  const actual = data.derived();
  lrEndCompare(actual, expected);
  const computedPool = lrEndNumeric(expected);
  const availablePool = lrEndNumeric({ ...actual, ...derived() });
  const contains = (pool, number) => pool.some(value => Math.abs(value - number) <= 2e-10 * Math.max(1, Math.abs(number)));
  for (const number of computedPool) assert.ok(contains(availablePool, number), `missing derived number ${number}`);
  for (const item of lrEndCases) {
    const ref = references.find(entry => entry.id === item.id);
    assert.ok(ref, item.id);
    for (const depth of ['overview', 'standard', 'deep']) {
      const treatment = ref.depths[depth];
      for (const visual of [treatment.spec, treatment.detailSpec].filter(Boolean)) {
        for (const number of lrEndDisplayNumbers(visual.diagram)) {
          assert.ok(contains(computedPool, number), `${item.id}/${depth}: no independent arithmetic for ${number}`);
          assert.ok(contains(availablePool, number), `${item.id}/${depth}: number absent from derived(): ${number}`);
        }
        if (visual.diagram.kind === 'bar-chart') assert.ok(visual.diagram.unit.length <= 12);
      }
    }
  }
});
test('linear-regression tail: exact prompts, learner keywords, origins and depth treatments', () => {
  for (const item of lrEndCases) {
    const ref = references.find(entry => entry.id === item.id);
    const row = replay.prompts.find(entry => entry.referenceId === item.id);
    assert.strictEqual(row.prompt, item.prompt);
    assert.ok(ref.prompts.includes(item.prompt));
    assert.deepEqual(ref.shortKeywords, item.keywords);
    item.keywords.forEach(keyword => {
      assert.ok(ref.keywords.includes(keyword));
      assert.strictEqual(keyword, keyword.toLowerCase());
      assert.ok(keyword.split(/\s+/).length <= 3);
    });
    assert.strictEqual(row.paraphrases.length, 5);
    assert.strictEqual(new Set(row.paraphrases).size, row.paraphrases.length);
    row.paraphrases.forEach(prompt => assert.ok(ref.prompts.includes(prompt)));
    assert.deepEqual(ref.lessons, data.metadata.lessons);
    assert.deepEqual(ref.sources, data.metadata.sources);
    assert.ok(ref.promptOrigins.some(origin => origin.prompt === item.prompt && origin.origin === 'lesson' && origin.lesson === data.metadata.lessons[0]));
    assert.ok(lrEndElements(ref.depths.overview.spec.diagram) < lrEndElements(ref.spec.diagram), item.id);
    const balancedText = JSON.stringify(ref.spec.diagram);
    const detailedText = JSON.stringify(ref.depths.deep);
    assert.notStrictEqual(detailedText, balancedText);
    assert.ok(detailedText.includes('$'));
  }
  const score = references.find(ref => ref.id === 'ml-linear-regression-r-squared');
  for (const depth of ['overview', 'standard', 'deep']) assert.strictEqual(score.depths[depth].spec.diagram.kind, 'bar-chart');
  const holdout = references.find(ref => ref.id === 'ml-linear-regression-held-out-row').spec.diagram;
  const d = data.derived();
  assert.deepEqual(holdout.groups[0].members, d.holdout.trainIds);
  assert.deepEqual(holdout.groups[1].members, d.holdout.testIds);
  assert.ok(holdout.groups[0].members.every(id => !holdout.groups[1].members.includes(id)));
  const ridge = references.find(ref => ref.id === 'ml-linear-regression-ridge-shrinkage').depths.overview.spec.diagram;
  assert.ok(ridge.nodes.every(node => /^(Add|Decrease)\b/.test(node.label)));
});
}
