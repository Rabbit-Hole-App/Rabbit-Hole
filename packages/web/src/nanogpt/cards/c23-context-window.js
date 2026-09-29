// c23 - the context window at generation time. Sequence "Generation context",
// 3 of 3 (c24: each pass is handed all of idx; c25: the prediction depends on
// the text before it; this card: where that text is cut). Staged, one pipeline
// top to bottom: ① idx and the crop to its last block_size characters
// (idx_cond), ② the toy table's row for exactly idx_cond, ③ p and the most
// likely next character.
//
// Numbers: a calculated toy example, NOT the recorded bigram c24/c25 use - a
// one-character reader cannot be cropped. gen_generation.py counts, over the
// training split, what followed exactly the last k characters of "Befor", one
// separate table per toy block_size k = 2..5 (g.window). matches = sum, p =
// count × (100 / matches) and the most likely next character are live derive
// ops; caption and readout percentages are fixture strings the test asserts
// equal to the live cells.
//
// One control, a What-if toy block_size preset. The practice asks about
// NanoGPT's own run (newline start, block_size 256, new character 300), which
// the card never draws. Tutor note, not on the card: at block_size 1 this
// table would be a bigram (c25); the depth ladder's Generation · Deep dive 1/4
// holds block_size 3 and switches the prompt, this card holds the text and
// switches block_size.
import fx from '../fixtures/nanogpt-fixtures.generated.js';
import g from '../depth/fixtures/generation.generated.js';
import { CHIP_CHAR, CHIP_GAP, CHIP_PAD } from '../../animation-scene.js';
import { code, calculation, tinyShakespeare } from '../sources.js';

const A = fx.architecture;
const W = g.window;
const IDX = fx.tokenizer.tokenizers.find(t => t.id === 'char').tokens.slice(0, W.text.length); // B e f o r
if (IDX.join('') !== W.text) throw new Error(`the tokenizer's first ${W.text.length} characters are "${IDX.join('')}", not g.window.text "${W.text}"`);
const T = IDX.length; // 5
const KS = W.blocks; // toy block_size 2..5
const B_NANO = A.block_size; // 256
const DEFAULT = KS.indexOf(g.block); // 1: block_size 3, the depth ladder's toy block_size

// Plain-JS readings of the fixture, for strings the evaluator cannot format.
const pctText = (row, i, matches) => (row[i] * 100 / matches).toFixed(2);
const topOf = row => row.indexOf(Math.max(...row));
const TOP = W.counts.map(topOf);
const E = W.slots.indexOf('e');
const pct = W.counts.map((row, b) => row.map((unused, i) => pctText(row, i, W.matches[b])));
const ORDINAL = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'];
const rankE = row => row.filter(c => c > row[E]).length; // 0 = e leads
const q = s => `“${s}”`;

// Layout (scene units = CSS px at scale 1).
const COL_X = 170;
const CELL = 70;
const IDX_Y = 160;
const CHIP_W = CHIP_PAD * 2 + CHIP_CHAR; // one-character token, as the renderer draws it
const left = i => COL_X + i * (CHIP_W + CHIP_GAP);
const right = i => left(i) + CHIP_W;
const CROP_Y = 150, READ_Y = 202;
const READOUT_X = 600;
const COUNT_Y = 282, P_Y = COUNT_Y + CELL;
const BARS = { y: P_Y + CELL + 10, h: 150 }; // 432..582, labels under
const SIDE_X = COL_X + W.slots.length * CELL + 14; // 604, right of the grids and bars
const CONCEPT = 'context-window';

const text = (id, value, x, y, extra = {}) => ({ id, type: 'text', semanticId: id, conceptId: CONCEPT,
  initialState: { text: value, x, y, ...extra } });
const note = (id, value, x, y, extra = {}) => text(id, value, x, y, { typography: 'annotation', ...extra });
const line = (id, from, to, role, extra = {}) => ({ id, type: 'line', semanticId: id, conceptId: CONCEPT,
  initialState: { from, to, role, ...extra } });
