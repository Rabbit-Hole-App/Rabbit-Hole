// Depth ladder - The Transformer, end to end - Overview.
// What happens between a piece of text and the character the model writes
// next, told as six plain stages the learner steps through one at a time:
// text, pieces, lists of numbers, the blocks, a score per character, the
// chosen character - which then joins the text for the next round (the loop
// generate() runs). Each stage has one plain cause/effect line and its own
// small picture of the same example. No equations, no tensor shapes.
//
// Grounding: the example context "hear me spea" is the Tiny Shakespeare line
// the cross-entropy fixture uses (the Deep dive card feeds the same 12
// characters to generate()). The sizes on the card - 6 blocks, 65
// characters, 384 numbers per piece - are the shakespeare_char config that
// generate_fixtures.py resolved. The scores are that fixture's calculated toy
// logits for five candidate characters (no trained model runs here); the
// chosen character is their largest entry, picked live (argmax as
// argmin of the negated scores).
import fx from '../../fixtures/nanogpt-fixtures.generated.js';
import { calculation, code, tinyShakespeare } from '../../sources.js';

const A = fx.architecture;
const CE = fx.crossEntropy;
const TOY = CE.presets.find(preset => preset.id === 'confident-right');
const CONCEPT = 'transformer-end-to-end';
const shown = ch => (ch === ' ' ? '␣' : ch);
const PIECES = [...CE.context].map(shown);
const STAGES = ['text', 'pieces', 'number lists', 'blocks', 'scores', 'the pick'];
const STAGE_LABELS = ['text', 'pieces', 'number lists', '{{L}} blocks', '{{V}} scores', 'the pick'];
const N = STAGES.length;

// Pipeline row: one box per stage, dimmed until the stepper reaches it.
const BOX_X0 = 40, BOX_PITCH = 152, BOX_W = 124, BOX_Y = 104, BOX_H = 46;
const boxX = i => BOX_X0 + i * BOX_PITCH;
const boxMid = i => boxX(i) + BOX_W / 2;
const LOOP_Y = 174;
// The example panel under the pipeline. Chips are 41.5px wide on a 49.5px
// pitch (CHIP_PAD 16 + 9.5 per character, CHIP_GAP 8 - animation-scene.js).
const CHIP_Y = 276, CHIP_PITCH = 49.5, CHIP_W = 41.5, PANEL_X = 40;
const chipMid = i => PANEL_X + i * CHIP_PITCH + CHIP_W / 2;
const LAST = PIECES.length - 1;
const HUB_Y = 360;
// The panel's floor: a static rule under the tallest picture (stage 2's
// columns and note). The block is sized, and every stage framed, from the
// content bounds; the pictures are input-bound, so without a static edge the
// frame refits - and the pipeline jumps and shrinks - at every step.
const PANEL_FLOOR = 462;

// Per-stage tables the stepper picks from: which stage boxes are reached,
// which one is current, and which example picture shows.
const table = f => Array.from({ length: N }, (unused, stage) => f(stage));
const only = (...stages) => table(stage => (stages.includes(stage) ? 1 : 0));
const DIM = 0.3;

const text = (id, value, x, y, extra = {}) => ({ id, type: 'text', semanticId: id, conceptId: CONCEPT,
  initialState: { text: value, x, y, ...extra } });
const note = (id, value, x, y, extra = {}) => text(id, value, x, y, { typography: 'annotation', ...extra });
const stroke = (type, id, from, to, extra = {}) => ({ id, type, semanticId: id, conceptId: CONCEPT,
  initialState: { from, to, role: 'neutral', ...extra } });

