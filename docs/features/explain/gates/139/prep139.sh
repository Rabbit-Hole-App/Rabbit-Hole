#!/bin/bash
# Release 139 = CV-3 (overnight train, STACKED on release 138's candidate): a card the learner dragged keeps its place on the canvas when later cards are generated, instead of moving with the flow.
# New module card-anchor.js and its test, the AdaptiveCanvas.jsx wiring, the layout key `at` added to the four layout key lists (area-crop, explain-client, explain-inputs, inline-ai-context) and one check-map row. Web files only: no control-plane change, no migrations, no config change, no card bytes.
# Web gate (scripts/ci, tutor-diagrams, web unit, web build, property count, replay; no smoke).
# STACKED: MAINWANT = the final BASE sha (138's candidate; env, required); the candidate must descend from it; main may be behind it overnight. MAIN_PREV in the pins = MAINWANT.
#   MAINWANT=<sha> bash prep139.sh finish   Refuses unless the suites report lists tutor-diagrams and web unit, any changed file is outside the scope, or a report first line is wrong;
#                                           pushes ONLY release/explain-139 and release/explain-139-rollback-<8 sha>, writes 139-explain.pins.
set -euo pipefail
Q=/c/s/spec/release-queue; W=/c/s/explain-canvas-3; BR=release/explain-139
MAINWANT=${MAINWANT:?MAINWANT (the final BASE sha: the 138 candidate) is required}
git -C $W fetch -q rabbit-hole main dev
MAINSHA=$MAINWANT   # stacked-train check (TRAIN.md): the base is the previous candidate; main need not contain it until the owner has released it
git -C $W cat-file -e $MAINWANT || { echo "MAINWANT $MAINWANT is unknown in $W"; exit 1; }
case "${1:-}" in
finish)
  SHA=$(git -C $W rev-parse HEAD); S=${SHA:0:8}
  [ -z "$(git -C $W status --porcelain --untracked-files=no)" ] || { echo "dirty worktree $W"; exit 1; }
  [ "$(git -C $W branch --show-current)" = "$BR" ] || { echo "$W is not on $BR (create it at the stacked tip: git -C $W checkout -B $BR)"; exit 1; }
  [ "$(head -n 1 $Q/139-suites-report.txt | tr -d '\r')" = "SUITES: GREEN $SHA" ] || { echo "REFUSED: first line of 139-suites-report.txt is not 'SUITES: GREEN $SHA'"; exit 1; }
  bash $Q/check-gate-steps.sh $Q/139-suites-report.txt
  case "$(head -n 1 $Q/139-gate-report.txt | tr -d '\r')" in "GATE: PASS(replay) $SHA"*) ;; *) echo "REFUSED: 139-gate-report.txt first line is not 'GATE: PASS(replay) $SHA'"; exit 1 ;; esac
  git -C $W merge-base --is-ancestor $MAINSHA $SHA || { echo "REFUSED: $S does not descend from $MAINSHA"; exit 1; }
  git -C $W merge-base --is-ancestor rabbit-hole/dev $SHA || { echo "REFUSED: rabbit-hole/dev is not an ancestor of $S (release-mvp would refuse)"; exit 1; }
  [ -z "$(git -C $W diff --name-only $MAINSHA $SHA -- packages/control-plane)" ] || { echo "REFUSED: 139 touches packages/control-plane (server change: the gate needs the control-plane suite and the smoke)"; exit 1; }
  # Scope: AdaptiveCanvas.jsx, card-anchor.js and its test, the four layout key lists, the one check-map row. No control-plane, no wrangler config, no tutor-diagrams files.
  OUT=$(git -C $W diff --name-only $MAINSHA $SHA | grep -Ev \
    -e '^packages/web/src/(AdaptiveCanvas\.jsx|card-anchor\.js|card-anchor\.test\.mjs|area-crop\.js|explain-client\.js|explain-inputs\.js|inline-ai-context\.js)$' \
    -e '^scripts/ci/check-map\.json$' || true)
  [ -z "$OUT" ] || { echo "REFUSED: files outside the 139 scope:"; echo "$OUT"; exit 1; }
  echo "--- production config diff main..candidate (must be empty):"
  git -C $W diff --stat $MAINSHA $SHA -- packages/web/wrangler.rabbit-hole-prod.jsonc packages/control-plane/wrangler.rabbit-hole-prod.jsonc || true
  git -C $W push -q rabbit-hole $BR
  RB=release/explain-139-rollback-$S
  C=$(git -C $W commit-tree $(git -C $W rev-parse $MAINSHA^{tree}) -p $SHA -m "Rollback of /explain release 139: restore the tree of the base ($MAINSHA) on top of $SHA")
  git -C $W branch -f $RB $C && git -C $W push -q rabbit-hole $RB
  cd $Q && cat > 139-explain.pins <<PINS
LABEL="Release 139: a dragged card keeps its place. CV-3: a card the learner dragged stays where it was dropped when later cards are generated (its place is saved with the board as at). Web only, no migrations, no config change, no card bytes."
SHA=$SHA
MAIN_PREV="$MAINSHA"
W=C:/s/explain-canvas-3
RECOVERY=$RB
PINS
  echo "FINISH OK SHA=$SHA MAIN=$MAINSHA ROLLBACK=$RB"
  ;;
*) echo "usage: MAINWANT=<138 sha> bash prep139.sh finish"; exit 2 ;;
esac
