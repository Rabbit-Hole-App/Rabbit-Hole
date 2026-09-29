// Generation and sampling - Overview. How a language model writes: read the
// end of the text, score every possible next character, pick one at random in
// proportion to its score, add it to the text, repeat. The one control steps
// through a recorded generation, so the learner sees each pick become part of
// the text the next step reads - and the next scores change with it.
//
// Grounding: NanoGPT's generate() loop (model.py @3adf61e) does exactly these
// four things per new token. Numbers: a recorded toy run from
// depth/fixtures/gen_generation.py - a character counting model over Tiny
// Shakespeare's training split that reads the last 3 characters, sampled at
// generate()'s own defaults (temperature 1.0, no top-k) with seed 1337.
// Python's random.choices stands in for torch.multinomial. No numbers are
// printed; bar heights are the recorded probabilities. A space shows as ␣ in
// the text row and in the captions that quote it, so a picked space is visible.
import g from '../fixtures/generation.generated.js';
import { code, calculation, tinyShakespeare } from '../../sources.js';

const STEPS = g.overview.steps;
// The first step where the favourite lost: the card's own example of a less
// likely pick winning.
const UPSET = STEPS.findIndex(s => s.pickedRank > 0);
const CONCEPT = 'autoregressive-generation';
const quoted = c => (c === 'space' ? 'a space' : c === 'newline' ? 'a new line' : `“${c}”`);
const chips = s => [...s].map(c => (c === ' ' ? '␣' : c));

const text = (id, value, x, y, extra = {}) => ({ id, type: 'text', semanticId: id, conceptId: CONCEPT,
  initialState: { text: value, x, y, ...extra } });
const note = (id, value, x, y, extra = {}) => text(id, value, x, y, { typography: 'annotation', ...extra });
const box = (id, label, x) => ({ id, type: 'box', semanticId: id, conceptId: CONCEPT,
  initialState: { label, x, y: LOOP_Y, w: BOX_W, h: 44, opacity: 0, role: 'neutral' } });
const stroke = (id, type, from, to) => ({ id, type, semanticId: id, conceptId: CONCEPT,
  initialState: { from, to, opacity: 0, role: 'neutral' } });

const TEXT_Y = 120;
const PROMPT_W = g.prompt.length * 49.5; // chip pitch: 16 + 9.5 + 16 + 8 gap per character
const LOOP_Y = 200;
const LOOP_MID = LOOP_Y + 22;
const BOX_W = 206;
const BOX_X = [24, 262, 500, 738];
const READ_Y = LOOP_Y + 66;
const RETURN_Y = 300;
const BARS = { x: 24, y: 370, h: 120, cell: 64 };
const SAY_X = 372;

