// c24 - the generation loop. Sequence "Generation context", 1 of 3 (this card:
// what each pass is handed; c25: what the prediction depends on; c23: where
// that is cut). Staged, one loop body revealed pass by pass: hand the model all
// of idx, keep the last position's prediction (bold), draw one character (the
// coloured one in the next column), append it (the same character in the next
// row), repeat max_new_tokens times, return idx with the start.
//
// Numbers: the draws are a recorded toy run - the toy bigram at iteration 100,
// the checkpoint train.py's save rule keeps (c18), replayed through generate()
// with the sampling script's settings (gen_training_loss.py recorded.generation).
// The start and max_new_tokens are source values (g.sample). Every row, count
// and option string below is built here from those; nothing is typed.
//
// Replay only: no visible control. The one input, `revealed`, is the practice's
// hidden latch; it gates a separately labelled practice case (a 6-character
// start at pass 5), whose text and tokens are choose()d blank before Check.
import fx from '../fixtures/nanogpt-fixtures.generated.js';
import tl from '../depth/fixtures/training-loss.generated.js';
import g from '../depth/fixtures/generation.generated.js';
import { CHIP_CHAR, CHIP_GAP, CHIP_PAD } from '../../animation-scene.js';
import { code, calculation, tinyShakespeare } from '../sources.js';

const GEN = tl.recorded.generation;
const START = g.sample.start.value;               // one new line
const MAX_NEW = g.sample.max_new_tokens.value;    // 500
if (GEN.start !== START || GEN.settings.max_new_tokens.value !== MAX_NEW) throw new Error('recorded.generation was not replayed with the sampling script\'s settings');
const PASSES = GEN.drawn.length;                  // 8
const P = GEN.practice;
const P_LEN = P.start.length;                     // 6
const HANDED = P_LEN + P.pass - 1;                // 10
const RETURNS = P_LEN + MAX_NEW;                  // 506

// The space shows as 'sp' (c21 precedent), the new line as '⏎'.
const show = ch => (ch === '\n' ? '⏎' : ch === ' ' ? 'sp' : ch);
// Pass k is handed idx = start + the first k − 1 draws.
const ROWS = GEN.drawn.map((unused, i) => [START, ...GEN.drawn.slice(0, i)].map(show));
const DRAWS = GEN.drawn.map(show);
const P_ROW = [...P.start, ...P.drawn.slice(0, P.pass - 1)].map(show);
const P_DRAW = show(P.drawn[P.pass - 1]);

// Layout (scene units = CSS px at scale 1).
const TOK_X = 180;
const ROW_Y = 128;
const PITCH = 36;
const TEXT_DY = 21;   // a body/caption baseline level with a label token row's centre line
const CAPTION_Y = 440; // growth; each caption one LINE under the one before
const LINE = 26;
const BAND_Y = 598;   // below the captions: the reveal never pushes them away from the staircase
const BODY = 15;
const rowY = i => ROW_Y + PITCH * i;
const chipW = token => CHIP_PAD * 2 + token.length * CHIP_CHAR;
// The next column's centre after a row of tokens, and a text of `s` centred on it.
const nextCentre = (tokens, next) => TOK_X + tokens.reduce((sum, t) => sum + chipW(t) + CHIP_GAP, 0) + chipW(next) / 2;
const centredX = (tokens, s) => nextCentre(tokens, s) - (s.length * BODY * 0.6) / 2;
const CONCEPT = 'generation-loop';

const text = (id, value, x, y, extra = {}) => ({ id, type: 'text', semanticId: id, conceptId: CONCEPT,
  initialState: { text: value, x, y, ...extra } });
const note = (id, value, x, y, extra = {}) => text(id, value, x, y, { typography: 'annotation', ...extra });
const tokens = (id, list, y, extra = {}) => ({ id, type: 'tokens', semanticId: id, conceptId: CONCEPT,
  initialState: { x: TOK_X, y, tokens: list, tokenStyle: 'labels', role: 'neutral', ...extra } });
const hidden = { opacity: 0 };
const BAND = { opacity: { $derive: 'bandOp' } };
const captionY = k => CAPTION_Y + LINE * k;

