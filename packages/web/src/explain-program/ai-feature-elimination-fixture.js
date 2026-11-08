import { VISUAL_PROGRAM_STAMPS } from './stamps.js';

export const featureEliminationFixture = {
  id: 'fixture-ai-feature-elimination',
  stamps: VISUAL_PROGRAM_STAMPS,
  manifest: {
    title: 'Feature Elimination Explorer',
    summary: 'Drop the feature with the smallest absolute coefficient, then refit and rank the features again.',
    description: 'A ranked bar chart of absolute regression coefficients, the features removed so far, and the current held-out mean squared error.',
    cardDescription: 'Start with four features on the same scale. Drop the feature with the smallest absolute coefficient and refit the model. Check how the ranking and held-out mean squared error (MSE) change.',
    instructions: 'Advance Elimination step to remove the highlighted feature. If two features tie for last, remove the one that comes first alphabetically.',
    assumptions: [
      'In the eight training rows, each feature has mean 0 and standard deviation 1. Features B and C are correlated. The linear model has no intercept.',
      'The same eight separate held-out rows measure mean squared error (MSE) at every step. Their errors never decide which feature to remove.',
    ],
    capabilities: ['number_inputs'],
    inputs: [{ id: 'eliminationStep', label: 'Elimination step', type: 'number', default: 0, min: 0, max: 3, step: 1 }],
    readouts: [{ id: 'holdout', label: 'Held-out MSE', decimals: 4 }],
  },
  source: `
const names = ['A', 'B', 'C', 'D'];
// Each row is [A, B, C, D, target]. All training inputs are already centered and standardized.
const train = [
  [-1, -1, -1, -1, -3.125], [-1, -1, -1, 1, -2.125],
  [-1, 1, 1, -1, -0.125], [-1, 1, 1, 1, 0.875],
  [1, -1, -1, -1, -0.875], [1, -1, 1, 1, 1.125],
  [1, 1, 1, -1, 2.125], [1, 1, -1, 1, 2.125],
];
const holdout = [
  [-1, -1, 1, -1, -2.75], [-1, -1, 1, 1, -1.75],
  [-1, 1, -1, -1, -0.5], [-1, 1, -1, 1, 0.5],
  [1, -1, 1, -1, -0.5], [1, -1, -1, 1, 0.25],
  [1, 1, -1, -1, 1.75], [1, 1, 1, 1, 3],
];

function fit(columns) {
  // Solve the least-squares normal equations. Every subset of this fixed design is full rank.
  const n = columns.length;
  const matrix = columns.map(i => [...columns, names.length].map(j =>
    train.reduce((sum, row) => sum + row[i] * row[j], 0)));
  for (let pivot = 0; pivot < n; pivot += 1) {
    const row = matrix[pivot];
    const diagonal = row[pivot];
    for (let j = pivot; j <= n; j += 1) row[j] /= diagonal;
    for (const [i, other] of matrix.entries()) {
      if (i === pivot) continue;
      const factor = other[pivot];
      for (let j = pivot; j <= n; j += 1) other[j] -= factor * row[j];
    }
  }
  return matrix.map(row => row[n]);
}

export function evaluate({ inputs }) {
  const step = Math.round(inputs.eliminationStep);
  const removed = [];
  let columns = names.map((_, i) => i);
  let weights = fit(columns);
  const rank = () => columns.map((column, i) => ({ column, strength: Math.abs(weights[i]) }))
    .sort((a, b) => b.strength - a.strength || b.column - a.column);
  for (let i = 0; i < step; i += 1) {
    const weakest = rank().at(-1).column;
    removed.push(names[weakest]);
    columns = columns.filter(column => column !== weakest);
    weights = fit(columns);
  }
  const ranked = rank();
  const loss = holdout.reduce((sum, row) => {
    const prediction = columns.reduce((value, column, i) => value + row[column] * weights[i], 0);
    return sum + (prediction - row[names.length]) ** 2;
  }, 0) / holdout.length;
  const objects = [
    sdk.text('rank-heading', 24, 27, 'Feature rank'),
    sdk.text('coefficient-heading', 164, 27, 'Absolute coefficient'),
  ];
  for (const [index, { column, strength }] of ranked.entries()) {
    const name = names[column];
    const next = ranked.length > 1 && index === ranked.length - 1;
    const role = next ? 'warning' : 'observed';
    const y = 56 + index * 36;
    objects.push(
      sdk.text('feature-rank-' + name, 24, y, (index + 1) + ' · Feature ' + name, { role }),
      sdk.box('feature-bar-' + name, 164, y - 13, 225 * strength, 16, { role }),
      sdk.text('feature-score-' + name, 474, y, sdk.format(strength, 3), { role }),
    );
  }
  objects.push(
    sdk.box('removed', 24, 188, 226, 38, { text: 'Removed · ' + (removed.join(', ') || 'None'), role: 'neutral' }),
    sdk.box('held-out', 264, 188, 280, 38, { text: 'Held-out MSE · ' + sdk.format(loss, 4), role: 'output' }),
  );
  return { frame: sdk.frame(objects, { width: 568, height: 244, readouts: [{ id: 'holdout', value: loss }] }) };
}`,
};
