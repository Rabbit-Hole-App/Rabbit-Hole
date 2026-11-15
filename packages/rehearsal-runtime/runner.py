"""Runner (spec section 6): clone at the commit, record the environment, run install and each route step through the provider, evaluate checks,
hand a failed step to the repair agent inside fixed bounds, then verify the knobs and run the traps. Generic: nothing here knows nanoGPT."""
import json
import re
import shlex
import time
from dataclasses import dataclass, field

import limits
from agent import GiveUp, RepairAgent
from limits import Budget

REPO = '/work/repo'
_PIP = re.compile(r'^pip install [A-Za-z0-9_.\[\],<>=!~-]+( [A-Za-z0-9_.\[\],<>=!~-]+)*$')
_FLAGS = re.compile(r'^-{1,2}[A-Za-z0-9_-]+(=\S*)?( -{1,2}[A-Za-z0-9_-]+(=\S*)?)*$')
_ENV = re.compile(r'^[A-Z_][A-Z0-9_]*=[\w./:,-]*$')
_DOMAIN = re.compile(r'^(\*\.)?([a-z0-9-]+\.)+[a-z]{2,}$')
_NOISE = re.compile(r'(^|/)(__pycache__/|[^/]*\.pyc$)')


class JobFailed(Exception):
    def __init__(self, code: str, detail: str):
        super().__init__(code + ': ' + detail)
        self.code, self.detail = code, detail


class RestartSandbox(Exception):
    """An allow_domain fix: the orchestrator re-creates the sandbox with `domain` added and the route restarts from the clone."""
    def __init__(self, domain: str):
        super().__init__(domain)
        self.domain = domain


def tail(text: str, n: int) -> str:
    return '\n'.join(text.splitlines()[-n:])


# ---------------------------------------------------------------- checks (rules: schemas/route.json description)

def evaluate_checks(checks: list, rc: int, output: str, stat_fn) -> list:
    """[{type, passed, ...}]; `output` is the step's stdout+stderr; patterns use re.MULTILINE; files_exist paths are repo-relative."""
    res = []
    for c in checks:
        t, r = c['type'], {'type': c['type'], 'passed': False}
        try:
            if t == 'exit_zero':
                r['passed'] = rc == 0
            elif t == 'files_exist':
                have = stat_fn(c['paths'])
                missing = [p for p in c['paths'] if p not in have]
                r.update(passed=not missing, **({'missing': missing} if missing else {}))
            elif t == 'stdout_matches':
                r['passed'] = re.search(c['pattern'], output, re.M) is not None
            elif t in ('metric_decreased', 'metric_below'):
                vals = [float(m.group(1)) for m in re.finditer(c['pattern'], output, re.M)]
                if vals:
                    r['last'] = vals[-1]
                    if t == 'metric_decreased':
                        r['first'] = vals[0]
                        r['passed'] = vals[-1] < vals[0]
                    else:
                        r['value'] = c['value']
                        r['passed'] = vals[-1] < c['value']
        except (re.error, ValueError, IndexError) as e:
            r['error'] = f'{type(e).__name__}: {e}'
        res.append(r)
    return res


_WARNING = re.compile(r'(?i)\b(warning|deprecat\w*)\b\s*[:\]]|\b\w+Warning\b')  # a real warning line, not generated text that happens to contain "warn"


def warnings_in(output: str) -> list:
    seen = []
    for line in output.splitlines():
        s = line.strip()[:300]
        if s and _WARNING.search(s) and s not in seen:
            seen.append(s)
    return seen[:limits.MAX_WARNINGS_PER_STEP]


# ---------------------------------------------------------------- knobs and traps (knob-type rule)

KNOB_VERIFY_MAX_STEP_SEC = 60  # knobs and traps run only for steps whose measured time is at most this (a slow step's knobs are listed in route.knobs, not run)


def knob_value(k: dict) -> str:
    """The value a knob is verified with. It must differ from the knob's default: a run that sets a knob to its own default does not show the knob reached the program (run 3: discovery gave --temperature a safeValue of 0.8, the default)."""
    quotes = "'" + '"'
    default = str(k.get('default', '')).strip().strip(quotes)
    chosen = str(k.get('safeValue') or '').strip()
    isnum = lambda v: v.replace('.', '', 1).lstrip('-').isdigit()
    same = lambda a, b: a == b or (isnum(a) and isnum(b) and float(a) == float(b))
    if chosen and not same(chosen.strip(quotes), default):
        return chosen
    if k['type'] == 'float':
        try: return f'{float(default) * 0.5:g}' if default and float(default) != 0 else '0.5'
        except ValueError: return '0.5'
    if k['type'] == 'int':
        return '2' if default == '1' else '1'
    if k['type'] == 'string':
        return 'hello' if default != 'hello' else 'world'
    return chosen


