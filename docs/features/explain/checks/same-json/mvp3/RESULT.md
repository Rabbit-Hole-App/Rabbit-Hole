# MVP3: when the request also gives Gemini starting numbers made from its seed, does the same prompt give different values on each ask?

Written by the lead from `results.jsonl` by `report.mjs`. It counts; it does not judge whether a number is right. The Reviewer and the owner recompute the numbers from `results.jsonl`.

BEFORE, AFTER and AFTER2 are the MVP1 and MVP2 runs, not re-run. **AFTER3** = feat/same-json-mvp3 (the MVP2 branch plus one commit): when a stored reference is shown with its numbers removed and the request has a seed, the examples heading ends with one more sentence: "For this card, build your input values from these starting numbers, in this order, scaling or rounding them where the diagram needs shares or weights: n1 ... n8." The eight numbers are distinct whole numbers from 5 to 60 drawn from the request's seed with seededRandom. Profile google-low, Balanced depth, planner on, a different seed for every ask. 25 AFTER3 runs (5 prompts x 5 asks). Settled cost of the AFTER3 runs US$0.069 (planner estimate US$0.0002 a run included); stop line US$0.30. Whether a number is right, and whether the starting numbers were used, is not judged here.

Counted per prompt and arm, out of five asks:
- **value sets**: the numbers of every diagram of the card, in spec order, exact; labels ignored.
- **label sets**: the sorted set of label, heading, title, caption, detail and similar text strings of every diagram.
- **whole cards**: title, every diagram spec and the body text, exact.
- **reference values**: cards that carry a diagram whose numbers equal, exactly and in order, the numbers of the shown reference (the reference of the same id in the library; in AFTER2 the model was shown that reference with "?" in place of its numbers).
- **repairs**: the sum of the repairs recorded in the attempts of the five asks.

## Summary

| prompt | arm | delivered | valid first time | repairs | value sets (of 5) | label sets | whole cards | cards with the reference's values |
|---|---|---|---|---|---|---|---|---|
| ml-sampling-top-k | BEFORE | 5/5 | 5/5 | 0 | 2 | 1 | 5 | 4 |
| ml-sampling-top-k | AFTER | 5/5 | 5/5 | 0 | 2 | 3 | 5 | 2 |
| ml-sampling-top-k | AFTER2 | 5/5 | 5/5 | 0 | 1 | 3 | 5 | 0 |
| ml-sampling-top-k | AFTER3 | 5/5 | 4/5 | 1 | 5 | 5 | 5 | 0 |
| regression-mean-baseline | BEFORE | 5/5 | 5/5 | 0 | 1 | 1 | 5 | 5 |
| regression-mean-baseline | AFTER | 5/5 | 5/5 | 0 | 1 | 1 | 5 | 5 |
| regression-mean-baseline | AFTER2 | 5/5 | 5/5 | 0 | 3 | 2 | 5 | 0 |
| regression-mean-baseline | AFTER3 | 5/5 | 5/5 | 0 | 5 | 5 | 5 | 0 |
| confusion-matrix-counts | BEFORE | 5/5 | 5/5 | 0 | 1 | 1 | 5 | 5 |
| confusion-matrix-counts | AFTER | 5/5 | 5/5 | 0 | 1 | 1 | 5 | 5 |
| confusion-matrix-counts | AFTER2 | 5/5 | 3/5 | 2 | 4 | 4 | 5 | 0 |
| confusion-matrix-counts | AFTER3 | 5/5 | 5/5 | 0 | 5 | 5 | 5 | 0 |
| softmax-probabilities | BEFORE | 5/5 | 5/5 | 0 | 1 | 1 | 5 | 5 |
| softmax-probabilities | AFTER | 5/5 | 5/5 | 0 | 1 | 2 | 5 | 5 |
| softmax-probabilities | AFTER2 | 5/5 | 5/5 | 0 | 2 | 1 | 5 | 0 |
| softmax-probabilities | AFTER3 | 5/5 | 5/5 | 0 | 5 | 2 | 5 | 0 |
| ml-self-attention-token-links | BEFORE | 5/5 | 5/5 | 0 | 1 | 3 | 5 | 5 |
| ml-self-attention-token-links | AFTER | 5/5 | 4/5 | 1 | 1 | 5 | 5 | 5 |
| ml-self-attention-token-links | AFTER2 | 5/5 | 4/5 | 1 | 5 | 5 | 5 | 0 |
| ml-self-attention-token-links | AFTER3 | 5/5 | 5/5 | 0 | 5 | 5 | 5 | 0 |

BEFORE totals: delivered 25/25; valid first time 25/25; repairs 0; value sets 6 of 25; label sets 7; whole cards 25; cards with the reference's values 24.

AFTER totals: delivered 25/25; valid first time 24/25; repairs 1; value sets 6 of 25; label sets 12; whole cards 25; cards with the reference's values 22.

AFTER2 totals: delivered 25/25; valid first time 22/25; repairs 3; value sets 15 of 25; label sets 15; whole cards 25; cards with the reference's values 0.

