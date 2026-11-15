"""Score a rehearsal record.json against a fixture's expected-*.json files (spec s10; matching rules: fixtures/<name>/README.md).

    python compare_record.py <record.json> [--fixture fixtures/nanogpt-3adf61e] [--logs <dir>]
    python compare_record.py <record.json> --fixture fixtures/datasette-e9d45fe --route serve|tests [--logs <dir>] [--relax]
    python compare_record.py --fixture fixtures/datasette-e9d45fe --catalogue <catalogue.json>

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


RELAX = False  # --relax: a discovered command may carry extra flags (the runner adds --top_k/--seed to traps) and step ids are matched by command


DS = False  # --route / --catalogue (datasette fixture): `uv run ` prefix dropped, `python3 -m pip` read as `pip`, --port free


def cmdnorm(c):
    c = norm(c)
    if not DS:
        return c
    c = re.sub(r'^uv run ', '', c)
    c = re.sub(r'^python3? -m pip ', 'pip ', c)
    return norm(re.sub(r'--port[ =]\S+', '', c))  # --port (value or presence; the default is 8001) is free


def same_cmd(a, b):
    """Whitespace collapsed; flags (tokens starting with --) in any order. Under --relax the discovered command may carry extra flags."""
    ta, tb = cmdnorm(a).split(' '), cmdnorm(b).split(' ')
    if RELAX and set(tb) <= set(ta) and [x for x in ta if not x.startswith('--')] == [x for x in tb if not x.startswith('--')]:
        return True
    split = lambda t: ([x for x in t if not x.startswith('--')], sorted(x for x in t if x.startswith('--')))
    return split(ta) == split(tb)


def relax_ids(rec, exp):
    """--relax only: discovery names routes and steps itself (shakespeare_char_cpu, prepare_data), so map each expected step id to the discovered step with the same command and rename it everywhere. Printed as INFO, never silent."""
    rid = exp['routeId']
    if rec['route']['routeId'] != rid and (rec['route']['routeId'].startswith(rid) or rid in rec['route']['routeId']):
        print(f"INFO    [relax] routeId {rec['route']['routeId']} treated as {rid} (prefix)")
        rec['route']['routeId'] = rid
    for es in exp['steps']:
        for s in rec['route']['steps']:
            if s['id'] != es['id'] and same_cmd(s['cmd'], es['cmd']):
                old = s['id']
                print(f"INFO    [relax] step {old} treated as {es['id']} (same command)")
                for lst in (rec['route']['steps'], rec['steps'], rec['attempts'], rec['fixes'], rec['route']['knobs']):
                    for x in lst:
                        if x.get('id', x.get('step')) == old:
                            x['id' if 'id' in x else 'step'] = es['id']
                break


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
    # fixture v2: alternatives are matched by REASON, not id (discovery names its routes itself).
    if 'alternatives' not in route:  # since the catalogue (2026-11-15) a route no longer carries alternatives: the catalogue lists them (score it with compare_catalogue.py)
        skip('route.alternatives', 'the route has no alternatives field: they live in the catalogue')
        reasons = None
    else:
        reasons = [a.get('rejected', '') for a in route['alternatives'] if a.get('rejected')]
    if reasons is not None:
        check(len(reasons) >= 2, 'route.alternatives count >= 2 with reasons', f'{len(reasons)} rejected alternatives with a reason', 'fewer than 2')
        for ea in exp['alternatives']:
            terms = ea['reasonMustMention']
            hit = next((r for r in reasons if any(t.lower() in r.lower() for t in terms)), None)
            check(hit is not None, f"route.alternatives a reason mentions one of {terms}", (hit or '')[:80], 'no reason mentions it')
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
# Traps are generated by the runner BY RULE from the route's knobs (runner.trap_plan), so a fixture trap is matched by SHAPE: the trap kind and the knob it targets
# (record.traps[].kind / .knob), never by the literal command. kind: wrong_type | string_equals | unknown_flag; knob None = any knob.
# A fixture trap with no shape here is not derivable from knobs (tests/fixtures.py refusing an existing file): the runner does not generate it, so it is SKIPPED, not failed.
TRAP_SHAPE = {'temperature_int_not_float': ('wrong_type', '--temperature'), 'start_with_equals_sign': ('string_equals', '--start'), 'unknown_key': ('unknown_flag', None),
              'port_not_an_integer': ('wrong_type', '--port')}


def find_trap(rec, et):
    """(trap, shape) of the record's trap with the fixture trap's shape; falls back to an equal id for a record written before kind/knob existed."""
    shape = TRAP_SHAPE.get(et['id'])
    if shape is None:
        return None, None
    kind, knob = shape
    return next((t for t in rec['traps'] if (t.get('kind') == kind and (knob is None or t.get('knob') == knob)) or t['id'] == et['id']), None), shape


def score_traps(rec, exp):
    for et in exp['traps']:
        t, shape = find_trap(rec, et)
        if shape is None:
            skip('traps shape', f"trap {et['id']}: no knob-derived shape")
            continue
        if t is None:
            check(False, 'traps each must fail', f"trap {et['id']} shape {shape}", f"no record trap with that kind and knob (the record ran {[(x.get('kind'), x.get('knob')) for x in rec['traps']] or 'none'})")
            continue
        if t['rc'] == 0:
            check(False, 'traps each must fail', f"trap {et['id']}", 'FINDING: the trap PASSED (rc 0); configurator.py changed, so the commit is not 3adf61e')
            continue
        check(True, 'traps rc != 0', f"trap {et['id']} shape {shape} rc {t['rc']}")
        check(et['stderrContains'] in t['stderrTail'], 'traps stderr contains fragment', f"trap {et['id']} stderr has '{et['stderrContains']}'",
              f"fragment '{et['stderrContains']}' not in stderrTail")
    kv, ev = rec['knobsVerified'], exp['knobVerification']
    if not kv:
        check(False, 'knobVerification vs knobsVerified[0]', 'knobsVerified[0]', 'record.knobsVerified is empty')
        return
    k = kv[0]
    # fixture v2: semantic, not a literal command.
    toks = norm(k['cmd']).split(' ')
    flag = lambda name: next((t.split('=', 1)[1] for t in toks if t.startswith(name + '=')), None)
    missing = [m for m in ev['mustInclude'] if not any(m.rstrip('=') == ' '.join(toks[:2]) or t == m or (m.endswith('=') and t.startswith(m)) for t in toks) and m not in norm(k['cmd'])]
    check(not missing, 'knobVerification command carries', 'knobsVerified[0].cmd has ' + ', '.join(ev['mustInclude']), f'missing {missing}')
    start, temp, num = flag('--start'), flag('--temperature'), flag('--num_samples')
    check(start is not None and '=' not in start and start != '', 'knobVerification --start is a string without =', f'--start={start}', 'absent or contains =')
    try: tv = float(temp)
    except (TypeError, ValueError): tv = None
    # Reviewer 2026-11-15: the rule is 'differs from the default' (either direction), so a hotter 1.0 passes; the fixture's old temperatureBelow key is read as the default.
    default_t = ev.get('temperatureDiffersFrom', ev.get('temperatureBelow'))
    check(tv is not None and default_t is not None and tv != float(default_t), 'knobVerification --temperature differs from the default', f"--temperature={temp} != {default_t}", 'absent, not a float, or equal to the default')
    try: nv = int(num)
    except (TypeError, ValueError): nv = None
    check(nv is not None and nv >= 1, 'knobVerification --num_samples >= 1', f'--num_samples={num}', 'absent or < 1')
    check((k['rc'] == 0) == ev['expectRcZero'], 'knobVerification rc 0', f"knobsVerified[0].rc {k['rc']}", 'the knob command failed')
    check(k['startsWithPrompt'] is True, 'knobVerification startsWithPrompt', f"startsWithPrompt (first sample starts with the start value used: {start!r})", 'false')
    if 'separators' in k:
        check(nv is not None and k['separators'] == nv, 'knobVerification separators == num_samples used', f"separators {k['separators']} for --num_samples={num}", f'expected {num}')
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


# ---- datasette fixture: route serve|tests and the catalogue (fixtures/datasette-e9d45fe/README.md) -------------------------
def info(rule, text):
    print(f'INFO    [{rule}] {text}')


PIP_UP = re.compile(r'^(python3? -m )?pip install (--upgrade pip|-U pip|pip[=<>]=?[\w.]+)$')  # the documented repair for `--group` on pip < 25.1


def ds_installs(rec_route):
    """(cmd, source) of every install command: route.install plus route steps that are a bare pip install."""
    out = [(i['cmd'], i.get('source', '')) for i in rec_route['install']]
    return out + [(s['cmd'], s.get('source', '')) for s in rec_route['steps'] if cmdnorm(s['cmd']).startswith('pip install')]


def ds_install(rec, exp):
    inst = ds_installs(rec['route'])
    toks = {t for c, _ in inst for t in cmdnorm(c).split(' ')}
    for e in exp['install']:
        if 'cmdMustInclude' in e:
            hit = [(c, src) for c, src in inst if e['cmdMustInclude'] in cmdnorm(c)]
            check(bool(hit), f"install includes '{e['cmdMustInclude']}'", f"install '{hit[0][0]}'" if hit else 'install', f'no install command contains it; install is {[c for c, _ in inst]}')
            if hit:
                check(any(src in e['sourceAnyOf'] for _, src in hit), f"install source one of {e['sourceAnyOf']}", f"source {hit[0][1]}",
                      f"source {[src for _, src in hit]} is not allowed (the fixture lists only the pyproject/README citation)")
        else:
            ok = any(set(o.split(' ')[2:]) <= toks for o in e['cmdAnyOf'])
            check(ok, f"install is the dev group ({e['source']})", '--group dev or the explicit list installed', f"neither of {e['cmdAnyOf']} is covered by the install commands")


def ds_fixes(rec, route):
    fixes = rec['fixes']
    bad, notes = [], []
    for f in fixes:
        c = norm(f['change'])
        if f['kind'] == 'edit_command' and ('uv run' in c or re.search(r'-m "not serial"|-p no:cacheprovider', c)):
            continue
        if f['kind'] == 'install_package' and (c == 'pip install uv' or (route == 'tests' and c == 'pip install pytest pytest-xdist pytest-asyncio beautifulsoup4 pytest-timeout trustme')):
            continue
        if f['kind'] in ('install_package', 'add_step_before') and PIP_UP.match(c):
            notes.append(f"fix {f['n']} '{c}' ({f['kind']}): the documented pip-too-old repair for `--group` (pip < 25.1)")
            continue
        bad.append(f)
    check(not bad, 'allowedFixes (kind + change)', f'{len(fixes)} fix(es), all allowed', 'outside allowed: ' + '; '.join(f"{f['kind']} '{f['change']}'" for f in bad))
    for n in notes:
        info('fixes pip repair', n)
    check(not any(f['kind'] == 'allow_domain' for f in fixes), 'allowedFixes: allow_domain not expected', 'no allow_domain', 'pypi.org and files.pythonhosted.org are already allowlisted')
    check(not any(re.search(r'docker|chrom|playwright|firefox|browser', f['change'], re.I) for f in fixes), 'notExpected: a fix installing Docker or a browser', 'none', 'a fix installs Docker or a browser')
    check(not any(re.search(r'file|patch', f['kind']) for f in fixes), 'notExpected: editing repository files', 'no file edit', 'a fix edits repository files')
    check(not any(norm(s['cmd']).startswith('uv ') for s in rec['route']['steps']) or any(norm(f['change']) == 'pip install uv' for f in fixes), 'uv absent from the sandbox', 'no step needs uv', 'a step runs uv and nothing installs it')


def ds_find(rsteps, exp_step):
    """the route step whose command matches (strict, or extra flags under --relax): (index, step) or None"""
    for i, s in enumerate(rsteps):
        if any(same_cmd(s['cmd'], c) for c in ([exp_step['cmd']] if 'cmd' in exp_step else exp_step['cmdAnyOf'])):
            return i, s
    return None


def ds_exec(rec, route_step):
    """one line: the executed step's rc and checks; returns (recorded step or None, the declared checks paired with the results)"""
    rs = next((s for s in rec['steps'] if s['id'] == route_step['id']), None)
    if rs is None:
        check(False, 'execution: rc 0 and every check passed', route_step['id'], 'not in record.steps (never ran)')
        return None, []
    bad = [c['type'] for c in rs['checks'] if not c.get('passed')]
    why = ', '.join(filter(None, [f"rc {rs['rc']}" if rs['rc'] else '', f'failed checks {bad}' if bad else '', rs.get('error') and f"error: {rs['error']}", rs.get('failed') and 'step marked failed']))
    check(not why, 'execution: rc 0 and every check passed', f"{route_step['id']}: rc {rs['rc']}, {len(rs['checks']) - len(bad)}/{len(rs['checks'])} checks passed", why)
    return rs, list(zip(route_step.get('checks', []), rs['checks']))


