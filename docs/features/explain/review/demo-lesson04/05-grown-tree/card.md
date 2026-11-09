# Tracing a point in a decision tree

- Prompt: how does a decision tree trace a new point from the root to a prediction?
- Depth: Balanced (bench key standard)
- Expected reference: ml-trees-grown-tree; expected kind: tree
- Selector hit (expected reference among the references sent to the author): yes; first pick (expected reference sent first): no
- References sent to the author (attempt 0, selector order): shape-tree, ml-trees-grown-tree, ml-tree-split-path
- Planner kind: tree (fixed); planner kind = expected: yes
- Model kind (first diagram): tree; all visuals: tree; model kind = expected: yes
- Picture routing: planner pictures 0; pictures in the card 0; dropped none
- Repaired: no; visual fallback: no; server corrections: null
- Authored by google / gemini-3.5-flash-lite
- Time 3110 ms (model call(s) 2653 ms); tokens in/out 4111/547; cost US$0.002601
- Factual (factual-v2): 5/5, error no

![card](card.png)

| model (440 px) | reference (408 px) |
|---|---|
| ![visual 1](visual-1.svg) | ![reference](reference-408.svg) |

## Body (as saved, visual markers in place)

A decision tree classifies a new data point by pushing its feature values through nested tests from the root node down to a leaf.

Each internal node evaluates a single feature against a threshold, sending the point left or right based on the result. Look for the split conditions and the traversed route in the tree diagram.

[[visual:1]]

Starting at the root, the model checks if feature $x_1$ meets the condition. If the condition is true, the point moves down the left branch; otherwise, it takes the right branch.

Successive nodes repeat this evaluation with other features until the point reaches a leaf node that assigns the final class label.

## Visuals

- [[visual:1]] diagram, kind **tree**, title "A prediction follows tested conditions", caption "Illustrative counts. For x_1 equals 2 and x_2 equals 1, follow the blue route to Class A." ([spec](visual-1.json), [svg](visual-1.svg), [png](visual-1.png))

## Follow-up questions

1. How does a decision tree choose which feature to test first?
2. What happens when a continuous feature has many possible split values?
3. How do tree models prevent overfitting during training?
