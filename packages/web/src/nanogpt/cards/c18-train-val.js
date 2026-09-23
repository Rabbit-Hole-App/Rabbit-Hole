// Card 18 - train vs validation loss, and which checkpoint train.py's save
// rule keeps. Two curves on ONE shared loss axis from a RECORDED toy run (a
// character-bigram table trained by generate_fixtures.py - not NanoGPT's
// transformer). The slider inspects one checkpoint; the practice asks which
// one the "save only if val improved" rule (train.py:274) leaves in ckpt.pt
// when applied at THIS run's evaluations (every 50 iterations - the
// shakespeare_char config evaluates less often). Nothing marks the minimum
// until a committed attempt flips the hidden bestRevealed latch.
import fx from '../fixtures/nanogpt-fixtures.generated.js';
import { axesObjects, seriesMapping, seriesObjects } from '../plot.js';

const run = fx.toyRun;
// Iteration 0 (~ln 65) sits far above the rest; it is stated in text, not plotted.
const plotted = run.checkpoints.slice(1);
const N = plotted.length;
const iterationsPlotted = plotted.map(c => c.iteration);
const BEST = run.bestValIndex - 1;
const FINAL = run.finalIndex - 1;
const best = plotted[BEST];
const final = plotted[FINAL];
const chars = n => n.toLocaleString('en-US');
// Feedback prints losses exactly as the readout does (the seam's 3-decimal round).
const f3 = x => String(Math.round(x * 1000) / 1000);
const every = run.config.eval_interval;
// shakespeare_char's resolved config (fx.config, read from the pinned source).
const cs = fx.config.shakespeareChar;
// Python spelling, as config/train_shakespeare_char.py:10 writes it.
const py = b => (b ? 'True' : 'False');
const settings = keys => keys.map(k => `${k} ${run.config[k]}`).join(', ');

const frame = {
  id: 'loss', x: 80, y: 72, w: 800, h: 320, xDomain: [0, 1000], yDomain: [2.0, 3.3],
  xTicks: [250, 500, 750, 1000].map(value => ({ value, label: `iter ${value}` })),
  yTicks: [2.0, 3.0].map(value => ({ value, label: value.toFixed(1) })),
  conceptId: 'overfitting',
};
const trainMap = seriesMapping(frame, 'train', 'iterations', 'trainLoss', N);
const valMap = seriesMapping(frame, 'val', 'iterations', 'valLoss', N);

const text = (id, initialState, conceptId = 'overfitting') => ({ id, type: 'text', semanticId: id, conceptId, initialState });

