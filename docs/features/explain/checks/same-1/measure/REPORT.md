# SAME-1 measurement: REPORT

**First line: do the three SAME-1 questions still share a picture, per arm?**
- before (main 2aeca536d): no. A is a flow in all 4 runs. B and C are both a 3 to 3 transformation on the softmax-probabilities reference in the 2 google-low runs (same kind, reference and counts, not the identical drawing); on fireworks-low C differs (5 to 3 in one run, 1 to 1 with no reference in the other). Never three the same.
- after (planner line a1452a98c): no. A is a flow (3 runs) or bar-chart (1), B a 3 to 3 transformation, C a 5 to 3 or 1 to 1 transformation: B and C no longer share counts. Never three the same.
- everything (feat/same-1 f88c02a67: planner line + narrowed validator + Codex data + caption fix): all three are a bar-chart in 4 of 4 runs, but each on its own reference (A ml-transformer-vocabulary-softmax with 4 or 6 bars, B ml-logistic-regression-softmax-single 3 categories x 2 series, C ml-sampling-top-k 5 categories x 2 series): same kind, different pictures (not one picture). 0 of 12 triplets in any arm has an identical drawing (pictureKey).

Runs: 156 of 156 (26 questions x google-low and fireworks-low x 3 arms, 2 reps for the three SAME-1 questions), delivered 156 of 156, settled cost US$0.365 (stop line US$0.90). Gemini was out of credit for part of the work: 17 provider-failure rows (Fireworks timeouts followed by Gemini 402 on the fallback) were removed and re-run after the top-up; they are kept in results-provider-failures-removed.jsonl. Arms: before 2aeca536d, after a1452a98c, everything ff03fc476 (the trees were built before Codex's caption fix 8dc6a231, merged into feat/same-1 as f88c02a67 afterwards; the caption fix changes one caption string and was not measured). Tests on f88c02a67: kind-gallery 28, kind-gallery-depths 126, spec 28, svg-snapshots 1, set3 token budgets 2, content-contract 13, top-k reference 2, 0 fail; validator count 0 rejected of 470 references.

Reading notes: two reps per question per profile, so each cell is 2 runs. The one-into-one card (before 2 of 26 on fireworks-low, after 2 of 26) is 0 of 26 in the everything arm on both profiles. Planned kind delivered: everything 25/26 and 24/26 vs before 25/26 and 25/26. Honest failures 0 in all arms.

## Triplets (A, B, C per arm and profile, counts of 2 reps)
| arm | profile | triplets | A,B,C same kind | B and C same kind | A,B,C identical picture (pictureKey) | B and C identical picture | A,B,C same kind + same item counts |
|---|---|---|---|---|---|---|---|
| before | google-low | 2 | 0 | 2 | 0 | 0 | 0 |
| before | fireworks-low | 2 | 0 | 2 | 0 | 0 | 0 |
| after | google-low | 2 | 0 | 2 | 0 | 0 | 0 |
| after | fireworks-low | 2 | 0 | 2 | 0 | 0 | 0 |
| everything | google-low | 2 | 2 | 2 | 0 | 0 | 2 |
| everything | fireworks-low | 2 | 2 | 2 | 0 | 0 | 2 |

---

before / google-low / rep 1: A, B, C do NOT share a picture | A flow[nodes:3 edges:2] refs none | B transformation[before:3 after:3] refs softmax-probabilities | C transformation[before:3 after:3] refs softmax-probabilities
before / google-low / rep 2: A, B, C do NOT share a picture | A flow[nodes:4 edges:3] refs none | B transformation[before:3 after:3] refs softmax-probabilities | C transformation[before:3 after:3] refs softmax-probabilities
before / fireworks-low / rep 1: A, B, C do NOT share a picture | A flow[nodes:4 edges:3 highlightPath:4] refs none | B transformation[before:3 after:3] refs softmax-probabilities | C transformation[before:5 after:3] refs softmax-probabilities
before / fireworks-low / rep 2: A, B, C do NOT share a picture | A flow[nodes:4 edges:3 highlightPath:4] refs none | B transformation[before:3 after:3] refs softmax-probabilities | C transformation[before:1 after:1] refs none
after / google-low / rep 1: A, B, C do NOT share a picture | A flow[nodes:4 edges:3] refs softmax-probabilities | B transformation[before:3 after:3] refs none | C transformation[before:5 after:3] refs none
after / google-low / rep 2: A, B, C do NOT share a picture | A bar-chart[bars:3] refs softmax-probabilities | B transformation[before:3 after:3] refs softmax-probabilities | C transformation[before:5 after:3] refs none
after / fireworks-low / rep 1: A, B, C do NOT share a picture | A flow[nodes:4 edges:3 highlightPath:4] refs softmax-probabilities | B transformation[before:3 after:3] refs none | C transformation[before:1 after:1] refs none
after / fireworks-low / rep 2: A, B, C do NOT share a picture | A flow[nodes:4 edges:3 highlightPath:4] refs softmax-probabilities | B transformation[before:3 after:3] refs none | C transformation[before:1 after:1] refs none
everything / google-low / rep 1: A, B, C do NOT share a picture | A bar-chart[bars:4] refs ml-transformer-vocabulary-softmax | B bar-chart[categories:3 series:2] refs ml-logistic-regression-softmax-single | C bar-chart[categories:5 series:2] refs ml-sampling-top-k
everything / google-low / rep 2: A, B, C do NOT share a picture | A bar-chart[bars:6] refs ml-transformer-vocabulary-softmax | B bar-chart[categories:3 series:2] refs ml-logistic-regression-softmax-single | C bar-chart[categories:5 series:2] refs ml-sampling-top-k
everything / fireworks-low / rep 1: A, B, C do NOT share a picture | A bar-chart[bars:6] refs ml-transformer-vocabulary-softmax | B bar-chart[categories:3 series:2] refs ml-logistic-regression-softmax-single | C bar-chart[categories:5 series:2] refs ml-sampling-top-k
everything / fireworks-low / rep 2: A, B, C do NOT share a picture | A bar-chart[bars:6] refs ml-transformer-vocabulary-softmax | B bar-chart[categories:3 series:2] refs ml-logistic-regression-softmax-single | C bar-chart[categories:5 series:2] refs ml-sampling-top-k

## Per arm and profile (all 52 items)
| arm | profile | runs | delivered | honest failures | repairs (sum) | planned kind delivered | transformation planned | 1-into-1 cards delivered | cost US$ (settled) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| before | google-low | 26 | 26 | 0 | 6 | 25/26 | 12 | 0 | 0.071 |
| before | fireworks-low | 26 | 26 | 0 | 4 | 25/26 | 13 | 2 | 0.055 |
| after | google-low | 26 | 26 | 0 | 6 | 24/26 | 14 | 0 | 0.074 |
| after | fireworks-low | 26 | 26 | 0 | 2 | 23/26 | 12 | 2 | 0.048 |
| everything | google-low | 26 | 26 | 0 | 2 | 25/26 | 8 | 0 | 0.066 |
| everything | fireworks-low | 26 | 26 | 0 | 2 | 24/26 | 10 | 0 | 0.051 |

## Planned kind and delivered kind per question (set softmax and transformation), by arm
### softmax
| tag | profile | before: planned > delivered (refs) rep | after: planned > delivered (refs) rep | everything: planned > delivered (refs) rep |
| --- | --- | --- | --- | --- |
| S1 | google-low | transformation > transformation[before:3 after:3] (none) r1 | transformation > transformation[before:3 after:3] (softmax-probabilities) r0 | transformation > transformation[before:3 after:3] (softmax-probabilities) r0 |
| S1 | fireworks-low | transformation > transformation[before:3 after:3] (none) r0 | transformation > transformation[before:3 after:3] (softmax-probabilities) r0 | transformation > transformation[before:3 after:3] (softmax-probabilities) r0 |
| S2 | google-low | bar-chart > bar-chart[categories:3 series:3] (softmax-probabilities) r0 | bar-chart > bar-chart[categories:3 series:2] (softmax-probabilities) r0 | bar-chart > bar-chart[categories:3 series:3] (softmax-probabilities) r0 |
| S2 | fireworks-low | bar-chart > bar-chart[categories:4 series:2] (softmax-probabilities) r0 | bar-chart > transformation[before:3 after:3 links:2] (softmax-probabilities) r0 | bar-chart > transformation[before:3 after:3 links:2] (softmax-probabilities) r0 |
| S3 | google-low | coordinate-plot > coordinate-plot[series:1] (none) r0 | transformation > transformation[before:3 after:3] (softmax-probabilities) r0 | transformation > transformation[before:3 after:3] (softmax-probabilities) r0 |
| S3 | fireworks-low | coordinate-plot > coordinate-plot[series:2] (none) r0 | transformation > transformation[before:4 after:4] (none) r0 | transformation > transformation[before:3 after:3] (softmax-probabilities) r0 |
| S4 | google-low | flow > flow[nodes:4 edges:3] (softmax-probabilities) r0 | transformation > transformation[before:4 after:2] (softmax-probabilities) r0 | bar-chart > bar-chart[categories:5 series:2] (ml-sampling-top-k,ml-transformer-vocabulary-softmax) r0 |
| S4 | fireworks-low | flow > flow[nodes:5 edges:4 highlightPath:5] (softmax-probabilities) r0 | bar-chart > transformation[before:5 after:3 links:5] (softmax-probabilities) r0 | transformation > transformation[before:5 after:5] (ml-sampling-top-k,ml-transformer-vocabulary-softmax) r0 |
| S5 | google-low | comparison > comparison[columns:2] (none) r0 | comparison > comparison[columns:2] (none) r0 | comparison > comparison[columns:2] (none) r0 |
| S5 | fireworks-low | comparison > comparison[columns:2] (none) r0 | comparison > comparison[columns:2] (none) r0 | comparison > comparison[columns:2] (none) r0 |
| S6 | google-low | transformation > transformation[before:3 after:3] (none) r1 | transformation > transformation[before:3 after:3] (softmax-probabilities) r0 | transformation > transformation[before:3 after:3] (softmax-probabilities) r0 |
| S6 | fireworks-low | transformation > transformation[before:3 after:3] (none) r0 | transformation > transformation[before:3 after:3] (softmax-probabilities) r0 | transformation > transformation[before:3 after:3] (softmax-probabilities) r1 |
| S7 | google-low | comparison > coordinate-plot[series:2 annotations:0] (probability-calibration) r0 | bar-chart > bar-chart[categories:3 series:2] (softmax-probabilities) r0 | bar-chart > bar-chart[categories:3 series:2] (softmax-probabilities) r0 |
| S7 | fireworks-low | comparison > comparison[columns:2] (probability-calibration) r0 | bar-chart > comparison[columns:2] (softmax-probabilities) r0 | bar-chart > comparison[columns:2] (softmax-probabilities) r0 |
| S8 | google-low | transformation > transformation[before:3 after:3] (none) r0 | transformation > transformation[before:3 after:3] (none) r0 | transformation > transformation[before:3 after:3] (none) r0 |
| S8 | fireworks-low | transformation > transformation[before:4 after:4] (none) r0 | transformation > transformation[before:4 after:4] (none) r0 | transformation > transformation[before:3 after:3] (none) r0 |
| S9 | google-low | flow > flow[nodes:3 edges:2] (none) r0 | flow > flow[nodes:3 edges:2] (none) r0 | flow > flow[nodes:3 edges:2] (none) r0 |
| S9 | fireworks-low | flow > flow[nodes:4 edges:3 highlightPath:4] (none) r0 | flow > flow[nodes:4 edges:3 highlightPath:4] (none) r0 | flow > flow[nodes:4 edges:3 highlightPath:4] (none) r0 |
| S10 | google-low | coordinate-plot > coordinate-plot[series:2] (none) r0 | transformation > transformation[before:2 after:2] (none) r0 | coordinate-plot > coordinate-plot[series:2] (none) r0 |
| S10 | fireworks-low | coordinate-plot > coordinate-plot[series:1] (none) r0 | coordinate-plot > coordinate-plot[series:1] (none) r0 | coordinate-plot > coordinate-plot[series:1] (none) r0 |
### transformation
| tag | profile | before: planned > delivered (refs) rep | after: planned > delivered (refs) rep | everything: planned > delivered (refs) rep |
| --- | --- | --- | --- | --- |
| T1 | google-low | transformation > transformation[before:3 after:3] (none) r0 | transformation > transformation[before:3 after:3] (none) r0 | transformation > transformation[before:3 after:3] (none) r0 |
| T1 | fireworks-low | transformation > transformation[before:3 after:3] (none) r0 | transformation > transformation[before:3 after:3] (none) r0 | transformation > transformation[before:3 after:3] (none) r1 |
| T2 | google-low | comparison > comparison[columns:2] (ml-raw-log-distributions) r0 | comparison > comparison[columns:2] (ml-raw-log-distributions) r0 | comparison > comparison[columns:2] (ml-raw-log-distributions) r0 |
| T2 | fireworks-low | comparison > comparison[columns:2] (ml-raw-log-distributions) r0 | comparison > comparison[columns:2] (ml-raw-log-distributions) r0 | comparison > comparison[columns:2] (ml-raw-log-distributions) r0 |
| T3 | google-low | transformation > transformation[before:2 after:2] (none) r0 | relationship > transformation[before:2 after:2 links:1] (none) r0 | relationship > transformation[before:2 after:2 links:1] (none) r0 |
| T3 | fireworks-low | transformation > relationship[nodes:2 edges:1] (none) r0 | relationship > relationship[nodes:3 edges:2] (none) r0 | relationship > relationship[nodes:3 edges:2] (none) r0 |
| T4 | google-low | coordinate-plot > coordinate-plot[series:2] (none) r1 | transformation > transformation[before:2 after:2] (none) r0 | transformation > transformation[before:3 after:3] (none) r0 |
| T4 | fireworks-low | transformation > transformation[before:2 after:2] (none) r0 | transformation > transformation[before:2 after:2] (none) r0 | transformation > transformation[before:3 after:3] (none) r0 |
| T5 | google-low | transformation > transformation[before:1 after:3] (none) r1 | transformation > transformation[before:1 after:4] (none) r0 | transformation > transformation[before:3 after:3] (none) r0 |
| T5 | fireworks-low | transformation > transformation[before:1 after:2] (none) r0 | flow > flow[nodes:3 edges:2] (none) r0 | transformation > transformation[before:1 after:4] (none) r0 |
| T6 | google-low | transformation > transformation[before:2 after:2] (ml-feature-scaling-transformation) r0 | flow > flow[nodes:4 edges:3] (ml-feature-scaling-transformation-single) r0 | flow > flow[nodes:3 edges:2 highlightPath:3] (ml-feature-scaling-transformation-single) r0 |
| T6 | fireworks-low | transformation > transformation[before:1 after:1] (ml-feature-scaling-transformation) r2 | transformation > transformation[before:2 after:2] (ml-feature-scaling-transformation) r0 | transformation > transformation[before:3 after:3] (ml-feature-scaling-transformation) r0 |
| T7 | google-low | transformation > transformation[before:2 after:2] (ml-dropout-network) r0 | transformation > transformation[before:2 after:2] (ml-dropout-network) r0 | transformation > transformation[before:3 after:3] (ml-dropout-network) r0 |
| T7 | fireworks-low | transformation > transformation[before:3 after:3] (ml-dropout-network) r0 | transformation > transformation[before:3 after:3] (ml-dropout-network) r0 | transformation > transformation[before:2 after:2] (ml-dropout-network) r0 |
| T8 | google-low | token-links > token-links[source:6 target:6 queries:1] (ml-transformer-attention-softmax) r0 | token-links > token-links[source:6 target:6 queries:1] (ml-transformer-attention-softmax) r0 | token-links > token-links[source:6 target:6 queries:1] (ml-transformer-attention-softmax) r0 |
| T8 | fireworks-low | token-links > token-links[source:6 target:6 queries:1] (ml-transformer-attention-softmax) r0 | token-links > token-links[source:6 target:6 queries:1] (ml-transformer-attention-softmax) r0 | token-links > token-links[source:6 target:6 queries:1] (ml-transformer-attention-softmax) r0 |
| T9 | google-low | heatmap > heatmap[columns:3 rows:4] (ml-stable-diffusion-forward-noise) r2 | heatmap > heatmap[columns:3 rows:4] (ml-stable-diffusion-forward-noise) r2 | heatmap > heatmap[columns:3 rows:4] (ml-stable-diffusion-forward-noise) r2 |
| T9 | fireworks-low | heatmap > heatmap[columns:3 rows:4] (ml-stable-diffusion-forward-noise) r0 | heatmap > heatmap[columns:3 rows:4] (ml-stable-diffusion-forward-noise) r0 | heatmap > heatmap[columns:3 rows:4] (ml-stable-diffusion-forward-noise) r0 |
| T10 | google-low | number-line > number-line[markers:2] (ml-word2vec-trait-rescale) r0 | number-line > number-line[markers:2] (ml-word2vec-trait-rescale) r0 | number-line > number-line[markers:2] (ml-word2vec-trait-rescale) r0 |
| T10 | fireworks-low | number-line > number-line[markers:2] (ml-word2vec-trait-rescale) r0 | number-line > number-line[markers:2] (ml-word2vec-trait-rescale) r0 | number-line > number-line[markers:2] (ml-word2vec-trait-rescale) r0 |

