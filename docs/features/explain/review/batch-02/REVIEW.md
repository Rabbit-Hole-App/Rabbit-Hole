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

---

# Audit of this review (reviewer, 2026-11-09)

The reviewer read every `card.md`, every `visual-1.png` and every `visual-1.json`, and compared each spec with the reference listed under "References selected" (spec JSON from `phase02-library/references/<id>.json` or `illustrations/<id>/spec.json` at 952e0e99). The kind column stands: 10 of 10 right. Verdicts: agreed on 01, 03, 05, 07, 08, 09, 10; 02 changes from fix to **wrong**; 04 and 06 stay at fix but the layer that fixes them changes. Final: **ship 4** (01, 05, 09, 10), **fix 3** (03, 04, 06), **wrong 3** (02, 07, 08).

## Finding that frames the whole batch: the model copies the selected worked reference

| Card | Worked reference selected | Model spec vs reference |
|---|---|---|
| 01 | ml-fit-quality-comparison-single | same figure (points, two fits, held-out point) |
| 04 | gradient-descent-contours | **byte-identical JSON** |
| 05 | learning-rate-schedules | identical series, new title |
| 06 | kmeans-centroid-update | identical title, series and annotations |
| 09 | ml-backpropagation | **byte-identical JSON** |
| 10 | recursion-factorial-unwind | identical title, same frames |
| 02, 03, 07, 08 | shape-* only | none |

Six cards with a worked reference: all six drew the reference. Four cards with only a shape reference: all four are fix or wrong. Two of those four have references in the library that did not fire: "positional encoding" should have reached `ml-transformer-position-heatmap` / `d2l-transformer-position-signal-frequency`; "how are attention weights computed" should have reached `ml-transformer-attention-softmax` / `ml-self-attention-token-links`. The other two (02 maximum likelihood, 03 cross-validation folds) have no reference at all.

Consequences: (1) on a reference hit, the reference's quality is the card's quality: a weak reference ships as a weak card (04, 09, 10); (2) the selector's keyword coverage is the single biggest lever on this batch; (3) a verbatim copy means the body must be written to the visual, which 06 shows the model does not do.

## Per-card changes and notes

**02 maximum likelihood: wrong, not fix.** The prose example is 7 heads in 10 flips. The plot's θ axis runs 0 to 10 (θ is a probability, 0 to 1), the peak is at θ = 5 (should be 0.7), the likelihood axis reaches 24 (the Bernoulli likelihood θ⁷(1−θ)³ peaks at 0.0022; even the binomial form peaks at 0.267), and the curve is symmetric where 7/10 is skewed. The marker reads "MLE θ̂: (5, 24)". Every number on the visual is false for the stated example, so it teaches a wrong value. Layer: no reference exists (shape only); this needs a worked reference `ml-mle-coin-likelihood` (θ from 0 to 1 at 11 points, L(θ) = θ⁷(1−θ)³, peak marked at 0.7), plus the author rule in 06 below.

**03 cross-validation: fix (agreed).** Four flat single-colour bars by complexity, a stray "0" tick label above the bars, no folds, nothing about cross-validation. The grouped bar-chart kind exists and was not used. Layer: no reference exists; needs `ml-cross-validation-fold-errors` (grouped bar-chart: folds 1 to 5, train vs validation error, steady gap).

**04 gradient descent: fix (agreed), layer corrected.** The spec is `gradient-descent-contours` byte for byte; the octagon and the diamond with corner markers are the reference's. The model did its job. Layer: renderer and reference, not the author prompt. The coordinate-plot has no closed smooth curve (the Steffen smoothing we added is for open series), so contours can only be polygons. Fix is a `closed: true` series option (or an ellipse annotation) in the renderer, then re-author the reference with 12 to 16 points per contour and no markers. Codex item.

**06 k-means: fix (agreed), layer corrected.** The spec is `kmeans-centroid-update` (three points, one centroid, Feature 1 / Feature 2, mean (3,3): arithmetic correct). The defect is the body: it introduces k = 3, income and spending score, none of which the visual shows. Visuals are authored before the body, so the body contradicted a visual the model had just written. Layer: author prompt: "the body's example is the visual's example: same objects, same count, same names, same numbers; never introduce a scenario the visual does not show." This rule also covers 02.

