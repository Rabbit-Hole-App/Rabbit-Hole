import { VISUAL_PROGRAM_STAMPS } from './stamps.js';

export const classImbalanceFixture = {
  id: 'fixture-ai-class-imbalance',
  stamps: VISUAL_PROGRAM_STAMPS,
  manifest: {
    title: 'Class Imbalance Explorer',
    summary: 'Class prevalence can change precision even when a classifier keeps the same recall and false-positive rate.',
    description: 'A confusion matrix and three metrics update as the share of positive cases changes.',
    cardDescription: 'This classifier catches 80% of positives and falsely flags 10% of negatives. When positives are rare, false alarms can outnumber correct positive predictions.',
    instructions: 'Set the positive share to 1%, then 50%. Compare precision and recall.',
    assumptions: ['An illustrative population of 1,000 cases with fixed true-positive and false-positive rates.'],
    capabilities: ['number_inputs'],
    inputs: [{ id: 'prevalence', label: 'Positive share', type: 'number', unit: '%', default: 10, min: 1, max: 50, step: 1 }],
    readouts: [],
  },
  source: `
export function evaluate({ inputs }) {
  const total = 1000;
  const positives = 10 * Math.round(inputs.prevalence);
  const negatives = total - positives;
  const tp = positives * 8 / 10;
  const fn = positives - tp;
  const fp = negatives / 10;
  const tn = negatives - fp;
  const objects = [
    sdk.text('counts-heading', 24, 28, 'Prediction counts'),
    sdk.text('metrics-heading', 404, 28, 'Model metrics'),
    sdk.text('predicted-positive', 184, 60, 'Predicted +', { align: 'middle' }),
    sdk.text('predicted-negative', 303, 60, 'Predicted −', { align: 'middle' }),
    sdk.text('actual-positive', 24, 104, 'Actual +'),
    sdk.text('actual-negative', 24, 160, 'Actual −'),
    sdk.box('tp', 131, 78, 106, 42, { text: String(tp), role: 'output' }),
    sdk.box('fn', 250, 78, 106, 42, { text: String(fn), role: 'warning' }),
    sdk.box('fp', 131, 134, 106, 42, { text: String(fp), role: 'warning' }),
    sdk.box('tn', 250, 134, 106, 42, { text: String(tn), role: 'output' }),
    ...sdk.readout('precision', { x: 404, y: 49, w: 228, h: 42, label: 'Precision', value: 100 * tp / (tp + fp), decimals: 1, unit: '%', role: 'learner' }),
    ...sdk.readout('recall', { x: 404, y: 103, w: 228, h: 42, label: 'Recall', value: 100 * tp / positives, decimals: 1, unit: '%' }),
    ...sdk.readout('accuracy', { x: 404, y: 157, w: 228, h: 42, label: 'Accuracy', value: 100 * (tp + tn) / total, decimals: 1, unit: '%' }),
  ];
  return { frame: sdk.frame(objects, { width: 656, height: 222 }) };
}`,
};
