# kinds-fit r4: report (parts.frame, layers, tensor)

Branch feat/kinds-fit-b, tip dae44b2cd, off main a2736974f (release 163); nothing merged or released. Commits: 226d9160b (`parts.frame`), dae44b2cd (layers and tensor fitted). Images and probes: images/ in this folder (film/evidence 2f3bd0809). The lead wrote this from the lane agent's text.

## `options.range` (item a)
Still works on main; its test is among the 71 kinds-fit tests and passes.

## `parts.frame` (the /interactive request: leave out a fitted picture's outer card and padding)
Default true = today's drawing, byte-identical (svg-snapshots.json untouched). `frame: false`:
- Built at the entry point, not in the layouts: it leaves out the card rect and crops each layout's own outer padding through the viewBox (12 px per side; 14 for flow; 6 for tensor). A shown title keeps its top, a shown caption keeps its bottom.
- Covered: all fitted kinds (coordinate-plot, token-links, bar-chart, heatmap, matrix, flow, tree top-down binary and hierarchy, layers, tensor); every kind could be separated cleanly; a kind that is not fitted ignores it.
- With a box: the layout is asked for the box plus the padding, so the picture equals the box.
- `min` shrinks by the padding; `min.parts` carries a NEGATIVE part "outer padding left out (frame: false)" so the parts still add up (this breaks the earlier non-negative rule only when frame is false: decision below). `geometry` is shifted into the cropped picture.
- Proof: a test renders frame false at the box grown by the padding against frame true and finds the same drawing inside; in headless Chrome 165 pictures (8 kinds x 5 boxes x 3 sizes) had no content outside the picture.

## New kinds
| kind | min at 14 px | min with frame false | what stretches | geometry | roles read |
|---|---|---|---|---|---|
| layers | 119 x 194 | 95 x 170 | the layers share the leftover height | each layer { index, x, y, width, height } | body (title), small (detail) |
| tensor | 120 x 94 | 108 x 82 | the cell rows; the grid stays centred | each cell { index, row, col, x, y, width, height, value } | body (name and numbers), small (dimensions) |
Not fitted: block-stack: a composite of nested flows, tensors and skip lanes (block-stack-layout.js, 393 lines) that needs its own pass; it keeps today's drawing (geometry null, min = drawn size).

## Tests, 0 fail
The whole tutor-diagrams directory plus theme 1441; kinds-fit.test.mjs 71 (includes svg-snapshots); five other renderer test files 42. Bundle: Total Upload 9087.09 KiB against main 9081.33 KiB (+5.8 KiB, gzip +1.5): NOT client-only. No startup timing taken (the lead measures under a quiet machine).

## Decisions for the Reviewer
1. Are negative parts acceptable in `min.parts` under `frame: false`?
2. The first and last blocks' outer strokes lose half a pixel at the crop edge: crop 1 px less to keep them whole?
3. Block-stack gets its own batch?
Not checked: Cloudflare, the whole web suite beyond the directories above.
