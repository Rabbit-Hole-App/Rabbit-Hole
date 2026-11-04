#!/usr/bin/env bash
# Offline harness for cut-recovery.sh: real git and node against a throwaway repository that holds the REAL paths the shipped recipes touch
# (synthetic contents), and a LOCAL bare repository standing in for the rabbit-hole remote. No credential, no network, no production.
# The shipped recovery-recipes.json is used unmodified (with --no-verify, since the synthetic tree has no test suites); recipes with
# verify sets and with deliberate faults are separate temp files.
# Usage: bash scripts/animation/cut-recovery.test.sh
set -uo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
export HOME="$T/home" GIT_CONFIG_NOSYSTEM=1; mkdir -p "$HOME"
pass=0; fail=0
ok()  { pass=$((pass+1)); echo "  PASS $1"; }
bad() { fail=$((fail+1)); echo "  FAIL $1"; }
W="$T/w"; R="$T/remote.git"
git init -q -b main "$W" && git init -q --bare -b main "$R"
cd "$W"; git config user.name harness; git config user.email harness@example.test; git remote add rabbit-hole "$R"
F=packages/web/src/animation3d/capabilities.js; CT=packages/web/src/animation3d/client.test.mjs; OC=packages/control-plane/test/animation-old-client.test.js
PA=packages/control-plane/src/agents/animation-author.js; PB=packages/control-plane/src/agents/animation-brief.js; FIT=packages/control-plane/test/animation-fit.test.js
UI=packages/web/src/Animation3DCard.jsx; E2E=packages/web/e2e/animation-mvp-check.mjs
BR=packages/control-plane/src/animation-brief.js; CF=packages/control-plane/test/animation-client-features.test.js
WR=packages/web/wrangler.rabbit-hole-prod.jsonc; PC=packages/control-plane/test/rabbit-hole-prod-config.test.js
UN=packages/web/src/unrelated.js
w() { mkdir -p "$(dirname "$1")"; printf '%s\n' "$2" > "$1"; }
# ---- previous release (PREV) ----
w $F "export const ANIMATION_CLIENT_FEATURES = Object.freeze(['curve_radius', 'action_motion']);"
w $CT "assert.deepEqual(ANIMATION_CLIENT_FEATURES, ['curve_radius', 'action_motion']);"
w $OC "assert.deepEqual(ANIMATION_CLIENT_FEATURES, ['curve_radius', 'action_motion']);"
w $PA "export const ANIMATION_AUTHOR_SYSTEM = 'prompt v1';"
w $PB "export const ANIMATION_BRIEF_SYSTEM = 'planner v1';"
w $FIT "// pins prompt v1"
w $UI "const copy = 'Works best for mechanisms, loops and small games; loss surfaces and optimizers are not supported yet.';"
w $E2E "// copy step: loss surfaces and optimizers are not supported yet"
w $BR "export const clientFeatures = value => (Array.isArray(value) ? ANIMATION_CLIENT_FEATURES.filter(f => value.includes(f)) : []);"
w $WR '{ "vars": {
    "ANIMATION_ENABLED": "true",
    "ANIMATION_EXECUTION_KILL": "false",
    "IMAGE_GENERATE_ENABLED": "true" } }'
