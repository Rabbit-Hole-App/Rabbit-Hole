// Training and loss - Guided. What number training pushes down, and when to
// stop. The mechanism is the curve loss = -ln p(target): every prediction is a
// dot on it, and the loss being minimized is the average height of the dots.
// One slider walks a recorded toy run; twelve dots move along the curve - six
// positions of a word from the training text ("Citizen", which holds the
// Overview's "z" -> "e") and six of a held-out word ("morrow,") - and two
// tables give their p(target) and -ln p. The training word's mean loss keeps
// falling; some held-out dots climb the curve's steep wall (r -> r in "morrow"
// never occurs in the practice text), which is why validation loss turns up
// while training loss keeps falling. The whole-slice losses, their gap and the lowest held-out
// checkpoint are shown with the slider. A second control picks one of the
// twelve positions to inspect: its dot grows, drop lines read p off the x
// axis and -ln p off the y axis, its two table cells are ringed, and a
// readout gives the same two numbers.
//
// Two headed phases down the left column, the chart they share on the right:
// "1 What is training minimizing?" (the training word's table and mean) over
// "2 When should training stop?" (the held-out word's, then the whole-slice
// losses and the checkpoint to keep). The replay stages them in order, each
// step's content quieter than the one before: phase 1 as (a) the inspected
// position's p -> -ln p on the curve, then (b) the training word's dots, table
// and mean loss; after a beat, phase 2 - introduced by its own heading - the
// held-out word, the whole-slice losses and the checkpoint.
//
// Numbers: per-position p and -ln p are RECORDED from the toy run
// (gen_training_loss.py taps generate_fixtures.py's bigram run - not NanoGPT's
// transformer); the whole-slice losses are fx.toyRun; the means, the gap and
// the change since the lowest checkpoint are arithmetic on those recorded
// numbers, printed to 3 decimals here (a derive op would print 2.19 for
// 2.190); the curve points are a CALCULATED toy example (the card has no log
// op). LIVE: the lowest held-out checkpoint (argmin), the before/at/after
// caption, and every pixel position.
import fx from '../../fixtures/nanogpt-fixtures.generated.js';
import tl from '../fixtures/training-loss.generated.js';
import { axesObjects, seriesMapping, seriesObjects } from '../../plot.js';
import { code, calculation, tinyShakespeare } from '../../sources.js';

const run = fx.toyRun;
const R = tl.recorded;
const [TRAIN, HELD] = R.words;
const K = TRAIN.targets.length; // positions per word (6)
const N = R.iterations.length;
const LAST = N - 1;
const C = tl.curve;

const frame = {
  id: 'nll', x: 500, y: 136, w: 360, h: 270, xDomain: [0, 1], yDomain: [0, 9], conceptId: 'cross-entropy',
  xTicks: [0, 0.5, 1].map(value => ({ value, label: String(value) })),
  yTicks: [0, 2, 4, 6, 8].map(value => ({ value, label: String(value) })),
  xTitle: 'p(target): probability on the true next character', yTitle: 'loss = −ln p(target)',
};
const curveMap = seriesMapping(frame, 'curve', 'curveP', 'curveLoss', C.p.length);
const trMap = seriesMapping(frame, 'tr', 'trP', 'trLoss', K);
const hoMap = seriesMapping(frame, 'ho', 'hoP', 'hoLoss', K);
const uniformY = frame.y + frame.h - (R.uniformLoss / frame.yDomain[1]) * frame.h;

const TABLE = { x: 120, cell: 48 };
const PAIRS = [...TRAIN.targets, ...HELD.targets]; // the inspect control: 6 training positions, then 6 held-out
const DOT = 12, FOCUS_DOT = 20;
const f3 = x => x.toFixed(3);
// A true minus, as in −ln p; ± at zero so the line keeps its width (and the card its frame) at the lowest checkpoint.
const signed = x => `${x > 0 ? '+' : x < 0 ? '−' : '±'}${f3(Math.abs(x))}`;
const r3 = x => Math.round(x * 1000) / 1000; // whole-slice losses as the card prints them
const meanOf = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
const pText = p => p.toPrecision(3); // 3 significant figures: −ln of the shown p matches the cell
// The ringed p (%) cell again, with its leading zero (the shared grid prints 0.9% as ".90"):
// the shown p with its point moved, so the two never round apart.
const pctText = p => `${(Number(pText(p)) * 100).toPrecision(3)}%`;
const trainR = run.checkpoints.map(c => r3(c.train));
const valR = run.checkpoints.map(c => r3(c.val));
const BEST = run.bestValIndex;
const REGIMES = [
  'Both losses are still falling here: keep training.',
  'This is the checkpoint to keep: no later one scores lower on held-out text.',
  'Training loss keeps falling, but held-out loss stays above its lowest: the model is memorising its practice text.',
];

