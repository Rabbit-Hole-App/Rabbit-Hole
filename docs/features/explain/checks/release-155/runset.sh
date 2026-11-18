#!/bin/bash
# release 155 always-run set, one file per node process
run() { out=$(node --test "$2" 2>&1); echo "$1: $(echo "$out" | grep -E '^ℹ (tests|pass|fail) ' | sed 's/ℹ //' | tr '\n' ' ')"; echo "$out" | grep -E "^\s*✖" | head -5; }
cd /c/s/r155-int/packages/control-plane
for f in explanation-fast-chain explanation-visual-fallback explanation-matrix-coerce learn-artifact explain-card-archive explanation-references explanation-prose-pass explanation-diagram-corrections explanation-sequence-selfstep explanation-visuals; do run "cp $f" test/$f.test.js; done
cd ../web
run "web learn-slash" src/learn-slash.test.mjs
for f in spec content-contract svg-snapshots ml-reference-integration; do run "web $f" src/tutor-diagrams/$f.test.mjs; done
echo RUNSET-DONE
