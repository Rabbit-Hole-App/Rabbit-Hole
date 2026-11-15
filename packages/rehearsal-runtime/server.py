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

REQUIRED_ENV = ('ANTHROPIC_API_KEY', 'MODAL_TOKEN_ID', 'MODAL_TOKEN_SECRET', 'REHEARSAL_WORKER_TOKEN')
PORT = int(os.environ.get('REHEARSAL_PORT', '8891'))
JOBS: dict = {}
LOCK = threading.Lock()
SLOT = threading.BoundedSemaphore(1)
KEY_PATH = re.compile(r'/rehearsals/([a-f0-9]{64})(/asset)?')
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
    except Exception as e:  # noqa: BLE001 - the job must end in a state the control plane can read
        with LOCK:
            JOBS[key].update(status='failed', error=f'internal_error: {type(e).__name__}: {e}', finished=time.time(), updated=time.time())
    finally:
        SLOT.release()


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

    def do_POST(self):
        if not self.authorized():
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
    server = ThreadingHTTPServer((os.environ.get('REHEARSAL_HOST', '127.0.0.1'), PORT), Handler)
    print(f'rehearsal controller listening on {server.server_address[0]}:{PORT} (provider: modal)', flush=True)
    server.serve_forever()


if __name__ == '__main__':
    main()
