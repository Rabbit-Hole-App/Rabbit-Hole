// c26 - the training objective. Sequence "Training fundamentals", 1 of 2 (this
// card names the number one step lowers; c19-gradient-step shows how one step
// lowers a loss). Staged, one pipeline top to bottom: ① the targets are the
// text shifted by one, ② each position's p(target) and −ln p, ③ their plain
// mean over the T scored positions, ④ that mean read again as perplexity.
//
// Numbers: p is the recorded toy bigram run at its last checkpoint (the run
// c18 plots - a bigram table, not NanoGPT); the 4.17 anchor is c16's; −ln p and
// e^mean are precomputed by the fixture generator (the evaluator has no log or
// exp). Sum, mean, 1/T, e→f's share and B · T are live derive ops.
//
// One control, a What-if window length T = 1..8 (NanoGPT's is 256): it moves
// the brackets, blanks the grid and bars past T, and changes the sum, the
// mean, 1/T, the share and perplexity - never a drawn loss. The practice asks
// about a 256-position window, which the card never draws.
import fx from '../fixtures/nanogpt-fixtures.generated.js';
import tl from '../depth/fixtures/training-loss.generated.js';
import { code, calculation, tinyShakespeare } from '../sources.js';

const A = fx.architecture;
const OBJ = tl.recorded.objective;
const STREAM = fx.tokenizer.tokenizers.find(t => t.id === 'char').tokens.slice(0, OBJ.text.length);
const show = ch => (ch === '␣' ? '•' : ch);
const PAIRS = OBJ.pairs.map(pair => pair.split('→').map(show).join('→'));
const N = PAIRS.length; // 8 scored positions at most
const Ts = PAIRS.map((unused, i) => i + 1);
const byT = (values, past) => Ts.map(T => values.map((v, i) => (i < T ? v : past)));
const F = 1; // e→f, the least expected position
const pct = p => p * 100;
const LOSS_BY_T = byT(OBJ.loss, null); // null past T: a blank cell and no bar (0 would draw 1 px)
const lnP = v => v.toFixed(3);

// Layout (scene units = CSS px at scale 1).
const COL_X = 170;
const CELL = 60;
const STREAM_Y = 128;
const X_LINE_Y = 144;
const Y_LINE_Y = 160;
const GRID_Y = 256;
const BARS = { y: 392, h: 150, peak: 4.5 };
const BAR_BASE = BARS.y + BARS.h;
const PX_PER_NAT = (BARS.h - 4) / BARS.peak; // the renderer draws value / peak × (h − 4)
const ANCHOR_Y = BAR_BASE - fx.crossEntropy.uniform65 * PX_PER_NAT;
const TAG_X = COL_X + N * CELL + 12;
const CONCEPT = 'training-objective';

const text = (id, value, x, y, extra = {}) => ({ id, type: 'text', semanticId: id, conceptId: CONCEPT,
  initialState: { text: value, x, y, ...extra } });
const note = (id, value, x, y, extra = {}) => text(id, value, x, y, { typography: 'annotation', ...extra });
const hidden = { opacity: 0 };
// One stream character, centred on its column (0.6 em per character at body size).
const charX = (ch, k) => COL_X + k * CELL + CELL / 2 - (show(ch).length * 15 * 0.6) / 2;
const line = (id, from, to, role, extra = {}) => ({ id, type: 'line', semanticId: id, conceptId: CONCEPT,
  initialState: { from, to, role, ...extra } });

const B = A.batch_size;
const T_NANO = A.block_size;
const V = A.vocab_size;
const UNIFORM = fx.crossEntropy.uniform65.toFixed(2);

