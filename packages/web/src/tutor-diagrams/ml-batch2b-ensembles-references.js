// Illustrative Lesson 11 examples rendered by the shared teaching layouts.
const matrix = (title, columns, rows, extras = {}) => ({
  kind: 'matrix', layout: 'teaching', title, columns,
  rows: rows.map(([id, heading, cells]) => ({ id, heading, cells })),
  ...extras,
});
const decrease = String.raw`$e^{-\alpha}$`;
const increase = String.raw`$e^\alpha$`;

export const references = [
  {
    id: 'ml-soft-vote-probabilities', lessons: ['11'],
    prompts: ['How can soft voting pick a different class from the majority vote?'],
    keywords: ['soft voting', 'soft vote', 'hard voting', 'hard vote', 'majority vote', 'class probabilities', 'averaging class probabilities'],
    useWhen: 'Compare one vote per model with equal-weight averages of normalized class probabilities. Show the same models, class totals and the winner under each rule.',
    spec: { version: 1, diagram: {
      kind: 'comparison', variant: 'panels', title: 'Hard and soft voting can pick different classes',
      panels: [
        { heading: 'Start with three models', diagram: matrix('Probabilities for the same example', ['Class A', 'Class B'], [
          ['model-1', 'Model 1', ['55%', '45%']],
          ['model-2', 'Model 2', ['55%', '45%']],
          ['model-3', 'Model 3', ['5%', '95%']],
        ], {
          emphasis: { cells: [{ row: 'model-1', column: 0 }, { row: 'model-2', column: 0 }, { row: 'model-3', column: 1 }] },
          caption: 'Each model’s two probabilities add to 100%. The hard votes are A, A and B.',
        }) },
        { heading: 'Apply the two voting rules', diagram: matrix('Hard counts and soft averages', ['Class A', 'Class B'], [
          ['hard', 'Hard', ['2 votes', '1 vote']],
          ['soft', 'Soft', ['38.33%', '61.67%']],
        ], {
          emphasis: { cells: [{ row: 'hard', column: 0 }, { row: 'soft', column: 1 }] },
          caption: 'Hard voting picks A. For soft voting, average (55 + 55 + 5) ÷ 3 for A and (45 + 45 + 95) ÷ 3 for B. B wins. Averages are rounded.',
        }) },
      ],
      caption: 'Model 3’s strong support for B outweighs the two narrow leads for A when all models have equal weight.',
    } },
  },
  {
    id: 'ml-adaboost-weight-update', lessons: ['11'],
    prompts: ['What happens to the training weights after AdaBoost gets one example wrong?'],
    keywords: ['adaboost', 'adaptive boosting', 'training weights', 'weight update', 'weighted error', 'misclassified examples', 'reweighted', 'boosting round'],
    useWhen: 'Work through one binary AdaBoost round. Compute the weighted error and learner coefficient, multiply each example weight by its error-dependent exponential factor and normalize the same examples for the next learner.',
    spec: { version: 1, diagram: {
      kind: 'transformation', variant: 'visual', title: 'AdaBoost gives the missed row more weight',
      operation: 'Multiply by the factor for each row, then normalize',
      before: { label: 'Before the weight update', diagram: matrix('Equal weight on every row', ['Result', 'Weight'], [
        ['r1', 'R1', ['Correct', '1/4']],
        ['r2', 'R2', ['Correct', '1/4']],
        ['r3', 'R3', ['Missed', '1/4']],
        ['r4', 'R4', ['Correct', '1/4']],
      ], {
        emphasis: { rows: ['r3'] },
        caption: String.raw`Only R3 is missed, so the weighted error is 1/4. The binary learner coefficient is $\alpha=\ln(3)/2$.`,
      }) },
      after: { label: 'After normalization', diagram: matrix('More weight on the missed row', ['Factor', 'Weight'], [
        ['r1', 'R1', [decrease, '1/6']],
        ['r2', 'R2', [decrease, '1/6']],
        ['r3', 'R3', [increase, '1/2']],
        ['r4', 'R4', [decrease, '1/6']],
      ], {
        emphasis: { rows: ['r3'] },
        caption: 'Divide by the sum of the four scaled weights. The next learner uses these weights, which sum to 1.',
      }) },
      identity: { mode: 'preserved', note: 'R1–R4 are the same examples in both tables. R3 goes from 1/4 to 1/2.' },
    } },
  },
  {
    id: 'ml-stacking-oof-predictions', lessons: ['11'],
    prompts: ['Where do the out-of-fold predictions for the stacking model come from?'],
    keywords: ['stacking', 'out of fold', 'oof predictions', 'meta learner', 'meta training prediction', 'stacking folds'],
    useWhen: 'Show which rows fit each fold’s two base learners and which rows they predict. Trace the two out-of-fold feature values and original target for every row of the meta-training matrix.',
    spec: { version: 1, diagram: {
      kind: 'comparison', variant: 'panels', title: 'Stacking learns from held-out predictions',
      panels: [
        { heading: 'Generate held-out scores', diagram: matrix('Training and prediction rows', ['Fit both', 'Predict'], [
          ['f1', 'F1', ['R3, R4', 'R1, R2']],
          ['f2', 'F2', ['R1, R2', 'R3, R4']],
        ], {
          emphasis: { columns: [1] },
          caption: 'In each fold, fit a linear classifier and a tree on the fit rows. Use both models to predict only the held-out rows.',
        }) },
        { heading: 'Assemble the meta-training rows', diagram: matrix('Out-of-fold features and targets', ['Linear', 'Tree', 'Target'], [
          ['r1', 'R1 · F1', ['0.20', '0', '0']],
          ['r2', 'R2 · F1', ['0.75', '1', '1']],
          ['r3', 'R3 · F2', ['0.60', '1', '0']],
          ['r4', 'R4 · F2', ['0.80', '1', '1']],
        ], {
          caption: 'The two feature columns are example probabilities of class 1. The target is the observed class for that row.',
        }) },
      ],
      caption: 'Every row appears once and gets both scores from models fit on the other fold.',
    } },
  },
];
