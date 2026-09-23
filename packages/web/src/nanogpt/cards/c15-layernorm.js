// Card 15 - LayerNorm, the full step: subtract the mean, divide by
// std = sqrt(var + eps), multiply by the learned weight gamma. Grounding
// (NanoGPT @3adf61e): model.py:18-27 LayerNorm (weight = ones :23, bias None
// unless bias=True :24, forward = F.layer_norm(input, weight.shape, weight,
// bias, 1e-5) :27); train.py:56 bias = False by default (so no beta), while
// GPTConfig defaults bias=True (model.py:116) and GPT-2 checkpoints force it
// (model.py:225); ln_1/ln_2 in every Block (model.py:98-100), ln_f built at
// model.py:131 and applied at :182; the residual add (model.py:104-105) adds
// each update to the UN-normalized x.
//
// Naming: x is always the vector going into LayerNorm (as in model.py); the
// reference preset is x0, so "x" never means two things on the card.
//
// Numbers: fx.layernorm is a calculated toy example (generate_fixtures.py -
// the evaluator has no sqrt, so mean/var/std/x-hat come from there). y = gamma
// * x-hat and the x-hat - x-hat(x0) check row are computed live by derive ops.
// The three presets are stored results, picked - nothing runs on a switch.
import fx from '../fixtures/nanogpt-fixtures.generated.js';

const LN = fx.layernorm;
const REF = LN.presets[0];
const CELL = 48;
const STRIP_X = 76;
const ARROW_X = 54;
const GLYPH_X = 34;
const TEXT_X = 396;
// Strip tops. The two arrowed steps get a 120px pitch so each strip's own
// label (24px above it) sits clearly closer to its strip than to the one
// above. x-hat, gamma and y are one column multiplication: x-hat / x gamma /
// rule / = y, tight on purpose, with no labels above gamma or y.
const ROW = { x: 120, centered: 240, xhat: 360, gamma: 432, y: 504, check: 632 };
// Only x-hat and y carry heat. Their shared domain is built from their own
// values, which are the same in every preset, so the colours cannot move when
// the preset does. x and x - mean stay uncoloured: the runtime can only share a
// domain inside one state, so their colours would re-normalise per preset and
// equal numbers would change colour between states.
const rawStrip = { cell: CELL, opacity: 0 };
const normStrip = { cell: CELL, heat: { mode: 'signed' }, valueScale: 'shared', valueScaleGroup: 'normalized', opacity: 0 };
const text = (id, value, x, y, extra = {}) => ({ id, type: 'text', semanticId: id, conceptId: 'layernorm',
  initialState: { text: value, x, y, ...extra } });
const note = (id, value, x, y, extra = {}) => text(id, value, x, y, { typography: 'annotation', ...extra });
const code = (id, value, x, y) => ({ id, type: 'code', semanticId: id, conceptId: 'layernorm', initialState: { text: value, x, y } });
const arrow = (id, fromY, toY) => ({ id, type: 'arrow', semanticId: id, conceptId: 'layernorm',
  initialState: { from: { x: ARROW_X, y: fromY }, to: { x: ARROW_X, y: toY }, opacity: 0, role: 'neutral' } });
const strip = (id, semanticId, extra) => ({ id, type: 'strip', semanticId, conceptId: 'layernorm', initialState: { x: STRIP_X, ...extra } });

// The fixture names its presets "x", "x + 3", "2 · x"; on the card the
// reference vector is x0 so it cannot be confused with LayerNorm's input x.
const presetName = label => label.replace('x', 'x₀');
const refName = presetName(REF.label);

