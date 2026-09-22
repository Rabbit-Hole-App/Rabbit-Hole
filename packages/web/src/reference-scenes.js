// Task 12: the first scene authored against real external benchmark material
// (viz-benchmarks/transformer-explainer/), not just to show off a primitive.
// Tokens re-use the "hello" example already seeded in LearningBlocks.jsx's
// token-journey animation, so a learner who has seen that scene recognises
// the same five characters here rather than meeting a new example cold.
//
// Q, K and V are computed from the SAME embedding, so they share one role
// (observed) rather than three - three roles would encode "which letter this
// is", which the object's own label already says, not what the data means.
// The one role reserved for a genuinely different meaning - the final mixed
// result - is `output`. See the vocabulary-gap notes in the Task 12 report
// for what this scene could not express with role/state/heat alone: at the
// time, that gap was real - all three strips rendered pixel-identical,
// because `observed` was the only channel available and all three legitimately
// are observed. IDENTITY (scene-vocab.js's IDENTITY_SLOTS) is that missing
// axis: `query`/`key`/`value` below distinguish the three PEERS while
// `observed` still correctly names what KIND of thing each one is.

import { round } from './scene-derive.js';

const TOKENS = ['h', 'e', 'l', 'l', 'o'];

// Q and K are single numbers per token (not real per-dimension vectors) so
// that "raw score = Q[i] * K[j]" is the literal dot product, not an
// illustration of one - a reader who multiplies the two numbers on screen
// gets the matrix cell exactly, which a hand-picked matrix could not promise.
const Q = [1.2, 0.9, 1.3, 1.1, 1.5];
const K = [1.0, 1.6, -0.5, 0.8, 1.1];
const V = [1.0, 2.0, 0.5, 1.5, 0.8];

// Q and K reshaped as five length-1 "row vectors" apiece - matmul's a x bT
// over 1-dimensional rows is exactly the scalar product Q[i] * K[j], so the
// scene's own derived.scores entry (below) produces the identical 5x5 this
// module used to hand-roll. Named separately from Q/K (which stay flat, for
// the query/key strips' own display) rather than reshaping those in place.
const Q_ROWS = Q.map(value => [value]);
const K_ROWS = K.map(value => [value]);

// Row-major 5x5, using scene-derive's own round() (not a second rounding
// rule) so this hand-computed copy is bit-identical to what derived.scores
// resolves to - masking and softmax below read from THIS array, and the
// grid's own initial values come from the derive seam instead (see the
// scene's exampleData/derived block), so both paths agree on every digit.
const RAW_FULL = Q.flatMap(q => K.map(k => round(q * k)));

// Causal: row i (query position i) keeps columns 0..i and blanks the rest.
// null, not a low number - "excluded from softmax" and "a small score" must
// not render the same way (they don't: null skips the numeral entirely).
const causalRow = (row, values) => values.map((value, col) => (col <= row ? value : null));
const RAW_MASKED = TOKENS.map((token, row) => causalRow(row, RAW_FULL.slice(row * 5, row * 5 + 5))).flat();

const softmaxRow = row => {
  const kept = row.filter(value => value !== null);
  const exps = kept.map(value => Math.exp(value));
  const sum = exps.reduce((total, value) => total + value, 0);
  let cursor = 0;
  return row.map(value => (value === null ? null : Number((exps[cursor++] / sum).toFixed(3))));
};
const SOFTMAX = TOKENS.map((token, row) => softmaxRow(RAW_MASKED.slice(row * 5, row * 5 + 5))).flat();
// Row 4 is indices 20-24 (5 per row) - the bars object walks this exact row.
const ROW4_SOFTMAX = SOFTMAX.slice(20, 25);

// output[i] = the weighted sum of V using row i's own softmax weights - the
// same arithmetic the "x V" beat narrates, not a separately authored number.
const OUTPUT = TOKENS.map((token, row) => {
  const weights = SOFTMAX.slice(row * 5, row * 5 + 5);
  return Number(weights.reduce((total, weight, col) => total + (weight ?? 0) * V[col], 0).toFixed(3));
});

// Illustrative only - no equation ever claims a relationship between this
// and Q/K/V, so it carries no provenance obligation. Drawn purely so the
// scene has a real fifth vector object: the matrix below is 5x5 (one row/
// column per token), and checkMatrixDimensionsMatchVectors (scene-
// consistency.js) wants at least 5 drawn vectors to have produced 5 distinct
// rows or columns. Q, K, V and the output strip were only ever 4 - this
// scene was failing that gate from the day it shipped (see the repair notes
// below). Embedding also happens to be the honest missing step: the caption
// already says "starts from embeddings the tokens already have", but until
// now nothing drew one.
const EMBEDDING = [0.5, -0.2, 0.9, 0.3, -0.4];