const GROWTH = `Passes 1 to ${PASSES} added ${PASSES} characters: idx grew from ${START.length} character to ${START.length + PASSES}.`;
const BAND_LABEL = `Practice case: start ${P.start} (${P_LEN} characters), pass ${P.pass}`;
const BAND_LINE = `handed ${HANDED} characters · returns ${P_LEN} + ${MAX_NEW} = ${RETURNS}`;
const CAPTIONS = ['growth', 'rule-1', 'rule-2', 'training', 'loop', 'toy'];
// The practice row has no next row to line its draw up with, so an arrow takes
// the next column and the draw the one after: the handed cells count to 10 before it.
const ARROW = '→';

export const scene = {
  id: 'nanogpt-c24-generation-loop',
  title: 'The generation loop',
  width: 960,
  height: 749,                         // the padded content, 748.32: a 960-wide frame draws it at scale 1
  duration: 4,
  inputs: [
    { name: 'revealed', type: 'bool', label: 'Practice case revealed', hidden: true, default: false },
  ],
  exampleData: {
    bandLabelText: BAND_LABEL,
    bandLineText: BAND_LINE,
    bandDrawText: P_DRAW,
    practiceRow: P_ROW,
    placeholder: [],
    blank: ' ',
  },
  // Gating only: out of every display until a committed attempt.
  derived: {
    bandOp: { op: 'choose', args: ['revealed', 1, 0] },
    bandLabel: { op: 'choose', args: ['revealed', 'bandLabelText', 'blank'] },
    bandLine: { op: 'choose', args: ['revealed', 'bandLineText', 'blank'] },
    bandDraw: { op: 'choose', args: ['revealed', 'bandDrawText', 'blank'] },
    bandTokens: { op: 'choose', args: ['revealed', 'practiceRow', 'placeholder'] },
  },
  objects: [
    text('question', 'What does generate() repeat for each new character?', 40, 30, { typography: 'heading' }),
    note('status', `Recorded toy run (a bigram, not NanoGPT; iteration ${GEN.checkpoint}, the kept checkpoint): the draws · Source value: the start`, 40, 56),
    note('builds-on', 'Builds on: generation keeps only the last position’s prediction; a draw is a weighted random pick', 40, 78),
    text('setup', `NanoGPT’s sampling script starts from one new line (⏎). The first ${PASSES} passes of generate():`, 40, 106),

    // The staircase: pass k is handed all of idx; its last position is bold;
    // its draw sits in the next column, above the same character in row k + 1.
    ...ROWS.flatMap((row, i) => [
      text(`pass-${i + 1}`, `pass ${i + 1}`, 40, rowY(i) + TEXT_DY, { typography: 'caption', ...hidden }),
      tokens(`row-${i + 1}`, row, rowY(i), { cellHighlight: row.length - 1, ...hidden }),
      text(`draw-${i + 1}`, DRAWS[i], centredX(row, DRAWS[i]), rowY(i) + TEXT_DY, { role: 'output', ...hidden }),
    ]),

    // Directly under the staircase they explain.
    text('growth', GROWTH, 40, captionY(0), { role: 'output', ...hidden }),
    text('rule-1', 'Each pass hands the model all of idx so far, at most its last block_size characters.', 40, captionY(1), hidden),
    text('rule-2', 'Its last position’s prediction gives a draw, appended and handed to the next pass.', 40, captionY(2), hidden),
    text('training', 'Training scores all positions in one pass: its text is given. Here the newest character is a draw.', 40, captionY(3), hidden),
    text('loop', 'The loop runs max_new_tokens passes, with no other stop, and returns all of idx, the start included.', 40, captionY(4), hidden),

    // The practice case, set apart below the captions: derived opacity, no
    // appear; text and tokens gated too. Before a committed attempt its slot
    // stays empty - the main scene only.
    text('band-label', '{{bandLabel}}', 40, BAND_Y - 10, BAND),
    tokens('band-row', { $derive: 'bandTokens' }, BAND_Y, { cellHighlight: P_ROW.length - 1, ...BAND }),
    text('band-arrow', ARROW, centredX(P_ROW, ARROW), BAND_Y + TEXT_DY, BAND),
    text('band-draw', '{{bandDraw}}', centredX([...P_ROW, ARROW], P_DRAW), BAND_Y + TEXT_DY, { role: 'output', ...BAND }),
    text('band-line', '{{bandLine}}', 40, BAND_Y + 48, BAND),

    // Static and below the band, so the static frame already holds it; it keys
    // the band's row too (sp is only there), and is the one place bold and
    // colour are keyed. The toy note under it qualifies what the bold means.
    note('legend', '⏎ = new line · sp = space · bold: the position whose prediction is drawn from · colour: the draw', 40, BAND_Y + 88),
    note('toy', 'Toy: the bigram reads only the last character it is handed; NanoGPT’s Blocks read the whole row.', 40, BAND_Y + 110, hidden),
  ],
  // Row k and its name at 0.4·(k − 1) s, its draw 0.2 s later - before the row
  // that is handed it; the captions once the eighth draw is in.
  timeline: [
    ...ROWS.flatMap((row, i) => [
      ...[`pass-${i + 1}`, `row-${i + 1}`].map(target => ({ at: Number((0.4 * i).toFixed(1)), action: 'appear', target, duration: 0.2 })),
      { at: Number((0.4 * i + 0.2).toFixed(1)), action: 'appear', target: `draw-${i + 1}`, duration: 0.2 },
    ]),
    ...CAPTIONS.map(target => ({ at: 3.3, action: 'appear', target, duration: 0.3 })),
  ],
};

