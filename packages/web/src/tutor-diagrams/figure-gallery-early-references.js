import {
  attentionCandidates, attentionSchedule, expertPoolSizes, fixedPositionRows, latentWidth, learnedPositionRows,
  memoryDecay, memoryWrite, mixerSchedule, nextMemory, outerWidth, positionedRow, positionRow, priorMemory,
  keyValueGroupCount, queryGroups, queryHeadCount, queryKeyScores, routedExperts, routedUpdate, sharedBlockIds,
  sharedPasses, sharedUpdate, tokenRow, totalExpertUpdate, tyingHiddenRow, tyingTokenRow, tyingTokenScore,
} from './figure-gallery-early-data.js';

const spec = diagram => ({ version: 1, diagram });
const matrix = (title, columns, rows, caption, emphasizedRows = []) => spec({
  kind: 'matrix', layout: 'teaching', title, columns,
  rows: rows.map(([heading, ...cells], index) => ({ id: 'r' + (index + 1), heading, cells })),
  caption,
  ...(emphasizedRows.length ? { emphasis: { rows: emphasizedRows.map(i => 'r' + i) } } : {}),
});

function reference(id, [prompt, ...paraphrases], keywords, useWhen, makeSpec, makeDetail) {
  return {
    id, lessons: [], prompts: [prompt], paraphrases, keywords, useWhen,
    spec: makeSpec('standard'),
    depths: {
      overview: { spec: makeSpec('overview') },
      deep: { spec: makeSpec('deep'), ...(makeDetail ? { detailSpec: makeDetail() } : {}) },
    },
  };
}

function positionedDecoder(depth) {
  const brief = depth === 'overview';
  const deep = depth === 'deep';
  const row = (name, values, role) => ({ tensor: {
    name, rows: 1, columns: 2, dimensions: '1 × 2', values, role,
  } });
  return spec({
    kind: 'transformation', title: 'A word and its position get separate rows',
    before: { label: 'Two table lookups', items: brief ? ['Word row', 'Position row'] : [
      row('Token', tokenRow, 'input'), row('Position', positionRow, 'input'),
    ] },
    operation: 'Add the matching entries',
    after: { label: 'Input to the decoder', items: brief ? ['One row per word'] : [row('Combined', positionedRow, 'output')] },
    caption: deep
      ? '$x_i=e_i+p_i$. The learned row $p_i$ depends on the absolute position. The sum enters the causal decoder.'
      : 'The same word in a different position adds a different learned row.',
  });
}

function denseDecoderDetail() {
  return spec({
    kind: 'block-stack', title: 'After the embedding sum',
    blocks: [
      { id: 'start', label: 'Combined input', role: 'embedding' },
      { id: 'a', label: 'Attention input normalization', role: 'norm' },
      { id: 'mix', label: 'Causal multi-head attention', role: 'attention' },
      { id: 'f', label: 'Feed-forward input normalization', role: 'norm' },
      { id: 'ff', label: 'Dense feed-forward', role: 'feedforward' },
      { id: 'scores', label: 'Next-token scores', role: 'output' },
    ],
    edges: [{ kind: 'residual', from: 'a', to: 'mix' }, { kind: 'residual', from: 'f', to: 'ff' }],
    caption: 'Each attention head has its own projections. The dense layer applies the same network to each token.',
  });
}

function normalizationPlacement(depth) {
  const brief = depth === 'overview';
  const deep = depth === 'deep';
  return matrix('Two places to normalize a residual branch', ['Before the mixer', 'After the mixer'], [
    ['Into branch', brief ? 'Scaled token state' : 'Normalized token state', 'Original token state'],
    ['Out of branch', 'Mixer result', brief ? 'Scaled mixer result' : 'Normalized mixer result'],
    ['Residual input', 'Original token state', 'Original token state'],
  ], deep
    ? 'Pre-norm adds $x+f(N(x))$. Inside-branch post-norm adds $x+N(f(x))$. Both keep the original shortcut.'
    : 'The shortcut carries the same original state. The change is where scaling happens inside the branch.', [1, 2]);
}

