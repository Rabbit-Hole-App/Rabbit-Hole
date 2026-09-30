// Card 20 - one update step, SGD through AdamW: NanoGPT builds
// torch.optim.AdamW with weight decay only on params with 2+ dimensions, so
// 1-D biases and LayerNorm weights are exempt.
//
// The toy numbers are fx.optimizer - a calculated toy example: four
// parameters, one seeded 20-step gradient sequence fed to all four optimizers
// (with its per-parameter mean and RMS), the last step's update in units of lr.
// betas, weight decay and grad_clip are source values (fx.config). The one live
// calculation is AdamW - Adam (a sub op): the decoupled-decay part. The code
// lines and how each number was made are the card's `sources`, shown collapsed
// under it.
import fx from '../fixtures/nanogpt-fixtures.generated.js';
import { code, calculation } from '../sources.js';

const opt = fx.optimizer;
const byId = id => opt.optimizers.find(entry => entry.id === id);
const names = opt.params.map(param => param.name);
const sgdAbs = byId('sgd').absUpdateInLr;

// Words only, one block per optimizer - never a digit (the test checks).
const EXPLAIN = {
  sgd: [
    'The baseline: Δθ = −lr × g, the latest gradient.',
    'Step size tracks gradient size: w₁ moves far',
    'more than w₂; w₃ steps against its latest g.',
    'No memory of past steps, no per-parameter scale.',
    'Here both bar rows show SGD: pick another preset',
    'to compare it against this baseline.',
  ],
  momentum: [
    'Momentum m = β·m + g replaces g: Δθ = −lr × m.',
    'Steady w₁, w₂, b: gradients pile up in m, so each',
    'moves many gradients’ worth - compare the SGD row.',
    'Noisy w₃: m takes the sign of the mean row (−),',
    'not of the latest g (+), so w₃ steps the opposite',
    'way to SGD. NanoGPT uses AdamW, not plain momentum.',
  ],
  adam: [
    'Adam divides a running average m̂ of g (an average,',
    'not a pile-up) by the running RMS √v̂ of that',
    'parameter’s own gradient. Steady w₁, w₂, b: mean',
    '≈ RMS, so each steps ≈ lr, whatever its g size.',
    'Noisy w₃ steps about half as far: in the g grid its',
    '|mean| is under half its RMS, so √v̂ exceeds |m̂|.',
  ],
  adamw: [
    'What NanoGPT uses: Adam’s step plus decoupled',
    'weight decay −lr × wd × θ, only on matrix weights',
    '(matmul, embedding): w₁, w₂, w₃ each get a pull',
    'toward zero, opposite in sign to their θ.',
    'The bias-like b (biases, LayerNorm weights) takes',
    'exactly Adam’s step: NanoGPT exempts it from decay.',
  ],
};
// The card's own name for AdamW: this is a toy run with NanoGPT's betas and wd, not NanoGPT's step.
const LABELS = opt.optimizers.map(entry => (entry.id === 'adamw' ? 'AdamW (as in NanoGPT)' : entry.label));

const LEFT_X = 170; // grids and bars share this x and pitch, so columns line up
const CELL = 48;
const RIGHT_X = 460;
const NOTE_Y = 706;
const DECAY_NOTE_Y = 622; // right column, under the decay grid

