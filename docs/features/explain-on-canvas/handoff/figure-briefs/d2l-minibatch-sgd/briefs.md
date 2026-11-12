# 12.5. Minibatch Stochastic Gradient Descent figure briefs

18 figure occurrences in document order. [Source page](https://d2l.ai/chapter_optimization/minibatch-sgd.html) · [Inventory](manifest.json)

## Figure 01

Full-batch gradient descent makes one update per pass through the examples in this setup.

- **Kinds.** `coordinate-plot`
- **Elements.** Loss by epoch, full-data batch labeled and distinct measurement points spaced by data passes.
- **Sequence.** Minibatches · 1, full-batch baseline (PyTorch).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 02

Looking only at epochs can hide how much computation goes into a full-batch update.

- **Kinds.** `coordinate-plot`
- **Elements.** Label data passes, the relatively sparse loss measurements and the cost of each update in words.
- **Sequence.** Minibatches · 1, equivalent full-batch baseline (MXNet).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 03

The full-batch loss history is a baseline for comparing alternative update frequencies on the same task.

- **Kinds.** `coordinate-plot`
- **Elements.** A single full-batch trace with the epoch unit and loss scale that will be used for comparison.
- **Sequence.** Minibatches · 1, equivalent full-batch baseline (TensorFlow).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 04

One-example updates can reduce loss within a fraction of a data pass while adding late fluctuations.

- **Kinds.** `coordinate-plot`
- **Elements.** Early loss decline, small late bumps and a batch size of one; show fractional epochs.
- **Sequence.** Minibatches · 2, sample-by-sample updates (PyTorch).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 05

A smaller gradient sample allows more updates per epoch but gives each update a noisier direction.

- **Kinds.** `coordinate-plot`
- **Elements.** A one-example run with a clearly labelled steep early phase and irregular late plateau.
- **Sequence.** Minibatches · 2, equivalent single-example updates (MXNet).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 06

Fast loss reduction by epoch for sample-by-sample updates does not imply low wall-clock time.

- **Kinds.** `coordinate-plot`
- **Elements.** Epoch-based loss chart and an explicit distinction between the plotted data-pass axis and elapsed time.
- **Sequence.** Minibatches · 2, equivalent single-example updates (TensorFlow).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 07

A minibatch uses several examples per update while still making multiple updates in one data pass.

- **Kinds.** `coordinate-plot`
- **Elements.** Mid-sized batch trace with fractional epochs, early decline and late plateau; compare the update count with both extremes.
- **Sequence.** Minibatches · 3, larger minibatch (PyTorch).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 08

A moderate batch can retain frequent optimization steps while averaging over several example gradients.

- **Kinds.** `coordinate-plot`
- **Elements.** Draw the mid-sized batch loss history and give the batch size context in the caption.
- **Sequence.** Minibatches · 3, equivalent larger batch (MXNet).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 09

A curve indexed by epochs can show similar convergence across batch sizes despite differences in the number of updates and runtime.

- **Kinds.** `coordinate-plot`
- **Elements.** Compare selected points from the larger minibatch history with the single-example baseline on matching axes.
- **Sequence.** Minibatches · 3, equivalent larger batch (TensorFlow).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 10

Reducing the minibatch size can leave the loss curve similar by epoch even though each epoch takes longer in the example.

- **Kinds.** `coordinate-plot`
- **Elements.** Smaller minibatch loss history, same epoch scale as the larger batch and a separate runtime annotation.
- **Sequence.** Minibatches · 4, smaller minibatch (PyTorch).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 11

Smaller batches expose a trade-off between more frequent updates and less efficient work per update.

- **Kinds.** `coordinate-plot`
- **Elements.** Label the small-batch series and mark its early improvement and noisier late segment; place timing on a separate comparison.
- **Sequence.** Minibatches · 4, equivalent smaller batch (MXNet).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 12

Batch size changes the work performed between measured losses even when end-of-run losses are close.

- **Kinds.** `coordinate-plot`
- **Elements.** A smaller minibatch trace, approximate plateau and common measurement scale for the coming comparison.
- **Sequence.** Minibatches · 4, equivalent smaller batch (TensorFlow).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 13

Timing the methods can reverse the apparent ranking seen when loss is plotted only by data passes.

- **Kinds.** `coordinate-plot`
- **Elements.** Full, single-example and two minibatch histories on a shared log-time axis; compare time to a common loss threshold.
- **Sequence.** Minibatches · 5, elapsed-time comparison (PyTorch).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 14

One-example SGD may take more time than a vectorized minibatch to reach similar loss.

- **Kinds.** `coordinate-plot`
- **Elements.** Four clearly identified traces with original illustrative times and a fixed target loss for comparison.
- **Sequence.** Minibatches · 5, equivalent elapsed-time comparison (MXNet).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 15

Which batch size is fastest depends on both progress per update and cost per update.

- **Kinds.** `coordinate-plot`
- **Elements.** Align wall-clock time and loss for all four runs, show one target crossing and avoid treating illustrative times as hardware results.
- **Sequence.** Minibatches · 5, equivalent elapsed-time comparison (TensorFlow).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 16

A framework minibatch optimizer can reproduce the broad loss pattern of the hand-written update loop.

- **Kinds.** `coordinate-plot`
- **Elements.** Draw early loss drop and plateau from an original toy example; use the same units for the equivalent from-scratch run.
- **Sequence.** Minibatches · 6, built-in optimizer (PyTorch).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 17

Similar loss ranges from a built-in optimizer do not require identical noisy updates.

- **Kinds.** `coordinate-plot`
- **Elements.** Compare the overall early and late shape with the matching scratch implementation, keeping loss and epoch units explicit.
- **Sequence.** Minibatches · 6, equivalent built-in optimizer (MXNet).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 18

A concise minibatch implementation can produce small loss fluctuations after the run has reached a low-loss region.

- **Kinds.** `coordinate-plot`
- **Elements.** An illustrative plateau with small variations over a clearly labeled epoch axis, not a ranking across frameworks.
- **Sequence.** Minibatches · 6, equivalent built-in optimizer (TensorFlow).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)
