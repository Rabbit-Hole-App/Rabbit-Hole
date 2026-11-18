import { derived as toyDerived } from './topic-regularization-data.js';

const d = toyDerived();
const spec = diagram => ({ version: 1, diagram });
const fit = d.regularization;
const base = fit.cases[1];
const stronger = fit.cases[2];
const stack = (title, row) => ({ kind: 'bar-chart', variant: 'stacked', title, unit: 'Objective', bars: [{ label: 'Data fit', value: fit.mse }, { label: 'Penalty', value: row.penalty }], total: row.total });
const objectiveOverview = { kind: 'panels', title: 'Fit plus a weight penalty', caption: 'Worked example. Penalizing weights adds to the data loss; the bias is excluded.',
  panels: [{ diagram: { kind: 'block-stack', title: 'Objective terms', blocks: [{ id: 'fit', label: 'Data fit' }, { id: 'obj', label: 'Objective', merge: 'add', inputs: [{ label: 'Weight penalty' }] }] } },
    { diagram: { kind: 'bar-chart', title: 'Total objective', bars: [{ label: 'Without penalty', value: fit.cases[0].total }, { label: 'With penalty', value: base.total }] } }], links: [{ from: 0, to: 1, operation: 'Add' }] };
function objective(deep) {
  return { kind: 'panels', title: 'Loss and regularized objective',
    caption: deep ? 'Worked example. $\\Delta J=\\Delta\\lambda\\|w\\|^2$ for fixed weights; the bias is excluded.' : `Worked example. $\\lambda=${base.strength}$, $\\|w\\|^2=${fit.normSquared}$; the bias is excluded.`,
    panels: [{ diagram: { kind: 'block-stack', title: 'Dependencies', blocks: [{ id: 'pred', label: 'Prediction', inputs: [{ label: '$x$' }, { label: '$w,b$' }] }, { id: 'loss', label: 'Data fit', inputs: [{ label: 'Targets' }] }, { id: 'obj', label: 'Objective', merge: 'add', inputs: [{ label: '$\\lambda\\|w\\|^2$' }] }] } }, { diagram: stack('Objective parts', base) }], links: [{ from: 0, to: 1, operation: 'Evaluate' }] };
}
const terms = (title, row) => ({ kind: 'bar-chart', title, bars: [{ label: 'Data fit', value: fit.mse }, { label: 'Penalty', value: row.penalty }] });
const strength = { kind: 'panels', title: 'Change strength, keep the predictions', caption: `Worked example. Same fit; $\\lambda=${base.strength}\\to${stronger.strength}$, $J=${base.total}\\to${stronger.total}$.`,
  panels: [{ diagram: terms('Original strength', base) }, { diagram: terms('Doubled strength', stronger) }], links: [{ from: 0, to: 1, operation: '$\\lambda\\times2$' }], shared: ['classes', 'colours'] };
const activationBars = (title, values) => ({ kind: 'bar-chart', title, bars: values.map((value, i) => ({ label: ['Hidden A', 'Hidden B'][i], value })) });
const activationPlot = (title, y) => ({ kind: 'coordinate-plot', title,
  x: { label: 'Hidden unit', min: 0, max: d.counts.hidden + d.parameters.hidden.outputBias },
  y: { label: 'Activation', min: 0, max: Math.max(...d.dropout.selected.scaled) },
  series: [{ label: 'A then B', kind: 'stem', samples: { x: d.hidden.selected.input.map((_, i) => i + 1), y } }] });
function dropout(level) {
  const brief = level === 'overview';
  const draw = brief ? activationBars : activationPlot;
  const panels = [{ diagram: draw('Before mask', d.hidden.selected.activations) }, { diagram: draw('Mask only', d.dropout.selected.masked) }];
  const links = [{ from: 0, to: 1, operation: 'Mask' }];
  if (!brief) {
    panels.push({ diagram: draw('Training output', d.dropout.selected.scaled) });
    links.push({ from: 1, to: 2, operation: `$\\div ${d.parameters.dropout.keepProbability}$` });
  }
  return { kind: 'panels', title: brief ? 'A temporary dropout mask' : 'Mask and rescale',
    caption: brief ? 'Worked example. The mask zeros an activation for this pass; inference keeps the full network.' : level === 'deep' ? 'Worked example. $E[mh/q]=h$; linear readout check below.' : `Worked example. A then B; keep probability $q=${d.parameters.dropout.keepProbability}$.`,
    panels, links, shared: brief ? ['classes', 'colours'] : ['axis'] };
}
const expectation = { kind: 'panels', title: 'Check the linear readout over all masks', caption: `Worked example. ${d.counts.masks} equally likely masks; averaging matches inference for this linear readout.`,
  panels: [{ diagram: { kind: 'bar-chart', title: 'Outputs by mask', bars: d.dropout.masks.map((row, i) => ({ label: ['None', 'A only', 'B only', 'Both'][i], value: row.prediction })) } },
    { diagram: { kind: 'bar-chart', title: 'Expected output', bars: [{ label: 'Mask mean', value: d.dropout.meanPrediction }, { label: 'Inference', value: d.hidden.selected.prediction }] } }], links: [{ from: 0, to: 1, operation: 'Average masks' }] };

const metadata = (id, source, lessons, prompt, paraphrases, keywords, useWhen, depths) => ({ id, topic: 'regularization', lessons,
  sources: [{ kind: 'figure-brief', path: `docs/features/explain-on-canvas/handoff/figure-briefs/${source}/briefs.md#figure-01`, revision: '05d5f02f6' }],
  prompts: [prompt, ...paraphrases], paraphrases, keywords, useWhen, ...depths.standard, depths });
export const references = Object.freeze([
  metadata('ml-regularization-regularized-objective', 'd2l-backprop', ['02', '10'],
    'A computation graph shows which intermediate values, weights and targets determine the data loss and the regularized objective.',
    ['Show a penalized objective with data loss and a weight penalty.', 'How does a regularization cost add to mean squared error?', 'Draw the dependencies of a penalized objective and its stacked parts.', 'Keep the predictions fixed and double the regularization cost strength.', 'Explain a penalized objective without confusing the loss with its weight penalty.'],
    ['penalized objective', 'regularization cost'], 'Show independent data-loss and weight-penalty dependencies and their sum; not an optimizer update or an overfitting curve.',
    { overview: { spec: spec(objectiveOverview) }, standard: { spec: spec(objective(false)) }, deep: { spec: spec(objective(true)), detailSpec: spec(strength) } }),
  metadata('ml-regularization-dropout-mask', 'd2l-dropout', ['10', '12'],
    'Training-time dropout temporarily disables some hidden activations and their paths while retaining the full network for inference.',
    ['Show a temporary dropout mask and how surviving activations are scaled.', 'Explain inverted dropout with the same hidden units in each panel.', 'What does a temporary dropout mask change during one training pass?', 'Trace inverted dropout from activations through a mask to scaling.', 'Compare inverted dropout mask averages with a linear inference readout.'],
    ['temporary dropout mask', 'inverted dropout'], 'Show a temporary activation mask and keep-probability scaling; not permanent neuron pruning or a general network architecture.',
    { overview: { spec: spec(dropout('overview')) }, standard: { spec: spec(dropout('standard')) }, deep: { spec: spec(dropout('deep')), detailSpec: spec(expectation) } }),
]);
export function derived() { return toyDerived(); }
