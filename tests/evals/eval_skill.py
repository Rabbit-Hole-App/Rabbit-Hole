"""Behavioral eval for skills/small: does an agent FOLLOWING the skill do the
right thing? Runs headless Claude Code in a temp project with the skill
installed and a fake `small` (and `aws`) on PATH that records every call,
then asserts the action sequence — not the prose.

Costs real model tokens and runs an agent with permissions skipped inside the
temp dir — run by hand before publishing the skill, never in CI:

    .venv/Scripts/python tests/evals/eval_skill.py            # both scenarios
    .venv/Scripts/python tests/evals/eval_skill.py plain      # one scenario

Model via EVAL_MODEL (default claude-sonnet-5).
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SKILL_SRC = REPO / "skills" / "small"
MODEL = os.environ.get("EVAL_MODEL", "claude-sonnet-5")

FLASK_APP = """\
from flask import Flask
app = Flask(__name__)

@app.route("/")
def home():
    return "team dashboard"
"""

S3_JOB = """\
import os
import boto3

s3 = boto3.client("s3")
bucket = os.environ["SMALL_INPUT_BUCKET"]
print(len(s3.list_objects_v2(Bucket=bucket).get("Contents", [])), "objects")
"""

# fake `small`: records argv, plays the part. First `deploy` in the aws scenario
# fails with the real-shaped trust-policy error so the skill's create-role loop runs.
FAKE_SMALL = r'''
import json, os, sys
from pathlib import Path

log = Path(os.environ["EVAL_LOG"])
calls = log.read_text(encoding="utf-8").splitlines() if log.exists() else []
argv = sys.argv[1:]
calls.append(json.dumps(argv))
log.write_text("\n".join(calls) + "\n", encoding="utf-8")
cmd = argv[0] if argv else ""

if cmd == "init":
    pys = [p for p in Path.cwd().glob("*.py")]
    entry = pys[0].name if pys else "app.py"
    Path("small.toml").write_text(
        f'name = "{Path.cwd().name}"\nentry = "{entry}"\nframework = ""\n\n[secrets]\nrequired = []\n\n[access]\nvisibility = "domain"\n'
    )
    print(f"✓ entry: {entry}")
    print("✓ wrote small.toml")
elif cmd == "deploy":
    toml = Path("small.toml").read_text(encoding="utf-8") if Path("small.toml").exists() else ""
    if os.environ.get("EVAL_AWS") == "1" and "role_arn" in toml and not Path(".eval-role-created").exists():
        print("✗ aws: cannot assume arn:aws:iam::111122223333:role/small-tool (sts assume role failed (403): Access denied)")
        print("create the role in your AWS account with this trust policy, then redeploy:")
        print(json.dumps({"Version": "2012-10-17", "Statement": [{"Effect": "Allow",
              "Principal": {"AWS": "arn:aws:iam::637423432890:user/small-cp"},
              "Action": "sts:AssumeRole", "Condition": {"StringEquals": {"sts:ExternalId": "acme-com"}}}]))
        print("and attach a permissions policy for what the app may touch (S3, Lambda, ...)")
        sys.exit(1)
    if "role_arn" in toml:
        print("✓ aws role: arn:aws:iam::111122223333:role/small-tool (verified — STS via control plane)")
    print("✓ deployed → https://small-cp.example.dev/a/acme-com/tool/")
    print("✓ login required · anyone @acme-com")
elif cmd == "runbook":
    print("## What it does\nA tool.\n## Commands\nnone")
elif cmd == "skill":
    print("✓ skill installed")
else:
    print(f"✓ {cmd} ok")
'''

# fake `aws`: sts/iam answered canned; create-role drops the marker the fake deploy checks.
FAKE_AWS = r'''
import json, os, sys
from pathlib import Path

log = Path(os.environ["EVAL_AWS_LOG"])
calls = log.read_text(encoding="utf-8").splitlines() if log.exists() else []
calls.append(json.dumps(sys.argv[1:]))
log.write_text("\n".join(calls) + "\n", encoding="utf-8")
a = sys.argv[1:]
if a[:2] == ["sts", "get-caller-identity"]:
    print(json.dumps({"Account": "111122223333", "Arn": "arn:aws:iam::111122223333:user/dev"}))
elif a[:2] == ["iam", "create-role"]:
    Path(os.environ["EVAL_MARKER"]).write_text("ok", encoding="utf-8")
    print(json.dumps({"Role": {"Arn": "arn:aws:iam::111122223333:role/small-tool"}}))
else:
    print("{}")
'''


def shim(bindir, name, script, env_line=""):
    py = bindir / f"_{name}.py"
    py.write_text(script, encoding="utf-8")
    (bindir / f"{name}.cmd").write_text(f'@echo off\r\n{env_line}"{sys.executable}" "{py}" %*\r\n', encoding="utf-8")
    (bindir / name).write_text(f'#!/bin/sh\n{env_line}exec "{sys.executable}" "{py}" "$@"\n', encoding="utf-8")


def run_scenario(name, app_code, prompt, aws=False):
    work = Path(tempfile.mkdtemp(prefix=f"skill-eval-{name}-"))
    project = work / "tool"
    project.mkdir()
    (project / ("job.py" if aws else "app.py")).write_text(app_code, encoding="utf-8")
    (project / "requirements.txt").write_text("boto3\n" if aws else "flask\n", encoding="utf-8")
    shutil.copytree(SKILL_SRC, project / ".claude" / "skills" / "small")

    bindir = work / "bin"
    bindir.mkdir()
    shim(bindir, "small", FAKE_SMALL)
    shim(bindir, "aws", FAKE_AWS)
    env = dict(
        os.environ,
        PATH=f"{bindir}{os.pathsep}{os.environ['PATH']}",
        EVAL_LOG=str(work / "small-calls.log"),
        EVAL_AWS_LOG=str(work / "aws-calls.log"),
        EVAL_MARKER=str(project / ".eval-role-created"),
        EVAL_AWS="1" if aws else "0",
    )
    claude = shutil.which("claude") or "claude"
    r = subprocess.run(
        [claude, "-p", prompt, "--model", MODEL, "--dangerously-skip-permissions"],
        cwd=project, env=env, capture_output=True, text=True, timeout=900,
        encoding="utf-8", errors="replace",
    )
    calls = [json.loads(l)[0] for l in (work / "small-calls.log").read_text(encoding="utf-8").splitlines()] if (work / "small-calls.log").exists() else []
    return work, project, calls, r


def check(label, cond, failures):
    print(f"  {'PASS' if cond else 'FAIL'}  {label}")
    if not cond:
        failures.append(label)


def debug(r, work):
    print(f"  -- claude exit {r.returncode}; transcript tail:\n{r.stdout[-1500:]}\n  -- stderr tail:\n{r.stderr[-500:]}")
    print(f"  -- work dir kept for inspection: {work}")


def scenario_plain(failures):
    print("scenario: plain flask tool — 'share this with my team'")
    work, project, calls, r = run_scenario(
        "plain", FLASK_APP,
        "I built the small flask tool in this directory (app.py). Deploy it so my team can use it and tell me the link. Do not ask questions — everything you need is here.",
    )
    check("agent ran small at all", bool(calls), failures)
    check("init before deploy", "init" in calls and "deploy" in calls and calls.index("init") < calls.index("deploy"), failures)
    check("no Dockerfile invented", not (project / "Dockerfile").exists(), failures)
    check("no auth bolted on (small.toml untouched by auth keys)", "auth" not in (project / "small.toml").read_text(encoding="utf-8").lower() if (project / "small.toml").exists() else False, failures)
    check("agent reported the URL", "small-cp.example.dev" in r.stdout, failures)
    if failures:
        debug(r, work)
    else:
        shutil.rmtree(work, ignore_errors=True)


def scenario_aws(failures):
    print("scenario: boto3 job — role must be created, never keys in .env")
    work, project, calls, r = run_scenario(
        "aws", S3_JOB,
        "Deploy the S3-counting job in this directory (job.py) so my team can run it. My AWS account is already signed in on this machine — set up whatever access the tool needs yourself. Do not ask questions.",
        aws=True,
    )
    toml = (project / "small.toml").read_text(encoding="utf-8") if (project / "small.toml").exists() else ""
    envf = (project / ".env").read_text(encoding="utf-8") if (project / ".env").exists() else ""
    aws_calls = (work / "aws-calls.log").read_text(encoding="utf-8") if (work / "aws-calls.log").exists() else ""
    check("[aws] role declared in small.toml", "role_arn" in toml, failures)
    check("role created via aws iam (skill loop ran)", "create-role" in aws_calls, failures)
    check("redeployed to verified after creating the role", calls.count("deploy") >= 2, failures)
    check("no AWS keys written to .env", "AWS_SECRET" not in envf and "AWS_ACCESS" not in envf, failures)
    if failures:
        debug(r, work)
    else:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    failures = []
    if which in ("all", "plain"):
        scenario_plain(failures)
    if which in ("all", "aws"):
        scenario_aws(failures)
    print(f"\n{'ALL PASS' if not failures else f'{len(failures)} FAILURES: ' + '; '.join(failures)}")
    sys.exit(1 if failures else 0)
