import test from 'node:test';
import assert from 'node:assert';
import { toyData, metadata, derived } from './topic-what-is-machine-learning-data.js';

const total = values => values.reduce((a, b) => a + b, 0);
const numbers = value => typeof value === 'number' ? [value]
  : value && typeof value === 'object' ? Object.values(value).flatMap(numbers) : [];

function close(actual, expected, path = 'derived') {
  if (typeof expected === 'number') {
    assert.ok(Number.isFinite(actual), `${path} must be finite`);
    assert.ok(Math.abs(actual - expected) <= 1e-12 * Math.max(1, Math.abs(expected)), `${path}: ${actual} versus ${expected}`);
    return;
  }
  if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual), path);
    assert.strictEqual(actual.length, expected.length, path);
    expected.forEach((value, index) => close(actual[index], value, `${path}[${index}]`));
    return;
  }
  if (expected && typeof expected === 'object') {
    assert.deepStrictEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), path);
    Object.entries(expected).forEach(([key, value]) => close(actual[key], value, `${path}.${key}`));
    return;
  }
  assert.strictEqual(actual, expected, path);
}

function independentlyRecompute() {
  const rows = toyData.rows;
  const n = rows.length;
  const labels = Array.from(new Set(rows.map(row => row.at(-1)))).sort((a, b) => a - b);
  const partitions = labels.map(label => rows.filter(row => row.at(-1) === label));
  const classCounts = partitions.map(part => part.length);
  const probabilities = classCounts.map(count => count / n);
  const centers = partitions.map(part => [total(part.map(row => row[0])) / part.length, total(part.map(row => row[1])) / part.length]);
  const distanceSquared = (point, center) => total(center.map((value, index) => (point[index] - value) ** 2));
  const nearest = point => {
    const squared = centers.map(center => distanceSquared(point, center));
    let winner = 0;
    for (let index = 1; index < squared.length; index += 1) if (squared[index] < squared[winner]) winner = index;
    return { squared, distances: squared.map(value => value ** 0.5), prediction: labels[winner] };
  };
  const distances = rows.map(row => {
    const prediction = nearest(row);
    const own = labels.indexOf(row.at(-1));
    const other = labels.findIndex(label => label !== row.at(-1));
    return {
      ...prediction, ownSquared: prediction.squared[own], own: prediction.distances[own],
      otherSquared: prediction.squared[other], other: prediction.distances[other],
      correct: prediction.prediction === row.at(-1),
    };
  });
  const radius = Math.max(...distances.map(value => value.ownSquared)) ** 0.5;
  const coordinates = rows.flatMap(row => row.slice(0, toyData.features.length));
  const axis = { min: Math.min(0, ...coordinates), max: Math.max(...coordinates) + 1 };
  const vector = centers[1].map((value, index) => value - centers[0][index]);
  const midpoint = { x: total(centers.map(center => center[0])) / centers.length, y: total(centers.map(center => center[1])) / centers.length };
  const constant = vector[0] * midpoint.x + vector[1] * midpoint.y;
  const separationSquared = total(vector.map(value => value * value));
  const boundary = {
    dx: vector[0], dy: vector[1], constant, midpoint,
    squaredDistance: separationSquared, distance: separationSquared ** 0.5,
    endpoints: [axis.min, axis.max].map(y => ({ x: (constant - vector[1] * y) / vector[0], y })),
  };
  const queryCoordinates = [centers[1][0] - radius, centers[0][1]];
  const prediction = nearest(queryCoordinates);
  const projection = total(vector.map((value, index) => value * queryCoordinates[index]));
  const query = {
    x: queryCoordinates[0], y: queryCoordinates[1], ...prediction,
    roundedDistances: prediction.distances.map(value => Number(value.toFixed(2))),
    projection, margin: constant - projection,
    signedDistance: (projection - constant) / Math.sqrt(separationSquared),
  };
  const correct = rows.reduce((count, row) => count + Number(nearest(row).prediction === row.at(-1)), 0);
  const percent = 10 * 10;
  const randomProbability = probabilities.reduce((accumulator, probability) => accumulator + probability / labels.length, 0);
  const evaluation = {
    total: n, correct, errors: n - correct, accuracy: correct / n, accuracyPercent: correct * percent / n,
    randomProbability, randomExpectedCorrect: total(rows.map(() => randomProbability)),
    randomAccuracyPercent: randomProbability * percent,
    improvementPercentagePoints: correct * percent / n - randomProbability * percent,
    confusion: labels.map(actual => labels.map(predicted => rows.reduce((count, row) => count + Number(row.at(-1) === actual && nearest(row).prediction === predicted), 0))),
  };
  const xs = Array.from(new Set(rows.map(row => row[0]))).sort((a, b) => a - b);
  let gapIndex = 0;
  for (let index = 1; index < xs.length - 1; index += 1) if (xs[index + 1] - xs[index] > xs[gapIndex + 1] - xs[gapIndex]) gapIndex = index;
  const threshold = xs[gapIndex] + (xs[gapIndex + 1] - xs[gapIndex]) / 2;
  const inputGroups = [rows.filter(row => row[0] <= threshold), rows.filter(row => row[0] > threshold)];
  const groups = inputGroups.map(part => {
    const center = [0, 1].map(index => total(part.map(row => row[index])) / part.length);
    return {
      points: part.map(row => ({ x: row[0], y: row[1] })), count: part.length,
      center: { x: center[0], y: center[1] },
      bounds: { xMin: Math.min(...part.map(row => row[0])), xMax: Math.max(...part.map(row => row[0])), yMin: Math.min(...part.map(row => row[1])), yMax: Math.max(...part.map(row => row[1])) },
      radius: Math.max(...part.map(row => Math.hypot(row[0] - center[0], row[1] - center[1]))),
    };
  });
  const clustering = { threshold, gap: xs[gapIndex + 1] - xs[gapIndex], clusterCount: inputGroups.length, groups };
  const featureSums = toyData.features.map((_, index) => rows.reduce((accumulator, row) => accumulator + row[index], 0));
  const featureMeans = featureSums.map(value => value / n);
  const impurities = {
    rootGini: probabilities.reduce((value, probability) => value + probability * (1 - probability), 0),
    rootEntropy: total(probabilities.map(probability => -probability * Math.log(probability) / Math.log(2))),
    classGini: partitions.map(part => { const p = part.filter(row => row.at(-1) === part[0].at(-1)).length / part.length; return p * (1 - p); }),
    classEntropy: partitions.map(part => { const p = part.filter(row => row.at(-1) === part[0].at(-1)).length / part.length; return -p * Math.log2(p); }),
  };
  const familyTasks = ['Classification|Regression', 'Clustering|Dimensionality Reduction', 'Policy Optimization|Value Learning'];
  const familyNames = ['Supervised', 'Unsupervised', 'Reinforcement'];
  const families = familyTasks.map((tasks, index) => ({ label: familyNames[index], tasks: tasks.split('|') }));
  const taskCount = total(familyTasks.map(tasks => tasks.split('|').length));
  const taxonomy = {
    families, familyCount: familyNames.length, taskCount, leafCount: taskCount,
    nodeCount: [...familyNames, ...familyTasks.flatMap(tasks => tasks.split('|')), 'Machine Learning'].length,
    depth: 2, rewards: [-radius, radius],
  };
  const stages = 'Collect Data|Clean and Explore|Feature Engineering|Split Data|Train Model|Evaluate|Deploy|Monitor'.split('|');
  const feedback = [
    { from: 'Evaluate', to: 'Feature Engineering', condition: 'not good enough' },
    { from: 'Monitor', to: 'Collect Data', condition: 'performance drops' },
  ];
  const workflow = {
    stages, feedback, stageCount: stages.length,
    forwardTransitions: stages.slice(1).length, returnCount: feedback.length,
    cleanPercentRange: [percent * 6 / 10, percent * 8 / 10],
  };
  const fractions = [7 / 10, 3 / 20, 3 / 20];
  const totalWeight = 2 * 10;
  const splitPercentages = fractions.map(value => value * percent);
  const boundaries = [0];
  for (const value of splitPercentages) boundaries.push(boundaries.at(-1) + value);
  const split = {
    weights: fractions.map(value => value * totalWeight), totalWeight, fractions,
    percentages: splitPercentages, totalPercent: total(splitPercentages), boundaries,
  };
  const sumXX = total(rows.map(row => row[0] * row[0]));
  const sumXY = total(rows.map(row => row[0] * row[1]));
  const slope = (n * sumXY - featureSums[0] * featureSums[1]) / (n * sumXX - featureSums[0] ** 2);
  const intercept = (featureSums[1] - slope * featureSums[0]) / n;
  const predictions = rows.map(row => intercept + slope * row[0]);
  const residuals = rows.map((row, index) => row[1] - predictions[index]);
  const squaredErrors = residuals.map(value => value * value);
  const regression = {
    slope, intercept, predictions, residuals, squaredErrors,
    squaredErrorSum: total(squaredErrors), mse: total(squaredErrors) / n,
    line: [axis.min, axis.max].map(x => ({ x, y: intercept + slope * x })),
  };
  const quadratic = x => 1 + x + x * x / partitions[0].length;
  const observed = xs.map((x, index) => ({ x, y: quadratic(x) + Math.pow(-1, index) / partitions[0].length }));
  const first = Math.min(...xs);
  const last = Math.max(...xs);
  const straight = x => quadratic(first) * (last - x) / (last - first) + quadratic(last) * (x - first) / (last - first);
  const underfit = [first, last].map(x => ({ x, y: straight(x) }));
  const goodFit = xs.map(x => ({ x, y: quadratic(x) }));
  const amplitude = labels.length * radius;
  const overfit = [];
  for (let index = 0; index < observed.length; index += 1) {
    const point = observed[index];
    overfit.push({ ...point });
    if (index + 1 < observed.length) {
      const next = observed[index + 1];
      overfit.push({ x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 + Math.pow(-1, index) * amplitude });
    }
  }
  const piecewise = x => {
    for (let index = 1; index < overfit.length; index += 1) {
      const left = overfit[index - 1];
      const right = overfit[index];
      if (x >= left.x && x <= right.x) {
        const weight = (x - left.x) / (right.x - left.x);
        return left.y * (1 - weight) + right.y * weight;
      }
    }
    assert.fail('Held-out input must be bracketed');
  };
  const heldX = (centers[0][0] + centers[1][0]) / 2;
  const heldY = quadratic(heldX);
  const heldPredictions = { underfit: straight(heldX), goodFit: quadratic(heldX), overfit: piecewise(heldX) };
  const fits = {
    illustrative: true, observed, underfit, goodFit, overfit, amplitude,
    trainingMse: {
      underfit: total(observed.map(point => Math.pow(straight(point.x) - point.y, 2))) / observed.length,
      goodFit: total(observed.map(point => Math.pow(quadratic(point.x) - point.y, 2))) / observed.length,
      overfit: total(observed.map(point => Math.pow(piecewise(point.x) - point.y, 2))) / observed.length,
    },
    heldOut: {
      x: heldX, y: heldY, predictions: heldPredictions,
      squaredErrors: Object.fromEntries(Object.entries(heldPredictions).map(([key, value]) => [key, Math.pow(value - heldY, 2)])),
    },
    bounds: { minX: first, maxX: last, minY: axis.min, maxY: Math.ceil(Math.max(...observed.concat(overfit).map(point => point.y))) + 1 },
  };
  const levels = labels.length + 1;
  const tradeoffPoints = [];
  for (let complexity = 1; complexity <= levels; complexity += 1) {
    const biasSquared = Math.pow(levels - complexity, 2);
    const variance = Math.pow(complexity - 1, 2);
    const noise = radius * radius / partitions[0].length;
    tradeoffPoints.push({ complexity, biasSquared, variance, noise, total: total([biasSquared, variance, noise]) });
  }
  const sweetSpot = [...tradeoffPoints].sort((a, b) => a.total - b.total)[0];
  const tradeoff = {
    illustrative: true, points: tradeoffPoints, sweetSpot: { ...sweetSpot },
    bounds: { minX: 1, maxX: levels, minY: axis.min, maxY: Math.ceil(Math.max(...tradeoffPoints.map(point => point.total))) },
  };
  return {
    rowCount: n, featureCount: toyData.features.length, classCount: labels.length,
    labels, points: rows.map(row => ({ x: row[0], y: row[1], label: row.at(-1) })),
    classCounts, probabilities, featureSums, featureMeans,
    centroids: centers.map((center, index) => ({ label: labels[index], count: partitions[index].length, sumX: total(partitions[index].map(row => row[0])), sumY: total(partitions[index].map(row => row[1])), x: center[0], y: center[1] })),
    distances, radius, axis, boundary, query, evaluation, clustering, impurities,
    taxonomy, workflow, split, regression, fits, tradeoff, percent,
  };
}