function latentExpertFlow(depth) {
  const brief = depth === 'overview';
  return spec({
    kind: 'flow', title: 'Compact attention memory, separate expert routes',
    nodes: [
      { id: 'c', label: brief ? 'Store a smaller history record' : 'Cache a latent for each token', role: 'process' },
      { id: 'a', label: brief ? 'Read the compact history' : 'Compute attention from latents', role: 'process' },
      { id: 'r', label: 'Split the token update', role: 'fork' },
      { id: 'e', label: 'Run selected experts', role: 'process' },
      { id: 's', label: 'Run the always-on expert', role: 'process' },
      { id: 'o', label: 'Add the expert outputs', role: 'merge' },
      { id: 'n', label: 'Return the updated token', role: 'outcome' },
    ],
    edges: [['c', 'a'], ['a', 'r'], ['r', 'e'], ['r', 's'], ['e', 'o'], ['s', 'o'], ['o', 'n']].map(([from, to]) => ({ from, to })),
    caption: depth === 'deep'
      ? 'Cache $c_t=W_Dh_t$ for attention. Weight the selected expert outputs and add the always-on expert output.'
      : 'Compressing history changes attention memory. Every token uses the shared expert. The other experts depend on the token.',
  });
}

function independentSchedules(depth) {
  return matrix('Attention reach and token updates', ['Tokens visible', 'Token update'],
    attentionSchedule.map(([label, reach, update]) => [
      label, depth === 'overview' ? (reach === 'Current chunk' ? 'Nearby group' : 'All words so far') : reach,
      depth === 'overview' && update === 'Dense' ? 'One network'
        : depth === 'overview' ? 'Selected networks' : update,
    ]),
    depth === 'deep' ? 'The reach rule determines which keys enter the score for $q_t$. Expert choice determines the feed-forward update.'
      : 'Holding the visible token set fixed does not require the same token-update rule.', [1, 2]);
}

function hybridMixers(depth) {
  return matrix('Attention interleaved with carried state', ['Mixer', 'What it reads'], mixerSchedule.map(
    ([label, mixer, memory]) => depth === 'overview'
      ? (mixer === 'Attention' ? [label, 'Look back', 'Earlier words'] : [label, 'Update the summary', 'Saved summary'])
      : [label, mixer, memory],
  ), depth === 'deep' ? 'A state layer advances $s_{t+1}=F(s_t,x_t)$. The attention layer reads token entries in the prefix.'
    : 'Most layers here carry forward a compact state. The attention layer can look back at stored token entries.', [3]);
}

function sparsePrefilter(depth) {
  const brief = depth === 'overview';
  const deep = depth === 'deep';
  return matrix('Shortlist tokens before computing attention',
    ['Filter score', ...(deep ? ['Logit'] : []), brief ? 'Attention share' : 'Weight'],
    attentionCandidates.map(({ name, score, logit, weight }) => [
      name, String(score), ...(deep ? [logit == null ? 'Skipped' : String(logit)] : []),
      weight == null ? 'Skipped' : brief ? Math.round(weight * 100) + '%' : weight.toFixed(3),
    ]),
    deep ? 'Filter by the index score, then compute softmax on the retained logits only. The two weights sum to $1$.'
      : 'Use the cheap score to choose which entries to read. Attention assigns weights only to the entries read.', [1, 3]);
}

function groupedHeads(depth) {
  const brief = depth === 'overview';
  return spec({
    kind: 'flow',
    title: brief ? 'Readers can share the same memory' : 'Grouped-query attention shares key and value heads',
    nodes: [step('tokens', 'Read earlier token states', 'fork'), ...queryGroups.flatMap((queries, index) => [
      step('kv' + index, brief ? 'Fill memory ' + (index + 1) : 'Project K/V group ' + (index + 1), 'fork'),
      ...queries.map(query => step('q' + query, brief ? 'Feed reader ' + query : 'Feed query head ' + query, 'outcome')),
    ])],
    edges: edges(queryGroups.flatMap((queries, index) => [
      ['tokens', 'kv' + index], ...queries.map(query => ['kv' + index, 'q' + query]),
    ])),
    caption: depth === 'deep'
      ? 'There are $h_q=' + queryHeadCount + '$ independent query projections and $h_{kv}=' + keyValueGroupCount + '$ cached key/value pairs.'
      : 'Readers get separate queries. Each pair reads the same stored keys and values.',
  });
}

