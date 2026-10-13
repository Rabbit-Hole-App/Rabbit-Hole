#!/usr/bin/env bash
set -o pipefail
# usage: stack.sh prod|dev - builds main-integration packages/web (dist + dist-dev) for that flag set with no model keys in the
# env, then (re)starts the local gate stack: app integ-local-app (+ in-process integ-local-cp) on 8878, inspector 9318;
# standalone control plane integ-local-cp2 on 8879, inspector 9319; persist .small/fork-local. Never small-cp-dev or
# rabbit-hole-cp-dev (the owner's 8828 stack). The TLDRAW key is read by name from the env file, never sourced or printed.
J=@@GATE_ROOT@@/fork
W=@@APP_ROOT@@
P=$J/local
stop_requested() {
  if [ -f "$J/../STOP-INT35" ]; then
    echo 'Gate stop requested during stack preparation'
    powershell -NoProfile -ExecutionPolicy Bypass -File "$J/stop.ps1"
    exit 4
  fi
}
stop_requested
for f in packages/web/integ-local.jsonc packages/control-plane/integ-local.jsonc packages/control-plane/integ-local-cp2.jsonc packages/control-plane/.dev.vars; do
  [ -f "$W/$f" ] || { echo "MISSING $f"; exit 1; }
done
[ -f "$J/SCHEMA-PREPARED-TREE" ] && [ "$(cat "$J/SCHEMA-PREPARED-TREE")" = "$INT35_EXPECTED_TREE" ] || { echo "LOCAL SCHEMA NOT PREPARED for this candidate; see PREPARATION.md"; exit 1; }
powershell -NoProfile -ExecutionPolicy Bypass -File "$J/stop.ps1" || exit 1
cd $W/packages/web || exit 1
L=${VITE_TLDRAW_LICENSE_KEY:-}
base() { env -i PATH="$PATH" HOME="$HOME" APPDATA="$APPDATA" LOCALAPPDATA="$LOCALAPPDATA" USERPROFILE="$USERPROFILE" SYSTEMROOT="$SYSTEMROOT" TEMP="$TEMP" TMP="$TMP" VITE_TLDRAW_LICENSE_KEY="$L" "$@"; }
# restart: no rebuild, just restart the stack on the current dist (a crashed stack mid-gate).
source "$J/../build-once.sh"
[ "$1" = restart ] && echo RESTART_ONLY || build_flavor "$1" "$J" || { echo BUILD FAILED; exit 1; }
echo "built $1"
cp $W/packages/control-plane/.dev.vars $W/packages/web/.dev.vars
# Provider tripwire (owner, 2026-10-07): when the tree has e2e/provider-tripwire.js, the workers start through the tripwire
# entrypoints, so no local check can reach a model provider and the checks can read the count. Variant configs are written
# next to the originals (untracked) with only "main" changed.
TW=""
if [ -f "$W/packages/web/e2e/provider-tripwire.js" ]; then
  TW="-tw"
  sed 's#"main": "dev-worker.js"#"main": "e2e/tripwire-dev-worker.js"#' $W/packages/web/integ-local.jsonc > $W/packages/web/integ-local-tw.jsonc
  sed 's#"main": "app-worker.js"#"main": "e2e/tripwire-app-worker.js"#' $W/packages/web/integ-app.jsonc > $W/packages/web/integ-app-tw.jsonc
  sed 's#"main": "src/index.js"#"main": "../web/e2e/tripwire-cp-worker.js"#' $W/packages/control-plane/integ-local.jsonc > $W/packages/control-plane/integ-local-tw.jsonc
  sed 's#"main": "src/index.js"#"main": "../web/e2e/tripwire-cp-worker.js"#' $W/packages/control-plane/integ-local-cp2.jsonc > $W/packages/control-plane/integ-local-cp2-tw.jsonc
fi
echo "provider tripwire: ${TW:-off}"
# A restart keeps the dead stack's logs (crash-<time>-app.log / -cp.log) so the cause of a mid-gate crash stays on record.
if [ "$1" = restart ]; then T=$(date +%H%M%S); for f in app cp; do [ -f "$J/$f.log" ] && mv "$J/$f.log" "$J/crash-$T-$f.log"; done; fi
cd $W; rm -f "$J/app.log" "$J/cp.log"
# A private dev registry (see lanes/lane-stack.sh): other local stacks churning the machine-wide one crashed this
# stack mid-gate (wrangler ProxyController error, 2026-10-06). App and control plane run in-process; nothing needs it.
export WRANGLER_REGISTRY_PATH=$J/registry-integ; mkdir -p "$WRANGLER_REGISTRY_PATH"
(npx --no-install wrangler dev -c "$W/packages/web/integ-local$TW.jsonc" -c "$W/packages/control-plane/integ-local$TW.jsonc" --local --persist-to $P --port 8878 --inspector-port 9318 > "$J/app.log" 2>&1 &)
for i in $(seq 1 120); do
  stop_requested
  grep -q "Ready on" "$J/app.log" 2>/dev/null && break
  if grep -qE 'No such module|ERR_RUNTIME_FAILURE|Failed to start' "$J/app.log" 2>/dev/null; then break; fi
  sleep 1
done
if ! grep -q "Ready on" "$J/app.log"; then
  echo 'app stack failed startup; inspect app.log'
  powershell -NoProfile -ExecutionPolicy Bypass -File "$J/stop.ps1"
  exit 1
fi
(npx --no-install wrangler dev -c "$W/packages/control-plane/integ-local-cp2$TW.jsonc" --local --persist-to $P --port 8879 --inspector-port 9319 > "$J/cp.log" 2>&1 &)
for i in $(seq 1 120); do
  stop_requested
  grep -q "Ready on" "$J/cp.log" 2>/dev/null && break
  if grep -qE 'No such module|ERR_RUNTIME_FAILURE|Failed to start' "$J/cp.log" 2>/dev/null; then break; fi
  sleep 1
done
if ! grep -q "Ready on" "$J/cp.log"; then
  echo 'cp stack failed startup; inspect cp.log'
  powershell -NoProfile -ExecutionPolicy Bypass -File "$J/stop.ps1"
  exit 1
fi
sleep 3
echo "stack app $(curl -s -o /dev/null -m 30 -w '%{http_code}' http://127.0.0.1:8878/apps) cp $(curl -s -o /dev/null -m 30 -w '%{http_code}' http://127.0.0.1:8879/)"
