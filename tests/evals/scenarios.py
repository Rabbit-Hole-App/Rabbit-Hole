"""Shared scenario definitions for the skill eval (eval_skill.py) and the
benchmark (bench_skill.py): app fixtures, the fake `small`/`aws` shims, the
headless-claude runner, and per-scenario assertion functions.

Each scenario is prompt + project setup + checks(ctx) -> [(label, bool)].
ctx: work, project, cmds (argv[0] per small call), argvs (full argv lists),
result_text (agent's final text), returncode, cost/duration/turns when the
runner was asked for JSON output.
"""

import hashlib
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

# S4: a working script the agent is told not to modify - the adapter pattern.
WORKING_SCRIPT = """\
import sys


def word_stats(text):
    words = text.lower().split()
    return {"total": len(words), "unique": len(set(words))}


if __name__ == "__main__":
    print(word_stats(sys.argv[1]))
"""

# S5: reads two plain env vars and only prints - the jobs contract says declare
# them under [inputs] and write results to $SMALL_OUTPUTS.
ENV_REPORT = """\
import os

region = os.environ["REGION"]
limit = int(os.environ["LIMIT"])
print(f"top {limit} accounts in {region}")
"""

BYOC_JOB = """\
import os

text = os.environ["SMALL_INPUT_TEXT"]
print(len(text.split()), "words")
"""

BYOC_TOML = """\
name = "acme-counter"
entry = "job.py"
type = "job"

[deploy]
target = "aws"

[inputs]
text = { type = "text", required = true }
"""

# fake `small`: records argv, plays the part. First `deploy` in the aws scenario
# fails with the real-shaped trust-policy error so the skill's create-role loop
# runs. With EVAL_BYOC=1 and target = "aws" in small.toml, deploy demands
# --workspace w-acme (mirrors the aws-hosting flow) and `workspaces` lists slugs.
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
elif cmd == "workspaces":
    print("gmail-com  (email workspace)")
    print("w-acme  Acme")
    print("choose: small <command> --workspace <slug> (or set SMALL_WORKSPACE)")
elif cmd == "deploy":
    toml = Path("small.toml").read_text(encoding="utf-8") if Path("small.toml").exists() else ""
    if os.environ.get("EVAL_BYOC") == "1" and 'target = "aws"' in toml:
        if "--workspace" in argv and argv[argv.index("--workspace") + 1] == "w-acme":
            print("✓ workspace: w-acme (Acme)")
            print("✓ target: workspace w-acme · AWS 111122223333 / us-east-1")
            print("✓ deployed acme-counter → https://small-cp-dev.example.dev/apps/acme-counter")
        else:
            print("✗ No AWS connection for this job - pass --workspace <slug> (list them with: small workspaces)")
            sys.exit(1)
        sys.exit(0)
    if os.environ.get("EVAL_AWS") == "1" and "role_arn" in toml and not Path(".eval-role-created").exists():
        print("✗ aws: cannot assume arn:aws:iam::111122223333:role/small-tool (sts assume role failed (403): Access denied)")
        print("create the role in your AWS account with this trust policy, then redeploy:")
        print(json.dumps({"Version": "2012-10-17", "Statement": [{"Effect": "Allow",
              "Principal": {"AWS": "arn:aws:iam::637423432890:user/small-cp"},
              "Action": "sts:AssumeRole", "Condition": {"StringEquals": {"sts:ExternalId": "acme-com"}}}]}))
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


def skill_hash():
    h = hashlib.sha256()
    for p in sorted(SKILL_SRC.rglob("*")):
        if p.is_file() and "node_modules" not in p.parts:
            h.update(p.relative_to(SKILL_SRC).as_posix().encode())
            h.update(p.read_bytes())
    return h.hexdigest()[:8]


