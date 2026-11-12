import {
  continuation, embeddingAt, embeddingTable, logits, modelSizes, musicTokenIds,
  notes, positions, prefix, probability, qkv, sampleAt, sampled, scoringState, vocab,
} from './gpt2-figure-data.js';

const promptText = prefix.join(' ');
const completed = promptText + ' ' + continuation;
const brief = depth => depth === 'overview';
const detailed = depth => depth === 'deep';
const document = diagram => ({ version: 1, diagram });
const row = (heading, ...cells) => ({ heading, cells });
const vector = values => '$[' + values.join(', ') + ']$';
const tensor = (name, values) => ({
  tensor: { name, rows: 1, columns: values.length, dimensions: '1 × ' + values.length, values },
});
const number = value => Number(value.toFixed(3));

function reference(id, lessons, prompt, paraphrase, keywords, useWhen, makeDiagram, makeDetail) {
  return {
    id: 'ml-gpt2-' + id,
    lessons,
    prompts: [prompt],
    paraphrases: [paraphrase],
    keywords,
    useWhen,
    spec: document(makeDiagram('standard')),
    depths: {
      overview: { spec: document(makeDiagram('overview')) },
      deep: {
        spec: document(makeDiagram('deep')),
        ...(makeDetail ? { detailSpec: document(makeDetail()) } : {}),
      },
    },
  };
}

const generation = reference('continue-prefix', ['01'],
  'How does GPT-2 generate text one token at a time?',
  'Why does GPT-2 feed its own predicted token back into the prompt?',
  ['gpt 2 generate text one token at a time', 'gpt 2 feed its own predicted token'],
  'Show one decoder-only continuation step and the enlarged prefix for the next call. The worked example chooses the highest-scoring token from the shared toy vocabulary.',
  depth => ({
    kind: 'timeline',
    title: brief(depth) ? 'Each new word joins the prompt' : 'Autoregressive text generation in GPT-2',
    events: [
      { time: 'Prompt', label: 'Read “' + promptText + '”', detail: 'An empty prompt can start from a special token.' },
      { time: 'First step', label: 'Choose “' + continuation + '”' },
      { time: 'Second step', label: 'Use “' + completed + '” as the prefix' },
    ],
    caption: detailed(depth) ? 'Each step predicts one token conditioned on the full prefix. This example chooses the highest score at the first step.' :
      'Each choice becomes part of what the model reads on the next step.',
  }),
  () => ({
    kind: 'bar-chart',
    title: 'One set of possible continuations',
    bars: vocab.map((label, i) => ({ label, value: probability[i] })),
    caption: 'Toy probabilities for “' + promptText + '”. The largest bar gives “' + continuation + '” with greedy selection.',
  }));

const sizes = reference('parameter-counts', ['19'],
  'Why do the different GPT-2 sizes have such different parameter counts?',
  'How do GPT-2 layer count and width add up to the total number of weights?',
  ['gpt 2 sizes have such different parameter counts', 'gpt 2 layer count and width add up'],
  'Use a smaller family with the GPT-2 block recipe. Count layer weights, biases and normalization parameters, both lookup tables and the final normalization. The language-model head reuses the token table.',
  depth => ({
    kind: 'matrix',
    title: brief(depth) ? 'Wider and deeper models have more weights' : 'How GPT-2-style model sizes scale',
    columns: [brief(depth) ? 'Layers' : 'Decoder layers', brief(depth) ? 'Features' : 'Model width', 'Toy parameters'],
    rows: modelSizes.map(({ label, layers, width, total }) => row(label, String(layers), String(width), String(total))),
    caption: detailed(depth) ? 'Toy counts use the same vocabulary and context capacity. A block of width $d$ has $12d^2+13d$ parameters when its MLP is four times wider.' :
      'These are toy sizes. A wider layer uses larger matrices, and each extra layer adds its own weights.',
  }),
  () => {
    const { layers, block, token, position, finalNorm } = modelSizes[0];
    return {
      kind: 'waterfall',
      title: 'Count the small toy model',
      opening: 0,
      changes: [
        { label: 'Token table', amount: token },
        { label: 'Position table', amount: position },
        { label: 'Decoder blocks', amount: layers * block },
        { label: 'Final norm', amount: finalNorm },
      ],
      caption: 'The output projection reuses the token table. Each repeated decoder block contributes its own parameters.',
    };
  });

