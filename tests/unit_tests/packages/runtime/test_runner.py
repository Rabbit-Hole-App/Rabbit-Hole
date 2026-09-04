# Self-check for runner.py: lines reach the log endpoint in order, exit code posted, runner exits with it.
# Plus inputs/outputs: scalars as SMALL_INPUT_* env, files fetched into $SMALL_INPUTS,
# inputs.json written, everything in $SMALL_OUTPUTS uploaded before the exit-code post.
# Run: python test_runner.py  (or via pytest)
import json
import os
import subprocess
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
RUNNER = os.path.join(HERE, "..", "..", "..", "..", "packages", "runtime", "runner.py")
PORT = 18081

JOB = """
import sys, time
print("line one")
print("line two")
time.sleep(1.2)
print("boom", file=sys.stderr)
sys.exit(3)
"""

posts = []


class H(BaseHTTPRequestHandler):
    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0)
        posts.append((self.path, self.headers.get("Authorization"), json.loads(self.rfile.read(n))))
        body = b'{"ok": true}'
        self.send_response(200)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


def main():
    server = HTTPServer(("127.0.0.1", PORT), H)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    job_path = os.path.join(HERE, "_job.py")
    with open(job_path, "w") as f:
        f.write(JOB)
    env = dict(
        os.environ,
        SMALL_API=f"http://127.0.0.1:{PORT}",
        SMALL_RUN_ID="r-test01",
        SMALL_RUN_TOKEN="tok123",
        PYTHONUNBUFFERED="1",
    )
    try:
        r = subprocess.run([sys.executable, RUNNER, sys.executable, job_path], env=env, timeout=30)
        assert r.returncode == 3, f"runner exit: want 3 got {r.returncode}"
        assert posts, "no batches reached the log endpoint"
        assert all(p[0] == "/api/runs/r-test01/log" for p in posts), f"wrong path: {posts[0][0]}"
        assert all(p[1] == "Bearer tok123" for p in posts), "run token missing from Authorization"
        lines = [l for _, _, body in posts for l in body.get("lines", [])]
        assert lines == ["line one", "line two", "boom"], f"lines wrong/misordered: {lines}"
        assert posts[-1][2].get("exitCode") == 3, f"final batch lacks exitCode=3: {posts[-1][2]}"
        # sleep in the job forces >1 flush: progress streamed, not one dump at exit
        assert len(posts) >= 2, f"expected batched streaming, got a single post: {posts}"
    finally:
        server.shutdown()
        os.remove(job_path)
    print("runner: all checks pass")


def test_runner():
    main()


IO_PORT = 18381

IO_JOB = """
import json, os, sys
assert os.environ["SMALL_INPUT_THRESHOLD"] == "0.7", os.environ.get("SMALL_INPUT_THRESHOLD")
assert os.environ["SMALL_INPUT_DRY_RUN"] == "true", os.environ.get("SMALL_INPUT_DRY_RUN")
with open(os.path.join(os.environ["SMALL_INPUTS"], "inputs.json")) as f:
    inputs = json.load(f)
with open(inputs["image"], "rb") as f:
    assert f.read() == b"fake-jpeg-bytes", "fetched input content wrong"
out = os.environ["SMALL_OUTPUTS"]
os.makedirs(os.path.join(out, "nested"))
with open(os.path.join(out, "boxes.json"), "w") as f:
    f.write('[{"label": "person"}]')
with open(os.path.join(out, "nested", "report.txt"), "w") as f:
    f.write("done")
print("job ran")
"""


def main_io():
    events = []  # (kind, path/name, payload) in arrival order

    class IO(BaseHTTPRequestHandler):
        def _send(self, body, status=200):
            self.send_response(status)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if self.path == "/api/runs/r-io1/inputs/image.jpg" and self.headers.get("Authorization") == "Bearer tok-io":
                events.append(("input-get", self.path, None))
                return self._send(b"fake-jpeg-bytes")
            self._send(b'{"error": "nope"}', 404)

        def do_POST(self):
            n = int(self.headers.get("Content-Length") or 0)
            data = self.rfile.read(n)
            if self.path.startswith("/api/runs/r-io1/outputs/"):
                events.append(("output", self.path.rsplit("/", 1)[1], data))
            else:
                events.append(("log", self.path, json.loads(data)))
            self._send(b'{"ok": true}')

        def log_message(self, *a):
            pass

    server = HTTPServer(("127.0.0.1", IO_PORT), IO)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    job_path = os.path.join(HERE, "_io_job.py")
    with open(job_path, "w") as f:
        f.write(IO_JOB)
    with tempfile.TemporaryDirectory() as tmp:
        env = dict(
            os.environ,
            SMALL_API=f"http://127.0.0.1:{IO_PORT}",
            SMALL_RUN_ID="r-io1",
            SMALL_RUN_TOKEN="tok-io",
            SMALL_INPUTS=os.path.join(tmp, "in"),
            SMALL_OUTPUTS=os.path.join(tmp, "out"),
            SMALL_RUN_INPUTS=json.dumps(
                {"values": {"image": "photo.jpg", "threshold": 0.7, "dry_run": True}, "files": {"image": "image.jpg"}}
            ),
            PYTHONUNBUFFERED="1",
        )
        try:
            r = subprocess.run([sys.executable, RUNNER, sys.executable, job_path], env=env, timeout=30)
            assert r.returncode == 0, f"runner exit: want 0 got {r.returncode}"
            # inputs.json: scalars as-is, file value replaced with the fetched path
            with open(os.path.join(tmp, "in", "inputs.json")) as f:
                written = json.load(f)
            assert written["threshold"] == 0.7 and written["dry_run"] is True, written
            assert written["image"].endswith("image.jpg") and os.path.exists(written["image"]), written
        finally:
            server.shutdown()
            os.remove(job_path)

    names = {e[1] for e in events if e[0] == "output"}
    assert names == {"boxes.json", "nested%2Freport.txt"}, f"uploaded outputs wrong: {names}"
    boxes = next(e[2] for e in events if e[0] == "output" and e[1] == "boxes.json")
    assert json.loads(boxes) == [{"label": "person"}], boxes
    # outputs must upload before the exit-code post, so "finished" implies listable outputs
    exit_idx = next(i for i, e in enumerate(events) if e[0] == "log" and e[2].get("exitCode") is not None)
    out_idx = [i for i, e in enumerate(events) if e[0] == "output"]
    assert out_idx and max(out_idx) < exit_idx, f"outputs after exitCode post: {[(e[0], e[1]) for e in events]}"
    print("runner inputs/outputs: all checks pass")


def test_runner_inputs_outputs():
    main_io()


if __name__ == "__main__":
    main()
    main_io()
