"""Behavioral eval for skills/small: does an agent FOLLOWING the skill do the
right thing? Runs headless Claude Code in a temp project with the skill
installed and a fake `small` (and `aws`) on PATH that records every call,
then asserts the action sequence — not the prose.

Scenario definitions live in scenarios.py (shared with bench_skill.py, which
adds reps, a no-skill arm and cost tracking on the same scenarios).

Costs real model tokens and runs an agent with permissions skipped inside the
temp dir — run by hand before publishing the skill, never in CI:

    .venv/Scripts/python tests/evals/eval_skill.py            # core scenarios
    .venv/Scripts/python tests/evals/eval_skill.py plain      # one scenario
    .venv/Scripts/python tests/evals/eval_skill.py adapter    # any from scenarios.py

Model via EVAL_MODEL (default claude-sonnet-5).
"""

import shutil
import sys

from scenarios import SCENARIOS, run_scenario

CORE = ["plain", "vague", "aws"]  # the pre-publish gate; bench runs all six


def debug(ctx):
    print(f"  -- claude exit {ctx['returncode']}; transcript tail:\n{ctx['stdout'][-1500:]}\n  -- stderr tail:\n{ctx['stderr'][-500:]}")
    print(f"  -- work dir kept for inspection: {ctx['work']}")


def run_one(name, failures):
    sc = SCENARIOS[name]
    print(f"scenario: {sc['title']}")
    ctx = run_scenario(name)
    bad = False
    for label, ok in sc["checks"](ctx):
        print(f"  {'PASS' if ok else 'FAIL'}  {label}")
        if not ok:
            failures.append(label)
            bad = True
    if bad:
        debug(ctx)
    else:
        shutil.rmtree(ctx["work"], ignore_errors=True)


if __name__ == "__main__":
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    names = CORE if which == "all" else [which]
    unknown = [n for n in names if n not in SCENARIOS]
    if unknown:
        sys.exit(f"unknown scenario {unknown[0]} - one of: {', '.join(SCENARIOS)}")
    failures = []
    for n in names:
        run_one(n, failures)
    print(f"\n{'ALL PASS' if not failures else f'{len(failures)} FAILURES: ' + '; '.join(failures)}")
    sys.exit(1 if failures else 0)
