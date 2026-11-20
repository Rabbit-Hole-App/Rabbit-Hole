# MVP1: does the same prompt give different values?

Written by the lead from `results.jsonl` by `report.mjs`. It counts; it does not judge whether a number is right. The Reviewer recomputes the numbers from `results.jsonl`.

BEFORE = main ab40f5dc9 (clean tree; the text CLOSEST_SENTENCE is in neither tree, so no R3 code). AFTER = feat/same-json-ab (Fix A in 488513853, Fix B in 174ad7a00). Profile google-low, Balanced depth, planner on, a fresh request seed for every ask. 50 runs (5 prompts x 5 asks x 2 arms). Settled cost US$0.135 (planner estimate US$0.0002 a run included); stop line US$0.50.

Counted per prompt and arm, out of five asks:
- **value sets**: the numbers of every diagram of the card, in spec order, exact; labels ignored.
- **label sets**: the sorted set of label, heading, title, caption, detail and similar text strings of every diagram.
- **whole cards**: title, every diagram spec and the body text, exact.
- **reference values**: cards that carry a diagram whose numbers equal, exactly and in order, the numbers of the shown reference (the reference of the same id in the library).

## Summary

| prompt | reference | arm | delivered | valid first time | value sets (of 5) | label sets | whole cards | cards with the reference's values |
|---|---|---|---|---|---|---|---|---|
| ml-sampling-top-k | ml-sampling-top-k | BEFORE | 5/5 | 5/5 | 2 | 1 | 5 | 4 |
| ml-sampling-top-k | ml-sampling-top-k | AFTER | 5/5 | 5/5 | 2 | 3 | 5 | 2 |
| regression-mean-baseline | regression-mean-baseline | BEFORE | 5/5 | 5/5 | 1 | 1 | 5 | 5 |
| regression-mean-baseline | regression-mean-baseline | AFTER | 5/5 | 5/5 | 1 | 1 | 5 | 5 |
| confusion-matrix-counts | confusion-matrix-counts | BEFORE | 5/5 | 5/5 | 1 | 1 | 5 | 5 |
| confusion-matrix-counts | confusion-matrix-counts | AFTER | 5/5 | 5/5 | 1 | 1 | 5 | 5 |
| softmax-probabilities | softmax-probabilities | BEFORE | 5/5 | 5/5 | 1 | 1 | 5 | 5 |
| softmax-probabilities | softmax-probabilities | AFTER | 5/5 | 5/5 | 1 | 2 | 5 | 5 |
| ml-self-attention-token-links | ml-self-attention-token-links | BEFORE | 5/5 | 5/5 | 1 | 3 | 5 | 5 |
| ml-self-attention-token-links | ml-self-attention-token-links | AFTER | 5/5 | 4/5 | 1 | 5 | 5 | 5 |

BEFORE totals: delivered 25/25; valid first time 25/25; value sets 6 of 25; label sets 7; whole cards 25; cards with the reference's values 24.

AFTER totals: delivered 25/25; valid first time 24/25; value sets 6 of 25; label sets 12; whole cards 25; cards with the reference's values 22.

## Dry run before any provider call

Request text for five different seeds, built offline:

```
before top-k five seeds give 1 distinct request text(s)
before regression-mean-baseline five seeds give 1 distinct request text(s)
before confusion-matrix-counts five seeds give 1 distinct request text(s)
before softmax-probabilities five seeds give 1 distinct request text(s)
before ml-self-attention-token-links five seeds give 1 distinct request text(s)
after top-k five seeds give 1 distinct request text(s)
after regression-mean-baseline five seeds give 1 distinct request text(s)
after confusion-matrix-counts five seeds give 1 distinct request text(s)
after softmax-probabilities five seeds give 1 distinct request text(s)
after ml-self-attention-token-links five seeds give 1 distinct request text(s)
```

| prompt | reference in the request (both arms) | shape example (both arms) | kind | system text chars BEFORE -> AFTER | only the two Fix sentences differ |
|---|---|---|---|---|---|
| top-k | ml-sampling-top-k | shape-bar-chart | bar-chart | 16278 -> 16393 | yes |
| regression-mean-baseline | regression-mean-baseline | shape-coordinate-plot | coordinate-plot | 16520 -> 16635 | yes |
| confusion-matrix-counts | confusion-matrix-counts | shape-heatmap | heatmap | 16297 -> 16412 | yes |
| softmax-probabilities | softmax-probabilities | shape-bar-chart | bar-chart | 16107 -> 16222 | yes |
| ml-self-attention-token-links | ml-self-attention-token-links | shape-token-links | token-links | 16396 -> 16511 | yes |

The planner answer was set by hand to the reference's kind for this offline check (no provider call); the paid runs use the real planner.

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

Different value sets out of five: BEFORE 2, AFTER 2. Different label sets: BEFORE 1, AFTER 3. Different whole cards: BEFORE 5, AFTER 5. Cards with the reference's values: BEFORE 4, AFTER 2.

Picture: `sheets/ml-sampling-top-k.html` (BEFORE row above, AFTER row below, five asks side by side, 408 px tiles).

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

Different value sets out of five: BEFORE 1, AFTER 1. Different label sets: BEFORE 1, AFTER 1. Different whole cards: BEFORE 5, AFTER 5. Cards with the reference's values: BEFORE 5, AFTER 5.

Picture: `sheets/regression-mean-baseline.html` (BEFORE row above, AFTER row below, five asks side by side, 408 px tiles).

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

Different value sets out of five: BEFORE 1, AFTER 1. Different label sets: BEFORE 1, AFTER 1. Different whole cards: BEFORE 5, AFTER 5. Cards with the reference's values: BEFORE 5, AFTER 5.

Picture: `sheets/confusion-matrix-counts.html` (BEFORE row above, AFTER row below, five asks side by side, 408 px tiles).

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

Different value sets out of five: BEFORE 1, AFTER 1. Different label sets: BEFORE 1, AFTER 2. Different whole cards: BEFORE 5, AFTER 5. Cards with the reference's values: BEFORE 5, AFTER 5.

Picture: `sheets/softmax-probabilities.html` (BEFORE row above, AFTER row below, five asks side by side, 408 px tiles).

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

Different value sets out of five: BEFORE 1, AFTER 1. Different label sets: BEFORE 3, AFTER 5. Different whole cards: BEFORE 5, AFTER 5. Cards with the reference's values: BEFORE 5, AFTER 5.

Picture: `sheets/ml-self-attention-token-links.html` (BEFORE row above, AFTER row below, five asks side by side, 408 px tiles).

## Not done in MVP1 (as ordered)

No CI run, no tests written or updated, no merge, no release. The tests that quote the two changed strings (for example `explanation-prompt-cleanup.test.js`) are red on the pushed branch; that is expected here and was not fixed. Numbers are not judged. The body text of every delivered card is in `results.jsonl` (field `body`).

