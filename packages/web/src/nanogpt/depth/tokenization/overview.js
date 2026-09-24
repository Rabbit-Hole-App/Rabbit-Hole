// Tokenization · Overview - why the model reads text as a list of pieces, and
// what bigger pieces change. One line of Tiny Shakespeare split the two ways
// NanoGPT ships: into single characters (data/shakespeare_char, the small
// Shakespeare model's dataset) or into GPT-2 word pieces (data/shakespeare,
// tiktoken "gpt2"). The one control swaps the split; the cause/effect is read
// off two pairs of bars that always show both options: pieces in this line (the
// list gets shorter) and kinds of piece to learn (the set gets huge). One line
// then turns the shorter list into what it buys the model: the small Shakespeare
// model reads block_size = 256 pieces at a time, so the same 256 pieces span 256
// characters of the play, or about 845 as word pieces.
//
// Numbers: the pieces, their count and both set sizes are the base fixture's
// real tokenizer output (generate_fixtures.py); the whole-play counts come from
// gen_tokenization.py (the full text, and the same text through tiktoken
// "gpt2"). The one calculation, 256 x 1,115,394 / 338,025 ~ 845 characters,
// is made here from those counts and block_size; the control only selects.
import fx from '../../fixtures/nanogpt-fixtures.generated.js';
import tok from '../fixtures/tokenization.generated.js';
import { calculation, code, tinyShakespeare, tiktoken } from '../../sources.js';

const CONCEPT = 'tokenization';
const [charTk, bpeTk] = fx.tokenizer.tokenizers;
const grouped = n => n.toLocaleString('en-US');
// The fixture marks a space as ␣, which renders as a faint low tick at chip
// size; a bullet reads at 1x.
const SPACE = '•';
const glyphs = tokens => tokens.map(t => t.replaceAll('␣', SPACE));
// How much of the play block_size pieces span: one character per character
// piece; the whole play's average for GPT-2 pieces.
const WINDOW = fx.architecture.block_size;
const bpeSpan = Math.round(WINDOW * tok.chars.total / tok.bpe.total);

// Chips: 15 characters fit a 960px line; word pieces fit one line, centred in
// the same band so nothing below moves when the split changes.
const PER_LINE = 15;
const CHIPS = { first: 150, second: 192, single: 171 };
// Horizontal bars, one row per split, both always shown: a bar's length is
// its value over the larger of the two (layout only; the number prints beside
// it). 65 of 50,257 is under a pixel - that sliver is the point.
const BAR = { x: 150, w: 640, h: 22 };
const LENGTH_Y = [350, 380], KIND_Y = [444, 474];
const lengthValues = [charTk.count, bpeTk.count];
const kindValues = [charTk.vocabSize, bpeTk.vocabSize];
const ROW_NAMES = ['characters', 'word pieces'];

const text = (id, value, x, y, extra = {}) => ({ id, type: 'text', semanticId: id, conceptId: CONCEPT,
  initialState: { text: value, x, y, typography: 'annotation', ...extra } });
const barRows = (id, values, ys) => values.flatMap((value, i) => {
  const w = (value / Math.max(...values)) * BAR.w;
  return [
    text(`${id}-name-${i}`, ROW_NAMES[i], 40, ys[i] + 16, { typography: 'caption', role: { $derive: `sel.roles.${i}` } }),
    { id: `${id}-bar-${i}`, type: 'box', semanticId: `${id}-bar-${i}`, conceptId: CONCEPT,
      initialState: { x: BAR.x, y: ys[i], w, h: BAR.h, role: { $derive: `sel.roles.${i}` }, opacity: 0 } },
    text(`${id}-value-${i}`, grouped(value), Math.round(BAR.x + w + 10), ys[i] + 16, { typography: 'caption', role: { $derive: `sel.roles.${i}` }, opacity: 0 }),
  ];
});

