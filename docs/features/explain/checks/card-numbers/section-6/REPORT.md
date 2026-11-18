# Section 6 report: feat/card-numbers vs main on numeric errors (like with like)

Read this first.

- BEFORE = main d3857f7834f80e8ebe7e188a3555460ad1aff602, AFTER = feat/card-numbers 5c9da762031ade75e462fea01d9184c59ca1bc44 (both extracted with `git archive` into C:/s/sec6-trees, no worktree touched). Same prompt, same depth, run as a pair (arm order alternated per item so provider drift hits both alike), one at a time.
- Real chain code in process (`learn-artifact.js` generateArtifact -> `explanation-fast-chain.js`), real providers (Gemini 3.5 flash-lite then Fireworks gpt-oss-120b), profile google-low, EXPLANATION_PLANNER=jev (real TypeSafe planner call), EXPLANATION_INTERACTIONS=true as production, formula sampler off, no pictures (no Recraft). Input built the way artifactFetch builds it (depth, deriveVisualRequirements). The existing bench (`scripts/explain-bench/bench.mjs`) needs a running local wrangler stack; the chain's own offline test harness (node:sqlite ledger, control-plane/test/explanation-fast-chain.test.js) is the in-process mode, so `run.mjs` reuses that wiring instead of starting a Worker. No deploy, no D1, no R2, no Worker call.
- Cost per run = the ledger's settled cost (pricing registry x provider usage) plus a flat US$0.0002 per run estimate for the TypeSafe planner call (not in the ledger).
- Numeric errors = the card-errors checks (`/c/s/sprint2-evidence/card-errors/checks.mjs`, `checkCard`, unmodified): box fences, softmax/transformation recompute, plot formula recompute, bootstrap, sums, heatmap sums, arithmetic statements, label-value-vs-prose. "Error" = a delivered card with at least one flag.
- Plan: 83 distinct (prompt, canonical depth) pairs from the audit's numeric cells (111 by raw depth label; overview/standard/deep are aliases of brief/balanced/detailed and are merged) x 3 runs per arm (run 1 = audit set, runs 2-3 = repeats; the 8 pairs that held the 15 flagged cards also got runs 2-3) = 249 runs per arm; plus 6 new box-plot prompts x 3 depths x 3 repeats = 54 per arm. Total 303 per arm, 606 runs. The 6 box-plot prompts are mine (listed in plan.mjs); every audit prompt is a bench prompt (scripts/explain-bench/sets/*.json, or the prose-depth and arm-d bench sets for "what is cross entropy loss?" and "what is maximum likelihood estimation?"); none came from the production archive, so none was skipped.
- Spend: US$2.07 (606 runs, upper bound) + US$0.06 for 18 runs of a first launch that I discarded because it did not record dropped diagrams = about US$2.13. Under the original US$4.00 cap; the raised cap was not needed.

## Findings