**07 positional encoding: wrong (agreed).** One irregular curve, not a sinusoid. Layers: selector keywords (references exist, see above) and the formula sampler (flag off): 7 to 12 points per period, 2 to 3 dimensions.

**08 attention weights: wrong (agreed).** Two tokens, heavy link kite to kite 0.75 while the prose says kite attends to red, the red link unlabelled, the marker splits a sentence. Layers: selector keywords (references exist, see above); token-links content contract (the link the prose names is heaviest, every drawn weight labelled, labelled weights sum to one); the sentence split belongs in the server splitter, not the prompt: a `[[visual:n]]` that lands inside a sentence is moved to after that sentence's end, deterministically.

**09 backpropagation: ship (agreed), note.** Correct and complete, but it is the reference verbatim: eight boxes in one 846 px column. Not a textbook backprop figure (forward across the top, gradients back along the bottom). Reference upgrade for Codex with the block-stack primitive when he reaches that lesson; not now.

**10 call stack: ship (agreed), note.** Correct; as `layers` it reads as a numbered list rather than a stack growing and shrinking. Same kind of reference upgrade, later.

**01, 05: ship (agreed).** 01: the simple-fit series re-plots markers on top of the observed points (clutter, not an error).

## What follows from this audit

1. Server: move a visual marker that falls inside a sentence to after the sentence (08). Deterministic; a test with 08's saved body.
2. Author prompt: add the one rule from 06 ("the body's example is the visual's example..."). The other rules in the defect table above are not added yet; the live acceptance run is the next measurement and runs on the current prompt.
3. Data from the review author (no code): for batch-01 (ten cards) the same table, worked reference selected (id) or shape-only, and the verdict, so there are 20 cards of evidence on "reference hit means ship". See the next section.
4. The formula sampler is not turned on in the live acceptance run; it stays as the next single change after that run, with 07 as its test card.

Selector keywords (07, 08), the two missing references (02, 03), the closed-curve renderer option and the contour reference (04) go to Codex.

# Reference hit against verdict, batch 01 and batch 02 (review author, 2026-11-09)

Worked reference = a non-shape reference id among the references selected; shape-only = only `shape-*` references reached the author. Batch 01 "before" is the clean-up build (76d4486c6), where every card was shape-only; "after" is the 117 candidate (7f1d0f562), verdicts from `batch-01-after/COMPARE.md`. Batch 02 verdicts are the audited ones above. Whether each batch-01 spec is byte-identical to its reference was not compared.

| Card | Worked reference selected | Verdict |
|---|---|---|
| b01-after 04 k-means | kmeans-centroid-update, clustering-elbow-silhouette | ship (borderline: one cluster only) |
| b01-after 06 Big-O | big-o-growth-rates | fix (O(log n) missing) |
| b01-after 08 call stack | recursion-factorial-unwind | ship |
| b01-after 09 database index | tree-btree-lookup | ship |
| b02 01 overfitting | ml-fit-quality-comparison-single | ship |
| b02 04 gradient descent | gradient-descent-contours | fix (polygon contours) |
| b02 05 learning-rate schedule | learning-rate-schedules | ship |
| b02 06 k-means | kmeans-centroid-update | fix (body contradicts the visual) |
| b02 09 backpropagation | ml-backpropagation | ship |
| b02 10 call stack | recursion-factorial-unwind | ship |
| b01-after 01, 02, 03, 05, 07, 10 | shape-only | ship 01, 05; fix 02, 03, 07, 10 |
| b02 02, 03, 07, 08 | shape-only | wrong 02, 07, 08; fix 03 |
| b01 before (all ten) | shape-only | ship 1 (05), fix 7, wrong 2 (03, 08) |

Totals on the 117 candidate (20 cards, one run each): worked reference selected 10 cards, ship 7, fix 3, wrong 0; shape-only 10 cards, ship 2 (b01 01, 05), fix 5, wrong 3.
