// Training and loss - Deep dive. What exactly one iteration of train.py does,
// step by step, each step named after the code that runs it: get_lr(it) and
// which of its three branches fires -> estimate_loss() when it % eval_interval
// == 0 (and the iter_num > 0 guard on saving) -> micro-steps of forward,
// F.cross_entropy over B*T flattened positions (ignore_index=-1) and
// (loss / M).backward() -> clip_grad_norm_ -> the AdamW step (decay only on
// tensors with dim >= 2) -> zero_grad(set_to_none=True). Two controls: the
// iteration (six stops including an edge case at it = 0 and a what-if past
// lr_decay_iters) and the shipped config (shakespeare_char on one GPU vs
// train_gpt2 on eight). The equations, shapes and per-step notes follow both;
// the source inspector is the code connection (every step has a code source).
//
// Numbers: SOURCE values from gen_training_loss.py, which resolves both config
// files over train.py's defaults the way configurator.py does, executes
// train.py's own get_lr at each stop, and reads the vocabulary size train.py
// would pick (meta.pkl for shakespeare_char, the 50304 default for
// openwebtext) and ln V. Tokens per iteration (train.py computes and prints
// it) and the logits counts B*T*V and M*B*T*V are products of those values,
// formatted with thousands separators as train.py prints them. LIVE: B*T, M*B
// and M*P*B, from derive ops over the picked values.
import fx from '../../fixtures/nanogpt-fixtures.generated.js';
import tl from '../fixtures/training-loss.generated.js';
import { code, calculation } from '../../sources.js';

const IT = tl.iteration;
const byConfig = f => Object.fromEntries(IT.configs.map(c => [c.id, f(c)]));
const eta = x => x.toExponential(0); // 0.001 -> "1e-3", as the config files write it
const BRANCH = { warmup: 0, cosine: 1, floor: 2 };

// The active get_lr branch as an equation, with this stop's numbers.
function equation(c, s) {
  if (s.branch === 'warmup') return `\\eta_t=\\eta\\,\\frac{t+1}{W+1},\\quad t=${s.iteration},\\ W=${c.warmupIters}`;
  if (s.branch === 'floor') return `\\eta_t=\\eta_{\\min}\\quad\\text{because}\\ t=${s.iteration}>D=${c.lrDecayIters}`;
  const r = (s.iteration - c.warmupIters) / (c.lrDecayIters - c.warmupIters);
  return `\\eta_t=\\eta_{\\min}+\\tfrac{1}{2}(1+\\cos\\pi r)(\\eta-\\eta_{\\min}),\\ r=${r}`;
}

// estimate_loss(): whether this iteration evaluates, and whether it may save.
function evalLine(c, s) {
  const head = `${s.iteration} % ${c.evalInterval} = ${s.iteration % c.evalInterval}`;
  if (!s.reached) return `${head}: skipped (and never reached)`;
  if (!s.evaluates) return `${head}: skipped this iteration`;
  if (s.iteration === 0) return `${head}: runs, but saves nothing: the save needs iter_num > 0`;
  return c.alwaysSaveCheckpoint ? `${head}: runs; always_save_checkpoint = True, so it saves ckpt.pt`
    : `${head}: runs; saves ckpt.pt only if val < best_val_loss`;
}

// What this stop shows that the others do not (two lines; edge cases first).
function note(c, s, k) {
  const lr = s.lrText;
  return [
    [`Edge case, it = 0: lr = η/(W + 1) = ${lr}, not 0. A fresh model should score about ln V = ln ${c.vocabSize} = ${c.lnVocab.toFixed(2)}:`,
      'its weights start at N(0, 0.02), so its softmax is close to an even guess. Far above that means a broken init.'],
    [`Last warmup step: lr = η·W/(W + 1) = ${lr}; the next iteration starts the cosine at exactly η = ${eta(c.learningRate)}.`, ''],
    [`First cosine step: r = 0 and cos 0 = 1, so lr = η = ${lr}, the peak.`, ''],
    [`Halfway: r = 0.5 and cos(π/2) = 0, so lr = (η + η_min)/2 = ${lr}.`, ''],
    [`Last iteration: r = 1 and cos π = −1, so lr = η_min = ${lr}; then iter_num > max_iters ends the loop.`, ''],
    [`What-if, it = ${s.iteration}: the floor branch returns η_min = ${lr}. Training never gets here:`,
      `lr_decay_iters = max_iters = ${c.maxIters}, and the loop ends once iter_num > max_iters.`],
  ][k];
}

