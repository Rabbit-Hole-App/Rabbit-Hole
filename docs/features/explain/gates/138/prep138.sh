#!/bin/bash
# Release 138 = canvas view (overnight train, STACKED on release 137's candidate): CV-6 (a board whose cards are off the top of the column opens on its first file card, else its first card, at zoom >= 0.5, instead of an empty surface)
# and CV-7 (Fit canvas / Shift+1 frames the cards and their group frames when the board has cards, never a far-off text item, note or mark; a board with no card frames everything as before),
# the new module canvas-view.js, its test and one check-map row. Web files only: no control-plane change, no migrations, no config change, no card bytes. Web gate (scripts/ci, tutor-diagrams, web unit, web build, property count, replay; no smoke).
# STACKED: MAINWANT = the final BASE sha (137's candidate; env, required); the candidate must descend from it; main may be behind it overnight. MAIN_PREV in the pins = MAINWANT.
#   MAINWANT=<sha> bash prep138.sh finish   Refuses unless the suites report lists tutor-diagrams and web unit, any changed file is outside the scope, or a report first line is wrong;
#                                           pushes ONLY release/explain-138 and release/explain-138-rollback-<8 sha>, writes 138-explain.pins.
set -euo pipefail
Q=/c/s/spec/release-queue; W=/c/s/explain-canvas-2; BR=release/explain-138
MAINWANT=${MAINWANT:?MAINWANT (the final BASE sha: the 137 candidate) is required}
git -C $W fetch -q rabbit-hole main dev
MAINSHA=$MAINWANT   # stacked-train check (TRAIN.md): the base is the previous candidate; main need not contain it until the owner has released it
git -C $W cat-file -e $MAINWANT || { echo "MAINWANT $MAINWANT is unknown in $W"; exit 1; }
case "${1:-}" in
finish)
  SHA=$(git -C $W rev-parse HEAD); S=${SHA:0:8}
  [ -z "$(git -C $W status --porcelain --untracked-files=no)" ] || { echo "dirty worktree $W"; exit 1; }
  [ "$(git -C $W branch --show-current)" = "$BR" ] || { echo "$W is not on $BR (create it at the stacked tip: git -C $W checkout -B $BR)"; exit 1; }
  [ "$(head -n 1 $Q/138-suites-report.txt | tr -d '\r')" = "SUITES: GREEN $SHA" ] || { echo "REFUSED: first line of 138-suites-report.txt is not 'SUITES: GREEN $SHA'"; exit 1; }
  bash $Q/check-gate-steps.sh $Q/138-suites-report.txt
  case "$(head -n 1 $Q/138-gate-report.txt | tr -d '\r')" in "GATE: PASS(replay) $SHA"*) ;; *) echo "REFUSED: 138-gate-report.txt first line is not 'GATE: PASS(replay) $SHA'"; exit 1 ;; esac
  git -C $W merge-base --is-ancestor $MAINSHA $SHA || { echo "REFUSED: $S does not descend from $MAINSHA"; exit 1; }
  git -C $W merge-base --is-ancestor rabbit-hole/dev $SHA || { echo "REFUSED: rabbit-hole/dev is not an ancestor of $S (release-mvp would refuse)"; exit 1; }
  [ -z "$(git -C $W diff --name-only $MAINSHA $SHA -- packages/control-plane)" ] || { echo "REFUSED: 138 touches packages/control-plane (server change: the gate needs the control-plane suite and the smoke)"; exit 1; }
  # Scope: AdaptiveCanvas.jsx, canvas-view.js and its test, the one check-map row. No control-plane, no wrangler config, no tutor-diagrams files.
  OUT=$(git -C $W diff --name-only $MAINSHA $SHA | grep -Ev \
    -e '^packages/web/src/(AdaptiveCanvas\.jsx|canvas-view\.js|canvas-view\.test\.mjs)$' \
    -e '^scripts/ci/check-map\.json$' || true)
  [ -z "$OUT" ] || { echo "REFUSED: files outside the 138 scope:"; echo "$OUT"; exit 1; }
  echo "--- production config diff main..candidate (must be empty):"
  git -C $W diff --stat $MAINSHA $SHA -- packages/web/wrangler.rabbit-hole-prod.jsonc packages/control-plane/wrangler.rabbit-hole-prod.jsonc || true
  git -C $W push -q rabbit-hole $BR
  RB=release/explain-138-rollback-$S
  C=$(git -C $W commit-tree $(git -C $W rev-parse $MAINSHA^{tree}) -p $SHA -m "Rollback of /explain release 138: restore the tree of the base ($MAINSHA) on top of $SHA")
  git -C $W branch -f $RB $C && git -C $W push -q rabbit-hole $RB
  cd $Q && cat > 138-explain.pins <<PINS
LABEL="Release 138: the canvas view. CV-6: a board whose cards are off the top of the column opens on its first file card (else its first card) at zoom 0.5 or more, not an empty surface. CV-7: Fit canvas (Shift+1) frames the cards, not a far-off text item, note or mark. Web only, no migrations, no config change, no card bytes."
SHA=$SHA
MAIN_PREV="$MAINSHA"
W=C:/s/explain-canvas-2
RECOVERY=$RB
PINS
  echo "FINISH OK SHA=$SHA MAIN=$MAINSHA ROLLBACK=$RB"
  ;;
*) echo "usage: MAINWANT=<137 sha> bash prep138.sh finish"; exit 2 ;;
esac
