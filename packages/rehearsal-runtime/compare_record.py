"""Score a rehearsal record.json against a fixture's expected-*.json files (spec s10; matching rules: fixtures/<name>/README.md).

    python compare_record.py <record.json> [--fixture fixtures/nanogpt-3adf61e] [--logs <dir>]

Prints one PASS / FAIL / SKIPPED line per assertion (FAIL lines name the fixture rule) and a summary; exit code 0 only when no
line FAILs. --logs is the artifact zip's logs directory: the prepare/train/sample stdout facts live there, not in the record,
and are SKIPPED (not PASS) without it. Plain script, standard library only.
"""
import argparse
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
LINES = []


def line(verdict, rule, text):
    LINES.append(verdict)
    print(f'{verdict:<7} [{rule}] {text}')


def check(ok, rule, text, why=''):
    line('PASS' if ok else 'FAIL', rule, text if ok else f'{text} -- {why}' if why else text)
    return ok


def skip(rule, text):
    line('SKIPPED', rule, text)


def norm(cmd):
    return ' '.join(str(cmd).split())


def same_cmd(a, b):
    """Whitespace collapsed; flags (tokens starting with --) in any order."""
    ta, tb = norm(a).split(' '), norm(b).split(' ')
    split = lambda t: ([x for x in t if not x.startswith('--')], sorted(x for x in t if x.startswith('--')))
    return split(ta) == split(tb)


