// Attention at Overview depth: when the model reads one character, which
// earlier characters does it look at? The nine characters "Before we" (the
// shakespeare_char tokens of the dataset's line 2, shared with every nanogpt
// card) sit in a row; for the character being read, a bar over each earlier
// character shows how strongly it looks back at it, and the characters to its
// right are faded and never get a bar. The bars share one fixed total: a
// faint line at full height marks "all of it", which the first character's
// single bar reaches. One control: which character is read.
//
// The pattern is head 0 of the attention generator's calculated toy example
// (gen_attention.py: keys are a position code, each query points at the
// character before it) - a hand-set rule, not a trained model. The bar
// heights are computed on the card with the same steps the Guided card shows
// in numbers (q.k, divide by 2, mask the future, softmax); nothing here is
// typed in. Code and provenance are the card's `sources`, collapsed under it.
import att from '../fixtures/attention.generated.js';
import { code, calculation, tinyShakespeare } from '../../sources.js';

const REPRODUCE = 'uv run --with tiktoken==0.14.0 python packages/web/src/nanogpt/depth/fixtures/gen_attention.py --check';
const TOKENS = att.context.tokens;
const T = TOKENS.length;
const LAST = T - 1;
const HEAD = att.heads[0];
const X0 = 120, PITCH = 80, TILE_W = 68, TILE_H = 60;
const BARS_Y = 150, BARS_H = 170;
const TILE_Y = BARS_Y + BARS_H + 14;
const tileX = j => X0 + j * PITCH + (PITCH - TILE_W) / 2;
const spoken = c => (c === '␣' ? 'the space' : `“${c}”`);
const named = c => (c === '␣' ? 'space' : c); // the ␣ glyph reads as an underscore in the tile font

// Per reading position: each tile's state (the reader, an earlier character
// it can look at, a character not read yet) - layout, not numbers.
const range = Array.from({ length: T }, (unused, i) => i);
const ROLE_TABLE = range.map(i => range.map(j => (j === i ? 'learner' : j < i ? 'input' : 'neutral')));
const OPACITY_TABLE = range.map(i => range.map(j => (j > i ? 0.3 : 1)));