// Before and after the practice's reveal (a mid-replay capture at 1.5 s is
// taken at the default state).
export const reviewStates = [{ revealed: false }, { revealed: true }];

// Practice (commit before you see): a 6-character start at pass 5, which the
// card never draws - its 1-character start makes "pass k holds k" look like
// the rule. Every number is built from the fixture.
const OPTIONS = {
  lastOnly: [1, RETURNS],
  passNumber: [P.pass, START.length + MAX_NEW],
  newOnly: [HANDED, MAX_NEW],
  full: [HANDED, RETURNS],
};
export const activity = {
  id: 'c24-practice',
  check: 'choice_equals',
  version: 1,
  revealInput: 'revealed',
  prompt: `Suppose NanoGPT’s sampling script starts from ${P.start} (${P_LEN} characters; in shakespeare_char one token ID is one character) instead of one new line, with max_new_tokens = ${MAX_NEW}. In one generate() call, how many characters is the model handed on pass ${P.pass}, and how many characters does generate() return?`,
  // ponytail: SceneActivity shows no pick for an untouched answer, so this
  // naive default never renders; it only satisfies the choice declaration.
  // A one-word label, so all four options fit one row: no option sits alone.
  answer: { type: 'choice', label: 'Characters', default: 'lastOnly',
    options: Object.entries(OPTIONS).map(([id, [handed, returns]]) => ({ id, label: `handed ${handed}, returns ${returns}` })) },
  expected: 'full',
  checkLabel: 'Check',
  // At most two lines each under the chips: one clause per distractor in feedbackFail.
  feedbackPass: `Right. idx is the start plus one draw per earlier pass: pass ${P.pass} is handed ${P_LEN} + ${P.pass - 1} = ${HANDED} characters, all read by NanoGPT’s Blocks. generate() returns the start plus max_new_tokens: ${P_LEN} + ${MAX_NEW} = ${RETURNS}. Only a ${START.length}-character start makes pass k hold k.`,
  feedbackFail: `Not quite. Pass ${P.pass} is handed all of idx, start + (k − 1) = ${P_LEN} + ${P.pass - 1} = ${HANDED} characters: only the last position’s prediction is kept (the toy bigram reads only the last), and pass k holds k only for a ${START.length}-character start. generate() returns idx, which still holds the start: ${P_LEN} + ${MAX_NEW} = ${RETURNS}.`,
};

