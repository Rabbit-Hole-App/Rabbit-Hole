# Lane 3 (2026-11-19): NUM-3a fix, NUM-3b count, BOX-1 prep, notes from the R3-pre read

The lead wrote this from the lane agent's text. No paid or provider call; nothing refused. Scripts and outputs: C:/s/gen1-prep/ (num3a-scan.mjs, num3b-archive.mjs, box1-methods.mjs, box1-library.mjs, render-one-katex.mjs, cell15-REF-alone-katex.png).

## NUM-3a (feat/num-3a 69e006eb5, off main a2736974f; derived.js and spec.test.mjs; pushed normally)
- The softmax word trigger (derived.js:77) read the title and operation only. Now `softmaxInstance` fires when the word "softmax" or the phrase "exponential and normalize" appears in the title, the operation, the before label or the after label (a new `SOFTMAX_WORD` regex plus the labels). The structural conditions are unchanged.
- R3-pre cell 5 (PLAN arm; before 'Raw Scores', after 'Softmax Weights', operation 'Apply exponential and normalize', values 0.5, 2, 1): main accepts it; the branch rejects it with "softmax(0.5, 2.0, 1.0) = 0.14, 0.63, 0.23, not 0.10, 0.45, 0.45", tagged arithmetic.
- False positives: 0. Scan of 146 distinct list-form transformations (library, gallery, VAR-1 and R1 benches, section-6 and 6b, the R3-pre PLAN arm); 73 had numeric before and after items. The trigger newly recomputes 7 cards it skipped before, all 7 with the real softmax shape (after values positive and summing to 1); 2 of the 7 are now rejected and both are real wrong-number cards (R3-pre cell 5; a section-6b card with 0.70/0.26/0.04 for logits 2.0/1.0/0.1, correct 0.66/0.24/0.10); the other 5 are correct and still pass; no other diagram's parse result changed.
- Tests, 0 fail: a new test beside the softmax tests; spec 29, derived 11, svg-snapshots 1 (file untouched), kind-gallery 28, kind-gallery-depths 126, ml-reference-integration 474; the whole tutor-diagrams directory with theme 1413 of 1413. The 470 request hashes and the 474-row replay identical to the baselines. Residual risk: a card with 'softmax' only in a label whose after values are positive but not softmax-shaped would now be rejected (same as a title that says softmax); none found.

## NUM-3b (numeric-to-numeric transformations with no `op`), by operation named
| source | softmax | log | scale | other | total |
|---|---|---|---|---|---|
| library and gallery | 0 | 0 | 0 | 0 | 0 |
| saved cards (benches, sections, R3-pre) | 46 | 0 | 23 | 4 | 73 |
| 8878 archive (122 objects) | 0 | 0 | 0 | 0 | 0 |
No card carries a declared `op`. R3-pre cell 1's ln card is not counted: its last row ("15, 31, 63, 127") is not a plain number, so the numeric filter skips it. What code could check: for a named log or scale operation a rule could recompute ln, log10 or x/c per item; it needs an `op` of log or scale (like `op: 'softmax'`) plus a base or factor (like `t`), since otherwise it cannot tell ln x from ln(1+x).

## BOX-1 prep (report only; stop)
- Which arm: 24A PLAN (median 71 for data whose median is 68.5), 23B PLAN (Q3 10 where Q3 is 11.5), 27B PLAN (caption 125 against drawn 122.5), 23A REF (caption "upper fence 19" against drawn 20.5), 25A REF (caption "5 and 37" against drawn 4 and 36).
- Data and quartile methods: cell 23 data 3, 5, 6, 7, 8, 9, 11, 12, 40: excluding the median Q1 5.5 and Q3 11.5 (the REF card matches, the PLAN card drew 10); including the median or the linear method gives 6 and 11. Cells 25 and 27: both arms drew Q1 and Q3 that match no standard method (cell 25 drew Q3 24 where the methods give 24 or 24.5).
- Method in the code: none is fixed. `checkBoxes` (ml-statistical-spec.js:154) and `boxFences` (derived.js:36) compute fences from the WRITTEN Q1 and Q3 and check order and whiskers only.
- Raw `values`: an optional `values` number array on each box fits; code could then compute Q1, median, Q3, whiskers and outliers with one fixed method and flag a mismatch with the written statistics. Cost for Gemini: +1 counted property (203 to 204 in a box-plot-required author schema; the box-plot kind alone is 21), far below 362. Library box-plot references: one (`iqr-fences-and-outliers`, one box); with `values` optional none changes.
- Caption numbers: the token fill covers only the card's prose (`body` and `more`), not text inside the diagram JSON, and the failing captions live in the diagram, so a diagram-caption token fill would have to be added. `{{d:boxes.0.fences.upper}}` already resolves in prose; IQR is not a derived path (it would need a derived row). A by-code check of caption numbers against the drawn statistics is feasible for box-plots only, mapping words like 'upper fence' and 'IQR' to paths.

## Notes
- Cell 13 PLAN token-links: the renderer draws every source-to-target arrow at 1.5 px and 35 % opacity even when the weight is 0 (token-links-layout.js:47-48); under a causal mask it looks like attention to later tokens. A renderer convention, not the model's data.
- Cell 16's title shows raw "w_1+w_2=1": the model wrote it without `$` delimiters and titles are plain SVG text: a content issue, not a renderer fault.
- Cell 15 REF's empty band: neither the renderer nor the sheet tile as such: the caption formula is a KaTeX foreignObject that paints nothing without the KaTeX stylesheet; both the sheet and the alone-render lack it; with the stylesheet injected the caption renders correctly under the table. Every sheet tile with a formula caption has this empty band, so the sheet generator should load katex.min.css.
