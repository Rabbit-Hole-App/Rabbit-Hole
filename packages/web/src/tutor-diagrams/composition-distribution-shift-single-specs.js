import { references as attentionReferences } from './composition-attention-references.js';
import { references as evaluationReferences } from './composition-model-evaluation-references.js';
import { references as timeReferences } from './composition-time-series-references.js';
import { references as shiftReferences } from './composition-distribution-shift-references.js';

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
const concept = source('ml-distribution-shift-concept-shift').spec.diagram;
const changedRule = concept.panels.at(-1).diagram;
// A studio's bars alone lose the same-input rule comparison supplied by the parent wrapper.
const conceptLeaf = { ...changedRule, caption: `${concept.title}. ${concept.panels.map(part => `${part.diagram.title}: ${part.label}.`).join(' ')}` };

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
  'ml-distribution-shift-concept-shift': single(conceptLeaf,
    'Show the changed naming rule on the same fixed dark-round input slice, with both studio rules stated; not changed input frequencies or a shift in overall class balance.'),
});
