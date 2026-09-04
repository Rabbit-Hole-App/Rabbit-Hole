# guard.py — reverse proxy baked into every small app image. stdlib only.
# Listens on $PORT, starts the user's app on an internal port, forwards requests
# only if they carry X-Small-Proxy: <per-app secret>. Everything else: 403.
# Usage: python guard.py <app command...>   ($PORT in the child resolves to the internal port)
# ponytail: full-buffer proxy for plain HTTP (no chunked streaming); websockets tunnel raw.
import http.client
import os
import socket
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SECRET = os.environ["SMALL_PROXY_SECRET"]
LISTEN_PORT = int(os.environ.get("PORT", "8080"))
APP_PORT = int(os.environ.get("SMALL_APP_PORT", "8090"))
HOP_HEADERS = {"connection", "keep-alive", "transfer-encoding", "content-length", "host", "x-small-proxy"}


def _pump(src, dst):
    try:
        while True:
            data = src.recv(65536)
            if not data:
                break
            dst.sendall(data)
    except OSError:
        pass
    finally:
        for s in (src, dst):
            try:
                s.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass


class Guard(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _handle(self):
        if self.headers.get("X-Small-Proxy") != SECRET:
            body = b"403 forbidden\n"
            self.send_response(403)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if (self.headers.get("Upgrade") or "").lower() == "websocket":
            return self._websocket()
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else None
        headers = {k: v for k, v in self.headers.items() if k.lower() not in HOP_HEADERS}
        headers["Host"] = f"127.0.0.1:{APP_PORT}"
        if body is not None:
            headers["Content-Length"] = str(length)
        try:
            conn = http.client.HTTPConnection("127.0.0.1", APP_PORT, timeout=300)
            conn.request(self.command, self.path, body=body, headers=headers)
            resp = conn.getresponse()
            data = resp.read()
        except OSError:
            data = b"502 app not responding\n"
            self.send_response(502)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        self.send_response(resp.status)
        for k, v in resp.getheaders():
            if k.lower() not in HOP_HEADERS:
                self.send_header(k, v)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)
        conn.close()

    # Replays the upgrade request to the app, then tunnels raw bytes both ways.
    # Client may not send frames before the 101 lands (RFC 6455), so nothing is
    # stuck in rfile's buffer when we switch to the raw socket.
    def _websocket(self):
        self.close_connection = True
        try:
            upstream = socket.create_connection(("127.0.0.1", APP_PORT), timeout=5)
        except OSError:
            self.send_response(502)
            self.end_headers()
            return
        upstream.settimeout(None)
        lines = [f"{self.command} {self.path} HTTP/1.1", f"Host: 127.0.0.1:{APP_PORT}"]
        for k, v in self.headers.items():
            if k.lower() not in ("host", "x-small-proxy"):
                lines.append(f"{k}: {v}")
        upstream.sendall(("\r\n".join(lines) + "\r\n\r\n").encode("latin-1"))
        t = threading.Thread(target=_pump, args=(upstream, self.connection), daemon=True)
        t.start()
        _pump(self.connection, upstream)
        t.join()

    do_GET = do_POST = do_PUT = do_DELETE = do_PATCH = do_HEAD = do_OPTIONS = _handle

    def log_message(self, *args):
        pass


def main():
    if len(sys.argv) < 2:
        sys.exit("usage: guard.py <app command...>")
    env = dict(os.environ, PORT=str(APP_PORT))
    proc = subprocess.Popen(sys.argv[1:], env=env)
    server = ThreadingHTTPServer(("0.0.0.0", LISTEN_PORT), Guard)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    code = proc.wait()  # app dies -> guard exits -> platform restarts container
    server.shutdown()
    sys.exit(code)


if __name__ == "__main__":
    main()
