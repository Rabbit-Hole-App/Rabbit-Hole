import { derived } from './topic-regularization-data.js';
import { references as linearReferences } from './topic-linear-regression-references.js';
import { references as hiddenReferences } from './composition-neural-networks-references.js';
import { references as regularizationReferences } from './composition-regularization-references.js';

const d = derived();
const references = [...linearReferences, ...hiddenReferences, ...regularizationReferences];
const panel = (id, title, useWhen, caption) => {
  const leaf = references.find(reference => reference.id === id).spec.diagram.panels.find(({ diagram }) => diagram.title === title).diagram;
  // The author schema omits total; a stacked bar derives the same whole from its unchanged parts.
  const { total, ...diagram } = leaf;
  return { spec: { version: 1, diagram: caption ? { ...diagram, caption } : diagram }, useWhen };
};

// Reuse the computed panel that carries each figure's point, rather than its final output alone.
export const regularizationSingleSpecs = Object.freeze({
  'ml-linear-regression-linear-unit': panel('ml-linear-regression-linear-unit', 'Linear unit',
    'Show input features feeding one affine weighted-sum unit with weights and bias; not a fitted-line residual plot or a nonlinear hidden layer.'),
  'ml-neural-networks-hidden-layer': panel('ml-neural-networks-hidden-layer', 'After ReLU',
    'Show the nonlinear hidden features after ReLU and before the readout; not the final prediction alone, an activation-function curve, or an optimizer loop.'),
  'ml-regularization-regularized-objective': panel('ml-regularization-regularized-objective', 'Objective parts',
    'Show data fit and the weight penalty stacked into the total regularized objective for fixed predictions; not an optimizer update or an overfitting curve.'),
  'ml-regularization-dropout-mask': panel('ml-regularization-dropout-mask', 'Training output',
    'Show hidden activations after a temporary training mask and keep-probability rescaling; not unscaled masked activations, permanent neuron pruning, or inference output.',
    `Toy $h=(${d.hidden.selected.activations.join(',')})$, $m=(${d.dropout.selected.mask.join(',')})$, $q=${d.parameters.dropout.keepProbability}$. Training uses $m\\odot h/q$; inference keeps $h$.`),
});
