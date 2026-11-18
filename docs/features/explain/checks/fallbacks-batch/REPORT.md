# Fallbacks batch: BEFORE main 9531b382f vs AFTER feat/fallbacks-batch (SIMP-1 + GEM-S1)

google-low (Gemini flash-lite, then gpt-oss-120b), planner jev, sampler off, no pictures, in process. 66 runs (33 before, 33 after).
Definitions: failure line = a run that ended with explanation_missing_visual (honest failure). Mismatched flow = planned token-links/heatmap/matrix/transformation/tree, delivered with a flow/chain diagram and none of the planned kind. First attempt valid = the first provider step's first answer raised no learn_artifact_invalid at attempt 0.

## 1. Headline

| arm | runs | delivered | failed | ended on failure line (explanation_missing_visual) | other failures | mismatched flows | delivered without the planned kind | first attempt valid | moved to next provider | model calls/run | cost US$ (settled) | median ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| before | 33 | 33 | 0 | 0 | 0 | 17 | 20 | 7/33 (21%) | 0 | 1.79 | 0.1450 | 4121 |
| after | 33 | 33 | 0 | 0 | 0 | 0 | 19 | 6/33 (18%) | 18 | 2.36 | 0.1814 | 8113 |

## 2. Per prompt x depth: AFTER failure-line runs vs BEFORE mismatched flows

| cell | prompt | depth | tags | planned kinds seen | runs B/A | BEFORE mismatched flows | BEFORE failure line | AFTER mismatched flows | AFTER failure line | delivered B/A | planned kind missing B/A |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | How does the transformer decoder avoid looking.. | balanced | gem-s1+simp-1 | token-links | 3/3 | 3 | 0 | 0 | 0 | 3/3 | 3/3 |
| 2 | How does the transformer decoder avoid looking.. | detailed | gem-s1+simp-1 | token-links | 3/3 | 3 | 0 | 0 | 0 | 3/3 | 3/3 |
| 3 | Can you show the numbers when forward diffusio.. | balanced | gem-s1+simp-1 | transformation | 3/3 | 3 | 0 | 0 | 0 | 3/3 | 3/3 |
| 4 | Can you show the numbers when forward diffusio.. | brief | new | transformation | 3/3 | 3 | 0 | 0 | 0 | 3/3 | 3/3 |
| 5 | Can you show the numbers when forward diffusio.. | detailed | new | transformation | 3/3 | 3 | 0 | 0 | 0 | 3/3 | 3/3 |
| 6 | how do I compute the Gini impurity on both sid.. | balanced | gem-s1 | tree | 3/3 | 0 | 0 | 0 | 0 | 3/3 | 3/3 |
| 7 | what is gini impurity | brief | simp-1 | tree | 3/3 | 2 | 0 | 0 | 0 | 3/3 | 2/0 |
| 8 | what is gradient descent? | brief | simp-1 | flow,cycle | 3/3 | 0 | 0 | 0 | 0 | 3/3 | 0/1 |
| 9 | what is a learning rate schedule? | brief | simp-1 | flow | 3/3 | 0 | 0 | 0 | 0 | 3/3 | 0/0 |
| 10 | compare a stack and a queue | balanced | simp-1 | layers | 3/3 | 0 | 0 | 0 | 0 | 3/3 | 0/0 |
| 11 | compare a stack and a queue | brief | simp-1 | layers | 3/3 | 0 | 0 | 0 | 0 | 3/3 | 0/0 |

Expected: AFTER mismatched flows 0 for matrix/token-links/heatmap/transformation plans (a card with no valid diagram of that family goes to the next provider, then fails honestly); BEFORE shows the baseline.

## 3. GEM-S1: first attempt valid before/after (the 4 GEM-S1 cells)

| scope | arm | runs | first attempt valid | attempt-0 "columns ... received object" error | any attempt-0 error | runs with a matrix_coerced event | delivered | moved to next provider |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| all 4 GEM-S1 cells | before | 12 | 1/12 | 0 | 11 | 12 | 12 | 0 |
| all 4 GEM-S1 cells | after | 12 | 1/12 | 0 | 11 | 9 | 12 | 9 |
| cell 1: How does the transformer decod.. (balanced) | before | 3 | 0/3 | 0 | 3 | 3 | 3 | 0 |
| cell 1: How does the transformer decod.. (balanced) | after | 3 | 0/3 | 0 | 3 | 3 | 3 | 3 |
| cell 2: How does the transformer decod.. (detailed) | before | 3 | 0/3 | 0 | 3 | 3 | 3 | 0 |
| cell 2: How does the transformer decod.. (detailed) | after | 3 | 0/3 | 0 | 3 | 0 | 3 | 3 |
| cell 3: Can you show the numbers when .. (balanced) | before | 3 | 0/3 | 0 | 3 | 3 | 3 | 0 |
| cell 3: Can you show the numbers when .. (balanced) | after | 3 | 0/3 | 0 | 3 | 3 | 3 | 3 |
| cell 6: how do I compute the Gini impu.. (balanced) | before | 3 | 1/3 | 0 | 2 | 3 | 3 | 0 |
| cell 6: how do I compute the Gini impu.. (balanced) | after | 3 | 1/3 | 0 | 2 | 3 | 3 | 0 |