export const scene = {
  id: 'nanogpt-c18-train-val',
  title: 'Train vs validation loss: which checkpoint to keep',
  width: 960,
  height: 628,
  duration: 3,
  inputs: [
    { name: 'checkpoint', type: 'index', label: 'Inspect recorded checkpoint', of: 'checkpointLabels', default: FINAL, presentation: 'slider' },
    { name: 'bestRevealed', type: 'bool', label: 'Best checkpoint revealed', hidden: true, default: false },
  ],
  exampleData: {
    checkpointLabels: iterationsPlotted.map(i => `iter ${i}`),
    iterations: iterationsPlotted,
    trainRecorded: plotted.map(c => c.train),
    valRecorded: plotted.map(c => c.val),
    // All 21 checkpoints, iteration 0 included: position i here is the
    // checkpoint just BEFORE plotted position i, so pick(..., 'checkpoint')
    // reads the previous checkpoint with no index arithmetic.
    iterationsAll: run.checkpoints.map(c => c.iteration),
    trainAllRecorded: run.checkpoints.map(c => c.train),
    valAllRecorded: run.checkpoints.map(c => c.val),
    ...trainMap.exampleData,
    ...valMap.exampleData,
    initialLossNote: run.initialLossNote,
    seed: run.seed,
    rev: fx.provenance.nanogpt.commit.slice(0, 7),
    trainChars: chars(run.config.train_chars),
    valChars: chars(run.config.val_chars),
    evalInterval: every,
    charEvalInterval: cs.eval_interval,
    charAlwaysSave: py(cs.always_save_checkpoint),
    signs: ['', '+'],
    refPrev: 'Change since the previous checkpoint',
    refKept: 'Change vs the kept checkpoint',
    statusHidden: 'Nothing marks the best checkpoint yet - step through them and compare the val numbers in the readout.',
    statusRevealed: `Green ring = target: lowest val loss among this run's every-${every}-iteration evaluations - what train.py:274 keeps.`,
  },
  derived: {
    // The recorded 4-decimal losses, rounded once by the seam to 3 decimals so
    // every readout number - and the gap and changes computed from them - agrees.
    trainLoss: { op: 'scale', args: ['trainRecorded', 1] },
    valLoss: { op: 'scale', args: ['valRecorded', 1] },
    trainAll: { op: 'scale', args: ['trainAllRecorded', 1] },
    valAll: { op: 'scale', args: ['valAllRecorded', 1] },
    gaps: { op: 'sub', args: ['valLoss', 'trainLoss'] },
    ...trainMap.derived,
    ...valMap.derived,
    it: { op: 'pick', args: ['iterations', 'checkpoint'] },
    train: { op: 'pick', args: ['trainLoss', 'checkpoint'] },
    val: { op: 'pick', args: ['valLoss', 'checkpoint'] },
    gap: { op: 'pick', args: ['gaps', 'checkpoint'] },
    trainMarkX: { op: 'pick', args: ['trainPx', 'checkpoint'] },
    trainMarkY: { op: 'pick', args: ['trainPy', 'checkpoint'] },
    valMarkX: { op: 'pick', args: ['valPx', 'checkpoint'] },
    valMarkY: { op: 'pick', args: ['valPy', 'checkpoint'] },
    // The target, found live on the plotted validation series (never typed).
    bestAt: { op: 'argmin', args: ['valLoss'] },
    ringX: { op: 'pick', args: ['valPx', 'bestAt'] },
    ringY: { op: 'pick', args: ['valPy', 'bestAt'] },
    ringOpacity: { op: 'choose', args: ['bestRevealed', 1, 0] },
    status: { op: 'choose', args: ['bestRevealed', 'statusRevealed', 'statusHidden'] },
    // Change line: vs the previous checkpoint while exploring, vs the kept one
    // once a committed attempt has revealed it.
    prevIt: { op: 'pick', args: ['iterationsAll', 'checkpoint'] },
    prevTrain: { op: 'pick', args: ['trainAll', 'checkpoint'] },
    prevVal: { op: 'pick', args: ['valAll', 'checkpoint'] },
    bestIt: { op: 'pick', args: ['iterations', 'bestAt'] },
    bestTrain: { op: 'pick', args: ['trainLoss', 'bestAt'] },
    bestVal: { op: 'pick', args: ['valLoss', 'bestAt'] },
    refName: { op: 'choose', args: ['bestRevealed', 'refKept', 'refPrev'] },
    refIt: { op: 'choose', args: ['bestRevealed', 'bestIt', 'prevIt'] },
    refTrain: { op: 'choose', args: ['bestRevealed', 'bestTrain', 'prevTrain'] },
    refVal: { op: 'choose', args: ['bestRevealed', 'bestVal', 'prevVal'] },
    now: { op: 'concat', args: ['train', 'val'] },
    ref: { op: 'concat', args: ['refTrain', 'refVal'] },
    change: { op: 'sub', args: ['now', 'ref'] },
    dTrain: { op: 'pick', args: ['change', 0] },
    dVal: { op: 'pick', args: ['change', 1] },
    // A rise prints "+": argmin([d, 0]) is 1 exactly when d > 0.
    dTrainVsZero: { op: 'concat', args: ['dTrain', 0] },
    dValVsZero: { op: 'concat', args: ['dVal', 0] },
    dTrainUp: { op: 'argmin', args: ['dTrainVsZero'] },
    dValUp: { op: 'argmin', args: ['dValVsZero'] },
    dTrainSign: { op: 'pick', args: ['signs', 'dTrainUp'] },
    dValSign: { op: 'pick', args: ['signs', 'dValUp'] },
  },
  objects: [
    text('question', { text: 'Training loss keeps falling - so why keep an earlier checkpoint?', x: 40, y: 34, typography: 'heading' }),
    // Drawn first so the curves and the inspected dots sit on top of it.
    // Invisible until a committed attempt reveals it (no appear event).
    { id: 'best-ring', type: 'circle', semanticId: 'best-val-ring', conceptId: 'checkpoint-selection',
      initialState: { x: { $derive: 'ringX' }, y: { $derive: 'ringY' }, w: 30, h: 30, role: 'output', opacity: { $derive: 'ringOpacity' } } },
    ...axesObjects(frame, { tickMarks: false }),
    ...seriesObjects(frame, 'train', N, { role: 'input' }),
    ...seriesObjects(frame, 'val', N, { role: 'prediction' }),
    // Direct labels, each just beside the curve it names.
    text('legend-val', { text: 'validation loss - {{valChars}} characters it never trains on', x: 300, y: 158, typography: 'annotation', role: 'prediction' }),
    text('legend-train', { text: 'training loss - the {{trainChars}}-character slice it trains on', x: 300, y: 312, typography: 'annotation', role: 'input' }),
    { id: 'train-mark', type: 'circle', semanticId: 'inspected-train', conceptId: 'overfitting',
      initialState: { x: { $derive: 'trainMarkX' }, y: { $derive: 'trainMarkY' }, w: 12, h: 12, role: 'observed', opacity: 0 } },
    { id: 'val-mark', type: 'circle', semanticId: 'inspected-val', conceptId: 'overfitting',
      initialState: { x: { $derive: 'valMarkX' }, y: { $derive: 'valMarkY' }, w: 12, h: 12, role: 'observed', opacity: 0 } },
    text('readout', { text: 'Inspected (dark dots) - iteration {{it}}: train {{train}}, val {{val}}, gap (val - train) {{gap}}', x: 40, y: 448, opacity: 0 }),
    text('change', { text: '{{refName}} (iter {{refIt}}): train {{dTrainSign}}{{dTrain}}, val {{dValSign}}{{dVal}}', x: 40, y: 474, opacity: 0 }),
    text('status', { text: '{{status}}', x: 40, y: 500, typography: 'annotation' }, 'checkpoint-selection'),
    text('initial-loss', { text: 'Off the chart - {{initialLossNote}}', x: 40, y: 522, typography: 'annotation' }),
    // One provenance paragraph, pre-split into single lines (text never wraps).
    text('prov-1', { text: "Recorded toy run (generate_fixtures.py, seed {{seed}}): a character-bigram table, NOT NanoGPT's transformer, trained", x: 40, y: 552, typography: 'annotation' }, 'provenance'),
    text('prov-2', { text: "with AdamW + NanoGPT's get_lr; exact whole-slice losses every {{evalInterval}} iters (NanoGPT's estimate_loss, train.py:216-228,", x: 40, y: 571, typography: 'annotation' }, 'provenance'),
    text('prov-3', { text: 'averages random batches). Live calculation: gap, changes, ring. Source @{{rev}}: train.py:274 saves only if', x: 40, y: 590, typography: 'annotation' }, 'provenance'),
    text('prov-4', { text: 'val < best_val_loss or always_save_checkpoint - {{charAlwaysSave}} in train_shakespeare_char.py:10, which evals every {{charEvalInterval}} (:5).', x: 40, y: 609, typography: 'annotation' }, 'provenance'),
  ],
  timeline: [
    ...Array.from({ length: N - 1 }, (unused, i) => [
      { at: 0.2 + i * 0.08, action: 'appear', target: `train-seg-${i}`, duration: 0.12 },
      { at: 0.2 + i * 0.08, action: 'appear', target: `val-seg-${i}`, duration: 0.12 },
    ]).flat(),
    { at: 1.9, action: 'appear', target: 'train-mark', duration: 0.3 },
    { at: 1.9, action: 'appear', target: 'val-mark', duration: 0.3 },
    { at: 2.2, action: 'appear', target: 'readout', duration: 0.3 },
    { at: 2.2, action: 'appear', target: 'change', duration: 0.3 },
  ],
};

