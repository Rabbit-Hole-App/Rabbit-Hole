#!/usr/bin/env bash
# Release 131 gate: CI-style checks of one exact commit in a CLEAN checkout (git worktree --detach, a real `npm ci`), as one repeatable run.
#   bash scripts/release/gate-interact-131.sh <sha> [--steps install,selection,suites,builds,devdry,prod,prodsize] [--suites web,control-plane,...] [--base <main sha>] [--keep]
# Writes C:/s/gate131/<sha7>/gate.log (every step with its duration and exit code), one log per step, bundle sizes, and ends with a RESULT line.
# Never deploys, never pushes, no browser (fast-e2e is only SELECTED here, never run), no model call. Credentials: CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID are read BY NAME
# from small-deploy/.env for the wrangler dry-runs only and never printed. A failing step does not stop the run: every red line is found in one pass.
# The checkout is removed at the end (disk), the logs stay. Same commands as .github/workflows/verify.yml (verify build, run.sh test:unit) and scripts/prod-release.mjs
# (production build with BUILD_ENV, e2e/production-bundle-check.mjs, wrangler --dry-run --outdir for both Workers).
set -u
SHA="${1:?usage: gate-interact-131.sh <sha> [--steps ...] [--suites ...] [--base <sha>] [--keep]}"; shift
STEPS="install,selection,suites,builds,devdry,prod,prodsize"; SUITES="web,control-plane,scripts,ci,evals,viz,motion,render,file-convert,python"; BASE=""; KEEP=0
while [ $# -gt 0 ]; do case "$1" in --steps) STEPS="$2"; shift 2;; --suites) SUITES="$2"; shift 2;; --base) BASE="$2"; shift 2;; --keep) KEEP=1; shift;; *) echo "unknown flag $1" >&2; exit 2;; esac; done
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
S7="${SHA:0:7}"; OUT="C:/s/gate131/$S7"; DIR="C:/s/r131-$S7"; ENVFILE="C:/Users/cyudhist/Desktop/workspace/small-deploy/.env"
mkdir -p "$OUT"; LOG="$OUT/gate.log"; : > "$LOG"; FAILS=()
say() { echo "$*" | tee -a "$LOG"; }
has() { case ",$STEPS," in *",$1,"*) return 0;; *) return 1;; esac; }
secret() { grep -m1 "^$1=" "$ENVFILE" | cut -d= -f2- | tr -d '\r"' ; }   # value goes to a child process environment only, never echoed
step() { # step <name> <cmd...> : runs in the checkout, logs, never aborts the gate
  local name="$1"; shift; local t0=$SECONDS; say "== $name: start"
  ( cd "$DIR" && "$@" ) > "$OUT/$name.log" 2>&1; local rc=$?; local d=$((SECONDS - t0))
  if [ $rc -eq 0 ]; then say "== $name: PASS (${d}s)"; else say "== $name: FAIL rc=$rc (${d}s) first error: $(grep -m1 -E '✖|Error|error|FAIL|not ok' "$OUT/$name.log" | cut -c1-220)"; FAILS+=("$name"); fi
  return 0
}
cleanup() { if [ $KEEP -eq 0 ] && [ -d "$DIR" ]; then
    for j in "$DIR/node_modules" "$DIR/packages/web/node_modules" "$DIR/packages/control-plane/node_modules"; do [ -L "$j" ] && cmd //c rmdir "$(cygpath -w "$j")" > /dev/null 2>&1; done
    git -C "$REPO" worktree remove --force "$DIR" > /dev/null 2>&1 || rm -rf "$DIR"; say "checkout removed: $DIR"; fi; }
trap cleanup EXIT

say "gate $SHA $(date '+%F %T')"; git -C "$REPO" cat-file -e "$SHA^{commit}" 2>/dev/null || { say "RESULT FAILED: $SHA is not a commit in this repository (fetch it first)"; exit 2; }
[ -d "$DIR" ] && git -C "$REPO" worktree remove --force "$DIR" > /dev/null 2>&1
git -C "$REPO" worktree add --detach "$DIR" "$SHA" > "$OUT/checkout.log" 2>&1 || { say "RESULT FAILED: checkout"; exit 2; }
say "clean checkout $DIR @ $(git -C "$DIR" rev-parse --short HEAD)"
if [ -z "$BASE" ]; then git -C "$REPO" fetch -q rabbit-hole refs/heads/main > /dev/null 2>&1; BASE="$(git -C "$REPO" merge-base "$SHA" FETCH_HEAD 2> /dev/null)"; fi; say "diff base (merge-base with main): ${BASE:-unknown}"

if has install; then
  step lock-natives node scripts/lock-natives.mjs --check
  step npm-ci npm ci --no-audit --no-fund
  step ensure-natives node scripts/ensure-natives.mjs
