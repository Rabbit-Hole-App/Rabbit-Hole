# theme-ship: the visual sprint, released to preview (feat/visual-sprint at 74c4f68ae)

Status: ready for the owner. Affected tests exit 0: 1677 tests, 1675 pass, 0 fail, 2 skipped (affected-tests-output.txt; same 113 files). MVP preview of 74c4f68ae passed build, affected-tests, smoke (explain-program-render-check, 38/38) and preview (mvp/record.json, mvp/preview-output.txt). Recovery branch recovery/visual-sprint-148 at b11e36f1c (main 18cf9fce8 tree on top of the release candidate). Whole-library sheets: sheets/ (494 figures, 408: 11 sheets, 720: 14 sheets). dev-deploys note not pushed.

Commits on top of main 18cf9fce8 (the 13 sprint commits, then): b036c77da theme pins, 231a75946 lint fix, 4f4e99b56 first test rewrites (all accepted), then, each its own commit with hunk, before/after at 408 and README under `fixes/`:

| # | fix | commit | folder |
|---|---|---|---|
| 1 | vectorKind accepts the sdk's own vector ids (`vec.v`, `vec.a`, `vec.F`, `tossedVelocity`, `vec.v.toss`); `v-arrow` stays an ink arrow | 2fed88419 | fixes/1-vectorKind |
| 2 | themed plot minimum width 420 to 408 (every tick label intact at 408 on all 118 plot references; tightest `big-o-growth-rates`, 10.9 px between labels) | 4269465a4 | fixes/2-plot-min-width |
| 3 | narrow log ticks: label extents follow start/end anchoring; a decade label touching a sampled one is dropped; if fewer than three labels remain the plot widens (that one degenerate domain: 550 px) | a86573aa9 | fixes/3-log-ticks |
| 4 | stacked bar baseline stops at each group's bars (per-group segments), not through the value notes | ed113be63 | fixes/4-stacked-baseline |
| 5 | token row: a row of blocks wider than 960 px shrinks its tensor cells only as far as needed, below 36 px if it must (widest token row 1110 to 960 px, cells 29 px) | f17e8af18 | fixes/5-token-row |
| 6 | formula cell: the matrix cell is sized from the formula measured at 15 px | 1e6bbcfdd | fixes/6-formula-cell |
| 7 | flow "three labelled arrivals": rule C, the shared bottom-centre fork only when exactly one decision forks into a row gap; two or more keep main nested lanes | 74c4f68ae | fixes/7-flow-crossing |
| 8 | success fill stays #3A7E69; text on it is the cream ground #FFFCF0 (4.68:1) | 7ee354540 | fixes/8-success-cream |
| 9 | Gemma widths accepted with scroll: TutorDiagram and illustration-integration re-pinned to the drawn widths (598 at 408 of room, 418 at a 320 request); GEM-1 recorded for after the release | 4797fa0b3 (tests) | fixes/9-gemma-repins |

4797fa0b3 is also the second test commit: 10 expectations the nine commits moved (natural widths with the 15 px formula, the 408 plot minimum, a re-picked geometry-lint fixture, the cream on-fill pin), tests only. The first pass list is `affected-tests.md`; its 14 left-failing lines now carry their fix commit.

## Fix 7: rule C (owner 18:55 decision)
The cause was the merged fork lanes of three decisions in one row. Rule C: a row gap takes the shared fork only when exactly one decision forks into it; with two or more, every branch in that gap keeps the pre-sprint nested lanes. Hunk, before/after at 408: fixes/7-flow-crossing/. Recorded for after the release: FLOW-W (a decision label should wrap to two lines when its diamond would push the figure past the card: the fixture is still 1008 px at a 408 request).

## Product surfaces that render a tutor diagram narrower than 406 px (a ticket after the release)
Program frame figures (`explain-program/FrameFigures.jsx` renders at the width the program gives, no floor) and the minimized explanation tile (`LearningBlocks.jsx` line 2107: content 408 at the 440 card minimum). Written cards are clamped 440 to 720 with a 408 minimum visual width. Not changed in this release (the 406 floors were not in the accepted list).

## Evidence from earlier in the session
Fix 1 of the first pass (lint) is `lint-fork-before.png` / `lint-fork-after.png`; histogram and flow-minimum needed no code (`histogram-title-408.png`, `flow-min-width-408.png`).