const hidden = { opacity: 0 };

export const scene = {
  id: 'nanogpt-c23-context-window',
  title: 'Context window: what idx_cond crops away',
  width: 960,
  height: 819,                         // the padded content, 818.32: a 960-wide frame draws it at scale 1
  duration: 1.8,
  inputs: [
    { name: 'block', type: 'index', label: 'What-if: toy block_size (preset)', of: 'blockLabels', default: DEFAULT, presentation: 'slider' },
  ],
  exampleData: {
    blockLabels: KS.map(k => `block_size ${k}`),
    blocks: KS,
    windows: W.windows,
    cropNotes: W.cropped.map(c => (c ? `cropped from the prompt, still in idx: ${q(c)}` : 'no crop: idx ≤ block_size, idx_cond = idx')),
    keptIdxByBlock: KS.map(k => IDX.map((unused, i) => i).slice(T - k)),
    // ① the brackets: "cropped" over characters 0..t − k − 1, "read" under t − k..t − 1.
    cropEndByBlock: KS.map(k => right(Math.max(T - k - 1, 0))), // no crop at k = t: hidden, kept non-degenerate
    readStartByBlock: KS.map(k => left(T - k)),
    cropOpacity: KS.map(k => (k < T ? 1 : 0)),
    // ② that toy table's row for exactly idx_cond; ③ p = count × 100 / matches.
    countsByBlock: W.counts,
    pctPerMatchByBlock: W.matches.map(m => 100 / m), // the evaluator has no division
    slotLabels: W.slots,
    topPctTexts: TOP.map((top, b) => `${pct[b][top]}%`),
    captionsA: KS.map((k, b) => (k === T
      ? `No crop: all ${T} characters are read; after ${q(W.windows[b])}, e followed in ${W.counts[b][E]} of ${W.matches[b]} matches.`
      : TOP[b] === E
        ? `Cropped: ${q(W.cropped[b])}. After ${q(W.windows[b])}, e leads (${pct[b][E]}%): the e before ${q(W.windows[b - 1])} is still read.`
        : `Cropped: ${q(W.cropped[b])}. After ${q(W.windows[b])} a space leads (${pct[b][TOP[b]]}%); e gets ${pct[b][E]}%.`)),
    captionsB: [
      `The e before ${q(W.windows[1])} is cropped too, so e does not lead: it ranks ${ORDINAL[rankE(W.counts[0])]} of the ${W.slots.length} columns.`,
      `Read the e before ${q(W.windows[1])} (block_size ${KS[2]}) and e leads with ${pct[2][E]}%: the crop removed what pointed to e.`,
      `Crop that one e (block_size ${KS[1]}) and a space leads instead.`,
      'Once idx is longer than block_size, the oldest characters are cropped first.',
    ],
  },
  derived: {
    k: { op: 'pick', args: ['blocks', 'block'] },
    kept: { op: 'pick', args: ['windows', 'block'] },
    cropNote: { op: 'pick', args: ['cropNotes', 'block'] },
    keptIdx: { op: 'pick', args: ['keptIdxByBlock', 'block'] },
    cropEnd: { op: 'pick', args: ['cropEndByBlock', 'block'] },
    readStart: { op: 'pick', args: ['readStartByBlock', 'block'] },
    cropOp: { op: 'pick', args: ['cropOpacity', 'block'] },
    countsRow: { op: 'pick', args: ['countsByBlock', 'block'] },
    matches: { op: 'sum', args: ['countsRow'] },
    pctPerMatch: { op: 'pick', args: ['pctPerMatchByBlock', 'block'] },
    pPct: { op: 'scale', args: ['countsRow', 'pctPerMatch'] },
    negP: { op: 'scale', args: ['pPct', -1] },
    top: { op: 'argmin', args: ['negP'] },
    topCh: { op: 'pick', args: ['slotLabels', 'top'] },
    pTop: { op: 'pick', args: ['topPctTexts', 'block'] },
    captionA: { op: 'pick', args: ['captionsA', 'block'] },
    captionB: { op: 'pick', args: ['captionsB', 'block'] },
  },
  objects: [
    text('question', 'What does the next prediction read once idx is longer than block_size?', 40, 30, { typography: 'heading' }),
    note('status-1', 'Calculated toy example (counts over Tiny Shakespeare’s training text; not NanoGPT, not the bigram): counts', 40, 56),
    note('status-2', `Live calculation: matches, p = count ÷ matches, most likely next · What-if: toy block_size ${KS[0]} to ${KS.at(-1)}, one table each`, 40, 74),
    note('status-3', `Source value: the text, NanoGPT’s block_size ${B_NANO}`, 40, 92),
    note('builds-on', 'Builds on: each new character is predicted from the text before it; generate() appends it and repeats', 40, 112),
    note('why-toy', 'The bigram reads one character, so no crop changes its prediction; this toy reads the last block_size characters.', 40, 130),

    // ① idx and the crop: "cropped" above the row, "read" (idx_cond) below it.
    // No timeline appear on the cropped pair: its opacity follows block_size only.
    note('crop-label', 'cropped', 40, CROP_Y + 4, { opacity: { $derive: 'cropOp' } }),
    line('crop-bracket', { x: COL_X, y: CROP_Y }, { x: { $derive: 'cropEnd' }, y: CROP_Y }, 'neutral', { opacity: { $derive: 'cropOp' } }),
    text('idx-label', 'idx', 40, IDX_Y + 21, { typography: 'caption', ...hidden }),
    { id: 'idx', type: 'tokens', semanticId: 'idx', conceptId: CONCEPT,
      initialState: { x: COL_X, y: IDX_Y, tokens: [...IDX], role: 'input', tokenStyle: 'labels',
        cellHighlight: { $derive: 'keptIdx' }, cellHighlightKind: 'highlight', ...hidden } },
    text('next-slot', '→ ?', right(T - 1) + 14, IDX_Y + 21, hidden),
    note('read-label', 'read', 40, READ_Y + 4, { role: 'input', ...hidden }),
    line('read-bracket', { x: { $derive: 'readStart' }, y: READ_Y }, { x: right(T - 1), y: READ_Y }, 'input', hidden),
    note('readout-t', `${T} characters in idx · toy block_size {{k}}`, READOUT_X, 154, hidden),
    note('readout-read', 'idx_cond (read): “{{kept}}”', READOUT_X, 176, { role: 'input', ...hidden }),
    note('readout-crop', '{{cropNote}}', READOUT_X, 198, hidden),
    text('rule', 'The forward is handed only idx_cond, the last block_size characters of idx; the prompt is not exempt.', 40, 234, hidden),

    // ② the toy table's row for exactly idx_cond.
    { id: 'counts', type: 'grid', semanticId: 'next-character-counts', conceptId: CONCEPT,
      initialState: { x: COL_X, y: COUNT_Y, rows: 1, cols: W.slots.length, cell: CELL, matrixKind: 'input', role: 'input', numberFormat: 'integer',
        rowLabels: ['count'], columnLabels: [...W.slots], values: { $derive: 'countsRow' }, ...hidden } },
    text('matches', 'matches = {{matches}}', SIDE_X, COUNT_Y + 30, hidden),
    note('matches-note', 'times “{{kept}}” occurs in the training text', SIDE_X, COUNT_Y + 50, hidden),

    // ③ the prediction: p (%) as cells and as bars on a fixed 0..100 axis.
    { id: 'p', type: 'grid', semanticId: 'next-character-p', conceptId: CONCEPT,
      initialState: { x: COL_X, y: P_Y, rows: 1, cols: W.slots.length, cell: CELL, matrixKind: 'derived', role: 'prediction',
        rowLabels: ['p (%)'], values: { $derive: 'pPct' }, ...hidden } },
    text('p-rule', 'p = count ÷ matches', SIDE_X, P_Y + 40, hidden),
    { id: 'bars', type: 'bars', semanticId: 'next-character-bars', conceptId: CONCEPT,
      initialState: { x: COL_X, y: BARS.y, h: BARS.h, cell: CELL, peak: 100, role: 'prediction', labels: [...W.slots],
        values: { $derive: 'pPct' }, cellHighlight: { $derive: 'top' }, cellHighlightKind: 'highlight', ...hidden } },
    text('top-readout', 'Most likely next: {{topCh}} ({{pTop}})', SIDE_X, BARS.y + 30, { role: 'prediction', ...hidden }),
    text('caption-1', '{{captionA}}', 40, 620, hidden),
    text('caption-2', '{{captionB}}', 40, 642, hidden),
    text('only-idx-cond', 'The prediction can use only idx_cond: whatever the crop removes no longer counts.', 40, 672, hidden),
    text('idx-keeps', 'idx keeps every character: the crop limits what the model reads, not the text generate() returns.', 40, 694, hidden),

    note('legend', 'other = every remaining character together · each p cell is rounded on its own', 40, 720),
    note('footer-1', `Source value: NanoGPT’s block_size is fixed by the trained model, ${B_NANO} for shakespeare_char;`, 40, 742),
    note('footer-2', `the crop starts once idx passes ${B_NANO}.`, 40, 760),
    note('footer-3', 'The forward accepts at most block_size positions: wpe has one learned row for each.', 40, 778),
  ],
  // Replay in data order: idx and its crop, the counted row, the prediction.
  timeline: [
    [0, ['idx-label', 'idx', 'next-slot', 'read-label', 'read-bracket', 'readout-t', 'readout-read', 'readout-crop', 'rule']],
    [0.6, ['counts', 'matches', 'matches-note']],
    [1.2, ['p', 'p-rule', 'bars', 'top-readout', 'caption-1', 'caption-2', 'only-idx-cond', 'idx-keeps']],
  ].flatMap(([at, targets]) => targets.map(target => ({ at, action: 'appear', target, duration: 0.3 }))),
};