export const scene = {
  id: 'depth-generation-overview',
  title: 'Generation and sampling · Overview: one character at a time',
  width: 960,
  height: 556,
  duration: 2.4,
  inputs: [
    { name: 'step', type: 'index', label: 'Step through the writing', of: 'stepLabels', default: 0, presentation: 'picker' },
  ],
  exampleData: {
    stepLabels: STEPS.map((s, i) => `Step ${i + 1}`),
    stepCount: STEPS.length,
    block: g.block,
    promptChips: chips(g.prompt),
    written: STEPS.map((s, i) => chips(STEPS.slice(0, i + 1).map(t => (t.picked === 'space' ? ' ' : t.picked)).join(''))),
    // The captions quote the same ␣ the text row shows, so a space is visible there too.
    windows: STEPS.map(s => chips(s.window).join('')),
    nextWindows: STEPS.map(s => chips(s.nextWindow).join('')),
    shownByStep: STEPS.map(s => s.shown),
    probsByStep: STEPS.map(s => s.probs),
    pickedRank: STEPS.map(s => s.pickedRank),
    picks: STEPS.map(s => quoted(s.picked)),
    nextFavourites: STEPS.map(s => quoted(s.nextFavourite)),
    favourites: STEPS.map(s => quoted(s.favourite)),
    // The "picked" mark rides just above the picked bar (layout only).
    markX: STEPS[0].shown.map((c, i) => BARS.x + i * BARS.cell + 9),
    markBase: STEPS[0].shown.map(() => BARS.y + BARS.h - 10),
    // What the pick was, in words: the favourite, or a less likely character.
    verdicts: STEPS.map(s => (s.pickedRank === 0 ? `The random pick landed on the favourite, ${quoted(s.picked)}.`
      : `${quoted(s.favourite)} was the favourite, but the random pick landed on ${quoted(s.picked)}.`)),
  },
  derived: {
    stepLabel: { op: 'pick', args: ['stepLabels', 'step'] },
    writtenNow: { op: 'pick', args: ['written', 'step'] },
    window: { op: 'pick', args: ['windows', 'step'] },
    nextWindow: { op: 'pick', args: ['nextWindows', 'step'] },
    shown: { op: 'pick', args: ['shownByStep', 'step'] },
    probs: { op: 'pick', args: ['probsByStep', 'step'] },
    rank: { op: 'pick', args: ['pickedRank', 'step'] },
    picked: { op: 'pick', args: ['picks', 'step'] },
    nextFavourite: { op: 'pick', args: ['nextFavourites', 'step'] },
    verdict: { op: 'pick', args: ['verdicts', 'step'] },
    favourite: { op: 'pick', args: ['favourites', 'step'] },
    rise: { op: 'scale', args: ['probs', -(BARS.h - 4)] },
    markYs: { op: 'add', args: ['rise', 'markBase'] },
    markY: { op: 'pick', args: ['markYs', 'rank'] },
    markAt: { op: 'pick', args: ['markX', 'rank'] },
  },
  objects: [
    text('question', 'How does a language model write text, one character at a time?', 24, 32),
    note('prerequisites', 'No prerequisites.', 24, 56),
    note('status', 'Recorded toy run: a small model that counts characters in Shakespeare, not NanoGPT itself.', 24, 76),

    // The text so far: the prompt, then what the model has added.
    { id: 'prompt', type: 'tokens', semanticId: 'prompt', conceptId: CONCEPT,
      initialState: { label: 'the start we give it', x: 24, y: TEXT_Y, opacity: 0, role: 'neutral', tokens: { $derive: 'promptChips' } } },
    { id: 'written', type: 'tokens', semanticId: 'written', conceptId: CONCEPT,
      initialState: { label: 'added by the model (newest lit)', x: 24 + PROMPT_W, y: TEXT_Y, opacity: 0, role: 'output',
        tokens: { $derive: 'writtenNow' }, cellHighlight: { $derive: 'step' }, cellHighlightKind: 'highlight' } },

    // The loop, left to right, and back round to the start.
    box('read', '1 Read the end', BOX_X[0]),
    box('score', '2 Score each option', BOX_X[1]),
    box('pick', '3 Pick one at random', BOX_X[2]),
    box('add', '4 Add it to the text', BOX_X[3]),
    ...[0, 1, 2].map(i => stroke(`step-${i}`, 'arrow', { x: BOX_X[i] + BOX_W + 4, y: LOOP_MID }, { x: BOX_X[i + 1] - 4, y: LOOP_MID })),
    stroke('back-1', 'line', { x: BOX_X[3] + BOX_W, y: LOOP_MID }, { x: 950, y: LOOP_MID }),
    stroke('back-2', 'line', { x: 950, y: LOOP_MID }, { x: 950, y: RETURN_Y }),
    stroke('back-3', 'line', { x: 950, y: RETURN_Y }, { x: 10, y: RETURN_Y }),
    stroke('back-4', 'line', { x: 10, y: RETURN_Y }, { x: 10, y: LOOP_MID }),
    stroke('back-5', 'arrow', { x: 10, y: LOOP_MID }, { x: 20, y: LOOP_MID }),
    note('repeat', 'repeat, with one more character each time', 400, RETURN_Y + 18),

    // What each stage did at this step, under its box.
    text('read-now', 'reads the last {{block}}: “{{window}}”', BOX_X[0] + 8, READ_Y),
    text('score-now', 'most likely: {{favourite}}', BOX_X[1] + 8, READ_Y),
    text('pick-now', 'picked {{picked}}', BOX_X[2] + 8, READ_Y, { role: 'output' }),
    text('add-now', 'now ends “{{nextWindow}}”', BOX_X[3] + 8, READ_Y),

    // Stage 2's scores: the five most likely next characters, the pick lit.
    { id: 'bars', type: 'bars', semanticId: 'next-letter-scores', conceptId: CONCEPT,
      initialState: { label: 'the 5 most likely next characters (taller means more likely)', x: BARS.x, y: BARS.y, h: BARS.h, cell: BARS.cell,
        peak: 1, opacity: 0, role: 'output', labels: { $derive: 'shown' }, values: { $derive: 'probs' },
        cellHighlight: { $derive: 'rank' }, cellHighlightKind: 'highlight' } },
    note('picked-mark', 'picked', { $derive: 'markAt' }, { $derive: 'markY' }, { role: 'output', opacity: 0 }),

    // Cause and effect at this step.
    text('say-step', '{{stepLabel}} of {{stepCount}}', SAY_X, BARS.y, { typography: 'heading' }),
    text('say-pick', '{{verdict}}', SAY_X, BARS.y + 36),
    text('say-join', 'The pick joins the text, so the next step reads “{{nextWindow}}”', SAY_X, BARS.y + 62),
    text('say-next', 'and scores again from there: now {{nextFavourite}} leads.', SAY_X, BARS.y + 86),
    note('say-random', 'The pick is random, weighted by the bars: a less likely one', SAY_X, BARS.y + 118),
    note('say-random-2', `can win, as ${quoted(STEPS[UPSET].picked)} beat the favourite ${quoted(STEPS[UPSET].favourite)} at step ${UPSET + 1}.`, SAY_X, BARS.y + 136),
  ],
  timeline: [
    { at: 0.0, action: 'appear', target: 'prompt', duration: 0.3 },
    { at: 0.2, action: 'appear', target: 'written', duration: 0.3 },
    { at: 0.4, action: 'appear', target: 'read', duration: 0.3 },
    { at: 0.6, action: 'appear', target: 'step-0', duration: 0.2 },
    { at: 0.7, action: 'appear', target: 'score', duration: 0.3 },
    { at: 0.9, action: 'appear', target: 'step-1', duration: 0.2 },
    { at: 1.0, action: 'appear', target: 'pick', duration: 0.3 },
    { at: 1.2, action: 'appear', target: 'step-2', duration: 0.2 },
    { at: 1.3, action: 'appear', target: 'add', duration: 0.3 },
    ...['back-1', 'back-2', 'back-3', 'back-4', 'back-5'].map((target, i) => ({ at: 1.6 + i * 0.08, action: 'appear', target, duration: 0.15 })),
    { at: 2.0, action: 'appear', target: 'bars', duration: 0.4 },
    { at: 2.2, action: 'appear', target: 'picked-mark', duration: 0.2 },
  ],
};

