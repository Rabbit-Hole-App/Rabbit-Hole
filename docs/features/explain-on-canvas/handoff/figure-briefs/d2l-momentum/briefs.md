# 12.6. Momentum figure briefs

30 figure occurrences in document order. [Source page](https://d2l.ai/chapter_optimization/momentum.html) · [Inventory](manifest.json)

## Figure 01

A narrow loss valley can make gradient descent bounce across the steep direction while advancing slowly along the shallow one.

- **Kinds.** `coordinate-plot`
- **Elements.** Elongated quadratic contours, ordered iterates, steep and shallow axes, and a marked minimizer still ahead of the endpoint.
- **Sequence.** Momentum · 1, ill-conditioned baseline (PyTorch).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 02

Oscillations across the valley can shrink before the optimizer makes much progress along its length.

- **Kinds.** `coordinate-plot`
- **Elements.** Shared coordinate scale and an early bounce followed by small cross-valley motions that still leave horizontal distance to the minimum.
- **Sequence.** Momentum · 1, equivalent plain gradient descent (MXNet).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 03

One shared rate must accommodate two very different curvature scales in ordinary gradient descent.

- **Kinds.** `coordinate-plot`
- **Elements.** Mark a fast-changing coordinate and slow-changing coordinate on a narrow contour plot with a common update path.
- **Sequence.** Momentum · 1, equivalent ill-conditioned run (TensorFlow).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 04

Raising the rate to move faster along the shallow direction can make the steep direction diverge.

- **Kinds.** `coordinate-plot`
- **Elements.** Same valley and start, larger rate and increasingly wide alternating excursions; give both axes visible units.
- **Sequence.** Momentum · 2, instability at a larger plain-GD rate (PyTorch).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 05

One coordinate can move closer to its optimum while the joint parameter vector gets farther away.

- **Kinds.** `coordinate-plot`
- **Elements.** Highlight horizontal progress and expanding vertical excursions in the same ordered trajectory.
- **Sequence.** Momentum · 2, equivalent unstable run (MXNet).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 06

Large late oscillations can dominate the scale and hide the initially modest instability.

- **Kinds.** `coordinate-plot`
- **Elements.** Mark selected early and late iterates from a toy divergent run and keep their order visible.
- **Sequence.** Momentum · 2, equivalent unstable run (TensorFlow).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 07

Adding momentum can damp cross-valley motion and let the optimizer reach the neighborhood of the minimum at the rate that plain descent could not handle.

- **Kinds.** `coordinate-plot`
- **Elements.** Identical elongated contours and start as the unstable example, plus ordered momentum iterates and a marked final cluster.
- **Sequence.** Momentum · 3, add a velocity term (PyTorch).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 08

Remembering earlier gradients changes the path and permits continued progress along the valley.

- **Kinds.** `coordinate-plot`
- **Elements.** Plot the damped oscillations and accumulated movement along the shallow axis; tie the path to the momentum setting.
- **Sequence.** Momentum · 3, equivalent momentum trajectory (MXNet).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 09

Momentum does not eliminate the first bounce but can keep subsequent excursions bounded in this example.

- **Kinds.** `coordinate-plot`
- **Elements.** Annotate the initial overshoot and a later narrow cluster against the same loss contours.
- **Sequence.** Momentum · 3, equivalent momentum trajectory (TensorFlow).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 10

A different rate and momentum pairing changes how long the optimizer oscillates before settling.

- **Kinds.** `coordinate-plot`
- **Elements.** Same contours, start and step budget as the previous momentum run; compare the envelope of cross-valley motion.
- **Sequence.** Momentum · 4, change the momentum settings (PyTorch).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 11

Repeated crossings of the valley can be compatible with convergence when each crossing becomes smaller.

- **Kinds.** `coordinate-plot`
- **Elements.** Show successive positive and negative excursions, a shrinking amplitude and an identified center.
- **Sequence.** Momentum · 4, equivalent damped trajectory (MXNet).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 12

The relative progress of two momentum settings can be assessed by comparing the same numbered iterates.

- **Kinds.** `coordinate-plot`
- **Elements.** Selected update markers on a narrowing zigzag, with a reference to the earlier trajectory on matching axes.
- **Sequence.** Momentum · 4, equivalent momentum setting (TensorFlow).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 13

A larger momentum coefficient keeps older gradients influential for more updates.

- **Kinds.** `coordinate-plot`
- **Elements.** Several decay traces indexed by gradient age, with current weight one and distinct older contributions.
- **Sequence.** Momentum · 5, effective memory (PyTorch).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 14

A zero momentum coefficient keeps only the current gradient, while a positive coefficient assigns diminishing weights to older ones.

- **Kinds.** `coordinate-plot`
- **Elements.** A no-memory trace and two nonzero memory settings; mark one past update to compare weights.
- **Sequence.** Momentum · 5, equivalent memory comparison (MXNet).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 15

The coefficient of a gradient from several steps ago decays geometrically with age.

- **Kinds.** `coordinate-plot`
- **Elements.** Rate-of-forgetting curves beginning at the same current weight and clearly identified decay factors.
- **Sequence.** Momentum · 5, equivalent effective weights (TensorFlow).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 16

Momentum SGD can reduce regression training loss rapidly and then fluctuate around a lower region.

- **Kinds.** `coordinate-plot`
- **Elements.** Loss by data pass, an early descent, and a late plateau for an independently generated toy run.
- **Sequence.** Momentum · 6, initial minibatch training run (PyTorch).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 17

A short momentum training run separates the steep early improvement from the late low-loss behavior.

- **Kinds.** `coordinate-plot`
- **Elements.** Mark both intervals in a single loss history and state the rate and momentum settings in prose.
- **Sequence.** Momentum · 6, equivalent from-scratch run (MXNet).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 18

Small changes in late minibatch loss can remain after the optimizer has made most of its progress.

- **Kinds.** `coordinate-plot`
- **Elements.** Clear early drop and late fluctuations under one original momentum configuration.
- **Sequence.** Momentum · 6, equivalent from-scratch run (TensorFlow).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 19

Increasing the momentum coefficient without coordinating the step size can make loss progress more uneven.

- **Kinds.** `coordinate-plot`
- **Elements.** Same loss scale and training duration as the lower-memory run, with a temporary loss rise shown explicitly.
- **Sequence.** Momentum · 7, increase momentum (PyTorch).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 20

Stronger gradient memory can amplify a run's response even when the nominal learning rate stays fixed.

- **Kinds.** `coordinate-plot`
- **Elements.** Pair the stronger-memory loss trace with the previous setting; mark a rebound rather than asserting one universal outcome.
- **Sequence.** Momentum · 7, equivalent higher-memory run (MXNet).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 21

Early improvement under higher momentum does not guarantee a smooth low-loss region later.

- **Kinds.** `coordinate-plot`
- **Elements.** Label the two settings, an early fall and late uneven loss samples on matching scales.
- **Sequence.** Momentum · 7, equivalent higher-memory run (TensorFlow).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 22

Reducing the learning rate can make a higher-momentum run less erratic.

- **Kinds.** `coordinate-plot`
- **Elements.** Hold momentum and data fixed, show the lower-rate loss history and retain the earlier higher-rate example for contrast.
- **Sequence.** Momentum · 8, lower the rate (PyTorch).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 23

Rate and momentum should be evaluated together because the current step includes accumulated gradients.

- **Kinds.** `coordinate-plot`
- **Elements.** Compare two rates at a fixed momentum level and annotate the resulting late behavior of each toy run.
- **Sequence.** Momentum · 8, equivalent lower-rate run (MXNet).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 24

In the lower-rate example, early descent is followed by a more stable low-loss region.

- **Kinds.** `coordinate-plot`
- **Elements.** Loss by fractional epoch, marked early and late phases, and the paired prior-run comparison.
- **Sequence.** Momentum · 8, equivalent lower-rate run (TensorFlow).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 25

A built-in optimizer can implement momentum through the same learning-rate and memory settings as a hand-written update.

- **Kinds.** `coordinate-plot`
- **Elements.** Illustrative loss trajectory, corresponding settings and matching units for comparison to the scratch version.
- **Sequence.** Momentum · 9, built-in momentum SGD (PyTorch).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 26

A built-in momentum run can match the overall convergence pattern without reproducing every minibatch fluctuation.

- **Kinds.** `coordinate-plot`
- **Elements.** Early decrease and late range for one illustrative history with the same task and settings as its comparison.
- **Sequence.** Momentum · 9, equivalent built-in example (MXNet).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 27

A short loss rebound after initial descent is compatible with useful optimization progress.

- **Kinds.** `coordinate-plot`
- **Elements.** Loss trajectory with a labelled rebound and later low-loss samples; no ranking of library implementations.
- **Sequence.** Momentum · 9, equivalent built-in example (TensorFlow).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 28

On a scalar quadratic, curvature and rate together determine whether plain gradient descent approaches zero monotonically or alternates in sign.

- **Kinds.** `coordinate-plot`
- **Elements.** Iteration axis, common initial parameter and four illustrative traces spanning slow, fast, one-step and oscillatory decay.
- **Sequence.** Momentum · 10, scalar convergence baseline without momentum (PyTorch).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 29

A near-zero update factor settles rapidly, while a negative factor flips the sign each step.

- **Kinds.** `coordinate-plot`
- **Elements.** Parameter value versus update index with zero guide, direct and alternating trajectories and straight connections.
- **Sequence.** Momentum · 10, equivalent scalar convergence (MXNet).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 30

An alternating gradient-descent trajectory can still converge when the update factor's magnitude is below one.

- **Kinds.** `coordinate-plot`
- **Elements.** Show an alternating trace inside a shrinking envelope and a slower nonoscillating trace on common axes.
- **Sequence.** Momentum · 10, equivalent scalar convergence (TensorFlow).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)
