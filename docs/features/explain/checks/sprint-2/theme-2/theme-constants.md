# THEME-2: per-kind defaults read from code constants

Read from the working tree of `feat/visual-sprint-2` in `C:\s\sprint2-main` (branch tip `1d04bc70213e56a892134ad04b242a4569deac1e`, read from the shared repository's loose ref; the working tree is what the Grep and Read tools saw). Paths are under `packages/web/src/tutor-diagrams/` and line numbers are at that tip.

| default | value | file:line |
|---|---|---|
| wire width | 2 px ink; 3 px and the path colour when active | primitives.js:258 |
| wire elbow radius | 8 | primitives.js:254 (`WIRE_CORNER`) |
| arrow head | 12 wide, 8 long, tip stops 2 px short | primitives.js:254 (`WIRE_HEAD_WIDTH`, `WIRE_HEAD_LENGTH`, `WIRE_STOP_SHORT`) |
| body label | 15 px, weight 500; on a fill 600 | primitives.js:146-148 |
| line height | ceil(size x 1.25) | primitives.js:22 |
| figure frame | rx 12, title 17 px / 700 | TutorDiagram.js:40, :42 |
| text classes | display 17/700, heading 16/600, body 15/500 | teaching-theme.js:30-31 |
| box | rx 9, 1.5 px outline (3 px active) | teaching-theme.js:58 |
| connector widths | 3 active, 1 guide, 1.5 dashed, 2 otherwise | teaching-theme.js:66 |
| flow pad, gap | 14, 18 | flow.js:7-8 |
| flow node width | min 180, max 220, 120 for a row of 4 or more over the budget | flow.js:9, :13, :12 |
| flow width budget | the request, at least 720, at most 960 | flow.js:16, :231 |
| flow node height | 40 + 16 x lines (56 for one line, 72 for two) | flow.js:312 |
| flow edge label | 13 px, wraps at 158 | flow.js:14-15 |
| decision one-line width | ceil((text width + 40) / 0.72) | flow.js:76 |
| capsule | start and outcome nodes | flow.js:48 |
| tree circle / square / gap / level | 24 / 20 / 6 / 56 (leaf pitch = square + gap = 26) | dot-tree-layout.js:7 |
| tree arrow head | 8 long, 6 half-width | dot-tree-layout.js:7 |
| top-down tree node width | cap 150, floor 100 | ml-topology-layouts.js:37, :64, :9 |
| tensor cell | 36 high, rx 4, 1.5 px outline; width max(36, text + 12) | tensor-layout.js:7, :25, :56 |
| token-links chip | row gap 44, cell pad 8, min cell 58, min width 320 | token-links-layout.js:10-14 |
| block-stack block | min 142 wide (72 in a row), row gap 6 | block-stack-layout.js:13-14, :20 |
| plot tick label | 15 px | ml-plot-layouts.js:13 (`TICK`) |
| plot marker | radius 7 (a 14 px marker) | ml-plot-layouts.js:13 (`MARKER`) |
| plot series line | 4.5 px | ml-plot-layouts.js:13 (`LINE`) |
| plot guide | 1.5 px, dashed `4 4` (the zero line solid) | ml-plot-layouts.js:13 (`GRID`), :258 |
| plot reference line | 1.8 px, dashed `5 4` | ml-plot-layouts.js:329 |
| plot caps | value labels, all-sample markers: 8 samples; callouts: 6 | ml-plot-layouts.js:18 |
| legend pill | 22 px tall, rx 11, series colour at 0.18 over the ground, 1.5 px outline | ml-plot-layouts.js:83, :100 |
| line smoothing | smooth unless `smooth: false` | ml-plot-layouts.js:213 |

Colours: palette in `theme/palette.js`; the series order is `TEACHING_SERIES` (teaching-theme.js:35).
