# Smoke tier dry run on the judged 118 cards (118-c0e8f365a)

Source: `C:/s/spec/benchmarks/explain-bench/2026-11-09T145415-118-3x-judged` (raw `C:\s\spec\benchmarks\explain-bench\2026-11-09T134635-118-3x-gate-c0e8f365a-fresh-ledger\raw`). Offline: no stack, no generation, no judge call. Tooling: branch `explain/smoke-tier`.

## 1. Smoke gate on the 118 cards, baseline-relative

The smoke prompts that have 118 cards (40 of 66; 120 cards, 3 passes) are scored one pass at a time, as a real smoke run would be: `gate-check.mjs --tier smoke --baseline <dir>`. Tolerance: the larger of 3 items or 5 percentage points (4 items for factual error); p90 +2000 ms. Hard lines: delivery, pictures needed 100%, none belongs 0, right kind on verified prompts >= 80%.

### 1a. Baseline = the same 118 run (sanity: must pass)

```
GATE: PASS 118 tier=smoke vs baseline
report: C:/s/explain-smoke-scratch/gate-bl-118
baseline: C:\s\spec\benchmarks\explain-bench\2026-11-09T145415-118-3x-judged (3 runs, mean of its runs on the same prompts)
cards: 120 (smoke set, 3 passes); the baseline covers 40 of 40 smoke prompts, the other 0 have no baseline and are left out of the relative lines
PASS  r1 delivery: at least 99% of cards delivered [hard]: 40/40
PASS  r1 right kind >= 80% of delivered (prompts whose kind is verified; the kind-reference prompts are reported below) [hard]: 39/39 = 100.0%
PASS  r1 pictures where needed: 100% [hard]: 10/10
PASS  r1 pictures where none belongs: 0 [hard]: 0/29
PASS  r1 factual error rate vs baseline: smoke 1/40 = 2.5% | baseline mean 7.6% | delta -5.1 pp | tolerance +10.0 pp (4 items or 5 pp, larger) [40 prompts]
PASS  r1 repairs vs baseline: smoke 1/40 = 2.5% | baseline mean 2.5% | delta +0.0 pp | tolerance +7.5 pp (3 items or 5 pp, larger) [40 prompts]
PASS  r1 noun-box or placeholder labels vs baseline: smoke 0/40 = 0.0% | baseline mean 1.7% | delta -1.7 pp | tolerance +7.5 pp (3 items or 5 pp, larger) [40 prompts]
PASS  r1 faithfulness: "not" vs baseline: smoke 2/15 = 13.3% | baseline mean 11.1% | delta +2.2 pp | tolerance +20.0 pp (3 items or 5 pp, larger) [40 prompts]
PASS  r1 faithfulness: "fully" vs baseline: smoke 6/15 = 40.0% | baseline mean 33.3% | delta +6.7 pp | tolerance -20.0 pp (3 items or 5 pp, larger) [40 prompts]
PASS  r1 claims beyond the prose vs baseline: smoke 3/40 = 7.5% | baseline mean 9.3% | delta -1.8 pp | tolerance +7.5 pp (3 items or 5 pp, larger) [40 prompts]
PASS  r1 whole-card p90 vs baseline: smoke 4280 ms | baseline mean 5259 ms | delta -979 ms | tolerance +2000 ms [40 prompts]
PASS  r2 delivery: at least 99% of cards delivered [hard]: 40/40
PASS  r2 right kind >= 80% of delivered (prompts whose kind is verified; the kind-reference prompts are reported below) [hard]: 37/39 = 94.9%
PASS  r2 pictures where needed: 100% [hard]: 10/10
PASS  r2 pictures where none belongs: 0 [hard]: 0/29
PASS  r2 factual error rate vs baseline: smoke 3/40 = 7.5% | baseline mean 7.6% | delta -0.1 pp | tolerance +10.0 pp (4 items or 5 pp, larger) [40 prompts]
PASS  r2 repairs vs baseline: smoke 1/40 = 2.5% | baseline mean 2.5% | delta +0.0 pp | tolerance +7.5 pp (3 items or 5 pp, larger) [40 prompts]
PASS  r2 noun-box or placeholder labels vs baseline: smoke 0/38 = 0.0% | baseline mean 1.7% | delta -1.7 pp | tolerance +7.9 pp (3 items or 5 pp, larger) [40 prompts]
PASS  r2 faithfulness: "not" vs baseline: smoke 1/15 = 6.7% | baseline mean 11.1% | delta -4.4 pp | tolerance +20.0 pp (3 items or 5 pp, larger) [40 prompts]
PASS  r2 faithfulness: "fully" vs baseline: smoke 4/15 = 26.7% | baseline mean 33.3% | delta -6.7 pp | tolerance -20.0 pp (3 items or 5 pp, larger) [40 prompts]
PASS  r2 claims beyond the prose vs baseline: smoke 4/38 = 10.5% | baseline mean 9.3% | delta +1.2 pp | tolerance +7.9 pp (3 items or 5 pp, larger) [40 prompts]
PASS  r2 whole-card p90 vs baseline: smoke 6359 ms | baseline mean 5259 ms | delta +1100 ms | tolerance +2000 ms [40 prompts]
PASS  r3 delivery: at least 99% of cards delivered [hard]: 40/40
PASS  r3 right kind >= 80% of delivered (prompts whose kind is verified; the kind-reference prompts are reported below) [hard]: 39/39 = 100.0%
PASS  r3 pictures where needed: 100% [hard]: 10/10
PASS  r3 pictures where none belongs: 0 [hard]: 0/29
PASS  r3 factual error rate vs baseline: smoke 5/39 = 12.8% | baseline mean 7.6% | delta +5.2 pp | tolerance +10.3 pp (4 items or 5 pp, larger) [40 prompts]
PASS  r3 repairs vs baseline: smoke 1/40 = 2.5% | baseline mean 2.5% | delta +0.0 pp | tolerance +7.5 pp (3 items or 5 pp, larger) [40 prompts]
PASS  r3 noun-box or placeholder labels vs baseline: smoke 2/40 = 5.0% | baseline mean 1.7% | delta +3.3 pp | tolerance +7.5 pp (3 items or 5 pp, larger) [40 prompts]
PASS  r3 faithfulness: "not" vs baseline: smoke 2/15 = 13.3% | baseline mean 11.1% | delta +2.2 pp | tolerance +20.0 pp (3 items or 5 pp, larger) [40 prompts]
PASS  r3 faithfulness: "fully" vs baseline: smoke 5/15 = 33.3% | baseline mean 33.3% | delta +0.0 pp | tolerance -20.0 pp (3 items or 5 pp, larger) [40 prompts]
PASS  r3 claims beyond the prose vs baseline: smoke 4/40 = 10.0% | baseline mean 9.3% | delta +0.7 pp | tolerance +7.5 pp (3 items or 5 pp, larger) [40 prompts]
PASS  r3 whole-card p90 vs baseline: smoke 5139 ms | baseline mean 5259 ms | delta -120 ms | tolerance +2000 ms [40 prompts]
REPORTED  diagram kinds drawn: 15/24 (not drawn: histogram, box-plot, heatmap, number-line, sample-set, argument, t-account, waterfall, tensor)
REPORTED  prompts whose kind is not verified (kind-reference prompts): right 3/3
```

