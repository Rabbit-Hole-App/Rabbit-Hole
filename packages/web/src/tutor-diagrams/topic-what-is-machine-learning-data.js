export const metadata = {
  topic: 'what-is-machine-learning',
  artifactTopic: 'what-is-machine-learning',
  title: 'What Is Machine Learning',
  lessons: ['01'],
  sources: [{
    kind: 'curriculum',
    path: 'phases/02-ml-fundamentals/01-what-is-machine-learning/docs/en.md',
    revision: 'e7db050e64bde3be17a9381476f748da26d85692',
  }],
  briefLink: null,
};

export const toyData = {
  rows: [[0, 2, 0], [2, 2, 0], [1, 1, 0], [1, 3, 0], [4, 5, 1], [6, 5, 1], [5, 4, 1], [5, 6, 1]],
  features: ['x1', 'x2'],
  label: 'class',
  usedBy: [3, 10, 11, 12],
};

const families = [
  { label: 'Supervised', tasks: ['Classification', 'Regression'] },
  { label: 'Unsupervised', tasks: ['Clustering', 'Dimensionality Reduction'] },
  { label: 'Reinforcement', tasks: ['Policy Optimization', 'Value Learning'] },
];
const stages = ['Collect Data', 'Clean and Explore', 'Feature Engineering', 'Split Data', 'Train Model', 'Evaluate', 'Deploy', 'Monitor'];
const feedback = [
  { from: 'Evaluate', to: 'Feature Engineering', condition: 'not good enough' },
  { from: 'Monitor', to: 'Collect Data', condition: 'performance drops' },
];
const splitWeights = [14, 3, 3];
const sum = values => values.reduce((total, value) => total + value, 0);
const mean = values => sum(values) / values.length;
const squaredDistance = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
const averagePoint = points => ({ x: mean(points.map(p => p.x)), y: mean(points.map(p => p.y)) });
const boundsOf = points => ({
  xMin: Math.min(...points.map(p => p.x)), xMax: Math.max(...points.map(p => p.x)),
  yMin: Math.min(...points.map(p => p.y)), yMax: Math.max(...points.map(p => p.y)),
});
const numericLeaves = value => typeof value === 'number' ? [value]
  : value && typeof value === 'object' ? Object.values(value).flatMap(numericLeaves) : [];

function interpolate(points, x) {
  const exact = points.find(p => p.x === x);
  if (exact) return exact.y;
  const index = points.findIndex(p => p.x > x);
  const left = points[index - 1];
  const right = points[index];
  return left.y + (right.y - left.y) * (x - left.x) / (right.x - left.x);
}

