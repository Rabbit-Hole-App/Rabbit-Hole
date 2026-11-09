// Original toy values shared by the figure-brief chapters.
const sum = values => values.reduce((total, value) => total + value, 0);
export const rounded = value => Math.round(value * 1000) / 1000 || 0;

export const pixels = [
  [2, 1, 3, 5],
  [4, 7, 2, 0],
  [5, 3, 8, 2],
];
export const filters = [
  [[2, -1], [1, 0]],
  [[0, 1], [-1, 1]],
];
export const motif = [[2, 3], [3, 2]];
export const motifField = [
  [0, 2, 3, 0, 0],
  [1, 3, 2, 1, 0],
  [0, 0, 2, 3, 0],
  [2, 1, 3, 2, 0],
];
export const paddedPixels = [
  Array(pixels[0].length + 2).fill(0),
  ...pixels.map(row => [0, ...row, 0]),
  Array(pixels[0].length + 2).fill(0),
];
export const secondChannel = pixels.map(row => row.map(value => 8 - value));
export const mixWeights = [[1, -1], [2, 1], [0.5, 0]];

export function windows(field, height, width, rowStep = 1, columnStep = 1) {
  return Array.from({ length: Math.floor((field.length - height) / rowStep) + 1 }, (_, row) =>
    Array.from({ length: Math.floor((field[0].length - width) / columnStep) + 1 }, (_, column) => {
      const y = row * rowStep, x = column * columnStep;
      const cells = field.slice(y, y + height).map(line => line.slice(x, x + width));
      return { y, x, cells };
    }));
}

export const dot = (left, right) => sum(left.map((value, index) => value * right[index]));
export const response = (patch, filter) => dot(patch.flat(), filter.flat());
export const receptiveCounts = size => pixels.map((row, y) => row.map((_, x) =>
  windows(pixels, size, size).flat().filter(origin =>
    y >= origin.y && y < origin.y + size && x >= origin.x && x < origin.x + size).length));

export const sequenceReadings = [3, 5, 6, 5, 3, 1, 0, 1, 3, 5, 6, 5, 3, 1, 0, 1];
export const sequenceTokens = ['r', 'a', 'i', 'n', 'y'];
export const origin = 9;
export const forecast = (previous, last) => rounded(0.2 * previous + 0.65 * last + 0.45);
export function rollout(history, horizon) {
  const trajectory = [...history];
  for (let i = 0; i < horizon; i++) trajectory.push(forecast(...trajectory.slice(-2)));
  return trajectory.at(-1);
}
export const recurrentHidden = sequenceReadings.slice(0, 3).reduce((states, input) => {
  states.push(rounded(0.5 * states.at(-1) + input));
  return states;
}, [0]);

export const neighborX = [0, 1, 3, 4, 6];
export const neighborY = [1, 3, 4, 2, 0];
export const poolingQueries = [1, 2, 4, 5];
export const softmax = scores => {
  const maximum = Math.max(...scores);
  return normalize(scores.map(score => Math.exp(score - maximum)));
};
export function normalize(values) {
  const total = sum(values);
  const weights = values.map(value => rounded(value / total));
  const strongest = values.indexOf(Math.max(...values));
  weights[strongest] = rounded(weights[strongest] + 1 - sum(weights));
  return weights;
}
export const gaussian = (distance, width) => Math.exp(-0.5 * (distance / width) ** 2);
export const localWeights = (query, width) => normalize(neighborX.map(position => gaussian(position - query, width)));
