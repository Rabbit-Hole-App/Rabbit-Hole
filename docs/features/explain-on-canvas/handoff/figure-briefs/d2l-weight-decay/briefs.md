# 3.7. Weight Decay figure briefs

12 figure occurrences in document order. [Source page](https://d2l.ai/chapter_linear-regression/weight-decay.html) · [Inventory](manifest.json)

## Figure 01

Without a penalty, better fit to the training examples can leave held-out error essentially unchanged.

- **Kinds.** `coordinate-plot`
- **Elements.** Shared epoch axis, falling training loss, near-flat validation loss, a widening gap and a label identifying zero penalty.
- **Sequence.** Weight decay · 1, no-penalty baseline (PyTorch).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [09](../briefs/09-model-evaluation.md) · [10](../briefs/10-bias-variance.md)

## Figure 02

A model can drive training error down by orders of magnitude without learning a rule that transfers to new examples.

- **Kinds.** `coordinate-plot`
- **Elements.** Training and validation histories on a common log loss scale, with the low training endpoint and the nearly unchanged validation endpoint marked.
- **Sequence.** Weight decay · 1, equivalent baseline (MXNet).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [09](../briefs/09-model-evaluation.md) · [10](../briefs/10-bias-variance.md)

## Figure 03

A noisy but persistent decline in training loss gives little evidence of improvement when validation loss stays flat.

- **Kinds.** `coordinate-plot`
- **Elements.** An unpenalized run, several irregular training samples, a steady held-out trace and labels distinguishing both sets.
- **Sequence.** Weight decay · 1, equivalent baseline (JAX).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [09](../briefs/09-model-evaluation.md) · [10](../briefs/10-bias-variance.md)

## Figure 04

Later training epochs reduce in-sample error while leaving the unpenalized model's validation error nearly at its starting level.

- **Kinds.** `coordinate-plot`
- **Elements.** Use one axis for epoch and compare early and late losses for training and held-out examples.
- **Sequence.** Weight decay · 1, equivalent baseline (TensorFlow).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [09](../briefs/09-model-evaluation.md) · [10](../briefs/10-bias-variance.md)

## Figure 05

Weight decay can trade a higher training loss for better progress on held-out examples.

- **Kinds.** `coordinate-plot`
- **Elements.** Penalized training and validation trajectories, with a no-penalty validation trace or endpoint on the same scale for a fair comparison.
- **Sequence.** Weight decay · 2, enable an L2 penalty (PyTorch).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [09](../briefs/09-model-evaluation.md) · [10](../briefs/10-bias-variance.md)

## Figure 06

With a nonzero weight penalty, both loss traces can fall rather than the validation trace staying flat.

- **Kinds.** `coordinate-plot`
- **Elements.** Plot the two losses by epoch, mark falling validation loss, and state that the examples and fitting window match the unpenalized experiment.
- **Sequence.** Weight decay · 2, equivalent penalty run (MXNet).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [09](../briefs/09-model-evaluation.md) · [10](../briefs/10-bias-variance.md)

## Figure 07

Shrinking the fitted coefficients can improve held-out loss even while the training and validation curves remain separated.

- **Kinds.** `coordinate-plot`
- **Elements.** Mark the remaining loss gap, a clear validation decline and the selected penalty strength, using independently chosen illustrative values.
- **Sequence.** Weight decay · 2, equivalent penalty run (JAX).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [09](../briefs/09-model-evaluation.md) · [10](../briefs/10-bias-variance.md)

## Figure 08

Individual training-loss jumps are compatible with a sustained decline in held-out loss under a weight penalty.

- **Kinds.** `coordinate-plot`
- **Elements.** Training curve with modest noise, validation curve with a downward trend and the same sample and epoch ranges as the baseline.
- **Sequence.** Weight decay · 2, equivalent penalty run (TensorFlow).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [09](../briefs/09-model-evaluation.md) · [10](../briefs/10-bias-variance.md)

## Figure 09

A built-in weight-decay implementation can reproduce the qualitative training and validation pattern of a hand-written penalty.

- **Kinds.** `coordinate-plot`
- **Elements.** Illustrative loss curves, positive penalty annotated, and no claim of point-by-point equality to the earlier run.
- **Sequence.** Weight decay · 3, built-in optimizer penalty (PyTorch).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [09](../briefs/09-model-evaluation.md) · [10](../briefs/10-bias-variance.md)

## Figure 10

A concise penalty implementation can reduce held-out loss even though validation remains above training loss.

- **Kinds.** `coordinate-plot`
- **Elements.** Two loss traces and a validation endpoint mark; distinguish training noise from the slowly improving held-out curve.
- **Sequence.** Weight decay · 3, equivalent built-in example (MXNet).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [09](../briefs/09-model-evaluation.md) · [10](../briefs/10-bias-variance.md)

## Figure 11

Similar held-out trends across implementations matter more than matching their noisy training traces.

- **Kinds.** `coordinate-plot`
- **Elements.** Show a built-in penalty run with train and validation losses over the same epochs; describe comparability, not benchmark speed.
- **Sequence.** Weight decay · 3, equivalent built-in example (JAX).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [09](../briefs/09-model-evaluation.md) · [10](../briefs/10-bias-variance.md)

## Figure 12

Both training and validation losses can settle toward separate levels after a weight penalty is applied.

- **Kinds.** `coordinate-plot`
- **Elements.** Plot train and held-out curves on a shared scale, emphasize their early descent and mark the late plateau.
- **Sequence.** Weight decay · 3, equivalent built-in example (TensorFlow).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [09](../briefs/09-model-evaluation.md) · [10](../briefs/10-bias-variance.md)
