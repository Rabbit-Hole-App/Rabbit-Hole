import { decoderShapes, expertShapes, latentShapes, layerLocalShapes, router, vocabShapes } from './figure-capacity-data.js';

const brief = depth => depth === 'overview';
const detailed = depth => depth === 'deep';
const document = diagram => ({ version: 1, diagram });

function reference(id, prompt, paraphrase, keywords, useWhen, makeDiagram, makeDetail) {
  return {
    id, lessons: [], prompts: [prompt], paraphrases: [paraphrase], keywords, useWhen,
    spec: document(makeDiagram('standard')),
    depths: {
      overview: { spec: document(makeDiagram('overview')) },
      deep: { spec: document(makeDiagram('deep')), ...(makeDetail ? { detailSpec: document(makeDetail()) } : {}) },
    },
  };
}

function matrix(title, columns, rows, caption) {
  return {
    kind: 'matrix', layout: 'teaching', title, columns,
    rows: rows.map(([heading, ...values], i) => ({ id: 'r' + (i + 1), heading, cells: values.map(String) })),
    caption,
  };
}

function compare(title, examples, fields, caption) {
  return matrix(title, examples.map(example => example.label),
    fields.map(([heading, key]) => [heading, ...examples.map(example => example[key])]), caption);
}

const depthAndWidth = reference('figure-decoder-depth-and-width-knobs',
  'How can a decoder have more layers but a narrower token state?',
  'Can I increase the feed-forward width without changing decoder state width?',
  ['more layers but a narrower token state', 'feed forward width without changing decoder state width', 'decoder depth state width and ffn width'],
  'Compare decoder layer count, residual-stream width and the temporary feed-forward width as separate knobs. The block recipe and attention sharing stay fixed. These are toy settings without an equal-parameter claim.',
  depth => compare(brief(depth) ? 'Three ways to change the size of a model' : 'Decoder depth, state width and feed-forward width', decoderShapes, [
    ['Layers', 'layers'],
    [brief(depth) ? 'State size' : 'State width', 'state'],
    [brief(depth) ? 'Update size' : 'FFN width', 'update'],
  ], detailed(depth) ? 'Every toy layer uses 8 query heads and 2 key/value groups. The feed-forward map expands $d$ to $m$ and returns to $d$.' :
    'Every variant uses the same kind of layer. Compare the layer count, carried features, and temporary features in the update.'),
  () => ({
    kind: 'block-stack', title: 'One repeated recipe',
    blocks: [
      { id: 'state', label: 'Incoming token state', role: 'embedding', dims: 'd=' + decoderShapes[0].state },
      { id: 'mix', label: 'Normalized grouped-query attention', role: 'attention', repeat: decoderShapes[0].layers, repeatTo: 'update' },
      { id: 'update', label: 'Dense feed-forward', role: 'feedforward', dims: 'm=' + decoderShapes[0].update },
      { id: 'return', label: 'Outgoing token state', role: 'output', dims: 'd=' + decoderShapes[0].state },
    ],
    caption: 'The base toy stack repeats the same recipe with separate weights in every layer.',
  }));

const vocabulary = reference('figure-vocabulary-interface-width',
  'How does a bigger vocabulary change the lookup and output while the decoder width stays fixed?',
  'What is the difference between vocabulary size and residual stream width?',
  ['bigger vocabulary change the lookup and output', 'vocabulary size and residual stream width'],
  'Follow one token from an embedding lookup into the residual stream and then to a vocabulary-sized logit vector. Compare two toy vocabularies at the same decoder width.',
  depth => ({
    kind: 'block-stack',
    title: brief(depth) ? 'Word choices and internal features count different things' : 'The vocabulary interface around a decoder',
    blocks: [
      { id: 'lookup', label: brief(depth) ? 'Word lookup' : 'Embedding lookup', role: 'embedding',
        ...(brief(depth) ? {} : { dims: 'V=' + vocabShapes[0].size }) },
      { id: 'state', label: brief(depth) ? 'Features for one word' : 'Residual token state',
        ...(brief(depth) ? {} : { dims: 'd=' + vocabShapes[0].state }) },
      { id: 'core', label: brief(depth) ? 'Reading layers' : 'Decoder layers', role: 'attention', repeat: decoderShapes[0].layers },
      { id: 'out', label: brief(depth) ? 'Score for every word choice' : 'Vocabulary logits', role: 'output',
        ...(brief(depth) ? {} : { dims: 'V=' + vocabShapes[0].size }) },
    ],
    caption: detailed(depth) ? 'Lookup reads one row from $V\\times d$. The decoder carries $d$ features, and the output projection gives $V$ logits.' :
      'One row becomes the features for a token. The last layer scores every choice in the vocabulary.',
  }),
  () => matrix('More vocabulary rows, same state width', ['Vocabulary A', 'Vocabulary B'], [
    ['Token entries', ...vocabShapes.map(({ size }) => size)],
    ['Features per token', ...vocabShapes.map(({ state }) => state)],
    ['Tied interface weights', ...vocabShapes.map(({ tiedWeights }) => tiedWeights)],
  ], 'For tied input and output weights, this toy interface contains one table of $Vd$ weights.'));

