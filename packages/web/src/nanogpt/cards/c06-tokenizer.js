// Card 6 - the same text through NanoGPT's two tokenizers.
// Every count, ID, token string and vocabulary size is read from the fixture,
// which generate_fixtures.py recorded: the character map rebuilt with
// data/shakespeare_char/prepare.py's logic over the sha-pinned tinyshakespeare
// file, and tiktoken's "gpt2" encoding that data/shakespeare/prepare.py calls.
// The card computes nothing; the preset only selects which stored result is shown.
import fx from '../fixtures/nanogpt-fixtures.generated.js';
import { calculation, code, tiktoken, tinyShakespeare } from '../sources.js';
import { groupDigits } from '../../scene-format.js';

const { tokenizer: tk, provenance: pv } = fx;
const [charTk, bpeTk] = tk.tokenizers;
// GPTConfig's padded default, as the fixture recorded it (the test checks it
// against model.py:111 and train.py:155 in the pinned copy).
const modelVocab = Number(tk.modelVocabNote.match(/= (\d+)/)[1]);

// Token strings and their IDs as two text rows, each token padded to the
// width of its ID (and back) so the two rows share column centres.
// ponytail: tokens-as-labels instead of a grid because grid cells print
// integers below 10 as "1.00" (AnimatedScene.jsx num()); a grid returns once
// cells can print integers. 15 per line keeps a character line inside 960px.
const PER_LINE = 15;
const centre = (s, n) => ' '.repeat(Math.floor((n - s.length) / 2)) + s + ' '.repeat(Math.ceil((n - s.length) / 2));
const rowsOf = t => {
  const cols = t.tokens.map((token, i) => {
    const id = String(t.ids[i]);
    const n = Math.max(token.length, id.length);
    return [centre(token.replaceAll('␣', '•'), n), centre(id, n)];
  });
  const lines = [cols.slice(0, PER_LINE), cols.slice(PER_LINE)];
  return { tok: lines.map(line => line.map(c => c[0])), id: lines.map(line => line.map(c => c[1])) };
};

// Layout only: the character preset fills two token lines, BPE one, which
// sits centred in the same band. Nothing else moves, so the content-bounds
// fit (and the card's zoom) stays identical across presets.
const ROW_TOP = [{ tok: 230, id: 256 }, { tok: 262, id: 288 }];