def score_ds_route(rec, fx, route, logs):
    exp = load(fx / f'expected-route-{route}.json')
    cat, files, traps = (load(fx / f'expected-{n}.json') for n in ('catalogue', 'files', 'traps'))
    rr = rec['route']
    check(rec['commit'] == cat['commit'], 'route.commit', f"commit {rec['commit'][:12]} is the fixture's {cat['commit'][:12]}", 'a different commit; the fixture facts (line numbers, version) may not apply')
    check(rec['hardware'] == exp['hardware'], 'route.hardware', f"hardware {rec['hardware']}", f"fixture is {exp['hardware']}")
    g = rec.get('gaveUp')
    check(not g, 'record.gaveUp (a FINDING when set)', 'the run did not give up', f"gave up at step {g and g.get('step')}: {g and g.get('reason')}")
    work = [s for s in rr['steps'] if not cmdnorm(s['cmd']).startswith('pip install')]
    if RELAX:
        relax_ids(rec, {'routeId': rr['routeId'], 'steps': [dict(es, cmd=c) for es in exp['steps'] for c in ([es['cmd']] if 'cmd' in es else es['cmdAnyOf'])]})
    ds_install(rec, exp)
    found, by = [], {}
    for es in exp['steps']:
        rule = f"steps {es['id']} cmd (whitespace collapsed, uv run dropped, --port free)"
        hit = ds_find(work, es)
        if hit is None:
            check(False, rule, es['id'], f"no route step has it; the route's steps are {[norm(s['cmd']) for s in work]}")
            continue
        found.append(hit)
        by[es['id']] = hit[1]
        check(True, rule, f"{es['id']}: '{norm(hit[1]['cmd'])}'")
        if hit[1]['id'] != es['id']:
            info('ids model-chosen', f"step id {hit[1]['id']} is the fixture's {es['id']} (matched by command, not scored)")
    idx = [i for i, _ in found]
    check(len(found) == len(exp['steps']) and idx == sorted(idx), 'steps same order', 'fixture steps found, in order', f"found {len(found)} of {len(exp['steps'])}, positions {idx}")
    if route == 'serve':
        # a step missing by command is still scored on the facts by role (fixtures.py step, the long-running step), so a near-miss does not hide them
        for sid, pick in (('fixtures', lambda s: 'tests/fixtures.py' in norm(s['cmd'])), ('serve', lambda s: s.get('longRunning'))):
            loose = next((s for s in work if pick(s)), None) if sid not in by else None
            if loose:
                by[sid] = loose
                info('step by role', f"{sid}: scored on '{norm(loose['cmd'])}' (the step that {'writes the database' if sid == 'fixtures' else 'is longRunning'}; its command did not match the fixture's)")
        score_serve(rec, exp, files, traps, by, work, logs)
    else:
        score_tests(rec, exp, work)
    ds_fixes(rec, route)


