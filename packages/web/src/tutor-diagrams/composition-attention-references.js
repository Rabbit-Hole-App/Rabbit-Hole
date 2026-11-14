import { derived as toyDerived } from './topic-attention-data.js';

const d = toyDerived();
const spec = diagram => ({ version: 1, diagram });
const bars = (title, values) => ({ kind: 'bar-chart', title, bars: values.map((value, i) => ({ label: d.keys[i].label, value })) });
const weights = (title, row) => ({ ...bars(title, row.display.weights), variant: 'stacked', total: row.display.total });
const inputs = row => `Toy $q=(${row.query})$; keys ${d.keys.map(({ label, key }) => `${label} $(${key})$`).join(', ')}. Raw matches are dot products; head width $d_k=${d.headWidth}$.`;

function normalization(depth) {
  const overview = depth === 'overview';
  const row = depth === 'deep' ? d.doubled : d.base;
  const panels = [{ diagram: bars('Raw matches', row.display.raw) }];
  if (!overview) panels.push({ diagram: bars('Scaled matches', row.display.scaled) });
  panels.push({ diagram: weights('Position weights', row) });
  return { kind: 'panels', title: 'Scaled attention weights',
    caption: overview ? 'Toy query. Positive position weights sum to one.'
      : depth === 'deep' ? `Toy $q\u2032=${d.parameters.queryScale}q$; fixed keys. Positive query scaling keeps order and changes concentration.` : inputs(row),
    panels, links: overview ? [{ from: 0, to: 1, operation: '$\\text{scale + softmax}$' }]
      : [{ from: 0, to: 1, operation: `$\\div\\sqrt{${d.headWidth}}$` }, { from: 1, to: 2, operation: 'softmax' }],
    shared: ['classes', 'colours'] };
}

const queryComparison = { kind: 'comparison', variant: 'panels', title: 'Query scale changes concentration',
  caption: 'Toy query doubled; keys fixed. Position order and total stay the same.',
  panels: [{ heading: 'Original query', diagram: weights('Original query', d.base) },
    { heading: 'Doubled query', diagram: weights('Doubled query', d.doubled) }] };
const paraphrases = [
  'Show attention score scaling followed by normalized position weights.',
  'How does the square root of head width change query-key matches before softmax?',
  'Draw scaled match weights from one query and three candidate keys.',
  'Trace a query-key dot product through the head-width divisor and softmax.',
  'What happens to normalized attention matches when the query is doubled?',
];
const depths = {
  overview: { spec: spec(normalization('overview')) },
  standard: { spec: spec(normalization('standard')) },
  deep: { spec: spec(normalization('deep')), detailSpec: spec(queryComparison) },
};

export const references = Object.freeze([{
  id: 'ml-attention-scaled-score-normalization', topic: 'attention', lessons: ['03'],
  sources: [
    { kind: 'figure-brief', path: 'docs/features/explain-on-canvas/handoff/figure-briefs/illustrated-transformer/briefs.md#figure-12', revision: '05d5f02f6' },
    { kind: 'figure-brief', path: 'docs/features/explain-on-canvas/handoff/figure-briefs/illustrated-gpt2/briefs.md#figure-23', revision: '05d5f02f6' },
  ],
  prompts: ['Scaling and softmax convert raw matches into a comparable distribution over positions.', ...paraphrases],
  paraphrases, keywords: ['attention score scaling', 'scaled match weights'],
  useWhen: 'Show attention score scaling and normalized position weights for one query; not a full-sequence score matrix, value-vector mixing or next-token probabilities.',
  ...depths.standard, depths,
}]);
export function derived() { return toyDerived(); }
