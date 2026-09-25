// Card 7 - a token ID selects one row of the embedding table. Sequence
// "Embeddings", 1 of 2 (a prerequisite of c09, which adds the position row).
// The word "Before" and its IDs are NanoGPT's real character-level IDs
// (fx.tokenizer, the same text the tokenizer card uses); the table numbers
// are a calculated toy example authored here, 4 per row instead of n_embd.
// The only derive op is pick: the lesson is that the lookup does no
// arithmetic. The NanoGPT lines are the card's `sources`, collapsed under it.
import fx from '../fixtures/nanogpt-fixtures.generated.js';
import { code, calculation, tinyShakespeare } from '../sources.js';

const charTk = fx.tokenizer.tokenizers.find(t => t.id === 'char');
const WORD = 'Before';
const CHARS = [...WORD];
const IDS = charTk.ids.slice(0, CHARS.length);
// The word's distinct characters, in ID order: the wte rows this card shows.
const ROW_IDS = [...new Set(IDS)].sort((a, b) => a - b);
const ROW_CHARS = ROW_IDS.map(id => CHARS[IDS.indexOf(id)]);

// Calculated toy example: one made-up row per character, 4 numbers instead of
// n_embd. Shared with c09 so both cards read the same table. The largest
// |value| (0.90, row B) bounds every sum c09 draws, so its shared colour
// scale never moves between states.
export const TOY_WTE = {
  B: [0.42, -0.31, 0.15, 0.9],
  e: [-0.57, 0.64, 0.23, -0.12],
  f: [0.19, 0.05, -0.76, 0.34],
  o: [0.71, -0.48, 0.36, -0.25],
  r: [-0.09, 0.27, 0.58, 0.61],
};
export const WORD_TOKENS = { word: WORD, chars: CHARS, ids: IDS, rowIds: ROW_IDS, rowChars: ROW_CHARS };

const CELL = 48;
const IDX = { x: 150, y: 136 };
const WTE = { x: 150, y: 316 };
const VEC = { x: 480, y: 412 };
const rowOf = position => ROW_IDS.indexOf(IDS[position]);
const others = position => CHARS.map((ch, i) => (ch === CHARS[position] && i !== position ? i : -1)).filter(i => i >= 0);
const sameRowNote = position => (others(position).length
  ? `Both ${CHARS[position]}’s (positions ${[position, ...others(position)].sort().join(' and ')}) have ID ${IDS[position]}: same row.`
  : `“${CHARS[position]}” appears once here; any ${CHARS[position]} gets row ${IDS[position]}.`);

const heat = { heat: { mode: 'signed' }, valueScale: 'shared', valueScaleGroup: 'wte' };
// The lit row: four lines 3px outside it (a cell ring alone is too faint to
// read as "this row"), in the output hue the arrow and the vector share.
const rowFrame = r => {
  const x0 = WTE.x - 3, x1 = WTE.x + 4 * CELL + 3, y0 = WTE.y + r * CELL - 3, y1 = WTE.y + (r + 1) * CELL + 3;
  return { tl: { x: x0, y: y0 }, tr: { x: x1, y: y0 }, bl: { x: x0, y: y1 }, br: { x: x1, y: y1 } };
};
const frame = (id, corners) => [['top', 'tl', 'tr'], ['bottom', 'bl', 'br'], ['left', 'tl', 'bl'], ['right', 'tr', 'br']].map(([side, a, b]) => ({
  id: `${id}-${side}`, type: 'line', semanticId: `${id}-${side}`, conceptId: 'token-embedding',
  initialState: { from: { $derive: `${corners}.${a}` }, to: { $derive: `${corners}.${b}` }, role: 'output', opacity: 0 },
}));
const text = (id, value, x, y, extra = {}) => ({ id, type: 'text', semanticId: id, conceptId: 'token-embedding',
  initialState: { text: value, x, y, ...extra } });
const note = (id, value, x, y, extra = {}) => text(id, value, x, y, { typography: 'annotation', ...extra });

