// Card 17 - NanoGPT's learning-rate schedule (get_lr). Three stored presets
// (as configured; decay_lr = False; a hypothetical warmup_iters = 1000). The
// preset re-shapes the whole curve and moves the warmup_iters boundary; the
// inspect picker moves a dot along it, the formula of the branch that produced
// it follows, and a grey dot keeps the configured value at the same iteration
// on screen for comparison. Nothing trains here: both controls pick stored
// results, and only the data -> pixel mapping is live. How the stored values
// were made, and the cited train.py / config lines, are in `sources` below.
import fx from '../fixtures/nanogpt-fixtures.generated.js';
import { axesObjects, seriesMapping, seriesObjects } from '../plot.js';
import { code, calculation } from '../sources.js';

const S = fx.lrSchedule;
const [configured] = S.presets;
const I = S.inspectIterations; // [0, warmup-1, warmup, 1000, 2500, max_iters] - see generate_fixtures.py
const N = S.iterations.length;
const sci = value => value.toExponential(0); // 0.001 -> "1e-3", as the config file writes it
// Each preset's warmup_iters, read off its own records: get_lr's first cosine
// iteration is it = warmup_iters (decay_ratio 0). decay_lr = False has no
// cosine phase and keeps the configured value (its boundary is hidden).
const firstCosine = p => p.inspect.find(r => r.phase === 'cosine decay')?.iteration;
const warmupIts = S.presets.map(p => firstCosine(p) ?? firstCosine(configured));

const frame = {
  id: 'lr', x: 110, y: 130, w: 800, h: 220, conceptId: 'lr-schedule',
  xDomain: [0, S.max_iters], yDomain: [0, S.learning_rate * 1.1],
  xTicks: Array.from({ length: S.max_iters / 1000 + 1 }, (u, i) => ({ value: i * 1000, label: String(i * 1000) })),
  yTicks: [
    { value: 0, label: '0' },
    { value: S.min_lr, label: `min_lr ${sci(S.min_lr)}` },
    { value: S.learning_rate / 2, label: sci(S.learning_rate / 2) },
    { value: S.learning_rate, label: sci(S.learning_rate) },
  ],
  xTitle: 'iteration (iter_num)', yTitle: 'learning rate (lr)',
};
const toPx = it => frame.x + (it / S.max_iters) * frame.w;
const curveMap = seriesMapping(frame, 'curve', 'lrIters', 'lrCurve', N);
const inspMap = seriesMapping(frame, 'insp', 'inspIters', 'inspLr', I.length);
const cfgMap = seriesMapping(frame, 'cfg', 'inspIters', 'cfgInspLr', I.length);
const minLrY = frame.y + frame.h - (S.min_lr / frame.yDomain[1]) * frame.h;

// The rule that produced the inspected value, as math, keyed by the fixture's
// own phase string (the quoted train.py lines are in `sources`). get_lr's
// min_lr branch has no entry: no inspected iteration reaches it (see the
// iteration-5000 note).
const FORMULA = {
  'linear warmup': ['Linear warmup, because it < warmup_iters:', 'lr = learning_rate × (it + 1) / (warmup_iters + 1)'],
  'cosine decay': [
    'Cosine decay: decay_ratio = (it − warmup_iters) / (lr_decay_iters − warmup_iters)',
    'lr = min_lr + ½ (1 + cos(π × decay_ratio)) × (learning_rate − min_lr)',
  ],
  'constant (decay_lr = False)': ['decay_lr = False skips get_lr altogether:', 'lr = learning_rate'],
};

