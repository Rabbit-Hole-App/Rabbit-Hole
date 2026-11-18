# VAR-1 step 4 prep: the human pass over the 26 "safe as written" references

Prepared 2026-11-18 on feat/var-1 (step 3 built; no reference has been edited and none carries `vary`). Source of the 26: `checks/sprint-2/var-1/README.md` (152 references, analyser run on main 74c4f68ae); that README says to expect about 20 to survive review. This list is the review: every reference was read in full (series, annotations, caption, title, useWhen) with `dump26.mjs`, and each gets either proposed `vary` entries or a strike with its reason. The Reviewer reads this before any `vary` is added.

Reading the proposals: `path: [min, max, step]` walks `spec.diagram` (the `vary` format of step 3); a 4th element names an order path. Ranges are chosen so the story the reference tells survives every draw: where an order or a gap matters I use DISJOINT bands (a band's min is above the next band's max), which `vary` can express without an order element; an order element is only used where a value may equal its predecessor. Nothing here is verified by code beyond what step 3's lint checks (a typed number in the text); the invariants are argued from the reference's own text.

## Result
17 of the 26 get proposals (10 plots, 7 bars): 7 of them fully (1, 2, 4, 6, 11, 23, 24), 10 partly because some points or series inside them are struck (3, 5, 7, 8, 10, 18, 19, 20, 21, 22). 9 are struck whole (6 plots: 9, 12 to 16; 3 bars: 17, 25, 26). That matches the analyser's own caveat that about 20 would survive review. Every proposed band contains the reference's current value, so the reference as written is one of the draws.

| # | id | kind | verdict |
|---|---|---|---|
| 1 | log-feature-scale | plot | vary |
| 2 | learning-curves | plot | vary |
| 3 | search-grid-and-random | plot | vary (random x only); grid struck |
| 4 | probability-calibration | plot | vary |
| 5 | acf-pacf-stems | plot | vary (lags 1 to 6); lag 0 struck |
| 6 | ml-stable-diffusion-encoder-evaluation | plot | vary |
| 7 | figure-retro-neighbor-search | plot | vary "Other entries" only; rest struck |
| 8 | d2l-dropout-validation-metrics | plot | vary (partial); epochs 4 and 6 accuracy struck |
| 9 | d2l-minibatch-loss-by-wall-time | plot | STRUCK |
| 10 | d2l-cnn-loss-and-accuracy | plot | vary (epochs 3 to 6); plateau struck |
| 11 | d2l-lag-regression-training-loss | plot | vary |
| 12 | d2l-forecast-one-step-refresh | plot | STRUCK |
| 13 | d2l-forecast-feedback-error | plot | STRUCK |
| 14 | d2l-forecast-damping-by-horizon | plot | STRUCK |
| 15 | d2l-attention-pooling-local-prediction | plot | STRUCK |
| 16 | d2l-attention-bandwidth-changes-fit | plot | STRUCK |
| 17 | tree-impurity-mixtures | bar | STRUCK |
| 18 | ensemble-votes | bar | vary |
| 19 | bias-variance-decomposition | bar | vary (noise struck) |
| 20 | boosting-signed-corrections | bar | vary (initial struck) |
| 21 | bayes-additive-log-scores | bar | vary (log prior struck) |
| 22 | class-weighted-loss | bar | vary (rare weighted only) |
| 23 | permutation-feature-importance | bar | vary |
| 24 | feature-selection-stability | bar | vary |
| 25 | ml-label-prior-drift-comparison | bar | STRUCK |
| 26 | ml-transformer-vocabulary-cross-entropy | bar | STRUCK |

## Cross-cutting strikes (apply to the proposals below)

