import { derived } from './topic-recurrent-attention-data.js';
import manifest from './topic-attention-sources.json' with { type: 'json' };
const d = derived(), p = d.parameters, spec = diagram => ({ version: 1, diagram });
const edge = (from, to, label) => ({ from, to, label });
const overview = { kind: 'relationship', layout: 'graph', title: 'Two reads enter two recurrent updates',
  nodes: [{ id: 'enc', label: 'Shared encoder' }, { id: 's0', label: 'Initial state' }, { id: 'c1', label: 'Read context A' }, { id: 's1', label: 'Update A' }, { id: 'c2', label: 'Read context B' }, { id: 's2', label: 'Update B' }],
  edges: [edge('enc', 'c1', 'source'), edge('s0', 'c1', 'query'), edge('c1', 's1', 'context'), edge('s0', 's1', 'prior state'), edge('enc', 'c2', 'source'), edge('s1', 'c2', 'query'), edge('c2', 's2', 'context'), edge('s1', 's2', 'prior state')],
  caption: 'Toy recurrence: each updated state queries the same encoder source for the following read.' };
const unroll = { kind: 'relationship', layout: 'graph', title: 'Each context enters its own next update',
  nodes: [{ id: 'enc', label: 'Encoder source' }, { id: 's0', label: 'Initial state' }, { id: 'read1', label: 'Attention A' }, { id: 'c1', label: 'Context A' }, { id: 's1', label: 'Update A' }, { id: 'read2', label: 'Attention B' }, { id: 'c2', label: 'Context B' }, { id: 's2', label: 'Update B' }],
  edges: [edge('enc', 'read1', 'source'), edge('s0', 'read1', 'query'), edge('read1', 'c1', 'weighted sum'), edge('c1', 's1', 'context'), edge('s0', 's1', 'prior'), edge('enc', 'read2', 'source'), edge('s1', 'read2', 'query'), edge('read2', 'c2', 'weighted sum'), edge('c2', 's2', 'context'), edge('s1', 's2', 'prior')],
  caption: `Toy $c=softmax(s_{prev}E)E$; $s=${p.recurrent}s_{prev}+x+c$. The second query is the actual first update, not a supplied state.` };
const weights = (rows, title) => ({ kind: 'heatmap', title, rowLabel: 'Decoder query', columnLabel: 'Encoder key', columns: d.positions,
  rows: rows.map((row, i) => ({ label: 'Step ' + row.step, cells: row.display.weights })), range: { min: 0, max: 1 },
  caption: `Toy $E=(${p.encoder})$, $s_0=${p.initial}$, $x=(${p.inputs})$. Scores use the previous state; normalize over encoder keys.` });
const results = { kind: 'bar-chart', variant: 'grouped', title: 'Computed contexts enter successive states', categories: d.base.map(row => 'Step ' + row.step),
  series: [{ label: 'Context', values: d.base.map(row => row.display.context) }, { label: 'Next state', values: d.base.map(row => row.display.state) }],
  caption: `Toy $s=${p.recurrent}s_{prev}+x+c$; $s_0=${p.initial}$, $x=(${p.inputs})$. Both contexts and states are recomputed in order.` };
const probe = weights([d.base[0], { ...d.probe[0], step: d.probe.length }], 'Change the initial query, keep the source');
probe.rows[0].label = 'Original query'; probe.rows[1].label = 'Shifted query';
probe.caption = `Same encoder; initial query shifts by $${p.queryShift}$. Recompute softmax and context; then recompute each next state.`;
const entry = manifest.references.find(row => row.queueId === 'ml-recurrent-attention-decoder-context');
const paraphrases = ['Show recurrent context handoff into both decoder updates.', 'Trace decoder context recurrence from the actual previous state.', 'Why does recurrent context handoff change with the decoder state?', 'Keep encoder values fixed during decoder context recurrence.', 'Recompute both steps of recurrent context handoff after an initial-state change.'];
const depths = { overview: { spec: spec(overview) }, standard: { spec: spec(unroll), detailSpec: spec(weights(d.base, 'Two target steps read the same source')) }, deep: { spec: spec(results), detailSpec: spec(probe) } };
export const references = Object.freeze([{ id: entry.referenceId, topic: entry.topic, lessons: entry.lessons,
  sources: [{ kind: 'figure-brief', path: entry.source.brief, revision: manifest.sourceRevision }], prompts: [entry.source.summary, ...paraphrases], paraphrases, keywords: ['recurrent context handoff', 'decoder context recurrence'],
  useWhen: 'Show each recurrent context handoff entering its own update; not a generic one-update diagram, unrelated supplied second query, Transformer layer or state reset.', ...depths.standard, depths }]);
export { derived };
