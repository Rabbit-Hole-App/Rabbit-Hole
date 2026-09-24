// Generation and sampling - Deep dive. What NanoGPT's generate() does for one
// new token, step by step as the source does it, with tensor shapes, the two
// sampling equations, and three of its branches as controls: the crop when
// the context is longer than block_size, the optional top-k crop (None, 1, 3,
// and sample.py's 200, which is a no-op on a 65-character vocabulary), and the
// temperature (sample.py's 0.8, generate()'s 1.0, and the edge case 0: ÷ 0
// makes the logits +∞, NaN and −∞, softmax returns all NaN and
// torch.multinomial raises a RuntimeError, so generate() crashes - checked
// with torch 2.14.0 on this row. generate() has no greedy branch; top_k = 1 is
// greedy unless the top logits tie, since ties with the k-th value survive).
// Under the softmax bars the renormalisation over K is checked numerically:
// p(z) over K = uncut p(z) ÷ the uncut p summed over K. Every pipeline step
// has a code source; the card itself carries no code listing.
//
// Numbers: the same toy as the Overview and Guided cards (depth/fixtures/
// gen_generation.py): counts after "iti" and logits = ln(count) are a
// calculated toy example; the one draw per branch is a recorded toy run
// (random.choices with seed 1337 - the first random number, the one the
// Overview's first step used). ÷ T, the top-k cut, softmax and the kept count
// are live derive ops, and so are the uncut softmax and its sum over K. A
// space in the prompt shows as ␣. sample.py's settings, block_size 256 and
// GPT-2's vocabulary are source values.
import fx from '../../fixtures/nanogpt-fixtures.generated.js';
import g from '../fixtures/generation.generated.js';
import { code, calculation, tinyShakespeare } from '../../sources.js';

const F = g.first;
const D = g.deep;
const CONCEPT = 'generate-loop';
const V = g.vocabSize;
const N = F.display.length;
const BLOCK = g.block;
const SAMPLE_K = g.sample.top_k.value;
const SAMPLE_T = g.sample.temperature.value;
const GEN_T = g.generateDefaults.temperature;
const GPT2_V = g.gpt2Checkpoint.vocab_size.value;
const NEW_TOKENS = g.sample.max_new_tokens.value;
const START_LEN = g.sample.start.value.length; // sample.py's start is a newline: one token
// Positions the forward runs over in one sample: no cache, so step i re-runs
// its whole cropped window, min(start + i, block_size).
const RERUN = Array.from({ length: NEW_TOKENS }, (_, i) => Math.min(START_LEN + i, fx.architecture.block_size)).reduce((a, b) => a + b, 0);
// A cut logit is −∞ in generate(); the card adds −CUT instead, because the
// evaluator only holds finite numbers. exp(−1000) underflows to exactly 0, so
// softmax gives a cut character the same p = 0 that −∞ gives.
const CUT = 1000;

const PROMPTS = [{ id: 'long', text: g.prompt }, { id: 'short', text: F.window }];
const TOP_KS = D.topKs.map((k, i) => ({ id: k === null ? 'none' : `k${k}`, k, kept: D.kept[i], draws: D.draws[i] }));
const TEMPS = [{ id: 't0', T: 0 }, ...D.temperatures.map((T, i) => ({ id: `t${String(T).replace('.', '')}`, T, draw: i }))];
const byId = (list, value) => Object.fromEntries(list.map(item => [item.id, value(item)]));
const names = kept => F.display.filter((c, i) => kept[i]).join(', ');
const glyphs = text => [...text].map(c => (c === ' ' ? '␣' : c));
// What ÷ 0 does to each logit of the toy's row: positive → +∞, 0 ÷ 0 → NaN.
const TO_INF = F.display.filter((c, i) => F.logits[i] > 0).join(' ');
const TO_NAN = F.display.filter((c, i) => F.logits[i] === 0).join(' ');

