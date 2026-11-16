# GEM-1 + TOK-W (sprint 2)

Commit on feat/visual-sprint-2-flow (see the report for the sha). Files: flow.js, block-stack-layout.js, tensor-layout.js. hunk.diff is the commit. before = released main 74c4f68ae, after = this commit.

| figure | request | before | after |
|---|---|---|---|
| Gemma, minimized label (TutorDiagram test spec) | 440 | 598 x 1136 | 598 x 1136 |
| Gemma deep | 408 | 598 x 1136 | 598 x 1136 |
| Gemma deep | 320 | 418 x 1516 | 368 x 1628 (fits the card's 408) |
| gpt2 learned-position-lookup | 408 | 700 x 264 | 700 x 264 (already <= 720: it needs no shrink) |
| gpt2 fused-qkv-slices | 408 | 884 x 264 | 718 x 302 |

## GEM-1: nested-flow node minimum
Proposed number: 130 (NODE_MIN_NESTED in flow.js). The widest word of the Gemma reference's nested flows is "Sliding-window", 82 px; plus the node's 48 px padding is 130. Below 130 no node of that reference gets narrower, so it is the right floor for it. It applies only to a flow drawn inside a block stack (the derived child in block-stack-layout.js carries `nested: true`; no spec, schema or reference changed). Standalone flows keep 180.
What it changes: the minimum block is 228 -> 178 px, and the 320-room (minimized tile) Gemma is 368 px wide instead of 418, so it now fits the card (408) without scrolling.
What it does not change: at a 408 or 440 request the Gemma is still 598 wide. That width is the margin-note layout (four leaders): 24 + the preferred 234 px block + 93 + 73 of bands + a 174 px note band. The node minimum only matters when the block is squeezed, and the layout chooses margin notes above a 320 request regardless of room. Getting the 408 figure inside 408 needs a different rule (the numbered ledger below 598 px, or a narrower preferred block), which is outside "node minimum"; not changed here.
Wrapping: a label no longer wraps to exactly two lines at the minimum: at 130 the long attention label ("Sliding-window + GQA attention (5:1 local:global)") wraps to five lines in the 320 render, hyphenated names break at the hyphen ("Pre-/RMSNorm/1"). Two lines would need a node about 218 wide.

## TOK-W: tensor rows
A row of strips is held to tensorRowBudget(request) = clamp(720, request, 960): the card's 720 at a narrow request, the request when it asks for more, never above 960. When the row would be wider, tensorCellCap shrinks the cells as far as needed (cap 64 down to 12), never below their text plus 1.5 px. It applies to the tensor transformation (gpt2 fused-qkv-slices) and to the row of blocks (the token rows of fix 5, f17e8af18, whose cap was 960 flat).
fused-qkv-slices: 884 -> 718 at a 408 request; at 720 it is 720 and at 960 it is 960 (a wider request keeps natural cells).
learned-position-lookup is 700 at 408 before and after: already within 720.
The 1.5 px is the least that reaches 720 for fused-qkv: text + 4 gave 756, + 2 gave 724 (4 px over), + 1.5 gives 718. The text is tight against the cell outline in the 4-cell strips (see gpt2-fused-qkv-slices-408-after.png).
Not run: the test suite (this round). Pins that will move at the ship round: TutorDiagram.test.mjs and illustration-integration.test.mjs (the 320-room Gemma 418 -> 368), the token-row tests (budget 720 instead of 960 at a narrow request, e.g. ml-transformer-token-embeddings).

## GEM-1 reverted (owner 21:48 read)
The 130 nested-flow node minimum is removed (commit "GEM-1 revert"): NODE_MIN is 180 everywhere again, and the `nested` flag block-stack-layout.js put on its child flow is gone. Gemma widths are back to the released ones: deep at 320 = 418, at 408 = 598, at 440 = 598 (files gemma-*-revert.png / .html, revert-sizes.txt). The TOK-W budget text of this README is superseded by tok-w2/.
