// Card 9 - token + position = the block's input. Sequence "Embeddings", 2 of
// 2 (c07's lookup is its prerequisite). Absorbs inventory card 8: the two
// tables are stage 1 of one pipeline - ① two tables, ② one row from each,
// ③ add them -> x. NanoGPT's forward: tok_emb = wte(idx), pos_emb = wpe(pos),
// x = drop(tok_emb + pos_emb); dropout is named, not modelled.
//
// "Before" and its IDs are NanoGPT's real character IDs; wte is c07's toy
// table and wpe a toy table authored here (calculated toy example, 4 numbers
// per row). x, the two e's and their difference are live derive ops. "wpe
// off" is a what-if: NanoGPT always adds pos_emb. The table maximum (0.90)
// bounds every sum, so the one shared colour scale never moves.
import fx from '../fixtures/nanogpt-fixtures.generated.js';
import { code, calculation, tinyShakespeare } from '../sources.js';
import { TOY_WTE, WORD_TOKENS } from './c07-embedding-lookup.js';

const { word: WORD, chars: CHARS, ids: IDS, rowIds: ROW_IDS, rowChars: ROW_CHARS } = WORD_TOKENS;
const A = fx.architecture;
// Calculated toy example: one made-up row per position 0..5, 4 numbers each.
export const TOY_WPE = [
  [0.12, 0.3, -0.21, -0.15],
  [0.26, -0.14, 0.09, 0.31],
  [-0.18, 0.22, 0.27, -0.06],
  [0.07, -0.29, 0.16, 0.2],
  [-0.23, 0.11, -0.08, 0.28],
  [-0.3, 0.19, 0.41, -0.11],
];
// The repeated character and the positions it sits at (e: 1 and 5).
const REPEAT = CHARS.find((ch, i) => CHARS.indexOf(ch) !== i);
const [P1, P2] = CHARS.map((ch, i) => (ch === REPEAT ? i : -1)).filter(i => i >= 0);
const R = ROW_IDS.indexOf(IDS[P1]);
const DIFF = `x at ${P2} − x at ${P1}`;

// 48, not 44: at 44 the minus of "-0.87" sat on the cell border.
const CELL = 48;
const WTE = { x: 120, y: 292 };
const WPE = { x: 390, y: 292 };
const TRACE_X = 620;
const TRACE = { tok: 312, pos: 408, x: 504 };
const PAIR = { x: 160, y: 640 };
const rowOf = position => ROW_IDS.indexOf(IDS[position]);
const box = (x, y) => {
  const x0 = x - 3, x1 = x + 4 * CELL + 3, y0 = y - 3, y1 = y + CELL + 3;
  return { tl: { x: x0, y: y0 }, tr: { x: x1, y: y0 }, bl: { x: x0, y: y1 }, br: { x: x1, y: y1 } };
};
// A lit table row: four lines 3px outside it (a cell ring alone is too faint).
const frame = (id, corners, extra = {}) => [['top', 'tl', 'tr'], ['bottom', 'bl', 'br'], ['left', 'tl', 'bl'], ['right', 'tr', 'br']].map(([side, a, b]) => ({
  id: `${id}-${side}`, type: 'line', semanticId: `${id}-${side}`, conceptId: 'embeddings',
  initialState: { from: { $derive: `${corners}.${a}` }, to: { $derive: `${corners}.${b}` }, role: 'output', ...extra },
}));
const heat = { heat: { mode: 'signed' }, valueScale: 'shared', valueScaleGroup: 'embeddings' };
const text = (id, value, x, y, extra = {}) => ({ id, type: 'text', semanticId: id, conceptId: 'embeddings',
  initialState: { text: value, x, y, ...extra } });
const note = (id, value, x, y, extra = {}) => text(id, value, x, y, { typography: 'annotation', ...extra });
const strip = (id, label, y, values, extra = {}) => ({ id, type: 'strip', semanticId: id, conceptId: 'embeddings',
  initialState: { label, x: TRACE_X, y, cell: CELL, ...heat, values: { $derive: values }, opacity: 0, ...extra } });

