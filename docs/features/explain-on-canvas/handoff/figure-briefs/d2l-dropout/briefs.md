# 5.6. Dropout figure briefs

9 figure occurrences in document order. [Source page](https://d2l.ai/chapter_multilayer-perceptrons/dropout.html) · [Inventory](manifest.json)

## Figure 01

Training-time dropout temporarily disables some hidden activations and their paths while retaining the full network for inference.

- **Kinds.** `comparison` · `relationship`
- **Elements.** The same small network before and after one sampled mask, hidden units grayed out in the masked view, and a note that weights are not permanently removed.
- **Sequence.** MLP regularization · 1, a single sampled dropout mask.
- **Phase 02.** [10](../briefs/10-bias-variance.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 02

During dropout training the held-out loss can track the training loss while held-out accuracy improves.

- **Kinds.** `coordinate-plot` · `comparison`
- **Elements.** Training and validation loss on one scale and validation accuracy on a separate matched-epoch scale; show one illustrative run rather than a guarantee.
- **Sequence.** MLP regularization · 2, explicit mask training (PyTorch).
- **Phase 02.** [09](../briefs/09-model-evaluation.md) · [10](../briefs/10-bias-variance.md)

## Figure 03

A drop in validation loss and a rise in validation accuracy measure different aspects of the same dropout run.

- **Kinds.** `coordinate-plot` · `comparison`
- **Elements.** Plot both metrics across the same epochs with separate units, plus training loss as the fit baseline.
- **Sequence.** MLP regularization · 2, equivalent explicit mask run (MXNet).
- **Phase 02.** [09](../briefs/09-model-evaluation.md) · [10](../briefs/10-bias-variance.md)

## Figure 04

Held-out accuracy can level off even as the dropout model's training loss still edges downward.

- **Kinds.** `coordinate-plot` · `comparison`
- **Elements.** Use aligned toy histories for training loss, validation loss and held-out accuracy; mark the accuracy plateau.
- **Sequence.** MLP regularization · 2, equivalent explicit mask run (JAX).
- **Phase 02.** [09](../briefs/09-model-evaluation.md) · [10](../briefs/10-bias-variance.md)

## Figure 05

Improvement after the first few dropout epochs can be slower than the rapid changes at the beginning.

- **Kinds.** `coordinate-plot` · `comparison`
- **Elements.** Compare early and late epochs with separate loss and accuracy scales and labelled training and validation traces.
- **Sequence.** MLP regularization · 2, equivalent explicit mask run (TensorFlow).
- **Phase 02.** [09](../briefs/09-model-evaluation.md) · [10](../briefs/10-bias-variance.md)

## Figure 06

Built-in dropout can yield similar paired loss trends to an explicit dropout mask.

- **Kinds.** `coordinate-plot` · `comparison`
- **Elements.** Show a built-in dropout run, distinct training and validation loss labels, a validation accuracy series and a shared epoch axis.
- **Sequence.** MLP regularization · 3, framework dropout layer (PyTorch).
- **Phase 02.** [09](../briefs/09-model-evaluation.md) · [10](../briefs/10-bias-variance.md)

## Figure 07

A compact dropout implementation should still be checked on held-out data rather than judged from training loss alone.

- **Kinds.** `coordinate-plot` · `comparison`
- **Elements.** Aligned epoch histories for the loss traces and a held-out accuracy plot, each with visible units.
- **Sequence.** MLP regularization · 3, equivalent built-in layer run (MXNet).
- **Phase 02.** [09](../briefs/09-model-evaluation.md) · [10](../briefs/10-bias-variance.md)

## Figure 08

Lower validation loss can continue after most of the gain in validation accuracy has already occurred.

- **Kinds.** `coordinate-plot` · `comparison`
- **Elements.** Small multiples of loss and accuracy over the same epochs with their late phases marked.
- **Sequence.** MLP regularization · 3, equivalent built-in layer run (JAX).
- **Phase 02.** [09](../briefs/09-model-evaluation.md) · [10](../briefs/10-bias-variance.md)

## Figure 09

Noisy validation metrics in a dropout run can still indicate an overall improving model when compared over several epochs.

- **Kinds.** `coordinate-plot` · `comparison`
- **Elements.** Separate epoch series for loss and held-out accuracy, illustrating a small late fluctuation without claiming a particular curve ordering.
- **Sequence.** MLP regularization · 3, equivalent built-in layer run (TensorFlow).
- **Phase 02.** [09](../briefs/09-model-evaluation.md) · [10](../briefs/10-bias-variance.md)
