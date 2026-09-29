// Tokenization · Guided - how each character becomes the integer the model
// reads, and back. The same example as the Overview (the start of line 2,
// "Before we proceed any further"), now as IDs. Character-level: prepare.py
// sorts the 65 characters of Tiny Shakespeare by character code and a
// character's ID is its entry number in that list; the card performs that
// lookup live (argmin of the squared code difference over the sorted list),
// shows the code it searched with, and decodes by reading the list back.
// GPT-2 BPE: a character belongs to one piece (the card spells the piece out
// and marks the character), the piece's ID comes from GPT-2's fixed
// 50,257-entry table (tiktoken's real output, not computed here), and the
// card works out characters per ID for the line and for the whole play - the
// ratio the Deep dive turns into how much text the model's window holds.
// GPT-2 numbers pieces by merge rank, not spelling; tiktoken's loader shows it.
//
// Numbers: the sorted list and the whole-play counts are gen_tokenization.py's
// (prepare.py's sorted(set(data)) and both prepare.py split sizes); the line's
// IDs and pieces are the base fixture's (generate_fixtures.py). The lookup,
// decode, piece lengths and both ratios are derive ops.
import fx from '../../fixtures/nanogpt-fixtures.generated.js';
import tok from '../fixtures/tokenization.generated.js';
import { calculation, code, tinyShakespeare, tiktoken } from '../../sources.js';

const CONCEPT = 'tokenization';
const [charTk, bpeTk] = fx.tokenizer.tokenizers;
const grouped = n => n.toLocaleString('en-US');
// Visible stand-ins: the fixture's ␣ renders as a faint low tick at 1x, a
// bullet reads; ⏎ marks the new line.
const SPACE = '•';
const show = ch => ({ ' ': SPACE, '\n': '⏎' }[ch] ?? ch);
const glyphs = token => token.replaceAll('␣', SPACE);
const lineChars = [...fx.tokenizer.text];
const vocabShown = tok.vocab.map(show);
const bpeShown = bpeTk.tokens.map(glyphs);

// Token-over-ID columns share a centre: both padded to the wider of the two
// (as the base tokenizer card does). Labels-style tokens draw each entry
// 32 + 9.5 px per character wide with an 8 px gap (animation-scene.js CHIP_*).
const centre = (s, n) => ' '.repeat(Math.floor((n - s.length) / 2)) + s + ' '.repeat(Math.ceil((n - s.length) / 2));
const COL = n => 32 + n * 9.5;
const GAP = 8;
const X0 = 40;
const PER_LINE = 15;
const columns = (tokens, ids) => tokens.map((token, i) => {
  const n = Math.max(token.length, String(ids[i]).length, 2);
  return { tok: centre(token, n), id: centre(String(ids[i]), n), n };
});
const withX = cols => { let x = X0; return cols.map(c => { const at = x; x += COL(c.n) + GAP; return { ...c, x: at }; }); };

// Encoded line: characters on two lines (15 + 14), GPT-2 pieces on one line
// centred in the same band. T = the tokens row's top; the ID row sits 22 below.
const SEQ = { char: [124, 176], bpe: [140] };
const ID_BELOW = 22;
const charCols = columns(charTk.tokens.map(glyphs), charTk.ids);
const charLines = [withX(charCols.slice(0, PER_LINE)), withX(charCols.slice(PER_LINE))];
const bpeLine = withX(columns(bpeShown, bpeTk.ids));
// Which piece each character position belongs to, and where inside it.
const pieceOfChar = bpeTk.tokens.flatMap((token, k) => Array(token.length).fill(k));
const offsetInPiece = bpeTk.tokens.flatMap(token => [...token].map((u, j) => j));
// The highlight box around the selected column, per split and position.
const box = (col, top) => ({ x: col.x - 4, y: top + 3, w: COL(col.n) + 8 });
const selBox = {
  char: lineChars.map((unused, p) => box(charLines[p < PER_LINE ? 0 : 1][p % PER_LINE], SEQ.char[p < PER_LINE ? 0 : 1])),
  bpe: lineChars.map((unused, p) => box(bpeLine[pieceOfChar[p]], SEQ.bpe[0])),
};
// The card's right edge: the selection box on the last character of the first line.
const RIGHT = Math.max(...Object.values(selBox).flat().map(b => b.x + b.w));
const seqHl = {
  char: [lineChars.map((u, p) => (p < PER_LINE ? p : null)), lineChars.map((u, p) => (p >= PER_LINE ? p - PER_LINE : null))],
  bpe: [pieceOfChar, lineChars.map(() => null)],
};
// GPT-2 mode: the selected piece spelled out under its column, one character
// per label, with the selected character boxed.
const SPELL = { top: 198, pitch: COL(1) + GAP };
const spellX = bpeLine.map(c => c.x);
const spellBox = lineChars.map((u, p) => ({ x: spellX[pieceOfChar[p]] + offsetInPiece[p] * SPELL.pitch - 4, y: SPELL.top + 3 }));

