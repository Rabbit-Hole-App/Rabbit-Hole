const pruningPath = [
  { alpha: 0.0001, leaves: 10, accuracy: 90 },
  { alpha: 0.001, leaves: 8, accuracy: 90 },
  { alpha: 0.01, leaves: 6, accuracy: 90 },
  { alpha: 0.1, leaves: 4, accuracy: 82 },
  { alpha: 1, leaves: 2, accuracy: 68 },
];
const startingLeaves = pruningPath[0].leaves;
// The path has decreasing leaf counts, so a tie goes to the later tree.
const chosen = pruningPath.reduce((best, trial) => trial.accuracy >= best.accuracy ? trial : best);
const forestSizeAccuracy = [
  [1, 0.78], [5, 0.86], [10, 0.89], [50, 0.92], [200, 0.925],
];
const [lastSize, lastAccuracy] = forestSizeAccuracy.at(-1);
const [previousSize, previousAccuracy] = forestSizeAccuracy.at(-2);
const lateGain = ((lastAccuracy - previousAccuracy) * 100).toFixed(1);

export const lessonDecisionTreesIllustrativeDemos = Object.freeze([
  {
    name: 'cost-complexity-pruning',
    prompt: 'how does cost-complexity pruning trade tree size against accuracy as alpha increases?',
    paraphrase: 'Which pruning penalty gives the fewest leaves while keeping the best held-out accuracy?',
    keywords: ['pruning', 'cost complexity', 'ccp alpha'],
    useWhen: 'Show how increasing the cost-complexity penalty shrinks a tree, and choose the smallest tree on the held-out accuracy plateau.',
    diagramAt(depth) {
      return {
        kind: 'coordinate-plot', title: depth === 'overview' ? 'Prune to a smaller tree' : 'Cost-complexity pruning',
        x: { label: 'Alpha', min: pruningPath[0].alpha, max: pruningPath.at(-1).alpha, scale: 'log' },
        y: { label: 'Leaf share or held-out accuracy', min: 0, max: 100, unit: '%' },
        series: [
          { label: `Leaves (% of ${startingLeaves})`, kind: 'step',
            points: pruningPath.map(({ alpha, leaves }) => ({ x: alpha, y: leaves * 100 / startingLeaves })) },
          { label: 'Held-out accuracy', kind: 'step',
            points: pruningPath.map(({ alpha, accuracy }) => ({ x: alpha, y: accuracy })) },
        ],
        annotations: [{ kind: 'reference-line', axis: 'x', value: chosen.alpha, label: 'Chosen alpha' }],
        caption: 'Illustrative. ' + (depth === 'overview' ? 'A smaller tree can keep its accuracy.' : depth === 'deep' ?
          `Alpha ${chosen.alpha} keeps ${chosen.accuracy}% accuracy with ${chosen.leaves} leaves. Stronger pruning lowers accuracy.` :
          'Choose the smallest tree that keeps the best held-out accuracy.'),
      };
    },
  },
  {
    name: 'forest-size-accuracy',
    prompt: 'how does test accuracy change with 1, 5, 10, 50 and 200 trees in a random forest?',
    paraphrase: 'Can you show why adding more trees eventually makes little difference to test accuracy?',
    keywords: ['number of trees', 'forest size', 'n estimators'],
    useWhen: 'Compare test accuracy at several forest sizes with the same test split and tree settings.',
    diagramAt(depth) {
      return {
        kind: 'coordinate-plot', title: depth === 'overview' ? 'More trees bring smaller gains' : 'Test accuracy by forest size',
        x: { label: 'Number of trees', min: forestSizeAccuracy[0][0], max: lastSize, scale: 'log' },
        y: { label: 'Test accuracy', min: 0.75, max: 0.95 },
        series: [{ label: 'Test accuracy', kind: 'line', points: forestSizeAccuracy.map(([x, y]) => ({
          x, y, label: x === 1 ? '1 tree' : `${x} trees`,
        })) }],
        caption: 'Illustrative. ' + (depth === 'overview' ? 'The curve levels off.' : depth === 'deep' ?
          `From ${previousSize} to ${lastSize} trees, accuracy gains ${lateGain} percentage points on the same test split.` : 'Early trees give the largest gains.'),
      };
    },
  },
]);
