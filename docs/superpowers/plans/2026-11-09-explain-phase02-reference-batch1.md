# Phase 02 reference batch 1 — Lessons 04–07

Approved scope: build the next ten written `/explain` references from the coverage audit, then verify, document and push. This is reference content and author examples, using the existing semantic JSON → SVG renderer and approved teaching palette. No new kind, controls, app UI, production deployment or broad CI is needed.

## Deliverables and ownership

| Lane | Reference IDs | Files owned |
| --- | --- | --- |
| Integration | `ml-tree-impurity-gain` | `ml-batch1-tree-references.js`, its numeric test, registry, backend selection checks, exports, tracking and handoff |
| SVM | `ml-svm-c-tradeoff`, `ml-svm-feature-map` | `ml-batch1-svm-references.js` and `ml-batch1-svm.test.mjs` |
| KNN | `ml-knn-distance-weighted-vote`, `ml-knn-scaled-distance`, `ml-knn-k-boundaries`, `ml-kd-tree-partitions` | `ml-batch1-knn-references.js` and `ml-batch1-knn.test.mjs` |
| Clustering | `ml-kmeans-assignment-update`, `ml-dbscan-core-border-noise`, `ml-gmm-responsibilities` | `ml-batch1-clustering-references.js` and `ml-batch1-clustering.test.mjs` |

Three isolated implementation worktrees and one integrator can proceed in parallel. Each module exports `references`, with the same `{id, lessons, prompts, keywords, useWhen, spec}` contract as existing modules. Agents do not edit shared files. The integration lane registers all ten after their commits are reviewed.

## Mathematical and teaching acceptance

1. Tree: parent and children use the same eight observations; show parent impurity, weighted children and decrease for Gini and entropy.
2. SVM C: same training data in both panels; demonstrate a defensible soft-margin objective with exact C-dependent solutions. Do not imply higher C must improve classification accuracy.
3. Feature mapping: preserve observation identities; show a nonlinear map whose transformed geometry admits a linear separator.
4. Weighted KNN: compute each distance and inverse-distance vote; show a dataset where weighting changes the result.
5. Scaling: keep raw sample coordinates fixed; changing one metric scale must actually reverse nearest-neighbour ranking.
6. K boundaries: use the same observations and axes; derive the boundaries and query predictions from nearest-neighbour votes. State the tie convention.
7. KD regions: split lines, counts and highlighted tree path agree; do not imply the first leaf eliminates the need for backtracking.
8. K-means: assignment uses the original centres, then update moves each centre to its assigned group mean; observations remain unchanged.
9. DBSCAN: include a true border point, explicit epsilon/min_samples and self-counting convention; independently classify all points.
10. GMM: normalize component likelihoods times priors into responsibilities; distinguish density from probability and contour radius from enclosed mass.

## Execution and verification

- [x] Add ten reference records and independent numeric checks; validate through the public schema and actual SVG renderer.
- [x] Integrate the records and test natural prompts, paraphrases and actual author-message preparation with the existing bounded selector.
- [x] Export real JSON/SVGs and inspect all ten rendered scenes with the existing palette. Record static-preview limitations honestly.
- [x] Run focused diagram/reference/author integration checks and the web build. No broad CI or paid model calls in this batch.
- [x] Update the lesson-by-lesson coverage audit, reference counts and Claude handoff. Keep live generation/browser acceptance separate.
- [x] Commit and push `chatgpt/explain-phase02-library`; verify remote tree matches the checked local tree; provide the published commit and handoff.

## Review focus

Check math against the records rather than duplicated constants; distinguish original and transformed coordinates; check DBSCAN reachability and self-inclusion, KNN ties, SVM objective conventions and GMM posterior normalization. Ensure selected examples are relevant and bounded, old references remain available, and no reference is claimed to be a real generated card.

## Verification receipt

421 focused tests pass, zero failed/skipped; web build passed; all 140 references exported, including the ten new scenes. All ten static SVGs inspected; formula glyph/browser and live model acceptance remain pending. The author paraphrase misses and broken numeric wrapping found in review were fixed with regressions. See the [batch handoff](../../features/explain-on-canvas/handoff/phase02-library/batch-1.md).