def set_flag(cmd: str, flag: str, value: str) -> str:
    """Set `--flag=value` by REPLACING the flag's existing occurrence in cmd (later duplicates are dropped); append only when it is absent."""
    tok = shlex.quote(f'{flag}={value}')
    seen = []

    def sub(m):
        seen.append(1)
        return tok if len(seen) == 1 else ''
    out = re.sub(r'(?<!\S)' + re.escape(flag) + r'(?:=\S*)?(?=\s|$)', sub, cmd)
    if not seen:
        return cmd + ' ' + tok
    return re.sub(r' {2,}', ' ', out).strip() if len(seen) > 1 else out


def _extra_ints(knobs: list, skip: str = '') -> list:
    """Safe small values for the route's int knobs (1, or 5 for token/length/size flags), so a trap run stays cheap."""
    return [(k['flag'], '5' if re.search(r'token|len|size', k['flag']) else '1') for k in knobs if k['type'] == 'int' and k['flag'] != skip]


def trap_plan(route: dict, only: set = None) -> list:
    """[(id, cmd)] for steps in `only` (all when None): per float knob an int value; per string knob a value containing '='; one misspelled flag. Ids are unique."""
    out = []
    for sid in dict.fromkeys(k['step'] for k in route['knobs']):
        if only is not None and sid not in only:
            continue
        step = next(s for s in route['steps'] if s['id'] == sid)
        ks = [k for k in route['knobs'] if k['step'] == sid]

        def mk(flag, value, skip):
            cmd = set_flag(step['cmd'], flag, value)
            for f, v in _extra_ints(ks, skip):
                cmd = set_flag(cmd, f, v)
            return cmd
        found = []
        for k in (k for k in ks if k['type'] == 'float'):
            found.append((k['flag'].lstrip('-') + '_int_not_float', mk(k['flag'], '1', k['flag'])))
        for k in (k for k in ks if k['type'] == 'string'):
            found.append((k['flag'].lstrip('-') + '_with_equals_sign', mk(k['flag'], 'A=B', k['flag'])))
        k = next((k for k in ks if k['type'] == 'float'), ks[0])
        name = k['flag'].lstrip('-')
        i = min(4, len(name) - 1)
        found.append(('unknown_key', mk('--' + name[:i] + name[i + 1:], knob_value(k), k['flag'])))
        for tid, cmd in found:
            out.append((tid if tid not in {t for t, _ in out} else f'{tid}_{sid}', cmd))
    return out


# ---------------------------------------------------------------- the runner

