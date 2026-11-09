# Illustrated Transformer figure chapter

The worked references extend the existing six-token walkthrough. Matrix shapes describe the full-width example and numeric cells use the displayed toy values.

[Source briefs](../../figure-briefs/illustrated-transformer/briefs.md)

| Figure | Written Explanation reference |
| --- | --- |
| [01](../../figure-briefs/illustrated-transformer/briefs.md#figure-01) | `ml-transformer-translation-task` |
| [02](../../figure-briefs/illustrated-transformer/briefs.md#figure-02) | `ml-transformer-encoder-decoder-memory` |
| [03](../../figure-briefs/illustrated-transformer/briefs.md#figure-03) | `ml-transformer-encoder-decoder-memory` · `ml-transformer-encoder-stack` · `ml-transformer-original-decoder-sublayers` |
| [04](../../figure-briefs/illustrated-transformer/briefs.md#figure-04) | `ml-transformer-encoder-stack` |
| [05](../../figure-briefs/illustrated-transformer/briefs.md#figure-05) | `ml-transformer-original-decoder-sublayers` |
| [06](../../figure-briefs/illustrated-transformer/briefs.md#figure-06) | `ml-transformer-token-embeddings` |
| [07](../../figure-briefs/illustrated-transformer/briefs.md#figure-07) | `ml-transformer-positionwise-feedforward` · `ml-transformer-encoder-stack` |
| [08](../../figure-briefs/illustrated-transformer/briefs.md#figure-08) | `ml-transformer-positionwise-feedforward` |
| [09](../../figure-briefs/illustrated-transformer/briefs.md#figure-09) | `ml-transformer-attention-across-distance` · `ml-self-attention-token-links` |
| [10](../../figure-briefs/illustrated-transformer/briefs.md#figure-10) | `ml-transformer-qkv-projections` |
| [11](../../figure-briefs/illustrated-transformer/briefs.md#figure-11) | `ml-transformer-scaled-attention-scores` |
| [12](../../figure-briefs/illustrated-transformer/briefs.md#figure-12) | `ml-transformer-scaled-attention-scores` · `ml-transformer-attention-softmax` |
| [13](../../figure-briefs/illustrated-transformer/briefs.md#figure-13) | `ml-transformer-weighted-values` |
| [14](../../figure-briefs/illustrated-transformer/briefs.md#figure-14) | `ml-transformer-batched-qkv` |
| [15](../../figure-briefs/illustrated-transformer/briefs.md#figure-15) | `ml-transformer-batched-attention` |
| [16](../../figure-briefs/illustrated-transformer/briefs.md#figure-16) | `ml-transformer-parallel-attention-heads` |
| [17](../../figure-briefs/illustrated-transformer/briefs.md#figure-17) | `ml-transformer-parallel-attention-heads` |
| [18](../../figure-briefs/illustrated-transformer/briefs.md#figure-18) | `ml-transformer-parallel-attention-heads` |
| [19](../../figure-briefs/illustrated-transformer/briefs.md#figure-19) | `ml-transformer-parallel-attention-heads` |
| [20](../../figure-briefs/illustrated-transformer/briefs.md#figure-20) | `ml-transformer-parallel-attention-heads` |
| [21](../../figure-briefs/illustrated-transformer/briefs.md#figure-21) | `ml-transformer-parallel-attention-heads` |
| [22](../../figure-briefs/illustrated-transformer/briefs.md#figure-22) | `ml-transformer-token-embeddings` |
| [23](../../figure-briefs/illustrated-transformer/briefs.md#figure-23) | `ml-transformer-token-embeddings` |
| [24](../../figure-briefs/illustrated-transformer/briefs.md#figure-24) | `ml-transformer-position-heatmap` |
| [25](../../figure-briefs/illustrated-transformer/briefs.md#figure-25) | `ml-transformer-position-heatmap` |
| [26](../../figure-briefs/illustrated-transformer/briefs.md#figure-26) | `ml-transformer-encoder-stack` |
| [27](../../figure-briefs/illustrated-transformer/briefs.md#figure-27) | `ml-transformer-residual-arithmetic` |
| [28](../../figure-briefs/illustrated-transformer/briefs.md#figure-28) | `ml-transformer-original-decoder-sublayers` |
| [29](../../figure-briefs/illustrated-transformer/briefs.md#figure-29) | `ml-transformer-autoregressive-prefix` |
| [30](../../figure-briefs/illustrated-transformer/briefs.md#figure-30) | `ml-transformer-autoregressive-prefix` |
| [31](../../figure-briefs/illustrated-transformer/briefs.md#figure-31) | `ml-transformer-vocabulary-softmax` |
| [32](../../figure-briefs/illustrated-transformer/briefs.md#figure-32) | `ml-transformer-one-hot-target` |
| [33](../../figure-briefs/illustrated-transformer/briefs.md#figure-33) | `ml-transformer-one-hot-target` |
| [34](../../figure-briefs/illustrated-transformer/briefs.md#figure-34) | `ml-transformer-one-hot-target` |
| [35](../../figure-briefs/illustrated-transformer/briefs.md#figure-35) | `ml-transformer-shifted-targets` |
| [36](../../figure-briefs/illustrated-transformer/briefs.md#figure-36) | `ml-transformer-vocabulary-cross-entropy` |

## New references

Compact JSON token counts use the cl100k_base encoding. The selector returned each new reference for its learner prompt and paraphrase at all three depths.

| Reference | Kind | Brief | Balanced | Detailed |
| --- | --- | ---: | ---: | ---: |
| `ml-transformer-translation-task` | `flow` | 113 | 115 | 122 |
| `ml-transformer-encoder-decoder-memory` | `relationship` | 181 | 181 | 184 |
| `ml-transformer-original-decoder-sublayers` | `block-stack` | 200 | 211 | 217 |
| `ml-transformer-positionwise-feedforward` | `relationship` | 219 | 218 | 225 |
| `ml-transformer-attention-across-distance` | `token-links` | 106 | 105 | 120 |
| `ml-transformer-batched-qkv` | `matrix` | 97 | 96 | 106 |
| `ml-transformer-batched-attention` | `heatmap` | 269 | 269 | 286 |
| `ml-transformer-position-heatmap` | `heatmap` | 202 | 201 | 219 |
| `ml-transformer-residual-arithmetic` | `transformation` | 243 | 241 | 249 |
| `ml-transformer-autoregressive-prefix` | `sequence` | 140 | 138 | 156 |
| `ml-transformer-one-hot-target` | `matrix` | 130 | 133 | 144 |
| `ml-transformer-shifted-targets` | `matrix` | 124 | 123 | 135 |
| `ml-transformer-vocabulary-cross-entropy` | `bar-chart` | 73 | 73 | 80 |

Render the diagram registry and depth examples with the production SVG renderer.

```sh
node packages/web/scripts/illustration-previews.mjs /tmp/rh-figure-chapters
node --test packages/web/src/tutor-diagrams/transformer-figure-references.test.mjs packages/web/src/tutor-diagrams/svg-snapshots.test.mjs
```

The saved SVG fingerprints cover 408 px, natural width, and 960 px. The 42 established benchmark prompt pick sets match the base. The reference templates are ready for live author checks.
