# Linear Regression

**Worked example.** The shared dataset supplies the line, residuals, cost profile, gradient steps, explained variance, ridge solutions and held-out fit. The scaling geometry and the new extrapolation target are explicitly illustrative. They are not additional observed training rows.

| Row | Input feature | Target |
| --- | ---: | ---: |
| A | 1 | 2 |
| B | 2 | 4 |
| C | 3 | 5 |
| D | 4 | 4 |
| E | 5 | 5 |

[Audited curriculum lesson](https://raw.githubusercontent.com/rohitg00/ai-engineering-from-scratch/e7db050e64bde3be17a9381476f748da26d85692/phases/02-ml-fundamentals/02-linear-regression/docs/en.md) · [Shared data and calculations](../../../../../../packages/web/src/tutor-diagrams/topic-linear-regression-data.js) · [Reference module](../../../../../../packages/web/src/tutor-diagrams/topic-linear-regression-references.js) · [Replay cases](../../../../../../packages/web/src/tutor-diagrams/topic-linear-regression-replay-cases.json)

Every visual, including each separate detail visual, must stay within 300 compact cl100k tokens. Brief removes visible elements; Balanced carries the mechanism; Detailed adds arithmetic or a formula. Prompt origin and curriculum revision remain attached to the references.

## Slope and intercept

**Prompt:** what do the slope w and the intercept b mean on the line y = wx + b through the toy points?

`coordinate-plot`

- **Brief** — Read the direction of the fitted line with a reduced visual treatment.
- **Balanced** — Connect the training scatter to the intercept and rise over run.
- **Detailed** — Evaluate the fitted equation and the slope construction numerically.

The feature mean is $3$, and the target mean is $4$. Centered cross-products sum to $6$ and centered feature squares sum to $10$. Thus $w=6/10=0.6$ and $b=4-0.6(3)=2.2$. The intercept is the line's prediction at zero input, not an observed row. From input $3$ to input $4$, the prediction rises from $4$ to $4.6$: rise $0.6$ over run $1$.

## Residuals become a cost

**Prompt:** how does mean squared error turn five residuals into one cost number?

`coordinate-plot`

- **Brief** — Read residuals as gaps between observations and the fitted line.
- **Balanced** — Connect the individual gaps to their squared contributions.
- **Detailed** — Sum the squared errors and divide by the row count.

Predictions are $2.8,3.4,4,4.6,5.2$. Using actual minus predicted gives residuals $-0.8,0.6,1,-0.6,-0.2$. Their squares are $0.64,0.36,1,0.36,0.04$. The sum is $2.4$, so $MSE=2.4/5=0.48$. Reversing every residual's sign leaves the squared cost unchanged. Squared target dimensions belong inside math delimiters, as $y^2$.

## The cost bowl

**Prompt:** why is the mse cost surface a bowl and where is its bottom for the toy data?

`coordinate-plot`

- **Brief** — Identify a lowest cost rather than following every sampled value.
- **Balanced** — Read the convex profile and its minimum.
- **Detailed** — Connect the profile to the quadratic formula and curvature.

At each weight, choose the best intercept $b=4-3w$. This produces the profile $MSE(w)=(10w^2-12w+6)/5$, not an arbitrary fixed-intercept slice. Weights $0,0.3,0.6,0.9,1.2$ give costs $1.2,0.66,0.48,0.66,1.2$. The curvature is $4$, so the profile is strictly convex and its minimum is at $w=0.6$. Joint fitting also gives $b=2.2$.

## The repeated training loop

**Prompt:** what loop does gradient descent repeat until the cost is low enough?

`cycle`

- **Brief** — Read the repeating prediction-and-update idea.
- **Balanced** — Separate prediction, cost, gradient, update and stopping check.
- **Detailed** — Connect the update to the gradient formulas.

Predict with $ŷ=wx+b$, compute mean squared error, differentiate it, update the parameters and check the stopping rule. If training continues, recompute predictions using the updated parameters. A low-enough cost is a stopping criterion, not proof that the exact optimum was reached. The analytical solution supplies the optimum for comparison in this toy example.

## The first gradient step

**Prompt:** how far does the first gradient descent step move w from zero on the toy data?

`coordinate-plot`

- **Brief** — Show the direction of the parameter update.
- **Balanced** — Locate the initial and updated weights relative to the optimum.
- **Detailed** — Recompute the gradient, learning-rate multiplication and intercept update.

With both parameters initially zero, prediction minus actual gives errors $-2,-4,-5,-4,-5$. The weighted error sum is $-66$. Therefore $dw=(2/5)(-66)=-26.4$, while $db=-8$. At learning rate $0.01$, the simultaneous updates are $w=0.264$ and $b=0.08$. The weight step is positive because it subtracts a negative gradient. The fitted optimum is $w=0.6$.

## Learning rate and overshoot

**Prompt:** why does a learning rate of 0.1 push the cost up while 0.01 brings it down after one step?

`coordinate-plot`

- **Brief** — Contrast the directions of the cost changes.
- **Balanced** — Compare traces from the same initialization.
- **Detailed** — Tie each trace to the updated parameters and recomputed loss.

The initial cost is $17.2$. Learning rate $0.01$ gives $w=0.264$, $b=0.08$ and cost $10.490176$. Learning rate $0.1$ gives $w=2.64$, $b=0.8$ and cost $31.0816$. Both runs update both parameters. Overshooting the optimal weight is a useful marker here, but the cost change must be checked using the complete updated model. A single rising step does not, by itself, establish every later step of a divergent trajectory.

## Closed form or iterative fitting

**Prompt:** when should you use the normal equation instead of gradient descent?

`comparison`

- **Brief** — Contrast a direct solve with repeated updates.
- **Balanced** — Relate the practical tradeoff to the same toy fit.
- **Detailed** — Show the centered-sum calculation beside the gradient update.

The scalar closed-form solution is $w=6/10=0.6$, followed by $b=4-0.6(3)=2.2$. The gradient method instead reaches $w=0.264$ after its first small-rate update and generally needs more iterations. A direct solve is attractive for a manageable feature dimension. Iterative optimization is useful when repeated passes or minibatches are more practical than a dense solve. In implementations, solving a linear system or using a stable factorization is preferable to explicitly forming an inverse. Dense cubic feature-dimension cost is a complexity statement, not an observed toy runtime.

## Feature scaling

**Prompt:** why does gradient descent struggle when one feature spans 0 to 1 and another 0 to 1,000,000?

`coordinate-plot`

- **Brief** — Connect unequal feature scales to uneven parameter sensitivity.
- **Balanced** — Contrast elongated illustrative contours and zigzag motion with the scaled geometry.
- **Detailed** — Add the standardization formula and the arithmetic behind the schematic paths.

Illustrative geometry explains the mechanism; the shared data has only its original input feature. A normalized copy spans $0$ to $1$, and a rescaled copy spans $0$ to $1000000$. Their means are $0.5$ and $500000$. Standardization uses $z=(x-μ)/σ$. The standardized values have mean zero and mean square one. The plotted contour curvature and descent paths are deterministic illustrative constructions, not a measured condition number or a fitted extra feature of the original regression. Scaling reduces unequal sensitivity; it does not guarantee circular contours when features remain correlated.

## Interpolation and overfitting

**Prompt:** how can a high-degree polynomial pass through every toy point and still predict badly?

`ml-linear-regression-polynomial-overfit` · `coordinate-plot`

- **Brief** — Show every training observation, the half-step polynomial samples and the illustrative external target; omit the straight-line comparison.
- **Balanced** — Add the straight fit for comparison against the same training observations and external target.
- **Detailed** — Add a grouped error chart separating training mean error from the external point's squared error.

The degree-$4$ interpolant passes through every training point and has training $MSE=0$. The straight line has training $MSE=0.48$. At input $6$, the polynomial predicts $17$ and the line predicts $5.8$. An illustrative new target is $6$, obtained by rounding the line's prediction; it is not an observed validation row. Polynomial squared error is $(17-6)^2=121$, while line squared error is $(5.8-6)^2=0.04$. This constructed case demonstrates why interpolation does not guarantee extrapolation, not that a linear model must always generalize better.

[Brief preview](../illustrations/ml-linear-regression-polynomial-overfit-brief/408.svg) · [Balanced preview](../illustrations/ml-linear-regression-polynomial-overfit/408.svg) · [Detailed preview](../illustrations/ml-linear-regression-polynomial-overfit-detailed/408.svg)

## Explained variance against the mean

**Prompt:** what does an r-squared of 0.6 say about the toy fit compared with predicting the mean?

`ml-linear-regression-r-squared` · `bar-chart`

- **Brief** — Compare mean-baseline and residual squared-error totals.
- **Balanced** — Add the explained reduction and identify the fitted coefficient of determination.
- **Detailed** — Show the ratio arithmetic and add a squared-error bar chart with the toy fit between the mean-baseline and perfect-fit reference cases.

Predicting the target mean $4$ gives squared deviations $4,0,1,0,1$, totaling $SS_{tot}=6$. The fitted line leaves $SS_{res}=2.4$. Thus $R^2=1-2.4/6=0.6$ and the explained reduction is $6-2.4=3.6$. This is a fraction of baseline squared error removed, not a fraction of predictions that are correct. A perfect fit has squared residual sum zero and $R^2=1$; the mean baseline has squared residual sum $6$ and $R^2=0$. The unsquared residuals around the mean sum to zero; they are not the error total in the bars or reference cases. A model worse than that baseline can have negative $R^2$.

[Brief preview](../illustrations/ml-linear-regression-r-squared-brief/408.svg) · [Balanced preview](../illustrations/ml-linear-regression-r-squared/408.svg) · [Detailed preview](../illustrations/ml-linear-regression-r-squared-detailed/408.svg)

## Ridge shrinkage

**Prompt:** how does the ridge penalty lambda shrink the toy weight toward zero?

`ml-linear-regression-ridge-shrinkage` · `coordinate-plot`

- **Brief** — Show every sampled penalty solution and the zero-weight limit without individual weight labels.
- **Balanced** — Add fitted weight labels and a marker identifying the unpenalized solution.
- **Detailed** — Add the objective and the exact weight and intercept formulas.

Use $MSE+λw^2$ with an unpenalized intercept. Feature variance is $2$ and feature-target covariance is $1.2$, so $w=1.2/(2+λ)$ and $b=4-3w$. Penalties $0,1,2,4$ give weights $0.6,0.4,0.3,0.2$. The plotted segments connect sampled exact solutions; the formula describes the continuous relationship. The weight approaches zero as the penalty grows. This normalization matters: using a summed rather than mean squared-error objective would change the penalty's numerical scale.

[Brief preview](../illustrations/ml-linear-regression-ridge-shrinkage-brief/408.svg) · [Balanced preview](../illustrations/ml-linear-regression-ridge-shrinkage/408.svg) · [Detailed preview](../illustrations/ml-linear-regression-ridge-shrinkage-detailed/408.svg)

## A row held out before fitting

**Prompt:** what happens when one toy row is held out as a test point before fitting?

`ml-linear-regression-held-out-row` · `sample-set`

- **Brief** — Show every source row, group all training rows together and identify the omitted test row; retain both membership counts in the group label.
- **Balanced** — Give the test row its own explicit group beside the complete training group.
- **Detailed** — Add the training-only coefficients and the test prediction's squared-error calculation.

Rows A through D are training data; row E is held out. The training feature mean is $2.5$, the target mean is $3.75$, centered cross-products sum to $3.5$ and centered feature squares sum to $5$. Fit $w=3.5/5=0.7$ and $b=3.75-0.7(2.5)=2$. On the held-out input $5$, prediction is $0.7(5)+2=5.5$, against actual target $5$. The test mean squared error is $(5.5-5)^2=0.25$. The full-data line must not be used for this test calculation. A single test row gives a concrete calculation, not a reliable generalization estimate; repeated model choices should use validation data rather than tuning against this test result.

[Brief preview](../illustrations/ml-linear-regression-held-out-row-brief/408.svg) · [Balanced preview](../illustrations/ml-linear-regression-held-out-row/408.svg) · [Detailed preview](../illustrations/ml-linear-regression-held-out-row-detailed/408.svg)
