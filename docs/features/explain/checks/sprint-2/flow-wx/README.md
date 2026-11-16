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

---
# Owner reads 21:48 (supersede the "Option B (not committed)" and "Lint: NOT 0" parts above)

## FLOW-W (no code change; evidence only)
sameside-{408,720}-{before,after}.png/.html, sameside-sizes.txt: the sameSide fixture of flow.test.mjs:327 (the flow.test.mjs:391 digest fixture) at 408 and 720. before (74c4f68ae): 726 x 339 at both (a one-line decision "Is the record valid?" in a row of three, natural width 726, past the 720 budget). after: 639 x 404 at 408 and 720 x 402 at 720 (the decision wraps to two lines). The digest pin in the ship round: ['c2288c7909a8d4fa','356d32cc3a5f3894'] became ['bd4689d197...'] see rd2-after.txt for the 408 markup hash; flow.test.mjs not edited.
One FLOW-W code fix was needed and is its own commit (57ac785ee): the two-line minimum could be wider than the one-line minimum it replaced (moe-top-two-experts 955 -> 1125, grouped-query-heads 802 -> 826, illustration-embedded-layouts "tier needs 1125px"); it is now min(one-line minimum, two-line minimum): 955 and 802 again, the three-arrivals fixture unchanged.

## FLOW-X option B (commit 0e2e9498c, flow.js only; hunk-optionb.diff is that commit)
- Rule C's guard (a gap forks only when exactly one decision forks into it) is removed: every decision forks, as in 4f4e99b56. The lane ordering of d931a1f6a stays, so a run goes below the stems it spans.
- A branch label whose run has no room stands beside its drop (left of the line at mid-drop; the right side, or the same step up or down along the drop for every branch of that node, where a wire or another label is in the way). All labels of such a node share one height, so rule a stays clean. No key under the graph (the key code is dead now).
- three-arrivals-{408,720}-optb.png/.html: 697 x 598 at 408, 720 x 592 at 720 (before 1008 x 620). lint-output.txt: main 1 flag, 74c4f68ae 1 flag, now 0 flags.
- RD-2 and the other flow fixtures of flow.test.mjs at 408, markup hash vs 74c4f68ae (rd2-before.txt / rd2-after.txt): cache, swallow, triage, narrow, longLabels byte-identical; sameSide differs by FLOW-W (726 -> 639) and convergingFlow differs by design (1008 -> 697).

## Tests (run once: flow.test.mjs, flow-lanes, flow-capsule; geometry-lint.test.mjs)
27 tests, 25 pass, 2 fail; geometry-lint.test.mjs 3 pass.
1. flow.test.mjs:391 "RD-2: a three-branch decision keeps its lanes; the digests are the markup under the sprint theme": expected [ '5c87270433a1ca7a', '5c87270433a1ca7a' ] (the sameSide fixture at 408 and 720); expected, FLOW-W (726 -> 639 / 720). Not re-pinned.
2. flow.test.mjs:119 "long branch labels never mask an unrelated connector in a nested flow": AssertionError [ERR_ASSERTION]: The expression evaluated to a falsy value: assert.ok(other.every(wire => !touches(pointsFor(wire), annotation.props.children[0].props))) at flow.test.mjs:138. Cause: option B removes the key. In that fixture the "On the second branch" label (two lines, 120 x 38) of decision a sits on a 59 px drop and the only clear place beside it is right of the line, outside the 604 px canvas; the left side collides with b>c's run at y 273. A label is never put outside the canvas, so it stays left at mid-drop and touches that wire. On 74c4f68ae it went to the key, which the owner removed. Not re-pinned, not widened.

---
# Label order: run, beside the drop, key (commit on 9a31040b0; hunk-key.diff)
A label goes on its run; else beside its drop (left of the line, mid-drop; other side or height where a wire or label is in the way, all labels of the node at one height); else, and only when neither fits without touching a wire, another label or the canvas edge, to the key under the graph (the code option B had made dead). long-labels-{408,320}-{before,after}.png/.html: the flow.test.mjs:119 fixture, before (9a31040b0) 604 x 499, after 604 x 536 (the "On the second branch" label of node a is in the key; the other three labels stand on or beside their wires).
Runs once: flow.test.mjs, flow-lanes, flow-capsule: 27 tests, 26 pass, 1 fail = flow.test.mjs:391 "RD-2: a three-branch decision keeps its lanes; the digests are the markup under the sprint theme" (the sameSide digest, expected). flow.test.mjs:119 passes unchanged. geometry-lint.test.mjs: 3 pass. Lint on three-arrivals: 0 flags. RD-2 and the other fixtures at 408 vs 74c4f68ae (rd2-before.txt vs rd2-after-key.txt): cache, swallow, triage, narrow, longLabels byte-identical; sameSide (FLOW-W) and convergingFlow (three-arrivals, by design) differ.