const stageBoxes = STAGES.map((unused, i) => ({
  id: `stage-${i}`, type: 'box', semanticId: `stage-${i}`, conceptId: CONCEPT,
  initialState: { label: STAGE_LABELS[i], x: boxX(i), y: BOX_Y, w: BOX_W, h: BOX_H,
    role: { $derive: `stageRole${i}` }, opacity: { $derive: `stageOpacity${i}` } },
}));
const stageArrows = STAGES.slice(1).map((unused, i) => stroke('arrow', `stage-arrow-${i}`,
  { x: boxX(i) + BOX_W + 4, y: BOX_Y + BOX_H / 2 }, { x: boxX(i + 1) - 4, y: BOX_Y + BOX_H / 2 },
  { opacity: { $derive: `stageOpacity${i + 1}` } }));
// Stage 2's picture: the last piece's own list plus its place's list, a few
// cells of each standing for all C numbers, and their sum - what the piece
// carries into the blocks.
const LIST_Y = [326, 362, 398], LIST_X = 236, LIST_CELL = 26, LIST_CELLS = 10;
const listRow = (key, y, label, tail, role) => [
  note(`${key}-label`, label, PANEL_X, y + 18, { opacity: { $derive: 'showLists' } }),
  { id: key, type: 'grid', semanticId: key, conceptId: CONCEPT,
    initialState: { x: LIST_X, y, rows: 1, cols: LIST_CELLS, cell: LIST_CELL, role, opacity: { $derive: 'showLists' } } },
  note(`${key}-tail`, tail, LIST_X + LIST_CELLS * LIST_CELL + 12, y + 18, { opacity: { $derive: 'showLists' } }),
];
// Stage 3's picture: every earlier piece feeds the last one (causal
// attention, seen from the position whose scores make the prediction).
const fan = PIECES.slice(0, LAST).map((unused, i) => stroke('line', `fan-${i}`,
  { x: chipMid(i), y: CHIP_Y + 36 }, { x: chipMid(LAST), y: HUB_Y }, { opacity: { $derive: 'showBlocks' } }));

