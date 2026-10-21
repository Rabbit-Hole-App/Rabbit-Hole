"""Trusted phase launcher. Build and validation use separate OS sandboxes."""
import json
import os
import subprocess
import sys
from pathlib import Path

job = json.loads(Path('/tmp/job/in/request.json').read_text())
phase = job['phase']
timeout = job['limits']['stage_seconds']
def run(args, env=None):
    subprocess.run(args, check=True, timeout=timeout, cwd='/tmp/job/out', env=env)

if phase == 'build':
    # The source must declare @step(out='/tmp/job/out/model.step'). Only the parameter helper is added to its path;
    # validated values arrive as the read-only /tmp/job/in/parameters.json (cad-params/1).
    run([sys.executable, '/tmp/job/in/model.py'], env={**os.environ, 'PYTHONPATH': '/app/runtime'})
elif phase == 'check':
    run([sys.executable, '-I', '/app/validate.py'])
elif phase in ('glb', 'stl', '3mf'):
    run(['/opt/venv/bin/cadgen', phase, 'build', '/tmp/job/in/model.step', '/tmp/job/out/model.' + phase])
elif phase == 'thumbnail':
    run(['/opt/venv/bin/cadgen', 'step', 'snapshot', '/tmp/job/in/model.step', '/tmp/job/out/thumbnail.png'])
    from PIL import Image
    with Image.open('/tmp/job/out/thumbnail.png') as image:
        image.verify()
else:
    raise ValueError('Unknown phase')
