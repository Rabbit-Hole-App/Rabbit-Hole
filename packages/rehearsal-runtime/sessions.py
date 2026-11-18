"""Run card sessions (RUN_CARD.md): one Modal sandbox per (canvas, user, commit), cells run in it one at a time, output streams into a server-side log.
Sessions live in this process only: a restarted controller forgets them, and the reaper then terminates their sandboxes as orphans (tag kind=session).
The sandbox is never given a secret; the command of a run is built by cells.build_command from the cell and validated flags, never taken from a client."""
import hashlib
import secrets
import shlex
import threading
import time
import uuid

import cells as cellmod
import contracts
import limits
import record as rec
import run_output
from runner import REPO, JobFailed, Runner, clone, move_port_checks, tail

LOCK = threading.RLock()
SESSIONS: dict = {}
LIVE = ('starting', 'ready')
BOOT_WAIT_SEC = 25           # POST /sessions waits this long for the sandbox before answering `starting`
KEEP_ENDED_SEC = 3600        # ended sessions stay readable (state, run status, log) this long
LOG_HEAD_BYTES = limits.MAX_ARTIFACT_LOG_BYTES // 2
LOG_TAIL_BYTES = limits.MAX_ARTIFACT_LOG_BYTES // 2
STREAM_KEEP_BYTES = 2 * limits.RUN_TAIL_MAX_BYTES  # per stream, enough to cut 200 lines / 32 KB from


class SessionError(Exception):
    """An error the HTTP layer maps to a status (400 bad request, 404 unknown, 409 busy, 410 ended, 429 full)."""
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status, self.message = status, message


def say(text: str) -> None:
    print(text, flush=True)  # the controller's session log; never holds keys, record contents or flag values


def _iso(t: float) -> str:
    return rec.utc_iso(t)


# ---------------------------------------------------------------- output buffers

class Log:
    """The full output of a run, capped at limits.MAX_ARTIFACT_LOG_BYTES: the first and the last half are kept, the middle is dropped and said so."""
    def __init__(self):
        self.head, self.tail, self.total = bytearray(), bytearray(), 0
        self.lock = threading.Lock()

    def write(self, text: str) -> None:
        b = text.encode('utf-8', 'replace')
        with self.lock:
            self.total += len(b)
            room = LOG_HEAD_BYTES - len(self.head)
            if room > 0:
                self.head += b[:room]
                b = b[room:]
            self.tail += b
            if len(self.tail) > 2 * LOG_TAIL_BYTES:
                del self.tail[:len(self.tail) - LOG_TAIL_BYTES]

    def text(self) -> str:
        with self.lock:
            tail = self.tail[-LOG_TAIL_BYTES:]
            omitted = self.total - len(self.head) - len(tail)
            mid = f'\n[... {omitted} bytes omitted ...]\n'.encode() if omitted > 0 else b''
            return (bytes(self.head) + mid + bytes(tail)).decode('utf-8', 'replace')


class Stream:
    """One stream's tail (for status polls) and its byte count."""
    def __init__(self):
        self.buf, self.total = bytearray(), 0
        self.lock = threading.Lock()

    def write(self, text: str) -> None:
        b = text.encode('utf-8', 'replace')
        with self.lock:
            self.total += len(b)
            self.buf += b
            if len(self.buf) > 2 * STREAM_KEEP_BYTES:
                del self.buf[:len(self.buf) - STREAM_KEEP_BYTES]

    def tail(self) -> str:
        with self.lock:
            text = bytes(self.buf[-STREAM_KEEP_BYTES:]).decode('utf-8', 'replace')
        text = '\n'.join(run_output.collapse_cr(text).splitlines()[-limits.RUN_TAIL_LINES:])  # tqdm's carriage returns: the last state of each line
        return text.encode('utf-8')[-limits.RUN_TAIL_MAX_BYTES:].decode('utf-8', 'ignore')


# ---------------------------------------------------------------- sessions and runs