// Two note lines per (preset, inspected iteration): what this point teaches.
// "Grey dot" is the configured schedule at the same iteration.
const NOTES = [
  [
    [`Not zero, just too small to see at this scale: at it = ${I[0]} the warmup branch already returns`, `learning_rate x (${I[0]} + 1) / (warmup_iters + 1), a small fraction of the peak.`],
    ['Still warmup: it < warmup_iters, so the ramp branch runs - one iteration short of the peak.', `The ${I[1]} and ${I[2]} dots coincide at this scale; the phase and the formula tell them apart.`],
    ['First cosine iteration: it = warmup_iters makes decay_ratio zero,', 'so the cosine factor is at its maximum and lr is exactly learning_rate - the peak.'],
    ['Cosine decay: the cosine starts flat, so early in the decay lr has fallen only a little from the peak.', ''],
    ['Cosine decay: near the middle of the decay, lr is close to halfway between learning_rate and min_lr.', ''],
    ['Last iteration: lr_decay_iters = max_iters, so the decay ends exactly here and lr lands on min_lr.', "get_lr's min_lr branch never runs: training stops once iter_num > max_iters."],
  ],
  [
    ['decay_lr = False: get_lr is skipped, so even the first iteration runs at the full learning_rate.', ''],
    ['decay_lr = False: no warmup ramp - lr is learning_rate here too; as configured it is still ramping.', ''],
    ['decay_lr = False: no peak and no decay start - lr is learning_rate on every iteration.', 'Here it matches the configured schedule (grey dot), which peaks at this iteration.'],
    ['decay_lr = False: no cosine decay - lr stays at learning_rate, above the configured value (grey dot).', ''],
    ['decay_lr = False: no cosine decay - lr stays at learning_rate; the gap to the grey dot keeps widening.', ''],
    ['decay_lr = False: training ends at learning_rate, not min_lr (grey dot) - the schedule never ran.', ''],
  ],
  [
    ['What-if: a larger warmup_iters makes (it + 1) / (warmup_iters + 1) smaller, so the ramp starts lower.', 'Both values are too small to see at this scale - compare the two readout lines.'],
    [`What-if: iteration ${I[1]} is early in a much longer ramp, far below the peak and the grey dot.`, ''],
    [`What-if: iteration ${I[2]} would still be warming up - the cosine decay has not started yet.`, 'Its height is near min_lr by coincidence - it is on the ramp, not the min_lr floor.'],
    ['What-if: it = warmup_iters here, so this is the peak and the first cosine iteration.', 'The configured schedule (grey dot) has already decayed a little by now.'],
    ['What-if: the decay starts later (at warmup_iters), so at this iteration it is less far along', 'and lr is higher than as configured (grey dot).'],
    ['What-if: lr_decay_iters is unchanged, so this variant also ends exactly on min_lr, like the grey dot.', ''],
  ],
];

const text = (id, initialState) => ({ id, type: 'text', semanticId: id, conceptId: 'lr-schedule', initialState });
const FOLLOWS_DOT = ['readout', 'formula', 'formula-2', 'note', 'note-2'];

