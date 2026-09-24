// Training and loss - Overview. How practice makes a model better at
// guessing the next letter, as cause and effect: one fixed context ("First
// Citiz", the right next letter is "e"), the model's whole guess over its 65
// characters at four points of a recorded toy run, and the average loss over
// the practice text with a marker at the same point. One control: how much
// practice. Plain words; no equations, no shapes.
//
// Numbers: all RECORDED from the toy run generate_fixtures.py performs (a
// character bigram table trained on 1,200 characters of Tiny Shakespeare -
// not NanoGPT's transformer; it looks only at the last letter). The 65 shares
// after "z" at iterations 0/50/200/1000 and the loss on that guess come from
// gen_training_loss.py, which taps the same run's weight table; the average
// loss curve is fx.toyRun. Picking a stop runs nothing.
import fx from '../../fixtures/nanogpt-fixtures.generated.js';
import tl from '../fixtures/training-loss.generated.js';
import { axesObjects, seriesMapping, seriesObjects } from '../../plot.js';
import { code, calculation, tinyShakespeare } from '../../sources.js';

const O = tl.recorded.overview;
const run = fx.toyRun;
const N = run.checkpoints.length;
const STOP_AT = O.stops.map(s => run.checkpoints.findIndex(c => c.iteration === s.iteration));
const stepsText = it => (it === 0 ? 'before practice' : `after ${it.toLocaleString('en-US')} steps`);
// One decimal under 10%, so the untrained 1.6% does not read as 2%.
const pct = p => (p < 0.1 ? `${(p * 100).toFixed(1)}%` : `${Math.round(p * 100)}%`);
const FLAT = O.stops[0].probs; // before practice: every share between these two

// 65 bars, one per character, in the vocabulary's own order.
const BARS = { x: 40, y: 180, h: 140, cell: 11 };
const PILES_X = 812; // the same guess as two piles: "e" and the other 64 together
const BAR_SPAN = BARS.h - 4; // the renderer draws a bar (h - 4) * value / peak tall
const markX = BARS.x + O.targetIndex * BARS.cell + BARS.cell / 2 - 5;
const RIGHT_X = 550; // readout and captions; they end left of the piles' right edge, so the frame never shifts

const frame = {
  id: 'avg', x: 90, y: 390, w: 420, h: 110, xDomain: [0, 1000], yDomain: [2.0, 4.4], conceptId: 'training',
  xTicks: [{ value: 0, label: '0' }, { value: 500, label: '500' }, { value: 1000, label: '1,000 steps' }],
  yTicks: [2, 3, 4].map(value => ({ value, label: String(value) })),
};
const avgMap = seriesMapping(frame, 'avg', 'iterations', 'avgLoss', N);

const CAPTIONS = [
  ['Before practice every character gets about the', 'same small share, so “e” is a long shot.'],
  ['After 50 steps the share piles onto “e”, and', 'the loss drops: on this guess and on average.'],
  ['After 200 steps: more share on “e”, lower', 'loss. The average now falls only slowly.'],
  ['“e” is almost certain after 1,000 steps. Other', 'letters are harder, so the average stays higher.'],
];

const text = (id, initialState) => ({ id, type: 'text', semanticId: id, conceptId: 'training', initialState });

