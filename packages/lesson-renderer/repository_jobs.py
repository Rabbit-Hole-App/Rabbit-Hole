"""Bounded asynchronous index jobs, behind the existing worker authentication."""
import json
import os
import re
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

JOBS = {}; LOCK = threading.Lock(); SLOT = threading.BoundedSemaphore(1)

def metadata(handler):
    if not handler.authorized(): return
    try:
        length=int(handler.headers.get('Content-Length','0'))
        if not 0<length<=2000: raise ValueError('Invalid repository request')
        body=json.loads(handler.rfile.read(length));repo=body['repo']
        if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+',repo): raise ValueError('Invalid repository')
        # Git's public refs protocol lists branches without credentials or GitHub REST rate limits.
        # No checkout, hooks, submodules, repository configuration or executable source is loaded.
        with tempfile.TemporaryDirectory(prefix='public-refs-') as directory:
            env={'PATH':os.environ.get('PATH',''),'HOME':directory,'GIT_TERMINAL_PROMPT':'0','GIT_CONFIG_NOSYSTEM':'1'}
            result=subprocess.run(['git','ls-remote','--symref','--',f'https://github.com/{repo}.git','HEAD','refs/heads/*'],
                                  env=env,cwd=directory,timeout=15,capture_output=True,text=True)
        if result.returncode: raise ValueError('Public repository was not found or GitHub is unavailable')
        if len(result.stdout)>1024*1024: raise ValueError('Repository has too many branch references')
        branches={};default=None
        for line in result.stdout.splitlines():
            if line.startswith('ref: refs/heads/') and line.endswith('\tHEAD'):default=line.split('\t')[0][len('ref: refs/heads/'):]
            else:
                parts=line.split('\t')
                if len(parts)==2 and parts[1].startswith('refs/heads/') and re.fullmatch('[a-f0-9]{40}',parts[0]):branches[parts[1][11:]]=parts[0]
        if not branches:raise ValueError('Repository has no branches')
        if body.get('branch') is not None:
            if body['branch'] not in branches:raise ValueError('Branch not found')
            handler.send_json({'commit':branches[body['branch']]});return
        page=max(1,min(100,int(body.get('page',1))));names=sorted(branches)
        handler.send_json({'repo':repo,'defaultBranch':default or names[0],'branches':names[(page-1)*100:page*100],'hasMore':len(names)>page*100,'page':page})
    except (ValueError,TypeError,KeyError,subprocess.TimeoutExpired) as error:handler.send_json({'error':str(error)},400)

def run(key, body):
    try:
        with tempfile.TemporaryDirectory(prefix='index-job-') as directory:
            source, output = Path(directory)/'request.json', Path(directory)/'result.json'
            source.write_text(json.dumps(body))
            env = {'PATH': os.environ.get('PATH', ''), 'HOME': directory, 'SYSTEMROOT': os.environ.get('SYSTEMROOT', ''), 'OPENBLAS_NUM_THREADS': '1'}
            result = subprocess.run([sys.executable, str(Path(__file__).with_name('index_repository.py')), str(source), str(output)],
                                    cwd=directory, env=env, timeout=120, capture_output=True)
            if result.returncode: raise ValueError('Indexing failed: ' + result.stderr.decode(errors='replace').splitlines()[-1][:300])
            if output.stat().st_size > 20*1024*1024: raise ValueError('Index exceeds 20 MB')
            with LOCK: JOBS[key] = {'status': 'ready', 'asset': output.read_bytes(), 'updated': time.time()}
    except Exception as error:
        with LOCK: JOBS[key] = {'status': 'failed', 'error': str(error), 'updated': time.time()}
    finally: SLOT.release()

def handle(handler, method):
    if handler.path=='/repository-metadata' and method=='POST':metadata(handler);return True
    match = re.fullmatch(r'/repositories(?:/([a-f0-9]{64})(/asset)?)?', handler.path)
    if not match: return False
    if not handler.authorized(): return True
    if method == 'GET' and match[1]:
        with LOCK: job = JOBS.get(match[1])
        if not job: handler.send_json({'error':'Job not found'},404)
        elif match[2] and job['status'] == 'ready':
            handler.send_response(200); handler.send_header('Content-Type','application/json'); handler.send_header('Content-Length',str(len(job['asset']))); handler.end_headers(); handler.wfile.write(job['asset'])
        else: handler.send_json({k:v for k,v in job.items() if k != 'asset'})
        return True
    if method != 'POST' or match[1]: handler.send_json({'error':'Method not allowed'},405); return True
    try:
        length = int(handler.headers.get('Content-Length','0'))
        if not 0 < length <= 2000: raise ValueError('Invalid index request')
        body = json.loads(handler.rfile.read(length)); key = body['key']
        if not re.fullmatch('[a-f0-9]{64}', key) or not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', body['repo']) or not re.fullmatch('[a-f0-9]{40}', body['commit']): raise ValueError('Invalid repository')
        with LOCK:
            for old, job in list(JOBS.items()):
                if job['status'] != 'indexing' and time.time()-job['updated'] > 600: del JOBS[old]
            if key in JOBS: handler.send_json({'status':JOBS[key]['status']},202); return True
            if len(JOBS) >= 4 or not SLOT.acquire(blocking=False): handler.send_json({'error':'Indexer busy'},429); return True
            JOBS[key] = {'status':'indexing','updated':time.time()}
        threading.Thread(target=run,args=(key,body),daemon=True).start()
        handler.send_json({'status':'indexing'},202)
    except (ValueError, TypeError, KeyError): handler.send_json({'error':'Invalid index request'},400)
    return True
