// Attention at Deep dive depth: CausalSelfAttention.forward as shapes,
// heads and branches, paged into four sub-cards (one idea each, one shared
// INTERACT row and input state - docs/features/learn-canvas-blocks.md
// "Sub-cards").
// 1/4 Shapes: the forward pass as a column of steps named after the source
// lines, each with its tensor shape; on the fused path the five steps that one
// scaled_dot_product_attention call replaces are dimmed, not removed.
// 2/4 Mask and att: one head's (T, T) slice of att for the same nine characters
// as the other two cards - three hand-set heads from gen_attention.py, picked
// by a head control - with a context-length slider whose T = 1 end is the edge
// case (one character, one weight) and which shows that growing T never
// changes earlier rows.
// 3/4 Memory and the fused path: the manual path's illustrative att cost in
// bytes (shakespeare_char sizes, 4 bytes an fp32 entry, per layer and over the
// 6 layers) and the implementation branch - the fused
// scaled_dot_product_attention NanoGPT uses when it is available (PyTorch >=
// 2.0), lit on the fused path and dimmed on the manual one.
// 4/4 The 1/sqrt(hs) what-if: one seeded random q against nine random keys at
// hs = 4, 16, 64 (the first of the generator's 2000 draws per hs), with and
// without the factor, on a 0-1 weight axis, the Monte Carlo statistics over all
// 2000 draws, and the softmax gradient p(1 - p) that saturation starves.
// Every number is a live calculation on generated or source values; code and
// provenance are the card's `sources`, one code entry per step.
import fx from '../../fixtures/nanogpt-fixtures.generated.js';
import att from '../fixtures/attention.generated.js';
import { code, calculation } from '../../sources.js';

const REPRODUCE = 'uv run --with tiktoken==0.14.0 python packages/web/src/nanogpt/depth/fixtures/gen_attention.py --check';
const TOKENS = att.context.tokens;
const T = att.T;
const LAST = T - 1;
const range = Array.from({ length: T }, (unused, i) => i);
const named = c => (c === '␣' ? 'sp' : c); // 'space' overflows a 30px column; c21 uses sp too
const prefixes = m => range.map(t => m.slice(0, t + 1));
const { batch_size: B, block_size: BLOCK, n_layer: NL, n_head: NH, n_embd: C, dropout: DROPOUT } = fx.architecture;
const FP32_BYTES = 4;
const SAT = att.saturation;

// The sub-cards. Every part is laid out from the top of the same coordinate
// space; the frame is sized once for the tallest (the step column, part 0).
const SHAPES = 0, MASK = 1, MEMORY = 2, SCALE = 3;
const PARTS = ['Shapes: split, view, transpose', 'The causal mask and att', 'fp32 memory and the fused path', 'The 1/√hs experiment'];
const on = (part, ...objects) => objects.map(object => ({ ...object, part }));

const COL = 24;
// Header: the question on line 1, the shared status on line 2, "Builds on" on
// line 3 of 1/4 only; content starts under the last header line.
const STATUS_Y = 56, BUILDS_Y = 78;
const TOP = 100, TOP_REST = 78; // 1/4, and the three sub-cards without "Builds on"
// 1/4: the step column.
const STEP_W = 340, STEP_H = 38, STEP_Y = 150, PITCH = 52;
const SHAPE_X = COL + STEP_W + 16;
const stepY = k => STEP_Y + k * PITCH;
// 2/4: the att grid on the left, its notes and output row on the right.
const GRID_X = 72, GRID_Y = 182, CELL = 36; // 36: "1.00" clears the 12px numeral floor
const RX = 420, STRIP_Y = GRID_Y + 118, STRIP_CELL = 42; // 42: "-0.82" clears the 12px numeral floor
// 3/4: the memory lines, the two path notes, then the fused call.
const MEM_Y = 110;
const FUSED_Y = MEM_Y + 182, FUSED_W = 580, FUSED_H = 52;
// 4/4: three bar panels on a 0-1 axis.
const SAT_Y = 148, SAT_PITCH = 312, SAT_CELL = 26, SAT_H = 200;

// The manual path, one step per source line; `fused: true` marks the five
// that scaled_dot_product_attention replaces.
const STEPS = [
  { id: 'split', label: 'c_attn(x).split(C, dim=2)', shape: '(B, T, C) → q, k, v' },
  { id: 'heads', label: 'view · transpose(1, 2)', shape: '(B, nh, T, hs)' },
  { id: 'scores', label: 'q @ k.transpose(-2, -1)', shape: 'att (B, nh, T, T)', fused: true },
  { id: 'scale', label: { $derive: 'scaleLabel' }, shape: '{{factorNote}}', fused: true },
  { id: 'mask', label: 'masked_fill(bias == 0, -inf)', shape: `bias[:,:,:T,:T], T ≤ ${BLOCK}`, fused: true },
  { id: 'softmax', label: 'softmax(dim=-1) · dropout', shape: 'rows sum to 1 in eval', fused: true },
  { id: 'mix', label: 'att @ v', shape: 'y (B, nh, T, hs)', fused: true },
  { id: 'merge', label: 'transpose · view · c_proj', shape: '(B, T, C)' },
];

const FUSED_SHAPE = 'q, k, v (B, nh, T, hs) → y (B, nh, T, hs) in one call';
const FUSED_SCALE = { on: 'scale not passed: SDPA’s default is 1/√hs', off: 'What-if: scale=1.0 turns the default 1/√hs off' };
const EQ_SCALED = '\\mathrm{att}=\\mathrm{softmax}\\big(QK^{\\top}/\\sqrt{hs}+M\\big),\\ M_{ij}=-\\infty\\ (j>i),\\quad y=\\mathrm{att}\\,V';
const EQ_UNSCALED = '\\mathrm{att}=\\mathrm{softmax}\\big(QK^{\\top}+M\\big)\\ \\text{(no }1/\\sqrt{hs}\\text{)},\\quad y=\\mathrm{att}\\,V';