export const scene = {
  id: 'nanogpt-c20-optimizer',
  title: 'One update step: from SGD to AdamW',
  width: 960,
  height: 846,
  duration: 3,
  inputs: [
    { name: 'optimizer', type: 'index', label: 'Optimizer preset (stored toy results)', of: 'optimizerLabels', default: 0, presentation: 'picker' },
  ],
  exampleData: {
    optimizerLabels: LABELS,
    params: opt.params,
    steps: opt.steps,
    lr: opt.lr,
    b1: fx.config.defaults.beta1, // source values; the toy run used these (the test checks)
    b2: fx.config.defaults.beta2,
    wd: fx.config.defaults.weight_decay,
    charB2: fx.config.shakespeareChar.beta2,
    clip: fx.config.defaults.grad_clip,
    biasFlag: fx.architecture.bias ? 'True' : 'False', // Python spelling of the resolved source value
    gradients: [opt.lastGradient, opt.gradientMean, opt.gradientRms],
    sgdUpdate: byId('sgd').updateInLr,
    sgdAbs,
    updates: opt.optimizers.map(entry => entry.updateInLr),
    absUpdates: opt.optimizers.map(entry => entry.absUpdateInLr),
    // One bar scale per preset, shared by the SGD row and the selected row.
    peaks: opt.optimizers.map(entry => Math.max(...sgdAbs, ...entry.absUpdateInLr)),
    adamUpdate: byId('adam').updateInLr,
    adamwUpdate: byId('adamw').updateInLr,
    explanations: opt.optimizers.map(entry => EXPLAIN[entry.id]),
  },
  derived: {
    selLabel: { op: 'pick', args: ['optimizerLabels', 'optimizer'] },
    selUpdate: { op: 'pick', args: ['updates', 'optimizer'] },
    selAbs: { op: 'pick', args: ['absUpdates', 'optimizer'] },
    selPeak: { op: 'pick', args: ['peaks', 'optimizer'] },
    explain: { op: 'pick', args: ['explanations', 'optimizer'] },
    updateRows: { op: 'concat', args: ['sgdUpdate', 'selUpdate'] },
    decay: { op: 'sub', args: ['adamwUpdate', 'adamUpdate'] },
    decayRows: { op: 'concat', args: ['adamUpdate', 'decay', 'adamwUpdate'] },
  },
  objects: [
    { id: 'question', type: 'text', semanticId: 'question', conceptId: 'optimizer',
      initialState: { text: 'Same gradients, four optimizers: how big is each parameter’s step, and what does AdamW add?', x: 40, y: 30 } },
    { id: 'toy-note', type: 'text', semanticId: 'provenance-note', conceptId: 'optimizer',
      initialState: { text: 'Calculated toy example: every optimizer gets the same {{steps}} seeded gradients, not from a loss', x: 40, y: 54, typography: 'annotation' } },
    { id: 'baseline-note', type: 'text', semanticId: 'optimizer-progression', conceptId: 'optimizer',
      initialState: { text: 'SGD is the baseline; AdamW is what NanoGPT uses. Each preset is a stored toy result.', x: 40, y: 78 } },

    // Left: given gradients -> SGD's step and the selected step on one scale -> signed values.
    { id: 'grad-grid', type: 'grid', semanticId: 'gradients', conceptId: 'optimizer',
      initialState: { label: 'gradient g: given, same for all', x: LEFT_X, y: 154, rows: 3, cols: 4, cell: CELL, opacity: 0, role: 'input',
        matrixKind: 'input', columnLabels: names, rowLabels: ['g at step {{steps}}', '{{steps}}-step mean', '{{steps}}-step RMS'], values: { $derive: 'gradients' } } },
    { id: 'sgd-bars', type: 'bars', semanticId: 'sgd-step-size', conceptId: 'optimizer',
      initialState: { label: 'SGD baseline: |Δθ| ÷ lr', x: LEFT_X, y: 354, h: 52, cell: CELL, opacity: 0, role: 'neutral',
        labels: names, values: { $derive: 'sgdAbs' }, peak: { $derive: 'selPeak' } } },
    { id: 'step-bars', type: 'bars', semanticId: 'step-size', conceptId: 'optimizer',
      initialState: { label: 'Selected {{selLabel}}: |Δθ| ÷ lr', x: LEFT_X, y: 468, h: 52, cell: CELL, opacity: 0, role: 'output',
        labels: names, values: { $derive: 'selAbs' }, peak: { $derive: 'selPeak' } } },
    { id: 'update-grid', type: 'grid', semanticId: 'update', conceptId: 'optimizer',
      initialState: { label: 'Δθ ÷ lr at step {{steps}}, signed', x: LEFT_X, y: 580, rows: 2, cols: 4, cell: CELL, opacity: 0, role: 'output',
        matrixKind: 'derived', rowLabels: ['SGD baseline', 'selected'], values: { $derive: 'updateRows' },
        cellHighlight: { row: 1 }, cellHighlightKind: 'highlight' } },
    { id: 'units-note', type: 'text', semanticId: 'units-note', conceptId: 'optimizer',
      initialState: { text: 'Δθ ÷ lr: the change at step {{steps}}, in units of lr', x: 40, y: NOTE_Y, typography: 'annotation' } },
    { id: 'bars-note', type: 'text', semanticId: 'bars-scale-note', conceptId: 'optimizer',
      initialState: { text: 'both bar rows share one scale within each preset', x: 40, y: NOTE_Y + 20, typography: 'annotation' } },
    { id: 'rms-note', type: 'text', semanticId: 'rms-note', conceptId: 'optimizer',
      initialState: { text: 'RMS = √(mean of g²) over all {{steps}} steps', x: 40, y: NOTE_Y + 40, typography: 'annotation' } },

    // Right: what the selected rule does, the toy parameters, and AdamW's addition.
    { id: 'selected', type: 'text', semanticId: 'selected-optimizer', conceptId: 'optimizer',
      initialState: { text: 'Selected: {{selLabel}}', x: RIGHT_X, y: 126, typography: 'heading', role: 'output' } },
    ...[0, 1, 2, 3, 4, 5].map(line => ({ id: `explain-${line}`, type: 'text', semanticId: `explain-${line}`, conceptId: 'optimizer',
      initialState: { text: `{{explain.${line}}}`, x: RIGHT_X, y: 156 + line * 22 } })),
    { id: 'params-title', type: 'text', semanticId: 'params-title', conceptId: 'optimizer',
      initialState: { text: 'The toy parameters and their starting values:', x: RIGHT_X, y: 298, typography: 'annotation' } },
    ...[0, 1, 2, 3].map(index => ({ id: `param-${index}`, type: 'text', semanticId: `param-${index}`, conceptId: 'optimizer',
      initialState: { text: `{{params.${index}.name}}  {{params.${index}.role}}; θ starts at {{params.${index}.theta}}`, x: RIGHT_X + 12, y: 318 + index * 18, typography: 'annotation' } })),
    { id: 'decay-grid', type: 'grid', semanticId: 'adamw-decay-part', conceptId: 'weight-decay',
      initialState: { label: 'What AdamW adds (Δθ ÷ lr)', x: 580, y: 450, rows: 3, cols: 4, cell: CELL, opacity: 0, role: 'neutral',
        matrixKind: 'derived', columnLabels: names, rowLabels: ['Adam', '+ decay (live)', '= AdamW'], values: { $derive: 'decayRows' } } },
    { id: 'decay-note-1', type: 'text', semanticId: 'decay-note-1', conceptId: 'weight-decay',
      initialState: { text: 'live calculation: + decay = AdamW’s Δθ ÷ lr minus Adam’s', x: RIGHT_X, y: DECAY_NOTE_Y, typography: 'annotation' } },
    { id: 'decay-note-2', type: 'text', semanticId: 'decay-note-2', conceptId: 'weight-decay',
      initialState: { text: 'the decay part −wd × θ (wd {{wd}}) pulls each weight toward zero', x: RIGHT_X, y: DECAY_NOTE_Y + 20, typography: 'annotation' } },
    { id: 'decay-note-3', type: 'text', semanticId: 'decay-note-3', conceptId: 'weight-decay',
      initialState: { text: 'cells are rounded; the decay row uses unrounded values', x: RIGHT_X, y: DECAY_NOTE_Y + 40, typography: 'annotation' } },

    // Decay exemptions (right column, under the decay notes; each sentence
    // wrapped onto two lines to fit the column), then toy settings and what is
    // deliberately not modelled (full width, at the bottom).
    { id: 'exempt-note-1', type: 'text', semanticId: 'exempt-note-1', conceptId: 'weight-decay',
      initialState: { text: 'No decay for 1-D params (biases, LayerNorm weights);', x: RIGHT_X, y: NOTE_Y - 20, typography: 'annotation' } },
    { id: 'exempt-note-1b', type: 'text', semanticId: 'exempt-note-1b', conceptId: 'weight-decay',
      initialState: { text: 'the toy b stands for them.', x: RIGHT_X, y: NOTE_Y, typography: 'annotation' } },
    { id: 'exempt-note-2', type: 'text', semanticId: 'exempt-note-2', conceptId: 'weight-decay',
      initialState: { text: 'NanoGPT sets bias = {{biasFlag}},', x: RIGHT_X, y: NOTE_Y + 20, typography: 'annotation' } },
    { id: 'exempt-note-2b', type: 'text', semanticId: 'exempt-note-2b', conceptId: 'weight-decay',
      initialState: { text: 'so there only LayerNorm weights are exempt.', x: RIGHT_X, y: NOTE_Y + 40, typography: 'annotation' } },
    { id: 'settings-note', type: 'text', semanticId: 'settings-note', conceptId: 'optimizer',
      initialState: { text: 'betas ({{b1}}, {{b2}}) and wd {{wd}} are source values, NanoGPT’s defaults; lr {{lr}} is a toy choice.', x: 40, y: 780, typography: 'annotation' } },
    { id: 'beta2-note', type: 'text', semanticId: 'beta2-note', conceptId: 'optimizer',
      initialState: { text: 'NanoGPT’s Shakespeare-char config raises beta2 to {{charB2}}; the toy keeps {{b2}}.', x: 40, y: 800, typography: 'annotation' } },
    { id: 'clip-note', type: 'text', semanticId: 'clip-note', conceptId: 'optimizer',
      initialState: { text: 'Not modelled: NanoGPT clips the gradient norm to {{clip}} before each step.', x: 40, y: 820, typography: 'annotation' } },
  ],
  timeline: [
    { at: 0.2, action: 'appear', target: 'grad-grid', duration: 0.4 },
    { at: 0.7, action: 'appear', target: 'sgd-bars', duration: 0.4 },
    { at: 1.0, action: 'appear', target: 'step-bars', duration: 0.4 },
    { at: 1.3, action: 'appear', target: 'update-grid', duration: 0.4 },
    { at: 1.8, action: 'appear', target: 'decay-grid', duration: 0.4 },
  ],
};

