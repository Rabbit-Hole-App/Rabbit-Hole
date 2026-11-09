import { references as statistical } from './ml-statistical-references.js';
import { references as plots } from './ml-plot-references.js';

// Extend the established examples instead of silently changing their counts or
// predictions. All data remains illustrative author context, not source facts.
const confusion = structuredClone(statistical.find(ref => ref.id === 'confusion-matrix-counts').spec.diagram);
confusion.title = 'Actual rows, predicted columns';
confusion.caption = 'There are 100 actual negatives and 100 actual positives. The highlighted 20 are missed positives.';

const residuals = structuredClone(plots.find(ref => ref.id === 'regression-residuals').spec.diagram);
residuals.title = 'Three small misses and a larger one';
residuals.y.max = 9;
const observed = residuals.series.find(series => series.label === 'Observed');
observed.points = [...observed.points, { x: 4, y: 8, id: 's4' }].map(point => ({ ...point, label: point.id.toUpperCase() }));
residuals.annotations = [
  { kind: 'segment', from: { x: 1, y: 2 }, to: { x: 1, y: 3 }, label: '$e_1=1$' },
  { kind: 'segment', from: { x: 2, y: 3 }, to: { x: 2, y: 2 }, label: '$e_2=-1$' },
  { kind: 'segment', from: { x: 3, y: 4 }, to: { x: 3, y: 5 }, label: '$e_3=1$' },
  { kind: 'segment', from: { x: 4, y: 5 }, to: { x: 4, y: 8 }, label: '$e_4=3$' },
];
residuals.caption = String.raw`Prediction is $\hat y=x+1$. A residual is actual minus predicted: $e=y-\hat y$. The line is the same for all four samples.`;

export const references = [
  {
    id: 'ml-confusion-denominators', lessons: ['09'],
    prompts: ['Why do precision and recall divide by different totals?'],
    keywords: ['precision', 'recall', 'specificity', 'confusion matrix', 'denominator', 'different totals', 'predicted positives', 'actual positives'],
    useWhen: 'Calculate precision, recall and specificity from one labelled confusion matrix. State which population each denominator counts.',
    spec: { version: 1, diagram: {
      kind: 'comparison', variant: 'panels', title: 'Each rate asks about a different group',
      panels: [
        { heading: 'Start with the same 200 cases', diagram: confusion },
        { heading: 'Choose the denominator', diagram: {
          kind: 'matrix', layout: 'teaching', title: 'Correct cases out of the relevant group',
          columns: ['Ratio', 'Rate'],
          rows: [
            { id: 'precision', heading: 'Precision', cells: [String.raw`$\frac{80}{90}$`, '88.89%'] },
            { id: 'recall', heading: 'Recall', cells: [String.raw`$\frac{80}{100}$`, '80%'] },
            { id: 'specificity', heading: 'Specificity', cells: [String.raw`$\frac{90}{100}$`, '90%'] },
          ],
          emphasis: { columns: [1] },
          caption: 'Precision uses predicted positives; recall uses actual positives; specificity uses actual negatives. Percentages are rounded.',
        } },
      ],
      caption: 'Precision asks whether positive predictions were right. Recall asks how many positives were found. Specificity asks about negatives.',
    } },
  },
  {
    id: 'ml-regression-error-metrics', lessons: ['09'],
    prompts: ['Why is RMSE bigger than MAE when one prediction is far off?'],
    keywords: ['mae', 'rmse', 'mse', 'mean absolute error', 'root mean squared error', 'prediction errors', 'absolute and squared', 'large mistakes'],
    useWhen: 'Compute signed residuals, absolute and squared errors, and all three aggregates on the same predictions. Keep units and rounding explicit.',
    spec: { version: 1, diagram: {
      kind: 'comparison', variant: 'panels', title: 'MAE and RMSE on the same errors',
      panels: [
        { heading: 'Keep the predictions fixed', diagram: residuals },
        { heading: 'Measure each miss', diagram: {
          kind: 'matrix', layout: 'teaching', title: 'One row per residual',
          columns: ['Error', 'Abs.', 'Square'],
          rows: [
            { id: 's1', heading: 'S1', cells: ['1', '1', '1'] },
            { id: 's2', heading: 'S2', cells: ['-1', '1', '1'] },
            { id: 's3', heading: 'S3', cells: ['1', '1', '1'] },
            { id: 's4', heading: 'S4', cells: ['3', '3', '9'] },
          ], emphasis: { rows: ['s4'] },
          caption: 'Absolute errors total 6. Squared errors total 12. Taking magnitudes or squares prevents opposite signs from cancelling.',
        } },
        { heading: 'Aggregate the same four errors', diagram: {
          kind: 'matrix', layout: 'teaching', title: 'Average over all four samples',
          columns: ['Calculation', 'Result'],
          rows: [
            { id: 'mae', heading: 'MAE', cells: ['$6/4$', '1.500'] },
            { id: 'mse', heading: 'MSE', cells: ['$12/4$', '3.000'] },
            { id: 'rmse', heading: 'RMSE', cells: [String.raw`$\sqrt{12/4}$`, '1.732'] },
          ],
          caption: 'MAE and RMSE use target units; MSE uses squared units. Every sample has equal weight. Displayed results are rounded.',
        } },
      ],
      caption: 'The largest miss supplies half the total absolute error and three quarters of the total squared error. Squaring gives it more influence.',
    } },
  },
];
