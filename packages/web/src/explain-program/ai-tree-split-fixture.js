import { RASTER_CAPABILITY } from './stamps.js';

export const treeSplitFixture = {
  id: 'fixture-ai-tree-split',
  manifest: {
    title: 'Decision Tree Split Explorer',
    summary: 'Move the cutoff to split ten labeled points into two groups. Impurity measures how mixed the classes are. Gain is the drop in impurity after weighting each group by its size. Reveal the best split and compare what Gini and entropy choose.',
    description: 'A scatter plot of ten examples with class labels 0 or 1. A vertical line divides the left and right groups. The readouts show class counts, original impurity, weighted child impurity and gain.',
    assumptions: ['Ten synthetic examples, one numeric feature and two classes.', 'Candidate cutoffs are the midpoints between neighboring feature values. Values at or below the cutoff go left.'],
    capabilities: [RASTER_CAPABILITY, 'number_inputs', 'select_inputs'],
    inputs: [
      { id: 'cutoff', label: 'Cutoff', type: 'number', default: 7, min: 3, max: 19, step: 2 },
      { id: 'criterion', label: 'Criterion', type: 'select', default: 'gini', options: [
        { value: 'gini', label: 'Gini' },
        { value: 'entropy', label: 'Entropy' },
      ] },
    ],
    actions: [{ id: 'revealBest', label: 'Reveal best split' }],
    targets: [],
    readouts: [],
    viewport: { width: 742, height: 292 },
  },
  source: `
const labels = [0, 1, 1, 1, 0, 0, 1, 0, 0, 0];
const featureValue = index => 2 * (index + 1);
const cutoffs = labels.slice(1).map((_, index) => featureValue(index) + 1);

function impurity(counts, criterion) {
  const size = counts[0] + counts[1];
  let score = 0;
  for (const count of counts) {
    if (count === 0) continue;
    const p = count / size;
    score += criterion === 'entropy' ? -p * Math.log2(p) : p * (1 - p);
  }
  return score;
}

function splitAt(cutoff, criterion, parent) {
  const left = [0, 0], right = [0, 0];
  labels.forEach((label, index) => {
    const counts = featureValue(index) <= cutoff ? left : right;
    counts[label]++;
  });
  const leftSize = left[0] + left[1];
  const rightSize = right[0] + right[1];
  const weighted = (leftSize * impurity(left, criterion) + rightSize * impurity(right, criterion)) / labels.length;
  return { cutoff, left, right, weighted, gain: parent - weighted };
}

function bestSplit(criterion, parent) {
  let best = null;
  for (const cutoff of cutoffs) {
    const candidate = splitAt(cutoff, criterion, parent);
    if (!best || candidate.gain > best.gain + 1e-12) best = candidate;
  }
  return best;
}

export function initialState() {
  return { revealed: false };
}

export function reduce({ state, event }) {
  return event.type === 'action' && event.action === 'revealBest' ? { revealed: true } : state;
}

export function evaluate({ inputs, state }) {
  const { criterion } = inputs;
  const cutoff = cutoffs[Math.round((inputs.cutoff - cutoffs[0]) / 2)];
  const totals = [0, 0];
  labels.forEach(label => totals[label]++);
  const parent = impurity(totals, criterion);
  const { left, right, weighted, gain } = splitAt(cutoff, criterion, parent);
  const best = state.revealed ? bestSplit(criterion, parent) : null;
  const yDomain = [-0.5, 1.5];
  const boundary = (id, value, role) => ({ id, role, points: yDomain.map(y => [value, y]) });
  const series = [
    boundary('chosen', cutoff, 'learner'),
    ...[0, 1].map(label => ({
      id: 'class-' + label,
      kind: 'scatter',
      role: label === 0 ? 'observed' : 'prediction',
      points: labels.flatMap((value, index) => value === label ? [[featureValue(index), label]] : []),
    })),
  ];
  if (best && best.cutoff !== cutoff) series.push(boundary('best', best.cutoff, 'success'));

  const statsX = 428;
  const stats = (id, y, label, value, role = 'neutral') =>
    sdk.readout(id, { x: statsX, y, w: 296, h: 36, label, value, role, decimals: 3 });
  const countsLabel = counts => counts[0] + ' of class 0, ' + counts[1] + ' of class 1';
  const objects = [
    ...sdk.plot('split', {
      x: 16, y: 18, w: 382, h: 250, xDomain: [0, 20], yDomain,
      xLabel: 'Feature value', yLabel: 'Class label (0 or 1)', series,
    }),
    sdk.line('divider', 412, 20, 412, 268, { opacity: .5 }),
    sdk.text('criterion-label', statsX, 34, criterion === 'gini' ? 'Gini impurity' : 'Entropy (bits)'),
    sdk.text('left-count', statsX, 60, 'Left ≤ ' + cutoff + ': ' + countsLabel(left), { role: 'learner' }),
    sdk.text('right-count', statsX, 82, 'Right > ' + cutoff + ': ' + countsLabel(right), { role: 'learner' }),
    ...stats('before', 100, 'Before split', parent),
    ...stats('after', 144, 'Weighted after split', weighted),
    ...stats('gain', 188, 'Gain', gain, 'learner'),
  ];
  if (best) {
    const label = best.cutoff === cutoff
      ? 'Your cutoff is best'
      : 'Best cutoff ' + best.cutoff + ' · Gain ' + sdk.format(best.gain, 3);
    objects.push(sdk.text('best-label', statsX, 253, label, { role: 'success' }));
  }

  return {
    frame: sdk.frame(objects, { width: 742, height: 292 }),
    quantities: {
      cutoff, parent, weighted, gain,
      left0: left[0], left1: left[1], right0: right[0], right1: right[1],
      ...(best ? { bestCutoff: best.cutoff, bestGain: best.gain } : {}),
    },
  };
}`,
  events: [
    { type: 'input', input: 'cutoff', value: 9 },
    { type: 'action', action: 'revealBest' },
    { type: 'input', input: 'criterion', value: 'entropy' },
  ],
};