const text = (id, initialState, conceptId = 'cross-entropy') => ({ id, type: 'text', semanticId: id, conceptId, initialState });
const table = (id, word, y, role, cellsName) => ({
  id, type: 'grid', semanticId: id, conceptId: 'cross-entropy',
  initialState: { x: TABLE.x, y, rows: 2, cols: K, cell: TABLE.cell, role, matrixKind: 'input', opacity: 0,
    rowLabels: ['p (%)', '−ln p'], columnLabels: word.targets, values: { $derive: `${id}Values` }, cellHighlight: { $derive: cellsName } },
});
const dots = (prefix, role) => Array.from({ length: K }, (unused, i) => ({
  id: `${prefix}-dot-${i}`, type: 'circle', semanticId: `${prefix}-dot-${i}`, conceptId: 'cross-entropy',
  initialState: { x: { $derive: `${prefix}Px.${i}` }, y: { $derive: `${prefix}Py.${i}` },
    w: { $derive: `${prefix}Size.${i}` }, h: { $derive: `${prefix}Size.${i}` }, role, opacity: 0 },
}));
// The inspected position, per word: its dot's size, and its two table cells (p and -ln p) - none when it is the other word's.
const sizes = offset => PAIRS.map((unused, f) => Array.from({ length: K }, (u, i) => (f === offset + i ? FOCUS_DOT : DOT)));
const cells = offset => PAIRS.map((unused, f) => (f >= offset && f < offset + K ? [f - offset, f - offset + K] : []));
const drop = (id, to) => ({ id, type: 'line', semanticId: id, conceptId: 'cross-entropy',
  initialState: { from: { x: { $derive: 'focusX' }, y: { $derive: 'focusY' } }, to, role: 'observed', opacity: 0 } });

