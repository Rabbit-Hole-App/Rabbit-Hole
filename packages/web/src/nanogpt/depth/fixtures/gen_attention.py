"""Authoring-time generator for the depth ladder's three attention cards.

The cards need numbers the base fixture does not have: query, key and value
vectors for a small context, and random vectors for the 1/sqrt(hs) what-if.
Everything is made HERE from a stated rule or a seeded draw - never typed
into a card.

Source truth reused from generate_fixtures.py (imported as `base`):
  * the context: the first 9 characters of base.tokenizers()' sample line
    ("Before we", from line 2 of the sha-pinned Tiny Shakespeare) - the same
    character tokens the other nanogpt cards show;
  * the seed: base.SEED (NanoGPT's own 1337).

Calculated toy example (a hand-set rule, NOT a trained NanoGPT):
  n_head = 3 heads of size hs = 4 (C = 12) over T = 9 positions.
  * head 0, "previous character": keys are a position code
      P(j) = [cos 36j, sin 36j, cos 108j, sin 108j]   (degrees, 6 decimals)
    and the query at position i is GAIN x P(i - 1), so q.k peaks at the
    character just before. Six decimals, not two: q.k = GAIN (cos 36d +
    cos 108d) for an offset d is then 8, 2, -2 or -8 to well within the
    cards' 3-decimal rounding, so scores that are equal in theory are equal
    on the card (two decimals made 2.01 vs 1.99 near-ties).
    The Guided card's what-if query GAIN x P(i + 1)
    points at the next character instead - the one the mask hides.
  * head 1, "same letter": every distinct character gets a signed unit axis
    (in order of first appearance: +e1 +e2 +e3 +e4 -e1 -e2 -e3), keys are
    that letter code, the query is GAIN x its own letter code.
  * head 2, "first character": keys are a start flag ([1,0,0,0] at position
    0, [0,1,0,0] elsewhere), every query is [GAIN,0,0,0].
  * values: head h's v is the letter code rolled by h places.

Seeded draws for the 1/sqrt(hs) what-if: for each hs = 4, 16, 64, SAMPLES
draws of one query and T keys with N(0, 1) components from
random.Random(SEED + hs) give the Monte Carlo statistics, and the first of
those draws (rounded to 2 decimals) is the row the Deep dive card shows.

Regenerate:   uv run --with tiktoken==0.14.0 python gen_attention.py
Verify only:  uv run --with tiktoken==0.14.0 python gen_attention.py --check
"""
import json
import math
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', 'fixtures'))
import generate_fixtures as base  # noqa: E402

OUT = os.path.join(HERE, 'attention.generated.js')
T, HS, N_HEAD = 9, 4, 3
GAIN = 4
FREQS = (36, 108)  # degrees per position step, one per 2-d plane of the position code
SAT_HS = (4, 16, 64)
SAMPLES = 2000


def r(x, digits=2):
    return round(float(x), digits) + 0.0  # + 0.0 turns -0.0 into 0.0


def position_code(j):
    return [r(f(math.radians(deg * j)), 6) for deg in FREQS for f in (math.cos, math.sin)]


def softmax(values):
    top = max(values)
    exps = [math.exp(v - top) for v in values]
    total = sum(exps)
    return [e / total for e in exps]


def context():
    text = base.fetch(base.DATASET_URL, base.DATASET_SHA).decode('utf-8')
    chars = next(t for t in base.tokenizers(text)['tokenizers'] if t['id'] == 'char')
    return chars['tokens'][:T]


