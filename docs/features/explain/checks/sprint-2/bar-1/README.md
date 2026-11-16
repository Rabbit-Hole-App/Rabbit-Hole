# BAR-1 (sprint 2): bar-chart defaults

Commit 4ea38a0f1 on feat/visual-sprint-2-flow (ml-plot-layouts.js only: a new `verticalBars` + `BAR_FILLS` placed just above `barChart`, `barChart` calls it for everything but the stacked variant, and the one routing line in `createLayouts`; hunk.diff). Base 6a28dd722. Evidence: <name>-<408|720>-<before|after>.png/.html, sizes-before.txt, sizes-after.txt, scan-before/after.json (all 78 reference specs that contain a bar chart).

What is drawn (defaults only, no new kind, property or colour): vertical bars, categories along the bottom; an L-axis in ink #32211C, 2 px (the value axis left, the category baseline at zero; no top or right line, no box); dotted gridlines (1.5 px, ink at 30%, dash 1.5 4, round caps) at the value ticks (the plot kind's ticks); one fill per category in the order blue, mustard, teal, coral, olive, lavender, rose, slate; a grouped chart: one fill per series (the plot kind's series colours, as its legend pills); the value above each bar, centred, ink, 15 px, suppressed with more than 12 bars or when it is wider than its bar slot; square bars, 2 px ink outline, gap 40% of the bar width (bar = slot / 1.4); no legend for a single series, the pill legend for grouped; the width is the plot kind's (at least 408), so up to 8 categories fit a 440 card and above that the bars narrow before the figure widens. A zero value is a flat 2 px line on the baseline.

| figure | 408 before | 408 after | 720 before | 720 after |
|---|---|---|---|---|
| binomial n=10 p=0.5 k=0..5 (%) | 408 x 301 | 408 x 332 | 720 x 301 | 720 x 332 |
| grouped, 2 series x 4 categories | 408 x 409 | 408 x 366 | 720 x 409 | 720 x 366 |
| 12 categories (plain bars) | 408 x 478 | 408 x 293 | 720 x 478 | 720 x 293 |
| softmax stacked bar | 408 x 302 | 408 x 302 (markup identical) | 720 x 302 | 720 x 302 (identical) |
Scan: the 15 + 7 + 2 figures that carry bar charts inside comparison panels (`options.compact`) are unchanged in size; the stacked-with-bars (softmax) ones are unchanged; plain and grouped ones are now vertical (taller or shorter by their bar count).

## Where the spec did not match the existing code
1. Orientation: there is no orientation property in the spec (spec.js, ml-plot-spec.js) and no reference declares one; every bar chart is horizontal today (plain bars in quantitative-layouts.js, grouped and stacked-categories in ml-plot-layouts.js barChart). "A spec may still say horizontal" cannot be honoured without a new property, which BAR-1 forbids. What stays horizontal: the stacked variant with categories x series (not in BAR-1) and bar charts inside comparison panels (compact mode, which pack a label column and a value column).
2. Magnitude series: nothing in the spec marks a series as a magnitude, so no warm ramp (it would need a property).
3. The palette order in the spec (blue, mustard, teal, coral, olive, lavender, rose, slate) differs from TEACHING_SERIES (blue, coral, teal, olive, lavender, mustard, rose, slate). BAR-1's list is used for the per-category fills (BAR_FILLS); a grouped chart keeps TEACHING_SERIES because its legend pills use it.
4. A 12-category bar is past the schema (bars max 8, categories max 8): the 12-category evidence is drawn through the layout function directly, not through the spec validator.
5. The plain bar chart reads options.labelColors (the identity colours a comparison keeps per label): kept; it wins over the per-category fill.
6. The value text keeps the existing `amount()` format: "24.6 %" (a space before the unit).
No tests were run (this round).
