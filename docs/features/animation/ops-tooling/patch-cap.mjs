// deploy-preview-release.sh: --platform-day-usd N (owner decision 4 Nov 2026: 100 on the dev clone only) and a read-back of that variable;
// preview-readback.mjs: --var NAME prints the plain-text binding of the worker (never a secret's value).
import fs from 'node:fs';
const dir = 'C:/s/spec/animation/release/';
const rep = (t, a, b) => { if (t.split(a).length !== 2) throw new Error(`anchor: ${a.slice(0, 80)}`); return t.replace(a, () => b); };

let d = fs.readFileSync(`${dir}deploy-preview-release.sh`, 'utf8');
d = rep(d, 'A=${1:?usage: deploy-preview-release.sh <A sha> [--ci-pending] [--check-only]}\nCI_PENDING=0; CHECK_ONLY=0\nfor flag in "${@:2}"; do\n  case "$flag" in --ci-pending) CI_PENDING=1;; --check-only) CHECK_ONLY=1;; *) echo "RESULT FAIL unknown argument $flag"; exit 2;; esac\ndone',
`A=\${1:?usage: deploy-preview-release.sh <A sha> [--ci-pending] [--check-only] [--platform-day-usd N]}
CI_PENDING=0; CHECK_ONLY=0; CAP=40
shift
while [ $# -gt 0 ]; do
  case "$1" in
    --ci-pending) CI_PENDING=1;;
    --check-only) CHECK_ONLY=1;;
    --platform-day-usd) shift; CAP=\${1:-}; [[ "$CAP" =~ ^[0-9]+$ ]] && [ "$CAP" -ge 1 ] && [ "$CAP" -le 100 ] || { echo "RESULT FAIL --platform-day-usd needs an integer from 1 to 100 (owner decision 4 Nov 2026: 100 on the clone)"; exit 2; };;
    *) echo "RESULT FAIL unknown argument $1"; exit 2;;
  esac
  shift
done`);
d = rep(d, '#   --check-only  runs every guard, prints what it would do, builds and deploys nothing.',
`#   --check-only  runs every guard, prints what it would do, builds and deploys nothing.
#   --platform-day-usd N  USAGE_PLATFORM_DAY_USD for the CLONE ONLY (default 40; at most 100; owner decision 4 November 2026: 100, because the rolling 24 h
#                 platform cap is shared by every lane and refused Gate 2 jobs). Passed as --var to this clone's deploy and read back from Cloudflare (settings
#                 bindings, plain text only). The worker name is asserted above: the option cannot reach any other worker, and no other variable changes.`);
d = rep(d, 'AN_VARS="--var ANIMATION_ENABLED:true --var ANIMATION_DIAGNOSTICS:true --var USAGE_PLATFORM_DAY_USD:40"',
  'AN_VARS="--var ANIMATION_ENABLED:true --var ANIMATION_DIAGNOSTICS:true --var USAGE_PLATFORM_DAY_USD:$CAP"');
d = rep(d, 'echo "== $(date -Iseconds) deploy $NAME of $A',
  'if [ "$CAP" != 40 ]; then echo "PLATFORM DAY CAP RAISED to $CAP on the clone by owner decision (4 Nov 2026)"; fi\necho "== $(date -Iseconds) deploy $NAME of $A');
d = rep(d, 'node C:/s/spec/animation/release/preview-readback.mjs "$NAME" "$A" || echo',
  'node C:/s/spec/animation/release/preview-readback.mjs "$NAME" "$A" --var USAGE_PLATFORM_DAY_USD || echo');
fs.writeFileSync(`${dir}deploy-preview-release.sh`, d);

let r = fs.readFileSync(`${dir}preview-readback.mjs`, 'utf8');
r = rep(r, 'const [name, want] = process.argv.slice(2);', "const [name, want, ...rest] = process.argv.slice(2);\nconst varName = rest[0] === '--var' ? rest[1] : null;");
r = rep(r, '  process.exitCode = ok ? 0 : 1;', `  if (varName) {
    // The worker's plain-text binding (GET settings); a secret binding prints its type only, never a value.
    const binding = (await get('settings')).bindings?.find(b => b.name === varName);
    console.log(binding ? \`READBACK VAR \${varName}=\${binding.type === 'plain_text' ? binding.text : \`(\${binding.type}, value not read)\`}\` : \`READBACK VAR \${varName} is not set\`);
  }
  process.exitCode = ok ? 0 : 1;`);
fs.writeFileSync(`${dir}preview-readback.mjs`, r);
console.log('patched');