def heads(tokens):
    letters = list(dict.fromkeys(tokens))
    assert len(letters) <= 2 * HS, 'one signed axis per distinct character'
    code = {c: [0, 0, 0, 0] for c in letters}
    for k, c in enumerate(letters):
        code[c][k % HS] = 1 if k < HS else -1
    roll = lambda vec, h: vec[-h:] + vec[:-h] if h else list(vec)
    values = lambda h: [roll(code[c], h) for c in tokens]
    scaled = lambda vec: [r(GAIN * x, 6) for x in vec]
    previous = {'id': 'previous', 'label': 'previous character',
                'rule': 'k = position code P(j); q = GAIN x P(i - 1)',
                'k': [position_code(j) for j in range(T)],
                'q': [scaled(position_code(i - 1)) for i in range(T)], 'v': values(0)}
    letter = {'id': 'letter', 'label': 'same letter',
              'rule': 'k = letter code; q = GAIN x own letter code',
              'k': [list(code[c]) for c in tokens], 'q': [scaled(code[c]) for c in tokens], 'v': values(1)}
    first = {'id': 'first', 'label': 'first character',
             'rule': 'k = start flag [1,0,0,0] at position 0, [0,1,0,0] after; q = [GAIN,0,0,0]',
             'k': [[1, 0, 0, 0] if j == 0 else [0, 1, 0, 0] for j in range(T)],
             'q': [[GAIN, 0, 0, 0] for _ in range(T)], 'v': values(2)}
    return {'letters': letters, 'letterCode': [code[c] for c in letters], 'heads': [previous, letter, first],
            'qNext': [scaled(position_code(i + 1)) for i in range(T)]}


def saturation():
    out = {'hs': list(SAT_HS), 'samples': SAMPLES, 'q': [], 'k': [],
           'meanMax': {'scaled': [], 'unscaled': []}, 'scoreStd': {'scaled': [], 'unscaled': []},
           'meanMaxGrad': {'scaled': [], 'unscaled': []}}
    for hs in SAT_HS:
        mc = random.Random(base.SEED + hs)
        # per setting: sum of max w, sum of scores, sum of squared scores, sum of max p(1-p)
        stats = {True: [0.0, 0.0, 0.0, 0.0], False: [0.0, 0.0, 0.0, 0.0]}
        for draw in range(SAMPLES):
            q = [mc.gauss(0.0, 1.0) for _ in range(hs)]
            keys = [[mc.gauss(0.0, 1.0) for _ in range(hs)] for _ in range(T)]
            if draw == 0:  # the row the card shows is the first of the draws
                out['q'].append([r(x) for x in q])
                out['k'].append([[r(x) for x in key] for key in keys])
            scores = [sum(a * b for a, b in zip(q, key)) for key in keys]
            for on in (True, False):
                s = [x / math.sqrt(hs) for x in scores] if on else scores
                w = softmax(s)
                stats[on][0] += max(w)
                stats[on][1] += sum(s)
                stats[on][2] += sum(x * x for x in s)
                stats[on][3] += max(p * (1 - p) for p in w)
        n = SAMPLES * T
        for on, key in ((True, 'scaled'), (False, 'unscaled')):
            mean = stats[on][1] / n
            out['meanMax'][key].append(r(stats[on][0] / SAMPLES))
            out['scoreStd'][key].append(r(math.sqrt(stats[on][2] / n - mean * mean), 1))
            out['meanMaxGrad'][key].append(r(stats[on][3] / SAMPLES, 3))
    return out


def build():
    tokens = context()
    return {
        'provenance': {'generator': 'gen_attention.py', 'base': 'generate_fixtures.py', 'seed': base.SEED,
                       'nanogpt': {'repo': base.NANOGPT_REPO, 'commit': base.NANOGPT_SHA},
                       'dataset': {'url': base.DATASET_URL, 'sha256': base.DATASET_SHA}},
        'context': {'tokens': tokens, 'source': 'first 9 character tokens of base.tokenizers() sample (line 2 of the dataset)'},
        'T': T, 'hs': HS, 'nHead': N_HEAD, 'gain': GAIN, 'freqsDeg': list(FREQS),
        **heads(tokens),
        'saturation': saturation(),
    }


def render(data):
    header = ('// GENERATED by gen_attention.py - do not edit by hand.\n'
              '// Regenerate: uv run --with tiktoken==0.14.0 python gen_attention.py\n'
              '// A calculated toy example (hand-set rule) and seeded draws - not a trained NanoGPT.\n')
    return header + 'export default ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n'


if __name__ == '__main__':
    text = render(build())
    if '--check' in sys.argv:
        current = open(OUT, encoding='utf-8').read() if os.path.exists(OUT) else ''
        if current != text:
            sys.exit('attention fixture is STALE or edited by hand - regenerate it')
        print('attention fixture matches a fresh regeneration')
    else:
        with open(OUT, 'w', encoding='utf-8', newline='\n') as handle:
            handle.write(text)
        print(f'wrote {OUT}')
