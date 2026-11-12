# 11.3. Attention Scoring Functions figure briefs

9 figure occurrences in document order. [Source page](https://d2l.ai/chapter_attention-mechanisms-and-transformers/attention-scoring-functions.html) · [Inventory](manifest.json)

## Figure 01

Attention converts query-to-key scores into weights and then uses those weights to combine values.

- **Kinds.** `token-links` · `tensor`
- **Elements.** An independent query, key matches, one normalized weight per key and the corresponding terms in a value-vector sum.
- **Sequence.** Attention scoring 1/3. Trace the entire score-to-value calculation
- **Existing reference.** `ml-transformer-attention-softmax` · `ml-transformer-weighted-values`

## Figure 02

Valid-length masking removes padded keys before dot-product scores are normalized.

- **Kinds.** `heatmap`
- **Elements.** New query rows with different valid key counts. Distinguish masked cells from small allowed weights and normalize over allowed keys only.
- **Sequence.** Attention scoring 2/3. Normalize a masked dot-product row. Implementation rendering 1/4

## Figure 03

Valid-length masking removes padded keys before dot-product scores are normalized.

- **Kinds.** `heatmap`
- **Elements.** New query rows with different valid key counts. Distinguish masked cells from small allowed weights and normalize over allowed keys only.
- **Sequence.** Attention scoring 2/3. Normalize a masked dot-product row. Implementation rendering 2/4

## Figure 04

Valid-length masking removes padded keys before dot-product scores are normalized.

- **Kinds.** `heatmap`
- **Elements.** New query rows with different valid key counts. Distinguish masked cells from small allowed weights and normalize over allowed keys only.
- **Sequence.** Attention scoring 2/3. Normalize a masked dot-product row. Implementation rendering 3/4

## Figure 05

Valid-length masking removes padded keys before dot-product scores are normalized.

- **Kinds.** `heatmap`
- **Elements.** New query rows with different valid key counts. Distinguish masked cells from small allowed weights and normalize over allowed keys only.
- **Sequence.** Attention scoring 2/3. Normalize a masked dot-product row. Implementation rendering 4/4

## Figure 06

Additive attention can compare unlike input widths by projecting queries and keys into the same hidden space.

- **Kinds.** `block-stack` · `heatmap`
- **Elements.** Show two invented input widths projected to a shared hidden width, then combined and scored. In a toy weight grid, keep padded keys masked.
- **Sequence.** Attention scoring 3/3. Score projected queries and keys with a learned function. Implementation rendering 1/4

## Figure 07

Additive attention can compare unlike input widths by projecting queries and keys into the same hidden space.

- **Kinds.** `block-stack` · `heatmap`
- **Elements.** Show two invented input widths projected to a shared hidden width, then combined and scored. In a toy weight grid, keep padded keys masked.
- **Sequence.** Attention scoring 3/3. Score projected queries and keys with a learned function. Implementation rendering 2/4

## Figure 08

Additive attention can compare unlike input widths by projecting queries and keys into the same hidden space.

- **Kinds.** `block-stack` · `heatmap`
- **Elements.** Show two invented input widths projected to a shared hidden width, then combined and scored. In a toy weight grid, keep padded keys masked.
- **Sequence.** Attention scoring 3/3. Score projected queries and keys with a learned function. Implementation rendering 3/4

## Figure 09

Additive attention can compare unlike input widths by projecting queries and keys into the same hidden space.

- **Kinds.** `block-stack` · `heatmap`
- **Elements.** Show two invented input widths projected to a shared hidden width, then combined and scored. In a toy weight grid, keep padded keys masked.
- **Sequence.** Attention scoring 3/3. Score projected queries and keys with a learned function. Implementation rendering 4/4