function headSharingCounts(depth) {
  const brief = depth === 'overview';
  const variants = brief ? ['Separate memory', 'Shared in groups', 'One shared memory']
    : ['Multi-head', 'Grouped-query', 'Multi-query'];
  return matrix('Three levels of attention head sharing', [brief ? 'Readers' : 'Query heads', brief ? 'Memory groups' : 'Key/value groups'],
    [queryHeadCount, keyValueGroupCount, 1].map((count, index) => [variants[index], String(queryHeadCount), String(count)]),
    depth === 'deep'
      ? 'Holding head width and prefix length fixed, cache size is proportional to $h_{kv}$. Each query keeps its own projection.'
      : 'Each row keeps the same number of readers. Sharing lets more readers reuse a stored record.', [2, 3]);
}

function normalizedScores(depth) {
  const brief = depth === 'overview';
  return matrix('Rescaling queries and keys can change the ranking', [brief ? 'Original score' : 'Raw dot product', brief ? 'Rescaled score' : 'RMS-scaled score'],
    queryKeyScores.map(({ raw, normalized }, index) => [
      'Key ' + ['A', 'B'][index], String(raw), String(normalized),
    ]), depth === 'deep'
      ? String.raw`Use $q=[2,0]$, $k_A=[3,4]$ and $k_B=[1,0]$. Divide $q^\top k$ by both RMS values. Learned gain and scale omitted.`
      : 'The stronger original score came from the larger key. After rescaling, the better-aligned key gets the higher score.', [2]);
}

function expertBranchComparison(depth) {
  const brief = depth === 'overview';
  return matrix('Experts available and experts used', ['Small pool', 'Large pool', 'Plus shared'], [
    [brief ? 'Available specialists' : 'Routed experts in pool', ...expertPoolSizes.map(String)],
    [brief ? 'Used for this word' : 'Chosen for this token', ...expertPoolSizes.map(() => String(routedExperts.length))],
    ['Shared update', 'Absent', 'Absent', brief ? 'Runs every time' : sharedUpdate.toFixed(2)],
    ['Combined update', ...[routedUpdate, routedUpdate, totalExpertUpdate].map(value => value.toFixed(2))],
  ], depth === 'deep'
    ? 'Two routes give $0.75(0.6)+0.25(0.2)=0.50$. The shared branch adds $0.30$ every time.'
    : 'The larger pool still uses two choices per token. A shared expert runs for every token.', [2, 3]);
}

function selectivePosition(depth) {
  const brief = depth === 'overview';
  return matrix('Position rules can differ by layer', [brief ? 'Position hint' : 'Position transform', 'Words visible'], [
    ['First layer', brief ? 'Used' : 'Rotate queries and keys', 'Current and earlier words'],
    ['Next layer', brief ? 'Unchanged' : 'No added rotation', 'Current and earlier words'],
  ], depth === 'deep'
    ? 'The rotated case compares $R_i q_i$ with $R_j k_j$. Both layers still mask positions after the current word.'
    : 'Skipping the position transform in a layer keeps its word visibility rule intact.', [2]);
}

function fixedAndLearnedPosition(depth) {
  const brief = depth === 'overview';
  return matrix('Two ways to choose a position row', ['Fixed rule', 'Learned table'], fixedPositionRows.map(
    (row, index) => ['Index ' + index, row.join(', '), learnedPositionRows[index].join(', ')],
  ), depth === 'deep'
    ? String.raw`Fixed values are $[\sin(p),\cos(p)]$ for $p=0,1,2$. Learned values here are an illustrative table.`
    : brief ? 'One row is worked out from the position. The other row is learned during practice.'
      : 'Both methods add an absolute position row to a token. Only the learned table is fitted during training.', [2]);
}

const step = (id, label, role = 'process') => ({ id, label, role });
const edges = pairs => pairs.map(([from, to]) => ({ from, to }));