export const scene = {
  id: 'c06-tokenizer',
  title: "The same text through NanoGPT's two tokenizers",
  width: 960,
  height: 468,
  duration: 2,
  inputs: [
    { name: 'tokenizer', type: 'index', label: 'Tokenizer preset', of: 'presetNames', default: 0, presentation: 'picker' },
  ],
  exampleData: {
    presetNames: ['character-level', 'GPT-2 BPE'],
    text: tk.text,
    tokenizers: tk.tokenizers,
    rows: tk.tokenizers.map(rowsOf),
    rowTop: ROW_TOP,
    takeaways: [
      'Tiny vocabulary, long sequence: every character, spaces included, is its own ID.',
      'Large vocabulary, short sequence: here each word is one ID, carrying the space before it.',
    ],
    modelNotes: [
      [`Model: vocab_size = ${charTk.vocabSize} is read from the meta.pkl the character data prep writes;`,
        'a from-scratch model is built with it - the padded default is not used.'],
      [`From scratch: no meta.pkl, so the model uses vocab_size = ${groupDigits(modelVocab)} (${groupDigits(bpeTk.vocabSize)} padded to a multiple of 64).`,
        `Finetuning from a GPT-2 checkpoint keeps vocab_size = ${groupDigits(bpeTk.vocabSize)}.`],
    ],
    // How each vocabulary is made, in words (the code is in `sources`).
    vocabRules: [
      `Vocabulary: Tiny Shakespeare's ${charTk.vocabSize} distinct characters, sorted; an ID is a position in that list.`,
      `Vocabulary: GPT-2's fixed table of ${groupDigits(bpeTk.vocabSize)} BPE tokens, the same for any text.`,
    ],
  },
  derived: {
    sel: { op: 'pick', args: ['tokenizers', 'tokenizer'] },
    row: { op: 'pick', args: ['rows', 'tokenizer'] },
    top: { op: 'pick', args: ['rowTop', 'tokenizer'] },
    takeaway: { op: 'pick', args: ['takeaways', 'tokenizer'] },
    modelNote: { op: 'pick', args: ['modelNotes', 'tokenizer'] },
    vocabRule: { op: 'pick', args: ['vocabRules', 'tokenizer'] },
  },
  objects: [
    { id: 'question', type: 'text', semanticId: 'question', conceptId: 'tokenization',
      initialState: { text: 'How many tokens - and which IDs - does the model see for the same text?', x: 32, y: 34 } },
    { id: 'input-text', type: 'text', semanticId: 'input-text', conceptId: 'tokenization',
      initialState: { text: 'Same input text for both presets (from tinyshakespeare): “{{text}}”', x: 32, y: 66, role: 'input' } },
    { id: 'selected', type: 'text', semanticId: 'selected-preset', conceptId: 'tokenization',
      initialState: { text: 'Selected preset: {{sel.label}} · Source value (stored result)', x: 32, y: 96, typography: 'caption' } },
    { id: 'readout', type: 'text', semanticId: 'token-count-readout', conceptId: 'tokenization',
      initialState: { text: '{{sel.count}} tokens  ·  vocabulary of {{sel.vocabSize}} possible token IDs', x: 32, y: 132, typography: 'heading', role: 'output', opacity: 0 } },
    { id: 'compare', type: 'text', semanticId: 'compare-presets', conceptId: 'tokenization',
      initialState: { text: 'Same text: {{tokenizers.0.count}} tokens (character-level) vs {{tokenizers.1.count}} tokens (GPT-2 BPE)', x: 32, y: 162, typography: 'caption' } },
    { id: 'takeaway', type: 'text', semanticId: 'takeaway', conceptId: 'tokenization',
      initialState: { text: '{{takeaway}}', x: 32, y: 186, typography: 'caption' } },
    { id: 'key', type: 'text', semanticId: 'row-key', conceptId: 'tokenization',
      initialState: { text: 'Each column: a token, with its integer ID beneath it  ·  “•” = one space character', x: 32, y: 220, typography: 'annotation' } },
    // Token strings (display-only labels) over their IDs; a second line pair
    // carries the character preset's overflow and is empty for BPE.
    { id: 'tokens-1', type: 'tokens', semanticId: 'tokens-line-1', conceptId: 'tokenization',
      initialState: { x: 32, y: { $derive: 'top.tok' }, tokenStyle: 'labels', tokens: { $derive: 'row.tok.0' }, opacity: 0 } },
    { id: 'ids-1', type: 'tokens', semanticId: 'ids-line-1', conceptId: 'tokenization',
      initialState: { x: 32, y: { $derive: 'top.id' }, tokenStyle: 'labels', role: 'output', tokens: { $derive: 'row.id.0' }, opacity: 0 } },
    { id: 'tokens-2', type: 'tokens', semanticId: 'tokens-line-2', conceptId: 'tokenization',
      initialState: { x: 32, y: 294, tokenStyle: 'labels', tokens: { $derive: 'row.tok.1' }, opacity: 0 } },
    { id: 'ids-2', type: 'tokens', semanticId: 'ids-line-2', conceptId: 'tokenization',
      initialState: { x: 32, y: 320, tokenStyle: 'labels', role: 'output', tokens: { $derive: 'row.id.1' }, opacity: 0 } },
    { id: 'ids-seen', type: 'text', semanticId: 'ids-caption', conceptId: 'tokenization',
      initialState: { text: 'The model sees only these integer IDs, never the characters.', x: 32, y: 372, typography: 'annotation', role: 'output', opacity: 0 } },
    { id: 'vocab-rule', type: 'text', semanticId: 'vocab-rule', conceptId: 'tokenization',
      initialState: { text: '{{vocabRule}}', x: 32, y: 404, typography: 'annotation' } },
    { id: 'model-1', type: 'text', semanticId: 'model-vocab-note', conceptId: 'tokenization',
      initialState: { text: '{{modelNote.0}}', x: 32, y: 432, typography: 'annotation' } },
    { id: 'model-2', type: 'text', semanticId: 'model-vocab-note-2', conceptId: 'tokenization',
      initialState: { text: '{{modelNote.1}}', x: 32, y: 452, typography: 'annotation' } },
  ],
  timeline: [
    { at: 0.1, action: 'appear', target: 'tokens-1', duration: 0.4 },
    { at: 0.1, action: 'appear', target: 'tokens-2', duration: 0.4 },
    { at: 0.4, action: 'appear', target: 'ids-1', duration: 0.4 },
    { at: 0.4, action: 'appear', target: 'ids-2', duration: 0.4 },
    { at: 0.8, action: 'appear', target: 'readout', duration: 0.4 },
    { at: 1.1, action: 'appear', target: 'ids-seen', duration: 0.3 },
  ],
};

