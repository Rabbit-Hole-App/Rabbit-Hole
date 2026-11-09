# Held-out error and decision tree depth

- Prompt: how does held-out error change as a decision tree grows deeper?
- Depth: Balanced (bench key standard)
- Expected reference: ml-trees-depth-overfit; expected kind: coordinate-plot
- Selector hit (expected reference among the references sent to the author): yes; first pick (expected reference sent first): no
- References sent to the author (attempt 0, selector order): shape-coordinate-plot, ml-trees-depth-overfit
- Planner kind: coordinate-plot (fixed); planner kind = expected: yes
- Model kind (first diagram): coordinate-plot; all visuals: coordinate-plot; model kind = expected: yes
- Picture routing: planner pictures 0; pictures in the card 0; dropped none
- Repaired: no; visual fallback: no; server corrections: null
- Authored by google / gemini-3.5-flash-lite
- Time 4048 ms (model call(s) 3410 ms); tokens in/out 3845/685; cost US$0.002866
- Factual (factual-v2): 5/5, error no

![card](card.png)

| model (440 px) | reference (408 px) |
|---|---|
| ![visual 1](visual-1.svg) | ![reference](reference-408.svg) |

## Body (as saved, visual markers in place)

Growing a decision tree deeper changes how it handles training data versus unseen rows. Consider a small dataset where depth zero predicts the majority class, missing some patterns.

Adding splits reduces training error until the tree memorizes every training point completely.

Look at the error curves where training error drops to zero while held-out error rises at the maximum depth.

[[visual:1]]

This divergence is called overfit, where the model captures noise instead of general rules. The optimal depth balances complexity and generalization by stopping before the tree memorizes random quirks.

## Visuals

- [[visual:1]] diagram, kind **coordinate-plot**, title "Training and held-out error by depth", caption "Worked example. The deepest tree fits training rows and makes more mistakes on held-out rows." ([spec](visual-1.json), [svg](visual-1.svg), [png](visual-1.png))

## Follow-up questions

1. How do pruning techniques prevent a decision tree from growing too deep?
2. What role does cross-validation play in finding the best tree depth?
3. Why does high training accuracy often lead to poor test performance?
