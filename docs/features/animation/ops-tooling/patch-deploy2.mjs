// One-off patch of deploy-preview-release.sh: --ci-pending (skips ONLY the verify/fast-e2e success guard) and --check-only (guards only, no build, no deploy).
import fs from 'node:fs';
const f = 'C:/s/spec/animation/release/deploy-preview-release.sh';
let d = fs.readFileSync(f, 'utf8');
const rep = (a, b) => { if (d.split(a).length !== 2) throw new Error(`anchor: ${a.slice(0, 60)}`); d = d.replace(a, () => b); };

rep('# Never the shared worker, never production. Usage: bash deploy-preview-release.sh <A: 40-hex sha>\n',
`# Never the shared worker, never production. Usage: bash deploy-preview-release.sh <A: 40-hex sha> [--ci-pending] [--check-only]
#   --ci-pending  skips ONLY the "verify and fast-e2e completed success" guard (owner order, 3 November 2026 evening: the isolated dev-clone preview of the
#                 final ladder tree is deployed right after the push, before CI is green, and the gates start on it). It prints "CI PENDING: gates stand only
#                 if CI is green on this SHA". Every other guard stays (HEAD is the SHA on the named branch, clean tree, pushed, SHA tag and message, read-back,
#                 post-deploy checks). The worker name is fixed below and re-asserted: never use this flag for any other worker.
#   --check-only  runs every guard, prints what it would do, builds and deploys nothing.
`);
rep('A=${1:?usage: deploy-preview-release.sh <A sha>}\n',
`A=${1:?usage: deploy-preview-release.sh <A sha> [--ci-pending] [--check-only]}
CI_PENDING=0; CHECK_ONLY=0
for flag in "\${@:2}"; do case "$flag" in --ci-pending) CI_PENDING=1;; --check-only) CHECK_ONLY=1;; *) echo "RESULT FAIL unknown argument $flag"; exit 2;; esac; done
`);
rep('NAME=rabbit-hole-web-dev-animation\n', 'NAME=rabbit-hole-web-dev-animation\n[ "$NAME" = rabbit-hole-web-dev-animation ] || { echo "RESULT FAIL the preview worker is fixed to rabbit-hole-web-dev-animation"; exit 2; }\n');
rep(`for w in verify fast-e2e; do
  c=$(gh run list -R $REPO --commit "$A" --workflow $w.yml --limit 1 --json status,conclusion,databaseId --jq '.[0]|"\\(.databaseId) \\(.status) \\(.conclusion)"')
  echo "$w newest run of A: $c"
  case "$c" in *" completed success") ;; *) echo "RESULT FAIL $w is not a completed success on $A"; exit 2;; esac
done
`,
`for w in verify fast-e2e; do
  c=$(gh run list -R $REPO --commit "$A" --workflow $w.yml --limit 1 --json status,conclusion,databaseId --jq '.[0]|"\\(.databaseId) \\(.status) \\(.conclusion)"')
  echo "$w newest run of A: $c"
  if [ $CI_PENDING = 1 ]; then continue; fi
  case "$c" in *" completed success") ;; *) echo "RESULT FAIL $w is not a completed success on $A"; exit 2;; esac
done
if [ $CI_PENDING = 1 ]; then echo "CI PENDING: gates stand only if CI is green on this SHA ($A)"; fi
if [ $CHECK_ONLY = 1 ]; then echo "GUARDS OK (check only): would build, deploy $NAME with --tag \${A:0:12} --message $A, read back, and run the post-deploy checks$( [ $CI_PENDING = 1 ] && echo ' [CI PENDING]' )"; exit 0; fi
`);
rep('echo "RESULT OK https://$NAME.tryrabbithole.workers.dev at $A"', 'echo "RESULT OK https://$NAME.tryrabbithole.workers.dev at $A$( [ $CI_PENDING = 1 ] && echo \' (CI PENDING: gates stand only if CI is green on this SHA)\' )"');
fs.writeFileSync(f, d);
console.log('patched');
