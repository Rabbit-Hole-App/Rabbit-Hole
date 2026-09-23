// Card 21 - temperature. NanoGPT's generate() divides the last position's
// logits by `temperature` (model.py:318), softmaxes (:324) and ALWAYS samples
// with torch.multinomial (:326). Low positive T is sharper, never greedy.
// Logits are a calculated toy example; the softmax is a live calculation here;
// the 20 draws per preset are a recorded toy run: seeded random.choices in
// generate_fixtures.py, not NanoGPT and not live sampling.
import fx from '../fixtures/nanogpt-fixtures.generated.js';

const T = fx.temperature;
const presets = T.presets;
const HALF = T.draws / 2; // two token rows: one row of 20 labels is wider than the card
const rawPreset = presets.find(p => p.temperature === 1);
const TOP = T.logits.indexOf(Math.max(...T.logits));
// The fixture's '␣' renders as a near-invisible speck in the mono fallback
// (bolding it does not show), so the card displays the space as 'sp'.
const shown = T.display.map(d => (d === '␣' ? 'sp' : d));
const show = d => shown[T.display.indexOf(d)];
// Positions (per row) of recorded draws that were NOT the top token - bolded.
const notTop = (drawn, from) => drawn.slice(from, from + HALF).flatMap((d, i) => (d === T.display[TOP] ? [] : [i]));
const charVocab = fx.tokenizer.tokenizers.find(t => t.id === 'char');

const GX = [24, 340, 656]; // three 6-cell grids, cell 46 (fits "-4.00"), arrows in the 40px gaps
const GY = 130;
const CELL = 46;
const BARS_Y = 318;
const BARS_H = 140;
const DRAWS_Y = 538;
const SRC_Y = 778;

