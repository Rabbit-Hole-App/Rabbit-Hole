// Projection mechanism and example dimensions from The Illustrated Transformer.
// https://jalammar.github.io/illustrated-transformer/#self-attention-in-detail
export const tensorReferences = [{
  id: 'ml-transformer-qkv-projections', lessons: [],
  prompts: ['How does a transformer get query, key and value vectors from one token?'],
  keywords: ['query key and value vectors', 'qkv projections', 'learned weight matrices'],
  useWhen: 'Project one token embedding through three separate learned matrices. The strips show excerpts of the full vectors.',
  spec: {
    version: 1,
    diagram: {
      kind: 'transformation', title: 'One token, three attention projections',
      before: { label: 'Token embedding', items: [
        { tensor: { rows: 1, columns: 4, dimensions: '1 × 512', name: 'x', values: [0.2, -0.1, 0.7, 0.4], role: 'input' } },
      ] },
      after: { label: 'Projected vectors', items: [
        { tensor: { rows: 1, columns: 3, dimensions: '1 × 64', name: 'Query q', role: 'output' } },
        { tensor: { rows: 1, columns: 3, dimensions: '1 × 64', name: 'Key k', role: 'output' } },
        { tensor: { rows: 1, columns: 3, dimensions: '1 × 64', name: 'Value v', role: 'output' } },
      ] },
      operation: 'Multiply by the learned weight matrices',
      links: [{ from: 0, to: 0 }, { from: 0, to: 1 }, { from: 0, to: 2 }],
      caption: 'The cells illustrate part of each vector for one attention head.',
    },
  },
}];
