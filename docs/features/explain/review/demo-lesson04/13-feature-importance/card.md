# Impurity vs Permutation Importance

- Prompt: compare impurity-based feature importance with permutation importance when one feature is random noise
- Depth: Balanced (bench key standard)
- Expected reference: ml-trees-feature-importance; expected kind: bar-chart
- Selector hit (expected reference among the references sent to the author): no; first pick (expected reference sent first): no
- References sent to the author (attempt 0, selector order): shape-comparison
- Planner kind: comparison (fixed); planner kind = expected: no
- Model kind (first diagram): comparison; all visuals: comparison; model kind = expected: no
- Picture routing: planner pictures 0; pictures in the card 0; dropped none
- Repaired: no; visual fallback: no; server corrections: null
- Authored by google / gemini-3.5-flash-lite
- Time 3126 ms (model call(s) 2515 ms); tokens in/out 3501/472; cost US$0.002231
- Factual (factual-v2): 4/5, error no - Minor overstatement: permutation importance is not fully 'unbiased' (e.g., correlated features distort it), but it avoids the cardinality bias.

![card](card.png)

| model (440 px) | reference (408 px) |
|---|---|
| ![visual 1](visual-1.svg) | ![reference](reference-408.svg) |

## Body (as saved, visual markers in place)

When a tree-based model trains on data containing a random noise feature, impurity-based importance often assigns it a misleadingly high score.

This happens because models with many splits easily overfit to random variations.

[[visual:1]]

To see the true impact, permutation importance shuffles the feature values and measures the drop in validation score.

Because random noise carries no signal, shuffling it leaves the model's accuracy largely unaffected, resulting in a score near zero.

## Visuals

- [[visual:1]] diagram, kind **comparison**, title "Feature Importance Comparison", caption "" ([spec](visual-1.json), [svg](visual-1.svg), [png](visual-1.png))

## Follow-up questions

1. Why does impurity importance favor high-cardinality features?
2. How does permutation importance handle correlated features?
3. Can permutation importance be computed on the training set?
