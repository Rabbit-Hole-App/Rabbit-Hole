# 11.6. Self-Attention and Positional Encoding figure briefs

9 figure occurrences in document order. [Source page](https://d2l.ai/chapter_attention-mechanisms-and-transformers/self-attention-and-positional-encoding.html) · [Inventory](manifest.json)

## Figure 01

The communication path between distant positions is different in a local convolution, recurrence and global self-attention.

- **Kinds.** `comparison` · `heatmap`
- **Elements.** Three matched small sets of positions, local neighbor connections, sequential state handoffs and direct all-to-all access. Mark the hops between the same pair.
- **Sequence.** Self-attention and position 1/3. Contrast connectivity and path length

## Figure 02

Sinusoidal position features vary at different frequencies across token positions.

- **Kinds.** `coordinate-plot`
- **Elements.** Independently sample sine and cosine at a fast and a slow frequency. Keep position on the shared horizontal axis and mark one token position.
- **Sequence.** Self-attention and position 2/3. Sample position signals. Implementation rendering 1/4

## Figure 03

Sinusoidal position features vary at different frequencies across token positions.

- **Kinds.** `coordinate-plot`
- **Elements.** Independently sample sine and cosine at a fast and a slow frequency. Keep position on the shared horizontal axis and mark one token position.
- **Sequence.** Self-attention and position 2/3. Sample position signals. Implementation rendering 2/4

## Figure 04

Sinusoidal position features vary at different frequencies across token positions.

- **Kinds.** `coordinate-plot`
- **Elements.** Independently sample sine and cosine at a fast and a slow frequency. Keep position on the shared horizontal axis and mark one token position.
- **Sequence.** Self-attention and position 2/3. Sample position signals. Implementation rendering 3/4

## Figure 05

Sinusoidal position features vary at different frequencies across token positions.

- **Kinds.** `coordinate-plot`
- **Elements.** Independently sample sine and cosine at a fast and a slow frequency. Keep position on the shared horizontal axis and mark one token position.
- **Sequence.** Self-attention and position 2/3. Sample position signals. Implementation rendering 4/4

## Figure 06

Reading a positional encoding by rows gives distinct position signatures while reading columns exposes different rates of variation.

- **Kinds.** `heatmap`
- **Elements.** An independently generated position-by-feature grid with signed values, paired sinusoidal features and a shared diverging scale.
- **Sequence.** Self-attention and position 3/3. Read the positional feature matrix. Implementation rendering 1/4
- **Existing reference.** `ml-transformer-position-heatmap`

## Figure 07

Reading a positional encoding by rows gives distinct position signatures while reading columns exposes different rates of variation.

- **Kinds.** `heatmap`
- **Elements.** An independently generated position-by-feature grid with signed values, paired sinusoidal features and a shared diverging scale.
- **Sequence.** Self-attention and position 3/3. Read the positional feature matrix. Implementation rendering 2/4
- **Existing reference.** `ml-transformer-position-heatmap`

## Figure 08

Reading a positional encoding by rows gives distinct position signatures while reading columns exposes different rates of variation.

- **Kinds.** `heatmap`
- **Elements.** An independently generated position-by-feature grid with signed values, paired sinusoidal features and a shared diverging scale.
- **Sequence.** Self-attention and position 3/3. Read the positional feature matrix. Implementation rendering 3/4
- **Existing reference.** `ml-transformer-position-heatmap`

## Figure 09

Reading a positional encoding by rows gives distinct position signatures while reading columns exposes different rates of variation.

- **Kinds.** `heatmap`
- **Elements.** An independently generated position-by-feature grid with signed values, paired sinusoidal features and a shared diverging scale.
- **Sequence.** Self-attention and position 3/3. Read the positional feature matrix. Implementation rendering 4/4
- **Existing reference.** `ml-transformer-position-heatmap`
