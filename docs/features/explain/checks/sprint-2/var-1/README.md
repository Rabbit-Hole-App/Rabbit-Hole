# VAR-1 report: which reference values are illustrative, which are derived

Read-only analysis of main 74c4f68ae (nothing built). Scope: the 152 references of kind coordinate-plot (118), bar-chart (19), sample-set (9), plus histogram (5) and box-plot (1), because they have the same shape of problem. Per-reference rows: `references.csv` (id, kind, lessons, source file, illustrative fields, derived fields, cited numbers, closed-form series, safe_to_vary, blockers). Script: `analyze.mjs` (re-runnable; it loads `reference-library.js` the way the product does). Counts and rows are measured, not estimated.

## The one structural finding
Every reference is a **literal spec**: the numbers are written out in the reference file (`ml-plot-references.js` etc.), and the spec schema (`ml-plot-spec.js`, `ml-statistical-spec.js`) has no way to say that one number is computed from another. So "derived" has two meanings, and only one is free to vary:

1. **Derived by the render** (recomputed on every draw, so safe if the inputs change): tick values and axis scale (`plot-ticks.js`), the x grid of compact samples (`start + step*i`, `plotSeriesPoints` in `ml-plot-spec.js`), `y = sample/divisor`, `showValues` point labels, bar heights, stacked-bar segment sums, legend, annotation badges. Nothing to do.
2. **Derived by the author and frozen as a literal** (the dangerous kind): an annotation point sitting on a series, a reference line at a series' mean, residual segments ending on a fitted line, a stacked bar's `total`, an `omitted` list, Tukey fences, a curve written out as sampled points of sigmoid or ReLU, an R-squared or a mean written into a caption. Change the data and these go stale silently. The validator catches only a few (`total` vs the parts, `omitted` vs members, points inside the axes).

So `vary` on the data alone is not enough for most references; see the design below.

## Counts (152 references; a reference can have several blockers)
| kind | refs | safe to vary (yes) | cited numbers | spec-derived | closed-form series | named function / simulated run | built by code | prose-only numbers | declared structure |
|---|---|---|---|---|---|---|---|---|---|
| coordinate-plot | 118 | 16 | 35 | 52 | 14 | 28 | 26 | 10 | 0 |
| bar-chart | 19 | 10 | 1 | 4 | 0 | 0 | 4 | 4 | 0 |
| sample-set | 9 | 0 | 1 | 3 | 0 | 0 | 1 | 0 | 9 |
| histogram | 5 | 0 | 2 | 3 | 0 | 0 | 0 | 2 | 0 |
| box-plot | 1 | 0 | 1 | 1 | 0 | 0 | 0 | 1 | 0 |

- Safe to vary as written (no blocker found): **26 of 152** (16 plots, 10 bar charts, none of the others).
- Recomputable if a small derive rule is declared: 20 more (their only blocker is a spec-derived value).
- Cited numbers only: 12 (fixable with templated labels).
- Closed-form or named-function series only: 24 (fixable by switching them to the existing formula series, `formula-sampler.js`).
- Built by code only: 9. Prose-only numbers only: 2. The rest have two or more blockers.

Spec-derived values found, by kind of dependency (references containing at least one):
- point on-series: 24 references
- reference-line stat: 15 references
- segment endpoint-on-series: 6 references
- sum-constraint: 5 references
- point centroid: 5 references
- vector chained: 5 references
- mirror-series: 4 references
- vector endpoint-on-series: 4 references
- omitted: 3 references
- markers: 2 references
- segment chained: 2 references
- outOfBagFor: 1 references
- fences: 1 references
- outliers: 1 references
- additive: 1 references

Compact-sample plots (`samples: { x: {start, step}, y: [...] }`): 21 references. Their x grid is render-derived and their y values are declared; none of the 21 is in the safe list (each has a cited number, a named curve or a derived annotation).

