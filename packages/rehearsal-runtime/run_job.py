"""python run_job.py <job.json> <out_dir>: run one job end to end (the same code path as the server, no HTTP) and write record.json, logs/ and produced files to out_dir.
job.json follows schemas/job.json; `key` may be omitted (sha256 of repo|commit|hardware is used) and `readme`/`files` may be empty (they are read from the clone)."""
import hashlib
import io
import json
import os
import sys
import zipfile
from pathlib import Path

REQUIRED_ENV = ('ANTHROPIC_API_KEY', 'MODAL_TOKEN_ID', 'MODAL_TOKEN_SECRET')


def main() -> int:
    if len(sys.argv) != 3:
        sys.exit('usage: python run_job.py <job.json> <out_dir>')
    missing = [n for n in REQUIRED_ENV if not os.environ.get(n)]
    if missing:
        sys.exit('run_job.py refuses to run: missing environment variable(s): ' + ', '.join(missing) + ' (values are never printed)')
    import contracts
    from model import AnthropicModel
    from providers.modal_sandbox import ModalSandbox
    from rehearsal import run_rehearsal
    job = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
    for k, v in (('hardware', 'cpu'), ('timeBudgetMin', 20), ('readme', ''), ('files', []), ('version', 'rehearsal-1')):
        job.setdefault(k, v)
    job.setdefault('key', hashlib.sha256(f"{job['repo']}|{job['commit']}|{job['hardware']}".encode()).hexdigest())
    errs = contracts.errors('job', job)
    if errs:
        sys.exit('invalid job: ' + '; '.join(errs[:3]))
    prov = ModalSandbox(on_created=lambda i: print('sandbox created:', i, flush=True))
    out = run_rehearsal(job, prov, AnthropicModel(), lambda s, step=None, attempt=None, fixes=None: print('status:', s, step or '', attempt or '', flush=True),
                        escalation_model=os.environ.get('REHEARSAL_MODEL', ''))
    dest = Path(sys.argv[2])
    dest.mkdir(parents=True, exist_ok=True)
    if out.zip:
        zipfile.ZipFile(io.BytesIO(out.zip)).extractall(dest)
    r = out.record or {}
    print(json.dumps({'status': out.status, 'error': out.error, 'wallSec': r.get('wallSec'), 'allChecksPassed': r.get('allChecksPassed'), 'fixes': [(f['kind'], f['change']) for f in r.get('fixes', [])],
                      'modelSpendUsd': r.get('modelSpendUsd'), 'sandboxSpendNote': r.get('sandboxSpendNote'), 'sandboxId': r.get('sandboxId'), 'terminated': r.get('terminated'),
                      'image': r.get('image'), 'billing': out.spend}, indent=2))
    # the Sandbox.list result for this job's key tag, asked once more independently of the record
    print('Sandbox.list(app, tags={job: key}) ->', prov.leftover({'job': job['key']}) if prov.app else 'no sandbox was created')
    return 0 if out.status == 'ready' else 1


if __name__ == '__main__':
    sys.exit(main())