@dataclass
class Runner:
    provider: object
    route: dict
    budget: Budget
    agent: RepairAgent
    status: object                 # callable(state, step=None, attempt=None, fixes=None)
    deadline: float                # time.time() value after which the job is out of wall time
    attempts: list = field(default_factory=list)
    fixes: list = field(default_factory=list)
    steps: list = field(default_factory=list)
    logs: dict = field(default_factory=dict)      # 'logs/<name>' -> bytes
    gave_up: dict | None = None
    _n: dict = field(default_factory=dict)
    _tried: set = field(default_factory=set)
    _note: str = ''
    domains: list = field(default_factory=list)   # the sandbox's current outbound allowlist (shown to the agent)

    # -- primitives
    def sh(self, cmd: str, timeout: int):
        left = self.deadline - time.time()
        if left < 10:
            raise JobFailed('wall_clock', f'the {limits.JOB_WALL_SEC // 60}-minute job limit was reached')
        return self.provider.exec(cmd, int(max(1, min(timeout, left))), cwd=REPO)

    def _log(self, name: str, res) -> str:
        n = self._n[name] = self._n.get(name, 0) + 1
        body = res.stdout + (('\n--- stderr ---\n' + res.stderr) if res.stderr else '')
        data = body.encode('utf-8', 'replace')
        if len(data) > limits.MAX_ARTIFACT_LOG_BYTES:  # ponytail: one attempt's log is capped (limits.py), the tail is what matters
            data = b'[log truncated to its last bytes]\n' + data[-limits.MAX_ARTIFACT_LOG_BYTES:]
        path = f'logs/{name}-{n}.log'
        self.logs[path] = data
        return path

    def _attempt(self, name: str, cmd: str, res, path: str):
        n = self._n[name]
        self.attempts.append({'step': name, 'n': n, 'cmd': cmd, 'rc': res.rc, 'sec': res.sec, 'stderrTail': tail(res.stderr or res.stdout, limits.TRAP_STDERR_TAIL_LINES), 'log': path})
        return n

    def file_state(self) -> dict:
        """{path: (bytes, sha256)} for every file in the clone that is untracked (ignored ones included) or modified, minus bytecode."""
        r = self.provider.exec(
            'git ls-files -m -o | while IFS= read -r p; do [ -f "$p" ] && printf \'%s %s %s\\n\' "$(stat -c %s "$p")" "$(sha256sum "$p" | cut -d" " -f1)" "$p"; done',
            300, cwd=REPO)
        st = {}
        for line in r.stdout.splitlines():
            parts = line.split(' ', 2)
            if len(parts) == 3 and not _NOISE.search(parts[2]):
                st[parts[2]] = (int(parts[0]), parts[1])
        return st

    # -- one step, with repair
    def run_step(self, step: dict, record: bool = True) -> bool:
        name = step['id']
        while True:
            before = self.file_state() if record else {}
            self.status('running', step=name, attempt=self._n.get(name, 0) + 1, fixes=len(self.fixes))
            res = self.sh(step['cmd'], limits.step_timeout(step['timeoutSec']))
            path = self._log(name, res)
            n = self._attempt(name, step['cmd'], res, path)
            output = res.stdout + '\n' + res.stderr
            checks = evaluate_checks(step['checks'], res.rc, output, self.provider.stat)
            if all(c['passed'] for c in checks):
                if record:
                    after = self.file_state()
                    files = {p: {'bytes': v[0], 'sha256': v[1]} for p, v in after.items() if before.get(p) != v}
                    for c in step['checks']:  # files a check names are evidence even if an earlier step made them
                        if c['type'] == 'files_exist':
                            for p, fs in self.provider.stat(c['paths']).items():
                                files.setdefault(p, {'bytes': fs.bytes, 'sha256': fs.sha256})
                    self.steps.append({'id': name, 'cmd': step['cmd'], 'rc': res.rc, 'sec': res.sec, 'checks': checks, 'files': files, 'log': path, 'warnings': warnings_in(output)})
                return True
            if not self._repair(step, res, checks):
                return False

    def _repair(self, step, res, checks) -> bool:
        name = step['id']
        if not self.budget.can_fix(name):
            self.gave_up = {'step': name, 'reason': 'fix budget used (at most 6 fixes per job, 3 per step)'}
            return False
        self.status('repairing', step=name, attempt=self._n.get(name, 1), fixes=len(self.fixes))
        self.budget.start_fix(name)
        pip = self.provider.exec('pip list --format=freeze', 120, cwd=REPO).stdout
        calls_before = self.agent.caller.budget.model_calls
        ctx = {'step': {k: step[k] for k in ('id', 'cmd', 'source')}, 'rc': res.rc, 'stdoutTail': tail(res.stdout, limits.MODEL_CONTEXT_TAIL_LINES),
               'stderrTail': tail(res.stderr, limits.MODEL_CONTEXT_TAIL_LINES), 'failedChecks': [c for c in checks if not c['passed']],
               'pipListAfterLastInstall': pip, 'routeSoFar': self.route, 'fixesSoFar': self.fixes, 'lastFixNote': self._note, 'sandboxAllowedDomains': self.domains}
        out = self.agent.propose(ctx, self.provider)
        used = self.agent.caller.budget.model_calls - calls_before
        if isinstance(out, GiveUp):
            self.gave_up = {'step': name, 'reason': out.reason}
            return False
        key = (out.kind, ' '.join(out.change.split()))
        if key in self._tried:
            self.gave_up = {'step': name, 'reason': f'the same fix was proposed twice ({out.kind}: {out.change})'}
            return False
        self._tried.add(key)
        self._note = ''
        if out.kind == 'allow_domain':
            dom = out.change.strip().lower()
            if not _DOMAIN.match(dom) or dom in self.domains:
                self._note = f'allow_domain {out.change!r} was not applied: must be a new hostname such as data.example.org'
                return True
            if sum(f['kind'] == 'allow_domain' for f in self.fixes) >= limits.MAX_ALLOW_DOMAIN_FIXES:
                self.gave_up = {'step': name, 'reason': f'at most {limits.MAX_ALLOW_DOMAIN_FIXES} allow_domain fixes per job'}
                return False
            self.fixes.append({'n': len(self.fixes) + 1, 'step': name, 'kind': 'allow_domain', 'change': dom, 'evidence': out.evidence, 'modelCalls': max(used, 0)})
            self.domains.append(dom)
            raise RestartSandbox(dom)
        err = self._apply(step, out)
        self._guard_repo_files()
        if err:
            self._note = f'last proposed fix ({out.kind}: {out.change}) was not applied: {err}'
            return True  # the step reruns and fails again; the agent sees the note and the budget bounds the loop
        self.fixes.append({'n': len(self.fixes) + 1, 'step': name, 'kind': out.kind, 'change': out.change, 'evidence': out.evidence, 'modelCalls': max(used, 0)})
        return True

    def _apply(self, step: dict, fix) -> str:
        """Apply a fix to the command or environment; returns an error text, or '' when applied. Repository files are never edited."""
        kind, change = fix.kind, fix.change.strip()
        if kind == 'install_package':
            if not _PIP.match(change):
                return 'must be `pip install <packages>` with no flags'
            name = f'fix-{len(self.fixes) + 1}'
            res = self.sh(change, 900)
            path = self._log(name, res)
            self._attempt(name, change, res, path)
            if res.rc != 0:
                return f'pip failed (rc {res.rc}): {tail(res.stderr, 3)}'
            self.route['install'].append({'cmd': change, 'source': f'repair fix {len(self.fixes) + 1}'})
        elif kind == 'add_flag':
            if not _FLAGS.match(change):
                return 'must be one or more --flag[=value] tokens'
            step['cmd'] += ' ' + change
        elif kind == 'set_env':
            if not _ENV.match(change):
                return 'must be NAME=value'
            step['cmd'] = change + ' ' + step['cmd']
        elif kind == 'edit_command':
            if not change or '\n' in change or len(change) > 2000:
                return 'must be one non-empty line'
            step['cmd'] = change
        elif kind == 'add_step_before':
            if not change or '\n' in change or len(change) > 2000:
                return 'must be one non-empty line'
            pre = {'id': step['id'] + '_pre', 'cmd': change, 'source': f'repair fix {len(self.fixes) + 1}', 'timeoutSec': 600, 'checks': [{'type': 'exit_zero'}]}
            if not self._run_pre(pre):
                return 'the added step failed'
            i = self.route['steps'].index(step)
            self.route['steps'].insert(i, pre)
        else:
            return 'unknown fix kind'
        return ''

    def _run_pre(self, pre: dict) -> bool:
        res = self.sh(pre['cmd'], 600)
        path = self._log(pre['id'], res)
        self._attempt(pre['id'], pre['cmd'], res, path)
        return res.rc == 0

    def _guard_repo_files(self):
        """The agent may only change commands and the environment: undo any edit to a tracked file."""
        self.provider.exec('git checkout -q -- . 2>/dev/null || true', 60, cwd=REPO)

    def reset_for_restart(self) -> None:
        """Fresh sandbox: step results are redone; attempts, fixes, logs and the (already edited) route are kept."""
        self.steps, self.gave_up, self._note = [], None, ''

    # -- the whole route
    def run_route(self) -> bool:
        for i, cmd in enumerate(list(item['cmd'] for item in self.route['install'])):
            name = 'install' if i == 0 else f'install{i + 1}'
            if not self.run_step({'id': name, 'cmd': cmd, 'source': 'route.install', 'timeoutSec': 900, 'checks': [{'type': 'exit_zero'}]}, record=False):
                return False
        for step in list(self.route['steps']):
            if not self.run_step(step):
                return False
        return True

    def cheap_steps(self) -> set:
        return {st['id'] for st in self.steps if st['sec'] <= KNOB_VERIFY_MAX_STEP_SEC}

    def _knob_run(self, cmd: str, strs: list, logname: str) -> dict:
        res = self.sh(cmd, 300)
        self._attempt_log_extra(logname, cmd, res)
        prompt = knob_value(strs[0]) if strs else None
        return {'cmd': cmd, 'rc': res.rc, 'sec': res.sec,
                'startsWithPrompt': bool(prompt) and res.rc == 0 and re.search('^' + re.escape(prompt), res.stdout, re.M) is not None,
                'separators': len(re.findall(r'^\s*[-=]{3,}\s*$', res.stdout, re.M))}

    def verify_knobs(self) -> list:
        """One combined command per cheap step: the step's FINAL cmd with every knob set (replaced, never appended) to its safe value, run once.
        If it fails, retry once with the string knobs only (numeric safe values can violate a cross-flag constraint); the retry is entry [0], the failed combined run follows it."""
        out = []
        cheap = self.cheap_steps()
        for sid in dict.fromkeys(k['step'] for k in self.route['knobs']):
            step = next(s for s in self.route['steps'] if s['id'] == sid)
            ks = [k for k in self.route['knobs'] if k['step'] == sid and k['type'] != 'bool']  # ponytail: bool knobs are not exercised
            if sid not in cheap or not ks:
                continue
            strs = [k for k in ks if k['type'] == 'string']

            def build(kk):
                cmd = step['cmd']
                for k in kk:
                    cmd = set_flag(cmd, k['flag'], knob_value(k))
                return cmd
            first = self._knob_run(build(ks), strs, 'knob-' + sid)
            if first['rc'] != 0 and len(strs) != len(ks):
                out += [self._knob_run(build(strs), strs, 'knob-' + sid + '-retry-strings-only'), first]
            else:
                out.append(first)
        return out

    def run_traps(self) -> list:
        out = []
        for tid, cmd in trap_plan(self.route, self.cheap_steps()):
            res = self.sh(cmd, 300)
            path = f'logs/trap-{tid}.log'
            self.logs[path] = (res.stdout + (('\n--- stderr ---\n' + res.stderr) if res.stderr else '')).encode('utf-8', 'replace')[-limits.MAX_ARTIFACT_LOG_BYTES:]
            out.append({'id': tid, 'cmd': cmd, 'rc': res.rc, 'sec': res.sec, 'stderrTail': tail(res.stderr or res.stdout, limits.TRAP_STDERR_TAIL_LINES), 'failsAsExpected': res.rc != 0, 'log': path})
        return out

    def _attempt_log_extra(self, name: str, cmd: str, res):
        self.logs[f'logs/{name}.log'] = (res.stdout + (('\n--- stderr ---\n' + res.stderr) if res.stderr else '')).encode('utf-8', 'replace')[-limits.MAX_ARTIFACT_LOG_BYTES:]


