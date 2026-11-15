"""Runner (spec section 6): clone at the commit, record the environment, run install and each route step through the provider, evaluate checks,
hand a failed step to the repair agent inside fixed bounds, then verify the knobs and run the traps. Generic: nothing here knows nanoGPT.
A `longRunning` step (a server) is started in the background, probed, kept up for the steps after it and killed at the end of the route, always.
When the repair loop gives up, the route stops but the job does not fail: the step is recorded as `failed` with its error and what was tried."""
import json
import re
import shlex
import time
from dataclasses import dataclass, field

import limits
from agent import GiveUp, RepairAgent
from limits import Budget
from providers.base import ExecResult
from redact import redact_text

REPO = '/work/repo'
_PIP = re.compile(r'^pip install [A-Za-z0-9_.\[\],<>=!~-]+( [A-Za-z0-9_.\[\],<>=!~-]+)*$')
_FLAGS = re.compile(r'^-{1,2}[A-Za-z0-9_-]+(=\S*)?( -{1,2}[A-Za-z0-9_-]+(=\S*)?)*$')
_ENV = re.compile(r'^[A-Z_][A-Z0-9_]*=[\w./:,-]*$')
_DOMAIN = re.compile(r'^(\*\.)?([a-z0-9-]+\.)+[a-z]{2,}$')
_NOISE = re.compile(r'(^|/)(__pycache__/|[^/]*\.pyc$)')
_TEST_SUMMARY = [r'\b\d+ passed\b', r'Tests:.*passed', r'^ok\b', r'test result: ok']  # pytest, jest, go test, cargo test (schemas/route.json: tests_passed)
_SAFE_PATH = re.compile(r'^/[A-Za-z0-9_./?=&%:,~+-]*$')
PORT_WAIT_SEC = 60


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


def head_tail(text: str, limit: int = 2000) -> dict:
    """{'stdoutHead': first lines, 'stdoutTail': last lines}, each at most `limit` chars (schemas/record.json); empty output gives {}. A single overlong line is cut."""
    lines = redact_text(text).splitlines()
    if not any(l.strip() for l in lines):
        return {}

    def take(seq):
        out, n = [], 0
        for l in seq:
            l = l[:limit]
            if n + len(l) + 1 > limit and out:
                break
            out.append(l)
            n += len(l) + 1
        return out
    return {'stdoutHead': '\n'.join(take(lines)), 'stdoutTail': '\n'.join(take(lines[::-1])[::-1])}


# ---------------------------------------------------------------- checks (rules: schemas/route.json description)

def evaluate_checks(checks: list, rc: int, output: str, stat_fn, probe=None) -> list:
    """[{type, passed, ...}]; `output` is the step's stdout+stderr; patterns use re.MULTILINE; files_exist paths are repo-relative.
    `probe(check) -> {passed, body?}` answers port_listens and http_200 (a longRunning step only); without one those checks fail with an error."""
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
            elif t == 'tests_passed':  # exit 0 and the runner's own summary line (or the route's pattern)
                m = next((x for x in (re.search(p, output, re.M) for p in ([c['pattern']] if c.get('pattern') else _TEST_SUMMARY)) if x), None)
                r['passed'] = rc == 0 and m is not None
                if m:
                    r['summary'] = m.group(0)[:120]
            elif t in ('port_listens', 'http_200'):
                if probe is None:
                    r['error'] = 'a probe needs a longRunning step'
                else:
                    r.update(probe(c))
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
    if k['type'] == 'int' and 'port' in k['flag'].lower() and default.isdigit():
        return str(int(default) + 1)  # a server on another free port
    if k['type'] == 'float':
        try: return f'{float(default) * 0.5:g}' if default and float(default) != 0 else '0.5'
        except ValueError: return '0.5'
    if k['type'] == 'int':
        return '2' if default == '1' else '1'
    if k['type'] == 'string':
        return 'hello' if default != 'hello' else 'world'
    return chosen


