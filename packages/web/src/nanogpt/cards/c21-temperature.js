// Card 21 - temperature. NanoGPT's generate() divides the last position's
// logits by `temperature`, softmaxes and ALWAYS samples with
// torch.multinomial. Low positive T is sharper, never greedy.
// Logits are a calculated toy example; the softmax is a live calculation here;
// the 20 draws per preset are a recorded toy run (seeded random.choices), not
// NanoGPT and not live sampling. The code lines and how each number was made
// are the card's `sources`, shown collapsed under it.
// The probability grid has fixed valueScale heat, each cell rounded on its own (distribution: true only on the bars).
// p(top), 1 − p(top) and the T = 1.0 p print to 4 decimals, built here per preset
// from the cells' own scale and softmax ops: a derived readout rounds to 3, which
// printed z's 0.6048 as 0.605 beside its 0.60 cell (c22 prints 4 for the same reason).
import fx from '../fixtures/nanogpt-fixtures.generated.js';
import { DERIVATIONS, canonical } from '../../scene-derive.js';
import { code, calculation, tinyShakespeare } from '../sources.js';

const T = fx.temperature;
const presets = T.presets;
const HALF = T.draws / 2; // two token rows: one row of 20 labels is wider than the card
const rawPreset = presets.find(p => p.temperature === 1);
const TOP = T.logits.indexOf(Math.max(...T.logits));
// The fixture's '␣' renders as a near-invisible speck in the mono fallback,
// so the card displays the space as '•' (keyed in vocab-note).
const shown = T.display.map(d => (d === '␣' ? '•' : d));
const show = d => shown[T.display.indexOf(d)];
// Positions (per row) of recorded draws that were NOT the top token - bolded.
const notTop = (drawn, from) => drawn.slice(from, from + HALF).flatMap((d, i) => (d === T.display[TOP] ? [] : [i]));
const charVocab = fx.tokenizer.tokenizers.find(t => t.id === 'char');
const op = (name, ...args) => DERIVATIONS[name].derive(args, canonical).value;
const P_TOP = presets.map(p => op('softmax', op('scale', T.logits, p.invT))[TOP]);
const four = v => v.toFixed(4);

const GX = [24, 340, 656]; // three 6-cell grids, cell 46 (fits "-4.00"), arrows in the 40px gaps
const GY = 130;
const CELL = 46;
const BARS_Y = 318;
const BARS_H = 140;
const DRAWS_Y = 538;