// The sorted list as 5 rows of 13 (entry numbers 0-64), character over number.
const VOCAB_ROWS = 5, VOCAB_COLS = 13;
const VOCAB = { title: 254, top: 262, pitch: 44 };
const vocabRow = r => tok.vocab.slice(r * VOCAB_COLS, (r + 1) * VOCAB_COLS).map((ch, c) => ({ ch: centre(show(ch), 2), rank: centre(String(r * VOCAB_COLS + c), 2) }));
// Where the lookup lands, for each possible ID: a box round that entry, the
// entry itself (drawn again at full strength over the quieted list), and for
// each row which column to light (null = not this row).
const TABLE_QUIET = 0.4; // the list is evidence; the lookup path is what reads first
const vocabBox = tok.vocab.map((ch, id) => {
  const x = X0 + (id % VOCAB_COLS) * (COL(2) + GAP), y = VOCAB.top + Math.floor(id / VOCAB_COLS) * VOCAB.pitch;
  return { x: x - 4, y: y + 3, tx: x, ty: y, rankY: y + 18, ch: [centre(show(ch), 2)], rank: [centre(String(id), 2)] };
});
const vocabHl = Array.from({ length: VOCAB_ROWS }, (u, r) => tok.vocab.map((ch, id) => (Math.floor(id / VOCAB_COLS) === r ? id % VOCAB_COLS : null)));

// Piece lengths (GPT-2 mode): bars, one per piece.
const PIECE_BARS = { x: 40, y: 300, h: 130, cell: 80 };
const pieceLens = bpeTk.tokens.map(t => t.length);
// The selected piece is boxed under its bar, not lit: a lit bar pops 6% about its
// own centre and drops below the shared baseline (a renderer rule this card can't change).
const pieceBoxX = pieceLens.map((n, k) => PIECE_BARS.x + k * PIECE_BARS.cell + 4);
const RATE_X = 480;

const text = (id, value, x, y, extra = {}) => ({ id, type: 'text', semanticId: id, conceptId: CONCEPT,
  initialState: { text: value, x, y, typography: 'annotation', ...extra } });
const labels = (id, tokens, y, extra = {}) => ({ id, type: 'tokens', semanticId: id, conceptId: CONCEPT,
  initialState: { x: X0, y, tokenStyle: 'labels', tokens, ...extra } });
const whenChar = { opacity: { $derive: 'onNow.char' } };
const whenBpe = { opacity: { $derive: 'onNow.bpe' } };