def set_flag(cmd: str, flag: str, value: str, spaced: bool = False) -> str:
    """Set `--flag=value` by REPLACING the flag's existing occurrence in cmd (later duplicates are dropped); append only when it is absent. `spaced`: a value-taking flag written `--flag value` (click, argparse) is replaced with its value token."""
    tok = shlex.quote(f'{flag}={value}')
    seen = []

    def sub(m):
        seen.append(1)
        return tok if len(seen) == 1 else ''
    value_form = r'(?:=\S*|\s+(?!-)(?:"[^"]*"|\'[^\']*\'|\S+))?' if spaced else r'(?:=\S*)?'
    out = re.sub(r'(?<!\S)' + re.escape(flag) + value_form + r'(?=\s|$)', sub, cmd)
    if not seen:
        return cmd + ' ' + tok
    return re.sub(r' {2,}', ' ', out).strip() if len(seen) > 1 else out


def is_port_knob(k: dict) -> bool:
    return k['type'] == 'int' and 'port' in k['flag'].lower()


def port_knob_value(k: dict, checks: list) -> str:
    """The value a server step's port knob is probed with: a port in 1024-65535 that is neither the knob's default nor a port the step's own checks probe,
    so a pass shows the knob moved the server (a safeValue equal to the port in use would prove nothing)."""
    d = str(k.get('default', '')).strip()
    used = {int(c['port']) for c in checks if c.get('port')} | ({int(d)} if d.isdigit() else set())
    v = knob_value(k)
    if v.isdigit() and 1024 <= int(v) <= 65535 and int(v) not in used:
        return v
    base = max(used) if used else 8000
    return str(base + 1 if base < 65535 else 8002)


def move_port_checks(checks: list, knob: dict, value: str) -> list:
    """A server step whose port knob is changed: the port checks move with it (the port in use is the knob's default when the checks probe it, else the first probed port)."""
    if is_port_knob(knob) and str(value).isdigit():
        ports = [int(c['port']) for c in checks if c.get('port')]
        d = str(knob.get('default', '')).strip()
        old = int(d) if d.isdigit() and int(d) in ports else (ports[0] if ports else None)
        if old is not None:
            return [{**c, 'port': int(value)} if c.get('port') == old else c for c in checks]
    return checks


def _extra_ints(knobs: list, skip: str = '') -> list:
    """Safe small values for the route's int knobs (1, or 5 for token/length/size flags), so a trap run stays cheap. A port is left alone."""
    return [(k['flag'], '5' if re.search(r'token|len|size', k['flag']) else '1') for k in knobs if k['type'] == 'int' and k['flag'] != skip and not is_port_knob(k)]


TRAP_MAX = 6  # traps per job (S3 cap). Per step at most 4: one wrong-type trap per numeric knob type (int, float), one string-with-'=' trap, one unknown flag
TRAP_LONG_TIMEOUT_SEC = 20  # a trap on a server step runs under `timeout`: a command that parses starts the server, which is a finding (rc 124), not a failure as expected


def _configurator_style(cmd: str) -> bool:
    """True when the step's flags are written `--key=value` and none `--key value`: a globals-configurator script (nanoGPT's configurator.py) type-checks every value against
    its default's type, so an int-looking value for a float knob is refused (schemas/cells.json). argparse and click accept `1` for a float, so they get a non-number."""
    return re.search(r'(?<!\S)--\w[\w-]*=', cmd) is not None and re.search(r'(?<!\S)--\w[\w-]*\s+(?!-)\S', cmd) is None


def _misspell(name: str) -> str:
    """A flag name that is not a prefix of the real one (argparse accepts unambiguous prefixes): one inner character dropped (temperature -> temprature, port -> pot)."""
    if len(name) < 3:
        return name + 'x'
    i = min(4, len(name) - 2)
    return name[:i] + name[i + 1:]


