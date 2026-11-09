import { decisionTreesLesson as lesson } from './lesson-decision-trees-data.js';

const { train, holdout, tree, trials, errors, forest, vote } = lesson;
const spec = diagram => ({ version: 1, diagram });
const value = ([numerator, denominator]) => numerator / denominator;
const fraction = ([n, d]) => d === 1 ? String(n) : `${n} over ${d}`;
const size = ([zeros, ones]) => zeros + ones;
const rule = (split, right = false) => `${split.feature} ${right ? 'above' : 'at most'} ${split.threshold}`;
const axis = (label, max, min = 0) => ({ label, min, max });
const worked = text => `Worked example. ${text}`;
const brief = depth => depth === 'overview';
const detailed = depth => depth === 'deep';
const features = ['x', 'y'];
const labels = [0, 1];
const treeName = index => `Tree ${index + 1}`;
const chosen = tree.split;
const rightSplit = tree.right.split;
const isolated = train.find(row => row[chosen.feature] > chosen.threshold && row[rightSplit.feature] <= rightSplit.threshold);
const bounds = Object.fromEntries(features.flatMap(feature => [
  [`${feature}Min`, Math.min(...lesson.rows.map(row => row[feature])) - 1],
  [`${feature}Max`, Math.max(...lesson.rows.map(row => row[feature])) + 1],
]));

const demoRouting = {
  'candidate-split': { keywords: ['candidate split', 'axis split'] },
  'gini-split': {
    prompt: 'how do I compute the Gini impurity on both sides of a split and the information gain?',
    keywords: ['gini impurity', 'information gain', 'impurity'],
  },
  'threshold-search': {
    prompt: 'how does a decision tree search for the best threshold on one feature?',
    keywords: ['best threshold', 'best split', 'threshold search'],
  },
  'grown-tree': {
    prompt: 'how does a decision tree trace a new point from the root to a prediction?',
    keywords: ['decision tree', 'tree prediction', 'root to leaf'],
  },
  'decision-regions': {
    prompt: 'how does a decision tree split a two-feature dataset into regions?',
    keywords: ['decision tree', 'decision regions', 'decision boundary'],
  },
  'depth-overfit': {
    prompt: 'how does held-out error change as a decision tree grows deeper?',
    keywords: ['tree depth', 'max depth', 'deeper tree overfitting'],
  },
  'bootstrap-roots': {
    prompt: 'what does a bootstrap sample of the training rows look like, and which rows repeat?',
    keywords: ['bootstrap sample', 'bootstrap', 'sampling with replacement'],
  },
  'feature-subsets': { keywords: ['random feature subset', 'feature randomization'] },
  'majority-vote': {
    prompt: 'how does a random forest combine the predictions of its trees into one answer?',
    keywords: ['random forest', 'majority vote', 'forest vote'],
  },
  'feature-importance': {
    prompt: 'compare impurity-based feature importance with permutation importance when one feature is random noise',
    keywords: ['feature importance', 'permutation importance', 'mdi'],
  },
};

function reference(name, prompt, paraphrase, phrase, useWhen, atDepth) {
  const route = demoRouting[name];
  return {
    id: `ml-trees-${name}`, lessons: ['04'], prompts: route.prompt ? [prompt, route.prompt] : [prompt],
    paraphrases: [paraphrase], keywords: [phrase, ...route.keywords], shortKeywords: route.keywords, useWhen,
    spec: spec(atDepth('standard')),
    depths: { overview: { spec: spec(atDepth('overview')) }, deep: { spec: spec(atDepth('deep')) } },
  };
}

function trainingScatter(depth) {
  const rows = brief(depth) ? train.filter((_, index) => index % 2 === 0) : train;
  return {
    kind: 'coordinate-plot',
    x: axis('Feature x', bounds.xMax, bounds.xMin), y: axis('Feature y', bounds.yMax, bounds.yMin),
    series: labels.map(label => ({
      label: `Class ${label}`, kind: 'scatter',
      points: rows.filter(row => row.label === label).map(({ id, x, y }) => ({
        x, y, ...(detailed(depth) && id === isolated.id ? { label: id } : {}),
      })),
    })),
  };
}

