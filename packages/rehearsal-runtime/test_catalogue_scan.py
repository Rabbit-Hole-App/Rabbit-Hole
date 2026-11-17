"""Unit tests of scan.py and its use in catalogue.finalize (S1b): the practical set and the recommended route come from SOURCE, so three model runs that sketch nanoGPT differently agree.
No model, no Modal, no network. Run from this directory: python -m pytest test_catalogue_scan.py"""
import copy
import json
import random
from pathlib import Path

import catalogue as cat
import contracts
import scan

VARIANTS = json.loads((Path(__file__).parent / 'fixtures' / 'nanogpt-3adf61e' / 'catalogue-variants.json').read_text(encoding='utf-8'))

# nanoGPT 3adf61e, reduced to the lines the scans read (same names, same defaults, same structure as the real files)
NANO = {
    'README.md': '# nanoGPT\n',
    'configurator.py': 'import sys\n',
    'bench.py': "import torch\nbatch_size = 12\ndevice = 'cuda'\ncompile = True\nprofile = False\nexec(open('configurator.py').read())\nif 'cuda' in device:\n    torch.cuda.synchronize()\n",
    'train.py': "import torch\ninit_from = 'scratch'\ndevice = 'cuda'\ncompile = True\nmax_iters = 600000\nexec(open('configurator.py').read())\n"
                "if init_from == 'scratch':\n    model = GPT(cfg)\nelif init_from == 'resume':\n    model = GPT(cfg)\nelif init_from.startswith('gpt2'):\n    model = GPT.from_pretrained(init_from, {})\n",
    'sample.py': "import torch\ninit_from = 'resume'\nout_dir = 'out'\ndevice = 'cuda'\ncompile = False\nexec(open('configurator.py').read())\n"
                 "if init_from == 'resume':\n    model = GPT(cfg)\nelif init_from.startswith('gpt2'):\n    model = GPT.from_pretrained(init_from, dict(dropout=0.0))\n",
    'config/train_shakespeare_char.py': "out_dir = 'out-shakespeare-char'\nbatch_size = 64\n",
    'config/finetune_shakespeare.py': "init_from = 'gpt2-xl'\nout_dir = 'out-shakespeare'\n",
    'config/train_gpt2.py': 'batch_size = 12\n',
    'config/eval_gpt2.py': "batch_size = 8\neval_only = True\ninit_from = 'gpt2'\n",
    'data/shakespeare_char/prepare.py': "import requests\ninput_file_path = 'input.txt'\nif not os.path.exists(input_file_path):\n    data_url = 'https://raw.githubusercontent.com/karpathy/char-rnn/master/data/tinyshakespeare/input.txt'\n    requests.get(data_url)\n",
    'data/shakespeare/prepare.py': "import requests\ndata_url = 'https://raw.githubusercontent.com/karpathy/char-rnn/master/data/tinyshakespeare/input.txt'\n",
    'data/openwebtext/prepare.py': '# https://github.com/HazyResearch/flash-attention\nfrom datasets import load_dataset\nif __name__ == \'__main__\':\n    dataset = load_dataset("openwebtext", num_proc=8)\n',
}
CPU_SHAKESPEARE = ('data/shakespeare_char/prepare.py', 'train.py', 'sample.py')


def run(name, files=NANO, mutate=None):
    doc = {'repo': 'karpathy/nanoGPT', 'commit': '3' * 40, 'hardware': 'cpu', 'summary': 'x', 'groups': copy.deepcopy(VARIANTS[name]['groups']), 'routes': copy.deepcopy(VARIANTS[name]['routes'])}
    if mutate:
        mutate(doc['routes'])
    cat.finalize(doc, [], files)
    return doc


def practical_ids(doc):
    """What the route runs, not what the model called it: the scripts of its steps."""
    return sorted(tuple(scan.step_files(s['cmd'], NANO)) for r in doc['routes'] if r['practical'] for s in [{'cmd': ' && '.join(x['cmd'] for x in r['stepsSketch'])}])


def recommended_of(doc):
    rec = [r for r in doc['routes'] if r.get('recommended')]
    assert len(rec) == 1
    return tuple(scan.step_files(' '.join(s['cmd'] for s in rec[0]['stepsSketch']), NANO))


# ---- the three real runs (coordinator evidence 2026-11-15) -------------------------------------------------------------------------------------