const STOP_LABELS = ['it = 0', 'last warmup step', 'first cosine step', 'halfway through decay', 'it = max_iters', 'past decay (what-if)'];
const EDGE = [true, false, false, false, false, true];
const ROLE_ROWS = [['output', 'neutral', 'neutral'], ['neutral', 'output', 'neutral'], ['neutral', 'neutral', 'output']];

// Step boxes down the left, each with its own line(s) on the right.
const BOX = { x: 70, w: 270, h: 34 };
const RIGHT = 364;
const STEPS = [
  { id: 'get-lr', y: 84, label: 'get_lr({{it}}) = {{lrText}}' },
  { id: 'estimate', y: 172, label: 'estimate_loss(): {{evalWord}}', role: { $derive: 'evalRole' } },
  { id: 'forward', y: 224, label: 'model(X, Y)' },
  { id: 'loss', y: 276, label: 'F.cross_entropy(…)' },
  { id: 'backward', y: 350, label: '(loss / M).backward()' },
  { id: 'clip', y: 402, label: 'clip_grad_norm_(…)' },
  { id: 'step', y: 454, label: 'optimizer.step()' },
  { id: 'zero', y: 528, label: 'zero_grad(set_to_none=True)' },
];
const at = id => STEPS.find(s => s.id === id).y;
const PANEL = 594; // the stop's note, then the tradeoff
const LOOP = { x: 34, top: at('forward'), bottom: at('backward') + BOX.h };

const text = (id, initialState, conceptId = 'training-loop') => ({ id, type: 'text', semanticId: id, conceptId, initialState });
const eq = (id, latex, y, w = 560) => ({ id, type: 'equation', semanticId: id, conceptId: 'training-loop',
  initialState: { text: latex, x: RIGHT, y, w, h: 40 } });
const box = ({ id, y, label, role }) => ({ id, type: 'box', semanticId: id, conceptId: 'training-loop',
  initialState: { label, x: BOX.x, y, w: BOX.w, h: BOX.h, role: role || 'code', opacity: 0 } });
const arrow = (from, to) => ({ id: `arrow-${from.id}`, type: 'arrow', semanticId: `arrow-${from.id}`, conceptId: 'training-loop',
  initialState: { from: { x: BOX.x + BOX.w / 2, y: from.y + BOX.h + 2 }, to: { x: BOX.x + BOX.w / 2, y: to.y - 3 }, role: 'neutral', opacity: 0 } });
const branchBox = (k, label) => ({ id: `branch-${k}`, type: 'box', semanticId: `branch-${k}`, conceptId: 'training-loop',
  initialState: { label, x: RIGHT + k * 156, y: at('get-lr'), w: 150, h: 30, role: { $derive: `stripRoles.${k}` } } });

// Every per-config table is read the same way: pick the config's row, then the stop.
const perStop = Object.fromEntries(['it', 'lrText', 'branch', 'eq', 'eval', 'evalWord', 'evalRole', 'status', 'noteA', 'noteB']
  .flatMap(name => [[`${name}Row`, { op: 'pick', args: [`${name}All`, 'config'] }], [name, { op: 'pick', args: [`${name}Row`, 'stop'] }]]));

