#!/bin/bash
# release 157 full unit sweep: every control-plane and web src test file, one node process per file, 6 at a time
cd /c/s/r157-int/packages
one() { f=$1; out=$(cd $(dirname $f | sed 's#/test$##;s#/src.*##') 2>/dev/null; true); o=$(node --test "$f" 2>&1); r=$?; echo "$r $f $(echo "$o" | grep -E '^ℹ (tests|pass|fail) ' | sed 's/ℹ //' | tr '\n' ' ')"; if [ $r -ne 0 ]; then echo "$o" | grep -E '^\s*✖' | head -4 | sed 's/^/    /'; fi; }
export -f one
( ls control-plane/test/*.test.js web/src/*.test.mjs web/src/tutor-diagrams/*.test.mjs web/src/tutor-diagrams/*/*.test.mjs ) | xargs -P 6 -I{} bash -c 'one {}'
echo SWEEP-DONE
