# Linear Regression

**Worked example.** The shared toy module supplies every numeric value in the figures. It contains one input feature and the following observations; the final observation is reserved only in the train/test example.

| Row | Input x | Target y |
| --- | ---: | ---: |
| A | 1 | 2 |
| B | 2 | 4 |
| C | 3 | 5 |
| D | 4 | 4 |
| E | 5 | 5 |

[Audited curriculum lesson](https://raw.githubusercontent.com/rohitg00/ai-engineering-from-scratch/e7db050e64bde3be17a9381476f748da26d85692/phases/02-ml-fundamentals/02-linear-regression/docs/en.md) · [Shared data and calculations](../../../../../../packages/web/src/tutor-diagrams/topic-linear-regression-data.js) · [Topic references](../../../../../../packages/web/src/tutor-diagrams/topic-linear-regression-references.js) · [Replay cases](../../../../../../packages/web/src/tutor-diagrams/topic-linear-regression-replay-cases.json) · [Compact token budgets](../../../../../../packages/web/src/tutor-diagrams/topic-linear-regression-token-budgets.json)

Every visual, including every depth and separate detail visual, has a compact cl100k budget of at most 300 tokens. Brief uses fewer rendered elements than Balanced. Detailed adds arithmetic or a formula. References retain the curriculum lesson metadata and each prompt's lesson origin. The polynomial's new target and the feature-scaling geometry are explicitly illustrative; they are not additional measured observations.

## Slope and intercept

> what do the slope w and the intercept b mean on the line y = wx + b through the toy points?

`ml-linear-regression-slope-intercept`

- **Brief** — Establishes the distinction between the starting height and the change with input.
- **Balanced** — Relates the fitted line to the observations, the intercept and the rise/run construction.
- **Detailed** — Adds the fitting arithmetic behind the coefficients.

The means are $\bar x=3$ and $\bar y=4$. Centered cross-products sum to $6$ and centered input squares sum to $10$, so $w=6/10=0.6$ and $b=4-0.6\times3=2.2$. Thus $\hat y=0.6x+2.2$. The intercept is the prediction at $x=0$, not necessarily an observed target. From $x=3$ to $x=4$, the prediction rises from $4$ to $4.6$: a rise of $0.6$ for a run of $1$.

## Residuals become a cost

> how does mean squared error turn five residuals into one cost number?

`ml-linear-regression-residual-mse`

- **Brief** — Connects prediction gaps to a single average squared error.
- **Balanced** — Keeps the observation-level errors attached to their inputs.
- **Detailed** — Squares, sums and divides using the shared toy values.

Predictions are $2.8,3.4,4,4.6,5.2$. With residual defined as observed minus predicted, the residuals are $-0.8,0.6,1,-0.6,-0.2$. Their squares are $0.64,0.36,1,0.36,0.04$. Therefore $SSE=2.4$ and $MSE=2.4/5=0.48$. Squaring prevents opposite-signed gaps from cancelling.

## The bottom of the bowl

> why is the mse cost surface a bowl and where is its bottom for the toy data?

`ml-linear-regression-cost-bowl`

- **Brief** — Identifies the low-cost region.
- **Balanced** — Shows the quadratic profile through the best-fit slope.
- **Detailed** — Connects its curvature and minimum to the centered sums.

For each slope, choose $b=\bar y-w\bar x$. The profiled cost is $MSE(w)=(10w^2-12w+6)/5$. At slopes $0,0.3,0.6,0.9,1.2$, its costs are $1.2,0.66,0.48,0.66,1.2$. The positive quadratic coefficient gives a bowl; the second derivative is $4$. The minimum is $w=0.6$, with $b=2.2$. This profile re-optimizes the intercept rather than keeping it fixed.

## The repeated training loop

> what loop does gradient descent repeat until the cost is low enough?

**Kind:** `cycle`

- **Brief** — Keeps the repeated prediction/update idea visible.
- **Balanced** — Separates predictions, cost, gradients, updates and stopping checks.
- **Detailed** — Adds the gradient and parameter-update formulas.

Predict with $\hat y=wx+b$, evaluate MSE, differentiate it, update the parameters and check a stopping criterion. Otherwise repeat. With error $e=\hat y-y$, the gradients are $\partial MSE/\partial w=(2/n)\sum xe$ and $\partial MSE/\partial b=(2/n)\sum e$. Simultaneously update $w\leftarrow w-\alpha\partial MSE/\partial w$ and $b\leftarrow b-\alpha\partial MSE/\partial b$. A stopping check does not itself prove the parameters are exactly optimal.

## The first gradient step

> how far does the first gradient descent step move w from zero on the toy data?

- **Brief** — Establishes the direction of the update.
- **Balanced** — Locates the first updated weight relative to the fitted optimum.
- **Detailed** — Recomputes the gradient and simultaneous intercept update.

Starting at $w=b=0$, prediction-minus-target errors are $-2,-4,-5,-4,-5$. Their input-weighted sum is $-66$, giving $dw=(2/5)(-66)=-26.4$. Their sum is $-20$, giving $db=-8$. With $\alpha=0.01$, the new parameters are $w=0.264$ and $b=0.08$. The slope moves toward the fitted value $0.6$, but the intercept changes too.

## Learning rate and overshoot

> why does a learning rate of 0.1 push the cost up while 0.01 brings it down after one step?

- **Brief** — Contrasts a cost decrease with a cost increase from the same start.
- **Balanced** — Compares the short cost traces on shared axes.
- **Detailed** — Uses the resulting parameters to recompute both costs.

The initial cost is $17.2$. The smaller rate produces $(w,b)=(0.264,0.08)$ and $MSE=10.490176$. The larger rate produces $(w,b)=(2.64,0.8)$ and $MSE=31.0816$. The larger slope update crosses beyond the optimum slope. These are simultaneous updates from the same initial parameters, not independent experiments with fixed intercepts.

## Closed form or iteration

> when should you use the normal equation instead of gradient descent?

**Kind:** `comparison`

- **Brief** — Contrasts direct solving with repeated updates.
- **Balanced** — Relates both approaches to the same toy fit.
- **Detailed** — Adds centered-sum arithmetic and computational tradeoffs.

The direct solution gives $w=6/10=0.6$ and $b=4-0.6\times3=2.2$. Gradient descent instead reaches $w=0.264$ after its first small-rate update and continues iterating. Direct solving is attractive when the feature dimension and memory needs are modest. Iterative optimization scales more naturally to large problems. The familiar $O(p^3)$ dense inversion cost concerns feature dimension; practical implementations generally solve a linear system rather than explicitly forming an inverse.

## Feature scaling

> why does gradient descent struggle when one feature spans 0 to 1 and another 0 to 1,000,000?

- **Brief** — Connects unequal feature scales to uneven parameter sensitivity.
- **Balanced** — Contrasts elongated and rounder illustrative contours.
- **Detailed** — Adds standardization and the update mechanism.

The data module synthesizes the scaling example from the same toy inputs and residuals. Its feature ranges are $[0,1]$ and $[0,1000000]$. Standardization uses $z=(x-\mu)/\sigma$, with population means and standard deviations recomputed from those synthesized rows. **Illustrative geometry:** the contour shapes and descent paths are schematic quadratic examples, not a measured training history for an additional dataset. Unequal curvature forces a shared learning rate to accommodate the steep direction, slowing progress along the shallow direction.

## Perfect interpolation can extrapolate badly

> how can a high-degree polynomial pass through every toy point and still predict badly?

`ml-linear-regression-polynomial-overfit` · `comparison` at Brief; `coordinate-plot` at Balanced and Detailed

- **Brief** — Contrasts a straight fit with an interpolant using fewer visible elements.
- **Balanced** — Overlays the observations, fitted line, sampled polynomial and illustrative new target.
- **Detailed** — Adds training MSE and a separate squared-error comparison for the new target.

The degree-$4$ interpolating polynomial has training $MSE=0$. The straight line has training $MSE=0.48$. **Illustrative new target:** choose $x=6$ and $y=5.8$, exactly on the extrapolated line. The polynomial predicts $17$, so its squared error is $(17-5.8)^2=125.44$, while the line's error is $0$. The target is deliberately constructed to illustrate the risk, not evidence that a line always generalizes better. Polynomial samples are exact evaluations; line segments between samples are a rendering approximation.

[Brief preview](../illustrations/ml-linear-regression-polynomial-overfit-brief/408.svg) · [Balanced preview](../illustrations/ml-linear-regression-polynomial-overfit/408.svg) · [Detailed preview](../illustrations/ml-linear-regression-polynomial-overfit-detailed/408.svg)

## R-squared against the mean baseline

> what does an r-squared of 0.6 say about the toy fit compared with predicting the mean?

`ml-linear-regression-r-squared` · `bar-chart` at every depth

- **Brief** — Compares the total and residual squared-error bars.
- **Balanced** — Adds the removed-error bar and interprets the explained fraction.
- **Detailed** — Gives the ratio arithmetic and the perfect-fit and mean-baseline benchmarks.

Predicting the mean $4$ gives $SS_{tot}=6$. The fitted line leaves $SS_{res}=2.4$, removing $3.6$. Therefore $R^2=1-2.4/6=0.6$: the line removes that fraction of the baseline squared error on these same observations. This is not a classification accuracy or a guarantee of future performance. A perfect fit has $R^2=1$; matching the mean baseline has $R^2=0$.

[Brief preview](../illustrations/ml-linear-regression-r-squared-brief/408.svg) · [Balanced preview](../illustrations/ml-linear-regression-r-squared/408.svg) · [Detailed preview](../illustrations/ml-linear-regression-r-squared-detailed/408.svg)

## Ridge shrinkage

> how does the ridge penalty lambda shrink the toy weight toward zero?

`ml-linear-regression-ridge-shrinkage` · `flow` at Brief; `coordinate-plot` at Balanced and Detailed

- **Brief** — Links adding a weight penalty to decreasing the fitted weight.
- **Balanced** — Shows the exact sampled solutions and the zero asymptote.
- **Detailed** — Adds the shrinkage formula and a worked penalty value.

For objective $MSE+\lambda w^2$ with unpenalized intercept, $w=(S_{xy}/n)/(S_{xx}/n+\lambda)=1.2/(2+\lambda)$. Penalties $0,1,2,4$ give weights $0.6,0.4,0.3,0.2$. The intercept adjusts as $b=\bar y-w\bar x$. This objective uses MSE rather than unnormalized SSE, so its penalty convention matters. For finite nonnegative penalties the positive weight approaches, rather than abruptly reaches, the zero asymptote.

[Brief preview](../illustrations/ml-linear-regression-ridge-shrinkage-brief/408.svg) · [Balanced preview](../illustrations/ml-linear-regression-ridge-shrinkage/408.svg) · [Detailed preview](../illustrations/ml-linear-regression-ridge-shrinkage-detailed/408.svg)

## Hold out before fitting

> what happens when one toy row is held out as a test point before fitting?

`ml-linear-regression-held-out-row` · `sample-set` at every depth

- **Brief** — Shows selected training rows and the reserved test row.
- **Balanced** — Shows every observation in its disjoint training or test group and states the held-out prediction.
- **Detailed** — Adds training-only fitting arithmetic and test MSE.

Fit A through D only. Their means are $\bar x=2.5$ and $\bar y=3.75$, with centered sums $S_{xy}=3.5$ and $S_{xx}=5$. Thus $w=3.5/5=0.7$ and $b=3.75-0.7\times2.5=2$. Reserved row E has $x=5$, so its prediction is $0.7\times5+2=5.5$, against actual target $5$. The squared error and test MSE are both $(5-5.5)^2=0.25$ because the test group contains a single observation. That observation never influences the fitted coefficients; such a small test set is only a teaching example, not a stable performance estimate.

[Brief preview](../illustrations/ml-linear-regression-held-out-row-brief/408.svg) · [Balanced preview](../illustrations/ml-linear-regression-held-out-row/408.svg) · [Detailed preview](../illustrations/ml-linear-regression-held-out-row-detailed/408.svg)

## Routing and verification

Each prompt has a unique topic reference and five distinct replay paraphrases. Replay evaluation must preserve that intended first reference at Brief, Balanced and Detailed with the planner's kinds, meeting the 80% gate. The R-squared reference keeps its required bar-chart primary visual at every depth. The polynomial and ridge references use compact conceptual Brief treatments before their coordinate plots; the holdout reference keeps sample membership explicit.

The numeric tests independently recompute the fit, baseline error, polynomial evaluations, extrapolation error, ridge solutions and training-only holdout arithmetic from the shared rows. They also check displayed-number availability, verbatim prompts, learner keywords, origin metadata, disjoint holdout membership and fewer Brief elements. The shipped decision-trees lesson remains the exemplar and is not modified.