test('shared toy data stays within the authoring limits and preserves topic metadata', () => {
  assert.ok(toyData.rows.length <= 10);
  assert.ok(toyData.features.length <= 2);
  assert.ok(toyData.rows.every(row => row.length === toyData.features.length + 1 && row.every(Number.isFinite)));
  assert.strictEqual(metadata.topic, metadata.artifactTopic);
  assert.strictEqual(metadata.title, 'What Is Machine Learning');
  assert.deepStrictEqual(metadata.lessons, ['01']);
  assert.deepStrictEqual(Object.keys(metadata).sort(), ['topic', 'artifactTopic', 'title', 'lessons', 'sources', 'briefLink'].sort());
  assert.strictEqual(metadata.sources.length, 1);
  assert.strictEqual(metadata.sources[0].kind, 'curriculum');
  assert.ok(metadata.sources[0].path.includes(metadata.topic));
  assert.match(metadata.sources[0].revision, /^[a-f0-9]{40}$/);
  assert.strictEqual(metadata.briefLink, null);
});

test('every derived numerical field is independently recomputed', () => {
  const snapshot = JSON.stringify(toyData);
  const actual = derived();
  const expected = independentlyRecompute();
  const { displayNumbers, ...values } = actual;
  close(values, expected);
  const expectedNumbers = [...new Set(numbers(expected))].sort((a, b) => a - b);
  close(displayNumbers, expectedNumbers, 'displayNumbers');
  for (const number of numbers(values)) assert.ok(displayNumbers.includes(number), `Missing display number ${number}`);
  assert.deepStrictEqual(derived(), actual);
  assert.strictEqual(JSON.stringify(toyData), snapshot);
});