## Safe-to-vary list as written (26)
Plots (16): log-feature-scale, learning-curves, search-grid-and-random, probability-calibration, acf-pacf-stems, ml-stable-diffusion-encoder-evaluation, figure-retro-neighbor-search, d2l-dropout-validation-metrics, d2l-minibatch-loss-by-wall-time, d2l-cnn-loss-and-accuracy, d2l-lag-regression-training-loss, d2l-forecast-one-step-refresh, d2l-forecast-feedback-error, d2l-forecast-damping-by-horizon, d2l-attention-pooling-local-prediction, d2l-attention-bandwidth-changes-fit.
Bars (10): tree-impurity-mixtures, ensemble-votes, bias-variance-decomposition, boosting-signed-corrections, bayes-additive-log-scores, class-weighted-loss, permutation-feature-importance, feature-selection-stability, ml-label-prior-drift-comparison, ml-transformer-vocabulary-cross-entropy.

Have a human check this before trusting it. The detectors cannot see: (a) a series whose values are an estimate computed from another series (`d2l-forecast-*`, `d2l-attention-*`: the estimate lines are derived from the observed points); (b) a number derived in a different reference (`ml-transformer-vocabulary-cross-entropy` is -ln of the walkthrough's probability, and its caption says so); (c) qualitative shapes where the relationship, not the number, is the lesson (a learning curve must keep validation above training; calibration must stay near the diagonal). Treat the list as an upper bound: expect about 20 to survive review.

## Unsafe: worked numbers cited, or values derived in the spec
- References that cite a data value in their own text (a **worked number**, never varied): 40 references, ids in the CSV column `cited_numbers` (weighted-training-examples, unequal-bin-density, log-transform-distribution, iqr-fences-and-outliers, regression-residuals, regression-mean-baseline, regularization-l1-l2-geometry, svm-margin-support-slack, svm-hinge-loss, rbf-kernel-similarity, knn-l1-l2-distance, kmeans-centroid-update, dbscan-density-neighbourhoods, bayes-class-conditional-densities, zscore-anomaly-band, contextual-time-anomaly, ks-empirical-cdfs, ml-covariate-drift-comparison, ml-zscore-distribution-tails, ml-local-outlier-factor, ml-collective-anomaly-run, ml-logistic-decision-boundary, big-o-growth-rates, d2l-minibatch-loss-per-epoch, ml-trees-candidate-split, ml-trees-threshold-search, ml-trees-decision-regions, ml-trees-depth-overfit, ml-trees-gini-vs-entropy, ml-trees-bootstrap-coverage, ml-trees-forest-size-accuracy, ml-what-is-machine-learning-class-centroids, ml-what-is-machine-learning-nearest-centroid-predict, ml-linear-regression-line-meaning, ml-linear-regression-first-gradient-step, ml-linear-regression-rate-comparison, ml-linear-regression-ridge-shrinkage, ml-logistic-regression-sigmoid-derivative, ml-logistic-regression-linear-separator, ml-logistic-regression-accuracy-trap).
- References whose caption or labels carry a computed number that is not a data value (an R-squared, a mean, a loss): log-transform-distribution, null-distribution-threshold, iqr-fences-and-outliers, svr-epsilon-tube, distance-concentration, precision-recall-thresholds, smote-interpolation, ml-zscore-distribution-tails, ml-ranked-anomaly-scores, ml-logistic-decision-boundary, ml-trees-feature-importance, ml-trees-bootstrap-coverage, ml-trees-regression-step-fit, ml-what-is-machine-learning-nearest-centroid-predict, ml-linear-regression-line-meaning, ml-linear-regression-rate-comparison, ml-linear-regression-r-squared.
- Every sample-set (membership lists are a declared draw; `omitted` and `outOfBagFor` derive from them), the histograms (`proportion` sums to 1; markers state a statistic of the data) and the box-plot (fences and outliers derive from the quartiles).

## Proposed design (not built)
**Where it lives.** On the reference object, next to `useWhen` and `keywords`, never inside `spec.diagram`: `ref.vary = { 'series.0.points.2.y': [min, max, step], ... }` (paths into the spec; `step` keeps values at the card's own precision). The spec schema stays strict and unchanged, so a saved card, the validator and the renderer see an ordinary spec. A reference without `vary` is sent exactly as today.

**Who samples, and when.** The server, once per request, in `explanation-references.js` where a selected reference becomes `compact = { id, useWhen, spec }` (l.109-113, then `diagramReferenceContext`), before `parseTutorDiagram`. Seed = a hash of the stable inputs (learner prompt, args, depth, reference id), not of the final request body: the quote hash covers the body, so seeding from it is circular. The draw is deterministic, so a repeated request, its quote and its dispatch hash agree. The reference block already sits at the end of the fast chain's system message (`assembledSystem`), so varying it does not break the provider's prefix cache.

**What is recomputed.** After sampling, small pure functions rewrite every derived value, declared per reference as `ref.derive = [{ rule, ...args }]`. Eight rules cover every dependency found above: `on-series` (an annotation point or endpoint sits on series i at x), `centroid`, `statistic` (mean, median, min or max of series i as a reference line), `chain` (a vector's endpoint is the previous endpoint), `sum` (stacked total, sum to 1 or 100, an additive part), `mirror`, `fences`, `omitted`. A closed-form series is declared as a formula series and re-sampled by `formula-sampler.js` (it exists and is tested), so its parameters vary, not its points. The result then goes through the normal `parseTutorDiagram` (points inside axes, total matches parts, omitted matches members); a draw the validator refuses is redrawn with the next seed, and after 3 failures the reference is sent unvaried.

**Worked numbers never vary.** Any field whose value appears in the reference's own text is excluded: a lint over the reference library (the `cited_numbers` check used here) fails if a `vary` path points at a cited value. Labels and captions that carry a derived number become templates (`'Mean {{mean:0}}'`) filled after `derive`, or the reference stays unvaried.

**Rollout size.** 26 references as written (about 20 after the human pass); +20 with derive rules; +12 with label templates; +24 by converting to formula series. Start with the 16 plots and 10 bars that need no derive rule, behind a flag, and measure how often the author copies the example's numbers (the failure VAR-1 exists to remove) before extending.

## Detection rules (what the analyzer actually tested)
- Illustrative: series points, compact samples, bar values, weights, box and histogram numbers, annotation coordinates not tied to data.
- Derived in the spec: an annotation point equal to a series point, on a series polyline (exact interpolation) or equal to a series centroid; a reference line equal to a series' mean, median, min, max or a point coordinate; a segment or vector endpoint on a series or equal to another annotation's endpoint; one series that is the x-mirror of another; a stacked `total`; values that sum to 1 or 100; a bar equal to the sum of two or more others; `omitted` and `outOfBagFor`; Tukey fences; histogram markers.
- Closed form: a line series of at least 4 points that is affine, quadratic, Gaussian-like (log y quadratic), sigmoid-like (logit y affine), log, power or exponential in x (tolerances in `analyze.mjs`); plus a title or series-label match on a named function or optimiser (sigmoid, tanh, ReLU, cosine, decay, momentum, Adam, Newton...) as a heuristic.
- Cited: a data value that appears as a number in the reference's own text (title, caption, labels, axis names, `useWhen`), ignoring ordinals such as "Step 1", "Class 2", "x1". Prose-only: a number in the text that is not a data value and not an integer up to 12, i.e. a computed result written into text.
- Built by code: the reference's source file, or a local file it imports, uses Math.exp, log, sqrt, pow, sin, cos, tanh or the ** operator (the numbers are generated, not typed).
- Limits: a heuristic over a literal library. False positives: a reference line that coincides with a point coordinate by accident; the title regex. False negatives: derivations across references or across series (see the human-check note). The CSV is the evidence; read it before acting.
