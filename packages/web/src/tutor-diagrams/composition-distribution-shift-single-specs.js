import { references as attentionReferences } from './composition-attention-references.js';
import { references as evaluationReferences } from './composition-model-evaluation-references.js';
import { references as timeReferences } from './composition-time-series-references.js';
import { references as shiftReferences } from './composition-distribution-shift-references.js';
import { derived, namingRules } from './topic-distribution-shift-data.js';

const references = [...attentionReferences, ...evaluationReferences, ...timeReferences, ...shiftReferences];
const source = id => references.find(reference => reference.id === id);
const panel = (id, title) => {
  const diagram = source(id).spec.diagram;
  return diagram.panels ? diagram.panels.find(part => part.diagram.title === title).diagram : diagram;
};
const single = (diagram, useWhen) => ({ spec: { version: 1, diagram }, useWhen });
// The author's bar-chart schema omits total; stacked rendering sums the same bars.
const { total: attentionTotal, ...attentionBars } = panel('ml-attention-scaled-score-normalization', 'Position weights');
const attentionWeights = { ...attentionBars, caption: `${source('ml-attention-scaled-score-normalization').spec.diagram.caption} Divide by $\\sqrt{d_k}$, then softmax.` };
const { concept } = derived();
const darkRound = concept.slices.find(slice => slice.tone === 'dark' && slice.shape === 'round');
const studioNames = concept.settings.map(setting => setting.name);
const conceptComparison = {
  kind: 'bar-chart', variant: 'grouped', title: `Same ${darkRound.label.toLowerCase()} cards, different labels`,
  categories: studioNames,
  series: ['A', 'B'].map((label, index) => ({
    label: `Label ${label}`, values: darkRound.classCounts.map(counts => counts[index]),
  })),
  caption: studioNames.map(name => {
    const { round, square } = namingRules[name];
    return `${name} labels round ${round} and square ${square}.`;
  }).join(' '),
};

export const distributionShiftSingleSpecs = Object.freeze({
  'ml-attention-scaled-score-normalization': single(attentionWeights,
    'Show normalized position weights after head-width scaling and softmax for one query; not raw matches, value-vector mixing, a full score matrix, or next-token probabilities.'),
  'ml-model-evaluation-training-diagnostics': single(panel('ml-model-evaluation-training-diagnostics', 'Loss'),
    'Compare illustrative training and held-out dropout loss over the same epochs; not a dropout mask, an accuracy scale, or a guarantee of better generalization.'),
  'ml-model-evaluation-schedule-run-diagnostics': single(panel('ml-model-evaluation-schedule-run-diagnostics', 'Accuracy'),
    'Show the illustrative training and held-out accuracy gap as held-out accuracy plateaus at a fixed learning rate; not a learning-rate decay curve or a schedule guarantee.'),
  'ml-time-series-recursive-rollout': single(panel('ml-time-series-recursive-rollout', 'Traces'),
    'Compare recursive forecasts that reuse predictions with observed readings and refreshed one-step forecasts; not one-step forecasting alone or a horizon-only comparison.'),
  'ml-distribution-shift-input-distribution-shift': single(source('ml-distribution-shift-input-distribution-shift').depths.deep.spec.diagram,
    'Compare input-style counts across independent training and deployment domains while the class rule stays fixed; not changed label meanings or class imbalance.'),
  'ml-distribution-shift-concept-shift': single(conceptComparison,
    'Compare Elm and Ash applying different naming rules to the same dark round cards.'),
});
