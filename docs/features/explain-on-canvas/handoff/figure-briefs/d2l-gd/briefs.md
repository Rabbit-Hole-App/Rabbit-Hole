# 12.3. Gradient Descent figure briefs

24 figure occurrences in document order. [Source page](https://d2l.ai/chapter_optimization/gd.html) · [Inventory](manifest.json)

## Figure 01

Repeated steps opposite the slope carry a one-parameter quadratic toward its minimum.

- **Kinds.** `coordinate-plot`
- **Elements.** A convex loss curve, starting weight, numbered weight updates, and a marked minimizer.
- **Sequence.** Gradient descent · 1, a stable rate (PyTorch).
- **Phase 02.** [02](../briefs/02-linear-regression.md)

## Figure 02

On a quadratic, descent steps get smaller as the slope near the optimum gets flatter.

- **Kinds.** `coordinate-plot`
- **Elements.** Loss versus weight with early and late step intervals marked and a distinct final point.
- **Sequence.** Gradient descent · 1, equivalent stable rate (MXNet).
- **Phase 02.** [02](../briefs/02-linear-regression.md)

## Figure 03

A reasonable fixed rate lets the weight settle near the bottom from one side of the curve.

- **Kinds.** `coordinate-plot`
- **Elements.** Convex bowl with sequential markers drawn above the loss curve and spaced to expose early progress.
- **Sequence.** Gradient descent · 1, equivalent stable rate (TensorFlow).
- **Phase 02.** [02](../briefs/02-linear-regression.md)

## Figure 04

Too small a rate can make every update move downhill yet leave the weight far from the minimum after the same budget.

- **Kinds.** `coordinate-plot`
- **Elements.** Same toy loss, start and number of steps as a stable-rate case; mark the remaining distance to the optimum.
- **Sequence.** Gradient descent · 2, a rate that is too small (PyTorch).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 05

Tiny updates make incremental progress while many useful steps remain before reaching the flat part of the loss.

- **Kinds.** `coordinate-plot`
- **Elements.** A short movement segment on a quadratic, clearly separated late points and the minimum beyond the endpoint.
- **Sequence.** Gradient descent · 2, equivalent slow rate (MXNet).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 06

Step size and gradient jointly determine how quickly a model crosses a steep section of the loss curve.

- **Kinds.** `coordinate-plot`
- **Elements.** Show nearby iterates on the steep side and compare their total movement with one run using a larger stable rate.
- **Sequence.** Gradient descent · 2, equivalent slow rate (TensorFlow).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 07

Excessive step size can bounce the weight across the optimum with each bounce going farther away.

- **Kinds.** `coordinate-plot`
- **Elements.** Same quadratic objective, alternating ordered points, straight update segments and progressively larger distances from the minimum.
- **Sequence.** Gradient descent · 3, an unstable rate (PyTorch).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 08

A gradient can point downhill locally while a step along that direction lands at a higher loss.

- **Kinds.** `coordinate-plot`
- **Elements.** Draw one visible overshoot and subsequent expanding bounces; label update order independently of x-coordinate.
- **Sequence.** Gradient descent · 3, equivalent overshoot (MXNet).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 09

Alternating sides of the minimum signals overshoot, and growing amplitudes distinguish divergence from convergence.

- **Kinds.** `coordinate-plot`
- **Elements.** Overlay an ordered zigzag on a quadratic and mark the small start and farther endpoint.
- **Sequence.** Gradient descent · 3, equivalent overshoot (TensorFlow).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 10

Gradient descent can settle in a nearby basin of a nonconvex loss even when a lower minimum exists elsewhere.

- **Kinds.** `coordinate-plot`
- **Elements.** Smooth curve with two minima of different depths, starting point, actual update path to the shallower basin and a separate mark at the lower minimum.
- **Sequence.** Gradient descent · 4, local minima (PyTorch).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 11

Reaching a point with nearly zero slope does not prove that the objective is globally minimized.

- **Kinds.** `coordinate-plot`
- **Elements.** A visited local minimum and a deeper unvisited minimum, with the descent path distinguished from the loss curve.
- **Sequence.** Gradient descent · 4, equivalent local minimum (MXNet).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 12

The initial weight can determine which valley a local gradient method finds.

- **Kinds.** `coordinate-plot`
- **Elements.** Use the same multi-valley objective and indicate one route into a shallower basin, optionally contrasting another start without changing the curve.
- **Sequence.** Gradient descent · 4, equivalent local minimum (TensorFlow).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 13

A two-parameter loss contour map shows descent through successive levels toward a minimizer.

- **Kinds.** `coordinate-plot`
- **Elements.** Several nested equal-loss contours, both weight axes, and a directed path whose sampled iterates decrease in loss.
- **Sequence.** Gradient descent · 5, move to two parameters (PyTorch).
- **Phase 02.** [02](../briefs/02-linear-regression.md)
- **Existing reference.** `gradient-descent-contours`

## Figure 14

The weight trajectory can bend as one coordinate approaches its optimal value faster than the other.

- **Kinds.** `coordinate-plot`
- **Elements.** Contours of an anisotropic quadratic, marked start and target, and progressively shorter directed updates.
- **Sequence.** Gradient descent · 5, equivalent contour example (MXNet).
- **Phase 02.** [02](../briefs/02-linear-regression.md)
- **Existing reference.** `gradient-descent-contours`

## Figure 15

In a contour plot each marker is a pair of weight values rather than a loss-height value.

- **Kinds.** `coordinate-plot`
- **Elements.** Label both coordinates and several contour levels so the route toward lower loss can be read without a vertical loss axis.
- **Sequence.** Gradient descent · 5, equivalent contour example (TensorFlow).
- **Phase 02.** [02](../briefs/02-linear-regression.md)
- **Existing reference.** `gradient-descent-contours`

## Figure 16

A curvature-aware Newton update can rapidly approach the minimum on a smooth convex objective.

- **Kinds.** `coordinate-plot`
- **Elements.** Convex loss, initial weight, ordered updates and a brief distinction between slope and curvature.
- **Sequence.** Gradient descent · 6, Newton's method on a convex function (PyTorch).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 17

Newton's method divides the slope by local curvature to choose an update size.

- **Kinds.** `coordinate-plot`
- **Elements.** Mark two successive points on a convex curve and keep the objective curve separate from the update segments.
- **Sequence.** Gradient descent · 6, equivalent convex Newton run (MXNet).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 18

On the convex example, large early Newton updates give way to smaller corrections close to the minimizer.

- **Kinds.** `coordinate-plot`
- **Elements.** A curved convex objective and enough numbered weight positions to compare early and late update distances.
- **Sequence.** Gradient descent · 6, equivalent convex Newton run (TensorFlow).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 19

Newton's method can move uphill when a nonconvex objective has negative local curvature.

- **Kinds.** `coordinate-plot`
- **Elements.** A multi-valley loss and an ordered path with one uphill step, labelled where curvature reverses the direction.
- **Sequence.** Gradient descent · 7, nonconvex Newton failure (PyTorch).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 20

Local curvature does not always supply a safe descent direction for a nonconvex objective.

- **Kinds.** `coordinate-plot`
- **Elements.** Identify one concave region and a subsequent increased-loss iterate using unsmoothed step links.
- **Sequence.** Gradient descent · 7, equivalent nonconvex failure (MXNet).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 21

A curvature-scaled method may leave the nearby valley rather than refine its solution on a nonconvex loss.

- **Kinds.** `coordinate-plot`
- **Elements.** Mark the start, uphill jump and distant iterate on the same loss curve; distinguish local versus global claims.
- **Sequence.** Gradient descent · 7, equivalent nonconvex failure (TensorFlow).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 22

Damping the Newton update can keep the same initial position from taking a destructive jump.

- **Kinds.** `coordinate-plot`
- **Elements.** Reuse the same nonconvex objective and initial point; compare the damped trajectory and earlier undamped outcome.
- **Sequence.** Gradient descent · 8, damped Newton example (PyTorch).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 23

Multiplying the Newton step by a smaller rate can let this run settle into a nearby valley.

- **Kinds.** `coordinate-plot`
- **Elements.** A visibly shorter first move, a minimum the path approaches and a note that the outcome is conditional on this start.
- **Sequence.** Gradient descent · 8, equivalent damped Newton example (MXNet).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)

## Figure 24

Damping changes the distance between Newton iterates without changing the loss curve itself.

- **Kinds.** `coordinate-plot`
- **Elements.** Fixed nonconvex curve, a common starting point and clearly ordered points for the smaller-rate run.
- **Sequence.** Gradient descent · 8, equivalent damped Newton example (TensorFlow).
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [12](../briefs/12-hyperparameter-tuning.md)