export const scene = {
  id: 'depth-training-loss-guided',
  title: 'Training and loss · Guided: the number it minimizes, and when to stop',
  width: 980,
  height: 680,
  duration: 4.8,
  inputs: [
    { name: 'checkpoint', type: 'index', label: 'Recorded checkpoint', of: 'checkpointLabels', default: LAST, presentation: 'slider' },
    { name: 'focus', type: 'index', label: 'Inspect position', of: 'focusLabels', default: TRAIN.targets.indexOf('z→e'), presentation: 'picker' },
  ],
  exampleData: {
    checkpointLabels: R.iterations.map(it => `iter ${it}`),
    iterations: R.iterations,
    curveP: C.p,
    curveLoss: C.loss,
    trPAll: TRAIN.p,
    trLossAll: TRAIN.loss,
    hoPAll: HELD.p,
    hoLossAll: HELD.loss,
    // Each table, per checkpoint: p as a percentage, then -ln p - picked raw
    // (a derive op would round to 3 decimals first, and cells round again).
    trainTableAll: TRAIN.p.map((ps, k) => [...ps.map(p => p * 100), ...TRAIN.loss[k]]),
    heldTableAll: HELD.p.map((ps, k) => [...ps.map(p => p * 100), ...HELD.loss[k]]),
    trMeanTexts: TRAIN.loss.map(ls => f3(meanOf(ls))),
    hoMeanTexts: HELD.loss.map(ls => f3(meanOf(ls))),
    slicesTexts: R.iterations.map((it, k) => `Whole slices at iter ${it}: train ${f3(trainR[k])}, held-out (val) ${f3(valR[k])}, gap (held-out − train) ${f3(valR[k] - trainR[k])}`),
    changeTexts: R.iterations.map((it, k) => `train ${signed(trainR[k] - trainR[BEST])}, held-out ${signed(valR[k] - valR[BEST])}`),
    valAll: run.checkpoints.map(c => c.val),
    regimes: REGIMES,
    focusLabels: PAIRS,
    focusRoles: PAIRS.map((unused, f) => (f < K ? 'input' : 'prediction')),
    // The inspected position's two recorded numbers: p, and as the percentage its p (%) cell rounds;
    // -ln p to 2 decimals, as its table cell shows it.
    focusTextAll: R.iterations.map((it, k) => PAIRS.map((pair, f) => {
      const [word, i] = f < K ? [TRAIN, f] : [HELD, f - K];
      return `${pair} at iter ${it}: p = ${pText(word.p[k][i])} (${pctText(word.p[k][i])}), −ln p = ${word.loss[k][i].toFixed(2)}`;
    })),
    trSizeAll: sizes(0),
    hoSizeAll: sizes(K),
    trCellsAll: cells(0),
    hoCellsAll: cells(K),
    ...curveMap.exampleData,
    ...trMap.exampleData,
    ...hoMap.exampleData,
  },
  derived: {
    trP: { op: 'pick', args: ['trPAll', 'checkpoint'] },
    trLoss: { op: 'pick', args: ['trLossAll', 'checkpoint'] },
    hoP: { op: 'pick', args: ['hoPAll', 'checkpoint'] },
    hoLoss: { op: 'pick', args: ['hoLossAll', 'checkpoint'] },
    trainTableValues: { op: 'pick', args: ['trainTableAll', 'checkpoint'] },
    heldTableValues: { op: 'pick', args: ['heldTableAll', 'checkpoint'] },
    trMean: { op: 'pick', args: ['trMeanTexts', 'checkpoint'] },
    hoMean: { op: 'pick', args: ['hoMeanTexts', 'checkpoint'] },
    slicesText: { op: 'pick', args: ['slicesTexts', 'checkpoint'] },
    changeText: { op: 'pick', args: ['changeTexts', 'checkpoint'] },
    ...curveMap.derived,
    ...trMap.derived,
    ...hoMap.derived,
    // The inspected position: its dot's centre (the drop lines start there), sizes, cells, readout.
    allPx: { op: 'concat', args: ['trPx', 'hoPx'] },
    allPy: { op: 'concat', args: ['trPy', 'hoPy'] },
    focusX: { op: 'pick', args: ['allPx', 'focus'] },
    focusY: { op: 'pick', args: ['allPy', 'focus'] },
    trSize: { op: 'pick', args: ['trSizeAll', 'focus'] },
    hoSize: { op: 'pick', args: ['hoSizeAll', 'focus'] },
    trCells: { op: 'pick', args: ['trCellsAll', 'focus'] },
    hoCells: { op: 'pick', args: ['hoCellsAll', 'focus'] },
    focusRow: { op: 'pick', args: ['focusTextAll', 'checkpoint'] },
    focusText: { op: 'pick', args: ['focusRow', 'focus'] },
    focusRole: { op: 'pick', args: ['focusRoles', 'focus'] },
    // The lowest held-out checkpoint over the whole run (3-decimal seam rounding, as printed).
    valL: { op: 'scale', args: ['valAll', 1] },
    bestAt: { op: 'argmin', args: ['valL'] },
    bestIt: { op: 'pick', args: ['iterations', 'bestAt'] },
    bestVal: { op: 'pick', args: ['valL', 'bestAt'] },
    // Before / at / after the lowest held-out checkpoint: argmin([d, -0.5, -d]) with d = checkpoint - bestAt.
    cp: { op: 'concat', args: ['checkpoint'] },
    best1: { op: 'concat', args: ['bestAt'] },
    d: { op: 'sub', args: ['cp', 'best1'] },
    negD: { op: 'scale', args: ['d', -1] },
    regimeVector: { op: 'concat', args: ['d', -0.5, 'negD'] },
    regime: { op: 'argmin', args: ['regimeVector'] },
    regimeText: { op: 'pick', args: ['regimes', 'regime'] },
  },
  objects: [
    text('question', { text: 'Which number does training push down - and when should it stop?', x: 40, y: 34, typography: 'heading' }),
    text('prerequisites', { text: 'Builds on: Overview (practice moves the guess onto the right letter); natural log (ln), averages.', x: 40, y: 58, typography: 'annotation' }),
    // The two phases, stacked down the left column over the chart they share (non-breaking
    // spaces: SVG collapses a plain double space). The second arrives with its content.
    text('phase-1', { text: '1\u00a0\u00a0What is training minimizing?', x: 40, y: 100, typography: 'heading' }),
    text('phase-2', { text: '2\u00a0\u00a0When should training stop?', x: 40, y: 344, typography: 'heading', opacity: 0 }),
    ...axesObjects(frame, { tickMarks: false }),
    ...seriesObjects(frame, 'curve', C.p.length, { role: 'neutral' }),
    { id: 'uniform-line', type: 'line', semanticId: 'uniform-line', conceptId: 'cross-entropy',
      initialState: { from: { x: frame.x, y: uniformY }, to: { x: frame.x + frame.w, y: uniformY }, role: 'neutral', opacity: 0.4 } },
    text('uniform-label', { text: `even guess over 65 characters: ${R.uniformLoss.toFixed(2)}`, x: frame.x + 194, y: uniformY - 7, typography: 'annotation' }),
    drop('focus-drop-x', { x: { $derive: 'focusX' }, y: frame.y + frame.h }),
    drop('focus-drop-y', { x: frame.x, y: { $derive: 'focusY' } }),
    ...dots('tr', 'input'),
    ...dots('ho', 'prediction'),
    // Stage 1 shows the inspected position alone; its own dot (same place and size) appears with the rest.
    { id: 'focus-dot', type: 'circle', semanticId: 'focus-dot', conceptId: 'cross-entropy',
      initialState: { x: { $derive: 'focusX' }, y: { $derive: 'focusY' }, w: FOCUS_DOT, h: FOCUS_DOT, role: { $derive: 'focusRole' }, opacity: 0 } },
    // The readout starts on the y tick labels' left edge; the even-guess label ends right of its longest (r→r), so the frame never shifts.
    text('focus', { text: '{{focusText}}', x: frame.x - 20.8, y: 478, role: { $derive: 'focusRole' }, opacity: 0 }),
    text('train-title', { text: `● Training text “${TRAIN.word}” (practised on)`, x: 40, y: 128, role: 'input', opacity: 0 }),
    table('trainTable', TRAIN, 174, 'input', 'trCells'),
    text('train-mean', { text: 'mean of these 6 losses: {{trMean}}', x: TABLE.x, y: 292, opacity: 0 }),
    text('held-title', { text: `● Held-out text “${HELD.word}” (never practised)`, x: 40, y: 372, role: 'prediction', opacity: 0 }),
    table('heldTable', HELD, 418, 'prediction', 'hoCells'),
    text('held-mean', { text: 'mean of these 6 losses: {{hoMean}}', x: TABLE.x, y: 536, typography: 'annotation', opacity: 0 }),
    text('slices', { text: '{{slicesText}}', x: 40, y: 570, typography: 'caption', opacity: 0 }, 'overfitting'),
    text('best', { text: 'Lowest held-out loss in the whole run: iter {{bestIt}} ({{bestVal}}). Now versus it: {{changeText}}', x: 40, y: 594, typography: 'caption', opacity: 0 }, 'overfitting'),
    text('regime', { text: '{{regimeText}}', x: 40, y: 616, typography: 'annotation', opacity: 0 }, 'overfitting'),
    text('status-1', { text: 'Recorded toy run (a bigram model, not NanoGPT): dots, tables, readout, losses, means, gap, change.', x: 40, y: 646, typography: 'annotation' }, 'provenance'),
    text('status-2', { text: 'Calculated toy example: the curve.   Live calculation: the lowest held-out checkpoint and the caption under it.', x: 40, y: 664, typography: 'annotation' }, 'provenance'),
  ],
  timeline: [
    // Phase 1 (What is training minimizing?). a. One position: p -> -ln p on the curve.
    ...Array.from({ length: C.p.length - 1 }, (unused, i) => ({ at: 0.1 + i * 0.05, action: 'appear', target: `curve-seg-${i}`, duration: 0.1 })),
    { at: 0.75, action: 'appear', target: 'focus-dot', duration: 0.25 },
    { at: 0.85, action: 'appear', target: 'focus-drop-x', duration: 0.3 },
    { at: 0.85, action: 'appear', target: 'focus-drop-y', duration: 0.3 },
    { at: 1.0, action: 'appear', target: 'focus', duration: 0.3 },
    // b. The training word: six positions and the mean of their losses.
    { at: 1.5, action: 'appear', target: 'train-title', duration: 0.3 },
    { at: 1.55, action: 'appear', target: 'trainTable', duration: 0.4 },
    ...Array.from({ length: K }, (unused, i) => ({ at: 1.6 + i * 0.07, action: 'appear', target: `tr-dot-${i}`, duration: 0.2 })),
    { at: 2.1, action: 'appear', target: 'train-mean', duration: 0.3 },
    // Phase 2 (When should training stop?), once phase 1 has held for a beat: held-out
    // text, the whole-slice losses and the checkpoint to keep.
    { at: 3.0, action: 'appear', target: 'phase-2', duration: 0.3 },
    { at: 3.5, action: 'appear', target: 'held-title', duration: 0.3 },
    { at: 3.55, action: 'appear', target: 'heldTable', duration: 0.4 },
    ...Array.from({ length: K }, (unused, i) => ({ at: 3.6 + i * 0.07, action: 'appear', target: `ho-dot-${i}`, duration: 0.2 })),
    { at: 4.05, action: 'appear', target: 'held-mean', duration: 0.3 },
    { at: 4.2, action: 'appear', target: 'slices', duration: 0.3 },
    { at: 4.35, action: 'appear', target: 'best', duration: 0.3 },
    { at: 4.5, action: 'appear', target: 'regime', duration: 0.3 },
  ],
};
for (const object of scene.objects) {
  if (/^curve-seg-/.test(object.id)) object.initialState.opacity = 0;
}

