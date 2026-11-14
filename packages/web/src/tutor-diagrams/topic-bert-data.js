// Declared toy training labels and contextual states, not measured BERT outputs.
export const messageRows = Object.freeze([
  { id: 'm1', text: 'Send the route.', target: 'Request' },
  { id: 'm2', text: 'Share the map.', target: 'Request' },
  { id: 'm3', text: 'The route is ready.', target: 'Notice' },
  { id: 'm4', text: 'The map is attached.', target: 'Notice' },
]);
export const parameters = Object.freeze({
  classes: ['Notice', 'Request'], reorderedIds: ['m3', 'm1', 'm4', 'm2'],
  tokens: ['[CLS]', 'send', 'maps', '[SEP]'], features: ['f1', 'f2'],
  states: [[1, 2], [2, 0], [0, 1], [1, 0]],
  probeOtherRows: [[0, 0], [3, 3], [2, 2]],
  weights: [[1, -1], [0, 1]], bias: [0, 1],
});
const scoresFor = summary => parameters.bias.map((bias, column) =>
  summary.reduce((sum, value, row) => sum + value * parameters.weights[row][column], bias));
export function derived() {
  const summaryIndex = parameters.tokens.indexOf('[CLS]');
  const baseStates = parameters.states.map(row => [...row]);
  let other = 0;
  const probeStates = baseStates.map((row, index) => index === summaryIndex ? [...row] : [...parameters.probeOtherRows[other++]]);
  const readout = states => ({ states, summary: states[summaryIndex], scores: scoresFor(states[summaryIndex]) });
  const base = readout(baseStates), probe = readout(probeStates);
  const reordered = parameters.reorderedIds.map(id => messageRows.find(row => row.id === id));
  return { parameters,
    counts: { examples: messageRows.length, classes: parameters.classes.length, positions: parameters.tokens.length, features: parameters.features.length },
    training: { rows: messageRows, overview: parameters.classes.map(label => messageRows.find(row => row.target === label)), reordered,
      groups: parameters.classes.map(label => ({ id: label.toLowerCase(), label, members: reordered.filter(row => row.target === label).map(row => row.id) })) },
    readout: { base, probe, summaryIndex, predictedClass: parameters.classes[base.scores.indexOf(Math.max(...base.scores))],
      range: { min: Math.min(...baseStates.flat(), ...probeStates.flat()), max: Math.max(...baseStates.flat(), ...probeStates.flat()) } },
  };
}