class Run:
    """One run: a cell, or a custom sequence of steps (`plan`, run in order, stopping at the first non-zero exit)."""
    def __init__(self, cell_id: str, cmd: str, plan: list, custom: bool = False, metric_checks=()):
        self.id, self.cell_id, self.cmd, self.plan, self.custom = secrets.token_hex(8), cell_id, cmd, plan, custom
        self.status, self.rc, self.step = 'queued', None, None
        self.started = self.ended = None
        self.out, self.err, self.log = Stream(), Stream(), Log()
        self.stdout_all, self.stdout_whole = bytearray(), True  # stdout kept whole (to RUN_STDOUT_KEEP_BYTES) to classify it
        self.parser = run_output.MetricParser(metric_checks)
        self.produced: list = []   # run-status.json producedFiles
        self.files: dict = {}      # path -> bytes, for the files route, while the session lives
        self.probes: list = []
        self.runner = None         # the Runner of a longRunning step: its background process is killed at the end of the run, on error, timeout and stop
        self.done_files = False

    def feed(self, stream: Stream):
        def on_chunk(chunk):
            stream.write(chunk)
            self.log.write(chunk)
            if stream is self.out:
                self.parser.feed(chunk)
                room = limits.RUN_STDOUT_KEEP_BYTES - len(self.stdout_all)
                b = chunk.encode('utf-8', 'replace')
                self.stdout_all += b[:max(room, 0)]
                self.stdout_whole = self.stdout_whole and len(b) <= room
        return on_chunk

    def public(self) -> dict:
        end = self.ended or time.time()
        complete = self.status not in ('queued', 'running')
        out = {'runId': self.id, 'cellId': self.cell_id, 'status': self.status, 'complete': complete,
               'sec': round(end - self.started, 1) if self.started else 0.0, 'cmd': self.cmd,
               'stdoutTail': self.out.tail(), 'stderrTail': self.err.tail(), 'stdoutBytes': self.out.total, 'stderrBytes': self.err.total}
        if self.rc is not None:
            out['rc'] = self.rc
        if self.custom and self.step and not complete:
            out['step'] = self.step
        metrics = self.parser.result()
        if metrics:
            out['metrics'] = metrics
        if complete:
            text = bytes(self.stdout_all).decode('utf-8', 'replace')
            out['stdoutKind'] = run_output.stdout_kind(text) if self.stdout_whole else 'text'
            if self.done_files:
                out['producedFiles'] = self.produced
        if self.probes:
            out['probes'] = self.probes
        return out


class Session:
    def __init__(self, req: dict, cells: list):
        self.id = uuid.uuid4().hex
        self.req, self.record, self.cells = req, req['record'], cells
        self.key = (req['canvas'], req['user'], req['commit'])
        self.status, self.snapshot, self.sandbox_id, self.error = 'starting', False, '', None
        self.started = time.time()
        self.deadline = self.started + limits.SESSION_HARD_TIMEOUT_SEC
        self.touched = self.started
        self.ended = None  # when the machine stopped being held (stop, hard timeout, idle): usage metering reads it
        self.provider = None
        self.runs: dict = {}
        self.stop_requested = False
        self.files_bytes = 0  # produced-file bytes held for this session (limits.SESSION_FILES_MAX_BYTES)
        self.booted = threading.Event()  # set once the sandbox is ready or the start failed

    def active_run(self):
        return next((r for r in self.runs.values() if r.status in ('queued', 'running')), None)

    def state(self, existing: bool = False) -> dict:
        out = {'sessionId': self.id, 'status': self.status, 'existing': existing, 'snapshot': self.snapshot, 'cells': self.cells,
               'startedUtc': _iso(self.started), 'deadlineUtc': _iso(self.deadline)}
        if self.sandbox_id:
            out['sandboxId'] = self.sandbox_id
        if self.error:
            out['error'] = self.error
        out['cpu'] = limits.SANDBOX_CPU  # physical cores held, the machine's size for the usage meter
        out['memoryGiB'] = limits.SANDBOX_MEMORY_MIB / 1024
        if self.ended:
            out['endedUtc'] = _iso(self.ended)
        return out


