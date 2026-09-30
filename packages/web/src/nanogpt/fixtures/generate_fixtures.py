"""Authoring-time fixture generator for the nanogpt-deep-dive board.

Every number a card displays that the scene evaluator cannot compute live
(log, exp, sqrt, the learning-rate schedule, a training run, optimizer
state, tokenizer output, seeded samples) is produced HERE, reproducibly,
from pinned sources - never typed into a scene by hand.

Sources (all pinned by sha256; downloaded once into a temp cache):
  * karpathy/nanoGPT @ 3adf61e154c3fe3fca428ad6bc3818b27a3b8291 - the revision
    connected to the Rabbit Hole app repo-06745f10-nanogpt. train.py's own
    get_lr() and its default config are executed, not re-typed.
  * tinyshakespeare input.txt - the dataset data/shakespeare_char/prepare.py
    downloads; its character vocabulary is rebuilt exactly as prepare.py does.
  * tiktoken's "gpt2" encoding - what data/shakespeare/prepare.py uses.

Three provenance kinds appear in the output, and the cards say which:
  * "source"     - read from / executed from the pinned NanoGPT revision
  * "calculated" - a toy example calculated by this script (labelled toy)
  * "recorded"   - the output of a seeded run this script performs (a toy
                   bigram model, NOT NanoGPT's transformer)

Regenerate:   uv run --with tiktoken==0.14.0 python generate_fixtures.py
Verify only:  uv run --with tiktoken==0.14.0 python generate_fixtures.py --check
"""
import ast
import hashlib
import json
import math
import os
import random
import sys
import tempfile
import urllib.request

NANOGPT_REPO = 'karpathy/nanoGPT'
NANOGPT_SHA = '3adf61e154c3fe3fca428ad6bc3818b27a3b8291'
NANOGPT_FILES = {
    'train.py': '413bd97b40bb400a2a0d01230e2946f056c263ebac1b7281c2367d964a123085',
    'model.py': '7c01703240dbec5d554527dc666e35b3df8391d0b117fddc07afcf325a21d11c',
    'config/train_shakespeare_char.py': '9b41cdfb2c917259d796a8184d835221a349c23cd18a0a63b46da431d95d9c05',
    'data/shakespeare_char/prepare.py': 'd5fbea0686d146748cf36017d6c34136a2fe9c41f065f1429529ad55a992c692',
    # Cited by the cards' sources only; pinned so their tests can check the cited lines.
    'sample.py': '1c4bb3716ec55395be2e6ad136693614b0b38de9defda889041efe2057a0c1f1',
    'README.md': '8d969370683849a2cc4e46c81bf2449717f2daff657586888151933c3590f85f',
    'data/shakespeare/prepare.py': 'f8d47267f00963138314bb969e75071211bf1140c248bf31b9e60e7750027f06',
}
DATASET_URL = 'https://raw.githubusercontent.com/karpathy/char-rnn/master/data/tinyshakespeare/input.txt'
DATASET_SHA = '86c4e6aa9db7c042ec79f339dcb96d42b0075e16b8fc2e86bf0ca57e2dc565ed'
TIKTOKEN_VERSION = '0.14.0'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'nanogpt-fixtures.generated.js')
CACHE = os.path.join(tempfile.gettempdir(), 'nanogpt-fixture-cache')
SEED = 1337  # NanoGPT's own torch.manual_seed(1337 + seed_offset)


def fetch(url, sha):
    """Download once, verify the pinned sha256, return bytes."""
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, sha)
    if not os.path.exists(path):
        with urllib.request.urlopen(url) as response:
            data = response.read()
        with open(path, 'wb') as handle:
            handle.write(data)
    data = open(path, 'rb').read()
    actual = hashlib.sha256(data).hexdigest()
    if actual != sha:
        sys.exit(f'sha256 mismatch for {url}: expected {sha}, got {actual}')
    return data


def nanogpt(path):
    url = f'https://raw.githubusercontent.com/{NANOGPT_REPO}/{NANOGPT_SHA}/{path}'
    return fetch(url, NANOGPT_FILES[path]).decode('utf-8')


def r(x, digits=6):
    """Round for a stable, platform-independent file."""
    return round(float(x), digits)