// Segments start hidden and draw in left to right with the timeline above.
for (const object of scene.objects) {
  if (/^(train|val)-seg-/.test(object.id)) object.initialState.opacity = 0;
}

const whyNotFinal = `The final checkpoint (iter ${final.iteration}) has lower training loss (${f3(final.train)} vs ${f3(best.train)}) but higher validation loss (${f3(final.val)} vs ${f3(best.val)}): the model kept fitting the ${chars(run.config.train_chars)}-character training slice after it stopped improving on unseen text.`;

export const activity = {
  id: 'c18-practice',
  check: 'index_equals',
  version: 1,
  prompt: `train.py:274 (always_save_checkpoint = ${py(cs.always_save_checkpoint)}, as in shakespeare_char) saves only when validation loss beats the best earlier evaluation. Applied at this toy run's evaluations, every ${every} iterations, which checkpoint would be left in ckpt.pt?`,
  // ponytail: SceneActivity shows no pick for an untouched answer, so this
  // naive default never renders; the Explore slider's default is the anchor.
  answer: { type: 'index', label: 'Checkpoint to keep', of: 'checkpointLabels', default: FINAL },
  expected: BEST,
  revealInput: 'bestRevealed',
  checkLabel: 'Check',
  feedbackPass: `Right: iter ${best.iteration} has the lowest validation loss (${f3(best.val)}) of these evaluations, so train.py:274's rule leaves it in ckpt.pt. ${whyNotFinal} The shakespeare_char config evaluates every ${cs.eval_interval} iterations, with the comment "keep frequent because we'll overfit" (config/train_shakespeare_char.py:5).`,
  feedbackFail: `Not the lowest validation loss. The rule keeps the minimum of the VALIDATION curve - not the lowest training loss and not simply the last checkpoint. The kept checkpoint is iter ${best.iteration} (val ${f3(best.val)}); neighbouring checkpoints look almost level on the plot, so compare the val numbers in the readout. ${whyNotFinal} The green ring now marks it.`,
};