export const scene = {
  id: 'depth-tokenization-overview',
  title: 'Tokenization · Overview: characters or word pieces',
  width: 960,
  height: 622,
  duration: 1.7,
  inputs: [
    { name: 'pieces', type: 'choice', label: 'Split the text into', default: 'letters',
      options: [{ id: 'letters', label: 'Characters' }, { id: 'words', label: 'Word pieces' }] },
  ],
  exampleData: {
    line: fx.tokenizer.text,
    splits: {
      letters: {
        roles: ['input', 'neutral'],
        rows: [glyphs(charTk.tokens.slice(0, PER_LINE)), glyphs(charTk.tokens.slice(PER_LINE))],
        tops: [CHIPS.first, CHIPS.second],
        count: charTk.count,
        kinds: `from ${charTk.vocabSize} kinds: letters, space, new line, punctuation, one digit`,
        spaceKey: `${SPACE} marks a space: spaces are pieces too`,
        window: `The model reads ${WINDOW} pieces at a time: ${WINDOW} characters of the play.`,
        takeaway: `Tiny pieces: only ${charTk.vocabSize} kinds to learn, but little of the play fits in view.`,
        whole: `The whole play: ${grouped(tok.chars.total)} pieces.`,
      },
      words: {
        roles: ['neutral', 'input'],
        rows: [glyphs(bpeTk.tokens), []],
        tops: [CHIPS.single, CHIPS.second],
        count: bpeTk.count,
        kinds: `from ${grouped(bpeTk.vocabSize)} kinds of word piece`,
        spaceKey: `${SPACE} marks a space: a word piece carries the space before it`,
        window: `The model reads ${WINDOW} pieces at a time: as word pieces, about ${bpeSpan} characters.`,
        takeaway: `Big pieces: more of the play fits in view, but ${grouped(bpeTk.vocabSize)} kinds to learn.`,
        whole: `The whole play: ${grouped(tok.bpe.total)} pieces.`,
      },
    },
  },
  derived: {
    sel: { op: 'pick', args: ['splits', 'pieces'] },
  },
  objects: [
    text('question', 'What changes when the model reads text in bigger pieces?', 40, 34, { typography: 'body' }),
    text('prerequisites', 'No prerequisites.', 40, 58),
    text('status', "Source value: NanoGPT's real split of one Shakespeare line  ·  Live calculation: how much fits", 40, 82, { typography: 'caption' }),
    text('line', '“{{line}}…”', 40, 126, { typography: 'heading' }),
    // The pieces, as the model receives them, in reading order.
    { id: 'pieces-1', type: 'tokens', semanticId: 'pieces-line-1', conceptId: CONCEPT,
      initialState: { x: 40, y: { $derive: 'sel.tops.0' }, role: 'input', tokens: { $derive: 'sel.rows.0' }, opacity: 0 } },
    { id: 'pieces-2', type: 'tokens', semanticId: 'pieces-line-2', conceptId: CONCEPT,
      initialState: { x: 40, y: { $derive: 'sel.tops.1' }, role: 'input', tokens: { $derive: 'sel.rows.1' }, opacity: 0 } },
    text('space-key', '{{sel.spaceKey}}', 40, 250),
    text('count', '{{sel.count}} pieces', 40, 298, { typography: 'display', role: 'input', opacity: 0 }),
    text('kinds', '{{sel.kinds}}', 200, 294, { typography: 'body', opacity: 0 }),

    // Cause and effect, both options always shown; the selected row is lit.
    text('length-title', 'Pieces in this line', 40, 336, { typography: 'caption' }),
    ...barRows('length', lengthValues, LENGTH_Y),
    text('kinds-title', 'Kinds of piece the model must learn', 40, 430, { typography: 'caption' }),
    ...barRows('kind', kindValues, KIND_Y),

    // What the shorter list buys, then the trade in one line.
    text('window', '{{sel.window}}', 40, 524, { typography: 'body', role: 'input', opacity: 0 }),
    text('takeaway', '{{sel.takeaway}}', 40, 550, { typography: 'body', opacity: 0 }),
    text('whole', '{{sel.whole}}', 40, 576, { opacity: 0 }),
    text('name', "These pieces are called tokens. NanoGPT's small Shakespeare model reads single characters.", 40, 602),
  ],
  timeline: [
    { at: 0.0, action: 'appear', target: 'pieces-1', duration: 0.4 },
    { at: 0.1, action: 'appear', target: 'pieces-2', duration: 0.4 },
    { at: 0.5, action: 'appear', target: 'count', duration: 0.3 },
    { at: 0.6, action: 'appear', target: 'kinds', duration: 0.3 },
    ...['length', 'kind'].flatMap(id => [0, 1].flatMap(i => [`${id}-bar-${i}`, `${id}-value-${i}`]))
      .map(target => ({ at: 0.8, action: 'appear', target, duration: 0.4 })),
    { at: 1.2, action: 'appear', target: 'window', duration: 0.3 },
    { at: 1.3, action: 'appear', target: 'takeaway', duration: 0.3 },
    { at: 1.4, action: 'appear', target: 'whole', duration: 0.3 },
  ],
};