export const scene = {
  id: 'depth-training-loss-overview',
  title: 'Training and loss · Overview: practice moves the guess',
  width: 960,
  height: 530,
  duration: 2.4,
  inputs: [
    { name: 'stop', type: 'index', label: 'How much practice', of: 'stopLabels', default: 0, presentation: 'picker' },
  ],
  exampleData: {
    stopLabels: O.stops.map(s => stepsText(s.iteration)),
    stopProbs: O.stops.map(s => s.probs),
    pctTexts: O.stops.map(s => pct(s.pTarget)),
    // The same guess as two piles: "e", and whatever "e" does not hold (shares sum to 1).
    piles: O.stops.map(s => [s.pTarget, Math.round((1 - s.pTarget) * 1e4) / 1e4]),
    lossTexts: O.stops.map(s => s.loss.toFixed(2)),
    stopCheckpoint: STOP_AT,
    iterations: run.checkpoints.map(c => c.iteration),
    avgLoss: run.checkpoints.map(c => c.train),
    avgTexts: run.checkpoints.map(c => c.train.toFixed(2)),
    markYOffset: O.vocab.map(() => BARS.y + BARS.h - 12),
    captionsA: CAPTIONS.map(c => c[0]),
    captionsB: CAPTIONS.map(c => c[1]),
    // The flat carpet is ~2px tall, so before practice a note says how low it is.
    flatOpacities: O.stops.map((unused, k) => (k === 0 ? 1 : 0)),
    ...avgMap.exampleData,
  },
  derived: {
    probs: { op: 'pick', args: ['stopProbs', 'stop'] },
    rise: { op: 'scale', args: ['probs', -BAR_SPAN] },
    markYs: { op: 'add', args: ['rise', 'markYOffset'] },
    markY: { op: 'pick', args: ['markYs', O.targetIndex] },
    pctText: { op: 'pick', args: ['pctTexts', 'stop'] },
    pile: { op: 'pick', args: ['piles', 'stop'] },
    lossText: { op: 'pick', args: ['lossTexts', 'stop'] },
    at: { op: 'pick', args: ['stopCheckpoint', 'stop'] },
    avgText: { op: 'pick', args: ['avgTexts', 'at'] },
    ...avgMap.derived,
    dotX: { op: 'pick', args: ['avgPx', 'at'] },
    dotY: { op: 'pick', args: ['avgPy', 'at'] },
    captionA: { op: 'pick', args: ['captionsA', 'stop'] },
    captionB: { op: 'pick', args: ['captionsB', 'stop'] },
    stopLabel: { op: 'pick', args: ['stopLabels', 'stop'] },
    flatOpacity: { op: 'pick', args: ['flatOpacities', 'stop'] },
  },
  objects: [
    text('question', { text: 'How does practice make the model better at guessing the next letter?', x: 40, y: 34, typography: 'heading' }),
    text('prerequisites', { text: 'No prerequisites.', x: 40, y: 58, typography: 'annotation' }),
    text('context', { text: 'Text so far: “First Citiz”   →   the letter that really comes next: “e”', x: 40, y: 96 }),
    text('status', { text: 'Recorded toy run: a tiny practice model (not NanoGPT) that looks only at the last letter, “z”.', x: 40, y: 118, typography: 'annotation' }),
    text('bars-title', { text: 'Its guess for the next letter: one bar per character it knows (65 bars, together 100%)', x: 40, y: 150, typography: 'annotation' }),
    { id: 'guess', type: 'bars', semanticId: 'guess', conceptId: 'training',
      initialState: { x: BARS.x, y: BARS.y, w: 65 * BARS.cell, h: BARS.h, cell: BARS.cell, peak: 1, role: 'prediction',
        values: { $derive: 'probs' }, cellHighlight: O.targetIndex, opacity: 0 } },
    text('flat-note', { text: `↓ all 65 bars are this low: ${pct(Math.min(...FLAT))} to ${pct(Math.max(...FLAT))} each`, x: 60, y: BARS.y + BARS.h - 16,
      typography: 'annotation', opacity: { $derive: 'flatOpacity' } }),
    text('target-mark', { text: '▼ “e”, the right letter: {{pctText}}', x: markX, y: { $derive: 'markY' }, role: 'success', opacity: 0 }),
    text('scale-100', { text: '100%', x: BARS.x + 65 * BARS.cell + 8, y: BARS.y + 8, typography: 'annotation' }),
    text('scale-0', { text: '0%', x: BARS.x + 65 * BARS.cell + 8, y: BARS.y + BARS.h + 4, typography: 'annotation' }),
    text('piles-title', { text: 'as two piles', x: PILES_X, y: BARS.y - 8, typography: 'annotation' }),
    { id: 'piles', type: 'bars', semanticId: 'piles', conceptId: 'training',
      initialState: { x: PILES_X, y: BARS.y, w: 2 * 58, h: BARS.h, cell: 58, peak: 1, role: 'prediction', labels: ['“e”', 'other 64'],
        values: { $derive: 'pile' }, cellHighlight: 0, opacity: 0 } },
    // Loss in plain words, on one line that ends left of the piles' right edge (the frame never shifts).
    text('loss-here', { text: 'Loss on this guess: {{lossText}}, the model’s surprise at “e” (the smaller its share, the bigger the loss)', x: 40, y: 356, opacity: 0 }),
    text('avg-title', { text: 'Average loss over all the practice text', x: 90, y: 384, typography: 'annotation' }),
    ...axesObjects(frame, { tickMarks: false }),
    ...seriesObjects(frame, 'avg', N, { role: 'input' }),
    { id: 'avg-dot', type: 'circle', semanticId: 'avg-dot', conceptId: 'training',
      initialState: { x: { $derive: 'dotX' }, y: { $derive: 'dotY' }, w: 12, h: 12, role: 'observed', opacity: 0 } },
    text('avg-readout', { text: 'Average loss {{stopLabel}}: {{avgText}}', x: RIGHT_X, y: 424, opacity: 0 }),
    text('caption-a', { text: '{{captionA}}', x: RIGHT_X, y: 458, typography: 'annotation' }),
    text('caption-b', { text: '{{captionB}}', x: RIGHT_X, y: 478, typography: 'annotation' }),
  ],
  timeline: [
    { at: 0, action: 'appear', target: 'guess', duration: 0.5 },
    { at: 0.3, action: 'appear', target: 'piles', duration: 0.5 },
    { at: 0.5, action: 'appear', target: 'target-mark', duration: 0.3 },
    { at: 0.8, action: 'appear', target: 'loss-here', duration: 0.3 },
    ...Array.from({ length: N - 1 }, (unused, i) => ({ at: 1.0 + i * 0.04, action: 'appear', target: `avg-seg-${i}`, duration: 0.1 })),
    { at: 1.9, action: 'appear', target: 'avg-dot', duration: 0.3 },
    { at: 2.1, action: 'appear', target: 'avg-readout', duration: 0.3 },
  ],
};
for (const object of scene.objects) {
  if (/^avg-seg-/.test(object.id)) object.initialState.opacity = 0;
}