function parallelSublayers(depth) {
  const brief = depth === 'overview';
  return spec({
    kind: 'flow', title: 'Parallel sublayers read the same input',
    nodes: [
      step('x', 'Read the token state', 'fork'),
      step('n', brief ? 'Scale and split' : 'Normalize and split', 'fork'),
      step('a', 'Mix information across words'),
      step('f', 'Update each word independently'),
      step('s', 'Keep the original state'),
      step('j', 'Add both updates to the original', 'merge'),
      step('o', 'Pass the sum onward', 'outcome'),
    ],
    edges: edges([['x', 'n'], ['x', 's'], ['n', 'a'], ['n', 'f'], ['a', 'j'], ['f', 'j'], ['s', 'j'], ['j', 'o']]),
    caption: depth === 'deep'
      ? 'Both updates read $N(x)$, so $y=x+A(N(x))+F(N(x))$. In a serial block, the second reads the updated state.'
      : 'Here both updates read the same rescaled state. In a serial block, the second reads the attention result plus the shortcut.',
  });
}

function compressedExperts(depth) {
  const brief = depth === 'overview';
  const deep = depth === 'deep';
  return spec({
    kind: 'flow', title: 'Only selected experts use the smaller state',
    nodes: [
      step('x', 'Read the full state', 'fork'),
      step('r', 'Choose experts from the full state'),
      step('z', brief ? 'Make a smaller copy' : deep ? 'Project to width ' + latentWidth : 'Project to a smaller state'),
      step('e', 'Run the selected experts'),
      step('up', brief ? 'Return to the original size' : deep ? 'Restore width ' + outerWidth : 'Project the routed sum back'),
      step('s', 'Run the shared expert at full size'),
      step('j', 'Add the two results', 'merge'),
      step('o', 'Return the update', 'outcome'),
    ],
    edges: edges([['x', 'r'], ['r', 'z'], ['z', 'e'], ['e', 'up'], ['x', 's'], ['up', 'j'], ['s', 'j'], ['j', 'o']]),
    caption: deep
      ? 'The router and shared expert read the original vector. Only the chosen experts work in the smaller space.'
      : 'The shared branch works at the original size throughout. The other branch works on the smaller copy.',
  });
}

function recurrentMemory(depth) {
  const brief = depth === 'overview';
  const tensor = (name, values) => ({ tensor: { name, rows: 2, columns: 2, dimensions: '2 × 2', values } });
  return spec({
    kind: 'transformation', title: brief ? 'Each word updates one running memory' : 'A recurrent decoder carries a matrix memory',
    before: { label: 'Memory and input', items: brief ? ['Old summary', 'New word update'] : [
      tensor('Prior memory', priorMemory), tensor('Token write', memoryWrite),
    ] },
    operation: brief ? 'Keep part of the old summary and add the update' : 'Halve old memory and add the token write',
    after: { label: 'Next memory', items: brief ? ['Updated summary'] : [tensor('Updated', nextMemory)] },
    caption: depth === 'deep'
      ? String.raw`This toy write uses $M_t=${memoryDecay}M_{t-1}+v_tk_t^\top$. Its stored matrix size stays fixed as the prefix grows.`
      : 'Carry the updated memory to the next word. One matrix holds the running history.',
  });
}

function tiedInputOutput(depth) {
  const brief = depth === 'overview';
  return matrix('One word table can do two jobs', [brief ? 'One shared table' : 'Tied weights', brief ? 'Two tables' : 'Untied weights'], [
    ['Read a word', 'Use the input row', 'Use the input row'],
    ['Score a word', 'Reuse that row', 'Use a different row'],
    ['Tables to train', 'One', 'Two'],
  ], depth === 'deep'
    ? 'With tied weights, $h=[' + tyingHiddenRow.join(',') + ']$ scores row $[' + tyingTokenRow.join(',') + ']$ at $' + tyingTokenScore + '$ by dot product.'
    : 'Input reads a word’s row. Output compares the current state to that same row when weights are tied.', [2, 3]);
}

function repeatedWeights(depth) {
  const brief = depth === 'overview';
  return matrix('The same decoder blocks can run again', [brief ? 'Blocks used' : 'Block parameters', 'Candidate output'],
    sharedPasses.map(pass => ['Pass ' + pass, 'Same ' + sharedBlockIds.join(' and '), 'Candidate ' + pass]),
    depth === 'deep'
      ? String.raw`$${sharedPasses.length}\times${sharedBlockIds.length}=${sharedPasses.length * sharedBlockIds.length}$ applications reuse two learned blocks. Here the gate chooses among completed passes.`
      : 'Each pass starts from the previous result. The system can choose among the candidate outputs after all passes finish.');
}