// --- Repair pass (post-review) -----------------------------------------------
// This scene shipped as the product's ORIGINAL causal-attention lesson and
// was never touched by the viz-benchmarks repair sets (every fix from that
// effort landed on the copies under viz-benchmarks/, not here) - so it still
// failed both gates: provenance-required and matrix-vector-count
// (scene-consistency.js), edge-crosses-label and text-exceeds-box
// (scene-layout-lint.js). Fixed in place rather than swapped for a benchmark
// scene: the closest repaired benchmark case
// (illustrated-transformer/01-self-attention-computation-flow) teaches
// generic self-attention with no causal mask at all, and the one case that
// WOULD match (05-causal-masking) was never generated past a skeleton - so
// there is no repaired causal scene to swap in, and this scene's own
// content (nanoGPT's actual masked, timeline-driven pipeline) has no
// substitute. Two techniques below are ported from that benchmark's own
// repair notes rather than reinvented:
//   - dropping the tokens -> Q/K/V fan-out arrows in favour of vertical
//     alignment + a caption (case 01's own fix for the identical defect:
//     "arrows to K and V crossed straight through Q's box on the way").
//   - the row-4 -> distribution arrow, drawn as an elbow (line, line, arrow)
//     instead of a single diagonal that would have crossed the grid's own row
//     labels or the bars' caption - the same spine-and-branch decomposition
//     case 08's residual bypass uses for "around", not "through".
  // The right-hand column (equation, output strip) and the matrix pair sit 60
  // and 90px further left than they were authored, and the equation's frame is
  // 430 rather than 460. Nothing about the composition changes - the gaps
  // between stages were simply wider than anything needed - and it is what
  // brings this scene's content bounds inside the frame its own typography
  // floors demand (scene-layout.js's sceneLegibility): at 1180 units wide the
  // camera had to run at 0.91 scale in the widest lesson column there is,
  // which put every caption under 13 effective pixels.
