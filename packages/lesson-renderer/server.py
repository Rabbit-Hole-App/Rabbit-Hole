"""Private, bounded Blender worker. Cloudflare owns durable jobs and stored outputs."""
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
from repository_jobs import handle as repository_request

ROOT = Path(__file__).parent
TOKEN = os.environ['SCENE_WORKER_TOKEN']
COMPILER_HASH = hashlib.sha256(b''.join((ROOT/name).read_bytes() for name in ('scene-schema.json', 'validation.py', 'compile_scene.py'))).hexdigest()[:12]
VERSION = 'compiler-1-' + COMPILER_HASH + '/' + subprocess.check_output(['blender', '--version'], text=True).splitlines()[0]
JOBS = {}; LOCK = threading.Lock(); SLOT = threading.BoundedSemaphore(1)
MAX_ASSET = 20*1024*1024

def run(key, scene):
    directory = Path(tempfile.mkdtemp(prefix='lesson-'))
    try:
        source, output = directory/'scene.json', directory/'scene.glb'
        source.write_text(json.dumps(scene))
        # The child receives no service credentials and runs a fixed, trusted compiler.
        env = {'PATH': '/usr/local/bin:/usr/bin:/bin', 'HOME': str(directory), 'OMP_NUM_THREADS': '1', 'OPENBLAS_NUM_THREADS': '1'}
        result = subprocess.run(['blender', '--background', '--factory-startup', '--disable-autoexec', '--threads', '1', '--python-exit-code', '1', '--python', str(ROOT/'compile_scene.py'), '--', str(source), str(output)], env=env, cwd=directory, timeout=90, capture_output=True)
        if result.returncode or not output.exists():
            print('Blender compile failed:', result.stderr[-1500:].decode(errors='replace'), result.stdout[-1500:].decode(errors='replace'), flush=True)
            raise ValueError('Blender could not export this scene')
        if output.stat().st_size > MAX_ASSET: raise ValueError('Export exceeds the 20 MB model limit')
        with LOCK: JOBS[key] = {'status': 'ready', 'asset': output.read_bytes(), 'updated': time.time()}
    except subprocess.TimeoutExpired:
        with LOCK: JOBS[key] = {'status': 'failed', 'error': 'Scene export exceeded 90 seconds', 'updated': time.time()}
    except Exception as error:
        with LOCK: JOBS[key] = {'status': 'failed', 'error': str(error), 'updated': time.time()}
    finally:
        shutil.rmtree(directory); SLOT.release()

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_): pass
    def send_json(self, data, status=200):
        body = json.dumps(data).encode(); self.send_response(status); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)
    def authorized(self):
        if not hmac.compare_digest(self.headers.get('Authorization', ''), 'Bearer '+TOKEN): self.send_json({'error':'Unauthorized'},401); return False
        return True
    def do_GET(self):
        if repository_request(self, 'GET'): return
        if self.path == '/health': self.send_json({'ok':True,'version':VERSION}); return
        if not self.authorized(): return
        match = re.fullmatch(r'/jobs/([a-f0-9]{64})(/asset)?', self.path)
        if not match: self.send_json({'error':'Not found'},404); return
        with LOCK: job = JOBS.get(match[1])
        if not job: self.send_json({'error':'Job not found'},404); return
        if match[2]:
            if job['status'] != 'ready': self.send_json({'error':'Not ready'},409); return
            self.send_response(200); self.send_header('Content-Type','model/gltf-binary'); self.send_header('Content-Length',str(len(job['asset']))); self.end_headers(); self.wfile.write(job['asset']); return
        self.send_json({k:v for k,v in job.items() if k != 'asset'})
    def do_POST(self):
        if repository_request(self, 'POST'): return
        if not self.authorized(): return
        if self.path != '/jobs': self.send_json({'error':'Not found'},404); return
        try:
            length = int(self.headers.get('Content-Length','0'))
            if not 0 < length <= 64000: raise ValueError('Scene request must fit within 64 KB')
            body = json.loads(self.rfile.read(length)); scene = validate(body['operation']); key = body['key']
            if not re.fullmatch('[a-f0-9]{64}', key): raise ValueError('Invalid job key')
            if body.get('version') != VERSION: self.send_json({'error':'Worker version changed; resubmit with current version'},409); return
            with LOCK:
                for old, job in list(JOBS.items()):
                    if job['status'] != 'rendering' and time.time()-job['updated'] > 600: del JOBS[old]
                if key in JOBS: self.send_json({'key':key,'status':JOBS[key]['status']},202); return
                if len(JOBS) >= 10 or not SLOT.acquire(blocking=False): self.send_json({'error':'Worker is busy'},429); return
                JOBS[key] = {'status':'rendering','updated':time.time()}
            threading.Thread(target=run,args=(key,scene),daemon=True).start()
            self.send_json({'key':key,'status':'rendering'},202)
        except (ValueError, KeyError, TypeError): self.send_json({'error':'Invalid scene specification'},400)

if __name__ == '__main__':
    print(f'Lesson worker ready: {VERSION}',flush=True)
    ThreadingHTTPServer(('0.0.0.0',8080),Handler).serve_forever()
