# 12.11. Learning Rate Scheduling figure briefs

30 figure occurrences in document order. [Source page](https://d2l.ai/chapter_optimization/lr-scheduler.html) · [Inventory](manifest.json)

## Figure 01

A fixed learning rate can keep improving the training metric after held-out accuracy levels off.

- **Kinds.** `coordinate-plot` · `comparison`
- **Elements.** Aligned training and held-out accuracy traces, plus the region where their gap grows; keep the rate constant; show training loss separately from training and test accuracy.
- **Sequence.** Scheduling · 1, constant-rate baseline (PyTorch).
- **Phase 02.** [09](../briefs/09-model-evaluation.md) · [10](../briefs/10-bias-variance.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 02

The fixed-rate training run separates progress on seen examples from gains on examples the model has not seen.

- **Kinds.** `coordinate-plot` · `comparison`
- **Elements.** One common epoch axis and distinct traces for the training and held-out sets; mark the held-out plateau; show training loss separately from training and test accuracy.
- **Sequence.** Scheduling · 1, equivalent constant-rate baseline (MXNet).
- **Phase 02.** [09](../briefs/09-model-evaluation.md) · [10](../briefs/10-bias-variance.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 03

A declining training loss and a rising training accuracy do not imply a matching improvement on held-out data.

- **Kinds.** `coordinate-plot` · `comparison`
- **Elements.** Toy loss and accuracy histories on their own vertical scales, aligned by epoch, with held-out performance shown explicitly.
- **Sequence.** Scheduling · 1, equivalent constant-rate baseline (TensorFlow).
- **Phase 02.** [09](../briefs/09-model-evaluation.md) · [10](../briefs/10-bias-variance.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 04

An inverse-square-root rule takes large steps early and decreases the rate more gradually as updates accumulate.

- **Kinds.** `coordinate-plot`
- **Elements.** Positive rate versus update count, with one early interval and one equally long later interval marked to compare changes.
- **Sequence.** Scheduling · 2, smooth time-based decay (PyTorch).
- **Phase 02.** [12](../briefs/12-hyperparameter-tuning.md)

## Figure 05

A scheduler computes a smaller rate from the update index without consulting the loss value.

- **Kinds.** `coordinate-plot`
- **Elements.** A declining inverse-square-root curve, its initial value and one later lookup; distinguish elapsed updates from a loss signal.
- **Sequence.** Scheduling · 2, equivalent smooth decay (MXNet).
- **Phase 02.** [12](../briefs/12-hyperparameter-tuning.md)

## Figure 06

Inverse-square-root decay flattens without a discontinuity or a finite stopping point.

- **Kinds.** `coordinate-plot`
- **Elements.** The smooth schedule and several late update positions, enough to contrast gradual decay with an abrupt drop.
- **Sequence.** Scheduling · 2, equivalent smooth decay (TensorFlow).
- **Phase 02.** [12](../briefs/12-hyperparameter-tuning.md)

## Figure 07

Applying a shrinking step-size policy can change both the smoothness of training and the gap to held-out performance.

- **Kinds.** `coordinate-plot` · `comparison`
- **Elements.** Training and held-out metrics over shared epochs for one illustrative scheduled run; compare the gap with the fixed-rate baseline; show training loss separately from training and test accuracy.
- **Sequence.** Scheduling · 3, assess the smooth-decay run (PyTorch).
- **Phase 02.** [09](../briefs/09-model-evaluation.md) · [10](../briefs/10-bias-variance.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 08

A decaying schedule should be assessed on held-out outcomes as well as progress on the training set.

- **Kinds.** `coordinate-plot` · `comparison`
- **Elements.** Training and held-out traces with marked late epochs and an explicit link back to the fixed-rate run; show training loss separately from training and test accuracy.
- **Sequence.** Scheduling · 3, equivalent smooth-decay run (MXNet).
- **Phase 02.** [09](../briefs/09-model-evaluation.md) · [10](../briefs/10-bias-variance.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 09

The reported decay experiment shows one possible validation trajectory rather than a guarantee of better generalization.

- **Kinds.** `coordinate-plot` · `comparison`
- **Elements.** A paired metric history and a baseline comparison, both from the same toy example; qualify performance as illustrative; show training loss separately from training and test accuracy.
- **Sequence.** Scheduling · 3, equivalent smooth-decay run (TensorFlow).
- **Phase 02.** [09](../briefs/09-model-evaluation.md) · [10](../briefs/10-bias-variance.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 10

Repeated multiplication reduces the rate geometrically until a lower floor takes over.

- **Kinds.** `coordinate-plot`
- **Elements.** Discrete rate samples, a geometric phase, the first step at the floor and the horizontal tail; illustrate the configured floor clearly even if it is visually small in the source run.
- **Sequence.** Scheduling · 4, multiplicative decay with a floor (PyTorch).
- **Phase 02.** [12](../briefs/12-hyperparameter-tuning.md)

## Figure 11

A floor in a factor schedule prevents arbitrarily small learning rates after many updates.

- **Kinds.** `coordinate-plot`
- **Elements.** Mark the minimum and the transition from decreasing rates to repeated equal rates; illustrate the configured floor clearly even if it is visually small in the source run.
- **Sequence.** Scheduling · 4, equivalent multiplicative decay (MXNet).
- **Phase 02.** [12](../briefs/12-hyperparameter-tuning.md)

## Figure 12

A constant decay factor gives equal proportional drops before the minimum rate binds.

- **Kinds.** `coordinate-plot`
- **Elements.** An original starting rate and factor, two steps before the floor, and two equal rates after it; illustrate the configured floor clearly even if it is visually small in the source run.
- **Sequence.** Scheduling · 4, equivalent multiplicative decay (TensorFlow).
- **Phase 02.** [12](../briefs/12-hyperparameter-tuning.md)

## Figure 13

A milestone schedule leaves the learning rate unchanged between chosen updates and drops it only at those milestones.

- **Kinds.** `coordinate-plot`
- **Elements.** A true step series, two plateaus and a labelled drop epoch.
- **Sequence.** Scheduling · 5, milestone policy (PyTorch).
- **Phase 02.** [12](../briefs/12-hyperparameter-tuning.md)
- **Existing reference.** `learning-rate-schedules`

## Figure 14

In milestone decay, elapsed updates between drops do not change the current rate.

- **Kinds.** `coordinate-plot`
- **Elements.** Two points on the same plateau and points immediately before and after a drop.
- **Sequence.** Scheduling · 5, equivalent milestone policy (MXNet).
- **Phase 02.** [12](../briefs/12-hyperparameter-tuning.md)
- **Existing reference.** `learning-rate-schedules`

## Figure 15

Milestone decay differs from gradual decay because the full adjustment happens at the scheduled boundary.

- **Kinds.** `coordinate-plot`
- **Elements.** A discontinuous step series with explicit plateau values; optionally compare a smooth policy on identical axes.
- **Sequence.** Scheduling · 5, equivalent milestone policy (TensorFlow).
- **Phase 02.** [12](../briefs/12-hyperparameter-tuning.md)
- **Existing reference.** `learning-rate-schedules`

## Figure 16

A model can continue improving after a planned drop, which is why schedules are evaluated over the whole run.

- **Kinds.** `coordinate-plot` · `comparison`
- **Elements.** Paired training and held-out histories with rate-change epochs aligned on the horizontal axis; show training loss separately from training and test accuracy.
- **Sequence.** Scheduling · 6, assess the milestone run (PyTorch).
- **Phase 02.** [09](../briefs/09-model-evaluation.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 17

Planned reductions provide smaller late updates even when a run's metrics fluctuate.

- **Kinds.** `coordinate-plot` · `comparison`
- **Elements.** Illustrative metric curves with milestone markers and a comparison to an earlier epoch window; show training loss separately from training and test accuracy.
- **Sequence.** Scheduling · 6, equivalent milestone run (MXNet).
- **Phase 02.** [09](../briefs/09-model-evaluation.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 18

A late improvement with milestone decay is an observed outcome of the example, and must be checked on unseen data.

- **Kinds.** `coordinate-plot` · `comparison`
- **Elements.** Train and held-out histories around the milestone, with a clear separation between scheduled input and measured output; show training loss separately from training and test accuracy.
- **Sequence.** Scheduling · 6, equivalent milestone run (TensorFlow).
- **Phase 02.** [09](../briefs/09-model-evaluation.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 19

Cosine decay begins gently, decreases fastest in the middle, and approaches its final rate smoothly.

- **Kinds.** `coordinate-plot`
- **Elements.** A sampled cosine schedule, its endpoint and a flat continuation at the floor.
- **Sequence.** Scheduling · 7, cosine rate policy (PyTorch).
- **Phase 02.** [12](../briefs/12-hyperparameter-tuning.md)

## Figure 20

A single cosine decay stops changing the rate once the selected horizon ends.

- **Kinds.** `coordinate-plot`
- **Elements.** Mark the chosen horizon and constant tail, distinguishing a single decay from a restart.
- **Sequence.** Scheduling · 7, equivalent cosine policy (MXNet).
- **Phase 02.** [12](../briefs/12-hyperparameter-tuning.md)

## Figure 21

A cosine schedule reduces the rate most rapidly around the middle of its decay period.

- **Kinds.** `coordinate-plot`
- **Elements.** Three equally spaced update intervals on the same curve, with the middle rate drop visibly larger.
- **Sequence.** Scheduling · 7, equivalent cosine policy (TensorFlow).
- **Phase 02.** [12](../briefs/12-hyperparameter-tuning.md)

## Figure 22

A smooth cosine rate curve still needs a separate performance plot to judge what happened during training.

- **Kinds.** `coordinate-plot` · `comparison`
- **Elements.** Training and held-out histories under one toy cosine run on consistent epoch axes; avoid implying that the rate curve itself is an accuracy curve; show training loss separately from training and test accuracy.
- **Sequence.** Scheduling · 8, assess the cosine run (PyTorch).
- **Phase 02.** [09](../briefs/09-model-evaluation.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 23

Cosine annealing can give different train and held-out behavior even as the learning rate approaches a floor.

- **Kinds.** `coordinate-plot` · `comparison`
- **Elements.** Separate paired metric lines, the end of the decay period and an explicit held-out observation; show training loss separately from training and test accuracy.
- **Sequence.** Scheduling · 8, equivalent cosine run (MXNet).
- **Phase 02.** [09](../briefs/09-model-evaluation.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 24

The late metric region lets a learner compare whether a cosine-scheduled run kept improving on held-out examples.

- **Kinds.** `coordinate-plot` · `comparison`
- **Elements.** Mark the late window and connect it back to the fixed-rate baseline with the same toy data split; show training loss separately from training and test accuracy.
- **Sequence.** Scheduling · 8, equivalent cosine run (TensorFlow).
- **Phase 02.** [09](../briefs/09-model-evaluation.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 25

Warmup starts the optimizer cautiously, raises the rate, and only then starts the main decay.

- **Kinds.** `coordinate-plot`
- **Elements.** A rising warmup segment, a marked handoff at the maximum and a later decreasing segment.
- **Sequence.** Scheduling · 9, add warmup to cosine decay (PyTorch).
- **Phase 02.** [12](../briefs/12-hyperparameter-tuning.md)

## Figure 26

Combining warmup with cosine decay gives distinct ramp-up and cool-down phases.

- **Kinds.** `coordinate-plot`
- **Elements.** Plot the rate on a single update axis and label the change from a straight rising ramp to a curved descent.
- **Sequence.** Scheduling · 9, equivalent warmup policy (MXNet).
- **Phase 02.** [12](../briefs/12-hyperparameter-tuning.md)

## Figure 27

Warmup changes the earliest steps while leaving room for the same later annealing policy.

- **Kinds.** `coordinate-plot`
- **Elements.** Two matched early schedules, one starting at the full rate and one ramping into it; keep the subsequent policy comparable.
- **Sequence.** Scheduling · 9, equivalent warmup policy (TensorFlow).
- **Phase 02.** [12](../briefs/12-hyperparameter-tuning.md)

## Figure 28

The first few epochs show whether warmup gave the model a better start in this example.

- **Kinds.** `coordinate-plot` · `comparison`
- **Elements.** Training and held-out histories with a visible early region, preferably compared with an otherwise matched cosine-only run; show training loss separately from training and test accuracy.
- **Sequence.** Scheduling · 10, assess warmup (PyTorch).
- **Phase 02.** [09](../briefs/09-model-evaluation.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 29

Training curves reveal the effect of the warmup phase separately from the later outcome.

- **Kinds.** `coordinate-plot` · `comparison`
- **Elements.** An aligned epoch axis, the warmup boundary, and separate early and final observations from synthetic traces; show training loss separately from training and test accuracy.
- **Sequence.** Scheduling · 10, equivalent warmup run (MXNet).
- **Phase 02.** [09](../briefs/09-model-evaluation.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 30

The warmup example tests initial learning behavior and does not make a claim that every later checkpoint improves.

- **Kinds.** `coordinate-plot` · `comparison`
- **Elements.** A comparison of the initial slope and eventual held-out metric with the earlier toy run; label both; show training loss separately from training and test accuracy.
- **Sequence.** Scheduling · 10, equivalent warmup run (TensorFlow).
- **Phase 02.** [09](../briefs/09-model-evaluation.md) · [12](../briefs/12-hyperparameter-tuning.md)
