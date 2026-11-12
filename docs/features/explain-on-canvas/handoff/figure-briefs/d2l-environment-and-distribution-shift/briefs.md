# 4.7. Environment and Distribution Shift figure briefs

3 figure occurrences in document order. [Source page](https://d2l.ai/chapter_linear-classification/environment-and-distribution-shift.html) · [Inventory](manifest.json)

## Figure 01

A training sample can teach a model a narrow version of the input domain even when both target classes are represented.

- **Kinds.** `comparison` · `sample-set`
- **Elements.** Two classes with independently drawn examples, training-style input samples on one side, and a place for a changed input style on the other; keep the classification rule fixed.
- **Sequence.** Distribution shift · 1, establish the original input distribution.
- **Phase 02.** [19](../briefs/19-ml-system-design.md) · [20](../briefs/20-model-monitoring-and-drift.md)
- **Existing reference.** `ml-covariate-drift-comparison`

## Figure 02

Deployment inputs can look unlike training inputs while the task still uses the same class definitions.

- **Kinds.** `comparison` · `sample-set`
- **Elements.** Show the same two target classes in the original domain and a differently represented domain; compare input properties without changing the label rule.
- **Sequence.** Distribution shift · 2, pair the shifted test distribution with the earlier training example.
- **Phase 02.** [19](../briefs/19-ml-system-design.md) · [20](../briefs/20-model-monitoring-and-drift.md)
- **Existing reference.** `ml-covariate-drift-comparison`

## Figure 03

The same input can acquire different labels across settings when the labeling rule itself changes.

- **Kinds.** `matrix` · `comparison`
- **Elements.** Keep one input meaning fixed and compare the class assignments or frequencies of competing names across several invented settings; compare the conditional rule rather than input prevalence.
- **Sequence.** Distribution shift · 3, contrast concept shift with the earlier input shift.
- **Phase 02.** [20](../briefs/20-model-monitoring-and-drift.md)
- **Existing reference.** `ml-concept-drift-comparison`
