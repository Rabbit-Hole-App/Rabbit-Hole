# 11.1. Queries, Keys, and Values figure briefs

5 figure occurrences in document order. [Source page](https://d2l.ai/chapter_attention-mechanisms-and-transformers/queries-keys-values.html) · [Inventory](manifest.json)

## Figure 01

A query uses keys to determine how strongly each associated value contributes to the result.

- **Kinds.** `token-links` · `tensor`
- **Elements.** An original query, several associated key/value pairs, normalized weights and one independently calculated weighted value sum.
- **Sequence.** Attention framework 1/2. Separate the lookup signal from the returned contents
- **Existing reference.** `ml-transformer-attention-softmax` · `ml-transformer-weighted-values`

## Figure 02

A diagonal attention matrix passes each value to its matching query without mixing other positions.

- **Kinds.** `heatmap`
- **Elements.** A small invented square with aligned row and column positions, all the weight on each row’s matching position and zero elsewhere. Show what happens to one value.
- **Sequence.** Attention framework 2/2. Read a query-by-key weight grid. Implementation rendering 1/4

## Figure 03

A diagonal attention matrix passes each value to its matching query without mixing other positions.

- **Kinds.** `heatmap`
- **Elements.** A small invented square with aligned row and column positions, all the weight on each row’s matching position and zero elsewhere. Show what happens to one value.
- **Sequence.** Attention framework 2/2. Read a query-by-key weight grid. Implementation rendering 2/4

## Figure 04

A diagonal attention matrix passes each value to its matching query without mixing other positions.

- **Kinds.** `heatmap`
- **Elements.** A small invented square with aligned row and column positions, all the weight on each row’s matching position and zero elsewhere. Show what happens to one value.
- **Sequence.** Attention framework 2/2. Read a query-by-key weight grid. Implementation rendering 3/4

## Figure 05

A diagonal attention matrix passes each value to its matching query without mixing other positions.

- **Kinds.** `heatmap`
- **Elements.** A small invented square with aligned row and column positions, all the weight on each row’s matching position and zero elsewhere. Show what happens to one value.
- **Sequence.** Attention framework 2/2. Read a query-by-key weight grid. Implementation rendering 4/4
