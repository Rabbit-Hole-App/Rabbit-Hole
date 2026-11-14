import { derived } from './topic-transformer-data.js';
import manifest from './topic-transformer-sources.json' with { type: 'json' };

const d = derived();
const p = d.parameters;
const spec = diagram => ({ version: 1, diagram });
const grid = (row, selected = false) => ({ kind: 'heatmap', title: selected ? 'One target query reads source keys' : 'Target queries read source keys',
  rowLabel: 'Target query', columnLabel: 'Source key', columns: [...d.sourceTokens, p.padding],
  rows: d.targetQueries.slice(0, selected ? 1 : d.targetQueries.length).map((label, i) => ({ label, cells: row.grid[i] })), range: { min: 0, max: 1 } });
const sourceValues = d.sourceTokens.map((word, i) => `${word} $(${p.values[i].join(',')})$`).join(', ');
const alignmentOverview = { ...grid(d.base, true), caption: 'Toy target query over source keys. Grey padding is excluded; the valid source shares sum to one.' };
const alignmentStandard = { ...grid(d.base), caption: `Toy source values: ${sourceValues}. Mix these values with each row; padding excluded.` };
const weightedSum = d.base.display.weights[0].map((weight, i) => `${weight}(${p.values[i].join(',')})`).join('+');
const context = { kind: 'bar-chart', title: `Weighted source context for ${d.targetQueries[0]}`,
  bars: p.features.map((label, i) => ({ label, value: d.base.display.contexts[0][i] })),
  caption: `Toy rounded weights: $c=${weightedSum}\\approx(${d.base.display.contexts[0].join(',')})$. Padding excluded.` };
const concentration = { ...grid(d.broad), title: 'Broader query, same source keys',
  caption: `Toy $q'=${p.broadQueryScale}q$; keys and values fixed. Each row still sums to one; grey padding stays excluded.` };

const ruleTable = { kind: 'matrix', title: 'Different context rules', columns: ['Current segment', 'Earlier memory'],
  rows: [{ heading: p.architectures.causal, cells: ['Earlier and self', 'None'] }, { heading: p.architectures.bidirectional, cells: ['All positions', 'None'] },
    { heading: p.architectures.memory, cells: ['Earlier and self', 'Prior segment'] }],
  caption: 'Context permission, not attention probabilities. Earlier-segment memory does not reveal future current words.' };
const mask = (title, rows, memory = false) => ({ kind: 'heatmap', title,
  columns: memory ? [...p.prior.map(word => `Past ${word}`), ...p.current] : p.current,
  rows: p.current.map((label, i) => ({ label, cells: rows[i] })), range: { min: 0, max: 1 },
  ...(!memory ? { highlights: [{ row: d.focus, column: d.focus }] } : {}) });
const rules = deep => ({ kind: 'comparison', variant: 'panels', title: 'Same words, different access',
  caption: deep ? 'Permissions only. $K=[K_{past};K_{current}]$ adds past keys, not future current keys; see the extra grid.' : 'Permissions, not probabilities. Same read focus; blank future cells are hidden only on the causal side.',
  panels: [{ heading: 'Causal', diagram: mask(p.architectures.causal, d.masks.causal) }, { heading: 'Bidirectional', diagram: mask(p.architectures.bidirectional, d.masks.bidirectional) }] });
const memoryProbe = { ...mask('Prior segment plus causal current', d.masks.memory, true),
  caption: 'Transformer-XL permissions: Past columns are old-segment memory. Current future keys remain unavailable.' };

const tensor = rows => ({ kind: 'tensor', tensor: { rows, columns: d.counts.features, dimensions: `${rows}x${d.counts.features}` } });
const layer = (id, label, rows = d.counts.slots) => ({ id, label, diagram: tensor(rows) });
const states = depth => ({ kind: 'block-stack', title: 'Lookup becomes contextual state',
  caption: depth === 'deep' ? `Toy bidirectional encoder; [CLS], we, read, [SEP] keep order and width. Layers have distinct learned parameter sets $${p.layers.join(',')}$.` : 'Toy bidirectional encoder; rows [CLS], we, read, [SEP]. Later layers consume contextual states, not fresh lookups.',
  blocks: [layer('lookup', 'Lookup slots'), ...(depth === 'overview' ? [layer('context', 'Contextual output slots')] : p.layers.map((weights, i) => layer(`layer${i}`, `Layer ${i + 1}: mix then FFN ($${weights}$)`)))] });
