// Attention at Guided depth: how one reader turns match scores into weights,
// in numbers. Same nine characters and the same head as the Overview card
// (gen_attention.py head 0). For the chosen reader the card runs NanoGPT's
// manual path one row at a time, every number live: the query q against every
// key (score = q.k), divided by sqrt(hs) = 2, later characters masked to
// -inf, softmax, and the weights mixing the value vectors into the output.
// The learner can check it: the four products add up to the score cell, the
// weights add up to 1 (each cell rounded on its own, so a row can read .99
// or 1.01 - never nudged, so equal-looking scores keep equal-looking
// weights), a masked weight is exactly 0, the largest visible score always
// takes the largest weight, and a by-hand line works the softmax for that
// weight. It opens on the fourth character, where five later characters are
// masked.
//
// The manipulation is what q points at. Keys are a position code and q is
// 4 x the key it points at, so that key scores highest. "The character
// before" is the Overview pattern; "the next character" is a what-if query
// that wants the future - its score is the largest in the row, and the mask
// still gives it weight 0. Code and provenance are the card's `sources`.
import att from '../fixtures/attention.generated.js';
import { code, calculation, tinyShakespeare } from '../../sources.js';

const REPRODUCE = 'uv run --with tiktoken==0.14.0 python packages/web/src/nanogpt/depth/fixtures/gen_attention.py --check';
const TOKENS = att.context.tokens;
const T = TOKENS.length;
const LAST = T - 1;
const HEAD = att.heads[0];
const HS = att.hs;
const range = Array.from({ length: T }, (unused, i) => i);
const transpose = m => m[0].map((unused, d) => m.map(row => row[d]));
const named = c => (c === '␣' ? 'space' : c);
const spoken = c => (c === '␣' ? 'the space' : `“${c}”`);

const COL = 32;
const CELL = 44; // every cell prints at most 5 characters ("-2.35"); 44 leaves them room inside the border
const GX = 200; // the nine character columns, shared by every row below
const RX = 614; // right-hand column
// The output column closes the values row at the right edge of the notes
// column: its static "Σ w·v" header holds the frame's right edge, so the frame
// fitted to the evaluated notes is the one the card is sized for (the notes
// are all live text, which the static size cannot measure). Its note ends just
// left of it, so the note reads with the column it describes.
const OX = 870;
// Rows stack from the keys down: a row, then the gap its caption needs.
const K_Y = 150, SCORE_Y = K_Y + 4 * CELL + 40, MASK_Y = SCORE_Y + CELL + 36, W_Y = MASK_Y + CELL + 36, V_Y = W_Y + CELL + 37, FOOT = V_Y + 4 * CELL + 18;
// The replay runs the four numbered steps in order: 1 score, 2 ÷ √hs and hide
// the future, 3 softmax, 4 mix the values. A step's row and notes wait faint
// (QUIET) until its turn and then switch on at once (an appear from a faint
// start would first drop to 0), so the step in play is always the last one
// drawn in full. Step 2's row is also ringed while it is in play, blanks
// included: the step's work is those blanks. The final frame shows everything.
// ponytail: no ring on steps 3 and 4 - a highlighted heat cell only thickens
// its frame by half a pixel; ring them when the renderer draws that visibly.
// Times sit off the scrubber's 0.05 grid and the 0.01 grid a paused time is
// saved on: at exactly an event's time the event has not started, so a time
// there would blank a faint row.
const QUIET = 0.25;
const STEP = [0.005, 1.005, 2.005, 3.005];
// Text draws from its left end: x for a note that ends 12px left of the
// column. ~6px a character is what 13px annotation text measures in the render.
const endsAtColumn = text => OX - 12 - Math.round(text.length * 6);

