# FLOW-T2 (sprint 2)

Commit on feat/visual-sprint-2-flow (flow.js only; hunk.diff), on top of the TREE-W floor-100 commit (4e5615fae). before = 24cd2aa09.

It is one commit in flow.js, inside the wrapped-tier code and the highlight-cap node text, so it was built.
(a) The lanes of a gap that feeds a wrapped tier are ordered (the FLOW-X topological order, extra constraints only there) so that no other wire crosses a highlighted one: where another wire's drop or stem falls in the span of a highlighted run, or a highlighted stem or drop falls in the span of another run, the lanes are ordered so the two do not meet. The moe fan-out: the highlighted wire to Run E ran across the drop to Skip B, and the highlighted wire to Run D across the drops to Skip H and Run shared; those crossings are gone: crossings of a highlighted wire by another wire at 408, counted from the routed geometry (cross.mjs): before 6 (r>d x r>s, r>d x r>h, r>e x r>b, two segments each), after 0.
(b) A node under the highlight cap (two highlight paths: each node of a tier is capped at the budget divided by the tier size) keeps 15 px type: a long word takes the room of the padding (wrap width = max(w - 48, min(longest word, w - 16))), so "Run shared" is now two lines at 15 px instead of one smaller line. Node heights, so figure sizes, are unchanged.

| figure | request | before | after |
|---|---|---|---|
| moe-top-two-experts | 408 | 559 x 653 | 559 x 653 |
| moe-top-two-experts | 720 | 720 x 637 | 720 x 637 |
Files: moe-top-two-experts-<408|720>-<before|after>.png/.html, sizes.txt, lint-output.txt, cross.mjs.
Lint (geometry-lint real renderer): moe-top-two-experts, gpu-matmul, grouped-query-heads: 0 flags before and after.
Markup scan of all 1243 specs of the reference library at 408 (hashes in h-base.txt / h-now.txt): the only figures that differ from 24cd2aa09 are moe-top-two-experts (this commit) and learning-families (the floor-100 commit before it).
Tests: flow.test.mjs, flow-lanes, flow-capsule once: 27 tests, 26 pass, 1 fail = flow.test.mjs:391 "RD-2: a three-branch decision keeps its lanes; the digests are the markup under the sprint theme" (expected, not re-pinned).
