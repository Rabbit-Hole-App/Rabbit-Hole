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

const TOKENS = ['h', 'e', 'l', 'l', 'o'];

// Q and K are single numbers per token (not real per-dimension vectors) so
// that "raw score = Q[i] * K[j]" is the literal dot product, not an
// illustration of one - a reader who multiplies the two numbers on screen
// gets the matrix cell exactly, which a hand-picked matrix could not promise.
const Q = [1.2, 0.9, 1.3, 1.1, 1.5];
const K = [1.0, 1.6, -0.5, 0.8, 1.1];
const V = [1.0, 2.0, 0.5, 1.5, 0.8];

// Row-major 5x5. Computed, not authored by hand, so masking and softmax
// below stay provably consistent with Q and K above.
const RAW_FULL = Q.flatMap(q => K.map(k => Number((q * k).toFixed(2))));

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

export const causalAttentionScene = {
  id: 'causal-self-attention',
  title: 'How one token attends to the tokens before it',
  width: 920,
  height: 600,
  duration: 17.2,
  objects: [
    { id: 'caption', type: 'text', semanticId: 'caption', initialState: { text: '', x: 40, y: 30 } },
    { id: 'chars', type: 'tokens', semanticId: 'tokens', conceptId: 'qkv-projection',
      initialState: { label: 'five tokens, before attention', x: 40, y: 74, opacity: 0, tokens: [...TOKENS], role: 'input' } },
    { id: 'q', type: 'strip', semanticId: 'query-vector', conceptId: 'qkv-projection',
      initialState: { label: 'query (Q)', x: 40, y: 150, cell: 42, opacity: 0, heat: { mode: 'signed' }, role: 'observed', identity: 'query', values: [...Q] } },
    { id: 'k', type: 'strip', semanticId: 'key-vector', conceptId: 'qkv-projection',
      initialState: { label: 'key (K)', x: 40, y: 214, cell: 42, opacity: 0, heat: { mode: 'signed' }, role: 'observed', identity: 'key', values: [...K] } },
    { id: 'v', type: 'strip', semanticId: 'value-vector', conceptId: 'qkv-projection',
      initialState: { label: 'value (V)', x: 40, y: 278, cell: 42, opacity: 0, heat: true, role: 'observed', identity: 'value', values: [...V] } },
    { id: 'arrow-tok-q', type: 'arrow', semanticId: 'arrow-tok-q', conceptId: 'qkv-projection',
      initialState: { from: { x: 160, y: 106 }, to: { x: 145, y: 150 }, opacity: 0, role: 'neutral' } },
    { id: 'arrow-tok-k', type: 'arrow', semanticId: 'arrow-tok-k', conceptId: 'qkv-projection',
      initialState: { from: { x: 160, y: 106 }, to: { x: 145, y: 214 }, opacity: 0, role: 'neutral' } },
    { id: 'arrow-tok-v', type: 'arrow', semanticId: 'arrow-tok-v', conceptId: 'qkv-projection',
      initialState: { from: { x: 160, y: 106 }, to: { x: 145, y: 278 }, opacity: 0, role: 'neutral' } },
    // Every cell starts null: "not yet computed" and "causally excluded" are
    // the same visual (a blank cell), which is exactly the ambiguity noted in
    // the Task 12 report - the timeline caption is what disambiguates them.
    { id: 'matrix', type: 'grid', semanticId: 'attention-matrix', conceptId: 'causal-self-attention',
      initialState: { label: 'attention scores - not yet computed', x: 420, y: 150, rows: 5, cols: 5, cell: 46, opacity: 0, heat: { mode: 'signed' }, role: 'observed',
        rowLabels: [...TOKENS], columnLabels: [...TOKENS], values: Array(25).fill(null) } },
    { id: 'arrow-q-matrix', type: 'arrow', semanticId: 'arrow-q-matrix', conceptId: 'causal-self-attention',
      initialState: { from: { x: 250, y: 171 }, to: { x: 420, y: 190 }, opacity: 0, role: 'neutral' } },
    { id: 'arrow-k-matrix', type: 'arrow', semanticId: 'arrow-k-matrix', conceptId: 'causal-self-attention',
      initialState: { from: { x: 250, y: 235 }, to: { x: 420, y: 260 }, opacity: 0, role: 'neutral' } },
    // The one row walked all the way through: token 4 ("o"), the only query
    // that can see every earlier position, so its distribution has the most
    // to show. Bars carry per-key labels natively - grid cannot (see report).
    { id: 'bars-row', type: 'bars', semanticId: 'row4-distribution', conceptId: 'softmax-attention-weights',
      initialState: { label: "the last token's row, as a distribution", x: 420, y: 430, h: 90, peak: 1, opacity: 0, role: 'observed', labels: [...TOKENS], values: [0, 0, 0, 0, 0] } },
    { id: 'arrow-matrix-bars', type: 'arrow', semanticId: 'arrow-matrix-bars', conceptId: 'softmax-attention-weights',
      initialState: { from: { x: 462, y: 380 }, to: { x: 462, y: 430 }, opacity: 0, role: 'neutral' } },
    { id: 'equation', type: 'equation', semanticId: 'attention-equation', conceptId: 'attention-output',
      initialState: { text: '\\text{softmax}\\left(\\dfrac{QK^T}{\\sqrt{d_k}}\\right)V', x: 650, y: 150, w: 240, h: 60, opacity: 0 } },
    { id: 'output', type: 'strip', semanticId: 'attention-output', conceptId: 'attention-output',
      initialState: { label: 'output - the weighted mix of V', x: 650, y: 250, cell: 42, opacity: 0, heat: true, role: 'output', values: [0, 0, 0, 0, 0] } },
    { id: 'arrow-v-output', type: 'arrow', semanticId: 'arrow-v-output', conceptId: 'attention-output',
      initialState: { from: { x: 250, y: 299 }, to: { x: 650, y: 271 }, opacity: 0, role: 'neutral' } },
    { id: 'arrow-matrix-output', type: 'arrow', semanticId: 'arrow-matrix-output', conceptId: 'attention-output',
      initialState: { from: { x: 650, y: 380 }, to: { x: 755, y: 250 }, opacity: 0, role: 'neutral' } },
    // Below the bars' own per-key labels (bottom edge 430+90+12=532), so the
    // closing line never overlaps them.
    { id: 'note', type: 'text', semanticId: 'note', initialState: { text: '', x: 40, y: 566 } },
  ],
  timeline: [
    { at: 0.0, action: 'type_text', target: 'caption', value: 'an attention layer starts from embeddings the tokens already have', duration: 1.6 },
    { at: 0.6, action: 'appear', target: 'chars', duration: 0.5 },
    { at: 1.8, action: 'change_text', target: 'caption', value: 'each embedding is projected three ways: a query, a key and a value' },
    { at: 2.0, action: 'appear', target: 'q', duration: 0.5 },
    { at: 2.0, action: 'appear', target: 'arrow-tok-q', duration: 0.4 },
    { at: 2.3, action: 'appear', target: 'k', duration: 0.5 },
    { at: 2.3, action: 'appear', target: 'arrow-tok-k', duration: 0.4 },
    { at: 2.6, action: 'appear', target: 'v', duration: 0.5 },
    { at: 2.6, action: 'appear', target: 'arrow-tok-v', duration: 0.4 },
    { at: 3.6, action: 'change_text', target: 'caption', value: 'the query asks, the key answers, and the value is what actually gets carried forward' },
    { at: 4.4, action: 'appear', target: 'matrix', duration: 0.5 },
    { at: 4.4, action: 'appear', target: 'arrow-q-matrix', duration: 0.4 },
    { at: 4.4, action: 'appear', target: 'arrow-k-matrix', duration: 0.4 },
    { at: 4.8, action: 'change_text', target: 'caption', value: 'compare every query against every key - a raw score for every pair' },
    { at: 5.0, action: 'change_text', target: 'matrix', value: 'raw scores: QKᵀ' },
    { at: 5.2, action: 'set_values', target: 'matrix', value: RAW_FULL, duration: 1.4, easing: 'easeInOut' },
    { at: 6.8, action: 'change_text', target: 'caption', value: 'a token must never see the future, so every score above the diagonal is masked out' },
    { at: 7.0, action: 'change_text', target: 'matrix', value: 'causal mask: future positions blocked' },
    { at: 7.2, action: 'set_values', target: 'matrix', value: RAW_MASKED, duration: 0.5 },
    { at: 8.0, action: 'change_text', target: 'caption', value: 'softmax turns every unmasked row into a probability distribution that sums to one' },
    { at: 8.2, action: 'change_text', target: 'matrix', value: 'softmax: each row sums to 1' },
    { at: 8.4, action: 'replace_values', target: 'matrix', value: SOFTMAX },
    { at: 10.0, action: 'highlight_cell', target: 'chars', value: 4 },
    { at: 10.0, action: 'highlight_cell', target: 'matrix', value: { row: 4 } },
    { at: 10.2, action: 'change_text', target: 'caption', value: "follow the last token's row - what did it actually attend to?" },
    { at: 10.6, action: 'appear', target: 'bars-row', duration: 0.5 },
    { at: 10.6, action: 'appear', target: 'arrow-matrix-bars', duration: 0.4 },
    { at: 10.8, action: 'set_values', target: 'bars-row', value: ROW4_SOFTMAX, duration: 1.0 },
    { at: 12.0, action: 'highlight_cell', target: 'bars-row', value: 'max' },
    { at: 12.2, action: 'change_text', target: 'caption', value: 'multiply every value vector by its weight, and add them up' },
    { at: 12.6, action: 'appear', target: 'output', duration: 0.5 },
    { at: 12.6, action: 'appear', target: 'equation', duration: 0.5 },
    { at: 12.6, action: 'appear', target: 'arrow-v-output', duration: 0.4 },
    { at: 12.6, action: 'appear', target: 'arrow-matrix-output', duration: 0.4 },
    { at: 13.0, action: 'set_values', target: 'output', value: OUTPUT, duration: 1.0 },
    { at: 14.2, action: 'highlight_cell', target: 'output', value: 4 },
    { at: 14.4, action: 'change_text', target: 'caption', value: 'the same pattern repeats for every position, all at once' },
    { at: 14.8, action: 'type_text', target: 'note', value: 'the causal mask is the only thing that differs per position - the same Q, K and V weights are reused everywhere', duration: 2.0 },
  ],
};
