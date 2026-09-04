# Self-check for guard.py request logs: one JSON line per request on stdout —
# path only (no query string), user from X-Small-User, rejected 403s marked.
# Run: python test_guard_logs.py  (or via pytest)
import http.client
import json
import os
import subprocess
import sys
import time
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
GUARD = os.path.join(HERE, "..", "..", "..", "..", "packages", "runtime", "guard.py")
PORT = 18280
SECRET = "test-secret-123"

ECHO_APP = """
import os
from http.server import BaseHTTPRequestHandler, HTTPServer

class H(BaseHTTPRequestHandler):
    def do_GET(self):
        body = b"hello"
        self.send_response(200)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def log_message(self, *a):
        pass

HTTPServer(("127.0.0.1", int(os.environ["PORT"])), H).serve_forever()
"""


def req(method, path, headers=None):
    c = http.client.HTTPConnection("127.0.0.1", PORT, timeout=5)
    c.request(method, path, headers=headers or {})
    r = c.getresponse()
    r.read()
    c.close()
    return r.status


def main():
    echo_path = os.path.join(HERE, "_echo_logs_app.py")
    with open(echo_path, "w") as f:
        f.write(ECHO_APP)
    env = dict(os.environ, PORT=str(PORT), SMALL_PROXY_SECRET=SECRET, SMALL_APP_PORT="18290")
    guard = subprocess.Popen([sys.executable, GUARD, sys.executable, echo_path], env=env, stdout=subprocess.PIPE, text=True)
    try:
        for _ in range(50):
            try:
                req("GET", "/")  # each successful warmup hit logs one rejected line
                break
            except OSError:
                time.sleep(0.1)
        assert req("GET", "/click?x=1&token=hush", {"X-Small-Proxy": SECRET, "X-Small-User": "alice@acme.com"}) == 200
        assert req("GET", "/secret?q=1") == 403
        # exactly 3 log lines expected (warmup, ok, rejected); readline blocks until each flushes
        lines = [json.loads(guard.stdout.readline()) for _ in range(3)]
    finally:
        guard.terminate()
        guard.wait()
    os.remove(echo_path)

    ok = next(l for l in lines if l.get("user"))
    assert ok["method"] == "GET" and ok["path"] == "/click", ok  # query string never logged
    assert ok["status"] == 200 and isinstance(ok["ms"], int) and ok["ms"] >= 0, ok
    assert ok["user"] == "alice@acme.com" and "rejected" not in ok, ok
    datetime.fromisoformat(ok["ts"])  # ts is ISO

    rej = next(l for l in lines if l.get("rejected") and l["path"] == "/secret")  # warmup "/" hits also log rejected
    assert rej["method"] == "GET" and rej["status"] == 403, rej
    assert "user" not in rej, rej
    print("guard request logs: all checks pass")


def test_guard_logs():
    main()


if __name__ == "__main__":
    main()