def sci(x):
    """Display string for a small magnitude (a learning rate)."""
    return f'{x:.2e}'.replace('e-0', 'e-').replace('e+00', '')


# --- NanoGPT's own config + schedule, executed from the pinned source ----------

def train_py_defaults(train_src):
    """Top-level constant assignments in train.py, in order - the defaults
    that configurator.py then overrides. Only literal values are taken."""
    values = {}
    for node in ast.parse(train_src).body:
        if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
            try:
                values[node.targets[0].id] = ast.literal_eval(node.value)
            except ValueError:
                pass
    return values


def resolved_config(train_src, config_src):
    """train.py defaults overridden by a config file - how NanoGPT resolves it."""
    namespace = dict(train_py_defaults(train_src))
    exec(compile(config_src, 'config', 'exec'), {}, namespace)
    return namespace


def get_lr_factory(train_src):
    """train.py's get_lr, compiled from the pinned source; the returned
    function takes the four schedule values it reads as globals."""
    tree = ast.parse(train_src)
    fn = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'get_lr')
    module = ast.Module(body=[fn], type_ignores=[])
    code = compile(module, 'train.py:get_lr', 'exec')

    def make(learning_rate, warmup_iters, lr_decay_iters, min_lr):
        scope = {'math': math, 'learning_rate': learning_rate, 'warmup_iters': warmup_iters,
                 'lr_decay_iters': lr_decay_iters, 'min_lr': min_lr}
        exec(code, scope)
        return scope['get_lr']
    return make, fn.lineno


def lr_schedule(train_src, cfg):
    make, line = get_lr_factory(train_src)
    iters = cfg['max_iters']
    # Every 250 iterations plus the warmup corner: a piecewise-linear plot is
    # then exact on the warmup ramp and meets the peak exactly. (A scene holds
    # at most 60 objects, one per plotted segment - see the capability probe.)
    grid = sorted(set([0, cfg['warmup_iters']] + list(range(250, iters + 1, 250))))
    presets = [
        {'id': 'configured', 'label': 'as configured',
         'note': 'config/train_shakespeare_char.py: warmup_iters=100, lr_decay_iters=5000, min_lr=1e-4',
         'warmup_iters': cfg['warmup_iters'], 'decay_lr': True},
        {'id': 'no-decay', 'label': 'decay_lr = False',
         'note': 'train.py: lr = get_lr(iter_num) if decay_lr else learning_rate',
         'warmup_iters': cfg['warmup_iters'], 'decay_lr': False},
        {'id': 'long-warmup', 'label': 'warmup_iters = 1000 (what-if)',
         'note': 'hypothetical variant - not a shipped config',
         'warmup_iters': 1000, 'decay_lr': True},
    ]
    inspect_iters = [0, cfg['warmup_iters'] - 1, cfg['warmup_iters'], 1000, 2500, iters]
    out = {'source': f'train.py:{line} get_lr (executed) with config/train_shakespeare_char.py',
           'learning_rate': cfg['learning_rate'], 'min_lr': cfg['min_lr'], 'lr_decay_iters': cfg['lr_decay_iters'],
           'max_iters': iters, 'iterations': grid, 'inspectIterations': inspect_iters, 'presets': []}
    for preset in presets:
        fn = make(cfg['learning_rate'], preset['warmup_iters'], cfg['lr_decay_iters'], cfg['min_lr'])
        lr = (lambda it: fn(it)) if preset['decay_lr'] else (lambda it: cfg['learning_rate'])

        def phase(it, p=preset):
            if not p['decay_lr']:
                return 'constant (decay_lr = False)'
            if it < p['warmup_iters']:
                return 'linear warmup'
            if it > cfg['lr_decay_iters']:
                return 'min_lr floor'
            return 'cosine decay'
        out['presets'].append({
            'id': preset['id'], 'label': preset['label'], 'note': preset['note'],
            'lr': [r(lr(it), 9) for it in grid],
            'inspect': [{'iteration': it, 'lr': r(lr(it), 9), 'lrText': sci(lr(it)), 'phase': phase(it)} for it in inspect_iters],
        })
    return out


# --- tokenizers: the two NanoGPT data pipelines --------------------------------