Matrix-coercion events (coercedByQ0 = explanation_matrix_coerced: action, columns coerced or the reason it was left):

| arm: action reason | events |
| --- | --- |
| after: coerced (columns 0) | 1 |
| after: left column lists of different lengths | 1 |
| after: left column lists with no labels for the items (the repair names them; Item 1, Item 2 is never invented) | 23 |
| before: coerced (columns 0) | 1 |
| before: left column lists of different lengths | 4 |
| before: left column lists with no labels for the items (the repair names them; Item 1, Item 2 is never invented) | 29 |

## 4. Extra provider calls and latency

| arm | runs | model calls (ledger rows) | calls/run | runs with 2+ provider steps | cards written by gpt-oss | cost upper bound US$ (incl. planner est.) | median ms (all) | median ms (delivered) | mean ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| before | 33 | 59 | 1.79 | 0 | 0 | 0.1516 | 4121 | 4121 | 4182 |
| after | 33 | 78 | 2.36 | 18 | 18 | 0.1880 | 8113 | 8113 | 6838 |

Paired (AFTER minus BEFORE, n=33 items): latency median 3507 ms, mean 2656 ms; model calls median 1, mean 0.58. Both delivered 33; BEFORE delivered, AFTER failed 0; AFTER delivered, BEFORE failed 0; both failed 0.

## 5. Per model (the model that wrote the delivered card; a failed run has none)

| model | arm | runs | mismatched flows | planned kind missing | delivered with a card-errors flag | median ms | cost US$ (settled) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| gemini-flash-lite | before | 33 | 17 | 20 | 0 | 4121 | 0.1450 |
| gemini-flash-lite | after | 15 | 0 | 4 | 0 | 3848 | 0.0606 |
| gpt-oss-120b | before | 0 | 0 | 0 | 0 | - | 0.0000 |
| gpt-oss-120b | after | 18 | 0 | 15 | 3 | 8633 | 0.1208 |
| none (failed) | before | 0 | 0 | 0 | 0 | - | 0.0000 |
| none (failed) | after | 0 | 0 | 0 | 0 | - | 0.0000 |

Model calls by arm and model (ledger):

| arm model | calls |
| --- | --- |
| after accounts/fireworks/models/gpt-oss-120b | 18 |
| after gemini-3.5-flash-lite | 60 |
| before gemini-3.5-flash-lite | 59 |

## 6. Every failure-line run and every mismatched flow

| item | arm | cell | depth | prompt | planned | final kinds | outcome | attempts |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | before | 1 | balanced | How does the transformer decoder a.. | token-links | flow,flow | MISMATCHED FLOW | google:artifact |
| 2 | before | 2 | detailed | How does the transformer decoder a.. | token-links | flow | MISMATCHED FLOW | google:artifact |
| 3 | before | 3 | balanced | Can you show the numbers when forw.. | transformation | flow | MISMATCHED FLOW | google:artifact |
| 4 | before | 4 | brief | Can you show the numbers when forw.. | transformation | flow | MISMATCHED FLOW | google:artifact |
| 5 | before | 5 | detailed | Can you show the numbers when forw.. | transformation | flow | MISMATCHED FLOW | google:artifact |
| 7 | before | 7 | brief | what is gini impurity | tree | flow | MISMATCHED FLOW | google:artifact |
| 12 | before | 1 | balanced | How does the transformer decoder a.. | token-links | flow | MISMATCHED FLOW | google:artifact |
| 13 | before | 2 | detailed | How does the transformer decoder a.. | token-links | flow | MISMATCHED FLOW | google:artifact |
| 14 | before | 3 | balanced | Can you show the numbers when forw.. | transformation | flow | MISMATCHED FLOW | google:artifact |
| 15 | before | 4 | brief | Can you show the numbers when forw.. | transformation | flow | MISMATCHED FLOW | google:artifact |
| 16 | before | 5 | detailed | Can you show the numbers when forw.. | transformation | flow | MISMATCHED FLOW | google:artifact |
| 23 | before | 1 | balanced | How does the transformer decoder a.. | token-links | flow | MISMATCHED FLOW | google:artifact |
| 24 | before | 2 | detailed | How does the transformer decoder a.. | token-links | flow | MISMATCHED FLOW | google:artifact |
| 25 | before | 3 | balanced | Can you show the numbers when forw.. | transformation | flow | MISMATCHED FLOW | google:artifact |
| 26 | before | 4 | brief | Can you show the numbers when forw.. | transformation | flow | MISMATCHED FLOW | google:artifact |
| 27 | before | 5 | detailed | Can you show the numbers when forw.. | transformation | flow | MISMATCHED FLOW | google:artifact |
| 29 | before | 7 | brief | what is gini impurity | tree | flow | MISMATCHED FLOW | google:artifact |

## 7. Cost

Total, both arms, upper bound: US$0.3396 over 66 runs (settled ledger US$0.3264); cap US$0.60.