# ---------------------------------------------------------------- clone, environment, artifacts

def clone(provider, repo: str, commit: str) -> None:
    if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', repo) or not re.fullmatch(r'[a-f0-9]{40}', commit):
        raise JobFailed('bad_request', 'repo or commit is malformed')
    cmd = (f'rm -rf {REPO} && mkdir -p {REPO} && cd {REPO} && git init -q && git remote add origin https://github.com/{repo}.git'
           f' && git fetch -q --depth 1 origin {commit} && git checkout -q FETCH_HEAD && git rev-parse HEAD')
    r = provider.exec(cmd, 300, cwd='/work')
    if r.rc != 0:
        raise JobFailed('clone_failed', f'could not fetch {repo}@{commit[:10]}: ' + (tail(r.stderr, 2) or 'no output'))
    if r.stdout.strip().splitlines()[-1:] != [commit]:
        raise JobFailed('clone_failed', f'checked out {r.stdout.strip()[-40:]} instead of {commit}')


def environment(provider) -> dict:
    sh = lambda c: provider.exec(c, 120, cwd=REPO).stdout.strip()
    try:
        pk = {p['name']: p['version'] for p in json.loads(sh('pip list --format=json'))}
    except ValueError:
        pk = {}
    # the sandbox limit, not the host's /proc/meminfo: cgroup v2 memory.max or v1 limit_in_bytes when it is a plausible number, else what we requested
    raw = sh('cat /sys/fs/cgroup/memory.max 2>/dev/null || cat /sys/fs/cgroup/memory/memory.limit_in_bytes 2>/dev/null')
    gib = int(raw) / 2 ** 30 if raw.isdigit() and 0 < int(raw) <= 64 * 2 ** 30 else limits.SANDBOX_MEMORY_MIB / 1024
    return {'python': sh('python -V').replace('Python ', ''), 'cpu': int(sh('nproc') or 0) or 1, 'memGiB': round(gib, 2), 'packagesAfter': pk}


def collect_files(provider, steps: list) -> tuple:
    """({repo path: bytes} copied, [paths listed only]) for the files steps produced; total copied <= 50 MB, smallest first."""
    latest = {}
    for s in steps:
        latest.update(s['files'])
    copied, listed, total = {}, [], 0
    for path, meta in sorted(latest.items(), key=lambda kv: kv[1]['bytes']):
        if total + meta['bytes'] > limits.ARTIFACT_MAX_BYTES:
            listed.append(path)
            continue
        try:
            copied[path] = provider.fetch(path)
            total += meta['bytes']
        except FileNotFoundError:
            listed.append(path)
    return copied, listed
