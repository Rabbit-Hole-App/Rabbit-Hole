# FLOW-T (sprint 2): a flow tier that cannot fit wraps onto two rows

Commit on feat/visual-sprint-2-flow (flow.js only; hunk.diff), on top of TOK-W3 (0e17ca0a7). before = 77218dcad.

Rule: a tier (one rank) of four or more nodes whose row cannot fit the budget (the request, at least 720, at most 960) even at its node minimums (after FLOW-N) wraps onto two rows: the first ceil(n / 2) nodes in the first row, the rest in the second, one node width for all, a 24 px gap, 22 px between the rows, the second row staggered half a pitch so each of its nodes sits under a gap of the first. A wire to a second-row node, or from a first-row node past the second row, runs down a gap and crosses no node. The pair is centred as a group. Edges are routed by the same router (lanes, ports); the highlight path keeps its colour (it is by edge, not by position).

| figure | request | before | after |
|---|---|---|---|
| moe-top-two-experts | 408 | 955 x 559 | 559 x 653 |
| moe-top-two-experts | 720 | 955 x 559 | 720 x 637 |
| gpu-matmul / grouped-query-heads (control) | 408 / 720 | 702 / 720 | unchanged |
Scan of all 1225 specs of the five reference groups, before (77218dcad) vs now: the only figures whose size changed are moe-top-two-experts and the TOK-W3 token-links ones. Files: moe-top-two-experts-<408|720>-<before|after>.png/.html, sizes.txt, lint-output.txt.
Lint (geometry-lint real renderer, as for FLOW-X) on moe-top-two-experts, gpu-matmul, grouped-query-heads: 0 flags before and after.
Tests: flow.test.mjs, flow-lanes, flow-capsule once: 27 tests, 26 pass, 1 fail = flow.test.mjs:391 "RD-2: a three-branch decision keeps its lanes; the digests are the markup under the sprint theme" (the sameSide digest, expected). illustration-embedded-layouts.test.mjs: 3 pass, 1 fail: :106 "a nine-box parallel tier fits within 960 pixels without dropping labels": AssertionError [ERR_ASSERTION]: The expression evaluated to a falsy value: assert.ok(box.x > previous.x + previous.width) at illustration-embedded-layouts.test.mjs:120 (the test pins one row left to right; the tier is now two rows, the figure 559 wide at 408). Not re-pinned.
Limit: a tier of three or fewer nodes, or one that fits, is untouched; a tier wider than two rows would need (more than 2 x the budget) is not split further.
