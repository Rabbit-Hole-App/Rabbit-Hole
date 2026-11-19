# GEN-1 R2 bench: REPORT

BEFORE = main a2736974f (release 163), AFTER = feat/gen-1-r2 7407494e9 (G5 narrowed schemas from R1, G1 seeded examples, G2 heading, G6 holds and roadmap planner (title and goal only), merged with main and the pool: library 492 references). 264 runs (132 items x 2 arms): questions 240 (google-low 204, fireworks-low 36... see sets below) and 24 roadmap runs. Settled cost **US$0.778** (estimate US$0.95 to 1.0, stop line US$1.20); with R1 1.43 and R3-pre 0.099 the GEN-1 spend is US$2.31 of US$5 (US$2.69 left for R3).

## Reading (the lead, before the tables)
- First line, both rates: planner kind delivered 62 % AFTER vs 59 % BEFORE (all questions); effective plan kind delivered 94 % vs 92 %. On the no-match questions (where G1 acts): 89 % vs 87 % on google-low, 83 % vs 75 % on fireworks-low. On-topic questions are unchanged by R2 (as designed: effective plan kind 100 % in both arms; the planner kind is replaced by the reference in all 15 until R3).
- Variation (the point of G1): the same prompt with three seeds already differed in structure BEFORE (mean distinct structures 2.93 on no-match), AFTER 3.00; distinct values 1.36 -> 1.54; kinds stay at about 1.0 (the planner fixes the kind). So seeded examples did NOT measurably increase variation over the model temperature alone: in this bench the no-match path was already varied. The SAME-1 triplet: all three questions are bar-charts in every run and arm, with different structures (A, B, C never share an identical picture, before or after); the third question (top-k) draws the same top-2 chart in all three seeds.
- Reliability and cost (probably R1 G5 plus the examples): first attempt valid 107 of 119 (90 %) vs 95 of 120 (79 %); repairs 14 vs 31; moved to the fallback provider 3 vs 16; honest failures 0 vs 2; p50 / p90 latency 2.6 s / 5.7 s vs 3.4 s / 10.3 s; settled cost per 120 questions US$0.298 vs 0.365 (-18 %); 154-rule flags 0 / 0, old-classifier flags 4 vs 7.
- Roadmap path (separately, repairs 0, one call): BEFORE 10 of 12 delivered (2 honest failures), AFTER 11 of 12 (1); the planner now runs for roadmap cards (planner kind delivered 11 of 11); settled cost per card about 2,622 micros vs 2,520; the quote hold per card 29,271 vs 18,771 micros (+56 %, the 4,500-character examples room plus the plan delta) and actual / hold 0.090 vs 0.134: the hold stays an upper bound with room to spare.
- Output sheets for the Reviewer (the numbers are recomputed by hand): sheets/sheet-01..09.png: the AFTER cards (google-low) of the 15 no-match, 7 numeric and 3 SAME-1 questions, three seeds side by side with the kind above each card. Not included: the 15 on-topic questions (R2 does not touch them; the R3 bench carries those sheets).

(Generated tables follow.)

---

# GEN-1 R2 bench report

## First line: planner kind delivered and effective plan kind delivered

| set / profile | arm | runs | delivered | planner kind delivered | effective plan kind delivered (the kind the request carried) |
|---|---|---|---|---|---|
| same1 / google-low | before | 9 | 9 | 0/9 (0 %) | 9/9 (100 %) |
| same1 / google-low | after | 9 | 9 | 0/9 (0 %) | 9/9 (100 %) |
| same1 / fireworks-low | before | 9 | 9 | 0/9 (0 %) | 9/9 (100 %) |
| same1 / fireworks-low | after | 9 | 9 | 0/9 (0 %) | 9/9 (100 %) |
| nomatch / google-low | before | 45 | 45 | 39/45 (87 %) | 39/45 (87 %) |
| nomatch / google-low | after | 45 | 45 | 40/45 (89 %) | 40/45 (89 %) |
| nomatch / fireworks-low | before | 12 | 12 | 9/12 (75 %) | 9/12 (75 %) |
| nomatch / fireworks-low | after | 12 | 12 | 10/12 (83 %) | 10/12 (83 %) |
| ontopic / google-low | before | 15 | 15 | 1/15 (7 %) | 15/15 (100 %) |
| ontopic / google-low | after | 15 | 15 | 0/15 (0 %) | 15/15 (100 %) |
| numeric / google-low | before | 21 | 20 | 14/20 (70 %) | 20/20 (100 %) |
| numeric / google-low | after | 21 | 21 | 15/21 (71 %) | 21/21 (100 %) |
| numeric / fireworks-low | before | 9 | 8 | 7/8 (88 %) | 7/8 (88 %) |
| numeric / fireworks-low | after | 9 | 9 | 9/9 (100 %) | 9/9 (100 %) |
| ALL questions | before | 120 | 118 | 70/118 (59 %) | 108/118 (92 %) |
| ALL questions | after | 120 | 120 | 74/120 (62 %) | 113/120 (94 %) |

