// The two-head walkthrough uses four model entries and two entries per head.
// The dimension labels show the corresponding 512-wide example. All arithmetic
// is on the displayed toy vectors, with three-decimal display precision.
export const sentence = ['the', 'cat', 'sat', 'on', 'the', 'mat'];
export const queryIndex = 2;
export const shownWidth = 4;
export const shownHeadWidth = 2;
export const modelWidth = 512;
export const headWidth = modelWidth / 2;
export const decoderPrefix = sentence.slice(0, queryIndex + 1);
export const round = value => Math.round(value * 1000) / 1000 || 0;

const embeddingsByWord = {
  the: [0.1, 0.2, 0.2, 0.4],
  cat: [1.1, -0.2, 0.3, 0],
  sat: [0.2, -0.1, 0.7, 0.4],
  on: [0, 0.3, -0.2, 0.2],
  mat: [0.4, 0.1, 0.6, -0.1],
};
export const embeddings = sentence.map(word => embeddingsByWord[word]);
export const positions = sentence.map((_, p) => [Math.sin(p), Math.cos(p), Math.sin(p / 100), Math.cos(p / 100)].map(round));
export const inputs = embeddings.map((row, p) => row.map((value, column) => round(value + positions[p][column])));

const sum = values => values.reduce((total, value) => total + value, 0);
const dot = (a, b) => sum(a.map((value, column) => value * b[column]));
const project = (vector, matrix) => matrix[0].map((_, column) => round(dot(vector, matrix.map(row => row[column]))));

function softmax(scores) {
  const max = Math.max(...scores);
  const exps = scores.map(score => Math.exp(score - max));
  const total = sum(exps);
  const weights = exps.map(value => round(value / total));
  // Absorb display rounding in the largest term so the shown values sum to 1.
  const largest = scores.indexOf(max);
  weights[largest] = round(weights[largest] + 1 - sum(weights));
  return weights;
}

function attend(query, keys, values) {
  const dots = keys.map(key => dot(query, key));
  const scores = dots.map(value => round(value / Math.sqrt(shownHeadWidth)));
  const weights = softmax(scores);
  const output = values[0].map((_, column) => round(sum(weights.map((weight, row) => weight * values[row][column]))));
  return { dotProducts: dots.map(round), scores, weights, output };
}

const headMatrices = [
  {
    queryMatrix: [[1, 0], [0, 1], [1, 0], [0, 0]],
    keyMatrix: [[1, 0], [0, 0], [0, 0], [0, 1]],
    valueMatrix: [[0, 0], [0, 0], [1, 0], [0, 1]],
  },
  {
    queryMatrix: [[0, 0], [0, 0], [1, 0], [0, 1]],
    keyMatrix: [[0, 0], [0, 1], [1, 0], [0, 0]],
    valueMatrix: [[1, 0], [0, 1], [0, 0], [0, 0]],
  },
];

export const heads = headMatrices.map(({ queryMatrix, keyMatrix, valueMatrix }) => {
  const queries = inputs.map(row => project(row, queryMatrix));
  const keys = inputs.map(row => project(row, keyMatrix));
  const values = inputs.map(row => project(row, valueMatrix));
  const rows = queries.map(query => attend(query, keys, values));
  const maskedRows = queries.map((query, index) => attend(query, keys.slice(0, index + 1), values.slice(0, index + 1)));
  const withNulls = row => [...row, ...Array(sentence.length - row.length).fill(null)];
  return {
    queries, keys, values,
    dotProducts: rows.map(row => row.dotProducts),
    scores: rows.map(row => row.scores),
    weights: rows.map(row => row.weights),
    outputs: rows.map(row => row.output),
    maskedScores: maskedRows.map(row => withNulls(row.scores)),
    maskedWeights: maskedRows.map(row => withNulls(row.weights)),
    maskedOutputs: maskedRows.map(row => row.output),
  };
});

const outputMatrix = [[0.5, 0, 0.5, 0], [0, 1, 0, 0], [0.5, 0, -0.5, 0], [0, 0, 0, 0.5]];
export const concatenated = sentence.map((_, index) => heads.flatMap(head => head.outputs[index]));
export const projected = concatenated.map(row => project(row, outputMatrix));

const decoderSelfStates = decoderPrefix.map((_, index) => project(heads.flatMap(head => head.maskedOutputs[index]), outputMatrix));
// Reuse the toy matrices across the two sides to keep the worked values small.
const crossHeads = heads.map((head, index) => decoderSelfStates.map(state =>
  attend(project(state, headMatrices[index].queryMatrix), head.keys, head.values)));
export const crossWeights = crossHeads[0].map(row => row.weights);
export const decoderState = project(crossHeads.flatMap(rows => rows[queryIndex].output), outputMatrix);

export const vocabulary = ['the', 'cat', 'sat', 'on', 'mat', 'slept'];
const vocabularyMatrix = [
  [0.2, 0, 0.2, 0.4, 0.2, 0],
  [0.35, -0.1, 0.55, 1.3, 0.1, -0.4],
  [0, 0.1, 0.1, 0, -0.2, 0.1],
  [0, 0.2, 0.4, 0, 0.1, 0],
];
export const logits = project(decoderState, vocabularyMatrix);
export const vocabularyWeights = softmax(logits);
export const predictedToken = vocabulary[logits.indexOf(Math.max(...logits))];
