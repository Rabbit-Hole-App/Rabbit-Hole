# Phase 02 reference batch 4A · Prediction targets and logistic boundaries

## References

Task `f841a137-4322-4946-9fe1-3d72f9ce4fb1` on `chatgpt/explain-phase02-library`. Both references use existing written `/explain` layouts and illustrative data. [Lesson 01](https://github.com/rohitg00/ai-engineering-from-scratch/blob/e7db050e64bde3be17a9381476f748da26d85692/phases/02-ml-fundamentals/01-what-is-machine-learning/docs/en.md#classification-vs-regression) · [Lesson 03](https://github.com/rohitg00/ai-engineering-from-scratch/blob/e7db050e64bde3be17a9381476f748da26d85692/phases/02-ml-fundamentals/03-logistic-regression/docs/en.md#the-decision-boundary)

| Learner prompt | Reference and expected evidence |
| --- | --- |
| What's the difference between classification and regression? | One teaching matrix aligns the question, target and output for the same weather readings. Classification predicts **Rain** and regression predicts **12 mm**. A classifier may estimate a probability before choosing a label. [SVG](references/ml-classification-vs-regression.svg) · [JSON](references/ml-classification-vs-regression.json) |
| Why does logistic regression draw a straight line between the classes? | A coordinate plot shows study hours and practice quizzes with a score of $s=x+y-6$. The sigmoid maps the 50% cutoff to $x+y=6$ and the 75% cutoff to $x+y=6+\ln 3$. At $(3.5,3)$ the probability is about 62.2%. The lower cutoff predicts Pass and the higher cutoff predicts Not pass. [SVG](references/ml-logistic-decision-boundary.svg) · [JSON](references/ml-logistic-decision-boundary.json) |

## Implementation and checks

- [x] Replay the learner prompts on the baseline.
- [x] Register both examples and verify that the prepared author request picks each one for its prompt and paraphrase.
- [x] Check the logistic geometry and probabilities, existing selector picks, content linter and SVGs at 320, 408 and 720 px. Run the focused tests and web build.
- [x] Export the two JSON/SVG pairs and update the coverage audit.

## Baseline selector gaps

At `129e27865`, the first pick missed the intended mechanism on all four prompts and paraphrases. [Probe wording](../../../../../packages/control-plane/test/fixtures/explanation-reference-batch4a-cases.json)

| Mechanism | Original's first pick | Paraphrase's first pick |
| --- | --- | --- |
| Classification vs. regression | `nearest-centroid-boundary` | None |
| Logistic decision boundary | `sigmoid-threshold` | `sigmoid-threshold` |

## Local verification

- The intended example was the first reference in **4/4** prepared author requests. The **252** benchmark selections and **16** adjacent prompt selections match their baselines. The prior 159 registry entries retain their relative order. [Set 3 benchmark replay](set3/README.md#paraphrase-benchmark)
- **926 focused tests** and the web build passed. The tests check the aligned matrix cells, the boundary scores, the probe's predicted class at each cutoff, parser round trips and the content linter. [Focused replay commands](README.md#focused-local-checks)
- SVG regression now covers **618 snapshots**, with the previous 612 fingerprints and dimensions matching `129e27865`. The six additions cover both references at 320, 408 and 720 px requests. The plot uses the existing 420 px minimum and its probe clears both lines by at least 5.6 px at that size. The matrix fits the requested widths.

Live `/explain` generation and browser acceptance remain pending. For dev acceptance, replay the learner prompts and inspect the model's own examples. The gallery export includes the stylesheet and fonts for the plot's formulas. [Full gallery export command](batch-3b.md#local-verification)
