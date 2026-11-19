# GEN-1 R3 bench report

## First: questions with a reference, three seeds: how many give three visibly identical pictures (same kind, same labels, same values)

| set | arm | questions with 3 delivered runs | three identical pictures | same kind in all 3, other labels or values | 2+ distinct kinds | mean distinct structures | mean distinct values |
|---|---|---|---|---|---|---|---|
| ontopic | before | 15 | 3/15 (20 %) | 12 | 0 | 1.93 | 2.27 |
| ontopic | after | 15 | 0/15 (0 %) | 15 | 0 | 2.33 | 2.40 |
| numeric | before | 7 | 2/7 (29 %) | 4 | 1 | 2.43 | 1.43 |
| numeric | after | 7 | 1/7 (14 %) | 5 | 1 | 2.57 | 1.57 |

Per on-topic question (kinds over the three seeds, BEFORE | AFTER; kindSource in AFTER):

| question | BEFORE kinds | AFTER kinds | AFTER kindSource | AFTER closest example shown | AFTER three identical |
|---|---|---|---|---|---|
| how do I compute the Gini impurity on both sides of a split and the in | matrix, matrix, matrix | matrix, matrix, matrix | reference-exact, reference-exact, reference-exact | yes, yes, yes | no |
| how does a random forest combine the predictions of its trees into one | flow, flow, flow | flow, flow, flow | reference-exact, reference-exact, reference-exact | yes, yes, yes | no |
| compare impurity-based feature importance with permutation importance  | bar-chart, bar-chart, bar-chart | bar-chart, bar-chart, bar-chart | reference-exact, reference-exact, reference-exact | yes, yes, yes | no |
| How does voting combine several weak classifiers? | bar-chart, bar-chart, bar-chart | bar-chart, bar-chart, bar-chart | reference-exact, reference-exact, reference-exact | yes, yes, yes | no |
| How does the transformer decoder avoid looking ahead at later words? | heatmap, heatmap, heatmap | heatmap, heatmap, heatmap | reference-exact, reference-exact, reference-exact | yes, yes, yes | no |
| What does a logarithmic axis do to a skewed positive feature? | coordinate-plot, coordinate-plot, coordinate-plot | coordinate-plot, coordinate-plot, coordinate-plot | reference-exact, reference-exact, reference-exact | yes, yes, yes | no |
| How can learning curves show whether more data may help? | coordinate-plot, coordinate-plot, coordinate-plot | coordinate-plot, coordinate-plot, coordinate-plot | reference-exact, reference-exact, reference-exact | yes, yes, yes | no |
| How do bias, variance and noise contribute to expected squared error? | bar-chart, bar-chart, bar-chart | bar-chart, bar-chart, bar-chart | reference-exact, reference-exact, reference-exact | yes, yes, yes | no |
| How do positive and negative residual corrections change an ensemble? | bar-chart, bar-chart, bar-chart | bar-chart, bar-chart, bar-chart | reference-exact, reference-exact, reference-exact | yes, yes, yes | no |
| How do grid search and random search cover a hyperparameter space? | coordinate-plot, coordinate-plot, coordinate-plot | coordinate-plot, coordinate-plot, coordinate-plot | reference-exact, reference-exact, reference-exact | yes, yes, yes | no |
| How can predicted probabilities be checked for calibration? | coordinate-plot, coordinate-plot, coordinate-plot | coordinate-plot, coordinate-plot, coordinate-plot | reference-exact, reference-exact, reference-exact | yes, yes, yes | no |
| How should I read an ACF stem plot? | coordinate-plot, coordinate-plot, coordinate-plot | coordinate-plot, coordinate-plot, coordinate-plot | reference-exact, reference-exact, reference-exact | yes, yes, yes | no |
| Why should feature-selection stability be measured across resamples? | bar-chart, bar-chart, bar-chart | bar-chart, bar-chart, bar-chart | reference-exact, reference-exact, reference-exact | yes, yes, yes | no |
| Explain binary search tree and bst and insertion to me | tree, tree, tree | tree, tree, tree | draw, draw, draw | yes, yes, yes | no |
| Explain folder and directory and file hierarchy to me | tree, tree, tree | tree, tree, tree | draw, draw, draw | yes, yes, yes | no |

## kindSource and the draw (AFTER): how the kind was decided

AFTER runs by kindSource: {"reference-exact":48,"draw":12,"none (no plan or no probabilities)":6}. Planner kind differs from the drawn kind in 28 of 60 drawn runs.

## Planner kind delivered and effective plan kind delivered (the kind the request carried)

