#!/bin/bash
# every control-plane explanation-* test and every web tutor-diagrams test, one file per node process
run() { out=$(node --test "$2" 2>&1); echo "$1: $(echo "$out" | grep -E '^ℹ (tests|pass|fail) ' | sed 's/ℹ //' | tr '\n' ' ')"; echo "$out" | grep -E "^\s*✖" | head -5; }
cd /c/s/r154-int/packages/control-plane
for f in test/explanation-*.test.js; do run "cp $f" $f; done
cd ../web
for f in src/tutor-diagrams/*.test.mjs src/tutor-diagrams/*/*.test.mjs; do run "web $f" $f; done
echo WIDE-DONE
