"""Authoring-time numbers for the depth ladder's generation cards.

One toy model drives all three depths, so a learner who switches depth sees
the same example: a character COUNTING model over Tiny Shakespeare's training
split (prepare.py's first 90%). Its forward reads the last BLOCK characters
(its block_size) and scores each next character by how often it followed them;
its logit is ln(count), so softmax at T = 1 is exactly count / total. It is a
toy, not NanoGPT's transformer. Sampling replays NanoGPT's generate()
(model.py @3adf61e) step for step - crop to block_size, last position, divide
by temperature, optional top-k, softmax, one draw, append - with Python's
seeded random.choices standing in for torch.multinomial.

Read from the pinned sources: the dataset and its 65-character vocabulary
(via generate_fixtures), generate()'s own defaults (temperature=1.0,
top_k=None), GPTConfig's block_size/vocab_size defaults and the values
from_pretrained forces for GPT-2 checkpoints, parsed from model.py, and
sample.py's settings (start, temperature
0.8, top_k 200, max_new_tokens 500, seed 1337, parsed from sample.py as
generate_fixtures pins it). Toy choices: BLOCK,
PROMPT, STEPS, the Guided temperature presets and the extra top-k values.

window (c23-context-window): separate counting tables, one per toy block_size
2 to 5, each read at the last k characters of WINDOW_TEXT (the opening of the
dataset's line 2): how often each character followed exactly those k
characters in the training split. Toy choices: WINDOW_TEXT, WINDOW_BLOCKS and
the shown WINDOW_SLOTS (every remaining character is 'other').

Regenerate:   python gen_generation.py
Verify only:  python gen_generation.py --check
"""
import ast
import collections
import json
import math
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', 'fixtures'))
import generate_fixtures as base  # noqa: E402

OUT = os.path.join(HERE, 'generation.generated.js')
BLOCK = 3             # the toy's block_size (NanoGPT shakespeare_char: 256)
PROMPT = 'First Citi'  # the dataset's opening words, cut mid-word
STEPS = 8
DRAWS = 20
GUIDED_TEMPERATURES = [0.25, 0.5, 0.8, 1.0, 1.5, 2.0]
EXTRA_TOP_KS = [1, 3]  # beside generate()'s None and sample.py's 200
SHOW = 5              # Overview bars: the five most likely next characters
WINDOW_TEXT = 'Befor'             # c23: the text idx holds
WINDOW_BLOCKS = [2, 3, 4, 5]      # c23: one toy block_size per What-if preset
WINDOW_SLOTS = ['e', ' ', 'd', 't', 'm']


def show(c):
    return {' ': 'space', '\n': 'newline'}.get(c, c)


def top_level_constants(src):
    out = {}
    for node in ast.parse(src).body:
        if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name) \
                and isinstance(node.value, ast.Constant):
            out[node.targets[0].id] = {'value': node.value.value, 'line': node.lineno}
    return out


def generate_defaults(model_src):
    for node in ast.walk(ast.parse(model_src)):
        if isinstance(node, ast.FunctionDef) and node.name == 'generate':
            names = [a.arg for a in node.args.args][-len(node.args.defaults):]
            return {'line': node.lineno, **{n: d.value for n, d in zip(names, node.args.defaults)}}
    sys.exit('generate() not found in model.py')


def gpt_config_defaults(model_src):
    for node in ast.walk(ast.parse(model_src)):
        if isinstance(node, ast.ClassDef) and node.name == 'GPTConfig':
            return {f.target.id: {'value': f.value.value, 'line': f.lineno} for f in node.body
                    if isinstance(f, ast.AnnAssign) and isinstance(f.value, ast.Constant)}
    sys.exit('GPTConfig not found in model.py')


def pretrained_overrides(model_src):
    """from_pretrained's forced config_args['...'] = constant (GPT-2 checkpoints)."""
    out = {}
    for node in ast.walk(ast.parse(model_src)):
        if isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Subscript)                 and getattr(node.targets[0].value, 'id', None) == 'config_args' and isinstance(node.value, ast.Constant):
            out[node.targets[0].slice.value] = {'value': node.value.value, 'line': node.lineno}
    return out


