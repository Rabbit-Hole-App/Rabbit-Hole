# PLT-2B-n2: line and band labels (release 151 lane P)

Base 5f29c23a6. Source: packages/web/src/tutor-diagrams/ml-plot-layouts.js (hunk.diff). Branch feat/r151-plot.
Files: `<spec>-before-<w>` (main) and `<spec>-after-<w>` (branch), .svg/.html/.png, for bell, anomaly-density (ml-zscore-distribution-tails), curves-formula, overfit at 408 and 720. `other/` holds before/after 408 of the other reference scenes whose snapshot moved. `snapshot-ids-moved.txt` lists the moved svg-snapshot ids.

## Rule
- A reference-line or band label is one line of text (never wrapped, never a pill, 12 px muted, ground halo).
- Vertical line: at its top end on the side of the line (right first, else left) where the whole label fits inside the plot and touches no other label; neither side: above the plot area, centred on the line's x, 11 px.
- X band: inside along its top edge, one line, when text width + 8 px <= band width (collisions inside still stack downward as before); else above the plot area centred on the band's centre x, 11 px. Y band: same test against the plot width, else centred on the plot.
- Horizontal reference line: stays at its right end; only a label wider than the plot goes above, centred on the plot.
- Above-plot labels are clamped inside the card, stand in rows 14 px apart (row 0 nearest the plot, rows stack upward; first row with nothing within 6 px in x). Each box is added to `occupied`, so point callouts keep clear of them.
- The plot is laid out a second time with the top margin grown by 14 px per row used (`lift`). With no above-plot label there is no second pass and top is unchanged.

## Decisions
- Text width is the layout's own estimate (primitives.textWidth), which runs wider than the browser's glyphs, so a label can go above the plot slightly earlier than strictly necessary.
- Growth is rows x 14 even though the base margin (40/66) already has room for one row: simple, and keeps rows clear of the y title.
- Shape labels (segment, rectangle, polygon, circle) and point callouts are untouched.

## Snapshot ids moved (svg-snapshots.json NOT regenerated): 29 of 3280
11 references: acf-pacf-stems, bayes-class-conditional-densities, ml-collective-anomaly-run, ml-time-series-additive-residuals, ml-zscore-distribution-tails, nearest-centroid-boundary, persistent-drift-alerts, precision-recall-thresholds, regression-tree-steps, sigmoid-threshold, svm-margin-support-slack (widths 320/408/720, see file).

## Known limits
- Callout pills (unchanged rule) can still cover a dashed reference line; they are opaque and were placed this way before. Not changed.
- Four labels competing for the margin (the bell at 408) make four rows (56 px of extra top margin).
- tests: all 91 tutor-diagrams test files run singly; only svg-snapshots (expected) fails; figure-layout.test.mjs fails identically on main (a vector stroke-width 2 vs 1.5 pin), not related.