AFTER3 totals: delivered 25/25; valid first time 24/25; repairs 1; value sets 25 of 25; label sets 22; whole cards 25; cards with the reference's values 0.

## Dry run before any provider call

| prompt | reference | starting numbers, seed dry-A | starting numbers, seed dry-B | same seed, same numbers | only the sentence differs from the MVP2 request | no seed: no sentence and equal to MVP2 | system text chars AFTER2 -> AFTER3 |
|---|---|---|---|---|---|---|---|
| top-k | ml-sampling-top-k | 15, 14, 57, 20, 30, 49, 6, 7 | 53, 28, 13, 21, 39, 10, 58, 41 | yes | yes | yes | 16482 -> 16663 |
| regression-mean-baseline | regression-mean-baseline | 15, 14, 57, 20, 30, 49, 6, 7 | 53, 28, 13, 21, 39, 10, 58, 41 | yes | yes | yes | 16740 -> 16921 |
| confusion-matrix-counts | confusion-matrix-counts | 15, 14, 57, 20, 30, 49, 6, 7 | 53, 28, 13, 21, 39, 10, 58, 41 | yes | yes | yes | 16496 -> 16677 |
| softmax-probabilities | softmax-probabilities | 15, 14, 57, 20, 30, 49, 6, 7 | 53, 28, 13, 21, 39, 10, 58, 41 | yes | yes | yes | 16295 -> 16476 |
| ml-self-attention-token-links | ml-self-attention-token-links | 15, 14, 57, 20, 30, 49, 6, 7 | 53, 28, 13, 21, 39, 10, 58, 41 | yes | yes | yes | 16584 -> 16765 |

The planner answer was set by hand to the reference's kind for this offline check (no provider call); the paid runs use the real planner. The two seeds dry-A and dry-B are test seeds; the paid runs use bench-<n>-<ask>.

The top-k examples block, exactly as sent (the text from `# Examples` to the next heading):

```text(seed bench-1-1, the first top-k ask)

# Examples
Approved diagram references (examples, not source facts). An example on this card's subject shows a correct structure: keep its structure and its facts. Write your own version of what is illustrative in it: the example items, their names, the input values and the title. Do not copy an example's values, labels or prose, force a reference, or exceed this card's visual count. A "?" in an example stands for a number that was removed: choose your own. For this card, build your input values from these starting numbers, in this order, scaling or rounding them where the diagram needs shares or weights: 39, 53, 24, 51, 40, 6, 17, 41.
{"id":"shape-bar-chart","useWhen":"Shape example for a bar-chart diagram on another subject. Use its structure, not its content.","spec":{"version":1,"diagram":{"title":"Library loans","kind":"bar-chart","unit":"books","bars":[{"label":"Monday","value":12},{"label":"Tuesday","value":18}]}}}
{"id":"ml-sampling-top-k","useWhen":"Compare the full model distribution with the filtered distribution used for sampling. A reported probability depends on which distribution is logged.","spec":{"version":1,"diagram":{"title":"Full softmax and top-? sampling","caption":"The kept tokens originally hold ?% of the probability. Divide each kept probability by that total.","kind":"bar-chart","unit":"%","variant":"grouped","categories":["on","near","under","by","in"],"series":[{"label":"Full softmax","values":["?","?","?","?","?"]},{"label":"Top-? renormalized","values":["?","?","?","?","?"]}]}}}
```

## The cards, one line each (title | labels | values)

### ml-sampling-top-k: Does top-k filtering affect the reported probability of the chosen token?

**BEFORE** (reference shown: ml-sampling-top-k; shape example: shape-bar-chart)

- ask 1 (seed bench-1-1): **Top-k filtering and token probabilities** | bar-chart: Full softmax and top-2 sampling / The kept tokens originally hold 70% of the probability. Divide each kept probability by that total. / % / grouped / Full soft... | values 42, 28, 16, 8, 6, 60, 40, 0, 0, 0
- ask 2 (seed bench-2-2): **Top-k filtering and token probabilities** | bar-chart: Full softmax and top-2 sampling / The kept tokens originally hold 70% of the probability. Divide each kept probability by that total. / % / grouped / Full soft... | values 42, 28, 16, 8, 6, 60, 40, 0, 0, 0
- ask 3 (seed bench-3-3): **Top-k Filtering and Token Probabilities** | bar-chart: Full softmax and top-2 sampling / The kept tokens originally hold 70% of the probability. Divide each kept probability by that total. / % / grouped / Full soft... | values 42, 28, 16, 8, 6, 60, 40, 0, 0, 0
- ask 4 (seed bench-4-4): **Top-k filtering and reported probabilities** | bar-chart: Full softmax and top-2 sampling / The kept tokens originally hold 70% of the probability. Divide each kept probability by that total. / % / grouped / Full soft... | values 42, 28, 30, 60, 40, 0
- ask 5 (seed bench-5-5): **Top-k Filtering and Token Probabilities** | bar-chart: Full softmax and top-2 sampling / The kept tokens originally hold 70% of the probability. Divide each kept probability by that total. / % / grouped / Full soft... | values 42, 28, 16, 8, 6, 60, 40, 0, 0, 0