const latentAttention = reference('figure-latent-attention-and-expert-bank-knobs',
  'Can latent attention add more query heads while keeping the same compressed cache?',
  'How can the number of attention heads and the expert bank size change independently in a latent attention decoder?',
  ['latent attention add more query heads', 'attention heads and the expert bank size change independently'],
  'Hold one compressed attention cache and the selected expert paths constant. Compare adding query heads with expanding the available bank. Keep the toy cache width separate from the decoder and expert widths.',
  depth => compare(brief(depth) ? 'More readers and more specialists are separate choices' : 'Query heads and expert-bank capacity vary separately', latentShapes, [
    [brief(depth) ? 'Attention readers' : 'Query heads', 'query'],
    [brief(depth) ? 'Saved features per token' : 'Cached features per token', 'cache'],
    [brief(depth) ? 'Available specialists' : 'Routed experts in bank', 'bank'],
    [brief(depth) ? 'Specialists used' : 'Selected experts per token', 'active'],
  ], detailed(depth) ? 'The toy cache keeps 12 content and 4 position features per token. The same expert pair runs in every variant.' :
    'The saved record and the selected expert pair stay fixed. Each variant changes a different capacity choice.'));

const expertCapacity = reference('figure-routed-expert-parameter-split',
  'How can a model double its expert bank but use the same number of expert weights per token?',
  'How do the expert count and expert width affect active parameter count in a mixture of experts?',
  ['double its expert bank', 'expert width affect active parameter count'],
  'Distinguish stored routed-expert weights from the weights used by one token. Hold selection count and input width fixed. Show how larger expert networks and a bigger bank change different totals.',
  depth => compare(brief(depth) ? 'Weights available and weights used' : 'Total and active weights in a routed layer', expertShapes, [
    [brief(depth) ? 'Available specialists' : detailed(depth) ? 'Experts in bank $N$' : 'Experts in bank', 'pool'],
    [brief(depth) ? 'Specialists used' : detailed(depth) ? 'Experts used $k$' : 'Experts used per token', 'active'],
    [brief(depth) ? 'Features per specialist' : detailed(depth) ? 'Expert inner width $m$' : 'Expert inner width', 'width'],
    ['Stored expert weights', 'bankWeights'],
    ['Expert weights used', 'usedWeights'],
  ], detailed(depth) ? 'With bias-free experts at $d=48$, the bank has $3dmN$ weights and one token uses $3dmk$. Count the router and shared branch separately.' :
    'The router and shared branches are counted separately. Each toy token still uses two routed experts.'),
  () => matrix('Normalize the two selected route weights', ['Gate strength', 'Mixture weight'], router.map(({ name, strength, weight }) => [
    name, strength, weight,
  ]), 'Keep strengths 9 and 6, then divide each by their sum of 15. Unselected experts contribute zero.'));

const layerLocalCapacity = reference('figure-layer-local-inputs-and-group-counts',
  'What changes when a decoder with per-layer embeddings gets wider and uses more key-value groups?',
  'Can layer-specific embeddings stay while the decoder increases its GQA group count?',
  ['per layer embeddings gets wider', 'layer specific embeddings stay while the decoder increases its gqa group count'],
  'Compare two toy decoders with the same layer-specific embedding path and grouped-query rule. Change the state width and the number of key/value groups while holding the number of query heads fixed.',
  depth => compare(brief(depth) ? 'Keep the same layer inputs as the model grows' : 'State width and key/value groups can grow together', layerLocalShapes, [
    [brief(depth) ? 'Features per token' : 'Residual state width', 'state'],
    [brief(depth) ? 'Attention readers' : 'Query heads', 'query'],
    [brief(depth) ? 'Memory groups' : 'Key/value groups', 'groups'],
    [brief(depth) ? 'Readers per group' : 'Queries per key/value group', 'readersPerGroup'],
  ], detailed(depth) ? 'Divide 12 query heads among 3 or 6 groups. Both toy sizes keep the same per-layer embedding path.' :
    'Both sizes keep a layer-specific lookup. With more groups, fewer readers share each group.'));

export const figureCapacityReferences = [depthAndWidth, vocabulary, latentAttention, expertCapacity, layerLocalCapacity];
