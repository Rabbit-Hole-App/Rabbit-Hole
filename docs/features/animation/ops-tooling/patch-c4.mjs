// Patch build-c4.sh: step 1 may be a named ref (--first <ref>) instead of main, expected tips (C4_EXPECT="ref=sha ..." : the tip must contain sha),
// and a printed table of the SHAs merged. Also adds the shared tool-input tests to the focused smoke (ladder-smoke.sh).
import fs from 'node:fs';
const dir = 'C:/s/spec/animation/release/';
const rep = (t, a, b) => { if (t.split(a).length !== 2) throw new Error(`anchor: ${a.slice(0, 70)}`); return t.replace(a, () => b); };

let b = fs.readFileSync(`${dir}build-c4.sh`, 'utf8');
b = rep(b, 'WITH_MAIN=0; for a in "$@"; do [ "$a" = --with-main ] && WITH_MAIN=1; done',
`WITH_MAIN=0; FIRST=""; args=("$@")
for ((k=0; k<\${#args[@]}; k++)); do
  [ "\${args[$k]}" = --with-main ] && WITH_MAIN=1
  [ "\${args[$k]}" = --first ] && FIRST=\${args[$((k+1))]}   # step 1 is this ref instead of main (e.g. feat/mvp-fast-path, the --mvp candidate)
done
EXPECT=\${C4_EXPECT:-}   # "ref=sha ref=sha": the ref's tip must contain sha (equal or a descendant), else the build stops`);
b = rep(b, 'steps=(); [ $WITH_MAIN = 1 ] && steps+=("main")', 'steps=(); [ $WITH_MAIN = 1 ] && steps+=("main"); [ -n "$FIRST" ] && steps+=("$FIRST")');
b = rep(b, '    sha=$(git rev-parse --verify -q "refs/remotes/rabbit-hole/$ref^{commit}") || die "step $n: rabbit-hole/$ref does not exist yet (the lane has not pushed it)"\n',
`    sha=$(git rev-parse --verify -q "refs/remotes/rabbit-hole/$ref^{commit}") || die "step $n: rabbit-hole/$ref does not exist yet (the lane has not pushed it)"
    for pair in $EXPECT; do
      if [ "\${pair%%=*}" = "$ref" ]; then
        want=\${pair#*=}; wfull=$(git rev-parse --verify -q "$want^{commit}") || die "step $n $ref: expected commit $want is not in this clone"
        git merge-base --is-ancestor "$wfull" "$sha" || die "step $n $ref: the tip \${sha:0:9} does not contain the expected $want"
      fi
    done
`);
fs.writeFileSync(`${dir}build-c4.sh`, b);

let s = fs.readFileSync(`${dir}ladder-smoke.sh`, 'utf8');
s = rep(s, 'step web-animation3d bash -c',
`# Everything else in control-plane that goes through the shared tool-input module (normalizeToolInput) or names it: explain, tutor, journey and the rest.
for f in $(grep -l -E 'normalizeToolInput|tool-input' packages/control-plane/test/*.test.js | grep -v '/animation' | sort); do step "cp-ti-$(basename $f .test.js)" bash -c "cd packages/control-plane && node --test test/$(basename $f)"; done
step web-animation3d bash -c`);
fs.writeFileSync(`${dir}ladder-smoke.sh`, s);
console.log('patched');