fi

if has selection; then # what verify and fast-e2e would plan for this diff (no browser run): changed paths against the merge-base with main, the same functions the workflows call
  step selection node --input-type=module -e "
    import { execFileSync } from 'node:child_process'; import { readFileSync } from 'node:fs';
    import { parseNameStatus, select } from './scripts/ci/affected.mjs'; import { verifyPlan } from './scripts/ci/verify-plan.mjs';
    const base = process.argv[1];
    const z = execFileSync('git', ['diff', '--name-status', '-z', base, 'HEAD'], { maxBuffer: 1 << 28 }).toString();
    const map = JSON.parse(readFileSync('scripts/ci/check-map.json', 'utf8')), changes = parseNameStatus(z);
    const s = select(changes, map), v = verifyPlan(changes, map);
    console.log(JSON.stringify({ base, changed: changes.length, broad: s.broad, unmapped: s.unmapped, checks: s.checks.length, checkNames: s.checks, unitTests: s.unitTests, notCovered: s.notCovered, verifySuites: v.suites, verifyBuild: v.build, verifyAll: v.all, reasons: s.reasons.slice(0, 12) }, null, 1));
  " "${BASE:-}"
fi

if has suites; then
  for s in ${SUITES//,/ }; do
    if [ "$s" = python ] && ! command -v uv > /dev/null; then say "== suite-python: SKIPPED (uv not found)"; continue; fi
    [ "$s" = python ] && step uv-sync uv sync --locked
    step "suite-$s" env CI=true bash run.sh test:unit "$s"
  done
fi

if has builds; then # verify.yml's page builds, both bundles
  step build-verify-dist bash -c 'cd packages/web && VITE_RABBIT_HOLE=true VITE_TLDRAW_LICENSE_KEY=verify-only npm run build'
  step build-verify-dist-dev bash -c 'cd packages/web && VITE_RABBIT_HOLE=true VITE_TLDRAW_LICENSE_KEY=verify-only npm run build -- --outDir dist-dev'
fi

dry() { # dry <name> <dir> <config> : wrangler deploy --dry-run --outdir, sizes of the bundle
  local name="$1" wd="$2" cfg="$3"; rm -rf "$OUT/dry-$name"
  step "dry-$name" env CLOUDFLARE_API_TOKEN="$(secret CLOUDFLARE_API_TOKEN)" CLOUDFLARE_ACCOUNT_ID="$(secret CLOUDFLARE_ACCOUNT_ID)" bash -c "cd '$wd' && npx wrangler deploy --dry-run --config '$cfg' --outdir '$OUT/dry-$name'"
  { echo "-- $name bundle (bytes)"; find "$OUT/dry-$name" -type f \( -name '*.js' -o -name '*.mjs' -o -name '*.wasm' \) -printf '%s %P\n' 2> /dev/null | sort -rn | head -6; } >> "$OUT/sizes.txt"
}
if has devdry; then rm -f "$OUT/sizes.txt"; dry dev-web packages/web wrangler.dev.jsonc; fi

if has prod; then # scripts/prod-release.mjs prepare: production build env, both bundles, the bundle check, both Workers dry-run with the production config
  BE="$(cd "$DIR" && node --input-type=module -e "import('./scripts/prod-release.mjs').then(m=>{const e={...m.BUILD_ENV};for(const k of m.DEV_ONLY_ENV)delete e[k];console.log(Object.entries(e).map(([k,v])=>k+'='+v).join('\n'))})")"
  PENV=(); while IFS= read -r kv; do [ -n "$kv" ] && PENV+=("$kv"); done <<< "$BE"
  step prod-build-dist env "${PENV[@]}" VITE_TLDRAW_LICENSE_KEY=verify-only bash -c 'cd packages/web && npm run build'
  step prod-build-dist-dev env "${PENV[@]}" VITE_TLDRAW_LICENSE_KEY=verify-only bash -c 'cd packages/web && npm run build -- --outDir dist-dev'
  step prod-bundle-check env EXPECT_ANALYTICS=1 bash -c 'cd packages/web && node e2e/production-bundle-check.mjs'
  dry prod-app packages/web wrangler.rabbit-hole-prod.jsonc
  dry prod-cp packages/control-plane wrangler.rabbit-hole-prod.jsonc
  { echo "-- web dist (bytes) / files"; for d in dist dist-dev; do echo "$d $(du -sb "$DIR/packages/web/$d" 2> /dev/null | cut -f1) $(find "$DIR/packages/web/$d" -type f 2> /dev/null | wc -l)"; done; } >> "$OUT/sizes.txt"
fi

if [ ${#FAILS[@]} -eq 0 ]; then say "RESULT PASS $SHA ($(date '+%T'))"; else say "RESULT RED $SHA: ${FAILS[*]}"; fi
