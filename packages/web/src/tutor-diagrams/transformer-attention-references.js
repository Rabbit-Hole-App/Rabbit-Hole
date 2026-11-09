import { headWidth, heads, queryIndex, sentence, shownHeadWidth } from './transformer-walkthrough-data.js';

const head = heads[0];
const dots = head.dotProducts[queryIndex];
const scores = head.scores[queryIndex];
const weights = head.weights[queryIndex];
const spec = diagram => ({ version: 1, diagram });

function scoreMatrix(title, columns, caption) {
  return spec({
    kind: 'matrix', layout: 'teaching', title, columns, caption,
    rows: sentence.map((word, i) => ({
      id: `k${i + 1}`,
      heading: `${word} ${i + 1}`,
      cells: [String(dots[i]), String(scores[i])],
    })),
  });
}

function attentionWeights(title, caption) {
  return spec({
    kind: 'token-links', title, caption,
    source: sentence, target: sentence,
    queries: [{ index: queryIndex, weights }],
    normalized: true,
  });
}

function valuesStack(title, dimensions) {
  return spec({
    kind: 'block-stack', orientation: 'horizontal', title,
    blocks: sentence.map((word, i) => ({
      id: String.fromCharCode(97 + i),
      label: `${word}${sentence.indexOf(word) === i ? '' : ' again'} ${weights[i]}`,
      diagram: {
        kind: 'tensor',
        tensor: { rows: 1, columns: shownHeadWidth, dimensions, values: head.values[i] },
      },
    })),
  });
}

function outputStrip(title, dimensions, caption) {
  return spec({
    kind: 'tensor', title, caption,
    tensor: { rows: 1, columns: shownHeadWidth, dimensions, values: head.outputs[queryIndex], role: 'output' },
  });
}

export const transformerAttentionReferences = [
  {
    id: 'ml-transformer-scaled-attention-scores',
    lessons: [],
    prompts: ['How does a transformer get a match score between words?'],
    paraphrases: [
      'How does attention get a match score for each word?',
      'Why divide the dot products when scoring attention?',
    ],
    keywords: ['match score for each word', 'dot products when scoring attention', 'attention dot product scores'],
    useWhen: 'Compare the query for sat with all six keys in order. Use the scaled score column as input to softmax.',
    spec: scoreMatrix('From dot products to scaled scores', ['Dot product', 'Scaled score'],
      'Compare the query for sat with each key, then divide by the square root of the shown key width.'),
    depths: {
      overview: {
        spec: scoreMatrix('How well does sat match each word?', ['Raw match', 'Adjusted score'],
          'Compare sat with each word, then divide every score by the same number.'),
      },
      deep: {
        spec: scoreMatrix('Scaled dot-product scores for sat', ['Dot product', 'Scaled score'],
          String.raw`Use $s_j=(q\cdot k_j)/\sqrt{d_k}$ for each key, with $d_k=${shownHeadWidth}$ shown out of ${headWidth} entries.`),
      },
    },
  },
  {
    id: 'ml-transformer-attention-softmax',
    lessons: [],
    prompts: ['How do attention scores turn into weights?'],
    paraphrases: [
      'How does the model share its attention across words after scoring them?',
      'Why does softmax make the attention weights add up to one?',
    ],
    keywords: [
      'attention scores turn into weights', 'share its attention across words after scoring',
      'softmax make the attention weights add up', 'softmax over attention scores',
    ],
    useWhen: 'Apply softmax to the same six scaled scores for sat. The largest weight goes to cat.',
    spec: attentionWeights('Softmax turns scores into weights',
      'Softmax gives larger scores more weight and makes all six weights add up to one.'),
    depths: {
      overview: {
        spec: attentionWeights('How much each word matters to sat',
          'A larger match score gets a bigger share. All six shares add up to one.'),
      },
      deep: {
        spec: attentionWeights('Attention weights for sat',
          String.raw`Compute $a_j=\exp(s_j)/\sum_i\exp(s_i)$ over the six keys. The displayed weights sum to one.`),
      },
    },
  },
  {
    id: 'ml-transformer-weighted-values',
    lessons: [],
    prompts: ['How does a transformer mix the word values after it has attention weights?'],
    paraphrases: [
      'How does attention use its weights to make a new vector?',
      'What gets added in the weighted sum of the value vectors?',
    ],
    keywords: [
      'mix the word values', 'attention use its weights to make a new vector',
      'weighted sum of the value vectors',
    ],
    useWhen: 'The first head multiplies each value vector by its weight and adds corresponding entries. Show the result as the second visual.',
    spec: valuesStack('Weighted values for sat', String(headWidth)),
    detailSpec: outputStrip('Weighted value output', String(headWidth),
      `Multiply each strip by its weight and add corresponding entries. Each strip shows two of ${headWidth} entries.`),
    depths: {
      overview: {
        spec: valuesStack('Mix values for sat', 'Pair'),
        detailSpec: outputStrip('New values for sat', 'Pair',
          'Give each pair its share and add the first entries together, then the second entries together.'),
      },
      deep: {
        spec: valuesStack('Weighted values for sat', String(headWidth)),
        detailSpec: outputStrip('First head output for sat', String(headWidth),
          String.raw`Sum $z=\sum_j a_j v_j$ using the displayed weights and value entries. Two entries are shown out of ${headWidth}.`),
      },
    },
  },
];
