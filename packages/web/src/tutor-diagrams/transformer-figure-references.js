import {
  decoderPrefix, heads, headWidth, inputs, modelWidth, positions, predictedToken, projected, queryIndex, round,
  sentence, shownHeadWidth, shownWidth, vocabulary, vocabularyWeights,
} from './transformer-walkthrough-data.js';

const phrase = sentence.join(' ');
const prefix = decoderPrefix.join(' ');
const nextPrefix = [...decoderPrefix, predictedToken].join(' ');
const tokens = sentence.map((word, i) => (i + 1) + ' ' + word);
const reference = (id, prompts, paraphrases, keywords, useWhen, makeSpec) => ({
  id: 'ml-transformer-' + id, lessons: [], prompts, paraphrases, keywords, useWhen,
  spec: makeSpec('balanced'),
  depths: { overview: { spec: makeSpec('brief') }, deep: { spec: makeSpec('detailed') } },
});
const spec = diagram => ({ version: 1, diagram });
const edges = (...pairs) => pairs.map(([from, to, label]) => ({ from, to, ...(label ? { label } : {}) }));
const step = (id, label) => ({ id, label, role: 'process' });
const tensor = (name, dimensions, columns, values) => ({
  tensor: { name, rows: 1, columns, dimensions, ...(values ? { values } : {}) },
});
const brief = depth => depth === 'brief';
const detailed = depth => depth === 'detailed';

const translation = reference('translation-task',
  ['How does a transformer translate a sentence from one language into another?'],
  ['What goes in and comes out of a translation transformer?'],
  ['transformer translate a sentence from one language', 'translation transformer'],
  'Introduce the input and output of a translation Transformer before opening up its blocks. The translation is a task example, not a measured output of the toy model.',
  depth => spec({
    kind: 'flow', title: brief(depth) ? 'One sentence in, another out' : 'Machine translation with a Transformer',
    caption: detailed(depth) ? 'The source stays available while the decoder predicts each target token from the prefix so far.' :
      'The same task maps one ordered sentence to another.',
    nodes: [
      step('source', 'Read “' + phrase + '”'),
      step('convert', brief(depth) ? 'Translate the sentence' : 'Translate with an encoder and decoder'),
      { id: 'target', label: 'Return “le chat est assis sur le tapis”', role: 'outcome' },
    ],
    edges: edges(['source', 'convert'], ['convert', 'target']),
  }));

const memory = reference('encoder-decoder-memory',
  ['How do the encoder and decoder stacks connect in the original Transformer?'],
  ['Where does source memory go between the encoder and decoder stacks?'],
  ['encoder and decoder stacks connect', 'source memory go between the encoder and decoder'],
  'Show two independently parameterized stacks and the decoder receiving both source memory and a target prefix. Show the memory once.',
  depth => spec({
    kind: 'relationship', layout: 'graph', title: brief(depth) ? 'How the two halves work together' : 'Encoder memory feeds the decoder stack',
    caption: detailed(depth) ? 'Six encoder and six decoder layers in the original design. Layers repeat their recipe with separate parameters.' :
      'The source is read once. The writing side can consult it at each step.',
    nodes: [
      { id: 'source', label: 'Source sentence' }, { id: 'encoder', label: brief(depth) ? 'Reading layers' : 'Encoder stack' },
      { id: 'memory', label: brief(depth) ? 'Source notes' : 'Encoded memory' }, { id: 'prefix', label: 'Words written so far' },
      { id: 'decoder', label: brief(depth) ? 'Writing layers' : 'Decoder stack' }, { id: 'next', label: 'Next word' },
    ],
    edges: edges(['source', 'encoder', 'Supplies ordered words'], ['encoder', 'memory', 'Builds source context'],
      ['memory', 'decoder', 'Supplies source context'], ['prefix', 'decoder', 'Supplies earlier words'], ['decoder', 'next', 'Predicts a continuation']),
  }));