const REPRODUCE = 'python packages/web/src/nanogpt/depth/fixtures/gen_training_loss.py --check';
const best = run.checkpoints[run.bestValIndex];
const final = run.checkpoints[run.finalIndex];

export const sources = [
  code('model.py', 187, 187, 'NanoGPT’s training loss: “loss = F.cross_entropy(logits.view(-1, logits.size(-1)), targets.view(-1), ignore_index=-1)” - −ln p(target) at every position, averaged. The card’s dots are single positions; the whole-slice numbers are that average.'),
  code('train.py', 216, 228, 'estimate_loss(): the same loss on both the train and the val split (NanoGPT averages eval_iters random batches; the toy run averages each whole slice exactly).'),
  code('train.py', 274, 275, '“if losses[\'val\'] < best_val_loss or always_save_checkpoint:” - the checkpoint kept is the one with the lowest validation loss so far.'),
  code('config/train_shakespeare_char.py', 9, 10, '“# we expect to overfit on this small dataset, so only save when val improves” / “always_save_checkpoint = False”.'),
  code('data/shakespeare_char/prepare.py', 37, 40, 'The held-out text: “train_data = data[:int(n*0.9)]”, “val_data = data[int(n*0.9):]” - the last 10% is never trained on.'),
  { ...calculation('Recorded toy run', 'Per-position predictions and whole-slice losses',
    `A seeded toy run (generate_fixtures.py toy_run, seed ${run.seed}): ${run.model}, trained with AdamW, NanoGPT's get_lr and clipping on the first ${run.config.train_chars} characters of the training split. gen_training_loss.py calls it unchanged and copies its weight table at all ${N} checkpoints (every ${run.config.eval_interval} iterations); for each position of “${TRAIN.word}” (training text, character ${TRAIN.at}) and “${HELD.word}” (held-out text, character ${HELD.at} of the validation split) it records p(target) = softmax of the previous character's row (6 decimals) and −ln p(target) (4 decimals). Whole-slice losses are exact means over the ${run.config.train_chars}-character training slice and the first ${run.config.val_chars.toLocaleString('en-US')} validation characters (fx.toyRun): lowest validation loss at iteration ${best.iteration} (${best.val}), final ${final.iteration}: train ${final.train}, val ${final.val}. The card prints the whole-slice losses rounded to 3 decimals and, from those same recorded numbers, each word's mean loss (the average of its six −ln p), the gap (held-out − train) and the change since the lowest checkpoint, all to 3 decimals; the inspected position's readout repeats its recorded p and −ln p.`),
  reproduce: REPRODUCE },
  { ...calculation('Calculated toy example', 'The curve loss = −ln p',
    `gen_training_loss.py: ${C.p.length} points (p, −ln p) from p = 0.00013 to 1, in float64 (4 decimals); the card joins them with straight segments. The card has no log op, so the curve is computed there.`),
  reproduce: REPRODUCE },
  calculation('Live calculation', 'Lowest checkpoint, caption, positions',
    'Computed on the card as the controls move: the lowest held-out checkpoint over the whole run (argmin over the recorded val losses) and the before/at/after caption (argmin); dot positions map p and −ln p to pixels (scale, add), and the inspected dot’s drop lines start at its position (concat, pick).'),
  tinyShakespeare('Both words come from this file: “Citizen” from prepare.py’s training split, “morrow,” from its validation split.'),
];

