#!/usr/bin/env bash
# Cut (or re-check) the forward RECOVERY BRANCH of one SGD-ladder MVP slice, on top of its candidate. Modeled on
# C:/s/spec/animation/release/cut-rollbacks.sh: local only, pushes nothing unless --push, never forces anything.
#
#   bash scripts/animation/cut-recovery.sh <mvp2b|mvp3|mvp4|mvp5> <candidate sha, 40 hex> [options]
#     --prev <sha>        the release before the candidate (default: merge-base of the candidate and <remote>/main)
#     --branch <name>     default recovery/animation-<slice>-<candidate sha first 8>; must be recovery/animation-*
#     --push              also push the branch to <remote> (a plain push: a branch that is not a fast-forward is refused, never forced)
#     --remote <name>     default rabbit-hole
#     --repo <dir>        default: the repository of the current directory (its tracked files must be clean)
#     --recipes <json>    default scripts/animation/recovery-recipes.json
#     --no-verify         skip the recipe's own test sets (the offline harness only)
#
# What it does: switches to a NEW branch cut from the candidate, applies the slice's recipe (recovery-steps.mjs), commits it with a
# plain message, then PROVES: the candidate is an ancestor of the branch and the branch is a strict descendant; the diff against the
# candidate is exactly the files the recipe touched and nothing outside its allow list; the recipe's tests pass on the branch. Any failure
# deletes the new branch and returns you to where you were. An existing branch is never reset: it is re-checked and reused if it passes.
# mvp-fast-path's --recovery <branch> needs the branch on rabbit-hole and a strict descendant of the release commit: cut with --push first.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
die() { echo "STOP: $*" >&2; exit 2; }
SLICE= CAND= PREV= BRANCH= REPO= RECIPES="$HERE/recovery-recipes.json" PUSH=0 REMOTE=rabbit-hole VERIFY=1
POS=()
while [ $# -gt 0 ]; do
  case "$1" in
    -f|--force*|--mirror|--delete|--prune|+*) die "$1 is refused: this script never forces, deletes or mirrors a remote branch" ;;
    --prev|--branch|--remote|--repo|--recipes) [ $# -ge 2 ] || die "$1 needs a value"; v=$2; case "$1" in --prev) PREV=$v ;; --branch) BRANCH=$v ;; --remote) REMOTE=$v ;; --repo) REPO=$v ;; --recipes) RECIPES=$v ;; esac; shift ;;
    --push) PUSH=1 ;;
    --no-verify) VERIFY=0 ;;
    -*) die "unknown option $1" ;;
    *) POS+=("$1") ;;
  esac
  shift