export const scene = {
  id: 'nanogpt-c26-training-objective',
  title: 'The training objective: per-position targets, their mean, perplexity',
  width: 960,
  height: 840,
  duration: 2.2,
  inputs: [
    { name: 'window', type: 'index', label: 'What-if: window length T (preset)', of: 'windowLabels', default: N - 1, presentation: 'slider' },
  ],
  exampleData: {
    windowLabels: Ts.map(T => `T = ${T}`),
    Ts,
    invT: Ts.map(T => 1 / T),
    // Recorded p as a percent, then its loss; blank past T. Raw, so no cell rounds twice.
    tableByT: byT(OBJ.p.map(pct), null).map((ps, t) => [...ps, ...LOSS_BY_T[t]]),
    barsByT: LOSS_BY_T,
    lossZeroByT: byT(OBJ.loss, 0), // sum needs numbers
    lossAll: OBJ.loss,
    pplByT: OBJ.pplByT,
    xEndByT: Ts.map(T => COL_X + T * CELL - 6),
    yEndByT: Ts.map(T => COL_X + (T + 1) * CELL - 6),
    meanEndByT: Ts.map(T => COL_X + T * CELL),
    meanTagXByT: Ts.map(T => COL_X + T * CELL + 8),
    shareOpacity: Ts.map(T => (T > F ? 1 : 0)),
    outsideOpacity: Ts.map(T => (T > F ? 0 : 1)),
    stateLines: Ts.map(T => (T === 1 ? 'T = 1: 1 scored position, counting 1/1.' : `T = ${T}: ${T} scored positions, each counting 1/${T}.`)),
    barBase: [BAR_BASE],
    tagBase: [BAR_BASE + 4],
    Bv: [B],
    Tv: [T_NANO],
  },
  derived: {
    T: { op: 'pick', args: ['Ts', 'window'] },
    invNow: { op: 'pick', args: ['invT', 'window'] },
    table: { op: 'pick', args: ['tableByT', 'window'] },
    bars: { op: 'pick', args: ['barsByT', 'window'] },
    // ③ the objective: the plain mean of the T losses, each counting 1/T.
    lossZero: { op: 'pick', args: ['lossZeroByT', 'window'] },
    sum: { op: 'sum', args: ['lossZero'] },
    sumV: { op: 'concat', args: ['sum'] },
    meanV: { op: 'scale', args: ['sumV', 'invNow'] },
    mean: { op: 'pick', args: ['meanV', 0] },
    meanPx: { op: 'scale', args: ['meanV', -PX_PER_NAT] },
    meanYv: { op: 'add', args: ['meanPx', 'barBase'] },
    meanY: { op: 'pick', args: ['meanYv', 0] },
    meanTagYv: { op: 'add', args: ['meanPx', 'tagBase'] },
    meanTagY: { op: 'pick', args: ['meanTagYv', 0] },
    meanEnd: { op: 'pick', args: ['meanEndByT', 'window'] },
    meanTagX: { op: 'pick', args: ['meanTagXByT', 'window'] },
    // e→f's share of the objective: its loss × 1/T.
    fV: { op: 'concat', args: [`lossAll.${F}`] },
    shareV: { op: 'scale', args: ['fV', 'invNow'] },
    share: { op: 'pick', args: ['shareV', 0] },
    shareOp: { op: 'pick', args: ['shareOpacity', 'window'] },
    outsideOp: { op: 'pick', args: ['outsideOpacity', 'window'] },
    // ① the two slices.
    xEnd: { op: 'pick', args: ['xEndByT', 'window'] },
    yEnd: { op: 'pick', args: ['yEndByT', 'window'] },
    // ④ perplexity, e^ of the printed mean (precomputed: no exp op).
    ppl: { op: 'pick', args: ['pplByT', 'window'] },
    stateLine: { op: 'pick', args: ['stateLines', 'window'] },
    BT: { op: 'dot', args: ['Bv', 'Tv'] },
  },
  objects: [
    text('question', 'How do a window’s per-position losses become the one number training lowers?', 40, 30, { typography: 'heading' }),
    note('status-1', `Recorded toy run: p (a bigram reading only the previous character, not NanoGPT; iteration ${OBJ.iteration}, the last checkpoint)`, 40, 56),
    note('status-2', 'Calculated toy example: −ln p, e^mean · Live calculation: sum, mean, share, B · T', 40, 74),
    note('status-3', `What-if: window length T (NanoGPT’s is ${T_NANO}) · Source value: text, ${V}, B, T`, 40, 92),

    // ① the targets: one stream, x = characters 0..T − 1, y = characters 1..T.
    note('stream-label', 'characters', 40, STREAM_Y, hidden),
    ...STREAM.map((ch, k) => text(`char-${k}`, show(ch), charX(ch, k), STREAM_Y, hidden)),
    note('x-label', 'x (read)', 40, X_LINE_Y + 4, { role: 'input', ...hidden }),
    line('x-slice', { x: COL_X + 6, y: X_LINE_Y }, { x: { $derive: 'xEnd' }, y: X_LINE_Y }, 'input', hidden),
    note('y-label', 'y (targets)', 40, Y_LINE_Y + 4, { role: 'observed', ...hidden }),
    line('y-slice', { x: COL_X + CELL + 6, y: Y_LINE_Y }, { x: { $derive: 'yEnd' }, y: Y_LINE_Y }, 'observed', hidden),
    text('shift-1', 'y is x shifted by one: position i’s target is character i + 1.', 40, 192, hidden),
    text('shift-2', 'A window of T characters gives T scored predictions (• = space).', 40, 212, hidden),

    // ② score each position.
    { id: 'scores', type: 'grid', semanticId: 'per-position-scores', conceptId: CONCEPT,
      initialState: { x: COL_X, y: GRID_Y, rows: 2, cols: N, cell: CELL, matrixKind: 'input', role: 'prediction',
        rowLabels: ['p (%)', '−ln p'], columnLabels: PAIRS, values: { $derive: 'table' }, opacity: 0 } },

    // ③ average: one bar per scored position on the grid's pitch, and their mean.
    { id: 'loss-bars', type: 'bars', semanticId: 'loss-bars', conceptId: CONCEPT,
      initialState: { x: COL_X, y: BARS.y, h: BARS.h, cell: CELL, peak: BARS.peak, role: 'output', values: { $derive: 'bars' }, opacity: 0 } },
    line('anchor', { x: COL_X, y: ANCHOR_Y }, { x: COL_X + N * CELL, y: ANCHOR_Y }, 'neutral', hidden),
    note('anchor-tag', `uniform guess ${UNIFORM}`, TAG_X, ANCHOR_Y + 4, hidden),
    line('mean-line', { x: COL_X, y: { $derive: 'meanY' } }, { x: { $derive: 'meanEnd' }, y: { $derive: 'meanY' } }, 'learner', hidden),
    note('mean-tag', 'mean {{mean}}', { $derive: 'meanTagX' }, { $derive: 'meanTagY' }, { role: 'learner', ...hidden }),
    text('objective', 'Objective = (sum of the T losses) ÷ T = {{sum}} ÷ {{T}} = {{mean}} · each position counts 1/{{T}}', 40, 578, { role: 'learner', ...hidden }),
    // No timeline appear: opacity follows the window.
    text('share', `e→f, the least expected (p = ${pct(OBJ.p[F]).toFixed(2)}%), adds its ${lnP(OBJ.loss[F])} ÷ {{T}} = {{share}}`, 40, 600, { opacity: { $derive: 'shareOp' } }),
    text('outside', 'e→f lies past a 1-position window', 40, 600, { opacity: { $derive: 'outsideOp' } }),
    // The toy's average versus NanoGPT's: the same mean, over every scored position of the batch.
    note('scope', 'This card: the mean over one T-position window. NanoGPT: the same mean over all B × T scored positions in the batch.', 40, 622, hidden),

    // ④ read it as perplexity.
    text('perplexity', 'Perplexity = e^{{mean}} = {{ppl}}: the same uncertainty as choosing uniformly', 40, 654, hidden),
    text('perplexity-2', 'among about {{ppl}} equally likely possibilities.', 40, 676, hidden),
    note('uniform', `Uniform guess over all ${V} characters: perplexity ${V}, loss ln ${V} = ${UNIFORM} at every position.`, 40, 698, hidden),

    text('state-1', '{{stateLine}}', 40, 730, hidden),
    text('state-2', 'The drawn losses stay the same: T only sets how many are averaged.', 40, 752, hidden),
    note('legend', 'Grid: p(target) in % and its loss −ln p, each cell rounded on its own · bars: −ln p · line: their mean', 40, 780),
    note('footer', `NanoGPT averages B · T = ${B} · ${T_NANO} = {{BT}} positions per step and logs that mean as its loss, not e^loss.`, 40, 798),
  ],
  // Replay in causal order: the shift, the scores, the mean, perplexity; each
  // caption appears with its stage (the state lines with the mean).
  timeline: [
    ...['stream-label', ...STREAM.map((unused, k) => `char-${k}`), 'x-label', 'x-slice', 'y-label', 'y-slice', 'shift-1', 'shift-2']
      .map(target => ({ at: 0, action: 'appear', target, duration: 0.3 })),
    { at: 0.6, action: 'appear', target: 'scores', duration: 0.4 },
    ...['loss-bars', 'mean-line', 'mean-tag', 'objective', 'scope', 'state-1', 'state-2'].map(target => ({ at: 1.2, action: 'appear', target, duration: 0.3 })),
    ...['anchor', 'anchor-tag', 'perplexity', 'perplexity-2', 'uniform'].map(target => ({ at: 1.8, action: 'appear', target, duration: 0.3 })),
  ],
};

