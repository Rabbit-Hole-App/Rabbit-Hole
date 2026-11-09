# 9.7. Backpropagation Through Time figure briefs

2 figure occurrences in document order. [Source page](https://d2l.ai/chapter_recurrent-neural-networks/bptt.html) · [Inventory](manifest.json)

## Figure 01

Truncating backpropagation trades a shorter gradient path for less direct training signal from distant steps.

- **Kinds.** `comparison` · `heatmap`
- **Elements.** A new small unroll with full backward reach, a fixed cutoff and an irregular cutoff. Show short and long random segments beside regular cutoffs and an uninterrupted chain. Distinguish a forward state link from a gradient link that is stopped.
- **Sequence.** Backpropagation through time 1/2. Compare gradient horizons

## Figure 02

Unrolling recurrence exposes all time steps whose losses contribute gradients to shared parameters.

- **Kinds.** `relationship` · `matrix`
- **Elements.** A short shared-parameter unroll with per-step prediction losses, forward state edges and a companion grid linking those losses to prior states.
- **Sequence.** Backpropagation through time 2/2. Trace shared-parameter gradients
