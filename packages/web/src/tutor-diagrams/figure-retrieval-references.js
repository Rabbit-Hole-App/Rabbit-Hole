import { corpus } from './figure-retrieval-data.js';

const spec = diagram => ({ version: 1, diagram });
const brief = depth => depth === 'overview';
const detailed = depth => depth === 'deep';
const math = expression => '$' + expression + '$';
const vector = numbers => '[' + numbers.join(',') + ']';
const {
  tokens, contextual, query, entries, matches, answer, attending, causalPrefix, evidence, decoderQuery, weights, output, phrase,
} = corpus;
const chunk = tokens.join(' ');
const selected = matches.map(entry => entry.id);
const incomplete = causalPrefix + ' …';
const tensor = (label, values, role = 'input') => ({
  label, tensor: { rows: 1, columns: 2, dimensions: '1 × 2', values, role },
});
const reference = (name, lessons, [prompt, ...paraphrases], keywords, useWhen, diagramAt) => ({
  id: 'figure-retro-' + name, lessons, prompts: [prompt], paraphrases, keywords, useWhen,
  spec: spec(diagramAt('standard')),
  depths: { overview: { spec: spec(diagramAt('overview')) }, deep: { spec: spec(diagramAt('deep')) } },
});

export const retrievalReferences = [
  reference('evidence-loop', ['19'], [
    'How does RETRO use a text store to finish a sentence?',
    'Where does the retrieved evidence go when RETRO predicts a word?',
    'How does a RETRO lookup get from a text chunk to a completion?',
  ], ['retro use a text store', 'retrieved evidence go when retro', 'retro lookup get from a text chunk'],
  'Trace a completed chunk into the search and pass the returned text through its own encoder. The decoder produces the continuation.',
  depth => ({
    kind: 'sequence', title: brief(depth) ? 'Look up a clue before writing' : 'Retrieved evidence before the next word',
    actors: [
      { id: 'input', label: 'Input' },
      { id: 'decoder', label: brief(depth) ? 'Writing side' : 'Causal decoder' },
      { id: 'store', label: brief(depth) ? 'Text store' : 'Retrieval index' },
      { id: 'reader', label: brief(depth) ? 'Passage reader' : 'Neighbor encoder' },
    ],
    messages: [
      { from: 'input', to: 'decoder', label: 'Prefix “' + incomplete + '”' },
      { from: 'decoder', to: 'store', label: (brief(depth) ? 'Lookup for “' : 'Completed chunk “') + chunk + '”' },
      { from: 'store', to: 'reader', label: brief(depth) ? 'Matching passages and what follows' : 'Two neighbors and their following chunks' },
      { from: 'decoder', to: 'reader', label: brief(depth) ? 'Context from the input words' : 'Completed chunk’s decoder features' },
      { from: 'reader', to: 'decoder', label: brief(depth) ? 'Evidence from the matching passages' : 'Encoded neighbor features' },
      { from: 'decoder', to: 'input', label: 'Example next word “' + answer + '”' },
    ],
    caption: detailed(depth) ? 'Search uses the chunk embedding. The neighbor encoder reads the returned text, conditioned on the completed chunk.' :
      'The matching passages give the writing side evidence about the opening day.',
  })),

  reference('fact-versus-pattern', ['19'], [
    'Why would a retrieval model need a text store for facts but not common phrases?',
    'When is a familiar phrase enough to finish a blank without looking up a fact?',
    'What is the difference between knowing a language pattern and retrieving an opening day?',
  ], ['text store for facts but not common phrases', 'familiar phrase enough to finish a blank',
    'language pattern and retrieving an opening day'],
  'Use a familiar phrase and a fact about the invented archive. A lookup contributes current evidence. The decoder still supplies the language model in both cases.',
  depth => ({
    kind: 'comparison', title: brief(depth) ? 'Two kinds of clues for a blank' : 'Language patterns and factual evidence',
    columns: [
      { heading: 'Familiar expression', items: [phrase.incomplete, 'Common ending “' + phrase.completion + '”', 'The nearby words suggest the ending'] },
      { heading: 'Specific opening day', items: [incomplete, 'Archive notice says “' + answer + '”', 'The retrieved record supplies the day'] },
    ],
    caption: detailed(depth) ? 'Both completions use language-model parameters. A retrieved notice adds separate evidence about one specific fact.' :
      'Familiar wording suggests one ending. A source notice supplies the archive’s opening day.',
  })),

  reference('index-records', [], [
    'What does RETRO keep with each search key in its retrieval index?',
    'Why does a RETRO index return a matched chunk and its continuation?',
    'What are the fields in a RETRO index record?',
  ], ['retro keep with each search key', 'retro index return a matched chunk', 'fields in a retro index record'],
  'Show separate fields for the numeric lookup key, the matching text and the following chunk. The marked rows are retrieved for the toy input.',
  depth => ({
    kind: 'matrix', layout: 'teaching',
    title: brief(depth) ? 'What each stored passage contains' : 'Matched text and continuation in the index',
    columns: [brief(depth) ? 'Lookup key' : 'Embedding key', 'Matching words', 'Following words'],
    rows: entries.map(entry => ({
      id: entry.id, heading: 'Record ' + entry.id,
      cells: [brief(depth) ? 'Key ' + entry.id : math(vector(entry.key)), entry.chunk.join(' '), entry.next.join(' ')],
    })),
    emphasis: { rows: selected },
    caption: detailed(depth) ? 'Lookup uses ' + math('q=' + vector(query)) + ' for “' + chunk + '”. Send both text spans from each highlighted row to the neighbor encoder.' :
      'The highlighted records contribute their matching words and what comes right after.',
  })),

  reference('chunk-embedding', [], [
    'How does RETRO average token vectors into one chunk embedding?',
    'Why does the RETRO lookup use a mean of the word vectors?',
    'How do two contextual vectors become one RETRO search key?',
  ], ['retro average token vectors', 'retro lookup use a mean', 'two contextual vectors become one retro search key'],
  'Average aligned features across tokens. This lookup vector is separate from the keys used in decoder cross-attention.',
  depth => ({
    kind: 'transformation',
    title: brief(depth) ? 'One lookup from two words' : 'Mean pooling for the chunk search',
    before: {
      label: brief(depth) ? 'One set per word' : 'Contextual token vectors',
      items: tokens.map((word, i) => brief(depth) ? word + ' features' : tensor(word, contextual[i])),
    },
    after: {
      label: brief(depth) ? 'One lookup key' : 'Chunk embedding',
      items: [brief(depth) ? chunk : tensor(chunk, query, 'output')],
    },
    operation: brief(depth) ? 'Average matching features' : 'Average the same coordinate across tokens',
    caption: detailed(depth) ? math('e=(h_1+h_2)/2=' + vector(query)) + ' for “' + chunk + '”. The index looks for keys near this vector.' :
      'The average gives the search one number for each feature, regardless of the number of words.',
  })),

  reference('neighbor-search', ['06'], [
    'How does nearest-neighbor search choose text chunks for RETRO?',
    'Which two index entries does the RETRO chunk query retrieve?',
    'Can I see a RETRO vector lookup with a query and its two closest passages?',
  ], ['nearest neighbor search choose text chunks for retro', 'retro chunk query retrieve', 'retro vector lookup with a query'],
  'Use toy Euclidean distances to explain ranking. Real RETRO uses approximate nearest-neighbor search rather than exhaustive scanning.',
  depth => ({
    kind: 'coordinate-plot', title: brief(depth) ? 'Find two nearby passages' : 'Nearest passages to the chunk query',
    x: { label: 'First feature', min: 0, max: 7 },
    y: { label: 'Second feature', min: -1, max: 6 },
    series: [
      { label: 'Query', kind: 'scatter', points: [{ x: query[0], y: query[1], label: chunk }] },
      { label: 'Returned', kind: 'scatter', points: matches.map(entry => ({
        x: entry.key[0], y: entry.key[1],
        label: 'Record ' + entry.id + (detailed(depth) ? ' at $d=' + entry.distance + '$' : ''),
      })) },
      { label: 'Other entries', kind: 'scatter', points: entries.filter(entry => !selected.includes(entry.id)).map(entry => ({
        x: entry.key[0], y: entry.key[1], label: 'Record ' + entry.id,
      })) },
    ],
    caption: detailed(depth) ? 'Use $d=\\lVert q-e\\rVert_2$ on the toy vectors. Production RETRO uses an approximate search.' :
      'Records A and B are closest to the query. The store sends their text back.',
  })),

  reference('layer-placement', [], [
    'Where do the retrieved neighbors first enter the RETRO decoder stack?',
    'Why does RETRO alternate ordinary decoder layers with retrieval layers?',
    'Which decoder layers in RETRO can read the encoded passages?',
  ], ['retrieved neighbors first enter the retro decoder', 'retro alternate ordinary decoder layers',
    'decoder layers in retro can read the encoded passages'],
  'Show early causal layers reading input alone and encoded neighbor features entering only at the highlighted later layers. Layer counts are illustrative.',
  depth => {
    const early = brief(depth) ? 'Earlier-word context' : 'Causal self-attention';
    const cross = brief(depth) ? 'Reads the returned passages' : 'Chunked cross-attention';
    const inputs = [{ label: brief(depth) ? 'Notes from passages' : 'Encoded passage features' }];
    return {
      kind: 'block-stack', title: brief(depth) ? 'Where the passages enter' : 'Retrieval-aware layers in the decoder',
      blocks: [
        { id: 'input', label: chunk, role: 'embedding' },
        { id: 'causal', label: brief(depth) ? 'Ordinary early layers' : 'Early causal layers', repeat: 2, role: 'attention' },
        { id: 'retrieval-a', label: cross, inputs, role: 'changed', ...(detailed(depth) ? {
          diagram: { kind: 'flow', steps: [
            { label: early, role: 'attention' }, { label: cross, role: 'attention' }, { label: 'Per-token update', role: 'feedforward' },
          ] },
        } : {}) },
        { id: 'between', label: brief(depth) ? 'More earlier-word context' : 'Ordinary causal layer', role: 'attention' },
        { id: 'retrieval-b', label: brief(depth) ? 'Reads the passages again' : 'Later cross-attention', inputs, role: 'changed' },
        { id: 'out', label: 'Next word scores', role: 'output' },
      ],
      caption: detailed(depth) ? 'A retrieval-aware layer inserts cross-attention between causal self-attention and the per-token update. Shown schedule is illustrative.' :
        'Ordinary layers read the words already available. Marked layers also read the retrieved passages.',
    };
  }),

  reference('encoded-neighbor-rows', [], [
    'How do the retrieved words become keys and values in RETRO?',
    'Where do RETRO cross-attention keys and values come from after lookup?',
    'Why does RETRO encode its matching passages before cross-attention?',
  ], ['retrieved words become keys and values in retro', 'retro cross attention keys and values come from after lookup',
    'retro encode its matching passages before cross attention'],
  'Distinguish the index key from per-token attention keys and values. Use the completed chunk’s decoder features when encoding the neighbors.',
  depth => {
    const example = evidence.find(token => token.word === answer);
    return {
      kind: 'transformation', title: brief(depth) ? 'Prepare the passage clues' : 'Neighbor features become attention keys and values',
      before: {
        label: 'Inputs to the passage reader',
        items: brief(depth) ? ['Retrieved passage words', 'Context from “' + chunk + '”'] :
          ['Neighbor chunks and continuations', 'Decoder features of “' + chunk + '”'],
      },
      after: {
        label: brief(depth) ? 'For each passage word' : 'One row per neighbor token',
        items: brief(depth) ? ['Features to compare', 'Context to contribute'] : detailed(depth) ?
          [tensor('Key for the first “' + answer + '”', example.key, 'weight'), tensor('Value for that token', example.value, 'output')] :
          ['Key rows for matching', 'Value rows for context'],
      },
      operation: brief(depth) ? 'Read the passage using input context' : 'Encode neighbors and project their token features',
      caption: detailed(depth) ? 'Illustrative projections for one neighbor token. The decoder’s query is computed on the input side.' :
        'One set of features scores how useful a word is. Another set carries the context it can contribute.',
    };
  }),

  reference('chunk-attention', [], [
    'How does RETRO chunked cross-attention choose useful words from two retrieved passages?',
    'Why can the current RETRO chunk read neighbors found by the preceding chunk?',
    'Which positions does RETRO chunked attention use to predict the next word?',
  ], ['retro chunked cross attention choose useful words', 'retro chunk read neighbors found by the preceding chunk',
    'retro chunked attention use to predict the next word'],
  'Let the completed input chunk choose both neighbors. Show the last token of that chunk and the next available token as eligible queries over that neighbor set.',
  depth => ({
    kind: 'token-links', title: brief(depth) ? 'Read both passages for a clue' : 'Chunked attention over both retrieved passages',
    source: attending, target: evidence.map(token => token.label), queries: [{ index: 1, weights }], normalized: true,
    caption: detailed(depth) ? 'Softmax of $qK^T$ for ' + math('q=' + vector(decoderQuery)) + ' spans both neighbors. Weighted values give ' +
      math(vector(output.map(value => Number(value.toFixed(3))))) + ' in the toy head.' :
      '“' + attending[1] + '” weighs words from both retrieved passages before the next word is predicted. The completed chunk chose the passages.',
  })),
];
