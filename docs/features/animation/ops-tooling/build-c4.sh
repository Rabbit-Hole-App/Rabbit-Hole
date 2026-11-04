#!/usr/bin/env bash
# Build C4 (= C5), the ONE final ladder tree (owner order, 3 November 2026 evening), on a NEW branch release/animation-ladder-c4 from the frozen C3'
# 53a47f33ca90f3f18144ea2b196be4a724f3d10f. release/animation-ladder is never touched. Merges only (never rebase or force), plain messages, no trailers.
# NOTHING here runs until the coordinator says 'build'.
#
#   bash build-c4.sh merge [--with-main]   create the branch, merge the lanes in the order below, resolve fix.md mechanically, add the docs commit
#   bash build-c4.sh check                 focused smoke list (ladder-smoke.sh: planner tests, every control-plane animation file alone, web animation3d,
#                                          verify build, production build + bundle check), then the FULL suites one at a time
#   bash build-c4.sh push                  push the branch to rabbit-hole, print the verify and fast-e2e run ids
#   bash build-c4.sh deploy                deploy-preview-release.sh <HEAD> --ci-pending (dev clone only): the isolated preview, BEFORE CI is green
#   bash build-c4.sh all [--with-main]     merge, check, push, deploy, identities; stops at the first failure
#   bash build-c4.sh identities            prompt-files hash, golden hash and candidate SHA (harness --dry-run, nothing sent)
#   --docs24                               also record owner decision 24 in the plan (an idempotent docs commit after the merges)
#   bash build-c4.sh mainff                fetch main and verify it is an ancestor of HEAD (the final main merge is then a no-op fast-forward)
#   --base <sha|branch> --branch <name> --only ref1,ref2   GENERIC INCREMENTAL run (no docs step), e.g. C7 on top of C6:
#                                          C4_EXPECT="feat/an20-c4-prompts=<sha>" bash build-c4.sh all --base release/animation-ladder-c6 --branch release/animation-ladder-c7 --only feat/an20-c4-prompts
#   --c6                                   INCREMENTAL second candidate: branch release/animation-ladder-c6 from 44b13764e (C4'), ONLY the moved lanes
#                                          (feat/an18-contract, feat/an20-c4-prompts), fix.md resolver as before, no decision-23 docs step; same check/push/deploy.
#                                          Generic form: --only ref1,ref2 [--no-docs] with C4_BRANCH / C4_BASE. Example (the real run):
#                                          C4_EXPECT="feat/an18-contract=<sha> feat/an20-c4-prompts=<sha>" bash build-c4.sh all --c6
#
# Order (each step is a plain merge commit; a step whose ref is missing stops the build with its name):
#   1  rabbit-hole/main                 ONLY with --with-main (when the coordinator says the --mvp branch has landed)
#   2  feat/an18-contract               lane c (trail-normals fix FX-AN-092)
#   3  feat/golden-sgd                  lane f (new camera, trail radius, check rewrite, new golden hash)
#   4  feat/an20-c4-prompts             lane d (3 author code fixes, re-pinned to the new golden)
#   5  feat/an20-c4-harness             lane d, scripts only
#   6  feat/an21-qualify                AN-21 scripts (d97068493 or later)
#   7  feat/ladder-smoke                smoke and recovery tooling (19680dabc or later)
#   8  feat/an21-copy                   lane e, product copy only (the "not supported yet" line removed, the loss-surface line added)
#   9  a docs commit recording decision 23 and the evening order change in docs/superpowers/plans/2026-10-30-animation.md (plan-doc-update.mjs)
# docs/features/animation/fix.md conflicts are resolved by resolve-fixmd.mjs (keep both sides, sorted by FX-AN number, no duplicate heading; the same
# heading with different text on both sides stops the build). Any other conflict stops the build with the merge left in place and the files listed.
set -uo pipefail
STAGE=${1:?usage: build-c4.sh merge|check|push|deploy|all [--with-main]}; shift || true
WITH_MAIN=0; FIRST=""; args=("$@")
for ((k=0; k<${#args[@]}; k++)); do
  [ "${args[$k]}" = --with-main ] && WITH_MAIN=1
  [ "${args[$k]}" = --first ] && FIRST=${args[$((k+1))]}   # step 1 is this ref instead of main (e.g. feat/mvp-fast-path, the --mvp candidate)
done
EXPECT=${C4_EXPECT:-}   # "ref=sha ref=sha": the ref's tip must contain sha (equal or a descendant), else the build stops
ONLY=""; NODOCS=0; PRESET=""; DOCS24=0; DOCSC8=0; DOCSC9=0; DOCSC10=0; DOCSC11=0; PDU=""
for ((k=0; k<${#args[@]}; k++)); do
  [ "${args[$k]}" = --only ] && ONLY=${args[$((k+1))]}        # comma separated refs: the step list is exactly these (an incremental run)
  [ "${args[$k]}" = --no-docs ] && NODOCS=1                   # skip the decision-23 docs step (already in the base)
  [ "${args[$k]}" = --c6 ] && PRESET=c6
  [ "${args[$k]}" = --docsc11 ] && DOCSC11=1                   # also record the C11 lineage note in the plan (one idempotent docs commit)
  [ "${args[$k]}" = --docsc10 ] && DOCSC10=1                   # also record the C10 lineage note in the plan (one idempotent docs commit)
  [ "${args[$k]}" = --platform-day-usd ] && PDU=${args[$((k+1))]}   # passed to the deploy (the dev clone only): the platform day cap on the clone
  [ "${args[$k]}" = --docsc9 ] && DOCSC9=1                     # also record the C9 lineage note in the plan (one idempotent docs commit)
  [ "${args[$k]}" = --docsc8 ] && DOCSC8=1                     # also record the C8 lineage note in the plan (one idempotent docs commit)
  [ "${args[$k]}" = --docs24 ] && DOCS24=1                     # also record owner decision 24 in the plan (one idempotent docs commit)
  [ "${args[$k]}" = --base ] && C4_BASE=${args[$((k+1))]}       # incremental: the branch or sha to build on (e.g. release/animation-ladder-c6)
  [ "${args[$k]}" = --branch ] && C4_BRANCH=${args[$((k+1))]}   # incremental: the new branch (e.g. release/animation-ladder-c7)
done
if [ -n "${C4_BASE:-}" ] && [ -n "${C4_BRANCH:-}" ] && [ -n "$ONLY" ]; then NODOCS=1; fi   # --base + --branch + --only is an incremental run: no docs step
if [ "$PRESET" = c6 ]; then
  # Second candidate, built INCREMENTALLY on the frozen C4' (44b13764e = release/animation-ladder-c4): only the two lane branches that moved are merged.
  C4_BRANCH=${C4_BRANCH:-release/animation-ladder-c6}; C4_BASE=${C4_BASE:-44b13764e0586da73d2217acb87d878fd18a3722}
  [ -n "$ONLY" ] || ONLY="feat/an18-contract,feat/an20-c4-prompts"; NODOCS=1
fi
# C4_WT / C4_WTW / C4_BRANCH / C4_BASE exist only for the rehearsal in a scratch worktree; the real run uses the defaults.
WT=${C4_WT:-/c/Users/cyudhist/Desktop/workspace/animation-ladder}; WTW=${C4_WTW:-C:/Users/cyudhist/Desktop/workspace/animation-ladder}
BRANCH=${C4_BRANCH:-release/animation-ladder-c4}; BASE=${C4_BASE:-53a47f33ca90f3f18144ea2b196be4a724f3d10f}
RD=/c/s/spec/animation/release; O=$RD/ladder; mkdir -p $O/logs
STATE=$O/STATE-$(basename $BRANCH).txt
REPO=Rabbit-Hole-App/Rabbit-Hole
pt() { TZ='PST8PDT,M3.2.0,M11.1.0' date '+%I:%M %p PT'; }
die() { echo "BUILD STOP ($STAGE): $* ($(pt))"; exit 1; }
cd $WT || die "no worktree $WT"

merge_stage() {
  [ -z "$(git status --porcelain --untracked-files=no)" ] || die "tracked changes in $WT"
  git fetch -q rabbit-hole || die "fetch failed"
  cur=$(git rev-parse --abbrev-ref HEAD)
  if git show-ref -q --verify refs/heads/$BRANCH; then [ "$cur" = $BRANCH ] || die "$BRANCH exists but $WT is on $cur"
  else
    git cat-file -e "$BASE^{commit}" 2>/dev/null || die "the base ${BASE:0:12} is not in this clone"
    git switch -q -c $BRANCH $BASE || die "could not create $BRANCH from ${BASE:0:12} (from $cur)"
  fi
  : > $STATE
  steps=(); [ $WITH_MAIN = 1 ] && steps+=("main"); [ -n "$FIRST" ] && steps+=("$FIRST")
  if [ -n "$ONLY" ]; then steps=(); IFS=, read -r -a steps <<< "$ONLY"; else
    steps+=("feat/an18-contract" "feat/golden-sgd" "feat/an20-c4-prompts" "feat/an20-c4-harness" "feat/an21-qualify" "feat/ladder-smoke" "feat/an21-copy"); fi
  n=1
  for ref in "${steps[@]}"; do
    n=$((n+1))
    sha=$(git rev-parse --verify -q "refs/remotes/rabbit-hole/$ref^{commit}") || die "step $n: rabbit-hole/$ref does not exist yet (the lane has not pushed it)"
    for pair in ${C4_REJECT:-}; do   # "ref=regex ref=regex" (no spaces inside a regex): scope guard, e.g. C10's lane c must carry no render-test or arrow-trace work
      if [ "${pair%%=*}" = "$ref" ]; then
        rx=${pair#*=}
        hits=$( { git log -i -E --grep="$rx" --format='commit %h %s' "$BASE..$sha"; git diff --name-only "$BASE...$sha" | grep -i -E "$rx" | sed 's/^/path /'; } 2>/dev/null )
        [ -z "$hits" ] || { echo "$hits" | head -20; die "step $n $ref: out of scope (matches $rx); NOT merged, tell the coordinator"; }
      fi
    done
    for pair in $EXPECT; do
      if [ "${pair%%=*}" = "$ref" ]; then
        want=${pair#*=}; wfull=$(git rev-parse --verify -q "$want^{commit}") || die "step $n $ref: expected commit $want is not in this clone"
        git merge-base --is-ancestor "$wfull" "$sha" || die "step $n $ref: the tip ${sha:0:9} does not contain the expected $want"
      fi
    done
    if git merge-base --is-ancestor "$sha" HEAD; then echo "step $n $ref ${sha:0:9}: already in the tree"; echo "$ref ${sha:0:9} already-in" >> $STATE; continue; fi
    echo "step $n: merging $ref ${sha:0:9} ($(git rev-list --count HEAD..$sha) commits)"
    if ! git merge --no-ff -m "Merge $ref (${sha:0:9}) into $BRANCH" "$sha" > $O/logs/c4-merge-$n.log 2>&1; then
      unmerged=$(git diff --name-only --diff-filter=U)
      if [ "$unmerged" = "docs/features/animation/fix.md" ]; then
        node $RD/resolve-fixmd.mjs docs/features/animation/fix.md || die "step $n $ref: fix.md is not mechanically resolvable (merge left in place)"
        git add docs/features/animation/fix.md
        git commit -q -m "Merge $ref (${sha:0:9}) into $BRANCH

docs/features/animation/fix.md conflicted because every lane appends its entries in the same place. Both sides are kept, ordered by FX-AN number; no heading appears twice." || die "commit after the fix.md resolution failed"
        echo "  fix.md conflict resolved mechanically"
      else
        echo "CONFLICTS merging $ref (merge left in place):"; echo "$unmerged"; die "step $n $ref: conflicts beyond fix.md"
      fi
    fi
    echo "$ref ${sha:0:9} merged -> $(git rev-parse --short=9 HEAD)" >> $STATE
  done
  # step 9: the docs commit (decision 23); skipped in an incremental run, where it is already in the base
  if [ $NODOCS = 1 ]; then echo "docs step skipped (--no-docs / --c6): decision 23 is in the base"; else
  node $RD/plan-doc-update.mjs docs/superpowers/plans/2026-10-30-animation.md || die "plan-doc-update failed"
  if [ -n "$(git status --porcelain --untracked-files=no docs/superpowers/plans/2026-10-30-animation.md)" ]; then
    git add docs/superpowers/plans/2026-10-30-animation.md
    git commit -q -m "docs(animation): decision 23 and the evening order change in the plan: one combined fast-path release, C4 = C5, the preview before CI, the gates stand only if CI is green" || die "docs commit failed"
    echo "step 9: decision 23 docs commit $(git rev-parse --short=9 HEAD)"
  else echo "step 9: decision 23 already recorded"; fi
  fi
  # decision 24 (owner, 4 November 2026): one small idempotent docs commit, after the merges
  if [ $DOCS24 = 1 ]; then
    node $RD/plan-doc-update-24.mjs docs/superpowers/plans/2026-10-30-animation.md || die "plan-doc-update-24 failed"
    if [ -n "$(git status --porcelain --untracked-files=no docs/superpowers/plans/2026-10-30-animation.md)" ]; then
      git add docs/superpowers/plans/2026-10-30-animation.md
      git commit -q -m "docs(animation): decision 24 in the plan: the 8-of-9 Gate 2 bar for one more cycle, the C7 scope, Gate 1 and Gate 2 rerun on C7, the golden unchanged, strict tool output parked with AN-22" || die "docs24 commit failed"
      echo "decision 24 docs commit $(git rev-parse --short=9 HEAD)"
    else echo "decision 24 already recorded"; fi
  fi
  if [ $DOCSC8 = 1 ]; then
    node $RD/plan-doc-update-c8.mjs docs/superpowers/plans/2026-10-30-animation.md || die "plan-doc-update-c8 failed"
    if [ -n "$(git status --porcelain --untracked-files=no docs/superpowers/plans/2026-10-30-animation.md)" ]; then
      git add docs/superpowers/plans/2026-10-30-animation.md
      git commit -q -m "docs(animation): C8 = C7 + FX-AN-098 recorded in the plan (the review page's readout strip keeps text readouts)" || die "docsc8 commit failed"
      echo "C8 docs commit $(git rev-parse --short=9 HEAD)"
    else echo "C8 note already recorded"; fi
  fi
  if [ $DOCSC9 = 1 ]; then
    node $RD/plan-doc-update-c9.mjs docs/superpowers/plans/2026-10-30-animation.md || die "plan-doc-update-c9 failed"
    if [ -n "$(git status --porcelain --untracked-files=no docs/superpowers/plans/2026-10-30-animation.md)" ]; then
      git add docs/superpowers/plans/2026-10-30-animation.md
      git commit -q -m "docs(animation): C9 = C8 + evidence + the owner's C9 list recorded in the plan" || die "docsc9 commit failed"
      echo "C9 docs commit $(git rev-parse --short=9 HEAD)"
    else echo "C9 note already recorded"; fi
  fi
  if [ $DOCSC10 = 1 ]; then
    node $RD/plan-doc-update-c10.mjs docs/superpowers/plans/2026-10-30-animation.md || die "plan-doc-update-c10 failed"
    if [ -n "$(git status --porcelain --untracked-files=no docs/superpowers/plans/2026-10-30-animation.md)" ]; then
      git add docs/superpowers/plans/2026-10-30-animation.md
      git commit -q -m "docs(animation): C10 = C9 + decision 29 azimuth line + decision 30 rim hold + label distance cap + primitives-check CI fix; platform day cap raised on the clone (decision 31); primitives-check fix: identical-frame redraw skip in session.js (FX-AN-107), fail-fast check" || die "docsc10 commit failed"
      echo "C10 docs commit $(git rev-parse --short=9 HEAD)"
    else echo "C10 note already recorded"; fi
  fi
  if [ $DOCSC11 = 1 ]; then
    node $RD/plan-doc-update-c11.mjs docs/superpowers/plans/2026-10-30-animation.md || die "plan-doc-update-c11 failed"
    if [ -n "$(git status --porcelain --untracked-files=no docs/superpowers/plans/2026-10-30-animation.md)" ]; then
      git add docs/superpowers/plans/2026-10-30-animation.md
      git commit -q -m "docs(animation): C11 = C10 + decision 34: the golden (the exemplar) retuned after the job-0 control rejected it (arrow scale, Full-batch step arrow and label, arrow colours, rim-consistent path); exemplar pin re-pinned (golden file ae82facb429a..., exemplar draft 9ae7fe47...); C10 CI green; golden and prompt-files hashes change; primitives check renamed slopeArrow->fullArrow" || die "docsc11 commit failed"
      echo "C11 docs commit $(git rev-parse --short=9 HEAD)"
    else echo "C11 note already recorded"; fi
  fi
  # after the merges: no markers, no duplicate headings, dependencies unchanged or reinstalled
  if git grep -n -E '^(<<<<<<< |>>>>>>> )' -- . ':!*.md' > $O/logs/c4-markers.log 2>&1; then die "conflict markers in tracked files: $(head -3 $O/logs/c4-markers.log)"; fi
  dup=$(grep -oE '^### FX-AN-[0-9]+' docs/features/animation/fix.md | sort | uniq -d); [ -z "$dup" ] || die "duplicate fix.md headings: $dup"
  if git diff --name-only $BASE HEAD | grep -qE '(^|/)package(-lock)?\.json$'; then echo "dependency files changed: npm ci"; npm ci --no-audit --no-fund > $O/logs/c4-npm-ci.log 2>&1 || die "npm ci failed"; node scripts/ensure-natives.mjs | tail -1; fi
  git checkout -- packages/cli/bin/small.js 2>/dev/null
  echo "MERGE DONE: $BRANCH = $(git rev-parse HEAD) ($(pt))"; cat $STATE
}

check_stage() {
  [ "$(git rev-parse --abbrev-ref HEAD)" = $BRANCH ] || die "not on $BRANCH"
  [ -z "$(git status --porcelain --untracked-files=no)" ] || die "tracked changes"
  RELEASE_WT=$WT RELEASE_WT_WIN=$WTW bash $RD/ladder-smoke.sh > /dev/null 2>&1
  grep -E 'RESULT' $O/RESULTS-smoke.txt | awk '{print $2, $3}' | tr '\n' ';'; echo
  bad=$(grep -E 'RESULT' $O/RESULTS-smoke.txt | awk '$3 != 0 {print $2}'); [ -z "$bad" ] || die "focused smoke failed: $bad (see $O/logs)"
  for v in $(env | cut -d= -f1 | grep -i -E 'KEY|TOKEN|SECRET|PASSWORD|CLOUDFLARE'); do unset $v; done; export CI=true
  : > $O/RESULTS-c4.txt
  full() { local name=$1; shift; ( "$@" ) > $O/logs/c4-$name.log 2>&1; rc=$?; echo "RESULT $name $rc $(grep -E '^ℹ (tests|pass|fail|skipped)' $O/logs/c4-$name.log | tr '\n' ' ')" | tee -a $O/RESULTS-c4.txt; return $rc; }
  full cp bash -c "cd packages/control-plane && npm test" || die "full control-plane suite failed (log c4-cp.log)"
  full web bash -c "cd packages/web && npm run test:unit" || die "full web suite failed (log c4-web.log)"
  full scripts node --test 'scripts/*.test.mjs' || die "scripts tests failed"
  echo "CHECK DONE ($(pt))"
}

push_stage() {
  [ "$(git rev-parse --abbrev-ref HEAD)" = $BRANCH ] || die "not on $BRANCH"
  [ -z "$(git status --porcelain --untracked-files=no)" ] || die "tracked changes"
  git push rabbit-hole $BRANCH:$BRANCH 2>&1 | grep -E '\->|rejected|error'
  sleep 25
  echo "PUSHED $BRANCH = $(git rev-parse HEAD) ($(pt)); CI: $(gh run list -R $REPO --commit $(git rev-parse HEAD) --json workflowName,databaseId,status --jq '[.[]|"\(.workflowName) \(.databaseId) \(.status)"]|join("; ")')"
}

deploy_stage() {
  sha=$(git rev-parse HEAD)
  DEPLOY_WT=$WTW DEPLOY_BRANCH=$BRANCH bash $RD/deploy-preview-release.sh $sha --ci-pending ${PDU:+--platform-day-usd $PDU} > $O/logs/c4-deploy.out 2>&1; rc=$?
  grep -E 'newest run|CI PENDING|Current Version ID|READBACK|CHECK|RESULT|NOTE|PLATFORM DAY CAP' $O/logs/c4-deploy.out | cut -c1-260
  [ $rc = 0 ] || die "preview deploy failed (rc $rc; log c4-deploy.out)"
}

identities_stage() {
  for v in $(env | cut -d= -f1 | grep -i -E 'KEY|TOKEN|SECRET|PASSWORD|CLOUDFLARE'); do unset $v; done
  node scripts/animation/author-sample.mjs run scripts/animation/plans/sgd-run5.json -n 1 --dry-run --out $O/author-dry 2>&1 | grep -E '^(prompt-files|golden|candidate)' | cut -c1-200
}

mainff_stage() {
  git fetch -q rabbit-hole main || die "fetch main failed"
  if git merge-base --is-ancestor rabbit-hole/main HEAD; then
    echo "MAIN FF: rabbit-hole/main $(git rev-parse --short=9 rabbit-hole/main) is an ancestor of HEAD $(git rev-parse --short=9 HEAD): the final main merge is a no-op fast-forward"
  else
    echo "MAIN NOT AN ANCESTOR: rabbit-hole/main $(git rev-parse --short=9 rabbit-hole/main) is not in HEAD $(git rev-parse --short=9 HEAD): main moved; one more merge of main is needed"; return 1
  fi
}

case "$STAGE" in
  merge) merge_stage;;
  check) check_stage;;
  push) push_stage;;
  deploy) deploy_stage;;
  identities) identities_stage;;
  mainff) mainff_stage;;
  all) merge_stage && check_stage && push_stage && deploy_stage && identities_stage && mainff_stage;;
  *) die "unknown stage $STAGE";;
esac
