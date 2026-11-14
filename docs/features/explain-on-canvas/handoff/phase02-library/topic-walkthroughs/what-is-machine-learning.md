# What Is Machine Learning

**Worked example.** The shared toy-data module supplies the inputs, labels and all numerical calculations. Its dataset is stated here once. Labels are hidden for the unsupervised example, used to fit class means, and checked after prediction for the training-accuracy comparison.

| Row | Feature $x_1$ | Feature $x_2$ | Class |
| --- | ---: | ---: | ---: |
| A | 0 | 2 | 0 |
| B | 2 | 2 | 0 |
| C | 1 | 1 | 0 |
| D | 1 | 3 | 0 |
| E | 4 | 5 | 1 |
| F | 6 | 5 | 1 |
| G | 5 | 4 | 1 |
| H | 5 | 6 | 1 |

[Audited curriculum lesson](https://raw.githubusercontent.com/rohitg00/ai-engineering-from-scratch/e7db050e64bde3be17a9381476f748da26d85692/phases/02-ml-fundamentals/01-what-is-machine-learning/docs/en.md) · [Shared data and calculations](../../../../../../packages/web/src/tutor-diagrams/topic-what-is-machine-learning-data.js) · [Topic references](../../../../../../packages/web/src/tutor-diagrams/topic-what-is-machine-learning-references.js) · [Replay cases](../../../../../../packages/web/src/tutor-diagrams/topic-what-is-machine-learning-replay-cases.json)

Every visual, including every depth and separate detail visual, has a budget of at most 300 compact cl100k tokens. Detailed means additional arithmetic or a formula, not simply more cards. Illustrative numerical examples are marked in their captions; they are not empirical claims about this dataset. Registry lessons and individual prompt origins remain attached to the topic references.

## Programming direction

**Prompt:** how do traditional programming and machine learning run in opposite directions?

Traditional programming applies supplied rules to data to produce outputs. Learning uses data together with expected outputs to produce a model: learned rules encoded as parameters. After training, that model is applied to new inputs.

- **Brief** — Isolates the reversal of what is supplied and what is learned.
- **Balanced** — Names the inputs, the program or learning algorithm, and the resulting output or model.
- **Detailed** — Adds the mathematical distinction between fitting parameters and applying a fitted function.

The two directions are a conceptual comparison, not a claim that learning literally inverts every program.

## Learning families

**Prompt:** what are the three types of machine learning and what tasks sit under each?

The hierarchy has supervised, unsupervised and reinforcement learning as its top-level families. Classification and regression sit under supervised learning; clustering and dimensionality reduction under unsupervised learning; policy optimization and value learning under reinforcement learning. These are representative tasks, not an exhaustive catalogue.

- **Brief** — Reads the top-level families.
- **Balanced** — Adds the task leaves.
- **Detailed** — Adds task notation or arithmetic while retaining the same hierarchy.

The data module recomputes the family, task, node and leaf counts from the taxonomy. This ordinary hierarchy does not use binary-tree side fields.

## Structure without labels

**Prompt:** what structure can unsupervised learning find in the eight toy points when the labels are hidden?

Hiding class labels leaves spatial structure in the inputs. The largest gap between distinct horizontal coordinates separates the points into groups centred at $(1,2)$ and $(5,5)$. Each group contains 4 points. This is a simple geometric grouping of the supplied inputs, not a claim that every clustering algorithm must recover the original labels.

- **Brief** — Emphasizes grouping without target labels.
- **Balanced** — Shows the input geometry without class colours.
- **Detailed** — Adds the computed grouping and mean arithmetic.

## Classification and regression

**Prompt:** how does a classification output differ from a regression output on a plot?

A classifier chooses a category and can be visualized through regions or boundaries. A regressor predicts a numerical target and can be visualized as a fitted function. Cross-entropy is a common classification loss; mean squared error is a common regression loss.

- **Brief** — Contrasts a category with a numerical target.
- **Balanced** — Connects those outputs to boundary and fitted-function geometry.
- **Detailed** — Adds loss notation or residual arithmetic from the shared calculations.

For the regression calculation the second feature serves as the numerical target. That changes the teaching task; it does not add another dataset.

## Workflow and feedback

**Prompt:** what are the stages of the ml workflow and where does it loop back?

The source workflow runs through collection, cleaning and exploration, feature engineering, splitting, training, evaluation, deployment and monitoring. An unsatisfactory evaluation returns to feature engineering. A monitored performance drop returns to collection. The illustrative cleaning-and-exploration allocation is 60–80 percent, not a measurement made from these toy rows.

- **Brief** — Shows the recurring preparation, learning and checking idea.
- **Balanced** — Expands the stages and identifies the feedback destinations.
- **Detailed** — Adds computed stage or transition counts and the feedback explanation.

The cycle renderer permits fewer steps than the full source list, so a compact figure may combine adjacent stages; the source workflow still retains all stages in the data module. Feedback must not be encoded as a cycle inside an acyclic flow diagram.

## Training, validation and test

**Prompt:** how is a dataset divided into training, validation and test sets and what is each slice for?

The illustrative proportions are 70 percent training, 15 percent validation and 15 percent test. Training fits parameters, validation guides hyperparameter choices, and the test set is reserved for the final assessment. These percentages are not an exact row allocation of the tiny worked dataset.

- **Brief** — Separates learning, tuning and final checking.
- **Balanced** — Associates the illustrative proportions with those purposes.
- **Detailed** — Adds the normalized-weight arithmetic and total percentage.

Looking repeatedly at test performance while making choices makes the test set part of development rather than an untouched final check.

## Fit quality

**Prompt:** what do underfitting, good fit and overfitting look like on the same training points?

The data module generates explicitly illustrative observations and fitted functions for this phenomenon. A straight chord misses curvature, a smooth fit follows the trend, and an oscillating interpolant reaches every training observation. A separate held-out input reveals why interpolation is not enough.

- **Brief** — Names the complexity contrast.
- **Balanced** — Compares fits against shared observations.
- **Detailed** — Adds training-error or held-out squared-error arithmetic.

The illustrative overfit has lower training error but worse held-out error than the smooth fit. A perfect training fit by itself does not prove overfitting; the generalization comparison matters.

## Bias, variance and error

**Prompt:** how do bias squared, variance and total error change as model complexity grows?

The illustrative squared-error decomposition is $E=Bias^2+Variance+Noise$. Bias squared decreases, variance increases, and irreducible noise stays fixed. In the computed illustrative samples, total errors are 4.25, 2.25 and 4.25 at increasing complexity levels, so the middle sample is the minimum.

- **Brief** — Explains the opposing trends.
- **Balanced** — Shows the components and their total across complexity.
- **Detailed** — Adds the component sum at the marked minimum.

These curves illustrate a tradeoff, not a universal measured law for every model family or training regime.

## Choosing rules or learning

**Prompt:** which questions decide whether to use rules, deterministic methods, interpretable models or ml?

`ml-what-is-machine-learning-model-choice` · `flow`

- **Brief** — Checks data and explicit rules, then points to risk and model requirements.
- **Balanced** — Adds the error-cost gate. A separate compact flow continues through explainability and label availability.
- **Detailed** — Adds expected loss $R=E[L]$ to explain that the risk gate concerns consequences as well as prediction frequency.

No data leads to collection or rules. Explicitly writable rules favour rules. Unacceptable error costs lead to considering deterministic methods rather than treating a statistical prediction as a safety guarantee. Strict explanation needs favour interpretable models. Otherwise, sufficient labels suggest supervised learning, partial labels suggest semi-supervised learning, and absent labels suggest unsupervised or self-supervised approaches.

This is an illustrative decision guide. Deterministic software still requires validation, and interpretable models can themselves be machine-learning models. The terminal cards in the first flow hand off conceptually to the second flow; neither flow contains a cycle or an invalid merge.

[Balanced preview](../illustrations/ml-what-is-machine-learning-model-choice/408.svg)

## Fitting the class means

**Prompt:** where are the class centroids for the eight toy points and how far is each point from its own centroid?

`ml-what-is-machine-learning-class-centroids` · `flow` at Brief, `coordinate-plot` at Balanced and Detailed

- **Brief** — Groups by class, computes the means and reports the own-centre distance.
- **Balanced** — Shows all training points and both means. A separate detail plot draws every point-to-mean spoke.
- **Detailed** — Labels mean coordinates and adds the sums divided by the class counts.

For class 0, the coordinate sums are 4 and 8 over 4 members, giving $(1,2)$. For class 1, both sums are 20 over 4 members, giving $(5,5)$. Every own-centre squared distance is 1, hence every spoke has length 1. The spoke polylines revisit their mean to connect each member; retracing a spoke does not represent an extra observation.

[Brief preview](../illustrations/ml-what-is-machine-learning-class-centroids-brief/408.svg) · [Balanced preview](../illustrations/ml-what-is-machine-learning-class-centroids/408.svg) · [Detailed preview](../illustrations/ml-what-is-machine-learning-class-centroids-detailed/408.svg)

## Predicting a new point

**Prompt:** how does the nearest centroid rule classify the new point (4,2) and where is the decision boundary?

`ml-what-is-machine-learning-nearest-centroid-predict` · `flow` at Brief, `coordinate-plot` at Balanced and Detailed

- **Brief** — Locates the query, compares its distances and gives the prediction.
- **Balanced** — Shows both means, the query, straight distance paths and the equal-distance bisector. A separate detail plot identifies the midpoint between means.
- **Detailed** — Adds the boundary equation, the query-side check, exact square-root distances and the centroid separation calculation.

The query's squared distances are 9 and 10, giving distances 3 and approximately 3.16. Class 0 is nearer. The centroid displacement is $(4,3)$, its length is 5, and its midpoint is $(3,3.5)$. Expanding equality of squared distances gives $4x_1+3x_2=22.5$. The query gives 22, below 22.5, on the class 0 side. The displayed boundary endpoints are computed from the axis limits rather than guessed. Lines are unsmoothed and drawn before the scatter markers so the means and query remain identifiable. The midpoint annotation leaves coordinate formatting to the renderer.

[Brief preview](../illustrations/ml-what-is-machine-learning-nearest-centroid-predict-brief/408.svg) · [Balanced preview](../illustrations/ml-what-is-machine-learning-nearest-centroid-predict/408.svg) · [Detailed preview](../illustrations/ml-what-is-machine-learning-nearest-centroid-predict-detailed/408.svg)

## Evaluating against chance

**Prompt:** how does the centroid classifier compare with random guessing on the eight toy points?

`ml-what-is-machine-learning-centroid-baseline` · `bar-chart`

- **Brief** — Compares training accuracy with expected chance accuracy using the minimal pair of bars.
- **Balanced** — Adds the correct-count denominators and clarifies that the random count is expected.
- **Detailed** — Adds the count-to-percent calculations, with percent symbols outside the mathematical spans.

Reclassifying every training row gives 8 correct out of 8, or 100 percent. Uniform random guessing across the classes has probability 0.5 of being correct on each row, so its expected count is 4 out of 8, or 50 percent. The difference is 50 percentage points. These are training results, not held-out evidence. Failing to beat a relevant baseline should trigger investigation; beating chance on the training set does not establish real-world usefulness.

The minimal bar chart retains its pair of bars at every depth; additional depth comes from count labels and arithmetic rather than extra bars.

[Brief preview](../illustrations/ml-what-is-machine-learning-centroid-baseline-brief/408.svg) · [Balanced preview](../illustrations/ml-what-is-machine-learning-centroid-baseline/408.svg) · [Detailed preview](../illustrations/ml-what-is-machine-learning-centroid-baseline-detailed/408.svg)

## Checks and replay

The shared data tests independently recompute derived values. The final reference tests additionally recompute class sums, distances, the bisector, the query prediction and the baseline bars, then check every displayed numerical field and textual number against the data module's numerical inventory. Prompt, keyword, source and origin checks keep each reference attached to its assigned question. Regression checks require unsmoothed distance paths, scatter markers after lines, a nonduplicating midpoint label and captions without unsupported expectation or percent escapes. Replay cases supply distinct learner paraphrases for selection checks at every depth; no selection-pass result is claimed here.