**AFTER** (reference shown: ml-sampling-top-k; shape example: shape-bar-chart)

- ask 1 (seed bench-1-1): **Top-k Filtering and Token Probabilities** | bar-chart: Full softmax and top-2 sampling / The kept tokens originally hold 70% of the probability. Divide each kept probability by that total. / % / grouped / Full soft... | values 42, 28, 16, 8, 6, 60, 40, 0, 0, 0
- ask 2 (seed bench-2-2): **Top-k Filtering and Token Probabilities** | bar-chart: Full softmax and top-2 sampling / The kept tokens initially hold 70% probability. Renormalizing scales them up. / % / grouped / Full softmax / Top-2 renormaliz... | values 42, 28, 30, 60, 40, 0
- ask 3 (seed bench-3-3): **Top-k Filtering and Token Probabilities** | bar-chart: Full softmax and top-2 sampling / The kept tokens originally hold 70% of the probability. Divide each kept probability by that total. / % / grouped / Full soft... | values 42, 28, 30, 60, 40, 0
- ask 4 (seed bench-4-4): **Top-k Filtering and Token Probabilities** | bar-chart: Full softmax and top-2 sampling / The kept tokens initially hold 70% of the probability. Divide each kept probability by that total. / % / grouped / Full softm... | values 42, 28, 16, 8, 6, 60, 40, 0, 0, 0
- ask 5 (seed bench-5-5): **Top-k Filtering and Token Probabilities** | bar-chart: Full softmax and top-2 sampling / The kept tokens originally hold 70% of the probability. Divide each kept probability by that total. / % / grouped / Full soft... | values 42, 28, 30, 60, 40, 0

**AFTER2** (reference shown: ml-sampling-top-k; shape example: shape-bar-chart)

- ask 1 (seed bench-1-1): **Top-k Filtering and Token Probabilities** | bar-chart: Full softmax and top-3 sampling / The kept tokens originally hold 0.8 of the probability. Divide each kept probability by that total. / % / grouped / Full soft... | values 50, 20, 10, 62.5, 25, 12.5
- ask 2 (seed bench-2-2): **Top-k Filtering and Token Probabilities** | bar-chart: Full softmax and top-3 sampling / The kept tokens originally hold 80% of the probability. Divide each kept probability by that total. / % / grouped / Full soft... | values 50, 20, 10, 62.5, 25, 12.5
- ask 3 (seed bench-3-3): **Top-k filtering and token probability** | bar-chart: Full softmax and top-3 sampling / The kept tokens originally hold 0.8 of the probability. Divide each kept probability by that total. / % / grouped / Full soft... | values 50, 20, 10, 62.5, 25, 12.5
- ask 4 (seed bench-4-4): **Top-k Filtering and Token Probabilities** | bar-chart: Full softmax and top-3 sampling / The kept tokens originally hold 0.8 of the probability. Divide each kept probability by that total. / % / grouped / Full soft... | values 50, 20, 10, 62.5, 25, 12.5
- ask 5 (seed bench-5-5): **Top-k filtering and token probabilities** | bar-chart: Full softmax and top-3 sampling / The kept tokens originally hold 80% probability. Renormalizing divides each by 0.8. / % / grouped / Full softmax / Top-3 reno... | values 50, 20, 10, 62.5, 25, 12.5

**AFTER3** (reference shown: ml-sampling-top-k; shape example: shape-bar-chart)

- ask 1 (seed bench-1-1): starting numbers sent 39, 53, 24, 51, 40, 6, 17, 41 | **Top-k Renormalization Effect** | bar-chart: Full softmax and top-3 sampling / The kept tokens originally hold 82% of the probability. Divide each kept probability by that total. / % / grouped / Full soft... | values 39, 24, 19, 12, 6, 47.5, 29.3, 23.2, 0, 0
- ask 2 (seed bench-2-2): starting numbers sent 6, 57, 41, 48, 43, 34, 37, 47 | **Top-k filtering and reported token probabilities** | bar-chart: Full softmax and top-3 sampling / The kept tokens hold 80% of the probability. Divide each kept probability by that total. / % / grouped / Full softmax / Top-3... | values 50, 30, 10, 6, 4, 55.6, 33.3, 11.1, 0, 0
- ask 3 (seed bench-3-3): starting numbers sent 31, 42, 47, 55, 20, 36, 37, 15 | **Top-k filtering and token probabilities** | bar-chart: Full softmax and top-3 sampling / The kept tokens originally hold 100% of the probability. Divide each kept probability by that total. / % / grouped / Full sof... | values 50, 30, 20, 50, 30, 20
- ask 4 (seed bench-4-4): starting numbers sent 38, 56, 51, 17, 39, 60, 10, 25 | **Top-k filtering and probabilities** | bar-chart: Full softmax and top-3 sampling / The kept tokens originally hold 70% of the probability. Divide each kept probability by that total. / % / grouped / Full soft... | values 38, 32, 20, 7, 3, 54.3, 45.7, 0, 0, 0
- ask 5 (seed bench-5-5): starting numbers sent 53, 5, 16, 9, 58, 57, 6, 13 | **Top-k Filtering and Token Probabilities** | bar-chart: Full softmax and top-3 sampling / The kept tokens originally hold 77% of the probability. Divide each kept probability by that total. / % / grouped / Full soft... | values 53, 16, 8, 69, 21, 10

