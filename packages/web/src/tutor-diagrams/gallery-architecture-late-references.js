import { architectureToy } from './gallery-architecture-data.js';

const versioned = diagram => ({ version: 1, diagram });
const vector = values => '$[' + values.join(', ') + ']$';
const node = (id, label, role) => ({ id, label, role });
const edge = (from, to, label) => ({ from, to, ...(label ? { label } : {}) });
const inset = (label, role) => ({ label, role });
const { hybrid, parallel, index, sharedCore } = architectureToy;

function hybridStack(title, [state, attention, experts], caption) {
  const mix = (label, role) => ({
    kind: 'flow',
    steps: [inset(label, role), inset(experts, 'feedforward')],
  });
  return versioned({
    kind: 'block-stack', title, caption,
    blocks: [
      { id: 'memory', label: 'First state layer', repeat: hybrid.rounds, repeatTo: 'lookup', diagram: mix(state, 'attention') },
      { id: 'memory-two', label: 'Second state layer', diagram: mix(state, 'attention') },
      { id: 'lookup', label: 'Direct lookup layer', diagram: mix(attention, 'attention') },
    ],
  });
}

function parallelFlow(title, labels, caption) {
  const [read, attend, route, hold, combine, write] = labels;
  return versioned({
    kind: 'flow', title, caption,
    nodes: [
      node('read', read, 'fork'), node('a', attend, 'process'),
      node('e', route, 'process'), node('r', hold, 'process'),
      node('add', combine, 'merge'), node('out', write, 'outcome'),
    ],
    edges: [
      edge('read', 'a'), edge('read', 'e'), edge('read', 'r'),
      edge('a', 'add'), edge('e', 'add'), edge('r', 'add'), edge('add', 'out'),
    ],
  });
}

function indexGraph(title, [search, shortlist, early, late], caption) {
  return versioned({
    kind: 'relationship', layout: 'graph', title, caption,
    nodes: [
      { id: 'search', label: search }, { id: 'index', label: shortlist },
      { id: 'early', label: early }, { id: 'late', label: late },
    ],
    edges: [
      edge('search', 'index', 'Ranks earlier positions'),
      edge('index', 'early', 'Restricts the first read'),
      edge('index', 'late', 'Restricts the later read'),
      edge('early', 'late', 'Passes the updated state'),
    ],
  });
}

function repeatStack(title, [prefix, coreA, coreB, coreC, tail], caption) {
  return versioned({
    kind: 'block-stack', title, caption,
    blocks: [
      node('prefix', prefix, 'embedding'),
      { ...node('core-a', coreA, 'attention'), repeat: sharedCore.passes, repeatTo: 'core-c' },
      node('core-b', coreB, 'attention'), node('core-c', coreC, 'attention'),
      node('tail', tail, 'output'),
    ],
  });
}