// The default (block_size 3), then 2, 4 and 5.
export const reviewStates = [{ block: 1 }, { block: 0 }, { block: 2 }, { block: 3 }];

// Practice (commit before you see): NanoGPT's own sampling run at block_size
// 256, which the card never draws. Every number is built from these constants.
const START = g.sample.start.value;
if (START !== '\n') throw new Error('sample.py start is no longer a single newline: re-plan the c23 practice');
const MAX_NEW = g.sample.max_new_tokens.value; // 500
const N = 300; // the new character being predicted
const HANDED = START.length + (N - 1); // 300 characters in idx before character N is drawn
const FIRST = HANDED - B_NANO; // idx position 44 = new character 44 (position 0 is the newline)
const range = (a, b) => `${a}–${b}`;
export const activity = {
  id: 'c23-practice',
  check: 'choice_equals',
  version: 1,
  prompt: `NanoGPT’s sampling script starts idx from one new line (⏎), the prompt, and runs ${MAX_NEW} passes, each appending one new character; shakespeare_char’s block_size is ${B_NANO} (not drawn: the card’s text is ${T} characters). When the model predicts new character ${N}, which characters of idx does its forward read?`,
  fixedInputs: { block: DEFAULT },
  // ponytail: SceneActivity shows no pick for an untouched answer, so this
  // naive default never renders; it only satisfies the choice declaration.
  // Bare ranges: the reasoning lives in the feedback. No reveal (c26 precedent);
  // add a gated reveal line only if review asks.
  answer: { type: 'choice', label: 'Characters its forward reads', default: 'all', options: [
    { id: 'all', label: `the new line and new characters ${range(1, N - 1)}` },
    { id: 'first', label: `the new line and new characters ${range(1, B_NANO - START.length)}` },
    { id: 'pinned', label: `the new line and new characters ${range(FIRST + 1, N - 1)}` },
    { id: 'ahead', label: `new characters ${range(N - B_NANO + 1, N)}` },
    { id: 'last', label: `new characters ${range(FIRST, N - 1)}` },
  ] },
  expected: 'last',
  checkLabel: 'Check',
  feedbackPass: `Right. New character ${N} is drawn on pass ${N}, and pass k holds the start + (k − 1): idx holds the start + ${N - 1} = ${HANDED} characters, the new line and new characters ${range(1, N - 1)}, more than block_size = ${B_NANO}. So the forward is handed only the last ${B_NANO}, new characters ${range(FIRST, N - 1)}. The new line and new characters ${range(1, FIRST - 1)} stay in the printed text, but they cannot change this prediction. On the card, at block_size ${KS[DEFAULT]}, the forward reads ${q(W.windows[DEFAULT])}, not ${q(W.cropped[DEFAULT])}.`,
  feedbackFail: `Not quite. New character ${N} is drawn on pass ${N}, and pass k holds the start + (k − 1): idx holds the start + ${N - 1} = ${HANDED} characters, the new line and new characters ${range(1, N - 1)} (character ${N} joins idx only when it is appended). That is more than block_size = ${B_NANO}, so the forward is handed only the last ${B_NANO}: new characters ${range(FIRST, N - 1)}. Reading all ${HANDED} ignores the crop. Reading ${range(1, B_NANO - START.length)} takes the wrong end, because the oldest characters go first. Reading the new line treats the prompt as special, but it is cropped like any other character. ${range(N - B_NANO + 1, N)} counts a character that has not been drawn yet.`,
};