export const sources = [
  code('data/shakespeare_char/prepare.py', 23, 35, 'The character split: "chars = sorted(list(set(data)))", "vocab_size = len(chars)", then "encode" turns every character into one integer - so a line of 29 characters is 29 pieces.'),
  code('data/shakespeare/prepare.py', 19, 22, 'The word-piece split: "enc = tiktoken.get_encoding("gpt2")" and "train_ids = enc.encode_ordinary(train_data)" - GPT-2\'s byte-pair pieces.'),
  code('config/train_shakespeare_char.py', 16, 16, '"dataset = \'shakespeare_char\'": NanoGPT\'s small Shakespeare model trains on the character split.'),
  code('config/train_shakespeare_char.py', 19, 19, '"block_size = 256 # context of up to 256 previous characters": the model reads 256 pieces at a time.'),
  calculation('Source value', 'The pieces, their counts and both set sizes',
    `generate_fixtures.py tokenizers(): "${fx.tokenizer.text}", the start of line 2 of the dataset, encoded with prepare.py's character map (${charTk.count} pieces, ${charTk.vocabSize} kinds) and with tiktoken "gpt2" at ${fx.provenance.tiktoken} (${bpeTk.count} pieces, ${bpeTk.vocabSize} kinds). Real tokenizer output; no model runs.`),
  { ...calculation('Source value', 'Whole-play counts',
    `gen_tokenization.py: the full sha-pinned text is ${tok.chars.total} characters (one piece each); the same text split 90/10 and encoded with tiktoken "gpt2" as data/shakespeare/prepare.py does gives ${tok.bpe.train} + ${tok.bpe.val} = ${tok.bpe.total} pieces - the sizes both prepare.py files print in their closing comments.`),
  reproduce: 'uv run --with tiktoken==0.14.0 python packages/web/src/nanogpt/depth/fixtures/gen_tokenization.py --check' },
  calculation('Live calculation', `How much of the play ${WINDOW} pieces span`,
    `Computed on the card from the whole-play counts: ${WINDOW} character pieces are ${WINDOW} characters; ${WINDOW} GPT-2 pieces span ${WINDOW} x ${tok.chars.total} / ${tok.bpe.total} = ${(WINDOW * tok.chars.total / tok.bpe.total).toFixed(1)} characters, shown as about ${bpeSpan} - the play's average per piece, not this line's. The word-piece case fills the same ${WINDOW}-piece window with GPT-2 pieces; NanoGPT's small Shakespeare model itself reads characters.`),
  tinyShakespeare(`The line comes from this file; ${charTk.vocabSize} is the number of different characters in it.`),
  tiktoken(`GPT-2's ${bpeTk.vocabSize}-entry byte-pair encoding, the word-piece split.`),
];

export const evidence = {
  card: scene.id,
  title: scene.title,
  learningQuestion: scene.objects[0].initialState.text,
  concept: `A model reads text as a list of pieces (tokens), ${WINDOW} at a time. Small pieces (characters) give a long list from a tiny set of kinds, so ${WINDOW} pieces hold only ${WINDOW} characters; bigger pieces (GPT-2 word pieces) give a short list, so ${WINDOW} pieces hold about ${bpeSpan} characters, but from a huge set of kinds to learn.`,
  sourceRevision: `${fx.provenance.nanogpt.repo}@${fx.provenance.nanogpt.commit}`,
  provenance: `Source value: base fixture tokenizer output (prepare.py character map, tiktoken gpt2 at 0.14.0) and gen_tokenization.py whole-text counts, checked against both prepare.py closing comments; block_size ${WINDOW} from config/train_shakespeare_char.py. Live calculation: ${WINDOW} x whole-play characters / GPT-2 pieces = about ${bpeSpan} characters.`,
  control: 'pieces - choice: Characters | Word pieces',
  consequence: `The chips switch from ${charTk.count} one-character pieces on two lines to ${bpeTk.count} word pieces on one; the count readout, the "from N kinds" line, the lit row in both bar pairs, the space note, how much of the play ${WINDOW} pieces span (${WINDOW} vs about ${bpeSpan} characters), the takeaway and the whole-play count switch with it.`,
  interactionPurpose: `Feel the trade: bigger pieces let the same ${WINDOW}-piece view hold more of the play, but multiply the kinds of piece the model has to learn.`,
  task: 'none (explore only)',
  capability: 'One choice input picking a record map entry; derived token lists and row positions; horizontal box bars whose role (lit or not) is derived from the choice.',
  depth: 'Overview',
  prerequisites: 'No prerequisites.',
  ladderRole: 'Only this depth shows the trade as plain cause and effect - list length (so how much of the play fits in view) against kinds of piece to learn, both at a glance - with no IDs, lookup or shapes.',
};

export const reviewStates = [{ pieces: 'letters' }, { pieces: 'words' }];
