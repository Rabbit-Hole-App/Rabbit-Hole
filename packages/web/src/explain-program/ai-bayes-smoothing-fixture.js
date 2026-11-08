import { VISUAL_PROGRAM_STAMPS } from './stamps.js';

export const bayesSmoothingFixture = {
  id: 'fixture-ai-bayes-smoothing',
  stamps: VISUAL_PROGRAM_STAMPS,
  manifest: {
    title: 'Naive Bayes Smoothing Explorer',
    summary: 'Additive smoothing gives a known word a nonzero likelihood even in a class where it never appeared.',
    description: 'A training count table for two classes and three words, followed by each class likelihood and score for the word offer, the shared evidence, and the two posterior probabilities.',
    cardDescription: 'The word “offer” is in the vocabulary but never appeared in Not spam training messages. See how adding α to each word count changes the class probabilities for a message containing only “offer”.',
    instructions: 'Move Smoothing α from 0 to 1. Compare the Not spam likelihood and posterior before and after Laplace smoothing.',
    assumptions: ['One observed token from a fixed three-word vocabulary. Class priors stay fixed at 40% Spam and 60% Not spam.'],
    capabilities: ['number_inputs'],
    inputs: [{ id: 'alpha', label: 'Smoothing α', type: 'number', default: 0, min: 0, max: 2, step: 0.5 }],
    readouts: [
      { id: 'likelihoodSpam', label: 'Likelihood in Spam', decimals: 3 },
      { id: 'likelihoodNotSpam', label: 'Likelihood in Not spam', decimals: 3 },
      { id: 'evidence', label: 'Evidence P(offer)', decimals: 3 },
      { id: 'posteriorSpam', label: 'Posterior for Spam', decimals: 3 },
      { id: 'posteriorNotSpam', label: 'Posterior for Not spam', decimals: 3 },
    ],
  },
  source: `
const vocabulary = ['offer', 'meeting', 'today'];
const observed = 'offer';
const classes = [
  { id: 'spam', name: 'Spam', counts: [3, 1, 2], prior: 0.4, suffix: 'Spam' },
  { id: 'not-spam', name: 'Not spam', counts: [0, 5, 3], prior: 0.6, suffix: 'NotSpam' },
];
const total = counts => counts.reduce((sum, count) => sum + count, 0);
function shown(value) {
  if (value === 0) return ' = 0';
  const display = sdk.format(value, 3);
  return (Number(display) === value ? ' = ' : ' ≈ ') + display;
}

export function evaluate({ inputs: { alpha } }) {
  const index = vocabulary.indexOf(observed);
  const rows = classes.map(row => {
    const tokenTotal = total(row.counts);
    const numerator = row.counts[index] + alpha;
    const denominator = tokenTotal + alpha * vocabulary.length;
    const likelihood = numerator / denominator;
    return { ...row, tokenTotal, numerator, denominator, likelihood, score: row.prior * likelihood };
  });
  // Spam has an observed occurrence and a positive prior, so evidence stays positive even at alpha = 0.
  const evidence = rows.reduce((sum, row) => sum + row.score, 0);
  const mode = alpha === 0 ? ' · No smoothing' : alpha === 1 ? ' · Laplace smoothing' : ' · Additive smoothing';
  const objects = [
    sdk.text('observed-word', 24, 26, 'Observed word: “' + observed + '”', { role: 'input' }),
    sdk.text('likelihood-formula', 24, 51, 'P(word | class) = (word count + α) / (class total + α × |V|)'),
    sdk.text('alpha-state', 24, 76, 'α = ' + alpha + mode),
    sdk.text('counts-label', 24, 105, 'Training token counts · vocabulary size |V| = ' + vocabulary.length),
    ...sdk.grid('counts', {
      x: 24, y: 112, w: 652, h: 94,
      rowLabels: rows.map(row => row.name), columnLabels: [...vocabulary, 'Total', 'Prior'],
      rows: rows.map(row => [...row.counts, row.tokenTotal, sdk.format(row.prior * 100, 0) + '%']),
      active: rows.map((_, rowIndex) => [rowIndex, index]),
    }),
  ];
  const readouts = [{ id: 'evidence', value: evidence }];
  rows.forEach(({ id, name, prior, suffix, numerator, denominator, likelihood, score }, i) => {
    const x = i === 0 ? 24 : 370;
    const posterior = score / evidence;
    const barWidth = 306;
    objects.push(
      sdk.text(id + '-heading', x, 230, name),
      sdk.text(id + '-likelihood', x, 255, 'Likelihood: ' + numerator + ' / ' + denominator + shown(likelihood), { role: likelihood === 0 ? 'warning' : 'neutral' }),
      sdk.text(id + '-score', x, 280, 'Score: ' + sdk.format(prior, 2) + ' × likelihood' + shown(score)),
      sdk.text(id + '-posterior', x, 366, name + ': ' + sdk.format(posterior * 100, 1) + '%', { role: 'output' }),
      sdk.box(id + '-posterior-track', x, 374, barWidth, 18),
    );
    if (posterior > 0) objects.push(sdk.box(id + '-posterior-bar', x, 374, barWidth * posterior, 18, { role: 'learner' }));
    readouts.push({ id: 'likelihood' + suffix, value: likelihood }, { id: 'posterior' + suffix, value: posterior });
  });
  objects.push(
    sdk.text('evidence', 24, 311, 'Evidence P(offer) = score(Spam) + score(Not spam)' + shown(evidence)),
    sdk.text('posterior-formula', 24, 340, 'Posterior = class score / evidence'),
  );
  return { frame: sdk.frame(objects, { width: 700, height: 408, readouts }) };
}`,
};
