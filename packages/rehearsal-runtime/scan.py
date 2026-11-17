"""Facts the controller reads from SOURCE, not from the model (S1b): what a route's steps run on (CPU or GPU), which hosts they download from, how big that is, and the route's identity.
The model only names and sketches routes; the sketch varies from run to run (`python bench.py` or `python bench.py --device=cpu --compile=False`), the source does not.
Pure functions over `files` ({path: text}); no model, no network. Used by catalogue.merged_requirements / finalize."""
import ast
import re

from discover import extract_knobs

_PY = re.compile(r'(?<![\w./-])((?:\./)?[\w./-]+\.py)(?![\w.])')
_FLAG = re.compile(r'--([\w-]+)=("[^"]*"|\'[^\']*\'|\S+)')
_URL = re.compile(r'\b[a-z][a-z+.-]*://(?:[^@/\s]*@)?([A-Za-z0-9.-]+)')
_LAUNCHER = re.compile(r'(?:^|&&|;|\|)\s*(?:sudo\s+)?(?:torchrun|deepspeed|mpirun|srun|sbatch)\b|\baccelerate\s+launch\b')
_HARD_CUDA = re.compile(r"\.cuda\(|\.to\(\s*['\"]cuda|torch\.device\(\s*['\"]cuda")
_LOCAL_BUILDERS = {'json', 'csv', 'text', 'parquet', 'imagefolder', 'audiofolder', 'arrow', 'pandas'}  # datasets.load_dataset readers of local files
HF = 'huggingface.co'
# Known artifact sizes in GB, by the model id or dataset name a loader is given (a small table, not a probe; extend when a catalogue shows an artifact it misses).
KNOWN_GB = {'gpt2': 0.55, 'gpt2-medium': 1.5, 'gpt2-large': 3.2, 'gpt2-xl': 6.5, 'openwebtext': 54.0}
_BIG_URL = re.compile(r'download\.pytorch\.org/whl/cu\d+')  # CUDA wheels: about 2.5 GB, the cpu index is small
BIG_URL_GB = 2.5


def _tree(text: str):
    try:
        return ast.parse(text)
    except (SyntaxError, ValueError):
        return None


def _top_literals(text: str) -> dict:
    """Top-level `name = 'literal'` (and numbers, bools) of a script or config file."""
    tree = _tree(text)
    out = {}
    for n in (tree.body if tree else []):
        if isinstance(n, ast.Assign) and len(n.targets) == 1 and isinstance(n.targets[0], ast.Name) and isinstance(n.value, ast.Constant):
            out[n.targets[0].id] = n.value.value
    return out


def _modes(text: str) -> set:
    """Names compared with `== 'literal'` in the script (`init_from == 'resume'`): knobs whose value picks a mode, which is what makes two routes on one script different."""
    tree = _tree(text)
    return {n.left.id for n in ast.walk(tree or ast.Module([], [])) if isinstance(n, ast.Compare) and isinstance(n.left, ast.Name) and len(n.comparators) == 1
            and isinstance(n.comparators[0], ast.Constant) and isinstance(n.comparators[0].value, str) and isinstance(n.ops[0], (ast.Eq, ast.NotEq))} | \
           {n.func.value.id for n in ast.walk(tree or ast.Module([], [])) if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute) and n.func.attr == 'startswith' and isinstance(n.func.value, ast.Name)}


def _literal_strings(text: str) -> list:
    """String literals other than docstrings and bare expression statements (so URLs in comments and prose never count)."""
    tree = _tree(text)
    skip = {id(n.value) for n in ast.walk(tree or ast.Module([], [])) if isinstance(n, ast.Expr)}
    return [n.value for n in ast.walk(tree or ast.Module([], [])) if isinstance(n, ast.Constant) and isinstance(n.value, str) and id(n) not in skip]


def step_files(cmd: str, files: dict) -> list:
    """The .py files a command names that the snapshot holds: the script first, then any config files it is given."""
    return [p[2:] if p.startswith('./') else p for p in _PY.findall(cmd) if (p[2:] if p.startswith('./') else p) in files]


def normalise_cmd(cmd: str, files: dict) -> str:
    """The CPU flavour of a step whose script declares a `--device` knob (and `--compile` when it defaults to True): the controller sets them, whatever the model wrote."""
    found = step_files(cmd, files)
    if not found or _LAUNCHER.search(cmd):  # a launcher (torchrun...) is a multi-GPU command, not a CPU one: it stays as written
        return cmd
    knobs = {k['flag']: k for k in extract_knobs(found[0], files[found[0]])}
    if '--device' in knobs:
        cmd = re.sub(r'--device[= ]\S+', '--device=cpu', cmd) if re.search(r'--device[= ]\S+', cmd) else cmd + ' --device=cpu'
    if '--compile' in knobs and knobs['--compile'].get('default') == 'True':
        cmd = re.sub(r'--compile[= ]\S+', '--compile=False', cmd) if re.search(r'--compile[= ]\S+', cmd) else cmd + ' --compile=False'
    return cmd


