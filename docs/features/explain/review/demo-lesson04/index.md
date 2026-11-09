# Review pack demo-lesson04

The 13 Lesson 04 demo prompts, one run each, Balanced (bench key standard); prompts 03 and 08 also at Detailed (bench key deep). Set scripts/explain-bench/sets/demo-lesson04.json, judge factual-v2 only. Runs: 2026-11-09T112024-demo-lesson04-balanced, 2026-11-09T112209-demo-lesson04-detailed. Nothing edited: what is here is what the pipeline produced.

| # | Prompt | Depth | Expected reference | Expected kind | Model kind | Selector hit | First pick | References sent (order) | Planner kind | Factual (1-5) | Repaired | Time | Tokens in/out |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 01 | [how does a decision tree split a two-feature dataset into regions?](01-decision-regions/card.md) | Balanced | ml-trees-decision-regions | coordinate-plot | coordinate-plot | yes | no | shape-coordinate-plot ml-trees-decision-regions ml-tree-split-path | coordinate-plot | 4 | no | 5156 ms | 4240/788 |
| 02 | how does Gini impurity change as the fraction of one class goes from 0 to 1, compared with entropy? | Balanced | ml-trees-gini-vs-entropy | pending | not run |  |  |  |  |  |  |  |  |
| 03 | [how do I compute the Gini impurity on both sides of a split and the information gain?](03-gini-split/card.md) | Balanced | ml-trees-gini-split | matrix | tree | no | no | shape-tree ml-tree-split-path | tree | 5 | no | 3404 ms | 3840/720 |
| 03 | [how do I compute the Gini impurity on both sides of a split and the information gain?](03-gini-split-detailed/card.md) | Detailed | ml-trees-gini-split-detailed | matrix | tree | no | no | shape-tree ml-tree-split-path | tree | 5 | no | 4105 ms | 3933/746 |
| 04 | [how does a decision tree search for the best threshold on one feature?](04-threshold-search/card.md) | Balanced | ml-trees-threshold-search | coordinate-plot | coordinate-plot | yes | no | shape-coordinate-plot ml-trees-threshold-search sigmoid-threshold | coordinate-plot | 5 | no | 3549 ms | 4072/601 |
| 05 | [how does a decision tree trace a new point from the root to a prediction?](05-grown-tree/card.md) | Balanced | ml-trees-grown-tree | tree | tree | yes | no | shape-tree ml-trees-grown-tree ml-tree-split-path | tree | 5 | no | 3110 ms | 4111/547 |
| 06 | [how does held-out error change as a decision tree grows deeper?](06-depth-overfit/card.md) | Balanced | ml-trees-depth-overfit | coordinate-plot | coordinate-plot | yes | no | shape-coordinate-plot ml-trees-depth-overfit | coordinate-plot | 5 | no | 4048 ms | 3845/685 |
| 07 | how does cost-complexity pruning trade tree size against accuracy as alpha increases? | Balanced | ml-trees-cost-complexity-pruning | pending | not run |  |  |  |  |  |  |  |  |
| 08 | how does a regression tree fit y = sin(x) with a step function at depth 2 versus depth 5? | Balanced | ml-trees-regression-step-fit | pending | not run |  |  |  |  |  |  |  |  |
| 08 | how does a regression tree fit y = sin(x) with a step function at depth 2 versus depth 5? | Detailed | ml-trees-regression-step-fit-detailed | pending | not run |  |  |  |  |  |  |  |  |
| 09 | [what does a bootstrap sample of the training rows look like, and which rows repeat?](09-bootstrap-roots/card.md) | Balanced | ml-trees-bootstrap-roots | sample-set | sample-set | yes | no | shape-sample-set ml-trees-bootstrap-roots bootstrap-replacement-oob | sample-set | 2 ERROR | yes | 9668 ms | 17018/1442 |
| 10 | why does a bootstrap sample contain only about 63% of the unique training rows? | Balanced | ml-trees-bootstrap-coverage | pending | not run |  |  |  |  |  |  |  |  |
| 11 | [how does a random forest combine the predictions of its trees into one answer?](11-majority-vote/card.md) | Balanced | ml-trees-majority-vote | bar-chart | flow | no | no | shape-flow ml-bagging-vote-flow | flow | 5 | no | 3885 ms | 3805/779 |
| 12 | how does test accuracy change with 1, 5, 10, 50 and 200 trees in a random forest? | Balanced | ml-trees-forest-size-accuracy | pending | not run |  |  |  |  |  |  |  |  |
| 13 | [compare impurity-based feature importance with permutation importance when one feature is random noise](13-feature-importance/card.md) | Balanced | ml-trees-feature-importance | bar-chart | comparison | no | no | shape-comparison | comparison | 4 | no | 3126 ms | 3501/472 |

Cards run 9 of 15; delivered 9/9; selector hit 5/9; first pick 0/9; model kind = expected 5/9 (cards with a known expected kind); factual error 1/9; repaired 1; planner routed to picture 0; cost US$0.0292.