S1. **Depth variants.** Seven of the 26 carry `depths` (overview, deep): ml-stable-diffusion-encoder-evaluation, figure-retro-neighbor-search, the five d2l plots, ml-transformer-vocabulary-cross-entropy. `atLevel` merges `depths[level]` over the reference, so a top-level `vary` applies to the merged spec. For the ones with proposals (6, 7, 8, 10, 11) I checked that the base and both depth specs have the same series and point counts, so one `vary` addresses all three; but the depth specs hold their OWN copies of the numbers, so each level draws its own values (fine: a request uses one level). Check in the build that each depth spec's baseline numbers equal the base spec's (a stale depth copy would put a different story under the same bands).
S2. **A shape that is the lesson.** Every proposed band keeps the reference's drawn pattern (trend direction, ranking, which series is above which). If the Reviewer wants more variety, widen a band only after checking the text of that reference for the claim it protects (named under each).
S3. **No `vary` on x grids** of line/stem series (lags, epochs, sizes, target times): the x values are structure.
S4. **Sum and equality constraints are not expressible** in `vary` (a total, "equal-size", "same accuracy", "noise held constant"). Where a reference depends on one, the field is struck; those references want a `complement` derive row (step 4b) if the Reviewer wants them varied: tree-impurity-mixtures (A + B = 10 per node), ml-label-prior-drift-comparison (7 + 3 = 10 per window).
S5. **Cross-reference consistency.** The five d2l-forecast/attention references share one set of Observed values; varying one and not the others would put contradicting numbers in sibling cards. Struck together.

## Plots

### 1. log-feature-scale: vary
Lesson: a log x axis spaces equal ratios equally. Scatter of 4 points at x = 1, 10, 100, 1000 (fixed) with y rising 0.5 to 3.5; no number cited in the text.
- `series.0.points.0.y: [0.3, 0.9, 0.1]`, `points.1.y: [1.0, 2.0, 0.1]`, `points.2.y: [2.1, 3.0, 0.1]`, `points.3.y: [3.1, 3.9, 0.1]` (disjoint bands keep the response rising; y axis 0 to 4).

### 2. learning-curves: vary
Protects: validation error above training error at every size, training rising, validation falling (the lesson is the gap closing). Disjoint bands per size make both orders hold by construction.
- Training: `series.0.points.0.y: [0.03, 0.08, 0.01]`, `points.1.y: [0.09, 0.11, 0.01]`, `points.2.y: [0.12, 0.15, 0.01]`, `points.3.y: [0.16, 0.19, 0.01]`.
- Validation: `series.1.points.0.y: [0.40, 0.48, 0.01]`, `points.1.y: [0.28, 0.36, 0.01]`, `points.2.y: [0.22, 0.26, 0.01]`, `points.3.y: [0.20, 0.21, 0.01]`. At x = 100 validation (min 0.20) stays above training (max 0.19). Y axis 0 to 0.5 holds.

### 3. search-grid-and-random: vary random candidates' x only
Lesson: random search tries more distinct values per axis than a grid. STRIKE: the 9 grid points (a declared grid, structure) and every y (depth, integer-like, six distinct values 2, 8, 4, 7, 3, 6 are the claim); fractional depths would be wrong.
- Random x on a log axis, disjoint bands in the original order: `series.1.points.0.x: [0.02, 0.06, 0.01]`, `points.1.x: [0.10, 0.30, 0.02]`, `points.2.x: [0.5, 1.2, 0.1]`, `points.3.x: [2, 4, 0.2]`, `points.4.x: [6, 12, 1]`, `points.5.x: [25, 60, 5]`. Six distinct x values per draw; the axis (0.01 to 100) holds. Open question: the lint has no "distinct values" rule; the bands guarantee it.

### 4. probability-calibration: vary
The identity series (0,0 to 1,1) is struck (it IS the perfect calibration). Observed bins x = 0.1 .. 0.9 (fixed); the drawn pattern sits below the diagonal. Disjoint bands keep it rising and below the diagonal: `series.0.points.0.y: [0.02, 0.08, 0.01]`, `points.1.y: [0.12, 0.26, 0.01]`, `points.2.y: [0.30, 0.46, 0.01]`, `points.3.y: [0.50, 0.66, 0.01]`, `points.4.y: [0.70, 0.86, 0.01]`.

### 5. acf-pacf-stems: vary lags 1 to 6
STRIKE: lag 0 (autocorrelation at lag 0 is 1 by definition) and the band (a fixed illustrative reference band, 0.2). Bands keep a decaying, then sign-changing ACF inside (-1, 1): `series.0.points.1.y: [0.60, 0.80, 0.05]`, `points.2.y: [0.35, 0.55, 0.05]`, `points.3.y: [0.10, 0.30, 0.05]`, `points.4.y: [-0.20, 0.00, 0.05]`, `points.5.y: [-0.35, -0.20, 0.05]`, `points.6.y: [-0.25, -0.05, 0.05]`.