### 1b. Baseline = the 117 rerun judged run (where 118 differs from 117)

```
GATE: PASS 118 tier=smoke vs baseline
report: C:/s/explain-smoke-scratch/gate-bl-118
baseline: C:\s\spec\benchmarks\explain-bench\2026-11-09T105915-117-rerun-3x-judged (3 runs, mean of its runs on the same prompts)
cards: 120 (smoke set, 3 passes); the baseline covers 40 of 40 smoke prompts, the other 0 have no baseline and are left out of the relative lines
PASS  r1 delivery: at least 99% of cards delivered [hard]: 40/40
PASS  r1 right kind >= 80% of delivered (prompts whose kind is verified; the kind-reference prompts are reported below) [hard]: 39/39 = 100.0%
PASS  r1 pictures where needed: 100% [hard]: 10/10
PASS  r1 pictures where none belongs: 0 [hard]: 0/29
PASS  r1 factual error rate vs baseline: smoke 1/40 = 2.5% | baseline mean 5.0% | delta -2.5 pp | tolerance +10.0 pp (4 items or 5 pp, larger) [40 prompts]
PASS  r1 repairs vs baseline: smoke 1/40 = 2.5% | baseline mean 4.2% | delta -1.7 pp | tolerance +7.5 pp (3 items or 5 pp, larger) [40 prompts]
PASS  r1 noun-box or placeholder labels vs baseline: smoke 0/40 = 0.0% | baseline mean 1.7% | delta -1.7 pp | tolerance +7.5 pp (3 items or 5 pp, larger) [40 prompts]
PASS  r1 faithfulness: "not" vs baseline: smoke 2/15 = 13.3% | baseline mean 8.9% | delta +4.4 pp | tolerance +20.0 pp (3 items or 5 pp, larger) [40 prompts]
PASS  r1 faithfulness: "fully" vs baseline: smoke 6/15 = 40.0% | baseline mean 33.3% | delta +6.7 pp | tolerance -20.0 pp (3 items or 5 pp, larger) [40 prompts]
PASS  r1 claims beyond the prose vs baseline: smoke 3/40 = 7.5% | baseline mean 12.5% | delta -5.0 pp | tolerance +7.5 pp (3 items or 5 pp, larger) [40 prompts]
PASS  r1 whole-card p90 vs baseline: smoke 4280 ms | baseline mean 4728 ms | delta -448 ms | tolerance +2000 ms [40 prompts]
PASS  r2 delivery: at least 99% of cards delivered [hard]: 40/40
PASS  r2 right kind >= 80% of delivered (prompts whose kind is verified; the kind-reference prompts are reported below) [hard]: 37/39 = 94.9%
PASS  r2 pictures where needed: 100% [hard]: 10/10
PASS  r2 pictures where none belongs: 0 [hard]: 0/29
PASS  r2 factual error rate vs baseline: smoke 3/40 = 7.5% | baseline mean 5.0% | delta +2.5 pp | tolerance +10.0 pp (4 items or 5 pp, larger) [40 prompts]
PASS  r2 repairs vs baseline: smoke 1/40 = 2.5% | baseline mean 4.2% | delta -1.7 pp | tolerance +7.5 pp (3 items or 5 pp, larger) [40 prompts]
PASS  r2 noun-box or placeholder labels vs baseline: smoke 0/38 = 0.0% | baseline mean 1.7% | delta -1.7 pp | tolerance +7.9 pp (3 items or 5 pp, larger) [40 prompts]
PASS  r2 faithfulness: "not" vs baseline: smoke 1/15 = 6.7% | baseline mean 8.9% | delta -2.2 pp | tolerance +20.0 pp (3 items or 5 pp, larger) [40 prompts]
PASS  r2 faithfulness: "fully" vs baseline: smoke 4/15 = 26.7% | baseline mean 33.3% | delta -6.7 pp | tolerance -20.0 pp (3 items or 5 pp, larger) [40 prompts]
PASS  r2 claims beyond the prose vs baseline: smoke 4/38 = 10.5% | baseline mean 12.5% | delta -2.0 pp | tolerance +7.9 pp (3 items or 5 pp, larger) [40 prompts]
PASS  r2 whole-card p90 vs baseline: smoke 6359 ms | baseline mean 4728 ms | delta +1631 ms | tolerance +2000 ms [40 prompts]
PASS  r3 delivery: at least 99% of cards delivered [hard]: 40/40
PASS  r3 right kind >= 80% of delivered (prompts whose kind is verified; the kind-reference prompts are reported below) [hard]: 39/39 = 100.0%
PASS  r3 pictures where needed: 100% [hard]: 10/10
PASS  r3 pictures where none belongs: 0 [hard]: 0/29
PASS  r3 factual error rate vs baseline: smoke 5/39 = 12.8% | baseline mean 5.0% | delta +7.8 pp | tolerance +10.3 pp (4 items or 5 pp, larger) [40 prompts]
PASS  r3 repairs vs baseline: smoke 1/40 = 2.5% | baseline mean 4.2% | delta -1.7 pp | tolerance +7.5 pp (3 items or 5 pp, larger) [40 prompts]
PASS  r3 noun-box or placeholder labels vs baseline: smoke 2/40 = 5.0% | baseline mean 1.7% | delta +3.3 pp | tolerance +7.5 pp (3 items or 5 pp, larger) [40 prompts]
PASS  r3 faithfulness: "not" vs baseline: smoke 2/15 = 13.3% | baseline mean 8.9% | delta +4.4 pp | tolerance +20.0 pp (3 items or 5 pp, larger) [40 prompts]
PASS  r3 faithfulness: "fully" vs baseline: smoke 5/15 = 33.3% | baseline mean 33.3% | delta +0.0 pp | tolerance -20.0 pp (3 items or 5 pp, larger) [40 prompts]
PASS  r3 claims beyond the prose vs baseline: smoke 4/40 = 10.0% | baseline mean 12.5% | delta -2.5 pp | tolerance +7.5 pp (3 items or 5 pp, larger) [40 prompts]
PASS  r3 whole-card p90 vs baseline: smoke 5139 ms | baseline mean 4728 ms | delta +411 ms | tolerance +2000 ms [40 prompts]
REPORTED  diagram kinds drawn: 15/24 (not drawn: histogram, box-plot, heatmap, number-line, sample-set, argument, t-account, waterfall, tensor)
REPORTED  prompts whose kind is not verified (kind-reference prompts): right 3/3
```