def run_scenario(name, *, skill=True, model=None, json_output=False):
    """Run one scenario headless. Returns the ctx dict the checks consume."""
    sc = SCENARIOS[name]
    work = Path(tempfile.mkdtemp(prefix=f"skill-eval-{name}-"))
    project = work / "tool"
    project.mkdir()
    sc["setup"](project)
    if skill:
        shutil.copytree(SKILL_SRC, project / ".claude" / "skills" / "small",
                        ignore=shutil.ignore_patterns("node_modules"))

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
        EVAL_AWS="1" if sc.get("aws") else "0",
        EVAL_BYOC="1" if sc.get("byoc") else "0",
    )
    claude = shutil.which("claude") or "claude"
    args = [claude, "-p", sc["prompt"], "--model", model or MODEL, "--dangerously-skip-permissions"]
    if json_output:
        args += ["--output-format", "json"]
    r = subprocess.run(args, cwd=project, env=env, capture_output=True, text=True,
                       timeout=900, encoding="utf-8", errors="replace")

    ctx = {"work": work, "project": project, "returncode": r.returncode,
           "stdout": r.stdout, "stderr": r.stderr,
           "result_text": r.stdout, "cost_usd": None, "duration_s": None, "turns": None}
    if json_output:
        try:
            d = json.loads(r.stdout)
            ctx["result_text"] = d.get("result") or ""
            ctx["cost_usd"] = d.get("total_cost_usd")
            ctx["duration_s"] = round((d.get("duration_ms") or 0) / 1000, 1)
            ctx["turns"] = d.get("num_turns")
        except (json.JSONDecodeError, TypeError):
            pass  # a crashed run still gets its checks applied (they will fail)
    log = work / "small-calls.log"
    ctx["argvs"] = [json.loads(l) for l in log.read_text(encoding="utf-8").splitlines()] if log.exists() else []
    ctx["cmds"] = [a[0] for a in ctx["argvs"] if a]
    ctx["aws_calls"] = (work / "aws-calls.log").read_text(encoding="utf-8") if (work / "aws-calls.log").exists() else ""
    return ctx


def _read(p):
    return p.read_text(encoding="utf-8") if p.exists() else ""


# ---------- setups ----------

def _setup_flask(project):
    (project / "app.py").write_text(FLASK_APP, encoding="utf-8")
    (project / "requirements.txt").write_text("flask\n", encoding="utf-8")


def _setup_s3(project):
    (project / "job.py").write_text(S3_JOB, encoding="utf-8")
    (project / "requirements.txt").write_text("boto3\n", encoding="utf-8")


def _setup_adapter(project):
    (project / "wordstats.py").write_text(WORKING_SCRIPT, encoding="utf-8")


def _setup_jobs(project):
    (project / "report.py").write_text(ENV_REPORT, encoding="utf-8")


def _setup_byoc(project):
    (project / "job.py").write_text(BYOC_JOB, encoding="utf-8")
    (project / "small.toml").write_text(BYOC_TOML, encoding="utf-8")


# ---------- checks: (label, bool) lists ----------

def _checks_plain(ctx):
    cmds, project = ctx["cmds"], ctx["project"]
    toml = _read(project / "small.toml")
    return [
        ("agent ran small at all", bool(cmds)),
        ("init before deploy", "init" in cmds and "deploy" in cmds and cmds.index("init") < cmds.index("deploy")),
        ("no Dockerfile invented", not (project / "Dockerfile").exists()),
        ("no auth bolted on (small.toml untouched by auth keys)", bool(toml) and "auth" not in toml.lower()),
        ("agent reported the URL", "small-cp.example.dev" in ctx["result_text"]),
    ]


def _checks_vague(ctx):
    return [
        ("vague ask still routed into small", bool(ctx["cmds"])),
        ("deploy reached", "deploy" in ctx["cmds"]),
    ]


def _checks_aws(ctx):
    project = ctx["project"]
    toml = _read(project / "small.toml")
    envf = _read(project / ".env")
    return [
        ("[aws] role declared in small.toml", "role_arn" in toml),
        ("role created via aws iam (skill loop ran)", "create-role" in ctx["aws_calls"]),
        ("redeployed to verified after creating the role", ctx["cmds"].count("deploy") >= 2),
        ("no AWS keys written to .env", "AWS_SECRET" not in envf and "AWS_ACCESS" not in envf),
    ]