### 6. ml-stable-diffusion-encoder-evaluation: vary
Toy two-metric comparison, "the best direction is toward stronger matches (higher x) and fewer visual errors (lower y)". No claim that one encoder wins, so both step lines vary inside the axes (x 0.2 to 0.8, y 0.1 to 0.6) with the drawn shape (encoder B up and to the right of A): A `points.0.x: [0.25, 0.32, 0.01]`, `points.0.y: [0.45, 0.52, 0.01]`, `points.1.x: [0.42, 0.50, 0.01]`, `points.1.y: [0.28, 0.34, 0.01]`, `points.2.x: [0.52, 0.60, 0.01]`, `points.2.y: [0.27, 0.33, 0.01]`, `points.3.x: [0.60, 0.68, 0.01]`, `points.3.y: [0.31, 0.37, 0.01]`; B `points.0.x: [0.33, 0.40, 0.01]`, `points.0.y: [0.40, 0.46, 0.01]`, `points.1.x: [0.52, 0.58, 0.01]`, `points.1.y: [0.21, 0.27, 0.01]`, `points.2.x: [0.63, 0.69, 0.01]`, `points.2.y: [0.17, 0.23, 0.01]`, `points.3.x: [0.71, 0.77, 0.01]`, `points.3.y: [0.23, 0.29, 0.01]`. These are `series.0` and `series.1` respectively. Step lines need non-decreasing x per series: every band's min is above the previous point's max. Depth variants: S1.

### 7. figure-retro-neighbor-search: vary "Other entries" only
The caption claims records A and B (returned, at (2,3) and (4,2), distances 1 and 2 from the query at (2,2)) are the closest. STRIKE: query and returned points (rank is the lesson; nothing computes distances, so a moved returned point could silently stop being nearest). Others at (6,5) and (5,0) may move only while every distance stays above 2 (B). Bands keep distance >= 2.9: `series.2.points.0.x: [5.5, 6.5, 0.5]`, `points.0.y: [4.5, 5.5, 0.5]`, `points.1.x: [4.5, 5.5, 0.5]`, `points.1.y: [-0.5, 0.5, 0.5]` (nearest corner (4.5, 0.5): sqrt(6.25 + 2.25) = 2.9). Hand check, no code check: the distance claim is not linted.

### 8. d2l-dropout-validation-metrics: vary partly
The text: "the model makes the same share of correct decisions while held-out loss keeps improving": accuracy at epochs 4 and 6 are equal (0.77, 0.77) and loss falls 0.46 to 0.44. STRIKE: accuracy epochs 4 and 6 (an equality `vary` cannot hold; they stay 0.77) and the x grid. Vary: loss `series.0.points.0.y: [0.90, 1.00, 0.01]`, `points.1.y: [0.66, 0.74, 0.01]`, `points.2.y: [0.52, 0.60, 0.01]`, `points.3.y: [0.46, 0.49, 0.01]`... the last two must still FALL (epoch 6 below epoch 4): `points.3.y: [0.45, 0.49, 0.01]`, `points.4.y: [0.40, 0.44, 0.01]`; accuracy `series.1.points.0.y: [0.38, 0.46, 0.01]`, `points.1.y: [0.60, 0.67, 0.01]`, `points.2.y: [0.69, 0.75, 0.01]`. Note the text has no numbers. Depth variants: S1.

