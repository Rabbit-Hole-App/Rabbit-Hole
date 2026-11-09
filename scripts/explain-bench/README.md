# Explain offline bench (selector and planner)

Copied from branch `explain/quality-bench` (806933642 plus 38e02e612) for the offline cleanup: only `selector.mjs`, `planner.mjs`,
`score.mjs` (imported by the planner) and the `aiml` and `correct-svg` sets. The model-run bench (`bench.mjs`, judges, report) stays on
that branch. No model calls except `planner.mjs` without `--dry-run`, which sends one JEV plan per case (TYPESAFE_API_KEY, about $0.0001 each).

- `node scripts/explain-bench/selector.mjs --tree <repo root> [--set-dir <dir>]` : which worked examples the production selector picks; fails if the copy differs from production.
- `node scripts/explain-bench/planner.mjs [--set-dir <dir>] [--only correct-svg|aiml] [--dry-run] [--out <dir>]` : the JEV planner against the labels.
- `sets/paraphrases/` : five learner phrasings of each prompt (Codex set 3). TEST INPUT ONLY: never in the author prompt or a reference.

## Calibration notes for the claims-beyond-prose judge (beyond-v2; owner 2026-11-09)

Not a rule change, an example the judge should catch: the cross-validation card caption "lower training error than validation error signals overfitting" states more than the prose gives. It is also imprecise: the size of the gap is the signal, not which error is lower. A caption (or label) that states a claim the prose does not make counts as a claim beyond the prose; a number, name or relation in a diagram label or caption must appear in the prose or on the plot.
