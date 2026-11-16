# PLT-2 plot: band under the curve, point callouts (commit on feat/visual-sprint-2-plt, file ml-plot-layouts.js)

Defaults only: no spec, schema or reference change; the palette only.

(A) A coordinate-plot with exactly one line series: an x-band is clipped to the area under the series (clipPath = the series' own drawn path, smooth or straight, closed to the baseline, which is y = 0 or the bottom of the plot). Several series keep the full-height band. Colour of a band is unchanged (its annotation index, 0 blue, 1 coral, 2 teal).

(B) A point annotation is a callout: its label (not a number) in a 22 px pill in the cell the badge placement finds (first choice up and right of the point; cells that sit on a curve are skipped, then the plain placement is the fallback), a 1.5 px ink leader with the standard 12 x 8 head, ending at the ring. The ring is filled with the colour of the x-band that holds the point (the narrowest; none holds it: the nearest), ink stroke. Reference-line, band, segment and other marks keep their numbered badges; series-point labels keep PL-1. Callouts and badges each stay under PLOT_NOTES_MAX (6); only badges are numbered (a callout does not take a number).

Files: bell-before/after-408/720.png (+ svg), anomaly-density-before/after-408/720.png, hunk.diff, render.mjs (the script).

Bell spec (samples, 25): reference-lines at 0 and +-1, bands [-1,1] teal and [-0.5,0.5] blue, points Mean (0, f(0)) and Standard deviation (+-1, f(1)). A band's colour comes from its annotation index, so the wide band is listed 3rd (index 2, teal) and the narrow one 4th (index 3, blue): the spec lists them in that order.

Things to know:
- anomaly-density (ml-zscore-distribution-tails): its two bands are the tails z < -3 and z > 3, where the curve is 0.004 high: the area under the curve there is about 1.5 px, so the clipped bands are a sliver and read as almost nothing (before: full-height boxes). That is what the rule gives; reading the tails then rests on the badges 1 and 2 and the caption.
- The reference-line badges (1 to 5 in the bell) sit at the middle of their lines, so they crowd the middle of the plot: unchanged behaviour, not part of this item.