export const scene = {
  id: 'depth-attention-deep',
  title: 'Attention · Deep dive: heads, shapes and the 1/√hs factor',
  width: 960,
  height: 600,
  duration: 2,
  inputs: [
    { name: 'part', type: 'index', label: 'Deep dive', of: 'parts', default: 0, presentation: 'pager' },
    { name: 'head', type: 'index', label: 'Head', of: 'headLabels', default: 0, presentation: 'picker' },
    { name: 'Tidx', type: 'index', label: 'Context length T', of: 'Tlabels', default: LAST, presentation: 'slider' },
    { name: 'path', type: 'choice', label: 'Path', default: 'manual',
      options: [{ id: 'manual', label: 'manual (flash False)' }, { id: 'fused', label: 'fused SDPA (NanoGPT default when available)' }] },
    { name: 'scaleOn', type: 'bool', label: 'Scale by 1/√hs (off = What-if)', default: true },
  ],
  exampleData: {
    parts: PARTS,
    headLabels: att.heads.map((h, i) => `head ${i}: ${h.label}`),
    // Short on purpose: the renderer fits the frame to the evaluated labels,
    // and the longer "…: (T, T), row = reader, each rounded" widened it past
    // the card, shrinking the whole card to ~0.83 and differently per head.
    attLabels: att.heads.map((h, i) => `att[0, ${i}]: ${h.label}, each rounded`),
    Tlabels: range.map(t => `T = ${t + 1}`),
    Tsizes: range.map(t => t + 1),
    names: prefixes(TOKENS.map(named)),
    Qp: att.heads.map(h => prefixes(h.q)),
    Kp: att.heads.map(h => prefixes(h.k)),
    Vp: att.heads.map(h => prefixes(h.v)),
    causal: true,
    onWord: 'on', offWord: 'off', scaledWord: 'scaled', unscaledWord: 'unscaled',
    toyFactor: 1 / Math.sqrt(att.hs),
    scaleLabels: { on: '× 1/√hs', off: '× 1   (What-if)' },
    factorNotes: { on: `= × ${1 / Math.sqrt(att.hs)} at hs = ${att.hs}`, off: 'scores left at full size' },
    eqs: { on: EQ_SCALED, off: EQ_UNSCALED },
    fusedOnly: { manual: 0, fused: 1 },
    // What the chosen path does not run stays on screen, dimmed.
    manualOpacity: { manual: 1, fused: 0.25 },
    fusedOpacity: { manual: 0.25, fused: 1 },
    pathNotes: { manual: 'manual: att is built whole in every layer and kept for backward', fused: 'fused: flash / memory-efficient kernels never hold the whole att;' },
    pathNotes2: { manual: 'fused SDPA need not materialize this full matrix.', fused: 'the math version (non-CUDA, or inputs they reject) still builds it.' },
    fusedLabels: { on: 'scaled_dot_product_attention(is_causal=True)', off: 'scaled_dot_product_attention(is_causal=True, scale=1.0)' },
    fusedScales: FUSED_SCALE,
    firstNotes: range.map(t => (t === 0 ? 'T = 1: att = [1], so y is exactly its own v.'
      : 'Row 0: weight 1 on itself - nothing comes before it.')),
    // Source values (config/train_shakespeare_char.py over train.py).
    Bv: [B], nhv: [NH], Tv: [BLOCK],
    // The what-if: one seeded q and nine keys per hs, all nine visible.
    satQ: SAT.q.map(q => [q]),
    satK: SAT.k,
    satFactors: SAT.hs.map(hs => 1 / Math.sqrt(hs)),
    ones: range.map(() => 1),
    sat: { std: SAT.scoreStd, meanMax: SAT.meanMax },
  },
  derived: {
    onKey: { op: 'choose', args: ['scaleOn', 'onWord', 'offWord'] },
    onScaled: { op: 'choose', args: ['scaleOn', 'scaledWord', 'unscaledWord'] },
    satStd: { op: 'pick', args: ['sat.std', 'onScaled'] },
    satMean: { op: 'pick', args: ['sat.meanMax', 'onScaled'] },
    // The selected head at context length T (the first T characters).
    Qh: { op: 'pick', args: ['Qp', 'head'] },
    Kh: { op: 'pick', args: ['Kp', 'head'] },
    Vh: { op: 'pick', args: ['Vp', 'head'] },
    Q: { op: 'pick', args: ['Qh', 'Tidx'] },
    K: { op: 'pick', args: ['Kh', 'Tidx'] },
    V: { op: 'pick', args: ['Vh', 'Tidx'] },
    Tn: { op: 'pick', args: ['Tsizes', 'Tidx'] },
    labelsT: { op: 'pick', args: ['names', 'Tidx'] },
    attLabel: { op: 'pick', args: ['attLabels', 'head'] },
    factor: { op: 'choose', args: ['scaleOn', 'toyFactor', 1] },
    raw: { op: 'matmul', args: ['Q', 'K'] },                    // q @ k.transpose(-2, -1)
    scaled: { op: 'scale', args: ['raw', 'factor'] },          // * (1.0 / math.sqrt(k.size(-1)))
    masked: { op: 'causal_mask', args: ['scaled', 'causal'] }, // masked_fill(bias == 0, -inf)
    attT: { op: 'softmax', args: ['masked'] },                 // F.softmax(att, dim=-1)
    wLast: { op: 'pick', args: ['attT', 'Tidx'] },
    yLast: { op: 'weighted_sum', args: ['wLast', 'V'] },       // y = att @ v, newest row
    vFirst: { op: 'pick', args: ['V', 0] },
    scaleLabel: { op: 'pick', args: ['scaleLabels', 'onKey'] },
    factorNote: { op: 'pick', args: ['factorNotes', 'onKey'] },
    eq: { op: 'pick', args: ['eqs', 'onKey'] },
    fusedShown: { op: 'pick', args: ['fusedOnly', 'path'] },
    manualLit: { op: 'pick', args: ['manualOpacity', 'path'] },
    fusedLit: { op: 'pick', args: ['fusedOpacity', 'path'] },
    pathNote: { op: 'pick', args: ['pathNotes', 'path'] },
    pathNote2: { op: 'pick', args: ['pathNotes2', 'path'] },
    fusedLabel: { op: 'pick', args: ['fusedLabels', 'onKey'] },
    fusedScale: { op: 'pick', args: ['fusedScales', 'onKey'] },
    firstNote: { op: 'pick', args: ['firstNotes', 'Tidx'] },
    // The manual path's att tensor at shakespeare_char sizes: B * nh * T * T.
    bnh: { op: 'dot', args: ['Bv', 'nhv'] },
    tt: { op: 'dot', args: ['Tv', 'Tv'] },
    bnhVec: { op: 'concat', args: ['bnh'] },
    ttVec: { op: 'concat', args: ['tt'] },
    attEntries: { op: 'dot', args: ['bnhVec', 'ttVec'] },
    // ... in bytes: 4 an fp32 entry, per layer and over n_layer layers.
    entriesVec: { op: 'concat', args: ['attEntries'] },
    attBytes: { op: 'scale', args: ['entriesVec', FP32_BYTES] },
    attMB: { op: 'scale', args: ['attBytes', 1e-6] },
    allBytes: { op: 'scale', args: ['attBytes', NL] },
    allMB: { op: 'scale', args: ['allBytes', 1e-6] },
    // The what-if rows: q . k for nine random keys, x 1/sqrt(hs) or x 1,
    // softmax; the largest weight and the largest softmax slope w(1 - w).
    ...Object.fromEntries(SAT.hs.flatMap((hs, k) => [
      [`s${k}m`, { op: 'matmul', args: [`satQ.${k}`, `satK.${k}`] }],
      [`s${k}`, { op: 'pick', args: [`s${k}m`, 0] }],
      [`f${k}`, { op: 'choose', args: ['scaleOn', `satFactors.${k}`, 1] }],
      [`z${k}`, { op: 'scale', args: [`s${k}`, `f${k}`] }],
      [`w${k}`, { op: 'softmax', args: [`z${k}`] }],
      [`nz${k}`, { op: 'scale', args: [`z${k}`, -1] }],
      [`top${k}`, { op: 'argmin', args: [`nz${k}`] }],
      [`max${k}`, { op: 'pick', args: [`w${k}`, `top${k}`] }],
      [`rest${k}`, { op: 'sub', args: ['ones', `w${k}`] }],
      [`g${k}`, { op: 'elementwise', args: [`w${k}`, `rest${k}`] }],
      [`ng${k}`, { op: 'scale', args: [`g${k}`, -1] }],
      [`gTop${k}`, { op: 'argmin', args: [`ng${k}`] }],
      [`gMax${k}`, { op: 'pick', args: [`g${k}`, `gTop${k}`] }],
      [`std${k}`, { op: 'pick', args: [`satStd`, k] }],
      [`mean${k}`, { op: 'pick', args: [`satMean`, k] }],
    ])),
  },
  objects: [
    // 1/4 Shapes: the forward pass, one step per source line.
    ...on(SHAPES,
      { id: 'question', type: 'text', semanticId: 'question', conceptId: 'attention',
        initialState: { text: 'How does CausalSelfAttention run every head at once?', x: COL, y: 30 } },
      { id: 'prerequisites', type: 'text', semanticId: 'prerequisites', conceptId: 'attention',
        initialState: { text: 'Builds on: Guided; several heads, matrix shapes, batched matrix multiply', x: COL, y: BUILDS_Y, typography: 'annotation' } },
    ),
    // The one line every sub-card shares: which kinds of evidence the card uses.
    { id: 'status', type: 'text', semanticId: 'status', conceptId: 'attention',
      initialState: { text: 'Calculated toy example · Live calculation · Source value · What-if', x: COL, y: STATUS_Y, typography: 'annotation' } },
    ...on(SHAPES,
      { id: 'eq-sizes', type: 'equation', semanticId: 'sizes', conceptId: 'shapes',
        initialState: { text: `(B, T, C, n_h, hs):\\ \\text{toy }(1, {{Tn}}, ${att.nHead * att.hs}, ${att.nHead}, ${att.hs}),\\ \\ \\text{shakespeare\\_char }(${B}, ${BLOCK}, ${C}, ${NH}, ${C / NH})`,
          x: COL, y: TOP, w: 820, h: 24 } },
      ...STEPS.flatMap((step, k) => [
        { id: `step-${step.id}`, type: 'box', semanticId: `step-${step.id}`, conceptId: 'forward',
          initialState: { label: step.label, x: COL, y: stepY(k), w: STEP_W, h: STEP_H, role: step.fused ? 'neutral' : 'code',
            ...(step.fused ? { opacity: { $derive: 'manualLit' } } : {}) } },
        { id: `shape-${step.id}`, type: 'text', semanticId: `shape-${step.id}`, conceptId: 'shapes',
          initialState: { text: step.shape, x: SHAPE_X, y: stepY(k) + 24, typography: 'annotation',
            ...(step.fused ? { opacity: { $derive: 'manualLit' } } : {}) } },
      ]),
      // The five middle steps are Guided's numbered steps (1 score, 2 scale and
      // mask, 3 softmax, 4 mix), run on whole tensors; beside them, above the
      // fused note.
      { id: 'guided-note', type: 'text', semanticId: 'guided-steps', conceptId: 'forward',
        initialState: { text: 'these five: Guided’s steps 1–4,', x: 580, y: stepY(4) - 20, typography: 'annotation' } },
      { id: 'guided-note-2', type: 'text', semanticId: 'guided-steps-2', conceptId: 'forward',
        initialState: { text: 'for every reader of every head at once', x: 580, y: stepY(4) + 2, typography: 'annotation' } },
      // Why five steps are dimmed on the fused path, beside them (the call is 3/4).
      { id: 'fused-note', type: 'text', semanticId: 'fused-note', conceptId: 'forward',
        initialState: { text: 'fused SDPA: one call replaces these five steps', x: 580, y: stepY(4) + 24,
          typography: 'annotation', opacity: { $derive: 'fusedShown' } } },
    ),

    // 2/4 Mask and att: the equation, one head's (T, T) slice of att, and the
    // newest row's output. Not `distribution: true`: its nudged rounding
    // showed two equal weights as .05 and .04 (Guided rounds each cell on its
    // own too).
    ...on(MASK,
      { id: 'question-mask', type: 'text', semanticId: 'question-mask', conceptId: 'causal-mask',
        initialState: { text: 'What does one head’s att look like under the causal mask?', x: COL, y: 30 } },
      { id: 'eq-attention', type: 'equation', semanticId: 'eq-attention', conceptId: 'attention',
        initialState: { text: '{{eq}}', x: COL, y: TOP_REST, w: 900, h: 34 } },
      { id: 'att', type: 'grid', semanticId: 'attention-matrix', conceptId: 'heads',
        initialState: { label: { $derive: 'attLabel' }, x: GRID_X, y: GRID_Y, rows: { $derive: 'Tn' }, cols: { $derive: 'Tn' }, cell: CELL,
          role: 'output', matrixKind: 'derived', heat: true, valueScale: 'fixed',
          rowLabels: { $derive: 'labelsT' }, columnLabels: { $derive: 'labelsT' }, values: { $derive: 'attT' }, opacity: { $derive: 'manualLit' } } },
      { id: 'first-note', type: 'text', semanticId: 'first-row', conceptId: 'causal-mask',
        initialState: { text: '{{firstNote}}', x: RX, y: GRID_Y + 18, typography: 'annotation' } },
      { id: 'rows-note', type: 'text', semanticId: 'rows-stable', conceptId: 'causal-mask',
        initialState: { text: 'Growing T adds a row and a column; old rows stay.', x: RX, y: GRID_Y + 40, typography: 'annotation' } },
      { id: 'dropout-note', type: 'text', semanticId: 'dropout-note', conceptId: 'dropout',
        initialState: { text: `Training only: dropout ${DROPOUT} zeroes weights; rows may not sum to 1.`, x: RX, y: GRID_Y + 62, typography: 'annotation' } },
      // ponytail: only the newest row's y - the derive seam has no row slice for a
      // (T, hs) y grid that follows T; add one if a card needs the whole y.
      { id: 'y-last', type: 'strip', semanticId: 'y-newest', conceptId: 'heads',
        initialState: { label: 'y, newest row (hs)', x: RX, y: STRIP_Y, cell: STRIP_CELL, role: 'output', values: { $derive: 'yLast' } } },
      { id: 'v-first', type: 'strip', semanticId: 'v-first', conceptId: 'heads',
        initialState: { label: 'v of row 0', x: RX + 200, y: STRIP_Y, cell: STRIP_CELL, role: 'input', values: { $derive: 'vFirst' } } },
      // Why att is dimmed on the fused path, on the sub-card that dims it: the
      // same two lines 3/4 shows under the memory count, fused state only.
      { id: 'att-path-note', type: 'text', semanticId: 'att-path-note', conceptId: 'memory',
        initialState: { text: '{{pathNote}}', x: RX, y: STRIP_Y + STRIP_CELL + 36, typography: 'annotation', opacity: { $derive: 'fusedShown' } } },
      { id: 'att-path-note-2', type: 'text', semanticId: 'att-path-note-2', conceptId: 'memory',
        initialState: { text: '{{pathNote2}}', x: RX, y: STRIP_Y + STRIP_CELL + 56, typography: 'annotation', opacity: { $derive: 'fusedShown' } } },
    ),

    // 3/4 Memory and the fused path: the tradeoff the branch makes, at
    // shakespeare_char sizes - the manual path's cost, not what the fused
    // default stores - and the one call that replaces the five manual steps.
    ...on(MEMORY,
      { id: 'question-memory', type: 'text', semanticId: 'question-memory', conceptId: 'memory',
        initialState: { text: 'What does storing att cost in fp32, and when does the fused path skip it?', x: COL, y: 30 } },
      { id: 'mem-title', type: 'text', semanticId: 'mem-title', conceptId: 'memory',
        initialState: { text: 'Manual attention, fp32 illustrative memory:', x: COL, y: MEM_Y - 16, typography: 'caption' } },
      { id: 'eq-memory', type: 'equation', semanticId: 'eq-memory', conceptId: 'memory',
        initialState: { text: `B\\cdot n_h\\cdot T^2=${B}\\cdot ${NH}\\cdot ${BLOCK}^2={{attEntries}}`, x: COL, y: MEM_Y, w: 470, h: 30 } },
      { id: 'eq-bytes', type: 'equation', semanticId: 'eq-bytes', conceptId: 'memory',
        initialState: { text: `\\times ${FP32_BYTES}\\text{ B (fp32)}={{attMB.0}}\\text{ MB per layer}`, x: COL, y: MEM_Y + 30, w: 470, h: 26 } },
      { id: 'eq-layers', type: 'equation', semanticId: 'eq-layers', conceptId: 'memory',
        initialState: { text: `\\times ${NL}\\text{ layers}={{allMB.0}}\\text{ MB}`, x: COL, y: MEM_Y + 56, w: 470, h: 26 } },
      // What one entry of B·n_h·T² is: a weight in Guided's row.
      { id: 'mem-note', type: 'text', semanticId: 'mem-note', conceptId: 'memory',
        initialState: { text: 'one weight per (reader, key): Guided’s row, for T readers × n_h heads × B sequences', x: COL, y: MEM_Y + 106, typography: 'annotation' } },
      { id: 'path-note', type: 'text', semanticId: 'path-note', conceptId: 'memory',
        initialState: { text: '{{pathNote}}', x: COL, y: MEM_Y + 136, typography: 'annotation' } },
      { id: 'path-note-2', type: 'text', semanticId: 'path-note-2', conceptId: 'memory',
        initialState: { text: '{{pathNote2}}', x: COL, y: MEM_Y + 156, typography: 'annotation' } },
      { id: 'fused-box', type: 'box', semanticId: 'fused-kernel', conceptId: 'forward',
        initialState: { label: { $derive: 'fusedLabel' }, x: COL, y: FUSED_Y, w: FUSED_W, h: FUSED_H, role: 'code',
          opacity: { $derive: 'fusedLit' } } },
      { id: 'fused-shape', type: 'text', semanticId: 'fused-shape', conceptId: 'shapes',
        initialState: { text: FUSED_SHAPE, x: COL, y: FUSED_Y + FUSED_H + 24, typography: 'annotation', opacity: { $derive: 'fusedLit' } } },
      // SDPA's own 1/sqrt(E) default (E = hs): the what-if would pass scale=1.0.
      { id: 'fused-scale', type: 'text', semanticId: 'fused-scale', conceptId: 'scaling',
        initialState: { text: '{{fusedScale}}', x: COL, y: FUSED_Y + FUSED_H + 44, typography: 'annotation', opacity: { $derive: 'fusedLit' } } },
    ),

    // 4/4 The what-if: why 1/sqrt(hs).
    ...on(SCALE,
      { id: 'question-scale', type: 'text', semanticId: 'question-scale', conceptId: 'scaling',
        initialState: { text: 'Why the 1/√hs: what does softmax do to the scores as hs grows without it?', x: COL, y: 30 } },
      { id: 'sat-title', type: 'text', semanticId: 'sat-title', conceptId: 'scaling',
        initialState: { text: 'One random q vs nine random keys, all visible (the first of the 2000 draws):', x: COL, y: TOP_REST + 16, typography: 'caption' } },
      ...SAT.hs.flatMap((hs, k) => [
        { id: `sat-bars-${k}`, type: 'bars', semanticId: `sat-bars-${k}`, conceptId: 'scaling',
          initialState: { label: `hs = ${hs}`, x: COL + k * SAT_PITCH, y: SAT_Y, h: SAT_H, cell: SAT_CELL, peak: 1, opacity: 0,
            role: 'output', distribution: true, values: { $derive: `w${k}` } } },
        // The fixed axis: bars top out at h - 4 (AnimatedScene), weight 1; the
        // baseline is weight 0. Both ends are labelled.
        { id: `sat-top-${k}`, type: 'line', semanticId: `sat-top-${k}`, conceptId: 'scaling',
          initialState: { from: { x: COL + k * SAT_PITCH, y: SAT_Y + 4 }, to: { x: COL + k * SAT_PITCH + T * SAT_CELL, y: SAT_Y + 4 }, role: 'neutral', opacity: 0.5 } },
        { id: `sat-base-${k}`, type: 'line', semanticId: `sat-base-${k}`, conceptId: 'scaling',
          initialState: { from: { x: COL + k * SAT_PITCH, y: SAT_Y + SAT_H }, to: { x: COL + k * SAT_PITCH + T * SAT_CELL, y: SAT_Y + SAT_H }, role: 'neutral' } },
        { id: `sat-one-${k}`, type: 'text', semanticId: `sat-one-${k}`, conceptId: 'scaling',
          initialState: { text: '1', x: COL + k * SAT_PITCH + T * SAT_CELL + 6, y: SAT_Y + 8, typography: 'annotation' } },
        { id: `sat-zero-${k}`, type: 'text', semanticId: `sat-zero-${k}`, conceptId: 'scaling',
          initialState: { text: '0', x: COL + k * SAT_PITCH + T * SAT_CELL + 6, y: SAT_Y + SAT_H + 4, typography: 'annotation' } },
        { id: `sat-read-${k}`, type: 'equation', semanticId: `sat-read-${k}`, conceptId: 'scaling',
          initialState: { text: `w_{\\max}={{max${k}}},\\ \\ g_{\\max}={{gMax${k}}}`, x: COL + k * SAT_PITCH, y: SAT_Y + SAT_H + 8, w: 300, h: 26 } },
      ]),
      { id: 'eq-variance', type: 'equation', semanticId: 'eq-variance', conceptId: 'scaling',
        initialState: { text: `\\text{${SAT.samples} draws, }hs=${SAT.hs.join(',')}:\\ \\mathrm{std}(\\text{score})={{std0}},{{std1}},{{std2}};\\ \\ \\overline{w_{\\max}}={{mean0}},{{mean1}},{{mean2}}`, x: COL, y: SAT_Y + SAT_H + 52, w: 912, h: 30 } },
      // One diagonal softmax derivative, claimed for that weight only. ∂ and →
      // are KaTeX's own \partial and \to, typed as glyphs so the layout lint's
      // per-source-character width estimate fits the 912px box.
      { id: 'eq-gradient', type: 'equation', semanticId: 'eq-gradient', conceptId: 'scaling',
        initialState: { text: 'g_i=∂w_i/∂s_i=w_i(1-w_i)→0\\text{ near 0 or 1: that probability becomes locally less sensitive to its own score}', x: COL, y: SAT_Y + SAT_H + 88, w: 912, h: 30 } },
    ),
  ],
  timeline: SAT.hs.map((hs, k) => ({ at: 0.3 + k * 0.4, action: 'appear', target: `sat-bars-${k}`, duration: 0.4 })),
};

