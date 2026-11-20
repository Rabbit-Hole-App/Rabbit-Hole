# STACK-C rework (2026-11-19)

Branch feat/rel-1, commit deee5d795 on top of 431ceb137 (pushed, no force; not rebased, so the hashes the Reviewer read still stand). Renderer only; no schema change; nothing feeds a prompt.

## The three rules (block-stack-layout.js, drawBlock)
1. A block that holds an inset (a child diagram of any kind) never takes the fill.
2. In a stack with at least one block whose role is `changed`, a block without a role stays unfilled, as before STACK-C.
3. Otherwise a leaf block without a role takes the step fill (process blue). `norm` stays transparent; a roled block keeps its own fill.

## Result
- Snapshots, this commit against 431ceb137: 67 keys in 19 ids (snapshot-changed-vs-431ceb137.txt). Against REL-1 alone (efe5a5207), which is the net STACK-C change: 39 keys in 13 ids (snapshot-changed-net-vs-rel1.txt).
- Unchanged from before STACK-C (0 changed keys against efe5a5207): ml-architecture-hybrid-routing, ml-gemma-decoder-stack-detailed, ml-transformer-token-embeddings, ml-transformer-weighted-values, ml-transformer-vocabulary-softmax-detail, ml-dense-vs-moe-architecture. On the sheet BEFORE and AFTER are identical for these, and the `changed` highlight in dense-vs-moe is back to being the only blue block.
- Keep the new blue (3 keys each): ml-what-is-machine-learning-dataset-split, d2l-cnn-shape-through-classifier, figure-vocabulary-interface-width.
- Also changed, not named in the order (leaf blocks, no inset, no changed block): ml-linear-regression-linear-unit, ml-neural-networks-hidden-layer, ml-regularization-regularized-objective, and shape-block-stack with its brief and detailed ids. On the sheet the blocks in the first three are small steps inside a larger figure; they go blue as steps do.
- Tests: new test in block-stack.test.mjs (inset block unfilled and a leaf beside it blue; a changed block keeps its fill and blocks without a role stay unfilled); block-stack.test.mjs 13 of 13; the whole tutor-diagrams directory 1622 of 1622. Not run on the old code (the new test is reasoned to fail there, not shown).
- Sheet: stackc-rework-p1..p4.png (BEFORE = efe5a5207, AFTER = deee5d795, 408 px, 13 specs). The two `-detailed`/`-detail` ids on the sheet are the depth and detail specs of ml-gemma-decoder-stack and ml-transformer-vocabulary-softmax. Wide specs (token embeddings, weighted values, dense-hidden-layer) are drawn at their native width and may be clipped by the page edge on p1/p2 where noted by the screenshot.
- sheet.mjs: the script that renders the sheet (reads two extracted trees under C:/s/stackc-sheet; not part of the repo).

Not checked: the whole web suite beyond tutor-diagrams; the live app.
