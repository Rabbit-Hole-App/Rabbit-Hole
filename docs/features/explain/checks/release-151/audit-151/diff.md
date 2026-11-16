# AUDIT: structural diff, every snapshot id at width 408 (5f29c23a6 against 2b91f167a)

Before = 5f29c23a6 (left on the sheets), after = 2b91f167a (right). Ids: the snapshot ids with a 408 key in `svg-snapshots.json` (221 reference, 847 illustration case, 22 kind-gallery shape) = 1090 ids. Rendered with each tree's own `renderTutorDiagram(spec, 408)`; a figure can be wider than 408 when it needs it (the `width-changed` flag; `wider-than-720` must be empty).

## Summary: ids per flag

| flag | ids |
|---|---|
| render-error | 0 |
| only-before | 0 |
| only-after | 0 |
| smooth->straight | 0 |
| straight->smooth | 0 |
| closed-shapes-changed | 0 |
| markers-changed | 0 |
| badges-without-key | 0 |
| badges-without-key (same before) | 13 |
| text-overflow | 0 |
| elements>30% | 0 |
| width-changed | 0 |
| wider-than-720 | 0 |

Ids with at least one flag: 13 of 1090. Ids by number of flags: 0 flags: 1077, 1 flags: 13.

Ids wider than 720 px at a 408 request: **0** (the list is empty).

## Flag rules (regex measurement of each tree's SVG string; `audit-render.mjs` + `audit-combine.mjs`)
- smooth->straight / straight->smooth: number of `<path>` elements whose d contains a cubic `C` command, before vs after (0 vs more than 0). Flow wires use `Q` corners and are not counted.
- closed-shapes-changed: count of closed shapes differs: polygons with 4+ points larger than a marker (not arrowheads) plus paths that end in Z or return to their first point using only L segments.
- markers-changed: small circles (r up to 8) + small squares (w = h up to 14) + diamond markers differ by more than 25 percent or one side is 0.
- badges-without-key: after has a numbered badge (a circle r 6-14 followed by a text of 1-2 digits centred on it) whose number has no text line starting "N. " / "N) "; "(same before)" when the before render has exactly as many.
- text-overflow: an ESTIMATE (the renderer's own `textWidth`, which ignores weight): a text wider than its `data-tutor-node` box or than the figure; flagged when the after render has more than the before render. HTML `foreignObject` text is not measured.
- elements>30%: SVG element count differs by more than 30 percent. width-changed: the figure width (rounded) differs. wider-than-720: the after figure is wider than 720 px.

## Per id (sorted by number of flags, then id; only flagged ids; all data in diff.json)

Counts are `elements / C commands / closed shapes / markers+squares+diamonds / badges:without key / overflows / width x height`.

| id | set | flags | before | after | overflow detail (after) |
|---|---|---|---|---|---|
| general-figure-4 | ref | badges-without-key (same before) | 67/0/0/4+0+0/8:8/0/408x429 | 67/0/0/4+0+0/8:8/0/408x429 |  |
| general-figure-5 | ref | badges-without-key (same before) | 56/0/0/2+0+0/6:6/0/408x451 | 56/0/0/2+0+0/6:6/0/408x451 |  |
| general-figure-6 | ref | badges-without-key (same before) | 64/0/0/4+0+0/8:8/0/408x396 | 64/0/0/4+0+0/8:8/0/408x396 |  |
| general-number-line-8 | ref | badges-without-key (same before) | 40/0/0/2+0+0/4:4/0/408x237 | 40/0/0/2+0+0/4:4/0/408x237 |  |
| ml-gpt2-tied-output-weights-detailed-detail | illus | badges-without-key (same before) | 58/0/0/4+0+0/2:2/0/408x332 | 58/0/0/4+0+0/2:2/0/408x332 |  |
| ml-mle-steps | illus | badges-without-key (same before) | 42/0/0/0+0+0/4:4/0/408x393 | 42/0/0/0+0+0/4:4/0/408x393 |  |
| ml-mle-steps-brief | illus | badges-without-key (same before) | 42/0/0/0+0+0/4:4/0/408x393 | 42/0/0/0+0+0/4:4/0/408x393 |  |
| ml-mle-steps-detailed | illus | badges-without-key (same before) | 42/0/0/0+0+0/4:4/0/408x393 | 42/0/0/0+0+0/4:4/0/408x393 |  |
| ml-word2vec-trait-rescale | illus | badges-without-key (same before) | 38/0/0/0+0+0/4:4/0/408x255 | 38/0/0/0+0+0/4:4/0/408x255 |  |
| ml-word2vec-trait-rescale-brief | illus | badges-without-key (same before) | 37/0/0/0+0+0/4:4/0/408x233 | 37/0/0/0+0+0/4:4/0/408x233 |  |
| ml-word2vec-trait-rescale-detailed | illus | badges-without-key (same before) | 65/0/0/0+0+0/4:4/0/408x255 | 65/0/0/0+0+0/4:4/0/408x255 |  |
| shape-figure | shape | badges-without-key (same before) | 37/0/0/2+0+0/4:4/0/408x295 | 37/0/0/2+0+0/4:4/0/408x295 |  |
| shape-number-line | shape | badges-without-key (same before) | 45/0/0/2+0+0/2:2/0/408x210 | 45/0/0/2+0+0/2:2/0/408x210 |  |