def tokenizers(text):
    chars = sorted(list(set(text)))  # data/shakespeare_char/prepare.py, verbatim logic
    stoi = {ch: i for i, ch in enumerate(chars)}
    try:
        import tiktoken
        from importlib.metadata import version
    except ImportError:
        sys.exit(f'tiktoken missing - run: uv run --with tiktoken=={TIKTOKEN_VERSION} python generate_fixtures.py')
    if version('tiktoken') != TIKTOKEN_VERSION:
        sys.exit(f'tiktoken {version("tiktoken")} found; this fixture pins {TIKTOKEN_VERSION}')
    enc = tiktoken.get_encoding('gpt2')
    sample = 'Before we proceed any further'  # from line 2 of the dataset
    assert sample in text
    shown = lambda s: s.replace(' ', '␣').replace('\n', '⏎')  # visible space / newline
    char_ids = [stoi[c] for c in sample]
    bpe_ids = enc.encode_ordinary(sample)
    return {
        'text': sample,
        'displayNote': '␣ marks a space character inside a token',
        'tokenizers': [
            {'id': 'char', 'label': 'character-level (shakespeare_char)',
             'source': 'data/shakespeare_char/prepare.py: chars = sorted(list(set(data))); stoi = { ch:i for i,ch in enumerate(chars) }',
             'vocabSize': len(chars), 'tokens': [shown(c) for c in sample], 'ids': char_ids, 'count': len(char_ids)},
            {'id': 'bpe', 'label': 'GPT-2 BPE (tiktoken "gpt2")',
             'source': f'data/shakespeare/prepare.py: tiktoken.get_encoding("gpt2").encode_ordinary - tiktoken {TIKTOKEN_VERSION}',
             'vocabSize': enc.n_vocab, 'tokens': [shown(enc.decode([i])) for i in bpe_ids], 'ids': bpe_ids, 'count': len(bpe_ids)},
        ],
        'modelVocabNote': 'GPTConfig.vocab_size = 50304 in model.py: GPT-2\'s 50257 padded up to a multiple of 64',
    }


# --- LayerNorm, exactly as F.layer_norm computes it ----------------------------

def layernorm():
    eps = 1e-5  # model.py LayerNorm.forward: F.layer_norm(..., 1e-5)
    x = [2.0, -1.0, 0.5, 3.5, -2.5, 1.0]
    gamma = [1.2, 0.8, 1.0, 1.5, 0.5, 1.0]  # illustrative learned weight; NanoGPT initializes it to ones
    presets = [('original', 'x', x), ('shifted', 'x + 3', [v + 3 for v in x]), ('scaled', '2 · x', [2 * v for v in x])]
    out = {'eps': eps, 'gamma': gamma, 'presets': []}
    for pid, label, vec in presets:
        mean = sum(vec) / len(vec)
        var = sum((v - mean) ** 2 for v in vec) / len(vec)  # biased variance, as layer_norm uses
        std = math.sqrt(var + eps)
        xhat = [(v - mean) / std for v in vec]
        y = [g * h for g, h in zip(gamma, xhat)]  # bias=False (train.py default) -> no beta
        out['presets'].append({'id': pid, 'label': label, 'x': [r(v) for v in vec], 'centered': [r(v - mean) for v in vec],
                               'mean': r(mean, 4), 'var': r(var, 4), 'std': r(std, 4),
                               'xhat': [r(v, 4) for v in xhat], 'y': [r(v, 4) for v in y]})
    return out


# --- cross-entropy on one position ---------------------------------------------

def softmax(logits):
    m = max(logits)
    e = [math.exp(v - m) for v in logits]
    s = sum(e)
    return [v / s for v in e]


def cross_entropy():
    vocab = ['k', 'r', 't', 'c', 'l']  # toy 5-token vocabulary
    target = 0  # "hear me spea" -> 'k'
    presets = [
        ('confident-right', 'confident, right', [4.0, 1.0, 0.5, 0.2, 0.0]),
        ('hesitant-right', 'hesitant, right', [1.2, 1.0, 0.8, 0.6, 0.5]),
        ('confident-wrong', 'confident, wrong', [0.5, 4.0, 1.0, 0.2, 0.0]),
    ]
    out = {'context': 'hear me spea', 'vocab': vocab, 'target': target, 'presets': [],
           'uniform65': r(math.log(65), 4)}
    for pid, label, logits in presets:
        p = softmax(logits)
        top = max(range(len(p)), key=lambda i: p[i])
        out['presets'].append({'id': pid, 'label': label, 'logits': logits, 'probs': [r(v, 4) for v in p],
                               'pTarget': r(p[target], 4), 'loss': r(-math.log(p[target]), 4),
                               'top': top, 'topIsTarget': top == target})
    return out


