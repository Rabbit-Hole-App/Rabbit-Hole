# 04 · Decision Trees and Random Forests

**Worked example.** One dataset supplies the fitted trees, exact split scores, held-out error and vote. The longer depth curves and the noise feature comparison use separately labelled illustrative values. The vote uses row J's features and compares the result with its label after prediction.

| Row | Feature x | Feature y | Class | Use |
| --- | ---: | ---: | ---: | --- |
| A | 1 | 1 | 0 | Training |
| B | 1 | 5 | 0 | Training |
| C | 3 | 3 | 0 | Training |
| D | 3 | 7 | 0 | Training |
| E | 5 | 1 | 0 | Training |
| F | 5 | 3 | 1 | Training |
| G | 7 | 5 | 1 | Training |
| H | 7 | 7 | 1 | Training |
| I | 2 | 6 | 0 | Held out |
| J | 6 | 1 | 1 | Held out |

[Audited curriculum lesson](https://raw.githubusercontent.com/rohitg00/ai-engineering-from-scratch/e7db050e64bde3be17a9381476f748da26d85692/phases/02-ml-fundamentals/04-decision-trees/docs/en.md) · [Shared data and calculations](../../../../../../packages/web/src/tutor-diagrams/lesson-decision-trees-data.js) · [Reference module](../../../../../../packages/web/src/tutor-diagrams/lesson-decision-trees-references.js) · [Compact token counts](../../../../../../packages/web/src/tutor-diagrams/lesson-decision-trees-token-budgets.json)

The worked classifier tests midpoints between adjacent distinct values, chooses the lowest weighted Gini, and breaks split ties by feature order x then y, followed by the lower threshold. Leaves predict the majority class, with class 0 winning a tie. The forest uses fixed illustrative draws with replacement and considers one candidate feature at each split.

## 01 · One candidate split

A vertical cut sends the training points on either side of one x threshold to different children.

`ml-trees-candidate-split` · `coordinate-plot`

- **Brief** — Shows the cut and selected training rows. [408 px SVG](../illustrations/ml-trees-candidate-split-brief/408.svg)
- **Balanced** — Shows every training row by class. [408 px SVG](../illustrations/ml-trees-candidate-split/408.svg)
- **Detailed** — Counts the rows on each side and marks row E for the later depth comparison. [408 px SVG](../illustrations/ml-trees-candidate-split-detailed/408.svg)

The candidate `x ≤ 4` sends 4 rows left and 4 rows right.

## 02 · Gini on both sides

A split scores well when its children are pure, with larger children carrying more weight.

`ml-trees-gini-split` · `matrix`

- **Brief** — Reads the class counts beside each child’s Gini. [408 px SVG](../illustrations/ml-trees-gini-split-brief/408.svg)
- **Balanced** — Adds the row weight for each child. [408 px SVG](../illustrations/ml-trees-gini-split/408.svg)
- **Detailed** — Shows the parent Gini before the split and the gain after subtracting the weighted score. [408 px SVG](../illustrations/ml-trees-gini-split-detailed/408.svg)

For `x ≤ 4`, the left child has counts (4, 0) and Gini 0. The right child has counts (1, 3) and Gini `1 − (1/4)² − (3/4)² = 3/8`. The weighted Gini is `(4/8) × 0 + (4/8) × (3/8) = 3/16`. The parent Gini is `1 − (5/8)² − (3/8)² = 15/32`, so the gain is `15/32 − 3/16 = 9/32`.

Entropy uses `H(p) = −Σ p log₂ p`, with a zero-probability class contributing zero. The same cut has left entropy zero and right entropy `H(1/4, 3/4)`. Entropy information gain is `H(5/8, 3/8) − (1/2) × H(1/4, 3/4)`. The following figures use Gini so the split scores can be read as exact fractions.

## 03 · Search the thresholds

The greedy search evaluates distinct-value midpoints and keeps the cut with the lowest weighted Gini.

`ml-trees-threshold-search` · `coordinate-plot`

- **Brief** — Shows the tested x cuts as points and marks the minimum. [408 px SVG](../illustrations/ml-trees-threshold-search-brief/408.svg)
- **Balanced** — Draws one stem per midpoint on a decimal Gini axis from 0 to 0.4. [408 px SVG](../illustrations/ml-trees-threshold-search/408.svg)
- **Detailed** — Labels the three scores as decimals and marks the winning threshold. [408 px SVG](../illustrations/ml-trees-threshold-search-detailed/408.svg)

On x, the tested thresholds 2, 4, 6 score 3/8, 3/16, 5/24, in order. The decimal plot shows 0.375, 0.1875, and 0.2083, with the last score rounded to four decimal places. The minimum at `x ≤ 4` also beats the best y trial, `y ≤ 2`, which scores 3/8. Only the marked midpoints are evaluated.

## 04 · Grow and trace the tree

Growing the tree repeats the split search within each impure child until a leaf can make the prediction.

`ml-trees-grown-tree` · `tree`

- **Brief** — Reads the branch conditions and node counts from the root to the leaves. [408 px SVG](../illustrations/ml-trees-grown-tree-brief/408.svg)
- **Balanced** — Shows how each edge condition routes a subset of training rows. [408 px SVG](../illustrations/ml-trees-grown-tree/408.svg)
- **Detailed** — Highlights the path taken by the held-out row J. [408 px SVG](../illustrations/ml-trees-grown-tree-detailed/408.svg)

Each node shows its class 0 and class 1 counts. The `x ≤ 4` branch is pure. The `x > 4` branch splits at `y ≤ 2`. Row J at `(6, 1)` takes `x > 4` and then `y ≤ 2`, reaching the class 0 leaf.

## 05 · Read the decision regions

Each leaf gives a constant prediction throughout its rectangle on the feature plane.

`ml-trees-decision-regions` · `coordinate-plot`

- **Brief** — Fills the three rectangles and shows selected training points. [408 px SVG](../illustrations/ml-trees-decision-regions-brief/408.svg)
- **Balanced** — Shows every training point in the fitted regions. [408 px SVG](../illustrations/ml-trees-decision-regions/408.svg)
- **Detailed** — Marks E and overlays the held-out J to show why they get the same prediction. [408 px SVG](../illustrations/ml-trees-decision-regions-detailed/408.svg)

The regions correspond to `x ≤ 4`, `x > 4` with `y ≤ 2`, and `x > 4` with `y > 2`. The y cut divides only the right branch. The coordinate plot’s rectangle annotation supports these filled regions directly.

## 06 · Check where depth overfits

Increasing the depth can lower training error while increasing error on the same held-out rows.

`ml-trees-depth-overfit` · `coordinate-plot`

- **Brief** — Shows an illustrative run across depths 1–8 and marks the held-out minimum at depth 3. [408 px SVG](../illustrations/ml-trees-depth-overfit-brief/408.svg)
- **Balanced** — Compares the two illustrative curves as the training error reaches zero and the held-out error rises. [408 px SVG](../illustrations/ml-trees-depth-overfit/408.svg)
- **Detailed** — Returns to the toy dataset and labels the exact counts and denominators at depths 0, 1, and 2. [408 px SVG](../illustrations/ml-trees-depth-overfit-detailed/408.svg)

At depths 0, 1, 2, the training error counts are 3, 1, 0 out of 8. The held-out error counts are 1, 0, 1 out of 2. Depth 1 gives the best held-out result in this example. At depth 2, splitting off row E fixes its training prediction and sends row J to that same class, which disagrees with J’s held-out label. A maximum depth, minimum sample count, or minimum gain can stop growth early. Post-pruning instead removes branches after a tree has grown.

For the regression analogue, keep this dataset and treat its label values as numbers. At the same root cut, the child means are 0 and 3/4. A regression tree uses means at its leaves and compares variance reductions. For these binary numbers the variance is half the Gini, so this cut reduces variance from 15/64 to 3/32, a gain of 9/64.

## 07 · Draw a bootstrap for each tree

Sampling with replacement gives each tree its own draw of training rows and lets a row appear more than once.

`ml-trees-bootstrap-roots` · `sample-set`

- **Brief** — Shows the repeated IDs and fitted root for each draw. [408 px SVG](../illustrations/ml-trees-bootstrap-roots-brief/408.svg)
- **Balanced** — Adds class labels to the source row IDs. [408 px SVG](../illustrations/ml-trees-bootstrap-roots/408.svg)
- **Detailed** — Marks the out-of-bag rows that each draw omitted. [408 px SVG](../illustrations/ml-trees-bootstrap-roots-detailed/408.svg)

Each draw contains 8 entries from the training rows. The fitted roots are `x ≤ 4`, `y ≤ 4`, `x ≤ 5`, using both the displayed row draws and the per-node feature choices in the next figure. Repeated IDs count each time they appear. An omitted training row is out of bag for that tree. The held-out rows remain outside every draw.

## 08 · Draw a feature at each node

Randomizing which feature a node considers lets different trees choose different rules even when they can use the same two features overall.

`ml-trees-feature-subsets` · `matrix`

- **Brief** — Compares each root with its right child. [408 px SVG](../illustrations/ml-trees-feature-subsets-brief/408.svg)
- **Balanced** — Adds the left child for every tree and marks leaves. [408 px SVG](../illustrations/ml-trees-feature-subsets/408.svg)
- **Detailed** — Gives the fitted threshold for each node that splits. [408 px SVG](../illustrations/ml-trees-feature-subsets-detailed/408.svg)

A tree draws its rows once. A split draws a candidate feature for that node. The root candidate features are x, y, x in tree order. Tree 1 searches x at its root and y at its right child. Tree 2 has separate draws for its two children, and both happen to draw x. Pure leaves stop without searching.

## 09 · Combine the votes

A classification forest predicts the class with the most votes across its fitted trees.

`ml-trees-majority-vote` · `flow` at Balanced and Detailed, `bar-chart` at Brief

- **Brief** — Shows the totals by class and the winning class. [408 px SVG](../illustrations/ml-trees-majority-vote-brief/408.svg)
- **Balanced** — Follows the training rows through three bootstrap draws, root rules, and predictions for J. [408 px SVG](../illustrations/ml-trees-majority-vote/408.svg)
- **Detailed** — Shows the row IDs in each draw, including repeats, and traces each tree’s vote for J. [408 px SVG](../illustrations/ml-trees-majority-vote-detailed/408.svg)

For row J at `(6, 1)`, the trees predict 0, 1, 1. The vote counts are 1, 2 for classes 0 and 1 respectively. Class 1 wins. The trees can make different errors because they see different rows and candidate features. Combining diverse predictions can reduce variance.

## 10 · Compare feature importance

Impurity importance adds up what each feature contributed during training, while permutation importance measures the accuracy change after a held-out shuffle.

`ml-trees-feature-importance` · `bar-chart`

- **Brief** — Compares illustrative MDI and permutation rankings for x, y, and a noise ID. [408 px SVG](../illustrations/ml-trees-feature-importance-brief/408.svg)
- **Balanced** — Shows the noise ID’s high impurity-based score and near-zero held-out permutation score side by side. [408 px SVG](../illustrations/ml-trees-feature-importance/408.svg)
- **Detailed** — Explains how the many candidate cuts on a high-cardinality feature can inflate its training impurity decrease. [408 px SVG](../illustrations/ml-trees-feature-importance-detailed/408.svg)

The chart compares illustrative scores normalized separately for each method. A noise ID has many distinct values and can offer a split that happens to reduce training impurity. Shuffling it on held-out rows has little effect when it carries no signal.

For the separate two-feature worked forest, multiply each node’s Gini gain by the fraction of bootstrap entries reaching that node, then sum by feature across trees. The x total is `9/32 + 3/8 + 15/32 = 9/8`. The y total is `3/16 + 1/8 + 0 = 5/16`.

For a single permutation example, hold the trees fixed and swap one feature’s values between the held-out rows. Before the swap, the forest gets 2/2 labels right. Swapping x gives 0/2 correct, a drop of 100 percentage points. Swapping y gives 2/2 correct, a drop of 0 points. These are results for this one swap on the small held-out set.

## Additional demo figures

These five `coordinate-plot` references answer related questions from the lesson. The probability curves follow their formulas. The regression example fits its own sine samples. The pruning and forest-size curves use illustrative results.

### Compare Gini and entropy

Both scores are zero for a pure node and peak when the classes are equally frequent. Gini peaks at 0.5 and binary entropy at 1 bit. The plot samples the formulas at 11 equally spaced class fractions.

`ml-trees-gini-vs-entropy` · `coordinate-plot`

- **Brief** — Reads the two peaks at the same class fraction. [408 px SVG](../illustrations/ml-trees-gini-vs-entropy-brief/408.svg)
- **Balanced** — Compares the two formulas at 11 equally spaced class fractions. [408 px SVG](../illustrations/ml-trees-gini-vs-entropy/408.svg)
- **Detailed** — Gives the limit that sets entropy to zero at the endpoints. [408 px SVG](../illustrations/ml-trees-gini-vs-entropy-detailed/408.svg)

### Measure bootstrap coverage

Each of the n draws misses a given row with probability `1 − 1/n`. The probability that all n draws miss it approaches `1/e`, so the expected share of distinct rows drawn approaches 63.2%.

`ml-trees-bootstrap-coverage` · `coordinate-plot`

- **Brief** — Reads expected coverage from the omission limit. [408 px SVG](../illustrations/ml-trees-bootstrap-coverage-brief/408.svg)
- **Balanced** — Explains the formula for n replacement draws and shows n from 1 to 20. [408 px SVG](../illustrations/ml-trees-bootstrap-coverage/408.svg)
- **Detailed** — Evaluates the omission probability for the eight training rows in the worked example. [408 px SVG](../illustrations/ml-trees-bootstrap-coverage-detailed/408.svg)

### Choose a pruning penalty

At the marked penalty α = 0.01, the tree has six leaves and retains 90% held-out accuracy. The log axis shows equal ratios in α. Leaf count is shown as a share of the initial ten leaves so both curves use a percent scale.

`ml-trees-cost-complexity-pruning` · `coordinate-plot`

- **Brief** — Shows where the tree shrinks and accuracy stays flat. [408 px SVG](../illustrations/ml-trees-cost-complexity-pruning-brief/408.svg)
- **Balanced** — Marks the smallest tree on the best held-out accuracy plateau. [408 px SVG](../illustrations/ml-trees-cost-complexity-pruning/408.svg)
- **Detailed** — States the exact leaf count and accuracy at the chosen penalty. [408 px SVG](../illustrations/ml-trees-cost-complexity-pruning-detailed/408.svg)

### Compare forest sizes

In this illustrative run, increasing the forest from one tree to 50 raises test accuracy from 78% to 92%. The next 150 trees add half a percentage point. The log axis shows equal ratios in tree count.

`ml-trees-forest-size-accuracy` · `coordinate-plot`

- **Brief** — Shows how the accuracy curve levels off. [408 px SVG](../illustrations/ml-trees-forest-size-accuracy-brief/408.svg)
- **Balanced** — Labels the observed accuracy at all five illustrative forest sizes. [408 px SVG](../illustrations/ml-trees-forest-size-accuracy/408.svg)
- **Detailed** — Quantifies the gain from 50 to 200 trees on the same test split. [408 px SVG](../illustrations/ml-trees-forest-size-accuracy-detailed/408.svg)

### Fit sine with regression trees

Both trees fit the same 25 samples from 0° through 360°, one every 15°. The fits choose midpoint cuts by squared-error reduction, with limits of four leaves at depth two and sixteen at depth five. Each step is the mean of the rounded samples in its leaf.

`ml-trees-regression-step-fit` · `coordinate-plot`

- **Brief** — Shows how a leaf's mean gives a flat step. [408 px SVG](../illustrations/ml-trees-regression-step-fit-brief/408.svg)
- **Balanced** — Compares the four-leaf and sixteen-leaf fits with the same sine curve. [408 px SVG](../illustrations/ml-trees-regression-step-fit/408.svg)
- **Detailed** — Labels the four depth-two leaf means. [408 px SVG](../illustrations/ml-trees-regression-step-fit-detailed/408.svg)

## Pilot choices

All ten suggested figures are included. The split figures use Gini for exact arithmetic, with entropy and regression worked through alongside the figures. Figure 5 uses the coordinate plot’s filled rectangles. Figure 10 is included because the lesson covers MDI and permutation importance.

The 408 px links use the renderer’s normal minimum widths. A diagram wider than the card uses the existing horizontal scroll area. [Preview dimensions](../illustrations/manifest.json)