Out of five, BEFORE / AFTER / AFTER2 / AFTER3: different value sets 2 / 2 / 1 / 5; different label sets 1 / 3 / 3 / 5; different whole cards 5 / 5 / 5 / 5; cards with the reference's values 4 / 2 / 0 / 0; delivered 5 / 5 / 5 / 5; valid first time 5 / 5 / 5 / 4; repairs 0 / 0 / 0 / 1.

Picture: `sheets/ml-sampling-top-k.html` (AFTER2 above AFTER3 rows, five asks side by side, 408 px tiles).

### regression-mean-baseline: What does predicting the mean give as a regression baseline?

**BEFORE** (reference shown: regression-mean-baseline; shape example: shape-coordinate-plot)

- ask 1 (seed bench-6-1): **Regression baseline of the mean** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the stated relationship. / Sample / Target / Targets / Mean prediction of 3 | values 1, 5, 0, 6, 1, 1, 2, 4, 3, 2, 4, 5, 5, 3, 3
- ask 2 (seed bench-7-2): **Predicting the Mean as a Regression Baseline** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the stated relationship. / Sample / Target / Targets / Mean prediction of 3 | values 1, 5, 0, 6, 1, 1, 2, 4, 3, 2, 4, 5, 5, 3, 3
- ask 3 (seed bench-8-3): **Predicting the Mean as a Regression Baseline** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the stated relationship. / Sample / Target / Targets / Mean prediction of 3 | values 1, 5, 0, 6, 1, 1, 2, 4, 3, 2, 4, 5, 5, 3, 3
- ask 4 (seed bench-9-4): **Regression Baseline: Predicting the Mean** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the stated relationship. / Sample / Target / Targets / Mean prediction of 3 | values 1, 5, 0, 6, 1, 1, 2, 4, 3, 2, 4, 5, 5, 3, 3
- ask 5 (seed bench-10-5): **Regression Baseline: Predicting the Mean** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the stated relationship. / Sample / Target / Targets / Mean prediction of 3 | values 1, 5, 0, 6, 1, 1, 2, 4, 3, 2, 4, 5, 5, 3, 3

**AFTER** (reference shown: regression-mean-baseline; shape example: shape-coordinate-plot)

- ask 1 (seed bench-6-1): **Regression Baseline: Predicting the Mean** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the stated relationship. / Sample / Target / Targets / Mean prediction of 3 | values 1, 5, 0, 6, 1, 1, 2, 4, 3, 2, 4, 5, 5, 3, 3
- ask 2 (seed bench-7-2): **Predicting the Mean as a Regression Baseline** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the stated relationship. / Sample / Target / Targets / Mean prediction of 3 | values 1, 5, 0, 6, 1, 1, 2, 4, 3, 2, 4, 5, 5, 3, 3
- ask 3 (seed bench-8-3): **Regression baseline: predicting the mean** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the stated relationship. / Sample / Target / Targets / Mean prediction of 3 | values 1, 5, 0, 6, 1, 1, 2, 4, 3, 2, 4, 5, 5, 3, 3
- ask 4 (seed bench-9-4): **Predicting the mean as a regression baseline** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the stated relationship. / Sample / Target / Targets / Mean prediction of 3 | values 1, 5, 0, 6, 1, 1, 2, 4, 3, 2, 4, 5, 5, 3, 3
- ask 5 (seed bench-10-5): **Predicting the mean as a regression baseline** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the stated relationship. / Sample / Target / Targets / Mean prediction of 3 | values 1, 5, 0, 6, 1, 1, 2, 4, 3, 2, 4, 5, 5, 3, 3

**AFTER2** (reference shown: regression-mean-baseline; shape example: shape-coordinate-plot)

- ask 1 (seed bench-6-1): **Predicting the Mean as a Baseline** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the stated relationship. / Sample / Target / Targets / Mean prediction of 5 | values 1, 5, 0, 10, 1, 2, 2, 4, 3, 5, 4, 7, 5, 7, 5
- ask 2 (seed bench-7-2): **Predicting the Mean as a Regression Baseline** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the stated relationship. / Sample / Target / Targets / Mean prediction of 5 | values 1, 5, 0, 10, 1, 2, 2, 4, 3, 5, 4, 7, 5, 7, 5
- ask 3 (seed bench-8-3): **Predicting the Mean as a Regression Baseline** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the stated relationship. / Sample / Target / Targets / Mean prediction of 5 | values 1, 5, 0, 10, 1, 2, 2, 4, 3, 5, 4, 7, 5, 7, 5
- ask 4 (seed bench-9-4): **Predicting the Mean as a Regression Baseline** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the stated relationship. / Sample / Target / Targets / Mean prediction of 5 | values 1, 5, 0, 10, 1, 2, 2, 4, 3, 5, 4, 5, 5, 9, 5
- ask 5 (seed bench-10-5): **Predicting the Mean as a Regression Baseline** | coordinate-plot: Illustrative mean baseline / The mean minimizes squared errors. / Sample / Target / Targets / Mean prediction of 6 | values 1, 5, 0, 10, 1, 2, 2, 4, 3, 6, 4, 8, 5, 10, 6

