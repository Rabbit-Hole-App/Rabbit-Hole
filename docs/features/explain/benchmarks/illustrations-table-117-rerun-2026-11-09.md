# illustrations set: per prompt (C:/s/spec/benchmarks/explain-bench/2026-11-09T105915-117-rerun-3x-judged)

| prompt | run | depth | planned | drawn | reference | kind score | faithful | repairs | card ms | out tokens | miss group |
|---|---|---|---|---|---|---|---|---|---|---|---|
| cross-validation | 1 | standard | bar-chart | coordinate-plot | knn-k-validation+ml-fit-quality-comparison-single | wrong | not | 0 | 3410 | 768 | b |
| cross-validation | 2 | standard | bar-chart | bar-chart | shape-bar-chart (shape only) | right | not | 0 | 2759 | 443 | c |
| cross-validation | 3 | standard | bar-chart | bar-chart | shape-bar-chart (shape only) | right | partly | 0 | 2644 | 415 | c |
| ml-dense-vs-moe-architecture | 1 | standard | block-stack | block-stack | shape-block-stack (shape only) | acceptable | partly | other: explanation_bad_diagram: the rh-diagram spec is not valid (diag | 5638 | 1202 | c |
| ml-dense-vs-moe-architecture | 2 | standard | block-stack | block-stack | shape-block-stack (shape only) | acceptable | not | 0 | 3151 | 609 | c |
| ml-dense-vs-moe-architecture | 3 | standard | block-stack | block-stack | shape-block-stack (shape only) | acceptable | partly | other: explanation_bad_diagram: the rh-diagram spec is not valid (diag | 4841 | 918 | c |
| ml-gemma-decoder-stack | 1 | standard | block-stack | block-stack | ml-gemma-decoder-stack | right | partly | 0 | 2840 | 588 | c |
| ml-gemma-decoder-stack | 2 | standard | block-stack | block-stack | ml-gemma-decoder-stack | right | partly | 0 | 2843 | 591 | c |
| ml-gemma-decoder-stack | 3 | standard | block-stack | block-stack | ml-gemma-decoder-stack | right | partly | 0 | 2853 | 619 | c |
| ml-llama-decoder-block | 1 | standard | block-stack | block-stack | ml-llama-decoder-block | right | fully | 0 | 3012 | 662 | - |
| ml-llama-decoder-block | 2 | standard | block-stack | block-stack | ml-llama-decoder-block | right | partly | 0 | 2840 | 673 | c |
| ml-llama-decoder-block | 3 | standard | block-stack | block-stack | ml-llama-decoder-block | right | partly | 0 | 2933 | 626 | c |
| ml-moe-top-two-experts | 1 | standard | block-stack | block-stack | shape-block-stack (shape only) | wrong | partly | other: explanation_bad_diagram: the rh-diagram spec is not valid (diag | 4886 | 946 | a |
| ml-moe-top-two-experts | 2 | standard | block-stack | flow | ml-moe-top-two-experts | right | fully | 0 | 3182 | 863 | - |
| ml-moe-top-two-experts | 3 | standard | block-stack | block-stack | shape-block-stack (shape only) | wrong | partly | 0 | 3515 | 532 | a |
| ml-self-attention-token-links | 1 | standard | token-links | token-links | ml-self-attention-token-links | right | fully | 0 | 2517 | 511 | - |
| ml-self-attention-token-links | 2 | standard | token-links | token-links | ml-self-attention-token-links | right | fully | 0 | 2423 | 469 | - |
| ml-self-attention-token-links | 3 | standard | token-links | token-links | ml-self-attention-token-links | right | fully | 0 | 3132 | 596 | - |
| ml-transformer-attention-softmax | 1 | standard | transformation | transformation | shape-transformation (shape only) | wrong | partly | 0 | 2227 | 424 | a |
| ml-transformer-attention-softmax | 2 | standard | transformation | token-links | ml-transformer-attention-softmax | right | fully | 0 | 2263 | 467 | - |
| ml-transformer-attention-softmax | 3 | standard | transformation | transformation | shape-transformation (shape only) | wrong | partly | 0 | 2482 | 436 | a |
| ml-transformer-causal-mask | 1 | standard | token-links | token-links | shape-token-links (shape only) | wrong | partly | 0 | 2593 | 408 | a |
| ml-transformer-causal-mask | 2 | standard | token-links | token-links | shape-token-links (shape only) | wrong | fully | 0 | 2486 | 507 | a |
| ml-transformer-causal-mask | 3 | standard | token-links | token-links | shape-token-links (shape only) | wrong | partly | 0 | 2368 | 428 | a |
| ml-transformer-cross-attention | 1 | standard | token-links | token-links | ml-transformer-cross-attention | right | fully | 0 | 2615 | 568 | - |
| ml-transformer-cross-attention | 2 | standard | token-links | token-links | ml-transformer-cross-attention | right | fully | 0 | 2823 | 424 | - |
| ml-transformer-cross-attention | 3 | standard | token-links | token-links | ml-transformer-cross-attention | right | fully | 0 | 2562 | 523 | - |
| ml-transformer-encoder-stack | 1 | standard | block-stack | block-stack | ml-transformer-encoder-stack | right | fully | 0 | 3089 | 762 | - |
| ml-transformer-encoder-stack | 2 | standard | block-stack | block-stack | ml-transformer-encoder-stack | right | partly | 0 | 2797 | 672 | c |
| ml-transformer-encoder-stack | 3 | standard | block-stack | block-stack | ml-transformer-encoder-stack | right | fully | 0 | 2832 | 643 | - |
| ml-transformer-parallel-attention-heads | 1 | standard | token-links | token-links | ml-transformer-parallel-attention-heads-single | right | not | 0 | 2839 | 392 | c |
| ml-transformer-parallel-attention-heads | 2 | standard | token-links | token-links | ml-transformer-parallel-attention-heads-single | right | not | 0 | 2820 | 406 | c |
| ml-transformer-parallel-attention-heads | 3 | standard | token-links | token-links | shape-token-links (shape only) | right | not | 0 | 2766 | 474 | c |
| ml-transformer-qkv-projections | 1 | standard | tensor | transformation | ml-transformer-qkv-projections | right | partly | 0 | 3200 | 845 | b |
| ml-transformer-qkv-projections | 2 | standard | tensor | tensor | shape-tensor (shape only) | wrong | not | visual marker / layout,visual marker / layout | 6632 | 1094 | a |
| ml-transformer-qkv-projections | 3 | standard | tensor | transformation | ml-transformer-qkv-projections | right | partly | 0 | 3115 | 819 | b |
| ml-transformer-scaled-attention-scores | 1 | standard | token-links | token-links | shape-token-links (shape only) | acceptable | not | 0 | 2545 | 461 | c |
| ml-transformer-scaled-attention-scores | 2 | standard | token-links | token-links | shape-token-links (shape only) | acceptable | not | 0 | 2221 | 456 | c |
| ml-transformer-scaled-attention-scores | 3 | standard | token-links | token-links | shape-token-links (shape only) | acceptable | not | 0 | 2964 | 485 | c |
| ml-transformer-token-embeddings | 1 | standard | block-stack | block-stack | ml-transformer-token-embeddings | right | not | 0 | 2546 | 505 | c |
| ml-transformer-token-embeddings | 2 | standard | block-stack | block-stack | ml-transformer-token-embeddings | right | partly | 0 | 2772 | 611 | c |
| ml-transformer-token-embeddings | 3 | standard | block-stack | block-stack | ml-transformer-token-embeddings | right | partly | 0 | 3019 | 822 | c |
| ml-transformer-vocabulary-softmax | 1 | standard | flow | flow | shape-flow (shape only) | wrong | not | 0 | 2646 | 530 | a |
| ml-transformer-vocabulary-softmax | 2 | standard | flow | flow | shape-flow (shape only) | wrong | not | 0 | 2677 | 560 | a |
| ml-transformer-vocabulary-softmax | 3 | standard | flow | flow | shape-flow (shape only) | wrong | not | 0 | 2753 | 535 | a |
| ml-transformer-weighted-values | 1 | standard | token-links | token-links | ml-transformer-weighted-values | acceptable | not | 0 | 2668 | 459 | c |
| ml-transformer-weighted-values | 2 | standard | token-links | token-links | shape-token-links (shape only) | acceptable | not | 0 | 2240 | 366 | c |
| ml-transformer-weighted-values | 3 | standard | token-links | token-links | ml-transformer-weighted-values | acceptable | not | 0 | 2398 | 365 | c |
| overfitting | 1 | standard | coordinate-plot | coordinate-plot | ml-fit-quality-comparison-single | right | partly | 0 | 3323 | 973 | c |
| overfitting | 2 | standard | coordinate-plot | coordinate-plot | ml-fit-quality-comparison-single | right | partly | 0 | 3801 | 1013 | c |
| overfitting | 3 | standard | coordinate-plot | coordinate-plot | ml-fit-quality-comparison-single | right | partly | 0 | 3541 | 1082 | c |

Cards 51, delivered 51, kind right 30/51, fully matches 12/51.

## Misses grouped

- (a) planner planned the wrong kind: 11
- (b) planner right, author drew another kind: 3
- (c) kind drawn, content thin or wrong (faithful partly/not): 26
- (d) a repair or fallback replaced it: 0
- not delivered: 0

### a
- ml-moe-top-two-experts r1: planned block-stack, drawn block-stack, reference shape-block-stack (shape only), faithful partly, repaired: other: explanation_bad_diagram: the rh-diagram spec is not valid (diagram.blocks
- ml-moe-top-two-experts r3: planned block-stack, drawn block-stack, reference shape-block-stack (shape only), faithful partly
- ml-transformer-attention-softmax r1: planned transformation, drawn transformation, reference shape-transformation (shape only), faithful partly
- ml-transformer-attention-softmax r3: planned transformation, drawn transformation, reference shape-transformation (shape only), faithful partly
- ml-transformer-causal-mask r1: planned token-links, drawn token-links, reference shape-token-links (shape only), faithful partly
- ml-transformer-causal-mask r2: planned token-links, drawn token-links, reference shape-token-links (shape only), faithful fully
- ml-transformer-causal-mask r3: planned token-links, drawn token-links, reference shape-token-links (shape only), faithful partly
- ml-transformer-qkv-projections r2: planned tensor, drawn tensor, reference shape-tensor (shape only), faithful not, repaired: visual marker / layout,visual marker / layout
- ml-transformer-vocabulary-softmax r1: planned flow, drawn flow, reference shape-flow (shape only), faithful not
- ml-transformer-vocabulary-softmax r2: planned flow, drawn flow, reference shape-flow (shape only), faithful not
- ml-transformer-vocabulary-softmax r3: planned flow, drawn flow, reference shape-flow (shape only), faithful not

### b
- cross-validation r1: planned bar-chart, drawn coordinate-plot, reference knn-k-validation+ml-fit-quality-comparison-single, faithful not
- ml-transformer-qkv-projections r1: planned tensor, drawn transformation, reference ml-transformer-qkv-projections, faithful partly
- ml-transformer-qkv-projections r3: planned tensor, drawn transformation, reference ml-transformer-qkv-projections, faithful partly

### c
- cross-validation r2: planned bar-chart, drawn bar-chart, reference shape-bar-chart (shape only), faithful not
- cross-validation r3: planned bar-chart, drawn bar-chart, reference shape-bar-chart (shape only), faithful partly
- ml-dense-vs-moe-architecture r1: planned block-stack, drawn block-stack, reference shape-block-stack (shape only), faithful partly, repaired: other: explanation_bad_diagram: the rh-diagram spec is not valid (diagram.blocks
- ml-dense-vs-moe-architecture r2: planned block-stack, drawn block-stack, reference shape-block-stack (shape only), faithful not
- ml-dense-vs-moe-architecture r3: planned block-stack, drawn block-stack, reference shape-block-stack (shape only), faithful partly, repaired: other: explanation_bad_diagram: the rh-diagram spec is not valid (diagram.blocks
- ml-gemma-decoder-stack r1: planned block-stack, drawn block-stack, reference ml-gemma-decoder-stack, faithful partly
- ml-gemma-decoder-stack r2: planned block-stack, drawn block-stack, reference ml-gemma-decoder-stack, faithful partly
- ml-gemma-decoder-stack r3: planned block-stack, drawn block-stack, reference ml-gemma-decoder-stack, faithful partly
- ml-llama-decoder-block r2: planned block-stack, drawn block-stack, reference ml-llama-decoder-block, faithful partly
- ml-llama-decoder-block r3: planned block-stack, drawn block-stack, reference ml-llama-decoder-block, faithful partly
- ml-transformer-encoder-stack r2: planned block-stack, drawn block-stack, reference ml-transformer-encoder-stack, faithful partly
- ml-transformer-parallel-attention-heads r1: planned token-links, drawn token-links, reference ml-transformer-parallel-attention-heads-single, faithful not
- ml-transformer-parallel-attention-heads r2: planned token-links, drawn token-links, reference ml-transformer-parallel-attention-heads-single, faithful not
- ml-transformer-parallel-attention-heads r3: planned token-links, drawn token-links, reference shape-token-links (shape only), faithful not
- ml-transformer-scaled-attention-scores r1: planned token-links, drawn token-links, reference shape-token-links (shape only), faithful not
- ml-transformer-scaled-attention-scores r2: planned token-links, drawn token-links, reference shape-token-links (shape only), faithful not
- ml-transformer-scaled-attention-scores r3: planned token-links, drawn token-links, reference shape-token-links (shape only), faithful not
- ml-transformer-token-embeddings r1: planned block-stack, drawn block-stack, reference ml-transformer-token-embeddings, faithful not
- ml-transformer-token-embeddings r2: planned block-stack, drawn block-stack, reference ml-transformer-token-embeddings, faithful partly
- ml-transformer-token-embeddings r3: planned block-stack, drawn block-stack, reference ml-transformer-token-embeddings, faithful partly
- ml-transformer-weighted-values r1: planned token-links, drawn token-links, reference ml-transformer-weighted-values, faithful not
- ml-transformer-weighted-values r2: planned token-links, drawn token-links, reference shape-token-links (shape only), faithful not
- ml-transformer-weighted-values r3: planned token-links, drawn token-links, reference ml-transformer-weighted-values, faithful not
- overfitting r1: planned coordinate-plot, drawn coordinate-plot, reference ml-fit-quality-comparison-single, faithful partly
- overfitting r2: planned coordinate-plot, drawn coordinate-plot, reference ml-fit-quality-comparison-single, faithful partly
- overfitting r3: planned coordinate-plot, drawn coordinate-plot, reference ml-fit-quality-comparison-single, faithful partly

## Time (whole card)

p50 2823 ms, p90 3541 ms, over 51 delivered cards; the p90 tail is 6 cards.

| cause of the slow tail (>= p90) | cards | mean ms |
|---|---|---|
| repair (second model call) | 4 | 5499 |
| model call, big output | 2 | 3671 |

Mean card ms by output tokens: under 900 tokens 2759 ms (44 cards), 900 or more 4666 ms (7 cards).
Repaired cards: 4, mean 5499 ms; not repaired mean 2809 ms.
Picture cards: 0, mean null ms.