function splitMatrix(depth) {
  const deep = detailed(depth);
  const showWeights = !brief(depth);
  const child = (heading, counts, gini) => ({
    heading, cells: [...counts.map(String), String(value(gini)), ...(showWeights ? [String(size(counts) / train.length)] : [])],
  });
  const rows = [
    child('Left', chosen.leftCounts, chosen.leftGini),
    child('Right', chosen.rightCounts, chosen.rightGini),
    { heading: 'After', cells: ['—', '—', String(value(chosen.weighted)), ...(showWeights ? ['1'] : [])] },
  ];
  const [zeros, ones] = tree.counts;
  const parentGini = 2 * zeros * ones / train.length ** 2;
  return {
    kind: 'matrix', title: brief(depth) ? 'Compare the two sides' : 'Gini after the root split',
    columns: ['Class 0', 'Class 1', 'Gini', ...(showWeights ? ['Weight'] : [])], rows,
    caption: worked(brief(depth) ? 'A pure side has zero Gini.' : deep ? `Parent Gini ${parentGini} minus ${value(chosen.weighted)} gives a gain of ${value(chosen.gain)}.` :
      'Combine the child Ginis in proportion to their sizes.'),
  };
}

function thresholdPlot(depth) {
  const rounded = score => Number(value(score).toFixed(4));
  const points = trials.x.map(split => {
    const y = rounded(split.weighted);
    return { x: split.threshold, y, ...(detailed(depth) ? { label: String(y) } : {}) };
  });
  const alternative = trials.y.reduce((best, split) => value(split.weighted) < value(best.weighted) ? split : best);
  return {
    kind: 'coordinate-plot', title: brief(depth) ? 'Pick the lowest score' : 'Test the midpoints on x',
    x: axis('Threshold on x', bounds.xMax), y: axis('Weighted Gini', 0.4),
    series: [{ label: 'Candidate midpoints', kind: 'stem', points }],
    annotations: [{ kind: 'point', x: chosen.threshold, y: rounded(chosen.weighted), label: 'Lowest Gini' }],
    caption: worked(detailed(depth) ? `Exact x scores are ${trials.x.map(split => fraction(split.weighted)).join(', ')}. Best y score is ${fraction(alternative.weighted)}.` :
      `A smaller weighted Gini is better. The best cut is ${rule(chosen)}.`),
  };
}

function treeNodes(node, id = 'root', incoming = {}) {
  const { counts, split } = node;
  const label = split ? `${rule(split)}?` : `Predict ${node.prediction} · ${id.slice(4).toUpperCase()}`;
  const current = { id, label, ...incoming,
    count: size(counts), detail: `${counts[0]} zeros · ${counts[1]} ones` };
  if (!split) return [current];
  return [current,
    ...treeNodes(node.left, `${id}l`, { parent: id, side: 'left', edgeLabel: rule(split) }),
    ...treeNodes(node.right, `${id}r`, { parent: id, side: 'right', edgeLabel: rule(split, true) }),
  ];
}

function predictionPath(node, row, id = 'root') {
  if (!node.split) return [id];
  const { feature, threshold } = node.split;
  const side = row[feature] <= threshold ? 'left' : 'right';
  return [id, ...predictionPath(node[side], row, id + side[0])];
}

const heldOutPath = predictionPath(tree, vote.row);

function leafRegions(node, region = bounds) {
  if (!node.split) return [{ kind: 'rectangle', label: `Predict ${node.prediction}`, ...region }];
  const { feature, threshold } = node.split;
  return [...leafRegions(node.left, { ...region, [`${feature}Max`]: threshold }),
    ...leafRegions(node.right, { ...region, [`${feature}Min`]: threshold })];
}

function regionPlot(depth) {
  const plot = trainingScatter(depth);
  const { id, x, y, label } = vote.row;
  if (detailed(depth)) plot.series.push({ label: `Held out ${id} · class ${label}`, kind: 'scatter', points: [{ x, y }] });
  return { ...plot, title: brief(depth) ? 'A prediction for every region' : 'Leaf regions on the feature plane',
    annotations: leafRegions(tree), caption: worked(detailed(depth) ? `${id} lands in the same rectangle as ${isolated.id}.` :
      brief(depth) ? 'Selected training rows. Each rectangle predicts one class.' : 'The vertical cut spans the plot. The horizontal cut divides only the right side.'),
  };
}

const illustrativeErrors = [
  ['Training', [38, 28, 20, 13, 8, 4, 2, 0]],
  ['Held out', [40, 31, 23, 26, 29, 33, 37, 43]],
];

