#!/usr/bin/env bash
# Deploy a release candidate A to the dev clone rabbit-hole-web-dev-animation ONLY. Never the shared worker, never production.
# Usage: bash deploy-preview-release.sh <A: 40-hex sha> [--ci-pending] [--check-only]
#   DEPLOY_WT / DEPLOY_BRANCH name the worktree and branch (defaults: animation-release / release/animation-mvp1). The ladder candidate:
#   DEPLOY_WT=C:/Users/cyudhist/Desktop/workspace/animation-ladder DEPLOY_BRANCH=release/animation-ladder-c4
# Refuses unless: HEAD is exactly A on the named branch, the tracked tree is clean, A is on rabbit-hole, and the newest verify and fast-e2e runs of A are
# completed successes. Vars on the clone only: ANIMATION_ENABLED, ANIMATION_DIAGNOSTICS, USAGE_PLATFORM_DAY_USD:40. Credentials are read by name from
# small-deploy/.env and never printed. The spend ledger (docs/features/animation/spend.md) is not touched by this script; the acceptance run must write
# its ledger in another checkout so A stays clean. The version carries --tag <12-char sha> and --message <full sha>; both are read back from Cloudflare.
#   --ci-pending  skips ONLY the "verify and fast-e2e completed success" guard (owner order, 3 November 2026 evening: the isolated dev-clone preview of the
#                 final ladder tree is deployed right after the push, before CI is green, and both gates start on it). It prints "CI PENDING: gates stand
#                 only if CI is green on this SHA". Every other guard stays. The worker name is fixed below and re-asserted: never use it for another worker.
#   --check-only  runs every guard, prints what it would do, builds and deploys nothing.
#   --platform-day-usd N  USAGE_PLATFORM_DAY_USD for the CLONE ONLY (default 40; at most 100; owner decision 4 November 2026: 100, because the rolling 24 h
#                 platform cap is shared by every lane and refused Gate 2 jobs). Passed as --var to this clone's deploy and read back from Cloudflare (settings
#                 bindings, plain text only). The worker name is asserted above: the option cannot reach any other worker, and no other variable changes.
set -euo pipefail
A=${1:?usage: deploy-preview-release.sh <A sha> [--ci-pending] [--check-only] [--platform-day-usd N]}
CI_PENDING=0; CHECK_ONLY=0; CAP=40
shift
while [ $# -gt 0 ]; do
  case "$1" in
    --ci-pending) CI_PENDING=1;;
    --check-only) CHECK_ONLY=1;;
    --platform-day-usd) shift; CAP=${1:-}; [[ "$CAP" =~ ^[0-9]+$ ]] && [ "$CAP" -ge 1 ] && [ "$CAP" -le 100 ] || { echo "RESULT FAIL --platform-day-usd needs an integer from 1 to 100 (owner decision 4 Nov 2026: 100 on the clone)"; exit 2; };;
    *) echo "RESULT FAIL unknown argument $1"; exit 2;;
  esac
  shift
done
WT=${DEPLOY_WT:-C:/Users/cyudhist/Desktop/workspace/animation-release}
BRANCH=${DEPLOY_BRANCH:-release/animation-mvp1}
ENVF=C:/Users/cyudhist/Desktop/workspace/small-deploy/.env
NAME=rabbit-hole-web-dev-animation
[ "$NAME" = rabbit-hole-web-dev-animation ] || { echo "RESULT FAIL the preview worker is fixed to rabbit-hole-web-dev-animation"; exit 2; }
REPO=Rabbit-Hole-App/Rabbit-Hole
LOG=C:/s/spec/animation/release/deploy-preview-release.log
AN_VARS="--var ANIMATION_ENABLED:true --var ANIMATION_DIAGNOSTICS:true --var USAGE_PLATFORM_DAY_USD:$CAP"
exec > >(tee -a "$LOG") 2>&1
if [ "$CAP" != 40 ]; then echo "PLATFORM DAY CAP RAISED to $CAP on the clone by owner decision (4 Nov 2026)"; fi
echo "== $(date -Iseconds) deploy $NAME of $A from $WT ($BRANCH) vars: $AN_VARS$( [ $CI_PENDING = 1 ] && echo ' [--ci-pending]' )$( [ $CHECK_ONLY = 1 ] && echo ' [--check-only]' )"
[[ "$A" =~ ^[0-9a-f]{40}$ ]] || { echo "RESULT FAIL A must be a full 40-hex sha"; exit 2; }
[ "$(git -C $WT rev-parse --abbrev-ref HEAD)" = "$BRANCH" ] || { echo "RESULT FAIL not on $BRANCH"; exit 2; }
[ "$(git -C $WT rev-parse HEAD)" = "$A" ] || { echo "RESULT FAIL HEAD is $(git -C $WT rev-parse HEAD), not $A"; exit 2; }
git -C $WT checkout -- packages/cli/bin/small.js 2>/dev/null || true   # npm ci rewrites its line endings
[ -z "$(git -C $WT status --porcelain --untracked-files=no)" ] || { echo "RESULT FAIL worktree has uncommitted tracked changes"; exit 2; }
git -C $WT fetch -q rabbit-hole
git -C $WT branch -r --contains "$A" | grep -q 'rabbit-hole/' || { echo "RESULT FAIL $A is not pushed to rabbit-hole"; exit 2; }
for w in verify fast-e2e; do
  c=$(gh run list -R $REPO --commit "$A" --workflow $w.yml --limit 1 --json status,conclusion,databaseId --jq '.[0]|"\(.databaseId) \(.status) \(.conclusion)"')
  echo "$w newest run of A: $c"
  if [ $CI_PENDING = 1 ]; then continue; fi
  case "$c" in *" completed success") ;; *) echo "RESULT FAIL $w is not a completed success on $A"; exit 2;; esac