def _request_errors(req) -> list:
    v = contracts.Draft202012Validator({'$ref': 'https://rabbit-hole.local/rehearsal/session.json#/$defs/request'}, registry=contracts._REG)
    return [('/'.join(str(p) for p in e.absolute_path) or '<root>') + ': ' + e.message[:300] for e in v.iter_errors(req)]


def create(req: dict) -> tuple:
    """(state, http status). 201 new, 200 existing; SessionError 400 (bad request or record) or 429 (controller full)."""
    errs = _request_errors(req)
    if errs:
        raise SessionError(400, 'Invalid session request: ' + '; '.join(errs[:3]))
    r = req['record']
    if (r['repo'], r['commit'], r['hardware']) != (req['repo'], req['commit'], 'cpu'):
        raise SessionError(400, 'Invalid session request: record repo, commit and hardware must match the request')
    try:
        cells = cellmod.derive_cells(r)
    except (KeyError, TypeError, ValueError) as e:
        raise SessionError(400, f'Invalid session request: the record cannot be turned into cells ({type(e).__name__})')
    if not cells:
        raise SessionError(400, 'Invalid session request: the record has no cells')
    with LOCK:
        now = time.time()
        for sid, s in list(SESSIONS.items()):
            if s.status not in LIVE and now - s.touched > KEEP_ENDED_SEC:
                del SESSIONS[sid]
        key = (req['canvas'], req['user'], req['commit'])
        old = next((s for s in SESSIONS.values() if s.key == key and s.status in LIVE), None)
        if old:
            old.touched = now
            return old.state(existing=True), 200
        if sum(1 for s in SESSIONS.values() if s.status in LIVE) >= limits.MAX_SESSIONS:
            raise SessionError(429, f'This controller already runs {limits.MAX_SESSIONS} sessions; stop one or try again later')
        s = Session(req, cells)
        SESSIONS[s.id] = s
    say(f'session {s.id} start repo {req["repo"]} commit {req["commit"][:10]} snapshot {"offered" if r.get("snapshotImage") else "absent"}')
    threading.Thread(target=_boot, args=(s,), daemon=True).start()
    s.booted.wait(BOOT_WAIT_SEC)  # a snapshot start usually answers `ready`; a fresh start answers `starting` and runs queue behind it
    with LOCK:
        return s.state(), 201


def _boot(s: Session) -> None:
    from providers.modal_sandbox import ModalSandbox
    r = s.record
    tags = {'job': s.id, 'repo': r['repo'], 'commit': r['commit'], 'hardware': r['hardware'], 'session': s.id, 'kind': 'session'}
    domains = list((r.get('network') or {}).get('allowDomainFixes') or [])

    def created(sandbox_id):
        with LOCK:
            s.sandbox_id = sandbox_id  # stored the moment create returns

    def attempt(image_id: str):
        prov = ModalSandbox(on_created=created, image_id=image_id, timeout=limits.SESSION_HARD_TIMEOUT_SEC, idle_timeout=limits.SESSION_IDLE_TIMEOUT_SEC)
        prov.extra_domains = domains
        s.provider = prov  # before start(): stop() and the reaper can then reach a half-started sandbox
        prov.start(tags)
        return prov

    try:
        prov = None
        snap = r.get('snapshotImage') or ''
        if snap:
            try:
                prov = attempt(snap)
                check = prov.exec('test -d .git', 30, cwd=REPO)  # the snapshot must hold the clone
                if check.rc != 0:
                    raise JobFailed('snapshot_empty', 'the snapshot has no clone')
                with LOCK:
                    s.snapshot = True
            except Exception:  # noqa: BLE001 - any snapshot problem falls back to a fresh start (assumed Modal behaviour: from_id/create can fail or yield an unusable image)
                if prov is not None:
                    prov.stop()
                prov = None
        if prov is None:
            if s.stop_requested:
                return
            prov = attempt('')
            if not s.stop_requested:
                clone(prov, r['repo'], r['commit'])
                install = ' && '.join(i['cmd'] for i in r['route'].get('install', []))
                if install:
                    res = prov.exec(install, 900, cwd=REPO)
                    if res.rc != 0:
                        raise JobFailed('install_failed', f'the install step exited {res.rc}: ' + (tail(res.stderr or res.stdout, 3) or 'no output'))
        with LOCK:
            if s.stop_requested:
                gone = True
            else:
                s.status, gone = 'ready', False
        if gone:
            prov.stop()
        else:
            say(f'session {s.id} ready sandbox {s.sandbox_id} snapshot {s.snapshot}')
    except Exception as e:  # noqa: BLE001 - the session must end in a state the control plane can read
        with LOCK:
            if not s.stop_requested:
                s.status, s.error = 'failed', (f'{e.code}: {e.detail}' if isinstance(e, JobFailed) else f'{type(e).__name__}: {str(e)[:200]}')
        if s.provider is not None:
            s.provider.stop()
        say(f'session {s.id} failed {s.error}')
    finally:
        s.booted.set()


