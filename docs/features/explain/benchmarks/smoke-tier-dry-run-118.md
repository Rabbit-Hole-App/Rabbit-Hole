# Smoke tier dry run on the judged 118 cards (118-c0e8f365a)

Source: `C:/s/spec/benchmarks/explain-bench/2026-11-09T145238-118-3x-judged` (raw `C:\s\spec\benchmarks\explain-bench\2026-11-09T134635-118-3x-gate-c0e8f365a-fresh-ledger\raw`). Offline: no stack, no generation, no judge call. Tooling: branch `explain/smoke-tier`.

## 1. Smoke lines on the 118 cards whose prompt text is in smoke.json

40 of 66 smoke prompts have 118 cards (120 cards over 3 runs, depth none or standard). The other 26 (demo-lesson04, figure-chapters, reference-library, review-batch-01, phase02-batch prompts) were not in the 118 run.

### Pooled

```
GATE: FAIL 118-c0e8f365a tier=smoke faithfulness: "not" not worse than the clean-up (+3); faithfulness: "fully" not worse than the clean-up (-3)
report: C:/s/explain-smoke-scratch/gate-118-c0e8f365a-pooled
cards: 120 (smoke set, 3 runs)
PASS  delivery: at least 99% of cards delivered [hard]: 120/120
PASS  factual error <= 10% (overall): 9/119 = 7.6% (reported)
PASS  factual error <= 10% (baseline): 1/45 = 2.2% (reported)
PASS  right kind >= 80% of delivered (prompts whose kind is verified; the kind-reference prompts are reported below): 115/117 = 98.3% (reported)
PASS  pictures where needed: 100% [hard]: 30/30
PASS  pictures where none belongs: 0 [hard]: 0/87
PASS  repairs < 15%: 3/120 = 2.5% (reported)
PASS  whole-card p90 <= 7000 ms: p90 4927 ms (p50 3303 ms) (reported)
PASS  noun-box or placeholder labels < 5% of diagrams: 2/118 = 1.7% (reported)
FAIL  faithfulness: "not" not worse than the clean-up (+3): not 5/45 (limit 4; clean-up 5/185) (reported)
FAIL  faithfulness: "fully" not worse than the clean-up (-3): fully 15/45 (floor 18; clean-up 86/185) (reported)
PASS  claims beyond the prose not worse than the clean-up (+3): 11/118 (limit 25; clean-up 73/385) (reported)
REPORTED  diagram kinds drawn: 15/24 (not drawn: histogram, box-plot, heatmap, number-line, sample-set, argument, t-account, waterfall, tensor)
REPORTED  prompts whose kind is not verified (kind-reference prompts): right 3/3
```

### Run 1

```
GATE: PASS 118-c0e8f365a tier=smoke
report: C:/s/explain-smoke-scratch/gate-118-c0e8f365a-1
cards: 40 (smoke set, 1 run)
PASS  delivery: at least 99% of cards delivered [hard]: 40/40
PASS  factual error <= 10% (overall): 1/40 = 2.5% (reported)
PASS  factual error <= 10% (baseline): 0/15 = 0.0% (reported)
PASS  right kind >= 80% of delivered (prompts whose kind is verified; the kind-reference prompts are reported below): 39/39 = 100.0% (reported)
PASS  pictures where needed: 100% [hard]: 10/10
PASS  pictures where none belongs: 0 [hard]: 0/29
PASS  repairs < 15%: 1/40 = 2.5% (reported)
PASS  whole-card p90 <= 7000 ms: p90 4280 ms (p50 3106 ms) (reported)
PASS  noun-box or placeholder labels < 5% of diagrams: 0/40 = 0.0% (reported)
PASS  faithfulness: "not" not worse than the clean-up (+3): not 2/15 (limit 3; clean-up 5/185) (reported)
PASS  faithfulness: "fully" not worse than the clean-up (-3): fully 6/15 (floor 4; clean-up 86/185) (reported)
PASS  claims beyond the prose not worse than the clean-up (+3): 3/40 (limit 11; clean-up 73/385) (reported)
REPORTED  diagram kinds drawn: 15/24 (not drawn: histogram, box-plot, heatmap, number-line, sample-set, argument, t-account, waterfall, tensor)
REPORTED  prompts whose kind is not verified (kind-reference prompts): right 1/1
```

### Run 2

