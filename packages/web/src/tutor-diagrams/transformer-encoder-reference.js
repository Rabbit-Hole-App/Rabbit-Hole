import { modelWidth, sentence, shownWidth } from './transformer-walkthrough-data.js';

const example = `“${sentence.join(' ')}”`;
const componentLabels = {
  attention: 'Multi-head self-attention',
  attentionNorm: 'LayerNorm of attention sum',
  feedForward: 'Position-wise feed-forward network',
  feedForwardNorm: 'LayerNorm of feed-forward sum',
};

function encoderSpec(title, input, labels, caption) {
  return {
    version: 1,
    diagram: {
      kind: 'block-stack', title, caption,
      blocks: [
        { id: 'emb', ...input, role: 'embedding' },
        { id: 'att', label: labels.attention, role: 'attention', repeat: 6, repeatTo: 'fn' },
        { id: 'an', label: labels.attentionNorm, role: 'norm' },
        { id: 'ff', label: labels.feedForward, role: 'feedforward' },
        { id: 'fn', label: labels.feedForwardNorm, role: 'norm' },
      ],
      edges: [
        { kind: 'residual', from: 'att', to: 'att' },
        { kind: 'residual', from: 'ff', to: 'ff' },
      ],
    },
  };
}

const title = 'Original Transformer encoder';
const embedding = { label: `Embeddings for ${example}` };

export const transformerEncoderReference = {
  id: 'ml-transformer-encoder-stack',
  lessons: [],
  prompts: ['What is inside one transformer encoder layer and why is it repeated?'],
  paraphrases: [
    'What happens to the words inside a transformer encoder layer?',
    'Why repeat the transformer encoder layer?',
  ],
  keywords: [
    'transformer encoder layer', 'transformer encoder block', 'transformer encoder stack',
    'original transformer encoder', 'encoder in the original transformer', 'encoder layers in a transformer',
    'stack encoder layers',
  ],
  useWhen: 'Show the original Transformer encoder. Each of its six layers has separate weights. Add each sublayer output to its input before LayerNorm.',
  spec: encoderSpec(title, embedding, componentLabels,
    'Attention mixes context across words. The feed-forward network updates each word separately.'),
  depths: {
    overview: {
      spec: encoderSpec('How the sentence gains context', { label: `Words in ${example}` }, {
        attention: 'Mix information across words',
        attentionNorm: 'Keep the combined features in scale',
        feedForward: 'Update each word separately',
        feedForwardNorm: 'Keep the updated features in scale',
      }, 'Bring the input back after each update. The next layer starts with the result.'),
    },
    deep: {
      spec: encoderSpec(title, { ...embedding, dims: `$d_{\\mathrm{model}}=${modelWidth}$` }, componentLabels,
        `Each sublayer returns $y=\\operatorname{LayerNorm}(x+F(x))$. ${shownWidth} shown features stand in for ${modelWidth}.`),
    },
  },
};
