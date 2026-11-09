// Runnable semantic JSON. Panel children are full leaf diagrams, never another
// comparison/transformation. Identity mappings use row IDs or plot-point IDs.
const axis = (label, min, max, unit) => ({ label, min, max, scale: 'linear', ...(unit ? { unit } : {}) });
const points = values => values.map(([x, y, id, label]) => ({ x, y, ...(id ? { id } : {}), ...(label ? { label } : {}) }));
const series = (label, kind, values) => ({ label, kind, points: points(values) });
const plot = (title, x, y, entries, caption) => ({ kind: 'coordinate-plot', title, x, y, series: entries, ...(caption ? { caption } : {}) });
const panels = (title, entries, caption, sharedAxes) => ({ version: 1, diagram: {
  kind: 'comparison', variant: 'panels', title,
  panels: entries.map(([heading, diagram]) => ({ heading, diagram })),
  ...(caption ? { caption } : {}), ...(sharedAxes ? { sharedAxes } : {}),
} });
const transform = (title, operation, before, after, identity, caption) => ({ version: 1, diagram: {
  kind: 'transformation', variant: 'visual', title, operation,
  before: { label: 'Before', diagram: before }, after: { label: 'After', diagram: after }, identity,
  ...(caption ? { caption } : {}),
} });
const matrix = (title, columns, rows, extra = {}) => ({ kind: 'matrix', layout: 'teaching', title, columns,
  rows: rows.map(([id, heading, cells]) => ({ id, heading, cells })), ...extra });

const fitX = axis('Input x', 0, 4), fitY = axis('Target y', 0, 10);
const observations = [[0, 1], [1, 2.2], [2, 4.8], [3, 7.2], [4, 9]];
const fit = (title, values) => plot(title, fitX, fitY, [series('Observed samples', 'scatter', observations), series('Fitted prediction', 'line', values)]);
const clusterX = axis('Feature 1', 0, 10), clusterY = axis('Feature 2', 0, 10);
const clusterA = [[1, 1], [1, 2], [2, 1]], clusterB = [[7, 7], [7, 8], [8, 7]];
const driftX = axis('Input $x$', 0, 5), driftY = axis('Target $y$', 0, 10);
const drift = (title, values) => plot(title, driftX, driftY, [series('Observed samples', 'scatter', values)]);
const boostingX = axis('Sample position', 0, 4), boostingY = axis('Target or prediction', 0, 4);
const targets = [[1, 1, 'a', 'A'], [2, 2, 'b', 'B'], [3, 3, 'c', 'C']];

