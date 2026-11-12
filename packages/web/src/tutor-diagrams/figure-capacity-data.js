// The sizes are illustrative and count only the components named in each visual.
const state = 48;

export const decoderShapes = [
  { label: 'Base', layers: 4, state, update: 144 },
  { label: 'Deeper', layers: 6, state: 32, update: 144 },
  { label: 'Wider state', layers: 4, state: 64, update: 144 },
  { label: 'Wider update', layers: 4, state, update: 192 },
];

export const vocabShapes = [320, 640].map(size => ({ size, state, tiedWeights: size * state }));

export const expertShapes = [
  { label: 'Small bank', pool: 4, width: 32 },
  { label: 'Larger bank', pool: 8, width: 32 },
  { label: 'Wider experts', pool: 4, width: 64 },
].map(shape => {
  const active = 2;
  const weights = 3 * state * shape.width;
  return { ...shape, active, bankWeights: shape.pool * weights, usedWeights: active * weights };
});

const strengths = [9, 6, 3, 2];
const total = strengths[0] + strengths[1];
export const router = strengths.map((strength, index) => ({
  name: 'Expert ' + 'ABCD'[index], strength, weight: index < 2 ? strength / total : 0,
}));

export const latentShapes = [
  { label: 'Base', query: 4, bank: 4 },
  { label: 'More heads', query: 8, bank: 4 },
  { label: 'More experts', query: 4, bank: 8 },
].map(shape => ({ ...shape, cache: 16, active: 2 }));

export const layerLocalShapes = [
  { label: 'Compact', state, groups: 3 },
  { label: 'Wider', state: 72, groups: 6 },
].map(shape => ({ ...shape, query: 12, readersPerGroup: 12 / shape.groups }));