// The notes beside the rows, per option and reader, written from the rule the
// generator used (q points at one key); the test checks each against the
// live numbers. No note names a "largest" key where the what-if row ties.
const prev = i => spoken(TOKENS[Math.max(i - 1, 0)]);
const next = i => spoken(TOKENS[i + 1]);
const byOption = (before, after) => ({ before: range.map(before), next: range.map(after) });
// The key q points at. The what-if's past-the-end target has no key: nothing
// is highlighted (-1 marks no cell) and the products are hidden; the reader's
// own key only keeps the hidden strip's pick in range.
const FOCUS = byOption(i => Math.max(i - 1, 0), i => Math.min(i + 1, LAST));
const NO_KEY = i => i === LAST; // the what-if at the last reader
// Softmax by hand for the largest visible weight. The scaled scores are
// exactly 4, 1, -1 or -4 (the test checks), so the sum groups into at most
// four terms; the test checks the line against the live weight row.
const SUP = { 4: '⁴', 1: '¹', '-1': '⁻¹', '-4': '⁻⁴' };
const two = v => v.toFixed(2).replace(/^0\./, '.');
// 3 decimals on e^score and the sum: at 2, reader 4's 54.60 / 63.12 divides
// to .87 beside a .86 cell (the true weight is .86498).
const three = v => v.toFixed(3);
function byHand(Q, i) {
  const s = HEAD.k.slice(0, i + 1).map(k => Math.round(Q[i].reduce((a, x, d) => a + x * k[d], 0) / Math.sqrt(HS)));
  const top = Math.max(...s);
  if (s.length === 1) return [`largest: e${SUP[top]} / e${SUP[top]}`, '= 1'];
  const terms = [4, 1, -1, -4].map(v => [v, s.filter(x => x === v).length]).filter(([, n]) => n)
    .map(([v, n]) => `${n > 1 ? n : ''}e${SUP[v]}`).join(' + ');
  const den = s.reduce((a, v) => a + Math.exp(v), 0);
  return [`largest: e${SUP[top]} / (${terms})`, `= ${three(Math.exp(top))} / ${three(den)} = ${two(Math.exp(top) / den)}`];
}
const HIGHLIGHT = byOption(i => FOCUS.before[i], i => (NO_KEY(i) ? -1 : FOCUS.next[i]));
const PRODUCTS_SHOWN = byOption(() => 1, i => (NO_KEY(i) ? 0 : 1));
const NOTES = {
  top: byOption(i => (i === 0 ? 'only “B” is visible' : `highest visible score: ${prev(i)}`),
    i => (i === LAST ? 'no visible score stands out' : `highest score: ${next(i)}, a later one`)),
  products: byOption(i => `q × k for ${prev(i)}, dim by dim:`,
    i => (NO_KEY(i) ? 'no single key: q points past the text' : `q × k for ${next(i)}, dim by dim:`)),
  mask: range.map(i => (i === LAST ? 'nothing comes later: nothing masked' : `${LAST - i} later → −∞, weight exactly 0`)),
  sum: byOption(i => (i === 0 ? '“B” takes all of it: 1' : `most weight: ${prev(i)}; total 1`),
    i => (i === 0 ? 'highest score gets 0; “B” gets 1' : i === LAST ? 'spread over weak matches; total 1' : 'highest score gets 0; total still 1')),
  out: byOption(i => (i === 0 ? '= the v of “B”' : `≈ the v of ${prev(i)}`), i => (i === 0 ? '= the v of “B”' : 'a mix of the visible v')),
  outX: byOption(i => endsAtColumn(i === 0 ? '= the v of “B”' : `≈ the v of ${prev(i)}`), i => endsAtColumn(i === 0 ? '= the v of “B”' : 'a mix of the visible v')),
  caption: byOption(i => (i === 0
    ? 'q points before the text; only “B” is visible, so it takes weight 1 whatever its score.'
    : `q is ${att.gain} × the key of ${prev(i)}, the character before, so that key scores highest.`),
  i => (i === LAST
    ? 'What-if: q points at the next character, which is not in the text yet - no key matches it.'
    : `What-if: q points at the next character, ${next(i)}. Its score is the largest in the row,`)),
  second: byOption(() => '', i => (i === LAST ? 'So the weight spreads over the weak matches that are visible.'
    : 'yet the mask blanks it: weight 0. Unmasked, it would read the character it must predict.')),
  hand: byOption(i => byHand(HEAD.q, i)[0], i => byHand(att.qNext, i)[0]),
  handValue: byOption(i => byHand(HEAD.q, i)[1], i => byHand(att.qNext, i)[1]),
};