# --- a recorded toy training run -----------------------------------------------

def toy_run(text, train_src, source_cfg):
    """A character BIGRAM model (a 65x65 table of logits - not NanoGPT's
    transformer) trained with a faithful AdamW, NanoGPT's own get_lr and
    global-norm gradient clipping, on a deliberately small training slice so
    that overfitting appears within the run. Optimizer settings are READ from
    the resolved shakespeare_char config; only the toy-scale choices below
    (data size, learning rate, iterations, batch, eval cadence) are this
    script's own, and the output lists which is which."""
    chars = sorted(list(set(text)))
    stoi = {ch: i for i, ch in enumerate(chars)}
    V = len(chars)
    n = len(text)
    train_text, val_text = text[:int(n * 0.9)], text[int(n * 0.9):]  # prepare.py's 90/10 split
    from_source = {k: source_cfg[k] for k in ('weight_decay', 'beta1', 'beta2', 'grad_clip')}
    toy_choices = dict(train_chars=1200, val_chars=20000, learning_rate=0.1, max_iters=1000, batch_size=64,
                       eval_interval=50, eps=1e-8)  # eps: torch.optim.AdamW's default (NanoGPT passes none)
    cfg = {**toy_choices, **from_source}
    cfg['warmup_iters'] = cfg['max_iters'] // 50
    cfg['lr_decay_iters'] = cfg['max_iters']
    cfg['min_lr'] = cfg['learning_rate'] / 10
    tr = [stoi[c] for c in train_text[:cfg['train_chars']]]
    va = [stoi[c] for c in val_text[:cfg['val_chars']]]
    train_pairs, val_pairs = list(zip(tr, tr[1:])), list(zip(va, va[1:]))
    make, line = get_lr_factory(train_src)
    get_lr = make(cfg['learning_rate'], cfg['warmup_iters'], cfg['lr_decay_iters'], cfg['min_lr'])
    rng = random.Random(SEED)
    W = [[rng.gauss(0.0, 0.02) for _ in range(V)] for _ in range(V)]  # NanoGPT inits weights N(0, 0.02)
    m = [[0.0] * V for _ in range(V)]
    v = [[0.0] * V for _ in range(V)]

    def loss(pairs):
        total = 0.0
        for a, b in pairs:
            row = W[a]
            mx = max(row)
            total += -(row[b] - mx - math.log(sum(math.exp(x - mx) for x in row)))
        return total / len(pairs)

    checkpoints = []
    b1, b2, eps = cfg['beta1'], cfg['beta2'], cfg['eps']
    for it in range(cfg['max_iters'] + 1):
        if it % cfg['eval_interval'] == 0:
            checkpoints.append({'iteration': it, 'train': r(loss(train_pairs), 4), 'val': r(loss(val_pairs), 4)})
        if it == cfg['max_iters']:
            break
        lr = get_lr(it)
        grads = {}
        for _ in range(cfg['batch_size']):
            a, b = train_pairs[rng.randrange(len(train_pairs))]
            p = softmax(W[a])
            g = grads.setdefault(a, [0.0] * V)
            for j in range(V):
                g[j] += p[j] / cfg['batch_size']
            g[b] -= 1.0 / cfg['batch_size']
        norm = math.sqrt(sum(x * x for g in grads.values() for x in g))
        clip = cfg['grad_clip'] / norm if norm > cfg['grad_clip'] else 1.0
        t = it + 1
        for a in range(V):  # torch.optim.AdamW update, decoupled decay first
            g = grads.get(a)
            for j in range(V):
                gj = g[j] * clip if g else 0.0
                W[a][j] *= (1 - lr * cfg['weight_decay'])
                m[a][j] = b1 * m[a][j] + (1 - b1) * gj
                v[a][j] = b2 * v[a][j] + (1 - b2) * gj * gj
                denom = math.sqrt(v[a][j]) / math.sqrt(1 - b2 ** t) + eps
                W[a][j] -= (lr / (1 - b1 ** t)) * m[a][j] / denom
    best = min(range(len(checkpoints)), key=lambda i: checkpoints[i]['val'])
    final = len(checkpoints) - 1
    return {'model': 'character bigram (65 x 65 logit table) - a toy, not NanoGPT\'s transformer',
            'schedule': f'train.py:{line} get_lr (executed) with this run\'s values', 'seed': SEED,
            'config': cfg,
            'configFromSource': {'keys': sorted(from_source), 'from': 'config/train_shakespeare_char.py resolved over train.py defaults'},
            'configToyChoices': sorted(k for k in toy_choices if k != 'eps') + ['warmup_iters', 'lr_decay_iters', 'min_lr'],
            'checkpoints': checkpoints, 'bestValIndex': best, 'finalIndex': final,
            'initialLossNote': f'iteration 0 loss {checkpoints[0]["train"]} is close to ln(65) = {r(math.log(65), 4)}: near-uniform guessing over 65 characters'}


