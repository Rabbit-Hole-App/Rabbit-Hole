# Logistic Regression

**Worked example.** The shared hours dataset supplies the fitted lines, model pipeline and gradient arithmetic. The separately supplied probability dataset supplies the confusion matrix and threshold comparison. Curve samples follow their formulas. The distant student, boundary clusters, softmax scores and class imbalance are illustrative configurations defined by the same data module, not additional training rows.

| Hours | Pass |
| ---: | ---: |
| 1 | 0 |
| 2 | 0 |
| 3 | 0 |
| 4 | 0 |
| 5 | 1 |
| 6 | 1 |
| 7 | 1 |
| 8 | 1 |
| 9 | 1 |
| 10 | 1 |

| Predicted probability | Actual label |
| ---: | ---: |
| 0.9 | 1 |
| 0.8 | 1 |
| 0.65 | 1 |
| 0.55 | 0 |
| 0.45 | 1 |
| 0.35 | 0 |
| 0.2 | 0 |
| 0.1 | 0 |

[Audited curriculum lesson](https://raw.githubusercontent.com/rohitg00/ai-engineering-from-scratch/e7db050e64bde3be17a9381476f748da26d85692/phases/02-ml-fundamentals/03-logistic-regression/docs/en.md) · [Shared data and calculations](../../../../../../packages/web/src/tutor-diagrams/topic-logistic-regression-data.js) · [Topic references](../../../../../../packages/web/src/tutor-diagrams/topic-logistic-regression-references.js) · [Replay cases](../../../../../../packages/web/src/tutor-diagrams/topic-logistic-regression-replay-cases.json)

All numerical examples come from the shared module and its computations. Rounded display values are kept separate from the unrounded arithmetic. Illustrative captions use the library's “Illustrative values” convention. Every visual, at every depth and including any separate detail visual, must fit the budget of 300 compact cl100k tokens.

## Linear predictions escape the probability band

A least-squares line minimizes squared residuals without constraining its output to probabilities. On the supplied hours data it leaves the band between the binary labels at both ends.

- **Brief** — Isolates the escape from the allowed probability band.
- **Balanced** — Shows the hours observations, fitted line and reference levels on a coordinate plot.
- **Detailed** — Adds the fitted-line arithmetic and identifies where the line leaves the band.

Compute the slope from centered cross-products divided by centered squared hours, then compute the intercept from the means. Do not extrapolate using a rounded display coefficient.

## A distant student changes the whole fit

The illustrative distant student has high leverage because their hours are far from the original mean. Refitting changes both the slope and intercept, so predictions change for the original students too.

- **Brief** — Contrasts the fit before and after the distant observation.
- **Balanced** — Overlays the original and augmented fits on the same hours axes.
- **Detailed** — Connects the refitted coefficients to the changed probability cutoff.

Both fits are recomputed from their observations. The displayed line endpoints are clipped to the plotting domain rather than displaying out-of-bounds predictions.

## Sigmoid shape and midpoint

The sigmoid maps a linear score to a bounded probability. Its center is the score where the exponential term equals the formula's unit constant.

- **Brief** — Emphasizes the bounded mapping and midpoint.
- **Balanced** — Shows the sigmoid curve with its limiting probability levels and midpoint guides.
- **Detailed** — Evaluates $σ(z)=1/(1+e^{-z})$ at the midpoint.

The shared module samples the curve by evaluating the formula; it does not store rounded probabilities as independent observations. The shipped general reference remains outside this topic's editable artifacts.

## Why the derivative peaks in the middle

The product $σ(z)(1-σ(z))$ is largest when its factors are equal. Toward either tail, one factor approaches zero, so the derivative flattens.

- **Brief** — Focuses on the steep middle and flat tails.
- **Balanced** — Overlays sigmoid and derivative curves on score axes.
- **Detailed** — Adds the derivative formula and the arithmetic of its maximum.

Every derivative sample is recomputed from the corresponding sigmoid probability.

## From input to class

The model first computes a score, converts that score to a probability, then applies a decision threshold. A probability and a predicted class are different outputs.

- **Brief** — Keeps only the essential input-to-class chain.
- **Balanced** — Separates the linear score, sigmoid and threshold branches in a flow.
- **Detailed** — Substitutes the shared example inputs into the score and probability calculations.

Equality belongs to the positive branch: the decision rule is $p≥t$. Flow role words belong in role fields rather than card labels.

## Cross-entropy penalizes confident mistakes

For a positive actual label the loss is $-\log(p)$; for a negative actual label it is $-\log(1-p)$. Moving probability toward the wrong endpoint makes the relevant logarithm diverge.

- **Brief** — Distinguishes a confident correct prediction from a confident mistake.
- **Balanced** — Compares both true-label loss curves against predicted probability.
- **Detailed** — Adds the logarithmic formulas and evaluated arithmetic.

The curve samples stay inside the open probability interval, so no infinite value is sent to the renderer.

## Gradient descent repeats the training cycle

A forward pass produces probabilities, loss measures their disagreement with labels, gradients summarize the parameter sensitivities, and an update changes the parameters before the next pass.

- **Brief** — Shows the recurring training stages.
- **Balanced** — Names the forward, loss, gradient and update operations in a cycle.
- **Detailed** — Adds $dw=Σ_i(p_i-y_i)x_i/n$ and $db=Σ_i(p_i-y_i)/n$, with the shared initial update.

The module recomputes every initial probability, error term, gradient sum and updated loss. Repetition stops when the convergence criterion is met; a cycle is not represented as an invalid cyclic flow.

## A linear boundary between clusters

The illustrative boundary satisfies $w_1x_1+w_2x_2+b=0$. Points on opposite sides have scores with opposite signs, and the sigmoid preserves that ordering.

- **Brief** — Identifies the two sides of the separator.
- **Balanced** — Shows the illustrative clusters and straight boundary in feature coordinates.
- **Detailed** — Substitutes the marked sample points into the score equation and applies the threshold rule.

The plotted endpoints satisfy the boundary equation. The clusters are illustrative geometry derived by the module, not extra rows silently added to the hours dataset.

## Softmax normalizes class scores

`ml-logistic-regression-softmax` · `bar-chart`

- **Brief** — Shows only the normalized class probabilities. [Preview](../illustrations/ml-logistic-regression-softmax-brief/408.svg)
- **Balanced** — Groups raw scores and probabilities by class. [Preview](../illustrations/ml-logistic-regression-softmax/408.svg)
- **Detailed** — Adds normalization arithmetic in the caption. [Preview](../illustrations/ml-logistic-regression-softmax-detailed/408.svg)

The illustrative scores are $(2,1,0)$. Softmax computes $p_k=e^{z_k}/Σ_j e^{z_j}$. The rounded denominator is $11.107$, and the displayed probabilities are approximately $(0.665,0.245,0.090)$. The unrounded distribution sums to $1$. Class $0$ has both the largest score and largest probability. The grouped chart labels the raw-score and probability series separately; neither series is a case count.

## High accuracy can hide complete positive-class failure

`ml-logistic-regression-accuracy-trap` · `bar-chart`

- **Brief** — Shows the illustrative negative and positive class counts. [Preview](../illustrations/ml-logistic-regression-accuracy-trap-brief/408.svg)
- **Balanced** — Groups correct and wrong predictions by actual class. [Preview](../illustrations/ml-logistic-regression-accuracy-trap/408.svg)
- **Detailed** — Adds the accuracy and recall denominators. [Preview](../illustrations/ml-logistic-regression-accuracy-trap-detailed/408.svg)

The illustrative population contains $95$ negatives and $5$ positives. Always predicting negative gives $TN=95$, $FN=5$, and no predicted positives. Accuracy is $(95+0)/100=0.95$, or 95%. Positive recall is $0/5=0$, or 0%. High accuracy here does not demonstrate that the model detects the minority class.

## Build the actual-by-predicted confusion matrix

`ml-logistic-regression-confusion-matrix` · `matrix`

- **Brief** — Shows only the confusion cells. [Preview](../illustrations/ml-logistic-regression-confusion-matrix-brief/408.svg)
- **Balanced** — Adds actual-class totals and identifies the fixed threshold. [Preview](../illustrations/ml-logistic-regression-confusion-matrix/408.svg)
- **Detailed** — Adds precision, recall and F-score arithmetic. [Preview](../illustrations/ml-logistic-regression-confusion-matrix-detailed/408.svg)

Threshold the supplied probabilities with $p≥0.5$. Actual positives give $TP=3$ and $FN=1$; actual negatives give $FP=1$ and $TN=3$. Rows represent actual labels and columns represent predicted labels. Precision uses predicted positives: $3/4=0.75$. Recall uses actual positives: $3/4=0.75$. Their harmonic mean, $F_1=2PR/(P+R)$, is also $0.75$.

## Change the threshold without changing the cases

`ml-logistic-regression-threshold-tradeoff` · `matrix` at Brief; `coordinate-plot` at Balanced and Detailed

- **Brief** — Compares precision and recall at the endpoint thresholds. [Preview](../illustrations/ml-logistic-regression-threshold-tradeoff-brief/408.svg)
- **Balanced** — Plots both metrics at every supplied threshold and marks their equality. [Preview](../illustrations/ml-logistic-regression-threshold-tradeoff/408.svg)
- **Detailed** — Adds the changing metric numerators and denominators. [Preview](../illustrations/ml-logistic-regression-threshold-tradeoff-detailed/408.svg)

At $t=0.3$, precision is $4/6≈0.667$ and recall is $4/4=1$. At $t=0.5$, both are $3/4=0.75$. At $t=0.7$, precision is $2/2=1$ while recall is $2/4=0.5$. Raising the cutoff removes positive predictions: false alarms disappear, but some actual positives are missed. The connected segments summarize the sampled cutoffs; empirical metrics change only when the threshold crosses a prediction probability.

## Verification and routing

The topic retains curriculum lesson metadata and per-prompt origin metadata. Each question has a single topic reference with short learner keywords and distinct replay paraphrases. Replay selection must be checked at every depth against the intended first reference using the planner's supported kinds.

The tests independently recompute scores, normalization, class counts, confusion cells, threshold decisions and metric ratios. They also audit every displayed batch number against both independently recomputed results and the exported derived values. Brief has fewer rendered elements than Balanced, and Detailed adds formulas or arithmetic rather than merely lengthening labels.