w $PC "assert.deepEqual(Object.keys(app.vars).filter(k => k.startsWith('ANIMATION_')).sort(), ['ANIMATION_ENABLED', 'ANIMATION_EXECUTION_KILL'], 'no ANIMATION_DIAGNOSTICS or other Animation var');"
# the REAL checkCandidate, extracted from this repository's scripts/prod-release.mjs, stands in for the tree's own release check
mkdir -p scripts; { echo "// extracted from the real scripts/prod-release.mjs"; sed -n '/^export function checkCandidate/,/^}/p' "$HERE/../prod-release.mjs"; } > scripts/prod-release.mjs
grep -q "stored scenes that use it would stop opening" scripts/prod-release.mjs || { echo "could not extract checkCandidate"; exit 2; }
w $UN "export const a = 1;"
w packages/web/src/same.js "export const s = 1;"
git add -A && git commit -q -m prev && PREV=$(git rev-parse HEAD)
git push -q rabbit-hole main
# ---- MID: the Gate 1 tested C3 (MVP2b + MVP3 content), whose prompts the combined recovery wants back ----
w $PA "export const ANIMATION_AUTHOR_SYSTEM = 'prompt v1.5';"
w $FIT "// pins prompt v1.5"
git add -A && git commit -q -m mid && MID=$(git rev-parse HEAD)
# ---- the candidate (CAND): every slice's change, plus an unrelated one ----
w $F "export const ANIMATION_CLIENT_FEATURES = Object.freeze(['curve_radius', 'action_motion', 'surface_grid', 'trail_points', 'text_readout', 'arrow_anchor', 'clamp']);"
w $CT "assert.deepEqual(ANIMATION_CLIENT_FEATURES, ['curve_radius', 'action_motion', 'surface_grid']);"
w $OC "assert.deepEqual(ANIMATION_CLIENT_FEATURES.length, 7);
  assert.equal(surfaceCapability({ features: ['curve_radius', 'surface_grid'] }).surfaces, SURFACES.surface, 'AN-20: a browser that draws a surface is told so, whatever else it declares');
assert.ok(true);"
w $PA "export const ANIMATION_AUTHOR_SYSTEM = 'prompt v2'; export const ARCHETYPES = {};"
w $PB "export const ANIMATION_BRIEF_SYSTEM = 'planner v2';"
w $FIT "// pins prompt v2"
w $UI "const copy = 'Works best for mechanisms, loops, small games and loss surfaces.';"
w $E2E "// copy step: loss surfaces are claimed"
w $CF "// pins ANIMATION_CLIENT_FEATURES: the server keeps the five it knows"
w $UN "export const a = 2; // unrelated change in the candidate"
git add -A && git commit -q -m cand && CAND=$(git rev-parse HEAD)
START=$(git rev-parse --abbrev-ref HEAD)
CUT() { OUT=$(bash "$HERE/cut-recovery.sh" "$@" 2>&1); RC=$?; }
tip() { git rev-parse "$1" 2>/dev/null; }
files() { git diff --name-only "$CAND" "$1" | sort | tr '\n' ' '; }
has() { printf '%s' "$OUT" | grep -qF -- "$1"; }
back() { [ "$(git rev-parse --abbrev-ref HEAD)" = "$START" ] && [ -z "$(git status --porcelain --untracked-files=no)" ]; }

echo "== each slice with the shipped recipes"
CUT mvp3 $CAND --prev $PREV --no-verify
B=recovery/animation-mvp3-${CAND:0:8}
[ $RC -eq 0 ] && has "RECOVERY READY (mvp3)" && ok "mvp3 cut" || { bad "mvp3 cut (rc=$RC)"; echo "$OUT" | tail -5; }
[ "$(files $B)" = "$(printf '%s\n' $BR $CF $OC | sort | tr '\n' ' ')" ] && ok "mvp3 diff is exactly animation-brief.js, the test file the candidate added for the five and the one assertion line that pins them" || bad "mvp3 diff: $(files $B)"
git show $B:$BR | grep -q "value.includes(f) && !\['surface_grid', 'trail_points', 'text_readout', 'arrow_anchor', 'clamp'\].includes(f)" && ok "mvp3: the server filters the five out of any declared list" || bad "mvp3 filter"
[ "$(git show $B:$F)" = "$(git show $CAND:$F)" ] && git show $B:$F | grep -q surface_grid && ok "mvp3: capabilities.js is untouched, the browser still declares all seven (checkCandidate keeps passing)" || bad "mvp3 registry touched"
git show $B:$OC | grep -q "length, 7" && ! git show $B:$OC | grep -q "AN-20" && ok "mvp3: a test the candidate only modified keeps its text except the one assertion that pins the five (the optional replace step)" || bad "modified test"
has "checkCandidate accepts" && ok "mvp3: the real checkCandidate accepts the recovery tip over the served candidate" || bad "release check line"
git merge-base --is-ancestor $CAND $B && [ "$(tip $B)" != "$CAND" ] && ok "mvp3: strict descendant of the candidate" || bad "mvp3 ancestry"
[ "$(git show $B:$UN)" = "$(git show $CAND:$UN)" ] && ok "mvp3: the unrelated change in the candidate is untouched" || bad "unrelated"
git ls-remote --heads rabbit-hole "$B" | grep -q . && bad "mvp3: pushed without --push" || ok "mvp3: nothing pushed by default"
! git log -1 --format=%B $B | grep -qi 'co-authored\|claude' && ok "mvp3: plain commit message, no trailer" || bad "trailer"
back && ok "mvp3: back on the starting branch, tree clean" || bad "not back"

