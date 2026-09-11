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
import re
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

# S8: a detector whose logic consumes two module constants; two decoys that the
# [constants] rules exclude (platform plumbing, never-read tag).
DETECT_JOB = '''\
import json
import os

THRESHOLD = 0.85          # minimum confidence a detection must reach
COOLDOWN_FRAMES = 7       # frames to skip after an alert fires
RUN_LIMIT_MB = 45         # upload cap enforced by the deploy platform
BUILD_TAG = "detector-2026-03"


def detect(scores):
    alerts, wait = [], 0
    for i, s in enumerate(scores):
        if wait:
            wait -= 1
            continue
        if s >= THRESHOLD:
            alerts.append(i)
            wait = COOLDOWN_FRAMES
    return alerts


if __name__ == "__main__":
    scores = json.loads(os.environ["SMALL_INPUT_SCORES"])
    print(json.dumps(detect(scores)))
'''

DETECT_TOML = """\
name = "acme-detector"
entry = "job.py"
type = "job"

[deploy]
target = "aws"

[inputs]
scores = { type = "text", required = true }
"""

# S9: exactly two SDK calls on named customer resources - the grants must
# trace to them and nothing else.
GRANTS_JOB = '''\
import os

import boto3

s3 = boto3.client("s3")
lam = boto3.client("lambda")

report = s3.get_object(Bucket="acme-reports", Key=os.environ["SMALL_INPUT_KEY"])["Body"].read()
resp = lam.invoke(FunctionName="acme-summarizer", Payload=report)
print("invoked:", resp["StatusCode"])
'''

GRANTS_TOML = """\
name = "acme-summary"
entry = "job.py"
type = "job"

[deploy]
target = "aws"

[inputs]
key = { type = "text", required = true }
"""