// Most important first: the AdamW line and its decay groups, then the values
// the card shows, then how the toy numbers were made.
const { defaults, shakespeareChar } = fx.config;
export const sources = [
  code('model.py', 284, 284, 'configure_optimizers() (from line 263) builds NanoGPT\'s optimizer: "optimizer = torch.optim.AdamW(optim_groups, lr=learning_rate, betas=betas, **extra_args)".'),
  code('model.py', 268, 275, `Two optimizer groups: params with p.dim() >= 2 get weight_decay, the rest 0.0 - "all weight tensors in matmuls + embeddings decay, all biases and layernorms don't."`),
  code('model.py', 23, 23, `LayerNorm's gain is a 1-D parameter named weight, so it lands in the no-decay group: "self.weight = nn.Parameter(torch.ones(ndim))".`),
  code('train.py', 56, 56, `"bias = False # do we use bias inside LayerNorm and Linear layers?" - the char config does not override it (bias = ${fx.architecture.bias ? 'True' : 'False'} resolved), so only LayerNorm weights are exempt.`),
  code('train.py', 60, 63, 'The defaults behind wd, betas and grad_clip on the card: "weight_decay = 1e-1", "beta1 = 0.9", "beta2 = 0.95", "grad_clip = 1.0 # clip gradients at this value, or disable if == 0.0".'),
  code('config/train_shakespeare_char.py', 31, 31, `The char config's override, "beta2 = 0.99 # make a bit bigger because number of tokens per iter is small"; the toy keeps ${defaults.beta2}.`),
  code('train.py', 307, 309, 'Not modelled on the card: when grad_clip != 0.0, "torch.nn.utils.clip_grad_norm_(model.parameters(), grad_clip)" runs before the optimizer step (scaler.step(optimizer), line 311).'),
  calculation('Calculated toy example', `Four toy parameters and their ${opt.steps} gradients`,
    `generate_fixtures.py optimizer(): the four parameters and starting values shown, and one ${opt.steps}-step gradient sequence drawn with random.Random(${fx.provenance.seed}).gauss around a per-parameter mean (w₁ 5 ± 0.2, w₂ 0.05 ± 0.005, w₃ 0 ± 1, b 0.5 ± 0.05) - not from a loss. The same sequence feeds all four optimizers; the grid shows the last gradient and each parameter's mean and RMS, rounded to 4 decimals.`),
  calculation('Calculated toy example', 'The four stored updates',
    `The generator runs each rule in plain Python on those gradients (not NanoGPT's code): SGD θ -= lr·g; momentum buf = 0.9·buf + g, θ -= lr·buf; Adam with bias-corrected m and v and eps 1e-8 (torch.optim.AdamW's default); AdamW = Adam plus θ *= (1 - lr·wd) on w₁, w₂, w₃ only. lr ${opt.lr} and momentum 0.9 are toy choices, betas and wd the train.py defaults. Each preset shows the last step's Δθ ÷ lr.`),
  calculation('Source value', 'betas, weight decay, grad_clip and bias',
    `Read by generate_fixtures.py from train.py's top-level assignments at the pinned revision (ast literal_eval): beta1 ${defaults.beta1}, beta2 ${defaults.beta2}, weight_decay ${defaults.weight_decay}, grad_clip ${defaults.grad_clip}, bias ${defaults.bias ? 'True' : 'False'}. The char beta2 ${shakespeareChar.beta2} is config/train_shakespeare_char.py executed over those defaults, as configurator.py does.`),
  calculation('Live calculation', 'The + decay row',
    `Computed on the card: a sub op, AdamW's stored Δθ ÷ lr minus Adam's, per parameter from the unrounded values; a concat op stacks Adam, + decay and = AdamW.`),
];

