# Phase 02 reference coverage — correction and remaining work

Audited against the owner's full 21-lesson reference-scene table and the registry shipped in `8aee76e5a10815b1e0e9c48dc1c4d876acfe303e`. Updated through Batch 4A on the rebased branch.

**The 13 renderer additions/extensions are implemented. The full requested reference-scene pack is not complete.** The earlier statement that nothing from the Phase 02 list remained, followed by a recommendation to move to the next phase, was too broad. Having a reference ID tagged with each lesson is not the same as covering each scene requested within that lesson.

The branch author registry contains **168 references**. The offline catalogue has **192 references**, including 24 held for later integration, and the kind gallery has 24 neutral shapes. The seven new architecture references are tracked separately. [Illustration primitives](illustration-primitives.md)

Five reference patterns remain open in Lessons 01–02 and two lower-priority patterns remain open in Lesson 21. [Batch 3C](batch-3c.md#local-verification) · [Batch 4A](batch-4a.md#local-verification) · [AI/ML and offline SVG handoff](svg-offline.md)

## Audit definitions

- **Present:** the registered JSON actually shows the requested mechanism. Matching keywords, a `useWhen` sentence, or a related visual alone do not count as complete coverage.
- **Partial / add:** a related example or rendering capability exists, but the requested comparison, calculation or distinct stage is absent.
- Listed remaining work is **reference content using existing layouts**, not a claim that another diagram kind is necessary. Multiple gaps can share one coherent example. Do not infer a required count of new files from the list.
- Equations and arithmetic belong in teaching text alongside the visual where appropriate. A missing worked calculation does not require a new renderer.

## Every lesson against the requested table

IDs below are existing entries in `packages/web/src/tutor-diagrams/reference-library.js` and its domain and batch reference modules. Complete JSON/SVGs are in [the reference index](references/README.md).

| Lesson | Present evidence | Still missing or partial relative to the requested scenes |
| --- | --- | --- |
| 01 — What is ML? | `ml-learning-taxonomy`, `labelled-samples-and-split`, `train-validation-test-split`, `nearest-centroid-boundary`. Batch 4A adds `ml-classification-vs-regression` with the same weather input and contrasting output types. | Labelled-versus-unlabelled groups, a basic training/evaluation/prediction workflow, and a nearest-centroid counterexample. |
| 02 — Linear regression | `regression-residuals`, `regression-mean-baseline`, `gradient-descent-contours`, `polynomial-regression-curve`, `regularization-l1-l2-geometry`, `regularization-coefficient-path`, `ml-fit-quality-comparison` | Convergence comparisons for different learning rates; an explicit matched-data regularized-versus-unregularized fitted-prediction comparison. The mean line and reasonable fit already coexist in the fit-quality example; reuse it rather than duplicate it. |
| 03 — Logistic regression | `sigmoid-threshold`, `binary-cross-entropy-loss`, `softmax-probabilities`, `confusion-matrix-counts`, `roc-threshold-curve` and `precision-recall-thresholds`. Batch 4A adds `ml-logistic-decision-boundary` with two cutoffs in the same feature space. | The requested reference patterns are present. Live generation and browser acceptance remain pending. |
| 04 — Decision trees and forests |`ml-tree-split-path`, `tree-class-mixtures`, `tree-impurity-mixtures`, `ml-tree-pruning`, `regression-tree-steps`, `bootstrap-replacement-oob`, `ml-bagging-vote-flow`, `ensemble-votes`; `ml-tree-impurity-gain` adds the complete parent, both children, weighted impurity and gain on the same counts. | No further reference pattern identified from this requested row after batch 1. Live generation and generated-card browser acceptance remain pending. |
| 05 — SVM |`svm-margin-support-slack`, `svm-hinge-loss`, `rbf-kernel-similarity`, `kernel-similarity-grid`, `svr-epsilon-tube`; `ml-svm-c-tradeoff`, `ml-svm-feature-map` add matched-data C-dependent optima and original/transformed geometry. | No further reference pattern identified from this requested row after batch 1. Live generation and generated-card browser acceptance remain pending. |
| 06 — KNN and distances |`knn-neighbourhood`, `knn-l1-l2-distance`, `cosine-vector-directions`, `ml-feature-scaling-transformation`, `knn-k-validation`, `ml-kd-tree`, `distance-concentration`; `ml-knn-distance-weighted-vote`, `ml-knn-scaled-distance`, `ml-knn-k-boundaries`, `ml-kd-tree-partitions` add the four missing mechanisms. | No further reference pattern identified from this requested row after batch 1. Live generation and generated-card browser acceptance remain pending. |
| 07 — Unsupervised learning |`kmeans-centroid-update`, `clustering-inertia-elbow`, `clustering-elbow-silhouette`, `dbscan-density-neighbourhoods`, `ml-clustering-dendrogram`, `gmm-elliptical-components`, `ml-clustering-comparison`; `ml-kmeans-assignment-update`, `ml-dbscan-core-border-noise`, `ml-gmm-responsibilities` add the three missing mechanisms. | No further reference pattern identified from this requested row after batch 1. Live generation and generated-card browser acceptance remain pending. |
| 08 — Feature engineering | `ml-feature-scaling-transformation`, `log-feature-scale`, `log-transform-distribution`, `unequal-bin-density`, one-hot/target-encoding, imputation, token-count/TF-IDF and correlation references; batch 2A adds `ml-ordinal-encoding`, `ml-value-binning`, `ml-feature-interaction` and `ml-raw-log-distributions`. | No further reference pattern identified from this requested row after batch 2A. Live generation and generated-card browser acceptance remain pending. |
| 09 — Model evaluation | Split/sample membership, `stratified-fold-counts`, `nested-cross-validation-folds`, confusion/ROC/PR, `regression-residuals`, `learning-curves`, `null-distribution-threshold`; reuse `knn-k-validation` for a validation curve. Batch 2A adds `ml-confusion-denominators` and `ml-regression-error-metrics` using the existing counts and residual-data starting points. | No further reference pattern identified from this requested row after batch 2A. Live generation and generated-card browser acceptance remain pending. |
| 10 — Bias and variance | `ml-fit-quality-comparison`, `repeated-fit-uncertainty`, `bias-variance-decomposition`, `early-stopping-curves`, `double-descent-curve`. Batch 2B adds `ml-repeated-sample-fits` with the training samples, individual fits and derived average and spread. | The requested reference patterns are present. Live generation and browser acceptance remain pending. |
| 11 — Ensembles | Bootstrap/OOB, `ml-bagging-vote-flow`, `ensemble-votes`, `weighted-training-examples`, `boosting-signed-corrections`, `ml-boosting-correction-transformation`, `ml-stacking-flow`. Batch 2B adds `ml-soft-vote-probabilities`, `ml-adaboost-weight-update` and `ml-stacking-oof-predictions`. | The requested reference patterns are present. Live generation and browser acceptance remain pending. |
| 12 — Hyperparameter tuning | `search-grid-and-random`, `hyperparameter-score-grid`, `bayesian-search-surrogate`, `ml-parallel-trial-pruning`, `learning-rate-schedules`, `nested-cross-validation-folds`. Batch 2B adds `ml-bayesian-acquisition-choice` and `ml-successive-halving-rounds`. | The requested reference patterns are present. Live generation and browser acceptance remain pending. |
| 13 — ML pipelines | `ml-parallel-preprocessing`, `ml-fit-transform-leakage`, `target-encoding-out-of-fold`, `ml-imputation-transformation`, `ml-feedback-graph`, `ml-version-lineage`, `point-in-time-created-time` | No additional reference pattern identified from this quoted row. Teaching/live-generation acceptance is still pending. |
| 14 — Naive Bayes | `bayes-log-score-table`, `bayes-class-token-counts`, `bayes-laplace-smoothing`, `bayes-class-conditional-densities`, `bayes-additive-log-scores`, `probability-calibration` | No additional reference pattern identified from this quoted row. Fixed token/example data is sufficient; no learner sentence input is needed. Teaching/live-generation acceptance is still pending. |
| 15 — Time series | `time-series-components`, differencing/lag references, expanding/sliding windows, `acf-pacf-stems`, `forecast-horizon-uncertainty`. Batch 3A adds `ml-time-series-additive-residuals`, `ml-acf-vs-pacf`, `ml-rolling-mean-feature` and `ml-recursive-vs-direct-forecast`. | The requested reference patterns are present. Live generation and browser acceptance remain pending. |
| 16 — Anomaly detection | `zscore-anomaly-band`, `iqr-fences-and-outliers`, `ml-isolation-tree`, `dbscan-density-neighbourhoods`, `contextual-time-anomaly`. Batch 3B adds `ml-zscore-distribution-tails`, `ml-local-outlier-factor`, `ml-collective-anomaly-run` and `ml-ranked-anomaly-scores`. | The requested reference patterns are present. All eight Batch 3B probes select the intended first example in the prepared author request. Live generation and browser acceptance remain pending. |
| 17 — Imbalanced data | `class-imbalance-resampling`, `stratified-fold-counts`, `ml-label-prior-drift-comparison`, `smote-interpolation`, weight/PR/threshold/cost references. Batch 2C adds `ml-minority-accuracy-trap` and `ml-majority-undersampling`. | The requested reference patterns are present. Live generation and browser acceptance remain pending. |
| 18 — Feature selection | Correlation/nonlinear dependence, `permutation-feature-importance`, `permutation-feature-matrix`, L1/L2 geometry and coefficient paths, `feature-selection-stability`. Batch 2C adds `ml-recursive-feature-elimination` with changing ranks and retained features across refits. | The requested reference patterns are present. Live generation and browser acceptance remain pending. |
| 19 — ML system design | Batch 3C adds `ml-churn-goal-prediction-decision`, `ml-batch-vs-online-inference`, `ml-serving-latency-cost`, `ml-shadow-canary-ab-rollout` and `ml-batch-score-fallback`. Earlier references cover baselines, feature storage, feedback and version lineage. | The requested reference patterns are present. Live generation and browser acceptance remain pending. |
| 20 — Monitoring and drift | Three distinct drift comparison references, `aligned-distribution-drift`, `ks-empirical-cdfs`, monitoring windows, `label-delay-monitoring`, `persistent-drift-alerts`. Batch 2C adds `ml-psi-bin-contributions` with the per-bin terms and their total. | The requested reference patterns are present. Live generation and browser acceptance remain pending. |
| 21 — Feature stores | `ml-feature-store-architecture`, event/created/label timelines, `as-of-join-ttl-window`, `point-in-time-created-time`, `late-arrival-snapshot-matrix` | A historical backfill/recomputation example; training/serving skew with mismatched versus corrected feature computation. Late arrival is covered; that does not automatically cover backfills. |

## Recommended build order

Finish this reference content with the existing approved palette and components before auditing the next curriculum phase. These batches group related gaps; they are not new renderer kinds.

1. **Batch 1 implemented — trees, neighbours and clustering (04–07):** worked information gain; SVM C and transformed geometry; weighted KNN/scaling/K boundaries/KD regions; assignment-update snapshots, DBSCAN border points and GMM responsibilities.
2. **Batch 2 implemented — worked calculations and feature transforms (08–12, 17–18, 20).** Batches 2A and 2B delivered twelve references. Batch 2C completes the 16 with the accuracy trap, undersampling, RFE stages and PSI.
3. **Batch 3 partly implemented — temporal and system mechanisms (15–16, 19–21).** Batches 3A, 3B and 3C fill the Lesson 15, 16 and 19 gaps. The two Lesson 21 examples on backfills and training/serving skew moved below the foundational examples in priority.
4. **Introductory and regression contrasts (01–03).** Batch 4A covers prediction task choice and logistic feature-space geometry. Learning-rate convergence and four other foundational patterns remain open in Lessons 01–02.

For each batch: add actual reference JSON and natural prompt keywords to the existing registry; independently check the numeric claims; export the actual SVG; verify the real author request selects a relevant example; update this table. Reuse a current reference where it already expresses the mechanism instead of producing duplicate cards. Live model runs remain distinct from fixed-reference checks.

## Tracking

- [x] Four new kinds and nine existing-kind extensions implemented and pushed.
- [x] Initial 130-reference pack exported and connected to author/repair context.
- [x] Reconcile the full quoted table against actual reference JSON.
- [x] Build the ten batch-1 references for lessons 04–07 and connect them to the author registry.
- [x] Build the six batch-2A references for lessons 08–09, verify the arithmetic and connect them to the actual author path, including explicitly requested histogram leaves.
- [x] Build the six Batch 2B references for Lessons 10–12 and verify their math, fold provenance, stage budgets and author selection.
- [x] Build the four Batch 2C references for Lessons 17, 18 and 20 and verify their arithmetic, sample membership, refit order and author selection.
- [x] Build the four Batch 3A time-series references and verify the reconstruction, lag values, date windows, forecast inputs and author selection.
- [x] Build the four Batch 3B anomaly-detection references and verify the tail cutoff, density ratios, first alert, score cutoffs and author selection.
- [x] Build the five Batch 3C ML system design references and verify the scoring paths, serving-cost arithmetic, rollout distinctions, fallback routes and author selection.
- [x] Build the two Batch 4A foundational references and verify the shared inputs, output types, logistic cutoffs and author selection.
- [ ] Complete the remaining Batch 3 references and the missing/partial patterns listed above.
- [ ] Real-model kind/reference choice and generated-card browser/save-reopen acceptance.

The remaining reference work appears in the open rows above.