export const scene = {
  id: 'nanogpt-c21-temperature',
  title: 'Temperature: sharper or flatter sampling',
  width: 960,
  height: 798,
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
    pTopTexts: P_TOP.map(four),
    pRestTexts: P_TOP.map(p => four(1 - p)),
    pTopRawText: four(P_TOP[presets.indexOf(rawPreset)]),
    pTop4ByPreset: P_TOP.map(p => [Number(four(p))]),     // the printed p(top), for the expected count
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
    pTopText: { op: 'pick', args: ['pTopTexts', 'temperature'] },
    pRestText: { op: 'pick', args: ['pRestTexts', 'temperature'] },
    pTop4Vec: { op: 'pick', args: ['pTop4ByPreset', 'temperature'] },
    probsRaw: { op: 'softmax', args: ['logits'] },              // the T = 1.0 counterfactual, same token
    pTopRaw: { op: 'pick', args: ['probsRaw', 'topAt'] },
    relation: { op: 'pick', args: ['relationByPreset', 'temperature'] },
    drawnTop: { op: 'pick', args: ['drawnTopByPreset', 'temperature'] },
    expectedVec: { op: 'scale', args: ['pTop4Vec', 'draws'] },  // draws x the printed p(top)
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
        role: 'output', matrixKind: 'derived', heat: true, valueScale: 'fixed',
        columnLabels: [...shown], values: { $derive: 'probs' } } },
    { id: 'provenance-note', type: 'text', semanticId: 'provenance-note', conceptId: 'temperature',
      initialState: { text: 'Hand-set toy logits for {{candidateCount}} candidates: calculated toy example, not NanoGPT output.', x: 24, y: 202, typography: 'annotation' } },
    { id: 'vocab-note', type: 'text', semanticId: 'toy-vocabulary', conceptId: 'temperature',
      initialState: { text: 'The real shakespeare_char softmax covers all {{vocabSize}} characters. • = space.', x: 24, y: 220, typography: 'annotation' } },
    { id: 'live-note', type: 'text', semanticId: 'live-note', conceptId: 'temperature',
      initialState: { text: '÷ T and softmax: live calculation in this card; p readouts show 4 decimals, cells 2, so a row can total 0.99 or 1.01.', x: 24, y: 238, typography: 'annotation' } },
    { id: 'zero-note', type: 'text', semanticId: 'rounded-not-zero', conceptId: 'softmax',
      initialState: { text: 'A 0.00 cell is rounded, not zero: softmax gives every candidate some probability, so it can still be drawn.', x: 24, y: 256, typography: 'annotation' } },

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
      initialState: { text: '{{relation}} plain softmax: p(‘{{topName}}’) is {{pTopText}} here, {{pTopRawText}} at {{rawLabel}}', x: 24, y: 350 } },
    { id: 'p-top', type: 'text', semanticId: 'p-top', conceptId: 'softmax',
      initialState: { text: 'p(top token ‘{{topName}}’) = {{pTopText}}   (the ‘{{topName}}’ probability cell)', x: 24, y: 380, role: 'output' } },
    { id: 'p-rest', type: 'text', semanticId: 'p-rest', conceptId: 'softmax',
      initialState: { text: 'the other {{otherCount}} together = 1 − p(top) = {{pRestText}}, still above 0', x: 24, y: 406, role: 'output' } },
    { id: 'explain', type: 'text', semanticId: 'gap-explanation', conceptId: 'temperature',
      initialState: { text: 'T below 1 widens the gaps between logits, T above 1 shrinks them.', x: 24, y: 434, typography: 'annotation' } },
    { id: 'explain-2', type: 'text', semanticId: 'order-kept', conceptId: 'temperature',
      initialState: { text: 'Every preset is positive, so the ranking never changes.', x: 24, y: 454, typography: 'annotation' } },

    // Recorded toy draws - seeded random.choices in the generator, not NanoGPT.
    { id: 'draws-a', type: 'tokens', semanticId: 'recorded-draws-1', conceptId: 'sampling',
      initialState: { label: 'Recorded toy run: {{draws}} seeded draws at {{tLabel}}, not NanoGPT', x: 24, y: DRAWS_Y, opacity: 0,
        role: 'observed', tokenStyle: 'labels', tokens: { $derive: 'drawsA' }, cellHighlight: { $derive: 'markA' } } },
    { id: 'draws-b', type: 'tokens', semanticId: 'recorded-draws-2', conceptId: 'sampling',
      initialState: { x: 24, y: DRAWS_Y + 34, opacity: 0,
        role: 'observed', tokenStyle: 'labels', tokens: { $derive: 'drawsB' }, cellHighlight: { $derive: 'markB' } } },
    // The count sentence is wrapped onto two lines: the frame's static estimate
    // measures the unfilled template, which on one line beside the token rows
    // would widen the frame past the render-size cap.
    { id: 'draw-count', type: 'text', semanticId: 'draw-count', conceptId: 'sampling',
      initialState: { text: '{{drawnTop}} of {{draws}} draws were', x: 580, y: DRAWS_Y + 12, role: 'output' } },
    { id: 'draw-count-2', type: 'text', semanticId: 'draw-count-2', conceptId: 'sampling',
      initialState: { text: 'the top token ‘{{topName}}’', x: 580, y: DRAWS_Y + 34, role: 'output' } },
    { id: 'expected', type: 'text', semanticId: 'expected-count', conceptId: 'sampling',
      initialState: { text: 'expected about {{expected}} (= {{draws}} × p(top))', x: 580, y: DRAWS_Y + 58, typography: 'annotation' } },
    { id: 'wobble', type: 'text', semanticId: 'small-sample', conceptId: 'sampling',
      initialState: { text: 'one small seeded sample: counts vary run to run', x: 580, y: DRAWS_Y + 76, typography: 'annotation' } },
    { id: 'bold-key', type: 'text', semanticId: 'bold-key', conceptId: 'sampling',
      initialState: { text: 'bold = a draw that was not ‘{{topName}}’', x: 580, y: DRAWS_Y + 94, typography: 'annotation' } },
    { id: 'not-greedy', type: 'text', semanticId: 'not-greedy', conceptId: 'sampling',
      initialState: { text: '{{nonTop}} of {{draws}} recorded draws were not ‘{{topName}}’, drawn from these toy probabilities.', x: 24, y: 668 } },
    { id: 'multinomial', type: 'text', semanticId: 'always-samples', conceptId: 'sampling',
      initialState: { text: 'generate(): p = softmax(logits ÷ T), then one random draw from p (torch.multinomial), never argmax.', x: 24, y: 694 } },
    { id: 'not-greedy-2', type: 'text', semanticId: 'not-greedy-2', conceptId: 'sampling',
      initialState: { text: 'At {{tLabel}} the other {{otherCount}} still share {{pRestText}} of the probability, so a draw can land on them.', x: 24, y: 720, typography: 'annotation' } },
    { id: 'not-greedy-3', type: 'text', semanticId: 'sharper-not-greedy', conceptId: 'sampling',
      initialState: { text: 'So a low positive T is sharper, not greedy: greedy (argmax) would pick ‘{{topName}}’ every time.', x: 24, y: 738, typography: 'annotation' } },
    { id: 'not-greedy-4', type: 'text', semanticId: 'no-argmax-mode', conceptId: 'sampling',
      initialState: { text: 'generate() has no argmax mode, and T = 0 would divide the logits by zero.', x: 24, y: 756, typography: 'annotation' } },
    { id: 'default-note', type: 'text', semanticId: 'default-temperature', conceptId: 'temperature',
      initialState: { text: 'The sampler’s default, T = 0.8, is below 1: sharpened, still sampled.', x: 24, y: 774, typography: 'annotation' } },
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

