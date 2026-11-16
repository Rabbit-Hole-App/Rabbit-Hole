# theme r4: the sprint's look as the default for every kind (feat/visual-sprint)

Rendered from the committed specs, unchanged, with the new defaults (SVG + 2x PNG each):
- `ml-logistic-regression-softmax` (panels with a stacked bar)
- `ml-trees-decision-regions`, `ml-trees-gini-vs-entropy` (coordinate-plot)
- `confusion-matrix-counts` (heatmap)
- `wondering-plot-accuracy-by-trees`: a plain coordinate-plot (log x axis 1 to 200 trees, y 75 to 90 %, values 78.5, 83.2, 85, 86.8, 87.1)

Not here: the Recursive Partitioning flow. Its spec was in the r1 flow message, which this session never received.

Defaults changed (teaching-theme.js, primitives.js and the layouts that drew with the pale tokens):
- ground #FFFCF0 (TEACHING.surface and the card background); ink #32211C; muted #665951.
- Shapes: outline #32211C at 1.5 px. Role fills: process blue, decision mustard, outcome teal (and coral for an excluded or negative mark). Series and plot fills come from TEACHING_SERIES.
- Wires and arrows: #32211C at 2 px with a 10 px head; a dashed pruned branch 1.5 px; a gridline (`guide`) stays light and thin. Plot frames and bar baselines are outline.
- No panel borders on `panels` (comparison headers keep their fills).
- The soft tokens (blueSoft, warmSoft, greenSoft, inset) and the dark blue, warm and green lines stay defined; no layout draws with them any more. TEACHING.blue is still the active-path highlight.
