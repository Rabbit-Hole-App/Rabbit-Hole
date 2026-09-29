// Card 22 - top-k, standalone (no sequence: an optional branch off the draw
// step). generate() may cut the last position's logits after ÷ T and before
// softmax: every logit strictly below v_k, the k-th largest, becomes −∞, so
// softmax gives it p exactly 0 and shares the whole 1 over the survivors, each
// its uncut p ÷ the kept mass. One staged pipeline: ① the logits with the
// survivors ringed and −∞ under the cut ones, ② the uncut p (the fixed
// reference), ③ p after top-k and its bars.
//
// The logits are c21's calculated toy example at T = 1.0 (fx.temperature). No
// derive op compares against v_k, so each k's cut row is precomputed here by
// generate()'s rule; v_k, both softmaxes, the kept and cut mass and the counts
// are live. A cut logit is null, not −1000: softmax leaves it out and it draws
// as the blocked band (an exact 0 would print "0.00", like a rounded small p).
// ② and ③ round each cell on its own (no distribution: true): sum-to-1.00
// rounding showed z's 0.6048 as 0.61 and broke "new p = old p ÷ kept mass" on
// the card's own cells. No derive op divides, so the common factor and z's and
// e's p to 4 decimals are built here per k from the same softmax op.
// The practice asks about a six-value distribution the card never draws; its
// What-if row is gated behind the hidden `revealed` latch.
import fx from '../fixtures/nanogpt-fixtures.generated.js';
import g from '../depth/fixtures/generation.generated.js';
import { buildPool, canonical, DERIVATIONS } from '../../scene-derive.js';
import { formatCell } from '../../scene-format.js';
import { code, calculation, tinyShakespeare } from '../sources.js';

const T = fx.temperature;
const LOGITS = T.logits;
const V = LOGITS.length; // 6 toy candidates
if (!LOGITS.every((x, i) => i === 0 || x < LOGITS[i - 1])) throw new Error('fx.temperature logits must be strictly descending: the card shows them largest first');
const NAMES = T.display.map(d => (d === '␣' ? 'sp' : d)); // c21's display of the space
const KS = LOGITS.map((unused, i) => i + 1);             // top_k = 1..6
// generate()'s rule (model.py:321-322): v_k = the min(k, V)-th largest; strictly below it is cut.
const vkOf = k => [...LOGITS].sort((a, b) => b - a)[Math.min(k, V) - 1];
const MASKED = KS.map(k => LOGITS.map(x => (x < vkOf(k) ? null : x)));
const KEEP = MASKED.map(row => row.map(x => (x === null ? 0 : 1)));
const kept = (row, yes) => row.flatMap((x, i) => ((x !== null) === yes ? [i] : []));
const charVocab = fx.tokenizer.tokenizers.find(t => t.id === 'char');
const SAMPLE_K = g.sample.top_k.value;           // sample.py:18
const GENERATE_K = g.generateDefaults.top_k;     // model.py:306 (None)
if (GENERATE_K !== null) throw new Error('generate() defaults to top_k = None');

// Per k: every survivor's p times one factor, 1 ÷ the kept mass; z and e before
// and after to 4 decimals, so the rule checks against printed numbers (3 would
// print z's 0.6048 as 0.605 beside its 0.60 cell).
const softmax = row => DERIVATIONS.softmax.derive([row], canonical).value;
const P_ALL = softmax(LOGITS);
const four = v => v.toFixed(4);
const factorLineByK = MASKED.map(row => {
  const keptMass = row.reduce((s, x, i) => s + (x === null ? 0 : P_ALL[i]), 0);
  return `every kept p × ${(1 / keptMass).toFixed(3)} (= 1 ÷ ${Math.round(keptMass * 1000) / 1000})`;
});
const oldNewByK = MASKED.map(row => {
  const p = softmax(row);
  return [0, 1].map(i => `${NAMES[i]} ${four(P_ALL[i])} → ${p[i] === null ? '0, cut' : four(p[i])}`).join(' · ');
});

// The practice's case, typed here (a different model, not drawn): p' before any cut.
const WHATIF_P = [0.45, 0.15, 0.13, 0.11, 0.10, 0.06];
const WHATIF_K = 2;
const WHATIF_LOGITS = WHATIF_P.map(Math.log);
const WHATIF_MASKED = WHATIF_LOGITS.map((x, i) => (i < WHATIF_K ? x : null)); // p' is descending: the first two survive
const two = v => v.toFixed(2);
const KEPT_P = WHATIF_P.slice(0, WHATIF_K).reduce((a, b) => a + b, 0); // 0.60
const CUT_P = 1 - KEPT_P;                                              // 0.40