export const scene = {
  id: 'nanogpt-c15-layernorm',
  title: 'LayerNorm: normalize each token vector, then scale',
  width: 960,
  height: 864,
  duration: 4,
  inputs: [
    { name: 'input', type: 'index', label: 'Stored input preset', of: 'presets', default: 0, presentation: 'picker' },
  ],
  exampleData: {
    commit: fx.provenance.nanogpt.commit.slice(0, 7),
    nEmbd: fx.architecture.n_embd,
    presets: LN.presets.map(preset => presetName(preset.label)),
    xs: LN.presets.map(preset => preset.x),
    centereds: LN.presets.map(preset => preset.centered),
    means: LN.presets.map(preset => preset.mean),
    vars: LN.presets.map(preset => preset.var),
    stds: LN.presets.map(preset => preset.std),
    xhats: LN.presets.map(preset => preset.xhat),
    xhatRef: REF.xhat,
    gamma: LN.gamma,
    eps: LN.eps,
    presetNotes: [
      `the reference vector ${refName}`,
      `${refName} with one constant added to every entry`,
      `${refName} with every entry times one positive constant`,
    ],
    // State 0 is the reference itself: say so instead of comparing it with itself.
    meanRefs: [
      `${refName} is the reference preset; pick another to compare`,
      `${refName} for comparison: mean = ${REF.mean}`,
      `${refName} for comparison: mean = ${REF.mean}`,
    ],
    stdRefs: [
      `${refName} is the reference preset`,
      `${refName} for comparison: std = ${REF.std}`,
      `${refName} for comparison: std = ${REF.std}`,
    ],
    verdictsA: [
      `${refName} against itself, so this row is zero by definition.`,
      `All zeros: x̂ for ${presetName(LN.presets[1].label)} equals x̂ for ${refName}, so y does too.`,
      `All zeros: x̂ for ${presetName(LN.presets[2].label)} matches x̂ for ${refName}, so y does too.`,
    ],
    verdictsB: [
      `Others move x and its mean (std too, for ${presetName(LN.presets[2].label)}). Watch this row.`,
      'Subtracting the mean removed the shift exactly; std did not move.',
      'Dividing by std removed the rescale, up to eps (which is not scaled).',
    ],
  },
  derived: {
    presetLabel: { op: 'pick', args: ['presets', 'input'] },
    presetNote: { op: 'pick', args: ['presetNotes', 'input'] },
    xSel: { op: 'pick', args: ['xs', 'input'] },
    centeredSel: { op: 'pick', args: ['centereds', 'input'] },
    mean: { op: 'pick', args: ['means', 'input'] },
    variance: { op: 'pick', args: ['vars', 'input'] },
    std: { op: 'pick', args: ['stds', 'input'] },
    xhat: { op: 'pick', args: ['xhats', 'input'] },
    // Live calculation: the learned per-feature scale, entry by entry.
    y: { op: 'elementwise', args: ['gamma', 'xhat'] },
    // Live check: the selected preset's stored x-hat minus the reference's.
    xhatDiff: { op: 'sub', args: ['xhat', 'xhatRef'] },
    meanRef: { op: 'pick', args: ['meanRefs', 'input'] },
    stdRef: { op: 'pick', args: ['stdRefs', 'input'] },
    verdictA: { op: 'pick', args: ['verdictsA', 'input'] },
    verdictB: { op: 'pick', args: ['verdictsB', 'input'] },
  },
  objects: [
    text('question', 'What does LayerNorm compute for one token vector, and what is the result insensitive to?', 40, 32),
    note('provenance', 'Calculated toy example (generate_fixtures.py): a short vector stands in for one token’s features.', 40, 58),

    // --- the pipeline: two arrowed steps, then x-hat x gamma = y ----------------
    strip('x-strip', 'input-vector', { ...rawStrip, label: 'x = {{presetLabel}}: the vector going into LayerNorm', y: ROW.x, role: 'input', values: { $derive: 'xSel' } }),
    arrow('arrow-center', ROW.x + CELL + 8, ROW.centered - 8),
    strip('centered-strip', 'centered-vector', { ...rawStrip, label: 'x − mean', y: ROW.centered, values: { $derive: 'centeredSel' } }),
    arrow('arrow-divide', ROW.centered + CELL + 8, ROW.xhat - 8),
    strip('xhat-strip', 'normalized-vector', { ...normStrip, label: 'x̂ = (x − mean) / std', y: ROW.xhat, values: { $derive: 'xhat' } }),
    text('times-glyph', '× γ', GLYPH_X, ROW.gamma + 30, { typography: 'heading', opacity: 0 }),
    strip('gamma-strip', 'layernorm-weight', { ...rawStrip, y: ROW.gamma, role: 'tutor', values: { $derive: 'gamma' } }),
    { id: 'product-rule', type: 'line', semanticId: 'product-rule', conceptId: 'layernorm',
      initialState: { from: { x: GLYPH_X, y: ROW.y - 12 }, to: { x: STRIP_X + 6 * CELL, y: ROW.y - 12 }, opacity: 0 } },
    text('equals-glyph', '= y', GLYPH_X, ROW.y + 30, { typography: 'heading', opacity: 0 }),
    strip('y-strip', 'layernorm-output', { ...normStrip, y: ROW.y, role: 'output', values: { $derive: 'y' } }),

    // --- what each step did, beside the row it produced --------------------------
    text('x-read', 'Selected preset: “{{presetLabel}}” (stored)', TEXT_X, ROW.x + 18, { role: 'input' }),
    note('x-note', '{{presetNote}}', TEXT_X, ROW.x + 38),
    text('mean-read', '① subtract the mean:  mean = {{mean}}', TEXT_X, ROW.centered + 18, { opacity: 0 }),
    note('mean-ref', '{{meanRef}}', TEXT_X, ROW.centered + 38, { opacity: 0 }),
    text('std-read', '② divide by std = √(var + eps) = {{std}}', TEXT_X, ROW.xhat + 16, { opacity: 0 }),
    note('std-detail', 'var = {{variance}} (mean of (x − mean)², ÷ n) · eps = {{eps}}', TEXT_X, ROW.xhat + 36, { opacity: 0 }),
    note('std-ref', '{{stdRef}}', TEXT_X, ROW.xhat + 56, { opacity: 0 }),
    note('gamma-note-1', 'γ = LayerNorm.weight: ones at init (model.py:23), then learned.', TEXT_X, ROW.gamma + 22, { opacity: 0 }),
    note('gamma-note-2', 'These γ values are illustrative, not read from a trained model.', TEXT_X, ROW.gamma + 40, { opacity: 0 }),
    text('y-read', '③ multiply by γ, entry by entry (live calculation)', TEXT_X, ROW.y + 16, { opacity: 0 }),
    note('beta-note-1', 'no β with train.py’s default bias = False (train.py:56; model.py:24);', TEXT_X, ROW.y + 36, { opacity: 0 }),
    note('beta-note-2', 'GPT-2 checkpoints load bias = True (model.py:225) and add + β.', TEXT_X, ROW.y + 54, { opacity: 0 }),

    // --- the consequence: a live check row and its verdict --------------------------
    strip('check-strip', 'invariance-check', { ...rawStrip, label: `x̂ − x̂ of ${refName} (live calculation on stored x̂)`, y: ROW.check, values: { $derive: 'xhatDiff' } }),
    { id: 'verdict-box', type: 'box', semanticId: 'verdict-box', conceptId: 'layernorm',
      initialState: { x: TEXT_X, y: ROW.check - 6, w: 548, h: 60, role: 'output', opacity: 0 } },
    text('verdict', '{{verdictA}}', TEXT_X + 14, ROW.check + 19, { role: 'output', opacity: 0 }),
    note('verdict-2', '{{verdictB}}', TEXT_X + 14, ROW.check + 41, { opacity: 0 }),

    // --- scope and source ----------------------------------------------------------
    note('legend', 'Heat colour on x̂ and y only, on one shared scale that does not move between presets.', 40, 716, { opacity: 0 }),
    note('scope-1', 'Scope: the invariance holds for LayerNorm’s output, the input attn, the MLP and lm_head read.', 40, 740),
    note('scope-2', 'The residual stream is not normalized: each Block adds its update to the un-normalized x.', 40, 760),
    code('scope-code-1', 'x = x + self.attn(self.ln_1(x))   # model.py:104', 40, 782),
    code('scope-code-2', 'x = x + self.mlp(self.ln_2(x))   # model.py:105', 480, 782),
    note('source-1', 'Source, NanoGPT @{{commit}}: model.py:18-27, per token over n_embd = {{nEmbd}} (config/train_shakespeare_char.py:24):', 40, 808),
    code('source-code', 'return F.layer_norm(input, self.weight.shape, self.weight, self.bias, 1e-5)   # model.py:27', 40, 828),
    note('source-2', 'ln_1 / ln_2 in every Block (model.py:98-100); ln_f built at model.py:131, applied after the last Block at :182.', 40, 850),
  ],
  timeline: [
    { at: 0.0, action: 'appear', target: 'x-strip', duration: 0.4 },
    { at: 0.5, action: 'appear', target: 'arrow-center', duration: 0.3 },
    { at: 0.7, action: 'appear', target: 'centered-strip', duration: 0.4 },
    { at: 0.8, action: 'appear', target: 'mean-read', duration: 0.3 },
    { at: 0.8, action: 'appear', target: 'mean-ref', duration: 0.3 },
    { at: 1.2, action: 'appear', target: 'arrow-divide', duration: 0.3 },
    { at: 1.4, action: 'appear', target: 'xhat-strip', duration: 0.4 },
    { at: 1.4, action: 'appear', target: 'legend', duration: 0.3 },
    { at: 1.5, action: 'appear', target: 'std-read', duration: 0.3 },
    { at: 1.5, action: 'appear', target: 'std-detail', duration: 0.3 },
    { at: 1.5, action: 'appear', target: 'std-ref', duration: 0.3 },
    { at: 1.9, action: 'appear', target: 'times-glyph', duration: 0.3 },
    { at: 1.9, action: 'appear', target: 'gamma-strip', duration: 0.4 },
    { at: 2.0, action: 'appear', target: 'gamma-note-1', duration: 0.3 },
    { at: 2.0, action: 'appear', target: 'gamma-note-2', duration: 0.3 },
    { at: 2.3, action: 'appear', target: 'product-rule', duration: 0.3 },
    { at: 2.3, action: 'appear', target: 'equals-glyph', duration: 0.3 },
    { at: 2.5, action: 'appear', target: 'y-strip', duration: 0.4 },
    { at: 2.6, action: 'appear', target: 'y-read', duration: 0.3 },
    { at: 2.6, action: 'appear', target: 'beta-note-1', duration: 0.3 },
    { at: 2.6, action: 'appear', target: 'beta-note-2', duration: 0.3 },
    { at: 3.0, action: 'appear', target: 'check-strip', duration: 0.4 },
    { at: 3.2, action: 'appear', target: 'verdict-box', duration: 0.3 },
    { at: 3.2, action: 'appear', target: 'verdict', duration: 0.4 },
    { at: 3.2, action: 'appear', target: 'verdict-2', duration: 0.4 },
  ],
};

