# FLOW-W + FLOW-X (sprint 2)

Commit 937cf2666 on feat/visual-sprint-2-flow (flow.js only; hunk.diff). before = released main 74c4f68ae, after = this commit (rule C kept), optb = scratch experiment (see Option B), main = pre-sprint main 18cf9fce8 (lint only).

Three-arrivals fixture (convergingFlow): before 1008 x 620 at both requests; after 697 x 679 at 408 and 720 x 673 at 720 (the request is the width once it is above the natural width). Files: three-arrivals-408-{before,after,optb}.png / .html, three-arrivals-720-*.png / .html, sizes.txt, lint-output.txt.

## FLOW-W
A decision keeps its one-line width unless its row would push the figure past the budget (the width asked for, at least 720, at most 960); then the decisions of that row take a two-line label: the narrowest wrap that gives two lines, and a node minimum of (widest line + 40) / 0.74 so the diamond is no taller than about the three-line one. The fixture's three decisions: 1030 -> 697 px. Standalone decision rows that fit the budget are unchanged.

## FLOW-X
In a gap, lanes are put in a stable topological order: a run goes below the lanes of every other node whose stem it spans (a stem = the vertical from the node down to its own lowest lane); a cycle keeps the old order; the lanes of one node stay together when they can. After: House's "No" run is at y 456, below the Senate's lowest lane (437.5 -> now 425.5 in the render), so it no longer crosses the Senate stem; the sign's runs are below it too. Rule C (74c4f68ae) is untouched: a gap with two or more decisions keeps nested lanes.

## Lint: NOT 0 (deviation from the owner text)
geometry lint on the fixture: main 1 flag, 74c4f68ae 1 flag, this commit 1 flag, always rule a on the Senate: its two branch labels ("Yes", "No") stand at different heights, because its two nested lanes are 25 px apart (50 before). That is not a crossing and FLOW-X does not touch it: nested lanes give each branch its own height, and the shared label lane (RD-4a) fails for the Senate because its "Yes" drop sits 20 px between two other drops (the labels would touch them).
Option B (not committed): with rule C switched off, i.e. the shared fork applied in every gap, and the same FLOW-X ordering, the fixture is lint 0, no run crosses a stem, 697 x 672 at 408 (three-arrivals-408-optb.png; two of the six branch labels fall to the key under the graph at 408). The order Senate, then House and sign, is what removes the crossing that rule C was cut to avoid. Choosing it is a rule change to rule C, so I did not make it.

## Test result (flow tests run once after FLOW-X)
flow.test.mjs, flow-lanes.test.mjs, flow-capsule.test.mjs: 27 tests, 26 pass, 1 fails:
test at src\tutor-diagrams\flow.test.mjs:391:1  "RD-2: a three-branch decision keeps its lanes; the digests are the markup under the sprint theme"
AssertionError: Expected values to be strictly deep-equal: actual [ 'c2288c7909a8d4fa', '356d32cc3a5f3894' ] expected [ '5c87270433a1ca7a', '5c87270433a1ca7a' ] (line 394, the sameSide fixture at 408 and 720).
Cause: FLOW-W. sameSide (a decision in a row of three, natural width 726) was 726 at both requests; its one-line decision now wraps to two lines because 726 is past the 720 budget: 639 x 404 at 408, 720 x 402 at 720. A digest pin; not widened or re-pinned this round. scripts/topic-pipeline geometry-lint.test.mjs: 3 pass.
