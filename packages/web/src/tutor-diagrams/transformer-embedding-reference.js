import { modelWidth, positions, queryIndex, sentence, shownWidth } from './transformer-walkthrough-data.js';

const numberedTokens = sentence.map((word, index) => index + ' ' + word);

function embeddingSpec({
  caption, title = 'Token embeddings for ' + sentence.join(' '),
  labels = numberedTokens, dimensions = String(modelWidth),
}) {
  return {
    version: 1,
    diagram: {
      kind: 'block-stack',
      orientation: 'horizontal',
      title,
      blocks: labels.map((label, index) => ({
        id: 't' + index,
        label,
        diagram: {
          kind: 'tensor',
          tensor: {
            rows: 1, columns: shownWidth, dimensions,
          },
        },
      })),
      caption,
    },
  };
}

const positionalEncodingSpec = {
  version: 1,
  diagram: {
    kind: 'coordinate-plot',
    title: 'Position signals before attention',
    x: { label: 'Token position', min: 0, max: sentence.length - 1 },
    y: { label: 'Encoding value', min: -1, max: 1 },
    series: ['$\\sin p$', '$\\cos p$'].map((label, component) => ({
      kind: 'line', label,
      points: positions.map((row, x) => ({ x, y: row[component] })),
    })),
    annotations: [{ kind: 'reference-line', axis: 'x', value: queryIndex, label: 'sat' }],
    caption: 'The first pair uses $PE_{p,0}=\\sin p$ and $PE_{p,1}=\\cos p$. Add all four position entries to the token embedding.',
  },
};

export const transformerEmbeddingReference = {
  id: 'ml-transformer-token-embeddings',
  lessons: [],
  prompts: ['How does a transformer turn the words in a sentence into embeddings?'],
  paraphrases: [
    'How does a word become a row of numbers before attention?',
    'Why does a transformer add position after looking up a word embedding?',
  ],
  keywords: [
    'words in a sentence into embeddings',
    'word become a row of numbers before attention',
    'add position after looking up a word embedding',
    'positional encoding',
    'position embedding',
    'word order',
    'order of words',
    'position information',
    'position added',
  ],
  useWhen: 'Show one shape-only strip per token in sentence order, starting at position zero. Repeated tokens share an embedding. At Detailed, the second visual shows the position signal that is added to each embedding.',
  spec: embeddingSpec({
    caption: 'Four cells show the shape of each embedding. Both “the” tokens start with the same embedding.',
  }),
  depths: {
    overview: {
      spec: embeddingSpec({
        title: 'One strip for each word',
        labels: ['first the', 'cat', 'sat', 'on', 'second the', 'mat'],
        dimensions: modelWidth + ' entries',
        caption: 'Look up a row of numbers for each word. Both uses of “the” start with the same row.',
      }),
    },
    deep: {
      spec: embeddingSpec({
        caption: 'Four cells shown per strip. Add position with $x_p=e_p+PE_p$.',
      }),
      detailSpec: positionalEncodingSpec,
    },
  },
};
