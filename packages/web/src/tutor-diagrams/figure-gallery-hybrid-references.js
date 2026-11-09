import { compression, embeddings, history, keyValue, localMix } from './figure-gallery-hybrid-data.js';

const spec = diagram => ({ version: 1, diagram });
const diagram = value => ({ spec: spec(value) });
const pair = (value, detail) => ({ spec: spec(value), detailSpec: spec(detail) });
const brief = depth => depth === 'overview';
const detailed = depth => depth === 'deep';
const ref = (id, prompt, paraphrase, keywords, useWhen, make) => ({
  id: 'figure-gallery-' + id, lessons: [], prompts: [prompt], paraphrases: [paraphrase], keywords, useWhen,
  ...make('standard'), depths: { overview: make('overview'), deep: make('deep') },
});
const stack = (title, caption, blocks) => ({ kind: 'block-stack', title, caption, blocks });
const table = (title, caption, columns, rows, emphasis) => ({
  kind: 'matrix', layout: 'teaching', title, caption, columns,
  rows: rows.map(([heading, ...cells], i) => ({ id: 'r' + i, heading, cells: cells.map(String) })),
  ...(emphasis ? { emphasis } : {}),
});
const entries = row => row.join(', ');

const shortConvolution = ref('convolution-before-recurrent-state',
  'Why run a short convolution on queries, keys, and values before a recurrent state update?',
  'How do nearby tokens enter the recurrent mixer through a short causal convolution?',
  ['short convolution on queries keys and values before a recurrent state update',
    'nearby tokens enter the recurrent mixer through a short causal convolution'],
  'Show short causal convolution inside one recurrent mixer, before updating its state. Use scalar projected streams and an illustrative gated write.',
  depth => {
    const architecture = stack(brief(depth) ? 'Mix nearby words before saving a summary' : 'Local filtering before the recurrent state write',
      detailed(depth) ? 'The toy update uses $s_t=0.5s_{t-1}+k_t^{\\prime}v_t^{\\prime}$, then reads $q_t^{\\prime}s_t$.' :
        'Each projection mixes a short window before the state changes. Older context can still enter through the previous state.',
      [
        { id: 'project', label: brief(depth) ? 'Current word features' : 'Query, key and value projections', role: 'embedding' },
        { id: 'filter', label: brief(depth) ? 'Nearby-word filter' : 'Short causal convolution', role: 'changed', inputs: [{ label: 'Previous projections' }] },
        { id: 'state', label: brief(depth) ? 'Updated summary' : 'Gated recurrent state write', role: 'attention', inputs: [{ label: 'Previous state' }] },
        { id: 'read', label: brief(depth) ? 'Read the updated summary' : 'Query readout', role: 'output' },
      ]);
    if (brief(depth)) return diagram(architecture);
    const last = localMix.at(-1);
    return pair(architecture, table('One window before the update',
      detailed(depth) ? 'Use one-quarter of the previous entry and three-quarters of the current one. The state becomes $' + last.updated + '$.' :
        'Each stream uses the same two-tap rule. The filtered key and value feed the write.',
      ['Previous', 'Current', 'Filtered'],
      ['Query', 'Key', 'Value'].map((label, index) => [label, last.previous[index], last.current[index], last.filtered[index]]),
      { columns: [2] }));
  });

const hybridMemory = ref('hybrid-state-and-cache-growth',
  'What grows during decoding in a hybrid model with recurrent state and an attention cache?',
  'Does carried state grow with token history like an attention cache does?',
  ['grows during decoding in a hybrid model with recurrent state', 'carried state grow with token history like an attention cache'],
  'Compare a fixed-width recurrent state to a cache of token codes at successive decode steps. Keep the mixer schedule independent of dense or routed token updates.',
  depth => {
    const rows = history.map(({ token, state }, i) => [
      'After ' + token, brief(depth) ? 'Two saved numbers' : entries(state),
      brief(depth) ? (i === 0 ? 'One saved row' : i === 1 ? 'Two saved rows' : 'Three saved rows') : entries(history.slice(0, i + 1).map(item => item.code)),
    ]);
    const memory = table(brief(depth) ? 'A summary stays the same size' : 'Carried state and cached history during decoding',
      detailed(depth) ? 'Use $s_t=0.5s_{t-1}+x_t$. This toy global cache appends one compact code per token.' :
        'The state is replaced in place. The attention layer keeps one new entry for each token.',
      [brief(depth) ? 'Running summary' : 'State vector', brief(depth) ? 'Word history' : 'Cached token codes'], rows);
    if (brief(depth)) return diagram(memory);
    return pair(memory, table('The same mixer schedule supports two update rules',
      'Both stacks carry state on most layers. Changing the per-token network leaves this mixer schedule intact.',
      ['History mixer', 'Dense stack', 'Expert stack'],
      [['Layer A', 'State update', 'Dense', 'Routed'],
        ['Layer B', 'State update', 'Dense', 'Routed'],
        ['Layer C', 'Full prefix', 'Dense', 'Routed'],
        ['Layer D', 'State update', 'Dense', 'Routed']], { rows: ['r2'] }));
  });