export const scene = {
  id: 'nanogpt-c17-lr-schedule',
  title: "NanoGPT's learning-rate schedule",
  width: 960,
  height: 608,
  duration: 2,
  inputs: [
    { name: 'schedule', type: 'index', label: 'Schedule (stored preset)', of: 'scheduleNames', default: 0, presentation: 'picker' },
    { name: 'inspect', type: 'index', label: 'Inspect iteration (stored point)', of: 'inspectNames', default: 0, presentation: 'picker' },
  ],
  exampleData: {
    scheduleNames: S.presets.map(p => p.label),
    inspectNames: I.map(it => `iter ${it}`),
    presetLines: [
      `shakespeare_char config: warmup_iters=${warmupIts[0]}, lr_decay_iters=${S.lr_decay_iters}, min_lr=${sci(S.min_lr)}`,
      'decay_lr = False skips get_lr (the default is True, and the shakespeare_char config keeps it on)',
      `${S.presets[2].note}: same get_lr and config, only warmup_iters changed from ${warmupIts[0]} to ${warmupIts[2]}`,
    ],
    lrIters: S.iterations,
    lrByPreset: S.presets.map(p => p.lr),
    inspIters: I,
    inspLrByPreset: S.presets.map(p => p.inspect.map(r => r.lr)),
    inspRecByPreset: S.presets.map(p => p.inspect),
    cfgInspLr: configured.inspect.map(r => r.lr),
    cfgInspRecs: configured.inspect,
    // The configured reference is hidden when the configured schedule is the curve.
    refDotOpacity: S.presets.map((p, i) => (i === 0 ? 0 : 0.5)),
    refTextOpacity: S.presets.map((p, i) => (i === 0 ? 0 : 1)),
    refHintOpacity: S.presets.map((p, i) => (i === 0 ? 1 : 0)),
    // The warmup_iters boundary; decay_lr = False never calls get_lr, so no boundary.
    warmupIts,
    warmupX: warmupIts.map(toPx),
    warmupLabelX: warmupIts.map(it => toPx(it) + 6),
    warmupOpacity: S.presets.map(p => (p.inspect.some(r => r.phase === 'cosine decay') ? 0.7 : 0)),
    warmupLabelOpacity: S.presets.map(p => (p.inspect.some(r => r.phase === 'cosine decay') ? 1 : 0)),
    formulaA: Object.fromEntries(Object.entries(FORMULA).map(([k, v]) => [k, v[0]])),
    formulaB: Object.fromEntries(Object.entries(FORMULA).map(([k, v]) => [k, v[1]])),
    notesA: NOTES.map(row => row.map(n => n[0])),
    notesB: NOTES.map(row => row.map(n => n[1])),
    ...curveMap.exampleData,
    ...inspMap.exampleData,
    ...cfgMap.exampleData,
  },
  derived: {
    scheduleLabel: { op: 'pick', args: ['scheduleNames', 'schedule'] },
    presetLine: { op: 'pick', args: ['presetLines', 'schedule'] },
    // Learning rates are < 1e-3: they reach pixels only through pick (raw)
    // and seriesMapping's scale (multiplies before it rounds) - never a cell.
    lrCurve: { op: 'pick', args: ['lrByPreset', 'schedule'] },
    ...curveMap.derived,
    inspLr: { op: 'pick', args: ['inspLrByPreset', 'schedule'] },
    ...inspMap.derived,
    dotX: { op: 'pick', args: ['inspPx', 'inspect'] },
    dotY: { op: 'pick', args: ['inspPy', 'inspect'] },
    ...cfgMap.derived,
    refX: { op: 'pick', args: ['cfgPx', 'inspect'] },
    refY: { op: 'pick', args: ['cfgPy', 'inspect'] },
    refDot: { op: 'pick', args: ['refDotOpacity', 'schedule'] },
    refText: { op: 'pick', args: ['refTextOpacity', 'schedule'] },
    refHint: { op: 'pick', args: ['refHintOpacity', 'schedule'] },
    cfgRec: { op: 'pick', args: ['cfgInspRecs', 'inspect'] },
    wuIt: { op: 'pick', args: ['warmupIts', 'schedule'] },
    wuX: { op: 'pick', args: ['warmupX', 'schedule'] },
    wuLabelX: { op: 'pick', args: ['warmupLabelX', 'schedule'] },
    wuLine: { op: 'pick', args: ['warmupOpacity', 'schedule'] },
    wuLabel: { op: 'pick', args: ['warmupLabelOpacity', 'schedule'] },
    inspRow: { op: 'pick', args: ['inspRecByPreset', 'schedule'] },
    rec: { op: 'pick', args: ['inspRow', 'inspect'] },
    formulaLineA: { op: 'pick', args: ['formulaA', 'rec.phase'] },
    formulaLineB: { op: 'pick', args: ['formulaB', 'rec.phase'] },
    noteRowA: { op: 'pick', args: ['notesA', 'schedule'] },
    noteA: { op: 'pick', args: ['noteRowA', 'inspect'] },
    noteRowB: { op: 'pick', args: ['notesB', 'schedule'] },
    noteB: { op: 'pick', args: ['noteRowB', 'inspect'] },
  },
  objects: [
    text('question', { text: 'How does get_lr set the learning rate each iteration - and what if warmup or decay change?', x: 40, y: 34 }),
    text('curve-caption', { text: 'Curve: stored preset “{{scheduleLabel}}”', x: 40, y: 66, role: 'output' }),
    text('preset-line', { text: '{{presetLine}}', x: 40, y: 88, typography: 'annotation' }),
    ...axesObjects(frame, { tickMarks: false }),
    // min_lr as a faint floor across the plot, so "ends exactly at min_lr" is visible.
    { id: 'min-lr-guide', type: 'line', semanticId: 'min-lr-guide', conceptId: 'lr-schedule',
      initialState: { from: { x: frame.x, y: minLrY }, to: { x: frame.x + frame.w, y: minLrY }, role: 'neutral', opacity: 0.35 } },
    // warmup_iters: left of this line get_lr ramps, from it on it decays.
    { id: 'warmup-line', type: 'line', semanticId: 'warmup-boundary', conceptId: 'lr-schedule',
      initialState: { from: { x: { $derive: 'wuX' }, y: frame.y }, to: { x: { $derive: 'wuX' }, y: frame.y + frame.h }, role: 'neutral', opacity: { $derive: 'wuLine' } } },
    text('warmup-label', { text: 'warmup_iters = {{wuIt}}', x: { $derive: 'wuLabelX' }, y: 300, typography: 'annotation', opacity: { $derive: 'wuLabel' } }),
    ...seriesObjects(frame, 'curve', N, { role: 'output' }).map(o => ({ ...o, initialState: { ...o.initialState, opacity: 0 } })),
    // Drawn before (under) the inspected dot and larger, so a coinciding value reads as a grey ring.
    { id: 'configured-ref', type: 'circle', semanticId: 'configured-reference', conceptId: 'lr-schedule',
      initialState: { x: { $derive: 'refX' }, y: { $derive: 'refY' }, w: 20, h: 20, role: 'neutral', opacity: { $derive: 'refDot' } } },
    { id: 'inspect-dot', type: 'circle', semanticId: 'inspected-point', conceptId: 'lr-schedule',
      initialState: { x: { $derive: 'dotX' }, y: { $derive: 'dotY' }, w: 14, h: 14, role: 'learner', opacity: 0 } },
    text('readout', { text: 'Orange dot (inspected): iteration {{rec.iteration}} - lr = {{rec.lrText}} - phase: {{rec.phase}}', x: 40, y: 432, role: 'learner', opacity: 0 }),
    text('reference', { text: 'Grey dot (as configured): iteration {{cfgRec.iteration}} - lr = {{cfgRec.lrText}} - phase: {{cfgRec.phase}}', x: 40, y: 456, opacity: { $derive: 'refText' } }),
    text('reference-hint', { text: 'Grey dot: pick another schedule preset to compare it with this configured one at the same iteration.', x: 40, y: 456, typography: 'caption', opacity: { $derive: 'refHint' } }),
    text('formula', { text: '{{formulaLineA}}', x: 40, y: 484, opacity: 0 }),
    text('formula-2', { text: '{{formulaLineB}}', x: 40, y: 506, opacity: 0 }),
    text('note', { text: '{{noteA}}', x: 40, y: 536, typography: 'caption', opacity: 0 }),
    text('note-2', { text: '{{noteB}}', x: 40, y: 556, typography: 'caption', opacity: 0 }),
    text('status', { text: 'Stored presets: “as configured” is a Source value, the other two are What-if; the plot is a Live calculation.', x: 40, y: 588, typography: 'annotation' }),
  ],
  timeline: [
    // The curve draws left to right, then the inspected point lands on it
    // together with everything that describes it.
    ...Array.from({ length: N - 1 }, (u, i) => ({ at: Number((0.1 + i * 0.05).toFixed(2)), action: 'appear', target: `curve-seg-${i}`, duration: 0.1 })),
    ...['inspect-dot', ...FOLLOWS_DOT].map(target => ({ at: 1.3, action: 'appear', target, duration: 0.3 })),
  ],
};

