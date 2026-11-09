import { galleryToy } from './gallery-architecture-expansion-data.js';

const spec = diagram => ({ version: 1, diagram });
const brief = depth => depth === 'overview';
const detailed = depth => depth === 'deep';
const math = expression => '$' + expression + '$';
const vector = values => '[' + values.join(',') + ']';
const width = (label, columns, role) => ({
  label, tensor: { rows: 1, columns, dimensions: '1 × ' + columns, role },
});
const edge = (from, to, label) => ({ from, to, ...(label ? { label } : {}) });
const step = (id, label, role = 'process') => ({ id, label, role });
const graph = (title, nodes, edges, caption) => ({
  kind: 'relationship', layout: 'graph', title, nodes: nodes.map(([id, label]) => ({ id, label })), edges, caption,
});
const stack = (title, blocks, caption) => ({ kind: 'block-stack', title, blocks, caption });
const { masks, schedule, future, streams, depth: depthRead, latent, core, share, sink, adapter, relativeConvolution } = galleryToy;

const ref = (name, [prompt, ...paraphrases], keywords, useWhen, diagramAt, detail) => ({
  id: 'figure-gallery-' + name, lessons: [], prompts: [prompt], paraphrases, keywords, useWhen,
  spec: spec(diagramAt('standard')),
  depths: {
    overview: { spec: spec(diagramAt('overview')) },
    deep: { spec: spec(diagramAt('deep')), ...(detail ? { detailSpec: spec(detail()) } : {}) },
  },
});

const maskGrid = (title, labels, cells, caption) => ({
  kind: 'heatmap', title, caption,
  columns: masks.positions.map(position => 'Position ' + position),
  rows: labels.map((label, i) => ({ label, cells: cells[i] })), range: { min: 0, max: 1 },
});