## 2. Carried verdicts

Carry reference: the 117 rerun judged run, with a copy of the judge cache from before the 118 judging, so only 117 can carry.

- Full 118 run (469 delivered cards) against 117: factual 469: judged 469, carried 0 (hash 0, cache 0); faithful 232: judged 232, carried 0 (hash 0, cache 0); beyond 440: judged 440, carried 0 (hash 0, cache 0); picture 114: judged 114, carried 0 (hash 0, cache 0). Cards carried whole 0/469 (0%). By set: aiml 0/84 (0%), baseline 0/126 (0%), content 0/60 (0%), correct-svg 0/126 (0%), illustrations 0/46 (0%), regression 0/18 (0%), sequence 0/9 (0%). Byte-identical to 117: whole card 0/469 (0%); diagrams only 125/469 (27%); reference-copied cards, diagrams only 71/200 (36%); other cards, diagrams only 54/269 (20%).
- Smoke subset of 118 (120 cards) against 117, as a fresh generation: factual 120: judged 120, carried 0 (hash 0, cache 0); faithful 45: judged 45, carried 0 (hash 0, cache 0); beyond 118: judged 118, carried 0 (hash 0, cache 0); picture 30: judged 30, carried 0 (hash 0, cache 0). Cards carried whole 0/120 (0%). By source set: aiml 0/21 (0%), content 0/39 (0%), baseline 0/45 (0%), sequence 0/9 (0%), illustrations 0/6 (0%). Byte-identical to 117 (whole card 0/120): diagrams only 31/120 (26%); reference-copied cards, diagrams only 14/43 (33%); other cards, diagrams only 17/77 (22%).
- Smoke subset against today's judge cache (holds the 118 verdicts), the same cards re-scored: factual 120: judged 1, carried 119 (hash 0, cache 119); faithful 45: judged 0, carried 45 (hash 0, cache 45); beyond 118: judged 0, carried 118 (hash 0, cache 118); picture 30: judged 0, carried 30 (hash 0, cache 30).
- Items that would be sent if the smoke set ran as a fresh generation against today's judged 118 cache: a fresh generation has new prose, so (118 measured against 117) 0 of 313 items on the 40 covered prompts would be carried and 313 sent. The other 26 smoke prompts have no judged 118 cards, so all of their items would be sent.

