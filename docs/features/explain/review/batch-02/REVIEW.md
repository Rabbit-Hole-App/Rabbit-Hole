# Review of batch 02 (Claude, 2026-11-09)

Read from the repo: every `card.md`, the spec and every `visual-1.png` (the ten visuals as the learner sees them at 440 px). The cards were generated once on the 117 candidate (7f1d0f562), Balanced, and not touched. No fix pass was run. Pictures: none of the ten prompts asks for one.

Columns: **kind** = the drawn kind against the expected shape; **complete** = what the expected shape names is on the visual; **labels** = placeholders, duplicates, maths outside `$...$`; **numbers** = values on the visual against the prose; **points** = the prose tells the reader what to look for.

| # | Card | Kind | Complete | Labels | Numbers | Points at visual | Verdict |
|---|---|---|---|---|---|---|---|
| 01 | what is overfitting | yes (coordinate-plot) | yes: observed points once, simple fit, overfit curve, one annotated held-out point (1.5, 3.5), caption says what to notice; reference ml-fit-quality-comparison-single selected | ok | consistent with the caption | yes | **ship** |
| 02 | maximum likelihood | yes (coordinate-plot) | partly: the peak is marked, but the caption is empty | ok | **wrong**: the example is 7 heads in 10 flips (peak at 0.7); the plot puts the maximum at the parameter value 5 on an axis of 0 to 10, and the y ticks are 0, 10, 20, 25 | yes | **fix** |
| 03 | cross-validation | acceptable (bar-chart; expected grouped bars per fold) | **no**: four bars by model complexity (simple/complex, train/test); no folds, no gap across folds, nothing shows how cross-validation detects the problem; only shape-bar-chart selected | ok | 0.02 against 0.45 matches the prose | yes | **fix** |
| 04 | gradient descent | yes (coordinate-plot, contours) | partly: three steps are listed, but the "contours" are an 8-sided and a 4-sided polygon with markers on the corners, not a quadratic bowl; a stray point at (-2, 0); step 1 starts at the edge | ok | step coordinates are consistent with each other | **no** | **fix** |
| 05 | learning-rate schedule | yes (coordinate-plot) | yes: step decay (4 points, plateaus) and exponential decay (a straight line on the labelled log axis) | ok | consistent with the prose | yes | **ship** |
| 06 | k-means | yes (coordinate-plot scatter) | **no**: one centroid moving from (1, 1) to (3, 3) and two points; the prose says k = 3 clusters, so no clusters and no re-assignment are drawn; reference kmeans-centroid-update selected | ok | consistent | yes | **fix** |
| 07 | positional encoding | yes (coordinate-plot) | **no**: one series "PE (freq 1)", expected two or three sinusoids; the curve is irregular (unequal peaks and periods): it is a smoothed line through a few sampled points, not a sine | ok (maths in `$...$`) | the curve contradicts the formula in the prose | yes, but "plot above" is placed before the formula paragraph and the visual comes after it | **wrong** |
| 08 | attention weights | yes (token-links) | **no**: two tokens only; the heavy link (0.75) goes from "kite" to itself, the prose says kite attends to "red"; the weight to "red" is not labelled; the caption is empty; only shape-token-links selected (no walkthrough reference) | ok | the prose says the weights sum to one, the visual shows 0.75 and an unlabelled link | yes, but the sentence is cut in two by the visual marker ("Look at the weight distribution in / [visual] / where the queries link...") | **wrong** |
| 09 | backpropagation | yes (flow) | yes: forward pass, loss, start of the backward pass, derivatives on the edges, chain rule at output and hidden layer, update; nine nodes in a column (846 px card) | ok (`$\partial L/\partial \hat y$`) | n/a | yes | **ship** |
| 10 | call stack | yes (layers) | yes: three pushes, the base case in its own colour, three pops with the returned values 1, 2, 6 | ok | 3! = 6 is correct | yes | **ship** |

Totals: kind right or acceptable 10 of 10; **ship 4** (01, 05, 09, 10); **fix 4** (02, 03, 04, 06); **wrong 2** (07, 08). Prose points at the visual on 9 of 10 (not 04). Time per card 2.7 to 3.9 s, no repair, no fallback, no correction on any card.

## Defects and the layer that fixes each

| Defect | Cards | Layer |
|---|---|---|
| A smooth curve drawn through a few sampled points of a periodic function does not look periodic; one series where two or three were expected | 07 (also 05's exponential curve is a two-point line, correct only because the axis is log) | author contract for plots of periodic functions (7 to 12 points per period, two or three series), or the formula sampler (`EXPLANATION_FORMULA_SAMPLER`, off) |
| The visual contradicts the prose: the heavy link is kite to itself while the prose says kite attends to red | 08 | content contract for token-links (the link the prose names carries the heaviest weight; weights shown sum to one); the walkthrough reference was not selected, see selector |
| "how are attention weights computed" and "how does cross-validation detect overfitting" select only the generic shape reference | 03, 08 | selector keywords (Codex references): learner words for ml-transformer-scaled-attention-scores / the weighted-values reference, and a fold-wise cross-validation reference |
| Numbers on the plot do not match the example in the prose (7 of 10 heads, peak drawn at 5 on a 0 to 10 axis) | 02 | author prompt (numbers on a visual come from the prose example); not a new rule, the prose-pass-5 rule covers labels only |
| Contours drawn as polygons with markers on the corners | 04 | renderer or plot contract (a closed contour needs enough points or an ellipse primitive); the reference was selected and not followed |
| The scenario names k = 3 and the visual shows one centroid and two points | 06 | content contract for the scatter (every cluster the prose names is drawn) |
| A visual marker inside a sentence splits it into two paragraphs | 08 | server paragraph splitter or author prompt (a marker stands on its own line between sentences) |
| Visual placed after the sentence that says "above" | 07 | author prompt: the pointing sentence comes after its marker |
| Empty caption on three diagrams where the plot contract asks for one | 02, 03, 08 | author prompt (caption says what to notice) |

## What this batch says

- The kind choices are right on all ten (planner and author followed it on every card, 100% of planned kinds drawn). The misses are inside the kind: sampling and numbers (02, 04, 07), content the prose names and the visual omits (03, 06, 08).
- None of the six misses is a repair or a fallback; all are first-attempt output, so the fix belongs to the author contract and the references, not to the server.
- Four ships out of ten against one of ten in batch 01.
