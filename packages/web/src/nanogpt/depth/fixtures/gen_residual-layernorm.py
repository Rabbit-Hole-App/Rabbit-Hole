"""Fixture generator for the residual-stream / LayerNorm cards on the
nanogpt-depth-ladder board (Overview, Guided, Deep dive).

Reuses generate_fixtures.py - its sha-pinned NanoGPT files, its config
resolution and its LayerNorm toy vector x0 - so all three depths show the
same token vector the deep-dive board's LayerNorm card uses. Adds only what
these cards need that the scene evaluator cannot compute (square roots) or
that must not be typed by hand (seeded toy weights, values read from source):

  overview - n_layer toy blocks (n_layer read from config/train_shakespeare_char.py),
             each a seeded 6 x 6 map that reads a LayerNorm'd copy of its input;
             the change each block writes with the add kept (NanoGPT; the card
             adds the changes live) and, as a what-if, what each block outputs
             when it replaces its input instead
  guided   - x = a * x0 + b over a grid of multipliers and shifts: mean,
             biased variance, std = sqrt(var + eps) and x-hat exactly as
             F.layer_norm computes them; a seeded 6 x 6 toy layer
  deep     - LayerNorm on x0, a nearly constant and a constant vector (the eps
             edge cases); eps, the 0.02 init std and the scaled residual init
             0.02 / sqrt(2 * n_layer), all parsed out of model.py, for the
             n_layer values in the config, train.py and GPT.from_pretrained;
             sqrt(2 * n_layer) for the card's std-of-the-sum bars

Regenerate:  python gen_residual-layernorm.py
Verify only: python gen_residual-layernorm.py --check   (byte-for-byte)
Stdlib only; the pinned files come from generate_fixtures' sha-checked cache.
"""
import json
from decimal import Decimal, ROUND_HALF_UP
import math
import os
import random
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', 'fixtures'))
import generate_fixtures as base  # noqa: E402

OUT = os.path.join(HERE, 'residual-layernorm.generated.js')


def only(pattern, text, what):
    """The single distinct match of pattern in text; stops the run otherwise."""
    found = set(re.findall(pattern, text))
    if len(found) != 1:
        sys.exit(f'{what}: expected one distinct match for {pattern!r}, found {sorted(found)}')
    return found.pop()


def source_values(model_src, train_src, config_src):
    eps = float(only(r'F\.layer_norm\(input, self\.weight\.shape, self\.weight, self\.bias, ([0-9.e-]+)\)', model_src, 'LayerNorm eps'))
    init_std = float(only(r'torch\.nn\.init\.normal_\(module\.weight, mean=0\.0, std=([0-9.]+)\)', model_src, '_init_weights std'))
    scaled_std, adds_per_layer = only(r"std=([0-9.]+)/math\.sqrt\((\d+) \* config\.n_layer\)", model_src, 'scaled c_proj init')
    if float(scaled_std) != init_std:
        sys.exit('the scaled init no longer starts from the same std as _init_weights')
    pretrained = dict(re.findall(r"'(gpt2(?:-\w+)?)':\s*dict\(n_layer=(\d+)", model_src))
    depths = [
        {'nLayer': base.resolved_config(train_src, config_src)['n_layer'], 'from': 'config/train_shakespeare_char.py'},
        {'nLayer': base.train_py_defaults(train_src)['n_layer'], 'from': 'train.py default (= gpt2)'},
        {'nLayer': int(pretrained['gpt2-medium']), 'from': 'gpt2-medium'},
        {'nLayer': int(pretrained['gpt2-large']), 'from': 'gpt2-large'},
        {'nLayer': int(pretrained['gpt2-xl']), 'from': 'gpt2-xl'},
    ]
    return eps, init_std, int(adds_per_layer), depths


def layer_norm(vec, eps):
    """F.layer_norm over one vector: biased variance, eps inside the root."""
    n = len(vec)
    mean = sum(vec) / n
    var = sum((v - mean) ** 2 for v in vec) / n
    std = math.sqrt(var + eps)
    return mean, var, std, [(v - mean) / std for v in vec]


