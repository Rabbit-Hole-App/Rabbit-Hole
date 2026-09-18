"""Private, bounded manim worker. Cloudflare owns durable jobs and stored outputs.

Same contract as the Blender worker in packages/lesson-renderer: token auth,
one render at a time, a fixed trusted compiler, and no service credentials in
the child process.
"""
import hashlib
import hmac
import json
import os
import re
import shutil
import subprocess
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from validation import validate

ROOT = Path(__file__).parent
TOKEN = os.environ['MATH_WORKER_TOKEN']
COMPILER_HASH = hashlib.sha256(b''.join((ROOT / name).read_bytes() for name in ('math-schema.json', 'validation.py', 'compile_math.py'))).hexdigest()[:12]
VERSION = 'math-1-' + COMPILER_HASH + '/' + subprocess.check_output(['python3', '-c', 'import manim; print(manim.__version__)'], text=True).strip()
JOBS = {}
LOCK = threading.Lock()
SLOT = threading.BoundedSemaphore(1)
MAX_ASSET = 25 * 1024 * 1024
# Manim renders frame by frame on one shared CPU, so it needs materially more
# room than the Blender export does; 45s of animation is the schema's limit.
RENDER_TIMEOUT = 420


def run(key, spec):
    directory = Path(tempfile.mkdtemp(prefix='math-'))
    try:
        source, output = directory / 'spec.json', directory / 'animation.mp4'
        source.write_text(json.dumps(spec))
        # The child receives no service credentials, and TeX runs with shell
        # escape disabled so a LaTeX fragment cannot start a process.
        env = {
            'PATH': '/usr/local/bin:/usr/bin:/bin', 'HOME': str(directory),
            'OMP_NUM_THREADS': '1', 'OPENBLAS_NUM_THREADS': '1',
            'MPLCONFIGDIR': str(directory), 'TEXMFVAR': str(directory / 'texmf'),
            'openout_any': 'p', 'shell_escape': 'f',
        }
        result = subprocess.run(['python3', str(ROOT / 'compile_math.py'), str(source), str(output)],
                                env=env, cwd=directory, timeout=RENDER_TIMEOUT, capture_output=True)
        if result.returncode or not output.exists():
            print('manim render failed:', result.stderr[-1500:].decode(errors='replace'), result.stdout[-1500:].decode(errors='replace'), flush=True)
            raise ValueError('The animation could not be rendered')
        if output.stat().st_size > MAX_ASSET:
            raise ValueError('The rendered animation exceeds the 25 MB limit')
        with LOCK:
            JOBS[key] = {'status': 'ready', 'asset': output.read_bytes(), 'updated': time.time()}
    except subprocess.TimeoutExpired:
        with LOCK:
            JOBS[key] = {'status': 'failed', 'error': f'Rendering exceeded {RENDER_TIMEOUT} seconds', 'updated': time.time()}
    except Exception as error:
        with LOCK:
            JOBS[key] = {'status': 'failed', 'error': str(error), 'updated': time.time()}
    finally:
        shutil.rmtree(directory, ignore_errors=True)
        SLOT.release()


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

    def authorized(self):
        if not hmac.compare_digest(self.headers.get('Authorization', ''), 'Bearer ' + TOKEN):
            self.send_json({'error': 'Unauthorized'}, 401)
            return False
        return True

    def do_GET(self):
        if self.path == '/health':
            self.send_json({'ok': True, 'version': VERSION})
            return
        if not self.authorized():
            return
        match = re.fullmatch(r'/jobs/([a-f0-9]{64})(/asset)?', self.path)
        if not match:
            self.send_json({'error': 'Not found'}, 404)
            return
        with LOCK:
            job = JOBS.get(match[1])
        if not job:
            self.send_json({'error': 'Job not found'}, 404)
            return
        if match[2]:
            if job['status'] != 'ready':
                self.send_json({'error': 'Not ready'}, 409)
                return
            self.send_response(200)
            self.send_header('Content-Type', 'video/mp4')
            self.send_header('Content-Length', str(len(job['asset'])))
            self.end_headers()
            self.wfile.write(job['asset'])
            return
        self.send_json({k: v for k, v in job.items() if k != 'asset'})

    def do_POST(self):
        if not self.authorized():
            return
        if self.path != '/jobs':
            self.send_json({'error': 'Not found'}, 404)
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 64000:
                raise ValueError('An animation request must fit within 64 KB')
            body = json.loads(self.rfile.read(length))
            spec = validate(body['operation'])
            key = body['key']
            if not re.fullmatch('[a-f0-9]{64}', key):
                raise ValueError('Invalid job key')
            if body.get('version') != VERSION:
                self.send_json({'error': 'Worker version changed; resubmit with current version'}, 409)
                return
            with LOCK:
                for old, job in list(JOBS.items()):
                    if job['status'] != 'rendering' and time.time() - job['updated'] > 600:
                        del JOBS[old]
                if key in JOBS:
                    self.send_json({'key': key, 'status': JOBS[key]['status']}, 202)
                    return
                if len(JOBS) >= 10 or not SLOT.acquire(blocking=False):
                    self.send_json({'error': 'Worker is busy'}, 429)
                    return
                JOBS[key] = {'status': 'rendering', 'updated': time.time()}
            threading.Thread(target=run, args=(key, spec), daemon=True).start()
            self.send_json({'key': key, 'status': 'rendering'}, 202)
        except (ValueError, KeyError, TypeError):
            self.send_json({'error': 'Invalid animation specification'}, 400)


if __name__ == '__main__':
    print(f'Math worker ready: {VERSION}', flush=True)
    ThreadingHTTPServer(('0.0.0.0', 8080), Handler).serve_forever()
