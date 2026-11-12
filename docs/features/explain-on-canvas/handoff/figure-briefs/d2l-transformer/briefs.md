# 11.7. The Transformer Architecture figure briefs

17 figure occurrences in document order. [Source page](https://d2l.ai/chapter_attention-mechanisms-and-transformers/transformer.html) · [Inventory](manifest.json)

## Figure 01

An encoder–decoder Transformer lets masked target states read encoded source information before producing the next token.

- **Kinds.** `relationship` · `block-stack`
- **Elements.** Use independent translation data with source and shifted target embeddings plus positional features. Include ordered encoder/decoder sublayers, one source-memory handoff and the next-token readout.
- **Sequence.** Transformer 1/5. Trace the complete architecture
- **Existing reference.** `ml-transformer-encoder-decoder-memory` · `ml-transformer-encoder-stack` · `ml-transformer-original-decoder-sublayers`

## Figure 02

A falling training objective can coexist with a worse held-out objective during Transformer training.

- **Kinds.** `coordinate-plot`
- **Elements.** Use original training and held-out loss traces over epochs. Include a divergence and avoid inferring model behavior from the training trace alone. Use a flat-to-improving held-out trace while the train trace drops much farther.
- **Sequence.** Transformer 2/5. Read optimization progress. Implementation rendering 1/4
- **Phase 02.** [09](../briefs/09-model-evaluation.md) · [10](../briefs/10-bias-variance.md)

## Figure 03

A falling training objective can coexist with a worse held-out objective during Transformer training.

- **Kinds.** `coordinate-plot`
- **Elements.** Use original training and held-out loss traces over epochs. Include a divergence and avoid inferring model behavior from the training trace alone. Mark the rapid early validation rise and partial recovery.
- **Sequence.** Transformer 2/5. Read optimization progress. Implementation rendering 2/4
- **Phase 02.** [09](../briefs/09-model-evaluation.md) · [10](../briefs/10-bias-variance.md)

## Figure 04

A falling training objective can coexist with a worse held-out objective during Transformer training.

- **Kinds.** `coordinate-plot`
- **Elements.** Use original training and held-out loss traces over epochs. Include a divergence and avoid inferring model behavior from the training trace alone. Show that a validation rise can persist through the end of fitting.
- **Sequence.** Transformer 2/5. Read optimization progress. Implementation rendering 3/4
- **Phase 02.** [09](../briefs/09-model-evaluation.md) · [10](../briefs/10-bias-variance.md)

## Figure 05

A falling training objective can coexist with a worse held-out objective during Transformer training.

- **Kinds.** `coordinate-plot`
- **Elements.** Use original training and held-out loss traces over epochs. Include a divergence and avoid inferring model behavior from the training trace alone. Distinguish continued fit improvement from a plateau in validation.
- **Sequence.** Transformer 2/5. Read optimization progress. Implementation rendering 4/4
- **Phase 02.** [09](../briefs/09-model-evaluation.md) · [10](../briefs/10-bias-variance.md)

## Figure 06

Encoder heads may distribute attention differently over the same valid source positions.

- **Kinds.** `heatmap` · `comparison`
- **Elements.** Compare representative head grids on the same invented token positions and color scale. Identify the head and layer of each and mask source padding in every case. Contrast a head that selects isolated positions with a broader head.
- **Sequence.** Transformer 3/5. Compare encoder attention patterns. Implementation rendering 1/4

## Figure 07

Encoder heads may distribute attention differently over the same valid source positions.

- **Kinds.** `heatmap` · `comparison`
- **Elements.** Compare representative head grids on the same invented token positions and color scale. Identify the head and layer of each and mask source padding in every case. Use one head that repeatedly chooses the same key and one that distributes weight.
- **Sequence.** Transformer 3/5. Compare encoder attention patterns. Implementation rendering 2/4

## Figure 08

Encoder heads may distribute attention differently over the same valid source positions.

- **Kinds.** `heatmap` · `comparison`
- **Elements.** Compare representative head grids on the same invented token positions and color scale. Identify the head and layer of each and mask source padding in every case. Distinguish a near-diagonal head from a head with a dominant key column.
- **Sequence.** Transformer 3/5. Compare encoder attention patterns. Implementation rendering 3/4

## Figure 09

Encoder heads may distribute attention differently over the same valid source positions.

- **Kinds.** `heatmap` · `comparison`
- **Elements.** Compare representative head grids on the same invented token positions and color scale. Identify the head and layer of each and mask source padding in every case. Show how the dominant source key can change with the layer.
- **Sequence.** Transformer 3/5. Compare encoder attention patterns. Implementation rendering 4/4

## Figure 10

Decoder self-attention cannot use a target position that comes after the current query.

- **Kinds.** `heatmap`
- **Elements.** An independently computed query/key grid with future positions masked and allowed weights normalized. Mark one row and, at Detailed, contrast two distributions sharing this same mask. Show both isolated earlier keys and a head that emphasizes recent tokens.
- **Sequence.** Transformer 4/5. Verify causal visibility in the decoder. Implementation rendering 1/4
- **Existing reference.** `ml-transformer-causal-mask`

## Figure 11

Decoder self-attention cannot use a target position that comes after the current query.

- **Kinds.** `heatmap`
- **Elements.** An independently computed query/key grid with future positions masked and allowed weights normalized. Mark one row and, at Detailed, contrast two distributions sharing this same mask. Use a broad lower-triangle distribution to make the boundary easy to see.
- **Sequence.** Transformer 4/5. Verify causal visibility in the decoder. Implementation rendering 2/4
- **Existing reference.** `ml-transformer-causal-mask`

## Figure 12

Decoder self-attention cannot use a target position that comes after the current query.

- **Kinds.** `heatmap`
- **Elements.** An independently computed query/key grid with future positions masked and allowed weights normalized. Mark one row and, at Detailed, contrast two distributions sharing this same mask. Compare near-diagonal attention with a head that selects a much earlier key.
- **Sequence.** Transformer 4/5. Verify causal visibility in the decoder. Implementation rendering 3/4
- **Existing reference.** `ml-transformer-causal-mask`

## Figure 13

Decoder self-attention cannot use a target position that comes after the current query.

- **Kinds.** `heatmap`
- **Elements.** An independently computed query/key grid with future positions masked and allowed weights normalized. Mark one row and, at Detailed, contrast two distributions sharing this same mask. Show that even a head anchored to one early key respects the mask.
- **Sequence.** Transformer 4/5. Verify causal visibility in the decoder. Implementation rendering 4/4
- **Existing reference.** `ml-transformer-causal-mask`

## Figure 14

Decoder cross-attention aligns target queries with encoder keys, so the two axes describe different sequences.

- **Kinds.** `heatmap` · `token-links`
- **Elements.** An invented translation pair, separate source and target labels, padding excluded and a row illustrating a weighted source context. Use changing source choices across the target rows.
- **Sequence.** Transformer 5/5. Read cross-attention between target and source. Implementation rendering 1/4

## Figure 15

Decoder cross-attention aligns target queries with encoder keys, so the two axes describe different sequences.

- **Kinds.** `heatmap` · `token-links`
- **Elements.** An invented translation pair, separate source and target labels, padding excluded and a row illustrating a weighted source context. Give one head a preference for an early source token.
- **Sequence.** Transformer 5/5. Read cross-attention between target and source. Implementation rendering 2/4

## Figure 16

Decoder cross-attention aligns target queries with encoder keys, so the two axes describe different sequences.

- **Kinds.** `heatmap` · `token-links`
- **Elements.** An invented translation pair, separate source and target labels, padding excluded and a row illustrating a weighted source context. Spread weight more broadly over several source tokens.
- **Sequence.** Transformer 5/5. Read cross-attention between target and source. Implementation rendering 3/4

## Figure 17

Decoder cross-attention aligns target queries with encoder keys, so the two axes describe different sequences.

- **Kinds.** `heatmap` · `token-links`
- **Elements.** An invented translation pair, separate source and target labels, padding excluded and a row illustrating a weighted source context. Use broad weights across valid source positions and a clean boundary at the first unavailable key.
- **Sequence.** Transformer 5/5. Read cross-attention between target and source. Implementation rendering 4/4
