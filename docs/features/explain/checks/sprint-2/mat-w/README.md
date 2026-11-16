# MAT-W (sprint 2): matrix column header padding

Commit on feat/visual-sprint-2-flow (ml-data-layouts.js only; hunk.diff), on top of TREE-W (68645831f). before = 77218dcad.

Rule: a column header's minimum cell is its formula measured at 15 px plus 8 (cells and row headings keep fix 6's +18, measured at 15 px); the header text is wrapped at cell width - 8 (was - 14), so the formula fits whole and is never clipped or scaled. A plain-text header that has operators (a + b, a = b) and still does not fit wraps after an operator when it has no space to wrap at.

| figure | request | before | after |
|---|---|---|---|
| bayes-class-token-counts | 408 | 747 x 276 | 697 x 276 |
| bayes-class-token-counts | 720 | 747 x 276 | 720 x 276 |
(its natural width is now 697; at a 720 request the figure is the request.) Files: bayes-class-token-counts-<408|720>-<before|after>.png/.html, sizes.txt; the $P(t \mid spam)$ headers are drawn whole.
Side effect (scan of all 1225 specs): other `matrix` figures whose header used to wrap in a cell now fit one line in the wider header box and are one line (16 px) shorter at 408: ml-psi-bin-contributions 1167 -> 1151, ml-transformer-scaled-attention-scores 438 -> 422 (deep 421 -> 405), d2l-adam-per-coordinate-rescaling 422 -> 406 (overview 441 -> 425, deep 422 -> 406), figure-vocabulary-interface-width detail 381 -> 365, figure-compare-sparse-decoder-family 516 -> 500 (overview 494 -> 478, deep 516 -> 500). Widths unchanged.
Tests run singly: ml-data.test.mjs 12 pass; TutorDiagram.test.mjs 8 pass; ml-composition.test.mjs 15 pass; spec.test.mjs 19 pass: no failures.