const HSIZE = C / NH;
export const sources = [
  code('model.py', 53, 53, 'The input’s shape: “B, T, C = x.size() # batch size, sequence length, embedding dimensionality (n_embd)”.'),
  code('model.py', 56, 56, 'Step c_attn(x).split: one linear layer makes q, k and v for all heads at once, cut along the last dimension: “q, k, v  = self.c_attn(x).split(self.n_embd, dim=2)”.'),
  code('model.py', 35, 37, 'The two learned projections: “self.c_attn = nn.Linear(config.n_embd, 3 * config.n_embd, bias=config.bias)” (C → 3C) and “self.c_proj = nn.Linear(config.n_embd, config.n_embd, bias=config.bias)” (C → C).'),
  code('model.py', 57, 59, 'Step view · transpose: each of q, k, v becomes n_head heads of size hs = C // n_head, with the head moved in front of T: “q = q.view(B, T, self.n_head, C // self.n_head).transpose(1, 2) # (B, nh, T, hs)”.'),
  code('model.py', 45, 45, 'Which branch runs: “self.flash = hasattr(torch.nn.functional, \'scaled_dot_product_attention\')” - True on PyTorch 2.0 or later, so the fused call is NanoGPT’s default when that function is available.'),
  code('model.py', 62, 64, 'The fused branch - one call replaces the five manual steps, with the causal mask as a flag and dropout only in training: “y = torch.nn.functional.scaled_dot_product_attention(q, k, v, attn_mask=None, dropout_p=self.dropout if self.training else 0, is_causal=True)”.'),
  code('model.py', 67, 67, 'Steps q @ kᵀ and × 1/√hs, one line: “att = (q @ k.transpose(-2, -1)) * (1.0 / math.sqrt(k.size(-1)))” - (B, nh, T, hs) × (B, nh, hs, T) → (B, nh, T, T); k.size(-1) is hs.'),
  code('model.py', 49, 50, 'The mask the manual branch reads, registered only when flash is unavailable: a lower-triangular block_size × block_size buffer, “self.register_buffer("bias", torch.tril(torch.ones(config.block_size, config.block_size))”.'),
  code('model.py', 68, 68, 'Step masked_fill: “att = att.masked_fill(self.bias[:,:,:T,:T] == 0, float(\'-inf\'))” - the buffer is sliced to the current T, so T can be at most block_size.'),
  code('model.py', 173, 173, 'Why T ≤ block_size: “assert t <= self.config.block_size, f"Cannot forward sequence of length {t}, block size is only {self.config.block_size}"”.'),
  code('model.py', 69, 70, 'Step softmax · dropout: “att = F.softmax(att, dim=-1)” makes every row sum to 1; “att = self.attn_dropout(att)” then zeroes weights at random in training only (nn.Dropout scales the survivors by 1/(1 − p)), so a training-time row need not sum to 1.'),
  code('model.py', 71, 71, 'Step att @ v: “y = att @ v # (B, nh, T, T) x (B, nh, T, hs) -> (B, nh, T, hs)”.'),
  code('model.py', 72, 72, 'Step transpose · view: “y = y.transpose(1, 2).contiguous().view(B, T, C) # re-assemble all head outputs side by side”.'),
  code('model.py', 75, 75, 'Step c_proj: “y = self.resid_dropout(self.c_proj(y))” - mixes the heads’ C numbers, back to (B, T, C).'),
  code('config/train_shakespeare_char.py', 18, 19, `Source values for B and T: “batch_size = ${B}” and “block_size = ${BLOCK} # context of up to ${BLOCK} previous characters”.`),
  code('config/train_shakespeare_char.py', 22, 25, `Source values for the layer count, nh, C and the dropout rate: “n_layer = ${NL}”, “n_head = ${NH}”, “n_embd = ${C}”, “dropout = ${DROPOUT}” - so hs = ${C} / ${NH} = ${HSIZE}, and the memory line multiplies by ${NL} layers.`),
  code('train.py', 112, 112, 'Why 4 bytes an entry on the memory line: “ctx = nullcontext() if device_type == \'cpu\' else torch.amp.autocast(device_type=device_type, dtype=ptdtype)” - on CPU nothing is autocast, so att is float32 (fp32, 4 bytes). On CUDA, autocast runs q @ kᵀ and masked_fill in train.py’s dtype (line 73: bfloat16, or float16 where bfloat16 is unsupported), 2 bytes an entry, but softmax is on autocast’s float32 list, so the post-softmax att kept for backward, and the dropout output, are fp32 (4 bytes) there as well. In training the 100.663 MB per layer is a lower bound: the dropout mask and the half-precision copy of att that att @ v keeps come on top.'),
  { kind: 'paper', title: 'Attention Is All You Need (Vaswani et al., 2017) - why divide by √d_k', arxiv: '1706.03762', page: 4,
    note: 'Section 3.2.1 and its footnote: if the components of q and k are independent with mean 0 and variance 1, q·k has mean 0 and variance d_k, and large dot products push the softmax into regions with extremely small gradients - hence the 1/√d_k (NanoGPT’s hs).' },
  { kind: 'paper', title: 'FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness (Dao et al., 2022)', arxiv: '2205.14135',
    note: 'The kind of kernel the fused call can dispatch to: exact attention computed tile by tile, without writing the full (T, T) attention matrix to GPU memory - the memory side of the manual-versus-fused tradeoff.' },
  { kind: 'doc', title: 'torch.nn.functional.scaled_dot_product_attention (PyTorch documentation)', url: 'https://pytorch.org/docs/stable/generated/torch.nn.functional.scaled_dot_product_attention.html',
    note: 'Documents is_causal (the lower-triangular mask), dropout_p and “scale (optional float, keyword-only): Scaling factor applied prior to softmax. If None, the default value is set to 1/√E” (E = hs; NanoGPT passes no scale, the What-if would pass scale=1.0). Three implementations: FlashAttention-2, Memory-Efficient Attention and a PyTorch C++ implementation matching the manual math; “The function may call optimized kernels for improved performance when using the CUDA backend. For all other backends, the PyTorch implementation will be used.” Only that math version builds the whole (T, T) att.' },
  { ...calculation('Calculated toy example', 'Three hand-set heads over “Before we”',
    `gen_attention.py, n_head = ${att.nHead}, hs = ${att.hs}, T = ${T}: head 0 “${att.heads[0].label}” (${att.heads[0].rule}), head 1 “${att.heads[1].label}” (${att.heads[1].rule}), head 2 “${att.heads[2].label}” (${att.heads[2].rule}); GAIN = ${att.gain}; head h’s v is the letter code rolled by h. Not a trained model.`),
  reproduce: REPRODUCE },
  { ...calculation('Calculated toy example', 'Random q and keys at hs = 4, 16, 64, and the 2000-draw statistics',
    `gen_attention.py saturation(): per hs, random.Random(${att.provenance.seed} + hs) makes ${SAT.samples} draws of one q and ${T} keys with N(0, 1) components; the rows on the card are the first draw, rounded to 2 decimals. Over all ${SAT.samples} draws: the standard deviation of the scores with and without ÷√hs, the mean largest weight, and the mean largest w(1 − w).`),
  reproduce: REPRODUCE },
  calculation('Source value', 'B, T, C, nh, n_layer and dropout for shakespeare_char',
    'fx.architecture - config/train_shakespeare_char.py resolved over train.py defaults by generate_fixtures.py; hs = C / nh.'),
  { ...calculation('What-if', 'Scores without 1/√hs',
    'The same rows with the factor set to 1: not a NanoGPT setting - it shows what the factor prevents. The 2000-draw statistics for this case come from the same generator run.'),
  reproduce: REPRODUCE },
  calculation('Live calculation', 'att, y, the what-if rows and the memory count',
    'Computed on the card: for the chosen head and T, matmul (q @ kᵀ), scale by 0.5 or 1, causal_mask, softmax, and weighted_sum for the newest row’s y; for each hs, matmul, scale by 1/√hs or 1, softmax, the largest weight (argmin of the negated scores) and the largest w(1 − w) (sub, elementwise); B·nh·T² with dot, then × 4 bytes (fp32), × 10⁻⁶ for MB and × n_layer = 6 with scale. Rounded to 3 decimals.'),
];