// Most important first: generate()'s three lines, the optional crop, the
// sampling default, then how the toy numbers were made.
export const sources = [
  code('model.py', 318, 318, 'Keep the last position\'s logits and divide by T: "logits = logits[:, -1, :] / temperature". T = 0 would divide by zero; generate() has no argmax mode.'),
  code('model.py', 324, 324, 'Softmax turns the scaled logits into probabilities: "probs = F.softmax(logits, dim=-1)".'),
  code('model.py', 326, 326, 'Always one random draw from those probabilities, never argmax: "idx_next = torch.multinomial(probs, num_samples=1)".'),
  code('model.py', 320, 322, 'Optional top-k crop between the division and the softmax: "v, _ = torch.topk(logits, min(top_k, logits.size(-1)))" then logits below the k-th are set to -Inf. This card applies none.'),
  code('sample.py', 17, 17, 'sample.py\'s sampling default, below 1 - sharpened, still sampled; the card has no preset at this value: "temperature = 0.8 # 1.0 = no change, < 1.0 = less random, > 1.0 = more random, in predictions".'),
  calculation('Calculated toy example', `${T.display.length} toy logits`,
    `generate_fixtures.py temperature(): hand-set logits [${T.logits.join(', ')}] for the characters ${T.vocab.map(c => (c === ' ' ? 'space' : c)).join(', ')} after "${T.context}" - not NanoGPT output. The space is shown as •.`),
  calculation('Recorded toy run', `${T.draws} draws per preset`,
    `For preset k the generator seeds random.Random(${T.seed} + k) and takes ${T.draws} draws in one random.choices call over the ${T.display.length} candidates, weighted by that preset's softmax(logits / T) - Python's sampler on the toy probabilities, not NanoGPT, not torch.multinomial and not live sampling. One small seeded sample: counts vary with the seed.`),
  calculation('Live calculation', 'Scaled logits, probabilities and counts',
    'Computed on the card for the selected preset: scale(logits, 1/T), then softmax; softmax(logits) for the T = 1.0 comparison; the top token as argmin of -p; 1 - p(top) with sub; the expected top count as draws × the printed p(top) with scale; the non-top count as draws minus the recorded top count with sub. No derive op prints 4 decimals and a derived readout rounds to 3, so the printed p(top), 1 − p(top) and T = 1.0 p are built in the card for each preset from the same scale and softmax ops, to 4 decimals. Each probability cell rounds its own p to 2, with no sum-to-1.00 adjustment (as on the top-k card), so the row totals 1.01 at T = 0.5 and 0.99 at T = 1.0, and z’s 0.6048 reads 0.60 in its cell.'),
  code('data/shakespeare_char/prepare.py', 24, 25, `The real vocabulary the card compares against: "chars = sorted(list(set(data)))" and "vocab_size = len(chars)" - ${charVocab.vocabSize} characters for Tiny Shakespeare.`),
  tinyShakespeare(`The text whose ${charVocab.vocabSize} distinct characters make the shakespeare_char vocabulary.`),
];

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
  capability: 'index slider input over preset labels; pick/scale/softmax/argmin/concat/sub derive ops; derived grid with fixed valueScale heat, each cell rounded on its own (distribution: true only on the bars); bars with peak 1 aligned under the grid; derived token lists with tokenStyle labels and derived cellHighlight lists; pick-driven state captions.',
};
