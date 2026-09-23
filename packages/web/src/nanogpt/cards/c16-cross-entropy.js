// Card 16 - cross-entropy at ONE position: the same top prediction can carry
// a very different loss. Grounding (NanoGPT @3adf61e): model.py:187
//   loss = F.cross_entropy(logits.view(-1, logits.size(-1)), targets.view(-1), ignore_index=-1)
// averages -ln p(target) over every non-ignored position; this card shows one
// of them. It deliberately does not teach the averaging (another card).
//
// Numbers: fx.crossEntropy is a calculated toy example (generate_fixtures.py):
// three stored logit presets over a toy 5-token vocabulary, target 'k'. The
// probabilities are a LIVE softmax here; the top choice is argmin(scale(p,-1))
// (argmax by composition); the toy's uniform guess is a live softmax over zero
// logits. The losses and ln 65 come from the fixture, because the evaluator has
// no log op. Picking a preset runs no model.
import fx from '../fixtures/nanogpt-fixtures.generated.js';

const CE = fx.crossEntropy;
const VOCAB = CE.vocab;
const TARGET = CE.target;
const CELL = 56;
const COL_X = 40;
const PANEL_X = 480;
// Glyph-first markers: the ▲/▼ sits over the column centre, the words run right.
const markX = i => COL_X + i * CELL + CELL / 2 - 5;
// Probability bars: the renderer draws a bar p * (h - 4) tall above the baseline
// (peak 1). The top-choice mark rides just above the top bar.
const BARS = { y: 246, h: 120 };
const BAR_BASE = BARS.y + BARS.h;
const BAR_SPAN = BARS.h - 4;
const MARK_ABOVE_BAR = 12;
const CELLS_Y = 394;
// Loss by preset: one row per preset (name | model's top choice | loss, bar).
const ROWS = { title: 344, head: 366, first: 390, step: 24 };
const rowY = k => ROWS.first + k * ROWS.step;
const COLS = { marker: 482, name: 498, top: 632, loss: 776, bar: 816 };
const PX_PER_NAT = 30; // loss bar length, layout only; the number prints beside it
const lossTexts = CE.presets.map(preset => preset.loss.toFixed(2));
const topTexts = CE.presets.map(preset => `▼ '${VOCAB[preset.top]}' (${preset.top === TARGET ? 'correct' : 'incorrect'})`);

const note = (id, text, x, y, extra = {}) => ({ id, type: 'text', semanticId: id, conceptId: 'cross-entropy',
  initialState: { text, x, y, typography: 'annotation', ...extra } });
const line = (id, text, x, y, extra = {}) => note(id, text, x, y, { typography: 'body', ...extra });