CUT mvp4 $CAND --prev $PREV --no-verify; B4=recovery/animation-mvp4-${CAND:0:8}
[ $RC -eq 0 ] && [ "$(files $B4)" = "$(printf '%s\n' $PA $PB $FIT | sort | tr '\n' ' ')" ] && git show $B4:$PA | grep -q "prompt v1" && ok "mvp4: exactly the two prompt files and the fit test, back to PREV" || { bad "mvp4 ($RC) $(files $B4)"; echo "$OUT" | tail -3; }
CUT mvp5 $CAND --prev $PREV --no-verify; B5=recovery/animation-mvp5-${CAND:0:8}
[ $RC -eq 0 ] && [ "$(files $B5)" = "$(printf '%s\n' $UI $E2E | sort | tr '\n' ' ')" ] && git show $B5:$UI | grep -q "not supported yet" && ok "mvp5: the copy line is back in the card and the e2e step" || { bad "mvp5 ($RC) $(files $B5)"; echo "$OUT" | tail -3; }
CUT mvp2b $CAND --prev $PREV --no-verify; B2=recovery/animation-mvp2b-${CAND:0:8}
[ $RC -eq 0 ] && [ "$(files $B2)" = "$(printf '%s\n' $WR $PC | sort | tr '\n' ' ')" ] && git show $B2:$WR | grep -q '"ANIMATION_STREAMING": "false"' && git show $B2:$PC | grep -q "'ANIMATION_STREAMING'\]" && ok "mvp2b: ANIMATION_STREAMING false added to the production vars and to the config test, nothing else" || { bad "mvp2b ($RC) $(files $B2)"; echo "$OUT" | tail -3; }
back && ok "back on the starting branch after four cuts" || bad "not back after four cuts"

echo "== default previous release, idempotence and push"
git branch -q -D $B4; git fetch -q rabbit-hole
CUT mvp4 $CAND --no-verify
[ $RC -eq 0 ] && has "previous release ${PREV:0:12}" && ok "the default --prev is the merge-base with rabbit-hole/main" || { bad "default prev (rc=$RC)"; echo "$OUT" | tail -3; }
T0=$(tip $B4); CUT mvp4 $CAND --no-verify
[ $RC -eq 0 ] && has "re-checking it, not resetting it" && [ "$(tip $B4)" = "$T0" ] && ok "an existing branch is re-checked, never reset" || bad "rerun"
CUT mvp4 $CAND --no-verify --push
[ $RC -eq 0 ] && [ "$(git ls-remote --heads rabbit-hole $B4 | cut -f1)" = "$(tip $B4)" ] && has "pushed: yes, to rabbit-hole" && ok "--push publishes the branch" || { bad "push (rc=$RC)"; echo "$OUT" | tail -3; }
CUT mvp4 $CAND --no-verify --push
[ $RC -eq 0 ] && has "pushed: already on rabbit-hole" && ok "a second --push is a no-op" || bad "second push"
[ "$(git ls-remote --heads rabbit-hole main | cut -f1)" = "$PREV" ] && ok "main on the remote never moved" || bad "main moved"
! grep -nE 'push[^#]*(--force|--force-with-lease| -f |\+refs| \+)' "$HERE/cut-recovery.sh" | grep -q . && ok "the script contains no forcing push" || bad "force found in script"

