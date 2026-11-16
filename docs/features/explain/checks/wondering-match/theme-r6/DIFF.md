# theme r6 (feat/visual-sprint, on r5 d2246752c)

Renders (SVG + 2x PNG + spec): accuracy-by-trees plot, gini-vs-entropy (existing spec), the flow, and softmax-probabilities (grouped bars).

## Plot
- Value label on a sample on the y axis: to the right of the marker, centred on it.
- Marker density: every sample up to 8, every other sample from 9 to 19, the line alone from 20 (labelled samples keep theirs). Constants `PLOT_MARKER_ALL_MAX_SAMPLES` 8 and `PLOT_MARKER_LINE_ONLY_FROM_SAMPLES` 20 replace `PLOT_MARKER_MAX_SAMPLES`; `PLOT_VALUE_LABEL_MAX_SAMPLES` 8 and `PLOT_NOTES_MAX` 6 stay (`PLOT_CAPS` has all four).
- Note badge: first placed 14 px up and right of its point (lower left corner), a 1 px leader from the marker edge.
- No axis lines: dashed guides (1.5 px, #D9D3C3) at every y tick, the minimum included, and the tick numerals frame the plot. When the y range crosses 0 the guide at 0 is solid 1.5 px #786860 (`TEACHING_ZERO`). Bar charts: no axis lines, one solid baseline guide at zero (the bars sit on it), dashed guides at the ends of the scale.
- Strokes (measured from the target): series line 4.5 px in the series FILL colour, round caps and joins, under the markers; dashed second series 10-6 at 4.5 px; markers 14 px, series fill, 2 px #32211C ring; guides and outlines 1.5 px. The darker ink tokens are used only for an end label's text.
- Axis titles centred: x under the plot area, y rotated along the plot's height; the "log scale" suffix is no longer drawn on the figure (`axisName` still adds it to the written description).
- Legend pills: height 22, rx 11, padding 10, marker 9 px with a 1.5 px ring, text 13 px / 500, gap 10, centred, 12 px below the x title.
- No numbered note list under the figure; the badge on the chart is the whole note. `PLOT_NOTES_MAX` still caps the badges.
- Routing: every `coordinate-plot`, plain or extended, now goes through this layout (a plain spec used to fall to the legacy plot layout, with a boxed frame, vertical gridlines and a line-swatch legend); `TutorDiagram.js` treats every coordinate plot as a teaching diagram. Found by the cold test (see ../cold-gini).

## Flow (flow.js)
- Start (the first node, no incoming edge, unless a decision) and outcome nodes are pills; process nodes are rounded rectangles, radius 9.
- A decision stays a diamond and is as wide as its label needs for one line (up to 360 px): "Pure or Max Depth?" is on one line.
- The back-edge part -> eval ("Repeat") is still refused (VC-2); not in this sprint.

## Tests (not touched): 61 failing of 1299 in the tutor-diagrams and figures-render suites

The SVG snapshot file was regenerated (that test passes). The rest of the web suite and the control-plane suite were not run.
