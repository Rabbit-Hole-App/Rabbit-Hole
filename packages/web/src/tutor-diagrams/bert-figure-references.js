import {
  classProbabilities, contexts, featureMethods, focusWord, layerWeights, maskCandidates,
  maskedProbabilities, maskLoss, nextSentence, staticVector,
} from './bert-figure-data.js';

const [wildlife, repair] = contexts;
const phrase = context => context.tokens.join(' ');
const example = phrase(wildlife);
const alternative = phrase(repair);
const brief = depth => depth === 'overview';
const detailed = depth => depth === 'deep';
const document = diagram => ({ version: 1, diagram });
const row = (heading, ...cells) => ({ heading, cells });
const verb = (id, label, role = 'process') => ({ id, label, role });
const percentage = value => Math.round(100 * value) + '%';
const vector = values => '$[' + values.join(', ') + ']$';

function reference(id, lessons, prompt, paraphrase, keywords, useWhen, makeDiagram, makeDetail) {
  return {
    id: 'ml-bert-' + id,
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

const families = reference('pretraining-families', ['01'],
  'How did BERT build on the ideas behind the original Transformer, ELMo, and GPT?',
  'What is different about BERT, ELMo, ULMFiT, and the original GPT?',
  ['bert build on the ideas', 'bert elmo ulmfit and the original gpt'],
  'Use a compact historical comparison to distinguish the original translation Transformer from the later pretrained text models. Compare architectures and objectives, without ranking performance.',
  depth => ({
    kind: 'matrix',
    title: brief(depth) ? 'The ideas BERT built on' : 'BERT and earlier language models',
    columns: [brief(depth) ? 'How it reads' : 'Architecture', brief(depth) ? 'What it learns' : 'Training objective'],
    rows: brief(depth) ? [
      row('Transformer', 'Reader and writer', 'Translate text'),
      row('ULMFiT', 'Reads from the start', 'Guess later words'),
      row('ELMo', 'Reads both ways', 'Guess in each direction'),
      row('GPT', 'Writes from earlier words', 'Guess later words'),
      row('BERT', 'Reads both ways', 'Recover hidden words'),
    ] : [
      row('Transformer', 'Encoder and decoder', 'Translation example'),
      row('ULMFiT', 'Forward LSTM', 'Next-token prediction'),
      row('ELMo', 'Two directional LSTMs', 'Directional prediction'),
      row('Original GPT', 'Causal decoder', 'Next-token prediction'),
      row('BERT', 'Bidirectional encoder', 'Recover masked tokens'),
    ],
    caption: detailed(depth) ? 'Original BERT also classified sentence pairs during pretraining. The architecture and the objective answer different questions.' : 'Each model learns from text, with different ways of reading it.',
  }));

const transfer = reference('fine-tuning', ['01', '13'],
  'What happens when you fine-tune BERT for text classification?',
  'How does a pretrained BERT become a classifier for my own labelled examples?',
  ['fine tune bert for text classification', 'pretrained bert become a classifier'],
  'Distinguish self-supervised text pretraining from supervised adaptation. The fine-tuning example updates the pretrained encoder and a new classification head.',
  depth => ({
    kind: 'flow',
    title: brief(depth) ? 'From reading text to sorting notes' : 'Pretrain, then fine-tune BERT',
    nodes: [
      verb('text', 'Read text without task labels'),
      verb('pretrain', brief(depth) ? 'Learn by filling hidden words' : 'Train on masked-token prediction'),
      verb('train', brief(depth) ? 'Learn from notes with labels' : 'Update encoder and head on labelled notes'),
      verb('output', brief(depth) ? 'Sort new notes' : 'Predict the class of a new note', 'outcome'),
    ],
    edges: [{ from: 'text', to: 'pretrain' }, { from: 'pretrain', to: 'train', label: 'Reuse learned weights' }, { from: 'train', to: 'output' }],
    caption: detailed(depth) ? 'The text supplies its own pretraining targets. Fine-tuning updates the shared encoder and the task head using class labels.' :
      'The first stage learns from text. The second learns to tell wildlife notes from repair notes.',
  }),
  () => ({
    kind: 'matrix',
    title: 'Examples for fine-tuning',
    columns: ['Text supplied', 'Class supplied'],
    rows: [row('Example one', example, wildlife.topic), row('Example two', alternative, repair.topic)],
    caption: 'Each task label tells the classifier which class to predict for the supplied text.',
  }));

const encoder = reference('encoder-depth', [],
  'What changes between BERT Base and BERT Large?',
  'How do the BERT Base and BERT Large encoder stacks differ?',
  ['changes between bert base and bert large', 'bert base and bert large encoder stacks'],
  'Show a miniature encoder to explain token alignment across layers. Use the second visual to compare the real Base and Large designs qualitatively, without implying the toy layer count is a checkpoint setting.',
  depth => ({
    kind: 'block-stack',
    title: brief(depth) ? 'One output for each input word' : 'A miniature BERT encoder stack',
    blocks: [
      { id: 'input', label: brief(depth) ? 'Input words' : 'Token vectors', role: 'embedding' },
      { id: 'layer', label: brief(depth) ? 'Context reading layer' : 'BERT encoder layer', role: 'attention', repeat: 3 },
      { id: 'output', label: brief(depth) ? 'Updated word readings' : 'Contextual token vectors', role: 'output' },
    ],
    caption: detailed(depth) ? 'Toy layers use separate weights. Base is shallower and narrower than Large. Both preserve one vector per position.' :
      'Base uses fewer layers and narrower vectors than Large. Both return one vector for each input position.',
  }),
  () => ({
    kind: 'matrix',
    title: 'The same encoder recipe at different sizes',
    columns: ['BERT Base', 'BERT Large'],
    rows: [
      row('Depth', 'Fewer encoder layers', 'More encoder layers'),
      row('Features per token', 'Narrower vectors', 'Wider vectors'),
      row('Output', 'One vector per position', 'One vector per position'),
    ],
    caption: 'Each layer has its own weights. The toy stack gives a shorter view of the shared idea.',
  }));

const cls = reference('cls-readout', ['01', '03'],
  'How does BERT use the CLS token to classify a sentence?',
  'Why does the BERT classifier read only the CLS output after encoding the whole sentence?',
  ['bert use the cls token to classify', 'bert classifier read only the cls output'],
  'Show that the classification head reads the summary position after bidirectional encoding, while the other token outputs still exist. The class probabilities are made up.',
  depth => ({
    kind: 'transformation',
    title: brief(depth) ? 'One sentence summary feeds the classifier' : 'BERT classification reads the CLS vector',
    before: {
      label: brief(depth) ? 'Outputs for each position' : 'Encoder output states',
      items: [brief(depth) ? 'Summary' : '[CLS]', ...wildlife.tokens, brief(depth) ? 'End marker' : '[SEP]'],
    },
    after: {
      label: brief(depth) ? 'Toy classes' : 'Illustrative class probabilities',
      items: contexts.map(({ topic }, i) => brief(depth) ? topic : topic + ' ' + percentage(classProbabilities[i])),
    },
    operation: brief(depth) ? 'Read the summary position to score both classes' : 'Pass only the CLS state to the classification head',
    links: [{ from: 0, to: 0 }, { from: 0, to: 1 }],
    caption: detailed(depth) ? 'The encoder has already read the whole sentence. The classifier maps the CLS vector to logits and normalizes them with softmax.' :
      'The summary can depend on the whole sentence even though the classifier reads one position.',
  }),
  () => ({
    kind: 'matrix',
    title: 'A learned representation can feed a classifier',
    columns: ['Feature source', 'Toy decision'],
    rows: [
      row('Text note', 'Read the summary position', wildlife.topic + ' or ' + repair.topic),
      row('Image of a seal', 'Read a visual feature vector', 'Animal or machine part'),
    ],
    caption: 'The feature extractor changes with the input. Each classifier still maps features to categories.',
  }));

const embeddings = reference('contextual-vectors', ['08'],
  'Why can ELMo give the same word different embeddings?',
  'How does the ELMo representation for seal change when I use it in a different sentence?',
  ['elmo give the same word different embeddings', 'elmo representation for seal'],
  'Contrast one static lookup with two context-dependent vectors for an ambiguous word. Keep the vectors illustrative and use the same numbers as the ELMo layer-mix example.',
  depth => ({
    kind: 'matrix',
    title: brief(depth) ? 'The same word can mean different things' : 'Static and contextual embeddings',
    columns: [example, alternative],
    rows: [
      row('Meaning of ' + focusWord, wildlife.meaning, repair.meaning),
      row(brief(depth) ? 'Fixed word features' : 'Static lookup',
        ...contexts.map(() => detailed(depth) ? vector(staticVector) : 'Same features')),
      row(brief(depth) ? 'Features after reading' : 'Contextual vector',
        ...contexts.map(({ contextual, meaning }) => detailed(depth) ? vector(contextual) : meaning + ' context')),
    ],
    caption: detailed(depth) ? 'Both contextual vectors have four toy features. The same word lookup starts both examples, and their right context differs.' :
      'A fixed lookup ignores context. The features from a contextual model can change with the sentence.',
  }),
  () => ({
    kind: 'tensor',
    title: 'One contextual vector as four cells',
    tensor: { name: focusWord + ' in ' + example, dimensions: '1 × 4', rows: 1, columns: 4, values: wildlife.contextual },
    caption: 'Each cell is one learned feature in the toy vector. The cells have no individual word labels.',
  }));

const elmo = reference('elmo-layer-mix', ['08', '15'],
  'How does ELMo combine forward and backward language models?',
  'How are both directions and the layer weights used to make an ELMo embedding?',
  ['elmo combine forward and backward language models', 'layer weights used to make an elmo embedding'],
  'Show independent directional language-model states at one token and their training targets. In the detail, concatenate states within each depth before applying the task-weighted sum.',
  depth => ({
    kind: 'matrix',
    title: brief(depth) ? 'Read the same word from both sides' : 'Two language-model directions in ELMo',
    columns: [brief(depth) ? 'Words seen' : 'Tokens in read order', 'Training target'],
    rows: [
      row(brief(depth) ? 'Read forward' : 'Forward language model', wildlife.tokens.slice(0, 2).join(' '), wildlife.tokens[2]),
      row(brief(depth) ? 'Read backward' : 'Backward language model', wildlife.tokens.slice(1).reverse().join(' '), wildlife.tokens[0]),
    ],
    caption: detailed(depth) ? 'Read the state at “seal” in each direction. ELMo joins those states within each depth and weights the depths for a task.' :
      'Both readings end at “seal”. Each gets a training target from the other side.',
  }),
  () => ({
    kind: 'matrix',
    title: 'Mix the features from each depth',
    columns: ['Toy weight', 'Feature vector'],
    rows: [
      ...wildlife.vectors.map((features, i) => row(i === 0 ? 'Static input' : 'Joined states at layer ' + i, String(layerWeights[i]), vector(features))),
      row('Weighted sum', 'Total weight 1', vector(wildlife.contextual)),
    ],
    caption: 'Use $e=\\gamma\\sum_j s_j h_j$ with toy scale $\\gamma=1$. Each joined layer vector has the forward features before the backward features.',
  }));

const gptInputs = reference('gpt-task-inputs', ['08', '13'],
  'How did the original GPT adapt one model to sentence pairs and multiple-choice questions?',
  'How did they format inputs for the original GPT when fine-tuning it on different tasks?',
  ['original gpt adapt one model', 'format inputs for the original gpt'],
  'Show the original GPT transfer design: serialize each task input and read the last special token from the shared pretrained decoder. Similarity uses both orders. Multiple-choice scores candidates independently.',
  depth => ({
    kind: 'matrix',
    title: brief(depth) ? 'One writer can read several task formats' : 'Task inputs for the original GPT',
    columns: [brief(depth) ? 'What goes in' : 'Text inside markers', brief(depth) ? 'What gets scored' : 'How to use the readout'],
    rows: [
      row('Classify text', example, 'Score the note class'),
      row('Check entailment', 'Premise then hypothesis', 'Score whether it follows'),
      row('Compare meaning', 'Both orders of two texts', 'Combine the two readings'),
      row('Choose an answer', 'Context with one option each', 'Score each candidate separately'),
    ],
    caption: detailed(depth) ? 'The original GPT wraps each sequence in start and readout markers. Paired texts get a separator. The last state feeds the task head.' :
      'The format changes with the task. A shared model reads the resulting word sequence.',
  }));

const mask = reference('masked-token', ['01', '08'],
  'How does BERT learn by filling in a masked word?',
  'Why can BERT look on both sides of a masked token?',
  ['bert learn by filling in a masked word', 'bert look on both sides of a masked token', 'bert masked language modeling', 'bert masked language modelling'],
  'Show the masked position receiving cues from both directions and the original token as the training target. The probabilities are a toy example rather than a BERT measurement.',
  depth => ({
    kind: 'relationship',
    layout: 'graph',
    title: brief(depth) ? 'Read around a hidden word' : 'Masked language modelling in BERT',
    nodes: [
      { id: 'left', label: '“' + wildlife.tokens[0] + '” before the mask' },
      { id: 'right', label: '“' + wildlife.tokens[2] + '” after the mask' },
      { id: 'mask', label: brief(depth) ? 'Hidden position' : 'State at [MASK]' },
      { id: 'answer', label: 'Original word “' + focusWord + '”' },
    ],
    edges: [
      { from: 'left', to: 'mask', label: 'Provides a left cue' },
      { from: 'right', to: 'mask', label: 'Provides a right cue' },
      { from: 'mask', to: 'answer', label: 'Predicts the hidden word' },
    ],
    caption: detailed(depth) ? 'The model uses the hidden position to score vocabulary candidates. The original token supplies the self-supervised label.' :
      'The original sentence supplies the answer. The model uses both sides to work out the missing word.',
  }),
  () => ({
    kind: 'bar-chart',
    title: 'Possible fills for the hidden word',
    bars: maskCandidates.map((label, i) => ({ label, value: maskedProbabilities[i] })),
    caption: 'Toy probabilities. The observed word is “' + focusWord + '”, so its loss is $-\\ln(' + maskedProbabilities[0] + ')\\approx' + maskLoss + '$.',
  }));

const nsp = reference('next-sentence', ['01', '03'],
  'What was BERT next sentence prediction trying to learn?',
  'How did original BERT tell whether two sentences were next to each other during training?',
  ['bert next sentence prediction', 'bert tell whether two sentences were next to each other'],
  'Original BERT classified a supplied pair as adjacent or randomly paired. Use two pairs with the same first sentence and keep the task separate from generating new text.',
  depth => ({
    kind: 'matrix',
    title: brief(depth) ? 'Did the second sentence follow the first?' : 'Original BERT next-sentence prediction',
    columns: ['First sentence', 'Second sentence', 'Training label'],
    rows: [
      row(brief(depth) ? 'Real neighbour' : 'Actual continuation', example, nextSentence[0], brief(depth) ? 'Follows' : 'IsNext'),
      row(brief(depth) ? 'Random choice' : 'Random sample', example, nextSentence[1], brief(depth) ? 'Random pair' : 'NotNext'),
    ],
    caption: detailed(depth) ? 'Format the pair as [CLS] A [SEP] B [SEP]. The CLS state goes to a classifier for the two labels.' :
      'The second sentence is already supplied. The task is to classify the pair.',
  }));

const heads = reference('task-heads', ['01', '13'],
  'How does BERT use different outputs for classification, tagging, and question answering?',
  'Which BERT output states do the task heads read?',
  ['bert use different outputs for classification', 'bert output states do the task heads read'],
  'Compare whole-input decisions, per-token decisions and start/end span predictions. Hold the pretrained encoder architecture fixed and change the readout.',
  depth => ({
    kind: 'matrix',
    title: brief(depth) ? 'One reader, several jobs' : 'Which BERT positions does each task head read?',
    columns: ['Positions read', 'Toy output'],
    rows: [
      row('Classify a sentence', brief(depth) ? 'Summary position' : 'CLS state', wildlife.topic),
      row('Classify a pair', brief(depth) ? 'Shared summary' : 'CLS state for the pair', 'Both describe animals'),
      row('Tag each word', brief(depth) ? 'Every word position' : 'One state per token', '“' + focusWord + '” is a noun'),
      row('Find an answer span', brief(depth) ? 'First and last answer word' : 'Start and end scores per token', '“' + wildlife.tokens.slice(0, 2).join(' ') + '”'),
    ],
    caption: detailed(depth) ? 'For extractive question answering, score start and end positions in the passage. An answer is a span of the supplied text.' :
      'The same reading layers return a vector for every position. Different tasks read different positions.',
  }));

const frozen = reference('frozen-features', ['08', '09', '13'],
  'Can I use BERT as a feature extractor without fine-tuning it?',
  'If I keep BERT frozen, should I use its last layer or combine several layers?',
  ['bert as a feature extractor', 'keep bert frozen should i use its last layer'],
  'Show several ways to read frozen states for the same token. The feature widths and scores are illustrative. Keep the evaluation split fixed across choices.',
  depth => ({
    kind: 'matrix',
    title: brief(depth) ? 'Which features should the new model read?' : 'Compare frozen BERT layer features',
    columns: [brief(depth) ? 'Feature count' : 'Toy width', brief(depth) ? 'Toy quality score' : 'Toy validation F1'],
    rows: featureMethods.map(method => row(method.label, String(method.width), String(method.f1))),
    caption: detailed(depth) ? 'Only the downstream head trains. Compare on one held-out split. Toy scores use $F_1=2TP/(2TP+FP+FN)$.' :
      'The same frozen reader supplies features. Compare the trained heads on the same held-out examples.',
  }),
  () => ({
    kind: 'flow',
    title: 'Take two layer states for the same token',
    nodes: [
      verb('freeze', 'Keep the pretrained encoder frozen'),
      verb('read', 'Read two layer states for “' + focusWord + '”'),
      verb('join', 'Join the two vectors without mixing positions'),
      verb('train', 'Train a separate prediction head', 'outcome'),
    ],
    edges: [{ from: 'freeze', to: 'read' }, { from: 'read', to: 'join' }, { from: 'join', to: 'train' }],
    caption: 'Each toy layer gives four values at the selected position. Concatenation gives eight values for that position.',
  }));

export const bertFigureReferences = [
  families, transfer, cls, encoder, embeddings, elmo, gptInputs, mask, nsp, heads, frozen,
];