export const evidence = {
  card: 'c18-train-val',
  title: scene.title,
  learningQuestion: 'Training loss keeps falling - so why keep an earlier checkpoint?',
  concept: `Overfitting and checkpoint selection: NanoGPT evaluates both splits (train.py:216-228 estimate_loss, an average of eval_iters random batches) at iter_num % eval_interval == 0 (train.py:263) and saves only when validation loss improves (train.py:274, always_save_checkpoint = ${py(cs.always_save_checkpoint)} in config/train_shakespeare_char.py:10). The card applies that rule at this toy run's evaluations every ${every} iterations; shakespeare_char's own eval_interval is ${cs.eval_interval} (config:5).`,
  sourceRevision: `karpathy/nanoGPT @ ${fx.provenance.nanogpt.commit}`,
  provenance: `Recorded toy run: ${run.model}, trained by generate_fixtures.py (seed ${run.seed}) with AdamW, NanoGPT's get_lr executed from train.py, and global-norm gradient clipping as in train.py. AdamW and clipping settings read from source (${run.configFromSource.from}): ${settings(run.configFromSource.keys)}. Toy-scale choices, not source: ${settings(run.configToyChoices)}. Losses are exact averages over the ${run.config.train_chars}-char training slice and the ${run.config.val_chars}-char validation slice every ${every} iters (NanoGPT's estimate_loss averages random batches instead). Rounding to 3 decimals, the gap, the change line and the ring's argmin are live calculations. The save rule and config are source.`,
  control: `checkpoint (index slider over the ${N} recorded checkpoints, ${plotted[0].iteration}..${final.iteration}) - picks stored results, no training runs`,
  consequence: 'Dark dots move to the inspected checkpoint on both curves; the readout shows its train loss, val loss and the live gap, and a live change line shows how both losses moved since the previous checkpoint (after a committed practice attempt: versus the kept checkpoint, which a ring then marks).',
  interactionPurpose: 'Step through checkpoints to see training loss keep falling while validation loss turns up - the reason the save rule keeps an earlier checkpoint.',
  task: 'Practice: pick the checkpoint train.py:274\'s save rule would leave in ckpt.pt at this run\'s evaluations (lowest validation loss), resisting the final checkpoint.',
  capability: 'Line plot composed from line/text/circle primitives via plot.js (two series, one shared axis), input-bound markers, live argmin, live change line with sign via argmin/pick, commit-gated reveal via a hidden bool and choose-derived opacity.',
};