// Layout: step boxes down the left, their shapes beside them, the data right.
const BOX = { x: 24, w: 190, h: 36 };
const SHAPE_X = 226;
const DATA_X = 400;
const CHIP = 49.5; // token chip pitch
// Cells as wide as a two-character label chip, so the −∞ marks sit under their cells.
const CELL = 59;
const MARK_SHIFT = (CELL - (32 + 2 * 9.5)) / 2; // chip is 16 + 2 x 9.5 + 16 wide, pitch 59
const ROW = { crop: 100, forward: 172, scale: 226, topk: 306, softmax: 380, draw: 514, cat: 568 };
const BARS_H = 80;
const EQ_Y = 620;
const EDGE_Y = 720;

const text = (id, value, x, y, extra = {}) => ({ id, type: 'text', semanticId: id, conceptId: CONCEPT,
  initialState: { text: value, x, y, ...extra } });
const note = (id, value, x, y, extra = {}) => text(id, value, x, y, { typography: 'annotation', ...extra });
const box = (id, label, y) => ({ id, type: 'box', semanticId: id, conceptId: CONCEPT,
  initialState: { label, x: BOX.x, y, w: BOX.w, h: BOX.h, opacity: 0, role: 'neutral' } });
const STEPS = [
  ['crop', 'crop to block_size', '(B, t) → (B, t_c)'],
  ['forward', 'forward: self(idx_cond)', '(B, t_c) → (B, 1, V)'],
  ['scale', 'last position ÷ T', '(B, 1, V) → (B, V)'],
  ['topk', 'top-k: rest → −∞', '(B, V), keep z ≥ v_k'],
  ['softmax', 'softmax', '(B, V), each row sums to 1'],
  ['draw', 'multinomial draw', '(B, V) → (B, 1)'],
  ['cat', 'cat: append', '(B, t) → (B, t+1)'],
];
const stepObjects = STEPS.flatMap(([id, label, shape], i) => [
  box(`step-${id}`, label, ROW[id]),
  note(`shape-${id}`, shape, SHAPE_X, ROW[id] + BOX.h / 2 + 5),
  ...(i < STEPS.length - 1 ? [{ id: `next-${id}`, type: 'arrow', semanticId: `next-${id}`, conceptId: CONCEPT,
    initialState: { from: { x: BOX.x + BOX.w / 2, y: ROW[id] + BOX.h + 2 }, to: { x: BOX.x + BOX.w / 2, y: ROW[STEPS[i + 1][0]] - 4 }, opacity: 0, role: 'neutral' } }] : []),
]);

