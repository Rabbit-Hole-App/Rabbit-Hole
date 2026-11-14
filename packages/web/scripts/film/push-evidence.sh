#!/bin/bash
# Push a take's evidence to the reading branch film/evidence (reviewer's copy, no code, never merges) with git plumbing: no worktree, no checkout.
# Usage: bash push-evidence.sh <subdir under docs/features/explain/film/> "<commit message>" <src>=<dest-relative-to-subdir> ...
#   e.g. bash push-evidence.sh dbg7 "Film evidence dbg7: ..." /c/s/spec/film-explain/contact-sheet-dbg7.png=contact-sheet-dbg7.png /c/s/spec/film-explain/shots7/b1.png=shots/b1.png
# Prints the new commit SHA. Refuses a source that does not exist and any text file that contains an email address, a key, a cookie or an authorization header.
set -euo pipefail
REPO=${FILM_EVIDENCE_REPO:-/c/s/explain-121}
SUB=${1:?subdir}; MSG=${2:?message}; shift 2
cd $REPO
git fetch -q rabbit-hole film/evidence main 2>/dev/null || git fetch -q rabbit-hole main
PARENT=$(git rev-parse -q --verify refs/remotes/rabbit-hole/film/evidence || git rev-parse rabbit-hole/main)
export GIT_INDEX_FILE=/tmp/film-evidence-index-$$
rm -f $GIT_INDEX_FILE
git read-tree $PARENT
for pair in "$@"; do
  src=${pair%%=*}; dest=${pair#*=}
  [ -f "$src" ] || { echo "REFUSED: $src does not exist"; exit 1; }
  case "$src" in *.log|*.json|*.txt|*.md)
    if grep -qEi '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}|api[_-]?key|sk-[A-Za-z0-9]{8}|Bearer |set-cookie|authorization:|cookie:' "$src"; then echo "REFUSED: $src looks like it holds an email, key, cookie or authorization header"; exit 1; fi ;;
  esac
  b=$(git hash-object -w "$src")
  git update-index --add --cacheinfo 100644,$b,docs/features/explain/film/$SUB/$dest
done
T=$(git write-tree)
C=$(git commit-tree $T -p $PARENT -m "$MSG")
unset GIT_INDEX_FILE
git update-ref refs/heads/film/evidence $C
git push -q rabbit-hole film/evidence 2>&1 | grep -v '^remote:' || true
echo "film/evidence $C"