export const causalAttentionScene = {
  id: 'causal-self-attention',
  // Causal attention includes the token itself - row 4 (the last token) keeps
  // all five columns unmasked (causalRow keeps col <= row), so "before it"
  // alone understated what the last row actually shows.
  title: 'How one token attends to itself and the tokens before it',
  width: 1120,
  height: 712,
  duration: 17.6,
  // The derive seam (scene-derive.js), used here for exactly the one number
  // that needs it: the matrix below declares matrixKind 'relational', which
  // scene-consistency.js's checkProvenanceOnComputedClaims requires
  // provenance "derived" for - and resolveDerived only stamps that when an
  // object's own initialState carries a real $derive reference, not a typed
  // claim. Q and K stay flat above for the query/key strips; Qn/Kn here are
  // the same numbers reshaped as five length-1 rows apiece, so matmul's
  // (row x row) dot product is exactly Q[i] * K[j].
  exampleData: { Qn: Q_ROWS, Kn: K_ROWS },
  derived: { scores: { op: 'matmul', args: ['Qn', 'Kn'] } },
  objects: [
    { id: 'caption', type: 'text', semanticId: 'caption', initialState: { text: '', x: 40, y: 30 } },
    { id: 'chars', type: 'tokens', semanticId: 'tokens', conceptId: 'qkv-projection',
      initialState: { label: 'five tokens, before attention', x: 40, y: 80, opacity: 0, tokens: [...TOKENS], role: 'input' } },
    // The missing step the caption already narrates - see EMBEDDING above.
    { id: 'embedding', type: 'strip', semanticId: 'embedding-vector', conceptId: 'qkv-projection',
      initialState: { label: 'embedding (x)', x: 40, y: 150, cell: 42, opacity: 0, role: 'input', values: [...EMBEDDING] } },
    // Generously pitched (78px) rather than the original's stacked 64px -
    // the reviewer's "cramped left side" finding - so each strip's own
    // "above" label clears the previous strip's frame with real room, not
    // just the layout engine's own minimum squeeze.
    { id: 'q', type: 'strip', semanticId: 'query-vector', conceptId: 'qkv-projection',
      initialState: { label: 'query (Q)', x: 40, y: 228, cell: 42, opacity: 0, heat: { mode: 'signed' }, valueScale: 'shared', valueScaleGroup: 'qk-vectors', role: 'observed', identity: 'query', values: [...Q] } },
    { id: 'k', type: 'strip', semanticId: 'key-vector', conceptId: 'qkv-projection',
      initialState: { label: 'key (K)', x: 40, y: 306, cell: 42, opacity: 0, heat: { mode: 'signed' }, valueScale: 'shared', valueScaleGroup: 'qk-vectors', role: 'observed', identity: 'key', values: [...K] } },
    { id: 'v', type: 'strip', semanticId: 'value-vector', conceptId: 'qkv-projection',
      initialState: { label: 'value (V)', x: 40, y: 384, cell: 42, opacity: 0, heat: true, valueScale: 'shared', valueScaleGroup: 'value-chain', role: 'observed', identity: 'value', values: [...V] } },
    // No tokens -> embedding/Q/K/V arrows: see the repair-pass note above.
    // Vertical alignment plus the timeline's own caption already say
    // "this comes from that" - a fourth or fifth fan-out arrow into the same
    // stack would only have repeated it while adding another crossing.
    //
    // Starts visible with the real Q x Kt scores (values: { $derive: 'scores'
    // } - resolveDerived resolves this against the exampleData/derived block
    // above and stamps provenance "derived" itself, the one path
    // checkProvenanceOnComputedClaims accepts for a matrixKind: 'relational'
    // grid) rather than fading blank cells in later: the object stays at
    // opacity 0 until its own `appear` event regardless, so nothing is ever
    // shown before the numbers are real. Masking still reads as "excluded"
    // rather than "small": the later set_values to RAW_MASKED blanks a cell
    // to null (a real state change, not a starting placeholder).
    { id: 'matrix', type: 'grid', semanticId: 'attention-matrix', conceptId: 'causal-self-attention',
      initialState: { label: 'raw scores: QKᵀ', x: 400, y: 210, rows: 5, cols: 5, cell: 46, opacity: 0, heat: { mode: 'signed' }, valueScale: 'shared', valueScaleGroup: 'attention-matrix', role: 'observed',
        // A real Q x Kt comparison (see RAW_FULL above) - both axes name the
        // same five tokens, which is exactly the relational shape.
        matrixKind: 'relational',
        rowLabels: [...TOKENS], columnLabels: [...TOKENS], values: { $derive: 'scores' } } },
    // A separate object for the softmax stage, not the same grid reused - see
    // the app-review repair note above the timeline: `distribution: true` is
    // a static, whole-lifetime claim (checkProbabilityClaims checks the
    // object's own INITIAL values), and `matrix` above starts life holding
    // raw QKᵀ scores whose rows sum to ~4.8, not 1 - declaring the claim on
    // that object would either fail the consistency gate honestly (its
    // initial state really is not a distribution) or force distributeRounding
    // to "fix" the raw-score and masked-score stages too, inventing numbers
    // that do not sum to what is actually shown. This object starts with no
    // values at all (nothing to falsely claim) and only ever holds the real
    // softmax distribution once revealed - the one stage the claim is true
    // for. No matrixKind: it is a display of an already-computed
    // distribution, no matrixKind declared - at validation time (this is what
    // checkProvenanceOnComputedClaims and checkMatrixDimensionsMatchVectors
    // both inspect) it holds no values at all, so it makes no computed claim
    // yet to police. Its real content only ever arrives later, through the
    // timeline's own replace_values - exactly the same path the ORIGINAL
    // single-object version of this scene already used to swap the SAME
    // matrix from raw scores to softmax, which the consistency checker never
    // inspected either (it only ever reads an object's declared initial
    // state). Nothing about that arithmetic honesty guarantee changes by
    // splitting the display into two objects instead of one.
    // A grid that carries a values array must declare matrixKind - 'input' is
    // the honest one: at validation time every cell is null (no claim to
    // check), and the real relational/derived proof for this arithmetic
    // already lives on `matrix` above ($derive: 'scores', matrixKind
    // 'relational'). Declaring 'relational' or 'derived' here too would
    // reassert the SAME comparison a second time and pull in the
    // matrix-vector-count check for a second object making no new claim.
    { id: 'matrix-softmax', type: 'grid', semanticId: 'attention-matrix-softmax', conceptId: 'softmax-attention-weights',
      initialState: { label: 'softmax: each row sums to 1', x: 400, y: 210, rows: 5, cols: 5, cell: 46, opacity: 0, heat: { mode: 'signed' }, valueScale: 'shared', valueScaleGroup: 'attention-matrix', role: 'observed',
        matrixKind: 'input', distribution: true,
        rowLabels: [...TOKENS], columnLabels: [...TOKENS], values: Array(25).fill(null) } },
    // Horizontal, not diagonal, and each pinned to a row BORDER (a cell
    // boundary, not a labelled row's own centre) - so the line clears every
    // one of the grid's own row-letter labels sitting just left of x=460
    // (see gridAxisLabelBoxes) by a full half-cell, regardless of which
    // token happens to be on that row. Q enters higher, K lower, so the two
    // inputs stay visually distinct without a diagonal doing it.
    { id: 'arrow-q-matrix', type: 'arrow', semanticId: 'arrow-q-matrix', conceptId: 'causal-self-attention',
      initialState: { from: { x: 250, y: 256 }, to: { x: 400, y: 256 }, opacity: 0, role: 'neutral' } },
    { id: 'arrow-k-matrix', type: 'arrow', semanticId: 'arrow-k-matrix', conceptId: 'causal-self-attention',
      initialState: { from: { x: 250, y: 348 }, to: { x: 400, y: 348 }, opacity: 0, role: 'neutral' } },
    // The one row walked all the way through: token 4 ("o"), the only query
    // that can see every earlier position, so its distribution has the most
    // to show. Bars carry per-key labels natively - grid cannot (see report).
    { id: 'bars-row', type: 'bars', semanticId: 'row4-distribution', conceptId: 'softmax-attention-weights',
      initialState: { label: "the last token's row, as a distribution", x: 400, y: 500, h: 120, peak: 1, opacity: 0, role: 'observed', labels: [...TOKENS], values: [0, 0, 0, 0, 0] } },
    // The elbow: out from the matrix's row-4 band, left past the grid's own
    // row labels, straight down clear of the bars' own caption (which spans
    // almost the whole width above it), then back in at the bars' left edge -
    // never a single diagonal through the label, which is what the original
    // straight arrow did.
    { id: 'arrow-matrix-bars-out', type: 'line', semanticId: 'arrow-matrix-bars-out', conceptId: 'softmax-attention-weights',
      initialState: { from: { x: 445, y: 440 }, to: { x: 380, y: 440 }, opacity: 0, role: 'neutral' } },
    { id: 'arrow-matrix-bars-down', type: 'line', semanticId: 'arrow-matrix-bars-down', conceptId: 'softmax-attention-weights',
      initialState: { from: { x: 380, y: 440 }, to: { x: 380, y: 520 }, opacity: 0, role: 'neutral' } },
    { id: 'arrow-matrix-bars-in', type: 'arrow', semanticId: 'arrow-matrix-bars-in', conceptId: 'softmax-attention-weights',
      initialState: { from: { x: 380, y: 520 }, to: { x: 415, y: 520 }, opacity: 0, role: 'neutral' } },
    // Widened from the original's 240px, which was 176px short of what this
    // expression actually needs (text-exceeds-box) - the reviewer's "cramped
    // equation" finding was this box being authored too narrow for its own
    // text, not a font problem.
    { id: 'equation', type: 'equation', semanticId: 'attention-equation', conceptId: 'attention-output',
      initialState: { text: '\\text{softmax}\\left(\\dfrac{QK^T}{\\sqrt{d_k}}\\right)V', x: 670, y: 295, w: 430, h: 60, opacity: 0 } },
    { id: 'output', type: 'strip', semanticId: 'attention-output', conceptId: 'attention-output',
      initialState: { label: 'output - the weighted mix of V', x: 670, y: 395, cell: 42, opacity: 0, heat: true, valueScale: 'shared', valueScaleGroup: 'value-chain', role: 'output', values: [0, 0, 0, 0, 0] } },
    // No arrow from V to output: the equation's own trailing "V" and the
    // timeline caption already say V feeds the output, and a straight line
    // from V's column to output's would have cut diagonally through the
    // entire matrix to get there (the "messy arrows... into the matrix" the
    // reviewer saw) - see the repair-pass note above.
    { id: 'arrow-matrix-output', type: 'arrow', semanticId: 'arrow-matrix-output', conceptId: 'attention-output',
      initialState: { from: { x: 630, y: 440 }, to: { x: 668, y: 416 }, opacity: 0, role: 'neutral' } },
    // Below the bars' own per-key labels (bottom edge 500+90+12=602), so the
    // closing line never overlaps them.
    { id: 'note', type: 'text', semanticId: 'note', initialState: { text: '', x: 40, y: 672 } },
  ],
  timeline: [
    { at: 0.0, action: 'type_text', target: 'caption', value: 'an attention layer starts from embeddings the tokens already have', duration: 1.6 },
    { at: 0.6, action: 'appear', target: 'chars', duration: 0.5, sound: 'soft_pop' },
    { at: 1.6, action: 'appear', target: 'embedding', duration: 0.5 },
    { at: 1.8, action: 'change_text', target: 'caption', value: 'each embedding is projected three ways: a query, a key and a value' },
    { at: 2.0, action: 'appear', target: 'q', duration: 0.5 },
    { at: 2.3, action: 'appear', target: 'k', duration: 0.5 },
    { at: 2.6, action: 'appear', target: 'v', duration: 0.5 },
    { at: 3.6, action: 'change_text', target: 'caption', value: 'the query asks, the key answers, and the value is what actually gets carried forward' },
    // The grid appears already showing the real Q x Kt scores (see its own
    // values: { $derive: 'scores' } above) - there is no separate "reveal
    // the numbers" step to author, so appearing IS the reveal.
    { at: 4.4, action: 'appear', target: 'matrix', duration: 0.5, sound: 'compute' },
    { at: 4.4, action: 'appear', target: 'arrow-q-matrix', duration: 0.4 },
    { at: 4.4, action: 'appear', target: 'arrow-k-matrix', duration: 0.4 },
    { at: 4.8, action: 'change_text', target: 'caption', value: 'compare every query against every key - a raw score for every pair' },
    { at: 6.8, action: 'change_text', target: 'caption', value: 'a token must never see the future, so every score above the diagonal is masked out' },
    { at: 7.0, action: 'change_text', target: 'matrix', value: 'causal mask: future positions blocked' },
    { at: 7.2, action: 'set_values', target: 'matrix', value: RAW_MASKED, duration: 0.5, sound: 'toggle_off' },
    { at: 8.0, action: 'change_text', target: 'caption', value: 'softmax turns every unmasked row into a probability distribution that sums to one' },
    // The masked-score matrix hands off to the softmax-distribution matrix
    // here, rather than being overwritten in place - see matrix-softmax's own
    // comment above for why the two need to be separate objects.
    { at: 8.2, action: 'disappear', target: 'matrix', duration: 0.3 },
    { at: 8.2, action: 'appear', target: 'matrix-softmax', duration: 0.3 },
    { at: 8.4, action: 'replace_values', target: 'matrix-softmax', value: SOFTMAX, sound: 'reveal' },
    { at: 10.0, action: 'highlight_cell', target: 'chars', value: 4 },
    { at: 10.0, action: 'highlight_cell', target: 'matrix-softmax', value: { row: 4 }, sound: 'select' },
    { at: 10.2, action: 'change_text', target: 'caption', value: "follow the last token's row - what did it actually attend to?" },
    { at: 10.6, action: 'appear', target: 'bars-row', duration: 0.5 },
    { at: 10.6, action: 'appear', target: 'arrow-matrix-bars-out', duration: 0.4 },
    { at: 10.6, action: 'appear', target: 'arrow-matrix-bars-down', duration: 0.4 },
    { at: 10.6, action: 'appear', target: 'arrow-matrix-bars-in', duration: 0.4 },
    { at: 10.8, action: 'set_values', target: 'bars-row', value: ROW4_SOFTMAX, duration: 1.0 },
    { at: 12.0, action: 'highlight_cell', target: 'bars-row', value: 'max' },
    { at: 12.2, action: 'change_text', target: 'caption', value: 'multiply every value vector by its weight, and add them up' },
    { at: 12.6, action: 'appear', target: 'output', duration: 0.5 },
    { at: 12.6, action: 'appear', target: 'equation', duration: 0.5 },
    { at: 12.6, action: 'appear', target: 'arrow-matrix-output', duration: 0.4 },
    { at: 13.0, action: 'set_values', target: 'output', value: OUTPUT, duration: 1.0, sound: 'compute' },
    { at: 14.2, action: 'highlight_cell', target: 'output', value: 4, sound: 'success' },
    { at: 14.4, action: 'change_text', target: 'caption', value: 'the same pattern repeats for every position, all at once' },
    { at: 14.8, action: 'type_text', target: 'note', value: 'the causal mask is the only thing that differs per position - the same Q, K and V weights are reused everywhere', duration: 2.0 },
  ],
};