test('geometry, baseline and illustrative fit claims follow from recomputed arithmetic', () => {
  const d = derived();
  for (const center of d.centroids) {
    const part = toyData.rows.filter(row => row.at(-1) === center.label);
    close(center.x * center.count, total(part.map(row => row[0])));
    close(center.y * center.count, total(part.map(row => row[1])));
  }
  for (const point of [...d.boundary.endpoints, d.boundary.midpoint]) {
    close(d.boundary.dx * point.x + d.boundary.dy * point.y, d.boundary.constant);
    const squared = d.centroids.map(center => (point.x - center.x) ** 2 + (point.y - center.y) ** 2);
    close(squared[0], squared[1]);
  }
  assert.ok(d.query.squared[0] < d.query.squared[1]);
  assert.strictEqual(d.query.prediction, d.labels[0]);
  assert.ok(d.query.projection < d.boundary.constant);
  assert.ok(d.distances.every(distance => distance.own < distance.other));
  close(d.evaluation.randomExpectedCorrect / d.rowCount, d.evaluation.randomProbability);
  close(total(d.split.percentages), d.percent);
  assert.strictEqual(d.split.boundaries.at(-1), d.percent);
  assert.ok(d.fits.trainingMse.overfit < d.fits.trainingMse.goodFit);
  assert.ok(d.fits.trainingMse.goodFit < d.fits.trainingMse.underfit);
  assert.ok(d.fits.heldOut.squaredErrors.overfit > d.fits.heldOut.squaredErrors.goodFit);
  assert.ok(!d.fits.observed.some(point => point.x === d.fits.heldOut.x));
  for (const point of d.tradeoff.points) close(point.total, point.biasSquared + point.variance + point.noise);
  assert.ok(d.tradeoff.points.every(point => point.total >= d.tradeoff.sweetSpot.total));
  assert.ok(d.tradeoff.sweetSpot.complexity > d.tradeoff.bounds.minX);
  assert.ok(d.tradeoff.sweetSpot.complexity < d.tradeoff.bounds.maxX);
});