export const scene = {
  id: 'depth-tokenization-guided',
  title: 'Tokenization · Guided: from characters to integer IDs',
  width: 960,
  height: 610,
  duration: 1.2,
  inputs: [
    { name: 'pos', type: 'index', label: 'Character in the line', of: 'positions', default: 0, presentation: 'slider' },
    { name: 'split', type: 'choice', label: 'Tokenizer', default: 'char',
      options: [{ id: 'char', label: `Characters (${charTk.vocabSize})` }, { id: 'bpe', label: `GPT-2 pieces (${grouped(bpeTk.vocabSize)})` }] },
  ],
  exampleData: {
    positions: lineChars.map(show),
    // The live lookup: code points of the sorted list and of the line.
    vocabCodes: tok.vocab.map(ch => ch.codePointAt(0)),
    lineCodes: lineChars.map(ch => ch.codePointAt(0)),
    ones: tok.vocab.map(() => 1),
    vocabShown,
    vocabSize: tok.vocab.length,
    lastEntry: tok.vocab.length - 1,
    onlyDigit: tok.digits.join(', '),
    capitals: `${tok.vocab.indexOf('A')}-${tok.vocab.indexOf('Z')}`,
    smalls: `${tok.vocab.indexOf('a')}-${tok.vocab.indexOf('z')}`,
    bpeVocab: grouped(bpeTk.vocabSize),
    bpeCount: bpeTk.count,
    bpeLast: grouped(bpeTk.vocabSize - 1),
    pieceOfChar,
    offsetInPiece,
    bpeIds: bpeTk.ids,
    bpeShown,
    pieceSpelled: bpeShown.map(t => [...t]),
    spellX,
    spellBox,
    pieceLens,
    pieceBoxX,
    // Characters per ID over the whole play: both prepare.py split sizes.
    playChars: [tok.chars.total],
    playCharsShown: grouped(tok.chars.total),
    playIdsShown: grouped(tok.bpe.total),
    // Two pieces whose alphabetical order and ID order disagree (read from the IDs).
    we: { piece: bpeShown[1], id: bpeTk.ids[1] },
    any: { piece: bpeShown[3], id: bpeTk.ids[3] },
    seq: {
      char: { tok: charLines.map(l => l.map(c => c.tok)), id: charLines.map(l => l.map(c => c.id)), top: SEQ.char, idTop: SEQ.char.map(t => t + ID_BELOW),
        title: `Encoded line: ${charTk.count} characters → ${charTk.count} IDs, one per character (${SPACE} = space)` },
      bpe: { tok: [bpeLine.map(c => c.tok), []], id: [bpeLine.map(c => c.id), []], top: [SEQ.bpe[0], SEQ.char[1]], idTop: [SEQ.bpe[0] + ID_BELOW, SEQ.char[1] + ID_BELOW],
        title: `Encoded line: ${charTk.count} characters → ${bpeTk.count} IDs, one per piece (${SPACE} = space)` },
    },
    selBox,
    seqHl,
    vocabHl,
    vocabBox,
    on: { char: { char: 1, bpe: 0, table: TABLE_QUIET }, bpe: { char: 0, bpe: 1, table: 0 } },
  },
  derived: {
    // Character mode: find the character in the sorted list, live.
    code: { op: 'pick', args: ['lineCodes', 'pos'] },
    repeated: { op: 'scale', args: ['ones', 'code'] },
    gap: { op: 'sub', args: ['vocabCodes', 'repeated'] },
    gapSq: { op: 'elementwise', args: ['gap', 'gap'] },
    id: { op: 'argmin', args: ['gapSq'] },
    decoded: { op: 'pick', args: ['vocabShown', 'id'] },
    ch: { op: 'pick', args: ['positions', 'pos'] },
    // GPT-2 mode: the piece that holds the character, its ID, the character's place in it.
    piece: { op: 'pick', args: ['pieceOfChar', 'pos'] },
    pieceId: { op: 'pick', args: ['bpeIds', 'piece'] },
    pieceShown: { op: 'pick', args: ['bpeShown', 'piece'] },
    spelled: { op: 'pick', args: ['pieceSpelled', 'piece'] },
    spellAt: { op: 'pick', args: ['spellX', 'piece'] },
    charInPiece: { op: 'pick', args: ['offsetInPiece', 'pos'] },
    charBox: { op: 'pick', args: ['spellBox', 'pos'] },
    pieceBox: { op: 'pick', args: ['pieceBoxX', 'piece'] },
    // Characters per ID: this line (piece lengths summed, over the piece count)
    // and the whole play (characters over GPT-2 IDs).
    pieceTotal: { op: 'sum', args: ['pieceLens'] },
    pieceTotalV: { op: 'concat', args: ['pieceTotal'] },
    lineRate: { op: 'scale', args: ['pieceTotalV', 1 / bpeTk.count] },
    playRate: { op: 'scale', args: ['playChars', 1 / tok.bpe.total] },
    // Layout and visibility follow the inputs.
    seqNow: { op: 'pick', args: ['seq', 'split'] },
    boxes: { op: 'pick', args: ['selBox', 'split'] },
    boxNow: { op: 'pick', args: ['boxes', 'pos'] },
    hls: { op: 'pick', args: ['seqHl', 'split'] },
    hl0: { op: 'pick', args: ['hls.0', 'pos'] },
    hl1: { op: 'pick', args: ['hls.1', 'pos'] },
    found: { op: 'pick', args: ['vocabBox', 'id'] },
    vhl0: { op: 'pick', args: ['vocabHl.0', 'id'] },
    vhl1: { op: 'pick', args: ['vocabHl.1', 'id'] },
    vhl2: { op: 'pick', args: ['vocabHl.2', 'id'] },
    vhl3: { op: 'pick', args: ['vocabHl.3', 'id'] },
    vhl4: { op: 'pick', args: ['vocabHl.4', 'id'] },
    onNow: { op: 'pick', args: ['on', 'split'] },
  },
  objects: [
    text('question', 'How does each character become the integer ID the model reads - and back?', 40, 34, { typography: 'body' }),
    text('prerequisites', 'Builds on: splitting text into pieces (Overview); sorting, and lookup in a table', 40, 58),
    text('status', 'Source value: the sorted list and GPT-2\'s IDs  ·  Live calculation: the lookup, characters per ID', 40, 82, { typography: 'caption' }),

    // The encoded line. The selected column sits in a box; IDs under tokens.
    text('seq-title', '{{seqNow.title}}', 40, 112, { typography: 'caption' }),
    { id: 'sel-box', type: 'box', semanticId: 'selected-column', conceptId: CONCEPT,
      initialState: { x: { $derive: 'boxNow.x' }, y: { $derive: 'boxNow.y' }, w: { $derive: 'boxNow.w' }, h: 46, role: 'learner' } },
    labels('seq-tok-1', { $derive: 'seqNow.tok.0' }, { $derive: 'seqNow.top.0' }, { cellHighlight: { $derive: 'hl0' } }),
    labels('seq-id-1', { $derive: 'seqNow.id.0' }, { $derive: 'seqNow.idTop.0' }, { role: 'output', cellHighlight: { $derive: 'hl0' } }),
    labels('seq-tok-2', { $derive: 'seqNow.tok.1' }, SEQ.char[1], { cellHighlight: { $derive: 'hl1' } }),
    labels('seq-id-2', { $derive: 'seqNow.id.1' }, { $derive: 'seqNow.idTop.1' }, { role: 'output', cellHighlight: { $derive: 'hl1' } }),
    // GPT-2 mode: the boxed piece spelled out below it, the selected character boxed.
    { id: 'char-box', type: 'box', semanticId: 'selected-character', conceptId: CONCEPT,
      initialState: { x: { $derive: 'charBox.x' }, y: { $derive: 'charBox.y' }, w: SPELL.pitch, h: 26, role: 'learner', ...whenBpe } },
    { id: 'spelled', type: 'tokens', semanticId: 'piece-spelled', conceptId: CONCEPT,
      initialState: { x: { $derive: 'spellAt' }, y: SPELL.top, tokenStyle: 'labels', tokens: { $derive: 'spelled' }, cellHighlight: { $derive: 'charInPiece' }, ...whenBpe } },

    // Character mode: the sorted list, where the lookup happens; the box lands on the entry argmin found.
    { id: 'found-box', type: 'box', semanticId: 'found-entry', conceptId: CONCEPT,
      initialState: { x: { $derive: 'found.x' }, y: { $derive: 'found.y' }, w: COL(2) + 8, h: 46, role: 'learner', ...whenChar } },
    text('vocab-title', `The sorted list of all ${tok.vocab.length} characters, entry number under each (⏎ = new line; the one digit is {{onlyDigit}})`, 40, VOCAB.title, { typography: 'caption', ...whenChar }),
    ...Array.from({ length: VOCAB_ROWS }, (u, r) => [
      labels(`vocab-ch-${r}`, vocabRow(r).map(e => e.ch), VOCAB.top + r * VOCAB.pitch, { cellHighlight: { $derive: `vhl${r}` }, opacity: { $derive: 'onNow.table' } }),
      labels(`vocab-rank-${r}`, vocabRow(r).map(e => e.rank), VOCAB.top + r * VOCAB.pitch + 18, { role: 'output', cellHighlight: { $derive: `vhl${r}` }, opacity: { $derive: 'onNow.table' } }),
    ]).flat(),
    // The found entry at full strength over the quieted list: character over ID.
    { id: 'found-ch', type: 'tokens', semanticId: 'found-entry-character', conceptId: CONCEPT,
      initialState: { x: { $derive: 'found.tx' }, y: { $derive: 'found.ty' }, tokenStyle: 'labels', tokens: { $derive: 'found.ch' }, cellHighlight: 0, ...whenChar } },
    { id: 'found-rank', type: 'tokens', semanticId: 'found-entry-id', conceptId: CONCEPT,
      initialState: { x: { $derive: 'found.tx' }, y: { $derive: 'found.rankY' }, tokenStyle: 'labels', tokens: { $derive: 'found.rank' }, role: 'output', cellHighlight: 0, ...whenChar } },

    // GPT-2 mode: how many characters each piece (each ID) covers, and what that averages to.
    text('pieces-title', `Characters in each piece - its ID comes from GPT-2's fixed table of {{bpeVocab}}`, 40, VOCAB.title, { typography: 'caption', ...whenBpe }),
    { id: 'piece-box', type: 'box', semanticId: 'selected-piece-bar', conceptId: CONCEPT,
      initialState: { x: { $derive: 'pieceBox' }, y: PIECE_BARS.y + PIECE_BARS.h + 1, w: PIECE_BARS.cell - 8, h: 16, role: 'learner', ...whenBpe } },
    { id: 'piece-bars', type: 'bars', semanticId: 'piece-lengths', conceptId: CONCEPT,
      initialState: { x: PIECE_BARS.x, y: PIECE_BARS.y, h: PIECE_BARS.h, cell: PIECE_BARS.cell, peak: Math.max(...pieceLens), role: 'input',
        values: pieceLens, labels: bpeShown, ...whenBpe } },
    ...pieceLens.map((n, k) => text(`piece-len-${k}`, `{{pieceLens.${k}}}`,
      PIECE_BARS.x + k * PIECE_BARS.cell + PIECE_BARS.cell / 2 - 4,
      PIECE_BARS.y + PIECE_BARS.h - Math.max(1, (n / Math.max(...pieceLens)) * (PIECE_BARS.h - 4)) - 8, { typography: 'caption', ...whenBpe })),
    text('rate-title', 'Characters per ID', RATE_X, 316, { typography: 'caption', ...whenBpe }),
    text('rate-line', 'this line: {{pieceTotal}} characters / {{bpeCount}} IDs = {{lineRate.0}}', RATE_X, 340, { typography: 'body', role: 'output', ...whenBpe }),
    text('rate-play', 'the whole play: {{playCharsShown}} / {{playIdsShown}} ≈ {{playRate.0}}', RATE_X, 364, whenBpe),
    text('order', '“{{any.piece}}” comes first alphabetically, yet its ID is larger:', RATE_X, 404, whenBpe),
    text('order-2', '{{any.id}} > {{we.id}}. GPT-2 numbers a piece by when its merge', RATE_X, 424, whenBpe),
    text('order-3', 'was learned, not by spelling.', RATE_X, 444, whenBpe),

    // The lookup and its inverse for the selected character.
    text('lookup-char', 'Lookup: “{{ch}}” (code {{code}}) is entry {{id}} of the sorted list → ID {{id}}', 40, 512, { typography: 'body', role: 'output', ...whenChar }),
    text('decode-char', 'Decode: entry {{id}} of the list is “{{decoded}}” - the same character comes back', 40, 538, { typography: 'body', ...whenChar }),
    text('lookup-bpe', 'Lookup: “{{ch}}” sits inside the piece “{{pieceShown}}” → ID {{pieceId}}', 40, 512, { typography: 'body', role: 'output', ...whenBpe }),
    text('decode-bpe', 'Decode: ID {{pieceId}} → “{{pieceShown}}” - the whole piece comes back, not just “{{ch}}”', 40, 538, { typography: 'body', ...whenBpe }),
    text('range-char', 'ID = entry number, so every ID is 0 to {{lastEntry}}. Sorted by character code: capitals {{capitals}}, small letters {{smalls}}.', 40, 576, whenChar),
    text('range-bpe', 'Every ID is 0 to {{bpeLast}}: GPT-2\'s table has {{bpeVocab}} entries, the character list {{vocabSize}}.', 40, 576, whenBpe),
    // Static floor rule: the block is sized from the scene's static content and
    // everything below the header is input-bound, so without it the card renders
    // shrunk far below the legibility floors and refits on every input change.
    { id: 'floor', type: 'line', semanticId: 'floor', conceptId: CONCEPT,
      initialState: { from: { x: X0 - 4, y: 592 }, to: { x: RIGHT, y: 592 }, role: 'neutral', opacity: 0.3 } },
  ],
  timeline: [],
};

