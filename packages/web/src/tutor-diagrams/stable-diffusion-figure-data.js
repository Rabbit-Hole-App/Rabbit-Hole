// Independent toy data. This is one-channel, two-by-two latent arithmetic,
// not images or measured outputs from a Stable Diffusion checkpoint.
export const latentSize = 2;
export const pixelSize = 8;
export const latentChannels = 1;
export const coordinates = ['Top left', 'Top right', 'Bottom left', 'Bottom right'];
export const round = value => Math.round(value * 1000) / 1000 || 0;
export const clean = [
  { id: 'corners', label: 'Diagonal lights', caption: 'two bright corners', values: [0.8, 0.2, 0.2, 0.8],
    condition: [[1, 0], [0.5, 0.5], [0, 1]] },
  { id: 'corner', label: 'Lower-left light', caption: 'lower left light', values: [0.2, 0.6, 0.9, 0.1],
    condition: [[0.2, 0.8], [-0.3, 0.5], [0.4, 0.6]] },
];
export const schedule = [
  { id: 'clean', label: 'Clean state', a: 1, b: 0 },
  { id: 'low', label: 'Earlier noise level', a: 0.8, b: 0.6 },
  { id: 'high', label: 'Later noise level', a: 0.6, b: 0.8 },
];
const noiseA = [-0.5, 0.5, -0.25, 0.25];
const noiseB = [0.25, -0.5, 0.5, -0.25];
function makeTrainingRow(example, noise, level) {
  const { a, b } = level;
  return { example, level, noise, noisy: example.values.map((value, i) => round(a * value + b * noise[i])) };
}
export const training = [
  makeTrainingRow(clean[0], noiseA, schedule[1]),
  makeTrainingRow(clean[1], noiseB, schedule[2]),
  makeTrainingRow(clean[0], noiseA, schedule[2]),
];
export const trainingPrediction = [-0.4, 0.45, -0.2, 0.3];
export const trainingErrors = trainingPrediction.map((value, i) => round(value - noiseA[i]));
export const meanSquaredError = trainingErrors.reduce((sum, value) => sum + value ** 2, 0) / trainingErrors.length;

// A deterministic illustrative reverse rule. Estimate the clean latent and
// then combine that estimate with the predicted noise at the next level.
function reverseStep(current, from, to, estimate) {
  const estimatedClean = current.map((value, i) => (value - from.b * estimate[i]) / from.a);
  const next = estimatedClean.map((value, i) => to.a * value + to.b * estimate[i]);
  return { estimate, estimatedClean, next };
}
const reverseStart = training[2].noisy;
const firstReverse = reverseStep(reverseStart, schedule[2], schedule[1], [-0.44, 0.45, -0.2, 0.23]);
const secondReverse = reverseStep(firstReverse.next, schedule[1], schedule[0], [-0.47, 0.44, -0.23, 0.24]);
export const reverseStates = [reverseStart, firstReverse.next.map(round), secondReverse.next.map(round)];
export const reverseNoise = [firstReverse.estimate, secondReverse.estimate];

const unit = vector => vector.map(value => value / Math.hypot(...vector));
const cosine = (a, b) => unit(a).reduce((sum, value, i) => sum + value * unit(b)[i], 0);
export const visualVectors = [[1, 0], [0, 1]];
export const captionVectors = [[0.6, 0.8], [0.8, 0.6]];
const improvedVisualVectors = [[1, -0.1], [-0.1, 1]];
const improvedCaptionVectors = [[1, 0.2], [0.2, 1]];
export const imageTextScores = visualVectors.flatMap((image, i) => captionVectors.map((text, j) => ({
  image: i, text: j, before: round(cosine(image, text)), after: round(cosine(improvedVisualVectors[i], improvedCaptionVectors[j])),
})));

export const encoderEvaluation = [
  { label: 'Toy encoder A', points: [{ x: 0.28, y: 0.49 }, { x: 0.46, y: 0.31 }, { x: 0.56, y: 0.30 }, { x: 0.64, y: 0.34 }] },
  { label: 'Toy encoder B', points: [{ x: 0.36, y: 0.43 }, { x: 0.55, y: 0.24 }, { x: 0.66, y: 0.20 }, { x: 0.74, y: 0.26 }] },
];
