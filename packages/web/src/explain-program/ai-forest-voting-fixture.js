import { VISUAL_PROGRAM_STAMPS } from './stamps.js';

export const forestVotingFixture = {
  id: 'fixture-ai-forest-voting',
  stamps: VISUAL_PROGRAM_STAMPS,
  manifest: {
    title: 'Forest Voting Explorer',
    summary: 'Three decision trees vote on a class. The forest predicts the class with the most votes.',
    description: 'Three decision trees show their highlighted branches and votes, followed by the forest vote tally and majority class.',
    cardDescription: 'Each tree compares the same feature x with a different threshold. The forest predicts whichever class gets at least two votes.',
    instructions: 'Move Query feature x and follow the highlighted paths. Try 3 and then 5 to see when one tree changes its vote and when the majority changes.',
    assumptions: ['This toy forest uses three trees with one split each. Each tree casts one vote.'],
    capabilities: ['number_inputs'],
    inputs: [{ id: 'x', label: 'Query feature x', type: 'number', default: 2, min: 0, max: 10, step: 1 }],
    readouts: [],
  },
  source: `
const thresholds = [3, 5, 7];

function drawTree(index, threshold, vote) {
  const id = 'tree-' + (index + 1);
  const x = 14 + index * 226;
  return [
    sdk.text(id + '-heading', x + 110, 26, 'Tree ' + (index + 1), { align: 'middle' }),
    ...sdk.graph(id, {
      x, y: 32, w: 220, h: 168,
      nodes: [
        { id: 'split', label: 'x ≥ ' + threshold + '?', role: 'input' },
        { id: 'a', label: 'Vote A', role: vote === 'a' ? 'learner' : 'neutral' },
        { id: 'b', label: 'Vote B', role: vote === 'b' ? 'learner' : 'neutral' },
      ],
      edges: [
        { from: 'split', to: 'a', label: 'No' },
        { from: 'split', to: 'b', label: 'Yes' },
      ],
      active: ['split', vote],
    }),
  ];
}

export function evaluate({ inputs }) {
  const votes = thresholds.map(threshold => inputs.x >= threshold ? 'b' : 'a');
  const b = votes.filter(vote => vote === 'b').length;
  const a = votes.length - b;
  const majority = b > a ? 'B' : 'A';
  const objects = [
    ...thresholds.flatMap((threshold, index) => drawTree(index, threshold, votes[index])),
    sdk.box('tally', 26, 210, 422, 36, { text: 'Votes · A: ' + a + ' · B: ' + b, role: 'output' }),
    sdk.box('majority', 478, 210, 196, 36, { text: 'Majority: ' + majority, role: 'prediction' }),
  ];
  return { frame: sdk.frame(objects, { width: 700, height: 260 }) };
}`,
};
