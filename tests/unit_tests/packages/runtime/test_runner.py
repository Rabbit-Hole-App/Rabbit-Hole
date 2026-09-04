# Self-check for runner.py: lines reach the log endpoint in order, exit code posted, runner exits with it.
# Run: python test_runner.py  (or via pytest)
import json
import os
import subprocess
import sys
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


if __name__ == "__main__":
    main()