const CELL = 59;
const X = 200;
const RING = 5; // the survivors' ring stands this far outside ①'s cells, except on the kept/cut divider
const MARK_W = 44; // "−∞" at the display size, measured; each mark is centred under its cell
// ① sits 24 px lower than the header allows, so its column labels read as the grid's, not the header's.
const Y = { logits: 160, marks: 257, pAll: 276, pCut: 352, bars: 440, whatIf: 600 }; // marks: the −∞ baseline
const FOOT = 690;
const BARS_H = 120;
const RX = 572; // readouts: every filled line ends inside the widest static footer, so the frame never moves
const CONCEPT = 'top-k';
const MARK_COLS = KS.slice(0, V - 1); // columns 1..5: the top logit is never cut

const text = (id, value, x, y, extra = {}) => ({ id, type: 'text', semanticId: id, conceptId: CONCEPT,
  initialState: { text: value, x, y, ...extra } });
const note = (id, value, x, y, extra = {}) => text(id, value, x, y, { typography: 'annotation', ...extra });
const rowName = (id, value, y, extra = {}) => text(id, value, 40, y, { typography: 'caption', ...extra });
const hidden = { opacity: 0 };
const WHATIF = { opacity: { $derive: 'whatIfOp' } };

export const scene = {
  id: 'nanogpt-c22-top-k',
  title: 'Top-k: truncating the distribution',
  width: 960,
  height: 771,                          // the padded content, 770.32: a 960-wide frame draws it at scale 1
  duration: 1.6,
  inputs: [
    { name: 'topK', type: 'index', label: 'top_k (preset)', of: 'kLabels', default: 1, presentation: 'slider' },
    { name: 'revealed', type: 'bool', label: 'What-if revealed', hidden: true, default: false },
  ],
  exampleData: {
    // Bare values: the practice's lock line prints "top_k = 2", not "= k = 2".
    kLabels: KS.map(k => (k === V ? `${k} (nothing cut)` : `${k}`)),
    kValues: KS,
    ordinals: ['1st', '2nd', '3rd', '4th', '5th', '6th'],
    kPosByK: KS.map(k => Math.min(k, V) - 1), // v_k's place in the logits, shown largest first
    logits: LOGITS,
    logitTexts: LOGITS.map(x => formatCell(x)), // v_k as its ① cell prints it, so "v_k = 2.00" never reads as k
    display: NAMES,
    maskedByK: MASKED,
    keepByK: KEEP,
    keptIdxByK: MASKED.map(row => kept(row, true)),
    // One mark per column, blank where the logit survives (column 0 always does).
    cutRowByK: MASKED.map(row => row.map(x => (x === null ? '−∞' : ' '))),
    // The ring's right edge is the kept/cut divider, so no cut cell is inside it; at k = V nothing is cut and it clears the grid.
    ringWByK: KS.map(k => Math.min(k, V) * CELL + (k < V ? 1 : 2) * RING),
    keptNamesByK: MASKED.map(row => kept(row, true).map(i => NAMES[i]).join(', ')),
    cutNamesByK: MASKED.map(row => kept(row, false).map(i => NAMES[i]).join(', ') || 'none'),
    kLineByK: KS.map(k => (k < V ? 'every logit below v_k → −∞' : 'nothing is below v_k: no cut')),
    consequenceByK: KS.map(k => (k === 1 ? `only ${NAMES[0]} is left: every draw is ${NAMES[0]} (greedy)`
      : k < V ? 'softmax: −∞ → p exactly 0, never drawn' : `③ = ②; ${NAMES[V - 1]}: ${two(P_ALL[V - 1])} in ③, bar too thin to see`)),
    factorLineByK,
    oldNewByK,
    one: [1],
    whatIfLogits: WHATIF_LOGITS,
    whatIfMasked: WHATIF_MASKED,
    wBefore: `other model’s p: ${two(WHATIF_P[0])}, ${two(WHATIF_P[1])} · ${two(CUT_P)} cut`,
    wAfter: `each ÷ ${two(KEPT_P)} → ${two(WHATIF_P[0] / KEPT_P)}, ${two(WHATIF_P[1] / KEPT_P)} (3 : 1 kept)`,
    blank: ' ',
  },
  derived: {
    kValue: { op: 'pick', args: ['kValues', 'topK'] },
    kPos: { op: 'pick', args: ['kPosByK', 'topK'] },
    vk: { op: 'pick', args: ['logitTexts', 'kPos'] },             // v[:, [-1]]
    kth: { op: 'pick', args: ['ordinals', 'topK'] },
    masked: { op: 'pick', args: ['maskedByK', 'topK'] },          // logits[logits < v_k] = -inf
    keep: { op: 'pick', args: ['keepByK', 'topK'] },
    pAll: { op: 'softmax', args: ['logits'] },                    // ② no cut
    pCut: { op: 'softmax', args: ['masked'] },                    // ③ F.softmax over what is left
    keptMass: { op: 'dot', args: ['pAll', 'keep'] },
    keptMassV: { op: 'concat', args: ['keptMass'] },
    cutMassV: { op: 'sub', args: ['one', 'keptMassV'] },
    cutMass: { op: 'pick', args: ['cutMassV', 0] },
    keptCount: { op: 'sum', args: ['keep'] },
    keptIdx: { op: 'pick', args: ['keptIdxByK', 'topK'] },
    cutRow: { op: 'pick', args: ['cutRowByK', 'topK'] },
    ringW: { op: 'pick', args: ['ringWByK', 'topK'] },
    keptNames: { op: 'pick', args: ['keptNamesByK', 'topK'] },
    cut: { op: 'pick', args: ['cutNamesByK', 'topK'] },
    kLine: { op: 'pick', args: ['kLineByK', 'topK'] },
    consequence: { op: 'pick', args: ['consequenceByK', 'topK'] },
    factorLine: { op: 'pick', args: ['factorLineByK', 'topK'] },
    oldNew: { op: 'pick', args: ['oldNewByK', 'topK'] },
    // The practice's What-if: out of every display until a committed attempt (blank, not zero).
    pW: { op: 'softmax', args: ['whatIfMasked'] },
    pWShown: { op: 'gate', args: ['pW', 'revealed'] },
    whatIfOp: { op: 'choose', args: ['revealed', 1, 0] },
    whatIfHintOp: { op: 'choose', args: ['revealed', 0, 1] },
    wLine1: { op: 'choose', args: ['revealed', 'wBefore', 'blank'] },
    wLine2: { op: 'choose', args: ['revealed', 'wAfter', 'blank'] },
  },
  objects: [
    text('question', 'When top-k cuts the smaller logits, where does their probability go?', 40, 30, { typography: 'heading' }),
    note('status', 'Logits: Calculated toy example · p, kept and cut mass: Live calculation · top_k defaults, 65: Source value', 40, 56),
    note('builds-on', `Builds on: temperature (÷ T, softmax, one random draw) · the same six candidates after “${T.context}”`, 40, 78),
    // Where the cut sits in the loop the Generation context path just walked (c24).
    note('loop-step', 'Each generate() pass (the generation loop): last position’s logits ÷ T → top-k (if set) → softmax → one random draw', 40, 100),

    // ① the logits, largest first; survivors ringed, −∞ under the cut ones. The
    // ring is ③'s green, drawn first so ①'s cells sit on it.
    rowName('name-logits', '① logits (T = 1.0)', Y.logits + 35, hidden),
    { id: 'kept-ring', type: 'box', semanticId: 'survivors', conceptId: CONCEPT,
      initialState: { x: X - RING, y: Y.logits - RING, w: { $derive: 'ringW' }, h: CELL + 2 * RING, role: 'output', opacity: 0 } },
    { id: 'logits', type: 'grid', semanticId: 'toy-logits', conceptId: CONCEPT,
      initialState: { x: X, y: Y.logits, rows: 1, cols: V, cell: CELL, matrixKind: 'input', role: 'input', columnLabels: [...NAMES],
        values: { $derive: 'logits' }, cellHighlight: { $derive: 'keptIdx' }, cellHighlightKind: 'highlight', opacity: 0 } },
    // Plain glyphs, no chip (a chip read as a Practice button); at the display size ∞ stands ~11 px, taller than
    // the annotation text (at the cells' mono size it was 4 px).
    ...MARK_COLS.map(j => text(`cut-mark-${j}`, `{{cutRow.${j}}}`, X + j * CELL + (CELL - MARK_W) / 2, Y.marks, { typography: 'display', opacity: 0 })),

    // ② the uncut p (fixed reference) and ③ the softmax of the cut row, on one
    // fixed [0, 1] heat; each cell rounded on its own (see the header).
    rowName('name-p-all', '② p, no cut', Y.pAll + 35, hidden),
    { id: 'p-all', type: 'grid', semanticId: 'p-no-cut', conceptId: CONCEPT,
      initialState: { x: X, y: Y.pAll, rows: 1, cols: V, cell: CELL, matrixKind: 'derived', role: 'neutral',
        heat: true, valueScale: 'fixed', values: { $derive: 'pAll' }, opacity: 0 } },
    rowName('name-p-cut', '③ softmax after cut', Y.pCut + 35, hidden),
    { id: 'p-cut', type: 'grid', semanticId: 'p-after-top-k', conceptId: CONCEPT,
      initialState: { x: X, y: Y.pCut, rows: 1, cols: V, cell: CELL, matrixKind: 'derived', role: 'output',
        heat: true, valueScale: 'fixed', values: { $derive: 'pCut' }, opacity: 0 } },

    // ③ as bars on a fixed axis: a cut candidate has no bar.
    rowName('name-bars', 'bars of ③', Y.bars + 58, hidden),
    { id: 'bars', type: 'bars', semanticId: 'p-after-top-k-bars', conceptId: CONCEPT,
      initialState: { x: X, y: Y.bars, h: BARS_H, cell: CELL, peak: 1, role: 'output', distribution: true, labels: [...NAMES],
        values: { $derive: 'pCut' }, opacity: 0 } },
    { id: 'bars-top', type: 'line', semanticId: 'probability-one', conceptId: CONCEPT,
      initialState: { from: { x: X, y: Y.bars + 4 }, to: { x: X + V * CELL, y: Y.bars + 4 }, role: 'neutral', opacity: 0 } },
    note('bars-top-key', 'p = 1', X - 40, Y.bars + 8, hidden), // at the line's left end

    // Readouts: the selected k and where the probability went.
    text('k-readout', 'top_k = {{kValue}} · v_k = {{vk}}', RX, Y.logits + 20),
    text('vk-readout', 'v_k = the {{kth}} largest logit', RX, Y.logits + 44),
    text('k-line', '{{kLine}}', RX, Y.logits + 68),
    text('kept-count', '{{keptCount}} of 6 can be drawn', RX, Y.pAll + 26),
    text('cut-mass', 'cut: {{cut}}, which held {{cutMass}}', RX, Y.pAll + 50),
    text('kept-mass', 'kept: {{keptNames}} held {{keptMass}}', RX, Y.pAll + 74),
    note('factor', '{{factorLine}}', RX, Y.pCut + 28),
    note('old-new', '{{oldNew}}', RX, Y.pCut + 48),
    note('consequence', '{{consequence}}', RX, Y.pCut + 68),

    // The practice's case, additive; no timeline appear. Until then its slot
    // says what will fill it, so the band never reads as missing content.
    note('whatif-hint', `What-if (k = ${WHATIF_K}): fills in after you check a Practice answer`, 40, Y.whatIf + 35, { opacity: { $derive: 'whatIfHintOp' } }),
    rowName('name-whatif', `What-if (k = ${WHATIF_K})`, Y.whatIf + 35, WHATIF),
    { id: 'whatif', type: 'grid', semanticId: 'what-if-p', conceptId: CONCEPT,
      initialState: { x: X, y: Y.whatIf, rows: 1, cols: V, cell: CELL, matrixKind: 'derived', role: 'output', // ③'s look: a cut cell is the same blocked band
        distribution: true, heat: true, valueScale: 'fixed', values: { $derive: 'pWShown' }, ...WHATIF } },
    text('whatif-before', '{{wLine1}}', RX, Y.whatIf + 22),
    text('whatif-after', '{{wLine2}}', RX, Y.whatIf + 46),

    note('blank-note', 'A blank cell is exactly 0, never drawn; a .00 cell (the temperature card) is only rounded, so a row can total 0.99.', 40, FOOT),
    note('default-note', `Source value: generate() cuts nothing by default (top_k = None); the sampler sets ${SAMPLE_K}, above all ${charVocab.vocabSize} characters.`, 40, FOOT + 20),
    note('order-note', 'Shown largest first; NanoGPT keeps vocabulary order and compares each logit with v_k (a tie with v_k survives).', 40, FOOT + 40),
  ],
  // Replay in pipeline order: ① and ②, the cut, ③, its bars, the bars' top line.
  timeline: [
    ...[[0, ['name-logits', 'logits', 'name-p-all', 'p-all']], [0.4, ['kept-ring', ...MARK_COLS.map(j => `cut-mark-${j}`)]], [0.8, ['name-p-cut', 'p-cut']], [1.2, ['name-bars', 'bars']]]
      .flatMap(([at, targets]) => targets.map(target => ({ at, action: 'appear', target, duration: 0.4 }))),
    ...['bars-top', 'bars-top-key'].map(target => ({ at: 1.4, action: 'appear', target, duration: 0.2 })),
  ],
};