export const scene = {
  id: 'depth-training-loss-deep',
  title: 'Training and loss · Deep dive: one iteration of train.py',
  width: 960,
  height: 720,
  duration: 2.4,
  inputs: [
    { name: 'stop', type: 'index', label: 'Iteration', of: 'stopLabels', default: 3, presentation: 'picker' },
    { name: 'config', type: 'choice', label: 'Shipped config', default: 'char',
      options: [{ id: 'char', label: 'shakespeare_char, 1 GPU' }, { id: 'gpt2', label: 'train_gpt2, 8 GPUs' }] },
  ],
  exampleData: {
    stopLabels: STOP_LABELS,
    B: byConfig(c => c.batchSize),
    T: byConfig(c => c.blockSize),
    V: byConfig(c => c.vocabSize),
    M: byConfig(c => c.gradAccumPerProcess),
    P: byConfig(c => c.worldSize),
    itAll: byConfig(c => c.stops.map(s => s.iteration)),
    lrTextAll: byConfig(c => c.stops.map(s => s.lrText)),
    branchAll: byConfig(c => c.stops.map(s => BRANCH[s.branch])),
    eqAll: byConfig(c => c.stops.map(s => equation(c, s))),
    evalAll: byConfig(c => c.stops.map(s => evalLine(c, s))),
    evalWordAll: byConfig(c => c.stops.map(s => (s.evaluates && s.reached ? 'runs' : 'skipped'))),
    evalRoleAll: byConfig(c => c.stops.map(s => (s.evaluates && s.reached ? 'success' : 'neutral'))),
    statusAll: byConfig(c => c.stops.map(s => (s.reached ? 'Source value' : 'What-if'))),
    noteAAll: byConfig(c => c.stops.map((s, k) => note(c, s, k)[0])),
    noteBAll: byConfig(c => c.stops.map((s, k) => note(c, s, k)[1])),
    noteRoles: EDGE.map(edge => (edge ? 'warning' : 'neutral')),
    roleRows: ROLE_ROWS,
    decayText: byConfig(c => `λ = ${c.weightDecay} only where dim ≥ 2 (weights, embeddings); betas (${c.betas.join(', ')})`),
    clipText: byConfig(c => c.gradClip.toFixed(1)),
    // Counts, grouped as train.py prints tokens_per_iter ("{tokens_per_iter:,}").
    tokensText: byConfig(c => (c.gradAccumPerProcess * c.worldSize * c.batchSize * c.blockSize).toLocaleString('en-US')),
    logitsText: byConfig(c => (c.batchSize * c.blockSize * c.vocabSize).toLocaleString('en-US')),
    // The same logits for all M micro-steps' sequences in one pass: what accumulation avoids holding.
    logitsAllText: byConfig(c => (c.gradAccumPerProcess * c.batchSize * c.blockSize * c.vocabSize).toLocaleString('en-US')),
  },
  derived: {
    ...perStop,
    stripRoles: { op: 'pick', args: ['roleRows', 'branch'] },
    noteRole: { op: 'pick', args: ['noteRoles', 'stop'] },
    b: { op: 'pick', args: ['B', 'config'] },
    t: { op: 'pick', args: ['T', 'config'] },
    v: { op: 'pick', args: ['V', 'config'] },
    m: { op: 'pick', args: ['M', 'config'] },
    p: { op: 'pick', args: ['P', 'config'] },
    decay: { op: 'pick', args: ['decayText', 'config'] },
    clip: { op: 'pick', args: ['clipText', 'config'] },
    tokensShown: { op: 'pick', args: ['tokensText', 'config'] },
    logitsShown: { op: 'pick', args: ['logitsText', 'config'] },
    logitsAllShown: { op: 'pick', args: ['logitsAllText', 'config'] },
    // Live: B*T rows after view(-1, V), M*B sequences one process would hold
    // without accumulation, and M*P*B sequences behind each step's gradient
    // (DDP averages the P processes' accumulated gradients before clipping
    // and the step).
    vb: { op: 'concat', args: ['b'] },
    vt: { op: 'concat', args: ['t'] },
    vm: { op: 'concat', args: ['m'] },
    vp: { op: 'concat', args: ['p'] },
    bt: { op: 'dot', args: ['vb', 'vt'] },
    mp: { op: 'dot', args: ['vm', 'vp'] },
    mb: { op: 'dot', args: ['vm', 'vb'] },
    vmp: { op: 'concat', args: ['mp'] },
    mpb: { op: 'dot', args: ['vmp', 'vb'] },
  },
  objects: [
    text('question', { text: 'What exactly does one iteration of NanoGPT’s training loop do?', x: 40, y: 34, typography: 'heading' }),
    text('prerequisites', { text: 'Builds on: Guided (the loss is the mean of −ln p); tensor shapes, gradients, AdamW.', x: 40, y: 58, typography: 'annotation' }),
    ...STEPS.map(box),
    ...STEPS.slice(1).map((step, i) => arrow(STEPS[i], step)),
    { id: 'loop', type: 'line', semanticId: 'loop', conceptId: 'training-loop',
      initialState: { from: { x: LOOP.x, y: LOOP.top }, to: { x: LOOP.x, y: LOOP.bottom }, role: 'code' } },
    text('loop-label', { text: 'micro-steps: M = {{m}}', x: 52, y: LOOP.bottom - 20, typography: 'annotation', rotation: -90 }),
    // get_lr: which of its three branches runs, the branch as an equation, and the status of the value.
    branchBox(0, 'warmup: t < W'),
    branchBox(1, 'cosine: W ≤ t ≤ D'),
    branchBox(2, 'floor: t > D'),
    text('lr-status', { text: '{{status}}', x: RIGHT + 3 * 156 + 2, y: at('get-lr') + 20, typography: 'annotation' }),
    eq('lr-eq', '{{eq}}', at('get-lr') + 38, 580),
    text('eval-line', { text: '{{eval}}', x: RIGHT, y: at('estimate') + 22, typography: 'annotation' }),
    text('shapes', { text: 'X, Y: (B, T) = ({{b}}, {{t}})   →   logits: (B, T, V) = ({{b}}, {{t}}, {{v}})', x: RIGHT, y: at('forward') + 22, typography: 'annotation' }),
    // ignore_index=-1: the mean runs over the targets that are not -1; get_batch never emits -1, so N = B*T.
    eq('loss-eq', '\\mathcal{L}_m=-\\tfrac1N\\sum_{i:\\,y_i\\neq-1}\\ln\\mathrm{softmax}(z_i)[y_i]', at('loss') - 6, 590),
    text('flatten', { text: 'view(−1, V): (B·T, V) = ({{bt}}, {{v}}); get_batch emits no −1, so N = B·T', x: RIGHT, y: at('loss') + 52, typography: 'annotation' }),
    // DDP all-reduces (averages) the P processes' gradients at the last micro-step.
    eq('accum-eq', 'g=\\frac1P\\sum_{p,m}\\nabla_\\theta\\frac{\\mathcal{L}_{p,m}}{M},\\ P={{p}},\\ M={{m}}', at('backward') - 6, 580),
    eq('clip-eq', 'g\\gets g\\,\\min(1,\\,c/\\lVert g\\rVert_2),\\quad c={{clip}}', at('clip') - 6),
    eq('adamw-eq', '\\theta\\gets\\theta-\\eta_t(\\hat m/(\\sqrt{\\hat v}+\\epsilon)+\\lambda\\theta)', at('step') - 6, 580),
    text('decay', { text: '{{decay}}', x: RIGHT, y: at('step') + 52, typography: 'annotation' }),
    text('zero-note', { text: 'grads become None, not zeros: memory is freed until the next backward', x: RIGHT, y: at('zero') + 22, typography: 'annotation' }),
    // The stop's own lesson, then the batch/memory tradeoff.
    text('note-a', { text: '{{noteA}}', x: 40, y: PANEL, typography: 'annotation', role: { $derive: 'noteRole' } }, 'edge-case'),
    text('note-b', { text: '{{noteB}}', x: 40, y: PANEL + 18, typography: 'annotation', role: { $derive: 'noteRole' } }, 'edge-case'),
    text('tokens', { text: 'Tokens per iteration = M·P·B·T = {{m}}·{{p}}·{{b}}·{{t}} = {{tokensShown}}, as printed at start-up (Source value)', x: 40, y: PANEL + 46 }, 'tradeoff'),
    text('memory', { text: 'Tradeoff: memory holds one micro-step’s activations (the logits alone are B·T·V = {{logitsShown}} values),', x: 40, y: PANEL + 68, typography: 'annotation' }, 'tradeoff'),
    text('memory-2', { text: 'and time pays for M = {{m}} of them in a row; each step’s gradient averages M·P·B = {{mpb}} sequences (Live calculation).', x: 40, y: PANEL + 86, typography: 'annotation' }, 'tradeoff'),
    text('memory-3', { text: 'Without accumulation one process would hold all M·B = {{mb}} sequences at once (logits: M·B·T·V = {{logitsAllShown}} values).', x: 40, y: PANEL + 104, typography: 'annotation' }, 'tradeoff'),
  ],
  timeline: STEPS.flatMap((step, k) => [
    { at: 0.1 + k * 0.25, action: 'appear', target: step.id, duration: 0.25 },
    ...(k ? [{ at: k * 0.25, action: 'appear', target: `arrow-${STEPS[k - 1].id}`, duration: 0.15 }] : []),
  ]),
};