export const scene = {
  id: 'depth-architecture-overview',
  title: 'The Transformer, end to end · Overview: text in, next character out',
  width: 960,
  height: 470,
  duration: 3,
  inputs: [
    { name: 'stage', type: 'index', label: 'Step through the stages', of: 'stages', default: 0, presentation: 'slider' },
  ],
  exampleData: {
    stages: STAGES,
    // Source values (fx.architecture): the shakespeare_char model's sizes.
    L: A.n_layer, V: A.vocab_size, C: A.n_embd,
    context: CE.context,
    count: PIECES.length,
    countNext: PIECES.length + 1,
    // Calculated toy example: the fixture's scores for five candidates.
    candidates: CE.vocab,
    toyScores: TOY.logits,
    stageLines: [
      'The model starts from the text so far and has to guess the character that comes next.',
      `It cuts the text into pieces - here one per character, so ${PIECES.length} pieces.`,
      `Each piece is swapped for its own list of ${A.n_embd} learned numbers, plus one list for its place.`,
      `${A.n_layer} blocks in a row. Each piece mixes in itself and the pieces before it, then is reworked alone.`,
      `The last piece's numbers become a score for each of the ${A.vocab_size} characters that could come next.`,
      'The model picks a character, usually a high-scoring one. It joins the text; the trip runs again.',
    ],
    ...Object.fromEntries(STAGES.flatMap((unused, i) => [
      [`stageOpacities${i}`, table(stage => (stage >= i ? 1 : DIM))],
      [`stageRoles${i}`, table(stage => (stage === i ? 'prediction' : 'neutral'))],
    ])),
    loopOpacities: table(stage => (stage === N - 1 ? 1 : DIM)),
    textOpacities: only(0),
    chipOpacities: only(1, 2, 3),
    listOpacities: only(2),
    blockOpacities: only(3),
    scoreOpacities: only(4),
    nextOpacities: only(5),
    // The piece the pictures follow: the last one, from its list to its guess.
    followed: table(stage => (stage === 2 || stage === 3 ? LAST : null)),
  },
  derived: {
    stageLine: { op: 'pick', args: ['stageLines', 'stage'] },
    ...Object.fromEntries(STAGES.flatMap((unused, i) => [
      [`stageOpacity${i}`, { op: 'pick', args: [`stageOpacities${i}`, 'stage'] }],
      [`stageRole${i}`, { op: 'pick', args: [`stageRoles${i}`, 'stage'] }],
    ])),
    showLoop: { op: 'pick', args: ['loopOpacities', 'stage'] },
    showText: { op: 'pick', args: ['textOpacities', 'stage'] },
    showChips: { op: 'pick', args: ['chipOpacities', 'stage'] },
    showLists: { op: 'pick', args: ['listOpacities', 'stage'] },
    showBlocks: { op: 'pick', args: ['blockOpacities', 'stage'] },
    showScores: { op: 'pick', args: ['scoreOpacities', 'stage'] },
    showNext: { op: 'pick', args: ['nextOpacities', 'stage'] },
    followedPiece: { op: 'pick', args: ['followed', 'stage'] },
    // Live: the chosen character is the highest toy score (argmax = argmin of -v).
    negScores: { op: 'scale', args: ['toyScores', -1] },
    top: { op: 'argmin', args: ['negScores'] },
    next: { op: 'pick', args: ['candidates', 'top'] },
  },
  objects: [
    text('question', 'What happens between a piece of text and the character the model writes next?', 40, 34),
    note('prerequisites', 'No prerequisites.', 40, 58),
    note('status', 'Source value: the sizes (blocks, characters, numbers per piece). Calculated toy example: the scores.', 40, 80),

    ...stageBoxes,
    ...stageArrows,
    stroke('line', 'loop-down', { x: boxMid(N - 1), y: BOX_Y + BOX_H + 4 }, { x: boxMid(N - 1), y: LOOP_Y }, { opacity: { $derive: 'showLoop' } }),
    stroke('line', 'loop-back', { x: boxMid(N - 1), y: LOOP_Y }, { x: boxMid(0), y: LOOP_Y }, { opacity: { $derive: 'showLoop' } }),
    stroke('arrow', 'loop-up', { x: boxMid(0), y: LOOP_Y }, { x: boxMid(0), y: BOX_Y + BOX_H + 6 }, { opacity: { $derive: 'showLoop' } }),
    note('loop-note', 'the new character joins the text, and the whole trip runs again', boxMid(0) + 12, LOOP_Y + 20, { opacity: { $derive: 'showLoop' } }),

    text('stage-line', '{{stageLine}}', 40, 234, { role: 'prediction' }),

    // Stage 0: the text so far.
    text('context', '“{{context}}”', PANEL_X, 306, { typography: 'heading', opacity: { $derive: 'showText' } }),
    note('context-note', 'The model has read these {{count}} characters of Shakespeare and must guess the next one.', PANEL_X, 340, { opacity: { $derive: 'showText' } }),

    // Stages 1-3: the pieces.
    { id: 'pieces', type: 'tokens', semanticId: 'pieces', conceptId: CONCEPT,
      initialState: { tokens: PIECES, x: PANEL_X, y: CHIP_Y, role: 'input', cellHighlight: { $derive: 'followedPiece' }, opacity: { $derive: 'showChips' } } },

    // Stage 2: the last piece's list plus its place's list (values not drawn).
    ...listRow('piece-list', LIST_Y[0], `the piece “${PIECES[LAST]}”`, '… {{C}} numbers in all, learned in training', 'input'),
    ...listRow('place-list', LIST_Y[1], `+ its place, number ${LAST + 1}`, '… {{C}} numbers, also learned', 'output'),
    ...listRow('sum-list', LIST_Y[2], '= what goes into the blocks', '… still {{C}} numbers, added one by one', 'prediction'),
    note('lists-note', `Every piece gets this. “${PIECES[LAST]}” is also piece ${PIECES.indexOf(PIECES[LAST]) + 1}: the same list for “${PIECES[LAST]}”, a different place list.`, PANEL_X, LIST_Y[2] + 52, { opacity: { $derive: 'showLists' } }),

    // Stage 3: every earlier piece feeds the last one, in each block.
    ...fan,
    stroke('arrow', 'fan-in', { x: chipMid(LAST), y: HUB_Y }, { x: chipMid(LAST), y: CHIP_Y + 40 }, { opacity: { $derive: 'showBlocks' } }),
    note('blocks-note', 'In each of the {{L}} blocks, first every piece mixes in itself and the pieces before it (drawn for the last);', PANEL_X, HUB_Y + 34, { opacity: { $derive: 'showBlocks' } }),
    note('blocks-note-2', 'then every piece is reworked on its own. The last piece, which sees them all, makes the guess.', PANEL_X, HUB_Y + 54, { opacity: { $derive: 'showBlocks' } }),

    // Stage 4: a score per candidate character (toy numbers, 5 of the 65).
    { id: 'scores', type: 'bars', semanticId: 'scores', conceptId: CONCEPT,
      initialState: { label: `scores for ${CE.vocab.length} of the {{V}} characters (toy numbers)`, x: PANEL_X, y: 290, h: 110, cell: 48,
        values: { $derive: 'toyScores' }, labels: CE.vocab, cellHighlight: { $derive: 'top' }, role: 'prediction', opacity: { $derive: 'showScores' } } },
    note('scores-note', 'After “{{context}}”, {{next}} scores highest. Higher score, more likely to be picked.', 300, 360, { opacity: { $derive: 'showScores' } }),

    // Stage 5: the chosen character joins the text.
    { id: 'next-pieces', type: 'tokens', semanticId: 'next-pieces', conceptId: CONCEPT,
      initialState: { tokens: [...PIECES, '{{next}}'], x: PANEL_X, y: CHIP_Y, role: 'input', cellHighlight: PIECES.length, opacity: { $derive: 'showNext' } } },
    note('next-note', '{{next}} is added. Now {{countNext}} characters go in, and the model guesses the one after.', PANEL_X, CHIP_Y + 72, { opacity: { $derive: 'showNext' } }),

    stroke('line', 'panel-floor', { x: PANEL_X - 4, y: PANEL_FLOOR }, { x: boxX(N - 1) + BOX_W, y: PANEL_FLOOR }, { opacity: DIM }),
  ],
  // The replay walks the pipeline left to right.
  timeline: STAGES.flatMap((unused, i) => [
    { at: 0.2 + i * 0.4, action: 'highlight', target: `stage-${i}`, duration: 0.15 },
    { at: 0.5 + i * 0.4, action: 'unhighlight', target: `stage-${i}`, duration: 0.15 },
  ]),
};

