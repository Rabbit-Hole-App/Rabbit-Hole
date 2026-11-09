# 3.1. Linear Regression figure briefs

7 figure occurrences in document order. [Source page](https://d2l.ai/chapter_linear-regression/linear-regression.html) · [Inventory](manifest.json)

## Figure 01

A fitted line makes a prediction at each observed input, and the vertical residuals show what squared error measures.

- **Kinds.** `coordinate-plot`
- **Elements.** A small set of observed input-output pairs, one fitted line, one residual segment per observation, and one highlighted squared-error contribution.
- **Sequence.** Linear regression · 1, from prediction to residual.
- **Phase 02.** [02](../briefs/02-linear-regression.md) · [09](../briefs/09-model-evaluation.md)
- **Existing reference.** `regression-residuals` · `ml-regression-error-metrics`

## Figure 02

A Gaussian's location moves with its mean, while a larger spread makes the density wider and lower.

- **Kinds.** `coordinate-plot`
- **Elements.** Three density curves on common axes; hold the spread fixed for a location comparison and hold the location fixed for a spread comparison.
- **Sequence.** Linear regression · 2, noise assumption behind squared error (PyTorch example).
- **Phase 02.** [02](../briefs/02-linear-regression.md)

## Figure 03

Centering the Gaussian at a different prediction shifts the curve without changing its width.

- **Kinds.** `coordinate-plot`
- **Elements.** Two equally wide densities with different centers, plus a wider density centered on one of them; mark the residual axis separately from density.
- **Sequence.** Linear regression · 2, equivalent Gaussian plot (MXNet example).
- **Phase 02.** [02](../briefs/02-linear-regression.md)

## Figure 04

Larger Gaussian variance reduces peak density while allocating more mass away from the center.

- **Kinds.** `coordinate-plot`
- **Elements.** A narrow and a broad density at the same center, and a translated curve to isolate the effect of changing location.
- **Sequence.** Linear regression · 2, equivalent Gaussian plot (JAX example).
- **Phase 02.** [02](../briefs/02-linear-regression.md)

## Figure 05

Comparing Gaussian densities shows why changing a prediction and changing the assumed noise scale have different effects.

- **Kinds.** `coordinate-plot`
- **Elements.** Original density, location-shifted density and spread-adjusted density on a common scale; label the two controlled comparisons.
- **Sequence.** Linear regression · 2, equivalent Gaussian plot (TensorFlow example).
- **Phase 02.** [02](../briefs/02-linear-regression.md)

## Figure 06

An ordinary linear predictor can be drawn as one output unit with a connection from each input feature.

- **Kinds.** `relationship` · `flow`
- **Elements.** Several feature values, separate learned weights, an additive bias and one scalar output that sums the weighted inputs.
- **Sequence.** Linear regression · 3, reinterpret the model as a network.
- **Phase 02.** [01](../briefs/01-what-is-machine-learning.md) · [02](../briefs/02-linear-regression.md)

## Figure 07

A biological neuron is the analogy for receiving and combining signals before passing a result onward.

- **Kinds.** `flow`
- **Elements.** Signal collection, integration and transmission, with a short separation between the biological analogy and the mathematical unit.
- **Sequence.** Linear regression · 4, optional analogy after the single output unit.
- **Phase 02.** [01](../briefs/01-what-is-machine-learning.md)