export const scene = {
  id: 'nanogpt-c16-cross-entropy',
  title: 'Cross-entropy: same top prediction, different loss',
  width: 960,
  height: 640,
  duration: 3,
  inputs: [
    { name: 'prediction', type: 'index', label: 'Stored prediction preset', of: 'presetLabels', default: 0, presentation: 'picker' },
  ],
  exampleData: {
    commit: fx.provenance.nanogpt.commit.slice(0, 7),
    context: CE.context,
    vocab: VOCAB,
    target: TARGET,
    targetToken: VOCAB[TARGET],
    toyVocabSize: VOCAB.length,
    vocabSize: fx.architecture.vocab_size,
    modelVocabNote: fx.tokenizer.modelVocabNote,
    presetLabels: CE.presets.map(preset => preset.label),
    presetLogits: CE.presets.map(preset => preset.logits),
    presetLosses: CE.presets.map(preset => preset.loss),
    // Display strings of fixture values: 2 decimals keeps -ln(p shown) and the
    // loss shown in agreement at the precision printed (see the test).
    lossTexts,
    topTexts,
    uniformText: CE.uniform65.toFixed(2),
    zeroLogits: VOCAB.map(() => 0),
    verdicts: VOCAB.map((unused, i) => (i === TARGET ? 'correct' : 'incorrect')),
    // Captions keyed by preset; the test asserts each one's verdict against
    // the oracle at its own state.
    insightsA: [
      'Right, and most probability sits on the target:',
      'Same top choice as “confident, right”, same accuracy,',
      'Wrong, and p(target) sits below the uniform-guess line:',
    ],
    insightsB: [
      'small loss. Loss reads p(target), not the top-1.',
      'but p(target) is far lower, so the loss is far larger.',
      'worse than guessing; the largest loss of the three.',
    ],
    markX: VOCAB.map((unused, i) => markX(i)),
    markYOffset: VOCAB.map(() => BAR_BASE - MARK_ABOVE_BAR),
    barBase: VOCAB.map(() => BAR_BASE),
    rowMarkerY: CE.presets.map((preset, k) => rowY(k)),
  },
  derived: {
    presetName: { op: 'pick', args: ['presetLabels', 'prediction'] },
    logits: { op: 'pick', args: ['presetLogits', 'prediction'] },
    probs: { op: 'softmax', args: ['logits'] },
    negProbs: { op: 'scale', args: ['probs', -1] },
    top: { op: 'argmin', args: ['negProbs'] },
    topName: { op: 'pick', args: ['vocab', 'top'] },
    topVerdict: { op: 'pick', args: ['verdicts', 'top'] },
    topMarkX: { op: 'pick', args: ['markX', 'top'] },
    barRise: { op: 'scale', args: ['probs', -BAR_SPAN] },
    markYs: { op: 'add', args: ['barRise', 'markYOffset'] },
    topMarkY: { op: 'pick', args: ['markYs', 'top'] },
    pTarget: { op: 'pick', args: ['probs', 'target'] },
    lossText: { op: 'pick', args: ['lossTexts', 'prediction'] },
    // The toy's own uniform guess: softmax over equal logits, live.
    uniformProbs: { op: 'softmax', args: ['zeroLogits'] },
    uniformP: { op: 'pick', args: ['uniformProbs', 'target'] },
    uniformRise: { op: 'scale', args: ['uniformProbs', -BAR_SPAN] },
    uniformYs: { op: 'add', args: ['uniformRise', 'barBase'] },
    lossBarW: { op: 'scale', args: ['presetLosses', PX_PER_NAT] },
    selectedRowY: { op: 'pick', args: ['rowMarkerY', 'prediction'] },
    insightA: { op: 'pick', args: ['insightsA', 'prediction'] },
    insightB: { op: 'pick', args: ['insightsB', 'prediction'] },
  },
  objects: [
    line('question', 'If two predictions pick the same top token, why can their losses differ so much?', 40, 32),
    note('context', 'Context “{{context}}” → which character comes next? The target (truth) is \'{{targetToken}}\'.', 40, 58),
    { id: 'logits', type: 'grid', semanticId: 'logits', conceptId: 'cross-entropy',
      initialState: { label: 'logits: selected preset (calculated toy example)', x: COL_X, y: 128, rows: 1, cols: VOCAB.length, cell: CELL,
        opacity: 0, role: 'input', matrixKind: 'input', columnLabels: [...VOCAB], values: { $derive: 'logits' } } },
    note('softmax-note', '↓ p = softmax(logits): live calculation', COL_X, 214, { opacity: 0 }),
    note('top-mark', '▼ model\'s top choice', { $derive: 'topMarkX' }, { $derive: 'topMarkY' }, { opacity: 0, role: 'prediction' }),
    { id: 'prob-bars', type: 'bars', semanticId: 'probability-bars', conceptId: 'cross-entropy',
      initialState: { x: COL_X, y: BARS.y, h: BARS.h, cell: CELL, peak: 1, opacity: 0, role: 'prediction', distribution: true,
        labels: [...VOCAB], values: { $derive: 'probs' }, cellHighlight: { $derive: 'top' } } },
    { id: 'uniform-line', type: 'line', semanticId: 'uniform-line', conceptId: 'cross-entropy',
      initialState: { from: { x: COL_X, y: { $derive: 'uniformYs.0' } }, to: { x: COL_X + VOCAB.length * CELL, y: { $derive: 'uniformYs.0' } },
        opacity: 0, role: 'neutral' } },
    note('bars-scale-1', 'bar height = p,', 332, 296, { opacity: 0 }),
    note('bars-scale-2', 'fixed 0 to 1 scale', 332, 314, { opacity: 0 }),
    note('uniform-label-1', '← uniform guess:', 332, 347, { opacity: 0 }),
    note('uniform-label-2', 'p = 1/{{toyVocabSize}} = {{uniformP}} (live)', 332, 365, { opacity: 0 }),
    { id: 'prob-cells', type: 'grid', semanticId: 'probabilities', conceptId: 'cross-entropy',
      initialState: { x: COL_X, y: CELLS_Y, rows: 1, cols: VOCAB.length, cell: CELL, opacity: 0, role: 'prediction',
        matrixKind: 'derived', distribution: true, values: { $derive: 'probs' } } },
    // Target (truth) stripe under the target's p cell: green = target everywhere here.
    { id: 'target-stripe', type: 'box', semanticId: 'target-stripe', conceptId: 'cross-entropy',
      initialState: { x: COL_X + TARGET * CELL + 4, y: CELLS_Y + CELL + 5, w: CELL - 8, h: 6, opacity: 0, role: 'success' } },
    note('cells-note', '← p (sums to 1)', 332, 426, { opacity: 0 }),
    note('target-mark', '▲ target (truth)', markX(TARGET), 486, { opacity: 0, role: 'success' }),

    // Readouts for the selected preset.
    line('preset-name', 'Selected preset: {{presetName}}', PANEL_X, 112),
    note('preset-note', 'stored logits (calculated toy example), not a model run', PANEL_X, 134),
    line('top-readout', '▼ model\'s top choice: \'{{topName}}\' ({{topVerdict}})', PANEL_X, 172, { opacity: 0, role: 'prediction' }),
    line('p-readout', '▲ p(target \'{{targetToken}}\') = {{pTarget}}', PANEL_X, 198, { opacity: 0, role: 'success' }),
    line('loss-readout', 'loss at this position = −ln p(target) = {{lossText}}', PANEL_X, 224, { opacity: 0 }),
    note('loss-prov-1', 'p: live softmax (3 d.p.). loss: calculated toy example', PANEL_X, 250, { opacity: 0 }),
    note('loss-prov-2', '(generate_fixtures.py; the card cannot take a log)', PANEL_X, 268, { opacity: 0 }),
    note('insight-a', '{{insightA}}', PANEL_X, 298, { opacity: 0 }),
    note('insight-b', '{{insightB}}', PANEL_X, 316, { opacity: 0 }),

    // Every preset's loss side by side; ▶ marks the selected one.
    note('loss-chart-title', 'All three presets side by side (▶ = selected preset):', PANEL_X, ROWS.title, { opacity: 0 }),
    note('loss-head-top', 'model\'s top choice', COLS.top, ROWS.head, { opacity: 0 }),
    note('loss-head-loss', 'loss at this position', COLS.loss, ROWS.head, { opacity: 0 }),
    note('selected-row', '▶', COLS.marker, { $derive: 'selectedRowY' }, { typography: 'body', role: 'learner' }),
    ...CE.presets.flatMap((preset, k) => [
      note(`preset-name-${k}`, `{{presetLabels.${k}}}`, COLS.name, rowY(k), { opacity: 0 }),
      note(`preset-top-${k}`, `{{topTexts.${k}}}`, COLS.top, rowY(k), { opacity: 0, role: 'prediction' }),
      note(`loss-value-${k}`, `{{lossTexts.${k}}}`, COLS.loss, rowY(k), { opacity: 0 }),
      { id: `loss-bar-${k}`, type: 'box', semanticId: `loss-bar-${k}`, conceptId: 'cross-entropy',
        initialState: { x: COLS.bar, y: rowY(k) - 11, w: { $derive: `lossBarW.${k}` }, h: 12, opacity: 0, role: 'observed' } },
    ]),

    // Scale and source.
    note('toy-note', 'Toy slice: {{toyVocabSize}} tokens here. NanoGPT\'s softmax covers all {{vocabSize}} characters (source: data/shakespeare_char/prepare.py).', 40, 518),
    note('uniform65-note', 'NanoGPT scale: a uniform guess over its {{vocabSize}} characters scores ln {{vocabSize}} = {{uniformText}} (calculated, generate_fixtures.py).', 40, 538),
    note('uniform65-scope', 'That is NanoGPT\'s reference, not this toy\'s: here a uniform guess is the p = {{uniformP}} line on the bars.', 40, 556),
    note('gpt2-note', 'From-scratch GPT-2: {{modelVocabNote}} (source).', 40, 576),
    note('source-label', 'Source, NanoGPT @{{commit}} model.py:187 - its loss averages this per-position value over all positions:', 40, 602),
    { id: 'source-code', type: 'code', semanticId: 'source-code', conceptId: 'cross-entropy',
      initialState: { text: 'loss = F.cross_entropy(logits.view(-1, logits.size(-1)), targets.view(-1), ignore_index=-1)', x: 40, y: 624, role: 'code' } },
  ],
  timeline: [
    { at: 0.0, action: 'appear', target: 'logits', duration: 0.4 },
    { at: 0.4, action: 'appear', target: 'softmax-note', duration: 0.3 },
    ...['prob-bars', 'bars-scale-1', 'bars-scale-2', 'uniform-line', 'uniform-label-1', 'uniform-label-2']
      .map(target => ({ at: 0.6, action: 'appear', target, duration: 0.4 })),
    { at: 0.9, action: 'appear', target: 'prob-cells', duration: 0.4 },
    { at: 0.9, action: 'appear', target: 'cells-note', duration: 0.3 },
    { at: 1.2, action: 'appear', target: 'target-mark', duration: 0.3 },
    { at: 1.2, action: 'appear', target: 'target-stripe', duration: 0.3 },
    { at: 1.4, action: 'appear', target: 'top-mark', duration: 0.3 },
    { at: 1.6, action: 'appear', target: 'top-readout', duration: 0.3 },
    { at: 1.8, action: 'appear', target: 'p-readout', duration: 0.3 },
    { at: 2.0, action: 'appear', target: 'loss-readout', duration: 0.3 },
    { at: 2.0, action: 'appear', target: 'loss-prov-1', duration: 0.3 },
    { at: 2.0, action: 'appear', target: 'loss-prov-2', duration: 0.3 },
    { at: 2.2, action: 'appear', target: 'insight-a', duration: 0.3 },
    { at: 2.2, action: 'appear', target: 'insight-b', duration: 0.3 },
    ...['loss-chart-title', 'loss-head-top', 'loss-head-loss',
      ...CE.presets.flatMap((preset, k) => [`preset-name-${k}`, `preset-top-${k}`, `loss-value-${k}`, `loss-bar-${k}`])]
      .map(target => ({ at: 2.4, action: 'appear', target, duration: 0.4 })),
  ],
};