export const scene = {
  id: 'nanogpt-c21-temperature',
  title: 'Temperature: sharper or flatter sampling',
  width: 960,
  height: 936,
  duration: 3,
  inputs: [
    { name: 'temperature', type: 'index', label: 'Temperature preset', of: 'presetLabels', default: 2, presentation: 'slider' },
  ],
  exampleData: {
    presetLabels: presets.map(p => p.label),
    invTByPreset: presets.map(p => p.invT),
    logits: T.logits,
    display: shown,
    context: T.context,
    candidateCount: T.display.length,
    otherCount: T.display.length - 1,
    vocabSize: charVocab.vocabSize,
    draws: T.draws,
    drawsByPreset: presets.map(() => T.draws),
    drawnTopByPreset: presets.map(p => p.drawnTop),
    drawsFirst: presets.map(p => p.drawn.slice(0, HALF).map(show)),
    drawsSecond: presets.map(p => p.drawn.slice(HALF).map(show)),
    notTopFirst: presets.map(p => notTop(p.drawn, 0)),
    notTopSecond: presets.map(p => notTop(p.drawn, HALF)),
    relationByPreset: presets.map(p => (p.temperature < 1 ? 'Sharper than' : p.temperature > 1 ? 'Flatter than' : 'The same as')),
    rawLabel: rawPreset.label,
    one: [1],
  },
  derived: {
    tLabel: { op: 'pick', args: ['presetLabels', 'temperature'] },
    invT: { op: 'pick', args: ['invTByPreset', 'temperature'] },
    scaled: { op: 'scale', args: ['logits', 'invT'] },          // logits / T  (model.py:318)
    probs: { op: 'softmax', args: ['scaled'] },                 // F.softmax   (model.py:324)
    negProbs: { op: 'scale', args: ['probs', -1] },
    topAt: { op: 'argmin', args: ['negProbs'] },                // argmax by composition
    topName: { op: 'pick', args: ['display', 'topAt'] },
    pTop: { op: 'pick', args: ['probs', 'topAt'] },
    pTopVec: { op: 'concat', args: ['pTop'] },
    pRestVec: { op: 'sub', args: ['one', 'pTopVec'] },
    pRest: { op: 'pick', args: ['pRestVec', 0] },
    probsRaw: { op: 'softmax', args: ['logits'] },              // the T = 1.0 counterfactual, same token
    pTopRaw: { op: 'pick', args: ['probsRaw', 'topAt'] },
    relation: { op: 'pick', args: ['relationByPreset', 'temperature'] },
    drawnTop: { op: 'pick', args: ['drawnTopByPreset', 'temperature'] },
    expectedVec: { op: 'scale', args: ['pTopVec', 'draws'] },   // draws x p(top)
    expected: { op: 'pick', args: ['expectedVec', 0] },
    nonTopVec: { op: 'sub', args: ['drawsByPreset', 'drawnTopByPreset'] },
    nonTop: { op: 'pick', args: ['nonTopVec', 'temperature'] },
    drawsA: { op: 'pick', args: ['drawsFirst', 'temperature'] },
    drawsB: { op: 'pick', args: ['drawsSecond', 'temperature'] },
    markA: { op: 'pick', args: ['notTopFirst', 'temperature'] },
    markB: { op: 'pick', args: ['notTopSecond', 'temperature'] },
  },
  objects: [
    { id: 'question', type: 'text', semanticId: 'question', conceptId: 'temperature',
      initialState: { text: 'What does dividing the logits by a temperature do - and does a low temperature make it greedy?', x: 24, y: 32 } },

    // Live pipeline: toy logits -> / T -> softmax.
    { id: 'logits', type: 'grid', semanticId: 'toy-logits', conceptId: 'logits',
      initialState: { label: 'toy logits after “{{context}}”', x: GX[0], y: GY, rows: 1, cols: 6, cell: CELL, opacity: 0,
        role: 'input', matrixKind: 'input', columnLabels: [...shown], values: { $derive: 'logits' } } },
    { id: 'arrow-div', type: 'arrow', semanticId: 'divide-by-t', conceptId: 'temperature',
      initialState: { label: '÷ T', from: { x: GX[0] + 6 * CELL + 9, y: GY + CELL / 2 }, to: { x: GX[1] - 4, y: GY + CELL / 2 }, opacity: 0 } },
    { id: 'scaled', type: 'grid', semanticId: 'scaled-logits', conceptId: 'temperature',
      initialState: { label: 'logits ÷ T at {{tLabel}}', x: GX[1], y: GY, rows: 1, cols: 6, cell: CELL, opacity: 0,
        role: 'neutral', matrixKind: 'derived', columnLabels: [...shown], values: { $derive: 'scaled' } } },
    { id: 'arrow-softmax', type: 'arrow', semanticId: 'softmax-step', conceptId: 'softmax',
      initialState: { from: { x: GX[1] + 6 * CELL + 4, y: GY + CELL / 2 }, to: { x: GX[2] - 4, y: GY + CELL / 2 }, opacity: 0 } },
    { id: 'probs', type: 'grid', semanticId: 'probabilities', conceptId: 'softmax',
      initialState: { label: 'softmax → probabilities', x: GX[2], y: GY, rows: 1, cols: 6, cell: CELL, opacity: 0,
        role: 'output', matrixKind: 'derived', distribution: true, heat: true, valueScale: 'fixed',
        columnLabels: [...shown], values: { $derive: 'probs' } } },
    { id: 'provenance-note', type: 'text', semanticId: 'provenance-note', conceptId: 'temperature',
      initialState: { text: 'Toy logits for {{candidateCount}} candidates: calculated toy example (generate_fixtures.py), not NanoGPT output.', x: 24, y: 202, typography: 'annotation' } },
    { id: 'vocab-note', type: 'text', semanticId: 'toy-vocabulary', conceptId: 'temperature',
      initialState: { text: 'The real shakespeare_char softmax covers all {{vocabSize}} characters. sp = the space character.', x: 24, y: 220, typography: 'annotation' } },
    { id: 'live-note', type: 'text', semanticId: 'live-note', conceptId: 'temperature',
      initialState: { text: '÷ T and softmax: live calculation in this card, rounded to 3 decimals; cells and bars show 2.', x: 24, y: 238, typography: 'annotation' } },
    { id: 'zero-note', type: 'text', semanticId: 'rounded-not-zero', conceptId: 'softmax',
      initialState: { text: 'A .00 cell is rounded, not zero: softmax gives every candidate some probability, so it can still be drawn.', x: 24, y: 256, typography: 'annotation' } },

    // Same probabilities as bars, one bar under each probability cell, on a
    // fixed axis (peak 1) so sharper vs flatter is a visible height change.
    { id: 'bars', type: 'bars', semanticId: 'probability-bars', conceptId: 'softmax',
      initialState: { label: 'fixed axis: top line = probability 1', x: GX[2], y: BARS_Y, h: BARS_H, cell: CELL, peak: 1, opacity: 0,
        role: 'output', distribution: true, labels: [...shown], values: { $derive: 'probs' } } },
    { id: 'bars-top', type: 'line', semanticId: 'probability-one', conceptId: 'softmax',
      initialState: { from: { x: GX[2], y: BARS_Y + 4 }, to: { x: GX[2] + 6 * CELL, y: BARS_Y + 4 }, opacity: 0 } },

    // Readouts - the selected preset and what it did.
    { id: 't-readout', type: 'text', semanticId: 'selected-preset', conceptId: 'temperature',
      initialState: { text: 'Selected preset: {{tLabel}}', x: 24, y: 318, typography: 'heading' } },
    { id: 'relation', type: 'text', semanticId: 'sharper-or-flatter', conceptId: 'temperature',
      initialState: { text: '{{relation}} plain softmax: p(‘{{topName}}’) is {{pTop}} here, {{pTopRaw}} at {{rawLabel}}', x: 24, y: 350 } },
    { id: 'p-top', type: 'text', semanticId: 'p-top', conceptId: 'softmax',
      initialState: { text: 'p(top token ‘{{topName}}’) = {{pTop}}   (the ‘{{topName}}’ probability cell)', x: 24, y: 380, role: 'output' } },
    { id: 'p-rest', type: 'text', semanticId: 'p-rest', conceptId: 'softmax',
      initialState: { text: 'the other {{otherCount}} together = 1 − p(top) = {{pRest}}, still above 0', x: 24, y: 406, role: 'output' } },
    { id: 'explain', type: 'text', semanticId: 'gap-explanation', conceptId: 'temperature',
      initialState: { text: 'T below 1 widens the gaps between logits, T above 1 shrinks them.', x: 24, y: 434, typography: 'annotation' } },
    { id: 'explain-2', type: 'text', semanticId: 'order-kept', conceptId: 'temperature',
      initialState: { text: 'Every preset is positive, so the ranking never changes.', x: 24, y: 454, typography: 'annotation' } },

    // Recorded toy draws - seeded random.choices in the generator, not NanoGPT.
    { id: 'draws-a', type: 'tokens', semanticId: 'recorded-draws-1', conceptId: 'sampling',
      initialState: { label: '{{draws}} recorded toy draws at {{tLabel}}: seeded random.choices in generate_fixtures.py, not NanoGPT', x: 24, y: DRAWS_Y, opacity: 0,
        role: 'observed', tokenStyle: 'labels', tokens: { $derive: 'drawsA' }, cellHighlight: { $derive: 'markA' } } },
    { id: 'draws-b', type: 'tokens', semanticId: 'recorded-draws-2', conceptId: 'sampling',
      initialState: { x: 24, y: DRAWS_Y + 34, opacity: 0,
        role: 'observed', tokenStyle: 'labels', tokens: { $derive: 'drawsB' }, cellHighlight: { $derive: 'markB' } } },
    { id: 'draw-count', type: 'text', semanticId: 'draw-count', conceptId: 'sampling',
      initialState: { text: '{{drawnTop}} of {{draws}} draws were the top token ‘{{topName}}’', x: 580, y: DRAWS_Y + 12, role: 'output' } },
    { id: 'expected', type: 'text', semanticId: 'expected-count', conceptId: 'sampling',
      initialState: { text: 'expected about {{expected}} (= {{draws}} × p(top))', x: 580, y: DRAWS_Y + 36, typography: 'annotation' } },
    { id: 'wobble', type: 'text', semanticId: 'small-sample', conceptId: 'sampling',
      initialState: { text: 'one small seeded sample: counts vary run to run', x: 580, y: DRAWS_Y + 54, typography: 'annotation' } },
    { id: 'bold-key', type: 'text', semanticId: 'bold-key', conceptId: 'sampling',
      initialState: { text: 'bold = a draw that was not ‘{{topName}}’', x: 580, y: DRAWS_Y + 72, typography: 'annotation' } },
    { id: 'not-greedy', type: 'text', semanticId: 'not-greedy', conceptId: 'sampling',
      initialState: { text: '{{nonTop}} of {{draws}} recorded draws were not ‘{{topName}}’, drawn from these toy probabilities.', x: 24, y: 646 } },
    { id: 'multinomial', type: 'text', semanticId: 'always-samples', conceptId: 'sampling',
      initialState: { text: 'generate() always draws with torch.multinomial (model.py:326), never argmax.', x: 24, y: 672 } },
    { id: 'not-greedy-2', type: 'text', semanticId: 'not-greedy-2', conceptId: 'sampling',
      initialState: { text: 'At {{tLabel}} the other {{otherCount}} still share {{pRest}} of the probability, so a draw can land on them.', x: 24, y: 698, typography: 'annotation' } },
    { id: 'not-greedy-3', type: 'text', semanticId: 'sharper-not-greedy', conceptId: 'sampling',
      initialState: { text: 'So a low positive T is sharper, not greedy: greedy (argmax) would pick ‘{{topName}}’ every time.', x: 24, y: 716, typography: 'annotation' } },
    { id: 'not-greedy-4', type: 'text', semanticId: 'no-argmax-mode', conceptId: 'sampling',
      initialState: { text: 'generate() has no argmax mode, and T = 0 would divide the logits by zero at model.py:318.', x: 24, y: 734, typography: 'annotation' } },

    // Source, quoted verbatim from NanoGPT @3adf61e.
    { id: 'source-head', type: 'text', semanticId: 'source-head', conceptId: 'temperature',
      initialState: { text: 'source: NanoGPT @3adf61e, model.py generate() and sample.py', x: 24, y: SRC_Y, typography: 'annotation' } },
    { id: 'src-318', type: 'code', semanticId: 'source-318', conceptId: 'temperature',
      initialState: { text: 'model.py:318  logits = logits[:, -1, :] / temperature', x: 24, y: SRC_Y + 24, role: 'code' } },
    { id: 'src-324', type: 'code', semanticId: 'source-324', conceptId: 'softmax',
      initialState: { text: 'model.py:324  probs = F.softmax(logits, dim=-1)', x: 24, y: SRC_Y + 46, role: 'code' } },
    { id: 'src-326', type: 'code', semanticId: 'source-326', conceptId: 'sampling',
      initialState: { text: 'model.py:326  idx_next = torch.multinomial(probs, num_samples=1)', x: 24, y: SRC_Y + 68, role: 'code' } },
    { id: 'topk-note', type: 'text', semanticId: 'topk-note', conceptId: 'temperature',
      initialState: { text: 'An optional top-k crop (model.py:320-322) can run between :318 and :324; this card applies none.', x: 24, y: SRC_Y + 90, typography: 'annotation' } },
    { id: 'src-17', type: 'code', semanticId: 'source-sample-17', conceptId: 'temperature',
      initialState: { text: 'sample.py:17  temperature = 0.8 # 1.0 = no change, < 1.0 = less random, > 1.0 = more random', x: 24, y: SRC_Y + 120, role: 'code' } },
    { id: 'default-note', type: 'text', semanticId: 'default-temperature', conceptId: 'temperature',
      initialState: { text: 'NanoGPT’s own default T is below 1: sharpened, still sampled. This card has no preset at that value.', x: 24, y: SRC_Y + 142, typography: 'annotation' } },
  ],
  timeline: [
    { at: 0.0, action: 'appear', target: 'logits', duration: 0.4 },
    { at: 0.4, action: 'appear', target: 'arrow-div', duration: 0.3 },
    { at: 0.6, action: 'appear', target: 'scaled', duration: 0.4 },
    { at: 1.0, action: 'appear', target: 'arrow-softmax', duration: 0.3 },
    { at: 1.2, action: 'appear', target: 'probs', duration: 0.4 },
    { at: 1.6, action: 'appear', target: 'bars', duration: 0.4 },
    { at: 1.6, action: 'appear', target: 'bars-top', duration: 0.4 },
    { at: 2.1, action: 'appear', target: 'draws-a', duration: 0.4 },
    { at: 2.3, action: 'appear', target: 'draws-b', duration: 0.4 },
  ],
};

