// c25 - autoregressive conditioning. Sequence "Generation context", 2 of 3
// (c24 hands each pass all of idx and appends one draw; this card says what
// the next prediction depends on; c23 shows where NanoGPT cuts it). Staged, one
// pipeline top to bottom: ① the text so far, ② what each model reads of it,
// ③ that condition's row, a whole next-character distribution, ④ an appended
// draw becomes the next condition.
//
// Numbers: p is the recorded toy bigram run (the run c18 plots and c26 reads -
// a 65 × 65 logit table, not NanoGPT) at iteration 100, the checkpoint the save
// rule keeps at this toy run's evaluations every 50 iterations (shakespeare_char
// evaluates every 250) and sample.py loads. The texts are real training-slice
// text. The rest of the row ("the other 57 together") is a live sub; nothing
// else is computed.
//
// One control, the previous character (4 stored presets). It changes both
// texts and their bold last character, the row's 8 cells and bars, the rest
// cell and the append line; the columns, axis and NanoGPT lines never change.
// Both texts end on one column, boxed: the character the toy reads.
// Explore-only (inventory row 25): an undrawn conditioning case is c23's practice.
import fx from '../fixtures/nanogpt-fixtures.generated.js';
import tl from '../depth/fixtures/training-loss.generated.js';
import { CHIP_CHAR, CHIP_GAP, CHIP_PAD } from '../../animation-scene.js';
import { code, calculation, tinyShakespeare } from '../sources.js';

const A = fx.architecture;
const V = A.vocab_size;          // 65
const BLOCK = A.block_size;      // 256
const COND = tl.recorded.conditioning;
const IT = COND.iteration;       // 100
const show = ch => (ch === ' ' ? '•' : ch);
const COLS = COND.columns.map(show);
const REST_COUNT = V - COLS.length; // 57
const [E, SP] = COND.presets;
const quoted = ch => `‘${show(ch)}’`; // the space too: ‘•’, never a bare • that reads as a bullet
// '…' first (earlier text), one token per character, a space shown as •.
const tokensOf = t => ['…', ...[...t].map(show)];
// A text as words; a trailing space is written as the card's ‘•’, outside the
// quotes, so it never reads as a stray space before the closing quote.
const phraseOf = t => (t.endsWith(' ') ? `“…${t.slice(0, -1)}” + ${quoted(' ')}` : `“…${t}”`);
const pct = p => Number((p * 100).toFixed(4)); // 6-decimal p → exact 4-decimal percent

// Layout (scene units = CSS px at scale 1).
const X = 180;
const CELL = 60;
const ROW_A_Y = 120, ROW_B_Y = 166;
const GRID_Y = 322;
const REST_X = 700;
// The 100% line sits 26 below the grid (≥ 24), grouped with the bars, not the cells.
const BARS = { y: 404, h: 128, peak: 100 };
const CONCEPT = 'autoregressive-conditioning';
// Both texts end on one column: each row starts where its last token's centre
// lands on READ_X (chip metrics as the renderer draws them), right of the rest
// cell, far enough right that the longest row ('…Before we •', 11 tokens)
// starts a token pitch or more past its label. The box around that column is
// what the toy reads.
const READ_X = 790;
const chipW = token => CHIP_PAD * 2 + token.length * CHIP_CHAR;
const startX = toks => READ_X - toks.slice(0, -1).reduce((sum, t) => sum + chipW(t) + CHIP_GAP, 0) - chipW(toks.at(-1)) / 2;
const READ_BOX = { x: READ_X - 30, y: ROW_A_Y - 6, w: 60, h: ROW_B_Y - ROW_A_Y + 44 };

const text = (id, value, x, y, extra = {}) => ({ id, type: 'text', semanticId: id, conceptId: CONCEPT,
  initialState: { text: value, x, y, ...extra } });
