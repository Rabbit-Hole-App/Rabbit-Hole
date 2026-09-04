"""constants for tests."""

import os
import subprocess
from pathlib import Path

THIS_DIR = Path(__file__).parent
PROJECT_DIR = (THIS_DIR / "../").resolve()


def kill_tree(proc):
    """End a guard subprocess AND the app it spawned. On Windows, terminate() kills
    only the parent — the orphaned app keeps its port and breaks the next test run."""
    if os.name == "nt":
        subprocess.run(["taskkill", "/PID", str(proc.pid), "/T", "/F"], capture_output=True)
    else:
        proc.terminate()
    proc.wait(timeout=10)