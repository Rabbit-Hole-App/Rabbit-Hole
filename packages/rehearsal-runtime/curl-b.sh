#!/usr/bin/env bash
# Lane B server-side check: start -> poll -> ready -> second POST served from R2, against the owner's stack on 127.0.0.1:8878 and
# the local controller on 127.0.0.1:8891 (packages/rehearsal-runtime/server.py running). Not run by lane B (no controller existed).
#
#   COOKIE='<the Cookie header of a signed-in 127.0.0.1:8878 browser session>' \
#   APP=canvas-xxxxxxxx BOARD=main REHEARSAL_WORKER_TOKEN=<same value as in the stack .dev.vars> \
#   [APP_ID=<repository_apps.id of the canvas's project>  COMMIT=<40-hex>]  bash packages/rehearsal-runtime/curl-b.sh
#
# APP is the canvas (nanoGPT project canvas). APP_ID and COMMIT are only needed for the controller-side and R2 lines at the end.
set -u
: "${COOKIE:?COOKIE required}"; : "${APP:?APP required}"; : "${REHEARSAL_WORKER_TOKEN:?REHEARSAL_WORKER_TOKEN required}"
BOARD=${BOARD:-main}; BASE=${BASE:-http://127.0.0.1:8878}; CTRL=${CTRL:-http://127.0.0.1:8891}
post() { curl -sS -X POST "$BASE/api/learn/rehearsal" -H "Cookie: $COOKIE" -H 'Content-Type: application/json' -H "Origin: $BASE" -d "{\"app\":\"$APP\",\"board\":\"$BOARD\"}"; }
get()  { curl -sS "$BASE/api/learn/rehearsal?app=$APP&board=$BOARD" -H "Cookie: $COOKIE"; }
status() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);console.log(j.status||("ERROR "+j.error))}catch{console.log("BAD "+s.slice(0,200))}})'; }

echo "== controller reachable (any HTTP code means it is up; 000 means nothing listens on 8891)"
curl -sS -o /dev/null -w '%{http_code}\n' "$CTRL/rehearsals/00"

echo "== 1. start"; R=$(post); echo "$R" | head -c 400; echo
echo "== 2. poll every 5 s until ready or failed (max 45 min)"
for i in $(seq 1 540); do
  R=$(get); S=$(echo "$R" | status); echo "$(date +%T) $S $(echo "$R" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);console.log(JSON.stringify({step:j.step,attempt:j.attempt,fixes:j.fixes,elapsedSec:j.elapsedSec,error:j.error}))}catch{}})')"
  [ "$S" = ready ] || [ "$S" = failed ] || [[ "$S" == ERROR* ]] && break
  sleep 5
done
[ "$S" = ready ] || { echo "FAIL: ended as $S"; echo "$R" | head -c 800; exit 1; }
echo "$R" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s),r=j.record;console.log(JSON.stringify({status:j.status,elapsedSec:j.elapsedSec,version:r.version,repo:r.repo,commit:r.commit,hardware:r.hardware,allChecksPassed:r.allChecksPassed,fixes:r.fixes.length,sandboxId:r.sandboxId,terminated:r.terminated}))})'

echo "== 3. second POST must answer ready at once from R2 (no new controller job)"
T0=$(date +%s); R2=$(post); T1=$(date +%s); echo "status=$(echo "$R2" | status) in $((T1-T0)) s"
[ "$(echo "$R2" | status)" = ready ] || { echo "FAIL: second POST not ready"; exit 1; }

if [ -n "${APP_ID:-}" ] && [ -n "${COMMIT:-}" ]; then
  KEY=$(printf '%s' "$APP_ID|$COMMIT|cpu" | sha256sum | cut -d' ' -f1)
  echo "== 4. controller still holds the job (key $KEY), status then asset size"
  curl -sS "$CTRL/rehearsals/$KEY" -H "Authorization: Bearer $REHEARSAL_WORKER_TOKEN"; echo
  curl -sS -o /dev/null -w 'asset: HTTP %{http_code}, %{size_download} bytes\n' "$CTRL/rehearsals/$KEY/asset" -H "Authorization: Bearer $REHEARSAL_WORKER_TOKEN"
  echo "== 5. R2 objects in the stack's local bucket (record.json and the zip beside it)"
  for O in rehearsal-cpu.json rehearsal-cpu-artifacts.zip; do
    npx wrangler r2 object get "rabbit-hole-dev-repositories/learn-repositories-dev/$APP_ID/$COMMIT/$O" --local --persist-to C:/s/spec/owner-local/persist/local --file "${TMPDIR:-/tmp}/$O" && ls -l "${TMPDIR:-/tmp}/$O"
  done
fi
echo "== bad commit (A5): point a canvas at an unknown commit, run this script again; expect status=failed with the controller's reason"
echo DONE
