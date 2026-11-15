"""Run card sessions (RUN_CARD.md): one Modal sandbox per (canvas, user, commit), cells run in it one at a time, output streams into a server-side log.
Sessions live in this process only: a restarted controller forgets them, and the reaper then terminates their sandboxes as orphans (tag kind=session).
The sandbox is never given a secret; the command of a run is built by cells.build_command from the cell and validated flags, never taken from a client."""
import secrets
import threading
import time
import uuid

import cells as cellmod
import contracts
import limits
import record as rec
from runner import REPO, JobFailed, clone, tail

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
        text = '\n'.join(text.splitlines()[-limits.RUN_TAIL_LINES:])
        return text.encode('utf-8')[-limits.RUN_TAIL_MAX_BYTES:].decode('utf-8', 'ignore')


# ---------------------------------------------------------------- sessions and runs

class Run:
    def __init__(self, cell_id: str, cmd: str, timeout: int):
        self.id, self.cell_id, self.cmd, self.timeout = secrets.token_hex(8), cell_id, cmd, timeout
        self.status, self.rc = 'queued', None
        self.started = self.ended = None
        self.out, self.err, self.log = Stream(), Stream(), Log()

    def feed(self, stream: Stream):
        def on_chunk(chunk):
            stream.write(chunk)
            self.log.write(chunk)
        return on_chunk

    def public(self) -> dict:
        end = self.ended or time.time()
        out = {'runId': self.id, 'cellId': self.cell_id, 'status': self.status, 'complete': self.status not in ('queued', 'running'),
               'sec': round(end - self.started, 1) if self.started else 0.0, 'cmd': self.cmd,
               'stdoutTail': self.out.tail(), 'stderrTail': self.err.tail(), 'stdoutBytes': self.out.total, 'stderrBytes': self.err.total}
        if self.rc is not None:
            out['rc'] = self.rc
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
        self.provider = None
        self.runs: dict = {}
        self.stop_requested = False
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


def start_run(session_id: str, cell_id: str, flags: dict) -> str:
    s = get(session_id)
    with LOCK:
        if s.status not in LIVE:
            raise SessionError(410, f'Session is {s.status}')
        try:
            cmd = cellmod.build_command(s.cells, cell_id, flags)
        except ValueError as e:
            raise SessionError(400, str(e))
        if s.active_run():
            raise SessionError(409, 'Another run is still active in this session')
        cell = next(c for c in s.cells if c['cellId'] == cell_id)
        run = Run(cell_id, cmd, cell['timeoutSec'])
        s.runs[run.id] = run
    threading.Thread(target=_execute, args=(s, run), daemon=True).start()
    return run.id


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
    status = 'error'
    try:
        rc, _ = s.provider.exec_stream(run.cmd, run.timeout, REPO, run.feed(run.out), run.feed(run.err))
        run.rc = rc
        status = 'done' if rc == 0 else 'timeout' if rc == 124 else 'error'
    except Exception as e:  # noqa: BLE001 - a dead sandbox or broken stream ends the run, not the controller
        if not s.stop_requested:
            run.err.write(f'\n[run failed: {type(e).__name__}: {str(e)[:200]}]\n')
    with LOCK:
        run.status = 'stopped' if s.stop_requested else status
        run.ended = time.time()
        s.touched = time.time()
    say(f'session {s.id} run {run.id} cell {run.cell_id} status {run.status} rc {run.rc} sec {round(run.ended - run.started, 1)}')


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


def stop(session_id: str) -> dict:
    """terminate(wait=True); runs in flight end as stopped. Idempotent."""
    s = get(session_id)
    with LOCK:
        was_live = s.status in LIVE
        s.stop_requested = True
        if was_live:
            s.status = 'stopped'
        prov = s.provider
    if was_live and prov is not None and getattr(prov, 'sb', None) is not None:
        ok = prov.stop()
        say(f'session {s.id} stopped sandbox {s.sandbox_id} terminated {ok}')
    elif was_live:
        say(f'session {s.id} stopped before its sandbox existed')  # _boot terminates the sandbox when create returns
    with LOCK:
        for r in s.runs.values():
            if r.status in ('queued', 'running'):
                r.status, r.ended = 'stopped', r.ended or time.time()
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
                for r in s.runs.values():
                    if r.status in ('queued', 'running'):
                        r.status, r.ended = 'stopped', r.ended or time.time()
        say(f'reaper terminated {sb.object_id} session {sid} reason {reason}')


def reaper_loop(stop_event: threading.Event = None) -> None:
    stop_event = stop_event or threading.Event()
    while not stop_event.wait(limits.REAPER_INTERVAL_SEC):  # first pass after one interval
        try:
            reap_once()
        except Exception as e:  # noqa: BLE001 - one failed pass must not end the reaper
            say(f'reaper error {type(e).__name__}')
