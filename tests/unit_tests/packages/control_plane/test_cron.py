# Cron parser (packages/control-plane/src/cron.js): ten expressions with known
# next-run times, all UTC. Runs the real JS via node — no port, no mock.
import os
import subprocess
from pathlib import Path

import pytest

HERE = Path(os.path.dirname(os.path.abspath(__file__)))
CRON_JS = (HERE / ".." / ".." / ".." / ".." / "packages" / "control-plane" / "src" / "cron.js").resolve()

# (expression, from, expected next run) — nextRun is strictly after `from`.
# 2026-09-03 is a Thursday.
CASES = [
    ("* * * * *", "2026-09-03T12:00:30Z", "2026-09-03 12:01"),
    ("0 9 * * 1-5", "2026-09-03T10:00:00Z", "2026-09-04 09:00"),  # Thu 10:00 -> Fri 09:00
    ("0 9 * * 1-5", "2026-09-04T09:00:00Z", "2026-09-07 09:00"),  # Fri 09:00 -> Mon (weekend skipped)
    ("*/15 * * * *", "2026-09-03T12:07:00Z", "2026-09-03 12:15"),
    ("30 2 1 * *", "2026-09-03T00:00:00Z", "2026-10-01 02:30"),
    ("0 0 29 2 *", "2026-03-01T00:00:00Z", "2028-02-29 00:00"),  # leap day
    ("5,35 8-17 * * *", "2026-09-03T17:36:00Z", "2026-09-04 08:05"),
    ("0 12 13 * 5", "2026-09-03T00:00:00Z", "2026-09-04 12:00"),  # dom AND dow restricted = OR (standard cron)
    ("0 0 * 12 *", "2026-09-03T00:00:00Z", "2026-12-01 00:00"),
    ("59 23 31 12 *", "2026-01-01T00:00:00Z", "2026-12-31 23:59"),
]

SCRIPT = """
import(process.argv[3]).then((m) => {
  const t = m.nextRun(m.parseCron(process.argv[1]), Date.parse(process.argv[2]));
  console.log(new Date(t).toISOString().slice(0, 16).replace('T', ' '));
}).catch((e) => { console.error(e.message); process.exit(1); });
"""


def run_next(expr, from_iso):
    r = subprocess.run(
        ["node", "-e", SCRIPT, expr, from_iso, CRON_JS.as_uri()],
        capture_output=True, text=True, timeout=30,
    )
    assert r.returncode == 0, f"{expr!r}: {r.stderr}"
    return r.stdout.strip()


@pytest.mark.parametrize("expr,from_iso,expected", CASES)
def test_next_run(expr, from_iso, expected):
    assert run_next(expr, from_iso) == expected


@pytest.mark.parametrize("expr", ["0 9 * *", "60 * * * *", "* * * * mon", "0 0 30 2 *"])
def test_bad_expressions_rejected(expr):
    r = subprocess.run(
        ["node", "-e", SCRIPT, expr, "2026-09-03T00:00:00Z", CRON_JS.as_uri()],
        capture_output=True, text=True, timeout=30,
    )
    assert r.returncode == 1, f"{expr!r} should be rejected, got: {r.stdout}"
