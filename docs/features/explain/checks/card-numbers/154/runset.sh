#!/bin/bash
# always-run set, one file at a time; prints tests/pass/fail and failing test names
run() { out=$(node --test "$2" 2>&1); echo "$1: $(echo "$out" | grep -E '^ℹ (tests|pass|fail) ' | sed 's/ℹ //' | tr '\n' ' ')"; echo "$out" | grep -E "^\s*✖" | head -5; }
cd /c/s/card-numbers-b/packages/web
for f in ml-statistical spec content-contract reference-content-contract ml-reference-integration svg-snapshots geometry-lint kind-gallery kind-gallery-depths theme/stray-hex theme/palette-guard; do run "web $f" src/tutor-diagrams/$f.test.mjs; done
run "web learn-slash" src/learn-slash.test.mjs
cd ../control-plane
for f in explanation-fast-chain explanation-visual-fallback learn-artifact explain-card-archive explanation-references explanation-prose-pass; do run "cp $f" test/$f.test.js; done
