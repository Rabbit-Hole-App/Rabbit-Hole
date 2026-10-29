#!/usr/bin/env bash
# Generated interactive programs (generic /explain) in PRODUCTION: the release and its three rollbacks. The OWNER runs it through explain-prod.cmd.
#   release         the pinned candidate (EXPLAIN_PROGRAM_ENABLED true, EXPLAIN_PROGRAM_EXECUTION_KILL false): gate/CI checks, rel-after-gate.sh (dev),
#                   rel-main.sh (main push + release run), read-back. Records the Worker pair it replaces (for `emergency`). No typed phrase: running it is the GO.
#   generation-off  the pre-built child commit with EXPLAIN_PROGRAM_ENABLED false (no new programs; accepted cards keep running). Typed: GENERATION OFF
#   kill            the pre-built child commit with EXPLAIN_PROGRAM_EXECUTION_KILL true (program cards refuse to load and run once reloaded; open running cards are not stopped; generation stays on). Typed: KILL EXECUTION
#   emergency       wrangler rollback of rabbit-hole-app then rabbit-hole-cp to the pair recorded by `release` (about a minute, no CI). Typed: ROLL BACK WORKER
# Pins (release, generation-off, kill): <action>.pins next to this file, SHA / GATE / MAIN_PREV, filled by the integrator; PENDING or stale refuses.
# Usage: bash explain-prod.sh <action> [--check]     --check: every read-only check and the live read-back; pushes, rolls back and records nothing.
# Typed phrases are read from the terminal only: no variable, file or flag answers them. Reruns resume: a pushed main is not pushed again.
set -uo pipefail
[ -z "${BASH_ENV+x}${ENV+x}" ] || { echo "EXPLAIN PROD STOP: BASH_ENV or ENV is set; this script takes no shell startup override. Nothing was done."; exit 1; }
HERE=/c/s/spec/explain-sandbox/prod; DAY=/c/s/spec/day-1021; ES=/c/s/spec/explain-sandbox
TTY=/dev/tty
R=Rabbit-Hole-App/Rabbit-Hole; WS=C:/Users/cyudhist/Desktop/workspace; STATE=$HERE/state/prev-worker.txt
CFG=packages/web/wrangler.rabbit-hole-prod.jsonc; TEST=packages/control-plane/test/rabbit-hole-prod-config.test.js
ACTION=${1:-}; CHECK=0; [ "${2:-}" = --check ] && CHECK=1
[ -n "${2:-}" ] && [ "$2" != --check ] && { echo "usage: explain-prod.sh release|generation-off|kill|emergency [--check]"; exit 2; }
case "$ACTION" in
  release)        W=$WS/explain-prod;      EN=true;  KILL=false; PHRASE= ;;
  generation-off) W=$WS/explain-prod-off;  EN=false; KILL=false; PHRASE="GENERATION OFF" ;;
  kill)           W=$WS/explain-prod-kill; EN=true;  KILL=true;  PHRASE="KILL EXECUTION" ;;
  emergency)      W=$WS/explain-prod;      PHRASE="ROLL BACK WORKER" ;;
  *) echo "usage: explain-prod.sh release|generation-off|kill|emergency [--check]"; exit 2 ;;