function errorPlot(depth) {
  const exact = detailed(depth);
  const series = exact
    ? [['Training', 'trainErrors', train.length], ['Held out', 'heldOutErrors', holdout.length]]
      .map(([label, key, total]) => ({ label, kind: 'line', smooth: false,
        points: errors.map(step => ({ x: step.depth, y: 100 * step[key] / total, label: `${step[key]} of ${total}` })) }))
    : illustrativeErrors.map(([label, rates]) => ({ label, kind: 'line', smooth: false,
      points: rates.map((y, index) => ({ x: index + 1, y })) }));
  const training = series[0].points;
  const minimum = series[1].points.reduce((best, point) => point.y < best.y ? point : best);
  return {
    kind: 'coordinate-plot', title: brief(depth) ? 'Deeper can test worse' : 'Training and held-out error by depth',
    x: { ...axis('Max depth', training.at(-1).x, training[0].x), integerTicks: true },
    y: { ...axis('Error rate', exact ? 100 : 50), unit: '%' }, series,
    annotations: [{ kind: 'point', label: 'Lowest held-out error', x: minimum.x, y: minimum.y }],
    caption: exact ? worked(`Point labels count errors out of ${train.length} training rows or ${holdout.length} held-out rows.`) :
      `Illustrative run. Held-out error is lowest at depth ${minimum.x}, then rises as training error falls.`,
  };
}

function bootstrapDiagram(depth) {
  return {
    kind: 'sample-set', title: brief(depth) ? 'Draw rows again for each tree' : 'Bootstrap draws and fitted roots',
    samples: train.map(({ id, label }) => ({ id, ...(!brief(depth) ? { class: String(label) } : {}) })),
    groups: forest.map(({ sample, tree: fitted }, index) => {
      const members = sample.map(row => row.id);
      return { id: `t${index + 1}`, label: `${treeName(index)} · ${rule(fitted.split)}`, members, replacement: true,
        ...(detailed(depth) ? { omitted: train.filter(row => !members.includes(row.id)).map(row => row.id) } : {}) };
    }),
    caption: worked(detailed(depth) ? 'Omitted rows are out of bag for that tree. Roots also depend on each node’s feature draw.' :
      brief(depth) ? 'A repeated letter is a repeated training row.' : `Each draw has ${train.length} rows. Roots use these draws and the node feature draws.`),
  };
}

function featureSubsets(depth) {
  return {
    kind: 'matrix', title: brief(depth) ? 'Draw a feature at each split' : 'Candidate feature at each node',
    columns: brief(depth) ? ['Root', 'Right child'] : ['Root', 'Left child', 'Right child'],
    rows: forest.map(({ tree: fitted, featureDraws }, index) => {
      const cell = (path, node) => node.split ? (detailed(depth) ? rule(node.split) : featureDraws[path][0]) : 'Leaf';
      const root = cell('root', fitted);
      const right = cell('rootr', fitted.right);
      return { heading: treeName(index), cells: brief(depth) ? [root, right] : [root, cell('rootl', fitted.left), right] };
    }),
    caption: worked(detailed(depth) ? 'Each split searches only the feature shown in its rule. A leaf stops searching.' :
      'Each split considers one feature. The next node can draw a different feature.'),
  };
}

function forestVoteDiagram(depth) {
  if (brief(depth)) return {
    kind: 'bar-chart', title: 'The most votes win',
    bars: labels.map(label => ({
      label: `Class ${label} · ${vote.predictions.flatMap((pick, index) => pick === label ? [`T${index + 1}`] : []).join(', ')}`,
      value: vote.counts[label],
    })),
    caption: worked(`Class ${vote.winner} wins.`),
  };

  const branches = forest.map(({ sample, tree: fitted }, index) => ({
    sample, root: fitted.split, index, draw: 'abc'[index], tree: 'def'[index], prediction: vote.predictions[index],
  }));
  return {
    kind: 'flow', title: `Forest vote for row ${vote.row.id}`,
    nodes: [
      { id: 's', label: `Use training rows ${train[0].id} to ${train.at(-1).id}`, role: 'fork' },
      ...branches.flatMap(({ sample, root, index, draw, tree }) => [
        { id: draw, label: `Draw ${detailed(depth) ? sample.map(row => row.id).join(' ') : `bootstrap ${index + 1}`}`, role: 'process' },
        { id: tree, label: `Fit ${treeName(index).toLowerCase()} · ${rule(root)}`, role: 'process' },
      ]),
      { id: 'v', label: 'Take a majority vote', role: 'merge' },
      { id: 'w', label: `Predict class ${vote.winner}`, role: 'outcome' },
    ],
    edges: [
      ...branches.flatMap(({ draw, tree, prediction }) => [
        { from: 's', to: draw }, { from: draw, to: tree }, { from: tree, to: 'v', label: String(prediction) },
      ]),
      { from: 'v', to: 'w' },
    ],
    caption: worked(detailed(depth) ? 'Draw with replacement.' :
      'Draw with replacement. Every tree predicts the same held-out row.'),
  };
}

