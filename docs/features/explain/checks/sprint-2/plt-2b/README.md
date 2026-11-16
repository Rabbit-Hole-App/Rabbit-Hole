# PLT-2(B) callouts, no numbered badge (ml-plot-layouts.js)

Rule: every annotation with a label draws it as a callout: its text (wrapped at 200 px) in a pill in the first free cell the badge placement finds (cells that sit on a curve are skipped first), and a 1.5 px ink leader with the standard 12 x 8 head ending at the mark: a point annotation's ring (radius 6, ink stroke, filled with the colour of the x-band that holds it, else the nearest band, else the ground), for any other annotation (segment, vector, reference line, band, rectangle, polygon, circle, ellipse) its anchor (the middle of the line or the shape). A point annotation whose label only restates its coordinates (restatesPoint, PL-1) draws no callout. NO numbered badge is drawn anywhere on a coordinate plot (the note list the numbers pointed at is gone). At most PLOT_NOTES_MAX (6) callouts per plot, as the badges were.

Before = the pre-sprint main 18cf9fce8 (what the owner saw before release 148: numbered badges and the note list, a different look); After = this commit on released main 74c4f68ae.

Files (each at 408 and 720): nearest-centroid-boundary, regression-residuals, gradient-descent-contours, regularization-l1-l2-geometry, sigmoid-threshold, ml-zscore-distribution-tails (the sixth: bands), bell (the PLT-2 spec: reference lines, bands, points). hunk.diff, refs.mjs.

Note: the schema makes every annotation's label required and every kind carries one, so every annotated shape now shows a pill; a reference line or band whose label is long or several in one plot crowd the plot (see the bell: five line/band pills and three point pills).