const decoder = reference('original-decoder-sublayers',
  ['What are the three sublayers of the original Transformer decoder?'],
  ['What happens inside an original encoder-decoder Transformer decoder layer?'],
  ['three sublayers of the original transformer decoder', 'original encoder decoder transformer decoder layer'],
  'Show the original encoder-decoder architecture. The source memory enters only the middle cross-attention sublayer. Each of the three residuals rejoins before its own normalization.',
  depth => spec({
    kind: 'block-stack', title: brief(depth) ? 'Inside a writing layer' : 'Original Transformer decoder layer',
    caption: detailed(depth) ? 'Each sublayer returns $\\operatorname{LayerNorm}(x+F(x))$. Source keys and values enter only the middle sublayer.' :
      'The first step reads earlier target words. The middle step reads the source. The last updates each word separately.',
    blocks: [
      { id: 'self', label: brief(depth) ? 'Earlier word context' : 'Masked self-attention', role: 'attention', repeat: 6, repeatTo: 'n3' },
      { id: 'n1', label: brief(depth) ? 'First scale check' : 'Self-attention LayerNorm', role: 'norm' },
      { id: 'cross', label: brief(depth) ? 'Source context' : 'Encoder–decoder attention', role: 'attention', inputs: [{ label: brief(depth) ? 'Source notes' : 'Encoder keys and values' }] },
      { id: 'n2', label: brief(depth) ? 'Second scale check' : 'Cross-attention LayerNorm', role: 'norm' },
      { id: 'ffn', label: brief(depth) ? 'Separate word update' : 'Position-wise feed-forward', role: 'feedforward' },
      { id: 'n3', label: brief(depth) ? 'Final scale check' : 'Feed-forward LayerNorm', role: 'norm' },
    ],
    edges: ['self', 'cross', 'ffn'].map(id => ({ kind: 'residual', from: id, to: id })),
  }));

const positionwise = reference('positionwise-feedforward',
  ['Why does attention mix words while the feed-forward network is position-wise?'],
  ['Does the same feed-forward network run independently on each token after attention?'],
  ['attention mix words while the feed forward', 'same feed forward network run independently'],
  'Contrast cross-position mixing with independent updates using shared feed-forward parameters. Illustrate two positions from the shared sentence without implying attention has only two inputs.',
  depth => spec({
    kind: 'relationship', layout: 'graph', title: brief(depth) ? 'Words share context, then update separately' : 'Context mixing versus position-wise updates',
    caption: detailed(depth) ? 'Shown for two positions. The same $f$ updates each contextual vector $z_i$ independently. Its output feeds the next layer.' :
      'Only two positions are shown. Each receives context, then the same rule updates it on its own.',
    nodes: [
      { id: 'cat', label: 'cat before mixing' }, { id: 'sat', label: 'sat before mixing' },
      { id: 'catMix', label: 'cat with context' }, { id: 'satMix', label: 'sat with context' },
      { id: 'catNext', label: 'cat after update' }, { id: 'satNext', label: 'sat after update' },
    ],
    edges: edges(['cat', 'catMix', 'Contributes its own value'], ['sat', 'satMix', 'Contributes its own value'],
      ['cat', 'satMix', 'Contributes nearby context'], ['sat', 'catMix', 'Contributes nearby context'],
      ['catMix', 'catNext', 'Runs the shared update'], ['satMix', 'satNext', 'Runs the shared update']),
  }));

const distantQuery = sentence.length - 1;
const distantWeights = heads[1].weights[distantQuery];
const distantAttention = reference('attention-across-distance',
  ['Can self-attention give a distant word more weight than its neighbor?'],
  ['Why can the strongest attention link skip over the words in between?'],
  ['self attention give a distant word more weight', 'strongest attention link skip over the words'],
  'Use the second head from the shared toy sentence. The last position reads the first occurrence of the more strongly than its immediate neighbor, another occurrence of the.',
  depth => spec({
    kind: 'token-links', title: brief(depth) ? 'A word can read far back' : 'Attention weight and token distance',
    caption: detailed(depth) ? `For “mat”, head two assigns $${distantWeights[0]}$ to the first “the” and $${distantWeights[4]}$ to the “the” beside it.` :
      'The first “the” gets more weight than the copy next to “mat”.',
    source: sentence, target: sentence, queries: [{ index: distantQuery, weights: distantWeights }], normalized: true,
  }));

const batchProjection = reference('batched-qkv',
  ['How does a Transformer project all tokens into Q, K, and V at once?'],
  ['How do batched QKV projections keep one row for each token?'],
  ['batched qkv projections', 'project all tokens into q k and v at once'],
  'Keep one matrix row per input token. Multiplying the entire input matrix by each learned matrix changes feature width, while token order is preserved.',
  depth => spec({
    kind: 'matrix', title: brief(depth) ? 'One row for every word' : 'Project every token in one matrix operation',
    caption: detailed(depth) ? '$Q=XW_Q$, $K=XW_K$, $V=XW_V$. Each multiplication keeps one row per token.' :
      'Apply each learned rule to the full input. The word positions keep their order.',
    columns: ['Rows', 'Entries per row'],
    rows: [
      { heading: brief(depth) ? 'Input words' : 'Input matrix', cells: [String(sentence.length), String(modelWidth)] },
      { heading: brief(depth) ? 'Ask rows' : 'Queries', cells: [String(sentence.length), String(headWidth)] },
      { heading: brief(depth) ? 'Match rows' : 'Keys', cells: [String(sentence.length), String(headWidth)] },
      { heading: brief(depth) ? 'Share rows' : 'Values', cells: [String(sentence.length), String(headWidth)] },
    ],
  }));