echo "== refusals"
refuse() { # <label> <substring> <args...>
  local label=$1 sub=$2; shift 2; CUT "$@"
  if [ $RC -ne 0 ] && has "$sub"; then ok "$label"; else bad "$label (rc=$RC; wanted: $sub)"; printf '%s\n' "$OUT" | tail -2; fi
}
refuse "force is refused" "refused: this script never forces" mvp3 $CAND --force
refuse "-f is refused" "refused: this script never forces" mvp3 $CAND -f
refuse "a short sha" "full 40-character" mvp3 abc123
refuse "an unknown slice" "no recipe for 'mvp9'" mvp9 $CAND
refuse "a branch outside recovery/animation-" "must be recovery/animation-" mvp3 $CAND --branch main
refuse "prev equal to the candidate" "nothing to recover to" mvp3 $CAND --prev $CAND
refuse "a commit that is not here" "is not a commit" mvp3 0000000000000000000000000000000000000001
echo dirty >> $UN; refuse "tracked changes" "tracked changes" mvp3 $CAND --prev $PREV; git checkout -q -- $UN
# a branch that does not contain the candidate, and one with a file outside the allow list
git branch -q recovery/animation-wrong $PREV; refuse "an existing branch without the candidate is refused" "does not contain the candidate" mvp3 $CAND --prev $PREV --branch recovery/animation-wrong --no-verify
git switch -q -c recovery/animation-extra $B; echo x > intruder.txt; git add intruder.txt; git commit -q -m extra; git switch -q $START
refuse "an existing branch that touches a file outside the allow list" "outside the mvp3 allow list" mvp3 $CAND --prev $PREV --branch recovery/animation-extra --no-verify
SIDE=$(git commit-tree "$CAND^{tree}" -p "$PREV" -m side); git push -q rabbit-hole $SIDE:refs/heads/recovery/animation-mvp3-other
refuse "a diverged remote branch is refused, not overwritten" "not an ancestor of the local branch" mvp3 $CAND --prev $PREV --no-verify --push --branch recovery/animation-mvp3-other
back && ok "still back on the starting branch" || bad "not back after refusals"