export const scene = {
  id: 'nanogpt-c09-token-plus-position',
  title: 'Token + position = the block’s input',
  width: 960,
  height: 874,
  duration: 3,
  inputs: [
    { name: 'position', type: 'index', label: `Position in “${WORD}”`, of: 'positionLabels', default: P2, presentation: 'slider' },
    { name: 'wpe', type: 'bool', label: 'Add wpe, the position row (off = what-if)', default: true },
  ],
  exampleData: {
    positionLabels: CHARS.map((ch, i) => `${i} · ${ch}`),
    chars: CHARS,
    ids: IDS,
    rowOfPosition: CHARS.map((unused, i) => rowOf(i)),
    wteRows: ROW_CHARS.map(ch => TOY_WTE[ch]),
    wpeRows: TOY_WPE,
    wteFrames: ROW_IDS.map((unused, r) => box(WTE.x, WTE.y + r * CELL)),
    wpeFrames: TOY_WPE.map((unused, p) => box(WPE.x, WPE.y + p * CELL)),
    posLabelsOn: CHARS.map((unused, p) => `② position row = wpe row ${p}`),
    posLabelOff: '② position row: not added',
    xLabelOn: '③ x = token row + position row',
    xLabelOff: '③ x = token row alone',
    xNoteOn: 'what the first block reads here',
    xNoteOff: 'what-if: NanoGPT always adds wpe',
    readsOn: CHARS.map((unused, p) => `reads wte row ${IDS[p]} + wpe row ${p}`),
    readsOff: CHARS.map((unused, p) => `reads wte row ${IDS[p]} only (wpe off: what-if)`),
    verdictOn: 'Different: same token row, different position rows.',
    verdictOff: `Identical: without wpe the ${REPEAT}’s can’t be told apart.`,
    whyOn: `Their difference = wpe row ${P2} − wpe row ${P1}: the position part.`,
    whyOff: 'Their difference is 0: nothing position-specific was added.',
    roleOn: 'output',
    roleOff: 'warning',
    vocab: A.vocab_size,
    T: A.block_size,
    nEmbd: A.n_embd,
    p: A.dropout,
  },
  derived: {
    ch: { op: 'pick', args: ['chars', 'position'] },
    id: { op: 'pick', args: ['ids', 'position'] },
    row: { op: 'pick', args: ['rowOfPosition', 'position'] },
    // ② one row from each table.
    tokRow: { op: 'pick', args: ['wteRows', 'row'] },
    posRow: { op: 'pick', args: ['wpeRows', 'position'] },
    posRowShown: { op: 'gate', args: ['posRow', 'wpe'] },
    // ③ add them (live); the what-if keeps the token row alone.
    sum: { op: 'add', args: ['tokRow', 'posRow'] },
    x: { op: 'choose', args: ['wpe', 'sum', 'tokRow'] },
    // The two e's as the block reads them, and their difference (live).
    xP1Sum: { op: 'add', args: [`wteRows.${R}`, `wpeRows.${P1}`] },
    xP2Sum: { op: 'add', args: [`wteRows.${R}`, `wpeRows.${P2}`] },
    xP1: { op: 'choose', args: ['wpe', 'xP1Sum', `wteRows.${R}`] },
    xP2: { op: 'choose', args: ['wpe', 'xP2Sum', `wteRows.${R}`] },
    pairDiff: { op: 'sub', args: ['xP2', 'xP1'] },
    pair: { op: 'concat', args: ['xP1', 'xP2', 'pairDiff'] },
    wteFrame: { op: 'pick', args: ['wteFrames', 'row'] },
    wpeFrame: { op: 'pick', args: ['wpeFrames', 'position'] },
    wpeFrameOpacity: { op: 'choose', args: ['wpe', 1, 0] },
    posLabelOn: { op: 'pick', args: ['posLabelsOn', 'position'] },
    posLabel: { op: 'choose', args: ['wpe', 'posLabelOn', 'posLabelOff'] },
    xLabel: { op: 'choose', args: ['wpe', 'xLabelOn', 'xLabelOff'] },
    xNote: { op: 'choose', args: ['wpe', 'xNoteOn', 'xNoteOff'] },
    readsOnSel: { op: 'pick', args: ['readsOn', 'position'] },
    readsOffSel: { op: 'pick', args: ['readsOff', 'position'] },
    reads: { op: 'choose', args: ['wpe', 'readsOnSel', 'readsOffSel'] },
    verdict: { op: 'choose', args: ['wpe', 'verdictOn', 'verdictOff'] },
    why: { op: 'choose', args: ['wpe', 'whyOn', 'whyOff'] },
    stateRole: { op: 'choose', args: ['wpe', 'roleOn', 'roleOff'] },
  },
  objects: [
    text('question', `Two e’s in “${WORD}”: do they enter the first block as the same vector?`, 40, 34, { typography: 'heading' }),
    note('status', 'IDs: Source value · tables: Calculated toy example, 4 numbers per row · x: Live calculation · wpe off: What-if', 40, 62),

    { id: 'idx', type: 'grid', semanticId: 'token-ids', conceptId: 'token-ids',
      initialState: { label: `idx: “${WORD}” as character IDs`, x: 150, y: 136, rows: 2, cols: CHARS.length, cell: CELL,
        matrixKind: 'input', numberFormat: 'integer', role: 'input', rowLabels: ['position', 'token ID'], columnLabels: [...CHARS],
        values: [...CHARS.map((unused, i) => i), ...IDS], cellHighlight: { col: { $derive: 'position' } }, cellHighlightKind: 'select' } },
    text('selected', 'Position {{position}}: “{{ch}}”, token ID {{id}}', 470, 172, { role: 'input' }),
    note('reads', '{{reads}}', 470, 196),

    // ① two tables.
    { id: 'wte', type: 'grid', semanticId: 'wte-table', conceptId: 'token-embedding',
      initialState: { label: `① wte, by token ID (${ROW_IDS.length} of {{vocab}} rows)`, x: WTE.x, y: WTE.y, rows: ROW_IDS.length, cols: 4, cell: CELL,
        matrixKind: 'input', role: 'neutral', ...heat, rowLabels: ROW_IDS.map((id, r) => `row ${id} · ${ROW_CHARS[r]}`),
        values: { $derive: 'wteRows' }, cellHighlight: { row: { $derive: 'row' } }, cellHighlightKind: 'highlight' } },
    { id: 'wpe-table', type: 'grid', semanticId: 'wpe-table', conceptId: 'position-embedding',
      initialState: { label: `① wpe, by position (${TOY_WPE.length} of {{T}} rows)`, x: WPE.x, y: WPE.y, rows: TOY_WPE.length, cols: 4, cell: CELL,
        matrixKind: 'input', role: 'neutral', ...heat, rowLabels: TOY_WPE.map((unused, p) => `row ${p}`),
        values: { $derive: 'wpeRows' }, cellHighlight: { row: { $derive: 'position' } }, cellHighlightKind: 'highlight' } },
    ...frame('wte-lit', 'wteFrame'),
    // No appear on these: their opacity follows wpe (an appear would win).
    ...frame('wpe-lit', 'wpeFrame', { opacity: { $derive: 'wpeFrameOpacity' } }),

    // ② one row from each, ③ add them.
    strip('token-row', '② token row = wte row {{id}}', TRACE.tok, 'tokRow'),
    text('plus', '+', TRACE_X - 26, TRACE.pos + CELL / 2 + 8, { typography: 'heading', opacity: 0 }),
    strip('position-row', '{{posLabel}}', TRACE.pos, 'posRowShown'),
    text('equals', '=', TRACE_X - 26, TRACE.x + CELL / 2 + 8, { typography: 'heading', opacity: 0 }),
    strip('x-row', '{{xLabel}}', TRACE.x, 'x', { role: { $derive: 'stateRole' } }),
    note('x-note', '{{xNote}}', TRACE_X, TRACE.x + CELL + 20, { opacity: 0 }),

    // The consequence: the two e's side by side.
    { id: 'pair', type: 'grid', semanticId: 'two-occurrences', conceptId: 'embeddings',
      initialState: { label: `The two ${REPEAT}’s as the first block reads them`, x: PAIR.x, y: PAIR.y, rows: 3, cols: 4, cell: CELL,
        matrixKind: 'derived', provenance: 'derived', role: { $derive: 'stateRole' }, ...heat,
        rowLabels: [`x at position ${P1}`, `x at position ${P2}`, DIFF], values: { $derive: 'pair' }, opacity: 0 } },
    text('verdict', '{{verdict}}', 390, PAIR.y + 38, { role: { $derive: 'stateRole' }, opacity: 0 }),
    note('why', '{{why}}', 390, PAIR.y + 62, { opacity: 0 }),

    note('dropout', 'Then x = drop(tok_emb + pos_emb): dropout (p = {{p}} in training) comes next and is not modelled here.', 40, 814),
    note('shape', 'NanoGPT adds them at all positions at once: tok_emb (B, T, {{nEmbd}}) + pos_emb (T, {{nEmbd}}), T ≤ block_size = {{T}}.', 40, 836),
    note('scale', 'Colour: orange = +, blue = −, one scale for both tables and every row on the card.', 40, 858),
  ],
  timeline: [
    { at: 0.4, action: 'appear', target: 'token-row', duration: 0.4 },
    { at: 0.8, action: 'appear', target: 'plus', duration: 0.3 },
    { at: 0.8, action: 'appear', target: 'position-row', duration: 0.4 },
    { at: 1.4, action: 'appear', target: 'equals', duration: 0.3 },
    { at: 1.4, action: 'appear', target: 'x-row', duration: 0.4 },
    { at: 1.6, action: 'appear', target: 'x-note', duration: 0.3 },
    { at: 2.1, action: 'appear', target: 'pair', duration: 0.4 },
    { at: 2.4, action: 'appear', target: 'verdict', duration: 0.3 },
    { at: 2.4, action: 'appear', target: 'why', duration: 0.3 },
  ],
};