export const scene = {
  id: 'nanogpt-c07-embedding-lookup',
  title: 'Token ID → embedding row',
  width: 960,
  height: 712,
  duration: 2,
  inputs: [
    { name: 'token', type: 'index', label: `Token of “${WORD}” (position · character)`, of: 'tokenLabels', default: 1, presentation: 'picker' },
  ],
  exampleData: {
    tokenLabels: CHARS.map((ch, i) => `${i} · ${ch}`),
    chars: CHARS,
    ids: IDS,
    rowOfPosition: CHARS.map((unused, i) => rowOf(i)),
    wteRows: ROW_CHARS.map(ch => TOY_WTE[ch]),
    rowCentres: ROW_IDS.map((unused, r) => WTE.y + r * CELL + CELL / 2),
    rowFrames: ROW_IDS.map((unused, r) => rowFrame(r)),
    sameRowNotes: CHARS.map((unused, i) => sameRowNote(i)),
    vocab: fx.architecture.vocab_size,
    nEmbd: fx.architecture.n_embd,
  },
  derived: {
    ch: { op: 'pick', args: ['chars', 'token'] },
    id: { op: 'pick', args: ['ids', 'token'] },
    row: { op: 'pick', args: ['rowOfPosition', 'token'] },
    vec: { op: 'pick', args: ['wteRows', 'row'] },
    arrowY: { op: 'pick', args: ['rowCentres', 'row'] },
    litFrame: { op: 'pick', args: ['rowFrames', 'row'] },
    sameRow: { op: 'pick', args: ['sameRowNotes', 'token'] },
  },
  objects: [
    text('question', 'What does the embedding layer do with a token ID?', 40, 34, { typography: 'heading' }),
    note('status', 'IDs: Source value (NanoGPT’s {{vocab}}-character vocabulary) · table: Calculated toy example, 4 numbers per row', 40, 62),

    { id: 'idx', type: 'grid', semanticId: 'token-ids', conceptId: 'token-ids',
      initialState: { label: `idx: “${WORD}” as character IDs`, x: IDX.x, y: IDX.y, rows: 2, cols: CHARS.length, cell: CELL,
        matrixKind: 'input', numberFormat: 'integer', role: 'input', rowLabels: ['position', 'token ID'], columnLabels: [...CHARS],
        values: [...CHARS.map((unused, i) => i), ...IDS], cellHighlight: { col: { $derive: 'token' } }, cellHighlightKind: 'select' } },
    text('selected', 'Selected: position {{token}}, character “{{ch}}”, token ID {{id}}', 480, 172, { role: 'input' }),
    note('selected-note', 'The ID is all the model receives for this position.', 480, 196),

    { id: 'wte', type: 'grid', semanticId: 'wte-table', conceptId: 'token-embedding',
      initialState: { label: `wte: one row per token ID (${ROW_IDS.length} of {{vocab}} rows shown)`, x: WTE.x, y: WTE.y,
        rows: ROW_IDS.length, cols: 4, cell: CELL, matrixKind: 'input', role: 'neutral', ...heat,
        rowLabels: ROW_IDS.map((id, r) => `row ${id} · ${ROW_CHARS[r]}`), values: { $derive: 'wteRows' },
        cellHighlight: { row: { $derive: 'row' } }, cellHighlightKind: 'highlight', opacity: 0 } },
    ...frame('lit-row', 'litFrame'),
    { id: 'arrow-lookup', type: 'arrow', semanticId: 'lookup-arrow', conceptId: 'token-embedding',
      initialState: { from: { x: WTE.x + 4 * CELL + 8, y: { $derive: 'arrowY' } }, to: { x: VEC.x - 8, y: VEC.y + CELL / 2 }, role: 'output', opacity: 0 } },
    { id: 'vector', type: 'strip', semanticId: 'token-vector', conceptId: 'token-embedding',
      initialState: { label: 'the token’s vector = wte row {{id}}', x: VEC.x, y: VEC.y, cell: CELL, role: 'output', ...heat,
        values: { $derive: 'vec' }, opacity: 0 } },
    text('lookup', 'No arithmetic: ID {{id}} just picks row {{id}}.', VEC.x, 500, { role: 'output', opacity: 0 }),
    note('same-row', '{{sameRow}}', VEC.x, 524, { opacity: 0 }),

    note('shape', 'In NanoGPT, tok_emb = wte(idx) does this at every position at once: IDs (B, T) → vectors (B, T, n_embd = {{nEmbd}}).', 40, 604),
    note('learned', 'wte is learned: its rows start random and change in training; which row an ID selects never changes.', 40, 628),
    note('scale', 'Colour: orange = +, blue = −, one scale for the table and the vector.', 40, 652),
  ],
  timeline: [
    { at: 0.0, action: 'appear', target: 'wte', duration: 0.4 },
    ...['top', 'bottom', 'left', 'right'].map(side => ({ at: 0.5, action: 'appear', target: `lit-row-${side}`, duration: 0.3 })),
    { at: 0.6, action: 'appear', target: 'arrow-lookup', duration: 0.3 },
    { at: 0.9, action: 'appear', target: 'vector', duration: 0.4 },
    { at: 1.3, action: 'appear', target: 'lookup', duration: 0.3 },
    { at: 1.3, action: 'appear', target: 'same-row', duration: 0.3 },
  ],
};

export const reviewStates = [{ token: 1 }, { token: 5 }, { token: 0 }, { token: 3 }];

// Phase 1 plan (docs/nanogpt-deep-dive-board-plan.md §10, verbatim where it fits).
export const plan = {
  concept: 'token embeddings',
  objective: 'After this card, the learner should understand that a token ID does no arithmetic: it selects one learned row of the embedding table, and that row is the token\'s vector.',
  prerequisites: ['token IDs (tokenizer card, c06)'],
  causalSteps: ['token ID', 'row index in wte (V × C)', 'that row, C numbers'],
  primaryInteraction: 'pick a token of a short phrase; its row in the (toy) wte table lights and appears as its vector; picking the same character elsewhere lights the same row',
  check: 'none: the relationship is read directly (same ID, same row)',
  boundary: {
    decision: 'single',
    reason: 'one mental model (lookup); the addition of positions is a second model and goes to c09',
    sequence: { name: 'Embeddings', position: 1, of: 2, relationships: [{ type: 'prerequisite', card: 'c09-token-plus-position' }] },
    reviewed: {
      'objective-two-clauses': 'one idea: ", and that row is the token\'s vector" names what the lookup returns, not a second mechanism - verbatim from the approved plan',
    },
  },
};

