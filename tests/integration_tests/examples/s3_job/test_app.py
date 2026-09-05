"""Integration tests for [aws] on jobs: deploy examples/s3-job under a test name,
point it at an object in the demo bucket, and check the job's STS session let it
read the object and write the report — to S3 and to the run outputs.

Needs: small login done once, repo-root .env with SMALL_API + SMALL_TEST_BYPASS +
AWS admin keys + S3_BUCKET, and the small-s3-demo IAM role (scratchpad script).
"""

import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

import boto3
import pytest

from tests.consts import PROJECT_DIR

APP_NAME = "itest-s3-job"
EXAMPLE = PROJECT_DIR / "examples" / "s3-job"
FIXTURE = PROJECT_DIR / "tests" / "fixtures" / "people.jpg"
S3_KEY = "itest/people.jpg"


def _dotenv():
    vals = {}
    for line in (PROJECT_DIR / ".env").read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, _, v = line.partition("=")
            vals[k.strip()] = v.strip()
    return vals


ENV = _dotenv()
API = ENV["SMALL_API"]
BUCKET = ENV["S3_BUCKET"]
CLI_CONFIG = Path.home() / ".small" / "config.json"


def http(method, url, headers=None):
    req = urllib.request.Request(url, method=method)
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
def s3():
    """Admin client from .env — test setup/teardown only; the job itself runs on STS."""
    return boto3.client(
        "s3",
        region_name=ENV.get("AWS_REGION", "us-east-1"),
        aws_access_key_id=ENV["AWS_ACCESS_KEY_ID"],
        aws_secret_access_key=ENV["AWS_SECRET_ACCESS_KEY"],
    )


@pytest.fixture(scope="session")
def auth():
    assert CLI_CONFIG.exists(), "run `small login` once before the integration tests"
    return {"Authorization": f"Bearer {json.loads(CLI_CONFIG.read_text())['token']}"}


@pytest.fixture(scope="session")
def seeded(s3):
    s3.upload_file(str(FIXTURE), BUCKET, S3_KEY)
    s3.delete_object(Bucket=BUCKET, Key=f"reports/{Path(S3_KEY).name}.report.json")  # stale report must not pass the test
    return f"s3://{BUCKET}/{S3_KEY}"


@pytest.fixture(scope="session")
def job_dir():
    d = Path(tempfile.mkdtemp(prefix="small-itest-s3-"))
    for f in EXAMPLE.iterdir():
        shutil.copy(f, d / f.name)
    toml = (d / "small.toml").read_text().replace('name = "s3-job"', f'name = "{APP_NAME}"')
    (d / "small.toml").write_text(toml)
    yield d
    shutil.rmtree(d, ignore_errors=True)


@pytest.fixture(scope="session")
def run_result(seeded, job_dir):
    r = subprocess.run(
        [small(), "deploy"], cwd=job_dir, capture_output=True, text=True, timeout=900, encoding="utf-8", errors="replace"
    )
    assert r.returncode == 0, f"deploy failed:\n{r.stdout}\n{r.stderr}"
    r = subprocess.run(
        [small(), "run", APP_NAME, "--source", seeded, "--output-bucket", f"s3://{BUCKET}"],
        cwd=job_dir, capture_output=True, text=True, timeout=600, encoding="utf-8", errors="replace",
    )
    assert r.returncode == 0, f"run failed:\n{r.stdout}\n{r.stderr}"
    m = re.search(r"run: (r-\w+)", r.stdout)
    assert m, f"no run id in output:\n{r.stdout}"
    return {"run_id": m.group(1), "stdout": r.stdout}


def test_run_row_records_both_inputs(run_result, auth):
    status, body = http("GET", f"{API}/api/runs/{run_result['run_id']}?after=-1", headers=auth)
    assert status == 200, body
    inputs = json.loads(body)["inputs"]
    assert inputs == {"source": f"s3://{BUCKET}/{S3_KEY}", "output_bucket": f"s3://{BUCKET}"}, inputs


def test_report_in_run_outputs_matches_fixture(run_result, auth):
    status, body = http("GET", f"{API}/api/runs/{run_result['run_id']}/outputs/report.json", headers=auth)
    assert status == 200, body
    report = json.loads(body)
    data = FIXTURE.read_bytes()
    assert report["bytes"] == len(data), report
    assert report["sha256"] == hashlib.sha256(data).hexdigest(), report


def test_report_written_back_to_s3(run_result, s3):
    obj = s3.get_object(Bucket=BUCKET, Key=f"reports/{Path(S3_KEY).name}.report.json")
    report = json.loads(obj["Body"].read())
    assert report["sha256"] == hashlib.sha256(FIXTURE.read_bytes()).hexdigest(), report


def test_no_aws_keys_in_logs(run_result):
    # the STS secret must never leak into the streamed run log
    assert "AWS_SECRET" not in run_result["stdout"] and "aws_secret" not in run_result["stdout"]


def test_unassumable_role_fails_deploy_with_trust_policy(job_dir):
    """The deploy error must be the documentation: trust policy + ExternalId, no app created."""
    d = Path(tempfile.mkdtemp(prefix="small-itest-badrole-"))
    try:
        for f in job_dir.iterdir():
            shutil.copy(f, d / f.name)
        toml = (d / "small.toml").read_text()
        toml = toml.replace(f'name = "{APP_NAME}"', 'name = "itest-bad-role"')
        toml = re.sub(r'role_arn = ".*"', 'role_arn = "arn:aws:iam::637423432890:role/small-does-not-exist"', toml)
        (d / "small.toml").write_text(toml)
        r = subprocess.run(
            [small(), "deploy"], cwd=d, capture_output=True, text=True, timeout=120, encoding="utf-8", errors="replace"
        )
        out = r.stdout + r.stderr
        assert r.returncode != 0, out
        assert "cannot assume" in out, out
        assert "sts:ExternalId" in out and "gmail-com" in out, out  # paste-ready trust policy
        assert "sts:AssumeRole" in out, out
    finally:
        shutil.rmtree(d, ignore_errors=True)
