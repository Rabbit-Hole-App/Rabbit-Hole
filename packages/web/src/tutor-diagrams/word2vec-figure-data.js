// All text, vectors and scores are illustrative. The pair-scoring examples use
// the same centre and context tables, with simultaneous updates from one batch.
export const corpus = [
  ['a', 'small', 'robot', 'sorts', 'seeds', 'today'],
  ['a', 'steady', 'robot', 'packs', 'bulbs', 'today'],
  ['the', 'gardener', 'sorts', 'seeds', 'outside'],
  ['one', 'seed', 'rests', 'near', 'one', 'bulb'],
  ['more', 'seeds', 'rest', 'near', 'more', 'bulbs'],
  ['a', 'lamp', 'glows', 'near', 'the', 'robot'],
];
export const sentence = corpus[0];
export const centreIndex = 3;
export const centre = sentence[centreIndex];
export const embeddingWidth = 3;

export const profileNames = ['Jun', 'Noor', 'Imani'];
export const traits = ['Sociability', 'Stamina', 'Focus'];
export const profileScores = [[80, 60, 20], [90, 65, 35], [40, 85, 80]];
export const round = value => Math.round(value * 1000) / 1000 || 0;
export const scaledProfiles = profileScores.map(scores => scores.map(score => round(score / 50 - 1)));

export const embeddings = {
  seed: [0.8, 0.1, -0.2], seeds: [0.8, 0.4, -0.1],
  bulb: [0.6, -0.2, -0.25], bulbs: [0.63, 0.08, -0.16],
  small: [0.2, 0.3, -0.1], robot: [0.7, -0.1, 0.2], sorts: [0.5, -0.3, 0.4],
  today: [-0.1, 0.4, 0.4], outside: [-0.4, 0.5, 0.2],
  packs: [0.4, -0.25, 0.3], gardener: [0.4, -0.2, 0.1],
};
export const contextVectors = {
  sorts: [0.2, -0.4, 0.3], robot: [0.25, 0.05, 0.1], seeds: [0.2, -0.2, 0.1], bulbs: [-0.3, 0.45, -0.05],
  outside: [0.55, 0.2, 0.25], packs: [0.05, -0.3, 0.35], gardener: [0.3, 0.4, -0.2],
};
export const maskedContextChoices = [centre, corpus[1][3], corpus[5][2]];
export const prefixScores = { seeds: 1.2, bulbs: 0.4, packs: -0.6 };

export const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
export const cosine = (a, b) => dot(a, b) / (Math.hypot(...a) * Math.hypot(...b));
export const sigmoid = score => 1 / (1 + Math.exp(-score));
export function softmax(scores) {
  const highest = Math.max(...scores);
  const exp = scores.map(score => Math.exp(score - highest));
  const total = exp.reduce((sum, value) => sum + value, 0);
  const weights = exp.map(value => round(value / total));
  const maxIndex = scores.indexOf(highest);
  weights[maxIndex] = round(weights[maxIndex] + 1 - weights.reduce((sum, value) => sum + value, 0));
  return weights;
}

export const analogyOffset = embeddings.seeds.map((value, i) => round(value - embeddings.seed[i]));
export const analogyQuery = embeddings.bulb.map((value, i) => round(value + analogyOffset[i]));
export const analogyRanks = ['bulbs', 'robot', 'sorts'].map(word => ({
  word,
  distance: round(Math.hypot(...embeddings[word].map((value, i) => value - analogyQuery[i]))),
})).sort((a, b) => a.distance - b.distance);

export function windowAt(tokens, index, radius) {
  return tokens.flatMap((word, i) => i !== index && Math.abs(index - i) <= radius ? [word] : []);
}
export const nextWordRows = [0, 1, 2, 3].map(start => ({
  context: sentence.slice(start, start + 2).join(' '),
  target: sentence[start + 2],
}));
export const fullOutputWords = ['robot', 'seeds', 'bulbs', 'outside'];
export const fullOutputScores = fullOutputWords.map(word => dot(embeddings[centre], contextVectors[word]));
export const fullOutputShares = softmax(fullOutputScores);
export const fullOutputTarget = windowAt(sentence, centreIndex, 1)[0];
export const negativeWords = ['bulbs', 'outside', 'packs', 'gardener'];
export const pairWords = [fullOutputTarget, ...negativeWords.slice(0, 2)];

export const pairs = pairWords.map((word, index) => {
  const target = Number(index === 0);
  const score = dot(embeddings[centre], contextVectors[word]);
  const probability = sigmoid(score);
  return { word, target, score, probability, error: target - probability };
});

export const rate = 0.2;
export const updatedCentre = embeddings[centre].map((value, i) =>
  value + rate * pairs.reduce((sum, pair) => sum + pair.error * contextVectors[pair.word][i], 0));
export const updatedContexts = Object.fromEntries(pairs.map(({ word, error }) => [word,
  contextVectors[word].map((value, i) => value + rate * error * embeddings[centre][i])]));
export const updatedProbabilities = Object.fromEntries(pairs.map(({ word }) =>
  [word, sigmoid(dot(updatedCentre, updatedContexts[word]))]));