export const sources = [
  code('model.py', 170, 193, 'GPT.forward, the whole trip from pieces to scores: "def forward(self, idx, targets=None)".'),
  code('data/shakespeare_char/prepare.py', 24, 33, 'Pieces: one per character. "chars = sorted(list(set(data)))", "stoi = { ch:i for i,ch in enumerate(chars) }", and the encoder "return [stoi[c] for c in s]".'),
  code('model.py', 174, 179, 'Each piece looks up its learned list ("tok_emb = self.transformer.wte(idx)") and each place its own ("pos = torch.arange(0, t, dtype=torch.long, device=device)", "pos_emb = self.transformer.wpe(pos)"); the two are added: "tok_emb + pos_emb". The place list depends only on the position, so the two “a”s of the example get the same piece list and different place lists.'),
  code('model.py', 180, 181, 'The blocks, one after another: "for block in self.transformer.h:" then "x = block(x)".'),
  code('model.py', 103, 106, 'A block is two steps: "x = x + self.attn(self.ln_1(x))" mixes the pieces, then "x = x + self.mlp(self.ln_2(x))" reworks each piece on its own.'),
  code('model.py', 62, 68, 'Inside the mixing step each piece sees itself and earlier pieces only. The default path (PyTorch 2.0 or later) asks the attention kernel for exactly that with "is_causal=True"; the manual path masks later pieces out ("att = att.masked_fill(self.bias[:,:,:T,:T] == 0, float(\'-inf\'))") before the softmax.'),
  code('model.py', 188, 190, 'When generating, only the last piece is turned into scores: "logits = self.lm_head(x[:, [-1], :])".'),
  code('model.py', 324, 328, 'The pick and the loop: "probs = F.softmax(logits, dim=-1)", "idx_next = torch.multinomial(probs, num_samples=1)", then "idx = torch.cat((idx, idx_next), dim=1)" feeds the longer text back in.'),
  code('config/train_shakespeare_char.py', 22, 24, 'The sizes on the card: "n_layer = 6" blocks and "n_embd = 384" numbers per piece.'),
  calculation('Source value', 'Blocks, characters and numbers per piece', 'generate_fixtures.py executed config/train_shakespeare_char.py over train.py\'s defaults (n_layer = 6, n_embd = 384) and counted the distinct characters of the sha-pinned Tiny Shakespeare file as prepare.py does (65).'),
  calculation('Calculated toy example', 'The five scores after "hear me spea"', 'Made-up logits [4, 1, 0.5, 0.2, 0] for the candidates k, r, t, c, l from generate_fixtures.py\'s cross-entropy example ("confident, right" preset) - a toy, not a trained model\'s output. The card picks the largest live; the real model scores all 65 characters.'),
  tinyShakespeare('"hear me spea" is from line 2 of the file: "Before we proceed any further, hear me speak."'),
];

