# Harness for explain-prod.sh. Runs ONLY inside iso.cmd (private MSYS root, env -i, PATH=/usr/bin = coreutils + stubs).
# The script under test is a copy of the production file with exactly two lines changed (HERE -> scenario dir, TTY -> scenario file).
set -u
H=/c/Users/cyudhist/AppData/Local/Temp/claude/C--Users-cyudhist-Desktop-workspace-small-parallel/18600193-cd3f-46a9-a619-6af51fb78a12/scratchpad/iso; PROD=/c/s/spec/explain-sandbox/prod/explain-prod.sh; T=$H/explain-prod.harness.sh
PASS=0; FAIL=0
ok() { echo "  PASS $*"; PASS=$((PASS+1)); }; bad() { echo "  FAIL $*"; FAIL=$((FAIL+1)); }

echo "== isolation proof =="
[ "$PATH" = /usr/bin ] && ok "PATH is /usr/bin only" || bad "PATH=$PATH"
for t in git gh node curl wrangler; do head -2 "$(command -v $t)" | grep -q 'STUB\|FORBIDDEN' && ok "$t is a stub ($(command -v $t))" || bad "$t is not a stub"; done
for t in ssh npx fly powershell cmd python; do grep -q FORBIDDEN "$(command -v $t)" && ok "$t is a refusing stub" || bad "$t"; done
[ ! -e /usr/bin/git.exe ] && [ ! -e /usr/bin/curl.exe ] && [ ! -e /usr/bin/node.exe ] && [ ! -e /usr/bin/ssh.exe ] && ok "no real git/curl/node/ssh in this root" || bad "a real network tool is in the root"
env | grep -i -E 'token|secret|cloudflare|github|gh_|anthropic|aws|password|proxy' && bad "credential-like variables present" || ok "no credential-like variable in the environment ($(env | cut -d= -f1 | tr '\n' ' '))"

sed -e 's#^HERE=/c/s/spec/explain-sandbox/prod; #HERE=$HS/prod; #' -e 's#^TTY=/dev/tty$#TTY=$HS/tty#' "$PROD" > "$T"
n=$(diff "$PROD" "$T" | grep -c '^>'); [ "$n" = 2 ] && ok "harness copy differs from production in exactly 2 lines (HERE, TTY)" || bad "harness copy differs in $n lines"
[ "$(grep -c '^TTY=' "$PROD")" = 1 ] && [ "$(grep -c 'read -r -p' "$PROD")" = 1 ] && [ "$(grep -c '<"$TTY"' "$PROD")" = 1 ] && grep -q 'read -r -p .* ans <"\$TTY"' "$PROD" && ok "production: one read, only from TTY=/dev/tty (no env/file/flag source)" || bad "prompt source"

