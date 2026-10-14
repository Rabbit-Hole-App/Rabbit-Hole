#!/usr/bin/env bash
# run-part.sh <sel.json> <out-dir>: this part's fast-tier checks, one at a time, gate-format exit lines, no retry.
# Fork checks share the keyless stack (stack.sh: app 8878, control plane 8879) and get the env the release gate gives them.
# Harness checks stub every API call and need no stack, but each expects a server on a port its source hard-codes; every
# port's server is started once, for that port's checks only, and stopped before the next one starts.
set -uo pipefail
[ $# -eq 2 ] || { echo 'usage: run-part.sh <sel.json> <out-dir>'; exit 2; }
SEL=$1; OUT=$2; W=$(git rev-parse --show-toplevel); mkdir -p "$OUT"; OUT=$(cd "$OUT" && pwd)
VITE=$W/node_modules/vite/bin/vite.js
# Readiness (fast-e2e.yml workflow_dispatch readiness=1, Task B4): each check three times in a row, every run in its own log.
REPEAT=1; [ "${READINESS:-}" = 1 ] && REPEAT=3
# Harness check -> the port its source names (0: the check starts its own server). Read from each check's head;
# fast-e2e.test.mjs compares this table with check-map.json and with every source, so a new harness check fails loudly.
declare -A PORT=(
  [canvas-editing-check.mjs]=5391 [inline-ai-check.mjs]=5397 [nanogpt-audio-check.mjs]=5186 [voice-tts-stream-check.mjs]=0
  [dark-ink-check.mjs]=5189 [delete-esc-check.mjs]=5189 [drop-ui-check.mjs]=5189 [grade-shadow-check.mjs]=5189
  [learn-handoff-check.mjs]=5189 [menu-shortcuts-check.mjs]=5189 [paper-highlight-check.mjs]=5189 [search-files-check.mjs]=5189
  [video-check.mjs]=5189 [wiki-check.mjs]=5189 [wiki-card-check.mjs]=5189
)
# The release gate's env for fork checks (templates/int35.sh $E); PERSIST and D1_CONFIG are where stack.sh puts them.
FORK_ENV=(BASE=http://127.0.0.1:8878 PRACTICE_BASE=http://127.0.0.1:8878 VOICE_BASE=http://127.0.0.1:8878
  SMALL_CP=http://127.0.0.1:8879 "PERSIST=$OUT/stack/local" "D1_CONFIG=$OUT/stack/integ-local-cp.jsonc")

SERVER_PID=; ENVV=(); FAIL=0; FORK=(); HARNESS=()
stop_server() { [ -z "$SERVER_PID" ] || { kill "$SERVER_PID" 2>/dev/null; wait "$SERVER_PID" 2>/dev/null; SERVER_PID=; }; }
cleanup() { stop_server; [ ${#FORK[@]} = 0 ] || bash "$W/scripts/ci/stack.sh" stop "$OUT/stack"; }
trap cleanup EXIT

# serve <port>: the server a harness port needs, in the background. The 5189 app page is Vite dev with the review flags (the
# documented command); 5186 is the built dist-dev under vite preview (playwright.coaching.config.js); 5391 and 5397 are Vite
# dev without flags (their headers). RABBIT_HOLE_DEV_CP points the dev proxy at a dead port: nothing leaves the runner.
serve() {
  local port=$1 url=http://localhost:$1/ a=(--port "$1" --strictPort) e=(RABBIT_HOLE_DEV_CP=http://127.0.0.1:1)
  case $port in
    5189) e+=(VITE_COACHING_DEV=true VITE_BYOC_DEV=true) ;;
    5186) a=(preview --outDir dist-dev "${a[@]}") ;;
    *) a+=(--host 127.0.0.1); url=http://127.0.0.1:$port/ ;;
  esac
  (cd "$W/packages/web" && exec env "${e[@]}" node "$VITE" "${a[@]}") > "$OUT/vite-$port.log" 2>&1 &
  SERVER_PID=$!
  for _ in $(seq 1 90); do
    [ "$(curl -s -o /dev/null -m 5 -w '%{http_code}' "$url")" = 200 ] && return 0
    kill -0 "$SERVER_PID" 2>/dev/null || break
    sleep 1
  done
  echo "server on port $port did not answer; log tail:"; tail -n 20 "$OUT/vite-$port.log"; stop_server; return 1
}

# The gate's count for its attested-gate parser: the check's own "N/N checks passed", else its PASS / ok lines counted.
cnt() { local L=$1 s p f; s=$(sed 's/\x1b\[[0-9;]*m//g' "$L" | grep -aoE '[0-9]+/[0-9]+ checks passed|[0-9]+ checks passed' | tail -1)
  [ -n "$s" ] && { echo "$s"; return; }
  p=$(sed 's/\x1b\[[0-9;]*m//g' "$L" | grep -acE '^(PASS|ok)\b|^ok:|^flow [A-Za-z0-9]+ ok')
  f=$(sed 's/\x1b\[[0-9;]*m//g' "$L" | grep -acE '^FAIL|^not ok')
  if [ "$f" != 0 ]; then echo "fail $f"; else echo "$p/$p checks passed"; fi; }

# run_check <check> [args...]: one check from packages/web with the env in ENVV, REPEAT times; a failure prints the log tail.
run_check() {
  local c=$1 n=${1%.mjs} L T0 rc i t=; shift
  for i in $(seq 1 "$REPEAT"); do
    L=$OUT/$n.log; [ "$REPEAT" = 1 ] || { L=$OUT/$n-$i.log; t=" run $i/$REPEAT"; }; T0=$(date +%s)
    (cd "$W/packages/web" && env "${ENVV[@]}" timeout 900 node "e2e/$c" "$@" > "$L" 2>&1); rc=$?
    echo "${n%-check}$t exit $rc  $(cnt "$L")  ($(( $(date +%s) - T0 ))s)" | tee -a "$OUT/fast.log"
    [ $rc = 0 ] || { FAIL=1; echo "--- ${n%-check}$t log tail ---"; sed 's/\x1b\[[0-9;]*m//g' "$L" | tail -n 20; }
  done
}

# Which runner each selected check needs (check-map.json); anything but fork or harness is a stop, never a silent skip.
ROWS=$(node -e 'const f=p=>JSON.parse(require("fs").readFileSync(p,"utf8")),m=f(process.argv[1]).checks;for(const c of f(process.argv[2]).checks)console.log(c+"\t"+(m[c]?.runner??"unknown"))' "$W/scripts/ci/check-map.json" "$SEL") || { echo "cannot read the selection $SEL"; exit 2; }
while IFS=$'\t' read -r c r; do
  [ -n "$c" ] || continue
  case $r in
    fork) FORK+=("$c") ;;
    harness) if [ -n "${PORT[$c]+x}" ]; then HARNESS+=("$c"); else echo "$c: no server rule in run-part.sh PORT table"; FAIL=1; fi ;;
    unknown) echo "$c: not in scripts/ci/check-map.json; add it there with runner fork or harness"; FAIL=1 ;;
    *) echo "$c: runner '$r' cannot run in the fast tier"; FAIL=1 ;;
  esac
done <<< "$ROWS"

if [ ${#FORK[@]} != 0 ]; then
  bash "$W/scripts/ci/stack.sh" start "$OUT/stack" || { echo 'stack failed to start'; exit 1; }
  ENVV=("${FORK_ENV[@]}")
  for c in "${FORK[@]}"; do run_check "$c" "$OUT/${c%.mjs}-shots"; done
fi

ENVV=()
for port in 5189 5186 5391 5397 0; do
  G=(); for c in "${HARNESS[@]}"; do [ "${PORT[$c]}" = "$port" ] && G+=("$c"); done
  [ ${#G[@]} = 0 ] && continue
  if [ "$port" != 0 ] && ! serve "$port"; then
    for c in "${G[@]}"; do echo "${c%-check.mjs} exit 97  server on port $port did not start" | tee -a "$OUT/fast.log"; done
    FAIL=1; continue
  fi
  for c in "${G[@]}"; do run_check "$c"; done
  stop_server
done
exit $FAIL
