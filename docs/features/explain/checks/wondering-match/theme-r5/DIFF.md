# theme r5: coordinate-plot defaults, typography, legend and notes (feat/visual-sprint, on r4 69c3e8dab)

Renders (SVG + 2x PNG + spec, specs unchanged): `wondering-plot-accuracy-by-trees`, `ml-trees-gini-vs-entropy`, `ml-trees-decision-regions`, `softmax-probabilities` (a grouped bar chart, for the new legend pill), and `wondering-flow-recursive-partitioning` from the plain spec you sent.

Flow: the back-edge part -> eval ("Repeat") is refused ("A flow cannot contain a cycle or unreachable nodes"), so the flow is rendered without it (VC-2). The other four edges are as sent.

## Plot (ml-plot-layouts.js)
- Frame: the left and bottom axes only, 1.5 px outline; no box. Horizontal guides only, 1.5 px dashed 4-4, #D9D3C3 (TEACHING_GRID); no vertical guides.
- Series line: 3.5 px in the series ink (TEACHING_SERIES_INK), straight between samples, smooth only for 20 samples or more (or `smooth: true`). The line is the heaviest stroke on the chart.
- Markers: 12 px circle, series fill, 1.5 px outline, drawn over the line; the second series is a square, the third a diamond.
- Value labels 15 px / 700 ink above each marker; a sample on the y axis prints its value below its marker.
- Ticks 15 px / 500 muted, no tick marks; axis titles 16 px / 700; the y title is rotated along the axis when it is plain text that fits, else above the plot at 16 px.
- Log axis: every sampled x is labelled; a decade label that would touch one is dropped.
- Legend: one pill per series (26 px, rx 13, ground fill, 1.5 px outline, 12 px padding, 10 px marker, name 13 px / 500), 12 px apart, centred, a second row only when they do not fit; the same pill under bar charts (grouped and stacked; it used to be a symbol list on top).
- Notes: one line each, 13 px muted, the number in the same small outlined badge as on the chart.
- Caps, exported as constants: `PLOT_VALUE_LABEL_MAX_SAMPLES` 8 (and only one series), `PLOT_MARKER_MAX_SAMPLES` 20 (above it a line series is the line alone, labelled samples keep a marker), `PLOT_NOTES_MAX` 6 (`PLOT_CAPS` bundles them). A labelled sample draws no note and no badge (PL-1).
- Spacing: plot, 16, legend, 12, notes, 16, caption.
- The operation arrow between panels is 3 px with a 12 px head (tree panels and plain panels).

## Typography (primitives.js, layouts)
- `label` defaults to 15 px / 500; text on a fill (tone onFill) 15 px / 600 in #32211C; an explicit size or weight is kept. `wrap`, `textWidth` and `lineHeight` default to 15 to match; the body-text constants of the layouts (layouts, teaching-layouts, topology, composition, tensor, flow edges) moved 14 -> 15.
- `TEACHING_TEXT`: body 15 / 500, heading 16 / 600, caption 13, display 17 / 700 unchanged. Note: TEACHING_TEXT is read only by the composed /interactive cards (interact-style.js) and the animation frames (FrameFigures.jsx), not by the written diagrams, so the written diagrams got the sizes through `primitives.js`, not through that token. Inter stays the face.

## Tests (not touched, as agreed): 57 failing of 1299 in the tutor-diagrams and figures-render suites
kind-gallery.test.mjs 25, ml-plot.test.mjs 6, flow.test.mjs 3, tensor.test.mjs 2, plot-lines.test.mjs 2, ml-statistical.test.mjs 2, ml-batch2c-imbalance.test.mjs 2, diagram-math.test.mjs 2, and one each: token-links, ml-panels, ml-data, ml-batch4a-logistic, ml-batch3b-anomaly-decisions, ml-batch3a-series, lesson-decision-trees-illustrative-plots, illustration-embedded-layouts, figure-layout, block-stack, TutorDiagram (all .test.mjs under src/tutor-diagrams), figures-render.test.mjs. The SVG snapshot file was regenerated (that test passes). The rest of the web suite (about 1700 more tests: other src folders, control-plane) was not run.