// Phase 1 plan (docs/nanogpt-deep-dive-batch5-plans.md, c24; verbatim where it fits).
export const plan = {
  concept: 'the control flow of NanoGPT\'s generate(): a loop of exactly max_new_tokens passes with no other stop; each pass hands the model all of idx (idx_cond, at most its last block_size characters), runs one forward whose last position\'s logits are kept, draws one ID and appends it to idx; generate() returns idx itself, the start included. It must be a loop because each pass\'s newest input is the previous pass\'s draw; training scores all positions in one pass because its text is given',
  objective: 'After this card, the learner should understand that generate() is a loop of exactly max_new_tokens passes that each hand the model all of idx so far (at most its last block_size characters), take the prediction at its last position, draw one character from it and append it, so idx grows by one per pass and the returned text is the start plus max_new_tokens characters.',
  prerequisites: [
    'c01-forward-pass (frozen; linked by type only): without targets, forward projects only x[:, [-1], :], giving (B, 1, V). Named in the Builds-on line, not redrawn',
    'c21-temperature (frozen): a draw is one weighted random pick (torch.multinomial). c24 shows only the drawn characters, never probabilities',
    'c06-tokenizer (frozen): in shakespeare_char one token ID is one character, and there are 65 of them',
    'named, not taught: the recorded toy bigram run of c18 and c26, a 65 × 65 table',
  ],
  causalSteps: [
    'start: idx = ⏎, shape (1, 1)',
    'hand over idx: pass k\'s row shows all k characters of idx as label tokens; idx_cond = idx, because t ≤ 256',
    'forward: the row\'s last character is bold - its prediction is the one kept; the Blocks read the whole row to make it',
    'draw: one recorded toy draw, a text object with role output, in the next column',
    'append: the draw sits directly above the same character in the next row, so the staircase\'s diagonal is the text being written',
    'repeat: the loop runs max_new_tokens passes and returns idx, start included',
  ],
  primaryInteraction: 'replay only, as the inventory specifies: no visible control, so no INTERACT row or Reset. The one input is the hidden bool revealed, the practice\'s revealInput (c14, c19). The replay carries causal order: row k at 0.4·(k − 1) s and its draw 0.2 s later, so each draw appears before the row that is handed it; the captions from 3.3 s',
  check: 'practice (commit before you see, choice_equals, revealInput revealed, no fixedInputs): the sampling script starts from ROMEO: (6 characters) with max_new_tokens = 500 - how many characters is the model handed on pass 5, and how many does generate() return? Options handed 1, returns 506 / handed 5, returns 501 / handed 10, returns 500 / handed 10, returns 506; expected handed 10, returns 506. The card draws only the 1-character ⏎ start, so copying "pass k holds k" gives 5 and 501. After a committed attempt the gated practice band shows the 10-character row, its draw and the 10 / 506 line',
  boundary: {
    decision: 'staged',
    reason: 'one staged card with one causal loop body: hand idx, forward (keep the last position), draw, append, repeat max_new_tokens times, return idx. Every caption describes that body or its direct consequences: the growth, the return value, why it is sequential. The no-cache compute line is a second idea (compute cost) and is cut; the depth Deep dive owns it. Kept apart from c25: no probabilities, and never that the draw changes the next prediction, only that the next pass is handed it',
    reviewed: {},
    sequence: { name: 'Generation context', position: 1, of: 3, relationships: [
      { type: 'prerequisite', card: 'c01-forward-pass', direction: 'in' },
      { type: 'prerequisite', card: 'c21-temperature', direction: 'in' },
      { type: 'prerequisite', card: 'c25-autoregressive-conditioning', direction: 'out' },
      { type: 'deepens', card: 'c23-context-window', direction: 'out' },
    ] },
  },
};

const REPRODUCE_TL = 'python packages/web/src/nanogpt/depth/fixtures/gen_training_loss.py --check';
const REPRODUCE_GEN = 'python packages/web/src/nanogpt/depth/fixtures/gen_generation.py --check';
const S = GEN.settings;
const run = fx.toyRun;
const kept = run.checkpoints[run.bestValIndex];
const shown = list => list.map(show).join(' ');

