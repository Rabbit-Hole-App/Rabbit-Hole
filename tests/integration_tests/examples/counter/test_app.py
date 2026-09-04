"""Integration tests: deploy a Flask app with the published small-deploy CLI,
then exercise the deployed URL — auth wall, guard, shared state across two users.

Needs: `npm i -g small-deploy`, `small login` done once (~/.small/config.json),
and repo-root .env with SMALL_API + SMALL_TEST_BYPASS.
"""

import json
import re
import shutil
import subprocess
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
API = ENV["SMALL_API"]
BYPASS = ENV["SMALL_TEST_BYPASS"]
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


@pytest.fixture(scope="session")
def deployed(project_dir, cli_config):
    """Deploy the fixture app once via the globally installed CLI; return its URL."""
    small = shutil.which("small")
    assert small, "small-deploy not installed — npm i -g small-deploy"
    r = subprocess.run(
        [small, "deploy"], cwd=project_dir, capture_output=True, text=True, timeout=600, encoding="utf-8", errors="replace"
    )
    assert r.returncode == 0, f"deploy failed:\n{r.stdout}\n{r.stderr}"
    m = re.search(r"deployed → (\S+)", r.stdout)
    assert m, f"no URL in output:\n{r.stdout}"
    return {"url": m.group(1), "stdout": r.stdout, "org": cli_config["org"]}


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