export const scene = {
  id: 'depth-attention-guided',
  title: 'Attention · Guided: from scores to weights for one reader',
  width: 960,
  height: FOOT + 40,
  duration: 4,
  inputs: [
    { name: 'reader', type: 'index', label: 'Reader', of: 'readerLabels', default: 3, presentation: 'slider' },
    { name: 'lookFor', type: 'choice', label: 'q points at', default: 'before',
      options: [{ id: 'before', label: 'the character before' }, { id: 'next', label: 'the next character (What-if)' }] },
  ],
  exampleData: {
    readerLabels: TOKENS.map(named),
    spokenTokens: TOKENS.map(spoken),
    qByOption: { before: HEAD.q, next: att.qNext },
    K: HEAD.k, KT: transpose(HEAD.k),
    V: HEAD.v, VT: transpose(HEAD.v),
    causal: true,
    focusTable: FOCUS,
    highlightTable: HIGHLIGHT,
    productsShown: PRODUCTS_SHOWN,
    notes: NOTES,
  },
  derived: {
    readerChar: { op: 'pick', args: ['spokenTokens', 'reader'] },
    Q: { op: 'pick', args: ['qByOption', 'lookFor'] },
    q: { op: 'pick', args: ['Q', 'reader'] },
    // model.py:67-69, one reader's row: q.k for every key, x 1/sqrt(hs),
    // later keys -> -inf, softmax.
    raw: { op: 'matmul', args: ['Q', 'K'] },
    rawRow: { op: 'pick', args: ['raw', 'reader'] },
    scaled: { op: 'scale', args: ['raw', 1 / Math.sqrt(HS)] },
    masked: { op: 'causal_mask', args: ['scaled', 'causal'] },
    maskedRow: { op: 'pick', args: ['masked', 'reader'] },
    att: { op: 'softmax', args: ['masked'] },
    w: { op: 'pick', args: ['att', 'reader'] },
    // model.py:71: y = att @ v, one row.
    out: { op: 'weighted_sum', args: ['w', 'V'] },
    // The key q points at, dimension by dimension: its products add up to
    // its score cell.
    focusRow: { op: 'pick', args: ['focusTable', 'lookFor'] },
    focusAt: { op: 'pick', args: ['focusRow', 'reader'] },
    highlightRow: { op: 'pick', args: ['highlightTable', 'lookFor'] },
    highlightAt: { op: 'pick', args: ['highlightRow', 'reader'] },
    shownRow: { op: 'pick', args: ['productsShown', 'lookFor'] },
    productsOpacity: { op: 'pick', args: ['shownRow', 'reader'] },
    kFocus: { op: 'pick', args: ['K', 'focusAt'] },
    products: { op: 'elementwise', args: ['q', 'kFocus'] },
    productSum: { op: 'sum', args: ['products'] },
    // The largest visible score (softmax keeps the order, so also the largest
    // weight) = argmin of the negated masked scores - checked by the test.
    negScaled: { op: 'scale', args: ['scaled', -1] },
    negMasked: { op: 'causal_mask', args: ['negScaled', 'causal'] },
    negRow: { op: 'pick', args: ['negMasked', 'reader'] },
    topAt: { op: 'argmin', args: ['negRow'] },
    ...Object.fromEntries(['top', 'products', 'sum', 'hand', 'handValue', 'out', 'outX', 'caption', 'second'].flatMap(name => [
      [`${name}Row`, { op: 'pick', args: [`notes.${name}`, 'lookFor'] }],
      [`${name}Note`, { op: 'pick', args: [`${name}Row`, 'reader'] }],
    ])),
    maskNote: { op: 'pick', args: ['notes.mask', 'reader'] },
  },
  objects: [
    { id: 'question', type: 'text', semanticId: 'question', conceptId: 'attention',
      initialState: { text: 'How do match scores become attention weights, and why does the future get exactly zero?', x: COL, y: 30 } },
    { id: 'prerequisites', type: 'text', semanticId: 'prerequisites', conceptId: 'attention',
      initialState: { text: 'Builds on: looking back at earlier characters; dot product, softmax', x: COL, y: 56, typography: 'annotation' } },
    { id: 'status', type: 'text', semanticId: 'status', conceptId: 'attention',
      initialState: { text: 'Calculated toy example (hand-set q, k, v) · Live calculation · What-if: a query that points ahead', x: COL, y: 78, typography: 'annotation' } },

    // The query and every key, dimension by dimension.
    { id: 'q', type: 'grid', semanticId: 'query', conceptId: 'query',
      initialState: { x: 112, y: K_Y, rows: HS, cols: 1, cell: CELL, role: 'learner', matrixKind: 'derived',
        rowLabels: ['dim 1', 'dim 2', 'dim 3', 'dim 4'], columnLabels: ['q'],
        heat: { mode: 'signed' }, valueScale: 'shared', valueScaleGroup: 'guided-q', values: { $derive: 'q' } } },
    { id: 'keys', type: 'grid', semanticId: 'keys', conceptId: 'keys',
      initialState: { label: 'keys k, one column per character', x: GX, y: K_Y, rows: HS, cols: T, cell: CELL, role: 'input', matrixKind: 'input',
        columnLabels: TOKENS.map(named), heat: { mode: 'signed' }, valueScale: 'shared', valueScaleGroup: 'guided-k',
        values: { $derive: 'KT' }, cellHighlight: { col: { $derive: 'highlightAt' } } } },
    { id: 'products-title', type: 'text', semanticId: 'products-title', conceptId: 'dot-product',
      initialState: { text: '{{productsNote}}', x: RX, y: K_Y + 10, typography: 'annotation' } },
    { id: 'products', type: 'strip', semanticId: 'products', conceptId: 'dot-product',
      initialState: { x: RX, y: K_Y + 22, cell: CELL, role: 'neutral', values: { $derive: 'products' }, opacity: { $derive: 'productsOpacity' } } },
    // The cells above round to 2 decimals, so their sum can miss the score
    // cell by 0.01; the same products to 3 decimals add up exactly.
    { id: 'products-exact', type: 'text', semanticId: 'products-exact', conceptId: 'dot-product',
      initialState: { text: '3 decimals: {{products.0}}, {{products.1}}, {{products.2}}, {{products.3}}', x: RX, y: K_Y + 86, typography: 'annotation', opacity: { $derive: 'productsOpacity' } } },
    { id: 'product-sum', type: 'text', semanticId: 'product-sum', conceptId: 'dot-product',
      initialState: { text: 'add them: {{productSum}} = its score', x: RX, y: K_Y + 106, typography: 'annotation', opacity: { $derive: 'productsOpacity' } } },
    { id: 'reader-note', type: 'text', semanticId: 'reader-note', conceptId: 'query',
      initialState: { text: 'Reader: {{readerChar}}', x: RX, y: K_Y + 144 } },

    // One reader's row, step by step, under the same character columns.
    { id: 'scores', type: 'grid', semanticId: 'score-row', conceptId: 'dot-product',
      initialState: { label: '1. score = q · k', x: GX, y: SCORE_Y, rows: 1, cols: T, cell: CELL, opacity: QUIET, role: 'neutral',
        matrixKind: 'derived', values: { $derive: 'rawRow' }, cellHighlight: { $derive: 'highlightAt' }, cellHighlightKind: 'highlight' } },
    { id: 'masked', type: 'grid', semanticId: 'masked-row', conceptId: 'causal-mask',
      initialState: { label: `2. ÷ √${HS} = ${Math.sqrt(HS)}, then later characters → −∞ (blank)`, x: GX, y: MASK_Y, rows: 1, cols: T, cell: CELL, opacity: QUIET,
        role: 'neutral', matrixKind: 'derived', values: { $derive: 'maskedRow' }, cellHighlightKind: 'highlight' } },
    // Not `distribution: true`: that makes the renderer nudge cells so a row
    // reads exactly 1.00, which turned equal-looking scores into .05 and .04.
    // Each cell is rounded on its own and the label says so.
    { id: 'weights', type: 'grid', semanticId: 'weight-row', conceptId: 'softmax',
      initialState: { label: '3. softmax → weights (each rounded, so a row can read .99 or 1.01)', x: GX, y: W_Y, rows: 1, cols: T, cell: CELL, opacity: QUIET, role: 'output',
        matrixKind: 'derived', heat: true, valueScale: 'fixed', values: { $derive: 'w' } } },
    { id: 'top-note', type: 'text', semanticId: 'top-note', conceptId: 'softmax',
      initialState: { text: '{{topNote}}', x: RX, y: SCORE_Y + 26, typography: 'annotation', opacity: QUIET } },
    { id: 'mask-note', type: 'text', semanticId: 'mask-note', conceptId: 'causal-mask',
      initialState: { text: '{{maskNote}}', x: RX, y: MASK_Y + 26, typography: 'annotation', opacity: QUIET } },
    // Three lines centred on the weight row, so the values row can follow it
    // at the same pitch as the rows above.
    { id: 'sum-note', type: 'text', semanticId: 'sum-note', conceptId: 'softmax',
      initialState: { text: '{{sumNote}}', x: RX, y: W_Y + 6, typography: 'annotation', opacity: QUIET } },
    { id: 'hand-note', type: 'text', semanticId: 'softmax-by-hand', conceptId: 'softmax',
      initialState: { text: '{{handNote}}', x: RX, y: W_Y + 24, typography: 'annotation', opacity: QUIET } },
    { id: 'hand-value', type: 'text', semanticId: 'softmax-by-hand-value', conceptId: 'softmax',
      initialState: { text: '{{handValueNote}}', x: RX, y: W_Y + 42, typography: 'annotation', opacity: QUIET } },

    // The weights mix the values.
    { id: 'values', type: 'grid', semanticId: 'values', conceptId: 'values',
      initialState: { label: '4. values v (a code for each letter), mixed by the weights', x: GX, y: V_Y, rows: HS, cols: T, cell: CELL, role: 'input', opacity: QUIET,
        matrixKind: 'input', heat: { mode: 'signed' }, valueScale: 'shared', valueScaleGroup: 'guided-v', values: { $derive: 'VT' } } },
    { id: 'output', type: 'grid', semanticId: 'output', conceptId: 'values',
      initialState: { x: OX, y: V_Y, rows: HS, cols: 1, cell: CELL, role: 'output', matrixKind: 'derived', columnLabels: ['Σ w·v'], opacity: QUIET,
        heat: { mode: 'signed' }, valueScale: 'shared', valueScaleGroup: 'guided-v', values: { $derive: 'out' } } },
    { id: 'output-note', type: 'text', semanticId: 'output-note', conceptId: 'values',
      initialState: { text: '{{outNote}}', x: { $derive: 'outXNote' }, y: V_Y + 88, typography: 'annotation', opacity: QUIET } },

    { id: 'caption', type: 'text', semanticId: 'caption', conceptId: 'query',
      initialState: { text: '{{captionNote}}', x: COL, y: FOOT, typography: 'annotation' } },
    { id: 'caption-2', type: 'text', semanticId: 'caption-2', conceptId: 'causal-mask',
      initialState: { text: '{{secondNote}}', x: COL, y: FOOT + 20, typography: 'annotation' } },
  ],
  timeline: [
    // 1. score; 2. ÷ √hs, hide the future; 3. softmax; 4. mix the values.
    ...[['scores', 'top-note'], ['masked', 'mask-note'], ['weights', 'sum-note', 'hand-note', 'hand-value'], ['values', 'output', 'output-note']]
      .flatMap((targets, k) => targets.map(target => ({ at: STEP[k], action: 'appear', target }))),
    { at: STEP[1], action: 'highlight_cell', target: 'masked', value: { row: 0 } },
    { at: STEP[2], action: 'highlight_cell', target: 'masked', value: null },
  ],
};