export const references = [
  {
    id: 'ml-architecture-hybrid-routing',
    lessons: [],
    prompts: ['How can an expert model mix a running memory with occasional attention?'],
    paraphrases: [
      'Why alternate a recurrent mixer and attention when both layers use experts?',
      'How does a hybrid recurrent decoder keep the same expert routing across its mixer types?',
    ],
    keywords: ['recurrent mixer and attention', 'hybrid recurrent decoder', 'running memory with occasional attention'],
    useWhen: 'Show recurrent state mixing and occasional direct token lookup as alternate mixers. Both stages use sparse feed-forward routing.',
    spec: hybridStack('Two mixers, same kind of expert routing',
      ['Recurrent state mixer', 'Direct token attention', 'Sparse expert feed-forward'],
      'The mixer decides how context reaches a token. The router decides which feed-forward networks update it.'),
    depths: {
      overview: {
        spec: hybridStack('Two ways to bring in context',
          ['Running memory', 'Direct lookup of earlier words', 'Selected specialist networks'],
          'The two paths use context differently. Both choose specialists for the update.'),
      },
      deep: {
        spec: hybridStack('Recurrent and attention layers with routed experts',
          ['Gated state mixer', 'Direct token attention', 'Shared and selected experts'],
          'Each token runs ' + hybrid.routed + ' of ' + hybrid.expertPool + ' routed experts plus ' + hybrid.shared + ' shared expert after either mixer.'),
      },
    },
  },
  {
    id: 'ml-architecture-parallel-attention-experts',
    lessons: [],
    prompts: ['How can attention and experts run in parallel inside one decoder layer?'],
    paraphrases: [
      'What gets added back when the attention and expert branches start from the same token?',
      'Why can a decoder run its expert network alongside its attention branch?',
    ],
    keywords: ['attention and experts run in parallel', 'parallel attention and experts', 'attention and expert branches start',
      'expert network alongside its attention branch'],
    useWhen: 'Trace a parallel decoder block with attention and expert updates from one shared input and a separate residual lane.',
    spec: parallelFlow('Parallel attention and expert updates', [
      'Read the token state', 'Mix earlier context', 'Run the chosen experts', 'Keep the original state',
      'Add both updates to the original', 'Write the new state',
    ], 'Both updates start from the same state and are added back once.'),
    depths: {
      overview: {
        spec: parallelFlow('Two updates to the same token', [
          'Read the current state', 'Use earlier words', 'Run the chosen specialists', 'Keep the starting value',
          'Combine both changes', 'Write the new state',
        ], 'The earlier words and the specialists both contribute to one update.'),
      },
      deep: {
        spec: parallelFlow('Parallel residual update', [
          'Read and normalize input', 'Compute attention ' + vector(parallel.attention),
          'Compute expert update ' + vector(parallel.experts), 'Keep residual ' + vector(parallel.stream),
          'Add residual and both updates', 'Write ' + vector(parallel.result),
        ], 'The attention and expert branches read the same normalized state. The residual retains the original.'),
      },
    },
  },
  {
    id: 'ml-architecture-sparse-index-reuse',
    lessons: [],
    prompts: ['How does reusing the index shortlist save work in sparse attention?'],
    paraphrases: [
      'If one attention layer finds the useful positions, can a later layer reuse those indices?',
      'What does shared sparse attention indexing reuse between layers?',
    ],
    keywords: ['index shortlist', 'reuse those indices', 'shared sparse attention indexing', 'sparse attention index reuse'],
    useWhen: 'Separate sharing which positions to read from recomputing the weights and state update within each sparse-attention layer.',
    spec: indexGraph('One search, two attention reads',
      ['Position search', 'Shared shortlist', 'First layer attention', 'Later layer attention'],
      'The later layer reuses the selected positions. Each layer computes its own attention weights.'),
    depths: {
      overview: {
        spec: indexGraph('Find the places to read once',
          ['Earlier word search', 'Shared list of places', 'First context update', 'Later context update'],
          'The shared list tells both updates where to look.'),
      },
      deep: {
        spec: indexGraph('Reused index in sparse attention',
          ['Search scores ' + vector(index.scores), 'Shortlist ' + vector(index.shortlist),
            'First sparse attention', 'Later sparse attention'],
          'Only the token indices are shared. The two layers still score the selected positions with their own queries.'),
      },
    },
  },
  {
    id: 'ml-architecture-shared-core',
    lessons: [],
    prompts: ['How does a decoder get deeper by running the same blocks twice?'],
    paraphrases: [
      'How can a looped decoder reuse the same weights on every pass?',
      'What happens if you repeat a decoder core instead of adding new layers?',
    ],
    keywords: ['running the same blocks twice', 'looped decoder reuse the same weights',
      'repeat a decoder core', 'shared-weight decoder core'],
    useWhen: 'Show recurrent depth by reapplying a decoder core with shared weights. Keep unique weights and total executions distinct.',
    spec: repeatStack('One core, multiple passes',
      ['Input layer', 'Shared layer one', 'Shared layer two', 'Shared layer three', 'Output layer'],
      'Pass two starts from the state left by pass one and reuses the same three learned layers.'),
    depths: {
      overview: {
        spec: repeatStack('Run the middle twice',
          ['Input step', 'Middle step one', 'Middle step two', 'Middle step three', 'Output step'],
          'Run the middle again using what it produced on the first pass.'),
      },
      deep: {
        spec: repeatStack('Shared weights across depth',
          ['Prefix layer', 'Core attention layer one', 'Core attention layer two', 'Core attention layer three', 'Tail layer'],
          '$' + sharedCore.prefix + ' + ' + sharedCore.core + ' \\times ' + sharedCore.passes + ' + ' + sharedCore.tail + ' = '
            + sharedCore.executions + '$ layer applications. Only ' + sharedCore.unique + ' distinct layer parameter sets.'),
      },
    },
  },
];