export const scene = {
  id: 'depth-attention-overview',
  title: 'Attention · Overview: looking back while reading',
  width: 960,
  height: 592,
  duration: 1.6,
  inputs: [
    { name: 'reader', type: 'index', label: 'Character being read', of: 'readerLabels', default: LAST, presentation: 'picker' },
  ],
  exampleData: {
    tokens: TOKENS,
    readerLabels: TOKENS.map(named),
    Q: HEAD.q, K: HEAD.k,
    causal: true,
    roleTable: ROLE_TABLE,
    opacityTable: OPACITY_TABLE,
    readerX: range.map(i => tileX(i) + TILE_W / 2),
    readerLabelX: range.map(i => tileX(i) + TILE_W / 2 - 25),
    firstFutureX: range.map(i => (i < LAST ? tileX(i + 1) : tileX(LAST))),
    futureOpacity: range.map(i => (i < LAST ? 1 : 0)),
    firstOpacity: range.map(i => (i === 0 ? 1 : 0)),
    laterOpacity: range.map(i => (i === 0 ? 0 : 1)),
    futureNotes: range.map(i => (i === LAST ? 'Nothing to its right has been read yet, so no bar can go there.'
      : i === LAST - 1 ? 'The character to its right is not read yet, so it gets no bar.'
        : 'The characters to its right are not read yet, so they get no bar.')),
    spokenTokens: TOKENS.map(spoken),
  },
  derived: {
    scores: { op: 'matmul', args: ['Q', 'K'] },
    scaled: { op: 'scale', args: ['scores', 1 / Math.sqrt(att.hs)] },
    masked: { op: 'causal_mask', args: ['scaled', 'causal'] },
    weights: { op: 'softmax', args: ['masked'] },
    row: { op: 'pick', args: ['weights', 'reader'] },
    // Where the tallest bar is: softmax keeps the order of the scores, so it
    // sits at the largest visible score = argmin of the negated, masked scores.
    negScaled: { op: 'scale', args: ['scaled', -1] },
    negMasked: { op: 'causal_mask', args: ['negScaled', 'causal'] },
    negRow: { op: 'pick', args: ['negMasked', 'reader'] },
    topAt: { op: 'argmin', args: ['negRow'] },
    topChar: { op: 'pick', args: ['spokenTokens', 'topAt'] },
    readerChar: { op: 'pick', args: ['spokenTokens', 'reader'] },
    tileRoles: { op: 'pick', args: ['roleTable', 'reader'] },
    tileOpacity: { op: 'pick', args: ['opacityTable', 'reader'] },
    markerX: { op: 'pick', args: ['readerX', 'reader'] },
    markerLabelX: { op: 'pick', args: ['readerLabelX', 'reader'] },
    futureX: { op: 'pick', args: ['firstFutureX', 'reader'] },
    futureShown: { op: 'pick', args: ['futureOpacity', 'reader'] },
    firstShown: { op: 'pick', args: ['firstOpacity', 'reader'] },
    laterShown: { op: 'pick', args: ['laterOpacity', 'reader'] },
    futureNote: { op: 'pick', args: ['futureNotes', 'reader'] },
  },
  objects: [
    { id: 'question', type: 'text', semanticId: 'question', conceptId: 'attention',
      initialState: { text: 'When the model reads one character, which earlier characters does it look at?', x: 32, y: 30 } },
    { id: 'prerequisites', type: 'text', semanticId: 'prerequisites', conceptId: 'attention',
      initialState: { text: 'No prerequisites.', x: 32, y: 56, typography: 'annotation' } },
    { id: 'status', type: 'text', semanticId: 'status', conceptId: 'attention',
      initialState: { text: 'Calculated toy example: one hand-set pattern, not a trained model.', x: 32, y: 78, typography: 'annotation' } },
    // The fixed total: bars top out at h - 4 (AnimatedScene), which is weight 1.
    { id: 'total-line', type: 'line', semanticId: 'fixed-total', conceptId: 'attention-weights',
      initialState: { from: { x: X0, y: BARS_Y + 4 }, to: { x: X0 + T * PITCH, y: BARS_Y + 4 }, role: 'neutral', opacity: 0.5 } },
    { id: 'total-label', type: 'text', semanticId: 'fixed-total-label', conceptId: 'attention-weights',
      initialState: { text: 'all of it', x: X0 + T * PITCH + 8, y: BARS_Y + 8, typography: 'annotation' } },
    { id: 'look-bars', type: 'bars', semanticId: 'look-back-strength', conceptId: 'attention-weights',
      initialState: { label: 'how strongly it looks at each character', x: X0, y: BARS_Y, h: BARS_H, cell: PITCH, peak: 1, opacity: 0,
        role: 'output', distribution: true, values: { $derive: 'row' } } },
    ...TOKENS.map((token, j) => ({ id: `tile-${j}`, type: 'box', semanticId: `character-${j}`, conceptId: 'context',
      initialState: { label: named(token), x: tileX(j), y: TILE_Y, w: TILE_W, h: TILE_H,
        role: { $derive: `tileRoles.${j}` }, opacity: { $derive: `tileOpacity.${j}` } } })),
    { id: 'not-read', type: 'text', semanticId: 'not-read-yet', conceptId: 'causal-mask',
      initialState: { text: 'not read yet', x: { $derive: 'futureX' }, y: BARS_Y + BARS_H - 12, typography: 'annotation', opacity: { $derive: 'futureShown' } } },
    { id: 'reader-arrow', type: 'arrow', semanticId: 'reader-marker', conceptId: 'attention',
      initialState: { from: { x: { $derive: 'markerX' }, y: TILE_Y + TILE_H + 40 }, to: { x: { $derive: 'markerX' }, y: TILE_Y + TILE_H + 6 }, role: 'learner', opacity: 0 } },
    { id: 'reader-label', type: 'text', semanticId: 'reader-label', conceptId: 'attention',
      initialState: { text: 'reading', x: { $derive: 'markerLabelX' }, y: TILE_Y + TILE_H + 60, typography: 'annotation', opacity: 0 } },
    { id: 'caption-first', type: 'text', semanticId: 'caption-first', conceptId: 'attention-weights',
      initialState: { text: 'Nothing comes before {{readerChar}}, so it can only look at itself:', x: 32, y: 494, opacity: { $derive: 'firstShown' } } },
    { id: 'caption-later', type: 'text', semanticId: 'caption-later', conceptId: 'attention-weights',
      initialState: { text: 'Reading {{readerChar}}: it looks hardest at {{topChar}}, the character just before it,', x: 32, y: 494, opacity: { $derive: 'laterShown' } } },
    // What the look-back yields: the tallest bar is a clear majority (the
    // test checks), so most of what the reader passes on comes from there.
    { id: 'caption-yield', type: 'text', semanticId: 'caption-yield', conceptId: 'attention-weights',
      initialState: { text: 'so most of what it passes on comes from {{topChar}}.', x: 32, y: 518, opacity: { $derive: 'laterShown' } } },
    { id: 'caption-yield-first', type: 'text', semanticId: 'caption-yield-first', conceptId: 'attention-weights',
      initialState: { text: 'everything it passes on comes from {{readerChar}}.', x: 32, y: 518, opacity: { $derive: 'firstShown' } } },
    { id: 'caption-future', type: 'text', semanticId: 'caption-future', conceptId: 'causal-mask',
      initialState: { text: '{{futureNote}}', x: 32, y: 546, typography: 'annotation' } },
    { id: 'caption-total', type: 'text', semanticId: 'caption-total', conceptId: 'attention-weights',
      initialState: { text: 'The bars share one fixed total: a taller bar leaves less for the others.', x: 32, y: 572, typography: 'annotation' } },
  ],
  timeline: [
    { at: 0.0, action: 'appear', target: 'look-bars', duration: 0.6 },
    { at: 0.6, action: 'appear', target: 'reader-arrow', duration: 0.4 },
    { at: 0.6, action: 'appear', target: 'reader-label', duration: 0.4 },
  ],
};