// Phase 1 plan (docs/nanogpt-deep-dive-batch5-plans.md, c23).
export const plan = {
  concept: 'the context window at generation time: before every forward, generate() crops idx to its last block_size characters (idx_cond); the forward reads only idx_cond, while idx keeps every character',
  objective: 'After this card, the learner should understand that before every forward generate() keeps only the last block_size characters of idx, so a character cropped from the front, the prompt included, no longer counts for the next prediction even when it would change the most likely next character, although it stays in the text generate() returns.',
  prerequisites: [
    'c25-autoregressive-conditioning (Generation context · 2 of 3): the next character\'s distribution depends on the text before it; c23 bounds how much of it counts',
    'c24-generation-loop (Generation context · 1 of 3): generate() appends each draw to idx and repeats, which is why idx grows past block_size; pass k is handed start + (k − 1) characters, which the practice counts on',
    'c01-forward-pass (frozen): the generation call site forward(idx=idx_cond) passes no targets and projects only the last position; its line "T = tokens so far, cropped to block_size" is what c23 opens',
    'c09-token-plus-position: wpe has one learned row per position, 0 to block_size − 1 (one footer line)',
    'named, not taught: a conditional frequency, count ÷ matches',
  ],
  causalSteps: [
    'idx and the crop: idx = B e f o r (t = 5) as a label row; the last k characters are highlighted as idx_cond, a neutral "cropped" bracket above the first t − k and an input-role "read" bracket below the last k; readouts name idx_cond and what is cropped but still in idx',
    'the toy table\'s row for exactly idx_cond: a 1 × 6 integer count grid (e, sp, d, t, m, other) over the training split, and matches = the sum of the row',
    'the prediction: p = count ÷ matches as a p (%) row and bars on a fixed 0..100 axis, the most likely next character highlighted, a two-line state caption, and the rule that the prediction can use only idx_cond while idx keeps every character',
  ],
  primaryInteraction: 'one index slider in INTERACT, "What-if: toy block_size (preset)", block_size 2, 3, 4, 5, default 3; it moves the highlight, both bracket ends, the cropped bracket\'s opacity (hidden at 5), the readouts, the count row (that table\'s row for exactly the kept characters), matches, p (%), the bars, the most-likely highlight and the caption. It reveals that cropping one character (the e of "efor") moves the most likely next character from e (87.37%) to a space (50.93%)',
  check: 'practice (commit before you see, choice_equals, fixedInputs block = 1): NanoGPT\'s sampling script starts idx from one new line and runs 500 passes at block_size 256 - when the model predicts new character 300, which characters of idx does its forward read? Options the new line and new characters 1–299 / 1–255 / 45–299, new characters 45–300 / 44–299; expected new characters 44–299. The card draws only a 5-character idx at toy block_size 2 to 5, so the answer needs idx counted at the moment of prediction (c24: pass 300 holds the start + 299), a crop from the front and no exception for the prompt',
  boundary: {
    decision: 'staged',
    reason: 'one causal pipeline in data order: idx → crop to the last block_size (idx_cond) → a prediction that can read only idx_cond (the toy table\'s row for exactly those characters) → p and the most likely next character, revealed in three stages; the one control reaches every stage. Not merged into c24: append-and-repeat is a different mental model; c23 is what the loop\'s first line does once idx is long. Collection candidates, not built: positions restarting at 0 inside idx_cond, the no-cache re-run cost, crop_block_size surgery, README\'s block_size-64 run',
    reviewed: {},
    sequence: { name: 'Generation context', position: 3, of: 3, relationships: [
      { type: 'prerequisite', card: 'c25-autoregressive-conditioning', direction: 'in' },
      { type: 'deepens', card: 'c24-generation-loop', direction: 'in' },
      { type: 'prerequisite', card: 'c01-forward-pass', direction: 'in' },
      { type: 'prerequisite', card: 'c09-token-plus-position', direction: 'in' },
    ] },
  },
};

