#!/usr/bin/env bash
set -o pipefail
# Build the dev-flag web bundle, a fresh local D1 (bootstrap, migrations, repository-schema.sql with LP1's 0006 - local
# only), then start int-alp-app (8878) and int-alp-cp (8879). Never a remote database.
J=@@GATE_ROOT@@/lp1h
R=@@APP_ROOT@@
WS=$J/ws; C=$WS/cfg/cp/wrangler.jsonc; P=$WS/local
powershell -NoProfile -ExecutionPolicy Bypass -File "$J/stop.ps1" || exit 1
node $J/setup-j.cjs || exit 1
grep -o '^[A-Z0-9_]*=' $WS/cfg/cp/.dev.vars | tr '\n' ' '; echo
cd $R/packages/web
L=${VITE_TLDRAW_LICENSE_KEY:-}
base() { env -i PATH="$PATH" HOME="$HOME" APPDATA="$APPDATA" LOCALAPPDATA="$LOCALAPPDATA" USERPROFILE="$USERPROFILE" SYSTEMROOT="$SYSTEMROOT" TEMP="$TEMP" TMP="$TMP" VITE_TLDRAW_LICENSE_KEY="$L" "$@"; }
W=$R; source "$J/../build-once.sh"; build_flavor dev "$J" || { echo BUILD FAILED; exit 1; }
echo built
powershell -NoProfile -ExecutionPolicy Bypass -File "$J/../clear-local.ps1" -Target journey || exit 1
cd $R
CI=true npx --no-install wrangler d1 execute rabbit-hole-dev --local -c $C --persist-to $P --file packages/control-plane/bootstrap.sql > $J/d1.log 2>&1 || { echo "D1 FAILED bootstrap"; exit 1; }
CI=true npx --no-install wrangler d1 migrations apply rabbit-hole-dev --local -c $C --persist-to $P >> $J/d1.log 2>&1 || { echo "D1 FAILED migrations"; exit 1; }
npx --no-install wrangler d1 execute rabbit-hole-learn-dev --local -c $C --persist-to $P --file packages/control-plane/repository-schema.sql >> $J/d1.log 2>&1 || { echo "D1 FAILED learn"; exit 1; }
npx --no-install wrangler d1 execute rabbit-hole-byoc-dev --local -c $C --persist-to $P --file packages/byoc/schema.sql >> $J/d1.log 2>&1 || { echo "D1 FAILED byoc"; exit 1; }
echo "local D1 ready"
rm -f $J/app.log $J/cp.log
export WRANGLER_REGISTRY_PATH=$J/registry-j; mkdir -p "$WRANGLER_REGISTRY_PATH"
# Each worker's wrangler debug log lands in $J/wrangler-logs: classify-retry.mjs reads the crash signature there, and run.mjs exports the .log files.
export WRANGLER_LOG=debug WRANGLER_LOG_PATH="$J/wrangler-logs"; mkdir -p "$WRANGLER_LOG_PATH"
(npx --no-install wrangler dev -c $WS/cfg/app/wrangler.jsonc -c $C --local --persist-to $P --ip 127.0.0.1 --port 8878 > $J/app.log 2>&1 &)
for i in $(seq 1 150); do grep -q "Ready on" $J/app.log 2>/dev/null && break; sleep 1; done
(npx --no-install wrangler dev -c $C --local --persist-to $P --ip 127.0.0.1 --port 8879 > $J/cp.log 2>&1 &)
for i in $(seq 1 150); do grep -q "Ready on" $J/cp.log 2>/dev/null && break; sleep 1; done
sleep 4
echo "stack app $(curl -s -o /dev/null -m 30 -w '%{http_code}' http://127.0.0.1:8878/apps) cp $(curl -s -o /dev/null -m 30 -w '%{http_code}' http://127.0.0.1:8879/)"
grep -ciE "_API_KEY|ELEVENLABS" $J/app.log | sed 's/^/model key bindings in app log: /'
