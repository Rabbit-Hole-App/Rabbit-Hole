// Worked values for the gallery comparisons. These are teaching examples.
const sum = values => values.reduce((total, value) => total + value, 0);
const round = value => Math.round(value * 1000) / 1000;
const project = (weights, row) => weights.map(column => sum(column.map((value, index) => value * row[index])));

export const tokens = ['a', 'b', 'c'];
export const features = [[1, -1], [2, 1], [0, 2]];
let state = [0, 0];
export const history = features.map((row, index) => {
  state = row.map((value, j) => round(0.5 * state[j] + value));
  const code = round(sum(row) / 2);
  return { token: tokens[index], state, code };
});

const projections = features.map(([a, b]) => [a, b, a + b]);
let scalarState = 0;
export const localMix = projections.map((row, index) => {
  const previous = projections[index - 1] ?? [0, 0, 0];
  const filtered = row.map((value, j) => 0.25 * previous[j] + 0.75 * value);
  const [query, key, value] = filtered;
  const carried = scalarState;
  scalarState = round(0.5 * carried + key * value);
  return { previous, current: row, filtered, carried, updated: scalarState, readout: round(query * scalarState) };
});

const hidden = [2, 1, 3];
const shared = project([[1, 1, 0], [0, 1, 0], [0, 0, 1]], hidden);
const localKey = project([[1, 0, 0], [0, 1, 0], [0, 0, 1]], hidden);
const localValue = project([[0, 0, 0], [1, 0, 0], [0, 0, 1]], hidden);
const rotateFirstPair = ([a, b, c]) => [-b, a, c];
export const keyValue = {
  hidden, shared, localKey, localValue,
  globalRotated: rotateFirstPair(shared), localRotated: rotateFirstPair(localKey),
};

const firstRow = [0.5, 1], secondRow = [-0.25, 0.5];
const deltaA = [firstRow[0], 0, firstRow[1], 0], deltaB = [0, secondRow[0], 0, secondRow[1]];
const add = (a, b) => a.map((value, index) => round(value + b[index]));
const before = [1, 0, -1, 2];
const afterA = add(before, deltaA);
export const embeddings = {
  word: 'plum', before, firstRow, secondRow, deltaA, deltaB, afterA,
  afterB: add(afterA, deltaB),
};

const values = [2, 6, 3, 9, 4, 10, 5, 7];
const groupsOf = size => Array.from({ length: 6 / size }, (_, i) => {
  const start = i * size;
  const valuesInGroup = values.slice(start, start + size);
  return { from: start + 1, to: start + size, mean: round(sum(valuesInGroup) / size) };
});
const fine = groupsOf(2), coarse = groupsOf(3);
const query = 8;
const nearest = fine.reduce((best, group) => Math.abs(group.mean - query) < Math.abs(best.mean - query) ? group : best);
export const compression = { fine, coarse, query, nearest, recent: values.slice(6) };
