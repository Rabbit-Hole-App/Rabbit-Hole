# MVP4: when the two references with dependent numbers carry variables and a function, do the wrong cards go from 5 to 0 while the values stay different on every ask?

Written by the lead from `results.jsonl` by `report.mjs`. It counts; it does not judge whether a number is right. The Reviewer and the owner recompute the numbers from `results.jsonl`.

BEFORE, AFTER, AFTER2 and AFTER3 are the MVP1 to MVP3 runs, not re-run. **AFTER4** = feat/same-json-mvp4 (the MVP3 branch plus the `variables` block, the two functions, the server step and the {{v:name}} placeholders; see "What was built" below). Profile google-low, Balanced depth, planner on, a different seed for every ask. 25 AFTER4 asks. **Two attempts:** the first attempt (25 runs on the first commit 8da568208) made no card for any of the 10 top-k and softmax asks ("the diagram has no variables list"): the author-key strip removed the variables list Gemini wrote (found, fixed in 26675b9e1). Those 10 asks were run again on the fixed tree (rerun); the other 15 asks of the first attempt are unchanged by the fix (their requests carry no variables list) and are kept. The first attempt's 25 records are in results-attempt1.jsonl, the rerun's 10 in results-rerun.jsonl, the 25 counted here in results.jsonl. Settled cost: first attempt about US$0.140, rerun about US$0.057, the 25 counted asks about US$0.108 (planner estimate included); stop line US$0.30 each. Whether a number is right is not judged here.

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
| ml-sampling-top-k | AFTER4 | 4/5 | 0/5 | 6 | 4 | 4 | 4 | 0 |
| regression-mean-baseline | BEFORE | 5/5 | 5/5 | 0 | 1 | 1 | 5 | 5 |
| regression-mean-baseline | AFTER | 5/5 | 5/5 | 0 | 1 | 1 | 5 | 5 |
| regression-mean-baseline | AFTER2 | 5/5 | 5/5 | 0 | 3 | 2 | 5 | 0 |
| regression-mean-baseline | AFTER3 | 5/5 | 5/5 | 0 | 5 | 5 | 5 | 0 |
| regression-mean-baseline | AFTER4 | 5/5 | 5/5 | 0 | 5 | 5 | 5 | 0 |
| confusion-matrix-counts | BEFORE | 5/5 | 5/5 | 0 | 1 | 1 | 5 | 5 |
| confusion-matrix-counts | AFTER | 5/5 | 5/5 | 0 | 1 | 1 | 5 | 5 |
| confusion-matrix-counts | AFTER2 | 5/5 | 3/5 | 2 | 4 | 4 | 5 | 0 |
| confusion-matrix-counts | AFTER3 | 5/5 | 5/5 | 0 | 5 | 5 | 5 | 0 |
| confusion-matrix-counts | AFTER4 | 5/5 | 4/5 | 1 | 5 | 5 | 5 | 0 |
| softmax-probabilities | BEFORE | 5/5 | 5/5 | 0 | 1 | 1 | 5 | 5 |
| softmax-probabilities | AFTER | 5/5 | 5/5 | 0 | 1 | 2 | 5 | 5 |
| softmax-probabilities | AFTER2 | 5/5 | 5/5 | 0 | 2 | 1 | 5 | 0 |
| softmax-probabilities | AFTER3 | 5/5 | 5/5 | 0 | 5 | 2 | 5 | 0 |
| softmax-probabilities | AFTER4 | 5/5 | 5/5 | 0 | 5 | 1 | 5 | 0 |
| ml-self-attention-token-links | BEFORE | 5/5 | 5/5 | 0 | 1 | 3 | 5 | 5 |
| ml-self-attention-token-links | AFTER | 5/5 | 4/5 | 1 | 1 | 5 | 5 | 5 |
| ml-self-attention-token-links | AFTER2 | 5/5 | 4/5 | 1 | 5 | 5 | 5 | 0 |
| ml-self-attention-token-links | AFTER3 | 5/5 | 5/5 | 0 | 5 | 5 | 5 | 0 |
| ml-self-attention-token-links | AFTER4 | 5/5 | 4/5 | 1 | 5 | 5 | 5 | 0 |