const architecture = reference('context-architecture', [],
  'What is the difference between GPT-2, BERT, and Transformer-XL?',
  'How do the context rules differ across GPT-2, BERT, and Transformer-XL?',
  ['difference between gpt 2 bert and transformer xl', 'context rules differ across gpt 2 bert and transformer xl'],
  'Compare the contexts available to each architecture. In the detail, show one repeated GPT-2 decoder block with positionwise processing and no separate source encoder.',
  depth => ({
    kind: 'matrix',
    title: brief(depth) ? 'Three ways to use earlier and later words' : 'Context in GPT-2, BERT and Transformer-XL',
    columns: [brief(depth) ? 'What it can read' : 'Attention context', brief(depth) ? 'Example job' : 'Example objective'],
    rows: [
      row('GPT-2', brief(depth) ? 'Earlier words in the prompt' : 'Causal attention within context', 'Predict the next token'),
      row('BERT', brief(depth) ? 'Words on both sides' : 'Bidirectional encoder', 'Recover hidden words'),
      row('Transformer-XL', brief(depth) ? 'Notes from earlier sections' : 'Causal plus earlier-segment memory', 'Predict across segment breaks'),
    ],
    caption: detailed(depth) ? 'Transformer-XL passes earlier segment states to later segments. GPT-2 has a fixed maximum context size.' :
      'The context rule determines what the model can consult at each position.',
  }),
  () => ({
    kind: 'block-stack',
    title: 'Follow one token through a GPT-2-style stack',
    blocks: [
      { id: 'in', label: 'Token and position features', role: 'embedding' },
      { id: 'block', label: 'Causal decoder block', role: 'attention', repeat: modelSizes[0].layers,
        diagram: { kind: 'flow', steps: [
          { label: 'Attention LayerNorm', role: 'norm' }, { label: 'Masked self-attention', role: 'attention' },
          { label: 'MLP LayerNorm', role: 'norm' }, { label: 'Positionwise feed-forward', role: 'feedforward' },
        ] } },
      { id: 'out', label: 'Contextual feature vector', role: 'output' },
    ],
    caption: 'The toy stack has two blocks. The real block has residual additions around attention and the feed-forward network.',
  }));

const cache = reference('decode-cache', [],
  'How does the KV cache help GPT-2 reuse work while generating?',
  'What does GPT-2 keep in its key and value cache between token steps?',
  ['kv cache help gpt 2 reuse work', 'gpt 2 keep in its key and value cache'],
  'Follow two steps in one decoder layer. The current token supplies a fresh query, key and value. Keep its key and value for future steps and read the full cache for attention.',
  depth => ({
    kind: 'sequence',
    title: brief(depth) ? 'Keep the pieces later words will need' : 'Reuse keys and values during GPT-2 decoding',
    actors: [
      { id: 'block', label: brief(depth) ? 'Reading layer' : 'Decoder block' },
      { id: 'cache', label: brief(depth) ? 'Saved pieces' : 'Key and value cache' },
    ],
    messages: [
      { from: 'block', to: 'cache', label: brief(depth) ? 'Save pieces for “light”' : 'Append the key and value for “light”' },
      { from: 'cache', to: 'block', label: brief(depth) ? 'Return pieces for the prompt' : 'Return pairs for the whole prefix' },
      { from: 'block', to: 'cache', label: brief(depth) ? 'Save pieces for “' + continuation + '”' : 'Append the key and value for “' + continuation + '”' },
      { from: 'cache', to: 'block', label: 'Return earlier entries and the new pair' },
    ],
    caption: detailed(depth) ? 'Each decoder layer keeps its own pairs. The current query reads those pairs. Earlier tokens need no new projections.' :
      'Reuse what earlier tokens computed. Add one pair for the current token at each step.',
  }));

const lookup = reference('learned-position-lookup', ['08'],
  'How does GPT-2 add its learned position embeddings to token embeddings?',
  'Where does GPT-2 look up the position vector before the first decoder block?',
  ['gpt 2 add its learned position embeddings', 'gpt 2 look up the position vector'],
  'Use separate learned lookup tables for token identity and absolute position. Add their equally wide vectors before the first block.',
  depth => ({
    kind: 'transformation',
    title: brief(depth) ? 'A word gets features for its identity and place' : 'Learned token and position lookups in GPT-2',
    before: {
      label: 'Two inputs',
      items: brief(depth) ? ['Features for “light”', 'Features for the third spot'] :
        [tensor('Token “light”', embeddingTable[2]), tensor('Third position', positions[2])],
    },
    after: {
      label: 'First block input',
      items: brief(depth) ? ['“light” at the third spot'] : [tensor('Combined features', embeddingAt('light', 2))],
    },
    operation: 'Add matching features from the two lookups',
    caption: detailed(depth) ? 'The toy input is $h_0=e_{\\rm token}+e_{\\rm position}$. The position lookup uses index 2 for the third token.' :
      'One table is indexed by the token. The other is indexed by its place in the prompt.',
  }));