| set | arm | runs | delivered | planner kind delivered | effective plan kind delivered |
|---|---|---|---|---|---|
| ontopic | before | 45 | 45 | 21/45 (47 %) | 45/45 (100 %) |
| ontopic | after | 45 | 45 | 21/45 (47 %) | 45/45 (100 %) |
| numeric | before | 21 | 21 | 15/21 (71 %) | 21/21 (100 %) |
| numeric | after | 21 | 21 | 17/21 (81 %) | 21/21 (100 %) |
| r3pre | after | 29 | 29 | 1/29 (3 %) | 29/29 (100 %) |

## Wrong-number flags by rule (delivered-card flags; invalid first answers by the rule text of the refusal)

| arm | delivered cards with a 154-rule flag | with an old-classifier flag | first answers refused for NUM-2 | for the softmax rules | for the 154 rules |
|---|---|---|---|---|---|
| before | 0 | 2 | 0 | 0 | 2 |
| after | 0 | 0 | 0 | 0 | 3 |

## Cards where the caption or the prose names a value the picture does not show (candidates for the Reviewer to recompute from the sheets)

43 cards. By arm: before 17, after 26. (A number in the caption or a decimal in the prose that is not a number of the diagram; computed values such as sums are expected here: the list is for reading, not a verdict.)
- before ontopic  seed 1: caption 100
- after ontopic  seed 1: caption 100
- after ontopic  seed 1: caption 7, 8, 7, 3
- before ontopic  seed 1: caption 7, 6
- before numeric  seed 1: caption 1, 1.5
- after numeric  seed 1: caption 1.5
- after numeric  seed 1: caption 4.5, 1.5, 4.5
- before numeric  seed 1: caption 1, 6
- before numeric  seed 1: caption 3, 7, 15, 31
- after numeric  seed 1: caption 3, 7, 15, 31
- before ontopic  seed 2: prose 0.1875
- before ontopic  seed 2: caption 100
- after ontopic  seed 2: caption 100
- after ontopic  seed 2: caption 7, 6
- before ontopic  seed 2: caption 7, 6
- after numeric  seed 2: prose 2.0, 1.0, 0.1
- before numeric  seed 2: caption 1
- before numeric  seed 2: caption 1, 1.5
- after numeric  seed 2: caption 1, 1.5
- before numeric  seed 2: caption 4.5, 1.5, 4.5; prose 4.5
- before numeric  seed 2: caption 3, 7, 15, 31
- after numeric  seed 2: caption 3, 7, 15, 31
- before ontopic  seed 3: caption 100
- after ontopic  seed 3: caption 7, 6
- before ontopic  seed 3: caption 7, 8, 7, 3
- after numeric  seed 3: prose 7.39, 2.72, 1.11, 11.22
- before numeric  seed 3: caption 1.5
- after numeric  seed 3: caption 1.5
- after numeric  seed 3: caption 4.5, 1.5, 4.5; prose 1.5
- before numeric  seed 3: caption 1, 5, 7.5
- before numeric  seed 3: caption 3, 7, 15, 31
- after numeric  seed 3: caption 3, 7, 15, 31
- after numeric  seed 3: prose 36.8
- after r3pre  seed 1: caption 50
- after r3pre  seed 1: caption 3
- after r3pre  seed 1: caption 256
- after r3pre  seed 1: caption -1, -0.368, 0.632
- after r3pre  seed 1: caption 100
- after r3pre  seed 1: caption 80
- after r3pre  seed 1: caption 1, 6
- after r3pre  seed 1: caption 15, 22.5, 98
- after r3pre  seed 1: caption 8, 1.5, 8
- after r3pre  seed 1: caption 14, 21; prose 1.5

## The 29 R3-pre cells, once in AFTER: kind drawn against the R3-pre reference-steered kind (today) and the planner kind

| cell | prompt | R3-pre REF kind (today) | AFTER kind | kindSource | planner kind | same as REF |
|---|---|---|---|---|---|---|

AFTER kind equals the reference-steered kind in 0 of 0 cells.

## Per arm: failures, repairs, providers, latency, cost

| arm | runs | delivered | honest failures | first attempt valid | repairs (sum) | moved to next provider | p50 / p90 ms | settled US$ |
|---|---|---|---|---|---|---|---|---|
| before | 66 | 66 | 0 | 64/66 (97 %) | 2 | 2 | 2497 / 3273 | 0.186 |
| after | 95 | 95 | 0 | 88/95 (93 %) | 8 | 4 | 2492 / 3721 | 0.292 |

Settled total of the bench (incl. the planner estimate US$0.0002 a run): US$0.510.