function shortWeights(weights) {
  const cents = weights.map(value => Math.round(value * 100));
  cents[weights.indexOf(Math.max(...weights))] += 100 - cents.reduce((sum, value) => sum + value, 0);
  return cents.map(value => value / 100);
}
const attentionGrid = reference('batched-attention',
  ['How does the full attention matrix give an output for every query token?'],
  ['Why does each query row in the attention matrix add to one?'],
  ['full attention matrix give an output for every query', 'each query row in the attention matrix add to one'],
  'Show the weight matrix for one head. The rows are queries; columns are keys. Apply softmax within each query row and multiply by the value matrix.',
  depth => spec({
    kind: 'heatmap', title: brief(depth) ? 'Each word shares its attention' : 'One attention distribution per query',
    caption: detailed(depth) ? '$A=\\operatorname{softmax}_{\\rm row}(QK^T/\\sqrt{d_k})$. Each row mixes the value vectors to give one row of $AV$.' :
      'Read across each row. The six shares add to one and tell the model how much of each value to mix.',
    columns: tokens, rows: heads[0].weights.map((weights, i) => ({ label: tokens[i], cells: shortWeights(weights) })),
    range: { min: 0, max: 1 },
  }));

const positionGrid = reference('position-heatmap',
  ['Can I see the sinusoidal positional encoding as a heatmap across the sentence?'],
  ['What do the alternating sine and cosine columns of a position encoding look like?'],
  ['positional encoding as a heatmap', 'sine and cosine columns of a position encoding'],
  'Use the same position features that the walkthrough adds to its embeddings. Show four displayed channels as two sine/cosine pairs.',
  depth => spec({
    kind: 'heatmap', title: brief(depth) ? 'Each position gets its own pattern' : 'Fast and slow position signals',
    caption: detailed(depth) ? 'The toy channels are $\\sin(p)$, $\\cos(p)$, $\\sin(p/100)$ and $\\cos(p/100)$. Row one uses $p=0$.' :
      'Read down each column. Some signals change rapidly while others change gradually. Add the row to that word’s embedding.',
    columns: brief(depth) ? ['Fast one', 'Fast two', 'Slow one', 'Slow two'] : ['Fast sine', 'Fast cosine', 'Slow sine', 'Slow cosine'],
    rows: positions.map((cells, index) => ({ label: tokens[index], cells })),
    range: { min: -1, max: 1 },
  }));

const input = inputs[queryIndex];
const update = projected[queryIndex];
const residual = input.map((value, index) => round(value + update[index]));
const mean = residual.reduce((sum, value) => sum + value, 0) / shownWidth;
const deviation = Math.sqrt(residual.reduce((sum, value) => sum + (value - mean) ** 2, 0) / shownWidth);
const normalized = residual.map(value => round((value - mean) / deviation));
const modelDims = '1 × ' + modelWidth;
const residualArithmetic = reference('residual-arithmetic',
  ['Can you show the actual numbers for residual addition and LayerNorm in a Transformer?'],
  ['How does add and norm work on a small vector with numbers?'],
  ['actual numbers for residual addition and layernorm', 'add and norm work on a small vector'],
  'Show the residual addition first and the normalization second, using the same sat input and projected attention update. Omit learned scale, bias and epsilon in the toy math.',
  depth => spec({
    kind: 'transformation', title: brief(depth) ? 'Keep the old values and add the update' : 'A worked residual add and normalization',
    caption: detailed(depth) ? 'Subtract the mean and divide by the standard deviation: $y_i=(s_i-\\mu)/\\sigma$. Learned scale and bias omitted.' :
      'Add matching entries. Then center the sum and rescale it. The four visible entries are the toy example.',
    before: { label: 'Inputs for sat', items: [tensor('Original', modelDims, shownWidth, input), tensor('Update', modelDims, shownWidth, update)] },
    operation: 'Add corresponding entries, then center and rescale',
    after: { label: 'Result', items: [tensor('Sum', modelDims, shownWidth, residual), tensor('Rescaled', modelDims, shownWidth, normalized)] },
  }));

