import { RASTER_CAPABILITY } from './stamps.js';

// One exact forward pass, its chain rule, and a proposed weight update.
export const backpropFixture = {
  id: 'fixture-ai-backprop',
  manifest: {
    title: 'Backpropagation through one neuron',
    summary: 'Change the input or weight, then switch between Forward, Backward and Update. Follow the prediction to its loss, multiply the local derivatives back to the weight, and see how one learning step changes the loss.',
    description: 'A four-stage computation graph with a forward pass and a phase-specific view of the local derivatives or the proposed weight update.',
    assumptions: ['One tanh hidden unit, a fixed output weight of 0.8, and a fixed target of 0.6.', 'Update previews one gradient step from the selected weight.'],
    capabilities: [RASTER_CAPABILITY, 'number_inputs', 'select_inputs', 'math_text'],
    inputs: [
      { id: 'x', label: 'Input x', type: 'number', default: 1.2, min: -2, max: 2, step: 0.1 },
      { id: 'w', label: 'Weight w', type: 'number', default: 0.4, min: -2, max: 2, step: 0.1 },
      { id: 'rate', label: 'Learning rate', type: 'select', default: '0.1', options: [
        { value: '0.05', label: '0.05' }, { value: '0.1', label: '0.1' }, { value: '0.2', label: '0.2' },
      ] },
      { id: 'mode', label: 'Phase', type: 'select', default: 'forward', options: [
        { value: 'forward', label: 'Forward' }, { value: 'backward', label: 'Backward' }, { value: 'update', label: 'Update' },
      ] },
    ],
    readouts: [],
  },
  source: String.raw`
export function evaluate({ inputs }) {
  const { x, w, mode } = inputs;
  const rate = Number(inputs.rate), target = 0.6, outputWeight = 0.8;
  const z = w * x, h = Math.tanh(z), prediction = outputWeight * h;
  const residual = prediction - target, loss = 0.5 * residual ** 2;
  const dLossDPrediction = residual, dPredictionDHidden = outputWeight;
  const dHiddenDPreactivation = 1 - h * h, dPreactivationDWeight = x;
  const gradient = dLossDPrediction * dPredictionDHidden * dHiddenDPreactivation * dPreactivationDWeight;
  const updatedWeight = w - rate * gradient;
  const updatedLoss = 0.5 * (outputWeight * Math.tanh(updatedWeight * x) - target) ** 2;

  const cols = [18, 214, 410, 606], width = 176, height = 46;
  const center = { align: 'middle' };
  const read = (id, column, y, label, value, role = 'neutral', decimals = 6) =>
    sdk.readout(id, { x: cols[column], y, w: width, h: height, label, value, role, decimals });
  const forwardRole = mode === 'forward' ? 'prediction' : 'neutral';
  const links = (id, y, role, reverse = false) => cols.slice(0, -1).map((left, i) => {
    const from = left + width + 5, to = cols[i + 1] - 5;
    return sdk.arrow(id + '-' + i, reverse ? to : from, y, reverse ? from : to, y, { role });
  });
  const formulas = ['z=wx', 'h=\\tanh(z)', '\\hat{y}=0.8h', 'L=\\tfrac{1}{2}(\\hat{y}-0.6)^2'];
  const objects = [
    sdk.text('forward-title', 26, 36, 'Forward pass'),
    ...links('forward', 91, forwardRole),
    ...read('preactivation', 0, 68, 'z', z, forwardRole),
    ...read('hidden-value', 1, 68, 'h', h, forwardRole),
    ...read('prediction-value', 2, 68, 'ŷ', prediction, forwardRole),
    ...read('loss-value', 3, 68, 'Loss', loss, forwardRole),
    ...formulas.map((tex, i) => sdk.math('forward-formula-' + i, cols[i] + width / 2, 147, tex, center)),
  ];

  if (mode === 'forward') {
    objects.push(sdk.text('inputs-title', 26, 211, 'Inputs and constants'),
      ...read('input-value', 0, 237, 'Input x', x, 'neutral', 3),
      ...read('weight-value', 1, 237, 'Weight w', w, 'neutral', 3),
      ...read('output-weight', 2, 237, 'Output w', outputWeight, 'neutral', 1),
      ...read('target-value', 3, 237, 'Target', target, 'neutral', 1));
  } else if (mode === 'backward') {
    const localFormulas = ['\\partial z/\\partial w', '\\partial h/\\partial z', '\\partial \\hat{y}/\\partial h', '\\partial L/\\partial \\hat{y}'];
    objects.push(sdk.text('backward-title', 26, 202, 'Backward pass · Local derivatives'),
      ...localFormulas.map((tex, i) => sdk.math('backward-formula-' + i, cols[i] + width / 2, 231, tex, center)),
      ...links('backward', 275, 'learner', true),
      ...read('dz-dw', 0, 252, 'x', dPreactivationDWeight, 'learner'),
      ...read('dh-dz', 1, 252, '1 − h²', dHiddenDPreactivation, 'learner'),
      ...read('dy-dh', 2, 252, 'Output w', dPredictionDHidden, 'learner', 1),
      ...read('dl-dy', 3, 252, 'Residual', dLossDPrediction, 'learner', 4),
      sdk.math('chain-rule', 26, 343, '\\frac{\\partial L}{\\partial w}=\\frac{\\partial L}{\\partial \\hat{y}}\\,\\frac{\\partial \\hat{y}}{\\partial h}\\,\\frac{\\partial h}{\\partial z}\\,\\frac{\\partial z}{\\partial w}'),
      ...read('gradient-value', 2, 314, 'dL/dw', gradient, 'output'));
  } else {
    objects.push(sdk.text('update-title', 26, 211, 'One proposed step'),
      ...links('update', 260, 'output').slice(1),
      ...read('rate-value', 0, 237, 'Rate', rate, 'neutral', 2),
      ...read('gradient-value', 1, 237, 'dL/dw', gradient, 'learner'),
      ...read('updated-weight', 2, 237, 'New w', updatedWeight, 'output'),
      ...read('updated-loss', 3, 237, 'New L', updatedLoss, 'output'),
      sdk.math('update-formula', 26, 334, "w'=w-\\eta\\,\\frac{\\partial L}{\\partial w}"));
  }

  return { frame: sdk.frame(objects, { width: 800, height: 388 }), quantities: {
    weight: w, hidden: h, prediction, loss, dLossDPrediction, dPredictionDHidden,
    dHiddenDPreactivation, dPreactivationDWeight, gradient, updatedWeight, updatedLoss,
  } };
}`,
};