def port_of(cmd, default=8001):
    m = re.search(r'--port[ =](\d+)', norm(cmd))
    return int(m.group(1)) if m else default


def score_serve(rec, exp, files, traps, by, work, logs):
    fs, sv = by.get('fixtures'), by.get('serve')
    before = work[:work.index(sv)] if sv else []
    check(any('tests/fixtures.py' in norm(s['cmd']) for s in before), 'database-writing step before serve', 'a step running tests/fixtures.py precedes serve', 'no tests/fixtures.py step before serve (it would serve a file that does not exist)')
    if fs:
        have = {c['type']: c for c in fs.get('checks', [])}
        check('exit_zero' in have and 'fixtures.db' in have.get('files_exist', {}).get('paths', []), 'fixtures checks: exit_zero + files_exist fixtures.db', 'declared', f"declared {[(c['type'], c.get('paths')) for c in fs.get('checks', [])]}")
        rs, _ = ds_exec(rec, fs)
        if rs:
            frag = files['fixturesStdout']['contains'][0]
            check(frag in norm(rs['stdoutHead'] + ' ' + rs['stdoutTail']), 'stdout contains (tests/fixtures.py:460)', f"'{frag}'", 'not in the step stdout')
            check(rs['sec'] <= exp['timing']['fixturesSecMax'], 'timing fixtures <= fixturesSecMax', f"fixtures took {rs['sec']} s (max {exp['timing']['fixturesSecMax']})", 'too slow')
    produced = {}
    for s in rec['steps']:
        produced.update(s['files'])
    f, fmin = produced.get('fixtures.db'), files['files']['fixtures.db']['bytesMin']
    check(f is not None and f['bytes'] >= fmin, 'files: fixtures.db in step files, bytesMin', f"fixtures.db {f and f['bytes']} bytes >= {fmin}", 'absent from every step.files, or too small')
    if sv:
        port = port_of(sv['cmd'])
        have = {c['type']: c for c in sv.get('checks', [])}
        probes = [c for c in sv.get('checks', []) if c['type'] == 'http_200']
        check(sv.get('longRunning') is True, 'serve is longRunning', 'longRunning true', 'not longRunning (it would block the run)')
        check('port_listens' in have and have['port_listens'].get('port') == port and bool(probes) and all(c.get('port') == port for c in probes), 'serve checks: port_listens + http_200 on its port',
              f'port_listens + {len(probes)} http_200 on {port}', f"declared {[(c['type'], c.get('port'), c.get('path')) for c in sv.get('checks', [])]} for a serve on {port}")
        rs, pairs = ds_exec(rec, sv)
        if rs:
            started = rs.get('startedSec')
            check(started is not None and started <= exp['timing']['serveStartedSecMax'], 'timing startedSec <= serveStartedSecMax', f"startedSec {started} (max {exp['timing']['serveStartedSecMax']})", 'startedSec absent (the server never answered) or too slow')
            need = {p: [x] for p, x in next(e for e in exp['steps'] if e['id'] == 'serve').get('bodyMustContain', {}).items()}
            for p, frs in files['serve']['httpBodyContains'].items():
                need[p] = need.get(p, []) + [x for x in frs if x not in need.get(p, [])]
            bodies = {d.get('path'): r.get('body') for d, r in pairs if d['type'] == 'http_200' and r.get('body') is not None}
            lt = read_log(logs, rs) if rs.get('log') else None
            for path, frs in need.items():
                for x in frs:
                    if path in bodies:
                        check(x in bodies[path], f'http body {path} contains', f'{path} body has {x}', 'not in the recorded body head')
                    elif lt is not None and x in lt:
                        check(True, f'http body {path} contains', f'{x} found in the step log')
                    else:
                        skip(f'http body {path} contains {x}', f"the record has no body for {path} (probed {sorted(str(p) for p in bodies)}) and the log does not hold it")
    ports = [port_of(s['cmd']) for s in work if re.match(r'datasette\b', cmdnorm(s['cmd'])) and s.get('longRunning')]
    check(len(ports) == len(set(ports)), 'notExpected: a second serve on the same port', f'serve ports {ports}', 'two long-running serves on one port')
    knobs = {k['flag']: k for k in rec['route']['knobs']}  # the fixture lists no step: matched by flag
    for ek in exp['knobs']:
        k = knobs.get(ek['flag'])
        if k is None and ek.get('optional'):
            line('PASS', 'route.knobs listed with types (optional)', f"{ek['flag']} not listed (optional)")
        else:
            check(k is not None and k['type'] == ek['type'], 'route.knobs listed with types, extras allowed', f"{ek['flag']} type {ek['type']}", 'knob missing' if k is None else f"type {k['type']}, expected {ek['type']}")
    kv = rec['knobsVerified']
    if not kv:
        check(False, 'knobVerification: a serve on a non-default --port, probed', 'knobsVerified[0]', 'record.knobsVerified is empty' + (f" (knobsFailed: {rec['knobsFailed']})" if rec.get('knobsFailed') else ''))
    else:
        check('datasette' in kv[0]['cmd'] and port_of(kv[0]['cmd']) != 8001, 'knobVerification --port differs from the default 8001', f"knobsVerified[0] {norm(kv[0]['cmd'])}", 'not a serve on another port')
        check(kv[0].get('rc') == 0, 'knobVerification rc 0', f"rc {kv[0].get('rc')}", 'the knob command failed')
    score_ds_traps(rec, traps)


