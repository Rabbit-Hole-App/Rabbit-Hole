"""Integration tests: deploy a Flask app with the published small-deploy CLI,
then exercise the deployed URL — auth wall, guard, shared state across two users.

Needs: `npm i -g small-deploy`, `small login` done once (~/.small/config.json),
and repo-root .env with RABBIT_HOLE_DEV_TEST_BYPASS.
"""

import json
import os
import re
import shutil
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

import pytest

from tests.consts import PROJECT_DIR

APP_NAME = "itest-flask"


def _dotenv():
    vals = {}
    for line in (PROJECT_DIR / ".env").read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, _, v = line.partition("=")
            vals[k.strip()] = v.strip()
    return vals

ENV = _dotenv()
API = ENV.get("RABBIT_HOLE_DEV_CP", "https://rabbit-hole-cp-dev.tryrabbithole.workers.dev")
BYPASS = ENV.get("RABBIT_HOLE_DEV_TEST_BYPASS", "")
CLI_CONFIG = Path.home() / ".small" / "config.json"


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None

_OPENER = urllib.request.build_opener(_NoRedirect)


def http(method, url, headers=None, data=None):
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("User-Agent", "small-integration-test")  # default python UA trips Cloudflare bot block (1010)
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with _OPENER.open(req, timeout=90) as r:
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


def small():
    # SMALL_BIN pins this worktree's CLI — the global `small` is shared machine
    # state and any of the four worktrees may have re-pointed it
    path = os.environ.get("SMALL_BIN") or shutil.which("small")
    assert path, "small-deploy not installed — npm i -g small-deploy"
    return path


@pytest.fixture(scope="session")
def deployed(project_dir, cli_config):
    """Deploy the fixture app once via the CLI; return its URL."""
    r = subprocess.run(
        [small(), "deploy"], cwd=project_dir, capture_output=True, text=True, timeout=600, encoding="utf-8", errors="replace"
    )
    assert r.returncode == 0, f"deploy failed:\n{r.stdout}\n{r.stderr}"
    m = re.search(r"deployed → (\S+)", r.stdout)
    assert m, f"no URL in output:\n{r.stdout}"
    return {"url": m.group(1), "stdout": r.stdout, "org": cli_config["org"]}


@pytest.fixture(scope="session")
def runbook(deployed, cli_config):
    """The review (runbook included) is stored async with the deploy; poll until it lands."""
    for _ in range(24):
        status, body = http(
            "GET",
            f"{API}/api/review?app={APP_NAME}",
            headers={"Authorization": f"Bearer {cli_config['token']}"},
        )
        if status == 200:
            review = json.loads(body).get("review") or {}
            if review.get("runbook"):
                return review["runbook"]
        time.sleep(5)
    pytest.fail("runbook never appeared after deploy")


def test_runbook_names_storage_and_sqlite(runbook):
    assert "SMALL_DATA" in runbook, f"runbook does not name SMALL_DATA:\n{runbook}"
    assert re.search(r"sqlite", runbook, re.I), f"runbook does not mention SQLite:\n{runbook}"


def test_runbook_gunicorn_under_commands(runbook):
    parts = runbook.split("## Commands", 1)
    assert len(parts) == 2, f"no Commands section:\n{runbook}"
    commands = parts[1].split("\n## ")[0]
    assert "gunicorn" in commands, f"no gunicorn command under Commands:\n{commands}"


def test_runbook_endpoints_only_home_and_inc(runbook):
    parts = runbook.split("## Endpoints", 1)
    assert len(parts) == 2, f"no Endpoints section:\n{runbook}"
    section = parts[1].split("\n## ")[0]
    routes = set(re.findall(r"/[a-zA-Z0-9_-]+", section))
    assert "/inc" in section, f"missing /inc endpoint:\n{section}"
    assert routes <= {"/inc"}, f"unexpected endpoints beyond / and /inc: {routes}\n{section}"


def test_runbook_cli_prints_and_ends_with_review_line(runbook, deployed):
    r = subprocess.run(
        [small(), "runbook", APP_NAME], capture_output=True, text=True, timeout=60, encoding="utf-8", errors="replace"
    )
    assert r.returncode == 0, r.stderr
    assert "## What it does" in r.stdout
    assert re.search(r"\*review: .+ — risk: (low|medium|high)\*", r.stdout), f"no review summary line:\n{r.stdout[-500:]}"


def test_deploy_detects_and_prints(deployed):
    assert "entry: app.py (flask)" in deployed["stdout"]
    assert f"/a/{deployed['org']}/{APP_NAME}/" in deployed["url"]


def test_wall_redirects_anonymous(deployed):
    status, _ = http("GET", deployed["url"])
    assert status == 302


