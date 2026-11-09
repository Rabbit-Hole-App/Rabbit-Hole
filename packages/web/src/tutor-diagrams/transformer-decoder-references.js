import {
  sentence, queryIndex, decoderPrefix, heads, crossWeights, vocabulary, logits,
  vocabularyWeights, predictedToken, modelWidth, shownWidth, shownHeadWidth, round,
} from './transformer-walkthrough-data.js';

const tokenPositions = sentence.map((word, index) => `${word} ${index + 1}`);
const prefix = decoderPrefix.join(' ');
const { maskedScores, maskedWeights } = heads[0];
const scoreLimit = Math.ceil(Math.max(1, ...maskedScores.flat().filter(Number.isFinite).map(Math.abs)));
const logProbability = round(Math.log(vocabularyWeights[vocabulary.indexOf(predictedToken)]));

function causalHeatmap(title, cells, range, caption, plain = false) {
  return { version: 1, diagram: {
    kind: 'heatmap', title, caption,
    rowLabel: plain ? 'Word looking back' : 'Query position',
    columnLabel: plain ? 'Words it can read' : 'Key position',
    columns: tokenPositions, rows: tokenPositions.map((label, i) => ({ label, cells: cells[i] })), range,
  } };
}

const causalScores = (title, caption, plain) => causalHeatmap(title, maskedScores, { min: -scoreLimit, max: scoreLimit }, caption, plain);
const causalWeights = (title, caption, plain) => causalHeatmap(title, maskedWeights, { min: 0, max: 1 }, caption, plain);

function crossAttention(title, caption) {
  return { version: 1, diagram: {
    kind: 'token-links', title, caption,
    source: decoderPrefix, target: sentence,
    queries: [{ index: queryIndex, weights: crossWeights[queryIndex] }], normalized: true,
  } };
}

function vocabularyBars(title, values, caption) {
  return { version: 1, diagram: {
    kind: 'bar-chart', title, caption,
    bars: vocabulary.map((label, index) => ({ label, value: values[index] })),
  } };
}

function vocabularyRow(title, caption, dimensions = 'Probability') {
  return { version: 1, diagram: {
    kind: 'block-stack', orientation: 'horizontal', title, caption,
    blocks: vocabulary.map((label, index) => ({
      id: label, label,
      ...(label === predictedToken ? { role: 'output' } : {}),
      diagram: { kind: 'tensor', tensor: { rows: 1, columns: 1, dimensions, values: [vocabularyWeights[index]] } },
    })),
  } };
}

export const transformerDecoderReferences = [
  {
    id: 'ml-transformer-causal-mask',
    lessons: [],
    prompts: ['How does the transformer decoder avoid looking ahead at later words?'],
    paraphrases: [
      'What stops a decoder from seeing future words before it predicts them?',
      'Why does the decoder use a causal mask for its own words?',
    ],
    keywords: [
      'decoder avoid looking ahead', 'decoder from seeing future words', 'decoder use a causal mask',
      'causal mask in the decoder', 'masked self attention in the decoder',
    ],
    useWhen: 'Show causal decoder self-attention across the same six positions. Show scores with later keys masked, then the weights normalized only over allowed keys. Follow the sat row.',
    spec: causalScores('Causal mask on decoder scores', 'The mask hides later keys. The “sat” row can score “the”, “cat” and “sat”.'),
    detailSpec: causalWeights('Attention weights after masking', 'Softmax shares one unit of weight across each row’s allowed keys. Masked cells contribute zero.'),
    depths: {
      overview: {
        spec: causalScores('Each word can look back', 'These scores compare words. Gray cells hide later words. “Sat” can look at “the”, “cat” and itself.', true),
        detailSpec: causalWeights('How much each visible word matters', 'Each row shares its attention among the visible words. Hidden words receive none.', true),
      },
      deep: {
        spec: causalScores('Causal masking before softmax', 'Across six positions, add $M_{ij}=-\\infty$ when $j>i$ and $0$ otherwise. Gray cells show the blocked scores.'),
        detailSpec: causalWeights('Row softmax over allowed keys', 'Each row of $A=\\operatorname{softmax}_{\\mathrm{row}}(S+M)$ sums to 1. Masked entries represent zero weight.'),
      },
    },
  },
  {
    id: 'ml-transformer-cross-attention',
    lessons: [],
    prompts: ["How does the decoder use the encoder's words while writing the next word?"],
    paraphrases: [
      'How does cross-attention let the decoder look back at the input sentence?',
      "When the decoder is writing, how do its queries find the encoder's keys?",
    ],
    keywords: [
      'cross attention let the decoder', 'queries find the encoder s keys', 'encoder decoder cross attention',
      'decoder queries encoder keys', 'decoder use the encoder s words',
    ],
    useWhen: 'Use the decoder prefix the cat sat as the query row and the full encoder sentence as the key and value row. This toy copying example can read all encoder positions.',
    spec: crossAttention('Cross-attention to encoder tokens', 'The decoder’s sat query compares with encoder keys. Its weights mix encoder values from all six positions.'),
    depths: {
      overview: {
        spec: crossAttention('Look back at the input sentence', 'The writing side has reached sat. It can use all six words on the reading side to plan the next word.'),
      },
      deep: {
        spec: crossAttention('Decoder query over encoder keys', `The ${shownHeadWidth} shown query components score encoder keys as $qk_j^\\top/\\sqrt{${shownHeadWidth}}$. Softmax across all six keys weights the encoder values.`),
      },
    },
  },
  {
    id: 'ml-transformer-vocabulary-softmax',
    lessons: [],
    prompts: ['How does a transformer turn scores into a guess for the next word?'],
    paraphrases: [
      'How do vocabulary scores become next-token probabilities?',
      'After it reads the cat sat, why would the model predict on as the next word?',
    ],
    keywords: [
      'transformer turn scores into a guess', 'vocabulary scores become next token probabilities',
      'predict on as the next word', 'next word probabilities from logits', 'vocabulary softmax',
    ],
    useWhen: 'Project the decoder state to one logit per word in the six-word toy vocabulary. Apply softmax to these logits. Read the six candidate probabilities in one row and choose the highest for the cat sat.',
    spec: vocabularyBars(`Vocabulary logits after ${prefix}`, logits, 'A linear layer gives each word in the toy vocabulary a raw score.'),
    detailSpec: vocabularyRow('Softmax next-token probabilities', `Normalize across the six toy words. The largest probability predicts ${predictedToken}.`),
    depths: {
      overview: {
        spec: vocabularyRow(`Next word after ${prefix}`, `Of these six sample words, ${predictedToken} has the largest chance.`, 'Chance'),
        detailSpec: null,
      },
      deep: {
        spec: vocabularyBars('Linear projection to vocabulary logits', logits, `Project the ${shownWidth} shown features (${modelWidth} in the full model). $z=hW$ gives one score for each toy word.`),
        detailSpec: vocabularyRow('Vocabulary probabilities', `$p_i=e^{z_i}/\\sum_j e^{z_j}$. “${predictedToken}” wins. $\\log p_{\\mathrm{${predictedToken}}}\\approx ${logProbability}$.`),
      },
    },
  },
];
