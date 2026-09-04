"""Integration: deploy s3-log-writer with schedule = "* * * * *", let the control
plane's cron trigger fire it, then make the job slow and assert overlap skips.

Needs the same setup as test_app.py plus the cron-enabled worker deployed.
Uses its own app name (s3-log-writer-cron) so it never fights test_app.py, and
pauses the schedule on teardown — the app outlives the test on the shared worker.
"""

import json
import os
import re
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

import pytest

from tests.consts import PROJECT_DIR

APP_NAME = "s3-log-writer-cron"
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
    pytest.skip("AWS creds not in repo .env — cron integration test needs them", allow_module_level=True)


def small():
    path = os.environ.get("SMALL_BIN") or shutil.which("small")
    assert path, "small-deploy not installed — npm i -g small-deploy"
    return path


def runs_rows():
    r = subprocess.run(
        [small(), "runs", APP_NAME], capture_output=True, text=True, timeout=60, encoding="utf-8", errors="replace"
    )
    assert r.returncode == 0, r.stderr
    return r.stdout.splitlines()


def deploy(job_dir):
    r = subprocess.run(
        [small(), "deploy"], cwd=job_dir, capture_output=True, text=True, timeout=600, encoding="utf-8", errors="replace"
    )
    assert r.returncode == 0, f"deploy failed:\n{r.stdout}\n{r.stderr}"
    return r.stdout


@pytest.fixture(scope="module")
def job_dir():
    d = Path(tempfile.mkdtemp(prefix="small-cron-"))
    shutil.copytree(PROJECT_DIR / "examples" / "s3-log-writer", d, dirs_exist_ok=True)
    (d / ".env").write_text("".join(f"{k}={ENV[k]}\n" for k in AWS_KEYS))
    toml = (d / "small.toml").read_text().replace('name = "s3-log-writer"', f'name = "{APP_NAME}"')
    (d / "small.toml").write_text(toml + '\nschedule = "* * * * *"\n')
    yield d
    subprocess.run([small(), "schedule", "pause", APP_NAME], capture_output=True, timeout=60)
    shutil.rmtree(d, ignore_errors=True)


def test_cron_run_fires_and_writes_s3(job_dir):
    out = deploy(job_dir)
    assert re.search(r"✓ schedule: \* \* \* \* \* \(UTC\) · next run \d{4}-\d{2}-\d{2} \d{2}:\d{2}", out), out
    time.sleep(90)  # ≥1 tick + job runtime (~5s) + machine boot
    finished = [l for l in runs_rows() if "cron" in l and "finished" in l]
    assert finished, f"no finished cron run after 90s:\n{runs_rows()}"
    run_id = finished[0].split()[0]

    boto3 = pytest.importorskip("boto3")
    s3 = boto3.client(
        "s3", aws_access_key_id=ENV["AWS_ACCESS_KEY_ID"], aws_secret_access_key=ENV["AWS_SECRET_ACCESS_KEY"]
    )
    result = json.loads(s3.get_object(Bucket=ENV["S3_BUCKET"], Key=f"runs/{run_id}.json")["Body"].read())
    assert result["user"] == "cron", f"cron run should carry SMALL_USER=cron: {result}"


def test_overlapping_tick_skips(job_dir):
    # make the job outlast two ticks; the every-minute schedule stays on
    (job_dir / "pipeline.py").write_text("import time\nprint('sleeping 120s')\ntime.sleep(120)\nprint('done')\n")
    deploy(job_dir)
    deadline = time.time() + 300  # next tick starts the slow run, two more must skip
    while time.time() < deadline:
        skipped = [l for l in runs_rows() if "skipped" in l and "previous run still active" in l]
        if skipped:
            return
        time.sleep(20)
    pytest.fail(f"no skipped row within 5 min:\n{runs_rows()}")