def test_the_three_real_nanogpt_runs_give_the_same_practical_set_and_recommended_route():
    docs = [run(f'run{i}') for i in (1, 2, 3)]
    sets = [practical_ids(d) for d in docs]
    assert sets[0] == sets[1] == sets[2]
    assert len(sets[0]) == 2  # the benchmark and the character model, in every run
    recs = [recommended_of(d) for d in docs]
    assert recs[0] == recs[1] == recs[2] and 'train.py' in recs[0] and 'sample.py' in recs[0]  # a route that shows something, not the benchmark
    for d in docs:
        assert contracts.errors('catalogue', d) == []
        for r in d['routes']:
            cmds = ' '.join(s['cmd'] for s in r['stepsSketch'])
            if 'torchrun' in cmds or 'gpt2-xl' in cmds or 'openwebtext' in cmds:
                assert r['practical'] is False, r['routeId']  # GPU launcher, Hugging Face download, 54 GB dataset


def test_a_gpu_flavoured_and_a_cpu_flavoured_sketch_of_one_route_are_one_route():
    d = run('run1')
    train_routes = [r for r in d['routes'] if any('train.py config/train_shakespeare_char.py' in s['cmd'] for s in r['stepsSketch'])]
    assert len(train_routes) == 1 and 'cpu' in train_routes[0]['routeId']  # the README's CPU wording survives, the GPU wording is folded into it


def test_the_benchmark_route_is_practical_whichever_way_the_model_sketched_it():
    for name in ('run1', 'run2', 'run3'):
        d = run(name)
        bench = next(r for r in d['routes'] if any('bench.py' in s['cmd'] for s in r['stepsSketch']))
        assert bench['practical'] is True and bench['stepsSketch'][-1]['cmd'] == 'python bench.py --device=cpu --compile=False' and bench['requirements']['gpu'] is False
        assert not bench.get('recommended')


def test_permuted_model_facts_give_the_same_practical_set():
    base = practical_ids(run('run1'))

    def permute(seed):
        rnd = random.Random(seed)

        def go(routes):
            for r in routes:
                req = r['requirements']
                req['gpu'] = rnd.random() < 0.5 and 'torchrun' not in r['stepsSketch'][-1]['cmd']  # the model's gpu fact is ignored, but a launcher stays a launcher
                req['downloadGB'] = rnd.choice([0, 0.001, 2, 10])
                req['evidence'] = []
                req['downloadHosts'] = rnd.sample(['huggingface.co', 'raw.githubusercontent.com', 'example.com', 'pypi.org'], rnd.randint(0, 3))
                for s in r['stepsSketch']:
                    if rnd.random() < 0.7:
                        s['cmd'] = s['cmd'].replace(' --device=cpu', '').replace(' --compile=False', '')
        return go
    for seed in range(20):
        d = run('run1', mutate=permute(seed))
        assert practical_ids(d) == base, seed
        assert recommended_of(d) == recommended_of(run('run1'))


def test_the_model_number_counts_only_when_it_cites_a_download():
    def claim(cited):
        def go(routes):
            r = next(x for x in routes if any('bench.py' in s['cmd'] for s in x['stepsSketch']))
            r['requirements']['downloadGB'] = 3
            r['requirements']['evidence'] = [{'kind': 'download', 'source': 'README.md:1'}] if cited else []
        return go
    bench = lambda d: next(r for r in d['routes'] if any('bench.py' in s['cmd'] for s in r['stepsSketch']))
    assert bench(run('run1', mutate=claim(False)))['practical'] is True
    assert bench(run('run1', mutate=claim(True)))['practical'] is False


# ---- scan.py ------------------------------------------------------------------------------------------------------------------------------------

def test_normalise_cmd_sets_the_cpu_flavour_only_where_the_script_has_the_knobs():
    n = lambda c: scan.normalise_cmd(c, NANO)
    assert n('python bench.py') == 'python bench.py --device=cpu --compile=False'
    assert n('python train.py config/train_shakespeare_char.py --device=cuda:0 --compile=True') == 'python train.py config/train_shakespeare_char.py --device=cpu --compile=False'
    assert n('python sample.py --out_dir=out') == 'python sample.py --out_dir=out --device=cpu'  # compile already defaults to False
    assert n('python data/shakespeare_char/prepare.py') == 'python data/shakespeare_char/prepare.py'
    assert n('pip install torch') == 'pip install torch'
    assert n('torchrun --standalone --nproc_per_node=8 train.py config/train_gpt2.py') == 'torchrun --standalone --nproc_per_node=8 train.py config/train_gpt2.py'  # a launcher stays what it is


def sc(cmd, files=NANO, source=None):
    route = {'stepsSketch': [{'cmd': cmd, 'source': source or 'README.md:1'}]}
    return scan.scan_route(route, files)


