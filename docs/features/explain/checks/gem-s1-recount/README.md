# GEM-S1 re-count: attempt-0 "columns ... received object" in the saved 155 fallbacks-batch bench

Offline, no provider call, nothing rerun. Data: `C:/s/sprint2-evidence/fallbacks-batch/results.jsonl` (66 runs: before = main 9531b382f, after = batch 5d13f435f; 11 cells x 3 reps x 2 arms). Script: `recount.mjs` (corrected regex `/columns\.\d+: Invalid input: expected string, received object/`, run over the `learn_artifact_invalid` attempt-0 events), output: `output.txt`.

## Result

| Set | before | after |
| --- | --- | --- |
| all cells (33 runs per arm) | 17/33 | 14/33 |
| GEM-S1 cells 1,2,3,6 (12 per arm) | 11/12 | 8/12 |

Per cell (before / after): cell 1 3/3, 3/3; cell 2 3/3, 0/3; cell 3 3/3, 3/3; cell 4 3/3, 3/3; cell 5 3/3, 3/3; cell 6 2/3, 2/3; cells 7 to 11 0/3, 0/3.

The figures agree with the earlier recomputation (11/12 and 8/12 in the GEM-S1 cells, 17/33 and 14/33 over all cells). The error strings were saved for every run that had an attempt-0 error (0 runs flagged `anyErrorAttempt0` without text); the bench's own `colsErrorAttempt0` is 0 for all 66 runs, the lost-backslash bug.

## What the drop means (cell 2, after arm)

The whole 11 to 8 difference is cell 2 (decoder, detailed), after arm: 0/3 against 3/3. Those three after-arm runs are not valid at attempt 0 either: their attempt-0 error is `explanation_missing_visual` (the three before-arm runs of the same cell say `explanation_bad_diagram ... columns.0: expected string, received object`). So the error text moved, which is what SIMP-1 does (a heatmap that cannot be rebuilt in its own kind is dropped, so the step ends on missing visual and the next provider runs; all three after-arm cell-2 cards were written by Fireworks). It is not evidence that Gemini sent fewer object columns or that GEM-S1's `name` key fixed anything: first-attempt-valid stays 1/12 in both arms, and the raw attempt-0 shape was not saved in this bench (it was in the later GEM-S2 capture, `../gem-s2/raw-attempt0/`).

Limit: the error text lists at most three issues, so a run whose first three issues are not column issues would be missed; the count is a floor.