export function derived() {
  const points = toyData.rows.map(([x, y, label]) => ({ x, y, label }));
  const rowCount = points.length;
  const featureCount = toyData.features.length;
  const labels = [...new Set(points.map(p => p.label))].sort((a, b) => a - b);
  const classCount = labels.length;
  const classCounts = labels.map(label => points.filter(p => p.label === label).length);
  const probabilities = classCounts.map(count => count / rowCount);
  const centroids = labels.map(label => {
    const members = points.filter(p => p.label === label);
    return { label, count: members.length, sumX: sum(members.map(p => p.x)), sumY: sum(members.map(p => p.y)), ...averagePoint(members) };
  });
  const classify = point => {
    const squared = centroids.map(center => squaredDistance(point, center));
    const winner = squared.indexOf(Math.min(...squared));
    return { squared, distances: squared.map(Math.sqrt), prediction: labels[winner] };
  };
  const distances = points.map(point => {
    const result = classify(point);
    const ownIndex = labels.indexOf(point.label);
    const otherIndex = labels.findIndex(label => label !== point.label);
    return {
      ...result, ownSquared: result.squared[ownIndex], own: result.distances[ownIndex],
      otherSquared: result.squared[otherIndex], other: result.distances[otherIndex],
      correct: result.prediction === point.label,
    };
  });
  const radius = Math.max(...distances.map(d => d.own));
  const axis = { min: Math.min(0, ...points.flatMap(p => [p.x, p.y])), max: Math.max(...points.flatMap(p => [p.x, p.y])) + 1 };
  const [a, b] = centroids;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const constant = (b.x ** 2 + b.y ** 2 - a.x ** 2 - a.y ** 2) / 2;
  const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const boundary = {
    dx, dy, constant, midpoint,
    squaredDistance: squaredDistance(a, b), distance: Math.sqrt(squaredDistance(a, b)),
    endpoints: [axis.min, axis.max].map(y => ({ x: (constant - dy * y) / dx, y })),
  };
  const queryPoint = { x: b.x - radius, y: a.y };
  const queryResult = classify(queryPoint);
  const projection = dx * queryPoint.x + dy * queryPoint.y;
  const query = {
    ...queryPoint, ...queryResult,
    roundedDistances: queryResult.distances.map(distance => Math.round(distance * 100) / 100),
    projection, margin: constant - projection,
    signedDistance: (projection - constant) / boundary.distance,
  };
  const correct = distances.filter(d => d.correct).length;
  const percent = 10 ** 2;
  const randomProbability = 1 / classCount;
  const evaluation = {
    total: rowCount, correct, errors: rowCount - correct,
    accuracy: correct / rowCount, accuracyPercent: percent * correct / rowCount,
    randomProbability, randomExpectedCorrect: rowCount * randomProbability,
    randomAccuracyPercent: percent * randomProbability,
    improvementPercentagePoints: percent * (correct / rowCount - randomProbability),
    confusion: labels.map(actual => labels.map(predicted => points.filter((p, index) => p.label === actual && distances[index].prediction === predicted).length)),
  };
  const xValues = [...new Set(points.map(p => p.x))].sort((left, right) => left - right);
  const gaps = xValues.slice(1).map((value, index) => value - xValues[index]);
  const gapIndex = gaps.indexOf(Math.max(...gaps));
  const threshold = (xValues[gapIndex] + xValues[gapIndex + 1]) / 2;
  const groups = [points.filter(p => p.x <= threshold), points.filter(p => p.x > threshold)].map(members => {
    const inputs = members.map(({ x, y }) => ({ x, y }));
    const center = averagePoint(inputs);
    return { points: inputs, count: inputs.length, center, bounds: boundsOf(inputs), radius: Math.sqrt(Math.max(...inputs.map(p => squaredDistance(p, center)))) };
  });
  const clustering = { threshold, gap: gaps[gapIndex], clusterCount: groups.length, groups };
  const featureSums = toyData.features.map((_, index) => sum(toyData.rows.map(row => row[index])));
  const featureMeans = featureSums.map(total => total / rowCount);
  const rootGini = 1 - sum(probabilities.map(p => p ** 2));
  const rootEntropy = -sum(probabilities.map(p => p * Math.log2(p)));
  const impurities = { rootGini, rootEntropy, classGini: labels.map(() => 1 - 1 ** 2), classEntropy: labels.map(() => -Math.log2(1)) };
  const taskCount = sum(families.map(family => family.tasks.length));
  const taxonomy = {
    families: families.map(family => ({ label: family.label, tasks: [...family.tasks] })),
    familyCount: families.length, taskCount, leafCount: taskCount,
    nodeCount: 1 + families.length + taskCount, depth: 1 + Number(taskCount > 0),
    rewards: [-radius, radius],
  };
  const workflow = {
    stages: [...stages], feedback: feedback.map(edge => ({ ...edge })),
    stageCount: stages.length, forwardTransitions: stages.length - 1, returnCount: feedback.length,
    cleanPercentRange: [3 / 5, 4 / 5].map(fraction => fraction * percent),
  };
  const totalWeight = sum(splitWeights);
  const splitPercentages = splitWeights.map(weight => percent * weight / totalWeight);
  const split = {
    weights: [...splitWeights], totalWeight,
    fractions: splitWeights.map(weight => weight / totalWeight),
    percentages: splitPercentages, totalPercent: sum(splitPercentages),
    boundaries: [0, ...splitPercentages.map((_, index) => sum(splitPercentages.slice(0, index + 1)))],
  };
  const meanX = featureMeans[0];
  const meanY = featureMeans[1];
  const slope = sum(points.map(p => (p.x - meanX) * (p.y - meanY))) / sum(points.map(p => (p.x - meanX) ** 2));
  const intercept = meanY - slope * meanX;
  const predictions = points.map(p => slope * p.x + intercept);
  const residuals = points.map((p, index) => p.y - predictions[index]);
  const squaredErrors = residuals.map(residual => residual ** 2);
  const regression = {
    slope, intercept, predictions, residuals, squaredErrors,
    squaredErrorSum: sum(squaredErrors), mse: mean(squaredErrors),
    line: [axis.min, axis.max].map(x => ({ x, y: slope * x + intercept })),
  };
  const trend = x => 1 + x + x ** 2 / a.count;
  const observed = xValues.map((x, index) => ({ x, y: trend(x) + (index % 2 === 0 ? 1 : -1) / a.count }));
  const first = xValues[0];
  const last = xValues.at(-1);
  const chordSlope = (trend(last) - trend(first)) / (last - first);
  const chord = x => trend(first) + chordSlope * (x - first);
  const underfit = [first, last].map(x => ({ x, y: chord(x) }));
  const goodFit = xValues.map(x => ({ x, y: trend(x) }));
  const amplitude = radius * classCount;
  const overfit = observed.flatMap((point, index) => index === observed.length - 1 ? [{ ...point }] : [
    { ...point },
    { x: (point.x + observed[index + 1].x) / 2, y: (point.y + observed[index + 1].y) / 2 + (index % 2 === 0 ? amplitude : -amplitude) },
  ]);
  const heldX = midpoint.x;
  const heldY = trend(heldX);
  const heldPredictions = { underfit: chord(heldX), goodFit: trend(heldX), overfit: interpolate(overfit, heldX) };
  const fits = {
    illustrative: true, observed, underfit, goodFit, overfit, amplitude,
    trainingMse: {
      underfit: mean(observed.map(p => (p.y - chord(p.x)) ** 2)),
      goodFit: mean(observed.map(p => (p.y - trend(p.x)) ** 2)),
      overfit: mean(observed.map(p => (p.y - interpolate(overfit, p.x)) ** 2)),
    },
    heldOut: {
      x: heldX, y: heldY, predictions: heldPredictions,
      squaredErrors: Object.fromEntries(Object.entries(heldPredictions).map(([name, prediction]) => [name, (heldY - prediction) ** 2])),
    },
    bounds: { minX: first, maxX: last, minY: axis.min, maxY: Math.ceil(Math.max(...observed.map(p => p.y), ...overfit.map(p => p.y))) + 1 },
  };
  const complexities = Array.from({ length: classCount + 1 }, (_, index) => index + 1);
  const noise = radius ** 2 / a.count;
  const tradeoffPoints = complexities.map(complexity => {
    const biasSquared = (complexities.at(-1) - complexity) ** 2;
    const variance = (complexity - complexities[0]) ** 2;
    return { complexity, biasSquared, variance, noise, total: biasSquared + variance + noise };
  });
  const sweetSpot = tradeoffPoints.reduce((best, point) => point.total < best.total ? point : best);
  const tradeoff = {
    illustrative: true, points: tradeoffPoints, sweetSpot: { ...sweetSpot },
    bounds: { minX: complexities[0], maxX: complexities.at(-1), minY: axis.min, maxY: Math.ceil(Math.max(...tradeoffPoints.map(p => p.total))) },
  };
  const result = {
    rowCount, featureCount, classCount, labels, points, classCounts, probabilities,
    featureSums, featureMeans, centroids, distances, radius, axis, boundary, query,
    evaluation, clustering, impurities, taxonomy, workflow, split, regression, fits, tradeoff,
    percent,
  };
  return { ...result, displayNumbers: [...new Set(numericLeaves(result))].sort((left, right) => left - right) };
}