export const evidence = {
  card: 'c15-layernorm',
  title: scene.title,
  learningQuestion: scene.objects[0].initialState.text,
  concept: 'LayerNorm normalizes one token vector over its features (subtract the mean, divide by sqrt(var + eps)) and then multiplies by a learned per-feature weight γ; with train.py’s default bias=False there is no β (GPT-2 checkpoints load bias=True and add β). The normalized result is identical when one constant is added to the whole vector, and equal to displayed precision when the whole vector is multiplied by a positive constant (eps is not rescaled, so that match is approximate).',
  sourceRevision: `${fx.provenance.nanogpt.repo} @ ${fx.provenance.nanogpt.commit}`,
  provenance: `calculated toy example (generate_fixtures.py layernorm(): x, x - mean, mean, biased var, std = sqrt(var + 1e-5), x-hat rounded to 4 decimals, illustrative γ); live calculation (y = γ · x-hat via the elementwise derive op; x-hat - x-hat(x0) via the sub derive op); source (model.py:18-27, :23, :24, :27, :98-100, :104-105, :116, :131, :182, :225; train.py:56; n_embd = ${fx.architecture.n_embd} from config/train_shakespeare_char.py:24 via fx.architecture).`,
  control: 'input - index picker over three stored presets: "x₀" (reference), "x₀ + 3", "2 · x₀" (the fixture\'s "x", "x + 3", "2 · x", renamed so the reference is not confused with LayerNorm\'s input x); discrete presets, not a continuous experiment.',
  consequence: 'Shift (x₀ + 3): x and the mean change; x - mean, var and std do not. Rescale (2 · x₀): x, mean, x - mean, var and std all change. x-hat and y are identical for the shift and equal to displayed precision for the rescale (eps is not rescaled); the live x-hat - x-hat(x0) row reads zero at every preset, on a heat scale that does not move.',
  interactionPurpose: 'Compare a vector, its shift and its rescale and see which stages of the normalization change and which do not - the invariance is the lesson.',
  task: 'Explore only (no practice): switch presets and check that the mean (and, for the rescale, std) move while x-hat, y and the check row stay fixed.',
  capability: 'index picker over exampleData presets; pick for per-preset fixture rows and strings; elementwise for the live γ · x-hat; sub for the live x-hat check row; strips with signed heat on x-hat and y in one shared value-scale group (x and x - mean uncoloured, since a domain can only be shared within one state); {{name}} readouts of pre-rounded fixture scalars.',
};