def trap_plan(route: dict, only: set = None) -> list:
    """[{id, step, cmd, kind, knob}] generated BY RULE from the knob types, never chosen by a model (S3), for steps in `only` (all when None). Per step:
    wrong_type: one per numeric type present, on its first knob (an int knob gets `abc`; a float knob gets an int-looking `1` when the step's flags are
    configurator-style, else `abc`); string_equals: the first string knob gets `A=B`; unknown_flag: a misspelled flag (the first float knob's, else the first knob's).
    bool knobs get no trap. At most TRAP_MAX in all."""
    out = []
    for sid in dict.fromkeys(k['step'] for k in route['knobs']):
        if only is not None and sid not in only:
            continue
        step = next(s for s in route['steps'] if s['id'] == sid)
        ks = [k for k in route['knobs'] if k['step'] == sid]
        conf = _configurator_style(step['cmd'])

        def mk(flag, value, skip):
            cmd = set_flag(step['cmd'], flag, value, True)
            for f, v in _extra_ints(ks, skip):
                cmd = set_flag(cmd, f, v, True)
            return cmd
        found = []
        for typ in ('int', 'float'):
            k = next((k for k in ks if k['type'] == typ), None)
            if k:
                name = k['flag'].lstrip('-')
                value, tid = ('1', name + '_int_not_float') if typ == 'float' and conf else ('abc', name + ('_not_an_integer' if typ == 'int' else '_not_a_number'))
                found.append({'id': tid, 'cmd': mk(k['flag'], value, k['flag']), 'kind': 'wrong_type', 'knob': k['flag']})
        k = next((k for k in ks if k['type'] == 'string'), None)
        if k:
            found.append({'id': k['flag'].lstrip('-') + '_with_equals_sign', 'cmd': mk(k['flag'], 'A=B', k['flag']), 'kind': 'string_equals', 'knob': k['flag']})
        k = next((k for k in ks if k['type'] == 'float'), next((k for k in ks if k['type'] != 'bool'), ks[0]))
        found.append({'id': 'unknown_key', 'cmd': mk('--' + _misspell(k['flag'].lstrip('-')), knob_value(k), k['flag']), 'kind': 'unknown_flag', 'knob': k['flag']})
        for t in found:
            out.append({**t, 'step': sid, 'id': t['id'] if t['id'] not in {o['id'] for o in out} else f"{t['id']}_{sid}"})
    return out[:TRAP_MAX]


# ---------------------------------------------------------------- one plain line for a failed step

_ERR_LINE = re.compile(r"(?i)(error|exception|failed|failure|fatal|no such|not found|cannot|can't|refused|denied|invalid|unrecognized|no module|unable)")
_SCRUB = [(re.compile(r'\b(?:sb|im|ap|vo|fu)-[A-Za-z0-9]{8,}\b'), ''), (re.compile(r'\$\s?\d[\d,.]*'), ''), (re.compile(r'(?i)\bmodal\b'), 'the machine')]
_CHECK_WORDS = {'exit_zero': 'the command did not finish cleanly', 'stdout_matches': 'the output did not show the expected line', 'metric_decreased': 'the printed metric did not improve',
                'metric_below': 'the printed metric did not get low enough', 'tests_passed': 'the test run did not end with all tests passing'}


