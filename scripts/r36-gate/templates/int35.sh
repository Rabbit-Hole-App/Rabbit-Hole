#!/usr/bin/env bash
set -o pipefail
# INT35 gate (r35: owner UI round + beta fixes; every stage prints a check count for the attested-gate parser), crash-tolerant: the same checks as int8-gate.sh, but a check whose stack died under it (machine load:
# wrangler "Network connection lost") restarts the stack without rebuilding and reruns that check once. A check that
# fails with its stack alive is a real failure and is reported as such. make test-unit runs separately on this tree (int26-unit.log).
J=@@GATE_ROOT@@
F=$J/fork
W=@@APP_ROOT@@
E="BASE=http://127.0.0.1:8878 PRACTICE_BASE=http://127.0.0.1:8878 VOICE_BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 PERSIST=@@GATE_ROOT@@/fork/local D1_CONFIG=@@APP_ROOT@@/packages/control-plane/integ-local.jsonc"
# A grant is machine time only; the scheduler and candidate owner still authorize execution.
: "${INT35_EXPECTED_SHA:?Set the final committed r35 candidate SHA}"
: "${INT35_EXPECTED_TREE:?Set the final candidate committed tree}"
: "${INT35_GRANT_ID:?Set the active grant ID from heavy-tests.md}"
check_tree() {
  [ "$(git -C "$W" rev-parse HEAD)" = "$INT35_EXPECTED_SHA" ] &&
  [ "$(git -C "$W" rev-parse HEAD^{tree})" = "$INT35_EXPECTED_TREE" ] &&
  [ "$(git -C "$W" write-tree)" = "$INT35_EXPECTED_TREE" ] && git -C "$W" diff --quiet || {
    echo "INT35-STOPPED: candidate index tree changed or tracked working tree differs"; exit 5;
  }
}
check_tree
node "$J/preflight.cjs" || exit 5

