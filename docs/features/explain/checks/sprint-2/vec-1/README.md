# VEC-1 (sprint 2, owner's choice): tuple cells are plain text

Commit on feat/visual-sprint-2-flow (new matrix-tuple.js; layouts.js `matrix` and ml-data-layouts.js `matrix`: one import and two lines each; hunk.diff), on top of the BAR-1 correction commit (fa83c7d28). before = 9d1bf9aa3.

Rule: in a matrix cell, a tuple-shaped formula (`$(0.12,-0.06)$`: parentheses, numeric entries separated by commas, nothing else) is drawn as plain text, "(0.12, -0.06)" with the formula's own minus sign (U+2212): the same characters and look, but text can wrap after its comma where a formula never wraps. The column holds the widest piece ("(0.12," or "-0.06)") at the cell's drawn size (15 px) plus the cell padding; no column wrap, no content change in the spec. Non-tuple formulas keep fix 6 (measured at 15 px, +18) in the teaching matrix and are untouched in the legacy matrix. Both matrix layouts get it (the two ids are in the legacy one).

| figure | 408 before | 408 after | 720 before | 720 after |
|---|---|---|---|---|
| figure-recurrent-channel-decay | 491 x 285 | 515 x 263 | 720 x 227 | 720 x 263 |
| figure-recurrent-channel-decay-detailed | 491 x 285 | 515 x 263 | 720 x 227 | 720 x 263 |
Nothing in the figure runs past its cell or the figure's edge (recurrent-channel-decay-408-after.png: each tuple on two lines after its comma). No figure is over 720 at a 408 request.
Other figures with tuple cells (scan of all 1225 specs, 408 request, before -> after; every one is <= 720): ml-word2vec-centre-and-context-tables 644 x 276 -> 408 x 379; ml-word2vec-embedding-row-update 408 x 457 -> 408 x 533 (deep 440 -> 516); ml-stable-diffusion-noise-target-table 408 x 398 -> 408 x 493; ml-stable-diffusion-conditional-training-rows 412 x 341 -> 432 x 357 (deep 339 -> 395). They get taller where a tuple now takes two lines and narrower where it set the width.
Files: recurrent-channel-decay[-detailed]-<408|720>-<before|after>.png/.html, h-base.txt / h-now.txt (markup hashes of all 1243 specs), scan-base.json / scan-now.json. No tests (this round).
