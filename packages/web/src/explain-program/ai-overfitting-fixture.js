import { VISUAL_PROGRAM_STAMPS } from './stamps.js';

export const overfittingFixture = {
  id: 'fixture-ai-overfitting',
  stamps: VISUAL_PROGRAM_STAMPS,
  manifest: {
    title: 'Overfitting Explorer',
    summary: 'The flexible curve fits every training sample and predicts unseen samples worse than the simpler line.',
    description: 'A plot shows five training samples, four held-out validation samples, and the selected fitted curve. Vertical segments connect validation samples to their predictions. Readouts report mean squared error on each set.',
    cardDescription: 'Both models fit the same five training points, including one noisy point. Mean squared error (MSE) scores predictions on training and held-out validation points. Overfitting lowers training error but raises validation error here.',
    instructions: 'Switch from degree 1 to degree 4. Compare the two errors and look at the vertical gaps from the validation points to the curve.',
    assumptions: ['Synthetic data: y = x except for one noisy training point at (0, 2).', 'Degree 1 uses ordinary least squares. Degree 4 interpolates the five training points. Mean squared error (MSE) is the average of the squared prediction errors on each set.'],
    capabilities: ['select_inputs'],
    inputs: [{ id: 'degree', label: 'Polynomial degree', type: 'select', default: '1', options: [
      { value: '1', label: '1 · Line' }, { value: '4', label: '4 · Flexible curve' },
    ] }],
    readouts: [
      { id: 'trainMse', label: 'Training MSE', decimals: 3 },
      { id: 'validationMse', label: 'Validation MSE', decimals: 3 },
    ],
  },
  source: `
const train = [[-2, -2], [-1, -1], [0, 2], [1, 1], [2, 2]];
const validation = [[-1.5, -1.5], [-0.5, -0.5], [0.5, 0.5], [1.5, 1.5]];
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;

function fitLine(samples) {
  const xMean = mean(samples.map(([x]) => x));
  const yMean = mean(samples.map(([, y]) => y));
  const covariance = mean(samples.map(([x, y]) => (x - xMean) * (y - yMean)));
  const variance = mean(samples.map(([x]) => (x - xMean) ** 2));
  return x => yMean + (covariance / variance) * (x - xMean);
}

function fitInterpolant(samples) {
  // Lagrange basis: each term is 1 at its training x and 0 at all others.
  return x => samples.reduce((value, [xi, yi], i) => {
    const basis = samples.reduce((product, [xj], j) => i === j ? product : product * (x - xj) / (xi - xj), 1);
    return value + yi * basis;
  }, 0);
}

export function evaluate({ inputs }) {
  const predict = inputs.degree === '1' ? fitLine(train) : fitInterpolant(train);
  const mse = samples => mean(samples.map(([x, y]) => (y - predict(x)) ** 2));
  const trainMse = mse(train), validationMse = mse(validation);
  const xDomain = [-2, 2], yDomain = [-3, 3];
  const plot = sdk.plot('fit', {
    x: 16, y: 22, w: 388, h: 246, xDomain, yDomain, yLabel: 'Target y',
    series: [
      { id: 'model', points: sdk.sample(predict, xDomain[0], xDomain[1], 80), role: 'prediction' },
      { id: 'train', kind: 'scatter', points: train, role: 'observed' },
      { id: 'validation', kind: 'scatter', points: validation, role: 'learner' },
    ],
  });
  const yAxis = plot.find(object => object.id === 'plot:fit:axis:y');
  const sy = sdk.linear(yDomain, [yAxis.from.y, yAxis.to.y]);
  const residuals = validation.map(([x], i) => {
    const dot = plot.find(object => object.id === 'plot:fit:s:validation:' + i);
    return sdk.line('validation-residual-' + i, dot.x, dot.y, dot.x, sy(predict(x)), { role: 'learner', opacity: 0.65 });
  });
  const objects = [
    ...plot.filter(object => object.kind !== 'circle'),
    ...residuals,
    ...plot.filter(object => object.kind === 'circle'),
    sdk.text('feature-label', 210, 289, 'Feature x', { align: 'middle' }),
    ...sdk.readout('trainMse', { x: 426, y: 44, w: 224, h: 40, label: 'Training MSE', value: trainMse, decimals: 3, role: 'observed' }),
    ...sdk.readout('validationMse', { x: 426, y: 96, w: 224, h: 40, label: 'Validation MSE', value: validationMse, decimals: 3, role: 'learner' }),
    sdk.circle('train-key-dot', 438, 162, 8, { role: 'observed' }),
    sdk.text('train-key', 456, 167, 'Training samples'),
    sdk.circle('validation-key-dot', 438, 188, 8, { role: 'learner' }),
    sdk.text('validation-key', 456, 193, 'Validation samples'),
    sdk.line('model-key-line', 430, 214, 446, 214, { role: 'prediction' }),
    sdk.text('model-key', 456, 219, 'Degree ' + inputs.degree + ' fit'),
    sdk.line('residual-key-line', 438, 233, 438, 247, { role: 'learner', opacity: 0.65 }),
    sdk.text('residual-key', 456, 245, 'Validation error'),
  ];
  const readouts = [{ id: 'trainMse', value: trainMse }, { id: 'validationMse', value: validationMse }];
  return { frame: sdk.frame(objects, { width: 670, height: 302, readouts }) };
}`,
};