export const scene = {
  id: 'depth-generation-deep',
  title: 'Generation and sampling · Deep dive: inside generate()',
  width: 960,
  height: 808,
  duration: 3,
  inputs: [
    { name: 'prompt', type: 'choice', label: 'Prompt idx (t characters)', default: 'long',
      options: PROMPTS.map(p => ({ id: p.id, label: `“${p.text}” (t = ${p.text.length})` })) },
    { name: 'topK', type: 'choice', label: 'top_k', default: `k${SAMPLE_K}`,
      options: TOP_KS.map(o => ({ id: o.id, label: o.k === null ? 'None (generate default)' : o.k === SAMPLE_K ? `${o.k} (sample default)` : String(o.k) })) },
    { name: 'temperature', type: 'choice', label: 'temperature', default: `t${String(SAMPLE_T).replace('.', '')}`,
      options: TEMPS.map(o => ({ id: o.id, label: o.T === 0 ? '0 (edge case)' : o.T === SAMPLE_T ? `${o.T} (sample default)` : o.T === GEN_T ? '1.0 (generate default)' : String(o.T) })) },
  ],
  exampleData: {
    logits: F.logits,
    columnNames: [...F.display],
    ones: F.logits.map(() => 1),
    // Temperature branch: 1/T, and whether a distribution exists at all. At
    // T = 0 the factor is never shown - everything computed from it is gated.
    invTById: byId(TEMPS, o => (o.T === 0 ? 1 : 1 / o.T)),
    validById: byId(TEMPS, o => o.T !== 0),
    shownById: byId(TEMPS, o => (o.T === 0 ? 0 : 1)),
    edgeById: byId(TEMPS, o => (o.T === 0 ? 1 : 0)),
    tLineById: byId(TEMPS, o => (o.T === 0 ? 'Edge case T = 0: ÷ 0 gives +∞, NaN and −∞ logits, so softmax is all NaN.'
      : o.T === GEN_T ? `T = ${GEN_T.toFixed(1)}: the logits pass through unchanged.`
        : `T = ${o.T}: every logit gap is multiplied by 1/T = ${1 / o.T}.`)),
    // top-k branch: which of the toy's finite logits survive (generator, by
    // the rule logits < v[:, [-1]] with k = min(top_k, V)).
    keepById: byId(TOP_KS, o => o.kept.map(Number)),
    keptIdxById: byId(TOP_KS, o => byId(TEMPS, t => (t.T === 0 ? [] : o.kept.flatMap((kept, i) => (kept ? [i] : []))))),
    cutMarksById: byId(TOP_KS, o => o.kept.map(kept => (kept ? '  ' : '−∞'))),
    anyCutById: byId(TOP_KS, o => (o.kept.every(Boolean) ? 0 : 1)),
    kLineById: byId(TOP_KS, o => (o.k === null ? `None: top-k is skipped; all V = ${V} logits stay.`
      : o.k >= N ? `k = min(${o.k}, V = ${V}) = ${Math.min(o.k, V)} ≥ ${N} finite: nothing is cut.`
        : `k = ${o.k} keeps ${names(o.kept)}; the rest become −∞, so p = 0.`)),
    // Recorded draw per branch; nothing to draw at T = 0.
    drawById: byId(TOP_KS, o => byId(TEMPS, t => [t.T === 0 ? '·' : o.draws[t.draw].picked])),
    drawLineById: byId(TOP_KS, o => byId(TEMPS, t => (t.T === 0 ? 'torch.multinomial raises RuntimeError: generate() crashes.'
      : `idx_next = “${o.draws[t.draw].picked}” (recorded, seed ${g.seed})${o.k === 1 ? ': top logit (ties all stay)' : ''}`))),
    // Crop branch.
    promptChipsById: byId(PROMPTS, p => glyphs(p.text)),
    windowIdxById: byId(PROMPTS, p => [...p.text].map((c, i) => i).slice(-BLOCK)),
    cropLineById: byId(PROMPTS, p => (p.text.length > BLOCK
      ? `t = ${p.text.length} > toy block_size = ${BLOCK} → t_c = ${BLOCK}; ${p.text.length - BLOCK} dropped (lit = idx_cond)`
      : `t = ${p.text.length} ≤ toy block_size = ${BLOCK} → t_c = t; no crop (lit = idx_cond)`)),
    drawXById: byId(PROMPTS, p => DATA_X + p.text.length * CHIP),
    newLengthById: byId(PROMPTS, p => p.text.length + 1),
    window: F.window,
    n: N,
    unseen: V - N,
    V,
  },
  derived: {
    invT: { op: 'pick', args: ['invTById', 'temperature'] },
    valid: { op: 'pick', args: ['validById', 'temperature'] },
    scaled: { op: 'scale', args: ['logits', 'invT'] },          // logits[:, -1, :] / temperature
    keep: { op: 'pick', args: ['keepById', 'topK'] },
    dropped: { op: 'sub', args: ['keep', 'ones'] },             // 0 kept, −1 cut
    penalty: { op: 'scale', args: ['dropped', CUT] },
    cutLogits: { op: 'add', args: ['scaled', 'penalty'] },      // logits[logits < v[:, [-1]]] = -inf
    softmaxed: { op: 'softmax', args: ['cutLogits'] },          // F.softmax
    probs: { op: 'gate', args: ['softmaxed', 'valid'] },
    scaledShown: { op: 'gate', args: ['scaled', 'valid'] },
    kept: { op: 'sum', args: ['keep'] },
    // Renormalisation over K: the uncut softmax, its sum over K, and p(z).
    pAll: { op: 'softmax', args: ['scaled'] },
    keptMass: { op: 'dot', args: ['pAll', 'keep'] },
    pAllTop: { op: 'pick', args: ['pAll', 0] },
    pTop: { op: 'pick', args: ['softmaxed', 0] },
    keptIdxRow: { op: 'pick', args: ['keptIdxById', 'topK'] },
    keptIdx: { op: 'pick', args: ['keptIdxRow', 'temperature'] },
    cutMarks: { op: 'pick', args: ['cutMarksById', 'topK'] },
    kLine: { op: 'pick', args: ['kLineById', 'topK'] },
    tLine: { op: 'pick', args: ['tLineById', 'temperature'] },
    edge: { op: 'pick', args: ['edgeById', 'temperature'] },
    shown: { op: 'pick', args: ['shownById', 'temperature'] },
    // The −∞ key shows only when something is cut and T allows logits.
    anyCut: { op: 'pick', args: ['anyCutById', 'topK'] },
    anyCutVec: { op: 'concat', args: ['anyCut'] },
    shownVec: { op: 'concat', args: ['shown'] },
    cutKeyVec: { op: 'elementwise', args: ['anyCutVec', 'shownVec'] },
    cutKey: { op: 'pick', args: ['cutKeyVec', 0] },
    // With nothing cut, K is all V and the denominator is the whole sum.
    noCutVec: { op: 'sub', args: ['shownVec', 'cutKeyVec'] },
    noCut: { op: 'pick', args: ['noCutVec', 0] },
    drawRow: { op: 'pick', args: ['drawById', 'topK'] },
    drawnChipList: { op: 'pick', args: ['drawRow', 'temperature'] },
    drawLineRow: { op: 'pick', args: ['drawLineById', 'topK'] },
    drawLine: { op: 'pick', args: ['drawLineRow', 'temperature'] },
    promptChips: { op: 'pick', args: ['promptChipsById', 'prompt'] },
    windowIdx: { op: 'pick', args: ['windowIdxById', 'prompt'] },
    cropLine: { op: 'pick', args: ['cropLineById', 'prompt'] },
    drawX: { op: 'pick', args: ['drawXById', 'prompt'] },
    newLength: { op: 'pick', args: ['newLengthById', 'prompt'] },
  },
  objects: [
    text('question', 'What does generate() do for each new token, and where can it surprise you?', 24, 32),
    note('prerequisites', 'Builds on: Guided; tensor shapes (B, t, V); the k-th largest value.', 24, 56),
    note('status', 'Calculated toy example: logits · Live calculation: ÷ T, top-k, softmax · Recorded toy run: draw · Source value: sizes', 24, 76),

    ...stepObjects,

    // 1 crop: the prompt, idx_cond lit.
    { id: 'idx', type: 'tokens', semanticId: 'idx', conceptId: CONCEPT,
      initialState: { x: DATA_X, y: ROW.crop, opacity: 0, role: 'neutral', tokens: { $derive: 'promptChips' },
        cellHighlight: { $derive: 'windowIdx' }, cellHighlightKind: 'highlight' } },
    note('crop-line', '{{cropLine}}', DATA_X, ROW.crop + 52),
    // 2 forward.
    note('forward-line', 'toy forward: counts after “{{window}}” give {{n}} finite logits; {{unseen}} unseen are −∞', DATA_X, ROW.forward + 21),
    // 3 ÷ T, with the top-k survivors ringed.
    { id: 'scaled', type: 'grid', semanticId: 'scaled-logits', conceptId: CONCEPT,
      initialState: { x: DATA_X, y: ROW.scale + 14, rows: 1, cols: N, cell: CELL, opacity: 0, role: 'neutral', matrixKind: 'derived',
        columnLabels: [...F.display], values: { $derive: 'scaledShown' }, cellHighlight: { $derive: 'keptIdx' }, cellHighlightKind: 'highlight' } },
    { id: 'cut-marks', type: 'tokens', semanticId: 'cut-marks', conceptId: CONCEPT,
      initialState: { x: DATA_X + MARK_SHIFT, y: ROW.scale + 14 + CELL + 2, opacity: { $derive: 'shown' }, role: 'neutral', tokenStyle: 'labels', tokens: { $derive: 'cutMarks' } } },
    note('cut-key', '−∞ = cut', DATA_X + N * CELL + 12, ROW.scale + 14 + CELL + 22, { opacity: { $derive: 'cutKey' } }),
    // 4 top-k.
    note('k-line', '{{kLine}}', DATA_X, ROW.topk + 46, { opacity: { $derive: 'shown' } }),
    // 5 softmax.
    { id: 'probs', type: 'bars', semanticId: 'probabilities', conceptId: CONCEPT,
      initialState: { x: DATA_X, y: ROW.softmax, h: BARS_H, cell: CELL, peak: 1, opacity: 0, role: 'output', distribution: true,
        labels: [...F.display], values: { $derive: 'probs' } } },
    note('kept-count', '{{kept}} of {{n}}', DATA_X + N * CELL + 12, ROW.softmax + BARS_H - 24, { opacity: { $derive: 'shown' } }),
    note('kept-count-2', 'drawable', DATA_X + N * CELL + 12, ROW.softmax + BARS_H - 6, { opacity: { $derive: 'shown' } }),
    // T = 0: say so where the numbers would be.
    text('no-logits', `T = 0: ${TO_INF} → +∞, ${TO_NAN} → NaN (0 ÷ 0), unseen → −∞`, DATA_X, ROW.scale + 14 + CELL + 22, { opacity: { $derive: 'edge' }, role: 'output' }),
    text('no-probs', 'softmax → NaN everywhere: nothing valid to draw', DATA_X + 16, ROW.softmax + BARS_H / 2, { opacity: { $derive: 'edge' }, role: 'output' }),
    // The equation's denominator, checked: p over K is the uncut p ÷ their sum over K.
    note('renorm', 'over K: p(z) = {{pAllTop}} (uncut) ÷ {{keptMass}} (uncut sum over K) ≈ {{pTop}}', DATA_X, ROW.softmax + BARS_H + 36, { opacity: { $derive: 'cutKey' } }),
    note('renorm-none', 'nothing cut: K = all V, the sum over K is 1, so p(z) stays {{pTop}}', DATA_X, ROW.softmax + BARS_H + 36, { opacity: { $derive: 'noCut' } }),
    // 6 draw, 7 cat.
    note('draw-line', '{{drawLine}}', DATA_X, ROW.draw + 21),
    { id: 'idx-next', type: 'tokens', semanticId: 'idx-grown', conceptId: CONCEPT,
      initialState: { x: DATA_X, y: ROW.cat, opacity: 0, role: 'neutral', tokens: { $derive: 'promptChips' } } },
    { id: 'appended', type: 'tokens', semanticId: 'appended', conceptId: CONCEPT,
      initialState: { x: { $derive: 'drawX' }, y: ROW.cat, opacity: { $derive: 'shown' }, role: 'output',
        tokens: { $derive: 'drawnChipList' }, cellHighlight: 0, cellHighlightKind: 'highlight' } },

    // The two equations the middle steps implement.
    { id: 'eq-softmax', type: 'equation', semanticId: 'softmax-equation', conceptId: CONCEPT,
      initialState: { text: 'p_i = \\dfrac{e^{z_i / T}}{\\sum_{j \\in K} e^{z_j / T}}', x: 24, y: EQ_Y, w: 440, h: 60, opacity: 0 } },
    { id: 'eq-topk', type: 'equation', semanticId: 'topk-equation', conceptId: CONCEPT,
      initialState: { text: 'K = \\{ j : z_j \\ge v_k \\},\\; k = \\min(\\mathrm{top\\_k}, V)', x: 480, y: EQ_Y, w: 456, h: 60, opacity: 0 } },

    note('eq-key', 'z: the last position’s logits · v_k: the k-th largest z (ties are kept) · p_i = 0 outside K · top_k None: K = all V', 24, EQ_Y + 74),

    // Edge cases and tradeoffs.
    text('t-line', '{{tLine}}', 24, EDGE_Y),
    note('no-greedy', 'generate() has no greedy branch: top_k = 1 is greedy unless the top logits tie.', 24, EDGE_Y + 20, { opacity: { $derive: 'edge' } }),
    note('tradeoff-k', `top_k = ${SAMPLE_K} keeps ${SAMPLE_K} of GPT-2's ${GPT2_V.toLocaleString('en-US')} tokens (${(100 * SAMPLE_K / GPT2_V).toFixed(1)}%) but all ${V} characters here.`, 24, EDGE_Y + 44),
    note('tradeoff-crop', `Tradeoff: no cache, so each token re-runs its whole window (≤ ${fx.architecture.block_size}): ${NEW_TOKENS} tokens from a ${START_LEN}-char start = ${RERUN.toLocaleString('en-US')} positions.`, 24, EDGE_Y + 64),
  ],
  timeline: [
    ...STEPS.flatMap(([id], i) => [
      { at: i * 0.3, action: 'appear', target: `step-${id}`, duration: 0.25 },
      ...(i < STEPS.length - 1 ? [{ at: i * 0.3 + 0.2, action: 'appear', target: `next-${id}`, duration: 0.15 }] : []),
    ]),
    { at: 0.1, action: 'appear', target: 'idx', duration: 0.3 },
    { at: 0.7, action: 'appear', target: 'scaled', duration: 0.3 },
    { at: 1.3, action: 'appear', target: 'probs', duration: 0.3 },
    { at: 1.9, action: 'appear', target: 'idx-next', duration: 0.3 },
    { at: 2.3, action: 'appear', target: 'eq-softmax', duration: 0.3 },
    { at: 2.5, action: 'appear', target: 'eq-topk', duration: 0.3 },
  ],
};