def get(session_id: str) -> Session:
    with LOCK:
        s = SESSIONS.get(session_id)
        if s is None:
            raise SessionError(404, 'Session not found')  # the control plane then starts a new one (as after a controller restart)
        s.touched = time.time()
        return s


def state(session_id: str) -> dict:
    s = get(session_id)
    with LOCK:
        return s.state()


def _startable(s: Session) -> None:
    if s.status not in LIVE:
        raise SessionError(410, f'Session is {s.status}')
    if s.active_run():
        raise SessionError(409, 'Another run is still active in this session')


def _source_reader(s: Session):
    """read_source(path, first, last) for cells.added_specs: the cited lines of the clone, read in the session's sandbox. The path was validated by cells._source_parts (plain, no `..`);
    here it is also resolved (symlinks included) and must stay inside the clone, and shell-quoted. None when the file or line is absent."""
    s.booted.wait(BOOT_WAIT_SEC)
    if s.status != 'ready':
        raise SessionError(409, 'The session is still starting; add the knob again in a few seconds')

    def read(path: str, first: int, last: int):
        script = (f'p=$(realpath -e -- {shlex.quote(path)} 2>/dev/null) && [ -f "$p" ] && case "$p" in {REPO}/*) sed -n {shlex.quote(f"{first},{last}p")} -- "$p" | head -c 4000; exit 0;; esac; exit 3')
        try:
            r = s.provider.exec(script, 30, cwd=REPO)
        except Exception as e:  # noqa: BLE001 - a dead sandbox
            raise SessionError(503, f'The sandbox could not be reached to check the added knob ({type(e).__name__})')
        return r.stdout if r.rc == 0 and r.stdout.strip() else None
    return read


def _step_of(s: Session, cell_id: str):
    """The route step a cell runs (a server step is started in the background and probed); None for the install cell."""
    steps = s.record['route']['steps']
    if cell_id == 'knobs':
        return steps[-1]
    return next((st for st in steps if cellmod.cell_id_of(st['id']) == cell_id), None)


def _item(s: Session, cell: dict, cmd: str, values: dict, step: dict = None) -> dict:
    """One thing to run: its command, timeout, and for a longRunning step the checks (a changed port moves the port checks with it)."""
    stepdef = step or _step_of(s, cell['cellId'])
    long = bool(stepdef and stepdef.get('longRunning'))
    checks = [dict(c) for c in stepdef['checks']] if stepdef else []
    if long:
        merged = {f['flag']: f['value'] for f in cell['flags']}
        merged.update(values or {})
        for k in s.record['route'].get('knobs', []):
            if k['step'] == stepdef['id'] and k['flag'] in merged:
                checks = move_port_checks(checks, k, merged[k['flag']])
    return {'step': stepdef['id'] if stepdef else cell['cellId'], 'stepdef': stepdef, 'cmd': cmd, 'timeoutSec': cell['timeoutSec'], 'long': long, 'checks': checks}