def load(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def pkg_in(cmd, pkg):
    return any(re.split(r'[=<>~!\[]', t)[0].lower() == pkg for t in norm(cmd).split(' ')[2:])


# ---- route (expected-route.json: matchRules) -------------------------------------------------------------------------
def score_route(rec, exp):
    route, fixes = rec['route'], rec['fixes']
    check(rec['commit'] == exp['commit'], 'route.commit', f"commit {rec['commit'][:12]} is the fixture's {exp['commit'][:12]}", 'a different commit; the fixture facts do not apply')
    check(rec['hardware'] == exp['hardware'], 'route.hardware', f"hardware {rec['hardware']}", f"fixture is {exp['hardware']}")
    check(route['routeId'] == exp['routeId'], 'route.routeId exact', f"routeId {route['routeId']}", f"expected {exp['routeId']} (a GPU or other route was chosen: discovery, not the runner)")
    got = [s['id'] for s in route['steps']]
    want = [s['id'] for s in exp['steps']]
    check(got == want, 'route.steps same ids, same order', f'step ids {got}', f'expected {want}')
    by_id = {s['id']: s for s in route['steps']}
    for es in exp['steps']:
        s = by_id.get(es['id'])
        if not s:
            check(False, 'route.steps cmd', f"step {es['id']}", 'missing from the route')
            continue
        if same_cmd(s['cmd'], es['cmd']):
            check(True, 'route.steps cmd after whitespace collapse', f"{es['id']}: cmd as discovered (CPU flags in the discovered command)" if es['id'] == 'train' else f"{es['id']}: cmd matches")
            continue
        flags = ' '.join(f['change'] for f in fixes if f['kind'] == 'add_flag' and f['step'] == es['id'])
        ok = bool(flags) and same_cmd(f"{s['cmd']} {flags}", es['cmd'])
        check(ok, 'route.steps cmd (or add_flag fix completing it)', f"{es['id']}: cmd completed by add_flag fix '{flags}'",
              f"discovered '{norm(s['cmd'])}' != '{norm(es['cmd'])}' and no add_flag fix completes it")
    for ins in exp['install']:
        cmds = [i['cmd'] for i in route['install']]
        ok = any(pkg_in(c, 'torch') and pkg_in(c, 'numpy') for c in cmds)
        check(ok, 'route.install superset of torch+numpy', f'install {cmds}', 'torch and numpy not both installed by the route')
    seen = {a['routeId']: a.get('rejected', '') for a in route['alternatives']}
    for ea in exp['alternatives']:
        # fixture: rejectedBecause; schema: rejected. Reasons are free text; only the routeId must appear, with a reason.
        check(ea['routeId'] in seen and bool(seen.get(ea['routeId'])), 'route.alternatives routeId + reason (fixture rejectedBecause = schema rejected)',
              f"{ea['routeId']} rejected: {seen.get(ea['routeId'], '')[:70]}", 'alternative missing or has no reason')
    knobs = {(k['step'], k['flag']): k for k in route['knobs']}
    for ek in exp['knobs']:
        k = knobs.get((ek['step'], ek['flag']))
        if k is None and ek.get('optional'):
            line('PASS', 'route.knobs listed with types (optional)', f"{ek['flag']} not listed (optional)")
        else:
            check(k is not None and k['type'] == ek['type'], 'route.knobs listed with types, extras allowed', f"{ek['flag']} type {ek['type']}",
                  'knob missing' if k is None else f"type {k['type']}, expected {ek['type']}")


# ---- fixes (expected-fixes.json) -------------------------------------------------------------------------------------
def score_fixes(rec, exp):
    fixes, route = rec['fixes'], rec['route']
    allowed = [(a['kind'], a.get('step'), norm(a['change'])) for a in exp['allowed']]
    bad = [f for f in fixes if not any(f['kind'] == k and (st is None or f['step'] == st) and norm(f['change']) == ch for k, st, ch in allowed)]
    check(not bad, 'fixes subset of allowed (kind + change)', f'{len(fixes)} fix(es), all allowed',
          'outside allowed: ' + '; '.join(f"{f['kind']} '{f['change']}' (step {f['step']})" for f in bad) + ' -- report it: the README was wrong in a way the fixture did not record, or the agent over-fixed')
    pkgs = {'requests': 'prepare', 'tiktoken': 'sample'}
    for pkg, where in pkgs.items():
        via_fix = any(f['kind'] == 'install_package' and pkg_in(f['change'], pkg) for f in fixes)
        via_install = any(pkg_in(i['cmd'], pkg) for i in route['install'])
        baked = pkg in rec['environment']['packagesAfter']
        if via_fix:
            line('PASS', 'fixes required (conditional on the image assumption)', f'pip install {pkg}: path = fix (install_package; fails in {where} without it)')
        elif via_install:
            line('PASS', 'fixes required (conditional on the image assumption)', f"{pkg}: path = zero fixes, discovery's install step already includes it")
        elif baked:
            line('PASS', 'fixes required (conditional on the image assumption)', f'{pkg}: path = baked image (in packagesAfter; not installed by a fix or the install step)')
        else:
            check(False, 'fixes required (conditional on the image assumption)', f'pip install {pkg}', f'not a fix, not in route.install, not in packagesAfter; it would fail in {where}')
    check(len(fixes) <= 3, 'fixes notExpected: more than 3 fixes in total', f'{len(fixes)} fix(es)', 'more than 3 on an honest run')
    check(not any(f['kind'] == 'edit_command' and '.py' in f['change'] for f in fixes), 'fixes notExpected: edit_command changing a script path', 'no edit_command on a script path',
          'an edit_command changes a script path')
    check(not any(f['kind'] == 'add_step_before' for f in fixes), 'fixes notExpected: add_step_before', 'no add_step_before', "the README's three steps are complete")
    banned = [f['change'] for f in fixes if f['kind'] == 'install_package' and any(re.search(rf'\b{p}\b', f['change']) for p in ('transformers', 'datasets', 'wandb', 'tqdm'))]
    check(not banned, 'fixes notExpected: installs transformers/datasets/wandb/tqdm', 'none installed', f'installed {banned}; the route does not import them')


# ---- traps and the knob command (expected-traps.json) ----------------------------------------------------------------
def score_traps(rec, exp):
    traps = {t['id']: t for t in rec['traps']}
    for et in exp['traps']:
        t = traps.get(et['id'])
        if t is None:
            check(False, 'traps each must fail', f"trap {et['id']}", 'missing from record.traps')
            continue
        if t['rc'] == 0:
            check(False, 'traps each must fail', f"trap {et['id']}", 'FINDING: the trap PASSED (rc 0); configurator.py changed, so the commit is not 3adf61e')
            continue
        check(True, 'traps rc != 0', f"trap {et['id']} rc {t['rc']}")
        check(et['stderrContains'] in t['stderrTail'], 'traps stderr contains fragment', f"trap {et['id']} stderr has '{et['stderrContains']}'",
              f"fragment '{et['stderrContains']}' not in stderrTail")
        check(same_cmd(t['cmd'], et['cmd']), 'traps cmd', f"trap {et['id']} cmd", f"ran '{norm(t['cmd'])}', fixture '{norm(et['cmd'])}'")
    kv, ev = rec['knobsVerified'], exp['knobVerification']
    if not kv:
        check(False, 'knobVerification vs knobsVerified[0]', 'knobsVerified[0]', 'record.knobsVerified is empty')
        return
    k = kv[0]
    check(same_cmd(k['cmd'], ev['cmd']), 'knobVerification cmd', 'knobsVerified[0].cmd', f"ran '{norm(k['cmd'])}', fixture '{norm(ev['cmd'])}'")
    check((k['rc'] == 0) == ev['expectRcZero'], 'knobVerification rc 0', f"knobsVerified[0].rc {k['rc']}", 'the knob command failed')
    check(k['startsWithPrompt'] is True, 'knobVerification startsWithPrompt', f"startsWithPrompt (output starts with {ev['stdoutFirstSampleStartsWith']})", 'false')
    if 'separators' in k:
        check(k['separators'] == ev['separatorsCount'], 'knobVerification separators', f"separators {k['separators']}", f"expected {ev['separatorsCount']}")
    else:
        skip('knobVerification separators', 'record.knobsVerified[0] has no separators')


# ---- files, stdout facts, timing (expected-files.json) ---------------------------------------------------------------
def read_log(logs, step):
    p = Path(logs) / Path(step['log']).name if logs else None
    return p.read_text(encoding='utf-8', errors='replace') if p and p.exists() else None


def score_files(rec, exp, logs):
    produced = {}
    for s in rec['steps']:
        produced.update(s['files'])
    for path, e in exp['files'].items():
        got = produced.get(path)
        if got is None:
            check(False, 'files exist', path, 'not in any step.files (the runner must stat every expected path)')
        elif 'bytes' in e:
            check(got['bytes'] == e['bytes'], 'files exact bytes', f"{path} {got['bytes']} bytes", f"expected exactly {e['bytes']} (a different dataset download)")
        else:
            check(got['bytes'] >= e['bytesMin'], 'files bytesMin', f"{path} {got['bytes']} bytes >= {e['bytesMin']}", f"{got['bytes']} < {e['bytesMin']} (wrong torch/pickle version)")
    steps = {s['id']: s for s in rec['steps']}
    # timing: only the step timeout fails; measured times are recorded, not judged
    for sid, limit in (('prepare', 600), ('train', 1500), ('sample', 600)):
        s = steps.get(sid)
        if s is None:
            check(False, 'timing', f'step {sid}', 'missing from record.steps')
        else:
            check(s['sec'] <= limit, 'timing fails only above the step timeout', f"{sid} took {s['sec']} s (timeout {limit} s)", f"{s['sec']} s > {limit} s")
    # stdout facts live in the logs; the loss range is also in the record's metric_decreased check
    tr = steps.get('train')
    metric = next((c for c in (tr['checks'] if tr else []) if 'first' in c and 'last' in c), None)
    logtext = {sid: read_log(logs, s) for sid, s in steps.items()}
    lo, hi = exp['trainStdout']['metric']['firstApprox'] - 0.1, exp['trainStdout']['metric']['firstApprox'] + 0.1
    below = exp['trainStdout']['metric']['lastBelow']
    first = last = None
    if metric:
        first, last = metric['first'], metric['last']
    elif logtext.get('train'):
        losses = [float(m) for m in re.findall(r'^iter \d+: loss ([\d.]+)', logtext['train'], re.M)]
        first, last = (losses[0], losses[-1]) if losses else (None, None)
    if first is None:
        skip('stdout loss first 4.1-4.3, last < 2.2', 'no metric_decreased first/last in the record and no --logs')
    else:
        check(lo <= first <= hi, 'stdout loss first in 4.1-4.3', f'first loss {first}', f'not in {lo:.1f}-{hi:.1f} (ln 65 = 4.17)')
        check(last < below, f'stdout loss last < {below}', f'last loss {last}', f'not below {below} (README reference ~1.88)')
    facts = {
        'prepare': lambda t: [(p in t, 'stdout prepare contains', f"'{p}'", 'not in prepare log') for p in exp['prepareStdout']['contains']],
        'train': lambda t: train_facts(t, exp['trainStdout']),
        'sample': lambda t: sample_facts(t, exp['sampleStdout']),
    }
    for sid, fn in facts.items():
        if logtext.get(sid) is None:
            skip(f'stdout facts: {sid}', '--logs not given or its log file is absent; these facts live in the logs, not the record')
        else:
            for ok, rule, text, why in fn(logtext[sid]):
                check(ok, rule, text, why)


def train_facts(t, e):
    m = re.search(r'number of parameters: ([\d.]+)M', t)
    n = len(re.findall(r'^iter \d+: loss ', t, re.M))
    s = len(re.findall(r'^step \d+: train loss', t, re.M))
    saves = len(re.findall(r'saving checkpoint', t))
    return [
        (n == e['iterLines'], 'stdout train iterLines', f"{n} 'iter N: loss' lines", f"expected {e['iterLines']}"),
        (s == e['stepLines'], 'stdout train stepLines', f"{s} 'step N: train loss' lines", f"expected {e['stepLines']}"),
        (bool(m) and 0.7 <= float(m.group(1)) <= 0.9, 'stdout train params 0.7-0.9M', f"parameters {m.group(1) + 'M' if m else 'line absent'}", 'not in 0.7-0.9M'),
        (e['checkpointSavesMin'] <= saves <= e['checkpointSavesMax'], 'stdout train checkpoint saves', f'{saves} saves', f"expected {e['checkpointSavesMin']}-{e['checkpointSavesMax']}"),
    ]


def sample_facts(t, e):
    seps = sum(1 for ln in t.splitlines() if ln.strip() == '-' * 15)
    return [(c in t, 'stdout sample contains', f"'{c}'", 'absent') for c in e['contains']] + \
           [(c not in t, 'stdout sample notContains', f"no '{c}'", 'present: meta.pkl was not found') for c in e['notContains']] + \
           [(seps == e['separators'], 'stdout sample separators', f'{seps} separators', f"expected {e['separators']}")]


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('record')
    ap.add_argument('--fixture', default='fixtures/nanogpt-3adf61e')
    ap.add_argument('--logs', help="the artifact zip's logs directory")
    a = ap.parse_args(argv)
    fx = Path(a.fixture)
    if not fx.is_dir() and (HERE / fx).is_dir():
        fx = HERE / fx
    rec = load(a.record)
    exp = {n: load(fx / f'expected-{n}.json') for n in ('route', 'fixes', 'traps', 'files')}
    print(f"record {a.record}\nfixture {fx.name}\n")
    score_route(rec, exp['route'])
    score_fixes(rec, exp['fixes'])
    score_traps(rec, exp['traps'])
    score_files(rec, exp['files'], a.logs)
    n = {v: LINES.count(v) for v in ('PASS', 'FAIL', 'SKIPPED')}
    print(f"\nSUMMARY {n['PASS']} PASS, {n['FAIL']} FAIL, {n['SKIPPED']} SKIPPED (not scored)" + ('' if a.logs else '; pass --logs <dir> to score the stdout facts'))
    return 1 if n['FAIL'] else 0


if __name__ == '__main__':
    sys.exit(main())