const REPRODUCE_GEN = 'python packages/web/src/nanogpt/depth/fixtures/gen_generation.py --check';
const rows = W.windows.map((w, b) => `after "${w}" (block_size ${KS[b]}): ${W.counts[b].join(', ')} of ${W.matches[b]}`).join('; ');

export const sources = [
  code('model.py', 312, 314, 'The crop, before every forward: "for _ in range(max_new_tokens):", "# if the sequence context is growing too long we must crop it at block_size", "idx_cond = idx if idx.size(1) <= self.config.block_size else idx[:, -self.config.block_size:]" - the last block_size characters, oldest first to go.'),
  code('model.py', 315, 316, 'The forward reads only idx_cond: "logits, _ = self(idx_cond)".'),
  code('model.py', 173, 174, 'It cannot take more: "assert t <= self.config.block_size" - t here is the length of idx_cond, never of idx - and positions are "pos = torch.arange(0, t, dtype=torch.long, device=device)" - they restart at 0 inside idx_cond (a collection candidate, not on the card).'),
  code('model.py', 128, 128, 'One learned position row per slot: "wpe = nn.Embedding(config.block_size, config.n_embd)," (c09).'),
  code('model.py', 325, 330, 'The next character is drawn, not known: "idx_next = torch.multinomial(probs, num_samples=1)"; the append goes onto idx, not idx_cond: "# append sampled index to the running sequence and continue", "idx = torch.cat((idx, idx_next), dim=1)", then "return idx" - every character, cropped or not.'),
  code('model.py', 306, 309, 'The loop\'s signature: "def generate(self, idx, max_new_tokens, temperature=1.0, top_k=None):" - "Take a conditioning sequence of indices idx (LongTensor of shape (b,t)) and complete".'),
  code('model.py', 317, 318, 'Context: after the forward, "logits = logits[:, -1, :] / temperature" - only the last position predicts.'),
  code('model.py', 189, 190, 'Context (c01): "# inference-time mini-optimization: only forward the lm_head on the very last position", "logits = self.lm_head(x[:, [-1], :])".'),
  code('config/train_shakespeare_char.py', 19, 19, `NanoGPT's block_size: "block_size = ${B_NANO} # context of up to ${B_NANO} previous characters".`),
  code('train.py', 147, 148, 'block_size goes into the model\'s args: "model_args = dict(n_layer=n_layer, n_head=n_head, n_embd=n_embd, block_size=block_size,".'),
  code('train.py', 277, 280, 'and into the saved checkpoint: "checkpoint = {" … "\'model_args\': model_args,".'),
  code('sample.py', 37, 40, 'sample.py rebuilds the model from those args, so block_size is fixed by the trained model: "checkpoint = torch.load(ckpt_path, map_location=device)", "gptconf = GPTConfig(**checkpoint[\'model_args\'])", "model = GPT(gptconf)".'),
  code('sample.py', 14, 16, `The practice's run: the start is one newline (start = "\\n"), and "max_new_tokens = ${MAX_NEW} # number of tokens generated in each sample".`),
  code('sample.py', 80, 81, 'The start becomes idx: "start_ids = encode(start)", "x = (torch.tensor(start_ids, dtype=torch.long, device=device)[None, ...])".'),
  code('sample.py', 87, 88, 'Everything generate() returns is printed, cropped characters included: "y = model.generate(x, max_new_tokens, temperature=temperature, top_k=top_k)", "print(decode(y[0].tolist()))".'),
  code('README.md', 51, 51, `"we're training a GPT with a context size of up to ${B_NANO} characters".`),
  code('README.md', 85, 88, 'A smaller CPU model: "python train.py config/train_shakespeare_char.py" with command-line overrides such as "--block_size=64" - "our context size is only 64 characters instead of 256". Another trained model, not a setting of the same one (sources note only).'),
  code('model.py', 195, 201, 'Collection candidate, not on the card: "def crop_block_size(self, block_size):" … "self.transformer.wpe.weight = nn.Parameter(self.transformer.wpe.weight[:block_size])".'),
  code('train.py', 190, 192, 'Collection candidate: "if block_size < model.config.block_size:", "model.crop_block_size(block_size)", "model_args[\'block_size\'] = block_size # so that the checkpoint will have the right value".'),
  code('data/shakespeare_char/prepare.py', 38, 40, 'The training split the toy counts: "n = len(data)", "train_data = data[:int(n*0.9)]", "val_data = data[int(n*0.9):]".'),
  { ...calculation('Calculated toy example', `Next-character counts after the last k characters of "${W.text}"`,
    `gen_generation.py window(): over the training split (prepare.py's first 90%, ${g.trainChars} characters), for each toy block_size k = ${KS.join(', ')}, count train[i + k] wherever train[i:i + k] is the last k characters of "${W.text}" - a separate table per k, not NanoGPT and not the recorded bigram. Columns ${W.slots.join(', ')} (sp = space; other = every remaining character together). ${rows}. The generator asserts each row sums to its matches, each window's top 3 is shown, and the block_size-3 row equals the depth ladder's toy table.`),
  reproduce: REPRODUCE_GEN },
  calculation('Live calculation', 'matches, p and the most likely next character',
    'Computed on the card as block_size moves: pick (the kept characters, bracket ends, the count row, 100 ÷ matches, strings), sum (matches), scale (p = count × 100 ÷ matches; −p) and argmin (the most likely next character). Each p cell is rounded to 2 decimals on its own, so the block_size-3 row prints a total of 100.01; caption percentages are the same cells.'),
  { ...calculation('What-if', `Toy block_size ${KS[0]} to ${KS.at(-1)}`,
    `One separate counting table per preset (gen_generation.py WINDOW_BLOCKS). NanoGPT's block_size is not a sampling setting: it is fixed by the trained model (${B_NANO} for shakespeare_char). The presets only show what a crop at each length removes from this text.`),
  reproduce: REPRODUCE_GEN },
  calculation('Source value', `The text and block_size ${B_NANO}`,
    `"${W.text}": the first ${T} characters of the tokenizer card's sentence (fx.tokenizer), the opening of the dataset's line 2. block_size ${B_NANO} from the resolved shakespeare_char config (fx.architecture).`),
  { ...calculation('Source value', 'The practice’s start and max_new_tokens',
    `The start (one newline) and max_new_tokens ${MAX_NEW} are parsed from sample.py by gen_generation.py (g.sample).`),
  reproduce: REPRODUCE_GEN },
  tinyShakespeare(`"${W.text}" opens line 2 of the file ("Before we proceed any further"); the counts cover its training split.`),
];