export const evidence = {
  card: 'depth-attention-deep',
  title: scene.title,
  // The card's question; each sub-card asks its own part of it first.
  learningQuestion: 'How does CausalSelfAttention run every head at once, and why the 1/√hs?',
  concept: 'CausalSelfAttention.forward: c_attn makes q, k, v (B, T, C), view/transpose splits them into (B, nh, T, hs), q @ kᵀ × 1/√hs gives att (B, nh, T, T), masked_fill with the sliced tril buffer sets later positions to −∞, softmax (then dropout in training), att @ v gives (B, nh, T, hs), and transpose/view/c_proj return (B, T, C). With PyTorch 2.0+ the fused scaled_dot_product_attention(is_causal=True) replaces the five middle steps; its flash and memory-efficient kernels (CUDA) never hold the whole att, while its math version (every other backend, or inputs the kernels reject) still builds it; it applies its own default scale 1/√hs. Illustrative fp32 memory for the manual att at shakespeare_char sizes: 25,165,824 entries, 100.663 MB per layer, 603.98 MB over 6 layers - fused SDPA need not materialize that full matrix. The 1/√hs keeps the score spread near 1 whatever hs; without it softmax saturates toward one-hot as hs grows, and w(1 − w), the slope of each weight to its own score, goes to 0 near 0 or 1: that probability becomes locally less sensitive to its own score.',
  sourceRevision: `${fx.provenance.nanogpt.repo} @ ${fx.provenance.nanogpt.commit}`,
  provenance: 'code: model.py:35-37, :45, :49-50, :53, :56, :57-59, :62-64, :67, :68, :69-70, :71, :72, :75, :173, train.py:112 and config/train_shakespeare_char.py:18-19, :22-25 at @3adf61e; source values: fx.architecture; calculated toy example: attention.generated.js heads (3 hand-set heads) and saturation (first seeded draw per hs + 2000-draw statistics) from gen_attention.py; live calculation: matmul, scale, causal_mask, softmax, weighted_sum, argmin, sub, elementwise, dot, concat, scale for bytes/MB/layers; papers arXiv 1706.03762 §3.2.1 footnote and 2205.14135; PyTorch SDPA documentation (scale default, backends).',
  control: '"Deep dive" pager in the card header, four sub-cards sharing every control below: 1/4 shapes (split, view, transpose), 2/4 the causal mask and att, 3/4 fp32 memory and the fused path, 4/4 the 1/√hs experiment. "Head" picker (head 0 previous character, head 1 same letter, head 2 first character); "Context length T" slider 1-9; "Path" choice manual (flash False) / fused SDPA (NanoGPT default when available); "Scale by 1/√hs" toggle (off = What-if).',
  consequence: 'Paging changes which idea is on screen, never the inputs or the frame: a control set on one sub-card is already applied on the others. Head changes the (T, T) pattern (2/4): a band just below the diagonal, same-letter spots, a first column. T grows the grid by a row and a column without changing earlier rows; T = 1 leaves att = [1] and y equal to its own v. Path dims the five steps one fused call replaces (1/4, with a note saying so), dims att (2/4, with the fused note beside it: the flash and memory-efficient kernels never hold it whole; the math version still does), and on 3/4 switches the note under the manual path’s illustrative 100.663 MB fp32 per layer and lights the fused scaled_dot_product_attention call, dimmed on the manual path. The scale toggle rewrites the × step (1/4), the fused call (3/4: scale=1.0), the equation and the toy att, which sharpens (2/4), and makes the random rows (4/4) at hs = 16 and 64 nearly one-hot: the measured score spread goes from 1, 1, 1 to 2, 4, 8, the mean largest weight from about a third to near 0.9, and the largest w(1 − w) at hs = 64 toward 0.',
  interactionPurpose: 'Connect the equation to the exact tensor shapes and source lines, compare implementation branches that compute the same thing, trigger the one-character edge case, and quantify why the 1/√hs exists.',
  task: 'Set T = 1 and explain the single weight; switch to the fused path and say which of the 100.663 MB per layer is no longer stored, and when it still is; turn the scaling off and read how the hs = 64 row and its gradient change.',
  capability: 'sub-card pager (index input presented as a pager; each object bound to one part, the status line shared; one frame sized for the tallest part); head picker, T slider, path choice, bool what-if; derived grid shape (rows/cols/labels follow T); live per-head masked softmax on prefixes; step boxes and the fused-call box with input-bound opacity for the branch (the path not taken stays dimmed); equations with live values (memory in bytes); fused-call label and scale note picked by the toggle; three bar rows for hs = 4, 16, 64 from seeded draws on a labelled 0-1 axis; generator statistics picked by the toggle.',
  depth: 'Deep dive',
  prerequisites: 'Guided (one row of scores → weights); several heads; matrix shapes; batched matrix multiply.',
  ladderRole: 'Ties the mechanism to exact equations, tensor shapes, source branches (manual vs fused), an edge case (T = 1) and a quantified tradeoff (1/√hs vs saturation, memory of storing att in MB) that the other depths do not touch.',
};