def start_run(session_id: str, body: dict) -> str:
    """body: a validated run-request ({cellId, flags?, addedKnobs?} or {custom: {steps, knobs, name?}, addedKnobs?}). The command is built here, from the record's cells; ValueError from the rule is a 400."""
    s = get(session_id)
    with LOCK:
        _startable(s)
    added = body.get('addedKnobs') or []
    reader = _source_reader(s) if added else None  # the sandbox is read outside the lock (a slow exec must not block the other routes)
    try:
        if 'custom' in body:
            custom = body['custom']
            built = cellmod.build_custom(s.cells, s.record['route'], custom, added, reader)
            by_id = {c['cellId']: c for c in s.cells}
            plan = [_item(s, by_id[b['cellId']], b['cmd'], (custom.get('knobs') or {}).get(b['step']), next(st for st in s.record['route']['steps'] if st['id'] == b['step'])) for b in built]
            run_args = ('custom', ' && '.join(b['cmd'] for b in built), plan, True)
        else:
            cell = next((c for c in s.cells if c['cellId'] == body['cellId']), None)
            cmd = cellmod.build_command(s.cells, body['cellId'], body.get('flags') or {}, added, reader)
            plan = [_item(s, cell, cmd, body.get('flags') or {})]
            run_args = (body['cellId'], cmd, plan, False)
    except ValueError as e:
        raise SessionError(400, str(e))
    checks = [c for it in plan if it['stepdef'] for c in cellmod.metric_checks(it['stepdef'])]
    with LOCK:
        _startable(s)
        run = Run(*run_args, metric_checks=checks)
        s.runs[run.id] = run
    threading.Thread(target=_execute, args=(s, run), daemon=True).start()
    return run.id


def _long_item(s: Session, run: Run, item: dict) -> int:
    """A longRunning step, started exactly as the rehearsal runner starts it (setsid nohup, probe port_listens / http_200, first-probe time); its log is the output and the process stays up for the steps after it
    in a custom run. The caller's `finally` kills it (Runner.stop_background)."""
    if run.runner is None:
        run.runner = Runner(provider=s.provider, route=s.record['route'], budget=None, agent=None, status=lambda *a, **k: None, deadline=s.deadline, probe_body_limit=limits.PROBE_BODY_BYTES)
    res, done, _ = run.runner._start_long(item['stepdef'], cmd=item['cmd'], checks=item['checks'], keep=True, name=f'run-{run.id}-{item["step"]}')
    run.probes = run.runner.probes[:4]
    if res.stdout:
        run.feed(run.out)(res.stdout)
    failed = [c['type'] for c in done if not c['passed']]
    if res.stderr:
        run.feed(run.err)(res.stderr + '\n')
    if failed:
        run.feed(run.err)('[the server did not pass: ' + ', '.join(failed) + ']\n')
    return 0 if res.rc == 0 and not failed else (res.rc or 1)


