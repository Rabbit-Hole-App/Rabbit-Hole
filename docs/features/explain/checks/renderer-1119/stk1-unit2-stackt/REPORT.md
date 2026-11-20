# STK-1, UNIT-2, STACK-T (renderer lane, 2026-11-19)

The lead wrote this from the lane agent's text and looked at the three before/after pictures itself. Each fix is on its own branch off main aee3dba82 (release 167), one commit each, pushed, no force. Renderer only; nothing feeds a prompt, a schema or a request hash. None is in a release.

## STK-1 (feat/stk-1, 3a3050ea34552574943d29ca01789884dacab7ca)
- Cause: the block-stack repeat bracket line was drawn as one continuous line under its "x6" pill (block-stack-layout.js).
- Fix: the bracket is two polylines that stop 4 px short of the pill, so the pill sits on the ground colour with the line broken behind it.
- Count first: 22 snapshot ids have a repeat bracket with a pill: ml-transformer-encoder-stack, ml-llama-decoder-block, ml-gemma-decoder-stack, ml-transformer-original-decoder-sublayers, ml-architecture-hybrid-routing, ml-architecture-shared-core, each at standard, -brief and -detailed; figure-gallery-window-layer-schedule at standard, -brief and -detailed; figure-decoder-depth-and-width-knobs-detailed-detail.
- Snapshots: 67 keys in exactly those 22 ids (widths 408, 960 and natural; 320 for gemma-detailed). Nothing else moved.
- Test: new, in block-stack.test.mjs; fails on the old layout and passes on the new (run by the agent against the old file). Whole tutor-diagrams directory 1620 of 1620.
- Picture: stk1.png (sublayers, -brief and -detailed; the -detailed tile is cut at the bottom of the PNG). Seen by the lead: after, the bracket has a clear gap above and below the pill.

## UNIT-2 (feat/unit-2, b9ab321a476ae83a586179cb4745e5be6da59022)
- Cause: an axis title is built as "label (unit)" in seven layout files; a label that already ends with its unit printed it twice ("Time (ms) (ms)").
- Fix: new axis-title.js, titleWithUnit(label, unit): the unit is not appended when the label already ends with it, bare or as "(unit)", case-insensitive, ignoring surrounding spaces (a bare suffix after a letter or digit does not count: "Loss" with unit "s" still gets "(s)"). It replaces the seven places (ml-data-layouts, ml-plot-layouts, ml-plot-spec, ml-statistical-layouts, ml-statistical-spec, ml-topology-layouts, quantitative-layouts); the text descriptions follow.
- Count first: (a) library and gallery: 0 specs print a doubled unit now (a text scan flagged ml-word2vec-embedding-row-update and its -detailed, a false positive: the vector "(0.05, -0.3, 0.35) (0.05, -0.3, 0.35)"), so no snapshot moves. (b) saved bench cards on disk: 15 results files with diagrams, 1332 unique diagrams, 24 print the doubled unit, all box plots ("(ms) (ms)" x21, "(min) (min)", "(k) (k)", and "ms (ms)" for a label "ms" with unit "ms"); after the fix 0 of 24. Locations: gen1-r1-bench idx 26, 127, 128, 154, 155, 156, 185, 214; gen1-r3-bench idx 92; var-1-bench idx 128 to 132; film-evidence box-1 v2 idx 14, 15 and v3 idx 14, 15. 21 unique saved diagrams do not render at all and were not examined.
- Snapshots: 0 keys changed (the regenerated file differed by line endings only and was reverted); svg-snapshots.json is not in the commit.
- Tests: axis-title.test.mjs, 3 tests (the label function; a box plot "Seedling height (cm)" with unit cm, which fails on the old code; a library-wide check for a doubled "(unit)", which passes on old code because the library has no case). Whole directory 1622 of 1622.
- Picture: unit2.png (three bench box plots). Seen by the lead: "Time (ms) (ms)" now "Time (ms)", "Delivery time (min) (min)" now "Delivery time (min)", "ms (ms)" now "ms".

## STACK-T (feat/stack-t, d0bbbc3a183ee740a1c240c324c2ad5bdb0a1617)
- Fix: in ml-plot-layouts.js a stacked-bar detail line with no negative part reads "total <sum> [unit]" instead of "+N / 0; net N"; with a negative part the old text is unchanged.
- Count first: (a) library and gallery: 3 specs print the no-negative line: tree-impurity-mixtures (3 lines), bias-variance-decomposition (3 lines, including "+11 / 0; net 11") and boosting-signed-corrections (1 line, plus 2 lines that do have a negative part). (b) saved bench cards: 14 unique stacked bars, 13 print the no-negative line (gen1-r3-bench and var-1-bench, idx 7, 8, 29, 30, 51, 52, 1006 to 1009); after the fix 0 of 13 and 27 "total N" lines.
- Snapshots: 9 keys in 3 ids (bias-variance-decomposition, boosting-signed-corrections, tree-impurity-mixtures; 320, 408, 720), exactly the 3 carriers.
- Test: new, in ml-plot.test.mjs ("total 11 pts", "total 8 pts", no "net" or "/ 0"); fails on the old layout; the mixed-sign "net 3" and "net -1" test still passes. Whole directory 1620 of 1620 (this branch does not carry UNIT-2's 3 tests).
- Picture: stackt.png. Seen by the lead: "total 11" replaces "+11 / 0; net 11"; the mixed-sign groups of boosting-signed-corrections are unchanged. In bias-variance-decomposition the line wraps so "total 11" sits alone after "Noise: 2 ·"; the old line also wrapped and the wrapping was not changed.

## Notes
- Snapshot ids by fix: STK-1 22 ids, UNIT-2 none, STACK-T 3 ids. The three branches touch different files and each regenerated svg-snapshots.json only for its own ids, so svg-snapshots.json will conflict when they and the REL-1 branch are assembled; regenerate it once on the assembled tree.
- Not checked: the whole web suite beyond tutor-diagrams on these three branches; the live app.
- Lane worktree: C:/s/stk-lane (a node_modules junction inside it points at teaching-palette: never delete it recursively). Scratch: C:/s/stk-lane-out/.
