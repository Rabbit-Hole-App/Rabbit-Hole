# kinds-fit r2: report (bar-chart, heatmap, matrix; min.parts; what sets min.height)

Branch feat/kinds-fit, tip d32d67bc8 (code commit 8dca69434), merged with main b3b54c3b3 by a normal merge (a48f622fc) and a normal push. START-2's lazy spec.js did not affect the renderer. Images, probe and render scripts: this folder (film/evidence 58da113e3). The Write tool refused the report to the lane's agent ("Subagents should return findings as text"); the lead wrote this file from the agent's text.

## Rules kept
svg-snapshots.test.mjs passes with svg-snapshots.json untouched (empty diff against main), 3,283 fingerprints compared; UPDATE_TUTOR_SVG_SNAPSHOTS never set. With no options kinds-fit.test.mjs pins byte identity for all five fitted kinds. Nothing under explain-program/ or interact-*, no /explain caller, no spec or schema file edited.

## What sets min.height (the /interactive session's question)
- `min` is for the width drawn. A caller that wants the narrowest case calls again at `min.width`; there is no extra field.
- New, a pure addition: `min.parts`, an array of `{ axis, part, px }`. The parts of each axis add up to `min.width` and `min.height`, including the title and caption blocks and, where needed, a final "rounding up" part.
- The pendulum plot at 14 px in a 304 x 299 box, legend always: height = 21 (top margin) + 120 (plot area floor) + 31 (x ticks) + 30 (x title) + 40 (legend rows) = 242. A series name that no longer fits one pill row grows the legend part from 40 to 90, so min.height goes 242 -> 292: the same wrap that took their build from 277 to 309.

## Per kind (sizes 14, box 312 x 312; min = width x height)
| kind | min | what stretches | geometry | roles read | parts |
|---|---|---|---|---|---|
| bar-chart, plain and grouped | 206 x 204 (grouped 3 x 2 in a 408 box: 271 x 240) | plot area (at least 120 with a box) | plotArea, y range, baseline, bars [{ label, series, value, x, y, width, height }] | title, body, small | legend (auto, none, always), values: false |
| heatmap | 284 x 226 | rows share the leftover height | cells [{ row, col, x, y, width, height, value }], row and column headings, range | title, heading (column title), body, small | scale: false |
| matrix | 254 x 156 | rows share the leftover height | cells [{ row, col, x, y, width, height }], row and column headings | title, body | none |
Not fitted: stacked bar charts and a matrix with layout 'teaching' keep today's drawing: geometry null, min equal to the drawn size, no min.parts. Floors chosen here: a bar at least 10 px wide, a plot area at least 120 (the r1 floor).

## Tests, 0 fail
kinds-fit.test.mjs 26 tests: the five boxes at sizes 14, 12 and 16, a box below min, the min.parts sums, the legend rows, the part switches. The whole tutor-diagrams directory (1,394 tests) and seven test files outside it that import the renderer. One red outside this lane: inline-ai-annotation.test.mjs 'every reader of board links' flags derived.js (TEST-3, fixed on feat/heat-1 / release 161); this branch also made it flag token-links-layout.js, so d32d67bc8 adds that one allow-list line (a merge of 161 will show both lines; no conflict expected, different lines).

## Bundle and startup beside main b3b54c3b3
The worker JS modules are the same set of lines; the bundles differ only in embedded HTML shells and multipart framing. Total Upload 9073.82 -> 9077.91 KiB (+4.1 KiB, gzip +0.9). Active startup, three alternating runs on a quiet machine: main 283, 194, 188 (median 194) against this branch 201, 186, 187 (median 187): no difference. Client-only release.

## Caveats and decisions for the Reviewer
- The heatmap draws one 13 px text at size 14 because `wrap` steps a word down when it does not fit; nothing is larger than asked.
- A grouped bar value label with a unit ("7 books") can touch the next bar: today's rule, left as is.
- Stacked bar charts are the one bar form left out: next batch?
- Next batch from the spec's order: tensor, layers, block-stack, flow, tree.
- Not checked: Cloudflare, the whole web suite outside the files above.
