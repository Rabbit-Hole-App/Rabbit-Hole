#!/usr/bin/env bash
# demo-lesson04 run on a stack of the build under test: preflight, bench (Balanced, then Detailed for the two prompts asked at both), factual-v2 judge only, then the review pack.
# Not for CI. Needs a stack already up (stack.sh start) with its log and persist dir. Paid: provider calls for each card plus one judge call per card; caps below.
#   BASE=http://127.0.0.1:8888 VARS=<tree>/packages/control-plane/.dev.vars LOG=<persist>/app.log PERSIST=<persist> TREE=<tree> bash scripts/explain-bench/run-demo-lesson04.sh
# Optional: ONLY=<ids or short names, comma separated> (default: the eight references that exist), PREV_RUNS=<bench run dirs of earlier invocations, comma separated, kept in the pack>,
#   OUT=<bench results root>, CAP (US$ per bench call, default 1.00), JUDGE_CAP (US$ judge, default 0.50), PACK_OUT (default docs/features/explain/review/demo-lesson04), NO_PNG=1.
set -u
for v in BASE VARS LOG PERSIST TREE; do [ -n "${!v:-}" ] || { echo "$v is required" >&2; exit 2; }; done
cd "$(dirname "$0")/../.." || exit 2
B=scripts/explain-bench
ONLY=${ONLY:-ml-trees-decision-regions,ml-trees-gini-split,ml-trees-threshold-search,ml-trees-grown-tree,ml-trees-depth-overfit,ml-trees-bootstrap-roots,ml-trees-majority-vote,ml-trees-feature-importance}
IDS=$(echo "$ONLY" | tr ',' '\n' | sed 's/^ml-trees-//; s/^/ml-trees-/' | paste -sd, -)
DEEP=$(echo "$IDS" | tr ',' '\n' | grep -E '^ml-trees-(gini-split|regression-step-fit)$' | paste -sd, -)
COMMON=(--sets demo-lesson04 --runs 1 --base "$BASE" --vars "$VARS" --log "$LOG" --persist "$PERSIST" --tree "$TREE" --judge --judge-only factual --cap "${CAP:-1.00}" --judge-cap "${JUDGE_CAP:-0.50}" --skip-preflight)
[ -n "${OUT:-}" ] && COMMON+=(--out "$OUT")

git fetch -q rabbit-hole chatgpt/explain-phase02-library || echo "warning: could not fetch the Codex branch; references come from the last fetch"
node $B/preflight.mjs --vars "$VARS" || { echo "preflight failed: run not started (invalid, not failed)" >&2; exit 4; }

RUNS=()
[ -n "${PREV_RUNS:-}" ] && IFS=, read -ra RUNS <<< "$PREV_RUNS"
runbench() { # label depth ids
  local log; log=$(mktemp)
  node $B/bench.mjs "${COMMON[@]}" --label "$1" --depth "$2" --only "$3" | tee "$log"
  local rc=${PIPESTATUS[0]} dir; dir=$(tr '\\' / < "$log" | sed -n 's/^RESULT .* report=\(.*\)\/report\.md.*/\1/p' | tail -1); rm -f "$log"
  [ "$rc" = 4 ] && { echo "bench INVALID (provider or stack refusal); stopping" >&2; exit 4; }
  [ -n "$dir" ] && RUNS+=("$dir")
}
runbench "demo-lesson04 balanced" standard "$IDS"
[ -n "$DEEP" ] && runbench "demo-lesson04 detailed" deep "$DEEP"
[ ${#RUNS[@]} -gt 0 ] || { echo "no bench run produced results" >&2; exit 1; }

PACK_ARGS=(); [ -n "${PACK_OUT:-}" ] && PACK_ARGS+=(--out "$PACK_OUT"); [ -n "${NO_PNG:-}" ] && PACK_ARGS+=(--no-png)
ARGS=(); for r in "${RUNS[@]}"; do ARGS+=(--run "$r"); done
node $B/demo-lesson04-pack.mjs "${ARGS[@]}" --tree "$TREE" --base "$BASE" --vars "$VARS" "${PACK_ARGS[@]}"
echo "runs for a later PREV_RUNS: $(IFS=,; echo "${RUNS[*]}")"
