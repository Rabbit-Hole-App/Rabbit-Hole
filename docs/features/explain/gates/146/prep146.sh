#!/bin/bash
# Release 146 = the Ctrl+K and highlight polish (CK-3/CK-5 fallback card at the passage line with parentCard, extraction cards keep Accept, e2e update; HL-146 persistent explained passage for non-Markdown cards; AR-146b connector polish), STACKED on release 144's candidate: web only.
# Files: packages/web/src, packages/web/e2e, docs/features, scripts/ci/check-map.json. No control-plane change, no migration, no config change, no card bytes.
# Web gate (scripts/ci, scripts, tutor-diagrams, figure-briefs, web unit, web build, property count, replay; no smoke unless a prompt/server file changes). MAINWANT = the base candidate (release 144).
# STACKED: MAINWANT = the final BASE sha (MAIN's candidate; env, required); the candidate must descend from it; main may be behind it overnight. MAIN_PREV in the pins = MAINWANT.
#   MAINWANT=<sha> bash prep146.sh finish   Refuses unless the suites report lists tutor-diagrams and web unit, any changed file is outside the scope, or a report first line is wrong;
#                                           pushes ONLY release/explain-146 and release/explain-146-rollback-<8 sha>, writes 146-explain.pins.
set -euo pipefail
Q=/c/s/spec/release-queue; W=/c/s/explain-sprint-146; BR=release/explain-146
MAINWANT=${MAINWANT:?MAINWANT (the final BASE sha: the MAIN candidate) is required}
git -C $W fetch -q rabbit-hole main dev
MAINSHA=$MAINWANT   # stacked-train check (TRAIN.md): the base is the previous candidate; main need not contain it until the owner has released it
git -C $W cat-file -e $MAINWANT || { echo "MAINWANT $MAINWANT is unknown in $W"; exit 1; }
case "${1:-}" in
finish)
  SHA=$(git -C $W rev-parse HEAD); S=${SHA:0:8}
  [ -z "$(git -C $W status --porcelain --untracked-files=no)" ] || { echo "dirty worktree $W"; exit 1; }
  [ "$(git -C $W branch --show-current)" = "$BR" ] || { echo "$W is not on $BR (create it at the stacked tip: git -C $W checkout -B $BR)"; exit 1; }
  [ "$(head -n 1 $Q/146-suites-report.txt | tr -d '\r')" = "SUITES: GREEN $SHA" ] || { echo "REFUSED: first line of 146-suites-report.txt is not 'SUITES: GREEN $SHA'"; exit 1; }
  bash $Q/check-gate-steps.sh $Q/146-suites-report.txt
  case "$(head -n 1 $Q/146-gate-report.txt | tr -d '\r')" in "GATE: PASS(replay) $SHA"*) ;; *) echo "REFUSED: 146-gate-report.txt first line is not 'GATE: PASS(replay) $SHA'"; exit 1 ;; esac
  git -C $W merge-base --is-ancestor $MAINSHA $SHA || { echo "REFUSED: $S does not descend from $MAINSHA"; exit 1; }
  git -C $W merge-base --is-ancestor rabbit-hole/dev $SHA || { echo "REFUSED: rabbit-hole/dev is not an ancestor of $S (release-mvp would refuse)"; exit 1; }
  [ -z "$(git -C $W diff --name-only $MAINSHA $SHA -- packages/control-plane)" ] || { echo "REFUSED: 146 touches packages/control-plane (server change: the gate needs the control-plane suite and the smoke)"; exit 1; }
  # Scope: packages/web/src and packages/web/e2e, docs/features, scripts/ci/check-map.json. No control-plane, no wrangler config, no fonts, no tutor-diagrams files.
  OUT=$(git -C $W diff --name-only $MAINSHA $SHA | grep -Ev \
    -e '^packages/web/src/[A-Za-z0-9_./-]+$' \
    -e '^packages/web/e2e/[A-Za-z0-9_./-]+$' \
    -e '^docs/features/[A-Za-z0-9_./-]+\.md$' \
    -e '^scripts/ci/check-map\.json$' || true)
  [ -z "$OUT" ] || { echo "REFUSED: files outside the 146 scope:"; echo "$OUT"; exit 1; }
  echo "--- production config diff main..candidate (must be empty):"
  git -C $W diff --stat $MAINSHA $SHA -- packages/web/wrangler.rabbit-hole-prod.jsonc packages/control-plane/wrangler.rabbit-hole-prod.jsonc || true
  git -C $W push -q rabbit-hole $BR
  RB=release/explain-146-rollback-$S
  C=$(git -C $W commit-tree $(git -C $W rev-parse $MAINSHA^{tree}) -p $SHA -m "Rollback of /explain release 146: restore the tree of the base ($MAINSHA) on top of $SHA")
  git -C $W branch -f $RB $C && git -C $W push -q rabbit-hole $RB
  cd $Q && cat > 146-explain.pins <<PINS
LABEL="Release 146: the Ctrl+K and highlight polish. The fallback Explain card is placed beside its source at the passage line and its connector is drawn from parentCard; a card read from an image or PDF pages keeps its review and Accept; an explained passage in an Explanation, webpage or note card stays marked with Go to highlight and Go to card; connector arrows polished. Web only, no migrations, no config change, no card bytes."
SHA=$SHA
MAIN_PREV="$MAINSHA"
W=C:/s/explain-sprint-146
RECOVERY=$RB
PINS
  echo "FINISH OK SHA=$SHA MAIN=$MAINSHA ROLLBACK=$RB"
  ;;
*) echo "usage: MAINWANT=<MAIN sha> bash prep146.sh finish"; exit 2 ;;
esac