export const sources = [
  code('model.py', 67, 67, 'Step 1 and the ÷ 2: every query against every key, scaled by one over the square root of hs: “att = (q @ k.transpose(-2, -1)) * (1.0 / math.sqrt(k.size(-1)))”. Here hs = 4, so the factor is 0.5.'),
  code('model.py', 68, 68, 'Step 2, the mask: “att = att.masked_fill(self.bias[:,:,:T,:T] == 0, float(\'-inf\'))” - every later character’s score becomes −∞, drawn blank.'),
  code('model.py', 69, 69, 'Step 3: “att = F.softmax(att, dim=-1)” - exp(−∞) = 0, so a masked character gets weight exactly 0 and the visible weights share all of 1.'),
  code('model.py', 71, 71, 'Step 4: “y = att @ v # (B, nh, T, T) x (B, nh, T, hs) -> (B, nh, T, hs)” - the weights mix the value vectors; this card shows one row.'),
  code('model.py', 64, 64, 'NanoGPT’s default path (PyTorch 2.0 or later) computes the same row inside one call: “y = torch.nn.functional.scaled_dot_product_attention(q, k, v, attn_mask=None, dropout_p=self.dropout if self.training else 0, is_causal=True)”.'),
  { kind: 'paper', title: 'Attention Is All You Need (Vaswani et al., 2017) - scaled dot-product attention', arxiv: '1706.03762', page: 4,
    note: 'Section 3.2.1 defines Attention(Q, K, V) = softmax(QKᵀ/√d_k)V, the formula the four steps follow; NanoGPT’s hs is the paper’s d_k.' },
  { ...calculation('Calculated toy example', 'q, k and v for the nine characters',
    `gen_attention.py head 0 (a hand-set rule, not a trained model): key k(j) = position code [cos 36j°, sin 36j°, cos 108j°, sin 108j°], 6 decimals, so every scaled score is exactly 4, 1, −1 or −4; the query of reader i is ${att.gain} × k(i − 1) (“the character before”); v(j) is a code for the letter at j (a signed unit axis per distinct character, in order of first appearance).`),
  reproduce: REPRODUCE },
  { ...calculation('What-if', 'A query that points at the next character',
    `gen_attention.py qNext: the query of reader i is ${att.gain} × k(i + 1). No NanoGPT head is built this way; it shows what the mask does to a query that wants the future.`),
  reproduce: REPRODUCE },
  calculation('Live calculation', 'Scores, masked row, weights and output',
    'Computed on the card for the chosen reader: matmul (q · k for every key), the elementwise products (shown to 2 and to 3 decimals) and their sum for the key q points at, scale by 0.5 = 1/√4, causal_mask (later keys → −∞, blank), softmax, weighted_sum (Σ w·v). The largest weight is found as the argmin of the negated masked scores; the by-hand line beside the weights works the softmax for it from the same scores (e raised to each visible score, their sum, the ratio). Rounded to 3 decimals; cells show 2, each rounded on its own, so a weight row can read .99 or 1.01 and two scores that look equal always show equal weights.'),
  tinyShakespeare(`The nine characters “${TOKENS.join('').replace('␣', ' ')}” begin line 2 of the dataset, the same line every nanogpt card uses.`),
];