**AFTER3** (reference shown: regression-mean-baseline; shape example: shape-coordinate-plot)

- ask 1 (seed bench-6-1): starting numbers sent 25, 45, 39, 42, 35, 23, 43, 32 | **Predicting the Mean as a Regression Baseline** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the stated relationship. / Sample / Target / Targets / Mean prediction of 35.5 | values 0, 8, 0, 50, 1, 25, 2, 45, 3, 39, 4, 42, 5, 35, 6, 23, 7, 43, 8, 32, 35.5
- ask 2 (seed bench-7-2): starting numbers sent 31, 32, 45, 51, 40, 29, 15, 19 | **Regression Baseline Using the Mean** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the stated relationship. / Sample / Target / Targets / Mean prediction of 32.75 | values 0, 8, 0, 60, 1, 31, 2, 32, 3, 45, 4, 51, 5, 40, 6, 29, 7, 15, 8, 19, 32.75
- ask 3 (seed bench-8-3): starting numbers sent 23, 17, 20, 11, 31, 32, 60, 47 | **Predicting the Mean as a Regression Baseline** | coordinate-plot: Constant mean baseline model / Illustrative values showing the mean prediction line against target points. / Sample / Target / Targets / Mean prediction of 20.4 | values 0, 6, 0, 70, 1, 23, 2, 17, 3, 20, 4, 11, 5, 31, 20.4
- ask 4 (seed bench-9-4): starting numbers sent 53, 30, 13, 44, 31, 11, 58, 22 | **Predicting the Mean as a Baseline** | coordinate-plot: Constant Mean Baseline / Illustrative values showing target points and the constant mean prediction. / Sample / Target / Targets / Mean prediction y = 32.75 | values 0, 9, 0, 70, 1, 53, 2, 30, 3, 13, 4, 44, 5, 31, 6, 11, 7, 58, 8, 22, 32.75
- ask 5 (seed bench-10-5): starting numbers sent 43, 45, 17, 56, 10, 27, 46, 14 | **Predicting the Mean as a Regression Baseline** | coordinate-plot: Constant Mean Baseline / Illustrative targets and mean prediction line. / Sample / Target / Targets / Mean prediction of 34.2 | values 0, 6, 0, 60, 1, 43, 2, 45, 3, 17, 4, 56, 5, 10, 34.2

Out of five, BEFORE / AFTER / AFTER2 / AFTER3: different value sets 1 / 1 / 3 / 5; different label sets 1 / 1 / 2 / 5; different whole cards 5 / 5 / 5 / 5; cards with the reference's values 5 / 5 / 0 / 0; delivered 5 / 5 / 5 / 5; valid first time 5 / 5 / 5 / 5; repairs 0 / 0 / 0 / 0.

Picture: `sheets/regression-mean-baseline.html` (AFTER2 above AFTER3 rows, five asks side by side, 408 px tiles).

### confusion-matrix-counts: Explain a confusion matrix with exact counts.

**BEFORE** (reference shown: confusion-matrix-counts; shape example: shape-heatmap)

- ask 1 (seed bench-11-1): **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted 20 are actual positives predicted negative. / Negative / Positive | values 90, 10, 20, 80, 0, 100, 1, 0
- ask 2 (seed bench-12-2): **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted 20 are actual positives predicted negative. / Negative / Positive | values 90, 10, 20, 80, 0, 100, 1, 0
- ask 3 (seed bench-13-3): **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted 20 are actual positives predicted negative. / Negative / Positive | values 90, 10, 20, 80, 0, 100, 1, 0
- ask 4 (seed bench-14-4): **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted 20 are actual positives predicted negative. / Negative / Positive | values 90, 10, 20, 80, 0, 100, 1, 0
- ask 5 (seed bench-15-5): **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted 20 are actual positives predicted negative. / Negative / Positive | values 90, 10, 20, 80, 0, 100, 1, 0

**AFTER** (reference shown: confusion-matrix-counts; shape example: shape-heatmap)

- ask 1 (seed bench-11-1): **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted 20 are actual positives predicted negative. / Negative / Positive | values 90, 10, 20, 80, 0, 100, 1, 0
- ask 2 (seed bench-12-2): **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted 20 are actual positives predicted negative. / Negative / Positive | values 90, 10, 20, 80, 0, 100, 1, 0
- ask 3 (seed bench-13-3): **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted 20 are actual positives predicted negative. / Negative / Positive | values 90, 10, 20, 80, 0, 100, 1, 0
- ask 4 (seed bench-14-4): **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted 20 are actual positives predicted negative. / Negative / Positive | values 90, 10, 20, 80, 0, 100, 1, 0
- ask 5 (seed bench-15-5): **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted 20 are actual positives predicted negative. / Negative / Positive | values 90, 10, 20, 80, 0, 100, 1, 0