// The drawn window, the shortest (e→f outside), T = 2 (the largest share and
// mean, nearest the anchor) and T = 5 (the mean prints 2.01).
export const reviewStates = [{ window: 7 }, { window: 1 }, { window: 0 }, { window: 4 }];

// Practice (commit before you see): a 256-position window, which the card
// never draws. Every number below is built from these constants.
const BASE_LOSS = 1;
const SURPRISE = 9;
const MEAN = ((T_NANO - 1) * BASE_LOSS + SURPRISE) / T_NANO;
const LIFT = (SURPRISE - BASE_LOSS) / T_NANO;
const two = v => v.toFixed(2);
const shareAt = T => (OBJ.loss[F] / T).toFixed(3);
export const activity = {
  id: 'c26-practice',
  check: 'choice_equals',
  version: 1,
  prompt: `NanoGPT’s shakespeare_char windows are block_size = ${T_NANO} characters long; the card draws at most ${N}. Take one such window as a batch of one. Suppose ${T_NANO - 1} of its positions each score −ln p = ${two(BASE_LOSS)} and one surprising position scores ${two(SURPRISE)}. What is this window’s loss, the mean NanoGPT minimizes?`,
  fixedInputs: { window: N - 1 },
  // ponytail: SceneActivity shows no pick for an untouched answer, so this
  // naive default never renders; it only satisfies the choice declaration.
  // Bare numbers: the reasoning lives in the feedback.
  answer: { type: 'choice', label: 'Window loss', default: 'max', options: [
    { id: 'max', label: two(SURPRISE) },
    { id: 'kinds', label: two((BASE_LOSS + SURPRISE) / 2) },
    { id: 'sum', label: two((T_NANO - 1) * BASE_LOSS + SURPRISE) },
    { id: 'none', label: two(BASE_LOSS) },
    { id: 'mean', label: two(MEAN) },
  ] },
  expected: 'mean',
  checkLabel: 'Check',
  feedbackPass: `Right: (${T_NANO - 1} × ${two(BASE_LOSS)} + ${two(SURPRISE)}) ÷ ${T_NANO} = ${(T_NANO - 1) * BASE_LOSS + SURPRISE} ÷ ${T_NANO} = ${two(MEAN)}. Every position counts 1/${T_NANO}, so the one surprise lifts the mean only (${two(SURPRISE)} − ${two(BASE_LOSS)}) ÷ ${T_NANO} = ${two(LIFT)} above ${two(BASE_LOSS)}. On the card the same 1/T rule shrinks e→f’s share from ${lnP(OBJ.loss[F])} ÷ 2 = ${shareAt(2)} at T = 2 to ${lnP(OBJ.loss[F])} ÷ ${N} = ${shareAt(N)} at T = ${N}: the longer the window, the less one position moves the objective.`,
  feedbackFail: `Not quite. NanoGPT’s loss is the mean of −ln p over every scored position, each counting 1/${T_NANO} here: (${T_NANO - 1} × ${two(BASE_LOSS)} + ${two(SURPRISE)}) ÷ ${T_NANO} = ${two(MEAN)}. ${two(SURPRISE)} lets the worst position decide; ${two((BASE_LOSS + SURPRISE) / 2)} averages the two kinds of position without counting them; ${two((T_NANO - 1) * BASE_LOSS + SURPRISE)} is the sum, not the mean; ${two(BASE_LOSS)} ignores the surprise, which still adds (${two(SURPRISE)} − ${two(BASE_LOSS)}) ÷ ${T_NANO} = ${two(LIFT)}. On the card: e→f adds ${lnP(OBJ.loss[F])} ÷ T.`,
};

