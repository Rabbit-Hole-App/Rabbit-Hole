// Small illustrative values shared across the GPT-2 chapter.
const round = value => Number(value.toFixed(3));
export const vocab = ['the', 'hall', 'light', 'flickers', 'glows', 'dims'];
export const prefix = vocab.slice(0, 3);
export const embeddingTable = [
  [0, 0.1, -0.3, 0.2],
  [1, -0.4, 0.2, 0.1],
  [2, -0.2, 0.5, 0.3],
  [4, 0.6, -0.1, 0.4],
  [3, 0.3, 0.2, -0.2],
  [2, -0.3, -0.2, 0.5],
];
export const positions = [
  [0.2, 0, 0.1, -0.1],
  [-0.1, 0.2, 0, 0.1],
  [-0.2, 0.1, -0.2, 0.1],
  [0, -0.1, 0.1, 0.3],
  [0.3, 0, -0.2, 0.2],
  [0.2, -0.1, 0, -0.1],
  [-0.2, 0.3, 0.2, 0],
  [0.1, 0.1, -0.3, 0.2],
];

const dot = (a, b) => round(a.reduce((sum, value, i) => sum + value * b[i], 0));
export const embeddingAt = (token, position) =>
  embeddingTable[vocab.indexOf(token)].map((value, i) => round(value + positions[position][i]));

// Use a supplied final state to work the tied-output arithmetic.
export const scoringState = [1, 0, 0, 0];
export const logits = embeddingTable.map(row => dot(row, scoringState));
const total = logits.reduce((sum, score) => sum + Math.exp(score), 0);
const rawProbability = logits.map(score => Math.exp(score) / total);
export const probability = rawProbability.map(round);
export const continuation = vocab[logits.indexOf(Math.max(...logits))];
export const sampleAt = 0.8;
let cumulative = 0;
export const sampled = vocab[rawProbability.findIndex(value => (cumulative += value) > sampleAt)];

export const qkvWeights = [
  [[1, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1], [1, 0, -1, 0]],
  [[1, 0, 0, 0], [0, 1, 1, 0], [0, 0, 1, -1], [0, 1, 0, 0]],
  [[0, 1, 0, 0], [-1, 0, 0, 1], [0, 0, 1, 1], [1, 0, 0, 0]],
];
export const qkv = qkvWeights.map(weightColumns => weightColumns.map(column => dot(column, embeddingAt('light', 2))));

export const modelSizes = [
  { label: 'Small toy', layers: 2, width: 4 },
  { label: 'Medium toy', layers: 3, width: 6 },
  { label: 'Large toy', layers: 4, width: 8 },
  { label: 'Extra-large toy', layers: 5, width: 10 },
].map(({ label, layers, width }) => {
  const block = 12 * width ** 2 + 13 * width;
  const token = vocab.length * width;
  const position = positions.length * width;
  const finalNorm = 2 * width;
  return { label, layers, width, block, token, position, finalNorm, total: layers * block + token + position + finalNorm };
});

export const musicEvents = [
  ['Velocity', 72], ['Start', 60], ['Wait', 250], ['Start', 64], ['Wait', 250],
  ['Release', 60], ['Start', 67], ['Wait', 250], ['Release', 64], ['Release', 67],
];
export const musicTokenIds = [...new Set(musicEvents.map(([type, value]) => type + ' ' + value))];
const pitchNames = new Map([[60, 'C4'], [64, 'E4'], [67, 'G4']]);
const playedNotes = [];
const active = new Map();
let time = 0;
for (const [type, value] of musicEvents) {
  if (type === 'Wait') time += value;
  if (type === 'Start') active.set(value, time);
  if (type === 'Release') {
    playedNotes.push({ pitch: value, name: pitchNames.get(value), start: active.get(value), end: time });
    active.delete(value);
  }
}
export const notes = playedNotes;