def distribution(counts, vocab_size, temperature, top_k):
    """generate()'s steps after the forward, on this toy's logits: ln(count)
    for every character seen after the context, -inf for the rest of the
    vocabulary; / temperature; top-k keeps logits >= the k-th largest of all
    vocab_size (model.py: min(top_k, logits.size(-1))); softmax."""
    chars = sorted(counts, key=lambda ch: (-counts[ch], ch))
    logits = [math.log(counts[ch]) / temperature for ch in chars]
    keep = [True] * len(chars)
    if top_k is not None:
        full = sorted(logits + [-math.inf] * (vocab_size - len(chars)), reverse=True)
        kth = full[min(top_k, vocab_size) - 1]
        keep = [z >= kth for z in logits]
    kept = [z for z, k in zip(logits, keep) if k]
    m = max(kept)
    e = [math.exp(z - m) if k else 0.0 for z, k in zip(logits, keep)]
    s = sum(e)
    return chars, [x / s for x in e], keep


def context_window(text, train, counts):
    """c23: for each k in WINDOW_BLOCKS, count train[i+k] wherever
    train[i:i+k] is the last k characters of WINDOW_TEXT."""
    assert text.split('\n')[1].startswith(WINDOW_TEXT) and WINDOW_TEXT in train
    windows, rows, matches = [], [], []
    for k in WINDOW_BLOCKS:
        w = WINDOW_TEXT[-k:]
        hits = [train[i + k] for i in range(len(train) - k) if train[i:i + k] == w]
        c = collections.Counter(hits)
        if k == BLOCK:
            assert c == counts[w], 'block-3 row differs from the BLOCK table'
        assert set(sorted(c, key=lambda ch: (-c[ch], ch))[:3]) <= set(WINDOW_SLOTS), f'top 3 after {w!r} not shown'
        row = [c[s] for s in WINDOW_SLOTS] + [sum(v for ch, v in c.items() if ch not in WINDOW_SLOTS)]
        assert sum(row) == len(hits)
        windows.append(w)
        rows.append(row)
        matches.append(len(hits))
    return {'text': WINDOW_TEXT, 'blocks': WINDOW_BLOCKS, 'windows': windows,
            'cropped': [WINDOW_TEXT[:-k] for k in WINDOW_BLOCKS],
            'slots': [{' ': 'sp'}.get(s, s) for s in WINDOW_SLOTS] + ['other'],
            'counts': rows, 'matches': matches}


