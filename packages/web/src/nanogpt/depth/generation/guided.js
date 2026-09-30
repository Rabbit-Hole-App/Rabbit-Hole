// Generation and sampling - Guided. How temperature changes what gets picked:
// the same first step as the Overview (after "First Citi" the toy reads
// "iti"), its eight candidate characters, and the arithmetic generate() does
// to them - logits ÷ T, then softmax - live, under one temperature slider.
// Relationships the learner can check on the card: at T = 1 each probability
// is the character's count share (141 ÷ 296); ÷ T stretches every logit gap by
// 1/T, so the order never changes while the spread does; the leader's lead is
// p(z) ÷ p(o) = e^(gap ÷ T) = (141 ÷ 82)^(1/T); lower T puts more of the same
// 20 seeded draws on the top character.
//
// Numbers: counts, logits = ln(count) and the p(z) ÷ p(o) ratio per preset
// are a calculated toy example, and
// the 20 draws per preset a recorded toy run, both from
// depth/fixtures/gen_generation.py (same toy counting model as the Overview;
// the draws reuse seed 1337 at every preset, so they differ only because the
// probabilities do). ÷ T, softmax, the top character, the gap, the count
// share and the expected count are live derive ops here.
import g from '../fixtures/generation.generated.js';
import { code, calculation, tinyShakespeare } from '../../sources.js';

const F = g.first;
const P = g.guided.presets;
const HALF = g.guided.draws / 2;
const TOP = F.display[0];
const CONCEPT = 'temperature-sampling';
const T1 = P.findIndex(p => p.temperature === 1);
const notTop = (drawn, from) => drawn.slice(from, from + HALF).flatMap((d, i) => (d === TOP ? [] : [i]));

const text = (id, value, x, y, extra = {}) => ({ id, type: 'text', semanticId: id, conceptId: CONCEPT,
  initialState: { text: value, x, y, ...extra } });
const note = (id, value, x, y, extra = {}) => text(id, value, x, y, { typography: 'annotation', ...extra });

const GX = 150;
const CELL = 52;
const COLS = F.display.length;
const ROW_Y = [176, 266, 356];
const BARS = { y: 428, h: 100 };
const RX = GX + COLS * CELL + 36;
const DRAWS_Y = 596;

// Only the first grid names the columns; the two below line up under it.
const grid = (id, label, rowLabel, y, values, matrixKind, extra) => ({ id, type: 'grid', semanticId: id, conceptId: CONCEPT,
  initialState: { ...(label ? { label } : { columnLabels: [...F.display] }), x: GX, y, rows: 1, cols: COLS, cell: CELL, opacity: 0,
    rowLabels: [rowLabel], values: { $derive: values }, matrixKind, ...extra } });

