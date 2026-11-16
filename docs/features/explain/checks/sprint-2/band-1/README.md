# BAND-1 pale bands (ml-plot-layouts.js, one commit with PLT-2(A))

Rule: a band annotation draws at 0.18 of its colour over the ground (mixHex at 0.18, the legend pills' tint) with NO outline (before: the saturated series fill at full strength and a 1.5 px ink outline, which covers the stems and the curve). Its colour is still the annotation-index colour (0 blue, 1 coral, 2 teal). Rectangles, polygons and circles are unchanged (not bands).

Before = released main 74c4f68ae; After = this commit. Files at 408 and 720: acf-pacf-stems (the +-0.2 band under the stems), ml-zscore-distribution-tails (anomaly-density tails), bell (the PLT-2 spec). hunk.diff, refs.mjs.

The ring of a point annotation (PLT-2(B)) keeps the saturated colour of the nearest band (the band itself is pale now): a pale ring would not read.
