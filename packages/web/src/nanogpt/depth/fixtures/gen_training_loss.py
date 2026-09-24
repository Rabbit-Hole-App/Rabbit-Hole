"""Fixture generator for the depth-ladder cards on training and loss
(src/nanogpt/depth/training-loss/overview.js, guided.js, deep.js).

Reuses generate_fixtures.py (imported as `base`): the same sha-pinned
sources, the same RECORDED toy run (base.toy_run, called unchanged - a
character bigram table, not NanoGPT's transformer) and train.py's own
get_lr, executed from the pinned file.

  recorded - the toy run's weight table at every checkpoint, read through a
             tap (see recorded_run), then:
             overview: the model's whole 65-character guess after "First Citiz"
                       at four checkpoints;
             guided:   p(target) and -ln p(target) at every checkpoint for each
                       position of one training word and one held-out word.
  calculated - points on the curve -ln p (the card has no log op).
  source   - deep: both shipped configs resolved as train.py resolves them
             (config/train_shakespeare_char.py on one GPU; config/train_gpt2.py
             on 8 GPUs, as its header comment launches it), get_lr executed at
             six iterations of each, whether that iteration evaluates, the
             vocabulary size train.py picks (meta.pkl or its 50304 default)
             and ln V (the loss of a uniform guess).

Regenerate:   python gen_training_loss.py
Verify only:  python gen_training_loss.py --check
"""
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', 'fixtures'))
import generate_fixtures as base  # noqa: E402

OUT = os.path.join(HERE, 'training-loss.generated.js')
BASE_OUT = os.path.join(HERE, '..', '..', 'fixtures', 'nanogpt-fixtures.generated.js')
# Three more files from the same pinned revision (sha256 of the raw file).
EXTRA = {
    'config/train_gpt2.py': '0add8a916edf704e001e87aaf63647eea9d6df964c10129ff60ad479bdbd55c4',
    'data/openwebtext/prepare.py': '77f3ef0cc8132d77f90c2bd5f9c3be86d1b3da7428e100559c58aee2bcb6eb12',
    'configurator.py': '5cc23aca26b4ab3c0d9e5f82740f4781f9444f42718c15abcee70d93c5aabe8f',
}
GPT2_WORLD_SIZE = 8  # config/train_gpt2.py:3 launches torchrun --nproc_per_node=8
OVERVIEW = {'context': 'First Citiz', 'target': 'e', 'stops': [0, 50, 200, 1000]}
WORDS = [('train', 'Citizen'), ('held-out', 'morrow,')]
CURVE_P = [0.00013, 0.0004, 0.0015, 0.005, 0.012, 0.025, 0.05, 0.09, 0.15, 0.24, 0.36, 0.5, 0.7, 1.0]


def sci4(x):
    """A learning rate to 4 significant figures: 3 would print train_gpt2's
    last warmup value (5.997e-4) as 6.00e-4, the same as the peak after it."""
    return f'{x:.3e}'.replace('e-0', 'e-')


def pinned(path):
    url = f'https://raw.githubusercontent.com/{base.NANOGPT_REPO}/{base.NANOGPT_SHA}/{path}'
    return base.fetch(url, EXTRA[path]).decode('utf-8')


def recorded_run(text, train_src, cfg):
    """base.toy_run, called unchanged, with a tap: toy_run rounds each
    checkpoint loss with base.r(loss(...), 4) at the moment it records it, so
    a wrapped base.r can copy the weight table W from toy_run's frame then.
    The copies are checked against the recorded losses below."""
    snapshots = {}
    plain_r = base.r

    def tap(x, digits=6):
        caller = sys._getframe(1)
        if caller.f_code is base.toy_run.__code__:
            it = caller.f_locals['it']
            if it not in snapshots:
                snapshots[it] = [row[:] for row in caller.f_locals['W']]
        return plain_r(x, digits)
    base.r = tap
    try:
        run = base.toy_run(text, train_src, cfg)
    finally:
        base.r = plain_r
    return run, snapshots


def recorded(text, train_src, cfg):
    run, snaps = recorded_run(text, train_src, cfg)
    # Same run as the board's fixture, and the tapped tables reproduce it.
    fixture = open(BASE_OUT, encoding='utf-8').read()
    fixture = json.loads(fixture[fixture.index('export default ') + len('export default '):].rstrip().rstrip(';'))
    assert run['checkpoints'] == fixture['toyRun']['checkpoints'], 'toy run differs from nanogpt-fixtures.generated.js'
    iterations = [c['iteration'] for c in run['checkpoints']]
    assert sorted(snaps) == iterations
    chars = sorted(list(set(text)))
    stoi = {ch: i for i, ch in enumerate(chars)}
    n = len(text)
    train_text, val_text = text[:int(n * 0.9)], text[int(n * 0.9):]
    tr = [stoi[c] for c in train_text[:run['config']['train_chars']]]
    for c in run['checkpoints']:
        W = snaps[c['iteration']]
        loss = sum(-math.log(base.softmax(W[a])[b]) for a, b in zip(tr, tr[1:])) / (len(tr) - 1)
        assert abs(loss - c['train']) < 1e-4, f"tap at {c['iteration']}: {loss} vs {c['train']}"
    p = lambda it, a, b: base.softmax(snaps[it][stoi[a]])[stoi[b]]
    shown = lambda ch: ch.replace(' ', '␣').replace('\n', '⏎')

    ctx, target = OVERVIEW['context'], OVERVIEW['target']
    assert ctx + target in train_text[:run['config']['train_chars']]
    overview = {
        'context': ctx, 'previous': ctx[-1], 'target': target, 'targetIndex': stoi[target],
        'vocab': [shown(ch) for ch in chars],
        'stops': [{'iteration': it, 'probs': [base.r(v, 4) for v in base.softmax(snaps[it][stoi[ctx[-1]]])],
                   'pTarget': base.r(p(it, ctx[-1], target), 4), 'loss': base.r(-math.log(p(it, ctx[-1], target)), 4)}
                  for it in OVERVIEW['stops']],
    }
    words = []
    for split, word in WORDS:
        source = train_text[:run['config']['train_chars']] if split == 'train' else val_text[:run['config']['val_chars']]
        assert word in source, word
        pairs = list(zip(word, word[1:]))
        words.append({
            'split': split, 'word': word, 'at': source.index(word),
            'targets': [f'{shown(a)}→{shown(b)}' for a, b in pairs],
            # per checkpoint, per position: p(target) and its loss -ln p(target)
            'p': [[base.r(p(it, a, b), 6) for a, b in pairs] for it in iterations],
            'loss': [[base.r(-math.log(p(it, a, b)), 4) for a, b in pairs] for it in iterations],
        })
    return {'iterations': iterations, 'overview': overview, 'words': words,
            'uniformLoss': base.r(math.log(len(chars)), 4)}