// The default (k = 2), the greedy case, k = 3, nothing cut, then the reveal at k = 2 and at k = 6.
export const reviewStates = [{ topK: 1 }, { topK: 0 }, { topK: 2 }, { topK: 5 }, { topK: 1, revealed: true }, { topK: 5, revealed: true }];

// Practice (commit before you see): p' at top_k = 2, which no row draws.
// Option numbers come from p' and the card's own derive graph (unrounded).
const pool = buildPool({ exampleData: { ...scene.exampleData, topK: WHATIF_K - 1, revealed: true }, derived: scene.derived }, canonical);
const [pW0, pW1] = pool.pW;
const OPTIONS = {
  same: `${two(WHATIF_P[0])} and ${two(WHATIF_P[1])}`,
  even: `${two(WHATIF_P[0] + CUT_P / 2)} and ${two(WHATIF_P[1] + CUT_P / 2)}`,
  top: `${two(WHATIF_P[0] + CUT_P)} and ${two(WHATIF_P[1])}`,
  proportional: `${two(pW0)} and ${two(pW1)}`,
};
const quote = id => `“${OPTIONS[id]}”`;
export const activity = {
  id: 'c22-practice',
  check: 'choice_equals',
  version: 1,
  fixedInputs: { topK: WHATIF_K - 1 },
  revealInput: 'revealed',
  prompt: `The card is at top_k = ${WHATIF_K}. Suppose a different model gave these six probabilities before any cut (not drawn): ${WHATIF_P.map(two).join(', ')}. With top_k = ${WHATIF_K}, what would the two survivors’ probabilities be?`,
  // ponytail: SceneActivity shows no pick for an untouched answer, so this
  // naive default never renders; it only satisfies the choice declaration.
  answer: { type: 'choice', label: 'The two survivors’ probabilities', default: 'same',
    options: Object.entries(OPTIONS).map(([id, label]) => ({ id, label })) },
  expected: 'proportional',
  checkLabel: 'Check',
  feedbackPass: `Right. top_k = ${WHATIF_K} keeps the two largest logits; the other four become −∞, so their ${two(CUT_P)} is gone and softmax shares the whole 1 over what is left: each survivor ÷ ${two(KEPT_P)}, the kept mass. ${two(WHATIF_P[0])} → ${two(pW0)} and ${two(WHATIF_P[1])} → ${two(pW1)}, still 3 to 1. The What-if row now shows it.`,
  // Two lines at most, like feedbackPass: the whole line is drawn in the error colour.
  feedbackFail: `Not quite. The cut four get exactly 0; softmax shares the whole 1 over the survivors in proportion to their old p, each ÷ ${two(KEPT_P)} (the kept mass): ${OPTIONS.proportional}. ${quote('same')} sums to ${two(KEPT_P)}, not 1; an even split or all to the top one breaks the 3 : 1 ratio. The What-if row now shows it.`,
};

