#!/usr/bin/env bash
# Fast-tier stack (Linux): the keyless local app + control plane the release gate's fork stack runs, for the browser
# checks the fast tier selects. start <persist> | stop <persist> | restart <persist> (after a crash: same vars and data).
# Never a model key; provider tripwire on when present.
# Ports: app (+ in-process control plane) 8878, inspector 9318; standalone control plane 8879, inspector 9319.
# Layout: configs rendered into <persist>, D1/DO state in <persist>/local, logs app.log cp.log schema.log, PIDs in <persist>/pids.
# Checks use: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 PERSIST=<persist>/local D1_CONFIG=<persist>/integ-local-cp.jsonc
set -euo pipefail
[ $# -eq 2 ] && { [ "$1" = start ] || [ "$1" = stop ] || [ "$1" = restart ]; } || { echo 'usage: stack.sh start|stop|restart <persist-dir>'; exit 2; }
W=$(git rev-parse --show-toplevel); CMD=$1; P=$2; C=$W/scripts/ci/config; B=$W/packages/web
if [ "$CMD" = stop ]; then
  # ponytail: SIGTERM only (wrangler disposes its own workerd). Add kill -9 after a grace period if CI shows stragglers.
  [ -f "$P/pids" ] && xargs -r kill < "$P/pids" 2>/dev/null || true
  rm -f "$P/pids" "$P/.dev.vars"   # the persist dir is uploaded as a CI artifact: no secret may stay in it
  # Remove only the packages/*/.dev.vars this script wrote, so the next start passes the refusal below.
  [ -f "$P/wrote-dev-vars" ] && rm -f "$W/packages/control-plane/.dev.vars" "$B/.dev.vars" "$P/wrote-dev-vars" || true
  exit 0
fi
if [ "$CMD" = restart ]; then
  # After wrangler dev died under a check ("Network connection lost", the gate's known transient): the same vars, configs and
  # data, new processes. The dead stack's logs stay as crash-<time>-app.log / -cp.log, as the gate's restart keeps them.
  P=$(cd "$P" && pwd); [ -f "$P/wrote-dev-vars" ] || { echo "no started stack in $P to restart"; exit 1; }
  [ -f "$P/pids" ] && xargs -r kill < "$P/pids" 2>/dev/null || true
  T=$(date +%H%M%S); for f in app cp; do if [ -f "$P/$f.log" ]; then mv "$P/$f.log" "$P/crash-$T-$f.log"; fi; done; rm -f "$P/pids"
  for port in 8878 8879; do for _ in $(seq 1 30); do [ "$(curl -s -o /dev/null -m 2 -w '%{http_code}' "http://127.0.0.1:$port/")" = 000 ] && break; sleep 1; done; done
else
# The harness refuses the same way (prepare.mjs): never overwrite credentials a developer already has.
for d in packages/control-plane packages/web; do
  [ ! -e "$W/$d/.dev.vars" ] || { echo "refusing to overwrite $d/.dev.vars; if an earlier run left it, run scripts/ci/stack.sh stop <persist>; else use a disposable checkout"; exit 1; }
done
mkdir -p "$P"; P=$(cd "$P" && pwd)
rm -f "$P/pids" "$P/app.log" "$P/cp.log" "$P/schema.log"; mkdir -p "$P/wrangler-logs" "$P/registry-app" "$P/registry-cp"
# Both bundles, built the way the gate's stack.sh dev builds them (no model keys in the env), only when missing.
[ -d "$B/dist" ] || (cd "$B" && env -i PATH="$PATH" HOME="$HOME" npx --no-install vite build > "$P/build1.log" 2>&1) || { echo 'web build failed; see build1.log'; exit 1; }
[ -d "$B/dist-dev" ] || (cd "$B" && env -i PATH="$PATH" HOME="$HOME" VITE_COACHING_DEV=true VITE_BYOC_DEV=true npx --no-install vite build --outDir dist-dev > "$P/build2.log" 2>&1) || { echo 'web build failed; see build2.log'; exit 1; }
for f in integ-local integ-local-cp integ-local-cp2; do sed "s#@@APP_ROOT@@#$W#g" "$C/$f.jsonc" > "$P/$f.jsonc"; done
! grep -q '@@' "$P"/integ-local*.jsonc || { echo 'unfilled @@ placeholder in a rendered config'; exit 1; }
fi
WJS=$W/node_modules/wrangler/bin/wrangler.js
[ -f "$WJS" ] || { echo 'wrangler not installed; run npm ci'; exit 1; }
# From here the secrets exist on disk: any failure (set -e, an explicit exit 1) stops the stack and removes them. Only success keeps them.
ok=0; trap '[ "$ok" = 1 ] || bash "$0" stop "$P"' EXIT
# wrangler sees PATH and HOME plus its log path, nothing else from the runner env.
WE=(env -i "PATH=$PATH" "HOME=$HOME" "WRANGLER_LOG_PATH=$P/wrangler-logs")
if [ "$CMD" = start ]; then
# Same local-only vars prepare.mjs writes. No model key: JOURNEY_MODEL_STUB=fixtures and OAUTH_MOCK=true keep it offline.
# The secret goes from node straight to the file. wrangler reads .dev.vars next to each config ($P); the checks read packages/control-plane/.dev.vars.
touch "$P/wrote-dev-vars"
node -e 'const c=require("crypto");process.stdout.write(`SMALL_ENV=test\nTEST_BYPASS_SECRET=${c.randomBytes(24).toString("hex")}\nMASTER_KEY=${c.randomBytes(32).toString("hex")}\nOAUTH_MOCK=true\nJOURNEY_MODEL_STUB=fixtures\n`)' > "$W/packages/control-plane/.dev.vars"
cp "$W/packages/control-plane/.dev.vars" "$B/.dev.vars"; cp "$W/packages/control-plane/.dev.vars" "$P/.dev.vars"
d1x() { "${WE[@]}" node "$WJS" d1 "$@" --local --config "$P/integ-local-cp.jsonc" --persist-to "$P/local" >> "$P/schema.log" 2>&1 || { echo "schema step failed (d1 $1 $2); schema.log tail:"; tail -n 20 "$P/schema.log"; exit 1; }; }
d1x execute rabbit-hole-dev --file "$W/packages/control-plane/bootstrap.sql"
d1x migrations apply rabbit-hole-dev
d1x execute rabbit-hole-learn-dev --file "$W/packages/control-plane/repository-schema.sql"
d1x execute rabbit-hole-byoc-dev --file "$W/packages/byoc/schema.sql"
fi
# Provider tripwire: when the tree has e2e/provider-tripwire.js, the workers start through the tripwire entrypoints (only "main" changes).
tw() { sed "s#\"main\": \"$W/$2\"#\"main\": \"$W/$3\"#" "$P/$1.jsonc" > "$P/$1-tw.jsonc"; grep -q "$3" "$P/$1-tw.jsonc" || { echo "tripwire swap did not match in $1"; exit 1; }; }
TW=""; if [ -f "$B/e2e/provider-tripwire.js" ]; then TW=-tw
  tw integ-local packages/web/dev-worker.js packages/web/e2e/tripwire-dev-worker.js
  tw integ-local-cp packages/control-plane/src/index.js packages/web/e2e/tripwire-cp-worker.js
  tw integ-local-cp2 packages/control-plane/src/index.js packages/web/e2e/tripwire-cp-worker.js; fi
echo "provider tripwire: ${TW:-off}"
ready() { for i in $(seq 1 120); do grep -q "Ready on" "$1" 2>/dev/null && return 0; grep -qE 'No such module|ERR_RUNTIME_FAILURE|Failed to start' "$1" 2>/dev/null && return 1; sleep 1; done; return 1; }
# up <role> <port> <inspector> <config>...: one wrangler dev in the background. The subshell execs, so $! is wrangler's own PID.
# Each role has its own dev registry, as prepare.mjs gives the gate (other stacks churning a shared one crashed it).
up() { local role=$1 port=$2 insp=$3 a=(); shift 3; for c in "$@"; do a+=(-c "$P/$c$TW.jsonc"); done
  (cd "$W" && exec "${WE[@]}" "WRANGLER_REGISTRY_PATH=$P/registry-$role" node "$WJS" dev "${a[@]}" --local --persist-to "$P/local" --port "$port" --inspector-port "$insp") > "$P/$role.log" 2>&1 &
  echo $! >> "$P/pids"; }
up app 8878 9318 integ-local integ-local-cp
ready "$P/app.log" || { echo 'app stack failed startup; app.log tail:'; tail -n 20 "$P/app.log"; exit 1; }
up cp 8879 9319 integ-local-cp2
ready "$P/cp.log" || { echo 'cp stack failed startup; cp.log tail:'; tail -n 20 "$P/cp.log"; exit 1; }
sleep 3
echo "stack app $(curl -s -o /dev/null -m 30 -w '%{http_code}' http://127.0.0.1:8878/apps) cp $(curl -s -o /dev/null -m 30 -w '%{http_code}' http://127.0.0.1:8879/)"
ok=1
