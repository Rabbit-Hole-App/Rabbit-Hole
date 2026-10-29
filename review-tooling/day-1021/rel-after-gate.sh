#!/usr/bin/env bash
# Generic release chain (2026-10-21): verify + fast-e2e green on the exact sha -> sharded gate (harness ref
# fix/ctrlk-gate-selection) -> gate note + dev push (forward only) -> deploy-dev result. Env W (worktree), D (gate dir).
# Usage: W=... D=... rel-after-gate.sh <gate run>  (resume rel-chain after a failed-only gate rerun)
set -uo pipefail
R=Rabbit-Hole-App/Rabbit-Hole; W=${W:?}
SHA=$(git -C $W rev-parse HEAD); TREE=$(git -C $W rev-parse HEAD^{tree}); D=${D:?}
pt() { TZ='PST8PDT,M3.2.0,M11.1.0' date '+%I:%M %p PT'; }
waitrun() { until [ "$(gh run view $1 -R $R --json status --jq .status 2>/dev/null)" = completed ]; do sleep 20; done; gh run view $1 -R $R --json conclusion --jq .conclusion; }
G=$1; echo "candidate $SHA gate $G $(pt)"
c=$(waitrun $G); echo "gate $G: $c $(pt)"
gh run view $G -R $R --json jobs --jq '[.jobs[] | "\(.name):\(.conclusion)"] | join(" ")'
[ "$c" = success ] || { echo STOP; exit 1; }
# Gate note, as after-gate-p2.sh: the artifact's gate.log for this tree, secret-scanned, then dev forward.
rm -rf "$D"; gh run download $G -R $R -p "r36-windows-gate-$SHA-*" -D "$D" || { echo 'no gate artifact'; exit 1; }
LOG=$(ls -d "$D"/r36-windows-gate-*/ | sort -V | tail -1)r36/artifacts/gate.log; [ -f "$LOG" ] || LOG=$(find "$D" -name gate.log | sort | tail -1); [ -n "$LOG" ] || { echo 'no gate.log in the artifact'; exit 1; }
LOG=$(realpath "$LOG")
head -5 "$LOG" | grep -q "index $TREE" || { echo 'gate.log is not for this tree'; exit 1; }
tail -1 "$LOG" | grep -q -- '-DONE' || { echo 'gate.log does not end with -DONE'; exit 1; }
if grep -n -E -i '(ghp_|gho_|github_pat_|sk-ant-|sk-[a-z0-9]{20,}|AKIA[0-9A-Z]{16}|bearer [a-z0-9._-]{20,}|small_session=[a-z0-9]|TEST_BYPASS_SECRET=.|password=.)' "$LOG" >/dev/null; then echo 'possible secret in gate.log: stop'; exit 1; fi
cd $W
git notes --ref=gates add -f -F "$LOG" $SHA || { echo "gate note failed: STOP"; exit 1; }
git push rabbit-hole refs/notes/gates 2>&1 | tail -1
since=$(date -u +%Y-%m-%dT%H:%M:%SZ)
git push rabbit-hole $SHA:refs/heads/dev 2>&1 | tail -1
echo "gate note pushed and dev at ${SHA:0:8} $(pt)"
P=; for i in $(seq 1 40); do P=$(gh run list -R $R --workflow deploy-dev.yml --branch dev --limit 5 --json databaseId,createdAt --jq "[.[] | select(.createdAt >= \"$since\")] | last | .databaseId // empty"); [ -n "$P" ] && break; sleep 5; done
[ -n "$P" ] || { echo 'deploy-dev run not found'; exit 1; }
c=$(waitrun $P); echo "deploy-dev $P: $c $(pt)"
[ "$c" = success ] || { echo STOP; exit 1; }
echo "READY for main push $(pt)"
