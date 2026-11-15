import { derived as toyDerived } from './topic-model-evaluation-data.js';

const d = toyDerived();
const spec = diagram => ({ version: 1, diagram });
const epochName = epoch => `Epoch ${epoch}`;
const epochAxis = (epochs = d.epochs) => ({ label: 'Epoch', min: epochs[0], max: epochs.at(-1), integerTicks: true });
const line = (label, rows, key) => ({ label, kind: 'line', samples: { x: d.epochs, y: rows.map(row => row[key]) } });
const bars = (title, epochs, values, unit) => ({ kind: 'bar-chart', title, ...(unit ? { unit } : {}), bars: epochs.map((epoch, i) => ({ label: epochName(epoch), value: values[i] })) });
const plot = (title, y, series, annotations) => ({ kind: 'coordinate-plot', title, x: epochAxis(), y, series, ...(annotations ? { annotations } : {}) });
const lossAxis = { label: 'BCE loss', min: 0, max: 1, unit: 'nats' };
const accuracyAxis = { label: 'Accuracy', min: 0, max: 100, unit: '%' };
const compare = (title, caption, diagrams, sharedAxes) => ({ kind: 'comparison', variant: 'panels', title, caption,
  panels: diagrams.map(diagram => ({ heading: diagram.title, diagram })), ...(sharedAxes ? { sharedAxes } : {}) });

const dropout = d.dropout;
const ends = [d.epochs[0], d.epochs.at(-1)];
const dropoutOverview = compare('Dropout metric summaries', 'Illustrative recorded predictions; loss and accuracy describe different aspects of this history.', [
  { kind: 'bar-chart', variant: 'grouped', title: 'Loss', unit: 'nats', categories: ends.map(epochName), series: [
    { label: 'Training', values: [dropout.training[0].lossShown, dropout.training.at(-1).lossShown] },
    { label: 'Held-out', values: [dropout.heldout[0].lossShown, dropout.heldout.at(-1).lossShown] },
  ] },
  bars('Held-out accuracy', ends, [dropout.heldout[0].percent, dropout.heldout.at(-1).percent], '%'),
]);
function dropoutMetrics(deep) {
  return compare('Dropout diagnostics', deep
    ? 'Illustrative recorded predictions; binary cross entropy $L=-y\\ln p-(1-y)\\ln(1-p)$.'
    : 'Illustrative recorded predictions, not an optimizer guarantee.', [
    plot('Loss', lossAxis, [line('Training', dropout.training, 'lossShown'), line('Held-out', dropout.heldout, 'lossShown')]),
    plot('Held-out accuracy', accuracyAxis, [line('Held-out', dropout.heldout, 'percent')]),
  ], ['x']);
}
const confidenceCheck = { kind: 'panels', title: 'One correct prediction can lose less',
  caption: `Illustrative ${dropout.check.id}, true class ${dropout.check.target}; wrong-class probabilities stay below threshold ${d.parameters.threshold}, so both predictions are correct.`,
  panels: [
    ['Class-one p by epoch', dropout.check.probabilities], ['BCE by epoch (nats)', dropout.check.lossesShown],
  ].map(([title, values]) => ({ diagram: { kind: 'bar-chart', title,
    bars: dropout.check.epochs.map((epoch, i) => ({ label: String(epoch), value: values[i] })) } })),
  links: [{ from: 0, to: 1, operation: 'Compute BCE' }] };