// Phase 1 plan (docs/nanogpt-deep-dive-batch5-plans.md, c22).
export const plan = {
  concept: 'Top-k sampling in NanoGPT\'s generate(): optional, on the last position\'s logits after ÷ T and before softmax. torch.topk finds v_k, the k-th largest logit (k capped at V); every logit strictly below v_k becomes −Inf (a tie survives); softmax gives each cut candidate exactly 0 and each survivor its uncut p ÷ the kept mass, so the survivors keep their odds; torch.multinomial never draws p = 0; top_k = 1 leaves one survivor unless the top logits tie. generate() defaults to top_k = None and sample.py sets 200, above shakespeare_char\'s 65 characters, so neither cuts anything. Unlike ÷ T (c21), which rescales the gaps and in exact arithmetic never makes a p exactly 0.',
  objective: 'After this card, the learner should understand that top-k sets every logit below the k-th largest to −∞, so softmax gives those candidates probability exactly 0 and shares the whole 1 among the candidates that remain, each in proportion to its old probability.',
  prerequisites: [
    'c21-temperature (frozen): generate() takes the last position\'s logits, applies ÷ T and softmax, then makes one random draw from p; c22 reuses its six toy candidates after “First Citi” and their T = 1.0 row, and contrasts with its "a .00 cell is rounded, not zero"',
    'c24-generation-loop (earlier on the board, not required): where the draw sits in each pass; c22 says where in that step the cut runs',
    'named, not taught: a larger logit gives a larger probability (softmax keeps the order); the practice relies on it',
    'taught in place: the k-th largest value - the logits are shown largest first and a readout names v_k and its ordinal',
  ],
  causalSteps: [
    '① the logits at T = 1.0: z 3 · e 2 · t 1 · s 0.5 · a 0 · sp −1, largest first',
    'v_k: the k-th largest logit, capped at V; the survivors are ringed and a readout gives v_k and its ordinal',
    'the cut: every logit strictly below v_k becomes −∞ (a −∞ mark under each cut cell); a tie with v_k would survive (the toy has none)',
    'softmax: ② the uncut p (fixed reference); ③ p after top-k, cut cells blank (exactly 0) and each survivor = its uncut p ÷ the kept mass; bars of ③, a cut candidate has no bar',
    'consequence: multinomial draws in proportion to p, so a blank candidate is never drawn (a per-k caption; no draws recorded)',
  ],
  primaryInteraction: 'one index slider in INTERACT, "top_k (preset)", k = 1..6 (k = 6: nothing cut), default k = 2; v_k, the rings, the −∞ marks, ③, the bars, the kept and cut mass, the count and the consequence follow k, while ① and ② never change. It reveals that the cut mass goes to the survivors in proportion (p(z)/p(e) = e at every k ≥ 2) and the cut ones drop to exactly 0; k = 1 is the greedy case. A hidden bool "revealed" is owned by the practice',
  check: 'practice (commit before you see, choice_equals, fixedInputs top_k = 2): a different model\'s six probabilities 0.45, 0.15, 0.13, 0.11, 0.10, 0.06 (not drawn) cut to top_k = 2 - what are the survivors\' probabilities? Options 0.45 and 0.15 / 0.65 and 0.35 / 0.85 and 0.15 / 0.75 and 0.25; expected 0.75 and 0.25 (each ÷ the kept mass 0.60). The distribution is only in the prompt; after a committed attempt the What-if row draws it',
  boundary: {
    decision: 'staged',
    reason: 'one mental model: cut the tail, then renormalize the rest in proportion. The steps are causally dependent (the cut needs v_k, softmax reads the cut row, and the zeros and the proportional survivors are one softmax result), so under staging before splitting they stay one card. Not merged into c21: it is frozen, and reshaping all odds (temperature) and zeroing the tail while keeping the odds (top-k) are separate models. Standalone, no sequence: c21 is frozen with no plan export, and the Generation context path does not need top-k (sample.py\'s 200 ≥ 65 cuts nothing); the link to c21 lives in the prerequisites and the Builds-on line',
    reviewed: {},
  },
};