1. No run failed in either arm: 303/303 delivered both ways, 0 `explanation_bad_numbers`, 0 `arithmetic` step outcomes, 0 runs reaching a second same-model repair. The honest-failure path and the second repair (ARITHMETIC_REPAIRS_SAME_MODEL=2) were never exercised, so their success rate is unmeasured (0 of 0). This sample cannot say whether they work.
2. The AFTER change that did fire: in 10 AFTER runs (all box-plot prompts) the first Gemini answer carried wrong numbers (`explanation_bad_numbers`) and the first repair fixed all 10 (first-repair success 10/10, all on Gemini; no fallback was triggered by numbers). BEFORE logs 0 such events: main does not treat those as a repair trigger, so those cards ship, and BEFORE delivered 7 box cards with `box-fence-arithmetic` flags (stated fences that are not Q1 - 1.5 IQR / Q3 + 1.5 IQR) against 0 in AFTER. That is the clearest effect. Also `arithmetic-statement` 4 -> 0 flags (box prompts, prose) and heatmap row-sum 2 -> 0 (the same transformer-decoder prompt, gpt-oss, twice in BEFORE, 0 in AFTER; n=2, could be noise).
3. Delivered-with-error overall: BEFORE 24/303 (7.9%), AFTER 16/303 (5.3%). Box-plot set: 21/54 (38.9%) -> 15/54 (27.8%). Everything that is not a box-plot prompt: 3/249 (1.2%) -> 1/249 (0.4%). Counts are small: a 6-card difference out of 54 is about one binomial standard deviation, so on its own it is NOT a significant box-plot improvement. The box-fence-arithmetic result (7 vs 0 cards) is the part that is clearly more than noise.
4. Not fixed: AFTER box-plot cards still carry errors in 15 of 54 runs, in kinds of flag the branch does not tag as arithmetic: `label-value-vs-prose` (prose number differs from the diagram's, 14 cards) and `box-whisker-beyond-correct-fence` (5 cards, a whisker beyond the fence). Box prompt 4 (two classes) is 7/9 in both arms; I suspect `label-value-vs-prose` reads one group's median against the other group's prose (class A median 75, class B 74), a partial check false positive on two-group box plots. I did not verify each flag by hand.
5. The 15 flagged cards: they sit in 8 prompt x depth pairs, re-run 3 times per arm. 1 pair errs again in BEFORE (softmax brief, 1/3), 1 pair in AFTER (softmax balanced, 1/3, the same `softmax(2, 1, 0.1)` recompute: card states 0.7, 0.26, 0.04 for 0.659, 0.242, 0.099). Audit-era errors mostly do not reproduce in either arm (the audit's flag rate on non-box numeric cells was about 0.7%; here 1.2% and 0.4%). A clean AFTER on a pair can come from a rare error not reproducing, not from the fix. The softmax error is not touched by this branch, as expected.
6. gpt-oss is rarely reached (14 BEFORE, 11 AFTER of 303 deliveries; every fallback was triggered by an invalid or missing visual, never by numbers). Per-model rates: gemini-flash-lite 21/289 (7.3%) -> 14/292 (4.8%); gpt-oss-120b 3/14 -> 2/11 (too few to read).
7. Latency: median 2,875 ms BEFORE vs 2,846 ms AFTER; paired per item AFTER minus BEFORE median -77 ms, mean -155 ms (n=303): no measurable cost. Runs with a repair take about 4.8 s in both arms. Box-plot median 4.5 s BEFORE vs 2.9 s AFTER is provider noise plus fewer fallbacks, not an effect I would claim. Settled cost: BEFORE US$1.00, AFTER US$0.95.
8. Repairs: cards delivered after a first repair, any cause: BEFORE 44, AFTER 33 of 303. Runs that went to the next provider: 14 vs 11, all for `explanation_missing_visual` / invalid diagrams. `diagramsDropped`: 0 in both arms. Cards with a simplified diagram or visual fallback: 6 vs 12 (single-digit counts; I did not trace why AFTER is higher).

## Noise and what this cannot show

- Temperature and Gemini non-determinism: n=3 per audit cell per arm and n=9 per box prompt per arm. A clean AFTER can be a rare error not reproducing.
- The arms ran interleaved within seconds of each other. Planner answered on 606/606 runs and no run hard-failed, so no outage disturbed either arm.
- The checks are heuristics (regex plus recompute); `label-value-vs-prose` is the noisiest. A card can be wrong in a way no check examines.
- No pictures were generated, so any interaction of pictures with the repair path is untested.
- The AFTER numbers-failure path is reachable only when a repaired answer is still wrong; at 10 first-answer events per 303 runs, all fixed once, it needs a larger or adversarial sample.

Files: `run.mjs` (runner, as run), `plan.mjs`, `plan.json`, `plan-parts.json` (cells), `report.mjs` (builds the tables below), `results.jsonl` and `results.json` (every run: attempts, repairs, ledger rows, flags, card body; no keys), `run-pass1.log`, `run.log`, `cost.txt`, `results-aborted-v0.jsonl` (discarded first launch, kept for its cost).

# Section 6: effect of feat/card-numbers on numeric errors

BEFORE = main d3857f783, AFTER = feat/card-numbers 5c9da7620; profile google-low (Gemini 3.5 flash-lite, then Fireworks gpt-oss-120b), EXPLANATION_PLANNER=jev, formula sampler off, no pictures; same prompt and depth, run in pairs (order alternated), in process through generateArtifact. 606 runs (303 before, 303 after).

## 1. Headline

### All runs

| arm | runs | delivered | failed | failed on bad numbers | delivered with an error | cards with error per 100 delivered | flags per 100 delivered | cost US$ (settled) | median ms/run |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BEFORE main | 303 | 303 | 0 | 0 | 24 | 7.9 | 14.9 | 1.0018 | 2875 |
| AFTER card-numbers | 303 | 303 | 0 | 0 | 16 | 5.3 | 11.2 | 0.9497 | 2846 |

### Audit cells (distinct prompt x depth pairs of the card-errors numeric cells, 1 run per arm)

| arm | runs | delivered | failed | failed on bad numbers | delivered with an error | cards with error per 100 delivered | flags per 100 delivered | cost US$ (settled) | median ms/run |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BEFORE main | 83 | 83 | 0 | 0 | 1 | 1.2 | 1.2 | 0.2459 | 2830 |
| AFTER card-numbers | 83 | 83 | 0 | 0 | 1 | 1.2 | 1.2 | 0.2568 | 2830 |

### Box-plot prompts (6 new prompts x 3 depths x 3 repeats)

| arm | runs | delivered | failed | failed on bad numbers | delivered with an error | cards with error per 100 delivered | flags per 100 delivered | cost US$ (settled) | median ms/run |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BEFORE main | 54 | 54 | 0 | 0 | 21 | 38.9 | 77.8 | 0.2478 | 4514 |
| AFTER card-numbers | 54 | 54 | 0 | 0 | 15 | 27.8 | 61.1 | 0.1960 | 2861 |

### Audit-cell repeats (runs 2 and 3 of every other audit pair, added after the cap was raised)

| arm | runs | delivered | failed | failed on bad numbers | delivered with an error | cards with error per 100 delivered | flags per 100 delivered | cost US$ (settled) | median ms/run |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BEFORE main | 150 | 150 | 0 | 0 | 1 | 0.7 | 0.7 | 0.4467 | 2851 |
| AFTER card-numbers | 150 | 150 | 0 | 0 | 0 | 0.0 | 0.0 | 0.4437 | 2769 |

### Every non-box-plot run (audit + all repeats)

| arm | runs | delivered | failed | failed on bad numbers | delivered with an error | cards with error per 100 delivered | flags per 100 delivered | cost US$ (settled) | median ms/run |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BEFORE main | 249 | 249 | 0 | 0 | 3 | 1.2 | 1.2 | 0.7540 | 2838 |
| AFTER card-numbers | 249 | 249 | 0 | 0 | 1 | 0.4 | 0.4 | 0.7537 | 2824 |

### Flagged-pair repeats (the 8 prompt x depth pairs that held the 15 flagged cards, runs 2 and 3)

| arm | runs | delivered | failed | failed on bad numbers | delivered with an error | cards with error per 100 delivered | flags per 100 delivered | cost US$ (settled) | median ms/run |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BEFORE main | 16 | 16 | 0 | 0 | 1 | 6.3 | 6.3 | 0.0614 | 2827 |
| AFTER card-numbers | 16 | 16 | 0 | 0 | 0 | 0.0 | 0.0 | 0.0532 | 2917 |

## 2. Per authoring model (the model that wrote the delivered card; a failed run has none)

| model | arm | delivered | with an error | errors per 100 delivered | flags per 100 delivered | median ms |
| --- | --- | --- | --- | --- | --- | --- |
| gemini-flash-lite | before | 289 | 21 | 7.3 | 14.5 | 2855 |
| gemini-flash-lite | after | 292 | 14 | 4.8 | 9.6 | 2789 |
| gpt-oss-120b | before | 14 | 3 | 21.4 | 21.4 | 7453 |
| gpt-oss-120b | after | 11 | 2 | 18.2 | 54.5 | 7519 |
| failed runs | before | 0 | - | - | - | - |
| failed runs | after | 0 | - | - | - | - |

## 3. Per diagram kind (delivered cards holding a numeric diagram of that kind; a card counts once per kind)

| kind | BEFORE cards | BEFORE flagged on this kind | BEFORE per 100 | AFTER cards | AFTER flagged on this kind | AFTER per 100 |
| --- | --- | --- | --- | --- | --- | --- |
| bar-chart | 16 | 0 | 0.0 | 15 | 0 | 0.0 |
| box-plot | 57 | 21 | 36.8 | 57 | 15 | 26.3 |
| coordinate-plot | 81 | 0 | 0.0 | 83 | 0 | 0.0 |
| heatmap | 10 | 2 | 20.0 | 6 | 0 | 0.0 |
| histogram | 3 | 0 | 0.0 | 3 | 0 | 0.0 |
| matrix | 21 | 0 | 0.0 | 21 | 0 | 0.0 |
| number-line | 3 | 0 | 0.0 | 3 | 0 | 0.0 |
| sample-set | 3 | 0 | 0.0 | 3 | 0 | 0.0 |
| t-account | 3 | 0 | 0.0 | 3 | 0 | 0.0 |
| timeline | 8 | 0 | 0.0 | 9 | 0 | 0.0 |
| token-links | 27 | 0 | 0.0 | 27 | 0 | 0.0 |
| transformation | 13 | 1 | 7.7 | 11 | 1 | 9.1 |
| waterfall | 3 | 0 | 0.0 | 3 | 0 | 0.0 |

Runs whose planner chose a box-plot are counted below under box plots.

## 4. Repairs, fallbacks, honest failures

| arm | runs | delivered after 1 repair (repairedAt 1) | delivered after 2nd same-model repair (repairedAt 2) | steps ending in arithmetic (bad numbers) | of those, after 2 repairs | runs that moved to a next provider | of those, delivered | runs ending in explanation_bad_numbers | other failures |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| before | 303 | 0 | 0 | 0 | 0 | 14 | 14 | 0 | 0 |
| after | 303 | 33 | 0 | 0 | 0 | 11 | 11 | 0 | 0 |

BEFORE records no `repairs`/`repairedAt` on a step (the field exists only in AFTER), so BEFORE's single-repair deliveries are counted from the top-level `repaired` flag below. BEFORE has no `arithmetic` outcome: its bad-number steps are plain `validation_error`.

| arm | delivered | delivered after a repair (top-level repaired flag, both arms) |
| --- | --- | --- |
| before | 303 | 44 |
| after | 303 | 33 |

Second same-model repair (AFTER only): 0 steps reached it, 0 delivered a card, 0 still failed on numbers; success rate -%.

Steps that ended in a numbers/validation failure: BEFORE 14 (validation_error, any cause), AFTER 0 (arithmetic).

Cards delivered with a diagram dropped or replaced by a simplified one (the old way out of a bad number; AFTER never drops an arithmetic-tagged diagram):

| arm | delivered | with diagramsDropped | with diagramsSimplified / visualFallback |
| --- | --- | --- | --- |
| before | 303 | 0 | 6 |
| after | 303 | 0 | 12 |

Runs whose first author answer carried wrong numbers (explanation_bad_numbers at attempt 0). Counted from the validator log line, so it works for both arms:

| arm | runs with a bad-numbers first answer | of those, box-plot prompts | first answer fixed by the first repair (no second bad answer) | of those delivered | still wrong after the first repair (second repair asked, AFTER only) | second repair delivered (repairedAt 2) | those ending in explanation_bad_numbers | runs that touched the next provider | delivered by the first Gemini repair | reached a second repair or beyond |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| before | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| after | 10 | 10 | 10 | 10 | 0 | 0 | 0 | 0 | 10 | 0 |

Flags in delivered cards by check (a card can carry several; counts are flags, not cards):

| check | BEFORE flags | AFTER flags |
| --- | --- | --- |
| arithmetic-statement | 4 | 0 |
| box-fence-arithmetic | 7 | 0 |
| box-whisker-beyond-correct-fence | 11 | 10 |
| heatmap-weights-should-sum-to-1 | 2 | 0 |
| label-value-vs-prose | 20 | 23 |
| softmax-recompute | 1 | 1 |

## 5. Box plots (separately)

| arm | runs | delivered | failed | failed on bad numbers | delivered cards holding a box-plot | of those with an error | per 100 | delivered by gpt-oss | delivered after 2nd repair |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| before | 54 | 54 | 0 | 0 | 54 | 21 | 38.9 | 3 | 0 |
| after | 54 | 54 | 0 | 0 | 54 | 15 | 27.8 | 2 | 0 |

| box prompt | arm | runs | delivered | delivered with a box-plot | with error | failed on numbers |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | before | 9 | 9 | 9 | 3 | 0 |
| 1 | after | 9 | 9 | 9 | 3 | 0 |
| 2 | before | 9 | 9 | 9 | 2 | 0 |
| 2 | after | 9 | 9 | 9 | 3 | 0 |
| 3 | before | 9 | 9 | 9 | 1 | 0 |
| 3 | after | 9 | 9 | 9 | 0 | 0 |
| 4 | before | 9 | 9 | 9 | 7 | 0 |
| 4 | after | 9 | 9 | 9 | 7 | 0 |
| 5 | before | 9 | 9 | 9 | 3 | 0 |
| 5 | after | 9 | 9 | 9 | 1 | 0 |
| 6 | before | 9 | 9 | 9 | 5 | 0 |
| 6 | after | 9 | 9 | 9 | 1 | 0 |

## 6. The 15 flagged cards today vs AFTER

| prompt | depth | flagged cards in the audit | BEFORE today (same code as audit era, re-run) | AFTER |
| --- | --- | --- | --- | --- |
| "what is gini impurity" | detailed | 1 | 0/3 delivered with an error, 0 failed | 0/3 delivered with an error, 0 failed |
| "what does softmax do?" | detailed | 1 | 0/3 delivered with an error, 0 failed | 0/3 delivered with an error, 0 failed |
| "what does softmax do?" | brief | 2 | 1/3 delivered with an error, 0 failed | 0/3 delivered with an error, 0 failed |
| "what does softmax do?" | balanced | 5 | 0/3 delivered with an error, 0 failed | 1/3 delivered with an error, 0 failed |
| "how does compound interest grow money over time?" | balanced | 1 | 0/3 delivered with an error, 0 failed | 0/3 delivered with an error, 0 failed |
| "How do attention scores turn into weights?" | balanced | 3 | 0/3 delivered with an error, 0 failed | 0/3 delivered with an error, 0 failed |
| "what does a bootstrap sample of the training rows look like, and whic | balanced | 1 | 0/3 delivered with an error, 0 failed | 0/3 delivered with an error, 0 failed |
| "Explain quartiles, IQR fences, whiskers and outliers on one scale." | balanced | 2 | 0/3 delivered with an error, 0 failed | 0/3 delivered with an error, 0 failed |

Of the 8 prompt x depth pairs that held the 15 flagged cards: 1 produced at least one error again in BEFORE (n up to 3 runs each), 1 in AFTER.

## 7. Cost and latency

| arm | runs | settled cost US$ | upper bound US$ (incl. planner estimate) | median ms (all runs) | median ms (delivered) | mean ms |
| --- | --- | --- | --- | --- | --- | --- |
| before | 303 | 1.0018 | 1.0624 | 2875 | 2875 | 3332 |
| after | 303 | 0.9497 | 1.0103 | 2846 | 2846 | 3177 |

Total, both arms, upper bound: US$2.0727 (plus US$0.0572 for the 18 discarded v0 runs, see cost.txt).

Paired latency (AFTER minus BEFORE, per prompt x depth item, n=303): median -77 ms, mean -155 ms.

Paired items: both delivered 303; BEFORE delivered, AFTER failed 0; AFTER delivered, BEFORE failed 0; both failed 0.

Paired items with an error in the delivered card: BEFORE 24, AFTER 16, both 8.

## 8. Every flagged delivered card, both arms

| item | arm | set | depth | prompt | author | checks | first detail |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 24 | after | audit | balanced | "what does softmax do?" | gemini-flash-lite | softmax-recompute[transformation] | softmax(2, 1, 0.1) = 0.659, 0.242, 0.099, card states 0.7, 0.26, 0.04 |
| 56 | before | audit | detailed | "How does the transformer decoder avoid looking ah | gpt-oss-120b | heatmap-weights-should-sum-to-1[heatmap] | row sums 0, 0, 0, 0, 0, 0 |
| 83 | before | box | brief | "How do IQR fences flag outliers in a box plot? Us | gemini-flash-lite | box-fence-arithmetic[box-plot] | fences -5 / 23 stated; Q1 6, Q3 12, IQR 6, 1.5 x IQR gives -3 / 21 |
| 85 | before | box | brief | "How do IQR fences flag outliers in a box plot? Us | gemini-flash-lite | box-fence-arithmetic[box-plot] | fences -0.75 / 22.25 stated; Q1 6, Q3 10.5, IQR 4.5, 1.5 x IQR gives -0.75 / 17.25 |
| 87 | after | box | balanced | "How do IQR fences flag outliers in a box plot? Us | gemini-flash-lite | label-value-vs-prose[box-plot] | upper fence: diagram 20.5, prose "upper fence is $11.5" |
| 87 | before | box | balanced | "How do IQR fences flag outliers in a box plot? Us | gemini-flash-lite | arithmetic-statement[text]; arithmetic-statement[text]; label-value-vs-prose[box-plot]; box-fence-arithmetic[box-plot] | 6 - 5.25 = -0.25 (computed 0.75, stated -0.25) |
| 90 | after | box | detailed | "How do IQR fences flag outliers in a box plot? Us | gemini-flash-lite | label-value-vs-prose[box-plot] | upper fence: diagram 16.75, prose "upper fence is $10" |
| 91 | after | box | detailed | "How do IQR fences flag outliers in a box plot? Us | gemini-flash-lite | label-value-vs-prose[box-plot]; label-value-vs-prose[box-plot] | lower fence: diagram 1, prose "lower fence is $5" |
| 95 | after | box | balanced | "Show a box plot of exam scores 52, 55, 61, 64, 67 | gemini-flash-lite | label-value-vs-prose[box-plot] | upper fence: diagram 99.75, prose "upper fence is $76.5" |
| 96 | before | box | balanced | "Show a box plot of exam scores 52, 55, 61, 64, 67 | gemini-flash-lite | label-value-vs-prose[box-plot]; box-fence-arithmetic[box-plot] | upper fence: diagram 96.75, prose "upper fence at 97.5" |
| 98 | after | box | detailed | "Show a box plot of exam scores 52, 55, 61, 64, 67 | gpt-oss-120b | label-value-vs-prose[box-plot]; label-value-vs-prose[box-plot]; label-value-vs-prose[box-plot] | Q1: diagram 61, prose "Q1 = 14" |
| 99 | after | box | detailed | "Show a box plot of exam scores 52, 55, 61, 64, 67 | gpt-oss-120b | label-value-vs-prose[box-plot]; label-value-vs-prose[box-plot]; label-value-vs-prose[box-plot] | Q1: diagram 61, prose "Q1 = 14" |
| 99 | before | box | detailed | "Show a box plot of exam scores 52, 55, 61, 64, 67 | gemini-flash-lite | label-value-vs-prose[box-plot] | upper fence: diagram 96, prose "upper fence is $75" |
| 106 | before | box | balanced | "How do I read a box plot of delivery times 12, 15 | gemini-flash-lite | box-fence-arithmetic[box-plot] | fences -6.75 / 37.25 stated; Q1 16, Q3 24.5, IQR 8.5, 1.5 x IQR gives 3.25 / 37.25 |
| 110 | after | box | brief | "Compare the spread of two classes with box plots: | gemini-flash-lite | label-value-vs-prose[box-plot]; box-whisker-beyond-correct-fence[box-plot]; box-whisker-beyond-correct-fence[box-plot] | median: diagram 74, prose "median of 75" |
| 111 | before | box | brief | "Compare the spread of two classes with box plots: | gemini-flash-lite | box-whisker-beyond-correct-fence[box-plot]; box-whisker-beyond-correct-fence[box-plot] | whiskerLow 40 beyond the correct fence 58 / 90 |
| 112 | after | box | brief | "Compare the spread of two classes with box plots: | gemini-flash-lite | box-whisker-beyond-correct-fence[box-plot]; box-whisker-beyond-correct-fence[box-plot] | whiskerLow 40 beyond the correct fence 62 / 86 |
| 113 | after | box | balanced | "Compare the spread of two classes with box plots: | gemini-flash-lite | label-value-vs-prose[box-plot]; label-value-vs-prose[box-plot]; box-whisker-beyond-correct-fence[box-plot]; box-whisker- | median: diagram 75, prose "median of 74" |
| 113 | before | box | balanced | "Compare the spread of two classes with box plots: | gemini-flash-lite | label-value-vs-prose[box-plot]; label-value-vs-prose[box-plot]; box-whisker-beyond-correct-fence[box-plot]; box-whisker- | median: diagram 75, prose "median of 74" |
| 114 | before | box | balanced | "Compare the spread of two classes with box plots: | gemini-flash-lite | label-value-vs-prose[box-plot]; box-whisker-beyond-correct-fence[box-plot]; box-whisker-beyond-correct-fence[box-plot] | median: diagram 74, prose "median of 75" |
| 114 | after | box | balanced | "Compare the spread of two classes with box plots: | gemini-flash-lite | label-value-vs-prose[box-plot]; label-value-vs-prose[box-plot]; box-whisker-beyond-correct-fence[box-plot]; box-whisker- | median: diagram 75, prose "median of 74" |
| 115 | after | box | balanced | "Compare the spread of two classes with box plots: | gemini-flash-lite | label-value-vs-prose[box-plot]; box-whisker-beyond-correct-fence[box-plot]; box-whisker-beyond-correct-fence[box-plot] | median: diagram 75, prose "median of 74," |
| 115 | before | box | balanced | "Compare the spread of two classes with box plots: | gemini-flash-lite | label-value-vs-prose[box-plot]; box-whisker-beyond-correct-fence[box-plot]; box-whisker-beyond-correct-fence[box-plot] | median: diagram 74, prose "median of 75" |
| 116 | before | box | detailed | "Compare the spread of two classes with box plots: | gemini-flash-lite | label-value-vs-prose[box-plot]; label-value-vs-prose[box-plot]; label-value-vs-prose[box-plot]; box-whisker-beyond-corre | median: diagram 75, prose "median of 74," |
| 117 | after | box | detailed | "Compare the spread of two classes with box plots: | gemini-flash-lite | label-value-vs-prose[box-plot]; label-value-vs-prose[box-plot] | median: diagram 75, prose "median is 74" |
| 117 | before | box | detailed | "Compare the spread of two classes with box plots: | gemini-flash-lite | label-value-vs-prose[box-plot]; label-value-vs-prose[box-plot] | median: diagram 75, prose "median is 74," |
| 118 | before | box | detailed | "Compare the spread of two classes with box plots: | gemini-flash-lite | label-value-vs-prose[box-plot]; label-value-vs-prose[box-plot] | median: diagram 75, prose "median of 74" |
| 118 | after | box | detailed | "Compare the spread of two classes with box plots: | gemini-flash-lite | label-value-vs-prose[box-plot]; label-value-vs-prose[box-plot] | median: diagram 75, prose "median of 74" |
| 119 | before | box | brief | "Explain quartiles, the median and whiskers on a b | gemini-flash-lite | box-whisker-beyond-correct-fence[box-plot] | whiskerHigh 150 beyond the correct fence 8.75 / 74.75 |
| 121 | before | box | brief | "Explain quartiles, the median and whiskers on a b | gemini-flash-lite | box-whisker-beyond-correct-fence[box-plot] | whiskerHigh 150 beyond the correct fence 8.75 / 74.75 |
| 125 | after | box | detailed | "Explain quartiles, the median and whiskers on a b | gemini-flash-lite | label-value-vs-prose[box-plot] | upper fence: diagram 74.75, prose "upper fence is $50" |
| 126 | before | box | detailed | "Explain quartiles, the median and whiskers on a b | gpt-oss-120b | label-value-vs-prose[box-plot] | IQR: diagram 13, prose "IQR=66" |
| 129 | before | box | brief | "What does the 1.5 x IQR rule do to a box plot of  | gemini-flash-lite | box-fence-arithmetic[box-plot] | fences 66.5 / 123.5 stated; Q1 87.5, Q3 101.5, IQR 14, 1.5 x IQR gives 66.5 / 122.5 |
| 133 | before | box | balanced | "What does the 1.5 x IQR rule do to a box plot of  | gemini-flash-lite | arithmetic-statement[text]; label-value-vs-prose[box-plot]; label-value-vs-prose[box-plot]; box-fence-arithmetic[box-plo | 104 + 24.75 = 130.25 (computed 128.75, stated 130.25) |
| 134 | before | box | detailed | "What does the 1.5 x IQR rule do to a box plot of  | gemini-flash-lite | arithmetic-statement[text]; label-value-vs-prose[box-plot] | 105 + 26.25 = 130.375 (computed 131.25, stated 130.375) |
| 134 | after | box | detailed | "What does the 1.5 x IQR rule do to a box plot of  | gemini-flash-lite | label-value-vs-prose[box-plot] | upper fence: diagram 125, prose "upper fence is $104" |
| 135 | before | box | detailed | "What does the 1.5 x IQR rule do to a box plot of  | gemini-flash-lite | label-value-vs-prose[box-plot] | upper fence: diagram 135, prose "upper fence $106.5" |
| 136 | before | box | detailed | "What does the 1.5 x IQR rule do to a box plot of  | gemini-flash-lite | label-value-vs-prose[box-plot] | upper fence: diagram 125, prose "upper fence at $104" |
| 142 | before | flag-repeat | brief | "what does softmax do?" | gemini-flash-lite | softmax-recompute[transformation] | softmax(2, 1, 0.1) = 0.659, 0.242, 0.099, card states 0.7, 0.26, 0.04 |
| 278 | before | audit-repeat | detailed | "How does the transformer decoder avoid looking ah | gpt-oss-120b | heatmap-weights-should-sum-to-1[heatmap] | row sums 0, 0, 0, 0, 0, 0 |