## Same prompt, three seeds (delivered cards, first diagram): distinct kinds, distinct structures (kind + item counts + labels), distinct values

| set | arm | questions with 3 delivered runs | mean distinct kinds | mean distinct structures | questions with 2+ distinct structures | mean distinct values |
|---|---|---|---|---|---|---|
| same1 | before | 3 | 1.00 | 2.33 | 3/3 (100 %) | 1.33 |
| same1 | after | 3 | 1.00 | 2.33 | 2/3 (67 %) | 2.33 |
| nomatch | before | 14 | 1.07 | 2.93 | 14/14 (100 %) | 1.36 |
| nomatch | after | 13 | 1.08 | 3.00 | 13/13 (100 %) | 1.54 |
| ontopic | before | 5 | 1.00 | 1.40 | 1/5 (20 %) | 1.40 |
| ontopic | after | 5 | 1.00 | 1.80 | 3/5 (60 %) | 1.80 |
| numeric | before | 6 | 1.00 | 2.17 | 5/6 (83 %) | 1.50 |
| numeric | after | 7 | 1.00 | 2.43 | 5/7 (71 %) | 1.00 |

## The SAME-1 triplet: do the three questions share a picture (kind + item counts + labels)?

| arm | profile | rep | A kind | B kind | C kind | A = B = C structure |
|---|---|---|---|---|---|---|
| before | google-low | 1 | bar-chart | bar-chart | bar-chart | no |
| before | google-low | 2 | bar-chart | bar-chart | bar-chart | no |
| before | google-low | 3 | bar-chart | bar-chart | bar-chart | no |
| before | fireworks-low | 1 | bar-chart | bar-chart | bar-chart | no |
| before | fireworks-low | 2 | bar-chart | bar-chart | bar-chart | no |
| before | fireworks-low | 3 | bar-chart | bar-chart | bar-chart | no |
| after | google-low | 1 | bar-chart | bar-chart | bar-chart | no |
| after | google-low | 2 | bar-chart | bar-chart | bar-chart | no |
| after | google-low | 3 | bar-chart | bar-chart | bar-chart | no |
| after | fireworks-low | 1 | bar-chart | bar-chart | bar-chart | no |
| after | fireworks-low | 2 | bar-chart | bar-chart | bar-chart | no |
| after | fireworks-low | 3 | bar-chart | bar-chart | bar-chart | no |

## Roadmap path (separately: repairs 0, one call per card)

| arm | cards | delivered | honest failures | settled cost per card (micros, mean) | hold (quote) micros, mean | actual / hold | planner kind delivered | effective plan kind delivered |
|---|---|---|---|---|---|---|---|---|
| before | 12 | 10 | 2 | 2520 | 18771 | 0.134 | 0/0 | 0/0 |
| after | 12 | 11 | 1 | 2622 | 29271 | 0.090 | 11/11 (100 %) | 11/11 (100 %) |

## Per arm: failures, repairs, flags, providers, latency, cost (questions, all sets)

| arm | runs | delivered | honest failures | first attempt valid | repairs (sum) | moved to next provider | 154-rule flags | old-classifier flags | p50 / p90 ms | settled US$ |
|---|---|---|---|---|---|---|---|---|---|---|
| before | 120 | 118 | 2 | 95/120 (79 %) | 31 | 16 | 0 | 7 | 3392 / 10276 | 0.365 |
| after | 120 | 120 | 0 | 107/119 (90 %) | 14 | 3 | 0 | 4 | 2641 / 5653 | 0.298 |

Settled total of the bench (incl. the planner estimate US$0.0002 a run): US$0.778.

## Seeded-example trace (AFTER): runs with examples, mean examples per seeded run

64 seeded runs; mean 3.00 examples; kinds: {"flow":21,"coordinate-plot":10,"block-stack":3,"relationship":4,"cycle":13,"tensor":3,"matrix":3,"transformation":6,"comparison":1}
