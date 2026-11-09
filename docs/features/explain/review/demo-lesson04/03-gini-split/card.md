# Gini Impurity and Information Gain

- Prompt: how do I compute the Gini impurity on both sides of a split and the information gain?
- Depth: Balanced (bench key standard)
- Expected reference: ml-trees-gini-split; expected kind: matrix
- Selector hit (expected reference among the references sent to the author): no; first pick (expected reference sent first): no
- References sent to the author (attempt 0, selector order): shape-tree, ml-tree-split-path
- Planner kind: tree (fixed); planner kind = expected: no
- Model kind (first diagram): tree; all visuals: tree; model kind = expected: no
- Picture routing: planner pictures 0; pictures in the card 0; dropped none
- Repaired: no; visual fallback: no; server corrections: {"tree_hierarchy_layout":1}
- Authored by google / gemini-3.5-flash-lite
- Time 3404 ms (model call(s) 2894 ms); tokens in/out 3840/720; cost US$0.002952
- Factual (factual-v2): 5/5, error no

![card](card.png)

| model (440 px) | reference (408 px) |
|---|---|
| ![visual 1](visual-1.svg) | ![reference](reference-408.svg) |

## Body (as saved, visual markers in place)

When building decision trees, we measure node purity using the Gini impurity. Consider a node with 12 samples split into 4 of Class A and 8 of Class B.

The Gini impurity formula is $1 - \sum p_i^2$, which evaluates to $1 - (4/12)^2 - (8/12)^2 \approx 0.444$.

Look at the root node split in the tree below to see how samples are divided into child nodes.

[[visual:1]]

After splitting, we compute the weighted Gini impurity of the children.

If the left child has 7 samples with impurity $0.489$ and the right child has 5 samples with impurity $0.0$, the combined impurity is a weighted average.

Information gain is then the parent impurity minus this weighted child impurity sum.

## Visuals

- [[visual:1]] diagram, kind **tree**, title "A decision tree split and impurity", caption "Illustrative counts. For $x_1\le 4$, follow the blue route to Class A." ([spec](visual-1.json), [svg](visual-1.svg), [png](visual-1.png))

## Follow-up questions

1. How do you handle continuous features when calculating Gini impurity?
2. What is the difference between Gini impurity and entropy?
3. Why do classification trees stop splitting when impurity reaches zero?