export const scene = {
  id: 'depth-generation-guided',
  title: 'Generation and sampling · Guided: temperature reshapes the odds',
  width: 960,
  height: 720,
  duration: 2.9,
  inputs: [
    { name: 'temperature', type: 'index', label: 'Temperature T', of: 'presetLabels', default: T1, presentation: 'slider' },
  ],
  exampleData: {
    presetLabels: P.map(p => p.label),
    invTByPreset: P.map(p => p.invT),
    relationByPreset: P.map(p => (p.temperature < 1 ? 'Sharper than' : p.temperature > 1 ? 'Flatter than' : 'The same as')),
    ratioByPreset: P.map(p => p.ratio),
    logits: F.logits,
    counts: F.counts,
    total: F.total,
    invTotal: 1 / F.total,
    prompt: g.prompt,
    window: F.window,
    block: g.block,
    countList: F.display.map((c, i) => `${c} ${F.counts[i]}`).join(' · '),
    topCount: F.counts[0],
    secondCount: F.counts[1],
    top: TOP,
    columnNames: [...F.display],
    second: F.display[1],
    draws: g.guided.draws,
    drawnTopByPreset: P.map(p => p.drawnTop),
    drawsFirst: P.map(p => p.drawn.slice(0, HALF)),
    drawsSecond: P.map(p => p.drawn.slice(HALF)),
    notTopFirst: P.map(p => notTop(p.drawn, 0)),
    notTopSecond: P.map(p => notTop(p.drawn, HALF)),
    t1Label: P[T1].label,
  },
  derived: {
    tLabel: { op: 'pick', args: ['presetLabels', 'temperature'] },
    invT: { op: 'pick', args: ['invTByPreset', 'temperature'] },
    scaled: { op: 'scale', args: ['logits', 'invT'] },     // logits / temperature
    probs: { op: 'softmax', args: ['scaled'] },            // F.softmax
    negProbs: { op: 'scale', args: ['probs', -1] },
    topAt: { op: 'argmin', args: ['negProbs'] },           // argmax by composition
    topName: { op: 'pick', args: ['columnNames', 'topAt'] },
    pTop: { op: 'pick', args: ['probs', 0] },
    pSecond: { op: 'pick', args: ['probs', 1] },
    relation: { op: 'pick', args: ['relationByPreset', 'temperature'] },
    // The gap between the two leading logits, and that gap ÷ T.
    rawTop: { op: 'pick', args: ['logits', 0] },
    rawSecond: { op: 'pick', args: ['logits', 1] },
    rawTopVec: { op: 'concat', args: ['rawTop'] },
    rawSecondVec: { op: 'concat', args: ['rawSecond'] },
    rawGapVec: { op: 'sub', args: ['rawTopVec', 'rawSecondVec'] },
    rawGap: { op: 'pick', args: ['rawGapVec', 0] },
    gapVec: { op: 'scale', args: ['rawGapVec', 'invT'] },
    gap: { op: 'pick', args: ['gapVec', 0] },
    ratio: { op: 'pick', args: ['ratioByPreset', 'temperature'] },
    // At T = 1, softmax(ln count) is count ÷ total.
    shares: { op: 'scale', args: ['counts', 'invTotal'] },
    shareTop: { op: 'pick', args: ['shares', 0] },
    drawnTop: { op: 'pick', args: ['drawnTopByPreset', 'temperature'] },
    pTopVec: { op: 'concat', args: ['pTop'] },
    expectedVec: { op: 'scale', args: ['pTopVec', 'draws'] },
    expected: { op: 'pick', args: ['expectedVec', 0] },
    drawsA: { op: 'pick', args: ['drawsFirst', 'temperature'] },
    drawsB: { op: 'pick', args: ['drawsSecond', 'temperature'] },
    markA: { op: 'pick', args: ['notTopFirst', 'temperature'] },
    markB: { op: 'pick', args: ['notTopSecond', 'temperature'] },
  },
  objects: [
    text('question', 'How does temperature change which character gets picked next?', 24, 32),
    note('prerequisites', 'Builds on: Overview (the pick is random, weighted by the scores); softmax.', 24, 56),
    note('status', 'Calculated toy example: counts, logits, ratio · Live calculation: ÷ T and softmax · Recorded toy run: the draws', 24, 76),
    text('context', 'After “{{prompt}}” the toy model reads the last {{block}}, “{{window}}”, and scores 8 characters.', 24, 108),
    note('counts', 'How often each followed “{{window}}” in Shakespeare: {{countList}}  (total {{total}})', 24, 130),

    grid('logits', null, 'ln(count)', ROW_Y[0], 'logits', 'input', { role: 'input' }),
    grid('scaled', 'logits ÷ T at {{tLabel}}  (live)', '÷ T', ROW_Y[1], 'scaled', 'derived', { role: 'neutral' }),
    grid('probs', 'softmax → probabilities, summing to 1  (live)', 'p', ROW_Y[2], 'probs', 'derived',
      { role: 'output', distribution: true, heat: true, valueScale: 'fixed' }),
    { id: 'bars', type: 'bars', semanticId: 'probability-bars', conceptId: CONCEPT,
      initialState: { x: GX, y: BARS.y, h: BARS.h, cell: CELL, peak: 1, opacity: 0, role: 'output', distribution: true,
        labels: [...F.display], values: { $derive: 'probs' }, cellHighlight: { $derive: 'topAt' }, cellHighlightKind: 'highlight' } },
    note('bars-axis', 'Bars: fixed axis, top = 1.', RX, BARS.y + BARS.h - 6),
    // The leader's lead, as a ratio the learner can check with a calculator.
    text('ratio', 'Lead p(“{{top}}”) ÷ p(“{{second}}”) = {{ratio}}', RX, BARS.y + 30),
    note('ratio-2', '= ({{topCount}} ÷ {{secondCount}})^(1/T) = e^(gap ÷ T)', RX, BARS.y + 50),
    note('ratio-3', 'rounded p: {{pTop}} ÷ {{pSecond}} ≈ {{ratio}}', RX, BARS.y + 68),

    // What the learner can check at this temperature.
    text('t-now', '{{tLabel}}', RX, ROW_Y[0] + 4, { typography: 'heading' }),
    text('relation', '{{relation}} {{t1Label}}', RX, ROW_Y[0] + 30),
    text('p-top', 'p(“{{top}}”) = {{pTop}},  p(“{{second}}”) = {{pSecond}}', RX, ROW_Y[0] + 56),
    text('order', 'Top is still “{{topName}}”.', RX, ROW_Y[0] + 82),
    text('gap', 'Gap “{{top}}” − “{{second}}”: {{rawGap}} ÷ T = {{gap}}', RX, ROW_Y[1] + 34),
    text('share', 'At {{t1Label}}, p = count ÷ total:', RX, ROW_Y[2] + 20),
    text('share-2', '{{topCount}} ÷ {{total}} = {{shareTop}}', RX, ROW_Y[2] + 44),
    note('share-3', 'Softmax undoes the ln: e^ln(count) = count.', RX, ROW_Y[2] + 64),

    // Recorded seeded draws at this temperature, the same seed every time.
    { id: 'draws-a', type: 'tokens', semanticId: 'recorded-draws-1', conceptId: CONCEPT,
      initialState: { label: '{{draws}} recorded draws at {{tLabel}} (same random seed at every T; bold = not “{{top}}”)', x: 24, y: DRAWS_Y, opacity: 0,
        role: 'observed', tokenStyle: 'labels', tokens: { $derive: 'drawsA' }, cellHighlight: { $derive: 'markA' } } },
    { id: 'draws-b', type: 'tokens', semanticId: 'recorded-draws-2', conceptId: CONCEPT,
      initialState: { x: 24, y: DRAWS_Y + 34, opacity: 0, role: 'observed', tokenStyle: 'labels',
        tokens: { $derive: 'drawsB' }, cellHighlight: { $derive: 'markB' } } },
    text('draw-count', '{{drawnTop}} of {{draws}} draws were “{{top}}”', RX, DRAWS_Y + 12, { role: 'output' }),
    note('expected', 'expected about {{expected}}  (= {{draws}} × p(“{{top}}”))', RX, DRAWS_Y + 34),
    note('lower-t', 'Lower T: more draws land on “{{top}}”.', RX, DRAWS_Y + 52),

    // The card's takeaway: true at every preset (all T > 0, distinct counts), so it never changes with the slider.
    text('takeaway', 'Temperature changes how sharp the odds are; it doesn’t change their ordering.', 24, DRAWS_Y + 96, { typography: 'heading', opacity: 0 }),
  ],
  timeline: [
    { at: 0.0, action: 'appear', target: 'logits', duration: 0.4 },
    { at: 0.5, action: 'appear', target: 'scaled', duration: 0.4 },
    { at: 1.0, action: 'appear', target: 'probs', duration: 0.4 },
    { at: 1.4, action: 'appear', target: 'bars', duration: 0.4 },
    { at: 2.0, action: 'appear', target: 'draws-a', duration: 0.3 },
    { at: 2.2, action: 'appear', target: 'draws-b', duration: 0.3 },
    { at: 2.6, action: 'appear', target: 'takeaway', duration: 0.3 },
  ],
};

