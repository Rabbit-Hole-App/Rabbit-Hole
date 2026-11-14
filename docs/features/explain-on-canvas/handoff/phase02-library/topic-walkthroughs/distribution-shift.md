# C02 — composition checks across four small subjects

[Content specifications and recorded inputs](../../../../explain/composition/batches/C02/content-specs.md) were committed before code. [Batch report](../../../../explain/composition/batches/C02/REPORT.md) links the three depth contact sheets and machine-readable receipts. Each reference retains its own subject and lesson tags.

## Scale and normalize one attention query

Query is $(1,1)$; keys are A $(2,0)$, B $(0,1)$, C $(1,2)$. Divide dot products by the square root of head width $2$ before stable softmax. Display values are rounded; tests use the full-precision calculations.

| Position | Dot product | Scaled match | Weight | Doubled-query weight |
|---|---:|---:|---:|---:|
| A | 2 | 1.414 | 0.284 | 0.187 |
| B | 1 | 0.707 | 0.14 | 0.045 |
| C | 3 | 2.121 | 0.576 | 0.768 |

## Loss, accuracy, and a held-out plateau

These are illustrative recorded predictions on 8 one-feature examples, split 4/4. They are not claimed outputs of an optimizer run. BCE is measured in nats. The fixed-rate history states $\eta=0.1$ throughout.

| Epoch | Dropout train BCE | Dropout held-out BCE | Held-out accuracy % | Fixed-rate train BCE | Train / held-out accuracy % |
|---:|---:|---:|---:|---:|---|
| 1 | 0.714 | 0.714 | 50 | 0.714 | 50 / 50 |
| 2 | 0.456 | 0.506 | 75 | 0.543 | 75 / 75 |
| 3 | 0.359 | 0.399 | 100 | 0.382 | 100 / 75 |
| 4 | 0.29 | 0.317 | 100 | 0.226 | 100 / 75 |

The fixed-rate accuracy gap grows by 25 percentage points. For the dropout H2 check, class-one probability 0.4 → 0.32 produces per-example BCE 0.511 → 0.386; true class is 0 and both predictions stay correct.

## Feed forecasts back

Readings are $(4,6,8,6,8,10,8,10)$. Predictor $f(x)=0.5x+1$ uses one lag. Origin is 4; the observed baseline mean is 7.5 and the predictor fixed point is 2.

| Target time | Measured lag | Refreshed prediction | Recursive input | Recursive prediction |
|---:|---:|---:|---:|---:|
| 5 | 6 | 4 | 6 | 4 |
| 6 | 8 | 5 | 4 | 3 |
| 7 | 10 | 6 | 3 | 2.5 |
| 8 | 8 | 5 | 2.5 | 2.25 |

Move the origin to 5: the newly measured seed 8 yields $(5,3.5,2.75)$. The predictor and fixed point stay unchanged. The provenance matrix contains categorical source names, not boxed numeric quantities.

## Change inputs or change labels

Input shift uses independent domain draws with the known rule A for round, B for square. Concept shift reuses every input and reverses only that naming rule in a second invented studio.

| Independent domain | Dark / light | A / B |
|---|---|---|
| Training | 3 / 1 | 2 / 2 |
| Deployment | 1 / 3 | 2 / 2 |

| Fixed input | Count | Elm A / B | Ash A / B |
|---|---:|---|---|
| Dark round | 3 | 3 / 0 | 0 / 3 |
| Light square | 3 | 0 / 3 | 3 / 0 |

All 8 inputs stay fixed and all 8 labels change; the overall A/B totals remain 4/4 in each studio. Thus unchanged class balance does not rule out a conditional label change.

All numeric rows above are generated from the four topic data modules and checked by independent arithmetic tests. Standard has at most two plot panels, and every composition fits a 680 px request using existing rendering only.