```
GATE: PASS 118-c0e8f365a tier=smoke
report: C:/s/explain-smoke-scratch/gate-118-c0e8f365a-2
cards: 40 (smoke set, 1 run)
PASS  delivery: at least 99% of cards delivered [hard]: 40/40
PASS  factual error <= 10% (overall): 3/40 = 7.5% (reported)
PASS  factual error <= 10% (baseline): 1/15 = 6.7% (reported)
PASS  right kind >= 80% of delivered (prompts whose kind is verified; the kind-reference prompts are reported below): 37/39 = 94.9% (reported)
PASS  pictures where needed: 100% [hard]: 10/10
PASS  pictures where none belongs: 0 [hard]: 0/29
PASS  repairs < 15%: 1/40 = 2.5% (reported)
PASS  whole-card p90 <= 7000 ms: p90 6359 ms (p50 3410 ms) (reported)
PASS  noun-box or placeholder labels < 5% of diagrams: 0/38 = 0.0% (reported)
PASS  faithfulness: "not" not worse than the clean-up (+3): not 1/15 (limit 3; clean-up 5/185) (reported)
PASS  faithfulness: "fully" not worse than the clean-up (-3): fully 4/15 (floor 4; clean-up 86/185) (reported)
PASS  claims beyond the prose not worse than the clean-up (+3): 4/38 (limit 10; clean-up 73/385) (reported)
REPORTED  diagram kinds drawn: 14/24 (not drawn: bar-chart, histogram, box-plot, heatmap, number-line, sample-set, argument, t-account, waterfall, tensor)
REPORTED  prompts whose kind is not verified (kind-reference prompts): right 1/1
```

### Run 3

```
GATE: FAIL 118-c0e8f365a tier=smoke factual error <= 10% (overall); noun-box or placeholder labels < 5% of diagrams
report: C:/s/explain-smoke-scratch/gate-118-c0e8f365a-3
cards: 40 (smoke set, 1 run)
PASS  delivery: at least 99% of cards delivered [hard]: 40/40
FAIL  factual error <= 10% (overall): 5/39 = 12.8% (reported)
PASS  factual error <= 10% (baseline): 0/15 = 0.0% (reported)
PASS  right kind >= 80% of delivered (prompts whose kind is verified; the kind-reference prompts are reported below): 39/39 = 100.0% (reported)
PASS  pictures where needed: 100% [hard]: 10/10
PASS  pictures where none belongs: 0 [hard]: 0/29
PASS  repairs < 15%: 1/40 = 2.5% (reported)
PASS  whole-card p90 <= 7000 ms: p90 5139 ms (p50 3314 ms) (reported)
FAIL  noun-box or placeholder labels < 5% of diagrams: 2/40 = 5.0% (reported)
PASS  faithfulness: "not" not worse than the clean-up (+3): not 2/15 (limit 3; clean-up 5/185) (reported)
PASS  faithfulness: "fully" not worse than the clean-up (-3): fully 5/15 (floor 4; clean-up 86/185) (reported)
PASS  claims beyond the prose not worse than the clean-up (+3): 4/40 (limit 11; clean-up 73/385) (reported)
REPORTED  diagram kinds drawn: 14/24 (not drawn: bar-chart, histogram, box-plot, heatmap, number-line, sample-set, argument, t-account, waterfall, tensor)
REPORTED  prompts whose kind is not verified (kind-reference prompts): right 1/1
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

- The same smoke subset taken from the 117 rerun gives faithfulness not 4/45 and fully 15/45 pooled, so the two faithfulness lines (limits scaled from the clean-up run on the six core sets) fail on 117 as well as on 118 (not 5/45 against a limit of 4, fully 15/45 against a floor of 18) because the smoke composition has more sketch-heavy prompts; they need a limit calibrated on a smoke baseline.
- bar-chart now has evidence in the 118 run through the smoke prompt softmax; heatmap, number-line, sample-set, histogram, box-plot, argument, t-account, waterfall and tensor have none (their prompts are in sets the 118 run did not include, or the prompt drew another kind: tensor 0/3).
- Regenerate: `node scripts/explain-bench/gate-check.mjs` over a relabelled subset, plus `report.mjs --judge-dry-run --carry-from` (scratch drivers `an118.mjs` and `subset.cjs` in `C:/s/explain-smoke-scratch`).