const fmt = values => `[${values.join(', ')}]`;

export const sources = [
  code('model.py', 127, 127, 'The token table: "wte = nn.Embedding(config.vocab_size, config.n_embd)," - one learned row of n_embd numbers per token ID.'),
  code('model.py', 177, 177, 'The lookup in forward: "tok_emb = self.transformer.wte(idx) # token embeddings of shape (b, t, n_embd)" - every ID in idx is replaced by its row.'),
  code('model.py', 167, 168, 'Embedding rows start random: "elif isinstance(module, nn.Embedding):" then "torch.nn.init.normal_(module.weight, mean=0.0, std=0.02)"; training then changes them.'),
  code('data/shakespeare_char/prepare.py', 24, 33, 'Where the IDs come from: "chars = sorted(list(set(data)))" and "stoi = { ch:i for i,ch in enumerate(chars) }" - an ID is a character\'s place in the sorted vocabulary.'),
  code('train.py', 153, 155, 'The table gets one row per vocabulary entry: "model_args[\'vocab_size\'] = meta_vocab_size if meta_vocab_size is not None else 50304".'),
  code('config/train_shakespeare_char.py', 24, 24, 'The real row length for shakespeare_char: "n_embd = 384".'),
  calculation('Source value', `The IDs of “${WORD}”, the vocabulary size and n_embd`,
    `generate_fixtures.py rebuilt the character vocabulary with prepare.py's logic over the sha-pinned Tiny Shakespeare file and mapped the tokenizer card's sentence through stoi; this card takes its first ${CHARS.length} IDs, ${fmt(IDS)} for ${fmt(CHARS)}. vocab_size ${fx.architecture.vocab_size} and n_embd ${fx.architecture.n_embd} come from the resolved shakespeare_char config (fx.architecture).`),
  // Authored on this card, not by the fixture generator - so no reproduce command.
  { kind: 'calculation', status: 'Calculated toy example', title: 'The wte rows',
    note: `Typed into this card (and reused by c09): ${ROW_IDS.map((id, r) => `row ${id} (${ROW_CHARS[r]}) = ${fmt(TOY_WTE[ROW_CHARS[r]])}`).join('; ')}. 4 numbers per row instead of ${fx.architecture.n_embd}; not learned weights, and only the ${ROW_IDS.length} rows this word uses are shown out of ${fx.architecture.vocab_size}. Picking a token selects a row (pick); nothing is computed.` },
  tinyShakespeare(`“${WORD}” is the first word of the tokenizer card's sentence, taken from this file.`),
];

export const evidence = {
  card: 'c07-embedding-lookup',
  title: scene.title,
  learningQuestion: scene.objects[0].initialState.text,
  concept: 'Token embedding: wte = nn.Embedding(vocab_size, n_embd) is a table with one learned row per token ID; tok_emb = wte(idx) replaces each ID by its row. The ID does no arithmetic - it is the row number - so equal IDs give identical vectors.',
  sourceRevision: `${fx.provenance.nanogpt.repo}@${fx.provenance.nanogpt.commit}`,
  provenance: `source: model.py:127 (wte), :177 (tok_emb = wte(idx)), :167-168 (normal init), data/shakespeare_char/prepare.py:24-33 (IDs), train.py:153-155 (vocab_size), config/train_shakespeare_char.py:24 (n_embd) - checked against the pinned files. Source value: the IDs ${fmt(IDS)} of "${WORD}" from fx.tokenizer (generate_fixtures.py), vocab_size and n_embd from fx.architecture. Calculated toy example: the 5 wte rows, 4 numbers each, typed into the card. Live: pick only.`,
  control: `token - index picker over the ${CHARS.length} positions of "${WORD}" ("0 · B" … "5 · e"), default position 1.`,
  consequence: 'The selected column of idx is ringed; the wte row with that ID lights, the arrow leaves from it, and the vector strip shows that row\'s numbers (same colours, one shared scale). Picking position 5 lights exactly the same row 43 as position 1 and shows the identical vector; the note switches between "same row" for the e\'s and "appears once" for the others.',
  interactionPurpose: 'Make the lookup visible as selection, not computation: the ID indexes a row, and equal IDs index the same row.',
  task: 'Pick each e (positions 1 and 5) and see that the same row and vector come out; pick another letter and see a different row light.',
  capability: 'index picker; pick for the row index, the row values and a derived arrow y; grid cellHighlight {col}/{row} bound to derived values (select vs highlight kinds); integer-format ID grid with row and column labels; signed heat on one shared valueScaleGroup across the table and the vector.',
};
