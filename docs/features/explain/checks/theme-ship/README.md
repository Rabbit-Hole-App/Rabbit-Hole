# theme-ship: the visual sprint, release readiness (feat/visual-sprint at 4797fa0b3)

Status: ONE blocker left. The affected-tests selection (113 files, 3 uncovered, `packages/web`) runs 1677 tests: 1674 pass, 1 fails, 2 skipped (`affected-tests-output.txt`). The one failure is fix 7 below. Dependencies were installed with `npm ci` at the root and in `scripts/topic-pipeline` (no junctions); `reference-linter.test.mjs` runs and passes. Recovery branch, preview, MVP record and the whole-library sheets at 408 and 720 are not done: they need the affected tests at exit 0.

Commits on top of main 18cf9fce8 (the 13 sprint commits, then): b036c77da theme pins, 231a75946 lint fix, 4f4e99b56 first test rewrites (all accepted), then, each its own commit with hunk, before/after at 408 and README under `fixes/`:

| # | fix | commit | folder |
|---|---|---|---|
| 1 | vectorKind accepts the sdk's own vector ids (`vec.v`, `vec.a`, `vec.F`, `tossedVelocity`, `vec.v.toss`); `v-arrow` stays an ink arrow | 2fed88419 | fixes/1-vectorKind |
| 2 | themed plot minimum width 420 to 408 (every tick label intact at 408 on all 118 plot references; tightest `big-o-growth-rates`, 10.9 px between labels) | 4269465a4 | fixes/2-plot-min-width |
| 3 | narrow log ticks: label extents follow start/end anchoring; a decade label touching a sampled one is dropped; if fewer than three labels remain the plot widens (that one degenerate domain: 550 px) | a86573aa9 | fixes/3-log-ticks |
| 4 | stacked bar baseline stops at each group's bars (per-group segments), not through the value notes | ed113be63 | fixes/4-stacked-baseline |
| 5 | token row: a row of blocks wider than 960 px shrinks its tensor cells only as far as needed, below 36 px if it must (widest token row 1110 to 960 px, cells 29 px) | f17e8af18 | fixes/5-token-row |
| 6 | formula cell: the matrix cell is sized from the formula measured at 15 px | 1e6bbcfdd | fixes/6-formula-cell |
| 7 | flow "three labelled arrivals": NOT FIXED | none | fixes/7-flow-crossing |
| 8 | success fill stays #3A7E69; text on it is the cream ground #FFFCF0 (4.68:1) | 7ee354540 | fixes/8-success-cream |
| 9 | Gemma widths accepted with scroll: TutorDiagram and illustration-integration re-pinned to the drawn widths (598 at 408 of room, 418 at a 320 request); GEM-1 recorded for after the release | 4797fa0b3 (tests) | fixes/9-gemma-repins |

4797fa0b3 is also the second test commit: 10 expectations the nine commits moved (natural widths with the 15 px formula, the 408 plot minimum, a re-picked geometry-lint fixture, the cream on-fill pin), tests only. The first pass list is `affected-tests.md`; its 14 left-failing lines now carry their fix commit.

## Fix 7: stopped, as instructed
The crossing is not a lane-order change. The cause is the sprint's decision fork: it merges each decision's two branch lanes into one shared lane. In this fixture house, senate and sign each branch to `passed` (left) and `dies` (right), with senate between them; at 408 the layout is 1008 wide. With one lane per source no ordering avoids a crossing: house above senate crosses senate's drop at (510.5, 341.5); senate above house makes senate's left tip cross house's lane. On main (before the fork) the same fixture has nested separate lanes and no crossing (`main-408.png`; `before.png` is the sprint). A try that forked only when the two targets are on opposite sides did not remove the crossing and broke a second flow test, so it was reverted. Making forked lanes cross-safe needs router work (keep nested separate lanes when forked lanes would cross, or re-order lanes across the two target groups). The same crossing can appear for any flow where several decisions branch to two shared outcomes. The test `flow.test.mjs` "three labeled arrivals use separate, noncrossing approaches to the same outcome" is unchanged and fails.

## Product surfaces that render a tutor diagram narrower than 406 px (a ticket after the release)
Program frame figures (`explain-program/FrameFigures.jsx` renders at the width the program gives, no floor) and the minimized explanation tile (`LearningBlocks.jsx` line 2107: content 408 at the 440 card minimum). Written cards are clamped 440 to 720 with a 408 minimum visual width. Not changed in this release (the 406 floors were not in the accepted list).

## Evidence from earlier in the session
Fix 1 of the first pass (lint) is `lint-fork-before.png` / `lint-fork-after.png`; histogram and flow-minimum needed no code (`histogram-title-408.png`, `flow-min-width-408.png`).