// Phase 1 plan (docs/nanogpt-deep-dive-batch4-plans.md, c26; verbatim where it fits).
export const plan = {
  concept: 'the training objective',
  objective: 'After this card, the learner should understand that NanoGPT\'s training objective is the plain mean of −ln p(next character) over every position it scores, each counting 1/N of it (N = B·T per step), a number perplexity only re-reads as e^mean.',
  prerequisites: [
    'c16-cross-entropy: the loss at ONE position is −ln p(target), which reads the probability on the true next character, not the top choice. Taken as given; c26 draws no logits, no softmax and no top-choice mark',
    'c11-causal-mask: position i is trained to predict character i + 1 (row labels \'0: B → e\'); c26 draws where those targets come from: the same text shifted by one',
    'named, not taught: an average; e^x undoes ln x (e^(ln 65) = 65)',
  ],
  causalSteps: [
    'targets: one stream of 9 characters, B e f o r e sp w e; bracket x covers characters 0 to T − 1, bracket y covers characters 1 to T, the same text shifted by one; both follow T',
    'score each position: one 2 × 8 grid, p (%) from the recorded toy bigram run at iteration 1000 and −ln p (precomputed); columns past T blank',
    'average: one −ln p bar per scored column on the grid\'s pitch and a mean line; the objective = (sum of the T losses) ÷ T, each position counting 1/T; e→f\'s share = 3.986 ÷ T',
    'read it as perplexity: e^mean, anchored by the uniform guess over 65 characters (perplexity 65, loss ln 65 = 4.17); NanoGPT averages B · T = 16,384 positions per step and logs the mean, not e^loss',
  ],
  primaryInteraction: 'one index slider, "What-if: window length T (preset)", T = 1..8, default T = 8 (the drawn window; NanoGPT\'s is 256). It moves the x and y brackets, blanks grid cells and bars past T, and changes the sum, the mean, 1/T, the mean line, e→f\'s share (past a 1-position window at T = 1) and perplexity; the drawn losses never change. It reveals that every scored position counts 1/T and one surprise\'s pull shrinks as 1/T',
  check: 'practice (commit before you see, choice_equals, fixedInputs window = T = 8): a T = 256 window (shakespeare_char\'s block_size) in which 255 positions score 1.00 and one scores 9.00 - what is its loss? Options 9.00 / 5.00 / 264.00 / 1.00 / 1.03; expected 1.03 = (255 × 1.00 + 9.00) ÷ 256. The card draws only T = 1..8 with recorded losses, so the answer needs the rule, not the picture',
  boundary: {
    decision: 'staged',
    reason: 'one causal pipeline, in data order: stream → the (x, y) shift → p(target) per position → −ln p → mean over the T scored positions → e^mean, revealed in four stages, and the one control reaches every stage. Perplexity is not a second model here: it has no input, mechanism, control or practice of its own and moves only when the mean moves. Log base and bits, char-level against BPE perplexity and eval perplexity are collection candidates, not built',
    reviewed: {},
    sequence: { name: 'Training fundamentals', position: 1, of: 2, relationships: [
      { type: 'prerequisite', card: 'c16-cross-entropy', direction: 'in' },
      { type: 'prerequisite', card: 'c11-causal-mask', direction: 'in' },
      { type: 'deepens', card: 'c01-forward-pass', direction: 'in' },
      { type: 'prerequisite', card: 'c19-gradient-step', direction: 'out' },
      { type: 'prerequisite', card: 'c18-train-val', direction: 'out' },
    ] },
  },
};