export const evidence = {
  card: 'c20-optimizer',
  title: scene.title,
  learningQuestion: scene.objects[0].initialState.text,
  concept: 'One optimizer update per parameter: SGD (baseline), SGD + momentum, Adam (a running average of g divided by its running RMS), and AdamW - Adam plus decoupled weight decay on p.dim() >= 2 params only (1-D biases and LayerNorm weights exempt), which is what NanoGPT builds.',
  sourceRevision: `${fx.provenance.nanogpt.repo}@${fx.provenance.nanogpt.commit}`,
  provenance: 'Calculated toy example: fx.optimizer from generate_fixtures.py optimizer() (4 params with starting values, one seeded 20-step gradient sequence with its per-parameter mean and RMS, last-step update in lr units per optimizer). Live calculation: the AdamW - Adam decay row (sub op) in the Adam / + decay / = AdamW grid. Source values: fx.config.defaults beta1, beta2, weight_decay, grad_clip (train.py:60-63) and fx.config.shakespeareChar.beta2 (config/train_shakespeare_char.py:31); train.py:56 bias = False (fx.architecture.bias). Source citations: model.py:263-284 (AdamW at :284, dim >= 2 decay groups at :268-275, LayerNorm weight at :23), train.py:307-309 clipping.',
  control: 'optimizer: index picker over the four stored toy results (SGD, SGD + momentum 0.9, Adam, AdamW (as in NanoGPT)), labelled as presets.',
  consequence: 'The selected bars and the selected row of the update grid switch to that optimizer while the SGD baseline bars and row stay, on one scale per preset: momentum piles steady gradients up far past SGD, Adam gives every steady parameter about one lr (w2 now as far as w1), AdamW adds a pull toward zero on the weights and leaves the 1-D b alone. The heading and six explanation lines follow the selection.',
  interactionPurpose: 'Compare each update rule against SGD on the same gradients, to see where step size stops tracking gradient size and what decoupled decay adds on top of Adam.',
  task: 'Explore only (no practice): pick each optimizer and compare its w1 vs w2 step sizes with the SGD row, the noisy w3, and the exempt b.',
  capability: 'index picker -> pick of stored fixture rows (grid, two bars objects sharing a picked per-preset peak, picked sentence lists); concat ops for a baseline+selected grid and an Adam / + decay / = AdamW grid; sub op for the live decay row; grid row highlight for the selected row; fx.config source values bound into text; code citations and number provenance as collapsed sources.',
};
