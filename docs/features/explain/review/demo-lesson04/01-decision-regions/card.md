# Decision Tree Feature Regions

- Prompt: how does a decision tree split a two-feature dataset into regions?
- Depth: Balanced (bench key standard)
- Expected reference: ml-trees-decision-regions; expected kind: coordinate-plot
- Selector hit (expected reference among the references sent to the author): yes; first pick (expected reference sent first): no
- References sent to the author (attempt 0, selector order): shape-coordinate-plot, ml-trees-decision-regions, ml-tree-split-path
- Planner kind: coordinate-plot (not fixed; offered coordinate-plot | tree); planner kind = expected: yes
- Model kind (first diagram): coordinate-plot; all visuals: coordinate-plot; model kind = expected: yes
- Picture routing: planner pictures 0; pictures in the card 0; dropped none
- Repaired: no; visual fallback: no; server corrections: null
- Authored by google / gemini-3.5-flash-lite
- Time 5156 ms (model call(s) 3636 ms); tokens in/out 4240/788; cost US$0.003242
- Factual (factual-v2): 4/5, error no - Minor looseness: 'every possible threshold' (really midpoints between observed values) and 'independent' cells (really disjoint); acceptable simplifications.

![card](card.png)

| model (440 px) | reference (408 px) |
|---|---|
| ![visual 1](visual-1.svg) | ![reference](reference-408.svg) |

## Body (as saved, visual markers in place)

Consider a dataset with two numeric features, $x_1$ and $x_2$, where a decision tree partitions the feature space into axis-aligned rectangular regions.

The tree evaluates splitting criteria recursively to maximize purity within each resulting subset. Look at the plot to see how axis-parallel lines partition the plane into distinct prediction areas.

[[visual:1]]

At each node, the algorithm tests every possible threshold along $x_1$ and $x_2$ to find the split that minimizes impurity metrics like Gini impurity.

This greedy partitioning process carves the two-dimensional space into independent rectangular cells.

## Visuals

- [[visual:1]] diagram, kind **coordinate-plot**, title "Leaf regions on the feature plane", caption "Illustrative split thresholds dividing the plane into rectangular regions." ([spec](visual-1.json), [svg](visual-1.svg), [png](visual-1.png))

## Follow-up questions

1. How does Gini impurity determine the best split threshold?
2. What happens when a decision tree becomes too deep on a small dataset?
3. Can decision trees create diagonal splits instead of axis-aligned ones?
