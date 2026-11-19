"""Rehearsal controller: HTTP job service (port 8891), modeled on lesson-renderer/server.py. One job in flight, queue <= 4, Bearer REHEARSAL_WORKER_TOKEN.
Refuses to start without its four credentials. Provider is hard-coded to Modal (nothing else is selectable). Keys are read from the environment only and never logged."""
import hmac
import json
import os
import re
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote

REQUIRED_ENV = ('ANTHROPIC_API_KEY', 'MODAL_TOKEN_ID', 'MODAL_TOKEN_SECRET', 'REHEARSAL_WORKER_TOKEN')
PORT = int(os.environ.get('REHEARSAL_PORT', '8891'))
JOBS: dict = {}
LOCK = threading.Lock()
SLOT = threading.BoundedSemaphore(1)
KEY_PATH = re.compile(r'/rehearsals/([a-f0-9]{64})(/asset)?')
SESSION_PATH = re.compile(r'/sessions(?:/([a-f0-9]{32})(?:/(run|stop)|/runs/([a-f0-9]{16})(/log|/files/[^?#]+)?)?)?')  # Run card sessions (RUN_CARD.md); /files/<path>: a produced file
SESSION_BODY_MAX = 2_000_000  # a session request carries the whole record
CATALOGUES: dict = {}  # catalogue jobs: no sandbox, no clone, their own light slot (never the rehearsal's one-job semaphore)
CAT_SLOT = threading.BoundedSemaphore(1)
CAT_PATH = re.compile(r'/catalogues/([a-f0-9]{64})(/asset)?')
CATALOGUE_BODY_MAX = 12_000_000  # a catalogue request carries the snapshot's files (the indexer holds them to 8 MB of text)
TOKEN = ''
MODEL = None


def missing_env() -> list:
    return [n for n in REQUIRED_ENV if not os.environ.get(n)]


def run(key: str, job: dict) -> None:
    from providers.modal_sandbox import ModalSandbox
    from rehearsal import run_rehearsal

    def status(state, step=None, attempt=None, fixes=None):
        with LOCK:
            j = JOBS[key]
            j.update(status=state, updated=time.time())
            for k, v in (('step', step), ('attempt', attempt), ('fixes', fixes)):
                if v is not None:
                    j[k] = v

    def created(sandbox_id):
        with LOCK:
            JOBS[key]['sandbox_id'] = sandbox_id  # stored at creation: a restarted controller can Sandbox.from_id(...).terminate() an orphan

    SLOT.acquire()
    try:
        with LOCK:
            JOBS[key]['started'] = time.time()
        out = run_rehearsal(job, ModalSandbox(on_created=created), MODEL, status, escalation_model=os.environ.get('REHEARSAL_MODEL', ''))
        with LOCK:
            JOBS[key].update(status=out.status, error=out.error, zip=out.zip, finished=time.time(), updated=time.time())
        if out.status == 'failed':
            print(f"rehearsal {key[:8]} failed: {out.error}", flush=True)  # the operator's record of why (a failed job was otherwise unrecoverable once retried)
    except Exception as e:  # noqa: BLE001 - the job must end in a state the control plane can read
        with LOCK:
            JOBS[key].update(status='failed', error=f'internal_error: {type(e).__name__}: {e}', finished=time.time(), updated=time.time())
        print(f"rehearsal {key[:8]} failed: internal_error: {type(e).__name__}", flush=True)
    finally:
        SLOT.release()


def catalogue(key: str, job: dict) -> None:
    """One catalogue job: the rule pass, one model call for the routes and one for the learn options (catalogue.py); a job with a stored `catalogue` makes only the learn call. Ends `ready` with the document, or `failed` with a plain error; nothing here reads a key value."""
    import catalogue as cat

    def status(state):
        with LOCK:
            CATALOGUES[key].update(status=state, updated=time.time())
    CAT_SLOT.acquire()
    try:
        doc, calls = cat.catalogue_with_learn(job, MODEL, status)
        with LOCK:
            CATALOGUES[key].update(status='ready', doc=doc, calls=calls, finished=time.time(), updated=time.time())
        print(f"catalogue {key[:8]} model calls: " + ', '.join(f"{c['role']} US${c['usd']:.4f}" for c in calls) + f" (total US${sum(c['usd'] for c in calls):.4f})", flush=True)  # the operator's record of the cost; never in the document
    except cat.CatalogueFailed as e:
        with LOCK:
            CATALOGUES[key].update(status='failed', error=f'{e.code}: {e.detail}'[:400], finished=time.time(), updated=time.time())
        print(f"catalogue {key[:8]} failed: {e.code}: {e.detail}"[:420], flush=True)  # the operator's record of why: the job's error is replaced when the owner retries
    except Exception as e:  # noqa: BLE001 - the job must end in a state the control plane can read; the class name only, never a message that might carry a key
        with LOCK:
            CATALOGUES[key].update(status='failed', error=f'catalogue_unavailable: {type(e).__name__}', finished=time.time(), updated=time.time())
        print(f"catalogue {key[:8]} failed: catalogue_unavailable: {type(e).__name__}", flush=True)  # the class name only, as stored: a message might carry a key
    finally:
        CAT_SLOT.release()


