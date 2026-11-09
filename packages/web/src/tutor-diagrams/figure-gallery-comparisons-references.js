const matrix = (title, caption, columns, rows) => ({
  version: 1,
  diagram: {
    kind: 'matrix', layout: 'teaching', title, caption, columns,
    rows: rows.map(([heading, ...cells], index) => ({ id: `r${index}`, heading, cells })),
  },
});

function reference(id, prompt, paraphrase, keywords, useWhen, make) {
  return {
    id, lessons: [], prompts: [prompt], paraphrases: [paraphrase], keywords, useWhen,
    spec: make('standard'), depths: { overview: { spec: make('overview') }, deep: { spec: make('deep') } },
  };
}

const reach = reference('figure-global-only-position-extension',
  'Why would a decoder extend positions only in its global attention layers?',
  'How can longer positions affect full attention without enlarging the local window?',
  ['extend positions only in its global attention layers', 'longer positions affect full attention without enlarging'],
  'Use a hybrid decoder with two attention roles. Compare the fixed local window with a longer global position range. Any counts are illustrative.',
  depth => matrix(depth === 'overview' ? 'Longer reach in the full-context layers' : 'Position extension for global attention',
    depth === 'deep' ? 'The global position encoding supports $2N$ rather than $N$ positions. Local layers still read the most recent four slots.' :
      'The recent-token layers keep their short window. The full-context layers handle the longer positions.',
    ['Position treatment', 'Example reach'], [
      ['Local layer', 'Standard positions', 'Four recent slots'],
      ['Global layer', 'Extended positions', depth === 'overview' ? 'All earlier slots' : 'Up to 16 slots'],
    ]));

const media = reference('figure-direct-media-token-projection',
  'How can a multimodal decoder take image patches directly without a separate vision stack?',
  'What happens to image patches in an encoder-free multimodal text decoder?',
  ['image patches directly without a separate vision stack', 'image patches in an encoder free multimodal text decoder'],
  'Contrast a direct media patch projection with a text embedding lookup. Both produce compatible token-width rows for the same local/global decoder.',
  depth => ({ version: 1, diagram: {
    kind: 'relationship', layout: 'graph',
    title: depth === 'overview' ? 'Pictures and words join one stream' : 'Direct media tokens in a shared text decoder',
    caption: depth === 'deep' ? String.raw`A toy patch projection maps $\mathbb{R}^{4}$ to $\mathbb{R}^{6}$. The text lookup also supplies six features per token.` :
      'A patch projection and a word lookup produce equally wide token rows for one decoder.',
    nodes: [
      { id: 'patch', label: 'Image patches' }, { id: 'words', label: 'Word tokens' },
      { id: 'mix', label: 'Combined token stream' }, { id: 'decoder', label: 'Local and global layers' },
    ],
    edges: [
      { from: 'patch', to: 'mix', label: 'Projects patch features' },
      { from: 'words', to: 'mix', label: 'Looks up word features' },
      { from: 'mix', to: 'decoder', label: 'Supplies ordered tokens' },
    ],
  } }));

const sparseFamily = reference('figure-compare-sparse-decoder-family',
  'What stays the same when a dense-to-sparse decoder family scales down?',
  'Can a smaller expert decoder keep the same dense opening and future-token prediction?',
  ['dense to sparse decoder family scales down', 'smaller expert decoder keep the same dense opening'],
  'Align two toy variants row by row. Hold grouped attention, the dense prefix and future-token head fixed. Vary routed depth and the number of available experts.',
  depth => matrix(depth === 'overview' ? 'Two sizes of one expert decoder' : 'Scale a dense-to-routed decoder family',
    depth === 'deep' ? 'For routed depths $L$, bank sizes $E$ and top $k=2$, available expert modules scale with $LE$ and selected modules per token with $Lk$.' :
      'Both share attention, a dense opening and a future-token head. The compact variant has fewer routed blocks and experts.',
    ['Compact toy', 'Larger toy'], [
      ['Attention', 'Shared key and value groups', 'Same groups'],
      ['Dense opening', 'One block', 'One block'],
      ['Routed blocks', 'Two blocks', 'Four blocks'],
      ['Expert bank', 'Choose two of four', 'Choose two of six'],
      ['Extra prediction', 'One future token', 'One future token'],
    ]));

export const galleryComparisonReferences = [reach, media, sparseFamily];