const causalSlots = { kind: 'block-stack', title: 'Causal layers keep the slots too',
  caption: 'Toy GPT-style causal case: rows we, read, maps keep one output slot each. Layer parameter sets are separate; future words stay hidden.',
  blocks: [layer('input', 'Prior contextual states', p.current.length), layer('output', 'Next contextual states', p.current.length)] };

const keywords = {
  'ml-transformer-cross-attention-alignment': ['target source alignment', 'cross attention axes'],
  'ml-transformer-context-rules': ['architecture context rules', 'prior segment context'],
  'ml-transformer-contextual-layer-states': ['successive contextual states', 'position aligned states'],
};
const paraphrases = {
  'ml-transformer-cross-attention-alignment': ['Read target source alignment with the unavailable source padding excluded.', 'Show cross attention axes for different translation sequences.', 'How does target source alignment produce a weighted source context?', 'Keep source keys fixed and broaden target source alignment weights.', 'Trace cross attention axes from target query to source values.'],
  'ml-transformer-context-rules': ['Compare architecture context rules for GPT-2, BERT and Transformer-XL.', 'How do architecture context rules hide future current words?', 'Show prior segment context without revealing future current keys.', 'Compare architecture context rules on the same words and focus position.', 'What changes when prior segment context is added to a causal decoder?'],
  'ml-transformer-contextual-layer-states': ['Trace successive contextual states at the same token positions.', 'How do position aligned states retain special-token slots?', 'Show successive contextual states without confusing them with embedding lookups.', 'Do position aligned states keep the same feature width across layers?', 'Compare successive contextual states with causal and bidirectional context.'],
};
const useWhen = {
  'ml-transformer-cross-attention-alignment': 'Read separate target-query and source-key sequences, exclude unavailable padding and form weighted source context; not self-attention, vocabulary probabilities or a memory overview.',
  'ml-transformer-context-rules': 'Compare causal, bidirectional and prior-segment context permissions; not numerical softmax, a KV-cache implementation or source-target cross-attention.',
  'ml-transformer-contextual-layer-states': 'Track lookup versus contextual slots through successive layers with explicit context rules and fixed feature width; not embedding lookup alone, position curves or attention probabilities.',
};
const views = {
  'ml-transformer-cross-attention-alignment': { overview: { spec: spec(alignmentOverview) }, standard: { spec: spec(alignmentStandard) }, deep: { spec: spec(context), detailSpec: spec(concentration) } },
  'ml-transformer-context-rules': { overview: { spec: spec(ruleTable) }, standard: { spec: spec(rules(false)) }, deep: { spec: spec(rules(true)), detailSpec: spec(memoryProbe) } },
  'ml-transformer-contextual-layer-states': { overview: { spec: spec(states('overview')) }, standard: { spec: spec(states('standard')) }, deep: { spec: spec(states('deep')), detailSpec: spec(causalSlots) } },
};
export const references = Object.freeze(manifest.references.filter(entry => entry.mode === 'NEW').map(entry => ({
  id: entry.referenceId, topic: 'transformer', lessons: entry.lessons,
  sources: [entry.source, ...entry.alsoCovers].map(source => ({ kind: 'figure-brief', path: source.brief, revision: manifest.sourceRevision })),
  prompts: [...new Set([entry.source, ...entry.alsoCovers].map(source => source.summary)), ...paraphrases[entry.referenceId]],
  paraphrases: paraphrases[entry.referenceId], keywords: keywords[entry.referenceId], useWhen: useWhen[entry.referenceId],
  ...views[entry.referenceId].standard, depths: views[entry.referenceId],
})));
export const transformerSingleSpecs = Object.freeze({
  'ml-transformer-context-rules': { spec: spec(ruleTable), useWhen: useWhen['ml-transformer-context-rules'] },
});
export { derived };
