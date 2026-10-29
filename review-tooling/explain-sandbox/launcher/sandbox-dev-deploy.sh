#!/usr/bin/env bash
# Sandbox dev deploy (NOT a release): move the stable preview (preview.digrabbithole.com, Worker rabbit-hole-web-dev-small-parallel) forward to the gated sandbox commit.
# Steps = the dev half of the release trains (rel-after-gate.sh): gate note, forward-only push to the `dev` branch, wait for deploy-dev. It NEVER pushes main and runs no migration.
# Pins come from sandbox-dev-deploy.pins (SHA, GATE, MAIN_PREV). Usage: bash sandbox-dev-deploy.sh [--check]    (--check: read-only verification, pushes nothing)
set -uo pipefail
HERE=$(cd "$(dirname "$0")" && pwd); . "$HERE/sandbox-dev-deploy.pins"
R=Rabbit-Hole-App/Rabbit-Hole; W=C:/Users/cyudhist/Desktop/workspace/explain-sandbox-deploy; D=/c/s/spec/explain-sandbox/gate-dl
CHECK=0; [ "${1:-}" = "--check" ] && CHECK=1
pt() { TZ='PST8PDT,M3.2.0,M11.1.0' date '+%I:%M %p PT'; }
die() { echo "SANDBOX DEV DEPLOY STOP: $* ($(pt))"; exit 1; }
for t in git gh node; do command -v $t >/dev/null || die "$t is not on PATH"; done
echo "=== sandbox dev deploy $( [ $CHECK = 1 ] && echo CHECK || echo RUN ): candidate ${SHA:0:8}, gate $GATE, main must be ${MAIN_PREV:0:8} ($(pt)) ==="
[ "$(git -C $W rev-parse HEAD)" = "$SHA" ] || die "$W is at $(git -C $W rev-parse --short=8 HEAD), not the pinned ${SHA:0:8}"
[ -z "$(git -C $W status --porcelain --untracked-files=no)" ] || die "$W has uncommitted tracked changes"
git -C $W fetch -q rabbit-hole main dev || die "fetch failed"
MAIN=$(git -C $W rev-parse rabbit-hole/main); DEV=$(git -C $W rev-parse rabbit-hole/dev)
[ "$MAIN" = "$MAIN_PREV" ] || die "main is ${MAIN:0:8}, expected ${MAIN_PREV:0:8}: re-cut the candidate on the new main"
git -C $W merge-base --is-ancestor "$DEV" "$SHA" || die "dev ${DEV:0:8} is not an ancestor of the candidate: forward-only refuses"
git -C $W merge-base --is-ancestor "$MAIN" "$SHA" || die "main is not an ancestor of the candidate"
[ "$(gh run view "$GATE" -R $R --json conclusion --jq .conclusion)" = success ] || die "gate $GATE is not success"
for w in verify fast-e2e; do
  c=$(gh run list -R $R --commit "$SHA" --workflow $w.yml --json conclusion,createdAt --jq '[.[]|select(.conclusion=="success")]|length'); [ "${c:-0}" -ge 1 ] || die "no successful $w run on ${SHA:0:8}"
done
echo "checks ok: worktree, main, dev ancestry (dev ${DEV:0:8}), gate $GATE success, verify and fast-e2e success on ${SHA:0:8}"
[ $CHECK = 1 ] && { echo "CHECK COMPLETE: nothing was pushed ($(pt))"; exit 0; }
[ "$DEV" = "$SHA" ] && { echo "dev is already the candidate"; exit 0; }
W="$W" D="$D" bash /c/s/spec/day-1021/rel-after-gate.sh "$GATE" || die "dev move failed (re-run this launcher to resume)"
git -C $W fetch -q rabbit-hole dev; [ "$(git -C $W rev-parse rabbit-hole/dev)" = "$SHA" ] || die "dev is not at the candidate after the deploy"
echo "SANDBOX DEV DEPLOY DONE: dev = ${SHA:0:8}; preview.digrabbithole.com serves it once deploy-dev finished ($(pt)). Main was NOT touched."