const REPRODUCE = 'python packages/web/src/nanogpt/depth/fixtures/gen_generation.py --check';

export const sources = [
  code('model.py', 312, 328, 'generate() repeats these steps once per new token: “idx_cond = idx if idx.size(1) <= self.config.block_size else idx[:, -self.config.block_size:]” (read the end), “logits, _ = self(idx_cond)” (score), “idx_next = torch.multinomial(probs, num_samples=1)” (pick at random) and “idx = torch.cat((idx, idx_next), dim=1)” (add it to the text).'),
  code('model.py', 306, 306, `“def generate(self, idx, max_new_tokens, temperature=1.0, top_k=None):” - the recorded run uses these defaults: temperature ${g.generateDefaults.temperature}, no top-k.`),
  { ...calculation('Recorded toy run', `${STEPS.length} generation steps from “${g.prompt}”`,
    `gen_generation.py: a toy character model that counts which character followed the last ${g.block} characters in Tiny Shakespeare's training split (the first 90%, ${g.trainChars.toLocaleString('en-US')} characters, as prepare.py splits it); its score for a character is ln(count), so each probability is count ÷ total. Starting from “${g.prompt}”, each step draws one character with Python's random.choices (seed ${g.seed}, standing in for torch.multinomial) and appends it. The bars show the five most likely characters at each step; every recorded pick was among them. Not NanoGPT's trained transformer.`),
    reproduce: REPRODUCE },
  code('data/shakespeare_char/prepare.py', 24, 25, `“chars = sorted(list(set(data)))” - the ${g.vocabSize} characters a shakespeare_char model can write.`),
  code('data/shakespeare_char/prepare.py', 38, 39, '“train_data = data[:int(n*0.9)]” - the training split the toy counts over.'),
  tinyShakespeare('The text the toy model counts; “First Citi” is its opening, cut mid-word.'),
];

