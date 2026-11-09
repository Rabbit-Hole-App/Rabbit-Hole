import { transformerEncoderReference } from './transformer-encoder-reference.js';

const versioned = diagram => ({ version: 1, diagram });
const stack = (title, blocks, notes = {}) => ({ kind: 'block-stack', title, blocks, ...notes });
const flow = (...steps) => ({ kind: 'flow', steps });
const residual = (from, to = from) => ({ kind: 'residual', from, to });

const briefDecoder = [
  { id: 'an', label: 'Normalize for attention' },
  { id: 'att', label: 'Look back at tokens' },
  { id: 'fn', label: 'Normalize for feed-forward' },
];
const preNormDecoder = [
  { id: 'an', label: 'Pre-attn RMSNorm' },
  { id: 'att', label: 'Causal GQA' },
  { id: 'fn', label: 'Pre-FFN RMSNorm' },
];
const llamaBalanced = [
  { id: 'an', label: 'Pre-RMSNorm 1 (rescale input)' },
  { id: 'att', label: 'Causal grouped-query attention (share key and value heads)' },
  { id: 'fn', label: 'Pre-RMSNorm 2 (rescale before feed-forward)' },
];
const decoderResiduals = [residual('an', 'att'), residual('fn', 'ff')];

function llamaSpec(title, [attentionNorm, attention, feedForwardNorm], feedForward, caption) {
  return versioned(stack(title, [
    { ...attentionNorm, repeat: 32, repeatTo: 'ff' },
    attention,
    feedForwardNorm,
    { id: 'ff', ...feedForward },
  ], { edges: decoderResiduals, caption }));
}

function decoderComparison(sharedBlocks, dense, moe, caption) {
  return versioned({
    kind: 'comparison', variant: 'panels', title: 'Dense vs MoE decoder block', caption,
    panels: [['Dense', dense], ['Mixture of experts', moe]].map(([heading, feedForward]) => ({
      heading,
      diagram: stack(heading, [...sharedBlocks, { id: 'ff', role: 'changed', ...feedForward }], {
        edges: decoderResiduals,
      }),
    })),
  });
}

const gemmaTitle = 'Gemma 3 27B decoder';
const gemmaEmbedding = { id: 'emb', label: 'Token embeddings' };
const gemmaAttention = { id: 'att', label: 'Grouped-query attention', repeat: 62, repeatTo: 'ff' };
const gemmaFeedForward = { id: 'ff', label: 'Gated feed-forward' };

function gemmaSpec(attention, feedForward, notes) {
  return versioned(stack(gemmaTitle, [
    gemmaEmbedding,
    attention,
    feedForward,
    { id: 'norm', label: 'Final RMSNorm' },
    { id: 'out', label: 'Output linear' },
  ], { edges: [residual('att'), residual('ff')], ...notes }));
}