export const reviewStates = [
  { position: P2, wpe: true }, { position: P1, wpe: true }, { position: P2, wpe: false }, { position: P1, wpe: false }, { position: 0, wpe: true },
];

// Practice: a transfer question - the pair it asks about is not drawn, so the
// answer is reasoned from x = wte[ID] + wpe[position], not read off the card.
const tk = fx.tokenizer;
const P3 = [...tk.text].findIndex((ch, i) => ch === REPEAT && i > P2);
const OPTIONS = [
  { id: 'same-same', label: 'Identical both times' },
  { id: 'differ-same', label: 'wpe on: different · wpe off: identical' },
  { id: 'differ-differ', label: 'Different both times' },
  { id: 'same-differ', label: 'wpe on: identical · wpe off: different' },
];
export const activity = {
  id: 'c09-practice',
  check: 'choice_equals',
  version: 1,
  prompt: `The tokenizer card’s text goes on: “${tk.text.slice(0, P3 + 1)}…”. A third ${REPEAT} sits at position ${P3}, past the rows drawn here. Does it enter the first block as the same vector as the ${REPEAT} at position ${P2}? Answer for wpe on and for wpe off.`,
  // ponytail: SceneActivity shows no pick for an untouched answer, so this
  // default never renders; it only satisfies the choice declaration.
  answer: { type: 'choice', label: `Same vector as the ${REPEAT} at position ${P2}?`, options: OPTIONS, default: 'same-same' },
  expected: 'differ-same',
  checkLabel: 'Check',
  feedbackPass: `Right. Both ${REPEAT}’s have ID ${IDS[P2]}, so both read wte row ${IDS[P2]}. With wpe on, position ${P3} adds wpe row ${P3} and position ${P2} adds wpe row ${P2} - different learned rows - so the sums differ. With wpe off only wte row ${IDS[P2]} is left: identical, and the block could not tell the ${REPEAT}’s apart.`,
  feedbackFail: `Not quite. Split x into its two parts. Token part: both ${REPEAT}’s have ID ${IDS[P2]}, so both read wte row ${IDS[P2]} - always identical. Position part: wpe has its own learned row for every position up to block_size = ${A.block_size}, so position ${P3} adds a different row than position ${P2}, and with wpe on the vectors differ. With wpe off the position part is gone and they are identical. Check it on the card with positions ${P1} and ${P2}.`,
};