const note = (id, value, x, y, extra = {}) => text(id, value, x, y, { typography: 'annotation', ...extra });
const hidden = { opacity: 0 };
const tokens = (id, of, at, x, y) => ({ id, type: 'tokens', semanticId: id, conceptId: CONCEPT,
  initialState: { x: { $derive: x }, y, role: 'input', tokenStyle: 'labels', tokens: { $derive: of },
    cellHighlight: { $derive: at }, cellHighlightKind: 'highlight', opacity: 0 } });

const APPEND = {
  e: `Append ${quoted(' ')}, as Shakespeare does next, and the toy switches to row ${quoted(' ')}: pick the ${quoted(' ')} preset.`,
  ' ': `The ${quoted(E.prev)} texts plus Shakespeare’s next character, ${quoted(' ')} (not a draw): the toy switched to row ${quoted(' ')}.`,
  other: 'Append any character and the next row is that character’s row; the toy reads nothing before it.',
};

export const scene = {
  id: 'nanogpt-c25-autoregressive-conditioning',
  title: 'Autoregressive conditioning',
  width: 960,
  height: 707,                         // the padded content, 706.32: a 960-wide frame draws it at scale 1
  duration: 2.2,
  inputs: [
    { name: 'prev', type: 'index', label: 'Previous character (preset)', of: 'prevLabels', default: 0, presentation: 'picker' },
  ],
  exampleData: {
    prevLabels: ['‘e’', '‘•’ (space)', '‘h’', '‘,’ (comma)'],
    prevNames: COND.presets.map(p => quoted(p.prev)),
    // Each text as words, left of its tokens: the tokens spell it, this reads it.
    phraseAByPrev: COND.presets.map(p => phraseOf(p.texts[0].text)),
    phraseBByPrev: COND.presets.map(p => phraseOf(p.texts[1].text)),
    textAByPrev: COND.presets.map(p => tokensOf(p.texts[0].text)),
    textBByPrev: COND.presets.map(p => tokensOf(p.texts[1].text)),
    lastAByPrev: COND.presets.map(p => p.texts[0].text.length), // '…' shifts every index by one
    lastBByPrev: COND.presets.map(p => p.texts[1].text.length),
    xAByPrev: COND.presets.map(p => startX(tokensOf(p.texts[0].text))),
    xBByPrev: COND.presets.map(p => startX(tokensOf(p.texts[1].text))),
    rowByPrev: COND.presets.map(p => p.p.map(pct)),
    appendByPrev: COND.presets.map(p => APPEND[p.prev] ?? APPEND.other),
    hundred: [100],
  },
  derived: {
    prevName: { op: 'pick', args: ['prevNames', 'prev'] },
    phraseA: { op: 'pick', args: ['phraseAByPrev', 'prev'] },
    phraseB: { op: 'pick', args: ['phraseBByPrev', 'prev'] },
    textA: { op: 'pick', args: ['textAByPrev', 'prev'] },
    textB: { op: 'pick', args: ['textBByPrev', 'prev'] },
    lastA: { op: 'pick', args: ['lastAByPrev', 'prev'] },
    lastB: { op: 'pick', args: ['lastBByPrev', 'prev'] },
    xA: { op: 'pick', args: ['xAByPrev', 'prev'] },
    xB: { op: 'pick', args: ['xBByPrev', 'prev'] },
    row:{ op: 'pick', args: ['rowByPrev', 'prev'] },
    // The rest of the row: 100 − the 8 shown, only ever drawn in its cell.
    shownSum: { op: 'sum', args: ['row'] },
    shownSumV: { op: 'concat', args: ['shownSum'] },
    restV: { op: 'sub', args: ['hundred', 'shownSumV'] },
    append: { op: 'pick', args: ['appendByPrev', 'prev'] },
  },
  objects: [
    text('question', 'What does the next-character prediction read of the text so far?', 40, 30, { typography: 'heading' }),
    // Names the checkpoint as c24 does: c26 prints the same table at its last one, iteration 1000.
    note('status-1', `Recorded toy run (a bigram reading only the previous character, not NanoGPT; iteration ${IT}, the kept checkpoint)`, 40, 56),
    note('status-2', `Live calculation: the other ${REST_COUNT} together · Source value: the texts, ${V} characters, NanoGPT’s ${BLOCK}-character window`, 40, 74),
    note('builds-on', 'Builds on: generation appends each draw to the text; attention lets the last position read earlier ones', 40, 92),

    // ① the text so far: two real texts ending in the same character, stacked
    // on that character; bold and boxed, it is what the toy reads (highlight,
    // not a selection). The box is drawn first so the characters sit on it.
    { id: 'read-box', type: 'box', semanticId: 'read-character', conceptId: CONCEPT,
      initialState: { ...READ_BOX, role: 'input', opacity: 0 } },
    text('text-a-label', '{{phraseA}}', 40, ROW_A_Y + 21, hidden),
    tokens('text-a', 'textA', 'lastA', 'xA', ROW_A_Y),
    text('text-b-label', '{{phraseB}}', 40, ROW_B_Y + 21, hidden),
    tokens('text-b', 'textB', 'lastB', 'xB', ROW_B_Y),

    // ② what each model reads.
    text('reads-toy', 'The toy reads only the bold, boxed last character, {{prevName}} in both: both get one row.', 40, 226, hidden),
    text('reads-nano', `NanoGPT reads all of each text, up to ${BLOCK} characters back, so its two predictions can differ.`, 40, 248, hidden),

    // ③ that character's row: the whole next-character distribution.
    text('row-caption', `Softmax of row {{prevName}} of the toy’s ${V} × ${V} logit table: p(next | previous {{prevName}})`, 40, 278, hidden),
    { id: 'row', type: 'grid', semanticId: 'conditional-row', conceptId: CONCEPT,
      initialState: { x: X, y: GRID_Y, rows: 1, cols: COLS.length, cell: CELL, matrixKind: 'input', role: 'prediction',
        rowLabels: ['p (%)'], columnLabels: COLS, values: { $derive: 'row' }, opacity: 0 } },
    { id: 'rest', type: 'grid', semanticId: 'rest-of-row', conceptId: CONCEPT,
      initialState: { x: REST_X, y: GRID_Y, rows: 1, cols: 1, cell: CELL, matrixKind: 'derived', role: 'prediction',
        columnLabels: ['together'], values: { $derive: 'restV' }, opacity: 0 } },
    // Its label's first line, over 'together': the column labels' mono face and size, centred on
    // the cell (43 = half of 'the other 57' at about 7.15 px a character).
    text('rest-label', `the other ${REST_COUNT}`, REST_X + CELL / 2 - 43, GRID_Y - 40, { typography: 'code', ...hidden }),
    { id: 'bars', type: 'bars', semanticId: 'conditional-bars', conceptId: CONCEPT,
      initialState: { x: X, y: BARS.y, h: BARS.h, cell: CELL, peak: BARS.peak, role: 'prediction', values: { $derive: 'row' }, opacity: 0 } },
    { id: 'bars-top', type: 'line', semanticId: 'bars-top', conceptId: CONCEPT,
      initialState: { from: { x: X, y: BARS.y + 4 }, to: { x: X + COLS.length * CELL, y: BARS.y + 4 }, role: 'neutral', opacity: 0 } },
    // Named as the bars' scale, left of the line, so it never reads as a total of the cells.
    note('bars-top-tag', 'bar height 100%', 56, BARS.y + 8, hidden),
    note('bars-zero-tag', 'bar height 0%', 56, BARS.y + BARS.h + 4, hidden),
    note('legend', `the same ${COLS.length} of the ${V} next characters for every row, each cell rounded on its own; • = space; … = earlier text`, 40, 560),

    // ④ the loop closes: the appended draw is the next condition (c24 owns the loop).
    text('loop', 'When it writes, each draw is appended and becomes the next previous character.', 40, 592, hidden),
    text('append', '{{append}}', 40, 616, hidden),
    note('nano-1', 'NanoGPT: generate() takes the logits at the last position of the text it is handed.', 40, 646, hidden),
    note('nano-2', 'Through attention that position can read every earlier character and its position; the toy reads one.', 40, 666, hidden),
  ],
  // Replay in causal order: the texts, what is read, the row, the loop.
  timeline: [
    ...[[0, ['read-box', 'text-a-label', 'text-a', 'text-b-label', 'text-b']], [0.6, ['reads-toy', 'reads-nano']],
      [1.0, ['row-caption', 'row', 'rest', 'rest-label']], [1.4, ['bars', 'bars-top', 'bars-top-tag', 'bars-zero-tag']], [1.8, ['loop', 'append', 'nano-1', 'nano-2']]]
      .flatMap(([at, targets]) => targets.map(target => ({ at, action: 'appear', target, duration: 0.3 }))),
  ],
};