export const architectureReferences = [
  transformerEncoderReference,
  {
    id: 'ml-llama-decoder-block',
    lessons: [],
    prompts: ['What happens inside one Llama-style decoder block?'],
    keywords: [
      'llama-style decoder', 'llama-style block', 'llama decoder block', 'llama decoder layer',
      'llama block', 'llama 3 decoder', 'llama 3 8b decoder', 'llama 3.1 8b decoder',
    ],
    useWhen: 'Use Llama 3.1 8B for the example dimensions and count. Both sublayers add their output to the stream they received before normalization.',
    spec: llamaSpec('Llama-style decoder block', llamaBalanced, { label: 'SwiGLU FFN (update each token)' },
      'Each sublayer adds its result to the token stream.'),
    depths: {
      overview: {
        spec: llamaSpec('Llama-style decoder block', briefDecoder, { label: 'Update token features' },
          'Attention reads the current token and earlier tokens. The final step updates each token on its own.'),
      },
      deep: {
        spec: llamaSpec('Llama 3.1 8B decoder block', [
          { id: 'an', label: 'Pre-RMSNorm 1', dims: '$d=4096$' },
          { id: 'att', label: 'Causal grouped-query attention', inputs: [{ label: 'RoPE' }] },
          { id: 'fn', label: 'Pre-RMSNorm 2' },
        ], { label: 'SwiGLU FFN' }, 'Four query heads share each key/value head pair.'),
      },
    },
  },
  {
    id: 'ml-dense-vs-moe-architecture',
    lessons: [],
    prompts: ['How does a dense decoder block differ from one with mixture-of-experts feed-forward layers?'],
    keywords: [
      'dense vs moe', 'dense versus moe', 'dense and moe', 'dense decoder block',
      'dense decoder layer', 'dense ffn vs', 'dense feed-forward vs', 'dense vs moe feed-forward',
      'dense vs moe decoder', 'moe decoder block', 'mixture-of-experts decoder block',
    ],
    useWhen: 'Compare shared and routed FFNs.',
    spec: decoderComparison(preNormDecoder,
      { label: 'Dense feed-forward', variant: 'SwiGLU' },
      { label: 'MoE feed-forward', variant: 'Token routing' },
      'Dense uses one network. MoE combines selected expert outputs.'),
    depths: {
      overview: {
        spec: decoderComparison(briefDecoder,
          { label: 'Use one network for every token' },
          { label: 'Choose experts for each token' },
          'The experts used can differ from one token to the next.'),
      },
      deep: {
        spec: decoderComparison(preNormDecoder,
          { label: 'SwiGLU FFN', diagram: flow('Project gate and value', 'Apply SiLU and multiply', 'Project down') },
          { label: 'MoE FFN', diagram: flow('Score experts', 'Run top-ranked experts', 'Weight and sum') }),
      },
    },
  },
  {
    id: 'ml-gemma-decoder-stack',
    lessons: [],
    prompts: ['How is the Gemma 3 27B decoder arranged and what is inside its feed-forward block?'],
    keywords: [
      'gemma 3 decoder', 'gemma 3 27b decoder', 'gemma 3 text decoder', 'gemma 3 27b text decoder',
      'decoder in gemma 3', 'gemma 3 27b architecture', 'gemma 3 feed-forward', 'gemma 3 attention schedule',
    ],
    useWhen: 'Use RMSNorm before and after attention and the feed-forward network. SWA means sliding-window attention. In Detailed put the gate in a separate visual. Config https://huggingface.co/mlx-community/gemma-3-27b-it-qat-3bit/blob/main/config.json',
    spec: gemmaSpec({
      ...gemmaAttention, label: 'Grouped-query attention (share key and value heads)',
    }, {
      ...gemmaFeedForward, label: 'Gated GELU FFN (update each token)',
    }, {
      caption: 'Five sliding-window layers precede each global layer. RMSNorm surrounds both sublayers.',
    }),
    depths: {
      overview: {
        spec: versioned(stack(gemmaTitle, [
          gemmaEmbedding,
          { ...gemmaAttention, label: 'Read current and earlier tokens' },
          { ...gemmaFeedForward, label: 'Update each token' },
          { id: 'norm', label: 'Final normalization' },
          { id: 'out', label: 'Score possible next tokens' },
        ])),
      },
      deep: {
        spec: gemmaSpec({
          ...gemmaAttention,
          label: 'Attention',
          inputs: [{ label: 'QK-Norm' }, { label: 'RoPE' }],
          diagram: flow('Apply Pre-RMSNorm 1', 'Use sliding-window and GQA attention (5:1 local to global)', 'Apply Post-RMSNorm 1'),
        }, {
          ...gemmaFeedForward, label: 'FFN', detail: 2,
          diagram: flow('Apply Pre-RMSNorm 2', 'Run Gated GELU FFN', 'Apply Post-RMSNorm 2'),
        }, {
          title: 'Gemma 3 27B',
          callouts: [
            { node: 'emb', label: 'Width', value: '5,376' },
            { node: 'att', label: 'Q/KV heads', value: '32/16' },
            { node: 'ff', label: 'Intermediate', value: '21,504' },
            { node: 'out', label: 'Vocabulary', value: '~262k' },
          ],
        }),
        detailSpec: versioned(stack('Gated FFN', [
          { id: 'gate', label: 'Hidden state', merge: 'multiply',
            inputs: [{ label: 'Linear then GELU' }, { label: 'Linear' }] },
          { id: 'out', label: 'Linear' },
        ])),
      },
    },
  },
];

export const architectureSingleSpecs = {
  'ml-dense-vs-moe-architecture': {
    useWhen: 'Use one matrix to compare the attention path and how each feed-forward sublayer produces its output.',
    spec: versioned({
      kind: 'matrix', layout: 'teaching', title: 'Dense vs MoE decoder block', columns: ['Dense', 'MoE'],
      rows: [
        { id: 'attn', heading: 'Attention path', cells: ['Pre-norm and causal GQA', 'Pre-norm and causal GQA'] },
        { id: 'ffn', heading: 'Feed-forward', cells: ['One shared network', 'Experts selected per token'] },
        { id: 'out', heading: 'Feed-forward result', cells: ['Network output', 'Weighted sum of expert outputs'] },
      ],
      emphasis: { rows: ['ffn', 'out'] },
    }),
  },
};