def score_ds_traps(rec, exp):
    matched = []
    for et in exp['traps']:
        t, shape = find_trap(rec, et)
        if shape is None:
            skip('traps shape', f"trap {et['id']} ({et['cmd']}): not derivable from knobs, the runner does not generate it")
            continue
        if t is None:
            check(False, 'traps each must fail', f"trap {et['id']} shape {shape}", f"no record trap with that kind and knob (the record ran {[(x.get('kind'), x.get('knob')) for x in rec['traps']] or 'none'})")
            continue
        matched.append(t['id'])
        check(t['rc'] != 0, 'traps rc != 0', f"trap {et['id']} shape {shape} rc {t['rc']}", 'the trap PASSED (rc 0): a FINDING about the commit')
        check(et['outputContains'] in t.get('stderrTail', '') + t.get('stdoutTail', ''), 'traps output contains fragment', f"trap {et['id']} has '{et['outputContains']}'", 'fragment not in the output tail')
    for t in rec['traps']:
        if t['id'] not in matched:
            info('traps other', f"the record also ran {t['id']}: rc {t['rc']}, failsAsExpected {t.get('failsAsExpected')}")


def score_tests(rec, exp, work):
    es = exp['steps'][0]
    tests = [s for s in work if norm(s['cmd']).startswith('pytest')]
    check(any(ds_find([s], es) for s in tests), 'tests step: a fixture pytest command', 'present', f"no route step matches {es['cmdAnyOf']}")
    passed = failed = 0
    for s in tests:
        if not ds_find([s], es):
            info('extra test step', f"{s['id']}: '{norm(s['cmd'])}' (not a fixture command; its passed count is summed, its checks are scored)")
        check(any(c['type'] == 'tests_passed' for c in s.get('checks', [])), 'tests_passed check declared', f"{s['id']} declares tests_passed", 'no tests_passed check')
        rs, _ = ds_exec(rec, s)
        if rs is None:
            continue
        limit = s.get('timeoutSec', es['timeoutSec'])
        check(rs['sec'] <= limit, 'timing fails only above the step timeout', f"{s['id']} took {rs['sec']} s (timeout {limit} s)", f"{rs['sec']} s > {limit} s")
        txt = ' '.join([c.get('summary', '') for c in rs['checks']] + [rs['stdoutTail']])
        m = re.findall(r'(\d+) passed', txt)
        passed += int(m[0]) if m else 0
        m = re.findall(r'(\d+) failed', txt)
        failed += int(m[-1]) if m else 0
    check(passed >= es['expect']['passedMin'], f"tests passed >= {es['expect']['passedMin']} (summed over {len(tests)} test step(s))", f'{passed} passed', f"{passed} < {es['expect']['passedMin']}")
    if failed:
        info('tests FINDING', f'{failed} failed (README: a finding about the sandbox, not a fixture failure); the record must list them')
    else:
        line('PASS', 'tests failed == 0', 'no "N failed" in the check summaries or stdout tails')
    skip('traps', 'no trap of the fixture applies to the test route')
    skip('files', 'expected-files.json (fixtures.db, /-/versions.json) belongs to the serve route')