// Every preset: ‘e’, its texts plus the space that follows, ‘h’, the comma.
export const reviewStates = [{ prev: 0 }, { prev: 1 }, { prev: 2 }, { prev: 3 }];

// Phase 1 plan (docs/nanogpt-deep-dive-batch5-plans.md, c25; verbatim where it fits).
export const plan = {
  concept: 'autoregressive conditioning: every next-character prediction is p(next | what the model reads of the text so far), its own earlier draws included; the recorded bigram reads only the previous character, NanoGPT the whole cropped window idx_cond',
  objective: 'After this card, the learner should understand that each next-character prediction is a whole distribution conditioned on what the model reads of the text so far, its own earlier draws included, which for the recorded bigram is only the previous character and for NanoGPT is the whole cropped window idx_cond.',
  prerequisites: [
    'c24-generation-loop (Generation context · 1 of 3): each generate() pass draws one character and appends it to idx, then repeats; c25 says what the appended character does to the next prediction',
    'c05-position-mixing: inside a Block, only attention lets output i read inputs 0..i - how NanoGPT\'s last position can read the whole window. Named, not redrawn',
    'c01-forward-pass (generation mode): without targets, lm_head projects only the last position',
    'named, not taught: a distribution over the 65 characters sums to 1 (c16, c21)',
  ],
  causalSteps: [
    'the text so far (0 s): two real Tiny Shakespeare texts that end in the selected previous character, each a tokens row of labels, … first, a space shown as sp, both ending on one column, the last token bold (highlight) and boxed as what the toy reads, each row named by its text as words (a trailing space as + sp after the quotes) a token pitch or more left of its first token',
    'what each model reads (0.6 s): the toy reads only the last character (bold, boxed), so both texts get one row; NanoGPT reads all of each text, up to 256 characters back, so its two predictions can differ',
    'the row (1.0-1.4 s): the softmax of row {{prevName}} of the toy\'s 65 × 65 logit table as a 1 × 8 p (%) grid over 8 fixed next-character columns, bars on the same pitch with a fixed peak of 100, a line at the 100% top labelled bar height 100% and the baseline labelled bar height 0%, and a live cell for the other 57 together; nothing lit',
    'the loop closes (1.8 s): each draw is appended and becomes the next previous character (preset append line), and generate() takes the logits at the last position of the text it is handed, which through attention can read every earlier character and its position',
  ],
  primaryInteraction: 'one index picker in INTERACT, "Previous character (preset)": ‘e’, sp (space), ‘h’, ‘,’ (comma), default ‘e’; stored presets, nothing runs. It changes both texts and their bold last character, the row name, the 8 p (%) cells and bars, the other-57 cell and the append line; never the columns, axis, top line or NanoGPT lines. It reveals that the condition alone moves the whole distribution (peaked after the comma, spread after sp), that two texts with one last character share one toy row, and that one appended character switches the row (‘e’ → sp)',
  check: 'none: explore-only, as inventory row 25 lists it. A practice on two other texts ending in ‘e’ would be the drawn case in other words, answered by the stage-2 captions; the undrawn conditioning case (a longer context, text past the cut) is c23\'s practice',
  boundary: {
    decision: 'staged',
    reason: 'one mental model: a prediction is a function of what the model reads, its condition. The pipeline text so far → what is read (for the toy, the last character) → that character\'s row → the next-character distribution → an appended draw becomes the next condition, revealed in four stages, and the one control reaches every stage. The NanoGPT lines are not a second mechanism: they state the same condition for NanoGPT (idx_cond) as the exactness guard, with no control, visual or practice of their own. Kept apart from c24 (the loop replay), c23 (where the window is cut) and c26 (one entry per row read as a loss)',
    reviewed: {},
    sequence: { name: 'Generation context', position: 2, of: 3, relationships: [
      { type: 'prerequisite', card: 'c24-generation-loop', direction: 'in' },
      { type: 'prerequisite', card: 'c23-context-window', direction: 'out' },
      { type: 'prerequisite', card: 'c05-position-mixing', direction: 'in' },
      { type: 'deepens', card: 'c01-forward-pass', direction: 'in' },
    ] },
  },
};