done
if [ $CI_PENDING = 1 ]; then echo "CI PENDING: gates stand only if CI is green on this SHA ($A)"; fi
if [ $CHECK_ONLY = 1 ]; then echo "GUARDS OK (check only): would build, deploy $NAME with --tag ${A:0:12} --message $A, read back, run the post-deploy checks$( [ $CI_PENDING = 1 ] && echo ' [CI PENDING]' )"; exit 0; fi
val(){ grep -E "^$1=" "$ENVF" | head -1 | cut -d= -f2- | tr -d '\r' | sed -e 's/^"//' -e 's/"$//'; }
export VITE_COACHING_DEV=true
export VITE_TLDRAW_LICENSE_KEY="$(val TLDRAW_LICENSE_KEY)"
export CLOUDFLARE_API_TOKEN="$(val CLOUDFLARE_API_TOKEN)" CLOUDFLARE_ACCOUNT_ID="$(val CLOUDFLARE_ACCOUNT_ID)"
[ -n "$VITE_TLDRAW_LICENSE_KEY" ] && [ -n "$CLOUDFLARE_API_TOKEN" ] || { echo "RESULT FAIL missing key"; exit 2; }
cd "$WT/packages/web"
npm run build -- --outDir dist-dev
rm -rf dist && cp -r dist-dev dist
# shellcheck disable=SC2086
npx wrangler deploy --config wrangler.dev.jsonc --name "$NAME" --tag "${A:0:12}" --message "$A" $AN_VARS
# Read the served version back from Cloudflare (GET only): its id, SHA tag and message, for the acceptance's preview-pin gate.
node C:/s/spec/animation/release/preview-readback.mjs "$NAME" "$A" --var USAGE_PLATFORM_DAY_USD || echo "NOTE: the deploy itself succeeded; only the tag/message read-back did not match"
# Post-deploy checks (read-only): the page, the signed-out jobs route, the served bundle's client features (read from this tree), the launcher check.
B=https://$NAME.tryrabbithole.workers.dev; sleep 20
FEATS=$(node C:/s/spec/animation/release/tree-features.mjs "$WT")
echo "CHECK GET / -> $(curl -s -o /dev/null -w '%{http_code}' -A rabbit-hole-readonly $B/) (want 200)"
echo "CHECK signed-out GET jobs -> $(curl -s -o /dev/null -w '%{http_code}' -A rabbit-hole-readonly "$B/api/learn/animation/jobs?board=x") (want 401)"
echo "CHECK bundle features $FEATS: $(node C:/s/spec/animation/release/prod-bundle-probe.mjs --origin $B --features "$FEATS" 2>&1 | tail -1)"
echo "CHECK launcher: $(node C:/s/spec/animation/open-correction-fixture.mjs --check 2>&1 | tail -1 | cut -c1-120)"
if [ $CI_PENDING = 1 ]; then echo "CI PENDING: gates stand only if CI is green on this SHA ($A); runs: $(gh run list -R $REPO --commit "$A" --json workflowName,databaseId,status --jq '[.[]|"\(.workflowName) \(.databaseId) \(.status)"]|join("; ")')"; fi
echo "RESULT OK https://$NAME.tryrabbithole.workers.dev at $A$( [ $CI_PENDING = 1 ] && echo ' (CI PENDING: gates stand only if CI is green on this SHA)' )"