export const evidence = {
  card: 'depth-training-loss-guided',
  title: scene.title,
  learningQuestion: scene.objects[0].initialState.text,
  concept: 'The number training minimizes is the average of −ln p(target) over positions: confident-right predictions cost almost nothing, confident-wrong ones cost a lot (the curve’s steep wall). Held-out text is scored the same way; when its loss stops falling while the training loss keeps falling, the model is fitting its practice text, and the checkpoint to keep is the one with the lowest held-out loss.',
  sourceRevision: `${fx.provenance.nanogpt.repo} @ ${fx.provenance.nanogpt.commit}`,
  provenance: 'Recorded toy run: per-position p and −ln p at 21 checkpoints (gen_training_loss.py tapping generate_fixtures.py’s bigram run) and whole-slice train/val losses (fx.toyRun). The means, gap and change since the lowest checkpoint are arithmetic on those recorded numbers, printed to 3 decimals. Calculated toy example: 14 points of −ln p. Live calculation: argmin of val, the regime caption, all pixel positions and the inspected dot’s drop lines. Source: model.py:187 loss line, train.py:216-228 estimate_loss, train.py:274-275 save rule, config/train_shakespeare_char.py:9-10, prepare.py:37-40 split.',
  control: 'checkpoint (index, slider) "Recorded checkpoint" over the 21 recorded checkpoints, iter 0..1000 - picks stored results; nothing trains. focus (index, picker) "Inspect position": one of the 12 positions (C→i … e→n of the training word, m→o … w→, of the held-out word).',
  consequence: 'Twelve dots slide along the fixed −ln p curve (most training-text dots toward p = 1, two held-out dots up the steep wall near p = 0); both tables’ p (%) and −ln p cells and their means change; the whole-slice line gives train, held-out and their gap; the lowest held-out checkpoint (iter 100) and the change since it update, with a caption for before / at / after it. The inspected position’s dot grows, two drop lines read its p off the x axis and its −ln p off the y axis, its two cells are ringed in its table, and a readout gives both numbers (p also as the percentage its cell rounds, with its leading zero).',
  interactionPurpose: 'Drag from iter 0 (every dot near the even guess, 4.17) to iter 1000, and pick positions to inspect, and verify on the card: the inspected dot’s drop lines land on its p and its −ln p, each dot sits on loss = −ln p, each mean is the average of its six losses, the gap is held-out minus train, and after iter 100 train keeps falling while held-out never gets back down to its lowest (it dips at iters 300, 450 and 700, but stays above iter 100).',
  task: 'Find the checkpoint after which the held-out loss never gets back down to its lowest; then inspect r→r and w→, and say why their losses climb the steep wall while z→e slides to 0 (their pairs never occur in the practice text).',
  capability: 'plot.js curve (14 points) with 12 derived dots on one frame, their sizes picked by the inspect input; two drop lines from the picked dot to both axes; two 2x6 grids with row/column labels and an input-bound cellHighlight; picked 3-decimal readouts; live argmin; a three-way regime caption via argmin([d, -0.5, -d]); two numbered phase headings grouping the left column (1 What is training minimizing?: training word; 2 When should training stop?: held-out word and the checkpoint) beside the shared chart; a replay staged phase 1 (inspected position, then training word and its mean) and, after a beat, phase 2 introduced by its own heading (held-out word, the checkpoint), each step’s content in quieter type (body, body, caption/annotation).',
  depth: 'Guided',
  prerequisites: 'Overview (practice moves the guess onto the right letter); natural log, averages.',
  ladderRole: 'Names the minimized number and makes it checkable: −ln p per position, its average, the train/held-out gap and the lowest-held-out stopping rule, all as numbers that move with a checkpoint slider, and one position at a time read off the curve’s two axes - the Overview has no formula or numbers to verify, the Deep dive leaves this toy and follows train.py’s code path.',
};

const at = pair => PAIRS.indexOf(pair);
export const reviewStates = [
  { checkpoint: 0, focus: at('z→e') }, { checkpoint: 1, focus: at('z→e') }, { checkpoint: 2, focus: at('r→r') },
  { checkpoint: 4, focus: at('w→,') }, { checkpoint: 10, focus: at('i→t') }, { checkpoint: LAST, focus: at('r→r') },
];