const REPRODUCE_TL = 'python packages/web/src/nanogpt/depth/fixtures/gen_training_loss.py --check';
const run = fx.toyRun;
const kept = run.checkpoints[run.bestValIndex];
const cs = fx.config.shakespeareChar; // the resolved config, read from the pinned source
// The save rule keeps iteration 100 only at this toy run's evaluation cadence (c18).
const AT_TOY_EVALS = `at this toy run's evaluations every ${run.config.eval_interval} iterations`;
const rowNote = p => `${quoted(p.prev)} (${p.pairs} pairs): ${p.p.join(', ')}, rest ${p.rest}`;
const textsNote = p => p.texts.map(t => `“${t.text}” at ${t.at}`).join(' and ');

export const sources = [
  code('model.py', 305, 311, 'generate() conditions on its own text: "def generate(self, idx, max_new_tokens, temperature=1.0, top_k=None):" - "Take a conditioning sequence of indices idx (LongTensor of shape (b,t)) and complete" "the sequence max_new_tokens times, feeding the predictions back into the model each time."'),
  code('model.py', 312, 316, `What NanoGPT reads each pass: "idx_cond = idx if idx.size(1) <= self.config.block_size else idx[:, -self.config.block_size:]", then "logits, _ = self(idx_cond)" - all of idx, at most its last ${BLOCK} characters (the crop is c23's).`),
  code('model.py', 317, 318, 'The prediction is the last position\'s: "logits = logits[:, -1, :] / temperature".'),
  code('model.py', 324, 328, 'A distribution, one draw, appended - the draw becomes part of the next condition: "probs = F.softmax(logits, dim=-1)", "idx_next = torch.multinomial(probs, num_samples=1)", "idx = torch.cat((idx, idx_next), dim=1)". Temperature, top-k and the draw are c21\'s and c22\'s.'),
  code('model.py', 188, 191, 'Without targets the forward projects only the last position: "logits = self.lm_head(x[:, [-1], :]) # note: using list [-1] to preserve the time dim" (c01).'),
  code('model.py', 172, 174, 'Every position of idx_cond gets its index: "b, t = idx.size()", "pos = torch.arange(0, t, dtype=torch.long, device=device) # shape (t)".'),
  code('model.py', 177, 182, 'That last position starts from its character and its position, then passes every Block: "tok_emb = self.transformer.wte(idx) # token embeddings of shape (b, t, n_embd)", "pos_emb = self.transformer.wpe(pos) # position embeddings of shape (t, n_embd)", "x = self.transformer.drop(tok_emb + pos_emb)", "for block in self.transformer.h:", "x = block(x)".'),
  code('model.py', 103, 105, 'In each Block attention is where positions mix: "x = x + self.attn(self.ln_1(x))", "x = x + self.mlp(self.ln_2(x))" (c05).'),
  code('model.py', 61, 64, 'Attention is causal - each position reads itself and every earlier one, so the last reads them all: "is_causal=True".'),
  code('model.py', 67, 69, 'The same rule without Flash: "att = att.masked_fill(self.bias[:,:,:T,:T] == 0, float(\'-inf\'))", then "att = F.softmax(att, dim=-1)" (the mask is the lower triangle built at lines 48-50).'),
  code('model.py', 127, 128, `Position embeddings exist for ${BLOCK} positions: "wte = nn.Embedding(config.vocab_size, config.n_embd),", "wpe = nn.Embedding(config.block_size, config.n_embd),".`),
  code('config/train_shakespeare_char.py', 19, 19, `NanoGPT's window: "block_size = ${BLOCK} # context of up to ${BLOCK} previous characters".`),
  code('config/train_shakespeare_char.py', 9, 10, `Why iteration ${IT}, applied ${AT_TOY_EVALS}: "# we expect to overfit on this small dataset, so only save when val improves", "always_save_checkpoint = False".`),
  code('config/train_shakespeare_char.py', 5, 5, `"eval_interval = ${cs.eval_interval} # keep frequent because we'll overfit" - NanoGPT evaluates every ${cs.eval_interval} iterations; this toy run evaluates every ${run.config.eval_interval} (c18).`),
  code('train.py', 274, 276, `The save rule: "if losses['val'] < best_val_loss or always_save_checkpoint:", "best_val_loss = losses['val']", "if iter_num > 0:" - applied ${AT_TOY_EVALS}, it keeps iteration ${kept.iteration} (val ${kept.val}, its lowest after iteration 0; c18).`),
  code('sample.py', 37, 38, 'Generation loads that kept checkpoint: "ckpt_path = os.path.join(out_dir, \'ckpt.pt\')", "checkpoint = torch.load(ckpt_path, map_location=device)".'),
  code('sample.py', 87, 87, 'and calls generate(): "y = model.generate(x, max_new_tokens, temperature=temperature, top_k=top_k)".'),
  code('data/shakespeare_char/prepare.py', 24, 25, `The ${V} characters a row covers: "chars = sorted(list(set(data)))", "vocab_size = len(chars)".`),
  code('train.py', 138, 143, `train.py reads that ${V} from the dataset's meta.pkl, not the config: "meta_path = os.path.join(data_dir, 'meta.pkl')", "meta_vocab_size = meta['vocab_size']".`),
  code('data/shakespeare_char/prepare.py', 38, 40, 'The texts are training text: "n = len(data)", "train_data = data[:int(n*0.9)]", "val_data = data[int(n*0.9):]".'),
  { ...calculation('Recorded toy run', `p(next | previous character) at iteration ${IT}`,
    `The seeded toy run c18 plots (generate_fixtures.py toy_run, seed ${run.seed}): ${run.model}, trained on the first ${run.config.train_chars} characters of the training split. gen_training_loss.py calls it unchanged, copies its weight table at iteration ${IT} (the checkpoint train.py's save rule keeps ${AT_TOY_EVALS}: the lowest validation loss after iteration 0, ${kept.val}; shakespeare_char's own eval_interval is ${cs.eval_interval}) and records, for each previous character, p(next | previous) = softmax of that character's row, 6 decimals, over the columns ${COND.columns.map(show).join(', ')} (the union of each preset's top 3 among the characters that followed it in the slice): ${COND.presets.map(rowNote).join('; ')}. The generator asserts every row sums to 1, its most likely character is among the columns, each preset has at least 14 pairs in the slice and every shown p is at least 0.00005. The card prints p × 100 to 2 decimals. c26 reads the same table at iteration 1000, its last checkpoint.`),
  reproduce: REPRODUCE_TL },
  calculation('Live calculation', `The other ${REST_COUNT} together`,
    `Computed on the card for the selected preset: pick (the texts, their start x, the bold last index, the row and the append line), sum and concat (the 8 shown cells), sub (100 − that sum = the ${REST_COUNT} characters outside the columns, together). Each cell is rounded on its own, so the printed cells and the rest can miss 100 by a few hundredths.`),
  calculation('Source value', `The texts, ${V} and ${BLOCK}`,
    `The texts are Tiny Shakespeare training text, positions in the toy run's ${run.config.train_chars}-character slice: ${COND.presets.map(p => `${quoted(p.prev)}: ${textsNote(p)}`).join('; ')} - the ${quoted(' ')} texts are the ${quoted(E.prev)} texts plus the space that follows them there. vocab_size ${V} is the dataset's sorted character set (prepare.py:24-25, which reaches train.py through meta.pkl, train.py:138-143); block_size ${BLOCK} comes from config/train_shakespeare_char.py:19; ${REST_COUNT} = ${V} − ${COLS.length} columns.`),
  tinyShakespeare(`Every text on the card is taken from the toy run's training slice of this file, “First Citizen:⏎Before we proceed…”; the generator asserts each lies there and ends in its previous character (${SP.texts.map(t => `“${t.text}”`).join(', ')} included).`),
];