export const figureGalleryEarlyReferences = [
  reference('figure-gpt2-learned-position-decoder', [
    'How does GPT-2 add a learned position to each token?',
    'Where do learned absolute positions go in the GPT-2 decoder?',
    'Why do GPT-2 learned positions change the same word’s input?',
  ], ['gpt 2 learned positions', 'gpt 2 learned position', 'learned absolute positions', 'learned absolute position table'],
  'Use a position table row plus a token table row. Detailed can follow with the dense causal decoder. Keep the displayed values illustrative.', positionedDecoder, denseDecoderDetail),
  reference('figure-fixed-vs-learned-positions', [
    'What is the difference between fixed and learned position embeddings?',
    'How do fixed sinusoidal and learned position rows differ?',
    'Does a learned position table differ from a fixed sinusoidal position rule?',
  ], ['fixed and learned position embeddings', 'fixed sinusoidal and learned position', 'learned position table differ from a fixed sinusoidal'],
  'Compare the same absolute positions. One row follows a fixed sinusoidal rule. The other comes from an illustrative trainable table.', fixedAndLearnedPosition),
  reference('figure-grouped-query-heads', [
    'How do query heads share keys and values in grouped-query attention?',
    'Why do more query heads than key value heads still work in GQA?',
    'Can I see the key value groups that queries read in GQA?',
  ], ['query heads share keys and values', 'more query heads than key value heads', 'key value groups that queries read'],
  'Use four independent queries reading two stored key/value groups. Separate query projections from shared cached projections.', groupedHeads),
  reference('figure-attention-head-sharing-counts', [
    'How does key value head count differ in multi-head, grouped-query and multi-query attention?',
    'What is the difference between one shared key value head and grouped heads?',
    'When do all query heads share one key value group?',
  ], ['key value head count differ in multi head', 'one shared key value head and grouped heads', 'all query heads share one key value group'],
  'Hold the query head count fixed while comparing separate, grouped and fully shared key/value projections.', headSharingCounts),
  reference('figure-olmo-residual-norm-placement', [
    'Where does OLMo put normalization inside the residual branch?',
    'What changes if I normalize the sublayer result before adding the shortcut?',
    'How does inside-branch post-norm differ from pre-norm?',
  ], ['olmo residual normalization', 'olmo post norm', 'inside branch post norm', 'inside residual post norm', 'normalize the sublayer result'],
  'Contrast normalization of the sublayer input with normalization of its output before residual addition. Keep the skip input unchanged in both.', normalizationPlacement),
  reference('figure-deepseek-latent-cache-experts', [
    'How do latent attention and shared experts fit together in DeepSeek?',
    'What is the difference between the latent cache and expert routing in DeepSeek?',
    'Does DeepSeek V3 compress its experts when it compresses attention memory?',
  ], ['deepseek latent cache and experts', 'latent attention and shared experts', 'latent cache and expert routing', 'deepseek v3 compress its experts'],
  'Show compact cached attention state and token-wise expert routing as separate mechanisms. Include one always-on shared branch.', latentExpertFlow),
  reference('figure-decoder-independent-schedules', [
    'How can a decoder change attention reach without changing its expert routing?',
    'Can a chunked attention layer still use either a dense network or experts?',
    'Do chunked attention and expert layers have to follow the same schedule?',
  ], ['chunked attention and expert', 'attention reach and expert routing', 'chunked attention layer still use either', 'independent attention and expert schedules'],
  'Show attention reach and feed-forward routing in separate columns on the same layer order. The schedule is a teaching example.', independentSchedules),
  reference('figure-routed-vs-shared-experts', [
    'What changes when a routed expert layer adds a shared expert?',
    'How do routed-only and shared-expert updates differ for one token?',
    'Can the expert pool grow while the router still uses two experts?',
  ], ['routed expert layer adds a shared expert', 'routed only and shared expert', 'expert pool grow while the router'],
  'Distinguish the pool size, the router’s selection count and the branch that runs for every token. Use illustrative updates.', expertBranchComparison),
  reference('figure-query-key-score-normalization', [
    'What does query-key normalization do to the attention scores?',
    'Can normalizing queries and keys change which token has the highest score?',
    'Why rescale queries and keys before comparing attention scores?',
  ], ['query key normalization do to the attention scores', 'normalizing queries and keys change', 'rescale queries and keys before comparing'],
  'Compare two toy key dot products before and after RMS normalization. Keep the query and key directions fixed.', normalizedScores),
  reference('figure-selective-rotary-position', [
    'What changes when a decoder skips rotary position encoding in some layers?',
    'Can a layer skip position rotation and keep the same causal mask?',
    'Does no added rotation let a decoder look at future words?',
  ], ['skips rotary position encoding in some layers', 'skip position rotation and keep', 'no added rotation let a decoder'],
  'Keep the causal mask identical in both layers. Compare only the query/key rotation rule.', selectivePosition),
  reference('figure-decoder-hybrid-mixer-schedule', [
    'How does a hybrid decoder alternate state-space blocks and attention?',
    'Why does a hybrid decoder only use attention at some depths?',
    'What does each layer read in a decoder mixing recurrent state and attention?',
  ], ['hybrid decoder alternate state space', 'hybrid decoder only use attention', 'decoder mixing recurrent state and attention', 'hybrid mixer schedule'],
  'Show separately which layers update a carried state and which attend to cached token entries. Layer order is illustrative.', hybridMixers),
  reference('figure-deepseek-sparse-attention-shortlist', [
    'How does DeepSeek shortlist tokens before computing attention?',
    'Why does DeepSeek sparse attention filter token entries before softmax?',
    'What is the difference between the shortlist score and the actual attention weight?',
  ], ['deepseek shortlist tokens', 'deepseek sparse attention filter', 'shortlist score and the actual attention weight', 'shortlist before attention'],
  'Rank token candidates by a cheap index score. Compute full logits and normalize only the selected entries. Keep token selection separate from expert selection.', sparsePrefilter),
  reference('figure-latent-expert-widths', [
    'What is compressed inside a latent mixture of experts?',
    'Why do latent MoE specialists get a smaller vector than the shared expert?',
    'Does the shared expert run at full width in LatentMoE?',
  ], ['compressed inside a latent mixture of experts', 'latent moe specialists get a smaller vector', 'shared expert run at full width'],
  'Keep the router and the shared expert on the full input width. Only routed expert computation uses the reduced representation.', compressedExperts),
  reference('figure-tied-input-output-embeddings', [
    'How can the input embeddings and output layer use the same weights?',
    'What does tying the input and output word tables change?',
    'How do tied embeddings reuse the input rows to score words?',
  ], ['input embeddings and output layer use the same weights', 'tying the input and output word tables', 'tied embeddings reuse the input rows'],
  'Compare one vocabulary-by-width matrix reused at input and output with independent matrices of the same shape.', tiedInputOutput),
  reference('figure-parallel-residual-sublayers', [
    'How do parallel attention and feed-forward sublayers read the same input?',
    'How is a parallel residual block different from a serial decoder block?',
    'Does the feed-forward network wait for attention in a parallel transformer block?',
  ], ['parallel attention and feed forward sublayers', 'parallel residual block different from a serial', 'wait for attention in a parallel transformer'],
  'Keep a separate shortcut for the original state. Both learned branches read its normalized form, and their updates are added.', parallelSublayers),
  reference('figure-recurrent-decoder-matrix-memory', [
    'What does a recurrent language model put in matrix memory?',
    'How can matrix memory carry history without keeping one cache entry per token?',
    'How does xLSTM update its matrix memory as it reads another token?',
  ], ['recurrent language model put in matrix memory', 'matrix memory carry history', 'xlstm update its matrix memory'],
  'Show a toy gated rank-one write to a fixed-size matrix. Keep the example scalar gates illustrative and omit normalizers and numerical stabilizers.', recurrentMemory),
  reference('figure-decoder-reused-layer-weights', [
    'How does a decoder reuse the same layer weights on another pass?',
    'Do recurrent passes through the same decoder layers add new parameters?',
    'What is the difference between decoder block applications and unique learned blocks?',
  ], ['decoder reuse the same layer weights', 'recurrent passes through the same decoder layers', 'decoder block applications and unique learned blocks'],
  'Reuse the same learned blocks across passes. Distinguish the count of weight sets from the number of block applications and the eventual output choice.', repeatedWeights),
];
