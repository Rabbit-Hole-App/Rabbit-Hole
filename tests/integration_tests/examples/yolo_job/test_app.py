"""Integration tests for job inputs/outputs: deploy examples/yolo-job under a test
name, run it with a real image, and check inputs land on the run row and outputs
come back. Also: an out-of-range input must fail before anything is uploaded.

Needs: small login done once, repo-root .env with SMALL_API + SMALL_TEST_BYPASS.
First deploy builds a torch image remotely — slow (~10 min); later runs reuse layers.
"""

import json
import os
import re
import shutil
import subprocess
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

import pytest

from tests.consts import PROJECT_DIR

APP_NAME = "itest-yolo-job"
EXAMPLE = PROJECT_DIR / "examples" / "yolo-job"
FIXTURE_IMAGE = PROJECT_DIR / "tests" / "fixtures" / "people.jpg"


def _dotenv():
    vals = {}
    for line in (PROJECT_DIR / ".env").read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, _, v = line.partition("=")
            vals[k.strip()] = v.strip()
    return vals


ENV = _dotenv()
API = ENV["SMALL_API"]
CLI_CONFIG = Path.home() / ".small" / "config.json"


def http(method, url, headers=None, data=None):
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("User-Agent", "small-integration-test")  # default python UA trips Cloudflare bot block (1010)
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def small():
    path = os.environ.get("SMALL_BIN") or shutil.which("small")
    assert path, "small-deploy not installed — npm i -g small-deploy"
    return path


@pytest.fixture(scope="session")
def cli_config():
    assert CLI_CONFIG.exists(), "run `small login` once before the integration tests"
    return json.loads(CLI_CONFIG.read_text())


@pytest.fixture(scope="session")
def auth(cli_config):
    return {"Authorization": f"Bearer {cli_config['token']}"}


@pytest.fixture(scope="session")
def job_dir():
    """examples/yolo-job copied under a test app name so the real slug stays clean."""
    d = Path(tempfile.mkdtemp(prefix="small-itest-yolo-"))
    for f in EXAMPLE.iterdir():
        shutil.copy(f, d / f.name)
    toml = (d / "small.toml").read_text().replace('name = "yolo-job"', f'name = "{APP_NAME}"')
    (d / "small.toml").write_text(toml)
    yield d
    shutil.rmtree(d, ignore_errors=True)


@pytest.fixture(scope="session")
def deployed(job_dir, cli_config):
    r = subprocess.run(
        [small(), "deploy"], cwd=job_dir, capture_output=True, text=True, timeout=1200, encoding="utf-8", errors="replace"
    )
    assert r.returncode == 0, f"deploy failed:\n{r.stdout}\n{r.stderr}"
    assert f"built {APP_NAME}" in r.stdout, r.stdout
    return r.stdout


@pytest.fixture(scope="session")
def run_result(deployed, job_dir):
    r = subprocess.run(
        [small(), "run", APP_NAME, "--image", str(FIXTURE_IMAGE), "--threshold", "0.4"],
        cwd=job_dir, capture_output=True, text=True, timeout=600, encoding="utf-8", errors="replace",
    )
    assert r.returncode == 0, f"run failed:\n{r.stdout}\n{r.stderr}"
    m = re.search(r"run: (r-\w+)", r.stdout)
    assert m, f"no run id in output:\n{r.stdout}"
    return {"run_id": m.group(1), "stdout": r.stdout}


def test_inputs_printed_before_start(run_result):
    assert "✓ inputs: image=people.jpg" in run_result["stdout"], run_result["stdout"]
    assert "threshold=0.4" in run_result["stdout"], run_result["stdout"]


def test_run_row_records_inputs(run_result, auth):
    status, body = http("GET", f"{API}/api/runs/{run_result['run_id']}?after=-1", headers=auth)
    assert status == 200, body
    inputs = json.loads(body)["inputs"]
    assert inputs == {"image": "people.jpg", "threshold": 0.4}, inputs


def test_two_output_files_exist(run_result, auth):
    status, body = http("GET", f"{API}/api/runs/{run_result['run_id']}/outputs", headers=auth)
    assert status == 200, body
    outputs = {o["name"]: o["size"] for o in json.loads(body)["outputs"]}
    assert set(outputs) == {"annotated.jpg", "boxes.json"}, outputs
    assert all(s > 0 for s in outputs.values()), outputs
    assert "outputs:" in run_result["stdout"] and "--download" in run_result["stdout"], run_result["stdout"]


def test_boxes_json_parses_with_a_box(run_result, auth):
    status, body = http("GET", f"{API}/api/runs/{run_result['run_id']}/outputs/boxes.json", headers=auth)
    assert status == 200, body
    boxes = json.loads(body)
    assert isinstance(boxes, list) and len(boxes) >= 1, boxes
    assert all("label" in b and "conf" in b for b in boxes), boxes


def test_download_fetches_outputs(run_result, job_dir):
    out = Path(tempfile.mkdtemp(prefix="small-itest-out-"))
    try:
        r = subprocess.run(
            [small(), "run", APP_NAME, "--download", str(out)],
            cwd=job_dir, capture_output=True, text=True, timeout=120, encoding="utf-8", errors="replace",
        )
        assert r.returncode == 0, f"{r.stdout}\n{r.stderr}"
        assert (out / "boxes.json").exists() and (out / "annotated.jpg").exists(), list(out.iterdir())
    finally:
        shutil.rmtree(out, ignore_errors=True)


def test_deploy_stores_inputs_schema(deployed, auth):
    status, body = http("GET", f"{API}/api/apps/{APP_NAME}", headers=auth)
    assert status == 200, body
    app = json.loads(body)
    assert app["inputs"]["image"]["type"] == "file", app["inputs"]
    assert app["inputs"]["threshold"] == {"type": "number", "default": 0.5, "min": 0, "max": 1}, app["inputs"]
    assert app["outputs"]["annotated"]["path"] == "annotated.jpg", app["outputs"]


def test_remote_schema_validates_away_from_app_dir(deployed):
    """No small.toml in cwd: the schema stored at deploy still rejects a bad flag value."""
    r = subprocess.run(
        [small(), "run", APP_NAME, "--image", str(FIXTURE_IMAGE), "--threshold", "2"],
        cwd=tempfile.gettempdir(), capture_output=True, text=True, timeout=120, encoding="utf-8", errors="replace",
    )
    assert r.returncode != 0
    assert "out of range" in (r.stdout + r.stderr), f"{r.stdout}\n{r.stderr}"


def test_out_of_range_threshold_fails_before_upload(deployed, job_dir, auth):
    before = http("GET", f"{API}/api/runs?app={APP_NAME}", headers=auth)[1]
    r = subprocess.run(
        [small(), "run", APP_NAME, "--image", str(FIXTURE_IMAGE), "--threshold", "2"],
        cwd=job_dir, capture_output=True, text=True, timeout=60, encoding="utf-8", errors="replace",
    )
    assert r.returncode != 0
    assert "out of range" in (r.stdout + r.stderr), f"{r.stdout}\n{r.stderr}"
    after = http("GET", f"{API}/api/runs?app={APP_NAME}", headers=auth)[1]
    assert len(json.loads(before)["runs"]) == len(json.loads(after)["runs"]), "a run was created despite invalid input"