### 9. d2l-minibatch-loss-by-wall-time: STRUCK
The elapsed times (2.46, 1.02, 1.32, 0.48 ms ...) are a toy cost model's output, and the card claims "the batch of three reaches the same loss first" against a shared target line (0.06). The reference says it reuses "the same training traces as the per-epoch comparison" (d2l-minibatch-loss-per-epoch, which is on the analyser's cited-numbers list), so its numbers derive from another reference (blocker b of the analyser's own caveats). A ranking claim over derived times cannot be kept by independent bands.

### 10. d2l-cnn-loss-and-accuracy: vary epochs 3 to 6
STRIKE: epochs 1 and 2 (the "early plateau": equal values in each series, 2.6/2.6 and 2.7/2.7; an equality). Held-out above training and both falling, by disjoint bands: training `series.0.points.2.y: [2.0, 2.3, 0.1]`, `points.3.y: [1.3, 1.6, 0.1]`, `points.4.y: [0.8, 1.0, 0.1]`, `points.5.y: [0.5, 0.7, 0.1]`; held out `series.1.points.2.y: [2.4, 2.6, 0.1]`, `points.3.y: [1.7, 1.9, 0.1]`, `points.4.y: [1.1, 1.3, 0.1]`, `points.5.y: [0.8, 1.0, 0.1]`. Check: at each epoch held-out min exceeds training max; each band's min exceeds the next band's max in its own series. Depth variants: S1.

### 11. d2l-lag-regression-training-loss: vary
Training drops then levels; validation drops "before leveling off" and sits above training. Training `series.0.points.0.y: [2.9, 3.3, 0.1]`, `points.1.y: [1.5, 1.9, 0.1]`, `points.2.y: [0.8, 1.1, 0.1]`, `points.3.y: [0.62, 0.75, 0.01]`, `points.4.y: [0.57, 0.61, 0.01]`, `points.5.y: [0.50, 0.56, 0.01]`; validation `series.1.points.0.y: [3.4, 3.8, 0.1]`, `points.1.y: [2.0, 2.4, 0.1]`, `points.2.y: [1.25, 1.5, 0.05]`, `points.3.y: [1.05, 1.2, 0.05]`, `points.4.y: [1.05, 1.12, 0.01]`, `points.5.y: [1.05, 1.12, 0.01]` (the last two overlap on purpose: "leveling off"). y axis 0 to 4: validation max 3.8 fits. Depth variants: S1.

### 12, 13, 14. d2l-forecast-one-step-refresh, d2l-forecast-feedback-error, d2l-forecast-damping-by-horizon: STRUCK (S5)
The estimate series are computed from the Observed series by a lag rule ("each estimate uses the last two measured readings", one-step, recursive, five-steps-ahead). Varying Observed leaves every estimate stale; there is no derive row for a lag-rule forecast (`derive` knows on / mean / median / min / max / centroid). The three share one Observed series, so they must be varied together or not at all. Wants a formula-series or a `derive` row for the rule: step 4 (d), not 4(a).

### 15, 16. d2l-attention-pooling-local-prediction, d2l-attention-bandwidth-changes-fit: STRUCK
Local, narrow and broad estimates are Gaussian-kernel smoothings of the measured points (the text says "fit the same original observations"); the Global mean line (y = 2) is the mean of the measured y (1, 3, 4, 2, 0), a derived series that `derive` (annotations only) cannot express. Same reason as 12 to 14.

## Bars

### 17. tree-impurity-mixtures: STRUCK (S4)
Equal-size nodes: Class A + Class B = 10 in every category (10 + 0, 8 + 2, 5 + 5), and the card says so ("equal-size class counts"). Independent bands cannot hold a sum; wants a `complement` derive.

### 18. ensemble-votes: vary
Hard votes are whole numbers; the winner (class A) stays the winner. Disjoint bands: `series.0.values.0: [4, 5, 1]`, `series.0.values.1: [2, 3, 1]`; STRIKE `series.0.values.2` (class C, 1; no room for another whole number below class B's band without a tie); weighted `series.1.values.0: [3.0, 3.6, 0.1]`, `values.1: [2.0, 2.8, 0.1]`, `values.2: [0.6, 1.0, 0.1]`. Weighted votes may exceed hard votes in the original (class B 2.4 vs 2), so no relation is held between the two series.

### 19. bias-variance-decomposition: vary
Protects: total error is U-shaped over complexity (11, 7, 10 originally). STRIKE `Noise` (irreducible noise held constant: 2, 2, 2). Bands keep it U-shaped: totals low >= 7 + 1 + 2 = 10, medium <= 3 + 3 + 2 = 8, high >= 1 + 6 + 2 = 9. Bias: `series.0.values.0: [7, 9, 1]`, `values.1: [2, 3, 1]` (high complexity, 1, stays fixed). Variance: `series.1.values.1: [2, 3, 1]`, `values.2: [6, 8, 1]` (low complexity, 1, stays fixed so variance strictly rises). Bias falls and variance rises by construction (low bias min 7 > medium max 3; medium variance max 3 < high min 6).

### 20. boosting-signed-corrections: vary
Protects: signs (the card is about positive and negative stacks starting independently). STRIKE `Initial prediction` (3, 3, 3: one shared starting value). First correction `series.1.values.0: [1, 3, 0.5]` (positive), `values.1: [-2, -0.5, 0.5]` (negative), `values.2: [0.25, 1, 0.25]` (positive); second correction `series.2.values.0: [-1, -0.25, 0.25]`, `values.1: [-1, -0.25, 0.25]`, `values.2: [0.25, 0.5, 0.25]`.

### 21. bayes-additive-log-scores: vary the likelihoods
STRIKE `Log prior` (-0.69, -0.69: ln 0.5, a derived constant, equal for both classes). Log likelihoods stay negative (a log of a probability below 1): feature 1 `series.1.values.0: [-0.4, -0.1, 0.1]`, `values.1: [-2.0, -1.2, 0.1]`; feature 2 `series.2.values.0: [-1.4, -0.7, 0.1]`, `values.1: [-0.5, -0.1, 0.1]`. To check by hand before building: whether another reference (a naive-Bayes walkthrough) states these likelihoods as probabilities (blocker b); I did not search the library for it.

### 22. class-weighted-loss: vary the rare class's weighted loss
The card's premise is equal raw losses (1, 1) and that the common class has weight 1 (weighted 1) and the rare class a larger one. STRIKE both unweighted values and the common weighted value. Vary `series.1.values.1: [2, 6, 1]` (the rare class's weighted loss is its weight times 1). No text cites 4.

### 23. permutation-feature-importance: vary
Two independent shuffles per feature, scores that drop: A highest, B middle, C near zero (one slightly negative is part of the lesson). Disjoint bands: shuffle 1 `series.0.values.0: [0.15, 0.22, 0.01]`, `values.1: [0.05, 0.09, 0.01]`, `values.2: [-0.02, 0.01, 0.01]`; shuffle 2 `series.1.values.0: [0.14, 0.20, 0.01]`, `values.1: [0.03, 0.08, 0.01]`, `values.2: [-0.01, 0.02, 0.01]`.

### 24. feature-selection-stability: vary
Selection fractions in [0, 1], ranked A > B > C under both selectors: `series.0.values.0: [0.85, 1.0, 0.05]`, `values.1: [0.55, 0.75, 0.05]`, `values.2: [0.10, 0.30, 0.05]`; `series.1.values.0: [0.85, 1.0, 0.05]`, `values.1: [0.55, 0.75, 0.05]`, `values.2: [0.10, 0.30, 0.05]`.

### 25. ml-label-prior-drift-comparison: STRUCK (S4)
"Each window contains 10 samples" (a number typed in the text, and a sum constraint: 7 + 3 and 3 + 7). Independent bands break the sum; the lint would also flag the typed 10 if it were derived. Wants a `complement` derive plus a token for the window size.

### 26. ml-transformer-vocabulary-cross-entropy: STRUCK
Both bars come from the transformer vocabulary walkthrough ("the walkthrough guess for on", an improved guess whose negative log is compared): a worked number owned by another reference (blocker b). The first bar must equal the walkthrough's probability.

## Questions for the Reviewer before step 4
1. Disjoint bands (as here) or an `order` rule for descending series? Bands cost variety; a descending order element (`before`) would cost one more option in `vary` and one lint check. I used bands.
2. Is a "distinct values" rule needed for #3 (six distinct x on a log axis)? Bands guarantee it today.
3. #7 and #21 rest on a hand check the lint cannot do (distance rank; another reference's likelihoods). Accept, or leave them unvaried?
4. Step 4 itself: add `vary` in rounds of about 6 references with the evidence of step 3's diff script on each (two seeds, only inputs change), then one bench measurement.