const GEN = 'uv run --with tiktoken==0.14.0 python packages/web/src/nanogpt/depth/fixtures/gen_tokenization.py --check';

export const sources = [
  code('data/shakespeare_char/prepare.py', 23, 25, 'The sorted list: "chars = sorted(list(set(data)))" - every distinct character of the text in code-point order - and "vocab_size = len(chars)".'),
  code('data/shakespeare_char/prepare.py', 29, 35, 'The lookup and its inverse: "stoi = { ch:i for i,ch in enumerate(chars) }" (ID = entry number), "itos" the reverse, "encode" and "decode" apply them per character.'),
  code('data/shakespeare_char/prepare.py', 64, 66, 'prepare.py\'s own printed output: the 65 characters in sorted order and "vocab size: 65".'),
  code('data/shakespeare/prepare.py', 19, 22, 'GPT-2 pieces: "enc = tiktoken.get_encoding("gpt2")", "train_ids = enc.encode_ordinary(train_data)".'),
  calculation('Source value', "The line's IDs and GPT-2's pieces",
    `generate_fixtures.py tokenizers(): "${fx.tokenizer.text}", the start of line 2 of the dataset, through prepare.py's character map, and through tiktoken "gpt2" ${fx.provenance.tiktoken}: ${bpeTk.tokens.map((t, k) => `"${t.replace('␣', ' ')}" ${bpeTk.ids[k]}`).join(', ')}.`),
  { ...calculation('Source value', `The sorted list of ${tok.vocab.length} characters and the whole-play counts`,
    `gen_tokenization.py rebuilds prepare.py's sorted(set(data)) over the sha-pinned text and checks the pinned prepare.py still builds it that way; the card searches this list. It also counts the whole play: ${tok.chars.total} characters, and ${tok.bpe.train} + ${tok.bpe.val} = ${tok.bpe.total} GPT-2 IDs through data/shakespeare/prepare.py's 90/10 split - the sizes both prepare.py files print.`),
  reproduce: GEN },
  calculation('Live calculation', 'The lookup, the decode and characters per ID',
    `Computed on the card: the selected character's code point is compared with every entry of the sorted list (sub, then elementwise square); argmin gives its entry number - the ID. Decoding picks that entry back out of the list. In GPT-2 mode the piece holding the character, and the character's place in it, are picked from position tables built from the recorded pieces; the pieces' lengths are summed (sum) and scaled by 1 / ${bpeTk.count} for this line's characters per ID, and ${tok.chars.total} is scaled by 1 / ${tok.bpe.total} for the whole play's (${(tok.chars.total / tok.bpe.total).toFixed(4)}, shown to 3 decimals).`),
  { kind: 'doc', title: 'tiktoken 0.14.0 load.py: GPT-2 IDs are merge ranks', url: 'https://github.com/openai/tiktoken/blob/0.14.0/tiktoken/load.py#L89-L144',
    note: `data_gym_to_mergeable_bpe_ranks, which builds tiktoken's "gpt2" table: the 256 single bytes take IDs 0-255, then "for first, second in bpe_merges: bpe_ranks[...] = n; n += 1" numbers every merged piece in the order GPT-2's vocab.bpe lists its merges - the order they were learned - and "assert bpe_ranks == encoder_json_loaded" checks GPT-2's own IDs agree. So "${bpeTk.tokens[1].replace('␣', ' ')}" (${bpeTk.ids[1]}) was merge ${bpeTk.ids[1] - 256} and "${bpeTk.tokens[3].replace('␣', ' ')}" (${bpeTk.ids[3]}) merge ${bpeTk.ids[3] - 256}, whatever their spelling.` },
  tinyShakespeare('The sorted list is every distinct character of this file.'),
  tiktoken(`GPT-2's ${bpeTk.vocabSize}-entry table the piece IDs come from.`),
];