**AFTER2** (reference shown: confusion-matrix-counts; shape example: shape-heatmap)

- ask 1 (seed bench-11-1): **Confusion matrix with exact counts** | heatmap: Actual and predicted classes / The highlighted cell shows actual positives predicted negative. / Negative / Positive | values 50, 10, 5, 35, 5, 50, 1, 0
- ask 2 (seed bench-12-2): **Confusion matrix with exact counts** | heatmap: Confusion matrix counts / Negative / Positive | values 50, 10, 5, 35, 0, 50
- ask 3 (seed bench-13-3): **Understanding a Confusion Matrix with Exact Counts** | heatmap: Confusion matrix for binary classifier / Counts of true/false positives and negatives for a sample model. / Negative / Positive | values 50, 10, 5, 35, 5, 50
- ask 4 (seed bench-14-4): **Confusion matrix with exact counts** | heatmap: Actual and predicted classes / The highlighted cell shows actual positives predicted negative. / Negative / Positive | values 50, 10, 5, 35, 5, 50, 1, 0
- ask 5 (seed bench-15-5): **Confusion matrix with exact counts** | heatmap: Actual and predicted classes / Counts of actual versus predicted classes. / Negative / Positive | values 50, 10, 5, 85, 0, 100, 1, 0

**AFTER3** (reference shown: confusion-matrix-counts; shape example: shape-heatmap)

- ask 1 (seed bench-11-1): starting numbers sent 29, 28, 55, 5, 46, 19, 11, 35 | **Understanding a Confusion Matrix** | heatmap: Actual and predicted classes / The highlighted cell shows false negatives. / Negative / Positive | values 55, 5, 46, 29, 5, 55, 1, 0
- ask 2 (seed bench-12-2): starting numbers sent 29, 10, 27, 19, 36, 5, 14, 58 | **Understanding a Confusion Matrix** | heatmap: Actual and predicted test counts / The matrix displays true negatives, false positives, false negatives, and true positives. / Negative / For positive | values 29, 10, 27, 19, 10, 29
- ask 3 (seed bench-13-3): starting numbers sent 26, 15, 42, 46, 12, 54, 48, 39 | **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted cells show actual positives predicted negative. / Negative / Positive | values 46, 12, 15, 42, 12, 46, 1, 0
- ask 4 (seed bench-14-4): starting numbers sent 23, 7, 17, 39, 42, 38, 28, 51 | **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted cell shows actual positives predicted as negative. / Negative / Positive | values 39, 7, 17, 23, 7, 39, 1, 0
- ask 5 (seed bench-15-5): starting numbers sent 46, 23, 28, 45, 9, 10, 34, 25 | **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted count shows actual positives predicted negative. / Negative / Positive | values 46, 23, 28, 45, 9, 46, 1, 0

Out of five, BEFORE / AFTER / AFTER2 / AFTER3: different value sets 1 / 1 / 4 / 5; different label sets 1 / 1 / 4 / 5; different whole cards 5 / 5 / 5 / 5; cards with the reference's values 5 / 5 / 0 / 0; delivered 5 / 5 / 5 / 5; valid first time 5 / 5 / 3 / 5; repairs 0 / 0 / 2 / 0.

Picture: `sheets/confusion-matrix-counts.html` (AFTER2 above AFTER3 rows, five asks side by side, 408 px tiles).

### softmax-probabilities: How do softmax probabilities compare two multiclass predictions?

**BEFORE** (reference shown: softmax-probabilities; shape example: shape-bar-chart)

- ask 1 (seed bench-16-1): **Comparing Multiclass Predictions** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / grouped / Input A / Input B | values 0.7, 0.2, 0.1, 0.15, 0.6, 0.25
- ask 2 (seed bench-17-2): **Comparing Multiclass Predictions** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / grouped / Input A / Input B | values 0.7, 0.2, 0.1, 0.15, 0.6, 0.25
- ask 3 (seed bench-18-3): **Comparing Multiclass Predictions** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / grouped / Input A / Input B | values 0.7, 0.2, 0.1, 0.15, 0.6, 0.25
- ask 4 (seed bench-19-4): **Comparing Multiclass Predictions** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / grouped / Input A / Input B | values 0.7, 0.2, 0.1, 0.15, 0.6, 0.25
- ask 5 (seed bench-20-5): **Comparing Multiclass Predictions** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / grouped / Input A / Input B | values 0.7, 0.2, 0.1, 0.15, 0.6, 0.25

**AFTER** (reference shown: softmax-probabilities; shape example: shape-bar-chart)

- ask 1 (seed bench-16-1): **Comparing Multiclass Predictions with Softmax** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / grouped / Input A / Input B | values 0.7, 0.2, 0.1, 0.15, 0.6, 0.25
- ask 2 (seed bench-17-2): **Comparing Multiclass Predictions** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / grouped / Input A / Input B | values 0.7, 0.2, 0.1, 0.15, 0.6, 0.25
- ask 3 (seed bench-18-3): **Comparing Multiclass Softmax Predictions** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / grouped / Input A / Input B | values 0.7, 0.2, 0.1, 0.15, 0.6, 0.25
- ask 4 (seed bench-19-4): **Comparing Multiclass Softmax Predictions** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / grouped / Input A / Input B | values 0.7, 0.2, 0.1, 0.15, 0.6, 0.25
- ask 5 (seed bench-20-5): **Comparing Multiclass Predictions with Softmax** | bar-chart: Illustrative softmax probability vectors / Compare categories on the shared scale. / grouped / Input A / Input B | values 0.7, 0.2, 0.1, 0.15, 0.6, 0.25