# ---- catalogue (expected-catalogue.json) -----------------------------------------------------------------------------------
EFFORT = 'Quick — just Python'
NOT_PLAIN = re.compile(r"`|(^|\s)--\w|[\w-]+\.(py|rst|md|json|toml|db|yml|yaml|txt|js)\b|(^|\s)/\S|:\d+\b|\b(pip|pytest|python3?|npm|uv)\s+[-\w]")


def cnorm(c):
    return re.sub(r'^datasette serve ', 'datasette ', cmdnorm(c).replace("'", '').replace('"', ''))


def cat_has(route, want):
    """a stepsSketch command contains the wanted one, or (>= 2 key words: tokens with no / or .) carries its key words in order"""
    w = cnorm(want)
    keys = [t for t in w.split(' ') if '/' not in t and '.' not in t]
    for s in route['stepsSketch']:
        c = cnorm(s['cmd'])
        if w in c:
            return True
        it = iter(c.split(' '))
        if len(keys) >= 2 and all(k in it for k in keys):
            return True
    return False


def score_catalogue(path, fx):
    exp = load(fx / 'expected-catalogue.json')
    doc = load(path)
    doc = doc.get('catalogueDoc', doc)
    routes = doc['routes']
    if 'commit' in doc:
        check(doc['commit'] == exp['commit'], 'catalogue.commit', f"commit {doc['commit'][:12]} is the fixture's {exp['commit'][:12]}", 'a different commit; the fixture facts (line numbers) may not apply')
    low = doc['summary'].lower()
    for w in exp['summaryMustMention']:
        check(w.lower() in low, 'summary mentions', f"summary mentions '{w}'", 'not mentioned')
    for w in exp['summaryShouldMention']:
        info('summary should mention', f"'{w}' {'present' if w.lower() in low else 'absent'}")
    matched = {}
    for pr in exp['practicalRoutes']:
        exps = set(pr.get('expectedSources', [])) | set(pr.get('expectedSourcesAnyOf', []))
        cands = []
        for i, r in enumerate(routes):
            ok = all(cat_has(r, c) for c in pr.get('stepsSketchMustInclude', [])) and (not pr.get('stepsSketchMustIncludeAnyOf') or any(cat_has(r, c) for c in pr['stepsSketchMustIncludeAnyOf']))
            overlap = exps & {s['source'] for s in r['stepsSketch']}
            if overlap or (ok and r['practical']):
                cands.append((-len(overlap), r['resultKind'] != pr['resultKind'], i, r, overlap))
        cands.sort(key=lambda x: x[:3])
        r = cands[0][3] if cands else None
        check(r is not None, f"route {pr['key']} ({pr['what']}) found by source overlap or sketch commands", r and r['routeId'], f"no route's stepsSketch overlaps {sorted(exps)} or has the commands")
        if r is None:
            continue
        matched[pr['key']] = r
        info(f"route {pr['key']} match", f"{r['routeId']} by " + (f'source overlap {sorted(cands[0][4])}' if cands[0][4] else f'sketch commands only (no stepsSketch source equals the fixture citation {sorted(exps)}: line numbers drift)'))
        check(r['practical'] is True and r['resultKind'] == pr['resultKind'], f"route {pr['key']} practical, resultKind {pr['resultKind']}", f"{r['routeId']} practical, {r['resultKind']}", f"practical {r['practical']}, resultKind {r['resultKind']}")
    recs = [r for r in routes if r.get('recommended')]
    check(len(recs) == 1, 'recommended: exactly one', f"one recommended ({recs[0]['routeId']})" if recs else '', f'{len(recs)} recommended routes')
    if len(recs) == 1:
        which = [k for k in 'AB' if recs[0] is matched.get(k)]
        check(bool(which), 'recommended is route A or B', f"{recs[0]['routeId']} is route {which[0] if which else ''}", f"{recs[0]['routeId']} is not route A or B (matched {{{', '.join(k + ': ' + v['routeId'] for k, v in matched.items())}}})")
    pract = [r for r in routes if r['practical']]
    bad = [f"{r['routeId']} ({r['effort']})" for r in pract if r['effort'] != EFFORT]
    check(not bad, f"every practical route has effort '{EFFORT}'", f'{len(pract)} practical routes', 'effort differs: ' + '; '.join(bad))
    bad = [f"{r['routeId']}.{x}" for r in routes for x in ('title', 'description') if NOT_PLAIN.search(r[x])]
    check(not bad, 'titles and descriptions contain no command, path or file:line', f'{len(routes)} routes', 'offenders: ' + '; '.join(bad))
    bad = [f"{r['routeId']} ({len(r['title'])})" for r in routes if len(r['title']) > 70]
    check(not bad, 'titles at most 70 chars', f"longest title {max(len(r['title']) for r in routes)}", '; '.join(bad))
    used = set()
    imp = [r for r in routes if not r['practical']]
    text = lambda r: ' '.join([r.get('reason', ''), r['title'], r['description']] + [s['cmd'] for s in r['stepsSketch']]).lower()
    for ir in exp['impracticalRoutes']:
        words = ir.get('reasonMustMention', [])
        r = next((r for r in imp if id(r) not in used and set(ir['sources']) & {s['source'] for s in r['stepsSketch']}), None)
        how = 'source overlap'
        if r is None and words:
            r = next((r for r in imp if id(r) not in used and any(w.lower() in text(r) for w in words)), None)
            how = f'a mention of {words}, no source overlap (a different command)'
        if r is None:
            if ir.get('optional'):
                skip(f"impractical {ir['what']}", 'optional, not listed')
            else:
                check(False, f"impractical {ir['what']} listed", ir['what'], f"no impractical route cites {ir['sources']} or mentions {words}")
            continue
        used.add(id(r))
        info(f"impractical {ir['what']}", f"{r['routeId']} by {how}")
        if words:
            check(any(w.lower() in r.get('reason', '').lower() for w in words), f"impractical {ir['what']}: reason mentions one of {words}", f"{r['routeId']}: {r['reason']}", f"reason '{r.get('reason')}' mentions none")
        else:
            check(bool(r.get('reason')), f"impractical {ir['what']}: has a reason", r.get('reason', ''), 'no reason')
    skip('chatWording', 'about the rendered choice message, not the catalogue document')
    info('routes not in the fixture', ', '.join(r['routeId'] for r in routes if r not in matched.values() and id(r) not in used) or 'none')


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('record', nargs='?', help='record.json (not needed with --catalogue)')
    ap.add_argument('--route', choices=('serve', 'tests'), help='datasette fixture: score the record against expected-route-<route>.json')
    ap.add_argument('--catalogue', help='datasette fixture: score a catalogue document (or the API reply holding catalogueDoc) against expected-catalogue.json')
    ap.add_argument('--fixture', default='fixtures/nanogpt-3adf61e')
    ap.add_argument('--logs', help="the artifact zip's logs directory")
    ap.add_argument('--relax', action='store_true', help="match steps by command and allow extra flags (discovery chooses ids; see relax_ids); every relaxation is printed as INFO")
    a = ap.parse_args(argv)
    global RELAX, DS
    RELAX = a.relax
    sys.stdout.reconfigure(encoding='utf-8')
    fx = Path(a.fixture)
    if not fx.is_dir() and (HERE / fx).is_dir():
        fx = HERE / fx
    if a.route or a.catalogue:
        DS = True
        print(('record ' + a.record if a.route else 'catalogue ' + a.catalogue) + f'\nfixture {fx.name}' + (f' route {a.route}' if a.route else '') + '\n')
        if a.route:
            score_ds_route(load(a.record), fx, a.route, a.logs)
        else:
            score_catalogue(a.catalogue, fx)
        n = {v: LINES.count(v) for v in ('PASS', 'FAIL', 'SKIPPED')}
        print(f"\nSUMMARY {n['PASS']} PASS, {n['FAIL']} FAIL, {n['SKIPPED']} SKIPPED (not scored)")
        return 1 if n['FAIL'] else 0
    rec = load(a.record)
    exp = {n: load(fx / f'expected-{n}.json') for n in ('route', 'fixes', 'traps', 'files')}
    print(f"record {a.record}\nfixture {fx.name}\n")
    if a.relax:
        relax_ids(rec, exp['route'])
    score_route(rec, exp['route'])
    score_fixes(rec, exp['fixes'])
    score_traps(rec, exp['traps'])
    score_files(rec, exp['files'], a.logs)
    n = {v: LINES.count(v) for v in ('PASS', 'FAIL', 'SKIPPED')}
    print(f"\nSUMMARY {n['PASS']} PASS, {n['FAIL']} FAIL, {n['SKIPPED']} SKIPPED (not scored)" + ('' if a.logs else '; pass --logs <dir> to score the stdout facts'))
    return 1 if n['FAIL'] else 0


if __name__ == '__main__':
    sys.exit(main())