export const evidence = {
  card: 'depth-architecture-overview',
  title: scene.title,
  depth: 'Overview',
  prerequisites: 'No prerequisites.',
  ladderRole: 'The only depth that tells the whole trip as plain cause and effect on one concrete example, including the loop that feeds the chosen character back in - no numbers to manipulate, no shapes, no code paths.',
  learningQuestion: 'What happens between a piece of text and the character the model writes next?',
  concept: 'Text is cut into pieces (characters), each piece becomes a list of learned numbers plus one for its place (added), each block lets every piece mix in itself and earlier pieces and then reworks every piece on its own, the last piece becomes a score per character, one is picked and appended, and the trip repeats.',
  sourceRevision: `${fx.provenance.nanogpt.repo}@${fx.provenance.nanogpt.commit}`,
  provenance: 'Source value: n_layer, n_embd, vocab_size from fx.architecture (config/train_shakespeare_char.py over train.py defaults; distinct characters of the pinned dataset). Calculated toy example: fx.crossEntropy context "hear me spea" and its "confident, right" logits over five candidates. Live: argmax of those logits picks the chosen character.',
  control: 'stage (index, slider with Previous/Next): text, pieces, number lists, blocks, scores, next character.',
  consequence: 'The current stage box lights and every later stage dims; the plain cause/effect line changes; the example panel swaps to that stage\'s picture: the quoted text, 12 character chips, the last piece\'s list plus its place\'s list (ten tinted cells standing for 384 numbers each) and their sum, a fan of earlier pieces into the last one with the block\'s two steps, five toy score bars with k lit, and the text with k appended while the loop arrow lights.',
  interactionPurpose: 'Walk one example through the whole model in order, one visible change per step, so every later depth has a place to hang its detail.',
  task: 'none (explore only - no Practice on this board)',
  capability: 'index slider over six stages; pick-derived stage labels, roles and input-bound opacity per picture; bars with a derived argmax highlight; a derived token appended to the chip row; a highlight walk replays the pipeline.',
};

// Every stage, so a reviewer sees every picture.
export const reviewStates = STAGES.map((unused, stage) => ({ stage }));
