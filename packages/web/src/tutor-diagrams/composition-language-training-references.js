import { derived } from './topic-language-training-data.js';
import manifest from './topic-summarization-sources.json' with { type: 'json' };
const d = derived(), p = d.parameters;
const spec = diagram => ({ version: 1, diagram });
const slots = { kind: 'matrix', layout: 'teaching', title: 'An output token has a stable slot', columns: ['Token', 'Slot'],
  rows: d.selectedEntries.map((row, i) => ({ id: 'v' + row.slot, heading: 'Entry ' + String.fromCharCode(65 + i), cells: [row.token, String(row.slot)] })),
  caption: `Two shown entries of the fixed ${d.counts.vocabulary}-slot output vocabulary. The stop entry has its own slot; start is input-only.` };
const indicators = deep => ({ kind: 'heatmap', title: deep ? 'Change target, preserve every output slot' : 'Observed token selects its one-hot slot',
  rowLabel: 'Output slot / token', columnLabel: 'Observed target', columns: (deep ? d.targets : d.targets.slice(0, 1)).map(row => row.token),
  rows: d.dictionary.map(({ slot, token }) => ({ label: slot + ': ' + token, cells: (deep ? d.targets : d.targets.slice(0, 1)).map(row => row.values[slot]) })), range: { min: 0, max: 1 },
  caption: deep ? `Change ${p.selectedTarget} to stop “${p.eos}”, keep the indexed rows. Each observed target satisfies $\\sum_j y_j=1$; these are indicator flags.`
    : `Observed ${p.selectedTarget} at slot $k=${d.targets[0].slot}$: $y_j=1[j=k]$, zero elsewhere. Indexed rows keep one fixed output order.` });
const prediction = { kind: 'bar-chart', title: 'Model distribution for one observed next token',
  bars: d.dictionary.map((row, i) => ({ label: row.token, value: d.cases[0].displayProbabilities[i] })),
  caption: `Illustrative A after ${d.prefixes[1].prefix}; observed ${p.selectedTarget}. Its negative-log loss is $L\\approx ${d.cases[0].displayLoss}$ nats.` };
const distributions = deep => ({ kind: 'bar-chart', variant: 'grouped', title: deep ? 'Same target, two illustrative model distributions' : 'Compare predicted and observed target distributions',
  categories: d.dictionary.map(row => row.token),
  series: [...(deep ? d.cases : d.cases.slice(0, 1)).map(row => ({ label: row.label, values: row.displayProbabilities })), { label: 'Observed one-hot', values: d.targets[0].values }],
  caption: deep ? `Illustrative A/B: rounded softmax probabilities; only ${p.selectedTarget}'s logit rises. Same vocabulary and observed one-hot target.`
    : `Illustrative A, observed ${p.selectedTarget}: $p\\approx ${d.cases[0].displayTargetProbability}$, $L=-\\ln(p)\\approx ${d.cases[0].displayLoss}$ nats. Same slots for model and supplied target.` });
const losses = { kind: 'bar-chart', title: 'More observed-token probability, less loss', unit: 'nats',
  bars: d.cases.map(row => ({ label: row.label, value: row.displayLoss })),
  caption: `Illustrative losses: $L=-\\ln(p_{${p.selectedTarget}})$; $\\Delta L=L_B-L_A\\approx ${d.displayLossDelta}$ nats, computed before display rounding.` };
const prefixTable = (rows, title, caption) => ({ kind: 'matrix', layout: 'teaching', title, columns: ['Observed prefix', 'Next observed token'],
  rows: rows.map(row => ({ id: row.id, heading: row.label, cells: [row.prefix, row.target] })), caption });
const prefixOverview = prefixTable(d.prefixes.slice(0, 2), 'One observed continuation per earlier prefix', 'Toy observed clouds bring rain. Prefix rows stop before their immediate target; the labels come from observed text.');
const prefixStandard = prefixTable(d.prefixes, 'Align observed prefixes and immediate targets', 'Observed token targets, not downstream class labels. Each prefix ends before its next observed token; no generated feedback.');
const prefixDeep = prefixTable(d.prefixes, 'Predict each target from earlier text', 'Predict $x_t$ from observed $x_{<t}$. Later text does not enter an earlier prefix; token labels differ from task classes.');
const c = d.probeChanges;
const prefixProbe = prefixTable(d.probe, 'Edit a later token, recompute affected rows', `Edit ${c.oldToken} to ${c.newToken}: ${c.unchanged.join(',')} fixed; ${c.changedTargets.join(',')} target changes, ${c.changedPrefixes.join(',')} prefix changes. Observed text, not guesses.`);
const designs = [
  { id: 'ml-language-training-vocabulary-target-slots', keywords: ['indexed output slots', 'observed token indicator'],
    useWhen: 'Show fixed indexed output slots and the observed token indicator, including stop; not generic feature one-hot encoding, arbitrary slot reordering, model probabilities or generation.',
    paraphrases: ['How do indexed output slots keep the stop entry identifiable?', 'Show the observed token indicator for bring in a fixed vocabulary.', 'Change an observed token indicator while preserving indexed output slots.', 'Which indexed output slots are active for the observed stop target?', 'Explain an observed token indicator without changing vocabulary order.'],
    depths: { overview: { spec: spec(slots) }, standard: { spec: spec(indicators(false)) }, deep: { spec: spec(indicators(true)) } } },
  { id: 'ml-language-training-target-probability-and-loss', keywords: ['paired token distributions', 'illustrative distribution losses'],
    useWhen: 'Compare paired token distributions with a fixed observed target and illustrative distribution losses; not binary curves, loss bars alone, measured optimizer steps or generated-token sampling.',
    paraphrases: ['Show paired token distributions with the same observed bring target.', 'How do illustrative distribution losses change after the target logit rises?', 'Compare full paired token distributions against the fixed one-hot target.', 'Compute illustrative distribution losses before rounding their labels.', 'Keep vocabulary and true target fixed in paired token distributions.'],
    depths: { overview: { spec: spec(prediction) }, standard: { spec: spec(distributions(false)) }, deep: { spec: spec(distributions(true)), detailSpec: spec(losses) } } },
  { id: 'ml-language-training-prefix-target-alignment', keywords: ['observed prefix labels', 'training continuation rows'],
    useWhen: 'Align observed prefix labels and training continuation rows through the stop target; not generated-token feedback, fixed word windows, recurrent state mechanisms, masking or downstream class labels.',
    paraphrases: ['Show observed prefix labels including the final stop target.', 'Which training continuation rows change after a later observed token is edited?', 'Explain observed prefix labels without generated-token feedback.', 'Align overlapping training continuation rows from one sentence.', 'Keep pretraining token targets separate from class labels in observed prefix labels.'],
    depths: { overview: { spec: spec(prefixOverview) }, standard: { spec: spec(prefixStandard) }, deep: { spec: spec(prefixDeep), detailSpec: spec(prefixProbe) } } },
];
export const references = Object.freeze(designs.map(({ id, ...design }) => {
  const row = manifest.references.find(entry => entry.referenceId === id);
  return { id, topic: row.topic, lessons: row.lessons,
    sources: [row.source, ...row.alsoCovers].map(source => ({ kind: 'figure-brief', path: source.brief, revision: manifest.sourceRevision })),
    prompts: [row.source.summary, ...row.alsoCovers.map(source => source.summary), ...design.paraphrases], ...design, ...design.depths.standard };
}));
export { derived };