// Six at most (the board's cap), so: every sub-card at its default, the fused
// path where it changes most (the call lit on 3/4; att dimmed with its note on
// 2/4, at head 2), and the what-if beside its baseline on 4/4.
// Then head 1, T = 1, 1/4 fused, 3/4 both paths and the what-if on 1/4 and 3/4.
export const reviewStates = [
  { part: SHAPES, head: 0, Tidx: LAST, path: 'manual', scaleOn: true },
  { part: MASK, head: 0, Tidx: LAST, path: 'manual', scaleOn: true },
  { part: MASK, head: 2, Tidx: LAST, path: 'fused', scaleOn: true },
  { part: MEMORY, head: 0, Tidx: LAST, path: 'fused', scaleOn: true },
  { part: SCALE, head: 0, Tidx: LAST, path: 'manual', scaleOn: true },
  { part: SCALE, head: 0, Tidx: LAST, path: 'manual', scaleOn: false },
  // Three per sub-card now that paged cards may take them (depth/board.test.mjs).
  { part: MASK, head: 1, Tidx: LAST, path: 'manual', scaleOn: true },
  { part: MASK, head: 0, Tidx: 0, path: 'manual', scaleOn: true },
  { part: SHAPES, head: 0, Tidx: LAST, path: 'fused', scaleOn: true },
  { part: MEMORY, head: 0, Tidx: LAST, path: 'manual', scaleOn: true },
  { part: SHAPES, head: 0, Tidx: LAST, path: 'manual', scaleOn: false },
  { part: MEMORY, head: 0, Tidx: LAST, path: 'fused', scaleOn: false },
];

// Stable sub-card ids, in pager order (exampleData.parts).
export const partIds = ['shapes', 'causal-mask', 'memory', 'scaling'];

// Cross-depth transitions (docs/nanogpt-depth-ladder.md). The card relies on
// several heads (c13); 1/4 (x (B, T, C) in and out) and 3/4 ('per layer',
// '× 6 layers') also rely on the Block this runs inside, n_layer times
// (Architecture Deep 2/3); c11 draws 2/4's mask as the tril table; c12 is
// 4/4's simpler form (its boundary leaves the why of 1/√hs to this card).
export const transitions = [
  { relation: 'prerequisite', target_card: 'c13-multi-head' },
  { relation: 'prerequisite', target_card: 'depth-architecture-deep', target_part: 'one-block', from_part: 'shapes' },
  { relation: 'prerequisite', target_card: 'depth-architecture-deep', target_part: 'one-block', from_part: 'memory' },
  { relation: 'related', target_card: 'c11-causal-mask', from_part: 'causal-mask' },
  { relation: 'simplifies_to', target_card: 'c12-score-scaling', from_part: 'scaling' },
];
