# Offline Explanation SVG set 3

Task `045710d3-64f6-4bcf-8299-e124e71b5d20`. The set 3 commit is prepared for the post-release-116 cherry-pick. The single-diagram and depth catalogues use the reference registry, kind gallery and content linter from the prior offline batch at `2ebf5aeb2`. [Prior batch](../svg-offline.md)

## Paraphrase benchmark

Each of the 42 source prompts has five learner phrasings. The source prompt fields, kind expectations and depth labels are copied into the corresponding case. Within each set, `sourceId` links each `-p1` through `-p5` ID to its original. The selector benchmark matched production on all 252 queries. [Source benchmark at `8069336`](https://github.com/Rabbit-Hole-App/Rabbit-Hole/tree/80693364202de4f04777f24e18b2797eceeb49c4/scripts/explain-bench) · [correct-svg JSON](sets/correct-svg.json) · [AI/ML JSON](sets/aiml.json) · [Measured results](bench-results.json)

| Set | Selector coverage on originals | Selector coverage on paraphrases | Coverage change |
| --- | --- | --- | --- |
| correct-svg | 10/14 (71.4%) | 46/70 (65.7%) | −5.7 percentage points |
| AI/ML | 25/28 (89.3%) | 107/140 (76.4%) | −12.9 percentage points |

Coverage means at least one selected example. The selector bench also reports the kind of every selected reference. Correct-svg had 10/11 best-kind picks on originals and 46/51 on paraphrases. AI/ML had 22/27 and 95/122 respectively. These are selector results.

The planner dry runs loaded 70 original cases and 350 paraphrase cases. Correct-svg runs each prompt at all three depths, and AI/ML runs at Standard. Planner kind accuracy is pending recorded JEV responses for both corpora. Fresh planner predictions use the provider. The offline replay reads saved `rows.json`, matches set, ID, depth and exact wording, and applies the pinned planner's own kind scorer to the captured answers.

Run the offline comparison with the benchmark source checkout available.

```sh
node packages/control-plane/scripts/explanation-set3-bench.mjs \
  --bench-dir ../explain-bench-original/scripts/explain-bench \
  --out set3-selector-replay.json
```

The original scripts accept the two new JSON files as a set directory. For a planner dry run, copy them into `scripts/explain-bench/sets/` in a separate benchmark worktree pinned to `8069336`, then run its `planner.mjs --dry-run`. Keep the original benchmark worktree as the source for the original labels.

Once the saved planner rows are available, compare their accuracy in the same offline report.

```sh
node packages/control-plane/scripts/explanation-set3-bench.mjs \
  --bench-dir ../explain-bench-original/scripts/explain-bench \
  --planner-original-rows path/to/original-run/rows.json \
  --planner-paraphrase-rows path/to/paraphrase-run/rows.json \
  --out set3-planner-replay.json
```

The replay reports answered, failed and missing cases alongside the planner's existing best-kind and acceptable-kind rates.

## Single-diagram alternatives

The separate `singleDiagramReferences` catalogue contains 30 variants. That includes the two-column CPU/GPU comparison. Every record has `variant: 'single'`, a `panelReferenceId` and the panel record's exact keywords, prompts and lesson IDs. Each spec uses one existing diagram kind and teaches the original comparison or operation in one frame. [Catalogue](../../../../../../packages/web/src/tutor-diagrams/reference-single-variants.js)

Budgets count `cl100k_base` tokens in each compact `JSON.stringify(spec)`. Across the 30 pairs the total goes from 13,263 to 6,197, a 53.3% reduction. The CPU/GPU pair uses the same number of tokens in both forms. [Token receipt and spec fingerprints](../../../../../../packages/web/src/tutor-diagrams/set3-token-budgets.json)

| Panel reference | Single kind | Panel tokens | Single tokens | Change |
| --- | --- | ---: | ---: | ---: |
| `ml-feature-scaling-transformation` | `matrix` | 358 | 157 | −201 |
| `ml-clustering-comparison` | `coordinate-plot` | 372 | 201 | −171 |
| `ml-concept-drift-comparison` | `coordinate-plot` | 276 | 187 | −89 |
| `ml-one-hot-encoding-transformation` | `matrix` | 245 | 130 | −115 |
| `ml-imputation-transformation` | `matrix` | 284 | 149 | −135 |
| `ml-boosting-correction-transformation` | `matrix` | 472 | 159 | −313 |
| `ml-differencing-transformation` | `matrix` | 478 | 171 | −307 |
| `ml-tree-impurity-gain` | `matrix` | 376 | 212 | −164 |
| `ml-svm-c-tradeoff` | `matrix` | 730 | 236 | −494 |
| `ml-svm-feature-map` | `coordinate-plot` | 477 | 228 | −249 |
| `ml-knn-distance-weighted-vote` | `matrix` | 642 | 227 | −415 |
| `ml-knn-scaled-distance` | `matrix` | 624 | 170 | −454 |
| `ml-knn-k-boundaries` | `coordinate-plot` | 770 | 338 | −432 |
| `ml-kd-tree-partitions` | `coordinate-plot` | 819 | 440 | −379 |
| `ml-kmeans-assignment-update` | `coordinate-plot` | 651 | 323 | −328 |
| `ml-dbscan-core-border-noise` | `coordinate-plot` | 670 | 392 | −278 |
| `ml-gmm-responsibilities` | `matrix` | 584 | 241 | −343 |
| `ml-ordinal-encoding` | `matrix` | 311 | 168 | −143 |
| `ml-value-binning` | `matrix` | 341 | 203 | −138 |
| `ml-feature-interaction` | `matrix` | 393 | 168 | −225 |
| `ml-confusion-denominators` | `heatmap` | 306 | 136 | −170 |
| `ml-soft-vote-probabilities` | `matrix` | 364 | 193 | −171 |
| `ml-adaboost-weight-update` | `matrix` | 457 | 203 | −254 |
| `ml-stacking-oof-predictions` | `matrix` | 332 | 182 | −150 |
| `ml-minority-accuracy-trap` | `heatmap` | 254 | 132 | −122 |
| `ml-psi-bin-contributions` | `matrix` | 431 | 233 | −198 |
| `ml-acf-vs-pacf` | `bar-chart` | 421 | 172 | −249 |
| `ml-recursive-vs-direct-forecast` | `matrix` | 398 | 189 | −209 |
| `ml-cpu-vs-gpu` | `matrix` | 77 | 77 | 0 |
| `ml-dropout-network` | `matrix` | 350 | 180 | −170 |

Static renders use the existing renderer at 320, 408 and 720 px. Dense plots keep the renderer’s native minimum width and can scroll at narrower card widths.

## Gallery depth labels

All 21 examples have Overview, Standard and Deep labels. Overview uses everyday words in the authored text. The renderer supplies fixed notation and headings for some kinds, such as the T-account headings. Standard matches the existing gallery exactly. Deep uses precise terms and includes relevant math in `$…$`, often in a caption to keep the marks legible. Each group preserves its original kind, structure and data. The 63 compact specs fit the 200-token budget. [Depth gallery](../../../../../../packages/web/src/tutor-diagrams/kind-gallery-depths.json)

The smallest spec is 36 tokens and the largest is 181. Counts include the entire compact spec.

| Kind | Overview | Standard | Deep |
| --- | ---: | ---: | ---: |
| `flow` | 94 | 91 | 113 |
| `comparison` | 54 | 47 | 84 |
| `timeline` | 51 | 44 | 68 |
| `sequence` | 78 | 73 | 95 |
| `matrix` | 56 | 53 | 79 |
| `layers` | 40 | 40 | 73 |
| `cycle` | 46 | 36 | 82 |
| `figure` | 55 | 49 | 83 |
| `tree` | 59 | 57 | 91 |
| `relationship` | 70 | 67 | 98 |
| `transformation` | 51 | 45 | 75 |
| `argument` | 70 | 68 | 105 |
| `number-line` | 73 | 70 | 92 |
| `coordinate-plot` | 153 | 150 | 181 |
| `bar-chart` | 45 | 41 | 62 |
| `t-account` | 57 | 51 | 74 |
| `waterfall` | 53 | 48 | 67 |
| `heatmap` | 79 | 62 | 98 |
| `sample-set` | 70 | 68 | 88 |
| `histogram` | 67 | 59 | 87 |
| `box-plot` | 96 | 74 | 104 |

## Picture prompts

The templates produce the existing author `p` field. The five classes cover mechanism cutaway, positional arrangement, exterior appearance, organism and repeating structure. The formatter checks the 200-character limit after filling in the details. Each prompt ends exactly with `no text, labels, titles or icons`. Filled examples passed the existing picture schema at 158–182 characters. Live image checks are part of the release team's verification. [Templates](../../../../../../packages/control-plane/src/explanation-picture-templates.js)

## Verification

The integrated offline run passed 829 focused tests and the web build. The new fixtures render 90 single-diagram SVGs and 189 depth SVGs across the three widths. The prior 585 renderer snapshots still pass. A broader control-plane lane run encountered 49 failures, with missing dependencies and existing fixture failures reproduced in a representative base run. Broader web checks encountered a missing Babel parser on the base and a cooling runtime-limit failure that passed on a standalone retry.
