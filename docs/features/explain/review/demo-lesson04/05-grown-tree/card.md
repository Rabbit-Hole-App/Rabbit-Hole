# Tracing a point in a decision tree

- Prompt: how does a decision tree trace a new point from the root to a prediction?
- Depth: Balanced (bench key standard)
- Expected reference: ml-trees-grown-tree; expected kind: tree
- Sent bare: only the prompt (no lesson, no context, no selection); depth standard
- Selector hit (expected reference among the references sent to the author): yes; first pick (expected reference sent first): no
- References sent to the author (attempt 0, selector order): shape-tree, ml-trees-grown-tree, ml-tree-split-path
- Steer (explanation_plan_kind_from_reference): no (event absent)
- Planner kind: tree (fixed); planner kind = expected: yes
- Model kind (first diagram): tree; all visuals: tree; model kind = expected: yes
- Picture routing: planner pictures 0; pictures in the card 0; dropped none
- Repaired: no; visual fallback: no; server corrections: null
- Authored by google / gemini-3.5-flash-lite
- Time 2587 ms (model call(s) 2368 ms); tokens in/out 4111/456; cost US$0.002374
- Factual (factual-v2): 5/5, error no

![card](card.png)

| model (440 px) | reference (408 px) |
|---|---|
| ![visual 1](visual-1.svg) | ![reference](reference-408.svg) |

## Body (as saved, visual markers in place)

A decision tree evaluates a new data point by passing its feature values through a series of hierarchical conditional checks.

Each internal node asks a binary question about a specific feature, splitting the sample space into partitions.

[[visual:1]]

Starting at the root node, the point's feature value is compared against the stored threshold. If the condition holds true, the traversal moves down the left branch; otherwise, it proceeds to the right branch.

This sequential routing continues recursively until the point reaches a leaf node. The final leaf assigns the predicted class or value based on the training samples residing in that region.

## Visuals

- [[visual:1]] diagram, kind **tree**, title "A prediction follows tested conditions", caption "Illustrative counts. For x_1 equals 2 and x_2 equals 1, follow the blue route to Class A." ([spec](visual-1.json), [svg](visual-1.svg), [png](visual-1.png))

## Regeneration note

Regenerated once (run 2026-11-09T122905-demo-lesson04-regen-05-09, no loop). Still not the grown-tree reference: the diagram nodes are "x_1 <= 4?", "x_2 <= 2?", "Class B", "Class A", "Class B after two tests"; the reference nodes are "x at most 4?", "y at most 2?", "Predict 0 · L", "Predict 0 · RL", "Predict 1 · RR". Same references sent in the same order; no steer; no repair; factual 5.

## Previous run (replaced on regeneration)

- Prompt: how does a decision tree trace a new point from the root to a prediction?
- Depth: Balanced (bench key standard)
- Expected reference: ml-trees-grown-tree; expected kind: tree
- Sent bare: only the prompt (no lesson, no context, no selection); depth standard
- Selector hit (expected reference among the references sent to the author): yes; first pick (expected reference sent first): no
- References sent to the author (attempt 0, selector order): shape-tree, ml-trees-grown-tree, ml-tree-split-path
- Steer (explanation_plan_kind_from_reference): no (event absent)
- Planner kind: tree (fixed); planner kind = expected: yes
- Model kind (first diagram): tree; all visuals: tree; model kind = expected: yes
- Picture routing: planner pictures 0; pictures in the card 0; dropped none
- Repaired: no; visual fallback: no; server corrections: null
- Authored by google / gemini-3.5-flash-lite
- Time 3070 ms (model call(s) 2516 ms); tokens in/out 4111/484; cost US$0.002444
- Factual (factual-v2): 4/5, error no - The prose is accurate. The diagram text is slightly ambiguous: it mentions both a route to Class A and 'Class B after two tests', but this is not a clear factual error.

## Follow-up questions

1. How are the optimal split thresholds determined during training?
2. What happens when a decision tree encounters missing feature values?
3. How does tree depth affect overfitting and generalization?
