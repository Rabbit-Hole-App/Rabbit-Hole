// Toy values for architecture mechanisms. These are not configuration values.
const round = value => Math.round(value * 1000) / 1000;

export const tokenRow = [0.2, 0.4];
export const positionRow = [0.1, -0.1];
export const positionedRow = tokenRow.map((value, index) => round(value + positionRow[index]));
export const fixedPositionRows = Array.from({ length: 3 }, (_, index) => [round(Math.sin(index)), round(Math.cos(index))]);
export const learnedPositionRows = [positionRow, [0.3, 0.2], [-0.2, 0.1]];

export const queryGroups = [[1, 2], [3, 4]];
export const queryHeadCount = queryGroups.flat().length;
export const keyValueGroupCount = queryGroups.length;
const toyQuery = [2, 0];
const toyKeys = [[3, 4], [1, 0]];
const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
const rms = row => Math.hypot(...row) / Math.sqrt(row.length);
export const queryKeyScores = toyKeys.map(key => {
  const raw = dot(toyQuery, key);
  return { key, raw, normalized: round(raw / (rms(toyQuery) * rms(key))) };
});
export const tyingTokenRow = [0.6, -0.2];
export const tyingHiddenRow = [1, 0.5];
export const tyingTokenScore = round(dot(tyingTokenRow, tyingHiddenRow));
export const sharedPasses = [1, 2, 3];
export const sharedBlockIds = ['A', 'B'];
export const expertPoolSizes = [4, 6, 6];
export const routedExperts = [{ weight: 0.75, update: 0.6 }, { weight: 0.25, update: 0.2 }];
export const routedUpdate = round(routedExperts.reduce((sum, expert) => sum + expert.weight * expert.update, 0));
export const sharedUpdate = 0.3;
export const totalExpertUpdate = round(routedUpdate + sharedUpdate);
export const outerWidth = 6;
export const latentWidth = 2;

export const priorMemory = [0.4, 0, 0, 0.4];
export const memoryDecay = 0.5;
const key = [1, 0];
const value = [0.6, 0.4];
export const memoryWrite = value.flatMap(v => key.map(k => round(v * k)));
export const nextMemory = priorMemory.map((v, index) => round(memoryDecay * v + memoryWrite[index]));

export const attentionSchedule = [
  ['A', 'Current chunk', 'Dense'],
  ['B', 'Current chunk', 'Routed experts'],
  ['C', 'Full prefix', 'Dense'],
  ['D', 'Full prefix', 'Routed experts'],
];

export const mixerSchedule = [
  ['A', 'State update', 'Carried state'],
  ['B', 'State update', 'Carried state'],
  ['C', 'Attention', 'Cached token history'],
  ['D', 'State update', 'Carried state'],
];

const candidates = [
  { name: 'A', score: 0.75, logit: 0.6 },
  { name: 'B', score: 0.2 },
  { name: 'C', score: 0.9, logit: 1.4 },
  { name: 'D', score: 0.1 },
];
const shortlisted = candidates.toSorted((a, b) => b.score - a.score).slice(0, 2);
const total = shortlisted.reduce((sum, entry) => sum + Math.exp(entry.logit), 0);
export const attentionCandidates = candidates.map(entry => ({
  ...entry,
  weight: shortlisted.includes(entry) ? round(Math.exp(entry.logit) / total) : null,
}));
