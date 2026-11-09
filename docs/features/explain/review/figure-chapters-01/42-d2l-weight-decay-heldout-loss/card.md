# Weight Decay and Loss

- Prompt (reference.prompts[0]): How does weight decay change training and validation loss?
- Reference id: d2l-weight-decay-heldout-loss (source: D2L)
- Intended kind (reference.spec.diagram.kind): coordinate-plot
- Planner kind: coordinate-plot (fixed); planner routed to picture: no
- Model kind (first diagram): coordinate-plot; all diagrams: coordinate-plot
- Selector hit (intended reference among the references sent): yes
- References sent to the author (attempt 0): shape-coordinate-plot, d2l-weight-decay-heldout-loss, ml-tree-pruning
- Structure (faithful-ref-v1, reference vs model spec): fully - The diagram matches the reference exactly: same coordinate plot, axes, four line series with identical points, and the same caption.
- Factual (factual-v2): 4/5, error no - Mostly correct. 'Stops the model from fitting noise' overstates it, since weight decay reduces overfitting rather than eliminating it. 'Validation loss drops lower' is not guaranteed, but the diagram frames it as 'in this example'.
- Repaired: no; visual fallback: no; authored by google / gemini-3.5-flash-lite
- Time 3048 ms; author tokens in/out 4270/430; cost US$0.002356

| model (408 px) | reference (408 px) |
|---|---|
| ![model](model-408.svg) | ![reference](reference-408.svg) |

## Card body (as saved)

Weight decay adds a penalty on large parameter values during optimization. This regularisation term stops the model from fitting noise in the training set.

```rh-diagram
{"version":1,"diagram":{"title":"Weight decay changes the fit trade-off","caption":"With a penalty, training loss ends higher and held-out loss ends lower in this example.","kind":"coordinate-plot","x":{"label":"Epoch","min":0,"max":6,"scale":"linear"},"y":{"label":"Data loss","min":0,"max":0.9},"series":[{"label":"Train without penalty","kind":"line","points":[{"x":0,"y":0.76},{"x":2,"y":0.19},{"x":6,"y":0.03}]},{"label":"Held-out without penalty","kind":"line","points":[{"x":0,"y":0.8},{"x":2,"y":0.73},{"x":6,"y":0.73}]},{"label":"Train with penalty","kind":"line","points":[{"x":0,"y":0.76},{"x":2,"y":0.39},{"x":6,"y":0.18}]},{"label":"Held-out with penalty","kind":"line","points":[{"x":0,"y":0.8},{"x":2,"y":0.56},{"x":6,"y":0.34}]}]}}
```

As a result, training loss finishes slightly higher because the weights cannot grow arbitrarily large. However, validation loss drops lower because the simpler function generalizes better to unseen data.