export const evidence = {
  card: 'c16-cross-entropy',
  title: scene.title,
  learningQuestion: scene.objects[0].initialState.text,
  concept: 'Cross-entropy at one position is -ln p(target): it reads how much probability the model put on the true next token, not just whether its top choice was right. Two predictions with the same top-1 (same accuracy) can have very different loss; among these presets, the confident wrong one costs the most, and its p(target) is below a uniform guess over the same toy vocabulary.',
  sourceRevision: `${fx.provenance.nanogpt.repo} @ ${fx.provenance.nanogpt.commit}`,
  provenance: 'source: model.py:187 F.cross_entropy line quoted verbatim (its loss averages the per-position value); the 65-character vocabulary (data/shakespeare_char/prepare.py) and the GPTConfig.vocab_size note (model.py:111; from-scratch GPT-2 via config/train_gpt2.py and train.py:155) via the fixture. calculated toy example: fx.crossEntropy (generate_fixtures.py) - context, 5-token toy vocabulary, target, three stored logit presets, each preset\'s top choice, loss = -ln p(target), and ln 65 (the evaluator has no log). live calculation: softmax over the selected preset\'s logits, top choice = argmin(scale(p, -1)), p(target) = pick, the toy uniform guess = softmax over zero logits, bar/mark/label positions = scale/add.',
  control: 'prediction (index, picker) "Stored prediction preset" over the three fixture presets: confident, right / hesitant, right / confident, wrong. Discrete stored presets; nothing is run when one is picked.',
  consequence: 'Logits cells change; live softmax re-draws the probability bars and cells; the model\'s top-choice mark (▼ purple text riding the top bar, lit bar) moves to the argmax while the target mark (▲ green text and a ring on the target\'s p cell) stays on k; the grey uniform-guess line (p = 1/5, live) stays put, so the target bar sits above it in the right presets and below it in "confident, wrong"; readouts give the model\'s top choice (correct/incorrect), p(target), and the loss at this position; the loss-by-preset rows keep all three presets\' top choices and losses on screen, with ▶ on the selected row.',
  interactionPurpose: `Compare "${CE.presets[0].label}" and "${CE.presets[1].label}" (same top choice, same accuracy, loss ${lossTexts[0]} vs ${lossTexts[1]}, both visible at once in the loss-by-preset rows) and "${CE.presets[2].label}" (wrong, loss ${lossTexts[2]}, p(target) below the toy's uniform guess) to see that the loss scores the probability on the target, not the top-1 decision.`,
  task: 'Switch between "confident, right" and "hesitant, right" and explain why the loss grows although the top choice stays correct; then pick "confident, wrong" and compare the target\'s bar with the uniform-guess line over the same 5 tokens.',
  capability: 'index picker over fixture presets; softmax, scale, argmin (argmax by composition), pick, add derive ops; bars with a fixed peak and a derived highlight; boxes with derived widths (loss by preset) and a derived ▶ row marker; a derived grid with distribution: true and a constant target highlight; a derived horizontal line (uniform guess via softmax over zero logits); derived x/y positions for markers and value labels; text interpolation of fixture-formatted strings.',
};