const tiedOutput = reference('tied-output-weights', ['03', '08'],
  'Why does GPT-2 reuse the token embedding weights for its output layer?',
  'How does GPT-2 score all next tokens with the same token embedding table?',
  ['gpt 2 reuse the token embedding weights', 'gpt 2 score all next tokens with the same token embedding table'],
  'Show a final toy state projected against every row of the same learned token table used for input. Keep logits separate from probabilities. The final state is supplied for the worked calculation.',
  depth => ({
    kind: 'matrix',
    title: brief(depth) ? 'The same word table gives scores for the next word' : 'Tied embeddings score the GPT-2 vocabulary',
    columns: [brief(depth) ? 'Raw score' : 'Logit', 'Toy probability'],
    rows: vocab.map((token, i) => row(token, String(logits[i]), String(probability[i]))),
    caption: detailed(depth) ? 'The toy state is ' + vector(scoringState) + '. Each logit is $e_j^\\top h$ using row $e_j$ of the input table. Apply softmax to the logits.' :
      'Compare the final state with each entry in the same word table, then turn the raw scores into probabilities.',
  }),
  () => {
    const end = i => number(probability.slice(0, i + 1).reduce((sum, value) => sum + value, 0));
    const best = vocab.indexOf(continuation);
    const chosen = vocab.indexOf(sampled);
    const interval = i => ({ from: end(i - 1), to: end(i), startClosed: true, endClosed: false, label: vocab[i] });
    return {
      kind: 'number-line',
      title: 'Sampling can choose a different next token',
      min: 0, max: 1,
      markers: [{ value: sampleAt, label: 'Sampled point ' + sampleAt }],
      intervals: [interval(best), interval(chosen)],
      caption: 'The largest probability favours “' + continuation + '”. A draw at $u=' + sampleAt + '$ lies in the “' + sampled + '” interval.',
    };
  });

const fused = reference('fused-qkv-slices', [],
  'Why does GPT-2 make queries, keys, and values in one projection and then split them?',
  'How does the GPT-2 fused QKV projection split into separate attention heads?',
  ['gpt 2 make queries keys and values in one projection', 'gpt 2 fused qkv projection'],
  'Explain the packed projection as three adjacent output groups from the same input. In the detail, slice each group into equal head widths while keeping query, key and value separate.',
  depth => ({
    kind: 'transformation',
    title: brief(depth) ? 'One calculation produces three vectors' : 'One packed QKV projection in GPT-2',
    before: {
      label: 'Current token state',
      items: brief(depth) ? ['Features for “light”'] : [tensor('State for “light”', embeddingAt('light', 2))],
    },
    after: {
      label: 'Three parts of the result',
      items: brief(depth) ? ['Features for asking', 'Features for matching', 'Features to share'] :
        qkv.map((values, i) => tensor(['Query', 'Key', 'Value'][i], values)),
    },
    operation: brief(depth) ? 'Produce one result, then split it into three parts' : 'Multiply by one packed weight matrix, then slice the output',
    caption: detailed(depth) ? 'This toy uses $4\\times12$ weights and produces $1\\times12$ without biases. Each group has four coordinates.' :
      'The packed result still separates the query, key and value coordinates.',
  }),
  () => ({
    kind: 'matrix',
    title: 'Split each vector into two heads',
    columns: ['Head one', 'Head two'],
    rows: qkv.map((values, i) => row(['Query', 'Key', 'Value'][i], vector(values.slice(0, 2)), vector(values.slice(2)))),
    caption: 'Each toy head receives two coordinates from each vector. The first two coordinates go to head one.',
  }));

