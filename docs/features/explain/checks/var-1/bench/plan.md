# VAR-1 bench plan (spec section 5): one measurement, cap US$6, NOT RUN

Prepared with feat/var-1 `bf926057f` (steps 1 to 3, step 4 rounds 1 to 3: `vary` on 15 references). Nothing in this folder has called a provider. The lead runs it after the owner's OK (given: up to US$6, a single bench, after round 3).

## Arms
- BEFORE = main `1cffe2ef81d97ad408c3ef6f26847cc451dcdc37` (release 157): no derive/op/t, no tokens, no requestSeed, no `vary`.
- AFTER = feat/var-1 `bf926057f3c18f12cdbe31701f0c44adf7dfa69e`.
- Trees: `git archive` of `packages` into `C:/s/var1-bench-trees/{before,after}` (made; no worktree touched; `C:/s/node_modules` serves both).
- Same harness as sections 6 / 6b and the GEM-S2 rerun: in process, `generateArtifact` + the fast chain, profile google-low (Gemini 3.5 flash-lite, then Fireworks gpt-oss-120b), planner jev (real TypeSafe call), formula sampler off, no pictures, the ledger on node:sqlite. Keys are read by name from `small-deploy/.env` (GEMINI_API_KEY, FIREWORKS_API_KEY, TYPESAFE_API_KEY) and never printed.

## Plan (`plan.json`, built by `plan.mjs`)
1. Numeric items, both arms: the section-6 plan, 303 items = 101 distinct (prompt, depth) cells (83 from the card-errors audit's numeric cells, 18 box-plot cells) with the section-6 repeats, run as pairs with the arm order alternated per item. 606 runs. The spec's "158 numeric cells" is not a number I can reproduce from the harness: the audit gives 83 distinct pairs (111 by raw depth label) plus 18 box cells. The same prompts as section 6 are used so the BEFORE arm is comparable with the section-6 and 6b numbers.
2. Variation items, AFTER arm only: ten varied references (ensemble-votes, log-feature-scale, learning-curves, bias-variance-decomposition, boosting-signed-corrections, search-grid-and-random, probability-calibration, acf-pacf-stems, class-weighted-loss, permutation-feature-importance), one prompt each (the reference's own first prompt), asked twice (items idx 1000 to 1019, balanced depth). 20 runs. `plan.mjs` keeps a prompt only if, offline, that reference is the first selected for it and two seeds draw different varied inputs; all 15 varied references qualify, the first ten are used.
- Every run passes `input.requestSeed = bench-<idx>-<rep>` (the route passes its own request id; the BEFORE arm ignores it).

## What is measured (from `results.jsonl`; a report script is written after the run)
- Derived-field arithmetic errors: delivered cards with a card-errors flag (old classifiers, comparable with section 6) and with a 154-rule flag (`flags154`), per arm; spec target 0 derived-field errors on AFTER for the rows `derived.js` covers. The 3 real box errors and the softmax residuals that remain are listed with why.
- Token-fill failures: `tokenFailure` (an `explanation_bad_token` event), `tokensFilled` per delivered card, runs that ended without a card.
- Variation (the 20 variation runs): for each reference, the two cards' diagrams are diffed by path (script written after the run): the varied input paths must differ, the structure (kinds, labels, axes, captions) must be identical except tokens, and every derived number must be correct (the same checks as above, plus `derived.js` recompute on the delivered specs). A pair counts only if the reference was selected in both runs (`references` in the record); a pair where the model did not copy the reference is reported as such, not as a variation failure.
- Context, as in section 6: delivery rate, honest failures, first repair, runs moved to the next provider, planned kind missing, latency, settled cost.
- No gate and no CI; counts, not hedged.

## Cost and stop
- Section 6 measured US$2.07 upper bound for 606 runs = US$0.0034 a run (settled about US$0.0032). Estimate for 626 runs: about US$2.13; the AFTER arm adds about 45 words of guidance only on diagram plans and a varied reference does not change token counts materially, so I expect under US$2.5.
- Stop line US$5.40 (`--cap`, 90% of the cap, so the run in flight cannot cross US$6.00); the harness appends each run to `results.jsonl`, writes `cost.txt` after every run, is resumable, and exits 3 at the stop line. A `--cap 0` self-test stops before any provider call (done).
- Time: about 3 s a run, run one at a time: about 30 minutes.

## Commands (the lead runs; none run)
    cd C:/s/sprint2-evidence/var-1-bench
    node run.mjs --dry-run                                  # done: passes, no provider call
    node run.mjs --out results.jsonl --cap 5.40             # 626 runs, about US$2.1; resumable
    node run.mjs --out results.jsonl --cap 5.40 --only 1000,1001,1002,1003   # variation items only (optional first look)

## BENCH-1
The fallbacks-batch `run.mjs` lost the backslashes of `/columns\.\d+: Invalid input: expected string, received object/` (so its attempt-0 count was always 0). This harness keeps the correct regex and `--dry-run` asserts it matches a real line and not a look-alike (`BENCH-1 regex self-test ok`). The section-6 / 6b harness has no such regex.

## Files
`plan.mjs`, `plan.json`, `run.mjs`, `patch-run.py` (how run.mjs was derived from gem-s2/rerun.mjs), this file. Not written (skipped on purpose, they depend on the results): `report.mjs` and the variation diff script.