def _detect_files(s: Session, run: Run, marker: str) -> None:
    """The files the run created or changed in the clone (find newer than the marker made before it), with size and sha256, classified by extension; previewable kinds are fetched under
    the per-file, per-run and per-session caps and kept in memory for the files route. Binaries are never fetched."""
    prov = s.provider
    n = limits.RUN_FILES_MAX_COUNT
    script = (f'find . -newer {marker} -type f ! -path "./.git/*" ! -path "*/__pycache__/*" ! -name "*.pyc" ! -path "*/node_modules/*" ! -path "./.venv/*" | sort | head -n {n} | '
              'while IFS= read -r p; do printf \'%s %s %s\\n\' "$(stat -c %s "$p")" "$(sha256sum "$p" | cut -d" " -f1)" "${p#./}"; done; ' + f'rm -f {marker}')
    out = prov.exec(script, 300, cwd=REPO).stdout
    total = 0
    for line in out.splitlines():
        parts = line.split(' ', 2)
        if len(parts) != 3 or not parts[0].isdigit() or len(parts[1]) != 64 or parts[2].startswith('/') or '..' in parts[2].split('/'):
            continue
        size, sha, path = int(parts[0]), parts[1], parts[2]
        kind = run_output.kind_of(path)
        entry = {'path': path, 'bytes': size, 'sha256': sha, 'kind': kind, 'fetched': False}
        if kind != 'binary' and size <= limits.RUN_FILE_MAX_BYTES and total + size <= limits.RUN_FILES_MAX_BYTES and s.files_bytes + size <= limits.SESSION_FILES_MAX_BYTES:
            try:
                data = prov.fetch(path)
            except Exception:  # noqa: BLE001 - one unreadable file is listed, not fetched
                data = None
            if data is not None and len(data) <= limits.RUN_FILE_MAX_BYTES:
                if len(data) != size or hashlib.sha256(data).hexdigest() != sha:  # the file changed after it was listed
                    entry.update(bytes=len(data), sha256=hashlib.sha256(data).hexdigest())
                run.files[path] = data
                total += len(data)
                s.files_bytes += len(data)
                entry['fetched'] = True
        run.produced.append(entry)


def _execute(s: Session, run: Run) -> None:
    while not s.booted.wait(1):
        if s.stop_requested:
            break
    with LOCK:
        ok = s.status == 'ready' and not s.stop_requested
        if ok:
            run.status, run.started = 'running', time.time()
        else:
            run.status, run.started = ('stopped' if s.stop_requested else 'error'), time.time()
            if not s.stop_requested:
                run.err.write('The sandbox did not start: ' + (s.error or s.status) + '\n')
            run.ended = time.time()
    if not ok:
        return
    status, marker = 'error', f'/tmp/rc-{run.id}.marker'
    marked = False
    try:
        try:
            marked = s.provider.exec(f'touch {marker}', 30, cwd=REPO).rc == 0
        except Exception:  # noqa: BLE001 - no marker: the run still runs, without a file list
            pass
        for item in run.plan:
            if run.custom:
                run.step = item['step']
            if item['long']:
                rc = _long_item(s, run, item)
            else:
                rc, _ = s.provider.exec_stream(item['cmd'], item['timeoutSec'], REPO, run.feed(run.out), run.feed(run.err))
            run.rc = rc
            if rc != 0:
                break
        status = 'done' if run.rc == 0 else 'timeout' if run.rc == 124 else 'error'
    except Exception as e:  # noqa: BLE001 - a dead sandbox or broken stream ends the run, not the controller
        if not s.stop_requested:
            run.err.write(f'\n[run failed: {type(e).__name__}: {str(e)[:200]}]\n')
    finally:
        if run.runner is not None:
            run.runner.stop_background()  # always: on done, error, timeout and stop (it never raises)
    run.parser.flush()
    with LOCK:
        run.ended = time.time()
    if marked and not s.stop_requested:
        try:
            _detect_files(s, run, marker)
        except Exception as e:  # noqa: BLE001 - the run's own result stands; the card is told why no files are listed
            run.err.write(f'\n[could not list the produced files: {type(e).__name__}]\n')
    with LOCK:
        run.done_files = marked and not s.stop_requested
        run.status = 'stopped' if s.stop_requested else status
        s.touched = time.time()
    say(f'session {s.id} run {run.id} cell {run.cell_id} status {run.status} rc {run.rc} sec {round(run.ended - run.started, 1)} files {len(run.produced)}')


def _run(session_id: str, run_id: str) -> Run:
    s = get(session_id)
    with LOCK:
        run = s.runs.get(run_id)
    if run is None:
        raise SessionError(404, 'Run not found')
    return run


def run_status(session_id: str, run_id: str) -> dict:
    return _run(session_id, run_id).public()


