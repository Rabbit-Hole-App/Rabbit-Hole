# kinds-fit r1: first delivery report

Branch feat/kinds-fit, tip 1785fbb77 (pushed), rebased onto main c56e4fcc8 (release 160). Commits: f7ab1d014 (the build), 1785fbb77 (restores the literal `size: 17, weight: 700` that interact-style.test.mjs pins; that test is not edited). Files touched, all in packages/web/src/tutor-diagrams/: TutorDiagram.js, ml-plot-layouts.js, plot-ticks.js, token-links-layout.js, and the new kinds-fit.test.mjs. PREBUILD.md (the "cannot be built as written" list, with the Reviewer's answers A to F folded in) is at 9296ac4ea. Images: images/ in this folder.

## Snapshot rule
svg-snapshots.test.mjs passes with svg-snapshots.json untouched: 3,283 fingerprints compared (main carries 3 more than the spec's 3,280, added by Codex). `git diff rabbit-hole/main HEAD` on that file is empty; UPDATE_TUTOR_SVG_SNAPSHOTS was never set. A second test pins it from the new side: with no options, or `{}`, the markup is byte-identical.

## Entry point
`renderTutorDiagram(spec, w, { box, sizes, parts })` returns `{ width, height, element, min, geometry }`.
- Options reach only the two fitted kinds (coordinate-plot, token-links); every other kind is called with no options (so today's pictures cannot change).
- `parts.title: false` and `parts.caption: false` work for every kind. `min` and `geometry` are computed lazily, so /explain's plain calls pay nothing.
- `min.width` is the narrowest width with nothing overlapping. `min.height` is the minimum height AT THE WIDTH DRAWN (D): a caller that wants the narrowest case calls again at `min.width`. (For the /interactive side: there is no second field.)
- `geometry` is an object for coordinate-plot, token-links and flow (flow passed through with the title offset; no box or sizes yet), and null for every other kind, tensor included (F).
- When `box` is given, box.width is the width and availableWidth is ignored; the 320-720 clamp and the kind's own minimum width do not apply; a box smaller than `min` draws at `min` and returns it (C).

## Worked examples (rebuilt from the spec's description; the pendulum card itself lives in the /interactive repo)
6.1 coordinate-plot, 312 x 312, all sizes 14, parts.title false:
- Drawn 312 x 312; every font-size is 14; plot area 214 x 190 (the spec's estimate was 220 x 170, an estimate not a target); left margin 74 (not 104); both axis ranges returned. `min` is { width 218, height 242 }. A box of 200 x 150 draws at 218 x 274 (nothing squeezed or overlapping).
6.2 token-links, six tokens, 632 x 152, all sizes 14, title and caption false:
- The box is below `min`: drawn 632 x 238; `min` is { 174, 238 }; every font-size is 14. `geometry`: 6 source boxes, 6 target boxes, 6 links with end points and weights. In a 632 x 400 box the rows spread and the picture is 632 x 400. A 150 x 100 box draws 174 x 1238 (one chip per row).
PNG and SVG of both, at the asked boxes and at a box smaller than `min`: images/.

## How `min` is computed
- coordinate-plot width: left margin (y-title band + widest y tick + 8) + a 120 px plot-area floor + a 24 px right margin + the end-label gutter; widened by the existing tick-crowding loop (12 passes in box mode), by the widest formula label, and by the widest caption formula if the caption is on.
- coordinate-plot height at the drawn width: a floor pass with the plot area at max(120, end-label height) plus everything under it (tick row, x title, legend rows).
- token-links width: the layout asked at width 1 in box mode, which is one chip per row (174 px at 14). Height at the drawn width: the same layout with the row gap at its 48 px floor; chips stay 56 px.

## Per kind: what stretches, min, roles read, geometry
| | coordinate-plot | token-links |
|---|---|---|
| Stretches | plot area; left margin sized to the ticks | the gap between the chip rows, then the width |
| min of its neutral example at 14 px, no title | { 209, 202 } | { 174, 238 } |
| Size roles read | title, heading (axis titles), body (ticks, values, curve names), small (legend, callouts, end labels) | title, heading (query line), body (token names), small (Source/Target, index numbers, weight badge, footer) |
| geometry | plot area, x and y { min, max, scale } | panels with sources, targets and links |
Legend (A): `auto` is today's behaviour; `none` draws no legend and no names on the curves; `always` draws a pill for one series too and never names on the curves.

## Tests, 0 fail
New kinds-fit.test.mjs, 11 tests: for each fitted kind the neutral example in the five boxes (632x312, 312x312, 632x152, 312x392, 312x232) at sizes 14, 12 and 16; a box smaller than min; the two worked examples; the parts and legend switches; a non-fitted kind. The whole tutor-diagrams test directory plus theme: 1,379 tests. Fast-path affected selection, 47 web files: 968 tests. geometry-lint lints flow only and flow is untouched, so for plot and token-links the check is "every geometry part lies inside the picture" instead.

## Bundle and startup beside 159
The worker bundle is byte-identical to 160's (28,287,424 bytes; Total Upload 10,149.83 KiB / gzip 2,573.72 vs 160's 2,573.73; 159's was 10,143.80 / 2,572.05): the renderer is client code, so worker startup cannot differ. Measured anyway: kinds-fit 1089, 897, 1083 ms against 160's 1107, 1098, 1066 ms; the machine was loaded (159 measured about 400 to 560 ms earlier), so absolute numbers are inflated and the pair is the same file. Client JS and CSS: +3,469 bytes (+0.009 %).

## Could not be built as written (details and file:line in PREBUILD.md)
- Tensor has no per-cell positions (`cells` in tensor-layout.js is a number), so it returns null geometry.
- 632 x 152 cannot hold six tokens at 14 px: it draws at min (238 tall).
- `min` rests on two floors chosen here because the spec gives none: a 120 px plot area and a 48 px token row gap.

## For the Reviewer to decide
- Are the 120 px plot floor and the 48 px row gap the right minimums?
- Tools used (kf-render.mjs, kf-min.mjs, affected-kf.mjs) are in this folder. Not checked: the whole web suite outside the affected selection; any run on Cloudflare.
