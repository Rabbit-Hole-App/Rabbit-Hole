# Fallbacks batch bench (SIMP-1 + GEM-S1): NOT RUN, the lead runs it

BEFORE = main 9531b382f6d2735393a7f9b3c7d82988007d1327 (release-154 tip). AFTER = rabbit-hole/feat/fallbacks-batch 5d13f435fe75e590b16b51bf4081a9dbe1d7d745
(main + `--no-ff` merges of feat/simp-1 2a47b4a36 and feat/gem-s1 643e6807d; no conflicts).

Trees (already extracted with `git archive packages docs`, no node_modules needed: the dry-run imports both and passes):
  C:/s/fb-trees/before   C:/s/fb-trees/after

Plan (plan.json, built by plan.mjs): 11 prompt x depth cells x 3 reps = 33 items x 2 arms = 66 runs, google-low, planner jev, sampler off, no pictures; items are rep-major and
the first arm alternates by item index (as section 6), so provider drift hits both arms alike.
Cells: GEM-S1 = decoder balanced+detailed, forward diffusion balanced, gini split+gain balanced; SIMP-1 = the 6 cells of section-6/fallback-trace/fallback-cards.md
(decoder balanced/detailed, forward diffusion balanced, gradient descent brief, learning rate schedule brief, gini impurity brief) + 'compare a stack and a queue'
(scripts/explain-bench/sets/baseline.json id stack-vs-queue) balanced and brief; new = forward diffusion brief and detailed. Estimate about US$0.33 (0.005 a run), cap US$0.60.

## Dry run (no provider call; done, passes)
    cd C:/s/sprint2-evidence/fallbacks-batch && node run.mjs --dry-run

## Run (the lead; real provider calls, keys read by name from small-deploy/.env, never printed)
    cd C:/s/sprint2-evidence/fallbacks-batch && node run.mjs --plan plan.json --out results.jsonl --trees C:/s/fb-trees --cap 0.60
    node report.mjs          # writes REPORT.md and results.json
Resumable: a rerun skips every (item, arm) already in results.jsonl. `--limit 2` or `--only 1,2` for a first look. Stops at the cap (exit 3).

## What each run records (results.jsonl)
delivered or the honest failure (`endedOnFailureLine` = explanation_missing_visual, `errorCode`, `failureMessage`), `plannedKind` vs `finalKinds`, `mismatchedFlow` (planned
token-links/heatmap/matrix/transformation/tree, delivered flow/chain, none of the planned kind), `plannedKindMissing`, `attempts` (provider outcomes), `authoredBy` (which provider
wrote the card), `coercedByQ0` (explanation_matrix_coerced action + columns/reason), `firstAttemptValid`, `colsErrorAttempt0`, `anyErrorAttempt0`, `providerCalls`, `stepsRun`,
`movedToNextProvider`, `costMicros`, `ms`, the card-errors `flags`.

## Note
gem-s1/rerun.mjs's attempt-0 columns regex had lost its backslashes (`columns.d+`, which never matches `columns.0:`); run.mjs here fixes it (`columns\.\d+`).
Not checked: any run against a real provider (that is the lead's run).