const sharedProjection = ref('global-tied-key-value-projection',
  'How can a global attention layer share the key and value projection while local layers keep them separate?',
  'If keys and values share one projection, where does rotary position encoding go?',
  ['global attention layer share the key and value projection', 'keys and values share one projection where does rotary position encoding go'],
  'Use a single global projection feeding both roles, separate local projections, and a position rotation on key coordinates only. The worked 90-degree turn is illustrative.',
  depth => {
    if (brief(depth)) return diagram(table('One map for two roles',
      'In the shared layer the same result supplies keys and values. Only the key receives the position adjustment.',
      ['Wide view', 'Nearby view'],
      [['Key source', 'One shared map', 'Separate key map'], ['Value source', 'Same shared map', 'Separate value map'],
        ['Position change', 'Adjust key only', 'Adjust key only']]));
    return diagram(table('Shared projection in the global layer',
      detailed(depth) ? 'For this position, the key uses $[a,b,c]\\mapsto[-b,a,c]$. All value entries stay unchanged.' :
        'The wide layer starts keys and values from the same projected row. The local layer has two independent maps.',
      ['Global layer', 'Local layer'],
      [['Input row', entries(keyValue.hidden), entries(keyValue.hidden)],
        ['Key before rotation', entries(keyValue.shared), entries(keyValue.localKey)],
        ['Value after projection', entries(keyValue.shared), entries(keyValue.localValue)],
        ['Key after rotation', entries(keyValue.globalRotated), entries(keyValue.localRotated)]], { rows: ['r3'] }));
  });

const layerEmbedding = ref('layer-specific-token-lookup',
  'What do layer-specific token embeddings add to a decoder’s hidden stream?',
  'Can each layer look up a different small row for the same token?',
  ['layer specific token embeddings add to a decoder', 'each layer look up a different small row'],
  'Give two layers their own lookup for the same token ID. Project both small rows into the stream width. Hold the main computation fixed to isolate the additions.',
  depth => {
    const local = stack(brief(depth) ? 'The same word gets a fresh hint at each layer' : 'Small token lookups at separate depths',
      detailed(depth) ? 'Both layers look up the token ID for plum. Each projects its own row to the stream width before adding it.' :
        'A lookup supplies a different hint at each layer. The main stream keeps its width.',
      [
        { id: 'input', label: 'Main token stream', role: 'embedding', ...(brief(depth) ? {} : { dims: '4 entries' }) },
        { id: 'a', label: 'First layer', role: 'changed', merge: 'add', inputs: [{ label: embeddings.word + ' lookup for layer A' }] },
        { id: 'b', label: 'Second layer', role: 'changed', merge: 'add', inputs: [{ label: embeddings.word + ' lookup for layer B' }] },
        { id: 'out', label: 'Updated token stream', role: 'output', ...(brief(depth) ? {} : { dims: '4 entries' }) },
      ]);
    if (brief(depth)) return diagram(local);
    const detail = table('One token ID, two lookup rows',
      detailed(depth) ? 'Start with $[' + embeddings.before.join(',') + ']$' + '. Hold other layer computation fixed to isolate the two additions.' :
        'The row depends on the layer as well as the token ID. Each projected addition fits the unchanged stream width.',
      ['Small lookup', 'Added row', 'New stream'],
      [['First layer', entries(embeddings.firstRow), entries(embeddings.deltaA), entries(embeddings.afterA)],
        ['Second layer', entries(embeddings.secondRow), entries(embeddings.deltaB), entries(embeddings.afterB)]]);
    return pair(local, detail);
  });

const compressedHistory = ref('fine-and-coarse-history-compression',
  'Why use both fine-grained and coarse compressed history in a decoder?',
  'How do selected short history summaries differ from reading all coarse groups?',
  ['both fine grained and coarse compressed history', 'selected short history summaries differ from reading all coarse groups'],
  'Show recent-only attention in the opening. Compare a later shortlist over small compressed groups with a later read over all larger groups. Keep a separate uncompressed recent window.',
  depth => {
    const architecture = stack(brief(depth) ? 'Read recent words and older summaries' : 'Recent-window attention and two compressed history reads',
      'The opening reads recent tokens. Later layers keep that window and add either selected short summaries or all broader summaries.',
      [
        { id: 'recent', label: brief(depth) ? 'Recent words only' : 'Local-only attention', role: 'attention' },
        { id: 'fine', label: brief(depth) ? 'Select smaller summaries' : 'Recent window with selected fine groups', role: 'changed' },
        { id: 'coarse', label: brief(depth) ? 'Read every broader summary' : 'Recent window with all coarse groups', role: 'changed' },
      ]);
    if (brief(depth)) return diagram(architecture);
    const span = ({ from, to }) => from + ' to ' + to;
    return pair(architecture, table('Two compressed reads share the recent window',
      detailed(depth) ? 'Toy group means stand in for learned summaries. The fine path reads the mean closest to query ' + compression.query + '.' :
        'The fine path reads one short group. The coarse path reads both broader groups. Both still read the two recent entries.',
      ['Slots', 'Stored value', 'Use'],
      [...compression.fine.map((entry, i) => ['Fine group ' + (i + 1), span(entry), entry.mean,
        entry === compression.nearest ? 'Read' : 'Skip']),
        ...compression.coarse.map((entry, i) => ['Coarse group ' + (i + 1), span(entry), entry.mean, 'Read']),
        ['Recent window', '7 to 8', entries(compression.recent), 'Read raw']], { rows: ['r2', 'r5'] }));
  });

export const galleryHybridReferences = [shortConvolution, hybridMemory, sharedProjection, layerEmbedding, compressedHistory];
