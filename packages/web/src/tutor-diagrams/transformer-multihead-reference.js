import { concatenated, heads, headWidth, modelWidth, projected, queryIndex, sentence } from './transformer-walkthrough-data.js';

function patterns(title, caption) {
  return {
    version: 1,
    diagram: {
      kind: 'token-links', title,
      source: ['sat A', 'sat B'], target: sentence,
      queries: heads.map((head, index) => ({ index, weights: head.weights[queryIndex] })),
      normalized: true,
      caption,
    },
  };
}

function strip(name, values, dimensions, role) {
  return { tensor: { rows: 1, columns: values.length, dimensions, name, values, role } };
}

function outputProjection({ title, operation, caption, brief = false }) {
  const headShape = brief ? `Width ${headWidth}` : `1 × ${headWidth}`;
  const modelShape = brief ? `Width ${modelWidth}` : `1 × ${modelWidth}`;
  return {
    version: 1,
    diagram: {
      kind: 'transformation', title,
      before: { label: 'Head outputs', items: [
        strip('Head A', heads[0].outputs[queryIndex], headShape, 'input'),
        strip('Head B', heads[1].outputs[queryIndex], headShape, 'input'),
      ] },
      after: { label: 'Two steps in order', items: [
        strip('Joined heads', concatenated[queryIndex], modelShape, 'output'),
        strip('Projected output', projected[queryIndex], modelShape, 'output'),
      ] },
      operation, caption,
    },
  };
}

export const transformerMultiheadReference = {
  id: 'ml-transformer-parallel-attention-heads',
  lessons: [],
  prompts: ['Why does a transformer use more than one attention head?'],
  paraphrases: [
    'Can two attention heads focus on different words in the same sentence?',
    'What happens to the outputs of different attention heads?',
  ],
  keywords: [
    'more than one attention head', 'two attention heads focus',
    'outputs of different attention heads', 'concatenate attention head outputs',
  ],
  useWhen: 'Compare two heads for sat over the same six tokens. Each head uses its own projections. Show their outputs joined in order and then mixed by the output matrix.',
  spec: patterns('Two attention heads for sat', 'Heads A and B both query sat. Each head uses its own projections and can emphasize a different word.'),
  detailSpec: outputProjection({
    title: 'Concatenate and project the head outputs',
    operation: 'Concatenate the heads, then project',
    caption: 'Put the outputs in head order, then use a learned matrix to mix the four example entries.',
  }),
  depths: {
    overview: {
      spec: patterns('Two ways to read the same sentence', 'Heads A and B both read sat. A thicker arrow means that word matters more to that head.'),
      detailSpec: outputProjection({
        brief: true,
        title: 'Join and mix the two results',
        operation: 'Put the results side by side, then mix them',
        caption: 'Keep the first head before the second. The model mixes the joined values to update sat.',
      }),
    },
    deep: {
      spec: patterns('Parallel self-attention heads for sat', String.raw`Both queries are sat. Each head computes $a=\operatorname{softmax}(qK^{\mathsf{T}}/\sqrt{d_k})$ with $d_k=2$ in this example.`),
      detailSpec: outputProjection({
        title: 'Output projection for sat',
        operation: 'Concatenate the heads, then apply $W_O$',
        caption: String.raw`$z=\operatorname{Concat}(h_1,h_2)W_O$. The four example entries represent a 512-wide model.`,
      }),
    },
  },
};
