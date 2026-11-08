import { VISUAL_PROGRAM_STAMPS } from './stamps.js';

export const boostingFixture = {
  id: 'fixture-ai-boosting',
  stamps: VISUAL_PROGRAM_STAMPS,
  manifest: {
    title: 'Boosting Explorer',
    summary: 'AdaBoost gives more weight to examples a weak model gets wrong, changing what the next model learns.',
    description: 'Six labeled examples start with equal weight. Each AdaBoost round shows the chosen decision stump, its weighted error and vote weight, and the weights before and after the update.',
    cardDescription: 'A decision stump splits examples at one threshold. AdaBoost gives missed examples more weight and rescales the weights to add to 100%, so the next stump pays more attention to those examples.',
    instructions: 'Move Training step from 0 to 2 and compare the highlighted misses. A full weight bar is 50%.',
    assumptions: ['Binary AdaBoost with two decision stumps on six fixed examples. When stumps tie on weighted error, the lower threshold is chosen first.'],
    capabilities: ['number_inputs'],
    inputs: [{ id: 'step', label: 'Training step', type: 'number', default: 0, min: 0, max: 2, step: 1 }],
    readouts: [],
  },
  source: `
const examples = [-1, -1, 1, -1, 1, 1].map((label, i) => ({ id: 'ABCDEF'[i], x: i + 1, label }));
const thresholds = examples.slice(1).map((example, i) => (example.x + examples[i].x) / 2);
const sum = values => values.reduce((total, value) => total + value, 0);

function train(weights) {
  let best;
  for (const threshold of thresholds) {
    for (const polarity of [1, -1]) {
      const predictions = examples.map(({ x }) => x >= threshold ? polarity : -polarity);
      const error = sum(examples.map(({ label }, i) => label !== predictions[i] ? weights[i] : 0));
      if (!best || error < best.error) best = { threshold, polarity, predictions, error };
    }
  }
  const alpha = Math.log((1 - best.error) / best.error) / 2;
  const scaled = weights.map((weight, i) => weight * Math.exp(-alpha * examples[i].label * best.predictions[i]));
  const normalizer = sum(scaled);
  return { ...best, alpha, after: scaled.map(weight => weight / normalizer) };
}

const sign = value => value === 1 ? '+' : '−';
const percent = weight => (weight * 100).toFixed(1) + '%';

function weightBar(id, column, x, y, weight, role) {
  const key = id + '-' + column;
  const width = 104;
  return [
    sdk.box('track-' + key, x, y - 13, width, 14),
    sdk.box('weight-' + key, x, y - 13, width * 2 * weight, 14, { role }),
    sdk.text('value-' + key, x + width + 10, y, percent(weight)),
  ];
}

export function evaluate({ inputs }) {
  const step = Math.round(inputs.step);
  let before = examples.map(() => 1 / examples.length);
  let round;
  for (let i = 0; i < step; i++) {
    if (round) before = round.after;
    round = train(before);
  }
  const rule = round ? 'Round ' + step + ' · Predict ' + sign(round.polarity) + ' when x ≥ ' + round.threshold
    + ', otherwise ' + sign(-round.polarity) : 'Before fitting · Equal weights';
  const objects = [
    sdk.text('rule', 24, 28, rule),
    ...(round ? [sdk.text('error', 24, 54, 'Weighted error: ' + percent(round.error) + ' · Stump vote weight: ' + round.alpha.toFixed(3))] : []),
    sdk.text('examples', 24, 94, 'ID · x · Label'),
    sdk.text('predictions', 172, 94, 'Stump guess'),
    sdk.text('before', 310, 94, 'Before update'),
    sdk.text('after', 492, 94, 'After update'),
    ...examples.flatMap(({ id, x, label }, i) => {
      const y = 126 + i * 32;
      const guess = round?.predictions[i];
      const miss = round && guess !== label;
      return [
        sdk.text('label-' + id, 24, y, id + ' · ' + x + ' · ' + sign(label)),
        ...(round ? [sdk.box('prediction-' + id, 172, y - 18, 110, 26, {
          text: sign(guess) + (miss ? ' · Miss' : ''), role: miss ? 'warning' : 'neutral',
        })] : []),
        ...weightBar(id, 'before', 310, y, before[i], 'input'),
        ...(round ? weightBar(id, 'after', 492, y, round.after[i], miss ? 'warning' : 'learner') : []),
      ];
    }),
  ];
  return { frame: sdk.frame(objects, { width: 664, height: 316 }) };
}`,
};
