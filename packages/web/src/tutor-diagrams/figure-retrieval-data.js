// Invented archive records. These vectors make one small lookup auditable.
const tokens = ['Cedar', 'Archive'];
const contextual = [[1, 2], [3, 2]];
const query = [0, 1].map(i => contextual.reduce((sum, vector) => sum + vector[i], 0) / contextual.length);
const answer = 'Tuesday';
const entries = [
  { id: 'A', chunk: ['Cedar’s', 'archive'], next: ['opens', answer], key: [2, 3] },
  { id: 'B', chunk: ['Archive', 'doors'], next: ['open', answer], key: [4, 2] },
  { id: 'C', chunk: ['Cedar', 'saplings'], next: ['need', 'water'], key: [6, 5] },
  { id: 'D', chunk: ['Maple', 'Clinic'], next: ['opens', 'Friday'], key: [5, 0] },
].map(entry => ({
  ...entry, distance: Math.hypot(entry.key[0] - query[0], entry.key[1] - query[1]),
}));

const matches = [...entries].sort((a, b) => a.distance - b.distance).slice(0, 2);
const attending = [tokens.at(-1), matches[0].next[0]];
const causalPrefix = [...tokens, attending.at(-1)].join(' ');
const evidence = matches.flatMap((entry, i) => [...entry.chunk, ...entry.next].map(word => {
  const relevant = word === answer;
  return {
    word, label: word + ' ' + entry.id,
    key: [relevant ? 3 - i : 0, 0], value: relevant ? [1, 0] : [0, 1],
  };
}));
const decoderQuery = [1, 0];
const exps = evidence.map(({ key }) => Math.exp(decoderQuery.reduce((sum, coordinate, i) => sum + coordinate * key[i], 0)));
const normalizer = exps.reduce((sum, value) => sum + value, 0);
const attention = exps.map(value => value / normalizer);
const output = [0, 1].map(i => evidence.reduce((sum, { value }, position) => sum + attention[position] * value[i], 0));
const weights = attention.map(value => Math.round(1000 * value) / 1000);

export const corpus = {
  tokens, contextual, query, entries, matches, answer, attending, causalPrefix, evidence, decoderQuery, weights, output,
  phrase: { incomplete: 'When it rains, it …', completion: 'pours' },
};