REL=c59bae9627bb0f531641ffcd3173fb60827a76d6; OFF=9f7060d475d9ee803db5d15236eaf7b3f2678cf3; KIL=31f349d60139a9c4f7c27ba757277852674259f1
MP=e801cf290676c5fea5fec4f32b5af7676000cc76; OTHER=1111111111111111111111111111111111111111
CFGF=packages/web/wrangler.rabbit-hole-prod.jsonc; TESTF=packages/control-plane/test/rabbit-hole-prod-config.test.js
vars() { echo "{\"readable\":true,\"EXPLAIN_V2_ENABLED\":\"true\",\"EXPLAIN_PROGRAM_ENABLED\":\"$1\",\"EXPLAIN_PROGRAM_EXECUTION_KILL\":\"$2\",\"EXPLAIN_DIAGNOSTICS\":\"\",\"app_version\":\"$3\",\"app_sha12\":\"$4\",\"app_deployed_on\":\"x\",\"version_why\":null}"; }
cps() { echo "{\"readable\":true,\"cp_version\":\"$1\",\"cp_sha12\":\"$2\",\"why\":null}"; }
# sc <name> <action> <head> <cfg fixture> <main> <dev> : a fresh scenario dir with production serving main, pins filled
sc() {
  export HS=$H/runs/$1; rm -rf "$HS"; mkdir -p "$HS/prod/state"; ACT=$2
  echo "$3" > "$HS/head"; cp "$H/fix/cfg-$4" "$HS/cfg"; echo "$5" > "$HS/main"; echo "$6" > "$HS/dev"; echo "$REL" > "$HS/parent"
  printf '%s\n%s\n' "$TESTF" "$CFGF" > "$HS/diff"; echo 1 > "$HS/verify-n"; echo 1 > "$HS/fe2e-n"; : > "$HS/calls.log"
  vars "" "" v-main "${5:0:12}" > "$HS/vars"; cps c-main "${5:0:12}" > "$HS/cp"
  echo '[{"name":"EXPLAIN_JOBS","type":"durable_object_namespace"},{"name":"EXPLAIN_V2_ENABLED","type":"plain_text","text":"true"}]' > "$HS/binds"
  printf 'SHA=%s\nGATE=777\nMAIN_PREV=%s\n' "$REL" "$MP" > "$HS/prod/release.pins"
  printf 'SHA=%s\nGATE=778\nMAIN_PREV=%s\n' "$OFF" "$REL" > "$HS/prod/generation-off.pins"
  printf 'SHA=%s\nGATE=779\nMAIN_PREV=%s\n' "$KIL" "$REL" > "$HS/prod/kill.pins"
  cp "$HS/vars" "$HS/vars-after"; cp "$HS/cp" "$HS/cp-after"
}
after() { vars "$1" "$2" v-new "${3:0:12}" > "$HS/vars-after"; cps c-new "${3:0:12}" > "$HS/cp-after"; }
snap() { find "$HS/prod" -type f | sort | xargs md5sum 2>/dev/null; }
go() { OUT=$(timeout 400 bash "$T" "$@" 2>&1 </dev/null); RC=$?; echo "$OUT" > "$HS/out.txt"; }
expect() { # expect <rc> <regex in output> <label>
  if [ "$RC" = "$1" ] && printf '%s' "$OUT" | grep -q -E "$2"; then ok "$3 (rc $RC)"; else bad "$3: rc $RC, wanted $1 + /$2/; last: $(printf '%s' "$OUT" | tail -2 | tr '\n' ' ')"; fi; }
nomut() { grep -q -E 'MUTATION|FORBIDDEN|UNEXPECTED' "$HS/calls.log" && bad "$1: calls: $(grep -E 'MUTATION|FORBIDDEN|UNEXPECTED' "$HS/calls.log" | tr '\n' ';')" || ok "$1: no mutation, no forbidden or unexpected call"; }
hasmut() { grep -q -- "$1" "$HS/calls.log" && ok "mutation recorded: $1" || bad "missing mutation: $1"; }

echo "== release =="
sc r-pending release $REL release $MP $MP; printf 'SHA=%s\nGATE=PENDING\nMAIN_PREV=PENDING\n' "$REL" > "$HS/prod/release.pins"; go release --check
expect 1 'GATE in .* is .PENDING.' "PENDING pin refuses with a one-line fix"; nomut "pending"
sc r-check release $REL release $MP $MP; S0=$(snap); go release --check
expect 0 'CHECK COMPLETE: nothing was pushed or recorded' "release --check passes"; nomut "release --check"
[ "$S0" = "$(snap)" ] && [ ! -s "$HS/prod/state/prev-worker.txt" ] && ok "--check wrote no state (pins/state checksums unchanged)" || bad "--check changed files"
printf '%s' "$OUT" | grep -q 'would record the rollback point: release|' && ok "--check shows the rollback point it would record" || bad "no would-record line"
sc r-run release $REL release $MP $MP; after true false $REL; go release
expect 0 'EXPLAIN PROD release DONE' "release run completes"; hasmut "git push rabbit-hole $REL:refs/heads/dev"; hasmut "git push rabbit-hole $REL:refs/heads/main"; hasmut "MUTATION git notes"
grep -q "^release|$REL|v-main|${MP:0:12}|c-main|${MP:0:12}|" "$HS/prod/state/prev-worker.txt" && ok "rollback point recorded before the push" || bad "rollback point not recorded"
[ "$(grep -n 'MUTATION git push.*refs/heads/main' "$HS/calls.log" | cut -d: -f1)" -gt 0 ] && printf '%s' "$OUT" | grep -q 'public probes: 200 200 401 401 405' && printf '%s' "$OUT" | grep -q 'NEXT: in the signed-in app' && ok "probes, next step and rollback commands printed" || bad "missing probes/next"
: > "$HS/calls.log"; go release
expect 0 'no push \(resume\)' "rerun after success resumes without pushing"; nomut "resume"
sc r-stale release $REL release $OTHER $OTHER; go release; expect 1 'stale pin' "main moved: stale pin refuses"; nomut "stale"
sc r-gate release $REL release $MP $MP; echo failure > "$HS/run-777"; go release; expect 1 'gate 777 is not success' "failed gate refuses"; nomut "gate"
sc r-ci release $REL release $MP $MP; echo 0 > "$HS/fe2e-n"; go release; expect 1 'no successful fast-e2e run' "missing fast-e2e refuses"; nomut "fast-e2e"
sc r-dirty release $REL release $MP $MP; echo ' M x' > "$HS/status"; go release; expect 1 'uncommitted tracked changes' "dirty worktree refuses"; nomut "dirty"
sc r-outside release $REL release $MP $MP; vars "" "" v-x 222222222222 > "$HS/vars"; go release; expect 1 'deployed outside the release' "production not on main refuses"; nomut "outside"
sc r-devahead release $REL release $MP $OTHER; echo "$OTHER $REL" > "$HS/notanc"; go release; expect 1 'forward-only refuses' "dev not an ancestor refuses"; nomut "dev"
sc r-flag release $REL off $MP $MP; go release --check; expect 1 'does not set EXPLAIN_PROGRAM_ENABLED "true"' "wrong config at the candidate refuses"
sc r-readback release $REL release $MP $MP; after false false $REL; go release
expect 1 'read-back differs' "read-back mismatch stops with the rollback options"; printf '%s' "$OUT" | grep -q 'explain-prod.cmd emergency' && ok "rollback commands printed on failure" || bad "no rollback commands"
sc r-diag release $REL release $MP $MP; after true false $REL; echo '[{"name":"EXPLAIN_DIAGNOSTICS","type":"secret_text"}]' > "$HS/binds"; go release; expect 1 'read-back differs' "an EXPLAIN_DIAGNOSTICS binding of any type fails the read-back"
sc r-probe release $REL release $MP $MP; after true false $REL; touch "$HS/probe-fail"; go release; expect 1 'probes differ' "bad probes stop"
sc r-env release $REL release $MP $MP; OUT=$(BASH_ENV=/tmp/x bash "$T" release --check 2>&1); RC=$?; expect 1 'BASH_ENV or ENV is set' "BASH_ENV override refused"; nomut "bash_env"

