import { decisionTreesLesson as lesson } from './lesson-decision-trees-data.js';

const { train, holdout, tree, trials, errors, forest, vote, importance } = lesson;
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

function reference(name, prompt, paraphrase, phrase, useWhen, atDepth) {
  return {
    id: `ml-trees-${name}`, lessons: ['04'], prompts: [prompt], paraphrases: [paraphrase], keywords: [phrase], useWhen,
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

function commonDenominator(fractions) {
  const denominators = fractions.map(([, denominator]) => denominator);
  const step = Math.max(...denominators);
  let multiple = step;
  while (denominators.some(denominator => multiple % denominator !== 0)) multiple += step;
  return multiple;
}

function thresholdPlot(depth) {
  // Plot integer multiples of one Gini unit so the renderer's coordinate labels stay exact.
  const units = commonDenominator(trials.x.map(split => split.weighted));
  const scaled = ([numerator, denominator]) => numerator * (units / denominator);
  const points = trials.x.map(split => ({ x: split.threshold, y: scaled(split.weighted),
    ...(detailed(depth) ? { label: fraction(split.weighted) } : {}) }));
  const alternative = trials.y.reduce((best, split) => value(split.weighted) < value(best.weighted) ? split : best);
  return {
    kind: 'coordinate-plot', title: brief(depth) ? 'Pick the lowest score' : 'Test the midpoints on x',
    x: axis('Threshold on x', bounds.xMax), y: axis(`Weighted Gini in ${units}ths`, units / 2),
    series: [{ label: 'Candidate midpoints', kind: brief(depth) ? 'scatter' : 'stem', points }],
    annotations: [{ kind: 'point', x: chosen.threshold, y: scaled(chosen.weighted), label: 'Lowest Gini' }],
    caption: worked(detailed(depth) ? `The best y trial gives ${fraction(alternative.weighted)}. The x winner gives ${fraction(chosen.weighted)}.` :
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

function errorPlot(depth) {
  const series = [['Training', 'trainErrors', train.length], ['Held out', 'heldOutErrors', holdout.length]];
  return {
    kind: 'coordinate-plot', title: brief(depth) ? 'Deeper can test worse' : 'Training and held-out error by depth',
    x: axis('Max depth', errors.at(-1).depth), y: { ...axis('Error rate', 100), unit: '%' },
    series: series.map(([label, key, total]) => ({ label, kind: brief(depth) ? 'scatter' : 'line', ...(!brief(depth) ? { smooth: false } : {}),
      points: errors.map(step => ({ x: step.depth, y: 100 * step[key] / total,
        ...(detailed(depth) ? { label: `${step[key]} of ${total}` } : {}) })) })),
    annotations: [{ kind: 'reference-line', label: 'Best held-out depth', axis: 'x',
      value: errors.reduce((best, step) => step.heldOutErrors < best.heldOutErrors ? step : best).depth }],
    caption: worked(detailed(depth) ? `Point labels count errors out of ${train.length} training rows or ${holdout.length} held-out rows.` :
      'The deepest tree fits training rows and makes more mistakes on held-out rows.'),
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

function voteChart(depth) {
  const categories = labels.map(label => `Class ${label}`);
  return {
    kind: 'bar-chart', title: brief(depth) ? 'The most votes win' : 'Forest vote for row J',
    ...(detailed(depth) ? { variant: 'stacked', categories,
      series: vote.predictions.map((pick, index) => ({ label: treeName(index), values: labels.map(label => Number(pick === label)) })),
    } : { bars: labels.map(label => ({
      label: `${categories[label]} · ${vote.predictions.flatMap((pick, index) => pick === label ? [`T${index + 1}`] : []).join(', ')}`,
      value: vote.counts[label],
    })) }),
    caption: worked(brief(depth) ? `Class ${vote.winner} wins.` :
      `For ${vote.row.id}, x is ${vote.row.x} and y is ${vote.row.y}. Class ${vote.winner} gets ${vote.counts[vote.winner]} of ${forest.length} votes.`),
  };
}

function importanceChart(depth) {
  const permutation = importance.permutation;
  const loss = correct => 100 * (permutation.baselineCorrect - correct) / holdout.length;
  return {
    kind: 'bar-chart', title: brief(depth) ? 'Which feature reduced impurity more?' : 'Forest Gini decrease by feature',
    ...(detailed(depth) ? { variant: 'stacked', categories: features.map(feature => `Feature ${feature}`),
      series: forest.map(({ byFeature }, index) => ({ label: treeName(index), values: features.map(feature => value(byFeature[feature])) })),
    } : { bars: features.map(feature => ({ label: `Feature ${feature}`, value: value(importance.totals[feature]) })) }),
    caption: worked(detailed(depth) ? `One held-out swap drops accuracy by ${loss(permutation.xCorrect)} points for x and ${loss(permutation.yCorrect)} for y.` :
      brief(depth) ? 'A longer bar means more impurity removed.' : 'Sum the size-weighted Gini decreases for each feature across the trees.'),
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
    'Connect each fitted tree prediction on the same held-out row to the class tally.', voteChart),
  reference('feature-importance', 'Can you compute forest Gini decrease by feature for these trees?',
    'Show the forest Gini decrease by feature and compare the two totals.', 'forest gini decrease by feature',
    'Sum the node-weighted Gini gains by feature and distinguish them from a held-out feature shuffle.', importanceChart),
]);