def configs(train_src, text):
    """Both shipped configs, resolved the way train.py + configurator.py do,
    and what one iteration of train.py does with each."""
    make_lr, lr_line = base.get_lr_factory(train_src)
    # configurator.py exec's a named config file over train.py's globals - what base.resolved_config mirrors.
    assert 'exec(open(config_file).read())' in pinned('configurator.py')
    assert 'gradient_accumulation_steps' not in base.train_py_defaults(train_src)  # `5 * 8` is not a literal; both configs set it
    owt = pinned('data/openwebtext/prepare.py')
    assert 'meta.pkl' not in owt  # openwebtext writes no meta.pkl -> train.py falls back to 50304
    assert "model_args['vocab_size'] = meta_vocab_size if meta_vocab_size is not None else 50304" in train_src
    out = []
    for cid, path, world, dataset_vocab in [
        ('char', 'config/train_shakespeare_char.py', 1, len(sorted(set(text)))),
        ('gpt2', 'config/train_gpt2.py', GPT2_WORLD_SIZE, None),
    ]:
        src = base.nanogpt(path) if path in base.NANOGPT_FILES else pinned(path)
        cfg = base.resolved_config(train_src, src)
        accum = cfg['gradient_accumulation_steps']
        assert accum % world == 0  # train.py:94
        vocab = dataset_vocab if dataset_vocab is not None else 50304
        get_lr = make_lr(cfg['learning_rate'], cfg['warmup_iters'], cfg['lr_decay_iters'], cfg['min_lr'])
        W, D = cfg['warmup_iters'], cfg['lr_decay_iters']
        assert cfg['decay_lr'] and cfg['max_iters'] == D  # so get_lr's min_lr branch is never reached

        def branch(it):
            return 'warmup' if it < W else 'floor' if it > D else 'cosine'
        stops = [0, W - 1, W, (W + D) // 2, cfg['max_iters'], D + 1]
        out.append({
            'id': cid, 'config': path, 'dataset': cfg['dataset'], 'worldSize': world,
            'batchSize': cfg['batch_size'], 'blockSize': cfg['block_size'], 'vocabSize': vocab,
            'vocabFrom': 'meta.pkl' if dataset_vocab is not None else 'default 50304',
            'lnVocab': base.r(math.log(vocab), 4),
            'gradAccumConfigured': accum, 'gradAccumPerProcess': accum // world,
            'learningRate': cfg['learning_rate'], 'minLr': cfg['min_lr'], 'warmupIters': W, 'lrDecayIters': D,
            'maxIters': cfg['max_iters'], 'evalInterval': cfg['eval_interval'],
            'alwaysSaveCheckpoint': cfg['always_save_checkpoint'], 'gradClip': cfg['grad_clip'],
            'weightDecay': cfg['weight_decay'], 'betas': [cfg['beta1'], cfg['beta2']],
            'stops': [{'iteration': it, 'branch': branch(it), 'lr': base.r(get_lr(it), 9), 'lrText': sci4(get_lr(it)),
                       'evaluates': it % cfg['eval_interval'] == 0, 'reached': it <= cfg['max_iters']} for it in stops],
        })
    return {'getLrLine': lr_line, 'configs': out}


def build():
    train_src = base.nanogpt('train.py')
    config_src = base.nanogpt('config/train_shakespeare_char.py')
    text = base.fetch(base.DATASET_URL, base.DATASET_SHA).decode('utf-8')
    cfg = base.resolved_config(train_src, config_src)
    return {
        'provenance': {'nanogpt': {'repo': base.NANOGPT_REPO, 'commit': base.NANOGPT_SHA,
                                   'files': {**base.NANOGPT_FILES, **EXTRA}},
                       'dataset': {'url': base.DATASET_URL, 'sha256': base.DATASET_SHA},
                       'generator': 'gen_training_loss.py (imports generate_fixtures.py)'},
        'recorded': recorded(text, train_src, cfg),
        'curve': {'p': CURVE_P, 'loss': [base.r(-math.log(v), 4) for v in CURVE_P]},
        'iteration': configs(train_src, text),
    }


def render(data):
    header = ('// GENERATED by gen_training_loss.py - do not edit by hand.\n'
              '// Regenerate: python packages/web/src/nanogpt/depth/fixtures/gen_training_loss.py\n'
              '// Recorded toy run (a bigram table, not NanoGPT), a calculated curve, and\n'
              '// values read or executed from the pinned NanoGPT revision - see the script.\n')
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