export const evidence = {
  card: 'c21-temperature',
  title: scene.title,
  learningQuestion: scene.objects[0].initialState.text,
  concept: 'generate() divides the last position\'s logits by temperature (model.py:318), softmaxes (:324) and always samples with torch.multinomial (:326); sample.py:17 defaults to temperature = 0.8. T below 1 sharpens the distribution and T above 1 flattens it; the ranking never changes, and a low positive T is still sampling (the other candidates keep 1 - p(top) > 0), not greedy argmax.',
  sourceRevision: `${fx.provenance.nanogpt.repo} @ ${fx.provenance.nanogpt.commit}`,
  provenance: 'source: model.py:318/:324/:326 and sample.py:17 quoted verbatim, top-k crop :320-322 cited; calculated toy example: fx.temperature.logits over 6 candidates (generate_fixtures.py), with the real shakespeare_char vocab size from fx.tokenizer (char); live calculation: softmax(scale(logits, pick(invTByPreset, temperature))), softmax(logits) for the T = 1.0 comparison, top = argmin(scale(probs,-1)), 1 - p(top) = sub, expected top count = scale(p(top), draws), non-top draw count = sub(draws, drawnTop); recorded toy run: fx.temperature.presets[].drawn/drawnTop, 20 seeded random.choices draws per preset by generate_fixtures.py (not NanoGPT, not torch.multinomial, not live sampling). The space candidate is displayed as "sp".',
  control: 'temperature (index, slider) over the five stored presets fx.temperature.presets[].label, T = 0.25 ... T = 2.0, all positive; default T = 1.0. Discrete presets, labelled as presets.',
  consequence: 'The logits / T row, the probability row (fixed [0,1] heat) and the bars (peak 1) recompute live; p(top), its T = 1.0 value and 1 - p(top) update; the caption says sharper / the same as / flatter than plain softmax; the recorded toy draws, "N of 20 draws were the top token" and the live expected count (20 x p(top)) switch to that preset. At T = 0.25 the other five still share 1 - p(top) > 0, and one recorded draw is not the top token (one seeded illustration; counts vary run to run).',
  interactionPurpose: 'Sweep the stored presets from low to high T and watch the same six toy candidates go from nearly one-hot to flat, while generate()\'s code path (multinomial at model.py:326) keeps sampling at every preset, and the recorded draws illustrate it.',
  task: 'Move the preset to the lowest T and read what share the other five candidates still hold, and whether every recorded draw is the top token; then move to the highest T and say how p(top) and the expected count changed.',
  capability: 'index slider input over preset labels; pick/scale/softmax/argmin/concat/sub derive ops; derived grid with distribution:true + fixed valueScale heat; bars with peak 1 aligned under the grid; derived token lists with tokenStyle labels and derived cellHighlight lists; pick-driven state captions.',
};
