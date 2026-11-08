import { VISUAL_PROGRAM_STAMPS } from './stamps.js';

export const hyperparameterSearchFixture = {
  id: 'fixture-ai-hyperparameter-search',
  stamps: VISUAL_PROGRAM_STAMPS,
  manifest: {
    title: 'Hyperparameter Search Explorer',
    summary: 'Fit each setting on the training set, select by validation error, and check the winner on a separate holdout.',
    description: 'A bar comparison of revealed ridge trials by validation mean squared error, with a separate holdout result after selection.',
    cardDescription: 'Fit a line to the same training rows for each ridge penalty λ. The trial with the lowest validation mean squared error (MSE) wins. A separate holdout checks the winner.',
    instructions: 'Advance Search step to reveal the trials. Step 5 opens the holdout after the winner has been selected.',
    assumptions: ['Three separate fixed sets of four rows each. The fitted line passes through the origin. Tied validation errors favor the earlier trial.'],
    capabilities: ['number_inputs'],
    inputs: [{ id: 'searchStep', label: 'Search step', type: 'number', default: 1, min: 1, max: 5, step: 1 }],
    readouts: [
      { id: 'validation_0', label: 'Validation MSE (λ = 0)', decimals: 4 },
      { id: 'validation_10', label: 'Validation MSE (λ = 10)', decimals: 4 },
      { id: 'validation_30', label: 'Validation MSE (λ = 30)', decimals: 4 },
      { id: 'validation_6', label: 'Validation MSE (λ = 6)', decimals: 4 },
      { id: 'holdout', label: 'Holdout MSE (selected trial)', decimals: 4 },
    ],
  },
  source: `
const penalties = [0, 10, 30, 6];
const train = [[-2, -4], [-1, -2], [1, 2], [2, 4]];
const validation = [[-2.5, -2.875], [-0.5, -0.875], [0.5, 0.375], [2.5, 3.375]];
const holdout = [[-3, -3], [-1.5, -1.5], [1.5, 1.5], [3, 3]];

// Minimize the sum of squared training residuals plus penalty times slope squared.
function fit(penalty) {
  const xy = train.reduce((sum, [x, y]) => sum + x * y, 0);
  const xx = train.reduce((sum, [x]) => sum + x * x, 0);
  return xy / (xx + penalty);
}

function mse(rows, slope) {
  return rows.reduce((sum, [x, y]) => sum + (slope * x - y) ** 2, 0) / rows.length;
}

export function evaluate({ inputs }) {
  const step = Math.round(inputs.searchStep);
  const trials = penalties.slice(0, step).map(penalty => {
    const slope = fit(penalty);
    return { penalty, slope, loss: mse(validation, slope) };
  });
  const best = trials.reduce((winner, trial) => trial.loss < winner.loss ? trial : winner);
  const holdoutLoss = step > penalties.length ? mse(holdout, best.slope) : null;
  const objects = [
    sdk.text('penalty-heading', 24, 27, 'Penalty λ'),
    sdk.text('validation-heading', 146, 27, 'Validation MSE · lower is better'),
  ];
  for (const [index, penalty] of penalties.entries()) {
    const trial = trials[index];
    const role = trial === best ? 'learner' : trial ? 'observed' : 'neutral';
    const y = 56 + index * 36;
    objects.push(sdk.text('trial-penalty-' + penalty, 24, y, 'λ = ' + penalty, { role }));
    if (trial) objects.push(sdk.box('trial-bar-' + penalty, 146, y - 13, 158 * trial.loss, 16, { role }));
    objects.push(sdk.text('trial-score-' + penalty, 474, y, trial ? sdk.format(trial.loss, 4) : 'Pending', { role }));
  }
  objects.push(
    sdk.box('selection', 24, 188, 226, 38, {
      text: (holdoutLoss === null ? 'Best so far' : 'Selected') + ' · λ = ' + best.penalty,
      role: 'learner',
    }),
    sdk.box('holdout', 264, 188, 280, 38, {
      text: holdoutLoss === null ? 'Holdout opens after selection' : 'Holdout MSE · ' + sdk.format(holdoutLoss, 4),
      role: holdoutLoss === null ? 'neutral' : 'output',
    }),
  );
  const readouts = trials.map(trial => ({ id: 'validation_' + trial.penalty, value: trial.loss }));
  if (holdoutLoss !== null) readouts.push({ id: 'holdout', value: holdoutLoss });
  return { frame: sdk.frame(objects, { width: 568, height: 244, readouts }) };
}`,
};