echo "== combined (one release carries all four slices)"
git branch -q -D recovery/animation-combined-${CAND:0:8} 2>/dev/null
CUT combined $CAND --prev $PREV --prompts-from $MID --no-verify; BC=recovery/animation-combined-${CAND:0:8}
[ $RC -eq 0 ] && [ "$(files $BC)" = "$(printf '%s\n' $BR $CF $OC $FIT $PA $PB $PC $UI $WR $E2E | sort | tr '\n' ' ')" ] && ok "combined: one branch, exactly the union of the four slices' files" || { bad "combined ($RC) $(files $BC)"; echo "$OUT" | tail -3; }
git show $BC:$PA | grep -q "prompt v1.5" && ! git show $BC:$PA | grep -q "ARCHETYPES" && ok "combined: the prompts come back from --prompts-from (the tested C3), not from the previous release" || bad "combined prompts"
git show $BC:$WR | grep -q '"ANIMATION_STREAMING": "false"' && git show $BC:$BR | grep -q "arrow_anchor" && git show $BC:$UI | grep -q "not supported yet" && ok "combined: streaming flag, five-feature filter and copy line are all in" || bad "combined switches"
[ "$(git show $BC:$F)" = "$(git show $CAND:$F)" ] && has "checkCandidate accepts" && ok "combined: capabilities.js untouched and the real checkCandidate accepts the tip" || bad "combined release check"
git merge-base --is-ancestor $CAND $BC && [ "$(tip $BC)" != "$CAND" ] && back && ok "combined: strict descendant, checkout restored" || bad "combined ancestry"
git branch -q -D $BC
refuse "--prompts-from the candidate itself" "must be an earlier commit of the candidate" combined $CAND --prev $PREV --prompts-from $CAND --no-verify
refuse "--prompts-from something that is not a commit" "is not a commit" combined $CAND --prev $PREV --prompts-from 0000000000000000000000000000000000000002 --no-verify
CUT combined $CAND --prev $PREV --no-verify
[ $RC -eq 0 ] && git show recovery/animation-combined-${CAND:0:8}:$PA | grep -q "prompt v1'" && ok "combined without --prompts-from restores the prompts from the previous release" || { bad "combined default prompts ($RC)"; echo "$OUT" | tail -3; }
git branch -q -D recovery/animation-combined-${CAND:0:8}
echo "== recipe faults and the verify step"
cp "$HERE/recovery-recipes.json" "$T/r.json"
node -e '
const fs=require("fs"),r=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
r.twice={...r.mvp3,steps:[{op:"replace",file:"packages/web/src/animation3d/capabilities.js",pattern:"curve_radius|action_motion",with:"x"}]};
r.moved={...r.mvp3,steps:[{op:"replace",file:"packages/web/src/animation3d/capabilities.js",pattern:"NO_SUCH_CONSTANT",with:"x"}]};
r.nothing={...r.mvp3,steps:[{op:"restore",paths:["packages/web/src/same.js"]}],allow:["packages/web/src/same.js"]};
r.nopath={...r.mvp3,steps:[{op:"restore",paths:["no/such/file.js"]}]};
r.outside={...r.mvp3,steps:[{op:"restore",paths:["packages/web/src/unrelated.js"]}],allow:["packages/web/src/animation3d/*"]};
r.naive={...r.mvp3,steps:[{op:"replace",file:"packages/web/src/animation3d/capabilities.js",pattern:"Object[.]freeze[(].*[)]",with:"Object.freeze(['curve_radius', 'action_motion'])"}],allow:["packages/web/src/animation3d/capabilities.js"],verify:[]};
r.good={...r.mvp4,verify:[{cwd:".",files:["v/pass.test.mjs"]}]};
r.failing={...r.mvp4,verify:[{cwd:".",files:["v/fail.test.mjs"]}]};
fs.writeFileSync(process.argv[1],JSON.stringify(r));' "$T/r.json"
for s in twice moved nothing nopath outside naive; do
  case $s in twice) sub="matches 2 time(s)";; moved) sub="matches 0 time(s)";; nothing) sub="the recipe changes nothing";; nopath) sub="in neither the previous release nor the candidate";; outside) sub="outside the outside allow list";; naive) sub="checkCandidate would REFUSE this recovery: refused: production serves";; esac
  CUT $s $CAND --prev $PREV --recipes "$T/r.json" --no-verify
  if [ $RC -ne 0 ] && has "$sub" && ! git rev-parse -q --verify refs/heads/recovery/animation-$s-${CAND:0:8} >/dev/null && back; then ok "recipe fault '$s' stops, leaves no branch, restores the checkout"; else bad "recipe fault $s (rc=$RC)"; printf '%s\n' "$OUT" | tail -2; fi
done
mkdir -p v; printf "import test from 'node:test'; test('p', () => {});\n" > v/pass.test.mjs; printf "import test from 'node:test'; import assert from 'node:assert/strict'; test('f', () => assert.equal(1, 2));\n" > v/fail.test.mjs
git add v; git commit -q -m tests; CAND2=$(git rev-parse HEAD)
git branch -q -D $B5
CUT mvp5 $CAND2 --prev $CAND --no-verify
[ $RC -ne 0 ] && has "no changed file under" && ! git rev-parse -q --verify refs/heads/recovery/animation-mvp5-${CAND2:0:8} >/dev/null && back && ok "mvp5 with a prev that lacks the copy line stops, leaves no branch, restores the checkout" || { bad "mvp5 wrong prev (rc=$RC)"; echo "$OUT" | tail -3; }
CUT good $CAND2 --prev $PREV --recipes "$T/r.json" --branch recovery/animation-good
[ $RC -eq 0 ] && has "verified 1 tests" && has "recipe tests: passed" && ok "the recipe's tests run on the recovery branch and pass" || { bad "verify pass (rc=$RC)"; printf '%s\n' "$OUT" | tail -4; }
CUT failing $CAND2 --prev $PREV --recipes "$T/r.json" --branch recovery/animation-failing
[ $RC -ne 0 ] && has "the recipe's tests fail on the recovery branch" && ! git rev-parse -q --verify refs/heads/recovery/animation-failing >/dev/null && back && ok "a failing recipe test removes the branch" || { bad "verify fail (rc=$RC)"; printf '%s\n' "$OUT" | tail -4; }

echo; echo "cut-recovery harness: $pass passed, $fail failed"
[ $fail -eq 0 ]
