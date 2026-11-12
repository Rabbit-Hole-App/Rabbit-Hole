const features = ['x', 'y'];
const rows = [
  ['A', 1, 1, 0], ['B', 1, 5, 0], ['C', 3, 3, 0], ['D', 3, 7, 0],
  ['E', 5, 1, 0], ['F', 5, 3, 1], ['G', 7, 5, 1], ['H', 7, 7, 1],
  ['I', 2, 6, 0], ['J', 6, 1, 1],
].map(([id, x, y, label]) => ({ id, x, y, label }));
const train = rows.slice(0, 8);
const holdout = rows.slice(8);

// Keep the displayed gains and impurities exact even when their decimals repeat.
function fraction(numerator, denominator) {
  let divisor = Math.abs(numerator);
  let remainder = denominator;
  while (remainder) [divisor, remainder] = [remainder, divisor % remainder];
  return [numerator / divisor, denominator / divisor];
}

const add = ([a, b], [c, d]) => fraction(a * d + b * c, b * d);
const subtract = (left, [numerator, denominator]) => add(left, [-numerator, denominator]);
const scale = ([a, b], numerator, denominator) => fraction(a * numerator, b * denominator);
const lower = ([a, b], [c, d]) => a * d < c * b;
const countLabels = labels => [0, 1].map(label => labels.filter(value => value === label).length);
const countsOf = samples => countLabels(samples.map(row => row.label));
const majority = ([zeros, ones]) => Number(ones > zeros);
const gini = ([zeros, ones]) => fraction(2 * zeros * ones, (zeros + ones) ** 2);

function partition(samples, feature, threshold) {
  return [samples.filter(row => row[feature] <= threshold), samples.filter(row => row[feature] > threshold)];
}

function splitTrials(samples, feature) {
  const values = [...new Set(samples.map(row => row[feature]))].sort((a, b) => a - b);
  const parent = gini(countsOf(samples));
  return values.slice(1).map((value, index) => {
    const threshold = (values[index] + value) / 2;
    const [left, right] = partition(samples, feature, threshold);
    const leftCounts = countsOf(left);
    const rightCounts = countsOf(right);
    const leftGini = gini(leftCounts);
    const rightGini = gini(rightCounts);
    const weighted = add(scale(leftGini, left.length, samples.length), scale(rightGini, right.length, samples.length));
    return { feature, threshold, leftCounts, rightCounts, leftGini, rightGini, weighted, gain: subtract(parent, weighted) };
  });
}

function grow(samples, maxDepth, featuresAtNode, depth = 0, path = 'root') {
  const counts = countsOf(samples);
  const node = { counts, prediction: majority(counts) };
  if (depth === maxDepth || counts.includes(0)) return node;

  // Preserve feature order and ascending threshold order when scores tie.
  let split;
  for (const feature of featuresAtNode(path)) {
    for (const candidate of splitTrials(samples, feature)) {
      if (!split || lower(candidate.weighted, split.weighted)) split = candidate;
    }
  }
  if (!split || split.gain[0] <= 0) return node;
  const [left, right] = partition(samples, split.feature, split.threshold);
  return { ...node, split,
    left: grow(left, maxDepth, featuresAtNode, depth + 1, `${path}l`),
    right: grow(right, maxDepth, featuresAtNode, depth + 1, `${path}r`),
  };
}

function predict(tree, row) {
  if (!tree.split) return tree.prediction;
  const { feature, threshold } = tree.split;
  return predict(row[feature] <= threshold ? tree.left : tree.right, row);
}

const depths = [0, 1, 2];
const fullTrees = depths.map(depth => grow(train, depth, () => features));
const trials = Object.fromEntries(features.map(feature => [feature, splitTrials(train, feature)]));
const errors = fullTrees.map((tree, depth) => {
  const countErrors = samples => samples.filter(row => predict(tree, row) !== row.label).length;
  return { depth, trainErrors: countErrors(train), heldOutErrors: countErrors(holdout) };
});

function collectGains(node, rootSize, byFeature) {
  if (!node.split) return;
  const { feature, gain } = node.split;
  const nodeSize = node.counts[0] + node.counts[1];
  byFeature[feature] = add(byFeature[feature], scale(gain, nodeSize, rootSize));
  collectGains(node.left, rootSize, byFeature);
  collectGains(node.right, rootSize, byFeature);
}

// Fixed replacement draws and an independent candidate draw for each internal node.
const forest = [
  ['A A C D E F G H', { root: ['x'], rootr: ['y'] }],
  ['B B C D F F F G', { root: ['y'], rootl: ['x'], rootr: ['x'] }],
  ['A B C D D G H H', { root: ['x'] }],
].map(([draw, featureDraws]) => {
  const sample = draw.split(' ').map(id => train.find(row => row.id === id));
  const tree = grow(sample, 2, path => featureDraws[path] ?? []);
  const byFeature = { x: [0, 1], y: [0, 1] };
  collectGains(tree, sample.length, byFeature);
  return { sample, tree, byFeature, featureDraws };
});

function forestVote(row) {
  const predictions = forest.map(({ tree }) => predict(tree, row));
  const counts = countLabels(predictions);
  return { row, predictions, counts, winner: majority(counts) };
}

const vote = forestVote(holdout[1]);
const totals = Object.fromEntries(features.map(feature => [feature,
  forest.reduce((total, tree) => add(total, tree.byFeature[feature]), [0, 1])
]));
const countCorrect = samples => samples.filter(row => forestVote(row).winner === row.label).length;
const permutedCorrect = feature => countCorrect(holdout.map((row, index) => ({
  ...row, [feature]: holdout.at(-index - 1)[feature],
})));
const importance = { totals, permutation: {
  baselineCorrect: countCorrect(holdout), xCorrect: permutedCorrect('x'), yCorrect: permutedCorrect('y'),
} };

export const decisionTreesLesson = { rows, train, holdout, trials, tree: fullTrees.at(-1), errors, forest, vote, importance };