const REPRODUCE = 'python packages/web/src/nanogpt/depth/fixtures/gen_generation.py --check';
const S = g.sample;

// One code entry per pipeline step, in order, then the defaults and sizes.
export const sources = [
  code('model.py', 313, 314, '1 crop: “idx_cond = idx if idx.size(1) <= self.config.block_size else idx[:, -self.config.block_size:]” - (B, t) → (B, min(t, block_size)).'),
  code('model.py', 173, 173, 'Why the crop exists: the forward refuses longer input - “assert t <= self.config.block_size”.'),
  code('model.py', 315, 316, '2 forward: “logits, _ = self(idx_cond)” - no targets, so the inference branch runs.'),
  code('model.py', 189, 190, '2 forward, inference branch: “logits = self.lm_head(x[:, [-1], :]) # note: using list [-1] to preserve the time dim” - only the last position is projected: (B, 1, V).'),
  code('model.py', 317, 318, '3 last position ÷ T: “logits = logits[:, -1, :] / temperature” - (B, 1, V) → (B, V). T = 0 divides by zero: a positive logit becomes +∞, a 0 logit NaN (0 ÷ 0), −∞ stays −∞.'),
  code('model.py', 319, 322, '4 top-k: “v, _ = torch.topk(logits, min(top_k, logits.size(-1)))” then “logits[logits < v[:, [-1]]] = -float(\'Inf\')” - anything below the k-th largest becomes −∞; ties with it survive; k is capped at V.'),
  code('model.py', 323, 324, '5 softmax: “probs = F.softmax(logits, dim=-1)” - each row of (B, V) sums to 1; a −∞ logit gets p = 0.'),
  code('model.py', 325, 326, '6 draw: “idx_next = torch.multinomial(probs, num_samples=1)” - always a weighted random draw, (B, 1). At T = 0 probs is all NaN and this line raises RuntimeError (probability tensor contains either `inf`, `nan` or element < 0), with every top_k - checked with torch 2.14.0 on the toy\'s row.'),
  code('model.py', 327, 328, '7 append: “idx = torch.cat((idx, idx_next), dim=1)” - (B, t) → (B, t+1); the next iteration crops again.'),
  code('model.py', 306, 306, '“def generate(self, idx, max_new_tokens, temperature=1.0, top_k=None):” - the generate defaults on the card.'),
  code('sample.py', S.start.line, S.top_k.line, '“start = "\\n"” (one token), “max_new_tokens = 500”, “temperature = 0.8” and “top_k = 200” - the sample defaults on the card; one forward per new token.'),
  code('sample.py', 80, 81, '“x = (torch.tensor(start_ids, dtype=torch.long, device=device)[None, ...])” - the prompt as a (1, t) batch: B = 1.'),
  code('sample.py', 87, 87, '“y = model.generate(x, max_new_tokens, temperature=temperature, top_k=top_k)”'),
  code('config/train_shakespeare_char.py', 19, 19, '“block_size = 256 # context of up to 256 previous characters”'),
  code('model.py', 223, 223, '“config_args[\'vocab_size\'] = 50257 # always 50257 for GPT model checkpoints” - V when sampling from GPT-2.'),
  code('data/shakespeare_char/prepare.py', 24, 25, '“chars = sorted(list(set(data)))” and “vocab_size = len(chars)” - V = 65 for shakespeare_char.'),
  { ...calculation('Calculated toy example', `Counts and logits after “${F.window}”`,
    `gen_generation.py: how often each character followed “${F.window}” in Tiny Shakespeare's training split (${F.display.map((c, i) => `${c} ${F.counts[i]}`).join(', ')}) and logit = ln(count). The toy's block_size is ${BLOCK}: its forward reads the last ${BLOCK} characters; the ${V - N} characters never seen after them have logit −∞. The kept set for each top_k is computed there by generate()'s own rule. Not NanoGPT's transformer.`),
    reproduce: REPRODUCE },
  calculation('Live calculation', '÷ T, the top-k cut, softmax, the kept count and the renormalisation',
    `Computed on the card: scale(logits, 1/T); top-k adds −${CUT} to each cut logit (a finite stand-in for −∞: exp(−${CUT}) is exactly 0 in floating point, so a cut character gets p = 0); softmax; the kept count is a sum. The renormalisation check is the softmax without the cut, its dot product with the kept mask (the uncut p summed over K) and p(z) both ways; results are rounded to 3 decimals, hence ≈. At T = 0 nothing is computed: the cells and bars are gated blank, because torch gives +∞, NaN and −∞ logits and an all-NaN p there.`),
  { ...calculation('Recorded toy run', 'The draw for each (top_k, temperature) branch',
    `gen_generation.py: Python's random.choices with seed ${g.seed}, one draw from that branch's probabilities - the first random number of the seed, the same one the Overview's first step used. Not torch.multinomial and not live sampling.`),
    reproduce: REPRODUCE },
  { ...calculation('Source value', 'Defaults and sizes',
    `Parsed from the pinned files by gen_generation.py: generate() defaults temperature ${GEN_T}, top_k None; sample.py temperature ${SAMPLE_T}, top_k ${SAMPLE_K}, max_new_tokens ${NEW_TOKENS}, seed ${g.seed}; GPT-2 checkpoint vocab_size ${GPT2_V}. block_size ${fx.architecture.block_size} comes from the base fixture (config/train_shakespeare_char.py), V = ${V} from the dataset's characters as prepare.py counts them. The no-cache total ${RERUN.toLocaleString('en-US')} is the sum over the ${NEW_TOKENS} steps of min(${START_LEN} + i, ${fx.architecture.block_size}), the window each forward re-runs.`),
    reproduce: REPRODUCE },
  tinyShakespeare('The counts come from its training split; “First Citi” is its opening.'),
];

