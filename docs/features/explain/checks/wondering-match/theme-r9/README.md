# theme r9: per-kind defaults from the r8 sheet (feat/visual-sprint, on r8 63cfca6ca)

`contact-sheet.png`: the same twelve references as r8 plus the two plots (accuracy-by-trees, gini-vs-entropy), specs unchanged; each figure also as `<kind>--<id>.svg`, `.png` (2x), `.spec.json`. Matrix, heatmap, timeline and block-stack were left as they were.

## Shared (primitives.js, teaching-theme.js)
- `wire(points, options)`: the one wire for a route: 2 px ink (3 px and the path colour when active), quadratic 8 px corners, a filled 12 x 8 head whose tip stops 2 px short of the target; flow.js now uses it. `backEdge(from, to, laneX)`: leaves on the right, runs up a lane, re-enters on the right (the loop of a cycle; the drawing a flow back-edge will need, VC-2 still refused in the schema).
- `mixHex(top, under, amount)`.

## Plots
- Legend pills: the series colour at 18% over the ground, 1.5 px outline and 12 px / 500 text in the series ink, a 9 px marker with an ink ring, height 22, rx 11, padding 10, gap 8; the width is the content width (marker, 6 px, measured text, padding), no minimum. Same pills under bar charts.
- The x title's centre is 24 px under the tick labels' centre.

## Kinds
- sequence: actor boxes 48 high, rx 10, one fill each (blue, teal, mustard, lavender, then coral, olive, rose, slate); lifelines 1.5 px dashed #D9D3C3; arrows are `wire`; a one-line message sits on its arrow in a ground gap, 13 px / 500. A message that needs more than one line stays above its arrow (a gap would cut most of a short arrow; `shortcut:` in the code): 4 of the 6 messages of ml-rag-retrieval.
- cycle: steps are process nodes (56 / 72 high, at least 180 wide, 24 px padding, blue, rx 9), centred; the return edge is `backEdge` up the right side, re-entering the first node from the right; the loop label is the fixed word "repeat" on the vertical run in a gap (the cycle spec has no loop-label field).
- relationship: routes are `wire`; badges 20 px, ground fill, 1.5 px outline, 13 px / 600; nodes at least 180 x 56; the route legend stays, 13 px muted.
- sample-set: chips 13 px / 500 with the letter 15 px / 600; counts, "Omitted" and the like 13 px muted.
- histogram: coordinate-plot rules (no axis lines, dashed guide at the top value, solid zero line the bars sit on, 15 px ticks, bin edges as the x tick labels, bold centred titles); the counts line is dropped. A long y title ("Count density (count / s)") stays above the plot because it does not fit rotated.
- box-plot: whiskers 2 px, fences 1.5 px dashed #786860, median 3 px, outlier 12 px coral with a 2 px ring, "Reading" axis without a line (dashed guide, 15 px ticks at min and max, bold centred title), readouts 13 px muted. No vertical guides through the boxes (the readout text would cross them).
- tensor: cells 36 x 36, rx 4, blue by default (a role keeps its blue, mustard or teal), 1.5 px outline, digits 15 px / 600, dimension label 13 px muted, row label 15 px / 600. The strip is shared, so tensor nodes inside flows, relationships, transformations and block-stacks changed too.
- token-links: link stroke 1.5 to 6 px by weight in the blue ink at 0.35 to 1.0 opacity; badge 24 px tall, a circle for short weights and a pill when the digits need room ("0.45" does not fit a 24 px circle at 13 px / 600); token boxes at least 56 tall with the position digit 13 px muted. A zero-weight link is no longer dashed (`wire` has no dash): a 1.5 px line at 35% opacity.

## Tests
Not run this round. The SVG snapshot file was regenerated. Expect more of the pinned tests (tensor, token-links, block-stack, sequence and cycle in kind-gallery, flow) to move; the full recount is part of the ship round.