esac
pt() { TZ='PST8PDT,M3.2.0,M11.1.0' date '+%I:%M %p PT'; }
die() { echo "EXPLAIN PROD STOP ($ACTION): $* ($(pt))"; exit 1; }
for t in git gh node curl; do command -v $t >/dev/null || die "$t is not on PATH"; done
jv() { printf '%s' "$1" | sed -n "s/.*\"$2\":\"\([^\"]*\)\".*/\1/p"; }   # one string value of a flat JSON line ('' for null or absent)
vars() { node "$DAY/with-cf.mjs" "$W" node "$ES/explain-worker-vars.mjs" 2>&1 | tail -1; }   # GET only: the app Worker's EXPLAIN vars + served version
binds() { node "$DAY/with-cf.mjs" "$W" node "$ES/explain-bindings.mjs" 2>&1 | tail -1; }    # GET only: every EXPLAIN-named binding, any type
cps() { node "$DAY/with-cf.mjs" "$W" node "$HERE/cp-served.mjs" 2>&1 | tail -1; }             # GET only: the control plane's served version
probes() { local o=; for u in https://digrabbithole.com/ https://digrabbithole.com/sign-in https://digrabbithole.com/api/learn/usage https://digrabbithole.com/api/apps https://digrabbithole.com/api/learn/tutor/plan; do o="$o$(curl -s -o /dev/null -w '%{http_code}' "$u") "; done; echo "${o% }"; }
confirm() { # typed at this console only
  [ -r "$TTY" ] || die "no terminal: type the confirmation in the launcher's own window. Nothing was changed"
  echo; echo "$1"; local ans=""; read -r -p "Type $PHRASE to go on (anything else stops): " ans <"$TTY" || die "could not read from the terminal: nothing was changed"
  [ "$ans" = "$PHRASE" ] || die "not confirmed: nothing was changed"
}
rec() { grep '^release|' "$STATE" 2>/dev/null | tail -1; }   # release|<released sha>|<app version>|<app sha12>|<cp version>|<cp sha12>|<epoch>
ROLLBACKS="  generation off (cost/quality):   C:\\s\\spec\\explain-sandbox\\prod\\explain-prod.cmd generation-off
  execution kill (execution fault): C:\\s\\spec\\explain-sandbox\\prod\\explain-prod.cmd kill
  emergency Worker rollback:        C:\\s\\spec\\explain-sandbox\\prod\\explain-prod.cmd emergency   (about 1 minute, no CI)
  (each takes --check first; README.md says which to use)"
echo "=== explain prod $ACTION $( [ $CHECK = 1 ] && echo CHECK || echo RUN ) ($(pt)) ==="

# ------------------------------------------------------------------ emergency ------------------------------------------------------------------
if [ "$ACTION" = emergency ]; then
  REC=$(rec); [ -n "$REC" ] || die "no rollback point is recorded in $STATE (the release did not run through this launcher). Use the manual rollback in docs/features/prod-release.md with the release receipt's previous pair"
  IFS='|' read -r _ RSHA AV AS CV CS _ <<<"$REC"
  echo "recorded before release ${RSHA:0:12}: app $AV (release $AS), control plane $CV (release $CS)"
  V=$(vars); C=$(cps); echo "live app: $V"; echo "live cp:  $C"
  printf '%s' "$V" | grep -q '"readable":true' || die "the app Worker could not be read: $V"
  printf '%s' "$C" | grep -q '"readable":true' || die "the control plane could not be read: $C"
  NEED_APP=1; [ "$(jv "$V" app_version)" = "$AV" ] && NEED_APP=0
  NEED_CP=1;  [ "$(jv "$C" cp_version)" = "$CV" ] && NEED_CP=0
  if [ $NEED_APP = 0 ] && [ $NEED_CP = 0 ]; then echo "both Workers already serve the recorded pair: nothing to roll back (resume)"
  else
    echo "plan: $( [ $NEED_APP = 1 ] && echo "wrangler rollback $AV (rabbit-hole-app), " )$( [ $NEED_CP = 1 ] && echo "wrangler rollback $CV (rabbit-hole-cp)" ) with the message 'release $AS ...' so the next release still sees a named pair"
    [ $CHECK = 1 ] && { echo "CHECK COMPLETE: nothing was rolled back ($(pt))"; exit 0; }
    confirm "THIS ROLLS PRODUCTION BACK to release $AS (app first, then the control plane): every change since then is undone, not only /explain programs. main is NOT changed."
    if [ $NEED_APP = 1 ]; then echo "+ wrangler rollback $AV (rabbit-hole-app)"
      (cd "$W/packages/web" && node "$DAY/with-cf.mjs" . wrangler rollback "$AV" --config wrangler.rabbit-hole-prod.jsonc --message "release $AS (emergency rollback from ${RSHA:0:12})" -y) || die "app rollback failed: Cloudflare dashboard > Workers > rabbit-hole-app > Deployments, roll back to $AV"; fi
    if [ $NEED_CP = 1 ]; then echo "+ wrangler rollback $CV (rabbit-hole-cp)"
      (cd "$W/packages/control-plane" && node "$DAY/with-cf.mjs" . wrangler rollback "$CV" --config wrangler.rabbit-hole-prod.jsonc --message "release $CS (emergency rollback from ${RSHA:0:12})" -y) || die "control plane rollback failed (the app IS rolled back): Cloudflare dashboard > Workers > rabbit-hole-cp > Deployments, roll back to $CV"; fi
  fi
  ok=0; for i in 1 2 3 4 5 6; do V=$(vars); C=$(cps)
    [ "$(jv "$V" app_version)" = "$AV" ] && [ "$(jv "$V" app_sha12)" = "$AS" ] && [ "$(jv "$C" cp_version)" = "$CV" ] && [ "$(jv "$C" cp_sha12)" = "$CS" ] && [ "$(jv "$V" EXPLAIN_PROGRAM_ENABLED)" != true ] && { ok=1; break; }
    sleep 20; done
  echo "read-back app: $V"; echo "read-back cp:  $C"
  [ $ok = 1 ] || die "production is not on the recorded pair (app $AV/$AS, cp $CV/$CS): read the two lines above"
  P=$(probes); echo "public probes: $P"; [ "$P" = "200 200 401 401 405" ] || die "probes differ from 200 200 401 401 405"
  echo "EMERGENCY ROLLBACK DONE: production serves release $AS again; generated programs are off ($(pt))."
  echo "main still holds ${RSHA:0:12}: the NEXT main push redeploys it. Fix forward with: C:\\s\\spec\\explain-sandbox\\prod\\explain-prod.cmd generation-off   (or a fix release)."
  exit 0
fi

# ------------------------------------------------------- release, generation-off, kill -------------------------------------------------------
PINS=$HERE/$ACTION.pins; [ -f "$PINS" ] || die "$PINS is missing"
SHA=$(sed -n 's/^SHA=//p' "$PINS" | tr -d '\r'); GATE=$(sed -n 's/^GATE=//p' "$PINS" | tr -d '\r'); MAIN_PREV=$(sed -n 's/^MAIN_PREV=//p' "$PINS" | tr -d '\r')
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || die "SHA in $PINS is '$SHA', not a 40-character SHA: the integrator fills it"
[[ "$GATE" =~ ^[0-9]+$ ]] || die "GATE in $PINS is '$GATE': the integrator fills in the gate run id for ${SHA:0:8}"
[[ "$MAIN_PREV" =~ ^[0-9a-f]{40}$ ]] || die "MAIN_PREV in $PINS is '$MAIN_PREV': the integrator fills in the main this release fast-forwards from"
echo "pins: candidate ${SHA:0:12}, gate $GATE, main must be ${MAIN_PREV:0:12}; expects EXPLAIN_PROGRAM_ENABLED $EN, EXPLAIN_PROGRAM_EXECUTION_KILL $KILL"
[ "$(git -C "$W" rev-parse HEAD)" = "$SHA" ] || die "$W is at $(git -C "$W" rev-parse --short=8 HEAD), not the pinned ${SHA:0:8}"
[ -z "$(git -C "$W" status --porcelain --untracked-files=no)" ] || die "$W has uncommitted tracked changes"
CF=$(git -C "$W" show "$SHA:$CFG" | tr -d '\r')
printf '%s\n' "$CF" | grep -qx "    \"EXPLAIN_PROGRAM_ENABLED\": \"$EN\"," || die "the candidate's $CFG does not set EXPLAIN_PROGRAM_ENABLED \"$EN\""
printf '%s\n' "$CF" | grep -qx "    \"EXPLAIN_PROGRAM_EXECUTION_KILL\": \"$KILL\"," || die "the candidate's $CFG does not set EXPLAIN_PROGRAM_EXECUTION_KILL \"$KILL\""
printf '%s\n' "$CF" | grep -q '"EXPLAIN_DIAGNOSTICS"' && die "the candidate's $CFG names EXPLAIN_DIAGNOSTICS"
if [ "$ACTION" != release ]; then
  [ "$(git -C "$W" rev-parse "$SHA^")" = "$MAIN_PREV" ] || die "${SHA:0:8} is not a direct child of MAIN_PREV ${MAIN_PREV:0:8}: re-cut the flip commit on the released commit and update $PINS"
  [ "$(git -C "$W" diff --name-only "$MAIN_PREV" "$SHA" | tr -d '\r' | sort | tr '\n' ' ')" = "$TEST $CFG " ] || die "${SHA:0:8} changes more than $CFG and $TEST"
fi
git -C "$W" fetch -q rabbit-hole main dev || die "fetch failed"
MAIN=$(git -C "$W" rev-parse rabbit-hole/main); DEV=$(git -C "$W" rev-parse rabbit-hole/dev)
git -C "$W" merge-base --is-ancestor "$MAIN" "$SHA" || die "main ${MAIN:0:8} is not an ancestor of ${SHA:0:8}: re-cut the candidate on main and update $PINS"
[ "$MAIN" = "$SHA" ] || [ "$MAIN" = "$MAIN_PREV" ] || die "main is ${MAIN:0:8}, not MAIN_PREV ${MAIN_PREV:0:8} (stale pin): the integrator re-checks the candidate on the new main and updates $PINS"
git -C "$W" merge-base --is-ancestor "$DEV" "$SHA" || die "dev ${DEV:0:8} is not an ancestor of ${SHA:0:8}: forward-only refuses"
[ "$(gh run view "$GATE" -R $R --json conclusion --jq .conclusion)" = success ] || die "gate $GATE is not success"
for w in verify fast-e2e; do
  c=$(gh run list -R $R --commit "$SHA" --workflow $w.yml --json conclusion --jq '[.[]|select(.conclusion=="success")]|length'); [ "${c:-0}" -ge 1 ] || die "no successful $w run on ${SHA:0:8}"
done
echo "checks ok: worktree, config flags, main ${MAIN:0:8}, dev ${DEV:0:8} is an ancestor, gate $GATE success, verify and fast-e2e success on ${SHA:0:8}"
V=$(vars); C=$(cps); echo "live app: $V"; echo "live cp:  $C"
printf '%s' "$V" | grep -q '"readable":true' || die "the production app Worker could not be read ($V): not releasing without knowing what it replaces"
printf '%s' "$C" | grep -q '"readable":true' || die "the production control plane could not be read ($C)"
AS=$(jv "$V" app_sha12); CS=$(jv "$C" cp_sha12); EREC=$(rec | cut -d'|' -f4)
if [ "$MAIN" != "$SHA" ]; then
  if [ "$AS" = "${MAIN:0:12}" ] && [ "$CS" = "${MAIN:0:12}" ]; then echo "production serves main ${MAIN:0:12} (app and cp)"
  elif [ "$ACTION" != release ] && [ -n "$EREC" ] && [ "$AS" = "$EREC" ] && [ "$CS" = "$EREC" ]; then echo "production serves the emergency-rollback pair $EREC: this release fixes forward"
  else die "production serves app ${AS:-unnamed} / cp ${CS:-unnamed}, not main ${MAIN:0:12}: someone deployed outside the release. Tell Claude"; fi
  if [ "$ACTION" = release ]; then
    if grep -q "^release|$SHA|" "$STATE" 2>/dev/null; then echo "rollback point for ${SHA:0:12} already recorded (resume): $(rec)"
    else LINE="release|$SHA|$(jv "$V" app_version)|$AS|$(jv "$C" cp_version)|$CS|$(date +%s)"
      [ -n "$(jv "$V" app_version)" ] && [ -n "$(jv "$C" cp_version)" ] || die "the served version ids could not be read: not releasing without a rollback point"
      if [ $CHECK = 1 ]; then echo "would record the rollback point: $LINE"; else mkdir -p "$HERE/state" && echo "$LINE" >> "$STATE" && echo "recorded rollback point: $LINE"; fi
    fi
  fi
elif [ "$ACTION" = release ] && ! grep -q "^release|$SHA|" "$STATE" 2>/dev/null; then echo "WARNING: no rollback point is recorded for ${SHA:0:12}: emergency is unavailable; use the release receipt's previous pair (docs/features/prod-release.md)"
fi
if [ $CHECK = 1 ]; then echo "CHECK COMPLETE: nothing was pushed or recorded ($(pt))"; exit 0; fi
if [ "$MAIN" != "$SHA" ]; then
  [ -n "$PHRASE" ] && confirm "THIS RELEASES ${SHA:0:12} TO PRODUCTION: EXPLAIN_PROGRAM_ENABLED $EN, EXPLAIN_PROGRAM_EXECUTION_KILL $KILL (about 15 minutes: dev deploy, main push, release run). Nothing else changes."
  [ "$DEV" = "$SHA" ] || { W="$W" D="$HERE/gate-dl" bash "$DAY/rel-after-gate.sh" "$GATE" || die "dev move failed (re-run this launcher to resume)"; }
  W="$W" bash "$DAY/rel-main.sh" || die "main release failed (re-run to resume; it never force-pushes). If the release run rolled itself back, production is on the previous pair"
else echo "main is already ${SHA:0:12}: no push (resume), read-back only"; fi
echo "--- read-back (Cloudflare GET only) ---"
ok=0; for i in 1 2 3 4 5 6; do V=$(vars); B=$(binds); C=$(cps)
  [ "$(jv "$V" app_sha12)" = "${SHA:0:12}" ] && [ "$(jv "$C" cp_sha12)" = "${SHA:0:12}" ] && [ "$(jv "$V" EXPLAIN_V2_ENABLED)" = true ] && [ "$(jv "$V" EXPLAIN_PROGRAM_ENABLED)" = "$EN" ] \
    && [ "$(jv "$V" EXPLAIN_PROGRAM_EXECUTION_KILL)" = "$KILL" ] && printf '%s' "$B" | grep -q '^\[' && ! printf '%s' "$B" | grep -q '"name":"EXPLAIN_DIAGNOSTICS"' && { ok=1; break; }
  sleep 20; done
echo "app:      $V"; echo "bindings: $B"; echo "cp:       $C"
[ $ok = 1 ] || die "the read-back differs from: sha ${SHA:0:12} on app and cp, EXPLAIN_V2_ENABLED true, EXPLAIN_PROGRAM_ENABLED $EN, EXPLAIN_PROGRAM_EXECUTION_KILL $KILL, no EXPLAIN_DIAGNOSTICS. Rollback options:
$ROLLBACKS"
P=$(probes); echo "public probes: $P"; [ "$P" = "200 200 401 401 405" ] || die "probes differ from 200 200 401 401 405"
echo "EXPLAIN PROD $ACTION DONE: ${SHA:0:12} live, EXPLAIN_PROGRAM_ENABLED $EN, EXPLAIN_PROGRAM_EXECUTION_KILL $KILL, no EXPLAIN_DIAGNOSTICS ($(pt))."
[ "$ACTION" = release ] && echo "NEXT: in the signed-in app run ONE /explain cooling question (RUNBOOK.md step 3), then the receipt: C:\\s\\spec\\explain-sandbox\\prod\\explain-prod-verify.cmd"
echo "Rollbacks if needed:"; echo "$ROLLBACKS"
exit 0