// Phase 1 plan (docs/nanogpt-deep-dive-board-plan.md §10, verbatim where it fits).
export const plan = {
  concept: 'token and position embeddings',
  objective: 'After this card, the learner should understand that the first block reads the sum of a token row and a position row, so the same token at two positions enters as two different vectors.',
  prerequisites: ['c07 (an ID selects a row)'],
  causalSteps: [
    'stage 1: two tables - wte by token ID, wpe by position',
    'stage 2: pick one row from each',
    'stage 3: add them → x (then dropout, noted, not modelled)',
  ],
  primaryInteraction: 'a position slider for a repeated character, plus a what-if "wpe off": with positions the two occurrences differ; without, they are identical',
  check: 'practice: predict whether two occurrences of the same character enter the block as the same vector, with wpe on and with wpe off (asked about a third e the card does not draw, so it needs the rule, not the picture)',
  boundary: {
    decision: 'staged',
    reason: 'one causal pipeline (lookup, lookup, add), revealed in stages; card 8\'s two tables are its first stage, not a separate idea',
    sequence: { name: 'Embeddings', position: 2, of: 2, relationships: [{ type: 'prerequisite', card: 'c07-embedding-lookup' }] },
  },
};

const fmt = values => `[${values.join(', ')}]`;

export const sources = [
  code('model.py', 127, 128, 'The two tables: "wte = nn.Embedding(config.vocab_size, config.n_embd)," and "wpe = nn.Embedding(config.block_size, config.n_embd)," - one learned row per token ID, one per position.'),
  code('model.py', 173, 174, 'Positions are just 0..t-1: "pos = torch.arange(0, t, dtype=torch.long, device=device) # shape (t)", after "assert t <= self.config.block_size" - so wpe needs block_size rows.'),
  code('model.py', 177, 179, 'The pipeline this card stages: "tok_emb = self.transformer.wte(idx)", "pos_emb = self.transformer.wpe(pos)", then "x = self.transformer.drop(tok_emb + pos_emb)" - the sum (after dropout) is what the first Block reads.'),
  code('model.py', 180, 181, 'The first Block reads that x: "for block in self.transformer.h:" then "x = block(x)".'),
  code('config/train_shakespeare_char.py', 19, 19, 'The number of wpe rows for shakespeare_char: "block_size = 256 # context of up to 256 previous characters".'),
  code('config/train_shakespeare_char.py', 24, 25, 'Row length and the dropout that follows the add: "n_embd = 384" and "dropout = 0.2".'),
  code('data/shakespeare_char/prepare.py', 24, 33, 'Where the IDs come from: "chars = sorted(list(set(data)))" and "stoi = { ch:i for i,ch in enumerate(chars) }".'),
  calculation('Source value', `The IDs of “${WORD}”, block_size, n_embd and dropout`,
    `generate_fixtures.py rebuilt the character vocabulary with prepare.py's logic over the sha-pinned Tiny Shakespeare file and mapped the tokenizer card's sentence through stoi; this card takes its first ${CHARS.length} IDs, ${fmt(IDS)} for ${fmt(CHARS)}, and the practice names the third ${REPEAT} at position ${P3} of the same sentence. block_size ${A.block_size}, n_embd ${A.n_embd}, dropout ${A.dropout} and vocab_size ${A.vocab_size} come from the resolved shakespeare_char config (fx.architecture).`),
  // Authored on the cards, not by the fixture generator - so no reproduce command.
  { kind: 'calculation', status: 'Calculated toy example', title: 'The wte and wpe rows',
    note: `Typed into the cards, 4 numbers per row instead of ${A.n_embd}, not learned weights. wte (from c07): ${ROW_IDS.map((id, r) => `row ${id} (${ROW_CHARS[r]}) = ${fmt(TOY_WTE[ROW_CHARS[r]])}`).join('; ')}. wpe: ${TOY_WPE.map((row, p) => `row ${p} = ${fmt(row)}`).join('; ')}. Only the rows this word uses are shown (${ROW_IDS.length} of ${A.vocab_size} and ${TOY_WPE.length} of ${A.block_size}); the largest |value| (0.9) bounds every sum, so the shared colour scale does not move.` },
  calculation('Live calculation', 'x, the two e’s and their difference',
    `Computed on the card: pick selects the token's wte row and the position's wpe row; add gives x = token row + position row; for the two ${REPEAT}'s (positions ${P1} and ${P2}), add gives each x and sub their difference, concat lays the three rows out. Every toy value has two decimals, so each sum and difference shown is exact.`),
  calculation('What-if', 'wpe off',
    'NanoGPT always adds pos_emb. With the toggle off the card keeps the token row alone (choose), gate blanks the position row, and the difference of the two occurrences is exactly zero - what the block would see with no position information.'),
  tinyShakespeare(`“${WORD}” is the first word of the tokenizer card's sentence, taken from this file.`),
];