export const evidence = {
  card: 'depth-generation-overview',
  title: scene.title,
  learningQuestion: scene.objects[0].initialState.text,
  concept: 'A language model writes one token at a time: it reads the end of the text, scores every possible next token, picks one at random in proportion to the scores, appends it, and repeats. Each pick becomes part of the text the next step reads, so it changes the next scores.',
  sourceRevision: `${g.provenance.nanogpt}`,
  provenance: 'Recorded toy run: gen_generation.py counts next characters after each 3-character window in Tiny Shakespeare\'s training split and samples 8 steps from "First Citi" at generate()\'s defaults (temperature 1.0, top_k None) with random.choices(seed 1337). The loop mirrors model.py generate() lines 312-328.',
  control: 'step (index picker, Step 1..Step 8) through the recorded generation.',
  consequence: 'The written characters grow by one and the newest is lit; the loop captions show what was read and picked; the bars switch to that step\'s five most likely next characters with the pick lit; the cause/effect lines name the favourite, the pick and the new ending the next step reads.',
  interactionPurpose: 'Step forward and watch one pick change what the model reads next: at step 1 the favourite "z" loses to "o", the text ends "tio" instead of "tiz", and "n" jumps to the front of the next scores.',
  task: 'Step from 1 to 2 and say why the bars changed; find a step where the pick was not the favourite and describe what happened to the text.',
  capability: 'index picker over recorded steps; pick derive ops into recorded per-step lists; variable-length derived token row with a derived highlight; bars with derived labels, values and highlight on a fixed peak; boxes, arrows and lines drawing a closed loop.',
  depth: 'Overview',
  prerequisites: 'None.',
  ladderRole: 'Only this depth shows the whole write-read loop over many steps, so the learner sees that each random pick feeds the next prediction; it uses no numbers, formulas or code.',
};

// Five of the eight steps: the favourite losing (1), winning (2), a 5th-ranked
// pick (4), a 2nd-ranked pick after a strong favourite (6) and the last step (8).
export const reviewStates = STEPS.map((s, i) => ({ step: i })).filter((s, i) => [0, 1, 3, 5, 7].includes(i));

// Cross-depth transitions (docs/nanogpt-depth-ladder.md): c24 runs the four
// steps as generate()'s loop over idx, c25 says what each pick changes about
// the next prediction. No prerequisite: the card treats scoring as a black box.
export const transitions = [
  { relation: 'deepens_to', target_card: 'c24-generation-loop' },
  { relation: 'deepens_to', target_card: 'c25-autoregressive-conditioning' },
];