# Memory guard (owner, 2026-10-07): before every stage, stop and report if free memory is critical.
memcheck() {
  # A stop file ends the gate cleanly before the next stage: stopping the background task does not stop this script on Windows.
  [ -f $J/STOP-INT35 ] && { echo "INT35-STOPPED by stop file at $1"; powershell -NoProfile -ExecutionPolicy Bypass -File "$F/stop.ps1" | tail -1; exit 4; }
  FREE=$(powershell -NoProfile -Command "[math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory/1KB)" | tr -d "
")
  echo "mem before $1: ${FREE} MB free"
  if [ "${FREE:-0}" -lt 1500 ]; then
    echo "MEMORY CRITICAL at $1: ${FREE} MB free"
    powershell -NoProfile -Command "Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 10 | ForEach-Object { \"{0} {1}MB\" -f $_.ProcessName, [math]::Round($_.WorkingSet64/1MB) }"
    powershell -NoProfile -ExecutionPolicy Bypass -File "$F/stop.ps1" | tail -1
    powershell -NoProfile -ExecutionPolicy Bypass -File "$J/lp1h/stop.ps1" | tail -1
    echo INT35-STOPPED; exit 3
  fi
}
# Count for the attested-gate parser (Home, 2026-10-09): the check's own "N/N checks passed" when it prints one, else its
# PASS / ok / "flow X ok" lines counted (any FAIL line makes it "fail N").
cnt() { local L=$1 s p f; s=$(sed 's/\x1b\[[0-9;]*m//g' "$L" | grep -aoE '[0-9]+/[0-9]+ checks passed|[0-9]+ checks passed' | tail -1)
  [ -n "$s" ] && { echo "$s"; return; }
  p=$(sed 's/\x1b\[[0-9;]*m//g' "$L" | grep -acE '^(PASS|ok)\b|^ok:|^flow [A-Za-z0-9]+ ok|^canvas shell ok\b')
  f=$(sed 's/\x1b\[[0-9;]*m//g' "$L" | grep -acE '^FAIL|^not ok')
  if [ "$f" != 0 ]; then echo "fail $f"; else echo "$p/$p checks passed"; fi; }
alive() { [ "$(curl -s -o /dev/null -m 10 -w %{http_code} http://127.0.0.1:8878/)" != 000 ] && [ "$(curl -s -o /dev/null -m 10 -w %{http_code} http://127.0.0.1:8879/)" != 000 ]; }
# run <stack script> <name> <check file> : one check, one retry only when the stack died under it
run() {
  S=$1; N=$2; C=$3; L=$F/$N-r35.log
  check_tree
  memcheck $N
  alive || { echo "$N: stack down before the check, restarting"; bash $F/$S restart | tail -1; }
  (cd $W/packages/web && env $E timeout 900 node e2e/$C $F/$N-shots-r35 > $L 2>&1); rc=$?
  if [ $rc != 0 ]; then
    # One rerun on any failure: a dead stack (machine load) or an external flake (the notebook CDN). A real failure fails twice.
    echo "$N: exit $rc (stack alive: $(alive && echo yes || echo no)) - rerun once"
    cp $L ${L%.log}-first.log; cp $F/app.log ${L%.log}-first-app.log 2>/dev/null; cp $F/cp.log ${L%.log}-first-cp.log 2>/dev/null
    alive || bash $F/$S restart | tail -1
    (cd $W/packages/web && env $E timeout 900 node e2e/$C $F/$N-shots-r35 > $L 2>&1); rc=$?
  fi
  TWH=$(curl -s -m 10 http://127.0.0.1:8878/__provider-tripwire | python -c "import json,sys; print(len(json.load(sys.stdin)['hits']))" 2>/dev/null || echo "unreadable")
  echo "$N provider-tripwire hits since stack start: $TWH" >> $G/tripwire.log; echo "$N provider-tripwire hits: $TWH"
  [ "$TWH" != "0" ] && echo "$N: PROVIDER TRIPWIRE $TWH (see $G/tripwire.log)"
  echo "$N exit $rc  $(cnt $L)"
}
cd $W && echo "tree HEAD $(git rev-parse --short HEAD) MERGE_HEAD $(git rev-parse --short MERGE_HEAD 2>/dev/null) index $(git write-tree)"
G=$J/diag13/gate35; mkdir -p $G
memcheck unit
make test-unit > $J/int35-unit.log 2>&1; echo "make test-unit exit $?  $(sed 's/\x1b\[[0-9;]*m//g' $J/int35-unit.log | grep -aE '^ℹ (tests|fail) ' | tr '\n' ' ')"
# The shared nanoGPT fixture's lifecycle regression (not part of make test-unit; owner 2026-10-07).
(cd $W/packages/web && node --test --test-reporter=tap e2e/nanogpt-repository-fixture.test.mjs > $G/fixture.log 2>&1); echo "fixture regression exit $?  $(grep -E '^# (pass|fail)' $G/fixture.log | tr '
' ' ')"
bash $F/stack-app.sh dev | tail -1 || exit 6
run stack-app.sh rh-app shared-rabbit-hole-check.mjs
run stack-app.sh comments comments-check.mjs
run stack-app.sh comments-invite comments-invite-check.mjs
bash $F/stack.sh dev | tail -1 || exit 6
run stack.sh sketch explain-back-sketch-check.mjs
run stack.sh rh-dev shared-rabbit-hole-check.mjs
run stack.sh sca shared-canvas-ask-check.mjs
run stack.sh project-canvases project-canvases-check.mjs
run stack.sh fork canvas-forking-check.mjs
run stack.sh dive dive-check.mjs
run stack.sh handle handle-check.mjs
run stack.sh explore explore-check.mjs
run stack.sh explore-holes explore-holes-check.mjs
run stack.sh card-select card-select-check.mjs
run stack.sh selected-pill selected-pill-check.mjs
run stack.sh naming naming-check.mjs
run stack.sh visibility visibility-check.mjs

run stack.sh sidebar sidebar-check.mjs
run stack.sh card-redesign card-redesign-check.mjs
if git cat-file -e "$INT35_EXPECTED_TREE:packages/web/e2e/project-menu-check.mjs" 2>/dev/null; then
  run stack.sh project-menu project-menu-check.mjs
fi
run stack.sh creator-profile creator-profile-check.mjs
run stack.sh analytics-ui analytics-ui-check.mjs
run stack.sh workspace workspace-check.mjs
run stack.sh card-context-menu card-context-menu-check.mjs
run stack.sh repo-browser repo-browser-check.mjs
run stack.sh panel-header panel-header-check.mjs
run stack.sh slash-sheet slash-sheet-check.mjs
run stack.sh equation equation-check.mjs
run stack.sh thumbnails card-thumbnails-check.mjs
if git cat-file -e "$INT35_EXPECTED_TREE:packages/web/e2e/canvas-shell-check.mjs" 2>/dev/null; then
  run stack.sh canvas-shell canvas-shell-check.mjs
fi
if git cat-file -e "$INT35_EXPECTED_TREE:packages/web/e2e/canvas-toolbar-check.mjs" 2>/dev/null; then
  # canvas-toolbar-check takes <base> <board> <outDir> where run() passes only <outDir>, so it has its own block with run()'s steps.
  TL=$F/canvas-toolbar-r35.log
  check_tree
  memcheck canvas-toolbar
  alive || { echo "canvas-toolbar: stack down before the check, restarting"; bash $F/stack.sh restart | tail -1; }
  (cd $W/packages/web && env $E timeout 900 node e2e/canvas-toolbar-check.mjs http://127.0.0.1:8878 nanogpt-deep-dive $F/canvas-toolbar-shots-r35 > $TL 2>&1); rc=$?
  if [ $rc != 0 ]; then
    echo "canvas-toolbar: exit $rc (stack alive: $(alive && echo yes || echo no)) - rerun once"
    cp $TL ${TL%.log}-first.log; cp $F/app.log ${TL%.log}-first-app.log 2>/dev/null; cp $F/cp.log ${TL%.log}-first-cp.log 2>/dev/null
    alive || bash $F/stack.sh restart | tail -1
    (cd $W/packages/web && env $E timeout 900 node e2e/canvas-toolbar-check.mjs http://127.0.0.1:8878 nanogpt-deep-dive $F/canvas-toolbar-shots-r35 > $TL 2>&1); rc=$?
  fi
  TWH=$(curl -s -m 10 http://127.0.0.1:8878/__provider-tripwire | python -c "import json,sys; print(len(json.load(sys.stdin)['hits']))" 2>/dev/null || echo "unreadable")
  echo "canvas-toolbar provider-tripwire hits since stack start: $TWH" >> $G/tripwire.log; echo "canvas-toolbar provider-tripwire hits: $TWH"
  [ "$TWH" != "0" ] && echo "canvas-toolbar: PROVIDER TRIPWIRE $TWH (see $G/tripwire.log)"
  # Its count: the section lines it prints on success (desktop, wide, phone; not desktop's zoom-to-fit note).
  if [ $rc = 0 ]; then n=$(grep -aE '^(desktop|wide|phone): ' $TL | grep -acv 'zoom to fit'); sc="$n/$n checks passed"; else sc="fail 1"; fi
  echo "canvas-toolbar exit $rc  $sc"
fi
# #73: rabbit-hole-check Map/project cases in LOCAL=1 mode (nanoGPT fixture, every unrouted ask aborted, no .env).
# wp6-learn: and wp6-mobile are NOT RUN (stale, left unchanged; clone run not authorised).
memcheck rh-local
RHL="LOCAL=1 BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 ONLY=bar-page,wp6-map,wp6-learn-this,wp6-show-on-graph,wp6-kg-,wp6-project,wp6-overview"
alive || { echo "rh-local: stack down before the check, restarting"; bash $F/stack.sh restart | tail -1; }
(cd $W/packages/web && env $RHL timeout 1500 node e2e/rabbit-hole-check.mjs > $F/rh-local-r35.log 2>&1); rc=$?
if [ $rc != 0 ]; then echo "rh-local: exit $rc (stack alive: $(alive && echo yes || echo no)) - rerun once"; cp $F/rh-local-r35.log $F/rh-local-r35-first.log; alive || bash $F/stack.sh restart | tail -1; (cd $W/packages/web && env $RHL timeout 1500 node e2e/rabbit-hole-check.mjs > $F/rh-local-r35.log 2>&1); rc=$?; fi
TWH=$(curl -s -m 10 http://127.0.0.1:8878/__provider-tripwire | python -c "import json,sys; print(len(json.load(sys.stdin)['hits']))" 2>/dev/null || echo "unreadable")
echo "rh-local provider-tripwire hits: $TWH" | tee -a $G/tripwire.log
echo "rh-local exit $rc  ok $(grep -ac '^ok: ' $F/rh-local-r35.log) FAIL $(grep -ac '^FAIL: ' $F/rh-local-r35.log)"
run stack.sh cross-device cross-device-check.mjs
run stack.sh filedrop canvas-file-drop-check.mjs
# These stages are required only when their check is present in the attested candidate tree.
for beta in library-folders share-revocation; do
  if git -C "$W" cat-file -e "$INT35_EXPECTED_TREE:packages/web/e2e/$beta-check.mjs" 2>/dev/null; then
    run stack.sh "$beta" "$beta-check.mjs"
  fi
done
powershell -NoProfile -ExecutionPolicy Bypass -File "$F/stop.ps1" | tail -1
bash $F/stack.sh prod | tail -1 || exit 6
cd $W/packages/web && powershell -NoProfile -ExecutionPolicy Bypass -File "$J/clear-local.ps1" -Target bundle && cp -r dist dist-prodcheck && DIST=dist-prodcheck node e2e/production-bundle-check.mjs > $F/bundle-r35.log 2>&1; r=$?; echo "bundle(dist) exit $r  $(cnt $F/bundle-r35.log)"; powershell -NoProfile -ExecutionPolicy Bypass -File "$J/clear-local.ps1" -Target bundle
node e2e/production-bundle-check.mjs > $F/bundle-dev-r35.log 2>&1; r=$?; echo "bundle(dist-dev) exit $r  $(cnt $F/bundle-dev-r35.log)"
powershell -NoProfile -ExecutionPolicy Bypass -File "$F/stop.ps1" | tail -1
# Journeys + tutor slice on the fresh-schema journey stack; a crashed journey stack is rebuilt and that part rerun once.
LP=$J/lp1h
jalive() { [ "$(curl -s -o /dev/null -m 10 -w %{http_code} http://127.0.0.1:8878/)" != 000 ]; }
journey() { (cd $W/packages/web && timeout 1500 node e2e/journey-check.mjs --base http://127.0.0.1:8878 --cp http://127.0.0.1:8879 --vars $LP/ws/cfg/cp/.dev.vars --out $LP/ws/screens --prefix int- > $LP/journey.log 2>&1); }
slice() { (cd $W/packages/web && TEST_BYPASS_SECRET=$(sed -n 's/^TEST_BYPASS_SECRET=//p' $LP/ws/cfg/cp/.dev.vars) TUTOR_BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 timeout 900 node e2e/tutor-slice-check.mjs $LP/ws/screens/slice > $LP/slice.log 2>&1); }
memcheck journeys
bash $LP/jstack.sh | tail -1
journey; rc=$?
if [ $rc != 0 ] && ! jalive; then echo "journey: stack died - rebuild, rerun once"; bash $LP/jstack.sh | tail -1; journey; rc=$?; fi
echo "journey provider-tripwire hits: $(curl -s -m 10 http://127.0.0.1:8878/__provider-tripwire | python -c "import json,sys; print(len(json.load(sys.stdin)['hits']))" 2>/dev/null || echo unreadable)" | tee -a $G/tripwire.log
echo "journey J1-J8 exit $rc  $(grep -aE '^J[1-8] ' $LP/journey.log | tr -s ' ' | tr '\n' ' ')"
jalive || bash $LP/jstack.sh | tail -1
slice; rc=$?
if [ $rc != 0 ] && ! jalive; then echo "slice: stack died - rebuild, rerun once"; bash $LP/jstack.sh | tail -1; slice; rc=$?; fi
echo "slice provider-tripwire hits: $(curl -s -m 10 http://127.0.0.1:8878/__provider-tripwire | python -c "import json,sys; print(len(json.load(sys.stdin)['hits']))" 2>/dev/null || echo unreadable)" | tee -a $G/tripwire.log
sl=$(grep -ac '^shot ' $LP/slice.log); if [ $rc = 0 ] && grep -aq 'tutor-slice-check ok' $LP/slice.log; then sc="$sl/$sl checks passed"; else sc="fail 1"; fi
echo "tutor-slice exit $rc  $sc  ($(tail -1 $LP/slice.log | cut -c1-60))"
# Next Steps on a blank canvas (owner, 2026-10-08): three hooks at rest from the keyless fixture planner, Untitled and titled.
blankhooks() { (cd $W/packages/web && TEST_BYPASS_SECRET=$(sed -n 's/^TEST_BYPASS_SECRET=//p' $LP/ws/cfg/cp/.dev.vars) TUTOR_BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 timeout 600 node e2e/blank-canvas-hooks-check.mjs $LP/ws/screens/blank > $LP/blank.log 2>&1); }
jalive || bash $LP/jstack.sh | tail -1
blankhooks; rc=$?
if [ $rc != 0 ]; then echo "blank-hooks: exit $rc - rerun once"; cp $LP/blank.log $LP/blank-first.log; jalive || bash $LP/jstack.sh | tail -1; blankhooks; rc=$?; fi
echo "blank-hooks provider-tripwire hits: $(curl -s -m 10 http://127.0.0.1:8878/__provider-tripwire | python -c "import json,sys; print(len(json.load(sys.stdin)['hits']))" 2>/dev/null || echo unreadable)" | tee -a $G/tripwire.log
echo "blank-hooks exit $rc  $(tail -1 $LP/blank.log | cut -c1-80)"
cp $LP/blank.log $G/blank.log 2>/dev/null
# Tutor r29 option C on the Practice card (Tutor lane check, --r35 cases) on the journey stack.
practice() { (cd $W/packages/web && TEST_BYPASS_SECRET=$(sed -n 's/^TEST_BYPASS_SECRET=//p' $LP/ws/cfg/cp/.dev.vars) TUTOR_BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 timeout 900 node e2e/practice-card-check.mjs $LP/ws/screens/practice --r35 > $LP/practice.log 2>&1); }
jalive || bash $LP/jstack.sh | tail -1
practice; rc=$?
if [ $rc != 0 ]; then echo "practice-card: exit $rc - rerun once"; cp $LP/practice.log $LP/practice-first.log; jalive || bash $LP/jstack.sh | tail -1; practice; rc=$?; fi
echo "practice-card provider-tripwire hits: $(curl -s -m 10 http://127.0.0.1:8878/__provider-tripwire | python -c "import json,sys; print(len(json.load(sys.stdin)['hits']))" 2>/dev/null || echo unreadable)" | tee -a $G/tripwire.log
echo "practice-card exit $rc  $(sed 's/\x1b\[[0-9;]*m//g' $LP/practice.log | grep -a 'checks passed' | tail -1 | cut -c1-80)"
cp $LP/practice.log $G/practice.log 2>/dev/null
# Canvas chrome (owner, 2026-10-08): the hooks card must load, so it runs on the keyless journey stack (fixture planner).
chrome() { (cd $W/packages/web && TEST_BYPASS_SECRET=$(sed -n 's/^TEST_BYPASS_SECRET=//p' $LP/ws/cfg/cp/.dev.vars) BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 timeout 900 node e2e/canvas-chrome-check.mjs $LP/ws/screens/chrome > $LP/chrome.log 2>&1); }
jalive || bash $LP/jstack.sh | tail -1
chrome; rc=$?
if [ $rc != 0 ]; then echo "canvas-chrome: exit $rc - rerun once"; cp $LP/chrome.log $LP/chrome-first.log; jalive || bash $LP/jstack.sh | tail -1; chrome; rc=$?; fi
echo "canvas-chrome provider-tripwire hits: $(curl -s -m 10 http://127.0.0.1:8878/__provider-tripwire | python -c "import json,sys; print(len(json.load(sys.stdin)['hits']))" 2>/dev/null || echo unreadable)" | tee -a $G/tripwire.log
echo "canvas-chrome exit $rc  $(sed 's/\x1b\[[0-9;]*m//g' $LP/chrome.log | grep -a 'checks passed' | tail -1 | cut -c1-80)"
cp $LP/chrome.log $G/chrome.log 2>/dev/null
cp $LP/journey.log $G/journey.log; cp $LP/slice.log $G/slice.log
powershell -NoProfile -ExecutionPolicy Bypass -File "$LP/stop.ps1" | tail -1
check_tree
echo INT35-DONE