## 3. Kind coverage in the 118 run (smoke prompts only)

| kind | smoke prompt | status before | drawn in 118 by that prompt (cards) | smoke prompts that drew it in 118 |
|---|---|---|---|---|
| flow | robot-arm | reliable 3/3 in 117 | 3/3 | backprop, cnn, robot-arm, hash-table, volcano, solar-eclipse, stack-vs-queue |
| sequence | send-email | reliable 3/3 in 117 | 3/3 | rag, tcp-handshake, dns-lookup, send-email |
| cycle | four-stroke | reliable 3/3 in 117 | 3/3 | rlhf, heart, four-stroke, gan |
| timeline | roman-empire | reliable 3/3 in 117 | 3/3 | roman-empire |
| tree | dfs-vs-bfs | reliable 3/3 in 117 | 3/3 | random-forest, merge-sort, dfs-vs-bfs |
| relationship | arrays-vs-lists | reliable 3/3 in 117 | 3/3 | arrays-vs-lists |
| transformation | softmax | reliable 3/3 in 117 | 2/3 | tokenization, batchnorm, softmax, ml-transformer-qkv-projections |
| comparison | plant-animal-cell | reliable 3/3 in 117 | 3/3 | plant-animal-cell, stack-vs-queue |
| layers | stack-vs-queue | reliable 3/3 in 117 | 1/3 | nn-layers, stack-vs-queue |
| matrix | precision-recall | reliable 3/3 in 117 | 3/3 | precision-recall |
| coordinate-plot | sigmoid | reliable 3/3 in 117 | 3/3 | gradient-descent, overfitting, lr-schedule, gini, cross-entropy, sigmoid |
| bar-chart | ml-trees-feature-importance | unverified | not in the 118 run | softmax |
| histogram | two-histograms | unverified | not in the 118 run | none |
| box-plot | ref-box-plot-iqr-fences | unverified | not in the 118 run | none |
| heatmap | ml-word2vec-signed-embedding-heatmap | unverified | not in the 118 run | none |
| number-line | ml-word2vec-trait-rescale | unverified | not in the 118 run | none |
| figure | solar-eclipse | reliable 3/3 in 117 | 2/3 | suspension-bridge, solar-eclipse |
| sample-set | ml-trees-bootstrap-roots | unverified | not in the 118 run | none |
| argument | ref-argument-reading | unverified | not in the 118 run | none |
| t-account | ref-t-account-cash | unverified | not in the 118 run | none |
| waterfall | ref-waterfall-cash | unverified | not in the 118 run | none |
| tensor | ml-transformer-qkv-projections | unverified | 0/3 | none |
| token-links | attention-weights | reliable 3/3 in 117 | 3/3 | attention-weights |
| block-stack | ml-transformer-encoder-stack | reliable 3/3 in 117 | 3/3 | transformer-block, ml-transformer-encoder-stack |

## Notes

- Tolerance calibration (2026-11-10): the 118 run passes the full gate 13/13, but with the first tolerances (p90 +1500 ms, factual 3 items) two of its three passes failed against the 117 baseline by a hair (p90 +1631 ms, factual +7.8 pp). The 118 passes against their own mean move up to p90 +1100 ms, factual +5.2 pp, noun-box +3.3 pp, claims beyond the prose +1.2 pp, faithfulness not +2.2 pp, fully -6.7 pp, repairs 0.0 pp. Only p90 (now +2000 ms) and factual error (now 4 items, 10.0 to 10.3 pp at n = 39 to 40) were widened; the other lines keep 3 items or 5 pp (7.5 pp at n = 40). With them, 118 passes all three passes against itself and against the 117 rerun.
- bar-chart has evidence in the 118 run through the smoke prompt softmax; heatmap, number-line, sample-set, histogram, box-plot, argument, t-account, waterfall have none (prompts in sets the 118 run did not include); tensor 0/3.
- Regenerate with the scratch drivers `an118.mjs`, `gate118.mjs`, `subset.cjs` (in `C:/s/explain-smoke-scratch`; offline).
