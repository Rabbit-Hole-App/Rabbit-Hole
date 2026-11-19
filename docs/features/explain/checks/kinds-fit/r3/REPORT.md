# kinds-fit r3: report (text-size rule, flow, tree, bar-chart label rule and range option, scale sources)

Branch feat/kinds-fit, tip aaa67cee2 (pushed), merged with main 8837d4a19 (release 161) as 570ff8074. Images: images/ in this folder (film/evidence 8d6496949). The Write tool refused the report to the lane's agent; the lead wrote this file from its text. r3 commits:
- 04d6bd9cf: matrix and heatmap text-size fix, plus the stress test
- bdf8b4288: flow
- a5fa72bd2: decision tree
- 3903449b0: bar value-label rule and `options.range`
- aaa67cee2: board-link allow-list line (d32d67bc8, r2, already added the token-links-layout.js line)
Release A carries r1 + r2 + r3 (everything on feat/kinds-fit) and NUM-2 as a separate part.

## Text-size rule ("never draw a text smaller than asked")
`wrap` steps a font size down when a word does not fit. In fitted calls (a box or sizes given) a node, column or label is now at least as wide as its longest word, so `min` grows and `min.parts` says which part. Fixed: matrix and heatmap (column minimums), flow (node width, edge-label wrap width), tree (node width, and the card label that was drawn at a default 15 px). Already clean: coordinate-plot, token-links, bar-chart. Test: the five earlier fitted kinds plus flow, five boxes at sizes 14, 12, 16 with unique long labels, every font-size equals an asked size: passes (kinds-fit.test.mjs 42 tests). Not covered: the title and caption wraps in the entry point can still step down; both are off in /interactive's calls.

## Flow (fitted)
Roles: body (node labels, 15 today), small (edge labels, 13 today). The extra height goes into the gaps between tiers. Geometry: nodes and edges as before (id, points already existed). min of the neutral example at 14 px: 208 x 281; a 150 x 100 box draws at 208 x 326. Floors: none new beyond node width >= longest word. The topology wrapper was dropping options: they are passed through now.

## Tree (fitted for the top-down binary and hierarchy layouts)
Roles body and small as flow; extra height goes into the row gaps. Geometry: nodes plus parent links (points). min: the library binary-tree example 354 x 255. Not fitted (geometry null, min = drawn size): dot trees, plain and outline trees, dendrograms and panels (a forest is a panels diagram of trees).

## Bar chart
- Value labels (Reviewer fix): in box mode a label is at most as wide as its bar: the unit goes first, then the label; with no options unchanged.
- `options.range = { min, max }` (owner approved), read only in fitted calls: a value outside is CLAMPED; the bar carries `clamped: true` and its original value; `geometry.range` is the range used (with no range it equals the derived axis; geometry.y kept); baseline and ticks follow the range; min accounts for it.

## Tests (0 fail)
svg-snapshots passes with svg-snapshots.json untouched (3,283 fingerprints); the no-options byte-identity test for each fitted kind passes. The whole tutor-diagrams directory (1,412) and the fast path's 62 affected web test files (1,127) pass; the only red was the board-link allow-list (one line, aaa67cee2). Not run: Cloudflare checks, the whole web suite.

## Bundle and startup against main 8837d4a19: THIS RELEASE IS NOT CLIENT-ONLY
The worker bundle changed too: +6,126 bytes (25,560,297 -> 25,566,423), Total Upload 9075.33 -> 9081.09 KiB, gzip +1.3 KiB (the server imports the renderer). Startup is not reportable: three alternating runs ranged 542 to 1539 ms active because the machine was loaded by other lanes. A quiet re-measure is needed before the launcher.

## Scale sources (read-only, nothing built; the owner's question)
| kind | where the scale comes from |
|---|---|
| coordinate-plot | fixed: the spec carries x and y { min, max } (ml-plot-spec.js:37, spec.js:45), used at ml-plot-layouts.js:246 |
| token-links | fixed 0..1: width and opacity from the weight (token-links-layout.js:47-48); raw weights can be normalised by derived.js, not by the layout |
| bar-chart plain and grouped | derived from the values (ml-plot-layouts.js:595-597); now overridable by options.range (:600). The legacy horizontal bars (quantitative-layouts.js:195) and stacked bars (ml-plot-layouts.js:686) also derive from values and are not fitted |
| heatmap | fixed when the spec writes `range`; otherwise derived from the cells (ml-statistical-spec.js:14, derived.js:127); the layout reads d.range (ml-statistical-layouts.js:21,43) |
| matrix, flow, tree | no value scale |

## Not done and decisions
Not done: tensor, layers, block-stack; stacked bars (excluded by decision). For the Reviewer: the release is not client-only (worker bundle +6 KiB): confirm Release A still goes as one release with NUM-2; startup to be re-measured quietly.
