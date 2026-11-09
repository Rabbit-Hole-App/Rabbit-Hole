# Explain offline bench (selector and planner)

Copied from branch `explain/quality-bench` (806933642 plus 38e02e612) for the offline cleanup: only `selector.mjs`, `planner.mjs`,
`score.mjs` (imported by the planner) and the `aiml` and `correct-svg` sets. The model-run bench (`bench.mjs`, judges, report) stays on
that branch. No model calls except `planner.mjs` without `--dry-run`, which sends one JEV plan per case (TYPESAFE_API_KEY, about $0.0001 each).

- `node scripts/explain-bench/selector.mjs --tree <repo root> [--set-dir <dir>]` : which worked examples the production selector picks; fails if the copy differs from production.
- `node scripts/explain-bench/planner.mjs [--set-dir <dir>] [--only correct-svg|aiml] [--dry-run] [--out <dir>]` : the JEV planner against the labels.
- `sets/paraphrases/` : five learner phrasings of each prompt (Codex set 3). TEST INPUT ONLY: never in the author prompt or a reference.