def test_guard_blocks_direct_origin(deployed, cli_config):
    status, body = http("GET", f"{API}/api/apps", headers={"Authorization": f"Bearer {cli_config['token']}"})
    assert status == 200
    fly_app = next(a["fly_app"] for a in json.loads(body)["apps"] if a["name"] == APP_NAME)
    status, body = http("GET", f"https://{fly_app}.fly.dev/")
    assert status == 403, f"guard let a direct request through: {status} {body[:100]}"


def test_no_fly_token_leaks(deployed, cli_config):
    """The CLI must never persist or print a Fly credential. The only Fly token in
    its traffic is the 1h app-scoped one inside the /api/deploy response body."""
    raw = CLI_CONFIG.read_text()
    assert "FlyV1" not in raw and "fm2_" not in raw, "fly token leaked into ~/.small/config.json"
    assert "FlyV1" not in deployed["stdout"] and "fm2_" not in deployed["stdout"], "fly token leaked into CLI output"


def test_deploy_token_scoped_to_one_app(cli_config):
    bearer = {"Authorization": f"Bearer {cli_config['token']}", "Content-Type": "application/json"}
    status, body = http("POST", f"{API}/api/deploy", headers=bearer, data=json.dumps({"name": APP_NAME}).encode())
    assert status == 200, f"deploy api failed: {body}"
    d = json.loads(body)
    token = d["flyToken"]
    assert token.startswith("FlyV1"), "expected an app-scoped fly macaroon"

    def machines_status(fly_app):
        status, _ = http("GET", f"https://api.machines.dev/v1/apps/{fly_app}/machines", headers={"Authorization": token})
        return status

    assert machines_status(d["flyApp"]) == 200, "scoped token cannot manage its own app"
    status, body = http("GET", f"{API}/api/apps", headers={"Authorization": f"Bearer {cli_config['token']}"})
    other = next((a["fly_app"] for a in json.loads(body)["apps"] if a["name"] != APP_NAME), None)
    if other:
        assert machines_status(other) in (401, 403, 404), "deploy token can reach a different app"


def test_two_users_share_state(deployed, cli_config):
    org_domain = cli_config["email"].split("@")[1]
    a = session_for(cli_config["email"])
    b = session_for(f"second.user@{org_domain}")

    def count(sess):
        status, body = http("GET", deployed["url"], headers=sess)
        assert status == 200, f"expected 200, got {status}: {body[:100]}"
        return int(re.search(r"count: (\d+)", body).group(1))

    before = count(a)
    status, _ = http("POST", deployed["url"] + "inc", headers=a, data=b"")
    assert status in (200, 303)
    assert count(a) == before + 1
    assert count(b) == before + 1, "second user does not see the shared count"


def test_count_survives_machine_replacement(deployed, cli_config, project_dir):
    """[storage]: +1 three times, destroy the machine, redeploy — the SQLite
    count on the volume must still be there."""
    assert "storage: /data" in deployed["stdout"], "deploy did not provision [storage]"
    sess = session_for(cli_config["email"])

    def count():
        status, body = http("GET", deployed["url"], headers=sess)
        assert status == 200, f"expected 200, got {status}: {body[:100]}"
        return int(re.search(r"count: (\d+)", body).group(1))

    before = count()  # the volume persists across test runs, so the count is relative
    for _ in range(3):
        status, _ = http("POST", deployed["url"] + "inc", headers=sess, data=b"")
        assert status in (200, 303)
    assert count() == before + 3

    # force machine replacement: destroy every machine with an app-scoped token, redeploy
    bearer = {"Authorization": f"Bearer {cli_config['token']}", "Content-Type": "application/json"}
    status, body = http("POST", f"{API}/api/deploy", headers=bearer, data=json.dumps({"name": APP_NAME}).encode())
    assert status == 200, f"deploy api failed: {body}"
    d = json.loads(body)
    fly = {"Authorization": d["flyToken"]}
    machines_url = f"https://api.machines.dev/v1/apps/{d['flyApp']}/machines"
    status, body = http("GET", machines_url, headers=fly)
    assert status == 200, body
    machines = json.loads(body)
    assert machines, "no machine to destroy"
    for m in machines:
        status, body = http("DELETE", f"{machines_url}/{m['id']}?force=true", headers=fly)
        assert status in (200, 202), f"machine destroy failed: {body}"
    for _ in range(30):  # wait until the destroy has actually landed
        status, body = http("GET", machines_url, headers=fly)
        if status == 200 and not json.loads(body):
            break
        time.sleep(2)

    r = subprocess.run(
        [small(), "deploy"], cwd=project_dir, capture_output=True, text=True, timeout=600, encoding="utf-8", errors="replace"
    )
    assert r.returncode == 0, f"redeploy failed:\n{r.stdout}\n{r.stderr}"

    assert count() == before + 3, "count did not survive machine replacement"