BEFORE totals: delivered 25/25; valid first time 25/25; repairs 0; value sets 6 of 25; label sets 7; whole cards 25; cards with the reference's values 24.

AFTER totals: delivered 25/25; valid first time 24/25; repairs 1; value sets 6 of 25; label sets 12; whole cards 25; cards with the reference's values 22.

AFTER2 totals: delivered 25/25; valid first time 22/25; repairs 3; value sets 15 of 25; label sets 15; whole cards 25; cards with the reference's values 0.

AFTER3 totals: delivered 25/25; valid first time 24/25; repairs 1; value sets 25 of 25; label sets 22; whole cards 25; cards with the reference's values 0.

AFTER4 totals: delivered 24/25; valid first time 18/25; repairs 8; value sets 24 of 25; label sets 20; whole cards 24; cards with the reference's values 0.

## Dry run before any provider call

| prompt | reference has a calculation | request identical to MVP3 | Gemini answer schema properties AFTER3 -> AFTER4 (limit 362) | variables list in the answer schema | system text chars AFTER3 -> AFTER4 |
|---|---|---|---|---|---|
| top-k | yes | no | 28 -> 36 | yes | 16664 -> 17236 |
| regression-mean-baseline | no | yes, byte for byte (system text and answer schema) | 104 -> 104 | no | 16923 -> 16923 |
| confusion-matrix-counts | no | yes, byte for byte (system text and answer schema) | 31 -> 31 | no | 16678 -> 16678 |
| softmax-probabilities | yes | no | 28 -> 36 | yes | 16477 -> 17069 |
| ml-self-attention-token-links | no | yes, byte for byte (system text and answer schema) | 25 -> 25 | no | 16767 -> 16767 |

The planner answer was set by hand to the reference's kind for this offline check (no provider call); the paid runs use the real planner. The seed used is the first ask of each prompt (bench-<n>-1).

The top-k examples block, exactly as sent (the text from `# Examples` to the next heading; seed bench-1-1):

```text
# Examples
Approved diagram references (examples, not source facts). An example on this card's subject shows a correct structure: keep its structure and its facts. Write your own version of what is illustrative in it: the example items, their names, the input values and the title. Do not copy an example's values, labels or prose, force a reference, or exceed this card's visual count. A "?" in an example stands for a number that was removed: choose your own. For this card, build your input values from these starting numbers, in this order, scaling or rounding them where the diagram needs shares or weights: 39, 53, 24, 51, 40, 6, 17, 41. You choose the inputs of the variables list; the results are computed for you from them, and a number from the variables written in a title, a caption or a sentence is written as {{v:name}}, never typed.
{"id":"shape-bar-chart","useWhen":"Shape example for a bar-chart diagram on another subject. Use its structure, not its content.","spec":{"version":1,"diagram":{"title":"Library loans","kind":"bar-chart","unit":"books","bars":[{"label":"Monday","value":12},{"label":"Tuesday","value":18}]}}}
{"id":"ml-sampling-top-k","useWhen":"Compare the full model distribution with the filtered distribution used for sampling. A reported probability depends on which distribution is logged.","spec":{"version":1,"diagram":{"title":"Full softmax and top-{{v:k}} sampling","caption":"The kept tokens originally hold {{v:keptShare}}% of the probability. Divide each kept probability by that total.","kind":"bar-chart","unit":"%","variant":"grouped","categories":["on","near","under","by","in"],"series":[{"label":"Full softmax","values":["?","?","?","?","?"]},{"label":"Top-? renormalized","values":["?","?","?","?","?"]}],"variables":[{"name":"full","role":"input","type":"float","min":0,"max":100,"at":"series.0.values"},{"name":"k","role":"input","type":"int","min":1,"max":7,"value":"?"},{"name":"renormalized","role":"result","type":"float","min":0,"max":100,"at":"series.1.values"},{"name":"keptShare","role":"result","type":"float","min":1,"max":100,"value":"?"}]}}}
```

The softmax-probabilities examples block, exactly as sent (the text from `# Examples` to the next heading; seed bench-16-1):