# fake `small`: records argv, plays the part. First `deploy` in the aws scenario
# fails with the real-shaped trust-policy error so the skill's create-role loop
# runs. With EVAL_BYOC=1 and target = "aws" in small.toml, deploy demands
# --workspace w-acme (mirrors the aws-hosting flow) and `workspaces` lists slugs.
FAKE_SMALL = r'''
import json, os, re, sys
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
    print("w-acme  Acme  (AWS 111122223333 · us-east-1)")
    print("choose: small <command> --workspace <slug> (or set SMALL_WORKSPACE)")
elif cmd == "deploy":
    toml = Path("small.toml").read_text(encoding="utf-8") if Path("small.toml").exists() else ""
    if os.environ.get("EVAL_BYOC") == "1" and 'target = "aws"' in toml:
        if "--workspace" in argv and argv[argv.index("--workspace") + 1] == "w-acme":
            m = re.search(r'name = "([^"]+)"', toml)
            app = m.group(1) if m else "app"
            print("✓ workspace: w-acme (Acme)")
            print("✓ target: workspace w-acme · AWS 111122223333 / us-east-1")
            if "grants" in toml:
                print("✓ app access: grants approved by the connection owner")
            if "[constants]" in toml:
                print("✓ constants: recorded, shown read-only under Run > Constants")
            print(f"✓ deployed {app} → https://small-cp-dev.example.dev/apps/{app}")
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


def _setup_constants(project):
    (project / "job.py").write_text(DETECT_JOB, encoding="utf-8")
    (project / "small.toml").write_text(DETECT_TOML, encoding="utf-8")


def _setup_grants(project):
    (project / "job.py").write_text(GRANTS_JOB, encoding="utf-8")
    (project / "small.toml").write_text(GRANTS_TOML, encoding="utf-8")
    (project / "requirements.txt").write_text("boto3\n", encoding="utf-8")


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
        ("runbook read back (handback checklist)", "runbook" in cmds),
        ("AGENT.md written with app context", len(_read(project / "AGENT.md").strip()) > 0),
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


def _ws_deploy_ran(ctx):
    ws_deploys = [a for a in ctx["argvs"] if a and a[0] == "deploy" and "--workspace" in a]
    return any(a[a.index("--workspace") + 1] == "w-acme" for a in ws_deploys)


def _no_placeholder(toml):
    """No angle-bracket template markers; no AWS account id other than the
    installation's own (111122223333) - anything else was copied or invented."""
    return (not re.search(r"<[a-z][a-z0-9-]*>", toml, re.I)
            and all(m == "111122223333" for m in re.findall(r"\b\d{12}\b", toml)))


def _checks_constants(ctx):
    project = ctx["project"]
    toml = _read(project / "small.toml")
    consts = re.search(r"\[constants\](.*?)(\n\[|\Z)", toml, re.S)
    csec = consts.group(1).lower() if consts else ""
    inputs = re.search(r"\[inputs\](.*?)(\n\[|\Z)", toml, re.S)
    isec = inputs.group(1).lower() if inputs else ""
    code = "\n".join(_read(p) for p in project.glob("*.py"))
    decoys = csec + isec  # sections only - a comment naming a decoy is fine
    return [
        ("[constants] declares both consumed values (0.85 threshold, 7-frame cooldown)",
         "0.85" in csec and "7" in csec),
        ("plumbing and never-read decoys excluded", "run_limit" not in decoys and "build_tag" not in decoys),
        ("code reads SMALL_CONSTANTS", "SMALL_CONSTANTS" in code),
        ("constants not offered as editable inputs", "threshold" not in isec and "0.85" not in isec),
        ("no example placeholder or account copied", _no_placeholder(toml)),
        ("deployed through workspace w-acme", _ws_deploy_ran(ctx)),
    ]


def _checks_grants(ctx):
    toml = _read(ctx["project"] / "small.toml")
    one_line = any("s3:GetObject" in l and "lambda:InvokeFunction" in l for l in toml.splitlines())
    return [
        ("GetObject grant on the real bucket", "s3:GetObject" in toml and "acme-reports" in toml),
        ("InvokeFunction grant with installation account", "lambda:InvokeFunction" in toml
         and "111122223333" in toml and "acme-summarizer" in toml),
        ("no wildcard action or resource", '= "*"' not in toml and "s3:*" not in toml and ":*\"" not in toml),
        ("no untraced extra actions", "s3:PutObject" not in toml and "s3:ListBucket" not in toml),
        ("grants stay on one physical line", one_line),
        ("no example placeholder or account copied", _no_placeholder(toml)),
        ("deployed through workspace w-acme", _ws_deploy_ran(ctx)),
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
    "constants": {
        "title": "[constants] — expose consumed values read-only, skip decoys",
        "prompt": "Deploy the detector job in this directory to our company AWS through the existing connection on our Acme workspace (our private installation advertises support for fixed read-only run values and input tooltips). Teammates keep asking which fixed detection settings each run used — make those visible on the app's Run page without letting anyone edit them. Do not ask questions.",
        "setup": _setup_constants, "checks": _checks_constants, "byoc": True,
    },
    "grants": {
        "title": "aws grants — exact actions on resolved resources, one line",
        "prompt": "Deploy this job through the existing connection on our Acme workspace. It must be able to do exactly what the code does against our real AWS resources — declare the access it needs so our administrator can review it. The bucket and function names in the code are the real ones. Do not ask questions.",
        "setup": _setup_grants, "checks": _checks_grants, "byoc": True,
    },
}

# ---------- knowledge Q&A: does the skill let the agent answer platform ----------
# questions truthfully instead of inventing limits? One agent run answers all
# questions; each check greps the whole answer for the mechanism a correct
# answer must name. Questions never contain their answers (leakage policy).

KNOWLEDGE_QA = [
    ("slider", "Can the 'parallel' input show up as a slider on the dashboard Run form instead of a plain box? How?",
     "Yes - a number input with both min and max renders as a slider (plus a typed box) on the Run form."),
    ("batch", "A teammate has a list of 12 account names. Can they start one run per account from the Run form without submitting 12 times? How?",
     "Yes - the + beside a text field adds value rows (a multi-line paste splits into rows automatically); submit starts one run per value with every other field shared, bounded by a product limit on runs per batch."),
    ("defaults", "If an input declares a default in small.toml, what does the Run form show for that field?",
     "The field comes pre-filled with the declared default; the user can edit it before running."),
    ("outputs", "Where must the script write result files so teammates can download them from the run page?",
     "Into the directory named by the SMALL_OUTPUTS env var - every file written there becomes a downloadable run output."),
    ("storage", "How does an app keep its data across deploys and machine replacement?",
     "Declare a [storage] block in small.toml - a persistent volume is mounted and SMALL_DATA points at it; keep state there (e.g. sqlite), never in process memory."),
    ("types", "List every input type small supports.",
     "Exactly six: file, number, select, date, text, bool."),
    ("constants-read", "A private AWS job's small.toml declares fixed values under [constants]. How does the running Python code receive them?",
     "Via the SMALL_CONSTANTS env var: json.loads(os.environ['SMALL_CONSTANTS']) yields the scalar values; the tooltip/definition objects are never passed to the job."),
    ("constants-change", "A teammate wants different values for the entries shown under Run > Constants next week. What do they do in the dashboard?",
     "Nothing in the dashboard - Run > Constants is read-only; changing a constant requires editing small.toml and redeploying the app."),
    ("tooltip", "Does the tooltip text on an input change which value the job receives?",
     "No - a tooltip is explanatory text behind an information icon beside the label; it does not configure behavior, the script still receives only the value."),
    ("retirement", "On a private AWS installation with image retirement, a deploy replaced last week's version of an app. Can teammates still start runs of that older version, and what remains of it?",
     "No - replaced versions cannot start new runs; deploy the old source again to run it. Run history, logs, and outputs remain."),
    ("region", "Which AWS region does a private-installation job deploy into?",
     "The region the installation/connection itself reports - there is no fixed universal region; never assume one from an example."),
]

_JUDGE_MODEL = os.environ.get("EVAL_JUDGE_MODEL", "claude-haiku-4-5-20251001")


def _judge_knowledge(answer):
    """Grade the numbered answer against the reference facts with a cheap model.
    Returns a list of booleans, one per question; all-False if judging fails."""
    rubric = "\n\n".join(
        f"Q{i}: {q}\nReference fact: {ref}" for i, (_, q, ref) in enumerate(KNOWLEDGE_QA, 1))
    prompt = (
        "Grade a candidate's answers about a deploy tool. For each question, the answer is "
        "correct only if it asserts the reference fact (paraphrase fine, extra detail fine); "
        "it is wrong if it denies the fact, invents a limitation, or dodges.\n\n"
        f"{rubric}\n\nCandidate's answers:\n{answer}\n\n"
        f'Reply with ONLY a JSON array of {len(KNOWLEDGE_QA)} booleans, one per question, in order.'
    )
    claude = shutil.which("claude") or "claude"
    try:
        r = subprocess.run([claude, "-p", prompt, "--model", _JUDGE_MODEL],
                           capture_output=True, text=True, timeout=120,
                           encoding="utf-8", errors="replace")
        m = re.search(r"\[.*?\]", r.stdout, re.DOTALL)
        verdicts = json.loads(m.group(0)) if m else []
    except (subprocess.SubprocessError, json.JSONDecodeError, OSError):
        verdicts = []
    if len(verdicts) != len(KNOWLEDGE_QA):
        verdicts = [False] * len(KNOWLEDGE_QA)
    return [bool(v) for v in verdicts]


def _setup_knowledge(project):
    (project / "job.py").write_text(ENV_REPORT, encoding="utf-8")
    (project / "small.toml").write_text(
        'name = "report"\nentry = "job.py"\ntype = "job"\n\n[inputs]\n'
        'parallel = { type = "number", default = 4, min = 1, max = 20 }\n'
        'account = { type = "text", required = true }\n', encoding="utf-8")


def _checks_knowledge(ctx):
    verdicts = _judge_knowledge(ctx["result_text"])
    return [(f"knows: {qid}", ok) for (qid, _, _), ok in zip(KNOWLEDGE_QA, verdicts)]


_KNOWLEDGE_PROMPT = (
    "A teammate asks the following questions about small (the deploy tool this project uses). "
    "Answer each one accurately and concretely, numbered. Do not run any commands.\n\n"
    + "\n".join(f"{i}. {q}" for i, (_, q, _f) in enumerate(KNOWLEDGE_QA, 1))
)

SCENARIOS["knowledge"] = {
    "title": "platform Q&A — answers from skill knowledge, no invented limits",
    "prompt": _KNOWLEDGE_PROMPT,
    "setup": _setup_knowledge, "checks": _checks_knowledge,
}

# The no-skill arm's damage report: things the skill exists to prevent.
def violations(ctx):
    project = ctx["project"]
    envf = _read(project / ".env")
    toml = _read(project / "small.toml")
    out = []
    if (project / "Dockerfile").exists() or (project / "docker-compose.yml").exists():
        out.append("wrote a Dockerfile")
    if "AWS_SECRET" in envf or "AWS_ACCESS" in envf:
        out.append("put AWS keys in .env")
    if re.search(r"<[a-z][a-z0-9-]*>", toml, re.I):
        out.append("left an angle-bracket placeholder in small.toml")
    if any(m != "111122223333" for m in re.findall(r"\b\d{12}\b", toml)):
        out.append("copied or invented an AWS account id")
    return out