const generation = reference('autoregressive-prefix',
  ['How does Transformer decoding append a word and feed it back in?'],
  ['Does the encoder run again after each generated word in autoregressive decoding?'],
  ['decoding append a word and feed it back', 'encoder run again after each generated word'],
  'Separate the encoder’s reusable memory from the growing decoder prefix. Show a computed next token and the following call, without claiming a prediction for the call that is not computed.',
  depth => spec({
    kind: 'sequence', title: brief(depth) ? 'The next word becomes part of the input' : 'Autoregressive decoding grows the prefix',
    caption: detailed(depth) ? 'Keep encoder memory fixed. Each decoder call estimates $P(y_{t+1}\\mid y_{\\le t},\\text{source})$ until a stop condition.' :
      'Reuse the source notes. Append each new word to the input for the next call.',
    actors: [
      { id: 'memory', label: brief(depth) ? 'Source notes' : 'Encoder memory' },
      { id: 'decoder', label: brief(depth) ? 'Word predictor' : 'Decoder' }, { id: 'prefix', label: 'Growing text' },
    ],
    messages: [
      { from: 'memory', to: 'decoder', label: 'Provide source context' },
      { from: 'prefix', to: 'decoder', label: 'Send “' + prefix + '”' },
      { from: 'decoder', to: 'prefix', label: 'Return “' + predictedToken + '”' },
      { from: 'prefix', to: 'decoder', label: 'Send “' + nextPrefix + '”' },
    ],
  }));

const correctIndex = vocabulary.indexOf(predictedToken);
const nextTokenTarget = reference('one-hot-target',
  ['How does next-token training compare a probability vector with a one-hot target?'],
  ['How do vocabulary slots line up with the one-hot label for the next word?'],
  ['probability vector with a one hot target', 'vocabulary slots line up with the one hot label'],
  'Use the shared vocabulary order in both columns. The predicted probability is the same value used for on in the walkthrough. The target assigns one only to the observed next word.',
  depth => spec({
    kind: 'matrix', title: brief(depth) ? 'Guess and answer share word slots' : 'Prediction and target share a vocabulary',
    caption: detailed(depth) ? 'Only on is marked in the target. Its loss is $-\\ln(' + vocabularyWeights[correctIndex] + ')\\approx ' +
      round(-Math.log(vocabularyWeights[correctIndex])) + '$.' : 'Every word keeps the same row. The answer column marks just the observed next word.',
    columns: [brief(depth) ? 'Model guess' : 'Predicted share', brief(depth) ? 'Answer' : 'One-hot target'],
    rows: vocabulary.map((heading, index) => ({ heading, cells: [String(vocabularyWeights[index]), index === correctIndex ? '1' : '0'] })),
  }));

const targetsByPosition = reference('shifted-targets',
  ['Why are the target labels shifted by one word when training a Transformer?'],
  ['How does teacher forcing assign a next-word target to each prefix?'],
  ['target labels shifted by one word', 'teacher forcing assign a next word target'],
  'Use one shared sentence. At each shown position, the input prefix ends one token before the observed target; teacher forcing uses the observed words, even if the model guesses wrong.',
  depth => spec({
    kind: 'matrix', title: brief(depth) ? 'Every prefix has a next word' : 'Shift targets by one position',
    caption: detailed(depth) ? 'At position $t$, the target is $y_{t+1}$. Teacher forcing supplies observed tokens to the input prefix.' :
      'The answer for each row is the next word in the original sentence.',
    columns: ['Text so far', 'Next word'],
    rows: sentence.slice(1).map((target, index) => ({ heading: 'Position ' + (index + 1), cells: [sentence.slice(0, index + 1).join(' '), target] })),
  }));

const loss = reference('vocabulary-cross-entropy',
  ['Why does next-token cross-entropy fall when the model gives the correct word more probability?'],
  ['How does raising the target token probability change the language-model loss?'],
  ['next token cross entropy fall', 'raising the target token probability change'],
  'Start from the worked vocabulary probability for on. Compare its negative log with a hypothetical better prediction and label that second probability illustrative.',
  depth => {
    const observed = vocabularyWeights[correctIndex];
    const improved = 0.8;
    return spec({
      kind: 'bar-chart', title: brief(depth) ? 'A better guess has a smaller penalty' : 'Probability assigned to the answer controls loss',
      caption: detailed(depth) ? 'Worked $p=' + observed + '$ and hypothetical $p=' + improved + '$. Plot $-\\ln(p)$ in both cases.' :
        'The first bar uses the walkthrough guess for on. The second uses an illustrative, more confident correct guess.',
      bars: [
        { label: 'Worked guess', value: round(-Math.log(observed)) },
        { label: 'Improved guess', value: round(-Math.log(improved)) },
      ],
    });
  });

export const transformerFigureReferences = [
  translation, memory, decoder, positionwise, distantAttention, batchProjection, attentionGrid, positionGrid,
  residualArithmetic, generation, nextTokenTarget, targetsByPosition, loss,
];
