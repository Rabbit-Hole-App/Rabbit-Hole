# runner.py — job wrapper baked into every kind = "job" image. stdlib only.
# Runs the entry command, captures stdout+stderr line by line, POSTs them in
# batches to the control plane, then POSTs the exit code and exits with it.
# Usage: python runner.py <job command...>
# Env: SMALL_API, SMALL_RUN_ID, SMALL_RUN_TOKEN (set by the control plane).
import json
import os
import subprocess
import sys
import threading
import time
import urllib.request

API = os.environ["SMALL_API"]
RUN_ID = os.environ["SMALL_RUN_ID"]
TOKEN = os.environ["SMALL_RUN_TOKEN"]

_buf = []
_lock = threading.Lock()


def _post(payload):
    data = json.dumps(payload).encode()
    # ponytail: 3 attempts then drop the batch — the job itself must not die on log hiccups
    for delay in (0, 1, 5):
        time.sleep(delay)
        try:
            req = urllib.request.Request(
                f"{API}/api/runs/{RUN_ID}/log",
                data=data,
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {TOKEN}"},
                method="POST",
            )
            urllib.request.urlopen(req, timeout=10)
            return
        except OSError:
            pass


def _flush(exit_code=None):
    with _lock:
        lines, _buf[:] = _buf[:], []
    if lines or exit_code is not None:
        payload = {"lines": lines}
        if exit_code is not None:
            payload["exitCode"] = exit_code
        _post(payload)


def _reader(stream):
    for raw in iter(stream.readline, b""):
        line = raw.decode("utf-8", "replace").rstrip("\r\n")
        with _lock:
            _buf.append(line)


def _flusher(done):
    while not done.wait(1):
        _flush()


def main():
    if len(sys.argv) < 2:
        sys.exit("usage: runner.py <job command...>")
    # stderr merged into stdout: one ordered stream, one reader thread
    proc = subprocess.Popen(sys.argv[1:], stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    reader = threading.Thread(target=_reader, args=(proc.stdout,), daemon=True)
    reader.start()
    done = threading.Event()
    threading.Thread(target=_flusher, args=(done,), daemon=True).start()
    code = proc.wait()
    reader.join(timeout=10)
    done.set()
    _flush(exit_code=code)
    sys.exit(code)


if __name__ == "__main__":
    main()
