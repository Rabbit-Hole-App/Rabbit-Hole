"""Integration tests: deploy the s3-log-writer job with the small CLI, start runs,
watch logs stream live, and verify the result JSON lands in S3 with the caller's email.

Needs: `npm i -g small-deploy`, `small login` done once, and repo-root .env with
SMALL_API + SMALL_TEST_BYPASS + AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY + S3_BUCKET.
"""

import json
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

import pytest

from tests.consts import PROJECT_DIR

APP_NAME = "s3-log-writer"
AWS_KEYS = ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "S3_BUCKET"]


def _dotenv():
    vals = {}
    for line in (PROJECT_DIR / ".env").read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, _, v = line.partition("=")
            vals[k.strip()] = v.strip()
    return vals

ENV = _dotenv()
if any(k not in ENV for k in AWS_KEYS):
    pytest.skip("AWS creds not in repo .env — job integration test needs them", allow_module_level=True)

CLI_CONFIG = Path.home() / ".small" / "config.json"


def small():
    path = shutil.which("small")
    assert path, "small-deploy not installed — npm i -g small-deploy"
    return path


@pytest.fixture(scope="session")
def cli_email():
    assert CLI_CONFIG.exists(), "run `small login` once before the integration tests"
    return json.loads(CLI_CONFIG.read_text())["email"]


@pytest.fixture(scope="session")
def job_dir():
    """Copy of the example with a .env holding the AWS secrets (never committed)."""
    d = Path(tempfile.mkdtemp(prefix="small-job-"))
    shutil.copytree(PROJECT_DIR / "examples" / APP_NAME, d, dirs_exist_ok=True)
    (d / ".env").write_text("".join(f"{k}={ENV[k]}\n" for k in AWS_KEYS))
    yield d
    shutil.rmtree(d, ignore_errors=True)


@pytest.fixture(scope="session")
def deployed(job_dir):
    r = subprocess.run(
        [small(), "deploy"], cwd=job_dir, capture_output=True, text=True, timeout=600, encoding="utf-8", errors="replace"
    )
    assert r.returncode == 0, f"deploy failed:\n{r.stdout}\n{r.stderr}"
    assert f"built {APP_NAME}" in r.stdout, f"job deploy should build, not serve:\n{r.stdout}"
    assert "deployed →" not in r.stdout, "job deploy must start nothing"
    return r.stdout


@pytest.fixture(scope="session")
def first_run(deployed):
    """`small run` with stdout read line by line: proves logs stream while the job is alive."""
    proc = subprocess.Popen(
        [small(), "run", APP_NAME], stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, encoding="utf-8", errors="replace",
    )
    lines, live = [], False
    for line in proc.stdout:
        line = line.rstrip("\n")
        lines.append(line)
        if "step 1/5 done" in line and proc.poll() is None:
            live = True
    proc.wait(timeout=300)
    m = re.search(r"run: (r-\w+)", lines[0])
    assert m, f"first line should be the run id, got: {lines[:3]}"
    return {"run_id": m.group(1), "lines": lines, "live": live, "returncode": proc.returncode}


def test_run_streams_progress_live(first_run):
    assert first_run["live"], f"progress line did not arrive while the job was running:\n{first_run['lines']}"
    joined = "\n".join(first_run["lines"])
    for step in range(1, 6):
        assert f"step {step}/5 done" in joined
    assert "✓ finished (exit 0)" in joined
    assert first_run["returncode"] == 0


def test_result_json_in_s3_with_caller_email(first_run, cli_email):
    boto3 = pytest.importorskip("boto3")
    s3 = boto3.client(
        "s3", aws_access_key_id=ENV["AWS_ACCESS_KEY_ID"], aws_secret_access_key=ENV["AWS_SECRET_ACCESS_KEY"]
    )
    obj = s3.get_object(Bucket=ENV["S3_BUCKET"], Key=f"runs/{first_run['run_id']}.json")
    result = json.loads(obj["Body"].read())
    assert result["run_id"] == first_run["run_id"]
    assert result["user"] == cli_email, f"SMALL_USER should be the caller: {result}"
    assert result["finished"] > result["started"]


def test_second_run_and_runs_lists_both(first_run, cli_email):
    r = subprocess.run(
        [small(), "run", APP_NAME], capture_output=True, text=True, timeout=300, encoding="utf-8", errors="replace"
    )
    assert r.returncode == 0, f"second run failed:\n{r.stdout}\n{r.stderr}"
    second_id = re.search(r"run: (r-\w+)", r.stdout).group(1)

    ls = subprocess.run(
        [small(), "runs", APP_NAME], capture_output=True, text=True, timeout=60, encoding="utf-8", errors="replace"
    )
    assert ls.returncode == 0, ls.stderr
    assert first_run["run_id"] in ls.stdout and second_id in ls.stdout, f"both runs should list:\n{ls.stdout}"
    for line in ls.stdout.splitlines():
        if first_run["run_id"] in line or second_id in line:
            assert "finished" in line and cli_email in line, f"bad runs row: {line}"


def test_logs_replays_a_run(first_run):
    r = subprocess.run(
        [small(), "logs", first_run["run_id"]], capture_output=True, text=True, timeout=60, encoding="utf-8", errors="replace"
    )
    assert r.returncode == 0, r.stderr
    assert "step 5/5 done" in r.stdout
