import { derived } from './topic-regularization-data.js';
import { references as regularizationReferences } from './composition-regularization-references.js';

const d = derived();
const single = (diagram, useWhen) => ({ spec: { version: 1, diagram }, useWhen });
const { input, terms, prediction } = d.linear.selected;
const { weights, bias } = d.parameters.linear;
const linearUnit = {
  kind: 'block-stack', title: 'How a linear unit predicts from features',
  blocks: [
    { id: 'sum', label: 'Sum the weighted inputs and bias', dims: `$${[...terms, bias].join(' + ')}$`,
      inputs: ['A', 'B'].map((feature, index) => ({ label: `Feature ${feature}: $${input[index]}×${weights[index]}$` })) },
    { id: 'prediction', label: 'Prediction', dims: String(prediction), role: 'output' },
  ],
  caption: 'Each feature is multiplied by its own weight. The bias shifts every prediction by the same amount.',
};

const hiddenUnits = ['Unit A', 'Unit B'];
const relu = {
  kind: 'bar-chart', variant: 'grouped', title: 'Hidden units before and after ReLU',
  categories: hiddenUnits,
  series: [
    { label: 'Before ReLU', values: d.hidden.probe.preactivations },
    { label: 'After ReLU', values: d.hidden.probe.activations },
  ],
  caption: 'ReLU clips negative values to zero. The output combines the resulting nonlinear features.',
};

const { mask, masked, scaled } = d.dropout.selected;
const dropout = {
  kind: 'bar-chart', variant: 'grouped', title: 'Dropout masks and rescales hidden units',
  categories: hiddenUnits,
  series: [
    { label: 'Input', values: d.hidden.selected.activations },
    { label: 'Masked', values: masked },
    { label: 'Training output', values: scaled },
  ],
  caption: `Mask $(${mask.join(', ')})$. Divide survivors by the keep probability (${d.parameters.dropout.keepProbability}). Inference uses the input values.`,
};

const objective = regularizationReferences.find(reference => reference.id === 'ml-regularization-regularized-objective')
  .spec.diagram.panels.find(({ diagram }) => diagram.title === 'Objective parts').diagram;
// The author schema omits total. The renderer sums the parts of a stacked bar.
const { total, ...objectiveParts } = objective;

export const regularizationSingleSpecs = Object.freeze({
  'ml-linear-regression-linear-unit': single(linearUnit,
    'Trace feature values through the weights and bias of an affine unit to its prediction.'),
  'ml-neural-networks-hidden-layer': single(relu,
    'Compare each hidden unit before and after ReLU so the negative value clipped to zero is visible.'),
  'ml-regularization-regularized-objective': single(objectiveParts,
    'Show data fit and the weight penalty stacked into the total regularized objective for fixed predictions; not an optimizer update or an overfitting curve.'),
  'ml-regularization-dropout-mask': single(dropout,
    'Compare original, masked and rescaled activations for the same hidden units during dropout.'),
});