def public(j: dict) -> dict:
    end = j.get('finished') or time.time()
    out = {'status': j['status'], 'elapsedSec': round(end - j['created'], 1)}
    for k in ('step', 'attempt', 'fixes', 'error'):
        if j.get(k) is not None:
            out[k] = j[k]
    return out


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def send_json(self, data, status=200):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_text(self, text: str, status=200):
        body = text.encode()
        self.send_response(status)
        self.send_header('Content-Type', 'text/plain; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_file(self, data: bytes, content_type: str):
        """A produced file, never as a download and never as something a browser may run: the type the card asked for, nosniff, sandbox."""
        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Content-Disposition', 'inline')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Security-Policy', 'sandbox')
        self.end_headers()
        self.wfile.write(data)

    def read_json(self, contract: str = '', limit: int = SESSION_BODY_MAX):
        """The request body as JSON (validated against schemas/<contract>.json when given); None after answering 400."""
        import contracts
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= limit:
                raise ValueError(f'request body must be 1 byte to {limit // 1_000_000} MB')
            body = json.loads(self.rfile.read(length))
            errs = contracts.errors(contract, body) if contract else []
            if errs:
                raise ValueError('; '.join(errs[:3]))
            return body
        except (ValueError, TypeError) as e:
            self.send_json({'error': 'Invalid request: ' + str(e)[:300]}, 400)
            return None

    def sessions(self, method: str) -> None:
        """Run card routes. Every path ends in a status here: nothing reaches Modal before the body and session checks pass."""
        import sessions
        m = SESSION_PATH.fullmatch(self.path)
        if not m:
            self.send_json({'error': 'Not found'}, 404)
            return
        sid, verb, run_id, log = m.groups()
        try:
            if sid is None and method == 'POST':
                body = self.read_json()
                if body is not None:
                    st, code = sessions.create(body)
                    self.send_json(st, code)
            elif sid and not verb and not run_id and method == 'GET':
                self.send_json(sessions.state(sid))
            elif verb == 'run' and method == 'POST':
                sessions.get(sid)  # 404 before the body is read
                body = self.read_json('run-request')
                if body is not None:
                    self.send_json({'runId': sessions.start_run(sid, body)}, 202)
            elif verb == 'stop' and method == 'POST':
                self.send_json(sessions.stop(sid))
            elif run_id and method == 'GET':
                if log and log.startswith('/files/'):
                    data, ctype = sessions.run_file(sid, run_id, unquote(log[len('/files/'):]))
                    self.send_file(data, ctype)
                elif log:
                    self.send_text(sessions.run_log(sid, run_id))
                else:
                    self.send_json(sessions.run_status(sid, run_id))
            else:
                self.send_json({'error': 'Not found'}, 404)
        except sessions.SessionError as e:
            self.send_json({'error': e.message}, e.status)
        except Exception as e:  # noqa: BLE001 - the control plane must always get a JSON answer
            self.send_json({'error': f'internal_error: {type(e).__name__}'}, 500)

    def authorized(self) -> bool:
        if not hmac.compare_digest(self.headers.get('Authorization', ''), 'Bearer ' + TOKEN):
            self.send_json({'error': 'Unauthorized'}, 401)
            return False
        return True

    def do_GET(self):
        if self.path == '/health':
            self.send_json({'ok': True})
            return
        if not self.authorized():
            return
        if self.path.startswith('/sessions'):
            self.sessions('GET')
            return
        c = CAT_PATH.fullmatch(self.path)
        if c:
            with LOCK:
                j = CATALOGUES.get(c[1])
                snap = public(j) if j else None
                doc = j.get('doc') if j else None
            if not j:
                self.send_json({'error': 'Job not found'}, 404)  # the control plane then resends the job
            elif c[2]:
                self.send_json(doc) if doc else self.send_json({'error': 'No catalogue yet'}, 409)
            else:
                self.send_json(snap)
            return
        m = KEY_PATH.fullmatch(self.path)
        if not m:
            self.send_json({'error': 'Not found'}, 404)
            return
        with LOCK:
            j = JOBS.get(m[1])
            snap = public(j) if j else None
            blob = j.get('zip') if j else None
        if not j:
            self.send_json({'error': 'Job not found'}, 404)  # the control plane then resends the job (as after a controller restart)
        elif m[2]:
            if not blob:
                self.send_json({'error': 'No artifact yet'}, 409)
                return
            self.send_response(200)
            self.send_header('Content-Type', 'application/zip')
            self.send_header('Content-Length', str(len(blob)))
            self.end_headers()
            self.wfile.write(blob)
        else:
            self.send_json(snap)

    def catalogue_job(self) -> None:
        """POST /catalogues (schemas/catalogue-job.json): accepted at once, run on a thread; the same key while held (queued, running, ready) is accepted again, a failed one is replaced (Retry)."""
        import limits
        job = self.read_json('catalogue-job', CATALOGUE_BODY_MAX)
        if job is None:
            return
        key = job['key']
        with LOCK:
            old = CATALOGUES.get(key)
            if old and old['status'] != 'failed':
                self.send_json(public(old), 202)
                return
            if sum(1 for j in CATALOGUES.values() if j['status'] not in ('ready', 'failed')) >= 1 + limits.CATALOGUE_MAX_QUEUE:
                self.send_json({'error': 'Catalogue queue is full'}, 429)
                return
            for k, j in list(CATALOGUES.items()):
                if j['status'] in ('ready', 'failed') and time.time() - j['updated'] > 3600:
                    del CATALOGUES[k]
            CATALOGUES[key] = {'status': 'queued', 'created': time.time(), 'updated': time.time()}
        threading.Thread(target=catalogue, args=(key, job), daemon=True).start()
        self.send_json({'status': 'queued'}, 202)

    def do_POST(self):
        if not self.authorized():
            return
        if self.path.startswith('/sessions'):
            self.sessions('POST')
            return
        if self.path == '/catalogues':
            self.catalogue_job()
            return
        if self.path != '/rehearsals':
            self.send_json({'error': 'Not found'}, 404)
            return
        import contracts
        import limits
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 1_000_000:
                raise ValueError('request body must be 1 byte to 1 MB')
            job = json.loads(self.rfile.read(length))
            errs = contracts.errors('job', job)
            if errs:
                raise ValueError('; '.join(errs[:3]))
        except (ValueError, TypeError) as e:
            self.send_json({'error': 'Invalid rehearsal request: ' + str(e)[:300]}, 400)
            return
        key = job['key']
        with LOCK:
            old = JOBS.get(key)
            if old and old['status'] != 'failed':
                self.send_json(public(old), 202)  # already held (queued, running or ready): accepted
                return
            if sum(1 for j in JOBS.values() if j['status'] not in ('ready', 'failed')) >= 1 + limits.MAX_QUEUE:
                self.send_json({'error': 'Rehearsal queue is full'}, 429)
                return
            for k, j in list(JOBS.items()):
                if j['status'] in ('ready', 'failed') and time.time() - j['updated'] > 3600:
                    del JOBS[k]
            JOBS[key] = {'status': 'queued', 'created': time.time(), 'updated': time.time()}  # a failed job under the same key is replaced (Retry)
        threading.Thread(target=run, args=(key, job), daemon=True).start()
        self.send_json({'status': 'queued'}, 202)


def main() -> None:
    global TOKEN, MODEL
    missing = missing_env()
    if missing:
        sys.exit('rehearsal server.py refuses to start: missing environment variable(s): ' + ', '.join(missing) + '. Set all of ' + ', '.join(REQUIRED_ENV) + ' (values are never printed).')
    TOKEN = os.environ['REHEARSAL_WORKER_TOKEN']
    from model import AnthropicModel
    MODEL = AnthropicModel()
    import sessions
    threading.Thread(target=sessions.reaper_loop, daemon=True).start()  # terminates orphaned, expired and idle session sandboxes
    server = ThreadingHTTPServer((os.environ.get('REHEARSAL_HOST', '127.0.0.1'), PORT), Handler)
    print(f'rehearsal controller listening on {server.server_address[0]}:{PORT} (provider: modal)', flush=True)
    server.serve_forever()


if __name__ == '__main__':
    main()