const ffn = reference('feedforward-expansion', [],
  'Why does GPT-2 expand the hidden vector in the feed-forward network?',
  'What happens between the two linear projections in a GPT-2 MLP?',
  ['gpt 2 expand the hidden vector', 'two linear projections in a gpt 2 mlp'],
  'Focus on a single position after attention. The first learned map expands its width, GELU changes each hidden coordinate, and the second learned map restores the residual width.',
  depth => ({
    kind: 'block-stack',
    title: brief(depth) ? 'Expand the features, then return to the original size' : 'GPT-2 positionwise feed-forward network',
    blocks: [
      { id: 'x', label: brief(depth) ? 'One token state' : 'Residual-width input', role: 'embedding',
        ...(brief(depth) ? {} : { dims: 'd=4' }) },
      { id: 'expand', label: brief(depth) ? 'Wider feature layer' : 'Expansion projection', role: 'feedforward',
        ...(brief(depth) ? {} : { dims: 'd=16' }) },
      { id: 'activate', label: brief(depth) ? 'Feature-by-feature change' : 'GELU activation', role: 'feedforward' },
      { id: 'narrow', label: brief(depth) ? 'Original feature width' : 'Output projection', role: 'output',
        ...(brief(depth) ? {} : { dims: 'd=4' }) },
    ],
    caption: detailed(depth) ? 'Toy formula: $\\operatorname{GELU}(xW_1+b_1)W_2+b_2$. The same weights are used separately at each position.' :
      'Each token uses the same two learned maps. The output has the width expected by the next layer.',
  }));

const tasks = reference('task-separators', ['01', '13'],
  'How can GPT-2 use a task marker to translate or summarize text?',
  'How does a decoder-only model format translation or summarization as a GPT-2-style continuation?',
  ['gpt 2 use a task marker', 'format translation or summarization as a gpt 2 style continuation'],
  'Illustrate how a decoder-only model can read source, task marker and target in one sequence. Treat these rows as possible paired examples for the task, not a claim about GPT-2’s actual training corpus.',
  depth => ({
    kind: 'matrix',
    title: brief(depth) ? 'A task can become a text continuation' : 'Task markers organize decoder-only continuations',
    columns: ['Source text', brief(depth) ? 'Task marker' : 'Separator', 'Target text'],
    rows: [
      row('Translate', completed, 'Translate to French', 'la lumière du hall vacille'),
      row('Summarize', completed + ' during practice', 'Write a summary', completed),
    ],
    caption: detailed(depth) ? 'Training can present each whole row as one sequence. At generation, supply the source and marker and predict the target tokens.' :
      'Read the source and the task marker before writing the answer one token at a time.',
  }),
  () => ({
    kind: 'timeline',
    title: 'Read the prompt and start a translation',
    events: [
      { time: 'Source', label: 'Read “' + completed + '”' },
      { time: 'Task', label: 'Read the French translation marker' },
      { time: 'First prediction', label: 'Choose “la”' },
      { time: 'Next step', label: 'Append “la” to the prefix' },
    ],
    caption: 'The next call can still read the source and the marker along with the target tokens already produced.',
  }));

const music = reference('music-event-tokens', ['08', '15'],
  'How does Music Transformer turn a performance into tokens?',
  'How do note starts, releases, and time shifts become tokens for a music Transformer?',
  ['music transformer turn a performance into tokens', 'time shifts become tokens for a music transformer'],
  'Show discrete performance events with a stable vocabulary and one phrase reconstructed on pitch and time axes. The event IDs and notes are original toy values.',
  depth => ({
    kind: 'matrix',
    title: brief(depth) ? 'Music can be read as a series of events' : 'An event vocabulary for a music Transformer',
    columns: ['Example event', brief(depth) ? 'Event number' : 'Toy token ID'],
    rows: [
      row('Set loudness', 'Velocity 72', String(musicTokenIds.indexOf('Velocity 72'))),
      row('Start a note', 'Start pitch 60', String(musicTokenIds.indexOf('Start 60'))),
      row('Advance time', 'Wait 250 ms', String(musicTokenIds.indexOf('Wait 250'))),
      row('Release a note', 'Release pitch 60', String(musicTokenIds.indexOf('Release 60'))),
    ],
    caption: detailed(depth) ? 'Each event type and value selects one fixed vocabulary slot. Repeated waits reuse their token ID and keep advancing time.' :
      'A time event moves the clock. A note event starts or releases a pitch at the current time.',
  }),
  () => ({
    kind: 'coordinate-plot',
    title: 'Rebuild a phrase from its note events',
    x: { label: 'Time', unit: 'ms', min: 0, max: 750 },
    y: { label: 'Pitch number', min: 59, max: 68 },
    series: notes.map(({ pitch, name, start, end }) => ({
      label: name, kind: 'line', smooth: false,
      points: [{ x: start, y: pitch }, { x: end, y: pitch }],
    })),
    caption: 'Each segment runs from note start to release. The overlap means two pitches sound together.',
  }));

export const gpt2FigureReferences = [generation, sizes, architecture, cache, lookup, tiedOutput, fused, ffn, tasks, music];