export const sources = [
  code('model.py', 305, 309, 'The function: "def generate(self, idx, max_new_tokens, temperature=1.0, top_k=None):" - "Take a conditioning sequence of indices idx (LongTensor of shape (b,t)) and complete the sequence max_new_tokens times, feeding the predictions back into the model each time."'),
  code('model.py', 312, 312, 'The loop: "for _ in range(max_new_tokens):" - lines 312 to 330 hold no break, so it always runs max_new_tokens passes.'),
  code('model.py', 314, 314, 'What each pass hands the model: "idx_cond = idx if idx.size(1) <= self.config.block_size else idx[:, -self.config.block_size:]" - all of idx while it fits in block_size; the crop is c23\'s. Every row on the card, the practice case\'s included, is shorter than block_size, so there idx_cond = idx.'),
  code('model.py', 316, 318, 'One forward, and only its last position is kept: "logits, _ = self(idx_cond)", then "logits = logits[:, -1, :] / temperature".'),
  code('model.py', 320, 322, `The optional top-k: "v, _ = torch.topk(logits, min(top_k, logits.size(-1)))" - with top_k = ${S.top_k.value} and ${fx.architecture.vocab_size} characters it keeps all of them.`),
  code('model.py', 324, 326, 'One draw: "probs = F.softmax(logits, dim=-1)", then "idx_next = torch.multinomial(probs, num_samples=1)".'),
  code('model.py', 328, 328, 'Append: "idx = torch.cat((idx, idx_next), dim=1)" - idx grows by one per pass.'),
  code('model.py', 330, 330, 'The only return: "return idx" - idx itself, the start included.'),
  code('model.py', 170, 170, 'forward takes no cache: "def forward(self, idx, targets=None):" - every pass runs the whole of idx_cond again.'),
  code('model.py', 180, 181, 'Every Block reads every position of the row: "for block in self.transformer.h:", "x = block(x)".'),
  code('model.py', 189, 190, 'Without targets only the last position is projected (c01): "only forward the lm_head on the very last position", "logits = self.lm_head(x[:, [-1], :])".'),
  code('sample.py', 14, 19, `The sampling settings: start = "\\n" (one new line), "num_samples = 10", "max_new_tokens = ${MAX_NEW} # number of tokens generated in each sample", "temperature = ${S.temperature.value}", "top_k = ${S.top_k.value}", "seed = ${S.seed.value}".`),
  code('sample.py', 80, 81, 'The start becomes idx, shape (1, 1) for one new line: "start_ids = encode(start)", "x = (torch.tensor(start_ids, dtype=torch.long, device=device)[None, ...])".'),
  code('sample.py', 86, 88, 'One generate() call per sample, decoded whole: "y = model.generate(x, max_new_tokens, temperature=temperature, top_k=top_k)", "print(decode(y[0].tolist()))".'),
  code('sample.py', 23, 26, 'A --start override (the practice\'s ROMEO:) goes through "exec(open(\'configurator.py\').read()) # overrides from command line or config file", and each run seeds again: "torch.manual_seed(seed)".'),
  code('sample.py', 37, 38, 'It loads the kept checkpoint: "ckpt_path = os.path.join(out_dir, \'ckpt.pt\')".'),
  code('train.py', 274, 286, 'Which checkpoint that is: "if losses[\'val\'] < best_val_loss or always_save_checkpoint:" … "if iter_num > 0:" … "torch.save(checkpoint, os.path.join(out_dir, \'ckpt.pt\'))".'),
  code('config/train_shakespeare_char.py', 9, 10, '"# we expect to overfit on this small dataset, so only save when val improves", "always_save_checkpoint = False".'),
  code('train.py', 124, 125, 'Why training needs no loop: its text is given, so x and y are read at once - "x = torch.stack([torch.from_numpy((data[i:i+block_size]).astype(np.int64)) for i in ix])" and y the same text shifted by one.'),
  code('train.py', 300, 300, 'and one forward with targets: "logits, loss = model(X, Y)".'),
  code('model.py', 184, 187, 'With targets that forward scores every position, not only the last: "if targets is not None:", "logits = self.lm_head(x)", "loss = F.cross_entropy(logits.view(-1, logits.size(-1)), targets.view(-1), ignore_index=-1)".'),
  code('config/train_shakespeare_char.py', 19, 19, `The card's “at most its last block_size characters”: "block_size = ${fx.architecture.block_size} # context of up to ${fx.architecture.block_size} previous characters".`),
  code('data/shakespeare_char/prepare.py', 30, 35, 'One ID is one character: "stoi = { ch:i for i,ch in enumerate(chars) }" … "return \'\'.join([itos[i] for i in l])".'),
  { ...calculation('Recorded toy run', `The draws, at iteration ${GEN.checkpoint}`,
    `The seeded toy bigram run c18 plots (generate_fixtures.py toy_run, seed ${run.seed}; ${run.model}). gen_training_loss.py copies its weight table at iteration ${GEN.checkpoint}, the checkpoint train.py's save rule keeps (lowest validation loss after iteration 0: ${kept.val}, the same as c18's), and replays generate() on it with the sampling script's settings: logits = the row of the last character of idx ÷ ${S.temperature.value}, top-k ${S.top_k.value} keeps all ${fx.architecture.vocab_size}, softmax, one draw, append. random.Random(${S.seed.value}).choices stands in for torch.multinomial, so these are Python's draws on the toy's probabilities, not NanoGPT's. From one new line: ${shown(GEN.drawn)}. The practice case starts a fresh Random(${S.seed.value}) from ${P.start}, as a --start run seeds again: ${shown(P.drawn)} (sp = space).`),
  reproduce: REPRODUCE_TL },
  { ...calculation('Source value', 'The start and max_new_tokens',
    `The start (one new line) and max_new_tokens = ${MAX_NEW} are parsed from the sampling script by gen_generation.py (g.sample). The rows are the start plus the first k − 1 draws; the count on the card (${START.length} + ${PASSES} = ${START.length + PASSES}) and the practice's counts are the lengths of those strings, computed by the card module.`),
  reproduce: REPRODUCE_GEN },
  tinyShakespeare(`The practice's start, ${P.start}, begins 163 lines of this file.`),
];