export const evidence = {
  card: 'c23-context-window',
  title: scene.title,
  learningQuestion: scene.objects[0].initialState.text,
  concept: 'Before every forward, generate() crops idx to its last block_size characters (model.py:312-314) and the forward reads only idx_cond (:316); it cannot take more (assert t <= block_size, :173; wpe has block_size rows, :128). The append goes onto idx (:328), which generate() returns whole (:330) and sample.py prints (:88): a cropped character, prompt included, stays in the text but no longer counts for the next prediction. block_size is fixed by the trained model: 256 for shakespeare_char (config:19), stored in the checkpoint (train.py:147-148, :277-280) and rebuilt by sample.py (:37-40).',
  sourceRevision: `${fx.provenance.nanogpt.repo}@${fx.provenance.nanogpt.commit}`,
  provenance: `source: model.py:128, :173-174, :189-190, :195-201, :306-309, :312-318, :325-330; train.py:147-148, :190-192, :277-280; sample.py:14-16, :37-40, :80-81, :87-88; config/train_shakespeare_char.py:19; data/shakespeare_char/prepare.py:38-40; README.md:51, :85-88 - checked against the pinned files. Calculated toy example: g.window (gen_generation.py window()), counts over the ${g.trainChars}-character training split. Live calculation: pick, sum, scale, argmin. What-if: toy block_size ${KS.join(', ')}. Source value: the text (fx.tokenizer), block_size ${B_NANO} (fx.architecture), start and max_new_tokens (g.sample).`,
  control: `"What-if: toy block_size (preset)" index slider, block_size ${KS.join(', ')}, default ${KS[DEFAULT]}; the only control.`,
  consequence: `Moving block_size moves the idx_cond highlight and both brackets (the cropped bracket hides at ${T}), the readouts, the count row (${W.windows.map((w, b) => `"${w}": ${W.matches[b]} matches`).join(', ')}), p (%) and the bars; the most likely next character is sp at 2 and 3 (${pct[0][1]}%, ${pct[1][1]}%) and e at 4 and 5 (${pct[2][E]}%, ${pct[3][E]}%). Cropping the one e of "efor" moves it from e to a space.`,
  interactionPurpose: 'See that the prediction can use only idx_cond: a character cropped from the front no longer counts, even when it carried the most likely next character, while idx keeps it.',
  task: 'Slide block_size from 4 to 3 and watch the most likely next character switch from e to a space when the e of "efor" is cropped; then, in practice, work out which characters NanoGPT\'s forward reads when it predicts new character 300 at block_size 256.',
  capability: 'index slider; a tokens row with tokenStyle labels and a derived cellHighlight list of kind highlight; two lines with derived x on opposite sides of the row; derived opacity on the cropped bracket and its label (no appear); a 1 × 6 integer grid and a 1 × 6 decimal grid, row and column labels, no distribution claim; bars on a fixed peak of 100 with a derived cellHighlight; derive ops pick, sum, scale, argmin; {{}} interpolation of picked fixture strings; choice practice graded by choice_equals with fixedInputs and no reveal.',
};
