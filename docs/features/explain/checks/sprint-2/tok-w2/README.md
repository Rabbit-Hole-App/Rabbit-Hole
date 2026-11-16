# TOK-W replaced (sprint 2, owner 21:48 read)

Commit on feat/visual-sprint-2-flow (tensor-layout.js, block-stack-layout.js; hunk.diff). Before = released main 74c4f68ae, after = this commit.

Rule: cells keep their natural width, 36 px or the width of their text plus 12 (the shrinking budget, the 1.5 px minimum and fix 5's cap are all removed: no cell is ever below its natural width). A tensor transformation, or a horizontal row of blocks, wider than the row budget (the request, at least 720, at most 960) wraps at group boundaries onto the next row:
- transformation: the before group is row 1, the after group row 2; one blue arrow leaves the end of row 1, goes down past the left of row 2 and enters its start (right, down, left, down, right). The group's own links (rails) are drawn only when the groups fit on one row; on a wrap they are replaced by this one arrow (the figures with links that wrap: none of the eighteen tensor figures that were over 720; ones that fit keep their rails).
- row of blocks: blocks fill a row up to the budget and the rest go to the next row, left edge aligned, reading order left to right then down; a block heading is one line (a block is at least as wide as its heading).
- group headings are one line (a group is at least as wide as its heading at weight 700).
- strips are top-aligned in a row: items whose labels or names wrap differently reserve the same height above their cells ("State for “light”" and "Query/Key/Value" now start their cells at one height).

Files: <figure>-<408|720>-<before|after>.png/.html and sizes-before.txt / sizes-after.txt (all for fused-qkv-slices, token-embeddings, residual-arithmetic, weighted-values, parallel-attention-heads, vocabulary-softmax). widths-table.md: every tensor figure whose width changed, plus the figures still over 720.

Result: every figure with a tensor strip is <= 720 at a 408 request (scan of all 1222 specs of the five reference groups: 46 contain a tensor strip, 0 over 720 after, 18 over before). No group is wider than the row on its own, so no tensor figure is left over.
The owner's list, 408 request, before -> after: token-embeddings (1110 in the owner's reading, 942 at 74c4f68ae after fix 5) 942 -> 564; residual-arithmetic 1164 -> 612; fused-qkv-slices 884 -> 676; weighted-values 874 -> 562; parallel-attention-heads 848 -> 572; qkv-projections 770 -> 482; vocabulary-softmax 762 -> 638; gpt2 learned-position-lookup 700 -> 700 (unchanged, one row).
NOT tensor figures (they contain no tensor strip; their width is flow node rows, not cells): grouped-query-heads 802 (826 now) and gpu-matmul 802. The tensor wrap cannot reach them; they are flows of 4 nodes in one row (4 x 180 + gaps). Listed in widths-table.md with the other figures over 720: ml-moe-top-two-experts, retro-chunk-attention (token-links), learning-families (tree), bayes-class-token-counts (matrix), depth-attention (token-links, 721).

## Two things to know
1. The one-line headings widen some figures that were narrower: partial-rotary-head-width 440 -> 536, gpt2-learned-position-decoder 408 -> 486, retro-encoded-neighbor-rows 588 -> 654, latent-query-and-kv 580 -> 616, qkv-projections overview 554 -> 605 (all <= 720; a heading that used to wrap is now one line).
2. moe-top-two-experts 955 -> 1125 and grouped-query-heads 802 -> 826 came from the earlier FLOW-W commit (a decision row past the budget took a two-line minimum wider than the one-line plain minimum). Fixed in its own commit (FLOW-W: never wider than the minimum it replaces): moe 955 and grouped-query-heads 802 again, three-arrivals still 697. So moe is 955, grouped-query-heads 802, and illustration-embedded-layouts.test.mjs:106 passes again.

## Tests run singly (not re-pinned; failing assertions, from test-failures.txt)
block-stack.test.mjs: 11 tests, 9 pass. block-stack.test.mjs:212 "horizontal token blocks keep reading order and native cell size at every width": AssertionError: Expected values to be strictly equal. block-stack.test.mjs:239 "horizontal block stacks reject vertical topology and retain an oversized native width": AssertionError: The expression evaluated to a falsy value.
tensor.test.mjs: 4 tests, 2 pass. :61 "Q/K/V uses four natural-width strips on a single row with three mapped arrows": falsy value (it wraps now: 770 > 720). :104 "tensor transformations keep mixed text items and respect explicit mapping indices": AssertionError: Use this pair.
illustration-integration.test.mjs: 6 tests, 5 pass. :96 "the walkthrough token, value and vocabulary sequences use one row at every depth": AssertionError: ml-transformer-token-embeddings (it wraps to two rows).
illustration-embedded-layouts.test.mjs: 4 tests, 3 pass. :106 "a nine-box parallel tier fits within 960 pixels without dropping labels": AssertionError: tier needs 1125px (this is the moe/FLOW-W width above, not the tensor rule).
token-links.test.mjs 8 pass; ml-data.test.mjs 12 pass.
