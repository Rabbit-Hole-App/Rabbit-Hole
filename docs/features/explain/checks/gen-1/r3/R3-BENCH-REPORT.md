# GEN-1 R3 bench: REPORT

BEFORE = the release 165 tree (feat/release-165, a42d5e0f1), AFTER = that plus R3 only (feat/gen-1-r3, 2957c9e3e). 161 runs (95 questions x 3 seeds: 45 on-topic and 21 numeric in both arms, plus the 29 R3-pre cells once in AFTER), google-low, balanced depth. Settled cost **US$0.510** (estimate US$0.58, stop line US$0.70); GEN-1 total so far US$2.31 + 0.51 = US$2.82 of the US$5 (not a hard stop any more). Harness and plan: checks/gen-1/r3/BENCH-PLAN.md, bench/. Sheets: sheets/01..16.png (on-topic and numeric questions BEFORE row then AFTER row, three seeds side by side, kind and kindSource above each card; the 29 R3-pre cells once in AFTER; katex css loaded). The lead recomputed nothing by hand: the Reviewer recomputes the numbers from the sheets.

## Reading (the lead, before the generated tables)
- First line, questions with a reference, three seeds, three visibly identical pictures: on-topic 3 of 15 BEFORE, 0 of 15 AFTER; numeric 2 of 7 BEFORE, 1 of 7 AFTER. So R3 did not make pictures more alike: 15 of 15 on-topic questions keep one kind across the seeds in both arms (BEFORE already did: the request's plan kind was the reference kind in 45 of 45 runs), and AFTER the labels and values differ more (mean distinct structures 2.33 against 1.93, distinct values 2.40 against 2.27).
- kindSource AFTER: reference-exact 48 runs, draw 12 (the two non-exact references, tree-bst-insertion and tree-folder-hierarchy, plus numeric draws), none 6; the planner's kind differs from the drawn kind in 28 of 60 drawn runs. On the 29 R3-pre cells the planner kind is delivered in 1 of 29, effective plan kind 29 of 29.
- Reliability: delivery 66 of 66 BEFORE and 95 of 95 AFTER (no honest failures); first attempt valid 97 % BEFORE, 93 % AFTER; repairs 2 against 8; moved to the next provider 2 against 4; p50 / p90 latency 2.5 s / 3.3 s against 2.5 s / 3.7 s; settled cost per run 0.0028 BEFORE and 0.0031 AFTER.
- Wrong-number flags: delivered cards with a 154-rule flag 0 and 0; old-classifier flags 2 BEFORE, 0 AFTER; first answers refused for the 154 rules 2 BEFORE and 3 AFTER; NUM-2 and the softmax rules refused nothing in either arm.
- Cards where the caption or prose names a value the picture does not show: 43 candidates (BEFORE 17, AFTER 26; the list is for reading, not a verdict: computed values such as sums are expected). More candidates AFTER because the AFTER arm has 29 extra R3-pre cells' neighbours, not more per card: the per-arm counts are not normalised (BEFORE 66 runs, AFTER 95). The Reviewer recomputes them from the sheets.
- Pass reading from the plan: exact-reference questions keep their kind in all seeds: met (13 of 13, plus the two draw-kind tree questions also in one kind); pictures differ across seeds more often than BEFORE: met on distinct structures; wrong-number flags and honest failures not above BEFORE: met; settled cost under US$0.70: met.
- Known gap: R3 does not make `nextCanWrite` plan-aware (a spec item left out of the order). Note: the sheet generator wrote its files as 'sheetssheet-NN' because it joins the output folder without a slash; they were renamed to sheets/NN.png by hand (the script has the bug).

(Generated tables follow.)

---

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
