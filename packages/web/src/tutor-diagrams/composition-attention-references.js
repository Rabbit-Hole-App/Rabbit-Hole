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

const c02References = Object.freeze([{
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

import { compositionDerived as c07Derived } from './topic-attention-data.js';
import c07Manifest from './topic-attention-sources.json' with { type: 'json' };
const c07 = c07Derived(), cp = c07.parameters;
const doc = diagram => ({ version: 1, diagram });
const ce = (from, to, label) => ({ from, to, label });
const payload = values => { const rows = Array.isArray(values[0]) ? values : [values]; return { rows: rows.length, columns: rows[0].length, dimensions: rows.length + ' × ' + rows[0].length, values: rows.flat() }; };
const tn = (id, label, values) => ({ id, label, tensor: payload(values) });
const ti = (label, values) => ({ label, tensor: payload(values) });
const tb = (id, label, values) => ({ id, label, diagram: { kind: 'tensor', tensor: payload(values) } });
const cg = (title, nodes, edges, caption) => ({ kind: 'relationship', layout: 'graph', title, nodes, edges, caption });
const hm = (title, columns, labels, values, caption, rowLabel = 'Query', columnLabel = 'Key') => ({ kind: 'heatmap', title, rowLabel, columnLabel, columns,
  rows: values.map((cells, i) => ({ label: labels[i], cells })), range: { min: Math.min(0, ...values.flat().filter(x => x !== null)), max: Math.max(1, ...values.flat().filter(x => x !== null)) }, caption });
const cb = (title, labels, values, caption, unit) => ({ kind: 'bar-chart', title, ...(unit ? { unit } : {}), bars: labels.map((label, i) => ({ label, value: values[i] })), caption });
const m = c07.matching;
const roleGraph = (row, overview = false) => overview ? cg('Keys match; paired values supply content',
  [{ id: 'q', label: 'Independent query' }, { id: 'pairs', label: 'Paired keys / values' }, { id: 'a', label: 'Matching weights' }, { id: 'c', label: 'Retrieved context' }],
  [ce('q', 'a', 'match'), ce('pairs', 'a', 'keys'), ce('pairs', 'c', 'values'), ce('a', 'c', 'weighted sum')], 'Generic toy: keys determine matching shares; associated values supply the returned content.')
  : cg('Match keys, retrieve associated values', [tn('q', 'Query', row.query), tn('k', 'Keys A,B', row.keys), tn('v', 'Values A,B', row.values), tn('a', 'Weights A,B', row.display.weights), tn('c', 'Context', row.display.output)],
    [ce('q', 'a', 'match'), ce('k', 'a', 'match'), ce('a', 'c', 'shares'), ce('v', 'c', 'content')], 'Unscaled generic toy: $a=softmax(qK^T)$, $c=aV$. Keys match; values provide content. Rounded tensors.');
const roleProbe = roleGraph(m.valueProbe);
roleProbe.caption = `Same q/K, only value B changes by $(${cp.matching.valueDelta})$. Unscaled generic toy: $\\Delta c=a_B\\Delta V_B$; weights stay fixed.`;
const weightedGraph = (row, overview = false) => overview ? cg('Weights and values supply one output', [tn('a', 'Weights ' + row.order.join(','), row.display.weights), tn('v', 'Values ' + row.order.join(','), row.values), tn('c', 'Context', row.display.output)], [ce('a', 'c', 'shares'), ce('v', 'c', 'content')], 'Unscaled generic toy weights; multiply each value by its matching coefficient and add coordinates.')
  : cg('Multiply matching values, then sum coordinates', [tn('a', 'Weights ' + row.order.join(','), row.display.weights), tn('v', 'Values ' + row.order.join(','), row.values), tn('t', 'Weighted terms ' + row.order.join(','), row.display.products), tn('c', 'Context', row.display.output)], [ce('a', 't', 'coefficients'), ce('v', 't', 'values'), ce('t', 'c', 'sum')], 'Unscaled generic toy: $a=softmax(qK^T)$, $T_j=a_jV_j$, $c=\\sum_jT_j$. Rounded values preserve the shown sum.');
const weightedProbe = weightedGraph(m.permuted);
weightedProbe.title = 'Permute whole coefficient/value pairs'; weightedProbe.caption = 'Same unscaled toy; reverse complete A/B pairs. $\\sum_j a_jV_j=\\sum_j a_{\\pi(j)}V_{\\pi(j)}$; the output is unchanged.';
const a = c07.additive, aw = a.widths;
const additiveOverview = cg('Two projections meet in one hidden space',
  [{ id: 'pq', label: `Project query ${aw.query} to ${aw.hidden}` }, { id: 'pk', label: `Project key ${aw.key} to ${aw.hidden}` }, { id: 'sum', label: 'Add hidden features' }, { id: 'score', label: 'Tanh and learned score' }, { id: 'w', label: 'Masked softmax' }],
  [ce('pq', 'sum', 'query branch'), ce('pk', 'sum', 'key branch'), ce('sum', 'score', 'nonlinear match'), ce('score', 'w', 'eligible keys')], 'Toy independent branches project unlike widths before addition, tanh and learned scoring.');
const additiveStandard = cg('Project independently, combine, score and mask',
  [{ id: 'q', label: 'Query width ' + aw.query }, { id: 'k', label: 'Key width ' + aw.key }, { id: 'pq', label: 'Query projection width ' + aw.hidden }, { id: 'pk', label: 'Key projection width ' + aw.hidden }, { id: 'sum', label: 'Add projections' }, { id: 'tanh', label: 'Tanh features' }, { id: 'score', label: 'Learned score / masked weights' }],
  [ce('q', 'pq', 'Wq'), ce('k', 'pk', 'Wk'), ce('pq', 'sum', 'query branch'), ce('pk', 'sum', 'key branch'), ce('sum', 'tanh', 'activate'), ce('tanh', 'score', 'v then softmax')], 'Toy $e_j=tanh(qW_q+k_jW_k)v^T$. Mask padded keys before normalization; q and k project independently.');
const additiveWeights = hm('Padding receives no attention weight', ['A', 'B', 'Pad'], ['Query'], [a.base.display.weights], 'Toy additive scores; Pad is blocked before softmax. Eligible weights sum to one.');
const additiveDeep = { kind: 'block-stack', title: 'One additive score from projected operands', blocks: [tb('operands', 'Rows: projected query, projected key A', [a.base.projectedQuery, a.base.projectedKeys[0]]), tb('sum', 'Add projected operands', a.base.display.combined[0]), tb('tanh', 'Apply tanh', a.base.display.activated[0]), tb('score', 'Dot with learned v', [a.base.display.scores[0]])],
  caption: `Toy $q=(${cp.additive.query})$, $k_A=(${cp.additive.keys[0]})$; $W_q=(${cp.additive.Wq.map(row=>'('+row+')')})$, $W_k=(${cp.additive.Wk.map(row=>'('+row+')')})$, $v=(${cp.additive.v})$. Project rows, add, tanh, score.` };
const additiveProbe = hm('An extreme padded key stays excluded', ['A', 'B', 'Pad'], ['Original', 'Pad edited'], [a.base.display.weights, a.probe.display.weights], `Only padded key becomes $(${cp.additive.padProbe})$. Masking before softmax keeps every eligible weight unchanged.`);
const con = c07.connectivity, conp = cp.connectivity;
const hopLabels = pair => con.rules.map(r => r.label + ' ' + pair.join(' to '));
const adjacency = (index, title) => { const rule = con.rules[index], path = con.paths[index]; return { ...hm(title, conp.positions.map(String), conp.positions.map(String), rule.adjacency, 'Rows receive from column positions. Marked cells follow the selected source-to-destination path.', 'Reader', 'Source'), highlights: path.slice(1).map((row, i) => ({ row, column: path[i] })) }; };
const hopOverview = cb('Same endpoints, different communication paths', con.rules.map(r => r.label), con.base, `Toy positions $(${conp.positions})$; ${conp.basePair.join(' to ')}. Conv radius $${conp.radius}$; RNN forward handoffs; attention all-to-all.`, 'Hops');
const hopStandard = cb('Compare distant and nearby position pairs', [...hopLabels(conp.basePair), ...hopLabels(conp.nearPair)], [...con.base, ...con.near], `Same rules: Conv radius $${conp.radius}$, RNN forward handoffs, attention all-to-all. Bars are shortest path lengths.`, 'Hops');
const hopDeep = cb('Widen only the convolution neighborhood', [...con.rules.map(r => r.label + ' base'), ...con.rules.map(r => r.label + ' wider')], [...con.base, ...con.wide], `Same ${conp.basePair.join(' to ')} pair. Only Conv radius changes $${conp.radius}\\to ${conp.widerRadius}$; $A_{ij}=1[|i-j|\\le r]$. Other rules fixed.`, 'Hops');
const c = c07.causal, cpar = cp.causal;
const causalOverview = hm('An interior query cannot read future keys', c.positions, [c.positions[cpar.focus]], [c.base.display.maskedScores[cpar.focus]], 'Toy interior query: prior and current logits are eligible; future cells are blocked before softmax.');
const causalScores = hm('Block future logits before normalization', c.positions, c.positions, c.base.display.maskedScores, `Toy $Q=(${cpar.queries})^T$, $K=(${cpar.keys})^T$; $S=QK^T$. Null blocks $j>i$ before softmax.`);
const causalWeights = hm('Eligible row weights sum to one', c.positions, c.positions, c.base.display.weights, `Toy $V=(${cpar.values})$; $c_i=\\sum_j a_{ij}V_j$. Future weights are zero; each query row sums to one.`);
const causalProbe = hm('Future edits cannot enter the interior context', c.positions, ['Original', 'Future edited'], [c.base.display.weights[cpar.focus], c.probe.display.weights[cpar.focus]], `Same interior query; future key/value become $${cpar.futureKey},${cpar.futureValue}$. Mask before softmax; eligible weights stay fixed.`);
const causalOutput = cb('Zero future contribution keeps context unchanged', ['Original', 'Future edited'], [c.base.display.outputs[cpar.focus], c.probe.display.outputs[cpar.focus]], 'The future key and value change, but their weight is zero. The same allowed values give the same interior context.', 'Context');
const pk = c07.packed, pp = cp.packed;
const singleProjection = { kind: 'transformation', title: 'One token row, three distinct toy projections', before: { label: 'Input ' + pk.active.position, items: [ti('h', [pk.active.input])] }, after: { label: 'Projected rows', items: [ti('Q', pk.active.queries), ti('K', pk.active.keys), ti('V', pk.active.values)] }, operation: 'Apply the three learned toy maps', links: [{ from: 0, to: 0, label: 'Wq' }, { from: 0, to: 1, label: 'Wk' }, { from: 0, to: 2, label: 'Wv' }],
  caption: `Toy $W_q=(${pp.Wq})$, $W_k=(${pp.Wk})$, $W_v=(${pp.Wv})$. Same selected row as the batched calculation; not literal model widths.` };
const packedOverview = { kind: 'block-stack', title: 'One row supplies three projected roles', blocks: [tb('input', 'Active input ' + pk.active.position, [pk.active.input]), tb('roles', 'Ordered Q / K / V toy channels', pk.active.joint)], caption: 'Toy separate projections can be concatenated in Q,K,V order; packing changes no row identity.' };
const packedRangeLabels = pk.ranges.map(row => `${row.label}[${row.start}:${row.end}]`).join(', ');
const packedStandard = hm('Joint channels preserve separate batched results', pk.positions, pk.channels.map(row => row.label), pk.channels.map(row => row.cells), `Toy $H=(${pp.inputs})^T$; $W_q=(${pp.Wq}),W_k=(${pp.Wk}),W_v=(${pp.Wv})$. $W=[W_q|W_k|W_v]$, $J=HW$. Ranges ${packedRangeLabels}.`, 'Channel', 'Token row');
const packedDeep = cg('Toy layers at ' + pk.active.position, [{ id: 'p', label: pk.active.position }, ...pk.layers.map((row, i) => tn('h' + i, row.label.replace('Layer ', '') + ' input', [row.input])), ...pk.layers.map((row, i) => tn('o' + i, row.label.replace('Layer ', '') + ' QKV', row.joint))], [ce('p', 'h0', 'given'), ce('p', 'h1', 'given'), ce('h0', 'o0', 'project'), ce('h1', 'o1', 'project')], `Provided; $[W_q|W_k|W_v]$: $A=(${pp.Wq}|${pp.Wk}|${pp.Wv}),B=(${pp.secondWq}|${pp.secondWk}|${pp.secondWv})$. Keep K/V; no layer update.`);
const packedSlices = { kind: 'transformation', title: 'Slice one joint output into named ranges', before: { label: 'Joint ' + pk.active.position, items: [ti('Q | K | V', pk.active.joint)] }, after: { label: 'Same channel values', items: [ti('Q', pk.active.queries), ti('K', pk.active.keys), ti('V', pk.active.values)] }, operation: 'Slice ' + packedRangeLabels, links: [{ from: 0, to: 0 }, { from: 0, to: 1 }, { from: 0, to: 2 }], caption: 'Half-open ranges preserve exact joint-output values. Each named toy vector has the same width; slicing is not a score operation.' };
const dotView = (row, overview = false) => ({ kind: 'transformation', title: overview ? 'Raw matches come from displayed operands' : 'Multiply matching components, then sum',
  before: { label: 'Independent operands', items: [ti('q', row.query), ti('Keys A,B', row.keys)] }, after: { label: 'Unnormalized matches', items: [...(overview ? [] : [ti('Products by key', row.terms)]), ti('Raw sums', row.scores)] }, operation: '$T_{ji}=q_iK_{ji},s_j=\\sum_iT_{ji}$',
  links: overview ? [{ from: 0, to: 0 }, { from: 1, to: 0 }] : [{ from: 0, to: 0, label: 'terms' }, { from: 1, to: 0, label: 'terms' }, { from: 0, to: 1, label: 'sum' }, { from: 1, to: 1, label: 'sum' }],
  caption: 'Unscaled raw dot products, before any normalization. Each key keeps its own product row and scalar sum.' });
const dotProbe = dotView(m.scaledQuery); dotProbe.caption = `Only query changes: $q'=${cp.matching.queryScale}q$, fixed keys. Thus $s'=${cp.matching.queryScale}s$ before normalization; order is preserved.`;
const aq = c07.allQuery, ap = cp.allQuery;
const allStack = (row, overview = false) => ({ kind: 'block-stack', title: overview ? 'Normalize each query row independently' : 'All query rows produce aligned output vectors', blocks: [tb('scores', 'Scores: query rows / key columns', row.display.scores), tb('weights', 'Softmax separately within each query row', row.display.weights), ...(overview ? [] : [tb('output', 'AV output: same query-row order', row.display.outputs)])],
  caption: `Toy $Q=(${ap.queries.flat()})^T,K=(${ap.keys.flat()})^T,V=((${ap.values[0]}),(${ap.values[1]}))$; $S=QK^T/\\sqrt{${aq.headWidth}}$, $A=softmax_{row}(S)$, $O=AV$.` });
const allProbe = allStack(aq.probe); allProbe.caption = `Fixed V; add row constants $(${ap.rowOffsets})$: $S'_{ij}=S_{ij}+b_i$. Row softmax and outputs stay unchanged; no whole-model claim.`;
const c07Designs = [
  ['ml-attention-additive-attention', ['additive projection branches', 'unlike width matching'], 'Show unlike-width independent additive projection branches and masked padding; not a dimension table, dot scaling only or serial q-to-k projection.', { overview: { spec: doc(additiveOverview) }, standard: { spec: doc(additiveStandard), detailSpec: doc(additiveWeights) }, deep: { spec: doc(additiveDeep), detailSpec: doc(additiveProbe) } }],
  ['ml-attention-query-key-value-roles', ['matching retrieved content', 'paired value retrieval'], 'Separate matching keys from paired value retrieval; unscaled generic toy, not projection-only, weights-only or a full scaled Transformer operator.', { overview: { spec: doc(roleGraph(m.base, true)) }, standard: { spec: doc(roleGraph(m.base)), detailSpec: doc(weightedGraph(m.base)) }, deep: { spec: doc(roleProbe), detailSpec: doc(weightedGraph(m.valueProbe)) } }],
  ['ml-attention-connectivity-and-path-length', ['position communication hops', 'local global hops'], 'Compare computed local, recurrent and global communication hops from explicit adjacency; not descriptive summaries or a finite backward RNN path.', { overview: { spec: doc(hopOverview), detailSpec: doc(adjacency(0, 'Local neighbors and the selected path')) }, standard: { spec: doc(hopStandard), detailSpec: doc(adjacency(1, 'Forward recurrent handoffs and the path')) }, deep: { spec: doc(hopDeep), detailSpec: doc(adjacency(2, 'Global attention has a direct path')) } }],
  ['ml-attention-causal-mask-and-weights', ['masked row normalization', 'interior causal query'], 'Show logits blocked before softmax and zero future contribution for an interior causal query; not permission icons or post-softmax-only masking.', { overview: { spec: doc(causalOverview) }, standard: { spec: doc(causalScores), detailSpec: doc(causalWeights) }, deep: { spec: doc(causalProbe), detailSpec: doc(causalOutput) } }],
  ['ml-attention-packed-query-key-value-projections', ['packed projection identity', 'joint slice boundaries'], 'Show numeric separate, batched and joint toy QKV projection identity with explicit row/layer/slices; not real GPT-2 sizes, time caching or computed layer transitions.', { overview: { spec: doc(packedOverview) }, standard: { spec: doc(packedStandard), detailSpec: doc(singleProjection) }, deep: { spec: doc(packedDeep), detailSpec: doc(packedSlices) } }],
  ['ml-attention-query-key-dot-products', ['component match products', 'unnormalized key sums'], 'Show raw component match products and sums from operands; not scaled scores, normalized shares or the old C02 normalization route.', { overview: { spec: doc(dotView(m.base, true)) }, standard: { spec: doc(dotView(m.base)) }, deep: { spec: doc(dotProbe) } }],
  ['ml-attention-weighted-vector-pooling', ['value contribution products', 'coordinate weighted pooling'], 'Show unscaled generic toy coefficient/value products and coordinate sums; not uniform-mean-only, missing products, or lost pair order.', { overview: { spec: doc(weightedGraph(m.base, true)) }, standard: { spec: doc(weightedGraph(m.base)) }, deep: { spec: doc(weightedProbe) } }],
  ['ml-attention-all-query-attention', ['query row normalization', 'position aligned outputs'], 'Show all-query score, row-weight and output arithmetic with aligned shapes; not weights-only, column normalization or differently rounded output inputs.', { overview: { spec: doc(allStack(aq.base, true)) }, standard: { spec: doc(allStack(aq.base)) }, deep: { spec: doc(allProbe) } }],
];
const c07References = c07Designs.map(([id, keywords, useWhen, depths]) => {
  const row = c07Manifest.references.find(entry => entry.referenceId === id), paraphrases = [
    `Explain ${keywords[0]} using the displayed toy operands.`, `Show ${keywords[1]} without changing the example.`, `Recompute the implicit probe for ${keywords[0]}.`, `Keep row and position identities clear in ${keywords[1]}.`, `Trace the actual mechanism for ${keywords[0]}.`,
  ];
  return { id, topic: row.topic, lessons: row.lessons, sources: [row.source, ...row.alsoCovers].map(source => ({ kind: 'figure-brief', path: source.brief, revision: c07Manifest.sourceRevision })), prompts: [...new Set([row.source, ...row.alsoCovers].map(source => source.summary)), ...paraphrases], paraphrases, keywords, useWhen, ...depths.standard, depths };
});
export const references = Object.freeze([...c02References, ...c07References]);
export { c07Derived as compositionDerived };
