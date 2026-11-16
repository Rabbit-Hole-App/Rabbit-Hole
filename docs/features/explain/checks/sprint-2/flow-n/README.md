# FLOW-N (sprint 2)

Commit ab9829428 on feat/visual-sprint-2-flow (flow.js only; hunk.diff), on top of 35cf6e14e. before = 9a31040b0, after = this commit.

Rule: a row of four or more nodes lowers its node minimum, as little as it can (180 down in steps of 5, never below 120), until the row fits the width budget (the request, at least 720, at most 960) before the figure widens; at a lowered minimum a (non-decision, non-tensor) label never takes more than three lines. Rows of fewer than four nodes, decisions and tensors keep their minimums.

| figure | request | before | after |
|---|---|---|---|
| ml-gpu-matmul | 408 | 802 x 639 | 702 x 672 |
| ml-gpu-matmul | 720 | 802 x 639 | 720 x 672 |
| figure-grouped-query-heads | 408 | 802 x 450 | 702 x 450 |
| figure-grouped-query-heads | 720 | 802 x 450 | 720 x 450 |
| ml-moe-top-two-experts (control) | 408 / 720 | 955 x 559 | 955 x 559 (unchanged) |
Files: <figure>-<408|720>-<before|after>.png/.html, sizes.txt. (At a 720 request the figure is the request.)
Tests: flow.test.mjs, flow-lanes, flow-capsule run once: 27 tests, 26 pass, 1 fail = flow.test.mjs:391 "RD-2: a three-branch decision keeps its lanes; the digests are the markup under the sprint theme" (the sameSide digest, expected, FLOW-W).

## The other wide figures, one line each (all at a 408 request)
- moe-top-two-experts 955: a flow with a nine-node tier (Skip A-C, Run D, Run shared, Run E, Skip F-H) all on one row; the highlight-path rule already caps each node at 87 px (the 960 budget divided by nine), so FLOW-N has no minimum left to lower; it needs the tier to wrap onto two rows (a different change), or shorter labels.
- learning-families 940: a `tree` (hierarchy layout) of ten nodes, three branches with two leaves each, leaf labels such as "Dimensionality Reduction" and "Policy Optimization"; the tree layout, not the flow one, sets the width: FLOW-N does not reach it; a tree-leaf label wrap or a vertical layout would.
- bayes-class-token-counts 747: a `matrix` with a row heading and four columns whose headers are formulas ($P(t\mid spam)$ and the counts), a formula never wraps and its cell is sized from the formula at 15 px plus 18 (fix 6): matrix column padding sets it, FLOW-N does not reach it; 27 px over 720, a column padding of 5 px would do.
- depth-attention 721: a `token-links` figure (two source chips, three target chips, two queries); one pixel over 720 from the chip row widths: not FLOW-N; a one-pixel gap change in the token-links layout reaches it.
- retro-chunk-attention 960: a `token-links` figure with a single row of eight target chips ("Cedar's A", "archive A" ... "Tuesday B"); the row is as wide as its chips: not FLOW-N; it needs the same group wrap as the tensor rows (TOK-W) in the token-links layout.
