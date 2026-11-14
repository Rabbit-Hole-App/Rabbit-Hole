#!/bin/bash
# Release 143 = PV-1 + SH-1 (overnight train, STACKED on release 142's candidate): PV-1 a published or empty-looking canvas opens where its materials are (first file card, else first card, else first chat exchange, else the cluster of text, notes, images, ink and frames);
# SH-1 the shared page's top left is the product title in the landing footer's display family instead of the logo. Web files only (canvas-view.js, AdaptiveCanvas.jsx, CanvasLoading.jsx, index.css, two tests, one e2e check): no control-plane change, no migrations, no config change, no card bytes.
# Web gate (scripts/ci, tutor-diagrams, web unit, web build, property count, replay; no smoke).
# STACKED: MAINWANT = the final BASE sha (142's candidate; env, required); the candidate must descend from it; main may be behind it overnight. MAIN_PREV in the pins = MAINWANT.
#   MAINWANT=<sha> bash prep143.sh finish   Refuses unless the suites report lists tutor-diagrams and web unit, any changed file is outside the scope, or a report first line is wrong;
#                                           pushes ONLY release/explain-143 and release/explain-143-rollback-<8 sha>, writes 143-explain.pins.
set -euo pipefail
Q=/c/s/spec/release-queue; W=/c/s/explain-pv-143; BR=release/explain-143
MAINWANT=${MAINWANT:?MAINWANT (the final BASE sha: the 142 candidate) is required}
git -C $W fetch -q rabbit-hole main dev
MAINSHA=$MAINWANT   # stacked-train check (TRAIN.md): the base is the previous candidate; main need not contain it until the owner has released it
git -C $W cat-file -e $MAINWANT || { echo "MAINWANT $MAINWANT is unknown in $W"; exit 1; }
case "${1:-}" in
finish)
  SHA=$(git -C $W rev-parse HEAD); S=${SHA:0:8}
  [ -z "$(git -C $W status --porcelain --untracked-files=no)" ] || { echo "dirty worktree $W"; exit 1; }
  [ "$(git -C $W branch --show-current)" = "$BR" ] || { echo "$W is not on $BR (create it at the stacked tip: git -C $W checkout -B $BR)"; exit 1; }
  [ "$(head -n 1 $Q/143-suites-report.txt | tr -d '\r')" = "SUITES: GREEN $SHA" ] || { echo "REFUSED: first line of 143-suites-report.txt is not 'SUITES: GREEN $SHA'"; exit 1; }
  bash $Q/check-gate-steps.sh $Q/143-suites-report.txt
  case "$(head -n 1 $Q/143-gate-report.txt | tr -d '\r')" in "GATE: PASS(replay) $SHA"*) ;; *) echo "REFUSED: 143-gate-report.txt first line is not 'GATE: PASS(replay) $SHA'"; exit 1 ;; esac
  git -C $W merge-base --is-ancestor $MAINSHA $SHA || { echo "REFUSED: $S does not descend from $MAINSHA"; exit 1; }
  git -C $W merge-base --is-ancestor rabbit-hole/dev $SHA || { echo "REFUSED: rabbit-hole/dev is not an ancestor of $S (release-mvp would refuse)"; exit 1; }
  [ -z "$(git -C $W diff --name-only $MAINSHA $SHA -- packages/control-plane)" ] || { echo "REFUSED: 143 touches packages/control-plane (server change: the gate needs the control-plane suite and the smoke)"; exit 1; }
  # Scope: canvas-view.js and its test, AdaptiveCanvas.jsx, CanvasLoading.jsx, index.css, canvas-fork.test.mjs, the shared-header e2e check and the self-hosted Space Grotesk 500 woff2 + OFL text. No control-plane, no wrangler config, no tutor-diagrams files.
  OUT=$(git -C $W diff --name-only $MAINSHA $SHA | grep -Ev \
    -e '^packages/web/src/(AdaptiveCanvas\.jsx|canvas-view\.js|canvas-view\.test\.mjs|CanvasLoading\.jsx|index\.css|canvas-fork\.test\.mjs)$' \
    -e '^packages/web/e2e/shared-header-check\.mjs$' \
    -e '^packages/web/src/fonts/SpaceGrotesk-(Medium\.woff2|OFL\.txt)$' \
    -e '^scripts/ci/check-map\.json$' || true)
  [ -z "$OUT" ] || { echo "REFUSED: files outside the 143 scope:"; echo "$OUT"; exit 1; }
  echo "--- production config diff main..candidate (must be empty):"
  git -C $W diff --stat $MAINSHA $SHA -- packages/web/wrangler.rabbit-hole-prod.jsonc packages/control-plane/wrangler.rabbit-hole-prod.jsonc || true
  git -C $W push -q rabbit-hole $BR
  RB=release/explain-143-rollback-$S
  C=$(git -C $W commit-tree $(git -C $W rev-parse $MAINSHA^{tree}) -p $SHA -m "Rollback of /explain release 143: restore the tree of the base ($MAINSHA) on top of $SHA")
  git -C $W branch -f $RB $C && git -C $W push -q rabbit-hole $RB
  cd $Q && cat > 143-explain.pins <<PINS
LABEL="Release 143: PV-1 a published canvas opens where its materials are: first file card, else first card, else first chat exchange, else the cluster of its text, notes, images, ink and frames, once, never over a camera the visitor moved. SH-1 the shared page top left is the product title Rabbit Hole in the landing footer font (Space Grotesk 500, falling back to the app Inter until the font is shipped), linking home. Web only, no migrations, no config change, no card bytes."
SHA=$SHA
MAIN_PREV="$MAINSHA"
W=C:/s/explain-pv-143
RECOVERY=$RB
PINS
  echo "FINISH OK SHA=$SHA MAIN=$MAINSHA ROLLBACK=$RB"
  ;;
*) echo "usage: MAINWANT=<142 sha> bash prep143.sh finish"; exit 2 ;;
esac
