export const parameters = Object.freeze({ vocabulary: [{ id: 0, word: 'ant' }, { id: 1, word: 'bee' }, { id: 2, word: 'fern' }, { id: 3, word: 'oak' }], E: [[1, 0], [0, 1], [1, 1], [-1, .5]], C: [[.5, 1], [-.5, 0], [1, -1], [0, .5]], centerId: 1, contextIds: [0, 2], delta: [.25, -.25] });
export function derived() {
  const p = parameters, idToRow = Object.fromEntries(p.vocabulary.map((row, i) => [row.id, i])), unselectedContextIds = p.vocabulary.filter(row => !p.contextIds.includes(row.id)).map(row => row.id);
  const lookup = (E, C) => ({ E, C, center: [...E[idToRow[p.centerId]]], contexts: p.contextIds.map(id => [...C[idToRow[id]]]) });
  const base = lookup(p.E.map(row => [...row]), p.C.map(row => [...row]));
  const changed = p.C.map((row, i) => row.map((x, j) => x + (unselectedContextIds.includes(p.vocabulary[i].id) ? p.delta[j] : 0)));
  const probe = lookup(p.E.map(row => [...row]), changed), values = [...base.E.flat(), ...base.C.flat(), ...probe.C.flat()];
  return { parameters: p, idToRow, base, probe, unselectedContextIds, width: p.E[0].length, labels: p.vocabulary.map(row => row.id + ' ' + row.word), range: { min: Math.min(...values), max: Math.max(...values) }, counts: { vocabulary: p.vocabulary.length, contexts: p.contextIds.length } };
}
