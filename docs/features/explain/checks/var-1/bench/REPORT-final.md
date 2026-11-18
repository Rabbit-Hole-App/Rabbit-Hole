# VAR-1 bench: final report (Gemini finished)

BEFORE = main 1cffe2ef8 (release 157), AFTER = feat/var-1 bf926057f. Same harness, same arms, profile google-low (Gemini 3.5 flash-lite, then Fireworks gpt-oss-120b), planner jev, formula sampler off, no pictures.

## First line
Derived-field arithmetic errors by the 154 rules: **0 of 303 BEFORE, 0 of 303 AFTER** (release 154 already ships that rule, so this bench shows AFTER does not regress it, not that VAR-1 lowered it). On Gemini the 20 variation runs delivered **110 of 110 varied values inside the reference's vary bands and equal to the value the sampler drew for that requestSeed**, with the reference's structure kept in 18 of 20 cards. Two things the Reviewer should look at: the old classifier flags 3 AFTER-only cards that look real (2 prose arithmetic statements and 1 bar sum), and first-attempt-invalid answers are 36 BEFORE vs 45 AFTER (mostly `explanation_bad_diagram`).

## What ran
- Numeric: all 606 runs (303 items x 2 arms). Items 0 to 154 on the first pass (Gemini live); items 155 to 302 re-run after the Gemini top-up (the first pass of those items ran on gpt-oss only because Gemini returned 402; those rows are kept in `results.jsonl`, not used here). Variation: all 20 runs on Gemini. Combined file: `results-combined.jsonl`.
- Gemini first attempt: 9 provider_error answers of 626 first attempts (provider side), the rest answered.
- Settled cost of the runs used here: numeric BEFORE US$0.932, AFTER US$0.963, variation US$0.051 (US$1.95). The whole bench including the earlier gpt-oss-only pass: settled about US$2.6 by the harness's own line (stop line US$5.50, hard cap US$6). Failed Gemini calls counted at their settled cost.

## Numeric arms (303 items each)
| | BEFORE | AFTER |
|---|---|---|
| delivered | 300 | 298 |
| not delivered (all provider_timeout) | 3 | 5 |
| 154-rule arithmetic flags | 0 | 0 |
| old-classifier flags (cards) | 12 | 22 |
| token-fill failures / cards with tokens | 0 / 0 | 0 / 3 |
| first attempt valid | 262 of 298 | 254 of 299 |
| moved to the next provider (gpt-oss) | 25 | 22 |
| delivered cards authored by gpt-oss | 22 | 17 |
| planned kind missing (delivered) | 83 | 81 |
| provider calls per run | 1.21 | 1.22 |
| latency p50 / p90 ms | 2757 / 4987 | 2867 / 5040 |
| settled cost US$ | 0.932 | 0.963 |

## 2a. The old-classifier flags: real or checker false positive (offline-2ab-gemini.md)
Cards with a flag: 12 BEFORE, 22 AFTER. By class (flag lines):
| class | before | after |
|---|---|---|
| FP: prose number opens a formula whose result equals the figure | 2 | 10 |
| FP: a class median compared with the other class's label | 13 | 11 |
| FP: whiskers at the data min/max, no fences or outliers drawn, prose never says outlier | 4 | 8 |
| FP: heatmap causal-mask grid read as weights (the known false positive; the card has its own HEAT-1 content error) | 3 | 3 |
| REAL | 4 | 5 |
Cards with at least one real flag: 2 BEFORE, 4 AFTER.

REAL ones (item ids):
- BEFORE: items 114 and 115 (balanced, Gemini): the prose calls 40 and 100 outliers but the figure draws them as whisker ends beyond the fence 58/90 and 62/86, no fences drawn.
- AFTER: item 112 (brief, Gemini): same whisker pattern ("two large outliers", whiskers 40 and 100, fence 62/86); items 222 and 297 (balanced, gpt-oss, same prompt "show the numbers when forward diffusion adds known noise to a latent"): prose arithmetic "0.5 x 0.8 + 0.5 x (-0.5) = 0.34", computed 0.15; item 280 (detailed, Gemini, "why more than one attention head"): bar values 0.65, 0.38 sum to 1.03 where the text calls them a distribution. Items 222, 280 and 297 carry no flag in the BEFORE arm.
Whisker flags: every flagged card draws no fences and no outliers.

## 2b. First-attempt-invalid answers (Gemini, attempt 0)
36 BEFORE, 45 AFTER of about 298 each.
| error code | before | after |
|---|---|---|
| explanation_bad_diagram | 22 | 33 |
| explanation_bad_numbers | 8 | 8 |
| explanation_missing_visual | 6 | 4 |
The 11 extra `explanation_bad_diagram` are spread over many messages (comparison-shape columns 9 vs 11, flow cycle or unreachable node 1 vs 4, box-plot 1 vs 3, token-links 4 vs 8 by planned kind); no one error class explains them and the difference (9 answers) is about one binomial standard deviation, so I read it as noise, not a VAR-1 effect. Not proven.

## Variation on Gemini (variation-diff-gemini.md, vary-bands-gemini.md)
10 references, each asked twice (bench seeds 1 and 2), all 20 cards written by Gemini, 0 token cards.
- Values: every varied path inside its band: **110 of 110**; every one equals the value drawn for that requestSeed (the card copied the sampled input).
- Pairs differ in inputs: 2 to 7 numeric paths per pair changed (ensemble-votes 3, learning-curves 7, bias-variance 2, boosting 3, search-grid 6, calibration 5, acf-pacf 4, feature-selection 4, permutation 3, log-feature-scale 3); kind and reference identical in 10 of 10 pairs.
- Labels and structure: text fields unchanged from the reference in 12 of 20 cards; 8 cards changed 1 or 2 text fields (a title or caption sentence); array-length structure the reference's in 18 of 20 (items 1002 log-feature-scale and 1011 search-grid differ; the paths are in vary-bands-gemini.md).
- The earlier gpt-oss pairs (vary-bands-gptoss.md): 74 of 104 in band, 70 of 104 equal to the drawn value, structure the same in 6 of 19; boosting-signed-corrections item 1008 delivered a first correction of 0 against the band -2..-1. Gemini keeps the drawn inputs; gpt-oss rewrites them.

## Not claimed
- VAR-1's effect on box and softmax residual errors cannot be read here: BEFORE is already 0 by the 154 rules.
- Token fill was exercised on 3 AFTER cards only (0 failures).
- The 2a table is my reading of the flag text with the rules named above; the per-flag lines with the reason are in offline-2ab-gemini.md.

## Files
results-combined.jsonl (626 runs), results.jsonl (first pass incl. the gpt-oss-only rerun slice), results-gemini.jsonl (the Gemini rerun and variation), report-gemini.md and variation-diff-gemini.md (raw tables), offline-2ab-gemini.md, vary-bands-gemini.md, vary-bands-gptoss.md, run2.mjs / patch-run2.mjs (resume harness), report-final.mjs, offline-2ab.mjs, vary-bands.mjs.