**AFTER2** (reference shown: softmax-probabilities; shape example: shape-bar-chart)

- ask 1 (seed bench-16-1): **Comparing Multiclass Softmax Predictions** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / grouped / Input A / Input B | values 0.7, 0.2, 0.1, 0.4, 0.4, 0.2
- ask 2 (seed bench-17-2): **Comparing Multiclass Softmax Predictions** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / grouped / Input A / Input B | values 0.7, 0.2, 0.1, 0.1, 0.8, 0.1
- ask 3 (seed bench-18-3): **Comparing Multiclass Predictions with Softmax** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / grouped / Input A / Input B | values 0.7, 0.2, 0.1, 0.1, 0.8, 0.1
- ask 4 (seed bench-19-4): **Comparing Softmax Predictions** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / grouped / Input A / Input B | values 0.7, 0.2, 0.1, 0.4, 0.4, 0.2
- ask 5 (seed bench-20-5): **Comparing Multiclass Softmax Probabilities** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / grouped / Input A / Input B | values 0.7, 0.2, 0.1, 0.1, 0.8, 0.1

**AFTER3** (reference shown: softmax-probabilities; shape example: shape-bar-chart)

- ask 1 (seed bench-16-1): starting numbers sent 54, 5, 29, 39, 50, 20, 55, 26 | **Comparing Softmax Probabilities** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / grouped / Input A / Input B | values 54, 5, 29, 39, 50, 20
- ask 2 (seed bench-17-2): starting numbers sent 58, 21, 13, 17, 40, 49, 41, 45 | **Comparing Multiclass Softmax Probabilities** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / grouped / Input A / Input B | values 0.58, 0.21, 0.21, 0.13, 0.4, 0.47
- ask 3 (seed bench-18-3): starting numbers sent 55, 7, 22, 54, 46, 6, 31, 10 | **Comparing Multiclass Softmax Predictions** | bar-chart: Illustrative Softmax Probabilities / Compare categories on the shared scale. / grouped / Prediction 1 / Prediction 2 | values 55, 7, 22, 54, 46, 6
- ask 4 (seed bench-19-4): starting numbers sent 39, 44, 30, 18, 23, 8, 58, 25 | **Comparing Softmax Predictions** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / grouped / Input A / Input B | values 0.7, 0.2, 0.1, 0.4, 0.4, 0.2
- ask 5 (seed bench-20-5): starting numbers sent 6, 35, 32, 7, 45, 29, 51, 60 | **Comparing Softmax Predictions** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / grouped / Input A / Input B | values 6, 35, 32, 7, 45, 29

Out of five, BEFORE / AFTER / AFTER2 / AFTER3: different value sets 1 / 1 / 2 / 5; different label sets 1 / 2 / 1 / 2; different whole cards 5 / 5 / 5 / 5; cards with the reference's values 5 / 5 / 0 / 0; delivered 5 / 5 / 5 / 5; valid first time 5 / 5 / 5 / 5; repairs 0 / 0 / 0 / 0.

Picture: `sheets/softmax-probabilities.html` (AFTER2 above AFTER3 rows, five asks side by side, 408 px tiles).

### ml-self-attention-token-links: When the word sat attends to the sentence the cat sat on the mat, which words matter most?

**BEFORE** (reference shown: ml-self-attention-token-links; shape example: shape-token-links)

- ask 1 (seed bench-21-1): **Self-attention weights for sat** | token-links: How sat attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from sat sum to 1. | values 2, 0.05, 0.45, 0.15, 0.1, 0.05, 0.2
- ask 2 (seed bench-22-2): **How “sat” attends to the sentence** | token-links: How “sat” attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from “sat” sum to 1. | values 2, 0.05, 0.45, 0.15, 0.1, 0.05, 0.2
- ask 3 (seed bench-23-3): **How “sat” attends to a sentence** | token-links: How “sat” attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from “sat” sum to 1. | values 2, 0.05, 0.45, 0.15, 0.1, 0.05, 0.2
- ask 4 (seed bench-24-4): **How “sat” attends to a sentence** | token-links: How “sat” attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from “sat” sum to 1. | values 2, 0.05, 0.45, 0.15, 0.1, 0.05, 0.2
- ask 5 (seed bench-25-5): **How “sat” attends to the sentence** | token-links: How “sat” attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from “sat” sum to one. | values 2, 0.05, 0.45, 0.15, 0.1, 0.05, 0.2

**AFTER** (reference shown: ml-self-attention-token-links; shape example: shape-token-links)

