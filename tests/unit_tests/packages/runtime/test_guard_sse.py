"""Guard SSE path: event-stream responses are forwarded chunk-by-chunk, and an
app that closes the stream mid-chunk (gradio does) yields the data received so
far — not a dropped connection that the platform proxy turns into a 502."""

import os
import subprocess
import sys
import time
import urllib.request

from tests.consts import PROJECT_DIR

GUARD = PROJECT_DIR / "packages" / "runtime" / "guard.py"

# Speaks raw HTTP so it can end the chunked stream abruptly: one full SSE event,
# then the start of a second chunk, then close — no terminating 0-chunk.
SSE_APP = r"""
import os, socket
s = socket.create_server(("127.0.0.1", int(os.environ["PORT"])))
while True:
    c, _ = s.accept()
    c.recv(65536)
    event = b"data: one\n\n"
    c.sendall(b"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nTransfer-Encoding: chunked\r\n\r\n")
    c.sendall(hex(len(event))[2:].encode() + b"\r\n" + event + b"\r\n")
    c.sendall(b"b\r\ndata: tw")  # dies mid-chunk
    c.close()
"""


def test_sse_stream_survives_abrupt_close():
    env = dict(os.environ, SMALL_PROXY_SECRET="dev123", PORT="18082", SMALL_APP_PORT="18092")
    proc = subprocess.Popen([sys.executable, str(GUARD), sys.executable, "-c", SSE_APP], env=env)
    try:
        req = urllib.request.Request("http://127.0.0.1:18082/stream", headers={"X-Small-Proxy": "dev123"})
        for _ in range(50):
            try:
                with urllib.request.urlopen(req, timeout=10) as r:
                    assert r.status == 200
                    assert r.headers["Content-Type"].startswith("text/event-stream")
                    body = r.read()
                break
            except (ConnectionError, urllib.error.URLError):
                time.sleep(0.2)
        else:
            raise AssertionError("guard never came up")
        assert b"data: one" in body
    finally:
        proc.terminate()
