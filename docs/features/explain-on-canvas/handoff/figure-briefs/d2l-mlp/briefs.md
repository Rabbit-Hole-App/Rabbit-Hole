# 5.1. Multilayer Perceptrons figure briefs

25 figure occurrences in document order. [Source page](https://d2l.ai/chapter_multilayer-perceptrons/mlp.html) · [Inventory](manifest.json)

## Figure 01

A hidden layer lets each output depend on nonlinear features learned from the same original inputs.

- **Kinds.** `relationship` · `layers`
- **Elements.** Three groups of units, weighted links only between neighboring groups, and a hidden activation stage distinct from the input and score stages.
- **Sequence.** MLP · 1, introduce a dense hidden layer before its activation.
- **Phase 02.** [01](../briefs/01-what-is-machine-learning.md) · [03](../briefs/03-logistic-regression.md) · [10](../briefs/10-bias-variance.md)

## Figure 02

ReLU maps negative inputs to zero and leaves positive inputs unchanged.

- **Kinds.** `coordinate-plot`
- **Elements.** A flat left segment, an identity line on the right and a clear corner at zero.
- **Sequence.** MLP · 2, rectified linear activation (PyTorch).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [03](../briefs/03-logistic-regression.md)

## Figure 03

The rectifier begins passing input linearly once the input crosses zero.

- **Kinds.** `coordinate-plot`
- **Elements.** Mark one negative and one positive input on a two-segment plot; connect each to its output.
- **Sequence.** MLP · 2, equivalent rectifier plot (MXNet).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [03](../briefs/03-logistic-regression.md)

## Figure 04

ReLU adds nonlinearity with a change in slope even though both pieces are straight.

- **Kinds.** `coordinate-plot`
- **Elements.** Draw separate zero and unit-slope segments with smoothing disabled, and mark the shared origin.
- **Sequence.** MLP · 2, equivalent rectifier plot (JAX).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [03](../briefs/03-logistic-regression.md)

## Figure 05

A positive response survives rectification while a negative response is clipped away.

- **Kinds.** `coordinate-plot`
- **Elements.** Show one input-output sample in each region and identify zero as the switch.
- **Sequence.** MLP · 2, equivalent rectifier plot (TensorFlow).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [03](../briefs/03-logistic-regression.md)

## Figure 06

The ReLU derivative is zero to the left of the corner and one to the right.

- **Kinds.** `coordinate-plot`
- **Elements.** Step plot with an explicit convention at zero, where the classical derivative is undefined.
- **Sequence.** MLP · 3, rectifier gradient (PyTorch).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [03](../briefs/03-logistic-regression.md)

## Figure 07

Backpropagation through a negative preactivation sends no local gradient, while a positive preactivation passes it through unchanged.

- **Kinds.** `coordinate-plot`
- **Elements.** Two derivative plateaus with a labeled point in each region and a note about the kink.
- **Sequence.** MLP · 3, equivalent rectifier gradient (MXNet).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [03](../briefs/03-logistic-regression.md)

## Figure 08

The rectifier's two slope regions become two flat levels in the derivative plot.

- **Kinds.** `coordinate-plot`
- **Elements.** Distinct zero and one plateaus, a discontinuity at the origin and an explicit treatment of the exact corner.
- **Sequence.** MLP · 3, equivalent rectifier gradient (JAX).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [03](../briefs/03-logistic-regression.md)

## Figure 09

The derivative jumps abruptly where ReLU switches from clipping an input to passing it through.

- **Kinds.** `coordinate-plot`
- **Elements.** Show open-sided intervals around the corner or label the implementation convention; keep both plateaus horizontal.
- **Sequence.** MLP · 3, equivalent rectifier gradient (TensorFlow).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [03](../briefs/03-logistic-regression.md)

## Figure 10

Sigmoid compresses an unbounded score into a number between zero and one.

- **Kinds.** `coordinate-plot`
- **Elements.** A smooth rising S-curve, midpoint at one half and guide levels for both asymptotes.
- **Sequence.** MLP · 4, sigmoid output (PyTorch).
- **Phase 02.** [03](../briefs/03-logistic-regression.md)
- **Existing reference.** `sigmoid-threshold`

## Figure 11

Scores far below and above zero yield very different sigmoid outputs that approach opposite limits.

- **Kinds.** `coordinate-plot`
- **Elements.** Three marked logits around the transition and horizontal limits that the curve approaches.
- **Sequence.** MLP · 4, equivalent sigmoid output (MXNet).
- **Phase 02.** [03](../briefs/03-logistic-regression.md)
- **Existing reference.** `sigmoid-threshold`

## Figure 12

Sigmoid changes fastest near the middle and produces almost constant outputs in either tail.

- **Kinds.** `coordinate-plot`
- **Elements.** Mark the midpoint and an example in each tail, with the score and output axes distinguished.
- **Sequence.** MLP · 4, equivalent sigmoid output (JAX).
- **Phase 02.** [03](../briefs/03-logistic-regression.md)
- **Existing reference.** `sigmoid-threshold`

## Figure 13

A zero raw score maps to one half, while positive and negative scores move toward the upper and lower limits.

- **Kinds.** `coordinate-plot`
- **Elements.** A bounded S-curve and symmetric positive and negative example scores; label their outputs without importing the source ticks.
- **Sequence.** MLP · 4, equivalent sigmoid output (TensorFlow).
- **Phase 02.** [03](../briefs/03-logistic-regression.md)
- **Existing reference.** `sigmoid-threshold`

## Figure 14

Sigmoid's derivative peaks at zero input and shrinks as the activation saturates.

- **Kinds.** `coordinate-plot`
- **Elements.** A symmetric gradient curve, peak at one quarter and low values at both tails.
- **Sequence.** MLP · 5, sigmoid sensitivity (PyTorch).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [03](../briefs/03-logistic-regression.md)

## Figure 15

The same change in preactivation affects sigmoid much less in a tail than near its center.

- **Kinds.** `coordinate-plot`
- **Elements.** Positive derivative curve, a center marker and a tail marker used to compare local sensitivity.
- **Sequence.** MLP · 5, equivalent sigmoid sensitivity (MXNet).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [03](../briefs/03-logistic-regression.md)

## Figure 16

A backward gradient is multiplied by a small local sigmoid derivative when the corresponding score is extreme.

- **Kinds.** `coordinate-plot`
- **Elements.** Bell-shaped derivative sampled around zero, with an example derivative in a saturated region.
- **Sequence.** MLP · 5, equivalent sigmoid sensitivity (JAX).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [03](../briefs/03-logistic-regression.md)

## Figure 17

Even at its steepest point, sigmoid's local slope is only one quarter.

- **Kinds.** `coordinate-plot`
- **Elements.** Mark the exact peak from the derivative and contrast it with the two tails; use gradient units on the vertical axis.
- **Sequence.** MLP · 5, equivalent sigmoid sensitivity (TensorFlow).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [03](../briefs/03-logistic-regression.md)

## Figure 18

Tanh is nearly linear around zero but compresses large magnitudes toward one in either direction.

- **Kinds.** `coordinate-plot`
- **Elements.** Centered S-curve, a marked origin and reference levels at minus one and one.
- **Sequence.** MLP · 6, tanh output (PyTorch).
- **Phase 02.** [03](../briefs/03-logistic-regression.md)

## Figure 19

Unlike sigmoid, tanh's bounded range retains the sign of the input and is centered at zero.

- **Kinds.** `coordinate-plot`
- **Elements.** Negative and positive output examples on a symmetric curve, with output bounds shown.
- **Sequence.** MLP · 6, equivalent tanh output (MXNet).
- **Phase 02.** [03](../briefs/03-logistic-regression.md)

## Figure 20

Equal positive and negative tanh inputs give outputs with the same magnitude and opposite sign.

- **Kinds.** `coordinate-plot`
- **Elements.** Mark a mirrored sample pair and use a symmetric scale to expose the odd symmetry.
- **Sequence.** MLP · 6, equivalent tanh output (JAX).
- **Phase 02.** [03](../briefs/03-logistic-regression.md)

## Figure 21

Increasing a large positive input changes tanh very little once its output nears the upper limit.

- **Kinds.** `coordinate-plot`
- **Elements.** Compare the local change in a central interval with an equally wide interval near an asymptote.
- **Sequence.** MLP · 6, equivalent tanh output (TensorFlow).
- **Phase 02.** [03](../briefs/03-logistic-regression.md)

## Figure 22

Tanh's local slope reaches one at zero and fades toward zero in both saturated regions.

- **Kinds.** `coordinate-plot`
- **Elements.** A smooth symmetric derivative, marked peak and near-zero tails.
- **Sequence.** MLP · 7, tanh sensitivity (PyTorch).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [03](../briefs/03-logistic-regression.md)

## Figure 23

Tanh can pass a strong local gradient near zero while attenuating gradients at extreme inputs.

- **Kinds.** `coordinate-plot`
- **Elements.** Show center and tail derivatives on the same scale, tied to an identical incoming gradient in the accompanying explanation.
- **Sequence.** MLP · 7, equivalent tanh sensitivity (MXNet).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [03](../briefs/03-logistic-regression.md)

## Figure 24

The slope of tanh has the same value for inputs with opposite signs.

- **Kinds.** `coordinate-plot`
- **Elements.** Draw the even derivative curve and label the heights at an original mirrored pair.
- **Sequence.** MLP · 7, equivalent tanh sensitivity (JAX).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [03](../briefs/03-logistic-regression.md)

## Figure 25

The narrow high-sensitivity region of tanh contrasts with its broad, low-gradient tails.

- **Kinds.** `coordinate-plot`
- **Elements.** Trace the derivative and mark two ranges with different sensitivity to explain the effect on gradient flow.
- **Sequence.** MLP · 7, equivalent tanh sensitivity (TensorFlow).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [03](../briefs/03-logistic-regression.md)