# --- one optimizer update, SGD through AdamW -----------------------------------

def optimizer(defaults):
    """Four toy parameters with a recorded 20-step gradient sequence. The
    same gradients feed every optimizer; the last step's update is shown in
    units of the learning rate so all four are comparable."""
    rng = random.Random(SEED)
    params = [
        {'name': 'w₁', 'role': 'weight, large steady gradient', 'decay': True, 'theta': 0.8, 'mean': 5.0, 'noise': 0.2},
        {'name': 'w₂', 'role': 'weight, small steady gradient', 'decay': True, 'theta': -0.5, 'mean': 0.05, 'noise': 0.005},
        {'name': 'w₃', 'role': 'weight, noisy sign-flipping gradient', 'decay': True, 'theta': 0.3, 'mean': 0.0, 'noise': 1.0},
        {'name': 'b', 'role': 'bias (no weight decay in NanoGPT)', 'decay': False, 'theta': 0.2, 'mean': 0.5, 'noise': 0.05},
    ]
    steps = 20
    history = [[p['mean'] + rng.gauss(0.0, p['noise']) for p in params] for _ in range(steps)]
    b1, b2, wd = defaults['beta1'], defaults['beta2'], defaults['weight_decay']  # read from train.py
    lr, momentum, eps = 0.01, 0.9, 1e-8  # toy lr; SGD momentum 0.9; eps = torch.optim.AdamW default

    def run(kind):
        theta = [p['theta'] for p in params]
        buf = [0.0] * len(params)
        m = [0.0] * len(params)
        v = [0.0] * len(params)
        last = None
        for t, g in enumerate(history, start=1):
            before = list(theta)
            for i, p in enumerate(params):
                if kind == 'sgd':
                    theta[i] -= lr * g[i]
                elif kind == 'momentum':
                    buf[i] = momentum * buf[i] + g[i]
                    theta[i] -= lr * buf[i]
                else:
                    if kind == 'adamw' and p['decay']:
                        theta[i] *= (1 - lr * wd)
                    m[i] = b1 * m[i] + (1 - b1) * g[i]
                    v[i] = b2 * v[i] + (1 - b2) * g[i] * g[i]
                    theta[i] -= (lr / (1 - b1 ** t)) * m[i] / (math.sqrt(v[i]) / math.sqrt(1 - b2 ** t) + eps)
            last = [(a - b) / lr for a, b in zip(theta, before)]
        return last, theta
    kinds = [('sgd', 'SGD'), ('momentum', 'SGD + momentum 0.9'), ('adam', 'Adam'), ('adamw', 'AdamW (NanoGPT)')]
    return {'lr': lr, 'steps': steps, 'betas': [b1, b2], 'weightDecay': wd, 'params': [
                {k: p[k] for k in ('name', 'role', 'decay', 'theta')} for p in params],
            'settingsSource': "betas and weight_decay read from train.py defaults (beta1, beta2, weight_decay); lr 0.01, momentum 0.9 are toy choices; eps is torch.optim.AdamW's default",
            'gradientHistory': [[r(g, 4) for g in step] for step in history],
            'gradientRms': [r(math.sqrt(sum(h[i] ** 2 for h in history) / steps), 4) for i in range(len(params))],
            'lastGradient': [r(g, 4) for g in history[-1]],
            'gradientMean': [r(sum(h[i] for h in history) / steps, 4) for i in range(len(params))],
            'optimizers': [{'id': k, 'label': label, 'updateInLr': [r(u, 4) for u in run(k)[0]],
                            'absUpdateInLr': [r(abs(u), 4) for u in run(k)[0]]} for k, label in kinds],
            'nanogpt': 'model.py configure_optimizers: torch.optim.AdamW(optim_groups, lr, betas); weight_decay only for params with dim >= 2'}