const fixed = d.fixedRate;
const lateEpochs = [d.epochs[1], d.epochs.at(-1)];
const fixedOverview = compare('A held-out accuracy plateau', `Illustrative predictions at fixed rate $\\eta=${d.parameters.learningRate}$; not an optimizer guarantee.`, [
  bars('Training loss', lateEpochs, [fixed.training[1].lossShown, fixed.training.at(-1).lossShown], 'nats'),
  { kind: 'bar-chart', variant: 'grouped', title: 'Correct predictions', unit: `of ${d.counts.training}`, categories: lateEpochs.map(epochName), series: [
    { label: 'Training', values: [fixed.training[1].correct, fixed.training.at(-1).correct] },
    { label: 'Held-out', values: [fixed.heldout[1].correct, fixed.heldout.at(-1).correct] },
  ] },
]);
function fixedMetrics(deep) {
  return compare('Fixed-rate diagnostics', deep
    ? `Illustrative predictions; $\\eta=${d.parameters.learningRate}$; gap ${fixed.gapIncrease} percentage points.`
    : `Illustrative predictions; fixed $\\eta=${d.parameters.learningRate}$, no optimizer guarantee.`, [
    plot('Accuracy', accuracyAxis, [line('Training', fixed.training, 'percent'), line('Held-out', fixed.heldout, 'percent')],
      [{ kind: 'band', axis: 'x', from: d.epochs[1], to: d.epochs.at(-1), label: 'Gap opens' }]),
    plot('Training loss', lossAxis, [line('Training', fixed.training, 'lossShown')]),
  ], ['x']);
}
const thresholdCheck = compare('One training case crosses the threshold',
  `Illustrative true class ${fixed.check[0].target}; ${fixed.check[0].id} becomes correct, ${fixed.check[1].id} stays wrong at threshold ${d.parameters.threshold}.`, fixed.check.map((row, i) => ({
    kind: 'coordinate-plot', title: `${row.id} ${i ? 'Held-out' : 'Training'}`, x: epochAxis(row.epochs),
    y: { label: 'Class-one probability', min: 0, max: 1 },
    series: [{ label: 'Class one', kind: 'line', samples: { x: row.epochs, y: row.probabilities } }],
    annotations: [{ kind: 'reference-line', axis: 'y', value: d.parameters.threshold, label: 'Decision threshold' }],
  })), ['x', 'y']);

const source = (name, figures) => figures.map(figure => ({ kind: 'figure-brief', path: `docs/features/explain-on-canvas/handoff/figure-briefs/${name}/briefs.md#figure-${String(figure).padStart(2, '0')}`, revision: '05d5f02f6' }));
const metadata = (id, lessons, sources, prompt, paraphrases, keywords, useWhen, depths) => ({ id, topic: 'model-evaluation', lessons, sources,
  prompts: [prompt, ...paraphrases], paraphrases, keywords, useWhen, illustrative: true, ...depths.standard, depths });
export const references = Object.freeze([
  metadata('ml-model-evaluation-training-diagnostics', ['09', '10'], [...source('d2l-dropout', [2, 3, 4, 5, 6, 7, 8, 9]), ...source('d2l-lenet', [3, 4, 5, 6])],
    'During dropout training the held-out loss can track the training loss while held-out accuracy improves.',
    ['Compare training and held-out loss with held-out accuracy during dropout.', 'Show a dropout metric history with separate loss and accuracy scales.', 'How can dropout validation loss keep falling after accuracy stops changing?', 'Explain loss accuracy traces with the same recorded epochs.', 'Check a dropout prediction that loses less while remaining correct.'],
    ['dropout metrics', 'loss accuracy traces'],
    'Show illustrative dropout loss and held-out accuracy diagnostics; not a dropout mask, a learning-rate policy, or a guarantee of improved generalization.',
    { overview: { spec: spec(dropoutOverview) }, standard: { spec: spec(dropoutMetrics(false)) }, deep: { spec: spec(dropoutMetrics(true)), detailSpec: spec(confidenceCheck) } }),
  metadata('ml-model-evaluation-schedule-run-diagnostics', ['09', '10', '12'], source('d2l-lr-scheduler', [1, 2, 3, 7, 8, 9, 16, 17, 18, 22, 23, 24, 28, 29, 30]),
    'A fixed learning rate can keep improving the training metric after held-out accuracy levels off.',
    ['Show a fixed rate plateau with a growing training heldout gap.', 'Compare training and held-out accuracy while the learning rate stays constant.', 'Why can training loss fall after held-out accuracy reaches a plateau?', 'Plot a constant-rate history with training loss separate from both accuracies.', 'Check training and held-out predictions when an accuracy gap first appears.'],
    ['fixed rate plateau', 'training heldout gap'],
    'Show an illustrative fixed-rate accuracy plateau and training heldout gap; not a learning-rate decay curve or a guarantee that a schedule improves generalization.',
    { overview: { spec: spec(fixedOverview) }, standard: { spec: spec(fixedMetrics(false)) }, deep: { spec: spec(fixedMetrics(true)), detailSpec: spec(thresholdCheck) } }),
]);
export function derived() { return toyDerived(); }
