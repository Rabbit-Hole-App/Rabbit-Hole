"""Integration test: upload an image through the wall to the deployed yolo-gradio
app and assert YOLOv8n returns at least one box.

Needs: `npm i -g small-deploy`, `small login` done once, repo-root .env with
SMALL_API + SMALL_TEST_BYPASS. Deploys examples/yolo-gradio only if the app is
not already registered (the build is heavy — torch install takes minutes).
"""

import json
import os
import re
import shutil
import subprocess
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

import pytest

from tests.consts import PROJECT_DIR

APP_NAME = "yolo-gradio"
APP_DIR = PROJECT_DIR / "examples" / "yolo-gradio"
BUS_JPG = Path(__file__).parent / "bus.jpg"


def _dotenv():
    vals = {}
    for line in (PROJECT_DIR / ".env").read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, _, v = line.partition("=")
            vals[k.strip()] = v.strip()
    return vals

ENV = _dotenv()
API = ENV["SMALL_API"]
BYPASS = ENV["SMALL_TEST_BYPASS"]
CLI_CONFIG = Path.home() / ".small" / "config.json"


def http(method, url, headers=None, data=None, timeout=180):
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("User-Agent", "small-integration-test")  # python UA trips Cloudflare bot block (1010)
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def session_for(email):
    status, body = http(
        "POST",
        f"{API}/test/session",
        headers={"Content-Type": "application/json"},
        data=json.dumps({"email": email, "secret": BYPASS}).encode(),
    )
    assert status == 200, f"bypass session failed: {body}"
    return {"X-Small-Session": json.loads(body)["session"]}


@pytest.fixture(scope="session")
def cli_config():
    assert CLI_CONFIG.exists(), "run `small login` once before the integration tests"
    return json.loads(CLI_CONFIG.read_text())


@pytest.fixture(scope="session")
def deployed(cli_config):
    """Reuse the already-deployed yolo-gradio app; deploy it only if missing."""
    org = cli_config["org"]
    url = f"{API}/a/{org}/{APP_NAME}/"
    status, body = http("GET", f"{API}/api/apps", headers={"Authorization": f"Bearer {cli_config['token']}"})
    assert status == 200
    if not any(a["name"] == APP_NAME for a in json.loads(body)["apps"]):
        small = shutil.which("small")
        assert small, "small-deploy not installed — npm i -g small-deploy"
        r = subprocess.run(
            [small, "deploy"], cwd=APP_DIR, capture_output=True, text=True, timeout=1200,
            encoding="utf-8", errors="replace",
        )
        assert r.returncode == 0, f"deploy failed:\n{r.stdout}\n{r.stderr}"
    sess = session_for(cli_config["email"])
    for _ in range(12):  # cold start: torch import + model load takes a while
        status, _ = http("GET", url, headers=sess, timeout=120)
        if status == 200:
            return {"url": url, "session": sess}
        time.sleep(10)
    pytest.fail(f"app never came up at {url} (last status {status})")


def test_upload_image_returns_boxes(deployed):
    url, sess = deployed["url"], deployed["session"]

    boundary = uuid.uuid4().hex
    img = BUS_JPG.read_bytes()
    body = (
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"files\"; filename=\"bus.jpg\"\r\n"
        f"Content-Type: image/jpeg\r\n\r\n".encode() + img + f"\r\n--{boundary}--\r\n".encode()
    )
    status, resp = http(
        "POST", url + "gradio_api/upload", data=body,
        headers={**sess, "Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    assert status == 200, f"upload failed: {status} {resp[:200]}"
    server_path = json.loads(resp)[0]

    payload = {"data": [{"path": server_path, "meta": {"_type": "gradio.FileData"}}]}
    status, resp = http(
        "POST", url + "gradio_api/call/predict", data=json.dumps(payload).encode(),
        headers={**sess, "Content-Type": "application/json"},
    )
    assert status == 200, f"call failed: {status} {resp[:200]}"
    event_id = json.loads(resp)["event_id"]

    status, resp = http("GET", url + f"gradio_api/call/predict/{event_id}", headers=sess)
    assert status == 200, f"result stream failed: {status} {resp[:200]}"
    data_lines = [l[len("data: "):] for l in resp.splitlines() if l.startswith("data: ")]
    assert data_lines, f"no SSE data in: {resp[:300]}"
    outputs = json.loads(data_lines[-1])
    assert outputs, f"predict errored: {resp[:300]}"
    boxes = outputs[1]
    assert len(boxes) >= 1, f"no detections on bus.jpg: {boxes}"
    assert all("label" in b and "conf" in b for b in boxes)
