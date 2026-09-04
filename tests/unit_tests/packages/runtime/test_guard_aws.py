"""Guard [aws] flow: at boot it trades the proxy secret for STS session creds at
the control plane, writes them as a boto3 shared credentials file, and points the
app at it via AWS_SHARED_CREDENTIALS_FILE — env never holds AWS keys."""

import json
import os
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from tests.consts import PROJECT_DIR, kill_tree

GUARD = PROJECT_DIR / "packages" / "runtime" / "guard.py"
CREDS = {"AccessKeyId": "ASIATEST", "SecretAccessKey": "sk-test", "SessionToken": "tok-test", "Expiration": "2099-01-01T00:00:00Z"}


class FakeControlPlane(BaseHTTPRequestHandler):
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        ok = self.path == "/api/runtime/aws-creds" and body.get("secret") == "dev123"
        data = json.dumps(CREDS if ok else {"error": "forbidden"}).encode()
        self.send_response(200 if ok else 403)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args):
        pass


def test_guard_writes_sts_creds_file_and_env(tmp_path):
    server = ThreadingHTTPServer(("127.0.0.1", 0), FakeControlPlane)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    creds_file = tmp_path / "aws-creds"
    marker = tmp_path / "app-env.json"
    app_code = (
        "import json, os, pathlib, time; "
        f"pathlib.Path({str(marker)!r}).write_text(json.dumps(dict(os.environ))); time.sleep(60)"
    )
    env = dict(
        os.environ,
        SMALL_PROXY_SECRET="dev123",
        PORT="18085",
        SMALL_APP_PORT="18095",
        SMALL_CP_URL=f"http://127.0.0.1:{server.server_port}",
        SMALL_AWS_CREDS_FILE=str(creds_file),
    )
    proc = subprocess.Popen([sys.executable, str(GUARD), sys.executable, "-c", app_code], env=env)
    try:
        for _ in range(50):
            if marker.exists() and creds_file.exists():
                break
            time.sleep(0.2)
        content = creds_file.read_text()
        assert "aws_access_key_id = ASIATEST" in content
        assert "aws_session_token = tok-test" in content
        app_env = json.loads(marker.read_text())
        assert app_env["AWS_SHARED_CREDENTIALS_FILE"] == str(creds_file)
        assert "AWS_SECRET_ACCESS_KEY" not in app_env
    finally:
        kill_tree(proc)
        server.shutdown()