export const references = [
  ref('window-layer-schedule', [
    'Why do some decoders alternate sliding windows with global attention layers?',
    'How often does global attention run in a mostly sliding-window decoder?',
    'What does a periodic global layer add to nearby-only attention layers?',
  ], ['alternate sliding windows with global attention layers', 'global attention run in a mostly sliding window decoder',
    'periodic global layer add to nearby only attention'],
  'Show a layer schedule dominated by nearby attention, with occasional full causal reach. The second visual at Detailed compares the allowed keys at one query.',
  depth => stack(
    brief(depth) ? 'Mostly read nearby words' : 'Windowed layers with periodic global reach',
    schedule.localThenGlobal.map((mixer, i) => ({
      id: 'layer-' + i,
      label: mixer === 'local' ? (brief(depth) ? 'Recent words ' : 'Sliding window ') + (i + 1)
        : brief(depth) ? 'All earlier words' : 'Full causal attention',
      role: mixer === 'global' ? 'changed' : 'attention',
      ...(i === 0 ? { repeat: 2, repeatTo: 'layer-2' } : {}),
    })),
    detailed(depth) ? 'A window admits the current position and nearby earlier keys. A global layer admits the full causal prefix.' :
      'The wide layer can read earlier positions beyond the window.',
  ),
  () => maskGrid('Allowed keys at position six', ['Windowed layer', 'Global layer'], [masks.local, masks.global],
    'The toy window covers three positions including the current one. A global layer reads all available positions.')),

  ref('dense-to-expert-depth', [
    'Why do some expert decoders have a dense prefix before routed layers?',
    'What changes after the dense opening in a mixture-of-experts decoder?',
    'Where does expert routing start after the initial dense layers?',
  ], ['expert decoders have a dense prefix', 'dense opening in a mixture of experts decoder',
    'expert routing start after the initial dense layers'],
  'Keep the token mixer separate from the switch in per-token updates. The prefix uses a dense network for every token, and later blocks select from an expert bank.',
  depth => {
    const counts = schedule.expertDepth;
    return stack(brief(depth) ? 'One network first, specialists later' : 'Dense feed-forward prefix and routed tail', [
      { id: 'input', label: 'Input features', role: 'embedding' },
      { id: 'early', label: brief(depth) ? 'One network for every word' : 'Dense feed-forward', role: 'feedforward', repeat: counts.dense },
      { id: 'late', label: brief(depth) ? 'Selected specialists for each word' : 'Routed expert feed-forward', role: 'changed', repeat: counts.routed },
      { id: 'out', label: 'Next-word features', role: 'output' },
    ], detailed(depth) ? 'The toy prefix uses one FFN per layer. In the routed layers each token activates ' + counts.active + ' of ' +
      counts.candidates + ' experts per layer.' : 'Attention and the feed-forward choice are separate. The routing change happens in the later token updates.');
  }),

  ref('future-token-head', [
    'What does an auxiliary future-token head do beside the main next-token head?',
    'How can a multi-token prediction head guess the word after the next one?',
    'Where does the second draft word come from in a multi-token prediction block?',
  ], ['auxiliary future token head', 'multi token prediction head guess', 'second draft word come from'],
  'Keep the main next-token readout separate from a later-token prediction. Show one auxiliary head conditioned on the first candidate and the original features.',
  depth => ({
    kind: 'flow', title: brief(depth) ? 'A guess beyond the next word' : 'An auxiliary later-token prediction',
    nodes: [
      step('prefix', 'Read “' + future.prefix + '”', 'fork'),
      step('next', 'Score “' + future.next + '” next', 'fork'), step('state', 'Keep prefix features'),
      step('main', 'Return next-word scores', 'outcome'), step('aux', 'Combine features with the first word', 'merge'),
      step('later', 'Predict later word “' + future.later + '”', 'outcome'),
    ],
    edges: [
      edge('prefix', 'next'), edge('prefix', 'state'), edge('next', 'main'),
      edge('next', 'aux'), edge('state', 'aux'), edge('aux', 'later'),
    ],
    caption: detailed(depth) ? 'The auxiliary head models $p(x_{t+2}\\mid h_t,x_{t+1})$. At inference, a proposed token can be checked before emission.' :
      'The main output predicts one word. The extra head can make a separate guess about a later word.',
  })),

  ref('convolution-layer-schedule', [
    'How can a decoder interleave short convolution with windowed and global attention?',
    'Why put short convolution layers between attention blocks in a hybrid language model?',
    'What does a convolution attention decoder schedule look like across layers?',
  ], ['decoder interleave short convolution', 'short convolution layers between attention blocks',
    'convolution attention decoder schedule'],
  'Identify the local convolution and the two attention reaches. At Detailed, use the second visual to show dense and routed updates as independent choices.',
  depth => {
    const names = brief(depth) ?
      { conv: 'Nearby mixing', local: 'Recent word window', global: 'All earlier words' } :
      { conv: 'Short convolution', local: 'Windowed attention', global: 'Full causal attention' };
    return stack(brief(depth) ? 'Three ways to read context' : 'Convolution and attention at different depths',
      schedule.convolutionThenAttention.map((mixer, i) => ({
        id: 'layer-' + i, label: (i + 1) + ' ' + names[mixer], role: 'attention',
      })), detailed(depth) ? 'The convolution has a small receptive field. Windowed attention scores nearby keys, and full attention scores the prefix.' :
      'The spacing between attention layers can vary. Each mixer can precede the same kind of word update.');
  },
  () => ({
    kind: 'matrix', layout: 'teaching', title: 'Choose a word update independently',
    columns: ['Dense stack', 'Routed stack'],
    rows: [
      { id: 'conv', heading: 'Short convolution', cells: ['One network', 'Selected experts'] },
      { id: 'attn', heading: 'Attention', cells: ['One network', 'Selected experts'] },
    ],
    caption: 'Either token mixer can pass its result to a dense network or a routed expert bank.',
  })),

  ref('convolution-relative-bias', [
    'Why use short key and value convolutions alongside learned relative attention bias?',
    'How do local convolution and learned offset bias change different parts of an attention layer?',
    'Where do the short convolutions and relative position bias go within one attention block?',
  ], ['short key and value convolutions alongside learned relative attention bias',
    'local convolution and learned offset bias', 'short convolutions and relative position bias go within'],
  'Show causal short convolution on key/value features and on the attention and expert output paths. At Detailed, add learned offset bias to content scores separately.',
  depth => ({
    ...stack(brief(depth) ? 'Nearby mixing and distance clues' : 'Short convolution and learned relative attention bias',
      [
        { id: 'attention', label: brief(depth) ? 'Read earlier words' : 'Grouped causal attention', role: 'attention',
          inputs: [{ label: brief(depth) ? 'Mixed clues' : 'Convolved keys/values' }, { label: brief(depth) ? 'Learned distance clue' : 'Learned offset bias' }] },
        { id: 'attention-mix', label: brief(depth) ? 'Mix nearby results' : 'Attention output convolution', role: 'attention' },
        { id: 'expert', label: brief(depth) ? 'Selected specialists' : 'Routed experts', role: 'feedforward' },
        { id: 'expert-mix', label: brief(depth) ? 'Mix specialist results' : 'Expert output convolution', role: 'feedforward' },
      ], detailed(depth) ? 'The key/value convolution mixes features across neighbors. The offset bias changes the attention score.' :
        'Nearby mixing changes the features. The distance clue changes how attention scores them.'),
    edges: [{ kind: 'residual', from: 'attention', to: 'attention-mix' }, { kind: 'residual', from: 'expert', to: 'expert-mix' }],
  }),
  () => ({
    kind: 'matrix', layout: 'teaching', title: 'One query with convolved features and learned bias',
    columns: ['Offset', 'Smoothed key', 'Smoothed value', 'Learned bias', 'Attention score'],
    rows: relativeConvolution.offsets.map((offset, i) => ({
      id: 'position-' + i, heading: 'Position ' + (i + 2),
      cells: [offset, relativeConvolution.convolvedKeys[i], relativeConvolution.convolvedValues[i],
        relativeConvolution.relativeBias[i], relativeConvolution.scores[i]].map(String),
    })),
    emphasis: { rows: ['position-2'] },
    caption: '$q=1$. The kernel uses one quarter of the earlier feature and three quarters of the current feature. Bias changes only the score.',
  })),

  ref('low-rank-adapter', [
    'How does a low-rank adapter add a correction to a frozen projection?',
    'Where do the down and up matrices go in a LoRA adapter branch?',
    'Why can a rank-one LoRA update change the projection output?',
  ], ['low rank adapter add a correction', 'lora adapter branch', 'rank one lora update change'],
  'Send the same input into the frozen base and a narrow trainable branch. Project down and up, then add the correction.',
  depth => ({
    kind: 'flow', title: brief(depth) ? 'Add a small learned correction' : 'A low-rank side path updates a projection',
    nodes: [
      step('input', brief(depth) ? 'Read two input features' : 'Read input ' + math(vector(adapter.input)), 'fork'),
      step('base', brief(depth) ? 'Use the fixed map' : 'Use the frozen projection'),
      step('down', 'Project to one feature'),
      step('up', detailed(depth) ? 'Produce correction ' + math(vector(adapter.delta)) : 'Project back to two features'),
      step('merge', 'Add both results', 'merge'),
      step('out', detailed(depth) ? 'Return ' + math(vector(adapter.output)) : 'Return the updated features', 'outcome'),
    ],
    edges: [
      edge('input', 'base'), edge('input', 'down'), edge('base', 'merge'),
      edge('down', 'up'), edge('up', 'merge'), edge('merge', 'out'),
    ],
    caption: detailed(depth) ? 'With identity base, $Ax=' + (adapter.input[0] - adapter.input[1]) + '$ and $BAx=' + vector(adapter.delta) +
      '$. The update uses one intermediate feature.' : 'The small trainable path supplies a correction alongside the frozen base path.',
  })),

  ref('multistream-residual', [
    'How can several residual streams feed one sublayer and receive its result back?',
    'What is the difference between mHC mixing and identity hyper-connections?',
    'How do gated reads and writes work across parallel residual streams?',
  ], ['several residual streams feed one sublayer', 'mhc mixing and identity hyper connections',
    'gated reads and writes work across parallel residual streams'],
  'Separate the gated read, one sublayer update and gated writes. At Detailed, compare an identity carry with a doubly stochastic carry that mixes the streams.',
  depth => graph(
    brief(depth) ? 'One operation on two carried streams' : 'Read, transform, and write parallel residual streams',
    [
      ['a', detailed(depth) ? 'Stream A starts at ' + streams.input[0] : 'First stream'],
      ['b', detailed(depth) ? 'Stream B starts at ' + streams.input[1] : 'Second stream'],
      ['read', detailed(depth) ? 'Combined read ' + streams.read : 'Combined read'],
      ['update', detailed(depth) ? 'Shared update ' + streams.change : 'One shared operation'],
      ['write-a', 'First updated stream'], ['write-b', 'Second updated stream'],
    ],
    [
      edge('a', 'read', 'Contributes one quarter'), edge('b', 'read', 'Contributes three quarters'),
      edge('read', 'update', 'Supplies one input'),
      edge('update', 'write-a', 'Adds half the update'), edge('update', 'write-b', 'Adds a quarter of the update'),
      edge('a', 'write-a', 'Carries the first stream'), edge('b', 'write-b', 'Carries the second stream'),
    ],
    detailed(depth) ? 'Identity carry keeps each stream separate. A mixing carry blends the old streams before the same two gated writes.' :
      'Two streams supply one input. The same operation contributes a different amount to each updated stream.',
  ),
  () => ({
    kind: 'matrix', layout: 'teaching', title: 'Two ways to carry old residual state',
    columns: ['Identity carry', 'Mixed carry'],
    rows: [
      { id: 'a', heading: 'First result', cells: [streams.identity[0], streams.mixed[0]].map(String) },
      { id: 'b', heading: 'Second result', cells: [streams.identity[1], streams.mixed[1]].map(String) },
    ],
    caption: 'Both write ' + math(vector(streams.writes)) + '. The mixed carry keeps three quarters of each stream and takes one quarter from the other.',
  })),

  ref('depth-attention', [
    'How can attention residuals read earlier layer summaries?',
    'What does attention across decoder depth attend to?',
    'How can the embedding and earlier block outputs feed an attention residual?',
  ], ['attention residuals read earlier layer summaries', 'attention across decoder depth attend to',
    'earlier block outputs feed an attention residual'],
  'Use depth positions as keys. Let the attention and feed-forward sublayers have different weights over the embedding and earlier block summaries.',
  depth => ({
    kind: 'token-links', title: brief(depth) ? 'Look back at earlier layers' : 'Weighted reads across layer depth',
    source: brief(depth) ? ['Context update', 'Word update'] : ['Attention input', 'Feed-forward input'],
    target: brief(depth) ? ['Starting word', 'First layer group', 'Second layer group'] : depthRead.sources,
    queries: depthRead.weights.map((weights, index) => ({ index, weights })), normalized: true,
    caption: detailed(depth) ? 'The positions index layer groups. Each sublayer has its own weighted read before its token computation.' :
      'The two operations can draw different amounts from the starting features and earlier groups.',
  })),

  ref('partial-block-mask', [
    'How does block-sparse attention handle the current unfinished block?',
    'Can selected older blocks and the current partial block both be visible?',
    'What can the query read before its sparse attention block is complete?',
  ], ['block sparse attention handle the current unfinished block', 'selected older blocks and the current partial block',
    'query read before its sparse attention block is complete'],
  'Show selected completed blocks and all causally visible positions in the partial current block. The next query adds only the newly available position.',
  depth => maskGrid(
    brief(depth) ? 'Read the useful old groups and the current one' : 'Selected blocks with a causal current block',
    ['Query at position five', 'Query at position six'], masks.partial,
    detailed(depth) ? 'Older positions $1,2$ are selected. The current block admits $5$ first, then $5,6$ after position six becomes available.' :
      'Both queries read the selected old group. The second query can also read the new position in the current group.',
  )),

  ref('encoder-global-kv', [
    'How can a causal encoder build global keys and values for more than one decoder layer?',
    'Where do the shared encoder cache and decoder local history meet?',
    'Why can two decoder layers read the same global encoder memory?',
  ], ['causal encoder build global keys and values', 'shared encoder cache and decoder local history',
    'two decoder layers read the same global encoder memory'],
  'Show a shared global key/value state from the causal encoder and decoder-local context as separate inputs to later attention reads.',
  depth => graph(
    brief(depth) ? 'One global memory for two layers' : 'Encoder global memory and decoder-local context',
    [
      ['enc', brief(depth) ? 'Read the earlier text' : 'Causal encoder'],
      ['global', brief(depth) ? 'Shared earlier-text notes' : 'Global encoder keys and values'],
      ['local', brief(depth) ? 'Nearby writing context' : 'Local decoder history'],
      ['first', 'First decoder layer'], ['second', 'Later decoder layer'],
    ],
    [
      edge('enc', 'global', 'Builds prefix memory'),
      edge('global', 'first', 'Supplies shared memory'), edge('global', 'second', 'Reuses shared memory'),
      edge('local', 'first', 'Supplies nearby context'), edge('local', 'second', 'Supplies decoder history'),
      edge('first', 'second', 'Passes the updated state'),
    ],
    detailed(depth) ? 'Global keys and values come from encoder features. Decoder-local history and layer queries remain separate inputs.' :
      'The two layers can consult the same earlier-text notes and their nearby writing context.',
  )),

  ref('window-vs-index-mask', [
    'How is a retrieved token shortlist different from a sliding window?',
    'Can sparse indexed attention read distant tokens outside the window?',
    'What changes when a decoder alternates nearby attention and a retrieved shortlist?',
  ], ['retrieved token shortlist different from a sliding window', 'sparse indexed attention read distant tokens outside the window',
    'alternates nearby attention and a retrieved shortlist'],
  'Compare contiguous recency with selected older positions. Both examples keep the current causal position.',
  depth => maskGrid(
    brief(depth) ? 'Nearby words or selected older words' : 'Sliding-window and indexed attention masks',
    [brief(depth) ? 'Nearby positions' : 'Sliding window', brief(depth) ? 'Selected positions' : 'Retrieved shortlist'],
    [masks.local, masks.shortlist],
    detailed(depth) ? 'The window admits $4,5,6$. The indexed read admits $1,3,6$ in this toy query. Both select a causal subset.' :
      'The window keeps a recent run. The indexed read can select useful distant positions.',
  )),

  ref('latent-query-and-kv', [
    'Why does latent attention compress queries and cached key-value state separately?',
    'Can the query bottleneck and the key-value cache bottleneck have different widths?',
    'Which latent attention vectors are saved for later tokens?',
  ], ['latent attention compress queries and cached key value state separately',
    'query bottleneck and the key value cache bottleneck', 'which latent attention vectors are saved for later tokens'],
  'Use independent down-projections for the current query and cached key/value features. Show only the key/value latent carried forward.',
  depth => ({
    kind: 'transformation',
    title: brief(depth) ? 'Two ways to make smaller features' : 'Separate query and key/value bottlenecks',
    before: {
      label: 'Current token features',
      items: [brief(depth) ? 'Full feature set' : width('Hidden state', latent.hidden, 'input')],
    },
    after: {
      label: 'Two smaller feature sets',
      items: brief(depth) ? ['Features for asking now', 'Features stored for later'] :
        [width('Query latent', latent.query, 'output'), width('Cached key/value latent', latent.kv, 'output')],
    },
    operation: brief(depth) ? 'Apply separate projections' : 'Project to independent latent spaces',
    caption: detailed(depth) ? 'This toy token has $d=' + latent.hidden + '$. The query latent uses $' + latent.query +
      '$ entries, and the stored key/value latent uses $' + latent.kv + '$.' :
      'The query serves the current read. Later tokens can use the stored key/value features.',
  })),

  ref('shared-core-reinjection', [
    'Why give the same prefix features to every pass of a looped decoder?',
    'How does input reinjection work in a shared-weight decoder core?',
    'Can a recurrent decoder pass use both the previous result and its original input?',
  ], ['same prefix features to every pass of a looped decoder', 'input reinjection work in a shared weight decoder core',
    'recurrent decoder pass use both the previous result and its original input'],
  'Trace one fixed prefix-side input into every shared-core pass while the running state is updated. Layer count and recurrence are illustrative.',
  depth => stack(
    brief(depth) ? 'Keep the starting clue on each pass' : 'A fixed input enters every pass of a shared core',
    [
      { id: 'prefix', label: brief(depth) ? 'Starting features' : 'Prefix stack', role: 'embedding' },
      { id: 'core', label: brief(depth) ? 'Same middle steps' : 'Shared decoder core', repeat: core.passes,
        inputs: [{ label: 'Fixed cue each pass' }], role: 'attention' },
      { id: 'out', label: brief(depth) ? 'Final steps' : 'Output stack', role: 'output' },
    ],
    detailed(depth) ? '$h_{t+1}=(h_t+z)/2$ with $z=' + vector(core.prefix) + '$. From $h_0=' + vector(core.states[0]) +
      '$, two passes give $h_2=' + vector(core.states[2]) + '$.' :
      'Each pass gets the previous result and the same original cue. The last result continues to the output.',
  )),

  ref('learned-sink-weight', [
    'What does a learned attention sink score do inside a sliding window?',
    'How can a learned attention sink take weight without supplying a token value?',
    'Why do recent token weights shrink when the model adds a learned sink?',
  ], ['learned attention sink score do inside a sliding window',
    'learned attention sink take weight without supplying a token value', 'recent token weights shrink when the model adds a learned sink'],
  'Teach the learned extra-logit form of a sink. Keep the causal window fixed and show the sink consuming weight in the softmax denominator.',
  depth => ({
    kind: 'heatmap', title: brief(depth) ? 'Some weight can go to the sink' : 'A learned sink changes weight within the same window',
    columns: ['Older word', 'Recent word A', 'Recent word B', 'Sink score'],
    rows: [
      { label: 'Recent words only', cells: sink.base },
      { label: 'With the sink score', cells: sink.withScore },
    ], range: { min: 0, max: 1 },
    caption: detailed(depth) ? 'The two word logits are $0$. Adding a sink logit $\\log 2$ yields weights $1/4$, $1/4$, $1/2$. Only the words supply values.' :
      'Both rows read the same recent words. The added score takes part of the weight, and the words supply the values.',
  })),

  ref('shared-kv-and-index', [
    'What is the difference between reusing sparse attention indices and sharing key-value state?',
    'How can a sparse decoder share both its shortlist and its key-value cache across layers?',
    'Why do layers still get different attention weights when the shortlist and cache are shared?',
  ], ['reusing sparse attention indices and sharing key value state', 'share both its shortlist and its key value cache',
    'different attention weights when the shortlist and cache are shared'],
  'Keep the selected positions and compact cached key/value state separate. Show each reader computing its own weights.',
  depth => graph(
    brief(depth) ? 'Share the lookup and the stored clues' : 'Shared sparse index and shared key/value state',
    [
      ['index', detailed(depth) ? 'Shortlist ' + math(vector(share.positions)) : 'Shared positions'],
      ['cache', brief(depth) ? 'Shared stored features' : 'Shared key/value state'],
      ['early', 'First attention read'], ['late', 'Later attention read'],
    ],
    [
      edge('index', 'early', 'Limits the positions read'), edge('index', 'late', 'Shares the chosen positions'),
      edge('cache', 'early', 'Supplies key and value rows'), edge('cache', 'late', 'Reuses key and value rows'),
      edge('early', 'late', 'Passes the updated state'),
    ],
    detailed(depth) ? 'The two reads reuse the same records. Different queries give ' +
      math(vector(share.weights[0].map(value => Number(value.toFixed(2))))) + ' and ' +
      math(vector(share.weights[1].map(value => Number(value.toFixed(2))))) + ' as weights.' :
      'The shortlist gives positions. The cache supplies the features read at those positions.',
  )),
];
