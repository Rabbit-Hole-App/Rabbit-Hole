// Illustrative inputs, states and scores shared by the BERT chapter.
const round = value => Number(value.toFixed(3));
export const focusWord = 'seal';
export const staticVector = [0.3, -0.1, 0.2, 0.5];
export const layerWeights = [0.2, 0.3, 0.5];
const forwardStates = [[0.4, 0.2], [0.5, 0.4]];

const rows = [
  { right: 'glides', topic: 'Wildlife', meaning: 'Animal', backward: [[0.6, -0.2], [0.8, -0.4]] },
  { right: 'cracks', topic: 'Repair', meaning: 'Gasket', backward: [[-0.1, 0.5], [-0.6, 0.9]] },
];

export const contexts = rows.map(({ right, topic, meaning, backward }) => {
  const layers = forwardStates.map((forward, i) => ({ forward, backward: backward[i] }));
  const vectors = [staticVector, ...layers.map(({ forward, backward }) => [...forward, ...backward])];
  const contextual = staticVector.map((_, i) =>
    round(vectors.reduce((sum, vector, j) => sum + layerWeights[j] * vector[i], 0)));
  return { tokens: ['a', focusWord, right], topic, meaning, layers, vectors, contextual };
});

export const nextSentence = ['it dives', 'paint dries'];

const scoresToProbabilities = scores => {
  const exponentials = scores.map(score => Math.exp(score));
  const total = exponentials.reduce((sum, value) => sum + value, 0);
  return exponentials.map(value => round(value / total));
};

export const classLogits = [Math.log(7), Math.log(3)];
export const classProbabilities = scoresToProbabilities(classLogits);
export const maskCandidates = [focusWord, 'boat', 'bird'];
export const maskLogits = [Math.log(57), Math.log(28), Math.log(15)];
export const maskedProbabilities = scoresToProbabilities(maskLogits);
export const maskLoss = round(-Math.log(maskedProbabilities[0]));

export const featureMethods = [
  { label: 'Last layer', width: 4, tp: 5, fp: 3, fn: 5 },
  { label: 'Sum last two', width: 4, tp: 7, fp: 4, fn: 3 },
  { label: 'Join last two', width: 8, tp: 8, fp: 2, fn: 2 },
].map(row => ({ ...row, f1: round(2 * row.tp / (2 * row.tp + row.fp + row.fn)) }));