const REPRODUCE = 'python packages/web/src/nanogpt/depth/fixtures/gen_training_loss.py --check';

export const sources = [
  { ...calculation('Recorded toy run', 'The guess after “First Citiz” and the average loss',
    `A seeded toy run (generate_fixtures.py toy_run, seed ${run.seed}): a character bigram table - ${run.model} - trained with AdamW, NanoGPT's get_lr and gradient clipping on the first ${run.config.train_chars} characters of the training split. gen_training_loss.py calls that run unchanged and copies its weight table at every checkpoint; the 65 shares are softmax of the row for “z” at iterations ${O.stops.map(s => s.iteration).join(', ')} (4 decimals), and the loss on the guess is −ln of the share on “e”. The average loss is the exact mean over the whole ${run.config.train_chars}-character slice at each checkpoint (fx.toyRun). Nothing here is NanoGPT's transformer.`),
  reproduce: REPRODUCE },
  code('model.py', 187, 187, 'NanoGPT’s loss: “loss = F.cross_entropy(logits.view(-1, logits.size(-1)), targets.view(-1), ignore_index=-1)” - the same measure (minus the log of the share on the right next token, averaged) the toy run minimizes.'),
  code('data/shakespeare_char/prepare.py', 24, 25, '“chars = sorted(list(set(data)))” and “vocab_size = len(chars)” - the 65 characters (one bar each, in this order) of the character-level dataset.'),
  tinyShakespeare('The practice text is the first 1,200 characters of prepare.py’s 90% training split, starting “First Citizen:”.'),
];

export const evidence = {
  card: 'depth-training-loss-overview',
  title: scene.title,
  learningQuestion: scene.objects[0].initialState.text,
  concept: 'Training shifts the model’s guess: probability moves onto the letter that really comes next, and the loss - how surprised the model is by the right letter - falls, on this one guess and on average over the text.',
  sourceRevision: `${fx.provenance.nanogpt.repo} @ ${fx.provenance.nanogpt.commit}`,
  provenance: 'Recorded toy run: gen_training_loss.py taps generate_fixtures.py’s seeded bigram run (not NanoGPT’s transformer) for the 65 shares after “z” at iterations 0, 50, 200 and 1000 and the loss on that guess; the average loss curve is fx.toyRun (exact mean over the 1,200-character training slice). Bar heights, the marker and the dot position are live pick/scale/add ops on those values.',
  control: 'stop (index, picker) "How much practice": before practice / after 50 / 200 / 1,000 steps - four recorded checkpoints; nothing trains when one is picked.',
  consequence: 'The 65 bars go from a flat carpet (every share 1.4% to 1.6%, said by a note since the bars are barely visible) to one spike on “e” (98%); the ▼ mark rides the “e” bar with its share; the loss on this guess drops from 4.12 to 0.02; the dot on the average-loss curve moves down the curve; the two caption lines follow the stop.',
  interactionPurpose: 'Step from before practice to after 1,000 steps and watch cause and effect: the share on the right letter grows and the loss falls with it.',
  task: 'Click through the four stops; say what happens to the share on “e” and to the loss, and why the average loss stays higher than the loss on this one easy guess.',
  capability: 'bars (65 values, fixed peak, constant highlight) bound to a picked fixture vector; a text mark whose y rides the target bar via scale/add/pick; a plot.js line plot with a derived marker; state-keyed captions via pick.',
  depth: 'Overview',
  prerequisites: 'None.',
  ladderRole: 'Gives the cause-and-effect intuition with one discrete control and no symbols: practice moves the guess onto the right letter and the loss falls; Guided names the number (−ln p) and the stopping rule, Deep dive opens train.py’s loop.',
};

export const reviewStates = [{ stop: 0 }, { stop: 1 }, { stop: 2 }, { stop: 3 }];
