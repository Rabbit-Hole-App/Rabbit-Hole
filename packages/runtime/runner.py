# runner.py — job wrapper baked into every kind = "job" image. stdlib only.
# Runs the entry command, captures stdout+stderr line by line, POSTs them in
# batches to the control plane, then POSTs the exit code and exits with it.
# Inputs (SMALL_RUN_INPUTS, set per run): scalars become SMALL_INPUT_<NAME> env
# vars, files land in $SMALL_INPUTS, everything in $SMALL_INPUTS/inputs.json.
# Every file the job leaves in $SMALL_OUTPUTS is uploaded on exit, declared or not.
# Usage: python runner.py <job command...>
# Env: SMALL_API, SMALL_RUN_ID, SMALL_RUN_TOKEN (set by the control plane).
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

API = os.environ["SMALL_API"]
RUN_ID = os.environ["SMALL_RUN_ID"]
TOKEN = os.environ["SMALL_RUN_TOKEN"]
INPUTS_DIR = os.environ.get("SMALL_INPUTS") or os.path.join(tempfile.gettempdir(), "small-inputs")
OUTPUTS_DIR = os.environ.get("SMALL_OUTPUTS") or os.path.join(tempfile.gettempdir(), "small-outputs")

_buf = []
_lock = threading.Lock()


def _post(payload):
    data = json.dumps(payload).encode()
    # ponytail: 3 attempts then drop the batch — the job itself must not die on log hiccups
    err = None
    for delay in (0, 1, 5):
        time.sleep(delay)
        try:
            req = urllib.request.Request(
                f"{API}/api/runs/{RUN_ID}/log",
                data=data,
                # custom UA: the default Python-urllib agent trips Cloudflare's bot block (error 1010)
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {TOKEN}", "User-Agent": "small-runner"},
                method="POST",
            )
            urllib.request.urlopen(req, timeout=10)
            return
        except urllib.error.HTTPError as e:
            err = f"HTTP {e.code} {e.read()[:200]!r}"
        except OSError as e:
            err = repr(e)
    # a dropped batch is a real failure for a log shipper — surface it on our own
    # stderr (flows to the platform console), never into the captured child stream
    print(f"runner: log POST to {API} failed after retries: {err}", file=sys.__stderr__)


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


def _authed(url, data=None, method="GET", ctype=None):
    headers = {"Authorization": f"Bearer {TOKEN}", "User-Agent": "small-runner"}
    if ctype:
        headers["Content-Type"] = ctype
    return urllib.request.Request(url, data=data, headers=headers, method=method)


# Scalars -> SMALL_INPUT_<NAME> on the child env; files fetched from the control
# plane into $SMALL_INPUTS; everything -> inputs.json (file values as their path).
def _setup_inputs(child_env):
    spec = json.loads(os.environ.get("SMALL_RUN_INPUTS") or "{}")
    values = dict(spec.get("values") or {})
    files = spec.get("files") or {}
    for name, fname in files.items():
        dest = os.path.join(INPUTS_DIR, fname)
        req = _authed(f"{API}/api/runs/{RUN_ID}/inputs/{urllib.parse.quote(fname)}")
        with urllib.request.urlopen(req, timeout=120) as r, open(dest, "wb") as f:
            shutil.copyfileobj(r, f)
        values[name] = dest
    for name, val in values.items():
        if name in files:
            continue
        # bools as json ("true"/"false"), everything else str() — scripts compare strings
        child_env["SMALL_INPUT_" + name.upper()] = json.dumps(val) if isinstance(val, bool) else str(val)
    with open(os.path.join(INPUTS_DIR, "inputs.json"), "w") as f:
        json.dump(values, f)
    # the run log opens with where every input landed — file paths for uploads,
    # values for scalars — so nobody greps the source to find them
    with _lock:
        for name, val in values.items():
            tag = "file" if name in files else "value"
            _buf.append(f"runner: input {name} ({tag}) = {str(val)[:200]}")
        _buf.append(f"runner: outputs folder {OUTPUTS_DIR} (files saved there appear on the run)")


# One attempt per file; a failed upload becomes a run-log line, never a crash.
# ponytail: whole file in memory — fine under the 100 MB cap and 2GB machine.
def _upload_outputs():
    n_ok = 0
    for root, _, names in os.walk(OUTPUTS_DIR):
        for n in names:
            p = os.path.join(root, n)
            rel = os.path.relpath(p, OUTPUTS_DIR).replace(os.sep, "/")
            try:
                with open(p, "rb") as f:
                    data = f.read()
                req = _authed(
                    f"{API}/api/runs/{RUN_ID}/outputs/{urllib.parse.quote(rel, safe='')}",
                    data=data, method="POST", ctype="application/octet-stream",
                )
                urllib.request.urlopen(req, timeout=120)
                n_ok += 1
                with _lock:
                    _buf.append(f"runner: output {rel} ({len(data)} bytes) saved to the run")
            except (OSError, urllib.error.HTTPError) as e:
                with _lock:
                    _buf.append(f"runner: output upload failed {rel}: {e}")
    if n_ok == 0:
        with _lock:
            _buf.append(f"runner: no output files - nothing was written to {OUTPUTS_DIR}")


def main():
    if len(sys.argv) < 2:
        sys.exit("usage: runner.py <job command...>")
    os.makedirs(INPUTS_DIR, exist_ok=True)
    os.makedirs(OUTPUTS_DIR, exist_ok=True)
    child_env = dict(os.environ, SMALL_INPUTS=INPUTS_DIR, SMALL_OUTPUTS=OUTPUTS_DIR)
    try:
        _setup_inputs(child_env)
    except Exception as e:  # noqa: BLE001 — any input failure must fail the run, not hang it
        with _lock:
            _buf.append(f"runner: inputs failed: {e}")
        _flush(exit_code=1)
        sys.exit(1)
    # stderr merged into stdout: one ordered stream, one reader thread
    proc = subprocess.Popen(sys.argv[1:], env=child_env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    reader = threading.Thread(target=_reader, args=(proc.stdout,), daemon=True)
    reader.start()
    done = threading.Event()
    threading.Thread(target=_flusher, args=(done,), daemon=True).start()
    code = proc.wait()
    reader.join(timeout=10)
    done.set()
    _upload_outputs()  # before the exit-code post: "finished" must mean outputs are listable
    _flush(exit_code=code)
    sys.exit(code)


if __name__ == "__main__":
    main()
