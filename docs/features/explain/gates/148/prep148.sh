#!/bin/bash
# Release 148 = HL-148, the passage camera (Go to highlight / View passage centre the PASSAGE at a readable zoom instead of framing a 10,738 px card at 20%), STACKED on release 146's candidate: web only.
# Files: packages/web/src (AdaptiveCanvas, canvas-view, FileDocMarkdown, SourceRefChip, source-refs and tests). No control-plane change, no migration, no config change, no card bytes.
# Web gate (scripts/ci, scripts, tutor-diagrams, figure-briefs, web unit, web build, property count, replay; no smoke). MAINWANT = release 146 candidate.
# STACKED: MAINWANT = the final BASE sha (MAIN's candidate; env, required); the candidate must descend from it; main may be behind it overnight. MAIN_PREV in the pins = MAINWANT.
#   MAINWANT=<sha> bash prep148.sh finish   Refuses unless the suites report lists tutor-diagrams and web unit, any changed file is outside the scope, or a report first line is wrong;
#                                           pushes ONLY release/explain-148 and release/explain-148-rollback-<8 sha>, writes 148-explain.pins.
set -euo pipefail
Q=/c/s/spec/release-queue; W=/c/s/explain-sprint-148; BR=release/explain-148
MAINWANT=${MAINWANT:?MAINWANT (the final BASE sha: the MAIN candidate) is required}
git -C $W fetch -q rabbit-hole main dev
MAINSHA=$MAINWANT   # stacked-train check (TRAIN.md): the base is the previous candidate; main need not contain it until the owner has released it
git -C $W cat-file -e $MAINWANT || { echo "MAINWANT $MAINWANT is unknown in $W"; exit 1; }
case "${1:-}" in
finish)
  SHA=$(git -C $W rev-parse HEAD); S=${SHA:0:8}
  [ -z "$(git -C $W status --porcelain --untracked-files=no)" ] || { echo "dirty worktree $W"; exit 1; }
  [ "$(git -C $W branch --show-current)" = "$BR" ] || { echo "$W is not on $BR (create it at the stacked tip: git -C $W checkout -B $BR)"; exit 1; }
  [ "$(head -n 1 $Q/148-suites-report.txt | tr -d '\r')" = "SUITES: GREEN $SHA" ] || { echo "REFUSED: first line of 148-suites-report.txt is not 'SUITES: GREEN $SHA'"; exit 1; }
  bash $Q/check-gate-steps.sh $Q/148-suites-report.txt
  case "$(head -n 1 $Q/148-gate-report.txt | tr -d '\r')" in "GATE: PASS(replay) $SHA"*) ;; *) echo "REFUSED: 148-gate-report.txt first line is not 'GATE: PASS(replay) $SHA'"; exit 1 ;; esac
  git -C $W merge-base --is-ancestor $MAINSHA $SHA || { echo "REFUSED: $S does not descend from $MAINSHA"; exit 1; }
  git -C $W merge-base --is-ancestor rabbit-hole/dev $SHA || { echo "REFUSED: rabbit-hole/dev is not an ancestor of $S (release-mvp would refuse)"; exit 1; }
  [ -z "$(git -C $W diff --name-only $MAINSHA $SHA -- packages/control-plane)" ] || { echo "REFUSED: 148 touches packages/control-plane (server change: the gate needs the control-plane suite and the smoke)"; exit 1; }
  # Scope: packages/web/src and packages/web/e2e, docs/features, scripts/ci/check-map.json. No control-plane, no wrangler config, no fonts, no tutor-diagrams files.
  OUT=$(git -C $W diff --name-only $MAINSHA $SHA | grep -Ev \
    -e '^packages/web/src/[A-Za-z0-9_./-]+$' \
    -e '^packages/web/e2e/[A-Za-z0-9_./-]+$' \
    -e '^docs/features/[A-Za-z0-9_./-]+\.md$' \
    -e '^scripts/ci/check-map\.json$' || true)
  [ -z "$OUT" ] || { echo "REFUSED: files outside the 148 scope:"; echo "$OUT"; exit 1; }
  echo "--- production config diff main..candidate (must be empty):"
  git -C $W diff --stat $MAINSHA $SHA -- packages/web/wrangler.rabbit-hole-prod.jsonc packages/control-plane/wrangler.rabbit-hole-prod.jsonc || true
  git -C $W push -q rabbit-hole $BR
  RB=release/explain-148-rollback-$S
  C=$(git -C $W commit-tree $(git -C $W rev-parse $MAINSHA^{tree}) -p $SHA -m "Rollback of /explain release 148: restore the tree of the base ($MAINSHA) on top of $SHA")
  git -C $W branch -f $RB $C && git -C $W push -q rabbit-hole $RB
  cd $Q && cat > 148-explain.pins <<PINS
LABEL="Release 148: Go to highlight and View passage centre the passage at a readable zoom (HL-148) instead of framing a very tall card at 20%. Web only, no migrations, no config change, no card bytes."
SHA=$SHA
MAIN_PREV="$MAINSHA"
W=C:/s/explain-sprint-148
RECOVERY=$RB
PINS
  echo "FINISH OK SHA=$SHA MAIN=$MAINSHA ROLLBACK=$RB"
  ;;
*) echo "usage: MAINWANT=<MAIN sha> bash prep148.sh finish"; exit 2 ;;
esac