export const sources = [
  code('train.py', 231, 242, 'get_lr: linear warmup while it < warmup_iters, min_lr once it > lr_decay_iters, cosine decay in between. Every curve point on the card is this function\'s output.'),
  code('config/train_shakespeare_char.py', 27, 33, `The configured schedule: learning_rate = ${sci(S.learning_rate)}, max_iters = ${S.max_iters}, lr_decay_iters = ${S.lr_decay_iters}, min_lr = ${sci(S.min_lr)}, warmup_iters = ${warmupIts[0]}.`),
  code('train.py', 232, 234, 'Warmup branch: "# 1) linear warmup for warmup_iters steps", "if it < warmup_iters:" then "return learning_rate * (it + 1) / (warmup_iters + 1)" - why iteration 0 is small but not zero.'),
  code('train.py', 238, 242, 'Cosine branch: "decay_ratio = (it - warmup_iters) / (lr_decay_iters - warmup_iters)", "coeff = 0.5 * (1.0 + math.cos(math.pi * decay_ratio)) # coeff ranges 0..1", "return min_lr + coeff * (learning_rate - min_lr)".'),
  code('train.py', 258, 260, 'The decay_lr switch: "lr = get_lr(iter_num) if decay_lr else learning_rate", then "for param_group in optimizer.param_groups:" "param_group[\'lr\'] = lr" - the decay_lr = False preset is this else-branch.'),
  code('train.py', 65, 65, '"decay_lr = True # whether to decay the learning rate" - the default; the shakespeare_char config does not change it.'),
  code('train.py', 235, 237, 'min_lr branch: "if it > lr_decay_iters: return min_lr" - never reached on this card (see the loop exit).'),
  code('train.py', 332, 333, '"if iter_num > max_iters: break" - training stops at max_iters = lr_decay_iters, so the last iteration lands on min_lr through the cosine branch.'),
  calculation('Source value', 'The "as configured" curve and its inspected points', `generate_fixtures.py compiled get_lr from the pinned train.py and executed it with the shakespeare_char values (learning_rate ${sci(S.learning_rate)}, warmup_iters ${warmupIts[0]}, lr_decay_iters ${S.lr_decay_iters}, min_lr ${sci(S.min_lr)}) at iterations ${S.iterations.join(', ')} and at the inspected ${I.join(', ')}. Values stored to 9 decimals; the readout text (e.g. 9.90e-6) is the generator's own formatting.`),
  calculation('What-if', 'The decay_lr = False and warmup_iters = 1000 presets', `decay_lr = False: the generator applied the else-branch of the decay_lr switch (lr = learning_rate at every iteration); nothing was executed. warmup_iters = ${warmupIts[2]}: the same executed get_lr and config with only warmup_iters changed - a hypothetical variant, not a shipped config.`),
  calculation('Live calculation', 'Plot positions and picks', 'On the card: pick selects the preset curve, the inspected record, its formula and notes; seriesMapping\'s scale/add map iteration and lr to pixels (lr is scaled before any rounding). No learning rate is recomputed.'),
];