function importanceChart(depth) {
  return {
    kind: 'bar-chart', variant: 'grouped', title: brief(depth) ? 'Noise can score high on MDI' : 'MDI and held-out permutation',
    unit: '%', categories: ['x', 'y', 'Noise ID'],
    series: [
      { label: detailed(depth) ? 'Mean decrease in impurity' : 'MDI', values: [35, 20, 45] },
      { label: 'Held-out permutation', values: [75, 24, 1] },
    ],
    caption: 'Illustrative. High-cardinality noise offers more cuts and can inflate MDI. Each method totals 100%.' +
      (detailed(depth) ? ' Shuffling measures accuracy drops.' : ''),
  };
}

export const lessonDecisionTreesReferences = Object.freeze([
  reference('candidate-split', 'Can you draw one candidate axis split on our two-feature training scatter?',
    'What does a candidate axis split look like on the training points?', 'candidate axis split',
    'Show how one threshold sends the same training points to the left and right children.',
    depth => ({ ...trainingScatter(depth), title: brief(depth) ? 'One cut through the points' : 'A candidate split on x',
      annotations: [{ kind: 'reference-line', axis: chosen.feature, value: chosen.threshold, label: rule(chosen) }],
      caption: worked(brief(depth) ? 'Selected training rows. The cut sends points to either side.' :
        detailed(depth) ? `${size(chosen.leftCounts)} rows go left and ${size(chosen.rightCounts)} go right. Row ${isolated.id} is on the right.` :
          'Only training rows guide the split. Held-out rows are kept for the error check.'),
    })),
  reference('gini-split', 'How do I compute Gini on both sides of this root split?',
    'Can you show the Gini on both sides and combine the child scores?', 'gini on both sides',
    'Keep the child counts, impurities and size weights tied to the same root split.', splitMatrix),
  reference('threshold-search', 'How do midpoint Gini trials choose the best threshold on x?',
    'Can you plot the midpoint Gini trials and mark the winning cut?', 'midpoint gini trials',
    'Show the score at each distinct-value midpoint and mark the minimum.', thresholdPlot),
  reference('grown-tree', 'Can you trace the grown toy tree with class counts in every node?',
    'Show me how to follow the grown toy tree from the root to a prediction.', 'grown toy tree',
    'Keep the tested condition on the outgoing branches and class counts in the nodes.',
    depth => ({ kind: 'tree', layout: 'binary', title: brief(depth) ? 'Follow the tests to a leaf' : 'The fitted tree with class counts',
      nodes: treeNodes(tree), ...(detailed(depth) ? { highlightPath: heldOutPath } : {}),
      caption: worked(detailed(depth) ? `Follow ${vote.row.id} to leaf ${heldOutPath.at(-1).slice(4).toUpperCase()}.` :
        brief(depth) ? 'The leaf gives the prediction.' : 'Each child contains the training rows that pass its edge rule.'),
    })),
  reference('decision-regions', 'Can you shade the tree leaf rectangles on the training scatter?',
    'How do the tree leaf rectangles show which class each part of the plot predicts?', 'tree leaf rectangles',
    'Draw one filled rectangle per leaf using the fitted split thresholds.', regionPlot),
  reference('depth-overfit', 'Can you plot held-out error by tree depth for our toy classifier?',
    'How does held-out error by tree depth compare with the training curve?', 'held out error by tree depth',
    'Compare misclassification rates on the fixed training and held-out rows at each depth limit.', errorPlot),
  reference('bootstrap-roots', 'Can you show our three bootstrap draws and fitted roots?',
    'Which repeated rows and split rules appear in the bootstrap draws and fitted roots?', 'bootstrap draws and fitted roots',
    'Use the same training IDs for the three replacement draws and connect each draw to its fitted root rule.', bootstrapDiagram),
  reference('feature-subsets', 'Which candidate feature at each node did these forest trees consider?',
    'Show the candidate feature at each node, including the children of each root.', 'candidate feature at each node',
    'Separate the feature draw at each node from the bootstrap draw of rows for the entire tree.', featureSubsets),
  reference('majority-vote', 'How does the forest vote for row J combine the three predictions?',
    'Can you show the forest vote for row J and count the winning class?', 'forest vote for row j',
    'Trace shared training rows through bootstrap draws and fitted trees to the vote for the same held-out row.', forestVoteDiagram),
  reference('feature-importance', 'Can you compute forest Gini decrease by feature for these trees?',
    'Show the forest Gini decrease by feature and compare the two totals.', 'forest gini decrease by feature',
    'Contrast normalized illustrative impurity and held-out permutation scores when a high-cardinality feature is noise.', importanceChart),
]);
