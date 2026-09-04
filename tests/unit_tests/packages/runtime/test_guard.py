# Self-check for guard.py: 403 without header, 200 + body roundtrip with it.
# Run: python test_guard.py  (or via pytest)
import http.client
import os
import subprocess
import sys
import time

try:
    from tests.consts import kill_tree
except ImportError:  # standalone `python test_guard.py` run: best-effort cleanup only
    def kill_tree(proc):
        proc.terminate()

HERE = os.path.dirname(os.path.abspath(__file__))
GUARD = os.path.join(HERE, "..", "..", "..", "..", "packages", "runtime", "guard.py")
PORT = 18080
SECRET = "test-secret-123"

ECHO_APP = """
import os
from http.server import BaseHTTPRequestHandler, HTTPServer

class H(BaseHTTPRequestHandler):
    def _r(self, body):
        self.send_response(200)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def do_GET(self):
        self._r(b"hello from app")
    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0)
        self._r(b"echo:" + self.rfile.read(n))
    def log_message(self, *a):
        pass

HTTPServer(("127.0.0.1", int(os.environ["PORT"])), H).serve_forever()
"""


def req(method, path, headers=None, body=None):
    c = http.client.HTTPConnection("127.0.0.1", PORT, timeout=5)
    c.request(method, path, body=body, headers=headers or {})
    r = c.getresponse()
    data = r.read()
    c.close()
    return r.status, data


def main():
    echo_path = os.path.join(HERE, "_echo_app.py")
    with open(echo_path, "w") as f:
        f.write(ECHO_APP)
    env = dict(os.environ, PORT=str(PORT), SMALL_PROXY_SECRET=SECRET, SMALL_APP_PORT="18090")
    guard = subprocess.Popen([sys.executable, GUARD, sys.executable, echo_path], env=env)
    try:
        for _ in range(50):
            try:
                req("GET", "/")
                break
            except OSError:
                time.sleep(0.1)
        status, _ = req("GET", "/")
        assert status == 403, f"no header: want 403 got {status}"
        status, _ = req("GET", "/", {"X-Small-Proxy": "wrong"})
        assert status == 403, f"wrong secret: want 403 got {status}"
        status, data = req("GET", "/", {"X-Small-Proxy": SECRET})
        assert status == 200 and data == b"hello from app", f"good secret: got {status} {data!r}"
        status, data = req("POST", "/x", {"X-Small-Proxy": SECRET}, b"payload")
        assert status == 200 and data == b"echo:payload", f"post roundtrip: got {status} {data!r}"
    finally:
        kill_tree(guard)
        guard.wait()
        os.remove(echo_path)
    print("guard: all checks pass")


def test_guard():
    main()


if __name__ == "__main__":
    main()
