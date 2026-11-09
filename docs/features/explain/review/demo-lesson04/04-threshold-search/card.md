# Finding the Best Threshold in a Decision Tree

- Prompt: how does a decision tree search for the best threshold on one feature?
- Depth: Balanced (bench key standard)
- Expected reference: ml-trees-threshold-search; expected kind: coordinate-plot
- Selector hit (expected reference among the references sent to the author): yes; first pick (expected reference sent first): no
- References sent to the author (attempt 0, selector order): shape-coordinate-plot, ml-trees-threshold-search, sigmoid-threshold
- Planner kind: coordinate-plot (not fixed; offered coordinate-plot | number-line); planner kind = expected: yes
- Model kind (first diagram): coordinate-plot; all visuals: coordinate-plot; model kind = expected: yes
- Picture routing: planner pictures 0; pictures in the card 0; dropped none
- Repaired: no; visual fallback: no; server corrections: null
- Authored by google / gemini-3.5-flash-lite
- Time 3549 ms (model call(s) 3072 ms); tokens in/out 4072/601; cost US$0.002725
- Factual (factual-v2): 5/5, error no

![card](card.png)

| model (440 px) | reference (408 px) |
|---|---|
| ![visual 1](visual-1.svg) | ![reference](reference-408.svg) |

## Body (as saved, visual markers in place)

When building a decision tree, the algorithm evaluates every feature to find a split that best separates the classes.

For a single continuous feature, it sorts the unique values and tests midpoints between adjacent points as candidate thresholds.

[[visual:1]]

For each candidate threshold, the algorithm splits the data into two subsets and computes the impurity of each subset using Gini impurity.

It then calculates the weighted Gini impurity, which combines the impurity of the left and right child nodes based on their relative sizes.

The threshold that yields the lowest weighted impurity is chosen as the optimal split for that feature.

## Visuals

- [[visual:1]] diagram, kind **coordinate-plot**, title "Test the midpoints on x", caption "Worked example. A smaller weighted Gini is better. The best cut is x at most 4." ([spec](visual-1.json), [svg](visual-1.svg), [png](visual-1.png))

## Follow-up questions

1. How does Gini impurity measure node purity?
2. What happens when a feature has many duplicate values?
3. How do regression trees choose splits instead of Gini?