done
[ ${#POS[@]} -eq 2 ] || die "usage: cut-recovery.sh <mvp2b|mvp3|mvp4|mvp5> <40-hex candidate sha> [--prev sha] [--branch name] [--push] [--remote name] [--repo dir] [--recipes json]"
SLICE=${POS[0]}; CAND=${POS[1]}
[[ "$CAND" =~ ^[0-9a-f]{40}$ ]] || die "the candidate must be a full 40-character commit sha, not '$CAND'"
[ -f "$RECIPES" ] || die "no recipes file $RECIPES"
STEPS="node $HERE/recovery-steps.mjs"
$STEPS message --slice "$SLICE" --recipes "$RECIPES" >/dev/null 2>&1 || die "no recipe for '$SLICE' in $RECIPES"
cd "${REPO:-$(git rev-parse --show-toplevel)}"
git cat-file -e "$CAND^{commit}" 2>/dev/null || die "$CAND is not a commit in $(pwd)"
[ -z "$(git status --porcelain --untracked-files=no)" ] || die "tracked changes in $(pwd): commit or set them aside first"
[[ -n "$BRANCH" ]] || BRANCH="recovery/animation-$SLICE-${CAND:0:8}"
[[ "$BRANCH" =~ ^recovery/animation-[a-z0-9._-]+$ ]] || die "the branch must be recovery/animation-<name>, not '$BRANCH'"
if [ -z "$PREV" ]; then
  git rev-parse -q --verify "refs/remotes/$REMOTE/main" >/dev/null || die "no $REMOTE/main here to find the previous release: pass --prev <sha>"
  PREV=$(git merge-base "$CAND" "$REMOTE/main") || die "no merge base of the candidate and $REMOTE/main: pass --prev <sha>"
fi
[[ "$PREV" =~ ^[0-9a-f]{40}$ ]] || PREV=$(git rev-parse --verify "$PREV^{commit}") || die "--prev is not a commit"
[ "$PREV" != "$CAND" ] || die "the previous release equals the candidate (main is already at it): nothing to recover to"
git merge-base --is-ancestor "$PREV" "$CAND" || die "the previous release ${PREV:0:8} is not an ancestor of the candidate ${CAND:0:8}"

ORIG=$(git symbolic-ref -q --short HEAD || git rev-parse HEAD)
FRESH=0
cleanup() { # a failure leaves no half-cut branch behind
  local rc=$?
  if [ $rc -ne 0 ] && [ "$FRESH" = 1 ]; then git reset -q --hard HEAD 2>/dev/null || true; git switch -q "$ORIG" 2>/dev/null || git checkout -q "$ORIG" 2>/dev/null || true; git branch -q -D "$BRANCH" 2>/dev/null || true; echo "the new branch $BRANCH was removed; nothing was pushed" >&2; fi
  exit $rc
}
trap cleanup EXIT

TOUCHED=
if git rev-parse -q --verify "refs/heads/$BRANCH" >/dev/null; then
  echo "branch $BRANCH exists at $(git rev-parse --short=12 "$BRANCH"): re-checking it, not resetting it"
else
  FRESH=1
  git switch -q -c "$BRANCH" "$CAND"
  TOUCHED=$($STEPS apply --slice "$SLICE" --recipes "$RECIPES" --cand "$CAND" --prev "$PREV" | sed -n 's/^TOUCHED //p' | sort) || exit 2
  git commit -q -m "$($STEPS message --slice "$SLICE" --recipes "$RECIPES")"
fi

# ---- the proof ----
TIP=$(git rev-parse "$BRANCH")
git merge-base --is-ancestor "$CAND" "$BRANCH" || die "$BRANCH does not contain the candidate ${CAND:0:8}: it is not a recovery of this release"
[ "$TIP" != "$CAND" ] || die "$BRANCH is at the candidate itself: a recovery must be a strict descendant (no change was made)"
DIFF=$(git diff --name-only "$CAND" "$BRANCH" | sort)
[ -n "$DIFF" ] || die "$BRANCH changes nothing against the candidate"
BAD=$(printf '%s\n' "$DIFF" | $STEPS check --slice "$SLICE" --recipes "$RECIPES") || die "the diff against the candidate touches files outside the $SLICE allow list: $(echo $BAD)"
[ -z "$TOUCHED" ] || [ "$DIFF" = "$TOUCHED" ] || die "the diff against the candidate is not exactly what the recipe touched (recipe: $(echo $TOUCHED); diff: $(echo $DIFF))"
if [ "$VERIFY" = 1 ]; then
  git switch -q "$BRANCH" 2>/dev/null || true
  $STEPS verify --slice "$SLICE" --recipes "$RECIPES" || die "the recipe's tests fail on the recovery branch (see above)"
fi
git switch -q "$ORIG" 2>/dev/null || git checkout -q "$ORIG"

PUSHED=no
if [ "$PUSH" = 1 ]; then
  REMOTE_TIP=$(git ls-remote --heads "$REMOTE" "refs/heads/$BRANCH" | cut -f1)
  if [ "$REMOTE_TIP" = "$TIP" ]; then PUSHED="already on $REMOTE"
  else
    if [ -n "$REMOTE_TIP" ]; then
      git fetch -q "$REMOTE" "refs/heads/$BRANCH" && git merge-base --is-ancestor "$REMOTE_TIP" "$TIP" || die "$REMOTE/$BRANCH is not an ancestor of the local branch: refusing (never forced); pick another --branch"
    fi
    git push -q "$REMOTE" "$BRANCH:refs/heads/$BRANCH" || die "the push was refused (never forced)"
    [ "$(git ls-remote --heads "$REMOTE" "refs/heads/$BRANCH" | cut -f1)" = "$TIP" ] || die "after the push $REMOTE/$BRANCH is not at $TIP"
    PUSHED="yes, to $REMOTE"
  fi
fi
FRESH=0
SWITCH=$(node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))[process.argv[2]];console.log(r.title)' "$RECIPES" "$SLICE")
echo "RECOVERY BRANCH $BRANCH @ $TIP"
echo "  slice $SLICE: $SWITCH"
echo "  contains candidate ${CAND:0:12}; strict descendant; previous release ${PREV:0:12}"
echo "  diff against the candidate: $(printf '%s\n' "$DIFF" | wc -l | tr -d ' ') file(s): $(echo $DIFF)"
echo "  recipe tests: $([ "$VERIFY" = 1 ] && echo passed || echo SKIPPED --no-verify); pushed: $PUSHED"
[ "$PUSHED" != no ] || echo "  not pushed. mvp-fast-path --recovery needs it on $REMOTE: rerun with --push"
echo "RECOVERY READY ($SLICE): pass --recovery $BRANCH to the mvp preview"
