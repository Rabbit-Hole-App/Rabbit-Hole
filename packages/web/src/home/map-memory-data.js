// MAP MEMORY FIXTURES - Rabbit Hole preview build only (WP6 checkpoint 2, user 2026-09-28/29).
// Made-up decisions, questions and sessions so the Map's work-memory layers can be judged before
// Knowledge Capture v1 exists. Loaded only by review-fixtures.js's literal guard and only with
// ?fixtures=1; never sent to an API or the model, never in any database. Every screen showing them
// says "Fixture · UI preview". People are roles, not names. Code ids are real node ids of the
// karpathy/nanoGPT snapshot (3adf61e); line numbers are those nodes' own lines.
const base = { fixture: true, visibility: 'project', owner: null };
const attn = 'model_causalselfattention';
const rec = (id) => ({ id, confidence: 'RECORDED' });
const inf = (id, score) => ({ id, confidence: 'INFERRED', score });
const PRIVATE = { visibility: 'private', owner: 'teammate@example.com' };

const sessions = [
  { ...base, id: 'fx-s-attention', title: 'Attention internals walkthrough', summary: 'Walked through CausalSelfAttention: the fused QKV projection, the causal mask and the flash-attention path.', participant: 'Project maintainer', agent: 'Claude Code', at: '2026-09-12', code: [rec(attn), rec(`${attn}_init`), rec(`${attn}_forward`)] },
  { ...base, id: 'fx-s-model', title: 'Model setup review', summary: 'Reviewed LayerNorm, weight tying and loading GPT-2 weights.', participant: 'Project maintainer', agent: 'Claude Code', at: '2026-09-15', code: [rec('model_layernorm'), rec('model_gpt_init'), rec('model_gpt_from_pretrained')] },
  { ...base, id: 'fx-s-training', title: 'Training loop tuning', summary: 'Tuned the optimizer groups, the learning-rate schedule and the config overrides.', participant: 'Project maintainer', agent: null, at: '2026-09-18', code: [rec('model_gpt_configure_optimizers'), rec('train_get_lr'), rec('configurator')] },
  { ...base, ...PRIVATE, id: 'fx-s-private', title: 'Private debugging session', summary: 'Debugged a slow generate loop.', participant: 'A teammate', agent: null, at: '2026-09-20', code: [rec('model_gpt_generate')] },
];

const decisions = [
  { ...base, id: 'fx-d-fused-qkv', title: 'Project Q, K and V with one Linear layer', rationale: 'One matmul instead of three means fewer kernel launches; the output is split into q, k and v.', alternatives: ['Three separate Linear layers'], who: 'Project maintainer', agent: 'Claude Code', session: 'fx-s-attention', at: '2026-09-12', evidence: [{ path: 'model.py', line: 31, note: 'CausalSelfAttention.__init__' }], code: [rec(attn), rec(`${attn}_init`)] },
  { ...base, id: 'fx-d-flash', title: 'Use flash attention when PyTorch has it', rationale: 'scaled_dot_product_attention is much faster; older PyTorch keeps the masked-softmax path.', alternatives: ['Manual attention only'], who: 'Project maintainer', agent: 'Claude Code', session: 'fx-s-attention', at: '2026-09-12', evidence: [{ path: 'model.py', line: 52, note: 'CausalSelfAttention.forward' }], code: [rec(attn), rec(`${attn}_forward`)] },
  { ...base, id: 'fx-d-layernorm-bias', title: 'LayerNorm with an optional bias', rationale: 'PyTorch LayerNorm has no bias=False switch, and dropping the bias is slightly better and faster.', alternatives: ['nn.LayerNorm with a bias everywhere'], who: 'Project maintainer', agent: 'Claude Code', session: 'fx-s-model', at: '2026-09-15', evidence: [{ path: 'model.py', line: 18, note: 'class LayerNorm' }], code: [rec('model_layernorm'), inf('model_gptconfig', 0.64)] },
  { ...base, id: 'fx-d-weight-tying', title: 'Tie the token embedding to the output head', rationale: 'wte and lm_head share one matrix, which saves parameters and matches GPT-2.', alternatives: ['A separate output projection'], who: 'Project maintainer', agent: 'Claude Code', session: 'fx-s-model', at: '2026-09-15', evidence: [{ path: 'model.py', line: 120, note: 'GPT.__init__' }], code: [rec('model_gpt_init'), inf('model_gpt_from_pretrained', 0.58)] },
  { ...base, id: 'fx-d-weight-decay', title: 'Decay only 2-D weights', rationale: 'Matrices and embeddings get weight decay; biases and LayerNorm weights do not.', alternatives: ['Decay every parameter'], who: 'Project maintainer', agent: null, session: 'fx-s-training', at: '2026-09-18', evidence: [{ path: 'model.py', line: 263, note: 'GPT.configure_optimizers' }], code: [rec('model_gpt_configure_optimizers')] },
  { ...base, id: 'fx-d-configurator', title: 'Override settings with a small exec-based configurator', rationale: 'Config files and --key=value flags overwrite globals, with no argparse boilerplate.', alternatives: ['argparse', 'A config framework'], who: 'Project maintainer', agent: null, session: 'fx-s-training', at: '2026-09-18', evidence: [{ path: 'configurator.py', line: 1, note: 'configurator.py' }], code: [rec('configurator'), inf('train', 0.55)] },
];

const questions = [
  { ...base, id: 'fx-q-mask', question: 'Why is the causal mask a registered buffer?', answer: 'So it moves to the GPU with the module and is saved with it, without being a trained parameter.', resolved: true, session: 'fx-s-attention', code: [rec(attn), rec(`${attn}_init`)] },
  { ...base, id: 'fx-q-sqrt', question: 'Why divide the attention scores by the square root of the head size?', answer: 'It keeps the scores near unit variance, so softmax does not saturate as the head size grows.', resolved: true, session: 'fx-s-attention', code: [rec(attn), rec(`${attn}_forward`)] },
  { ...base, id: 'fx-q-bias', question: 'Why is the LayerNorm bias optional?', answer: 'PyTorch LayerNorm cannot turn the bias off, so this class adds that switch.', resolved: true, session: 'fx-s-model', code: [rec('model_layernorm')] },
  { ...base, id: 'fx-q-crop', question: 'What does crop_block_size change when loading a checkpoint?', answer: null, resolved: false, session: 'fx-s-model', code: [rec('model_gpt_crop_block_size')] },
  { ...base, id: 'fx-q-lr', question: 'Why warm up and then decay the learning rate with a cosine?', answer: 'Warmup avoids early instability; the cosine decay settles training toward min_lr.', resolved: true, session: 'fx-s-training', code: [rec('train_get_lr')] },
  { ...base, ...PRIVATE, id: 'fx-q-private', question: 'Why does generate slow down on long prompts?', answer: 'Each step reruns the whole cropped context.', resolved: true, session: 'fx-s-private', code: [rec('model_gpt_generate')] },
];

// Keyed by lower-cased owner/repo; any other repository has no memory.
export const MEMORY = { 'karpathy/nanogpt': { decisions, questions, sessions } };
