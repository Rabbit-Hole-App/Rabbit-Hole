"""The provider interface: one sandbox per job. Real: modal_sandbox.py. Tests only: fake.py (format: schemas/fake-script.json)."""
from dataclasses import dataclass
from typing import Optional, Protocol


@dataclass
class ExecResult:
    rc: int
    stdout: str
    stderr: str
    sec: float


@dataclass
class FileStat:
    bytes: int
    sha256: Optional[str] = None


class ScriptError(Exception):
    """The fake provider was asked for a command its script does not answer."""


class Provider(Protocol):
    sandbox_id: str
    image: dict  # {'ref': str, 'digest': 'sha256:<hex>'}

    def start(self, tags: dict) -> None:
        """Create the sandbox (2 CPU / 4 GiB, timeout=JOB_WALL_SEC, idle_timeout=SANDBOX_IDLE_TIMEOUT_SEC) tagged with
        `tags` (job, repo, commit, hardware; at most 10 tags, key <= 63 chars). Store sandbox_id in the job state at once so a restarted controller can terminate an orphan."""

    def exec(self, cmd: str, timeout: int, cwd: str = '/work') -> ExecResult:
        """Run one shell command; on timeout return rc=124 and what was captured, never raise."""

    def stat(self, paths: list) -> dict:
        """{path: FileStat} for the paths that exist; absent paths are left out."""

    def fetch(self, path: str) -> bytes:
        """The file's bytes (artifact copy and read_file)."""

    def stop(self) -> bool:
        """terminate(wait=True) (SIGKILL, returncode 137); True once confirmed gone, never assumed. Always called in `finally`."""

    def leftover(self, tags: dict) -> list:
        """Ids of this app's sandboxes still listed for `tags` (Sandbox.list(app_id=..., tags=...)); must be [] after a job."""