// Shown collapsed under the card; the code lines, line references and the
// generator note the card used to print live here.
export const sources = [
  code('data/shakespeare_char/prepare.py', 24, 33, 'The character tokenizer: "chars = sorted(list(set(data)))" is the vocabulary (line 24) and "stoi = { ch:i for i,ch in enumerate(chars) }" gives each character its ID (line 30); encode() maps a string through stoi.'),
  code('data/shakespeare/prepare.py', 20, 21, 'The GPT-2 BPE route: "enc = tiktoken.get_encoding("gpt2")" then "train_ids = enc.encode_ordinary(train_data)".'),
  code('train.py', 137, 144, "When the dataset has a meta.pkl, train.py reads its vocabulary size: \"meta_vocab_size = meta['vocab_size']\"."),
  code('train.py', 153, 155, "From scratch the model gets that size, or the padded default without a meta.pkl: \"model_args['vocab_size'] = meta_vocab_size if meta_vocab_size is not None else 50304\"."),
  code('data/shakespeare_char/prepare.py', 55, 61, "The character prep saves vocab_size, itos and stoi to meta.pkl (\"'vocab_size': vocab_size,\")."),
  code('model.py', 111, 111, 'GPTConfig\'s padded default: "vocab_size: int = 50304 # GPT-2 vocab_size of 50257, padded up to nearest multiple of 64 for efficiency".'),
  code('model.py', 223, 223, "Loading a GPT-2 checkpoint forces its vocabulary: \"config_args['vocab_size'] = 50257 # always 50257 for GPT model checkpoints\"."),
  code('README.md', 160, 166, 'Finetuning on Shakespeare: data/shakespeare/prepare.py tokenizes with GPT-2 BPE, then training starts from a GPT-2 checkpoint via init_from.'),
  code('README.md', 22, 22, 'Dependencies: "pip install torch numpy transformers datasets tiktoken wandb tqdm" - tiktoken with no version pin.'),
  calculation('Source value', 'Token strings, IDs, counts and vocabulary sizes',
    `generate_fixtures.py used the sentence "${tk.text}" (from line 2 of the sha-pinned Tiny Shakespeare file; it asserts the sentence occurs there); rebuilt the character vocabulary with data/shakespeare_char/prepare.py's logic (lines 24-33: sorted(list(set(data))), then stoi) over the whole file and mapped the sentence through stoi (${charTk.count} IDs, vocabulary ${charTk.vocabSize}); and encoded it with tiktoken ${pv.tiktoken} get_encoding("gpt2").encode_ordinary (${bpeTk.count} IDs, n_vocab ${bpeTk.vocabSize}). The card only picks the stored result for the selected preset; no tokenizer runs here.`),
  tiktoken(`Version ${pv.tiktoken} is the fixture generator's own pin; NanoGPT pins no tiktoken version (README.md:22).`),
  tinyShakespeare('The character vocabulary is built from this whole file; the example sentence is taken from it.'),
];

export const evidence = {
  card: 'c06-tokenizer',
  title: scene.title,
  learningQuestion: scene.objects[0].initialState.text,
  concept: "Tokenization decides how many integer IDs the model sees: NanoGPT's character-level map (vocab from sorted(set(data)), saved to meta.pkl) vs GPT-2 BPE via tiktoken; train.py sets the model's vocab_size from meta.pkl, else the padded 50304, and a GPT-2 checkpoint keeps 50257.",
  sourceRevision: `${pv.nanogpt.repo}@${pv.nanogpt.commit}`,
  provenance: "recorded by generate_fixtures.py: the character map rebuilt with data/shakespeare_char/prepare.py:24-33's logic over the sha-pinned tinyshakespeare file, and tiktoken \"gpt2\" at the generator's pin (NanoGPT pins none, README.md:22). Citations checked against data/shakespeare_char/prepare.py:24,30,55-61, data/shakespeare/prepare.py:20-21, train.py:137-155,181-185, model.py:111,223, README.md:160-166.",
  control: 'tokenizer - index input, picker over two stored presets: character-level | GPT-2 BPE',
  consequence: `The same text re-tokenizes: the token/ID rows change from ${charTk.count} one-character tokens with IDs below ${charTk.vocabSize} to ${bpeTk.count} subword tokens from a ${bpeTk.vocabSize}-entry vocabulary; the count/vocabulary readout, takeaway, vocabulary rule and model-side vocab notes switch with it, while a fixed line compares both counts.`,
  interactionPurpose: 'Compare two real tokenizations of one text, so the learner sees that token count and IDs depend on the tokenizer: the same text gives different counts and IDs; the char vocabulary comes from the corpus, the GPT-2 BPE vocabulary is fixed.',
  task: 'Switch the preset and compare how many tokens the same text becomes, how large the IDs get, and how big each vocabulary is.',
  capability: 'Index input picking stored records: tokens-as-labels rows (token over ID, padded to shared column centres), per-preset caption lines, and a picked row position that centres the one-line preset in the same band; {{a.0.b}} path interpolation.',
};
