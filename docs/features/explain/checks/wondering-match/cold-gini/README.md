# r7 cold test: Gini vs entropy from a plain spec

`cold-gini-vs-entropy.spec.json` has no styling field and no annotation: a coordinate-plot, x p from 0 to 1, y 0 to 1, two line series ("Gini (scaled)", "Entropy") of 7 samples each at p = 0, 0.2, 0.4, 0.5, 0.6, 0.8, 1.

Values: entropy in bits, rounded to 3 decimals. "Gini (scaled)" is 4p(1-p), twice the 2p(1-p) of the message, so that its peak is 1 like the entropy's; if the target plots 2p(1-p) the series name should not say "scaled" (a one-line change in the spec).

What the cold build showed:
1. Before this round a plain coordinate-plot never reached the new layout: it fell to the legacy layout (boxed frame, vertical gridlines, line-swatch legend). Fixed in the tool: every coordinate-plot goes through the themed layout (see ../theme-r6/DIFF.md).
2. With 7 samples the segments are straight (the smooth curve is only for 20 or more samples or `smooth: true`), so the figure is a polyline; the target is a smooth curve.
3. The two curves nearly coincide, so the entropy squares sit over the Gini circles at 0.4, 0.5 and 0.6.
4. A plain bar-chart (without a variant) still falls to the legacy bar layout; not touched.
