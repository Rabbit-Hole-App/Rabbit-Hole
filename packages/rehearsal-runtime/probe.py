"""A1 probe: python probe.py. ONE tagged sandbox from the pinned image, exec `python -V`, terminate(wait=True) in finally, Sandbox.list must be empty.
Prints sandbox id, Python version seen, terminated, leftover, the Modal profile/environment the token resolves to, the image check (no CUDA packages), the tags read back, and measured billing.
Reads MODAL_TOKEN_ID / MODAL_TOKEN_SECRET from the environment (names only, values never printed). Chargeable: the coordinator runs it, gated on a report."""
import hashlib
import json
import os
import sys
import time

import billing


def main() -> int:
    missing = [n for n in ('MODAL_TOKEN_ID', 'MODAL_TOKEN_SECRET') if not os.environ.get(n)]
    if missing:
        sys.exit('probe.py refuses to run: missing environment variable(s): ' + ', '.join(missing) + ' (values are never printed)')
    import modal
    from providers.modal_sandbox import IMAGE_SPEC, ModalSandbox
    key = hashlib.sha256(f'probe|{time.time()}'.encode()).hexdigest()  # a 64-hex tag value, the same shape a real job uses
    tags = {'job': key, 'repo': 'probe/rehearsal', 'commit': '0' * 40, 'hardware': 'cpu'}
    out = {'modalProfile': getattr(modal.config, '_profile', None), 'modalEnvironment': modal.config.config.get('environment') or '(default environment)',
           'imageSpec': IMAGE_SPEC, 'tags': tags}
    before = billing.snapshot(key)
    p = ModalSandbox(on_created=lambda i: print('sandbox created:', i, flush=True))
    t0 = time.time()
    try:
        p.start(tags)
        out['sandboxId'], out['image'], out['imageBuildSec'] = p.sandbox_id, p.image, p.image_build_sec
        r = p.exec('python -V', 60)
        out['pythonSeen'] = (r.stdout + r.stderr).strip()
        out['pythonRc'] = r.rc
        out['nvidiaOrCudaPackages'] = p.exec('pip list --format=freeze | grep -ciE "nvidia|cuda|triton" || true', 60).stdout.strip()  # must be 0: CPU wheel only
        out['torch'] = p.exec('python -c "import torch; print(torch.__version__, torch.cuda.is_available())"', 120).stdout.strip()
        out['tagsReadBack'] = p.sb.get_tags()
        fetch = "python -c \"import urllib.request as u; print(u.urlopen('%s', timeout=15).status)\" 2>&1 | tail -1"
        out['allowlistProof'] = {'pypi.org (expected 200)': p.exec(fetch % 'https://pypi.org/simple/', 60).stdout.strip(),
                                 'example.com (expected an error: not allowlisted)': p.exec(fetch % 'https://example.com/', 60).stdout.strip()[-200:]}
    finally:
        out['terminated'] = p.stop()
    out['leftover'] = p.leftover(tags) if p.app else []
    out['lifetimeSec'] = round(time.time() - t0, 1)
    after = billing.snapshot(key)
    out['billing'] = {'before': before, 'after': after, 'note': billing.spend_note(before, after, key, out['lifetimeSec'])}
    print(json.dumps(out, indent=2, default=str))
    return 0 if out.get('terminated') and not out['leftover'] and out.get('pythonRc') == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
