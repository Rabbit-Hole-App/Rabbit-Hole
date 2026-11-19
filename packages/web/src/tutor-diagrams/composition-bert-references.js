import { derived } from './topic-bert-data.js';
import manifest from './topic-bert-sources.json' with { type: 'json' };
const d = derived();
const p = d.parameters;
const spec = diagram => ({ version: 1, diagram });
const pairs = depth => ({ kind: 'matrix', title: 'Messages paired with supplied classes', columns: ['Message', 'Class'],
  rows: (depth === 'overview' ? d.training.overview : d.training.rows).map(row => ({ heading: row.id, cells: [row.text, row.target] })),
  caption: depth === 'deep' ? 'Toy supplied targets, not predictions. Keep each $(x_i,y_i)$ pair attached when the rows are reordered.' : 'Toy supervised examples. The task supplies a class with each message; these are not model guesses.' });
const reorderedPairs = { kind: 'sample-set', title: 'Reorder rows, keep the targets',
  samples: d.training.reordered.map(row => ({ id: row.id, label: row.text, class: row.target })), groups: d.training.groups,
  caption: 'Toy same messages and supplied classes in a new order; no example is relabelled or duplicated.' };
const states = (overview, probe = false) => {
  const columns = overview ? p.features.slice(0, 1) : p.features;
  const values = probe ? d.readout.probe.states : d.readout.base.states;
  return { kind: 'heatmap', title: probe ? 'Change other contextual rows' : 'Read the contextual CLS row',
    rowLabel: 'Encoder position', columnLabel: 'Feature', columns,
    rows: p.tokens.map((label, i) => ({ label, cells: values[i].slice(0, columns.length) })), range: d.readout.range,
    highlights: columns.map((_, column) => ({ row: d.readout.summaryIndex, column })) };
};
const weightMatrix = `(${p.weights.map(row => `(${row.join(',')})`).join(',')})`;
const headInputs = `W=${weightMatrix},b=(${p.bias.join(',')})`;
const overviewStates = { ...states(true), caption: `Toy bidirectional contextual outputs; one of $${d.counts.features}$ features shown. Select the marked CLS row for the head.` };
const standardStates = { ...states(false), caption: `Toy ${p.classes.join(', ')} order. Select $h=H_{CLS}$; $${headInputs}$; apply $z=hW+b$.` };
const scores = { kind: 'bar-chart', title: 'Task scores from the selected CLS row', unit: 'Logit',
  bars: p.classes.map((label, i) => ({ label, value: d.readout.base.scores[i] })),
  caption: `Toy $h=(${d.readout.base.summary.join(',')}),${headInputs}$; $z=hW+b=(${d.readout.base.scores.join(',')})$. Raw scores in ${p.classes.join(', ')} order.` };
const probeStates = { ...states(false, true), caption: `Toy changes after encoding; CLS and head fixed. Scores stay $(${d.readout.probe.scores.join(',')})$. Input-word changes need not preserve CLS.` };
const views = {
  'ml-bert-supervised-class-pairs': { overview: { spec: spec(pairs('overview')) }, standard: { spec: spec(pairs('standard')) }, deep: { spec: spec(pairs('deep')), detailSpec: spec(reorderedPairs) } },
  'ml-bert-summary-token-readout': { overview: { spec: spec(overviewStates) }, standard: { spec: spec(standardStates) }, deep: { spec: spec(scores), detailSpec: spec(probeStates) } },
};
const keywords = {
  'ml-bert-supervised-class-pairs': ['adaptation message pairs', 'text class supervision'],
  'ml-bert-summary-token-readout': ['summary row projection', 'contextual readout scores'],
};
const paraphrases = {
  'ml-bert-supervised-class-pairs': ['Show adaptation message pairs with supplied Request and Notice classes.', 'How does text class supervision attach targets to messages?', 'Reorder adaptation message pairs without changing their classes.', 'Explain text class supervision without showing model guesses.', 'Keep the input and class attached in adaptation message pairs.'],
  'ml-bert-summary-token-readout': ['Show summary row projection from contextual states to class scores.', 'How are contextual readout scores computed from a selected CLS row?', 'Keep the CLS row fixed while checking summary row projection.', 'Explain contextual readout scores without calling logits probabilities.', 'Why can summary row projection leave other contextual output rows unused?'],
};
const useWhen = {
  'ml-bert-supervised-class-pairs': 'Show supplied short messages paired with task classes for supervised adaptation; not predictions, pretraining word targets, train/test splitting or the entire fine-tuning workflow.',
  'ml-bert-summary-token-readout': 'Select a contextual summary row and compute raw task scores with the declared linear head; not embedding lookup, average pooling, tagging or probability normalization.',
};
export const references = Object.freeze(manifest.references.filter(entry => entry.mode === 'NEW' && entry.topic === 'bert').map(entry => ({
  id: entry.referenceId, topic: entry.topic, lessons: entry.lessons,
  sources: [entry.source, ...entry.alsoCovers].map(source => ({ kind: 'figure-brief', path: source.brief, revision: manifest.sourceRevision })),
  prompts: [...new Set([entry.source, ...entry.alsoCovers].map(source => source.summary)), ...paraphrases[entry.referenceId]],
  paraphrases: paraphrases[entry.referenceId], keywords: keywords[entry.referenceId], useWhen: useWhen[entry.referenceId],
  ...views[entry.referenceId].standard, depths: views[entry.referenceId],
})));
export { derived };