# --- temperature ---------------------------------------------------------------

def temperature():
    vocab = ['z', 'e', 't', 's', 'a', ' ']
    logits = [3.0, 2.0, 1.0, 0.5, 0.0, -1.0]  # toy logits for the character after "First Citi"
    temps = [0.25, 0.5, 1.0, 1.5, 2.0]
    draws = 20
    out = {'context': 'First Citi', 'vocab': vocab, 'display': [c.replace(' ', '␣') for c in vocab],
           'logits': logits, 'draws': draws, 'seed': SEED, 'presets': []}
    for k, T in enumerate(temps):
        p = softmax([x / T for x in logits])  # model.py generate: logits / temperature, then softmax
        rng = random.Random(SEED + k)
        sample = rng.choices(range(len(vocab)), weights=p, k=draws)
        out['presets'].append({'temperature': T, 'label': f'T = {T}', 'invT': r(1 / T, 6), 'probs': [r(v, 4) for v in p],
                               'pTop': r(p[0], 4), 'pRest': r(1 - p[0], 4),
                               'drawn': [out['display'][i] for i in sample], 'drawnTop': sample.count(0)})
    return out


# --- the MLP's inside for one position: c_fc -> GELU -> c_proj ------------------

def mlp():
    """Hand-picked toy weights (not trained), C = 4 -> 4C = 16 -> 4, no bias as
    shakespeare_char trains it. Inputs are raw integer vectors normalized as
    F.layer_norm does it (weight ones, no beta, eps 1e-5), then rounded to 2
    decimals. GELU is nn.GELU's exact form, h * Phi(h), precomputed because the
    card's evaluator has no erf; h and m are the card's live matmuls."""
    eps = 1e-5  # model.py LayerNorm.forward
    raws = [('B', [0, -3, -2, 3]), ('e', [4, -1, 3, -3]), ('f', [2, 4, -3, 0])]
    w_fc = [[-0.5, 0.5, -1, -0.5], [-0.5, 1, -1, -0.5], [1, 1, -1, 1], [-1, -0.5, 0.5, 1], [0.5, -0.5, -1, 1],
            [0.5, 1, -0.5, -1], [-1, 0.5, -0.5, -1], [-0.5, 0.5, -1, 0.5], [0.5, -0.5, 1, 0.5], [-1, -1, -0.5, 1],
            [1, 0.5, -1, -1], [0.5, 0.5, -1, 1], [0.5, 0.5, -1, 0.5], [-0.5, 0.5, 1, 0.5], [-0.5, 0.5, -0.5, 1],
            [0.5, -1, 0.5, 0.5]]  # (out, in), as nn.Linear stores it
    w_proj = [[0.25, 0.25, -0.5, 0.5, -0.5, 0.25, -0.5, 0.5, 0.5, -0.25, -0.25, -0.5, -0.25, 0.25, -0.25, 0.5],
              [0.5, 0.25, 0.5, -0.25, 0.5, 0.25, 0.25, -0.5, -0.5, 0.5, -0.5, 0.5, -0.5, -0.25, -0.25, -0.5],
              [0.25, 0.25, -0.25, -0.25, -0.5, -0.25, -0.5, 0.25, -0.25, 0.5, -0.5, 0.5, 0.25, -0.25, 0.25, 0.5],
              [0.25, 0.25, 0.5, -0.25, -0.5, 0.25, 0.25, -0.25, -0.5, -0.25, -0.25, -0.25, -0.25, 0.25, 0.25, 0.5]]

    def layer_norm(vec):
        mean = sum(vec) / len(vec)
        var = sum((v - mean) ** 2 for v in vec) / len(vec)
        return [r((v - mean) / math.sqrt(var + eps), 2) for v in vec]

    def gelu(x):
        h = [sum(w * v for w, v in zip(row, x)) for row in w_fc]
        return [r(0.5 * v * (1 + math.erf(v / math.sqrt(2))), 4) for v in h], sum(v > 0 for v in h)

    out = {'eps': eps, 'Wfc': w_fc, 'Wproj': w_proj, 'presets': []}
    for char, raw in raws:
        x = layer_norm(raw)
        g, positive = gelu(x)
        out['presets'].append({'char': char, 'raw': raw, 'input': x, 'gelu': g, 'positive': positive})
    flipped = [-v for v in out['presets'][0]['input']]
    g, positive = gelu(flipped)
    out['flipped'] = {'of': 0, 'input': flipped, 'gelu': g, 'positive': positive}
    return out


