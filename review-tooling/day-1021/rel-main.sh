#!/usr/bin/env bash
# Main push for a gated candidate (after rel-chain.sh printed READY): fast-forward only, then the release run and probes.
# Usage: W=<worktree> rel-main.sh
set -uo pipefail
R=Rabbit-Hole-App/Rabbit-Hole; W=${W:?}
SHA=$(git -C $W rev-parse HEAD)
pt() { TZ='PST8PDT,M3.2.0,M11.1.0' date '+%I:%M %p PT'; }
waitrun() { until [ "$(gh run view $1 -R $R --json status --jq .status 2>/dev/null)" = completed ]; do sleep 20; done; gh run view $1 -R $R --json conclusion --jq .conclusion; }
git -C $W fetch -q rabbit-hole main dev
MAIN=$(git -C $W rev-parse rabbit-hole/main); DEV=$(git -C $W rev-parse rabbit-hole/dev)
[ "$DEV" = "$SHA" ] || { echo "dev is ${DEV:0:8}, not the candidate ${SHA:0:8}: stop"; exit 1; }
git -C $W merge-base --is-ancestor $MAIN $SHA || { echo "main ${MAIN:0:8} is not an ancestor of ${SHA:0:8}: rebase first"; exit 1; }
git -C $W notes --ref=gates show $SHA >/dev/null 2>&1 || git -C $W fetch -q rabbit-hole refs/notes/gates:refs/notes/gates
since=$(date -u +%Y-%m-%dT%H:%M:%SZ)
git -C $W push rabbit-hole $SHA:refs/heads/main 2>&1 | tail -1
echo "main ${MAIN:0:8}..${SHA:0:8} pushed $(pt)"
P=; for i in $(seq 1 60); do P=$(gh run list -R $R --branch main --event push --limit 5 --json databaseId,createdAt,workflowName --jq "[.[] | select(.createdAt >= \"$since\") | select(.workflowName | test(\"release\";\"i\"))] | last | .databaseId // empty"); [ -n "$P" ] && break; sleep 5; done
[ -n "$P" ] || { echo 'release run not found'; exit 1; }
echo "release run $P"
c=$(waitrun $P); echo "release $P: $c $(pt)"
gh run view $P -R $R --log 2>/dev/null | grep -E "✓ released|released [0-9a-f]{40}" | tail -2 | cut -c1-400
for u in https://digrabbithole.com/ https://digrabbithole.com/sign-in https://digrabbithole.com/api/learn/usage https://digrabbithole.com/api/apps https://digrabbithole.com/api/learn/tutor/plan; do printf '%s ' "$(curl -s -o /dev/null -w '%{http_code}' "$u")"; done; echo
[ "$c" = success ] || { echo STOP; exit 1; }
echo "LIVE ${SHA} $(pt)"
