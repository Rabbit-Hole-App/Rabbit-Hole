"""Ask phase 1 (read-only) against the live control plane.

Covers the three spec scenarios:
- a failed run gets a diagnosis naming what to look at (ponytail: uses
  yolo-s3-job with a missing S3 key instead of redeploying s3-log-writer with a
  wrong bucket — same failure hook, no mutation of a shared app's secrets);
- org-scope "why did yolo fail" with several yolo apps returns a choose;
- a viewer asking for an action gets an answer naming who has edit rights.

Needs: repo-root .env with SMALL_API + SMALL_TEST_BYPASS, yolo-s3-job deployed
with its [inputs] schema, and the fixture image seeded at itest/people.jpg.
Model-dependent assertions are kept loose on purpose.
"""

import json
import time
import urllib.error
import urllib.request
from pathlib import Path

import pytest

from tests.consts import PROJECT_DIR

APP = "yolo-s3-job"
BAD_KEY = "itest/does-not-exist.jpg"


def _dotenv():
    vals = {}
    for line in (PROJECT_DIR / ".env").read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, _, v = line.partition("=")
            vals[k.strip()] = v.strip()
    return vals


ENV = _dotenv()
API = ENV["SMALL_API"]
OWNER = json.loads((Path.home() / ".small" / "config.json").read_text())["email"]


def post(path, body, session=None):
    req = urllib.request.Request(API + path, method="POST", data=json.dumps(body).encode())
    req.add_header("User-Agent", "small-integration-test")  # python UA trips Cloudflare 1010
    req.add_header("Content-Type", "application/json")
    if session:
        req.add_header("X-Small-Session", session)
    with urllib.request.urlopen(req, timeout=300) as r:
        return r.headers.get("Content-Type", ""), r.read().decode()


def get(path, session):
    req = urllib.request.Request(API + path)
    req.add_header("User-Agent", "small-integration-test")
    req.add_header("X-Small-Session", session)
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.loads(r.read().decode())


def sse_text(body):
    return "".join(json.loads(m)["text"] for m in
                   (line[6:] for line in body.splitlines() if line.startswith("data: "))
                   if '"text"' in m)


@pytest.fixture(scope="session")
def owner_session():
    _, body = post("/test/session", {"email": OWNER, "secret": ENV["SMALL_TEST_BYPASS"]})
    return json.loads(body)["session"]


@pytest.fixture(scope="session")
def bob_session():
    _, body = post("/test/session", {"email": "bob@gmail.com", "secret": ENV["SMALL_TEST_BYPASS"]})
    return json.loads(body)["session"]


def test_org_scope_ambiguous_yolo_returns_choose(owner_session):
    ctype, body = post("/api/ask", {"scope": {}, "message": "why did yolo fail"}, owner_session)
    assert "json" in ctype, body[:200]
    choose = json.loads(body).get("choose")
    assert choose and len(choose) >= 2, body[:300]
    assert all("app" in c for c in choose)


def test_failed_run_gets_a_diagnosis(owner_session):
    bucket = ENV["S3_BUCKET"]
    ctype, body = post(
        "/api/runs",
        {"app": APP, "inputs": {"source": f"s3://{bucket}/{BAD_KEY}", "threshold": 0.5}},
        owner_session,
    )
    run_id = json.loads(body)["runId"]
    deadline = time.time() + 420
    meta = {}
    while time.time() < deadline:
        meta = get(f"/api/runs/{run_id}", owner_session)
        if meta["status"] not in ("running",) and meta.get("diagnosis"):
            break
        time.sleep(5)
    assert meta["status"] == "failed", meta
    diagnosis = meta.get("diagnosis") or ""
    assert diagnosis, "no diagnosis stored on the failed run"
    assert any(t in diagnosis.lower() for t in ("s3", "source", BAD_KEY.split("/")[-1])), diagnosis


def test_editor_rerun_proposal_approves_into_a_run(owner_session):
    """Phase 2: 're-run with the same inputs' → proposal with the exact stored
    inputs; approving creates a run; the approval is logged (double-approve 409s)."""
    ctype, body = post(
        "/api/ask",
        {"scope": {"app": APP}, "message": "re-run the last successful run with exactly the same inputs"},
        owner_session,
    )
    assert "event-stream" in ctype, body[:200]
    prop_lines = [line[6:] for line in body.splitlines() if line.startswith("data: ") and '"tool"' in line]
    assert prop_lines, "no proposal event: " + sse_text(body)[:300]
    prop = json.loads(prop_lines[0])
    assert prop["tool"] in ("run", "run_again"), prop

    _, approved = post("/api/ask/approve", {"proposal_id": prop["id"]}, owner_session)
    run_id = json.loads(approved).get("runId")
    assert run_id, approved
    meta = get(f"/api/runs/{run_id}", owner_session)
    assert meta["inputs"] and meta["inputs"].get("source", "").startswith("s3://"), meta
    post(f"/api/runs/{run_id}/stop", {}, owner_session)  # no need to burn the full run

    with pytest.raises(urllib.error.HTTPError) as e:
        post("/api/ask/approve", {"proposal_id": prop["id"]}, owner_session)
    assert e.value.code == 409  # already approved — the log holds


def test_viewer_asking_for_action_is_told_who_can(owner_session, bob_session):
    post("/api/share", {"app": APP, "email": "bob@gmail.com", "role": "view"}, owner_session)
    try:
        ctype, body = post("/api/ask", {"scope": {"app": APP}, "message": "re-run it"}, bob_session)
        assert "event-stream" in ctype, body[:200]
        answer = sse_text(body)
        assert OWNER in answer, answer[:400]
    finally:
        post("/api/unshare", {"app": APP, "email": "bob@gmail.com"}, owner_session)