export const evidence = {
  card: 'c25-autoregressive-conditioning',
  title: scene.title,
  learningQuestion: scene.objects[0].initialState.text,
  concept: `generate() takes "a conditioning sequence of indices idx" and feeds each draw back in (model.py:308-309, :328). Each pass forwards idx_cond, at most the last block_size = ${BLOCK} characters of idx (:314-316), and keeps the logits at its last position (:318, :190); that position starts from tok_emb + pos_emb (:179) and reads every earlier position through causal attention (:64, Block :104), so NanoGPT's prediction depends on the whole window. The recorded toy bigram reads only the previous character: its prediction is the softmax of that character's row of a ${V} × ${V} logit table, so texts ending in the same character get the same distribution, and an appended character's row is the next one.`,
  sourceRevision: `${fx.provenance.nanogpt.repo}@${fx.provenance.nanogpt.commit}`,
  provenance: `source: model.py:305-311, :312-316, :317-318, :324-328, :188-191, :172-174, :177-182, :103-105, :61-64, :67-69, :127-128; config/train_shakespeare_char.py:5, :9-10, :19; train.py:138-143, :274-276; sample.py:37-38, :87; data/shakespeare_char/prepare.py:24-25, :38-40 - checked against the pinned files. Recorded toy run: p(next | prev) at iteration ${IT} for 4 previous characters (gen_training_loss.py recorded.conditioning). Live calculation: pick, sum, concat, sub. Source value: the texts (training slice), ${V}, ${BLOCK}.`,
  control: '"Previous character (preset)" index picker over ‘e’, sp (space), ‘h’, ‘,’ (comma), default ‘e’; the only control.',
  consequence: `Picking a preset swaps both texts and their bold, boxed last character, the row name in the captions, the 8 p (%) cells and bars (‘e’: sp 19.90 … w 0.19; sp: t 12.15 highest, spread; ‘h’: e 39.04; ‘,’: sp 72.24, peaked), the other-${REST_COUNT} cell (45.65, 58.83, 27.41, 24.72) and the append line; the columns, the 100% axis, the loop line and the NanoGPT lines hold in every state.`,
  interactionPurpose: 'See that the whole next-character distribution follows the condition: two texts with the same last character share one toy row, and one appended character (‘e’ → sp) switches the row, while NanoGPT reads all of each text.',
  task: 'Pick each previous character and compare how peaked or spread its row is; then go from ‘e’ to sp and see the same two texts, one space longer, get a different row.',
  capability: 'index picker; two tokens rows with tokenStyle labels, each named by a picked plain-text label, derived variable-length tokens, a derived x that ends both on one column and a derived cellHighlight of kind highlight; a fixed box around that column; a 1 × 8 input grid with fixed columnLabels and picked values; a 1 × 1 derived grid for the live rest; bars with a fixed peak of 100 and a line at the top; derive ops pick, sum, concat, sub; {{}} interpolation of strings only.',
};