export const evidence = {
  card: 'c17-lr-schedule',
  title: scene.title,
  learningQuestion: scene.objects[0].initialState.text,
  concept: 'train.py get_lr: linear warmup to learning_rate over warmup_iters, cosine decay to min_lr by lr_decay_iters, min_lr after (never reached here: the loop stops at max_iters = lr_decay_iters); train.py:258 bypasses it when decay_lr is False',
  sourceRevision: `${fx.provenance.nanogpt.repo}@${fx.provenance.nanogpt.commit}`,
  provenance: `source: fx.lrSchedule - train.py:231-242 get_lr compiled from the pinned file and executed by generate_fixtures.py with config/train_shakespeare_char.py (learning_rate ${sci(S.learning_rate)}, warmup_iters ${warmupIts[0]}, lr_decay_iters ${S.lr_decay_iters}, min_lr ${sci(S.min_lr)}, max_iters ${S.max_iters}); the decay_lr = False preset is train.py:258's else-branch (lr = learning_rate) applied by the generator, not executed; the warmup_iters = ${warmupIts[2]} preset is a hypothetical run of the same get_lr; lrText/phase strings come from the fixture; warmup boundary = each preset's first cosine-phase iteration; live calculation: preset selection (pick) and data->pixel mapping (scale/add)`,
  control: `schedule: index picker over ${S.presets.length} stored presets (as configured / decay_lr = False / warmup_iters = ${warmupIts[2]} what-if); inspect: index picker over ${I.length} stored iterations (${I.join(', ')})`,
  consequence: 'the preset re-shapes the whole curve (cosine with a short ramp, a flat line at learning_rate, a 1000-iteration ramp) and moves the warmup_iters boundary; the inspected dot, its readout (iteration, lrText, phase), the formula of the branch that produced the value and a per-point note follow the pick, and on the non-configured presets a grey dot + readout keep the configured value at the same iteration on screen - iteration 0 is learning_rate/(warmup_iters+1), not zero; 99 is warmup, 100 is the peak and first cosine iteration; 5000 = max_iters = lr_decay_iters lands exactly on min_lr',
  interactionPurpose: 'swap schedule variants on one fixed axis to see the whole shape change against the configured value, and read exact values at the iterations where get_lr changes branch',
  task: 'explore-only (no practice)',
  capability: 'line plot composed by plot.js (axesObjects without tick marks, three seriesMapping calls) with derived circle markers and a derived vertical boundary; sub-1e-3 values kept out of rounding ops (pick + scale-before-round only); derived opacity to show the reference only off the configured preset; pick of a record map by the fixture phase string for state-following formula lines; nested pick for per-preset, per-iteration notes',
};
