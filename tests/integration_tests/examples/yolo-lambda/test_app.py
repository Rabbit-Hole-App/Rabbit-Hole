"""Integration test: BYO-AWS example. The app in the wall invokes a Lambda in the
user's AWS account; credentials are STS session creds minted by the control plane
from small.toml's [aws] role_arn — no long-lived AWS keys anywhere.

Needs: `npm i -g small-deploy` (>= 0.0.5), `small login` done once, repo-root .env
with SMALL_API + SMALL_TEST_BYPASS + admin AWS keys (for the CloudWatch
attribution check). Deploys examples/yolo-lambda only if the app is missing.
"""

import json
import shutil
import subprocess
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

import pytest

from tests.consts import PROJECT_DIR

APP_NAME = "yolo-lambda"
APP_DIR = PROJECT_DIR / "examples" / "yolo-lambda"
BUS_JPG = PROJECT_DIR / "tests" / "integration_tests" / "examples" / "yolo-gradio" / "bus.jpg"


def _dotenv(path):
    vals = {}
    for line in path.read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, _, v = line.partition("=")
            vals[k.strip()] = v.strip()
    return vals


ENV = _dotenv(PROJECT_DIR / ".env")
API = ENV["SMALL_API"]
BYPASS = ENV["SMALL_TEST_BYPASS"]
LAMBDA_ARN = _dotenv(APP_DIR / ".env")["LAMBDA_ARN"]
CLI_CONFIG = Path.home() / ".small" / "config.json"


def http(method, url, headers=None, data=None, timeout=180):
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("User-Agent", "small-integration-test")
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
    for _ in range(12):
        status, _ = http("GET", url, headers=sess, timeout=120)
        if status == 200:
            return {"url": url, "session": sess, "email": cli_config["email"]}
        time.sleep(10)
    pytest.fail(f"app never came up at {url} (last status {status})")


def _machine_exec(cli_config, cmd):
    """Run a command inside the app's machine via the Fly machines API,
    using the same 1h scoped token the CLI gets for logs."""
    status, body = http(
        "GET", f"{API}/api/logs?app={APP_NAME}", headers={"Authorization": f"Bearer {cli_config['token']}"}
    )
    assert status == 200, f"logs token fetch failed: {body}"
    d = json.loads(body)
    fly_app, tok = d["flyApp"], d["flyToken"]
    auth = {"Authorization": tok if tok.startswith("FlyV1") else f"Bearer {tok}", "Content-Type": "application/json"}
    status, body = http("GET", f"https://api.machines.dev/v1/apps/{fly_app}/machines", headers=auth)
    assert status == 200, f"machine list failed: {status} {body[:200]}"
    machines = [m for m in json.loads(body) if m["state"] == "started"]
    assert machines, "no started machine (visit the app first to wake it)"
    status, body = http(
        "POST",
        f"https://api.machines.dev/v1/apps/{fly_app}/machines/{machines[0]['id']}/exec",
        headers=auth,
        data=json.dumps({"cmd": cmd}).encode(),
    )
    assert status == 200, f"exec failed: {status} {body[:200]}"
    return json.loads(body).get("stdout", "")


def _predict_through_wall(url, sess):
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
    return outputs


def test_lambda_inference_through_wall(deployed):
    outputs = _predict_through_wall(deployed["url"], deployed["session"])
    boxes = outputs[1]
    assert len(boxes) >= 1, f"no detections on bus.jpg: {boxes}"
    assert all("label" in b and "conf" in b for b in boxes)


def test_container_has_no_long_lived_aws_keys(cli_config, deployed):
    env_out = _machine_exec(cli_config, "env")
    assert "AWS_SECRET_ACCESS_KEY" not in env_out, "long-lived AWS key found in container env"
    assert "AWS_ACCESS_KEY_ID" not in env_out
    creds = _machine_exec(cli_config, "cat /tmp/small-aws-creds")
    assert "aws_session_token" in creds, "no STS session creds file — [aws] flow broken"


def test_lambda_logs_show_invoking_user(deployed):
    """Attribution: X-Small-User travels into the Lambda payload and its logs."""
    boto3 = pytest.importorskip("boto3")
    start_ms = int(time.time() * 1000)
    _predict_through_wall(deployed["url"], deployed["session"])
    logs = boto3.client(
        "logs",
        region_name=LAMBDA_ARN.split(":")[3],
        aws_access_key_id=ENV["AWS_ACCESS_KEY_ID"],
        aws_secret_access_key=ENV["AWS_SECRET_ACCESS_KEY"],
    )
    group = "/aws/lambda/" + LAMBDA_ARN.split(":")[-1]
    needle = f"invoke user={deployed['email']}"
    for _ in range(12):
        events = logs.filter_log_events(logGroupName=group, startTime=start_ms).get("events", [])
        if any(needle in e["message"] for e in events):
            return
        time.sleep(10)
    pytest.fail(f"'{needle}' not found in {group} after invocation")