def _checks_adapter(ctx):
    project = ctx["project"]
    others = [p for p in project.glob("*.py") if p.name != "wordstats.py"]
    return [
        ("original script byte-identical", _read(project / "wordstats.py") == WORKING_SCRIPT),
        ("thin adapter entry added (reads SMALL_INPUT_*)", any("SMALL_INPUT" in _read(p) for p in others)),
        ("deploy ran", "deploy" in ctx["cmds"]),
        ("no Dockerfile invented", not (project / "Dockerfile").exists()),
    ]


def _checks_jobs(ctx):
    project = ctx["project"]
    toml = _read(project / "small.toml")
    code = "\n".join(_read(p) for p in project.glob("*.py"))
    return [
        ("[inputs] declares region and limit", "[inputs]" in toml and "region" in toml and "limit" in toml),
        ("code reads SMALL_INPUT_*", "SMALL_INPUT_" in code),
        ("result written to $SMALL_OUTPUTS", "SMALL_OUTPUTS" in code),
        ("deploy ran", "deploy" in ctx["cmds"]),
    ]


def _checks_byoc(ctx):
    toml = _read(ctx["project"] / "small.toml")
    ws_deploys = [a for a in ctx["argvs"] if a and a[0] == "deploy" and "--workspace" in a]
    right_slug = any(a[a.index("--workspace") + 1] == "w-acme" for a in ws_deploys)
    return [
        ("workspaces listed before deploying", "workspaces" in ctx["cmds"]),
        ("deploy passed --workspace w-acme (slug from CLI, not display name)", right_slug),
        ("aws target not silently changed", 'target = "aws"' in toml),
        ("dev app link relayed", "small-cp-dev.example.dev" in ctx["result_text"]),
    ]


SCENARIOS = {
    "plain": {
        "title": "plain flask tool — 'share this with my team'",
        "prompt": "I built the small flask tool in this directory (app.py). Deploy it so my team can use it and tell me the link. Do not ask questions — everything you need is here.",
        "setup": _setup_flask, "checks": _checks_plain,
    },
    "vague": {
        "title": "vague ask — 'share this tool with my team'",
        "prompt": "Share this tool with my team.",
        "setup": _setup_flask, "checks": _checks_vague,
    },
    "aws": {
        "title": "boto3 job — role must be created, never keys in .env",
        "prompt": "Deploy the S3-counting job in this directory (job.py) so my team can run it. My AWS account is already signed in on this machine — set up whatever access the tool needs yourself. Do not ask questions.",
        "setup": _setup_s3, "checks": _checks_aws, "aws": True,
    },
    "adapter": {
        "title": "working script — deploy without rewriting it",
        "prompt": "wordstats.py works exactly as I want it. My colleagues need to run it on their own text whenever they want, as an on-demand job, and see the stats. Deploy it with small. Do not modify wordstats.py in any way. Do not ask questions.",
        "setup": _setup_adapter, "checks": _checks_adapter,
    },
    "jobs": {
        "title": "env-reading report — the [inputs]/$SMALL_OUTPUTS contract",
        "prompt": "Teammates need to run report.py themselves, each with their own region and limit, and download the result afterwards. Deploy it for them. Do not ask questions.",
        "setup": _setup_jobs, "checks": _checks_jobs,
    },
    "byoc": {
        "title": "aws hosting — workspace slug flow, target stays aws",
        "prompt": "Deploy the job in this directory. It must run inside our company AWS account through the existing connection on our Acme workspace. Do not ask questions.",
        "setup": _setup_byoc, "checks": _checks_byoc, "byoc": True,
    },
}

# The no-skill arm's damage report: things the skill exists to prevent.
def violations(ctx):
    project = ctx["project"]
    envf = _read(project / ".env")
    out = []
    if (project / "Dockerfile").exists() or (project / "docker-compose.yml").exists():
        out.append("wrote a Dockerfile")
    if "AWS_SECRET" in envf or "AWS_ACCESS" in envf:
        out.append("put AWS keys in .env")
    return out
