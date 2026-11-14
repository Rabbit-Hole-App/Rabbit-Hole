# bench-pick: does the pick send a prompt to its family or to `gap`?

1080 JEV calls (pickFamily, threshold 0, raw probabilities stored; thresholds applied offline). Two family lists, so two questions and two sets of calls: `vertical-throw` and `vertical-throw+curve-sliders`. Prompts: 60, depths brief, balanced, detailed, repeats 3.

Definitions. Top choice = the most probable of the family ids and `none`; it fits only when it is a family and its probability >= the threshold, else `gap`; a failed or timed-out call is `gap`. **Wrong fit**: a prompt with ANY call that fit a family other than its label (labelled none or the other family). **Missed fit**: a prompt labelled a family in the list for which MORE THAN HALF of its calls came back `gap`. Pass rule: 0 wrong fits and at most 3 missed fits.

## vertical-throw

540 calls over 60 prompts; ms median 58, p95 104; timeouts 0; failed calls (no answer, counted as gap) 0.

Cheapest threshold with 0 wrong fits and <= 3 missed fits: **none**

| Threshold | Wrong fits (prompts) | Wrong calls | Missed fits (prompts) | Missed calls | Pass |
|---|---|---|---|---|---|
| 0.5 | 1 (50) | 9 | 2 (15, 16) | 22 | no |
| 0.6 | 1 (50) | 8 | 4 (4, 12, 15, 16) | 36 | no |
| 0.7 | 0 | 0 | 5 (4, 11, 12, 15, 16) | 44 | no |
| 0.8 | 0 | 0 | 5 (4, 11, 12, 15, 16) | 45 | no |
| 0.9 | 0 | 0 | 5 (4, 11, 12, 15, 16) | 46 | no |

Per depth (wrong calls / missed calls of the depth's calls):

| Threshold | brief | balanced | detailed |
|---|---|---|---|
| 0.5 | 3 / 6 of 180 | 3 / 8 of 180 | 3 / 8 of 180 |
| 0.6 | 3 / 12 of 180 | 3 / 12 of 180 | 2 / 12 of 180 |
| 0.7 | 0 / 15 of 180 | 0 / 14 of 180 | 0 / 15 of 180 |
| 0.8 | 0 / 15 of 180 | 0 / 15 of 180 | 0 / 15 of 180 |
| 0.9 | 0 / 15 of 180 | 0 / 15 of 180 | 0 / 16 of 180 |

Near misses (49, 50) and over-time scenes no family covers (33, 36, 37): the top-family confidence over the prompt's calls, the median `none` probability, and how many calls fit at each threshold.

| Prompt | Label | Calls | Top = none | Top = family | Family confidence min / median / max | none median | Fits at 0.5 / 0.6 / 0.7 / 0.8 / 0.9 |
|---|---|---|---|---|---|---|---|
| 33 | none | 9 | 9 | 0 | none | 1 | 0 / 0 / 0 / 0 / 0 |
| 36 | none | 9 | 9 | 0 | none | 0.99 | 0 / 0 / 0 / 0 / 0 |
| 37 | none | 9 | 9 | 0 | none | 0.99 | 0 / 0 / 0 / 0 / 0 |
| 49 | none | 9 | 9 | 0 | none | 0.57 | 0 / 0 / 0 / 0 / 0 |
| 50 | none | 9 | 0 | 9 | 0.51 / 0.63 / 0.69 | 0.37 | 9 / 8 / 0 / 0 / 0 |

## vertical-throw+curve-sliders

540 calls over 60 prompts; ms median 55, p95 95; timeouts 0; failed calls (no answer, counted as gap) 0.

Cheapest threshold with 0 wrong fits and <= 3 missed fits: **none**

| Threshold | Wrong fits (prompts) | Wrong calls | Missed fits (prompts) | Missed calls | Pass |
|---|---|---|---|---|---|
| 0.5 | 4 (16, 33, 49, 50) | 33 | 1 (15) | 14 | no |
| 0.6 | 3 (16, 33, 50) | 27 | 4 (11, 12, 15, 32) | 32 | no |
| 0.7 | 3 (16, 33, 50) | 21 | 5 (11, 12, 15, 23, 32) | 46 | no |
| 0.8 | 1 (33) | 9 | 10 (4, 6, 11, 12, 15, 16, 21, 23, 28, 32) | 86 | no |
| 0.9 | 0 | 0 | 11 (4, 6, 11, 12, 15, 16, 21, 23, 28, 31, 32) | 99 | no |

Per depth (wrong calls / missed calls of the depth's calls):

| Threshold | brief | balanced | detailed |
|---|---|---|---|
| 0.5 | 12 / 4 of 180 | 11 / 5 of 180 | 10 / 5 of 180 |
| 0.6 | 9 / 10 of 180 | 9 / 11 of 180 | 9 / 11 of 180 |
| 0.7 | 8 / 14 of 180 | 7 / 17 of 180 | 6 / 15 of 180 |
| 0.8 | 3 / 27 of 180 | 3 / 29 of 180 | 3 / 30 of 180 |
| 0.9 | 0 / 33 of 180 | 0 / 33 of 180 | 0 / 33 of 180 |

Near misses (49, 50) and over-time scenes no family covers (33, 36, 37): the top-family confidence over the prompt's calls, the median `none` probability, and how many calls fit at each threshold.

| Prompt | Label | Calls | Top = none | Top = family | Family confidence min / median / max | none median | Fits at 0.5 / 0.6 / 0.7 / 0.8 / 0.9 |
|---|---|---|---|---|---|---|---|
| 33 | none | 9 | 0 | 9 | 0.85 / 0.86 / 0.89 | 0.14 | 9 / 9 / 9 / 9 / 0 |
| 36 | none | 9 | 9 | 0 | none | 0.83 | 0 / 0 / 0 / 0 / 0 |
| 37 | none | 9 | 9 | 0 | none | 0.84 | 0 / 0 / 0 / 0 / 0 |
| 49 | none | 9 | 0 | 9 | 0.45 / 0.5 / 0.57 | 0.31 | 6 / 0 / 0 / 0 / 0 |
| 50 | none | 9 | 0 | 9 | 0.65 / 0.69 / 0.74 | 0.27 | 9 / 9 / 3 / 0 / 0 |