export const evidence = {
  card: 'c24-generation-loop',
  title: scene.title,
  learningQuestion: scene.objects[0].initialState.text,
  concept: `generate() (model.py:305-330) is "for _ in range(max_new_tokens):" (:312) with no break; each pass hands the model idx_cond, all of idx up to block_size (:314), runs one forward (:316) whose last position is kept (:318; forward projects only x[:, [-1], :] without targets, :190), draws one ID (:324-326) and appends it (:328); it returns idx, start included (:330). The sampling script starts from one new line with max_new_tokens = ${MAX_NEW} (sample.py:14-16) and decodes the whole of idx (:88). Training scores all positions in one forward because its text is given (train.py:124-125, :300; with targets, model.py:184-187 projects every position).`,
  sourceRevision: `${fx.provenance.nanogpt.repo}@${fx.provenance.nanogpt.commit}`,
  provenance: `source: model.py:170, :180-181, :184-187, :189-190, :305-309, :312, :314, :316-318, :320-322, :324-326, :328, :330; sample.py:14-19, :23-26, :37-38, :80-81, :86-88; train.py:124-125, :274-286, :300; config/train_shakespeare_char.py:9-10, :19; data/shakespeare_char/prepare.py:30-35 - checked against the pinned files. Recorded toy run: tl.recorded.generation (gen_training_loss.py replay() at iteration ${GEN.checkpoint}, the save rule's checkpoint; random.Random(${S.seed.value}).choices for torch.multinomial). Source value: start and max_new_tokens (g.sample, gen_generation.py). Built in the module: the rows, the draw positions, 1 + 8 = 9, 6 + 4 = 10, 6 + 500 = 506 and the option strings.`,
  control: 'none visible (replay only). revealed - a hidden bool owned by the practice, set by a committed attempt.',
  consequence: `The replay builds the staircase pass by pass: row k (${ROWS.map(r => r.join('')).join(', ')}) with its last character bold, then its draw (${DRAWS.join(', ')}) in the next column, before row k + 1 is handed it; the captions follow once the eighth draw is in (idx grew from 1 character to 9). Until a committed practice attempt the band's slot is empty; after it the practice band shows ${P.start} plus ${P.pass - 1} draws (${HANDED} characters, last bold), an arrow, the draw ${P_DRAW} one column past it, and "${BAND_LINE}".`,
  interactionPurpose: 'See that each pass is handed the whole of idx, including the previous pass\'s draw, so generation must run one pass per character, and that generate() returns the start with the new characters.',
  task: `Watch the replay: each draw lands in the next column and the next row is handed it. Practice: from a ${P_LEN}-character start, how many characters is pass ${P.pass} handed, and how many does generate() return? (choice; expected handed ${HANDED}, returns ${RETURNS}).`,
  capability: 'label-style token rows with a constant cellHighlight (the bold last position); role-output text objects for the draws, centred on the next chip column (the practice draw one column further, after an arrow); timeline appears in causal order; a hidden-bool revealInput with choose()d opacity, text and token list (a placeholder empty list) and no appear on the practice band; choice practice graded by choice_equals without fixedInputs; no visible input, so no INTERACT row.',
};