export const evidence = {
  card: scene.id,
  title: scene.title,
  learningQuestion: scene.objects[0].initialState.text,
  concept: 'Character-level: ID = entry number of the character in the code-sorted list of the text\'s 65 characters (stoi); decode reads the list back (itos). GPT-2 BPE: each character belongs to one piece; the piece\'s ID is its merge rank in a fixed 50,257-entry table (not alphabetical), decoding returns the whole piece, and one ID covers 5.8 characters of this line but 3.3 on average over the play.',
  sourceRevision: `${fx.provenance.nanogpt.repo}@${fx.provenance.nanogpt.commit}`,
  provenance: 'Source value: sorted list and whole-play counts from gen_tokenization.py (prepare.py logic over the pinned text); line IDs and pieces from generate_fixtures.py; merge-rank order from tiktoken 0.14.0 load.py. Live calculation: argmin lookup, decode pick, piece lengths summed, characters per ID for the line and the play.',
  control: `pos - index slider over the ${charTk.count} characters of the line; split - choice: Characters (${charTk.vocabSize}) | GPT-2 pieces (${bpeTk.vocabSize})`,
  consequence: `Moving pos moves the boxed column in the encoded line and, in character mode, the searched code, the found entry (full strength over the quieted sorted list) and the lookup/decode readouts (entry number = ID, rising with the code); in GPT-2 mode it moves the boxed piece, the box under its bar and the boxed character in the piece spelled out below it. Switching split re-encodes the line as ${bpeTk.count} pieces, swaps the sorted list for the piece-length bars, characters per ID (${charTk.count} / ${bpeTk.count} = ${charTk.count / bpeTk.count} for the line against about 3.3 for the play) and the merge-order note, and the lookup now lands on the whole piece.`,
  interactionPurpose: 'Manipulate the mechanism: scrub a character through the lookup and back, and verify that entry number and ID agree and follow character code, that IDs stay under the list size, and how many characters one GPT-2 ID stands for.',
  task: 'none (explore only)',
  capability: 'Index slider + choice; a live table lookup by argmin over squared code-point differences (sub, elementwise, argmin, pick); input-bound visibility swapping two panels; derived highlight boxes, a derived tokens row spelling the selected piece, labels highlights; sum, concat and scale for the ratios.',
  depth: 'Guided',
  prerequisites: 'Builds on: splitting text into pieces (Overview); sorting, and lookup in a table',
  ladderRole: 'Only this depth shows the mechanism with real numbers - the code-sorted list, the lookup that turns a character into its entry number and back, and ratios the learner can check on the card (characters per GPT-2 ID).',
};

export const reviewStates = [
  { pos: 0, split: 'char' },
  { pos: 10, split: 'char' },
  { pos: 6, split: 'char' },
  { pos: 0, split: 'bpe' },
  { pos: 10, split: 'bpe' },
  { pos: 6, split: 'bpe' },
];

// Cross-depth transitions (docs/nanogpt-depth-ladder.md); the ladder neighbours are implicit.
// c06: the same line's IDs in both tokenizers, "an ID is a position in that list".
// c07: what the model does with the ID this card produces - it picks a wte row.
export const transitions = [
  { relation: 'related', target_card: 'c06-tokenizer' },
  { relation: 'deepens_to', target_card: 'c07-embedding-lookup' },
];