export const evidence = {
  card: 'depth-generation-deep',
  title: scene.title,
  learningQuestion: scene.objects[0].initialState.text,
  concept: 'One generate() iteration: crop idx to its last block_size tokens (the forward asserts t ≤ block_size), forward with no targets so only the last position is projected (B, 1, V), divide by T, optionally set every logit below the k-th largest (k = min(top_k, V)) to −∞, softmax, draw one index with torch.multinomial, and cat it on. Over K the kept p are the uncut p divided by their sum over K. T = 0 crashes generate(): ÷ 0 gives +∞, NaN and −∞ logits, softmax is all NaN and torch.multinomial raises RuntimeError; there is no greedy branch - top_k = 1 is greedy unless the top logits tie. sample.py\'s top_k = 200 is a no-op on the 65-character vocabulary.',
  sourceRevision: g.provenance.nanogpt,
  provenance: 'Code: model.py 313-328 (every step), 173, 189-190, 306, 223; sample.py 14-18, 80-81, 87; config/train_shakespeare_char.py 19; prepare.py 24-25. Calculated toy example: counts/logits after "iti" and the kept sets (gen_generation.py). Live calculation: scale, sub/scale/add for the −1000 cut, softmax, gate at T = 0, sum, and the uncut softmax dotted with the kept mask for the renormalisation. T = 0 behaviour checked with torch 2.14.0. Recorded toy run: one random.choices draw per branch. Source values: defaults and sizes parsed by the generator.',
  control: 'prompt (choice: "First Citi" t = 10 / "iti" t = 3), top_k (choice: None, 1, 3, 200), temperature (choice: 0, 0.8, 1.0); defaults = sample.py\'s settings (top_k 200, T 0.8) on the long prompt.',
  consequence: 'Prompt: the lit idx_cond window and the crop line change (dropped vs no crop) while every number downstream stays the same. top_k: the ringed survivors, the cut bars, the kept count, the renormalisation line (p(z) = uncut p(z) ÷ uncut mass of K; with nothing cut, K = all V and p(z) stays) and the recorded draw change; k = 200 and None change nothing here. temperature: the ÷ T row and bars reshape; T = 0 blanks them, says which logits become +∞, NaN and −∞, says softmax is all NaN and torch.multinomial raises RuntimeError, and shows the no-greedy note.',
  interactionPurpose: 'Trigger each branch and predict first: does a longer prompt change p (no - only the last block_size characters are read)? does top_k = 200 cut anything on V = 65 (no)? what does T = 0 do (it crashes; top_k = 1 is greedy unless the top logits tie)? And check the equation\'s denominator: at k = 3, T = 0.8, p(z) = 0.548 ÷ 0.905 ≈ 0.605.',
  task: 'Switch the prompt and explain why the bars do not move; set top_k = 3 and check with the renormalisation line that p(z) rose from 0.548 to 0.605 because the denominator sums K only; set T = 0, say why generate() crashes, and name the setting that gives greedy decoding instead.',
  capability: 'three choice inputs over record maps; nested pick; scale/sub/add/softmax/gate/sum derive ops; a derived −1000 cut as a finite −∞; gated grid and bars; derived token rows with derived highlight and x; derived opacity; two LaTeX equations; step boxes with arrows and shape annotations.',
  depth: 'Deep dive',
  prerequisites: 'Guided; tensor shapes (B, t, V); the k-th largest value.',
  ladderRole: 'Only this depth follows generate() step by step with tensor shapes and equations, checks the softmax equation\'s denominator over K against numbers, and lets the learner trigger its branches and edge cases (the crop, the top-k cap, the T = 0 crash) against the source.',
};

export const reviewStates = [
  { prompt: 'long', topK: `k${SAMPLE_K}`, temperature: 't08' },
  { prompt: 'long', topK: 'k3', temperature: 't08' },
  { prompt: 'long', topK: 'k1', temperature: 't1' },
  { prompt: 'short', topK: 'none', temperature: 't1' },
  { prompt: 'long', topK: `k${SAMPLE_K}`, temperature: 't0' },
];