const REPRODUCE = 'python packages/web/src/nanogpt/depth/fixtures/gen_generation.py --check';

export const sources = [
  code('model.py', 318, 318, '“logits = logits[:, -1, :] / temperature” - the ÷ T row: every logit divided by the same T.'),
  code('model.py', 324, 324, '“probs = F.softmax(logits, dim=-1)” - the probability row.'),
  code('model.py', 326, 326, '“idx_next = torch.multinomial(probs, num_samples=1)” - one weighted random draw; generate() always samples, whatever T.'),
  code('model.py', 306, 306, `“def generate(self, idx, max_new_tokens, temperature=1.0, top_k=None):” - T = ${g.generateDefaults.temperature} unless the caller sets it.`),
  code('sample.py', 17, 17, `“temperature = 0.8 # 1.0 = no change, < 1.0 = less random, > 1.0 = more random, in predictions” - sample.py's own setting, one of the presets here.`),
  { ...calculation('Calculated toy example', `Counts and logits after “${F.window}”`,
    `gen_generation.py: how often each character followed “${F.window}” in Tiny Shakespeare's training split (${F.display.map((c, i) => `${c} ${F.counts[i]}`).join(', ')}; total ${F.total}), and logit = ln(count) rounded to 4 decimals - a toy counting model that reads the last ${g.block} characters, not NanoGPT's transformer. With logit = ln(count), softmax at T = 1 returns count ÷ total exactly. The ratio p(${TOP}) ÷ p(${F.display[1]}) per preset is taken from the unrounded probabilities, to 3 decimals; it equals e^(gap ÷ T) = (${F.counts[0]} ÷ ${F.counts[1]})^(1/T).`),
    reproduce: REPRODUCE },
  calculation('Live calculation', 'logits ÷ T, softmax and the checks beside them',
    'Computed on the card when T moves: scale(logits, 1/T), softmax, the top character (argmin of −p), the gap between the two leading logits before and after ÷ T (sub), the count shares (scale(counts, 1/total)) and the expected count 20 × p(top). Captions show 3 decimals; cells show 2, formatted once from the unrounded value.'),
  { ...calculation('Recorded toy run', `${g.guided.draws} seeded draws per temperature preset`,
    `gen_generation.py: for each preset, Python's random.choices(seed ${g.seed}) draws ${g.guided.draws} characters from that preset's probabilities. The seed is the same at every preset, so the draws change only because the probabilities do. Not torch.multinomial and not live sampling.`),
    reproduce: REPRODUCE },
  tinyShakespeare(`The counts come from its training split (first 90%, as data/shakespeare_char/prepare.py splits it).`),
];

