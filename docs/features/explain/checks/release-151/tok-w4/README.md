# TOK-W4 evidence: the wrapped tensor form keeps its mapped arrows and link labels

Branch feat/r151-tensor, base 5f29c23a6. Source 57077b315, test pins 2bac4d73b. Files: `<name>-before-<w>` (main) and `<name>-after-<w>` (branch), .svg and .png, at 320, 408, 482, 720, 960. `render.mjs` made them.

Names: `qkv` = ml-transformer-qkv-projections (spec), `qkv-deep` = its deep depth, `mixed` = the tensor.test.mjs fixture (one labelled link 'Use this pair'), `labelled` = a synthetic stress fixture (two inputs, three outputs, labelled and plain links, a 2-line label). Of the 33 tensor transformations in the reference library only the QKV spec and its deep depth carry links; the other 31 have no links and are untouched (their wrapped form keeps its one wrap arrow, SVG byte-identical).

## Rule (tensor-layout.js, wrapped branch)
- Links exist: no wrap arrow. Each link is one `wire` (2.5 px, active colour, 12x8 head): source item's bottom edge at its centre, down to a lane in the gap under row 1, along the lane, down into the target item's top edge at its centre. Same stem/rail grouping as the one-row form (unlabelled links of one source share a lane; each labelled link has its own lane). Each carries `data-tutor-tensor-link="from:to"`.
- Label: wrapped like the one-row form, drawn above its lane (13 px, ground halo from `label`), at the free x nearest the middle of its run; blocked x = every other route's stem or drop that passes through the label's band, plus its own stem.
- Lane order: brute force over lane orders (up to 6 lanes) minimising crossings between routes.
- Row-2 heading: stays above row 2 (as before) at the free x nearest its group's centre that the drops clear. If the drops leave no gap as wide as the heading (QKV at 408 and 482: strips 105/261/397 apart, heading 169+ wide), the heading stands first in the gap under row 1, at the free x nearest centre that the source stem clears.
- Gap grows only by what is drawn: lanes (8+8 px each) plus the label height + 5 for a labelled lane. QKV is 444 -> 442 tall (one lane, no label); widths are unchanged everywhere.

## Decisions and limits
- Drops cannot pass a heading, so it moves. QKV at 408/482 shows the heading left of the stem under row 1; at 720 it sits left of the Query drop above row 2. Both are off-centre; a centred heading would be crossed by the Key arrow.
- Routes end at the item's top edge (the strip's name sits just under it), as in the one-row form.
- shortcut: more than 6 lanes keep link order; a label or heading that finds no free x stays centred over its run (does not occur in any reference). Entry is always the target item centre, so two links into one item overlap their last segment.
- A requested width under the natural width is rendered at the natural width (482 for QKV, 468 mixed, 560 labelled), as before.
- No spec, schema, reference or colour change.

## Tests
tensor.test.mjs (4/4): the Q/K/V test now expects three arrowheads and links 0:0, 0:1, 0:2 at 408, natural and 960; the mixed test expects 'Use this pair' and link 1:1 at 408. Also green singly: illustration-integration, teaching-layouts, reference-single-variants, ml-reference-integration, content-contract.
svg-snapshots.test.mjs fails on exactly 4 ids (svg-snapshots.json not regenerated): ml-transformer-qkv-projections/408, ml-transformer-qkv-projections/natural, ml-transformer-qkv-projections-detailed/408, ml-transformer-qkv-projections-detailed/natural.