def _effective(var: str, cmd: str, found: list, files: dict):
    """The value a knob takes for this command: the command's own `--var=value`, then a config file's literal, then the script's default."""
    flags = dict(_FLAG.findall(cmd))
    if var in flags:
        return flags[var].strip('\'"')
    for p in reversed(found[1:]):
        v = _top_literals(files[p]).get(var)
        if v is not None:
            return v
    return _top_literals(files[found[0]]).get(var) if found else None


def _loader_values(cmd: str, found: list, files: dict) -> list:
    """Model ids / dataset names the script's `from_pretrained(x)` and `load_dataset(x)` calls fetch for this command: literal arguments, or the effective value of the knob passed (a mode such as 'resume' or 'scratch' is not an id)."""
    out = []
    if not found:
        return out
    text = files[found[0]]
    tree = _tree(text)
    modes = {'resume', 'scratch', ''}
    for n in ast.walk(tree or ast.Module([], [])):
        if not (isinstance(n, ast.Call) and getattr(n.func, 'attr', getattr(n.func, 'id', '')) in ('from_pretrained', 'load_dataset', 'hf_hub_download', 'snapshot_download') and n.args):
            continue
        a = n.args[0]
        v = a.value if isinstance(a, ast.Constant) and isinstance(a.value, str) else _effective(a.id, cmd, found, files) if isinstance(a, ast.Name) else None
        if isinstance(v, str) and v.lower() not in modes | _LOCAL_BUILDERS and not v.startswith(('.', '/', '~')):
            out.append(v)
    if 'huggingface_hub' in text and not out and re.search(r'hf_hub_download|snapshot_download', text):
        out.append('hub')
    return out


def cited_lines(route: dict, files: dict) -> str:
    out = []
    for s in route.get('stepsSketch', []):
        m = re.fullmatch(r'([^\s:]+):(\d+)(?:-(\d+))?', str(s.get('source', '')))
        if m and isinstance(files.get(m.group(1)), str):
            lines = files[m.group(1)].splitlines()
            out += lines[int(m.group(2)) - 1:int(m.group(3) or m.group(2))]
    return '\n'.join(out)


def scan_route(route: dict, files: dict) -> dict:
    """-> {scanned, cmds, gpu, hosts, gb, key}. `scanned` is true when at least one step runs a script the snapshot holds; only then are gpu, hosts and gb facts of the source
    (otherwise the caller keeps what the model said). `cmds` are the steps normalised to the CPU flavour; `key` identifies the route by what it runs (scripts, configs, mode values)."""
    cmds, key, gpu, hosts, gb, scanned = [], [], False, set(), 0.0, False
    for s in route.get('stepsSketch', []):
        cmd = normalise_cmd(s.get('cmd', ''), files)
        cmds.append(cmd)
        found = step_files(cmd, files)
        hosts.update(h.lower() for h in _URL.findall(cmd))
        if _BIG_URL.search(cmd):
            gb = max(gb, BIG_URL_GB)
        if not found:
            continue
        scanned = True
        text = files[found[0]]
        knobs = {k['flag'] for k in extract_knobs(found[0], text)}
        if _LAUNCHER.search(cmd) or (not knobs & {'--device'} and (re.search(r'--device[= ]cuda|\bcuda\b', cmd) or (_HARD_CUDA.search(text) and 'is_available' not in text))):
            gpu = True
        for p in found:
            for lit in _literal_strings(files[p]):
                hosts.update(h.lower() for h in _URL.findall(lit))
                if _BIG_URL.search(lit):
                    gb = max(gb, BIG_URL_GB)
        for v in _loader_values(cmd, found, files):
            hosts.add(HF)
            gb = max(gb, KNOWN_GB.get(v.lower(), 0.0))
        key.append((found[0], tuple(found[1:]), tuple(sorted((m, str(_effective(m, cmd, found, files))) for m in _modes(text) if _effective(m, cmd, found, files) is not None))))
    for h in _URL.findall(cited_lines(route, files)):
        hosts.add(h.lower())
    return {'scanned': scanned, 'cmds': cmds, 'gpu': gpu, 'hosts': sorted(hosts), 'gb': gb, 'key': tuple(key)}


VISIBLE = re.compile(r'\b(train|sample|serve|run|generate|ask|predict|infer|chat|demo|start|query|simulate|plot|render)\w*', re.I)
NOT_VISIBLE = re.compile(r'bench|profil|pytest|\btests?\b|inspect|\beval|lint|\bcheck', re.I)


def shows_something(route: dict) -> bool:
    """A step that PRODUCES a visible result (train, sample, serve, run, generate, ask...) and none that only measures, tests or inspects."""
    cmds = [re.sub(r'\s--?[\w-]+(?:=\S+)?', '', s.get('cmd', '')) for s in route.get('stepsSketch', []) if not re.match(r'\s*(?:python3?\s+-m\s+)?pip3?\s+install', s.get('cmd', ''))]  # flags dropped: --eval_iters is not an eval
    return any(VISIBLE.search(c) for c in cmds) and not any(NOT_VISIBLE.search(c) for c in cmds)
