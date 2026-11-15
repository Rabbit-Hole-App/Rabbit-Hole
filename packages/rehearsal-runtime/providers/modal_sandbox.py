"""The only provider: one long-lived Modal Sandbox per job. Network is open this sprint (known limitation); the sandbox is never given a secret; no GPU anywhere."""
import hashlib
import json
import shlex
import threading
import time

import limits
from providers.base import ExecResult, FileStat

APP_NAME = 'rabbit-hole-rehearsal'
REPO_DIR = '/work/repo'
IMAGE_SPEC = {  # pinned recipe; the digest recorded in the job record is sha256 of this spec (Modal exposes an image id, not a registry digest)
    'base': 'python:3.12-slim',
    'apt': ['git', 'ca-certificates'],
    'pip': [{'packages': ['torch'], 'index_url': 'https://download.pytorch.org/whl/cpu'}, {'packages': ['numpy']}],  # CPU wheel; the probe checks no nvidia/cuda packages came with it
    'run': ['mkdir -p /work/repo'],  # the sandbox workdir must exist
}  # requests and tiktoken are deliberately NOT baked: the route's install step (or a repair) has to bring them


def image_digest() -> str:
    return 'sha256:' + hashlib.sha256(json.dumps(IMAGE_SPEC, sort_keys=True).encode()).hexdigest()


class ModalSandbox:
    def __init__(self, on_created=None, root: str = REPO_DIR):
        self.on_created = on_created  # called with the sandbox id the moment it exists, so a restarted controller can terminate an orphan
        self.root = root
        self.sandbox_id = ''
        self.image: dict = {}
        self.image_build_sec = 0.0
        self.app = None
        self.sb = None
        self.extra_domains: list = []  # allow_domain fixes (set by the orchestrator before a re-create)

    # -- lifecycle
    def start(self, tags: dict) -> None:
        import modal
        self.app = modal.App.lookup(APP_NAME, create_if_missing=True)
        image = modal.Image.from_registry(IMAGE_SPEC['base']).apt_install(*IMAGE_SPEC['apt'])
        for spec in IMAGE_SPEC['pip']:
            image = image.pip_install(*spec['packages'], **({'index_url': spec['index_url']} if 'index_url' in spec else {}))
        image = image.run_commands(*IMAGE_SPEC['run'])
        t = time.time()
        image.build(self.app)
        build = time.time() - t
        self.image_build_sec = round(build, 1) if build > 5 else 0.0  # a cached image answers in well under 5 s
        self.image = {'ref': f'modal:{image.object_id} ({IMAGE_SPEC["base"]})', 'digest': image_digest()}
        # timeout and idle_timeout are set explicitly (the default lifetime is 5 minutes and would kill training). Network: TLS domain allowlist only (spec 8a), no CIDR ranges.
        # No secrets= and no name=; env is the only thing injected.
        self.sb = modal.Sandbox.create('sleep', 'infinity', app=self.app, image=image, cpu=limits.SANDBOX_CPU, memory=limits.SANDBOX_MEMORY_MIB,
                                       timeout=limits.JOB_WALL_SEC, idle_timeout=limits.SANDBOX_IDLE_TIMEOUT_SEC, workdir='/work', tags=dict(tags),
                                       env={'PYTHONUNBUFFERED': '1', 'OMP_NUM_THREADS': '2'},
                                       outbound_domain_allowlist=limits.OUTBOUND_DOMAIN_ALLOWLIST + self.extra_domains, outbound_cidr_allowlist=[])
        self.sandbox_id = self.sb.object_id
        if self.on_created:
            self.on_created(self.sandbox_id)

    def stop(self) -> bool:
        """terminate(wait=True) (returncode 137); True only once the sandbox reports finished."""
        if self.sb is None:
            return False
        try:
            self.sb.terminate(wait=True)
            return self.sb.poll() is not None
        except Exception:
            return False

    def leftover(self, tags: dict) -> list:
        import modal
        ids = []
        for _ in range(3):  # a just-terminated sandbox can stay listed for a moment
            ids = [s.object_id for s in modal.Sandbox.list(app_id=self.app.app_id, tags=dict(tags))]
            if not ids:
                break
            time.sleep(2)
        return ids

    # -- commands and files
    def exec(self, cmd: str, timeout: int, cwd: str = '/work') -> ExecResult:
        import modal.exception as mexc
        t = time.time()
        out, err, fail = [], [], []
        p = self.sb.exec('bash', '-lc', f'cd {shlex.quote(cwd)} && {cmd}', timeout=int(timeout))

        def drain(stream, sink):
            try:
                for chunk in stream:
                    sink.append(chunk)
            except Exception as e:  # noqa: BLE001 - a stream failure is recorded, then handled below
                fail.append(e)
        threads = [threading.Thread(target=drain, args=(p.stdout, out), daemon=True), threading.Thread(target=drain, args=(p.stderr, err), daemon=True)]
        for th in threads:
            th.start()
        timed_out = False
        try:
            rc = p.wait()
        except mexc.TimeoutError:
            rc, timed_out = 124, True
        for th in threads:
            th.join(30)
        if any(isinstance(e, mexc.TimeoutError) for e in fail) or rc == -1:
            rc, timed_out = 124, True
        elif fail:
            raise fail[0]
        return ExecResult(124 if timed_out else rc, ''.join(out), ''.join(err), round(time.time() - t, 2))

    def stat(self, paths: list) -> dict:
        """{path: FileStat} for existing regular files; paths are relative to the repository root."""
        if not paths:
            return {}
        script = 'for p in ' + ' '.join(shlex.quote(p) for p in paths) + '; do if [ -f "$p" ]; then printf \'%s %s %s\\n\' "$(stat -c %s "$p")" "$(sha256sum "$p" | cut -d" " -f1)" "$p"; fi; done'
        r = self.exec(script, 300, self.root)
        res = {}
        for line in r.stdout.splitlines():
            size, sha, path = line.split(' ', 2)
            res[path] = FileStat(int(size), sha)
        return res

    def fetch(self, path: str) -> bytes:
        import modal.exception as mexc
        try:
            return self.sb.filesystem.read_bytes(f'{self.root}/{path}')
        except mexc.SandboxFilesystemNotFoundError as e:
            raise FileNotFoundError(path) from e