def show(x):
    """A display string that keeps small magnitudes readable (1e-5, not 0.00)."""
    if x == 0:
        return '0'
    if abs(x) < 1e-3:
        return base.sci(x)
    return f'{x:.5f}' if abs(x) < 0.1 else f'{x:.4f}'


def overview(x0, n_layer, eps, rng):
    # Each toy block reads a size-normalized copy of what flows in (LayerNorm
    # without gamma, as F.layer_norm computes it) and writes copy . M_k, M_k a
    # seeded 6 x 6 map (rows = input entries). Kept (NanoGPT's add): the block
    # writes a change, the stream becomes stream + change and the next block
    # reads that. Replaced (a what-if): the block's output is all that flows
    # on, so the next block reads only it. Both chains run the same maps. The
    # kept stream is rounded to 2 decimals, exactly as the card's live add
    # reproduces it, so the next block reads what the card shows.
    map_std = 0.25  # changes about a third of x0's largest entry: visible, yet x0 stays recognizable
    maps = [[[base.r(rng.gauss(0, map_std), 2) for _ in x0] for _ in x0] for _ in range(n_layer)]

    def block(vec, m):
        xhat = layer_norm(vec, eps)[3]
        return [base.r(sum(xhat[i] * m[i][j] for i in range(len(vec))), 2) + 0.0 for j in range(len(vec))]

    stream, out, kept, replaced = list(x0), list(x0), [], []
    for m in maps:
        change = block(stream, m)
        kept.append(change)
        stream = [base.r(a + b, 2) + 0.0 for a, b in zip(stream, change)]
        out = block(out, m)
        replaced.append(out)
    return {'x0': x0, 'nLayer': n_layer, 'mapStd': map_std, 'maps': maps, 'kept': kept, 'replaced': replaced}


def js_round3(v):
    """The card's derive ops round every result like Math.round(v * 1000) / 1000."""
    return math.floor(v * 1000 + 0.5) / 1000


def guided_cells_agree(table, ref, gamma, layer):
    """Replays the Guided card's live ops (each rounded to 3 decimals) and its
    2-decimal cells: at every (a, b) the shown x + change must equal the shown
    out, and the shown out - reference out the live difference strip. A change
    ending in 5 (-0.52465 -> -0.525 -> '-.53') or a flipped change doubled at
    x -1 can break that by 0.01."""
    def live(cell):
        y = [js_round3(g * h) for g, h in zip(gamma, cell['xhat'])]
        change = [js_round3(sum(y[i] * layer[i][j] for i in range(len(y)))) for j in range(len(y))]
        return change, [js_round3(x + c) for x, c in zip(cell['x'], change)]
    # the cell formatter, JS toFixed(2): exact binary value, ties away from zero (f'{v:.2f}' ties to even: 0.125 -> 0.12, JS 0.13)
    cents = lambda v: int(Decimal(v).quantize(Decimal('0.01'), ROUND_HALF_UP) * 100)
    out_ref = live(ref)[1]
    for row in table:
        for cell in row:
            change, out = live(cell)
            diff = [js_round3(o - r) for o, r in zip(out, out_ref)]
            if any(cents(x) + cents(c) != cents(o) for x, c, o in zip(cell['x'], change, out)):
                return False
            if any(cents(o) - cents(r) != cents(d) for o, r, d in zip(out, out_ref, diff)):
                return False
    return True


