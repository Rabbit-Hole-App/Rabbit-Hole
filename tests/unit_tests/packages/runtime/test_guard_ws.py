# Websocket passthrough check for guard.py: handshake + frame roundtrip through
# the proxy to a hand-rolled stdlib ws echo server. Run: python test_guard_ws.py
import base64
import hashlib
import os
import socket
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
GUARD = os.path.join(HERE, "..", "..", "..", "..", "packages", "runtime", "guard.py")
PORT = 18081
APP_PORT = 18091
SECRET = "test-secret-ws"
WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

# Minimal ws echo server: HTTP 101 handshake, then echo one masked text frame back unmasked.
ECHO_WS_APP = """
import base64, hashlib, os, socket

GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
srv = socket.socket()
srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
srv.bind(("127.0.0.1", int(os.environ["PORT"])))
srv.listen(1)
while True:
    conn, _ = srv.accept()
    data = b""
    while b"\\r\\n\\r\\n" not in data:
        data += conn.recv(4096)
    key = [l.split(b":", 1)[1].strip() for l in data.split(b"\\r\\n") if l.lower().startswith(b"sec-websocket-key")][0]
    accept = base64.b64encode(hashlib.sha1(key + GUID.encode()).digest())
    conn.sendall(b"HTTP/1.1 101 Switching Protocols\\r\\nUpgrade: websocket\\r\\n"
                 b"Connection: Upgrade\\r\\nSec-WebSocket-Accept: " + accept + b"\\r\\n\\r\\n")
    hdr = conn.recv(2)
    n = hdr[1] & 0x7F
    mask = conn.recv(4)
    payload = bytes(b ^ mask[i % 4] for i, b in enumerate(conn.recv(n)))
    conn.sendall(bytes([0x81, len(payload)]) + payload)
    conn.close()
"""


def ws_roundtrip(message):
    key = base64.b64encode(os.urandom(16))
    sock = socket.create_connection(("127.0.0.1", PORT), timeout=5)
    sock.sendall(
        b"GET /ws HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
        b"Sec-WebSocket-Key: " + key + b"\r\nSec-WebSocket-Version: 13\r\n"
        b"X-Small-Proxy: " + SECRET.encode() + b"\r\n\r\n"
    )
    resp = b""
    while b"\r\n\r\n" not in resp:
        resp += sock.recv(4096)
    assert b"101" in resp.split(b"\r\n")[0], f"handshake failed: {resp!r}"
    want = base64.b64encode(hashlib.sha1(key + WS_GUID.encode()).digest())
    assert want in resp, "Sec-WebSocket-Accept mismatch"
    mask = os.urandom(4)
    masked = bytes(b ^ mask[i % 4] for i, b in enumerate(message))
    sock.sendall(bytes([0x81, 0x80 | len(message)]) + mask + masked)
    hdr = sock.recv(2)
    echoed = sock.recv(hdr[1] & 0x7F)
    sock.close()
    return echoed


def main():
    echo_path = os.path.join(HERE, "_echo_ws_app.py")
    with open(echo_path, "w") as f:
        f.write(ECHO_WS_APP)
    env = dict(os.environ, PORT=str(PORT), SMALL_PROXY_SECRET=SECRET, SMALL_APP_PORT=str(APP_PORT))
    guard = subprocess.Popen([sys.executable, GUARD, sys.executable, echo_path], env=env)
    try:
        for _ in range(50):
            try:
                socket.create_connection(("127.0.0.1", PORT), timeout=1).close()
                break
            except OSError:
                time.sleep(0.1)
        msg = b"ping-through-guard"
        assert ws_roundtrip(msg) == msg, "echo mismatch"
        # no header on the upgrade request: wall holds
        sock = socket.create_connection(("127.0.0.1", PORT), timeout=5)
        sock.sendall(b"GET /ws HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n")
        resp = sock.recv(4096)
        sock.close()
        assert b"403" in resp.split(b"\r\n")[0], f"want 403 got {resp!r}"
    finally:
        guard.terminate()
        guard.wait()
        os.remove(echo_path)
    print("guard ws: all checks pass")


def test_guard_ws():
    main()


if __name__ == "__main__":
    main()
