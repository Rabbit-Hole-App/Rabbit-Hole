# Random Forest Combination Mechanism

- Prompt: how does a random forest combine the predictions of its trees into one answer?
- Depth: Balanced (bench key standard)
- Expected reference: ml-trees-majority-vote; expected kind: flow
- Sent bare: only the prompt (no lesson, no context, no selection); depth standard
- Selector hit (expected reference among the references sent to the author): yes; first pick (expected reference sent first): no
- References sent to the author (attempt 0, selector order): shape-flow, ml-trees-majority-vote, ml-bagging-vote-flow
- Steer (explanation_plan_kind_from_reference): no (event absent)
- Planner kind: flow (not fixed; offered flow | tree); planner kind = expected: yes
- Model kind (first diagram): flow; all visuals: flow; model kind = expected: yes
- Picture routing: planner pictures 0; pictures in the card 0; dropped none
- Repaired: no; visual fallback: no; server corrections: null
- Authored by google / gemini-3.5-flash-lite
- Time 3174 ms (model call(s) 2850 ms); tokens in/out 4136/757; cost US$0.003134
- Factual (factual-v2): 5/5, error no

![card](card.png)

| model (440 px) | reference (408 px) |
|---|---|
| ![visual 1](visual-1.svg) | ![reference](reference-408.svg) |

## Body (as saved, visual markers in place)

When a random forest makes a prediction for a classification task, it pools the independent outputs of all its individual decision trees. Each tree outputs its own discrete class label for the given input features.

[[visual:1]]

The forest then applies an aggregation rule known as majority vote, where the final predicted class is simply the one receiving the most votes across all trees.

If a regression task is performed instead, the forest averages the continuous numeric outputs of the trees to yield the final prediction.

## Visuals

- [[visual:1]] diagram, kind **flow**, title "Combining Tree Predictions in a Random Forest", caption "Each fitted tree votes independently, and the forest aggregates these individual votes into a final class prediction." ([spec](visual-1.json), [svg](visual-1.svg), [png](visual-1.png))

## Follow-up questions

1. What is bagging and how does it relate to random forests?
2. How does a random forest handle regression tasks instead of classification?
3. Why do uncorrelated trees improve the accuracy of the ensemble?
