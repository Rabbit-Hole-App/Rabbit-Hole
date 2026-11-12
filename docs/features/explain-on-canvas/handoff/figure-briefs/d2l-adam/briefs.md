# 12.10. Adam figure briefs

9 figure occurrences in document order. [Source page](https://d2l.ai/chapter_optimization/adam.html) · [Inventory](manifest.json)

## Figure 01

An Adam training run can fall quickly toward a lower loss before settling into small minibatch fluctuations.

- **Kinds.** `coordinate-plot`
- **Elements.** Original epoch-loss curve, fixed base rate and a low-loss window; explain that internal per-coordinate scales are adaptive.
- **Sequence.** Adam · 1, inspect a from-scratch run (PyTorch).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 02

Adam's early reduction in training loss and its later plateau are two phases of the same run.

- **Kinds.** `coordinate-plot`
- **Elements.** Epoch axis and loss curve with the initial steep section and later level highlighted.
- **Sequence.** Adam · 1, equivalent from-scratch run (MXNet).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 03

An adaptive optimizer can make most of its measured progress early while later minibatches still produce small variations.

- **Kinds.** `coordinate-plot`
- **Elements.** Highlight an early decrease and late range on the same loss scale without generalizing from the example.
- **Sequence.** Adam · 1, equivalent from-scratch run (TensorFlow).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 04

A framework Adam optimizer gives a loss history with the same broad shape as the explicit update on this example.

- **Kinds.** `coordinate-plot`
- **Elements.** Original built-in loss run with the number of epochs identified, paired with the earlier from-scratch experiment.
- **Sequence.** Adam · 2, built-in optimizer (PyTorch).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 05

A built-in Adam update should be evaluated from the loss history as well as checked for the intended settings.

- **Kinds.** `coordinate-plot`
- **Elements.** Use a labelled train-loss trace and state matching rate and moment settings in a note, without expecting equal sample paths.
- **Sequence.** Adam · 2, equivalent built-in run (MXNet).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 06

A steep initial loss decline can give way to a stable low-loss region under the built-in adaptive optimizer.

- **Kinds.** `coordinate-plot`
- **Elements.** Shared epoch and loss units with the earlier run, visibly distinguishing the early and late intervals.
- **Sequence.** Adam · 2, equivalent built-in run (TensorFlow).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 07

Yogi's alternative second-moment update can train successfully in the example, even though the loss trace alone cannot identify the update rule.

- **Kinds.** `coordinate-plot`
- **Elements.** One original Yogi training curve and a caption naming the changed update; avoid reading moment behavior from loss values.
- **Sequence.** Adam · 3, compare the Yogi variant (PyTorch).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 08

Similar final losses can hide differences between Adam's and Yogi's internal gradient statistics.

- **Kinds.** `coordinate-plot`
- **Elements.** Plot an illustrative Yogi loss trajectory under the same units as the earlier Adam run and distinguish the plotted result from the algorithm.
- **Sequence.** Adam · 3, equivalent Yogi run (MXNet).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 09

The variant can keep a low training loss after its early descent without establishing a universal performance advantage.

- **Kinds.** `coordinate-plot`
- **Elements.** Clear convergence phases for one toy Yogi run and comparison context, with no hardware or empirical benchmark claim.
- **Sequence.** Adam · 3, equivalent Yogi run (TensorFlow).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)