echo "== generation-off / kill =="
sc g-check generation-off $OFF off $REL $REL; vars true false v-rel ${REL:0:12} > "$HS/vars"; cps c-rel ${REL:0:12} > "$HS/cp"; go generation-off --check
expect 0 'CHECK COMPLETE' "generation-off --check passes without a prompt"; nomut "generation-off --check"
sc g-notty generation-off $OFF off $REL $REL; vars true false v-rel ${REL:0:12} > "$HS/vars"; cps c-rel ${REL:0:12} > "$HS/cp"; go generation-off
expect 1 'no terminal' "no terminal: refuses before any push"; nomut "no tty"
sc g-wrong generation-off $OFF off $REL $REL; vars true false v-rel ${REL:0:12} > "$HS/vars"; cps c-rel ${REL:0:12} > "$HS/cp"; echo 'yes' > "$HS/tty"; go generation-off
expect 1 'not confirmed: nothing was changed' "wrong phrase refuses"; nomut "wrong phrase"
sc g-run generation-off $OFF off $REL $REL; vars true false v-rel ${REL:0:12} > "$HS/vars"; cps c-rel ${REL:0:12} > "$HS/cp"; after false false $OFF; echo 'GENERATION OFF' > "$HS/tty"; go generation-off
expect 0 'generation-off DONE: 9f7060d475d9 live, EXPLAIN_PROGRAM_ENABLED false, EXPLAIN_PROGRAM_EXECUTION_KILL false' "generation-off run, read-back ENABLED false KILL false"; hasmut "git push rabbit-hole $OFF:refs/heads/main"
[ ! -s "$HS/prod/state/prev-worker.txt" ] && ok "generation-off does not overwrite the emergency rollback point" || bad "state written"
sc g-parent generation-off $OFF off $REL $REL; echo "$OTHER" > "$HS/parent"; go generation-off --check; expect 1 'not a direct child of MAIN_PREV' "flip not a child of the released commit refuses"
sc g-wide generation-off $OFF off $REL $REL; printf 'a\nb\n' > "$HS/diff"; go generation-off --check; expect 1 'changes more than' "flip touching other files refuses"
sc k-run kill $KIL kill $REL $REL; vars true false v-rel ${REL:0:12} > "$HS/vars"; cps c-rel ${REL:0:12} > "$HS/cp"; after true true $KIL; echo 'KILL EXECUTION' > "$HS/tty"; go kill
expect 0 'kill DONE: 31f349d60139 live, EXPLAIN_PROGRAM_ENABLED true, EXPLAIN_PROGRAM_EXECUTION_KILL true' "kill run, read-back ENABLED true KILL true"
sc k-phrase kill $KIL kill $REL $REL; vars true false v-rel ${REL:0:12} > "$HS/vars"; cps c-rel ${REL:0:12} > "$HS/cp"; echo 'GENERATION OFF' > "$HS/tty"; go kill
expect 1 'not confirmed' "the other rollback's phrase does not answer kill"; nomut "kill phrase"