const REPRODUCE_GEN = 'python packages/web/src/nanogpt/depth/fixtures/gen_generation.py --check';

export const sources = [
  code('model.py', 319, 322, 'The cut, optional, between ÷ T and softmax: "# optionally crop the logits to only the top k options", "if top_k is not None:", "v, _ = torch.topk(logits, min(top_k, logits.size(-1)))" - k is capped at the vocabulary size, and v[:, [-1]] is v_k, the k-th largest - then "logits[logits < v[:, [-1]]] = -float(\'Inf\')": only a logit strictly below v_k becomes −∞, so a tie with v_k survives.'),
  code('model.py', 317, 318, 'Before the cut, the last position\'s logits are divided by T: "logits = logits[:, -1, :] / temperature". The card shows them at T = 1.0.'),
  code('model.py', 323, 324, 'Then "probs = F.softmax(logits, dim=-1)": e^−∞ = 0, so a cut candidate gets p exactly 0 and the survivors share the whole 1, each its uncut p ÷ the kept mass.'),
  code('model.py', 325, 326, 'Always one random draw in proportion to p: "idx_next = torch.multinomial(probs, num_samples=1)" - a candidate with p = 0 is never drawn.'),
  code('model.py', 312, 330, 'The loop has no argmax branch: from "for _ in range(max_new_tokens):" to "return idx" every token is drawn by torch.multinomial; top_k = 1 makes that draw greedy by construction (unless the top logits tie).'),
  code('model.py', 306, 306, 'Top-k is off unless the caller sets it: "def generate(self, idx, max_new_tokens, temperature=1.0, top_k=None):".'),
  code('sample.py', 18, 18, `NanoGPT's sampler sets it to ${SAMPLE_K}: "top_k = 200 # retain only the top_k most likely tokens, clamp others to have 0 probability".`),
  code('sample.py', 87, 87, 'and passes it to generate(): "y = model.generate(x, max_new_tokens, temperature=temperature, top_k=top_k)".'),
  code('README.md', 54, 54, 'shakespeare_char is sampled with that script: "python sample.py --out_dir=out-shakespeare-char".'),
  code('data/shakespeare_char/prepare.py', 24, 25, `The ${charVocab.vocabSize} characters: "chars = sorted(list(set(data)))", "vocab_size = len(chars)".`),
  code('data/shakespeare_char/prepare.py', 55, 61, `That size is saved with the dataset: "meta = {", "'vocab_size': vocab_size,", written to "meta.pkl".`),
  code('train.py', 137, 155, `Training reads it back, "meta_vocab_size = meta['vocab_size']", and builds the model with it: "model_args['vocab_size'] = meta_vocab_size if meta_vocab_size is not None else 50304" - ${charVocab.vocabSize} for shakespeare_char, not GPTConfig's default 50304.`),
  code('model.py', 133, 133, `The last layer gives one logit per vocabulary entry: "self.lm_head = nn.Linear(config.n_embd, config.vocab_size, bias=False)" - so logits.size(-1) is ${charVocab.vocabSize}, min(${SAMPLE_K}, ${charVocab.vocabSize}) keeps all ${charVocab.vocabSize}, and the sampler's top_k cuts nothing.`),
  calculation('Calculated toy example', `${V} toy logits`,
    `generate_fixtures.py temperature(): hand-set logits [${LOGITS.join(', ')}] for the characters ${T.vocab.map(c => (c === ' ' ? 'space' : c)).join(', ')} after "${T.context}" - the temperature card's T = 1.0 row, not NanoGPT output. They are strictly descending, so shown largest first they are also in the card's column order. The space is shown as sp.`),
  // Authored on this card, not by a fixture generator - so no reproduce command.
  { kind: 'calculation', status: 'Calculated toy example', title: 'The practice’s six probabilities',
    note: `Typed into this card for the practice, a different toy model's p before any cut: ${WHATIF_P.map(two).join(', ')}, largest first. The What-if row takes their natural logs as logits (softmax of ln p gives p back), leaves out all but the first ${WHATIF_K} and applies the same softmax as ③; it stays blank until a committed attempt.` },
  calculation('Live calculation', 'v_k, both softmaxes, the kept and cut mass',
    `Computed on the card for the chosen top_k: pick (v_k from the logits at place min(k, ${V}), its ordinal, the survivors' rings, the −∞ marks, the names and captions), softmax of the logits (②) and of the cut row, where a cut logit is left out and prints blank (③ and the bars), dot (the kept mass: ②'s p summed over the survivors), concat and sub (the cut mass: 1 − the kept mass) and sum (how many can be drawn). No derive op compares against v_k, so each k's cut row is built in the card by generate()'s rule: strictly below v_k is cut. No derive op divides either, so the common factor (1 ÷ the kept mass, 3 decimals) and z's and e's p before and after the cut (4 decimals) are built in the card for each k from the same softmax. Readouts are rounded to 3 decimals; each cell rounds its own p to 2, so ② totals 0.99 (as ③ does at k = 5 and 6) and z's 0.6048 shows as 0.60, not a sum-adjusted 0.61; the 4-decimal line is where the rule can be checked (old p × the factor matches new p within 0.001).`),
  { ...calculation('Source value', `top_k = None, ${SAMPLE_K} and ${charVocab.vocabSize}`,
    `gen_generation.py parses generate()'s default top_k = None from the pinned model.py and sample.py's top_k = ${SAMPLE_K} from the pinned sample.py (the generation fixture's generateDefaults and sample). vocab_size ${charVocab.vocabSize} comes from generate_fixtures.py, which rebuilds prepare.py's vocabulary over the sha-pinned Tiny Shakespeare file (fx.tokenizer, char).`),
  reproduce: `${REPRODUCE_GEN} && python packages/web/src/nanogpt/fixtures/generate_fixtures.py --check` },
  tinyShakespeare(`The text whose ${charVocab.vocabSize} distinct characters make the shakespeare_char vocabulary.`),
];