def guided(x0, eps, gamma, rng):
    scales, shifts = [-1, 0.5, 1, 1.5, 2], [-2, 0, 2]  # -1: the contrast where x-hat flips sign
    table = []
    for a in scales:
        row = []
        for b in shifts:
            x = [base.r(a * v + b) for v in x0]
            mean, var, std, xhat = layer_norm(x, eps)
            row.append({'x': x, 'mean': base.r(mean, 4), 'var': base.r(var, 4), 'std': base.r(std, 4),
                        'xhat': [base.r(v, 4) for v in xhat]})
        table.append(row)
    # A toy stand-in for the sublayer (attention or MLP): one seeded 6 x 6
    # linear map, rows = input entries. Not NanoGPT weights. Redrawn until the
    # card's rounded cells add up as the card says they do.
    ref = table[scales.index(1)][shifts.index(0)]
    while True:
        layer = [[base.r(rng.gauss(0, 0.2), 2) for _ in x0] for _ in x0]
        if guided_cells_agree(table, ref, gamma, layer):
            break
    return {'scales': scales, 'shifts': shifts, 'table': table, 'layerStd': 0.2, 'layer': layer}


def deep(x0, eps, init_std, adds_per_layer, depths):
    inputs = [('x0', [base.r(v) for v in x0]),
              ('near', [base.r(0.5 + 0.001 * v) for v in x0]),  # x0's pattern at 1/1000 the size, around 0.5
              ('constant', [0.5] * len(x0))]
    cases = []
    for cid, x in inputs:
        mean, var, std, xhat = layer_norm(x, eps)
        cases.append({'id': cid, 'x': x, 'mean': base.r(mean, 4), 'var': base.r(var, 12), 'std': base.r(std, 8),
                      'meanText': f'{mean:.4f}', 'varText': show(var), 'stdText': show(std),
                      'noEpsText': show(math.sqrt(var)),  # the root without eps: 0 for a constant vector
                      'xhat': [base.r(v, 4) for v in xhat],
                      # mean of x-hat squared = var / (var + eps): how much eps shrinks x-hat
                      'ratio': base.r(var / (var + eps), 4)})
    init = []
    for depth in depths:
        adds = adds_per_layer * depth['nLayer']
        scaled = init_std / math.sqrt(adds)
        init.append({**depth, 'adds': adds, 'scaledStd': base.r(scaled, 8), 'scaledStdText': f'{scaled:.5f}',
                     # sqrt(2L): the std of 2L uncorrelated unscaled branches, in units of one
                     'sqrtAdds': base.r(math.sqrt(adds), 6),
                     'sqrtAddsShown': base.r(math.sqrt(adds), 2),  # short enough for a bar label
                     # scaled std / init std: each branch's std relative to an unscaled one
                     'stdRatio': base.r(scaled / init_std, 6)})
    return {'eps': eps, 'epsText': base.sci(eps), 'initStd': init_std, 'addsPerLayer': adds_per_layer,
            'cases': cases, 'init': init}


def build():
    model_src = base.nanogpt('model.py')
    train_src = base.nanogpt('train.py')
    config_src = base.nanogpt('config/train_shakespeare_char.py')
    eps, init_std, adds_per_layer, depths = source_values(model_src, train_src, config_src)
    ln = base.layernorm()
    if ln['eps'] != eps:
        sys.exit('generate_fixtures.layernorm() eps disagrees with model.py')
    x0 = ln['presets'][0]['x']
    rng = random.Random(base.SEED)
    return {
        'provenance': {'nanogpt': {'repo': base.NANOGPT_REPO, 'commit': base.NANOGPT_SHA}, 'seed': base.SEED,
                       'generator': 'gen_residual-layernorm.py', 'x0': 'generate_fixtures.layernorm() preset "x"'},
        'overview': overview(x0, depths[0]['nLayer'], eps, rng),
        'guided': guided(x0, eps, ln['gamma'], rng),
        'deep': deep(x0, eps, init_std, adds_per_layer, depths),
    }


def render(data):
    header = ('// GENERATED by gen_residual-layernorm.py - do not edit by hand.\n'
              '// Regenerate: python gen_residual-layernorm.py (--check verifies byte for byte)\n'
              '// Values are read from the pinned NanoGPT revision or calculated as labelled\n'
              '// toy examples (seeded) - see the script.\n')
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