- ask 1 (seed bench-21-1): **How “sat” attends to a sentence** | token-links: Attention weights from “sat” / Thicker arrows carry more weight. These six normalized weights sum to 1, with the largest weight on cat. | values 2, 0.05, 0.45, 0.15, 0.1, 0.05, 0.2
- ask 2 (seed bench-22-2): **Attention Weights for Sat** | token-links: How sat attends to the sentence / Thicker arrows carry more weight. In this unmasked example, the six weights from sat sum to 1. | values 2, 0.05, 0.45, 0.15, 0.1, 0.05, 0.2
- ask 3 (seed bench-23-3): **Self-attention weights for sat** | token-links: How sat attends to the sentence / Thicker arrows carry more weight. In this unmasked example, the six weights sum to 1. | values 2, 0.05, 0.45, 0.15, 0.1, 0.05, 0.2
- ask 4 (seed bench-24-4): **Self-attention weights for sat** | token-links: How sat attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from sat sum to 1. | values 2, 0.05, 0.45, 0.15, 0.1, 0.05, 0.2
- ask 5 (seed bench-25-5): **How “sat” Attends to Words** | token-links: How “sat” attends to the sentence / Thicker arrows carry more weight. In this unmasked example, the six weights from “sat” sum to 1. | values 2, 0.05, 0.45, 0.15, 0.1, 0.05, 0.2

**AFTER2** (reference shown: ml-self-attention-token-links; shape example: shape-token-links)

- ask 1 (seed bench-21-1): **Self-attention weights for “sat”** | token-links: How “sat” attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from “sat” sum to 1.00. | values 2, 0.05, 0.45, 0.25, 0.05, 0.05, 0.15
- ask 2 (seed bench-22-2): **Self-Attention in Context** | token-links: How sat attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from sat sum to 1. | values 2, 0.05, 0.45, 0.2, 0.05, 0.05, 0.2
- ask 3 (seed bench-23-3): **How “sat” attends to the sentence** | token-links: Attention weights from “sat” / Arrows show how much each token contributes to the representation of “sat”. | values 2, 0.05, 0.45, 0.05, 0.1, 0.05, 0.3
- ask 4 (seed bench-24-4): **Self-attention weights for sat** | token-links: How sat attends to the sentence / Thicker arrows carry more weight. In this example, the six weights from sat sum to 1.0. | values 2, 0.05, 0.45, 0.3, 0.05, 0.05, 0.1
- ask 5 (seed bench-25-5): **Attention Weights for Sat** | token-links: How sat attends to the sentence / Thicker arrows carry more weight. In this unmasked example, the six weights from sat sum to 1.0. | values 2, 0.05, 0.1, 0.45, 0.2, 0.1, 0.1

**AFTER3** (reference shown: ml-self-attention-token-links; shape example: shape-token-links)

- ask 1 (seed bench-21-1): starting numbers sent 49, 31, 60, 22, 53, 12, 54, 15 | **How “sat” attends to the sentence** | token-links: Attention weights from “sat” / Thicker arrows carry more weight. In this unmasked example, the six weights sum to 1.0. | values 2, 0.05, 0.45, 0.2, 0.1, 0.05, 0.15
- ask 2 (seed bench-22-2): starting numbers sent 51, 13, 39, 44, 60, 34, 43, 11 | **How “sat” attends to the sentence** | token-links: How “sat” attends to the sentence / Thicker arrows carry more weight. These six weights sum to 1.00. | values 2, 0.05, 0.35, 0.4, 0.05, 0.05, 0.1
- ask 3 (seed bench-23-3): starting numbers sent 23, 25, 38, 15, 59, 60, 35, 43 | **How sat attends to the sentence** | token-links: How “sat” attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from “sat” sum to 1. | values 2, 0.23, 0.25, 0.38, 0.15, 0.59, 0.6
- ask 4 (seed bench-24-4): starting numbers sent 9, 7, 59, 38, 25, 56, 16, 28 | **Self-attention weights for sat** | token-links: How sat attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from sat sum to 1. | values 2, 0.09, 0.07, 0.59, 0.03, 0.08, 0.14
- ask 5 (seed bench-25-5): starting numbers sent 24, 19, 26, 30, 34, 51, 47, 56 | **How “sat” attends to the sentence** | token-links: How “sat” attends to the sentence / Thicker arrows carry more weight. The six weights from “sat” sum to 1.00. | values 2, 0.1, 0.24, 0.3, 0.1, 0.06, 0.2

Out of five, BEFORE / AFTER / AFTER2 / AFTER3: different value sets 1 / 1 / 5 / 5; different label sets 3 / 5 / 5 / 5; different whole cards 5 / 5 / 5 / 5; cards with the reference's values 5 / 5 / 0 / 0; delivered 5 / 5 / 5 / 5; valid first time 5 / 4 / 4 / 5; repairs 0 / 1 / 1 / 0.

Picture: `sheets/ml-self-attention-token-links.html` (AFTER2 above AFTER3 rows, five asks side by side, 408 px tiles).

## Not done (as ordered)

No CI run, no tests written or updated, no merge, no release. Numbers are not judged. The body text of every delivered card is in `results.jsonl` (field `body`).