export const sources = [
  code('model.py', 67, 69, 'How strongly one character looks at another: “att = (q @ k.transpose(-2, -1)) * (1.0 / math.sqrt(k.size(-1)))” scores every pair, “att = att.masked_fill(self.bias[:,:,:T,:T] == 0, float(\'-inf\'))” hides every later character, and “att = F.softmax(att, dim=-1)” turns the scores into shares that add up to one - the bar heights.'),
  code('model.py', 64, 64, 'What NanoGPT runs by default with PyTorch 2.0 or later - the same look-back, with the future hidden by “is_causal=True”: “y = torch.nn.functional.scaled_dot_product_attention(q, k, v, attn_mask=None, dropout_p=self.dropout if self.training else 0, is_causal=True)”.'),
  { ...calculation('Calculated toy example', 'The look-back pattern',
    `gen_attention.py head 0 (“previous character”): each character’s key is a position code [cos 36j°, sin 36j°, cos 108j°, sin 108j°] (6 decimals) and the query of the character at position i is ${att.gain} × the key of position i − 1, so it matches the character just before best. A hand-set rule, not a trained model. The bars are computed on the card: q·k for every pair, × 0.5 (= 1/√4), later characters masked, softmax; the tallest bar is found as the argmax of that row.`),
  reproduce: REPRODUCE },
  tinyShakespeare(`The nine characters “${TOKENS.join('').replace('␣', ' ')}” begin line 2 of the dataset (“Before we proceed any further”), the same line every nanogpt card uses; ␣ marks the space.`),
];

export const evidence = {
  card: 'depth-attention-overview',
  title: scene.title,
  learningQuestion: scene.objects[0].initialState.text,
  concept: 'While reading a character, causal self-attention looks back at earlier characters with different strengths that add up to one, and never at characters that come later.',
  sourceRevision: `${att.provenance.nanogpt.repo} @ ${att.provenance.nanogpt.commit}`,
  provenance: 'context: attention.generated.js context.tokens (first 9 shakespeare_char tokens of the base fixture sample); pattern: head 0 q/k of gen_attention.py (calculated toy example); live calculation on the card: matmul, scale 0.5, causal_mask, softmax, pick, argmin of the negated row; code: model.py:67-69 manual path and :64 fused default at @3adf61e.',
  control: '"Character being read" index picker over the nine characters (default the last, “e”).',
  consequence: 'The bars always add up to the same total, marked by a line at full height (all of it); the tallest bar moves with the reader and always sits on the character just before it, so most of what the reader passes on comes from that character; the reader itself and a few earlier characters keep short bars; every character to its right is faded, labelled not read yet and never gets a bar. At the first character the single bar is on itself, and everything it passes on comes from itself.',
  interactionPurpose: 'See cause and effect: moving the reader changes where it looks back, and the future never lights up.',
  task: 'Move the reader from the last character to the first and watch where the tallest bar goes and which tiles fade.',
  capability: 'one index picker; bars on a fixed axis (peak 1, drawn as an all-of-it line) from a live masked-softmax row; tile role and opacity picked per reader from a state table; reader arrow and labels placed by picked x positions; captions switch by derived opacity.',
  depth: 'Overview',
  prerequisites: 'None.',
  ladderRole: 'Gives the intuition - look back, strongest at one place, never ahead - with one discrete control and no numbers, equations or shapes.',
};

// One state per kind of change: the last character, a middle one, the second
// (its only earlier character is the first), and the first (nothing before).
export const reviewStates = [{ reader: LAST }, { reader: 4 }, { reader: 1 }, { reader: 0 }];