const REPRODUCE = 'python packages/web/src/nanogpt/depth/fixtures/gen_training_loss.py --check';
const [CHAR, GPT2] = IT.configs;

export const sources = [
  code('train.py', 231, 242, 'get_lr(it): “if it < warmup_iters” (linear warmup), “if it > lr_decay_iters: return min_lr” (the floor), otherwise the cosine from learning_rate down to min_lr.'),
  code('train.py', 257, 260, '“lr = get_lr(iter_num) if decay_lr else learning_rate”, written into every optimizer param group at the top of each iteration.'),
  code('train.py', 262, 286, '“if iter_num % eval_interval == 0 and master_process:” runs estimate_loss(); a checkpoint is written only “if losses[\'val\'] < best_val_loss or always_save_checkpoint” and “if iter_num > 0”.'),
  code('train.py', 216, 228, 'estimate_loss(): the loss averaged over eval_iters batches of each split, with the model in eval mode.'),
  code('train.py', 119, 125, 'get_batch: the data is read with “dtype=np.uint16” and the targets are the next tokens, “y = torch.stack([torch.from_numpy((data[i+1:i+1+block_size]).astype(np.int64)) for i in ix])” - never −1, so ignore_index skips nothing and the mean is over all B·T positions.'),
  code('train.py', 290, 305, 'The micro-step loop: “for micro_step in range(gradient_accumulation_steps)”, “logits, loss = model(X, Y)”, “loss = loss / gradient_accumulation_steps”, then “scaler.scale(loss).backward()” (GradScaler is a no-op unless dtype is float16). Under DDP, “model.require_backward_grad_sync = (micro_step == gradient_accumulation_steps - 1)”: the last backward averages the P processes’ gradients.'),
  code('model.py', 184, 187, 'With targets: “logits = self.lm_head(x)” over every position (B, T, V), then “F.cross_entropy(logits.view(-1, logits.size(-1)), targets.view(-1), ignore_index=-1)”.'),
  code('train.py', 306, 309, '“if grad_clip != 0.0:” unscale, then “torch.nn.utils.clip_grad_norm_(model.parameters(), grad_clip)” - the global L2 norm is scaled down to grad_clip.'),
  code('train.py', 310, 312, '“scaler.step(optimizer)” and “scaler.update()” - the AdamW step.'),
  code('model.py', 263, 284, 'configure_optimizers: “decay_params = [p for n, p in param_dict.items() if p.dim() >= 2]”, the rest get weight_decay 0.0; “torch.optim.AdamW(optim_groups, lr=learning_rate, betas=betas, **extra_args)”.'),
  code('train.py', 313, 314, '“optimizer.zero_grad(set_to_none=True)” - “flush the gradients as soon as we can, no need for this memory anymore”.'),
  code('model.py', 162, 168, '_init_weights: Linear and Embedding weights start from N(0, 0.02) (residual projections smaller still, lines 143-145), so the first logits are small and the softmax is close to even: the loss starts near ln V.'),
  code('train.py', 331, 333, '“if iter_num > max_iters: break” - with lr_decay_iters = max_iters, get_lr never takes its min_lr branch.'),
  code('train.py', 92, 95, 'Under DDP: “assert gradient_accumulation_steps % ddp_world_size == 0” and “gradient_accumulation_steps //= ddp_world_size” - the 40 of train_gpt2 becomes 5 micro-steps per process on 8 GPUs.'),
  code('train.py', 101, 102, '“tokens_per_iter = gradient_accumulation_steps * ddp_world_size * batch_size * block_size”, printed at start-up with “{tokens_per_iter:,}”: the card’s M·P·B·T, grouped the same way.'),
  code('train.py', 137, 155, 'The vocabulary: meta_vocab_size from data_dir/meta.pkl when it exists, otherwise “model_args[\'vocab_size\'] = meta_vocab_size if meta_vocab_size is not None else 50304”.'),
  code('data/shakespeare_char/prepare.py', 54, 61, 'shakespeare_char writes meta.pkl with its vocab_size (65 characters).'),
  code('data/openwebtext/prepare.py', 58, 74, 'openwebtext writes only train.bin and val.bin - no meta.pkl, so train.py falls back to 50304.'),
  code('train.py', 40, 68, 'train.py’s defaults, which a config file only overrides: “always_save_checkpoint = True”, “learning_rate = 6e-4”, “weight_decay = 1e-1”, “beta1 = 0.9”, “beta2 = 0.95”, “grad_clip = 1.0”, “warmup_iters = 2000”, “min_lr = 6e-5” - train_gpt2 keeps all of these; shakespeare_char keeps weight_decay, beta1 and grad_clip.'),
  code('config/train_shakespeare_char.py', 5, 33, `shakespeare_char: “eval_interval = 250”, “always_save_checkpoint = False”, gradient_accumulation_steps = ${CHAR.gradAccumConfigured}, batch_size = ${CHAR.batchSize}, block_size = ${CHAR.blockSize}, learning_rate = ${eta(CHAR.learningRate)}, max_iters = lr_decay_iters = ${CHAR.maxIters}, min_lr = ${eta(CHAR.minLr)}, beta2 = ${CHAR.betas[1]}, warmup_iters = ${CHAR.warmupIters}.`),
  code('config/train_gpt2.py', 1, 3, `Launched with “torchrun --standalone --nproc_per_node=8”: ${GPT2.worldSize} processes.`),
  code('config/train_gpt2.py', 9, 20, `train_gpt2: batch_size = ${GPT2.batchSize}, block_size = ${GPT2.blockSize}, gradient_accumulation_steps = 5 * 8, max_iters = lr_decay_iters = ${GPT2.maxIters}, eval_interval = ${GPT2.evalInterval} (“12 batch size * 1024 block size * 5 gradaccum * 8 GPUs = 491,520”).`),
  code('configurator.py', 20, 28, 'A config file named on the command line is exec’d over train.py’s globals - how both configs are resolved here.'),
  { ...calculation('Source value', 'Configs, learning rates, eval flags and vocabulary sizes',
    `gen_training_loss.py resolves config/train_shakespeare_char.py and config/train_gpt2.py over train.py's defaults as configurator.py does, and executes train.py's own get_lr (parsed from the pinned file) at iterations ${CHAR.stops.map(s => s.iteration).join(', ')} (shakespeare_char) and ${GPT2.stops.map(s => s.iteration).join(', ')} (train_gpt2): 0, warmup_iters − 1, warmup_iters, halfway through the decay, max_iters, and lr_decay_iters + 1 - a what-if, since max_iters = lr_decay_iters and the loop stops there. “Evaluates” is it % eval_interval == 0. V is ${CHAR.vocabSize} (meta.pkl: the dataset's distinct characters) or ${GPT2.vocabSize} (train.py's default, asserted: openwebtext writes no meta.pkl); ln V = ${CHAR.lnVocab} / ${GPT2.lnVocab} in float64. Micro-steps per process = gradient_accumulation_steps // processes (${CHAR.gradAccumConfigured} // ${CHAR.worldSize}, ${GPT2.gradAccumConfigured} // ${GPT2.worldSize}). Two products of these values are shown with thousands separators: tokens per iteration M·P·B·T, which train.py itself computes and prints (${(CHAR.gradAccumPerProcess * CHAR.worldSize * CHAR.batchSize * CHAR.blockSize).toLocaleString('en-US')} / ${(GPT2.gradAccumPerProcess * GPT2.worldSize * GPT2.batchSize * GPT2.blockSize).toLocaleString('en-US')}), B·T·V, the element count of the (B, T, V) logits one process holds per micro-step, and M·B·T·V, the logits one process would hold if all its M·B sequences ran in one pass (${(CHAR.gradAccumPerProcess * CHAR.batchSize * CHAR.blockSize * CHAR.vocabSize).toLocaleString('en-US')} / ${(GPT2.gradAccumPerProcess * GPT2.batchSize * GPT2.blockSize * GPT2.vocabSize).toLocaleString('en-US')}).`),
  reproduce: REPRODUCE },
  calculation('Live calculation', 'B·T, M·B and M·P·B',
    'Computed on the card from the picked config values with concat and dot: N = B·T (rows after view(−1, V), in the shapes and the loss equation), M·B (the sequences one process would hold at once without accumulation) and M·P·B (sequences behind each step’s gradient once DDP has averaged the P processes).'),
];