export const evidence = {
  card: 'depth-attention-guided',
  title: scene.title,
  learningQuestion: scene.objects[0].initialState.text,
  concept: 'One row of causal self-attention: score_j = q·k_j for every key, scaled by 1/√hs, later positions set to −∞, softmax to weights that add up to 1 (a masked weight is exactly 0), and the output is the weights’ mix of the value vectors. The key q points at scores highest; the mask overrides even the highest score when it lies in the future.',
  sourceRevision: `${att.provenance.nanogpt.repo} @ ${att.provenance.nanogpt.commit}`,
  provenance: 'calculated toy example: attention.generated.js heads[0] q/k/v and qNext (gen_attention.py); live calculation: matmul, pick, elementwise + sum (top key products), scale 0.5, causal_mask, softmax, weighted_sum, argmin of negated masked scores; code: model.py:64, :67, :68, :69, :71 at @3adf61e; paper: arXiv 1706.03762 §3.2.1.',
  control: '"Reader" index slider over the nine characters (default the fourth, “o”, where five later characters are masked); "q points at" choice: the character before (default) / the next character (What-if).',
  consequence: 'The reader moves the whole row: which keys are visible, which scores are blank, where the weight goes and what the output mixes. Switching q to the next character makes the future key’s raw score the largest in the row, yet its masked cell is blank and its weight 0; the visible weight spreads over weak matches. At the last reader the what-if query points past the text: no key is highlighted and the products are hidden, because there is no single key to break down (q still meets every key; the score row is full). At the first reader the only visible weight is 1 in both settings.',
  interactionPurpose: 'Verify the mechanism in numbers: products add to the score, weights add to 1, masked weight is 0, the largest visible score takes the largest weight, and a query cannot read the future however well it matches.',
  task: 'At the fourth reader, add the four products and find the matching score cell, and check that the two scores reading 1.00 get the same weight; then switch q to the next character and explain why the highest score gets no weight.',
  capability: 'index slider + choice; live one-row pipeline (matmul, scale, causal_mask, softmax, weighted_sum); argmax by argmin of negated masked scores; products strip and sum for the top key, hidden by derived opacity when q has no single key; a by-hand softmax line for the largest weight; key-column selection and score highlight picked per option and reader (-1 = none); signed heat on q, k, v and the output, fixed heat on weights (cells rounded independently); per-reader and per-option captions picked from tables; a staged replay (steps 1-4 switch on in turn, later steps faint until then, step 2’s row ringed while in play).',
  depth: 'Guided',
  prerequisites: 'Looking back at earlier characters (the Overview idea); dot product; softmax.',
  ladderRole: 'Opens the mechanism with real numbers the learner can check - scores, the ÷√hs, the −∞ mask, softmax and the value mix - and a manipulation (where q points) that changes them.',
};

export const reviewStates = [
  { reader: 3, lookFor: 'before' },
  { reader: 4, lookFor: 'before' }, // the by-hand ratio sits on the .865 boundary
  { reader: 3, lookFor: 'next' },
  { reader: LAST, lookFor: 'before' },
  { reader: LAST, lookFor: 'next' },
  { reader: 0, lookFor: 'before' },
];

// Cross-depth transitions (docs/nanogpt-depth-ladder.md): the Self-attention
// cards each open one step deeper - step 2's mask as the whole triangle (c11),
// the ÷ 2 as a multiplier on every score (c12), step 4's mix as a weighted
// average of the visible values (c10). No softmax edge until softmax has a
// card (NC9).
export const transitions = [
  { relation: 'deepens_to', target_card: 'c11-causal-mask' },
  { relation: 'deepens_to', target_card: 'c12-score-scaling' },
  { relation: 'deepens_to', target_card: 'c10-weighted-values' },
];