def test_deploy_outside_git_prints_no_repo(deployed):
    assert "source: not a git repo" in deployed["stdout"]


def test_source_provenance_recorded(deployed, cli_config, project_dir):
    """Turn the fixture dir into a git repo at a known commit, redeploy, and assert
    the ✓ source line plus the deploys row (SHA, branch, normalized origin, clean tree).
    Runs after the main deploy — the earlier tests saw the not-a-git-repo path."""
    def git(*args):
        r = subprocess.run(
            ["git", "-c", "user.email=t@t", "-c", "user.name=t", *args],
            cwd=project_dir, capture_output=True, text=True, timeout=30,
        )
        assert r.returncode == 0, r.stderr
        return r.stdout.strip()

    git("init")
    git("remote", "add", "origin", "git@github.com:yudhisteer/small-deploy.git")
    git("add", ".")
    git("commit", "-m", "itest provenance", "--no-gpg-sign")
    sha = git("rev-parse", "HEAD")
    branch = git("rev-parse", "--abbrev-ref", "HEAD")

    r = subprocess.run(
        [small(), "deploy"], cwd=project_dir, capture_output=True, text=True, timeout=600, encoding="utf-8", errors="replace"
    )
    assert r.returncode == 0, f"redeploy failed:\n{r.stdout}\n{r.stderr}"
    assert f"✓ source: github.com/yudhisteer/small-deploy @ {branch} {sha[:7]}" in r.stdout
    assert "uncommitted changes" not in r.stdout

    status, body = http(
        "GET", f"{API}/api/apps/{APP_NAME}/deploys", headers={"Authorization": f"Bearer {cli_config['token']}"}
    )
    assert status == 200, body
    res = json.loads(body)
    assert len(res["deploys"]) >= 2, "history missing — expected the earlier non-git deploy too"
    latest = res["deploys"][0]
    assert latest["commit_sha"] == sha
    assert latest["branch"] == branch
    assert latest["repo_url"] == "https://github.com/yudhisteer/small-deploy"
    assert latest["dirty"] == 0
    assert latest["deployed_by"] == cli_config["email"]
    # this run's first deploy was outside git; the table persists across runs, so look for any null-commit row
    assert any(d["commit_sha"] is None for d in res["deploys"]), "the non-git deploy left no provenance-free row"


def test_request_logs(deployed, cli_config):
    """Three clicks as two users through the wall + one direct fly.dev hit →
    small logs shows the three lines with the right users/statuses and a
    rejected 403 line with no user."""
    org_domain = cli_config["email"].split("@")[1]
    nonce = str(int(time.time()))  # unique emails so this run's lines are unambiguous
    email_a = f"loga-{nonce}@{org_domain}"
    email_b = f"logb-{nonce}@{org_domain}"
    a = session_for(email_a)
    b = session_for(email_b)
    for sess in (a, a, b):  # three clicks: two as A, one as B
        status, _ = http("POST", deployed["url"] + "inc", headers=sess, data=b"")
        assert status in (200, 303)

    status, body = http("GET", f"{API}/api/apps", headers={"Authorization": f"Bearer {cli_config['token']}"})
    assert status == 200
    fly_app = next(x["fly_app"] for x in json.loads(body)["apps"] if x["name"] == APP_NAME)
    status, _ = http("GET", f"https://{fly_app}.fly.dev/")  # guard rejects: logged with no user
    assert status == 403

    def logs(*args):
        r = subprocess.run(
            [small(), "logs", APP_NAME, *args], capture_output=True, text=True, timeout=60, encoding="utf-8", errors="replace"
        )
        assert r.returncode == 0, f"small logs failed:\n{r.stdout}\n{r.stderr}"
        return r.stdout.splitlines()

    line_re = re.compile(r"^\d\d:\d\d:\d\d (\S+) (\S+) (\d+) \d+ms(?: (\S+))?$")
    ours_a = ours_b = rejected = []
    for _ in range(30):  # guard batches every 2s; poll until our lines land
        lines = logs()
        ours_a = [l for l in lines if email_a in l]
        ours_b = [l for l in lines if email_b in l]
        rejected = [m for m in map(line_re.match, lines) if m and m.group(3) == "403" and not m.group(4)]
        if len(ours_a) == 2 and len(ours_b) == 1 and rejected:
            break
        time.sleep(2)
    assert len(ours_a) == 2 and all(" POST /inc 303 " in l for l in ours_a), ours_a
    assert len(ours_b) == 1 and " POST /inc 303 " in ours_b[0], ours_b
    assert rejected, "no rejected 403 line with no user"

    only_a = [l for l in logs("--user", email_a) if line_re.match(l)]
    assert len(only_a) == 2 and all(email_a in l for l in only_a), only_a