export const evidence = {
  card: 'c09-token-plus-position',
  title: scene.title,
  learningQuestion: scene.objects[0].initialState.text,
  concept: 'GPT.forward builds the first Block\'s input as x = drop(wte(idx) + wpe(pos)): a token row chosen by the token ID plus a position row chosen by the position 0..t-1. The same token at two positions reads the same wte row but different wpe rows, so it enters as two different vectors; without wpe (a what-if) the two would be identical. Absorbs inventory card 8 (the two tables) as stage 1.',
  sourceRevision: `${fx.provenance.nanogpt.repo}@${fx.provenance.nanogpt.commit}`,
  provenance: `source: model.py:127-128 (wte, wpe), :173-174 (pos = arange, t <= block_size), :177-179 (tok_emb, pos_emb, x = drop(sum)), :180-181 (first Block reads x), config/train_shakespeare_char.py:19, :24-25, data/shakespeare_char/prepare.py:24-33 - checked against the pinned files. Source value: IDs ${fmt(IDS)} from fx.tokenizer, block_size/n_embd/dropout from fx.architecture. Calculated toy example: wte (c07's rows) and 6 wpe rows, 4 numbers each, typed into the cards. Live calculation: pick, add, choose, gate, sub, concat. What-if: wpe off.`,
  control: `position - index slider over the ${CHARS.length} positions of "${WORD}" (default ${P2}, the second ${REPEAT}); wpe - bool "Add wpe, the position row (off = what-if)", default on.`,
  consequence: `Position moves the ringed idx column, the lit wte row (by ID) and the lit wpe row (by position); the trace strips show that token row + position row = x. At positions ${P1} and ${P2} the wte row is the same (${IDS[P1]}) and the wpe row differs, so x differs. The pair grid always shows x at ${P1}, x at ${P2} and their difference: non-zero (= wpe row ${P2} − wpe row ${P1}) with wpe on; with wpe off the position strip blanks, the wpe frame goes, x is the token row alone, both rows of the pair are identical and the difference row is all zeros, captions and roles switch to the what-if warning.`,
  interactionPurpose: 'See where position information enters: the token part of x is fixed by the ID, the position part by the slot, and removing wpe (what-if) makes repeated tokens indistinguishable.',
  task: `Slide between positions ${P1} and ${P2} and compare the lit rows and x; turn wpe off and watch the pair's difference row go to zero. Practice: predict for a third ${REPEAT} at position ${P3}, not drawn, with wpe on and off.`,
  capability: 'index slider + bool; pick of table rows and of derived frame corners; add/sub/concat live arithmetic; gate to blank the what-if row; choose for captions, roles and a derived frame opacity (no appear on those lines); cellHighlight rows bound to derived values; signed heat on one shared valueScaleGroup with a state-independent domain; a choice practice with a transfer question.',
};