def plain_error(step: dict, rc: int, output: str, checks: list, limit: int) -> str:
    """One plain line (schemas/record.json step.error): the last error-looking output line, else what the failed check says. No stack trace, sandbox id, dollar figure or provider term."""
    ran = re.search(r'(\d+) failed\b', output)
    if any(c['type'] == 'tests_passed' for c in step.get('checks', [])) and ran:
        passed = re.search(r'(\d+) passed\b', output)
        return f"{ran.group(1)} tests failed" + (f' and {passed.group(1)} passed' if passed else '')
    if rc == 124:
        return f'it did not finish within its {limit}-second limit'
    lines = [l.strip() for l in redact_text(output).splitlines() if l.strip() and not l.strip().startswith(('Traceback', 'File "', '^', 'During handling', '...'))]
    line = next((l for l in reversed(lines) if _ERR_LINE.search(l)), '')
    if not line:
        bad = next((c for c in checks if not c.get('passed')), None)
        if bad:
            t = bad['type']
            line = (f"nothing was listening on port {next((x.get('port') for x in step['checks'] if x['type'] == 'port_listens'), '?')}" if t == 'port_listens'
                    else 'the server did not answer with a success' if t == 'http_200'
                    else 'expected file(s) not produced: ' + ', '.join(bad.get('missing', [])[:3]) if t == 'files_exist' and bad.get('missing')
                    else _CHECK_WORDS.get(t, 'a check did not pass'))
        else:
            line = lines[-1] if lines else f'the command exited with code {rc}'
    for rx, sub in _SCRUB:
        line = rx.sub(sub, line)
    return re.sub(r'\s+', ' ', line).strip()[:280]


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
    _bg: list = field(default_factory=list)       # background (longRunning) processes still up: {'step', 'pid'}
    probe_body_limit: int = 200                   # bytes of an http_200 body kept; the Run card raises it to 64 KB and reads `probes`
    probes: list = field(default_factory=list)    # [{path, status, contentType?, body?}] of the http_200 probes that passed

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
            try:
                res, checks, started = self._exec_step(step)
            except JobFailed as e:
                if e.code != 'wall_clock':
                    raise
                self.gave_up = {'step': name, 'reason': f'the {limits.JOB_WALL_SEC // 60}-minute job limit was reached'}
                self._mark_failed(step, ExecResult(124, '', '', 0.0), [], '', 'the time allowed for one rehearsal ran out')
                return False
            path = self._log(name, res)
            n = self._attempt(name, step['cmd'], res, path)
            output = res.stdout + '\n' + res.stderr
            if all(c['passed'] for c in checks):
                if record:
                    after = self.file_state()
                    files = {p: {'bytes': v[0], 'sha256': v[1]} for p, v in after.items() if before.get(p) != v}
                    for c in step['checks']:  # files a check names are evidence even if an earlier step made them
                        if c['type'] == 'files_exist':
                            for p, fs in self.provider.stat(c['paths']).items():
                                files.setdefault(p, {'bytes': fs.bytes, 'sha256': fs.sha256})
                    self.steps.append({'id': name, 'cmd': step['cmd'], 'rc': res.rc, 'sec': res.sec, **({'startedSec': started} if started is not None else {}), 'checks': checks, 'files': files, 'log': path,
                                       'warnings': warnings_in(output), **head_tail(res.stdout)})
                return True
            if self._suite_ran_with_failures(step, output):  # the tests ran and some failed: a finding about the repository, not something a repair fixes
                self.gave_up = {'step': name, 'reason': plain_error(step, res.rc, output, checks, step['timeoutSec'])}
                self._mark_failed(step, res, checks, path, output=output)
                return False
            if not self._repair(step, res, checks):
                self._mark_failed(step, res, checks, path, output=output)
                return False

    @staticmethod
    def _suite_ran_with_failures(step: dict, output: str) -> bool:
        return any(c['type'] == 'tests_passed' for c in step['checks']) and re.search(r'\b\d+ failed\b', output) is not None and re.search(r'\b\d+ passed\b', output) is not None

    def _mark_failed(self, step: dict, res, checks: list, path: str, error: str = '', output: str = '') -> None:
        """First-failure rule: the step the repair loop gave up on is recorded, marked `failed`, with its last attempt, one plain error line and what was tried."""
        name = step['id']
        tried = [f"{f['kind'].replace('_', ' ')}: {f['change']}"[:200] for f in self.fixes if f['step'] == name]
        self.steps.append({'id': name, 'cmd': step['cmd'], 'rc': res.rc, 'sec': res.sec, 'checks': checks, 'files': {}, 'log': path, 'warnings': warnings_in(output),
                           **head_tail(res.stdout), 'failed': True, 'error': error or plain_error(step, res.rc, output, checks, limits.step_timeout(step['timeoutSec'])), 'tried': tried})

    def _exec_step(self, step: dict) -> tuple:
        """-> (result, check results, startedSec or None). A longRunning step is started in the background and probed; any other step runs to its end."""
        if step.get('longRunning'):
            return self._start_long(step)
        res = self.sh(step['cmd'], limits.step_timeout(step['timeoutSec']))
        return res, evaluate_checks(step['checks'], res.rc, res.stdout + '\n' + res.stderr, self.provider.stat), None

    # -- background steps (servers)
    def _probe(self, check: dict, pid: str, deadline: float) -> dict:
        """port_listens / http_200 against 127.0.0.1 inside the sandbox; the wait ends early when the process died (nothing will ever answer)."""
        left = max(1, int(deadline - time.time()))
        port = int(check['port'])
        if check['type'] == 'port_listens':
            wait = min(PORT_WAIT_SEC, left)
            inner = f'until (echo > /dev/tcp/127.0.0.1/{port}) 2>/dev/null; do kill -0 {pid} 2>/dev/null || exit 1; sleep 1; done'
            return {'passed': self.sh(f'timeout {wait} bash -c {shlex.quote(inner)}', wait + 15).rc == 0}
        if not _SAFE_PATH.match(check['path']):
            return {'passed': False, 'error': 'the path is not a plain URL path'}
        url = shlex.quote(f"http://127.0.0.1:{port}{check['path']}")
        inner = f'until curl -fsS --max-time 5 -D /tmp/rehearsal-http-head -o /tmp/rehearsal-http-body {url}; do kill -0 {pid} 2>/dev/null || exit 1; sleep 1; done'
        limit = self.probe_body_limit
        res = self.sh(f'rm -f /tmp/rehearsal-http-body /tmp/rehearsal-http-head; timeout {left} bash -c {shlex.quote(inner)}; rc=$?; head -c {limit} /tmp/rehearsal-http-body 2>/dev/null; exit $rc', left + 15)
        body = redact_text(res.stdout)[:limit] if res.rc == 0 and res.stdout else ''
        if res.rc == 0:
            ct = self.sh("grep -i '^content-type:' /tmp/rehearsal-http-head | tail -1 | cut -d: -f2- | tr -d '\\r' | sed 's/^ *//'", 15).stdout.strip() if limit > 200 else ''
            self.probes.append({'path': check['path'], 'status': 200, **({'contentType': ct[:120]} if ct else {}), **({'body': body} if body else {})})
        return {'passed': res.rc == 0, **({'body': body} if body else {})}

    def _start_long(self, step: dict, cmd: str = None, checks: list = None, keep: bool = True, name: str = None) -> tuple:
        """Start `cmd` (default the step's) with nohup in its own session, capture its pid, probe the checks, read its log. Left running (and remembered for _stop_bg) only when every check passed and `keep`."""
        name, cmd, checks = name or step['id'], cmd or step['cmd'], checks or step['checks']
        self._stop_bg(name)  # a rerun after a repair starts from nothing
        timeout = limits.step_timeout(step['timeoutSec'])
        t0 = time.time()
        log = f'/tmp/rehearsal-{name}.log'
        # the braces keep `&` on the server alone (the provider prefixes `cd <repo> &&`): $! is then the pid of the server's own session, so `kill -- -<pid>` takes its whole group
        launch = self.sh('{ setsid nohup bash -c ' + shlex.quote(cmd) + f' > {log} 2>&1 < /dev/null & echo $!; }}', 60)
        pid = (launch.stdout.strip().splitlines() or [''])[-1]
        if not pid.isdigit():
            return ExecResult(launch.rc or 1, '', launch.stderr or 'could not start the process', round(time.time() - t0, 2)), [{'type': c['type'], 'passed': False} for c in checks], None
        self._bg.append({'step': name, 'pid': pid})  # known at once: a caller's `finally: _stop_bg()` then kills it even when a probe below raises
        started = []

        def probe(c):
            out = self._probe(c, pid, t0 + timeout)
            if out['passed'] and not started:
                started.append(round(time.time() - t0, 2))
            return out
        alive = lambda: self.sh(f'kill -0 {pid}', 15).rc == 0
        results = []
        for c in checks:  # probes first (they wait for the server), the rest read the log
            results.append(probe(c) if c['type'] in ('port_listens', 'http_200') else None)
        text = self.sh(f'tail -c 200000 {log}', 30).stdout
        up = alive()
        done = []
        for c, r in zip(checks, results):
            done.append({'type': c['type'], **r} if r is not None else evaluate_checks([c], 0 if up else 1, text, self.provider.stat)[0])
        sec = round(time.time() - t0, 2)
        if not (keep and up and all(c['passed'] for c in done)):
            self._stop_bg(name)
        return ExecResult(0 if up else 1, text, '', sec), done, (started[0] if started else None)

    def _kill(self, pid: str) -> None:
        # ponytail: a kill that fails is not reported; the sandbox's own terminate(wait=True) at the end of the job is the backstop
        try:
            self.provider.exec(f'kill -- -{pid} 2>/dev/null || kill {pid} 2>/dev/null; for i in 1 2 3 4 5; do kill -0 {pid} 2>/dev/null || exit 0; sleep 1; done; kill -9 -- -{pid} 2>/dev/null; kill -9 {pid} 2>/dev/null; true', 30, cwd='/work')
        except Exception:  # noqa: BLE001
            pass

    def _stop_bg(self, name: str = None) -> None:
        """Kill the background processes (of one step, or all). Never raises: it runs in a `finally`."""
        for b in [b for b in self._bg if name is None or b['step'] == name]:
            self._kill(b['pid'])
            if b in self._bg:  # a second caller (a Run card stop) may have removed it
                self._bg.remove(b)

    def stop_background(self) -> None:
        self._stop_bg()

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
            try:
                i = self.route['steps'].index(step)
            except ValueError:  # the install pseudo-step is not in route['steps']: the added command joins the install commands instead (it already ran)
                self.route['install'].insert(0, {'cmd': change, 'source': pre['source']})
                return ''
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
        try:
            for i, cmd in enumerate(list(item['cmd'] for item in self.route['install'])):
                name = 'install' if i == 0 else f'install{i + 1}'
                if not self.run_step({'id': name, 'cmd': cmd, 'source': 'route.install', 'timeoutSec': 900, 'checks': [{'type': 'exit_zero'}]}, record=False):
                    return False
            for step in list(self.route['steps']):
                if not self.run_step(step):
                    return False
            return True
        finally:
            self._stop_bg()  # servers started by longRunning steps are killed here, on success and on failure

    def cheap_steps(self) -> set:
        """Steps whose knobs and traps run. A server step never exits: it is measured by how fast it started."""
        return {st['id'] for st in self.steps if st.get('startedSec', st['sec']) <= KNOB_VERIFY_MAX_STEP_SEC and not st.get('failed')}

    def _knob_run_long(self, step: dict, ks: list, logname: str) -> dict:
        """A server step's knob check: the step's command with the knobs set (a port knob to a port not in use, the port checks moving with it), started in the
        background, probed (port_listens and http_200 on THAT port), then stopped."""
        self._stop_bg(step['id'])  # the route's own server is down before another starts, so a knob that keeps the port does not collide
        cmd, checks = step['cmd'], [dict(c) for c in step['checks']]
        for k in ks:
            v = port_knob_value(k, checks) if is_port_knob(k) else knob_value(k)
            cmd = set_flag(cmd, k['flag'], v, True)
            checks = move_port_checks(checks, k, v)
        res, done, started = self._start_long(step, cmd, checks, keep=False, name='knob-' + step['id'])
        self._attempt_log_extra(logname, cmd, res)
        bad = ', '.join(c['type'] + (f" {p['port']}" if p.get('port') else '') for c, p in zip(done, checks) if not c['passed'])
        err = (f'probe failed: {bad}; ' if bad else '') + one_line(res.stderr or res.stdout)
        return {'cmd': cmd, 'rc': 0 if all(c['passed'] for c in done) else 1, 'sec': started if started is not None else res.sec, 'startsWithPrompt': False, 'separators': 0,
                '_error': err[:300]}

    @staticmethod
    def _knob_skipped(step: dict, why: str) -> dict:
        """A knob check that could not run is a record entry (knobsFailed), never silence."""
        return {'cmd': step['cmd'], 'rc': 1, 'sec': 0, 'startsWithPrompt': False, 'separators': 0, '_error': ('knobs not run: ' + why)[:300]}

    def _knob_run(self, cmd: str, strs: list, logname: str) -> dict:
        res = self.sh(cmd, 300)
        self._attempt_log_extra(logname, cmd, res)
        prompt = knob_value(strs[0]) if strs else None
        return {'cmd': cmd, 'rc': res.rc, 'sec': res.sec,
                'startsWithPrompt': bool(prompt) and res.rc == 0 and re.search('^' + re.escape(prompt), res.stdout, re.M) is not None,
                'separators': len(re.findall(r'^\s*[-=]{3,}\s*$', res.stdout, re.M)), '_error': one_line(res.stderr or res.stdout)}

    def verify_knobs(self) -> list:
        """One combined command per cheap step: the step's FINAL cmd with every knob set (replaced, never appended) to its safe value, run once.
        If it fails, retry once with the string knobs only (numeric safe values can violate a cross-flag constraint); the retry is entry [0], the failed combined run follows it."""
        out = []
        cheap = self.cheap_steps()
        for sid in dict.fromkeys(k['step'] for k in self.route['knobs']):
            step = next(s for s in self.route['steps'] if s['id'] == sid)
            # A string knob is exercised only when it is prompt-like (--start, --prompt, a text the program echoes) or discovery gave it a safeValue: an arbitrary string
            # (--init_from, --out_dir, --dataset) accepts only the repository's own values, and 'hello' made a sampler fail (nanoGPT re-run 2026-11-15).
            ks = [k for k in self.route['knobs'] if k['step'] == sid and k['type'] != 'bool'
                  and (k['type'] != 'string' or k.get('safeValue') or PROMPT_LIKE.search(k['flag']))]  # ponytail: bool knobs are not exercised
            if sid not in cheap or not ks:
                if step.get('longRunning'):
                    out.append(self._knob_skipped(step, f'the server did not start within {KNOB_VERIFY_MAX_STEP_SEC} s' if sid not in cheap else
                                                  'no knob of this step can be exercised (bool flags and strings without a safe value are not)'))
                continue
            if step.get('longRunning'):
                first = self._knob_run_long(step, ks, 'knob-' + sid)
                port_ks = [k for k in ks if is_port_knob(k)]
                if first['rc'] != 0 and 0 < len(port_ks) < len(ks):  # the combined start failed: the port knob alone (the one the probe can show)
                    out += [self._knob_run_long(step, port_ks, 'knob-' + sid + '-retry-port-only'), first]
                else:
                    out.append(first)
                continue
            strs = [k for k in ks if k['type'] == 'string']

            def build(kk):
                cmd = step['cmd']
                for k in kk:
                    cmd = set_flag(cmd, k['flag'], knob_value(k), k['type'] != 'bool')
                return cmd
            first = self._knob_run(build(ks), strs, 'knob-' + sid)
            if first['rc'] != 0 and len(strs) != len(ks):
                out += [self._knob_run(build(strs), strs, 'knob-' + sid + '-retry-strings-only'), first]
            else:
                out.append(first)
        return out

    def run_traps(self) -> list:
        out = []
        longs = {s['id'] for s in self.route['steps'] if s.get('longRunning')}
        for t in trap_plan(self.route, self.cheap_steps()):
            long = t['step'] in longs  # a trap that parses would start the server: it runs under `timeout`, and rc 124 is not a failure as expected
            res = self.sh(f"timeout {TRAP_LONG_TIMEOUT_SEC} bash -c {shlex.quote(t['cmd'])}" if long else t['cmd'], 300)
            path = f"logs/trap-{t['id']}.log"
            self.logs[path] = (res.stdout + (('\n--- stderr ---\n' + res.stderr) if res.stderr else '')).encode('utf-8', 'replace')[-limits.MAX_ARTIFACT_LOG_BYTES:]
            out.append({'id': t['id'], 'cmd': t['cmd'], 'kind': t['kind'], 'knob': t['knob'], 'rc': res.rc, 'sec': res.sec, 'stderrTail': tail(res.stderr or res.stdout, limits.TRAP_STDERR_TAIL_LINES),
                        'failsAsExpected': res.rc != 0 and not (long and res.rc == 124), 'log': path})
        return out

    def _attempt_log_extra(self, name: str, cmd: str, res):
        self.logs[f'logs/{name}.log'] = (res.stdout + (('\n--- stderr ---\n' + res.stderr) if res.stderr else '')).encode('utf-8', 'replace')[-limits.MAX_ARTIFACT_LOG_BYTES:]


# ---------------------------------------------------------------- clone, environment, artifacts

PROMPT_LIKE = re.compile(r'^--(start|prompt|text|input|query|message|question|seed_text|name|title)$')


def one_line(text: str) -> str:
    """The last non-empty line of a program's output, cut to 300 characters: the error a failed knob command left (never a stack trace in a message)."""
    lines = [l.strip() for l in str(text or '').splitlines() if l.strip()]
    return lines[-1][:300] if lines else ''


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