```text
# Examples
Approved diagram references (examples, not source facts). An example on this card's subject shows a correct structure: keep its structure and its facts. Write your own version of what is illustrative in it: the example items, their names, the input values and the title. Do not copy an example's values, labels or prose, force a reference, or exceed this card's visual count. A "?" in an example stands for a number that was removed: choose your own. For this card, build your input values from these starting numbers, in this order, scaling or rounding them where the diagram needs shares or weights: 54, 5, 29, 39, 50, 20, 55, 26. You choose the inputs of the variables list; the results are computed for you from them, and a number from the variables written in a title, a caption or a sentence is written as {{v:name}}, never typed.
{"id":"shape-bar-chart","useWhen":"Shape example for a bar-chart diagram on another subject. Use its structure, not its content.","spec":{"version":1,"diagram":{"title":"Library loans","kind":"bar-chart","unit":"books","bars":[{"label":"Monday","value":12},{"label":"Tuesday","value":18}]}}}
{"id":"softmax-probabilities","useWhen":"Group two normalized probability vectors by class.","spec":{"version":1,"diagram":{"title":"Two softmax probability vectors","caption":"Illustrative values; compare categories on the shared scale.","kind":"bar-chart","variant":"grouped","categories":["Cat","Dog","Bird"],"series":[{"label":"Input A","values":["?","?","?"]},{"label":"Input B","values":["?","?","?"]}],"variables":[{"name":"weightsA","role":"input","type":"float","min":1,"max":1000,"value":["?","?","?"]},{"name":"weightsB","role":"input","type":"float","min":1,"max":1000,"value":["?","?","?"]},{"name":"probabilitiesA","role":"result","type":"float","min":0,"max":1,"at":"series.0.values"},{"name":"probabilitiesB","role":"result","type":"float","min":0,"max":1,"at":"series.1.values"}]}}}
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

**AFTER4** (reference shown: ml-sampling-top-k; shape example: shape-bar-chart)

- ask 1 (seed bench-1-1): starting numbers sent 39, 53, 24, 51, 40, 6, 17, 41 | inputs chosen full=[18.84,25.6,11.59,24.64,19.32] k=3; server overwrote renormalized, keptShare (author wrote renormalized=[0,36.8,0,35.4,27.8]; keptShare=69.6); first answer refused, explanation_bad_calculation: the inputs are refused: k must be a whole number from 1 to 4, below the 5 items; delivered by fireworks | **Effect of Top‑k Filtering on Token Probabilities** | bar-chart: Full vs Top‑3 Renormalized Probabilities / Top‑3 tokens keep 69.56% of total probability; their shares are renormalized. / % / grouped / Full softmax / Top‑3 r... | values 18.84, 25.6, 11.59, 24.64, 19.32, 0, 37, 0, 35, 28
- ask 2 (seed bench-2-2): starting numbers sent 6, 57, 41, 48, 43, 34, 37, 47 | no server step recorded; repair also failed: explanation_bad_calculation: input k must be a number | **no card: validation_error**
- ask 3 (seed bench-3-3): starting numbers sent 31, 42, 47, 55, 20, 36, 37, 15 | inputs chosen full=[31,22,17,20,10] k=4; server overwrote renormalized (author wrote renormalized=[34,24,19,23,0]); first answer refused, explanation_bad_calculation: the inputs are refused: the first row must add to 100 (it adds to 195); delivered by google | **Top-k filtering and reported token probabilities** | bar-chart: Full softmax and top-4 sampling / The kept tokens originally hold 90% of the probability. Divide each kept probability by that total. / % / grouped / Full soft... | values 31, 22, 17, 20, 10, 35, 24, 19, 22, 0
- ask 4 (seed bench-4-4): starting numbers sent 38, 56, 51, 17, 39, 60, 10, 25 | inputs chosen full=[20,30,25,10,15] k=3; server overwrote renormalized (author wrote renormalized=[26.67,40,33.33,0,0]); first answer refused, explanation_bad_calculation: the inputs are refused: the first row must add to 100 (it adds to 201); delivered by google | **Top-k filtering and token probabilities** | bar-chart: Full softmax and top-3 sampling / The kept tokens originally hold 75% of the probability. Divide each kept probability by that total. / % / grouped / Full soft... | values 20, 30, 25, 10, 15, 27, 40, 33, 0, 0
- ask 5 (seed bench-5-5): starting numbers sent 53, 5, 16, 9, 58, 57, 6, 13 | inputs chosen full=[40,10,20,15,15] k=4; server overwrote renormalized, keptShare (author wrote renormalized=[47.1,0,23.5,17.6,11.8]; keptShare=85); first answer refused, explanation_bad_calculation: the inputs are refused: the first row must add to 100 (it adds to 141); delivered by google | **Top-k Filtering and Token Probabilities** | bar-chart: Full softmax and top-4 sampling / The kept tokens originally hold 90% of the probability. Divide each kept probability by that total. / % / grouped / Full soft... | values 40, 10, 20, 15, 15, 44, 0, 22, 17, 17

Out of five, BEFORE / AFTER / AFTER2 / AFTER3 / AFTER4: different value sets 2 / 2 / 1 / 5 / 4; different label sets 1 / 3 / 3 / 5 / 4; different whole cards 5 / 5 / 5 / 5 / 4; cards with the reference's values 4 / 2 / 0 / 0 / 0; delivered 5 / 5 / 5 / 5 / 4; valid first time 5 / 5 / 5 / 4 / 0; repairs 0 / 0 / 0 / 1 / 6.

Picture: `sheets/ml-sampling-top-k.html` (AFTER3 above AFTER4 rows, five asks side by side, 408 px tiles).

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

**AFTER4** (reference shown: regression-mean-baseline; shape example: shape-coordinate-plot)

- ask 1 (seed bench-6-1): starting numbers sent 25, 45, 39, 42, 35, 23, 43, 32 | no calculation for this reference | **Regression Baseline: Predicting the Mean** | coordinate-plot: A constant mean baseline / Illustrative values; the horizontal mean line minimizes squared error. / Sample / Target / Targets / Mean prediction $\bar{y} = 35.5$ | values 1, 8, 20, 50, 1, 25, 2, 45, 3, 39, 4, 42, 5, 35, 6, 23, 7, 43, 8, 32, 35.5
- ask 2 (seed bench-7-2): starting numbers sent 31, 32, 45, 51, 40, 29, 15, 19 | no calculation for this reference | **Regression baseline with mean prediction** | coordinate-plot: Constant mean baseline / Illustrative values showing targets and the mean prediction line. / Sample index / Target value / Targets / Mean $32.75$ | values 0, 8, 0, 60, 1, 31, 2, 32, 3, 45, 4, 51, 5, 40, 6, 29, 7, 15, 8, 19, 32.75
- ask 3 (seed bench-8-3): starting numbers sent 23, 17, 20, 11, 31, 32, 60, 47 | no calculation for this reference | **Predicting the Mean as a Regression Baseline** | coordinate-plot: Constant Mean Baseline / Illustrative values showing the mean prediction line against targets. / Sample / Target / Targets / Mean prediction at 20.4 | values 0, 6, 0, 60, 1, 23, 2, 17, 3, 20, 4, 11, 5, 31, 20.4
- ask 4 (seed bench-9-4): starting numbers sent 53, 30, 13, 44, 31, 11, 58, 22 | no calculation for this reference | **Predicting the Mean as a Regression Baseline** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the constant mean prediction against targets. / Sample / Target / Targets / Mean prediction ... | values 0, 9, 0, 70, 1, 53, 2, 30, 3, 13, 4, 44, 5, 31, 6, 11, 7, 58, 8, 22, 32.75
- ask 5 (seed bench-10-5): starting numbers sent 43, 45, 17, 56, 10, 27, 46, 14 | no calculation for this reference | **Predicting the Mean as a Regression Baseline** | coordinate-plot: A constant mean baseline / Illustrative values; targets plotted against a constant mean prediction. / Sample / Target / Targets / Mean prediction of 34.2 | values 0, 6, 0, 60, 1, 43, 2, 45, 3, 17, 4, 56, 5, 10, 34.2

Out of five, BEFORE / AFTER / AFTER2 / AFTER3 / AFTER4: different value sets 1 / 1 / 3 / 5 / 5; different label sets 1 / 1 / 2 / 5 / 5; different whole cards 5 / 5 / 5 / 5 / 5; cards with the reference's values 5 / 5 / 0 / 0 / 0; delivered 5 / 5 / 5 / 5 / 5; valid first time 5 / 5 / 5 / 5 / 5; repairs 0 / 0 / 0 / 0 / 0.

Picture: `sheets/regression-mean-baseline.html` (AFTER3 above AFTER4 rows, five asks side by side, 408 px tiles).

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

**AFTER4** (reference shown: confusion-matrix-counts; shape example: shape-heatmap)

- ask 1 (seed bench-11-1): starting numbers sent 29, 28, 55, 5, 46, 19, 11, 35 | no calculation for this reference; first answer refused, explanation_missing_visual: the card needs one to three visuals, an rh-diagram or an rh-illustration fence, ea; delivered by fireworks | **Confusion matrix with exact counts** | heatmap: Confusion matrix with exact counts / Heatmap shows counts; darker color = higher count / Negative / Positive | values 46, 19, 11, 35, 11, 46, 1, 1
- ask 2 (seed bench-12-2): starting numbers sent 29, 10, 27, 19, 36, 5, 14, 58 | no calculation for this reference | **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted cell shows actual positives predicted negative. / Negative / Positive | values 58, 10, 19, 36, 10, 58, 1, 0
- ask 3 (seed bench-13-3): starting numbers sent 26, 15, 42, 46, 12, 54, 48, 39 | no calculation for this reference | **Confusion matrix with exact counts** | heatmap: Actual and predicted classes / The highlighted cell shows actual positives predicted as negative. / Negative / Positive | values 26, 15, 42, 46, 15, 46, 1, 0
- ask 4 (seed bench-14-4): starting numbers sent 23, 7, 17, 39, 42, 38, 28, 51 | no calculation for this reference | **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted cells show actual positives predicted as negative. / Negative / Positive | values 39, 23, 7, 51, 7, 51, 1, 0
- ask 5 (seed bench-15-5): starting numbers sent 46, 23, 28, 45, 9, 10, 34, 25 | no calculation for this reference | **Confusion matrix with exact counts** | heatmap: Actual and predicted classes / The matrix displays true classes against model predictions. / Negative / Positive | values 46, 23, 28, 45, 9, 46

Out of five, BEFORE / AFTER / AFTER2 / AFTER3 / AFTER4: different value sets 1 / 1 / 4 / 5 / 5; different label sets 1 / 1 / 4 / 5 / 5; different whole cards 5 / 5 / 5 / 5 / 5; cards with the reference's values 5 / 5 / 0 / 0 / 0; delivered 5 / 5 / 5 / 5 / 5; valid first time 5 / 5 / 3 / 5 / 4; repairs 0 / 0 / 2 / 0 / 1.

Picture: `sheets/confusion-matrix-counts.html` (AFTER3 above AFTER4 rows, five asks side by side, 408 px tiles).

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

**AFTER4** (reference shown: softmax-probabilities; shape example: shape-bar-chart)

- ask 1 (seed bench-16-1): starting numbers sent 54, 5, 29, 39, 50, 20, 55, 26 | inputs chosen weightsA=[54,5,29] weightsB=[39,50,20]; server overwrote probabilitiesA, probabilitiesB (author wrote probabilitiesA=[0.7,0.2,0.1]; probabilitiesB=[0.15,0.75,0.1]) | **Comparing Multiclass Predictions** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / grouped / Input A / Input B | values 0.61, 0.06, 0.33, 0.36, 0.46, 0.18
- ask 2 (seed bench-17-2): starting numbers sent 58, 21, 13, 17, 40, 49, 41, 45 | inputs chosen weightsA=[58,21,21] weightsB=[40,49,11]; server overwrote nothing (the results the author wrote were already those of the function) | **Comparing Softmax Probabilities** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / grouped / Input A / Input B | values 0.58, 0.21, 0.21, 0.4, 0.49, 0.11
- ask 3 (seed bench-18-3): starting numbers sent 55, 7, 22, 54, 46, 6, 31, 10 | inputs chosen weightsA=[55,7,22] weightsB=[6,54,46]; server overwrote probabilitiesA, probabilitiesB (author wrote probabilitiesA=[0.7,0.2,0.1]; probabilitiesB=[0.1,0.8,0.1]) | **Comparing Multiclass Softmax Probabilities** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / grouped / Input A / Input B | values 0.66, 0.08, 0.26, 0.06, 0.51, 0.43
- ask 4 (seed bench-19-4): starting numbers sent 39, 44, 30, 18, 23, 8, 58, 25 | inputs chosen weightsA=[39,44,30] weightsB=[18,23,18]; server overwrote probabilitiesA, probabilitiesB (author wrote probabilitiesA=[0.7,0.2,0.1]; probabilitiesB=[0.33,0.34,0.33]) | **Comparing Multiclass Softmax Predictions** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / grouped / Input A / Input B | values 0.34, 0.39, 0.27, 0.31, 0.39, 0.3
- ask 5 (seed bench-20-5): starting numbers sent 6, 35, 32, 7, 45, 29, 51, 60 | inputs chosen weightsA=[6,35,32] weightsB=[7,45,29]; server overwrote probabilitiesA, probabilitiesB (author wrote probabilitiesA=[0.1,0.7,0.2]; probabilitiesB=[0.5,0.3,0.2]) | **Comparing Softmax Probabilities** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / grouped / Input A / Input B | values 0.08, 0.48, 0.44, 0.09, 0.55, 0.36

Out of five, BEFORE / AFTER / AFTER2 / AFTER3 / AFTER4: different value sets 1 / 1 / 2 / 5 / 5; different label sets 1 / 2 / 1 / 2 / 1; different whole cards 5 / 5 / 5 / 5 / 5; cards with the reference's values 5 / 5 / 0 / 0 / 0; delivered 5 / 5 / 5 / 5 / 5; valid first time 5 / 5 / 5 / 5 / 5; repairs 0 / 0 / 0 / 0 / 0.

Picture: `sheets/softmax-probabilities.html` (AFTER3 above AFTER4 rows, five asks side by side, 408 px tiles).

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

**AFTER4** (reference shown: ml-self-attention-token-links; shape example: shape-token-links)

- ask 1 (seed bench-21-1): starting numbers sent 49, 31, 60, 22, 53, 12, 54, 15 | no calculation for this reference | **How “sat” attends to the sentence** | token-links: Attention weights from “sat” / Thicker arrows carry more weight. In this example, the six weights from “sat” sum to 1.00. | values 2, 0.1, 0.4, 0.2, 0.1, 0.05, 0.15
- ask 2 (seed bench-22-2): starting numbers sent 51, 13, 39, 44, 60, 34, 43, 11 | no calculation for this reference; first answer refused, explanation_missing_visual: the card needs one to three visuals, an rh-diagram or an rh-illustration fence, ea; delivered by fireworks | **How “sat” attends to the sentence** | token-links: How “sat” attends to the sentence / Arrows show attention weights from “sat” to each token; thicker arrows mean larger weight. | values 2, 0.212, 0.054, 0, 0.183, 0.249, 0.141
- ask 3 (seed bench-23-3): starting numbers sent 23, 25, 38, 15, 59, 60, 35, 43 | no calculation for this reference | **Self-Attention Weights for Sat** | token-links: How sat attends to the sentence / Thicker, darker arrows carry more weight. The six weights from sat sum to 1.0. | values 2, 0.1, 0.25, 0.45, 0.05, 0.05, 0.1
- ask 4 (seed bench-24-4): starting numbers sent 9, 7, 59, 38, 25, 56, 16, 28 | no calculation for this reference | **How sat attends to the sentence** | token-links: How sat attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from sat sum to 1. | values 2, 0.09, 0.11, 0.38, 0.16, 0.09, 0.17
- ask 5 (seed bench-25-5): starting numbers sent 24, 19, 26, 30, 34, 51, 47, 56 | no calculation for this reference | **How “sat” attends to the sentence** | token-links: How “sat” attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from “sat” sum to 1. | values 2, 0.12, 0.24, 0.3, 0.05, 0.09, 0.2

Out of five, BEFORE / AFTER / AFTER2 / AFTER3 / AFTER4: different value sets 1 / 1 / 5 / 5 / 5; different label sets 3 / 5 / 5 / 5 / 5; different whole cards 5 / 5 / 5 / 5 / 5; cards with the reference's values 5 / 5 / 0 / 0 / 0; delivered 5 / 5 / 5 / 5 / 5; valid first time 5 / 4 / 4 / 5 / 4; repairs 0 / 1 / 1 / 0 / 1.

Picture: `sheets/ml-self-attention-token-links.html` (AFTER3 above AFTER4 rows, five asks side by side, 408 px tiles).

## Offline replay: the ten AFTER3 cards of top-k and softmax-probabilities through the new server step

No provider call. The AFTER3 cards carry no `variables` list (the author was not asked for one), so one was written for each from what the card draws, under the reference's own names: for top-k the first row is `full` and `k` is the number of items the card's second row keeps (k is not drawn, so it is read from that row); for softmax the two rows are read as the raw weights. The step then ran as it would on a card carrying that list. `replay.mjs` and `replay.json` hold the details. A card whose rows do not fit the limits is a card problem here (the replay's reading of the shape, not a finding about the card).

| card (seed) | reference | wrong in AFTER3 (the owner's list) | server step | rows before | rows after | title before / after |
|---|---|---|---|---|---|---|
| bench-1-1 | ml-sampling-top-k |  | overwrote ["renormalized","keptShare"] | [[39,24,19,12,6],[47.5,29.3,23.2,0,0]] | [[39,24,19,12,6],[48,29,23,0,0]] | Full softmax and top-3 sampling (unchanged) |
| bench-2-2 | ml-sampling-top-k | yes | overwrote ["renormalized","keptShare"] | [[50,30,10,6,4],[55.6,33.3,11.1,0,0]] | [[50,30,10,6,4],[56,33,11,0,0]] | Full softmax and top-3 sampling (unchanged) |
| bench-3-3 | ml-sampling-top-k |  | card problem: explanation_bad_calculation: the inputs are refused: k must be a whole number from 1 to 2, below the 3 items | [[50,30,20],[50,30,20]] | null | Full softmax and top-3 sampling (unchanged) |
| bench-4-4 | ml-sampling-top-k | yes | overwrote ["renormalized","keptShare"] | [[38,32,20,7,3],[54.3,45.7,0,0,0]] | [[38,32,20,7,3],[54,46,0,0,0]] | Full softmax and top-3 sampling (unchanged) |
| bench-5-5 | ml-sampling-top-k |  | card problem: explanation_bad_calculation: the inputs are refused: k must be a whole number from 1 to 2, below the 3 items | [[53,16,8],[69,21,10]] | null | Full softmax and top-3 sampling (unchanged) |
| bench-16-1 | softmax-probabilities | yes | overwrote ["probabilitiesA","probabilitiesB"] | [[54,5,29],[39,50,20]] | [[0.61,0.06,0.33],[0.36,0.46,0.18]] | Two softmax probability vectors (unchanged) |
| bench-17-2 | softmax-probabilities |  | card problem: explanation_bad_calculation: input weightsA must be from 1 to 1000 (got 0.58) | [[0.58,0.21,0.21],[0.13,0.4,0.47]] | null | Two softmax probability vectors (unchanged) |
| bench-18-3 | softmax-probabilities | yes | overwrote ["probabilitiesA","probabilitiesB"] | [[55,7,22],[54,46,6]] | [[0.66,0.08,0.26],[0.51,0.43,0.06]] | Illustrative Softmax Probabilities (unchanged) |
| bench-19-4 | softmax-probabilities |  | card problem: explanation_bad_calculation: input weightsA must be from 1 to 1000 (got 0.7) | [[0.7,0.2,0.1],[0.4,0.4,0.2]] | null | Two softmax probability vectors (unchanged) |
| bench-20-5 | softmax-probabilities | yes | overwrote ["probabilitiesA","probabilitiesB"] | [[6,35,32],[7,45,29]] | [[0.08,0.48,0.44],[0.09,0.55,0.36]] | Two softmax probability vectors (unchanged) |

What the step does to the five wrong cards (a count of what it can and cannot reach, not a judgement of the numbers): **softmax bench-16-1, bench-18-3, bench-20-5**: the rows become shares of the raw weights that add to 1 (the rows were the raw starting numbers). **top-k bench-2-2 and bench-4-4**: the second row is overwritten by the function's row and the kept share is recomputed; the typed sentences are not touched by the step: the caption "80 %" of bench-2-2 and the title and series label "top-3" of bench-4-4 stay as written (the replay cards were written without placeholders; in AFTER4 the title and caption carry {{v:...}} and are filled, the series label is not).

## What was built (branch feat/same-json-mvp4, commits 8da568208 and 26675b9e1)

- `variables`: an optional list on every diagram kind, defined once beside title and caption (spec.js `titled`). Entry: name (letters and digits, up to 24), role input or result, type int or float, min, max, and exactly one of `at` (a dot path) or `value` (a number or a list of up to 12 numbers). At most 8 entries. It is in no JSON schema a model is shown by default (stripped from the full and the author schemas); the bundle of a card whose shown reference has a calculation gets it back, required, on the branch of that reference's kind only. Gemini answer schema properties for top-k and softmax: 28 to 36 (limit 362).
- `calculation.js` (web): `runCalculation` reads the inputs through `variables`, checks type and limits, runs the function, checks the results, writes them; `fillVariableText` fills {{v:name}} and {{v:name.N}}.
- top-k (ml-sampling-top-k-data.js): `topK({ full, k })`; softmax (ml-softmax-probabilities-data.js): `softmaxProbabilities({ weightsA, weightsB })`. Both use `normalise`.
- The stored numbers of both references come from their functions and equal the old ones (the stored specs are equal to the old specs apart from the added `variables`; svg-snapshots.json is untouched and its test passes).
- Server step: explanation-calculation.js, called in learn-artifact.js after the diagram corrections and before the prose tokens. A problem is thrown as explanation_bad_calculation and goes to the one repair (after it, no card for that provider step).
- The example shown to Gemini: numbers as "?" (MVP2), the `variables` list kept with its limits (only a stored `value` is masked), the title and caption as templates with {{v:name}}; the MVP3 starting numbers stay; one sentence ends the heading: "You choose the inputs of the variables list; the results are computed for you from them, and a number from the variables written in a title, a caption or a sentence is written as {{v:name}}, never typed."

## Choices made while building

1. **Limits.** top-k: full 0 to 100 (float), k 1 to 7 (int), renormalized 0 to 100, keptShare 1 to 100. softmax: each weight 1 to 1000, each probability 0 to 1. The function's own refusals: top-k needs at least two items, k a whole number from 1 to n-1, a first row adding to 100 (within 0.01) and a kept share above 0; softmax needs at least two weights above 0 in each list and the two lists of equal length.
2. **Whose limits.** The server checks against the reference's own limits and function, not against the min and max the author wrote in its `variables` entries; the author's entries give the name, role and where (`at` or `value`).
3. **Which diagram.** The calculation applies to the first diagram of the card whose kind equals the kind of the shown reference's diagram (no reference id and no kind name in the server step; the kind is read from the reference).
4. **Placeholders.** {{v:name}} and, for a list, {{v:name.N}} (N from 0), filled in the diagram's title and caption and in the prose. A placeholder left anywhere is refused (leftoverToken). A series label is not filled: the example's series label "Top-? renormalized" still carries a number the author writes itself (so it can disagree with k).
5. **Rounding.** top-k: the kept shares as whole percents of the kept total by `normalise` at two decimals (they add to exactly 100); the kept share is the sum of the kept first-row values. softmax: `normalise` at two decimals (each row adds to exactly 1).
6. **top-k first row.** Taken as percents adding to 100 (not any starting numbers); starting numbers that do not add to 100 are a card problem unless the author scales them, which the example's sentence about scaling asks for.
7. **A bug found by the first attempt.** The server's author-key strip (learn-primitives.js stripUnknown) removed `variables` as an unknown key. It now lets the `variables` key through on any diagram, as the parser accepts it. Commit 26675b9e1.
8. **Tests.** Two existing test files knew nothing of the new list: kind-limits.test.mjs (list builders for `variables`) and ml-plot.test.mjs (its local schema accepts a `variables` list). tutor-diagrams directory afterwards: 1624 of 1624 (svg-snapshots.json unchanged and its test passing). The 50 control-plane explanation tests that were red on MVP3 (the Fix A and Fix B wording and the masked examples) are the same 50 on this branch; none new.
9. **Harness.** The run records of this arm carry one more field, `calculation` (the reference, the inputs, what the author wrote for the results, the results the function gave, what was overwritten).

## Not done (as ordered)

No CI run, no tests written or updated, no merge, no release. Numbers are not judged. The body text of every delivered card is in `results.jsonl` (field `body`).