def test_gpu_is_true_for_launchers_and_scripts_with_no_cpu_path_only():
    assert sc('python train.py').get('gpu') is False  # a device knob: runs on CPU
    assert sc('torchrun --standalone --nproc_per_node=8 train.py config/train_gpt2.py')['gpu'] is True
    hard = {'run.py': "import torch\nm = Net().cuda()\n"}
    assert sc('python run.py', hard)['gpu'] is True
    assert sc('python run.py --device=cuda', {'run.py': 'import sys\n'})['gpu'] is True
    assert sc('python run.py', {'run.py': "import torch\ndev = 'cuda' if torch.cuda.is_available() else 'cpu'\nm = Net().cuda()\n"})['gpu'] is False  # has a fallback
    assert sc('pip install torch')['scanned'] is False  # nothing to read: the caller keeps the model's word


def test_hosts_come_from_literals_loaders_and_cited_lines_not_from_comments():
    assert sc('python data/shakespeare_char/prepare.py')['hosts'] == ['raw.githubusercontent.com']
    assert sc('python data/openwebtext/prepare.py')['hosts'] == [scan.HF]  # the comment's github link is not a download, load_dataset is
    assert sc('python sample.py --init_from=gpt2-xl')['hosts'] == [scan.HF] and sc('python sample.py --init_from=gpt2-xl')['gb'] == 6.5
    assert sc('python sample.py --out_dir=out-shakespeare-char')['hosts'] == []  # init_from defaults to 'resume': a local checkpoint
    assert sc('python train.py config/finetune_shakespeare.py')['hosts'] == [scan.HF]  # the config file sets init_from
    assert sc('python train.py')['hosts'] == []  # 'scratch'
    assert sc('python run.py', {'run.py': 'import json\n', 'README.md': 'x\nsee https://example.com/model.bin\n'}, source='README.md:2')['hosts'] == ['example.com']
    assert sc('python run.py', {'run.py': "ds = load_dataset('json', data_files='a.json')\nnet = Net.from_pretrained('./local')\n"})['hosts'] == []
    assert sc('pip install torch --index-url https://download.pytorch.org/whl/cu121 && python train.py')['gb'] == scan.BIG_URL_GB


def test_the_key_tells_routes_apart_by_script_config_and_mode_not_by_scale_flags():
    k = lambda c: sc(c)['key']
    assert k('python train.py config/train_shakespeare_char.py') == k('python train.py config/train_shakespeare_char.py --max_iters=2000 --n_layer=4')
    assert k('python sample.py') != k('python sample.py --init_from=gpt2-xl')
    assert k('python train.py config/train_gpt2.py') != k('python train.py config/finetune_shakespeare.py')


def test_shows_something_means_a_step_that_produces_output_and_none_that_only_measures():
    r = lambda *c: {'stepsSketch': [{'cmd': x, 'source': 'a:1'} for x in c]}
    assert scan.shows_something(r('pip install -e .', 'python train.py --eval_iters=20', 'python sample.py'))  # --eval_iters is a flag, not an eval step
    assert scan.shows_something(r('pip install -e .', 'datasette serve fixtures.db'))
    assert not scan.shows_something(r('pip install -e .', 'python bench.py --device=cpu'))
    assert not scan.shows_something(r('pytest -n auto'))
    assert not scan.shows_something(r('python train.py', 'python train.py config/eval_gpt2.py'))


def test_recommended_prefers_what_shows_something_over_fewer_steps():
    def route(rid, cmds, kind='stdout'):
        return {'routeId': rid, 'title': rid, 'description': 'd', 'resultKind': kind, 'requirements': {'language': 'python'}, 'stepsSketch': [{'cmd': c, 'source': 'a:1'} for c in cmds]}
    doc = {'routes': [route('a_bench', ['python bench.py']), route('b_tests', ['pytest'], 'tests'), route('c_train', ['pip install x', 'python train.py', 'python sample.py']), route('d_page', ['datasette fixtures.db'], 'http')]}
    cat.finalize(doc, [])
    assert [r['routeId'] for r in doc['routes'] if r.get('recommended')] == ['c_train']
    doc['routes'] = [r for r in doc['routes'] if r['routeId'] != 'c_train']
    cat.finalize(doc, [])
    assert [r['routeId'] for r in doc['routes'] if r.get('recommended')] == ['d_page']  # a page or port next
    doc['routes'] = [r for r in doc['routes'] if r['routeId'] not in ('d_page',)]
    cat.finalize(doc, [])
    assert [r['routeId'] for r in doc['routes'] if r.get('recommended')] == ['a_bench']  # then any non-test route
