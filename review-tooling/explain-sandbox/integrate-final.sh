#!/usr/bin/env bash
# Integrate the three /explain branches into feat/explain-sandbox-final, run the focused suites, push ONCE, repin the deploy launcher and start the gate watcher.
# Usage: bash integrate-final.sh            (merge + suites only; stops before the push)
#        bash integrate-final.sh --push     (also push once, repin the launcher, start the gate watcher)
# It STOPS on any conflict or failing suite. A suite counts as failed when node --test exits non-zero (its own exit code, never the
# exit code of a pipeline) or prints a failed-file marker; a local run is never described as a candidate's result: CI decides.
set -uo pipefail
W=C:/Users/cyudhist/Desktop/workspace/explain-sandbox-m3; D=C:/Users/cyudhist/Desktop/workspace/explain-sandbox-deploy; S=C:/s/spec/explain-sandbox
pt() { TZ='PST8PDT,M3.2.0,M11.1.0' date '+%I:%M %p PT'; }
die() { echo "INTEGRATE STOP: $* ($(pt))"; exit 1; }
fail=0
# run <label> <node --test args...>: judged by node's own exit status and by any failed-file marker in its output.
run() {
  local label=$1; shift
  local out rc summary
  out=$(node --test "$@" 2>&1); rc=$?
  summary=$(printf '%s\n' "$out" | grep -E '^ℹ (tests|pass|fail|cancelled)' | tr '\n' ' ')
  echo "$label exit=$rc $summary"
  if [ $rc -ne 0 ] || printf '%s\n' "$out" | grep -q '^✖'; then fail=1; printf '%s\n' "$out" | grep '^✖' | head -5; fi
}
cd $W || die "no worktree"
[ "$(git branch --show-current)" = feat/explain-sandbox-final ] || die "worktree is on $(git branch --show-current)"
[ -z "$(git status --porcelain --untracked-files=no)" ] || die "uncommitted tracked changes"
for b in feat/explain-share-read feat/explain-bugs; do
  git merge --no-edit -m "Merge $b into the final /explain candidate" "$b" 2>&1 | tail -1
  [ -z "$(git diff --name-only --diff-filter=U)" ] || die "conflict merging $b: $(git diff --name-only --diff-filter=U | tr '\n' ' ')"
done
echo "merged: $(git rev-parse --short=9 HEAD) ($(pt))"
cd packages/control-plane || die "no control-plane"
for f in explain-m3 explain-regression-ex1 explain-repair explain-review explain-job explain-render explain-program-budget explain-capture-manifest explain-author explain-b2 explain-program-draft shared-program-card learn-boards shared-card-source shared-canvas-v1 shared-canvas-privacy share-revocation; do
  [ -f test/$f.test.js ] || { echo "skip (missing) $f"; continue; }
  run "$f" test/$f.test.js
done
cd ../web || die "no web"
run web src/explain-program/*.test.mjs src/explain-client.test.mjs src/scene-layout.test.mjs src/scene-legibility.test.mjs
[ $fail = 0 ] || die "a focused suite failed locally (CI decides nothing yet)"
echo "FOCUSED SUITES EXITED CLEAN LOCALLY ($(pt)); this is not the candidate's result, CI is"
[ "${1:-}" = "--push" ] || { echo "dry: not pushing"; exit 0; }
F=$(git -C $W rev-parse HEAD)
git -C $W push rabbit-hole feat/explain-sandbox-final 2>&1 | tail -1 | cut -c1-100
git -C $D fetch -q rabbit-hole feat/explain-sandbox-final && git -C $D checkout -q --detach $F || die "deploy worktree"
printf 'SHA=%s\nGATE=PENDING\nMAIN_PREV=a644f5e46c46f331982a8dfec4b8bf3770a9db7a\n' $F > $S/launcher/sandbox-dev-deploy.pins
echo "PUSHED $F ($(pt)); starting the gate watcher into $S/gate-final2.log"
nohup bash -c "W=$W bash C:/s/spec/day-1021/gate-only.sh > $S/gate-final2.log 2>&1" >/dev/null 2>&1 &
echo "watcher pid $!"
