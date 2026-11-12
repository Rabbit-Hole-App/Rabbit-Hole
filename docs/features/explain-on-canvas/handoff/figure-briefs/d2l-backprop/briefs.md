# 5.3. Forward Propagation, Backward Propagation, and Computational Graphs figure briefs

1 figure occurrences in document order. [Source page](https://d2l.ai/chapter_multilayer-perceptrons/backprop.html) · [Inventory](manifest.json)

## Figure 01

A computation graph shows which intermediate values, weights and targets determine the data loss and the regularized objective.

- **Kinds.** `relationship` · `flow`
- **Elements.** Separate a short feature-to-prediction chain, a target input to the loss and a weight-to-penalty branch; merge data loss and penalty only at the final objective.
- **Sequence.** MLP training · 1, trace forward dependencies before explaining reverse gradients.
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [10](../briefs/10-bias-variance.md)