export const references = [
  {
    id: 'ml-fit-quality-comparison', lessons: ['02', '10'],
    prompts: ['Compare underfitting, a reasonable fit, and overfitting on the same observations.'],
    keywords: ['underfitting', 'overfitting', 'overfit', 'overfitted', 'what is overfitting', "what's overfitting", 'memorizes the training data', 'fits the noise', 'fit comparison', 'bias variance', 'polynomial fit'],
    useWhen: 'Compare fitted functions using the same observed data and exactly shared coordinate axes.',
    spec: panels('Fit quality on the same observations', [
      ['Underfit', fit('A constant misses the trend', [[0, 4.84], [4, 4.84]])],
      ['Reasonable fit', fit('A smooth increasing fit', [[0, 0.8], [1, 2.4], [2, 4.7], [3, 7], [4, 9.1]])],
      ['Overfit', fit('An oscillating interpolating fit', [[0, 1], [0.5, 4], [1, 2.2], [1.5, 1], [2, 4.8], [2.5, 9], [3, 7.2], [3.5, 5], [4, 9]])],
    ], 'Illustrative fits share the same samples. Overfitting concerns generalization, not training error alone.', ['x', 'y']),
  },
  {
    id: 'ml-feature-scaling-transformation', lessons: ['06', '08'],
    prompts: ['Show feature scaling while preserving each sample identity.'],
    keywords: ['feature scaling', 'standardization', 'standardisation', 'scaling knn', 'normalize features', 'batch normalization', 'batch normalisation', 'batch norm', 'batchnorm'],
    useWhen: 'Show exact before-and-after coordinates for a stated centering and scaling operation, keeping point IDs.',
    spec: transform('Center and scale two features', String.raw`$x' = \frac{x-150}{50}$ and $y' = \frac{y-20}{10}$`,
      plot('Original feature values', axis('Feature $x$', 80, 220), axis('Feature $y$', 0, 50), [series('Samples', 'scatter', [[100, 10, 'a', 'A'], [150, 20, 'b', 'B'], [200, 40, 'c', 'C']])]),
      plot('Centered and scaled values', axis("Scaled feature $x'$", -2, 2), axis("Scaled feature $y'$", -2, 3), [series('Samples', 'scatter', [[-1, -1, 'a', 'A'], [0, 0, 'b', 'B'], [1, 2, 'c', 'C']])]),
      { mode: 'preserved', note: 'A, B and C retain their sample IDs; only feature coordinates change.' },
      'The stated centers and scales are fixed teaching values, not estimates fitted from these three samples.'),
  },
  {
    id: 'ml-clustering-comparison', lessons: ['07'],
    prompts: ['Compare K-means and DBSCAN assignments on the same small sample set.'],
    keywords: ['k-means versus dbscan', 'kmeans dbscan', 'clustering comparison', 'density noise'],
    useWhen: 'Compare fixed cluster assignments, with explicit noise membership and the same feature domains.',
    spec: panels('Two clustering assignments', [
      ['K-means: every point assigned', plot('Two centroid-based groups', clusterX, clusterY, [series('Cluster 1', 'scatter', [...clusterA, [5, 0]]), series('Cluster 2', 'scatter', clusterB)])],
      ['DBSCAN: noise allowed', plot('Two dense groups and noise', clusterX, clusterY, [series('Cluster 1', 'scatter', clusterA), series('Cluster 2', 'scatter', clusterB), series('Noise', 'scatter', [[5, 0]])])],
    ], 'Fixed illustrative assignments: the isolated point joins a K-means cluster but is noise in the density-based view.', ['x', 'y']),
  },
  {
    id: 'ml-covariate-drift-comparison', lessons: ['20'],
    prompts: ['Show covariate drift where inputs shift while the target rule stays fixed.'],
    keywords: ['covariate drift', 'covariate shift', 'input distribution drift', 'three drift types'],
    useWhen: 'Contrast shifted input samples under an unchanged conditional target rule.',
    spec: { version: 1, diagram: plot('Covariate drift: inputs shift', driftX, driftY, [
      series('Reference window', 'scatter', [[1, 2], [1.5, 3], [2, 4]]),
      series('Current window', 'scatter', [[2.5, 5], [3, 6], [3.5, 7]]),
    ], 'Input values shift while the same illustrative conditional rule $y = 2x$ remains in force.') },
  },
  {
    id: 'ml-label-prior-drift-comparison', lessons: ['17', '20'],
    prompts: ['Show label-prior shift as a change in class prevalence.'],
    keywords: ['label shift', 'prior shift', 'class prevalence drift', 'three drift types'],
    useWhen: 'Compare class prevalence in equally sized windows; do not infer a changed conditional relationship from counts alone.',
    spec: { version: 1, diagram: {
      kind: 'bar-chart', variant: 'grouped', title: 'Label-prior shift: class balance changes', unit: 'samples',
      categories: ['Class 0', 'Class 1'],
      series: [{ label: 'Reference window', values: [7, 3] }, { label: 'Current window', values: [3, 7] }],
      caption: 'Each window contains 10 samples. Label shift assumes the within-class feature distributions remain unchanged.',
    } },
  },
  {
    id: 'ml-concept-drift-comparison', lessons: ['20'],
    prompts: ['Show concept drift where the input-to-target relationship changes.'],
    keywords: ['concept drift', 'conditional drift', 'target relationship changes', 'three drift types'],
    useWhen: 'Hold inputs fixed and show a changed conditional target relationship on the same axes.',
    spec: panels('Concept drift: the target rule changes', [
      ['Reference window', drift('Targets follow $y = 2x$', [[1, 2], [2, 4], [3, 6]])],
      ['Current window', drift('Targets follow $y = 8 - 2x$', [[1, 6], [2, 4], [3, 2]])],
    ], 'The input values stay fixed; the illustrative relationship between input and target changes.', ['x', 'y']),
  },
  {
    id: 'ml-one-hot-encoding-transformation', lessons: ['08'],
    prompts: ['Explain one-hot encoding while keeping row identity visible.'],
    keywords: ['one-hot encoding', 'categorical encoding', 'dummy columns', 'encoding transformation'],
    useWhen: 'Show categorical values expanding into explicit indicator columns while other features and row IDs are preserved.',
    spec: transform('One-hot encode a categorical feature', 'Replace Color with Red and Blue indicator columns',
      matrix('Original records', ['Color', 'Amount'], [['a', 'Row A', ['Red', '10']], ['b', 'Row B', ['Blue', '20']], ['c', 'Row C', ['Red', '30']]]),
      matrix('Encoded records', ['Red', 'Blue', 'Amount'], [['a', 'Row A', ['1', '0', '10']], ['b', 'Row B', ['0', '1', '20']], ['c', 'Row C', ['1', '0', '30']]], { emphasis: { columns: [0, 1] } }),
      { mode: 'preserved', note: 'Row IDs A, B and C and the Amount values are unchanged; Color becomes two indicator columns.' }),
  },
  {
    id: 'ml-imputation-transformation', lessons: ['08', '13'],
    prompts: ['Show a missing value filled with a training-set imputation statistic.'],
    keywords: ['imputation', 'missing value', 'mean imputer', 'fit transform leakage'],
    useWhen: 'Show exactly which cell changes, state the training-only statistic, and preserve all row identities.',
    spec: transform('Impute one missing feature value', 'Fill missing Age with the training-set mean of 30',
      matrix('Before imputation', ['Age', 'Score'], [['a', 'Row A', ['20', '4']], ['b', 'Row B', ['Missing', '7']], ['c', 'Row C', ['40', '8']]], { states: [{ row: 'b', column: 0, state: 'missing' }] }),
      matrix('After imputation', ['Age', 'Score'], [['a', 'Row A', ['20', '4']], ['b', 'Row B', ['30', '7']], ['c', 'Row C', ['40', '8']]], { states: [{ row: 'b', column: 0, state: 'changed' }] }),
      { mode: 'preserved', note: 'All row IDs and observed cells remain unchanged; only Row B’s missing Age is filled.' },
      'Fit the imputer on training data only, then reuse that statistic for validation and test data.'),
  },
  {
    id: 'ml-boosting-correction-transformation', lessons: ['11'],
    prompts: ['Show one boosting update that adds a residual correction to current predictions.'],
    keywords: ['boosting residuals', 'residual correction', 'gradient boosting update', 'additive ensemble'],
    useWhen: 'Show a fixed additive prediction update on the same sample identities, with a stated learning rate.',
    spec: transform('One residual correction step', 'Update predictions with $F_1 = F_0 + 0.5r$',
      plot('Current predictions', boostingX, boostingY, [series('Targets', 'scatter', targets), series('Prediction $F_0$', 'line', [[1, 2, 'a'], [2, 2, 'b'], [3, 2, 'c']])]),
      plot('Updated predictions', boostingX, boostingY, [series('Targets', 'scatter', targets), series('Prediction $F_1$', 'line', [[1, 1.5, 'a'], [2, 2, 'b'], [3, 2.5, 'c']])]),
      { mode: 'preserved', note: 'Samples A, B and C keep their targets and IDs. Residuals −1, 0 and 1 yield updates −0.5, 0 and 0.5.' },
      'This fixed example uses an exact residual correction to illustrate the additive update; no model training is performed.'),
  },
  {
    id: 'ml-differencing-transformation', lessons: ['15'],
    prompts: ['Show first differencing and map each difference to its two source observations.'],
    keywords: ['first difference', 'time series differencing', 'stationarity transform', 'difference snapshots'],
    useWhen: 'Show exact consecutive differences and explicit many-to-one correspondence to source observation IDs.',
    spec: transform('First-difference a short time series', String.raw`Subtract the previous observation to get $\Delta y_t = y_t - y_{t-1}$`,
      plot('Original observations', axis('Time', 1, 4), axis('Observed value', 0, 20), [series('$y$', 'line', [[1, 10, 't1', 't1'], [2, 13, 't2', 't2'], [3, 15, 't3', 't3'], [4, 19, 't4', 't4']])]),
      plot('Consecutive differences', axis('Time', 1, 4), axis('Difference', 0, 5), [series(String.raw`$\Delta y$`, 'line', [[2, 3, 'd2', 'd2'], [3, 2, 'd3', 'd3'], [4, 4, 'd4', 'd4']])]),
      { mode: 'mapped', note: 'Each output uses the current and previous observation. The first observation has no earlier value.', mappings: [
        { from: 't1', to: 'd2', note: 'Subtract 10' }, { from: 't2', to: 'd2', note: '$13 - 10 = 3$' },
        { from: 't2', to: 'd3', note: 'Subtract 13' }, { from: 't3', to: 'd3', note: '$15 - 13 = 2$' },
        { from: 't3', to: 'd4', note: 'Subtract 15' }, { from: 't4', to: 'd4', note: '$19 - 15 = 4$' },
      ] }),
  },
];