export const evidence = {
  card: 'depth-training-loss-deep',
  title: scene.title,
  learningQuestion: scene.objects[0].initialState.text,
  concept: 'One train.py iteration: get_lr picks the learning rate by branch (warmup, cosine, or the min_lr floor that the shipped configs never reach); every eval_interval iterations estimate_loss runs (no save at it = 0); M micro-steps each run the forward pass to (B, T, V) logits, flatten to (B·T, V) for cross-entropy (targets of −1 would be ignored; get_batch emits none, so the mean is over all B·T) and backpropagate loss / M, so the gradients sum to the mean over M·B sequences, and DDP averages that over the P processes (M·P·B sequences per step); the global gradient norm is clipped to grad_clip; AdamW steps with weight decay only on tensors of dim ≥ 2; gradients are set to None.',
  sourceRevision: `${fx.provenance.nanogpt.repo} @ ${fx.provenance.nanogpt.commit}`,
  provenance: 'Source value (gen_training_loss.py): both configs resolved over train.py defaults, get_lr executed from the pinned train.py at six stops each, eval flags, V (meta.pkl 65 / default 50304) and ln V, micro-steps per process. M·P·B·T, B·T·V and M·B·T·V are products of those values, grouped as train.py prints tokens_per_iter. Live calculation: B·T, M·B and M·P·B via concat/dot. Code: 23 cited ranges across train.py, model.py, both configs, configurator.py and both prepare.py files - one or more per step.',
  control: 'stop (index, picker) "Iteration": it = 0 / last warmup step / first cosine step / halfway through decay / it = max_iters / past decay (what-if); config (choice) "Shipped config": shakespeare_char on 1 GPU / train_gpt2 on 8 GPUs.',
  consequence: `The get_lr box shows get_lr(t) and its value; the branch strip lights warmup, cosine or floor and the equation switches to that branch with this stop’s numbers; the estimate_loss box turns green (runs) or grey (skipped) with its modulo and save rule; shapes, N = B·T, M, the betas and the tokens-per-iteration (as train.py prints it) and memory lines follow the config, the last giving what M = ${GPT2.gradAccumPerProcess} saves train_gpt2: without accumulation one process would hold all M·B = ${GPT2.gradAccumPerProcess * GPT2.batchSize} sequences (${(GPT2.gradAccumPerProcess * GPT2.batchSize * GPT2.blockSize * GPT2.vocabSize).toLocaleString('en-US')} logits, not ${(GPT2.batchSize * GPT2.blockSize * GPT2.vocabSize).toLocaleString('en-US')}); the note under the loop gives the stop’s lesson, in warning colour for the it = 0 edge case and the what-if.`,
  interactionPurpose: 'Pick an iteration to see which get_lr branch runs and whether this iteration evaluates or may save; switch config to see the shapes, the vocabulary and the micro-step count change, and the batch/memory tradeoff quantified.',
  task: 'At it = 0, say what lr is, what loss a healthy fresh model reports for each config, and why no checkpoint is saved; then explain why the floor branch of get_lr never runs with either shipped config, and what M = 5 buys train_gpt2.',
  capability: 'box pipeline with arrows and a rotated loop label; a three-box branch strip with input-derived roles; equations whose LaTeX is picked per (config, stop) and interpolated with live values; record-map pick by a choice input; concat/dot products for live integer arithmetic.',
  depth: 'Deep dive',
  prerequisites: 'Guided (the loss is the mean of −ln p); tensor shapes, gradients, AdamW.',
  ladderRole: 'Leaves the toy run for the code path itself: exact equations, (B, T, V) shapes, get_lr’s branches and the eval/save guards as controls, an edge case at it = 0 and a what-if past lr_decay_iters, and the accumulation tradeoff in numbers - none of which the Overview or Guided show.',
};

export const reviewStates = [
  { stop: 3, config: 'char' }, { stop: 0, config: 'char' }, { stop: 5, config: 'char' },
  { stop: 0, config: 'gpt2' }, { stop: 2, config: 'gpt2' }, { stop: 4, config: 'gpt2' },
];
