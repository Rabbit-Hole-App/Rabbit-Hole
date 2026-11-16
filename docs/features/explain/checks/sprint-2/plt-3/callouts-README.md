# PLT-3(A): curve callouts (commit on feat/visual-sprint-2-rep, ml-plot-layouts.js only)

Rule as built: a coordinate-plot whose series are all lines (1 to 3 of them; no closed line, no end label, no uncertainty band) draws no legend. Each series name stands in its series ink (the `INKS` weight of the colour), 700, 15 px, 18 px off the curve, with a 1.5 px leader in the series colour (`wire`, 12 x 8 arrowhead) whose tip lands on the curve sample. 4+ series, or any scatter/step/stem/closed series, keep the legend pills.

Sample choice: the sample farthest from every other series (distance to the nearest other curve, in px; ties: the rightmost), on the side away from that nearest curve (straight up when it is the only series). Overlap or out of the plot area: the legend pill returns for the whole plot.

Two small extensions beyond the text of the rule, both to keep the feature from falling back on ordinary overlapping curves (the t-distribution trio has curves 7-17 px apart everywhere): (1) when the name does not fit at the farthest sample, the next-farthest sample is tried, and so on, per series; (2) a name that would stick out of the plot area slides along the plot edge (the leader stays on the sample). With the strict rule alone, df = 5 never fits and the plot returns to its legend. Say if you want the strict rule.

Result (render summary, `callouts-summary.txt`): Normal / df = 5 / df = 1 by formula, 24 samples: callouts at 720, legend at 408 (the plot is 280 px wide and the three curves leave no free 18 px slot). The same plot from 9 hand-written points keeps the legend at both widths (too few candidate samples). Two curves: callouts at 720, legend at 408. One series: a callout at both widths. Four series: legend at both.

Files (this lane's names, `callouts-` prefix; the PLT lane's `curves-*` files are untouched): `callouts-{formula,hand,two,one,four}-{before,after}-{408,720}.png` (+ the .html in work-a/), `callouts-hunk.diff`, `a-render.mjs` (offline: formula series go through `fillFormulaSeries`, so no flag and no author; the flag-on fast-chain defect is in report-B.md). Before = feat/visual-sprint-2 6a28dd722.
