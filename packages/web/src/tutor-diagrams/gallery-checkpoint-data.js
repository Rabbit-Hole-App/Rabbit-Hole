// Original toy dimensions and outputs. They do not describe any published model.
export const decoderWidth = 4;
export const visualWidth = 3;
export const checkpointRecipes = [
  { name: 'Base', signal: 'General text prediction' },
  { name: 'Coding copy', signal: 'Code examples and tests' },
  { name: 'Reasoning copy', signal: 'Worked solutions and rewards' },
];

// Show only two coordinates of the token state. The shortcut runs one learned
// expert and one identity route. A separate dense update is always computed.
const input = [2, 1];
const learned = [0, 3];
const weights = [0.6, 0.4];
const dense = [1, 0.5];
const round = value => Math.round(value * 100) / 100;
const shortcut = input.map((value, i) => round(weights[0] * learned[i] + weights[1] * value));
export const routes = { input, learned, weights, dense, shortcut,
  combined: shortcut.map((value, i) => round(value + dense[i])),
};