const REPRODUCE_TL = 'python packages/web/src/nanogpt/depth/fixtures/gen_training_loss.py --check';
const run = fx.toyRun;
const fmt = values => values.join(', ');

export const sources = [
  code('train.py', 119, 125, 'The targets: get_batch reads "data = np.memmap(os.path.join(data_dir, \'train.bin\'), dtype=np.uint16, mode=\'r\')", then "x = torch.stack([torch.from_numpy((data[i:i+block_size]).astype(np.int64)) for i in ix])" and "y = torch.stack([torch.from_numpy((data[i+1:i+1+block_size]).astype(np.int64)) for i in ix])" - y is x shifted by one, read from a uint16 file, so no target is ever −1.'),
  code('model.py', 184, 187, 'The loss: "if targets is not None:" … "logits = self.lm_head(x)", "loss = F.cross_entropy(logits.view(-1, logits.size(-1)), targets.view(-1), ignore_index=-1)" - every one of the B·T positions is a row, and the default reduction averages them.'),
  { kind: 'doc', title: 'torch.nn.functional.cross_entropy (PyTorch documentation)', url: 'https://docs.pytorch.org/docs/stable/generated/torch.nn.functional.cross_entropy.html',
    note: 'reduction: "\'mean\': the sum of the output will be divided by the number of elements in the output" (Default: \'mean\'); ignore_index: "Specifies a target value that is ignored and does not contribute to the input gradient", and with it the loss "is averaged over non-ignored targets". NanoGPT never emits −1, so every position counts, each 1/N.' },
  code('model.py', 188, 191, 'Without targets there is no loss: "# inference-time mini-optimization: only forward the lm_head on the very last position" … "loss = None" (c01).'),
  code('config/train_shakespeare_char.py', 17, 19, 'N = B·T per step: "gradient_accumulation_steps = 1", "batch_size = 64", "block_size = 256 # context of up to 256 previous characters" - 64 × 256 = 16,384 positions, and the practice\'s window of 256.'),
  code('train.py', 300, 301, 'One step\'s loss: "logits, loss = model(X, Y)", then "loss = loss / gradient_accumulation_steps # scale the loss to account for gradient accumulation" (1 for shakespeare_char).'),
  code('train.py', 320, 327, 'What is logged is the loss, not e^loss: "lossf = loss.item() * gradient_accumulation_steps" … "iter {iter_num}: loss {lossf:.4f}".'),
  code('train.py', 216, 228, 'The evaluated loss is the same mean, averaged again over batches: "losses[k] = loss.item()" … "out[split] = losses.mean()" (c18).'),
  code('train.py', 263, 265, 'and it is printed as a loss too: "train loss {losses[\'train\']:.4f}, val loss {losses[\'val\']:.4f}".'),
  code('README.md', 211, 214, 'Perplexity appears in NanoGPT only as a todo: "## todos" … "- Eval zero-shot perplexities on standard evals (e.g. LAMBADA? HELM? etc.)".'),
  code('README.md', 51, 51, 'For scale, off the card: "the best validation loss is 1.4697" - a perplexity of e^1.4697 = 4.35 characters.'),
  code('data/shakespeare_char/prepare.py', 24, 25, `The ${V} characters: "chars = sorted(list(set(data)))", "vocab_size = len(chars)" - a uniform guess scores ln ${V} = ${UNIFORM} at every position.`),
  code('data/shakespeare_char/prepare.py', 38, 40, `“${OBJ.text}” is training text: "n = len(data)", "train_data = data[:int(n*0.9)]", "val_data = data[int(n*0.9):]".`),
  { ...calculation('Recorded toy run', `p(target) for “${OBJ.text}” at iteration ${OBJ.iteration}`,
    `The seeded toy run c18 plots (generate_fixtures.py toy_run, seed ${run.seed}): ${run.model}, trained on the first ${run.config.train_chars} characters of the training split. gen_training_loss.py calls it unchanged, copies its weight table at iteration ${OBJ.iteration} (its last checkpoint, train loss ${run.checkpoints.at(-1).train} over the whole slice) and, for each position of “${OBJ.text}” (character ${OBJ.at} of that slice, asserted inside it), records p(target) = softmax of the previous character's row, 6 decimals: ${fmt(OBJ.p)}. A bigram reads only the previous character, so e→f and e→• come from one row. The card prints p × 100 to 2 decimals.`),
  reproduce: REPRODUCE_TL },
  { ...calculation('Calculated toy example', '−ln p and e^mean',
    `gen_training_loss.py, float64: −ln p to 4 decimals (${fmt(OBJ.loss)}), and e^mean for T = 1..${N} to 2 decimals (${fmt(OBJ.pplByT)}), where the mean is the card's own printed value (the 3-decimal sum times 1/T, rounded to 3). The card has no log or exp, so both are computed there. Each cell is rounded on its own: −ln of a printed p can differ from the printed −ln p by 0.01 (e→f: 3.98 against 3.99).`),
  reproduce: REPRODUCE_TL },
  calculation('Live calculation', 'Sum, mean, share and B · T',
    'Computed on the card as T moves: pick (the window\'s losses, 1/T, the table, bars, bracket ends and perplexity), sum and concat (the sum of the T losses), scale (sum × 1/T = the mean; e→f\'s 3.986 × 1/T = its share; the mean line\'s pixels), add (the mean line\'s y) and dot (B · T = 64 · 256). Rounded to 3 decimals, so the mean is the printed sum ÷ T.'),
  calculation('What-if', 'Window length T = 1..8',
    `The card averages the first T positions of its ${N}-position window. NanoGPT always scores whole windows of block_size = ${T_NANO}; shorter windows here only show how the averaging weights 1/T change. The drawn losses do not depend on T: no position reads a later character.`),
  calculation('Source value', 'The text, 65, B and T',
    `The characters of “${OBJ.text}” (fx.tokenizer), vocab_size ${V}, ln ${V} = ${fx.crossEntropy.uniform65} (fx.crossEntropy.uniform65), batch_size ${B} and block_size ${T_NANO} (the resolved shakespeare_char config, fx.architecture).`),
  tinyShakespeare(`“${OBJ.text}” is character ${OBJ.at} of the toy run's training slice, “First Citizen:⏎Before we…”.`),
];