export const evidence = {
  card: 'depth-generation-guided',
  title: scene.title,
  learningQuestion: scene.objects[0].initialState.text,
  concept: 'generate() divides the last position\'s logits by T and softmaxes them. Dividing by T multiplies every logit gap by 1/T: below 1 the gaps widen and the top character takes more probability, above 1 they shrink and the probability spreads; the order never changes. With ln(count) logits, T = 1 gives each character its count share.',
  sourceRevision: g.provenance.nanogpt,
  provenance: 'Calculated toy example: counts after "iti", logits = ln(count) and p(z) ÷ p(o) per preset from gen_generation.py. Live calculation: scale, softmax, argmin(−p), sub of the two leading logits (and of the two leading ÷ T cells), scale(counts, 1/total), 20 × p(top). Recorded toy run: 20 random.choices draws per preset, seed 1337 at every preset. Code: model.py 318, 324, 326, 306; sample.py 17.',
  control: 'temperature (index slider) over six presets T = 0.25, 0.5, 0.8 (sample.py\'s value), 1.0 (generate()\'s default), 1.5, 2.0; default T = 1.0.',
  consequence: 'The ÷ T row, the probability row and bars recompute; p of the top two, the gap after ÷ T, the p(z) ÷ p(o) ratio and the "sharper/flatter than T = 1.0" caption update; the recorded draws and their top count switch to the preset, beside the live expected count.',
  interactionPurpose: 'Sweep T and verify four relationships by hand: the gap after ÷ T equals the ln-count gap divided by T; the top character never changes; p(z) ÷ p(o) = (141 ÷ 82)^(1/T) = e^(gap ÷ T); at T = 1 p(z) equals 141 ÷ 296. Then compare how many of the same 20 seeded draws land on z at low and high T.',
  task: 'Set T = 0.5 and check that the z − o gap doubled; say what happened to p(z) and to the number of z draws. Then set T = 2.0 and explain why only 4 of the 20 draws are z while f, v and c turn up (none of them did at T = 1.0).',
  capability: 'index slider over presets; scale/softmax/argmin/sub/concat/pick derive ops; three column-aligned grids with row labels (input, derived, fixed-scale heat distribution); bars on a fixed peak; derived token rows with derived bold marks; live text relationships.',
  depth: 'Guided',
  prerequisites: 'Overview (the weighted random pick); softmax.',
  ladderRole: 'Only this depth puts real numbers on the pick and lets the learner move T and verify the arithmetic (gap ÷ T, the lead p(z) ÷ p(o) = e^(gap ÷ T), count share at T = 1, order kept, draw counts).',
};

export const reviewStates = [0, 1, 2, 3, 4, 5].map(temperature => ({ temperature }));

// Cross-depth transitions (docs/nanogpt-depth-ladder.md): c21 is the same ÷ T,
// softmax and 20 seeded draws on another toy, plus the not-greedy argument.
// ponytail: no softmax card or edge - NC9 found none needed: the T = 1 lines work e^ln(count) = count ÷ total and the lead line e^(gap ÷ T); add a card only if the tutor’s T8 branch needs one.
export const transitions = [
  { relation: 'related', target_card: 'c21-temperature' },
];
