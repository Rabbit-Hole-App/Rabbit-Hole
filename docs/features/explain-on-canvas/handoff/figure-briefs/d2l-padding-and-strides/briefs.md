# 7.3. Padding and Stride figure briefs

3 figure occurrences in document order. [Source page](https://d2l.ai/chapter_convolutional-neural-networks/padding-and-strides.html) · [Inventory](manifest.json)

## Figure 01

Interior pixels participate in more sliding windows than boundary pixels, with the reuse pattern depending on filter size.

- **Kinds.** `heatmap` · `comparison`
- **Elements.** Contrasting filter sizes, the same small grid and per-position counts computed by enumerating valid windows. Explicitly distinguish interior, edge and corner counts.
- **Sequence.** Padding and stride 1/3. Count how often each position is used

## Figure 02

Zero padding adds a boundary that lets a filter cover edge neighborhoods and control the output size.

- **Kinds.** `heatmap` · `matrix`
- **Elements.** Invent an input grid, mark added zeros and one edge window, and connect the weighted sum to an output location.
- **Sequence.** Padding and stride 2/3. Add a border before filtering

## Figure 03

Stride controls the spacing of filter placements and can shrink different spatial axes by different amounts.

- **Kinds.** `heatmap` · `matrix`
- **Elements.** A small padded field with marked window origins, independent horizontal and vertical steps, and a matching output grid.
- **Sequence.** Padding and stride 3/3. Move the filter in larger jumps
