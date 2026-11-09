# The Illustrated GPT-2 figure chapter

The shared continuation example traces token positions, projection slices, caching and the output distribution. A separate toy event list shows the music tokens.

10 new worked references. 64 of 65 figures have a reference. The largest new spec uses 260 tokens.

[Source briefs](../../figure-briefs/illustrated-gpt2/briefs.md) · [Reference module](../../../../../../packages/web/src/tutor-diagrams/gpt2-figure-references.js) · [Token counts](../../../../../../packages/web/src/tutor-diagrams/figure-chapter-token-budgets.json)

| Figure | Written Explanation reference |
| --- | --- |
| [01](../../figure-briefs/illustrated-gpt2/briefs.md#figure-01) | `ml-gpt2-continue-prefix` |
| [02](../../figure-briefs/illustrated-gpt2/briefs.md#figure-02) | `ml-gpt2-continue-prefix` |
| [03](../../figure-briefs/illustrated-gpt2/briefs.md#figure-03) | `ml-gpt2-parameter-counts` |
| [04](../../figure-briefs/illustrated-gpt2/briefs.md#figure-04) | `ml-transformer-encoder-decoder-memory` |
| [05](../../figure-briefs/illustrated-gpt2/briefs.md#figure-05) | `ml-gpt2-context-architecture` |
| [06](../../figure-briefs/illustrated-gpt2/briefs.md#figure-06) | `ml-gpt2-parameter-counts` |
| [07](../../figure-briefs/illustrated-gpt2/briefs.md#figure-07) | `ml-gpt2-continue-prefix` |
| [08](../../figure-briefs/illustrated-gpt2/briefs.md#figure-08) | `ml-gpt2-continue-prefix` |
| [09](../../figure-briefs/illustrated-gpt2/briefs.md#figure-09) | `ml-transformer-encoder-stack` |
| [10](../../figure-briefs/illustrated-gpt2/briefs.md#figure-10) | `ml-transformer-original-decoder-sublayers` |
| [11](../../figure-briefs/illustrated-gpt2/briefs.md#figure-11) | `ml-transformer-causal-mask` |
| [12](../../figure-briefs/illustrated-gpt2/briefs.md#figure-12) | `ml-transformer-causal-mask` · `ml-gpt2-context-architecture` |
| [13](../../figure-briefs/illustrated-gpt2/briefs.md#figure-13) | `ml-gpt2-context-architecture` |
| [14](../../figure-briefs/illustrated-gpt2/briefs.md#figure-14) | `ml-gpt2-context-architecture` |
| [15](../../figure-briefs/illustrated-gpt2/briefs.md#figure-15) | `ml-gpt2-continue-prefix` |
| [16](../../figure-briefs/illustrated-gpt2/briefs.md#figure-16) | `ml-gpt2-continue-prefix` · `ml-gpt2-decode-cache` |
| [17](../../figure-briefs/illustrated-gpt2/briefs.md#figure-17) | `ml-gpt2-learned-position-lookup` |
| [18](../../figure-briefs/illustrated-gpt2/briefs.md#figure-18) | `ml-gpt2-learned-position-lookup` |
| [19](../../figure-briefs/illustrated-gpt2/briefs.md#figure-19) | `ml-gpt2-learned-position-lookup` |
| [20](../../figure-briefs/illustrated-gpt2/briefs.md#figure-20) | `ml-gpt2-context-architecture` |
| [21](../../figure-briefs/illustrated-gpt2/briefs.md#figure-21) | `ml-self-attention-token-links` · `ml-transformer-causal-mask` |
| [22](../../figure-briefs/illustrated-gpt2/briefs.md#figure-22) | `ml-transformer-qkv-projections` · `ml-transformer-scaled-attention-scores` |
| [23](../../figure-briefs/illustrated-gpt2/briefs.md#figure-23) | `ml-transformer-scaled-attention-scores` · `ml-transformer-attention-softmax` |
| [24](../../figure-briefs/illustrated-gpt2/briefs.md#figure-24) | `ml-transformer-weighted-values` |
| [25](../../figure-briefs/illustrated-gpt2/briefs.md#figure-25) | `ml-gpt2-tied-output-weights` |
| [26](../../figure-briefs/illustrated-gpt2/briefs.md#figure-26) | `ml-gpt2-tied-output-weights` |
| [27](../../figure-briefs/illustrated-gpt2/briefs.md#figure-27) | `ml-gpt2-tied-output-weights` · `ml-gpt2-continue-prefix` |
| [28](../../figure-briefs/illustrated-gpt2/briefs.md#figure-28) | `ml-gpt2-context-architecture` · `ml-gpt2-learned-position-lookup` |
| [29](../../figure-briefs/illustrated-gpt2/briefs.md#figure-29) | `ml-transformer-causal-mask` |
| [30](../../figure-briefs/illustrated-gpt2/briefs.md#figure-30) | `ml-transformer-batched-attention` · `ml-transformer-qkv-projections` · `ml-transformer-weighted-values` |
| [31](../../figure-briefs/illustrated-gpt2/briefs.md#figure-31) | `ml-transformer-qkv-projections` |
| [32](../../figure-briefs/illustrated-gpt2/briefs.md#figure-32) | `ml-transformer-scaled-attention-scores` |
| [33](../../figure-briefs/illustrated-gpt2/briefs.md#figure-33) | `ml-transformer-weighted-values` |
| [34](../../figure-briefs/illustrated-gpt2/briefs.md#figure-34) | `ml-transformer-batched-attention` |
| [35](../../figure-briefs/illustrated-gpt2/briefs.md#figure-35) | `ml-transformer-causal-mask` |
| [36](../../figure-briefs/illustrated-gpt2/briefs.md#figure-36) | `ml-transformer-shifted-targets` |
| [37](../../figure-briefs/illustrated-gpt2/briefs.md#figure-37) | `ml-transformer-batched-attention` · `ml-transformer-scaled-attention-scores` |
| [38](../../figure-briefs/illustrated-gpt2/briefs.md#figure-38) | `ml-transformer-causal-mask` |
| [39](../../figure-briefs/illustrated-gpt2/briefs.md#figure-39) | `ml-transformer-causal-mask` |
| [40](../../figure-briefs/illustrated-gpt2/briefs.md#figure-40) | `ml-gpt2-decode-cache` |
| [41](../../figure-briefs/illustrated-gpt2/briefs.md#figure-41) | `ml-gpt2-decode-cache` |
| [42](../../figure-briefs/illustrated-gpt2/briefs.md#figure-42) | `ml-gpt2-decode-cache` |
| [43](../../figure-briefs/illustrated-gpt2/briefs.md#figure-43) | `ml-gpt2-learned-position-lookup` · `ml-gpt2-context-architecture` |
| [44](../../figure-briefs/illustrated-gpt2/briefs.md#figure-44) | `ml-gpt2-fused-qkv-slices` |
| [45](../../figure-briefs/illustrated-gpt2/briefs.md#figure-45) | `ml-gpt2-fused-qkv-slices` |
| [46](../../figure-briefs/illustrated-gpt2/briefs.md#figure-46) | `ml-gpt2-fused-qkv-slices` |
| [47](../../figure-briefs/illustrated-gpt2/briefs.md#figure-47) | `ml-gpt2-fused-qkv-slices` |
| [48](../../figure-briefs/illustrated-gpt2/briefs.md#figure-48) | `ml-gpt2-fused-qkv-slices` |
| [49](../../figure-briefs/illustrated-gpt2/briefs.md#figure-49) | `ml-gpt2-decode-cache` · `ml-transformer-scaled-attention-scores` |
| [50](../../figure-briefs/illustrated-gpt2/briefs.md#figure-50) | `ml-transformer-weighted-values` |
| [51](../../figure-briefs/illustrated-gpt2/briefs.md#figure-51) | `ml-transformer-parallel-attention-heads` |
| [52](../../figure-briefs/illustrated-gpt2/briefs.md#figure-52) | `ml-transformer-parallel-attention-heads` |
| [53](../../figure-briefs/illustrated-gpt2/briefs.md#figure-53) | `ml-transformer-parallel-attention-heads` |
| [54](../../figure-briefs/illustrated-gpt2/briefs.md#figure-54) | `ml-gpt2-feedforward-expansion` |
| [55](../../figure-briefs/illustrated-gpt2/briefs.md#figure-55) | `ml-gpt2-feedforward-expansion` |
| [56](../../figure-briefs/illustrated-gpt2/briefs.md#figure-56) | `ml-gpt2-feedforward-expansion` · `ml-gpt2-fused-qkv-slices` · `ml-gpt2-parameter-counts` |
| [57](../../figure-briefs/illustrated-gpt2/briefs.md#figure-57) | `ml-gpt2-parameter-counts` · `ml-gpt2-context-architecture` · `ml-gpt2-learned-position-lookup` |
| [58](../../figure-briefs/illustrated-gpt2/briefs.md#figure-58) | `ml-gpt2-parameter-counts` |
| [59](../../figure-briefs/illustrated-gpt2/briefs.md#figure-59) | `ml-gpt2-task-separators` |
| [60](../../figure-briefs/illustrated-gpt2/briefs.md#figure-60) | `ml-gpt2-task-separators` |
| [61](../../figure-briefs/illustrated-gpt2/briefs.md#figure-61) | `ml-gpt2-task-separators` |
| [62](../../figure-briefs/illustrated-gpt2/briefs.md#figure-62) | `ml-gpt2-music-event-tokens` |
| [63](../../figure-briefs/illustrated-gpt2/briefs.md#figure-63) | `ml-gpt2-music-event-tokens` |
| [64](../../figure-briefs/illustrated-gpt2/briefs.md#figure-64) | `ml-gpt2-music-event-tokens` |
| [65](../../figure-briefs/illustrated-gpt2/briefs.md#figure-65) | [Gap. Weighted links anchored to time and pitch.](../../figure-briefs/gaps.md) |
