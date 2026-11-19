# GEN-1 example pool 2 · Derived-field inventory

Baseline `a88949c27` (release 164) loads 470 references through the lazy library accessor. Library totals count distinct reference IDs at any depth, including detail diagrams and children of compositions. Pool counts use the top-level spec at each depth, exclude `general-` and `shape-` IDs, and require the kind-only schema bundle. A code-filled field is absent or holds raw inputs that the corresponding `DERIVED_ROWS` computation replaces.

| Derived row | Library references using the field or mode | Pool references with code-filled output (Overview / Standard / Detailed) | Batch A examples |
| --- | ---: | --- | --- |
| `box-plot` · `boxes[].fences` | 1 with written fences | 0 / 0 / 0 | Museum coat-check waits and paint swatch drying times. Both keep the raw observations in the data module and leave fences to code. |
| `transformation` · `after.items` | 0 with declared `op: 'softmax'` | 0 / 0 / 0 | Community-garden grant shares and fruit-tea blend shares. The blend uses `t`. Numeric input items and the declared operation let code fill the share lists. |
| `token-links` · `queries[].weights` | 7 with `normalized`, all with normalized values already supplied | 0 / 0 / 0 | Repair café station preferences from raw tally counts. This gives the normalization row a worked example. |
| `histogram` · `series[].values` | 3 with `measure: 'proportion'` | 0 / 0 / 0 | Skate rental durations. Write bin counts with proportion mode and let code normalize the bars. |
| `heatmap` · `range` | 34 with explicit ranges | 0 / 0 / 0 | Craft market foot traffic. Code sets the scale from the smallest and largest cell. |
| `sample-set` · `groups[].omitted`, out-of-bag `groups[].members` | 5 with `omitted`, including 1 with a written out-of-bag group | 0 / 0 / 0 | Bakery tray inspection slips. Code fills the out-of-bag group from the replacement draw. The written omission markers use the same computed complement. |
| `coordinate-plot` · annotation `derive` | 0 with `derive` | 0 / 0 / 0 | Rain-barrel interpolation (`:on`), dog-park gate entries (`:mean`), and farm stand shelf temperatures (`:max`). |

The three conditional examples all qualify. The batch adds eleven references. The heatmap total includes compositions that carry a heatmap in one of their panels. Three generated single-diagram variants also have explicit ranges.
