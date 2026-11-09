# 12.4. Stochastic Gradient Descent figure briefs

9 figure occurrences in document order. [Source page](https://d2l.ai/chapter_optimization/sgd.html) · [Inventory](manifest.json)

## Figure 01

A constant-rate stochastic gradient path can approach the optimum and keep jittering around it.

- **Kinds.** `coordinate-plot`
- **Elements.** Equal-loss contours, a directed trajectory and an enlarged or sparsely sampled late cluster near the optimum.
- **Sequence.** Stochastic gradients · 1, a noisy constant-rate path (PyTorch).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 02

An unbiased noisy gradient can move the parameters downhill on average without making every step improve the loss.

- **Kinds.** `coordinate-plot`
- **Elements.** Mark one late uphill move and the overall drift toward a lower contour; keep both parameter axes.
- **Sequence.** Stochastic gradients · 1, equivalent fixed-rate trajectory (MXNet).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 03

A fixed step size keeps residual motion visible even once the average gradient becomes small.

- **Kinds.** `coordinate-plot`
- **Elements.** Draw a shared optimum and selected late iterates around it after the longer approach.
- **Sequence.** Stochastic gradients · 1, equivalent fixed-rate trajectory (TensorFlow).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 04

Exponential decay reduces the size of late stochastic fluctuations but can stop useful movement before the optimum is reached.

- **Kinds.** `coordinate-plot`
- **Elements.** Use the same contours and start as the fixed-rate run; mark the quieter endpoint and remaining gap to the minimum.
- **Sequence.** Stochastic gradients · 2, rapidly decaying rate (PyTorch).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 05

When the rate drops quickly, the path can look smooth partly because later updates barely move the parameters.

- **Kinds.** `coordinate-plot`
- **Elements.** Contrast long initial updates with a tight late cluster that remains away from the target contour center.
- **Sequence.** Stochastic gradients · 2, equivalent exponential decay (MXNet).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 06

Smaller late steps reduce noise without guaranteeing that the optimizer has reached the minimum.

- **Kinds.** `coordinate-plot`
- **Elements.** Emphasize the distinction between a compact endpoint cluster and the actual contour minimizer.
- **Sequence.** Stochastic gradients · 2, equivalent exponential decay (TensorFlow).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 07

A slower rate decay can preserve progress longer while allowing more residual jitter than a rapid decay.

- **Kinds.** `coordinate-plot`
- **Elements.** Compare trajectories from the same start and mark the late positions for a slowly decreasing rate.
- **Sequence.** Stochastic gradients · 3, slower polynomial decay (PyTorch).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 08

A gradual schedule trades a larger late fluctuation for an endpoint that can be closer to the target in this example.

- **Kinds.** `coordinate-plot`
- **Elements.** Mark the actual minimizer and two independently computed endpoints for faster and slower decay.
- **Sequence.** Stochastic gradients · 3, equivalent slower decay (MXNet).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 09

The choice of decay law influences both how long an SGD run keeps moving and how noisy its late updates remain.

- **Kinds.** `coordinate-plot`
- **Elements.** Draw selected ordered points on identical contours, using a shared step budget to compare both decay choices.
- **Sequence.** Stochastic gradients · 3, equivalent slower decay (TensorFlow).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)
