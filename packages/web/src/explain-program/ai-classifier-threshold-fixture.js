import { RASTER_CAPABILITY } from './stamps.js';

export const classifierThresholdFixture = {
  id: 'fixture-ai-classifier-threshold',
  manifest: {
    title: 'Classifier Threshold Explorer',
    summary: 'Move the cutoff to change which examples predict positive. Try 0.70 and 0.50. Catching the second positive also adds false alarms, so recall can rise while accuracy falls. Precision is undefined when no examples predict positive.',
    description: 'A plot of ten scores on two rows for the actual class, with a vertical cutoff. The confusion matrix and the precision, recall and accuracy readouts update with the predictions.',
    assumptions: ['Fixed synthetic scores, with two actual positives and eight actual negatives.', 'A score at or above the cutoff predicts positive.'],
    capabilities: [RASTER_CAPABILITY, 'number_inputs'],
    inputs: [{ id: 'cutoff', label: 'Cutoff', type: 'number', default: .70, min: 0, max: 1, step: .01 }],
    readouts: [],
  },
  source: `
const examples = [
  [.90, 1], [.64, 1],
  [.59, 0], [.52, 0], [.49, 0], [.28, 0], [.17, 0], [.13, 0], [.08, 0], [.04, 0],
];

export function evaluate({ inputs }) {
  const { cutoff } = inputs;
  // Rows are actual positive/negative. Columns are predicted positive/negative.
  const matrix = [[0, 0], [0, 0]];
  const positives = [], negatives = [];
  for (const [score, actual] of examples) {
    const predictedPositive = score >= cutoff;
    matrix[actual === 1 ? 0 : 1][predictedPositive ? 0 : 1]++;
    (predictedPositive ? positives : negatives).push([score, actual]);
  }
  const [[tp, fn], [fp, tn]] = matrix;
  const precision = tp + fp ? tp / (tp + fp) : null;
  const recall = tp / (tp + fn);
  const accuracy = (tp + tn) / examples.length;

  const yDomain = [-0.5, 1.5];
  const series = [{ id: 'cutoff', role: 'learner', points: yDomain.map(y => [cutoff, y]) }];
  if (positives.length) series.push({ id: 'positive', kind: 'scatter', role: 'learner', points: positives });
  if (negatives.length) series.push({ id: 'negative', kind: 'scatter', role: 'observed', points: negatives });

  const statsX = 426, statsW = 322;
  const percent = (id, y, label, value, role = 'neutral') =>
    sdk.readout(id, { x: statsX, y, w: statsW, h: 36, label, value: value * 100, unit: '%', decimals: 0, role });
  const objects = [
    sdk.circle('positive-key', 20, 19, 9, { role: 'learner' }),
    sdk.text('positive-label', 36, 28, 'Predict positive'),
    sdk.circle('negative-key', 161, 19, 9, { role: 'observed' }),
    sdk.text('negative-label', 177, 28, 'Predict negative'),
    ...sdk.plot('scores', {
      x: 16, y: 44, w: 386, h: 256, xDomain: [0, 1], yDomain,
      xLabel: 'Predicted probability', yLabel: 'Actual label (0 or 1)', series,
    }),
    sdk.line('divider', 410, 20, 410, 304, { opacity: .5 }),
    sdk.text('matrix-label', statsX, 34, 'Confusion matrix'),
    ...sdk.grid('matrix', {
      x: statsX, y: 48, w: statsW, h: 104, rows: matrix,
      rowLabels: ['Actual +', 'Actual −'], columnLabels: ['Predict +', 'Predict −'],
    }),
    ...(precision === null
      ? [sdk.box('precision', statsX, 170, statsW, 36, { text: 'Precision: —' })]
      : percent('precision', 170, 'Precision', precision)),
    ...percent('recall', 216, 'Recall', recall, 'learner'),
    ...percent('accuracy', 262, 'Accuracy', accuracy),
  ];

  return {
    frame: sdk.frame(objects, { width: 766, height: 322 }),
    quantities: { tp, fp, fn, tn, ...(precision === null ? {} : { precision }), recall, accuracy },
  };
}`,
};