echo "== emergency =="
sc e-none emergency $REL release $REL $REL; go emergency; expect 1 'no rollback point is recorded' "no recorded point refuses"; nomut "no point"
mkem() { sc "$1" emergency $REL release $REL $REL; vars true false v-rel ${REL:0:12} > "$HS/vars"; cps c-rel ${REL:0:12} > "$HS/cp"
  echo "release|$REL|v-main|${MP:0:12}|c-main|${MP:0:12}|1" > "$HS/prod/state/prev-worker.txt"; vars "" "" v-main ${MP:0:12} > "$HS/vars-prev"; cps c-main ${MP:0:12} > "$HS/cp-prev"; }
mkem e-check; S0=$(snap); go emergency --check; expect 0 'CHECK COMPLETE: nothing was rolled back' "emergency --check"; nomut "emergency --check"; [ "$S0" = "$(snap)" ] && ok "emergency --check changed no file" || bad "files changed"
mkem e-wrong; echo 'ROLL BACK' > "$HS/tty"; go emergency; expect 1 'not confirmed' "emergency wrong phrase refuses"; nomut "emergency wrong"
mkem e-run; echo 'ROLL BACK WORKER' > "$HS/tty"; go emergency; expect 0 'EMERGENCY ROLLBACK DONE' "emergency rollback completes with read-back"
a=$(grep -n 'MUTATION wrangler rollback v-main' "$HS/calls.log" | cut -d: -f1); c=$(grep -n 'MUTATION wrangler rollback c-main' "$HS/calls.log" | cut -d: -f1)
[ -n "$a" ] && [ -n "$c" ] && [ "$a" -lt "$c" ] && ok "app rolled back first, then the control plane" || bad "rollback order/calls"
grep -q 'cwd .*explain-prod/packages/web' "$HS/calls.log" && grep -q 'cwd .*explain-prod/packages/control-plane' "$HS/calls.log" && ok "each rollback runs from its Worker's package" || bad "rollback cwd"
grep -q -- "--message release ${MP:0:12} (emergency" "$HS/calls.log" && ok "rollback message names 'release <sha12>' (the next release sees a named pair)" || bad "message"
: > "$HS/calls.log"; go emergency; expect 0 'nothing to roll back \(resume\)' "emergency rerun resumes"; nomut "emergency resume"
# fix forward after an emergency: production serves the recorded pre-release pair, main is still the release
sc g-after generation-off $OFF off $REL $REL; vars "" "" v-main ${MP:0:12} > "$HS/vars"; cps c-main ${MP:0:12} > "$HS/cp"; echo "release|$REL|v-main|${MP:0:12}|c-main|${MP:0:12}|1" > "$HS/prod/state/prev-worker.txt"; go generation-off --check
expect 0 'emergency-rollback pair' "generation-off after an emergency rollback is allowed (fix forward)"

echo "== prompt cannot be answered by stdin, env or flag =="
sc p-stdin generation-off $OFF off $REL $REL; vars true false v-rel ${REL:0:12} > "$HS/vars"; cps c-rel ${REL:0:12} > "$HS/cp"
OUT=$(echo 'GENERATION OFF' | CONFIRM='GENERATION OFF' EXPLAIN_PROD_CONFIRM='GENERATION OFF' PHRASE='GENERATION OFF' timeout 400 bash "$T" generation-off --yes 2>&1); RC=$?
expect 2 'usage' "an extra flag is rejected"
OUT=$(echo 'GENERATION OFF' | CONFIRM='GENERATION OFF' EXPLAIN_PROD_CONFIRM='GENERATION OFF' TTY=/dev/stdin timeout 400 bash "$T" generation-off 2>&1); RC=$?
expect 1 'no terminal' "piped stdin and env variables do not answer the prompt (TTY is assigned in the script)"; nomut "stdin/env"

echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" = 0 ]