def run_log(session_id: str, run_id: str) -> str:
    return _run(session_id, run_id).log.text()


def run_file(session_id: str, run_id: str, path: str) -> tuple:
    """(bytes, content type) of a file this run produced. The path must be in the run's producedFiles and fetched; a binary is never served (403); the bytes live while the session does (410 after)."""
    s = get(session_id)
    run = _run(session_id, run_id)
    with LOCK:
        if s.status not in LIVE:
            raise SessionError(410, 'The session ended; its produced files are no longer available')
        entry = next((f for f in run.produced if f['path'] == path), None)
        data = run.files.get(path) if entry else None
    if entry is None:
        raise SessionError(404, 'That file was not produced by this run')
    if entry['kind'] == 'binary':
        raise SessionError(403, 'Binary files are never served: only their name, size and hash are kept')
    if data is None:
        raise SessionError(404, 'That file is over the size cap and was not kept: only its name, size and hash are listed')
    return data, run_output.content_type(path, entry['kind'])


def _release_files(s: Session) -> None:
    """The session ended: its produced files are no longer served, so their bytes go (the listing stays)."""
    with LOCK:
        for r in s.runs.values():
            r.files.clear()
        s.files_bytes = 0


def stop(session_id: str) -> dict:
    """terminate(wait=True); runs in flight end as stopped. Idempotent."""
    s = get(session_id)
    with LOCK:
        was_live = s.status in LIVE
        s.stop_requested = True
        if was_live:
            s.status = 'stopped'
            s.ended = time.time()
        prov = s.provider
        running = s.active_run()
    if was_live and running is not None and running.runner is not None:
        running.runner.stop_background()  # a server started by the run is killed first, then the sandbox goes
    if was_live and prov is not None and getattr(prov, 'sb', None) is not None:
        ok = prov.stop()
        say(f'session {s.id} stopped sandbox {s.sandbox_id} terminated {ok}')
    elif was_live:
        say(f'session {s.id} stopped before its sandbox existed')  # _boot terminates the sandbox when create returns
    with LOCK:
        for r in s.runs.values():
            if r.status in ('queued', 'running'):
                r.status, r.ended = 'stopped', r.ended or time.time()
    _release_files(s)
    with LOCK:
        return s.state()


# ---------------------------------------------------------------- reaper

def reap_once() -> None:
    """Terminate every session sandbox of this app that is an orphan (its session is not in memory), past its hard deadline, or idle past limits.SESSION_IDLE_TIMEOUT_SEC."""
    import modal
    from providers.modal_sandbox import APP_NAME
    app = modal.App.lookup(APP_NAME, create_if_missing=True)
    now = time.time()
    for sb in list(modal.Sandbox.list(app_id=app.app_id, tags={'kind': 'session'})):
        sid = sb.get_tags().get('session', '')
        with LOCK:
            s = SESSIONS.get(sid)
            live = s is not None and s.status in LIVE
            if not live:
                reason = 'orphan'
            elif now > s.deadline:
                reason = 'hard'
            elif s.active_run() is None and now - s.touched > limits.SESSION_IDLE_TIMEOUT_SEC:
                reason = 'idle'
            else:
                continue
            if live:
                s.stop_requested = True  # runs in flight end as stopped
        sb.terminate(wait=True)
        with LOCK:
            if live:
                s.status = 'expired'
                s.ended = time.time()
                for r in s.runs.values():
                    if r.status in ('queued', 'running'):
                        r.status, r.ended = 'stopped', r.ended or time.time()
        if live:
            _release_files(s)
        say(f'reaper terminated {sb.object_id} session {sid} reason {reason}')


def reaper_loop(stop_event: threading.Event = None) -> None:
    stop_event = stop_event or threading.Event()
    while not stop_event.wait(limits.REAPER_INTERVAL_SEC):  # first pass after one interval
        try:
            reap_once()
        except Exception as e:  # noqa: BLE001 - one failed pass must not end the reaper
            say(f'reaper error {type(e).__name__}')