export const evidence = {
  card: 'c22-top-k',
  title: scene.title,
  learningQuestion: scene.objects[0].initialState.text,
  concept: plan.concept,
  sourceRevision: `${fx.provenance.nanogpt.repo}@${fx.provenance.nanogpt.commit}`,
  provenance: `source: model.py:133, :306, :312-330, :317-318, :319-322, :323-324, :325-326; sample.py:18, :87; README.md:54; data/shakespeare_char/prepare.py:24-25, :55-61; train.py:137-155 - checked against the pinned files. Calculated toy example: fx.temperature logits [${LOGITS.join(', ')}] (generate_fixtures.py temperature()), and the practice's p' ${WHATIF_P.map(two).join(', ')} typed on the card. Live calculation: pick, softmax (null-aware), dot, concat, sub, sum, gate, choose. Source value: top_k None and ${SAMPLE_K} (generation fixture, gen_generation.py), ${charVocab.vocabSize} (fx.tokenizer).`,
  control: 'topK - index slider "top_k (preset)" over k = 1..6 (labels "1" … "6 (nothing cut)"), default k = 2; revealed - hidden bool owned by the practice (set by a committed attempt).',
  consequence: 'Moving k changes v_k (3.00, 2.00, 1.00, 0.50, 0.00, -1.00, printed as its ① cell) and its ordinal, the rings on ①, the −∞ marks, ③ (1.00 | .73 .27 | .67 .24 .09 | .63 .23 .09 .05 | .61 .22 .08 .05 .03 | equal to ② .60 .22 .08 .05 .03 .01, cut cells blank; each cell rounded on its own), the bars (no bar for a cut candidate), the count, the cut and kept mass (0.395/0.605, 0.173/0.827, 0.091/0.909, 0.041/0.959, 0.011/0.989, 0/1), the common factor (every kept p × 1.653, 1.209, 1.100, 1.043, 1.011, 1.000), z’s and e’s p before and after to 4 decimals, and the consequence line (greedy at k = 1; softmax: −∞ → p exactly 0 at k = 2-5; at k = 6 sp’s 0.01 is in ③, its bar too thin to see); ① and ② never change. Before a committed practice attempt the What-if slot says it fills in after a Practice answer; after one the What-if (k = 2) row shows .75 .25 and four blanks in ③’s blocked look, with its two captions.',
  interactionPurpose: 'See where the cut probability goes: the cut candidates drop to exactly 0 and the survivors share it in proportion, so their odds (p(z)/p(e) = e) stay the same at every k ≥ 2.',
  task: 'Slide k from 6 down to 1 and compare ③ with ②: which cells go blank, and how much does each survivor grow? Practice (locked at k = 2): a different model\'s six probabilities 0.45 … 0.06 cut to top_k = 2 - what are the survivors\' probabilities? (choice; expected 0.75 and 0.25).',
  capability: 'index slider plus a hidden-bool revealInput; pick of precomputed null-masked rows; null-aware softmax (a cut cell draws as the blocked band, a null bar draws nothing); dot/concat/sub/sum for the masses; a derived cellHighlight list of kind highlight and a box with a derived width ringing the survivors up to the kept/cut divider; one display-size −∞ text per cut-able column, its text picked per k (blank when kept); grids with fixed [0, 1] heat, each cell rounded on its own (distribution: true only on the What-if row and the bars); bars with peak 1 and a top line labelled p = 1 at its left end; gate()d What-if values and choose()d text and opacity (a placeholder note until the reveal); choice practice graded by choice_equals with fixedInputs.',
};
