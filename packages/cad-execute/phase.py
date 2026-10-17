"""Trusted phase launcher. Build and validation use separate OS sandboxes."""
import json
import subprocess
import sys
from pathlib import Path

job = json.loads(Path('/tmp/job/in/request.json').read_text())
phase = job['phase']
timeout = job['limits']['stage_seconds']
def run(args):
    subprocess.run(args, check=True, timeout=timeout, cwd='/tmp/job/out')

if phase == 'build':
    # The source must declare @step(out='/tmp/job/out/model.step').
    run([sys.executable, '/tmp/job/in/model.py'])
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