def build():
    text = base.fetch(base.DATASET_URL, base.DATASET_SHA).decode('utf-8')
    assert text.startswith(PROMPT)
    vocab_size = len(sorted(list(set(text))))  # data/shakespeare_char/prepare.py
    train = text[:int(len(text) * 0.9)]        # prepare.py's train split
    counts = collections.defaultdict(collections.Counter)
    for i in range(len(train) - BLOCK):
        counts[train[i:i + BLOCK]][train[i + BLOCK]] += 1
    model_src = base.nanogpt('model.py')
    gen = generate_defaults(model_src)
    config = {k: v for k, v in gpt_config_defaults(model_src).items() if k in ('block_size', 'vocab_size')}
    pretrained = {k: v for k, v in pretrained_overrides(model_src).items() if k in ('block_size', 'vocab_size')}
    sample_src = base.nanogpt('sample.py')
    sample = {k: v for k, v in top_level_constants(sample_src).items()
              if k in ('start', 'num_samples', 'max_new_tokens', 'temperature', 'top_k', 'seed')}
    seed = sample['seed']['value']
    assert seed == base.SEED

    # The first step from the prompt, the example every depth shares.
    window = PROMPT[-BLOCK:]
    first = counts[window]
    chars, p1, _ = distribution(first, vocab_size, 1.0, None)
    first_out = {'window': window, 'chars': chars, 'display': [show(c) for c in chars],
                 'counts': [first[c] for c in chars], 'total': sum(first.values()),
                 'logits': [base.r(math.log(first[c]), 4) for c in chars], 'probs': [base.r(v, 4) for v in p1]}

    # Overview: a recorded generation at generate()'s own defaults.
    rng = random.Random(seed)
    so_far, steps = PROMPT, []
    for _ in range(STEPS):
        ctx = so_far[-BLOCK:]
        chars, p, _ = distribution(counts[ctx], vocab_size, gen['temperature'], gen['top_k'])
        pick = rng.choices(chars, weights=p)[0]
        rank = chars.index(pick)
        assert rank < SHOW, 'the pick must be among the shown bars'
        so_far += pick
        nxt = counts[so_far[-BLOCK:]]
        steps.append({'window': ctx, 'candidates': len(chars), 'shown': [show(c) for c in chars[:SHOW]],
                      'probs': [base.r(v, 4) for v in p[:SHOW]], 'rest': base.r(1 - sum(p[:SHOW]), 4),
                      'favourite': show(chars[0]), 'picked': show(pick), 'pickedRank': rank,
                      'pickedP': base.r(p[rank], 4), 'before': so_far[:-1], 'after': so_far,
                      'nextWindow': so_far[-BLOCK:], 'nextFavourite': show(min(nxt, key=lambda ch: (-nxt[ch], ch)))})

    # Guided: temperature presets over the first step; the same seed at every
    # preset, so the 20 draws differ only because the probabilities do.
    presets = []
    for T in GUIDED_TEMPERATURES:
        chars, p, _ = distribution(first, vocab_size, T, None)
        drawn = random.Random(seed).choices(chars, weights=p, k=DRAWS)
        # ratio: p(top) / p(second) = (count ratio) ** (1 / T), from the unrounded p.
        presets.append({'temperature': T, 'label': f'T = {T}', 'invT': base.r(1 / T, 6), 'probs': [base.r(v, 4) for v in p],
                        'ratio': base.r(p[0] / p[1], 3),
                        'drawn': [show(c) for c in drawn], 'drawnTop': drawn.count(chars[0])})

    # Deep dive: one recorded draw per (temperature, top_k) branch - the first
    # random number of seed 1337, as the Overview's first step used it.
    top_ks = [gen['top_k'], *EXTRA_TOP_KS, sample['top_k']['value']]
    temps = [sample['temperature']['value'], gen['temperature']]
    kept, draws = [], []  # [top_k][temperature], in the order of top_ks and temps
    for k in top_ks:
        kept.append(distribution(first, vocab_size, 1.0, k)[2])
        row = []
        for T in temps:
            chars, p, _ = distribution(first, vocab_size, T, k)
            row.append({'picked': show(random.Random(seed).choices(chars, weights=p)[0]), 'probs': [base.r(v, 4) for v in p]})
        draws.append(row)
    return {
        'provenance': {'nanogpt': f'{base.NANOGPT_REPO}@{base.NANOGPT_SHA}', 'samplePySha256': base.NANOGPT_FILES['sample.py'],
                       'dataset': base.DATASET_SHA, 'generator': 'gen_generation.py'},
        'model': f'character counting model: counts of each next character after the last {BLOCK} characters in '
                 f'Tiny Shakespeare\'s training split; logit = ln(count) - a toy, not NanoGPT\'s transformer',
        'block': BLOCK, 'prompt': PROMPT, 'vocabSize': vocab_size, 'trainChars': len(train), 'seed': seed,
        'generateDefaults': gen, 'sample': sample, 'gptConfig': config, 'gpt2Checkpoint': pretrained,
        'first': first_out,
        'overview': {'temperature': gen['temperature'], 'topK': gen['top_k'], 'steps': steps},
        'guided': {'draws': DRAWS, 'presets': presets},
        'deep': {'temperatures': temps, 'topKs': top_ks, 'kept': kept, 'draws': draws},
        'window': context_window(text, train, counts),
    }


def render(data):
    header = ('// GENERATED by gen_generation.py - do not edit by hand.\n'
              '// Regenerate: python packages/web/src/nanogpt/depth/fixtures/gen_generation.py\n'
              '// A toy character counting model over Tiny Shakespeare, sampled the way\n'
              '// NanoGPT\'s generate() samples - see the script.\n')
    return header + 'export default ' + json.dumps(data, indent=1, ensure_ascii=False) + ';\n'


if __name__ == '__main__':
    out = render(build())
    if '--check' in sys.argv:
        current = open(OUT, encoding='utf-8').read() if os.path.exists(OUT) else ''
        if current != out:
            sys.exit('generation fixture is STALE or edited by hand - regenerate it')
        print('generation fixture matches a fresh regeneration')
    else:
        with open(OUT, 'w', encoding='utf-8', newline='\n') as handle:
            handle.write(out)
        print(f'wrote {OUT}')