export const evidence = {
  card: 'c26-training-objective',
  title: scene.title,
  learningQuestion: scene.objects[0].initialState.text,
  concept: 'NanoGPT scores every position of every window against the next character (y is x shifted by one, train.py:119-125) and its loss is F.cross_entropy\'s default mean of −ln p(target) over the B·T = 16,384 rows of a step (model.py:184-187, config/train_shakespeare_char.py:17-19): each position counts 1/N, so one surprise\'s pull shrinks as 1/N. Perplexity = e^loss re-reads that mean as the size of an equally unsure uniform guess; NanoGPT logs the loss, not e^loss (train.py:320-327).',
  sourceRevision: `${fx.provenance.nanogpt.repo}@${fx.provenance.nanogpt.commit}`,
  provenance: `source: train.py:119-125, :216-228, :263-265, :300-301, :320-327; model.py:184-187, :188-191; config/train_shakespeare_char.py:17-19; data/shakespeare_char/prepare.py:24-25, :38-40; README.md:51, :211-214 - checked against the pinned files. Recorded toy run: p for “${OBJ.text}” at iteration ${OBJ.iteration} (gen_training_loss.py recorded.objective). Calculated toy example: −ln p and e^mean. Live calculation: pick, sum, concat, scale, add, dot. What-if: window length T. Source value: the text, ${V}, B, T. Doc: PyTorch cross_entropy (reduction='mean').`,
  control: '"What-if: window length T (preset)" index slider, T = 1..8, default T = 8 (the drawn window); the only control.',
  consequence: 'Moving T redraws the x bracket (characters 0..T − 1) and the y bracket (1..T), blanks grid cells and bars past T, and moves the mean line; the readout gives sum ÷ T = mean (0.922 ÷ 1 = 0.922 … 15.371 ÷ 8 = 1.921), e→f\'s share 3.986 ÷ T (1.993 at T = 2 down to 0.498 at T = 8; past the window at T = 1) and perplexity e^mean (2.51, 11.63, 8.62, 8.34, 7.46, 6.75, 7.47, 6.83). The drawn losses, the uniform-guess anchor at 4.17 and the B · T footer hold at every T.',
  interactionPurpose: 'See that the objective weights every scored position equally, 1/T each: T changes which losses are averaged and how much one surprise moves the mean, never a loss itself.',
  task: 'Slide T from 8 down to 1 and watch the mean, the share and perplexity; then, in practice, compute the loss of a 256-position window with one surprise before any feedback.',
  capability: 'index slider; 9 stream characters as text; two lines with derived end x (the slices); a 2 × 8 input grid whose values are picked per T with nulls drawn blank; bars with a fixed peak and nulls past T; a line with derived y and end x (the mean) and a text tag with derived x and y; picked opacity on two alternative captions; derive ops pick, sum, concat, scale, add, dot; choice practice graded by choice_equals with fixedInputs.',
};