def build():
    train_src = nanogpt('train.py')
    config_src = nanogpt('config/train_shakespeare_char.py')
    for path in NANOGPT_FILES:  # verify every pinned file, and leave it in the cache the card tests read
        nanogpt(path)
    text = fetch(DATASET_URL, DATASET_SHA).decode('utf-8')
    cfg = resolved_config(train_src, config_src)
    defaults = train_py_defaults(train_src)
    keys = ('learning_rate', 'max_iters', 'weight_decay', 'beta1', 'beta2', 'grad_clip', 'decay_lr', 'warmup_iters',
            'lr_decay_iters', 'min_lr', 'eval_interval', 'eval_iters', 'always_save_checkpoint', 'batch_size',
            'block_size', 'dropout', 'bias', 'n_layer', 'n_head', 'n_embd')
    chars = sorted(list(set(text)))
    return {
        'provenance': {
            'nanogpt': {'repo': NANOGPT_REPO, 'commit': NANOGPT_SHA, 'files': NANOGPT_FILES,
                        'connectedApp': 'repo-06745f10-nanogpt (repo_commit read from /api/apps)'},
            'dataset': {'url': DATASET_URL, 'sha256': DATASET_SHA, 'chars': len(text)},
            'tiktoken': TIKTOKEN_VERSION, 'seed': SEED, 'generator': 'generate_fixtures.py',
        },
        'config': {'source': 'train.py top-level defaults (read with ast); shakespeareChar = config/train_shakespeare_char.py executed over them, as configurator.py does',
                   'defaults': {k: defaults[k] for k in keys}, 'shakespeareChar': {k: cfg[k] for k in keys}},
        'architecture': {'source': 'config/train_shakespeare_char.py resolved over train.py defaults',
                         'batch_size': cfg['batch_size'], 'block_size': cfg['block_size'], 'n_layer': cfg['n_layer'],
                         'n_head': cfg['n_head'], 'n_embd': cfg['n_embd'], 'dropout': cfg['dropout'], 'bias': cfg['bias'],
                         'vocab_size': len(chars)},
        'tokenizer': tokenizers(text),
        'layernorm': layernorm(),
        'crossEntropy': cross_entropy(),
        'lrSchedule': lr_schedule(train_src, cfg),
        'toyRun': toy_run(text, train_src, cfg),
        'optimizer': optimizer(defaults),
        'temperature': temperature(),
        'mlp': mlp(),
    }


def render(data):
    header = ('// GENERATED by generate_fixtures.py - do not edit by hand.\n'
              '// Regenerate: uv run --with tiktoken==0.14.0 python generate_fixtures.py\n'
              '// Every value here is read from the pinned NanoGPT revision, calculated as a\n'
              '// labelled toy example, or recorded from a seeded toy run - see the script.\n')
    return header + 'export default ' + json.dumps(data, indent=1, ensure_ascii=False) + ';\n'


if __name__ == '__main__':
    text = render(build())
    if '--check' in sys.argv:
        current = open(OUT, encoding='utf-8').read() if os.path.exists(OUT) else ''
        if current != text:
            sys.exit('fixture is STALE or edited by hand - regenerate it')
        print('fixture matches a fresh regeneration')
    else:
        with open(OUT, 'w', encoding='utf-8', newline='\n') as handle:
            handle.write(text)
        print(f'wrote {OUT}')
