# The explain theme: one palette

The colours below are read from `packages/web/src/tutor-diagrams/theme/palette.js`, the single source. `teaching-theme.js`, `primitives.js` `PALETTE`, `TutorDiagram.js`, `IllustrationFigure.jsx`, `explain-program/sdk-raster.js` and `raster-fixtures.js` take their colours from it, and the `--viz-*` block of `index.css` is written from it by `theme/generate-css.mjs`. `theme/stray-hex-lint.mjs` fails when a hex literal appears anywhere else in `tutor-diagrams/`, `explain-program/`, `interact-style.js`, `IllustrationFigure.jsx` or `learn-scene-author.js`, or in the `[data-explain-table]` rules of `index.css`; `theme/palette-guard.test.mjs` fails when any reference renders a colour that is not below. The rendered page with swatches is `docs/features/explain/checks/sprint-2/theme-2/theme.html`.

Every default in this file is a constant read from the code with its file and line, at the THEME-2 build commit on top of `feat/visual-sprint-2` `c7d9a664d`. Paths are under `packages/web/src/tutor-diagrams/` unless stated. Nothing here comes from session notes.

## Ground and ink

| name | value | use |
|---|---|---|
| GROUND | `#FFFCF0` | the cream ground of every figure and card; a shape with no fill shows it (no white anywhere) |
| INK | `#32211C` | outlines, wires, labels, text on any fill (`FILLED_INK` is the lower-case form) |
| MUTED | `#665951` | captions and muted labels |

## The fills (100%, no tint)

Nine fills: the eight in series order, and orange.

| name | value | role names it answers to |
|---|---|---|
| blue | `#8DBFEF` | process, input |
| mustard | `#E5AA46` | decision, learner |
| teal | `#67B9A0` | outcome, output |
| coral | `#F58371` | coral, warning |
| olive | `#95A448` | olive, observed |
| lavender | `#B9A4E8` | lavender, prediction, operator |
| rose | `#E8A3B7` | rose, tutor |
| slate | `#A8BBD0` | slate, code |
| orange | `#F89830` | the ramp and tree depth 3 (`DEPTH_FILLS`); not part of the series order; measured from Wondering's illustrations, approximate |

Series order (a multi-series plot, a legend): blue, coral, teal, olive, lavender, mustard, rose, slate (`SERIES`; `TEACHING_SERIES` is built from it, `teaching-theme.js:36`).
Series ink (the darker weight a line's text is drawn in): `#375D92`, `#BB503E`, `#3A7E69`, `#6D7835`, `#7F5EC9`, `#936A25`, `#B82E56`, `#507195`.
Tints exist only for legend pills and plot bands: a fill at 0.18 over the ground (`TINT`).

## Role to fill (scenes, composed cards)

`ROLE_FILL`: input blue, output teal, observed olive, prediction lavender, operator lavender, learner mustard, tutor rose, code slate, warning coral, success series ink 2 (`#3A7E69`; text on it is the ground `#FFFCF0`). A neutral role has no fill: transparent with the outline. `TEACHING_ROLE_FILL` is built from it (`teaching-theme.js:41`).

## Lines and the pale tokens

`LINES`: grid `#D9D3C3` (dotted guide), zero `#786860` (the one solid line a chart keeps), frame `#dedad4`, wire `#b9c3b9`, hairline `#e3e7e0`, path `#2F80D8` (the highlighted path). The pale and blue tokens the first written layouts took (`inset`, `blue`, `blueSoft`, `warm`, `warmSoft`, `green`, `greenSoft`, `blueInk`, `blueBorder`) stay under their names in `LEGACY`.

## The --viz-* block of index.css

The product's role colours for the legacy scenes, light and dark (`VIZ_LIGHT`, `VIZ_DARK` in `palette.js`). They are app-theme tokens, not the sprint palette. `node theme/generate-css.mjs` reports drift between `index.css` and `palette.js`; `--write` rewrites the values. The table header rule `[data-explain-table] th` in `index.css` mixes the slate fill from `--viz-fill-slate`, a declaration generated from `palette.js` like the rest of the block.

## Per-kind defaults

### Wires, text, frame (all kinds)

| default | value | file:line |
|---|---|---|
| wire width | 2 px, INK; 3 px and the path colour when active | `primitives.js:251` |
| elbow radius | 8 | `primitives.js:247` (`WIRE_CORNER`) |
| arrow head | 12 wide, 8 long; the tip stops 2 px short | `primitives.js:247` (`WIRE_HEAD_WIDTH`, `WIRE_HEAD_LENGTH`, `WIRE_STOP_SHORT`) |
| body label | 15 px, weight 500; text on a fill weight 600 | `primitives.js:139-141` |
| line height | ceil(size x 1.25) | `primitives.js:15` |
| figure frame | rx 12; title 17 px, weight 700 | `TutorDiagram.js:41`, `:43` |
| text classes | display 17/700, heading 16/600, body 15/500 | `teaching-theme.js:31-32` |
| box | rx 9, 1.5 px outline (3 px active) | `teaching-theme.js:55` |
| connector widths | 3 active, 1 guide, 1.5 dashed, 2 otherwise | `teaching-theme.js:63` |

### Flow

| default | value | file:line |
|---|---|---|
| pad, node gap | 14, 18 | `flow.js:7-8` |
| node width | minimum 180, maximum 220 | `flow.js:9`, `:13` |
| node width of a row of 4 or more that would pass the budget | down to 120 (FLOW-N) | `flow.js:12`, `:255` |
| tier wrapped onto two rows (FLOW-T): gap between its nodes | 24 | `flow.js:10` |
| width budget | the request, at least 720, at most 960 | `flow.js:16`, `:231` |
| node height | 40 + 16 x lines (56 for one line, 72 for two) | `flow.js:312` |
| edge label | 13 px, wraps at 158 | `flow.js:14-15` |
| decision one-line width | ceil((text width + 40) / 0.72) | `flow.js:76` |
| capsule | an outcome or a start node | `flow.js:48` |

### Trees

| default | value | file:line |
|---|---|---|
| circle, square, gap, level | 24, 20, 6, 56 (leaf pitch = square + gap = 26) | `dot-tree-layout.js:7` |
| arrow head | 8 long, 6 half-width | `dot-tree-layout.js:7` |
| top-down tree node width (TREE-W) | cap 150, floor 100 | `ml-topology-layouts.js:37`, `:64`, `:9` |

### Tensor strips, token links, block stacks

| default | value | file:line |
|---|---|---|
| tensor cell | 36 high, rx 4, 1.5 px outline; width max(36, text + 12) | `tensor-layout.js:7`, `:25`, `:56` |
| tensor row budget (TOK-W: a row wider than this wraps at group boundaries) | the request, at least 720, at most 960 | `tensor-layout.js:21`, `:136` |
| token-links chip | row gap 44, cell pad 8, minimum cell 58, minimum width 320 | `token-links-layout.js:10-14` |
| token-links wrapped row (TOK-W3): gap between chips | 28 | `token-links-layout.js:9` |
| block-stack block | minimum 142 wide (72 in a row), row gap 6 | `block-stack-layout.js:13-14`, `:20` |

### Coordinate plots

| default | value | file:line |
|---|---|---|
| tick label | 15 px | `ml-plot-layouts.js:13` (`TICK`) |
| marker | radius 7 (a 14 px marker) | `ml-plot-layouts.js:13` (`MARKER`) |
| series line | 4.5 px | `ml-plot-layouts.js:13` (`LINE`) |
| guide | 1.5 px, dashed `4 4`; the zero line solid | `ml-plot-layouts.js:13` (`GRID`), `:258` |
| reference line | 1.8 px, dashed `5 4` | `ml-plot-layouts.js:329` |
| caps | value labels and all-sample markers up to 8 samples; 6 callouts | `ml-plot-layouts.js:18` |
| legend pill | 22 px tall, rx 11, the series colour at 0.18 over the ground, 1.5 px outline | `ml-plot-layouts.js:83`, `:100` |
| line smoothing (PLT-5) | smooth unless `smooth: false` | `ml-plot-layouts.js:213` |

## Sprint 2 defaults (as built; each row names the code it reads)

| item | default | file:line |
|---|---|---|
| PLT-2(B) point callouts | a point annotation's label is a callout: its text in a pill (wrapped at 200 px) in the first free cell that touches no label, series path, marker or stem (first choice also a leader that crosses no label), a 1.5 px leader; at most 6; placed after every other label; a label that only restates the point's coordinates draws none | `ml-plot-layouts.js:18`, `:284` (`freeCell`), `:312` (`callout`) |
| PLT-2(B) plain labels | a reference line's label is 12 px muted text on a ground halo at the top end of its line (the free side, else stacked), a band's label sits inside the band along its top edge, any other shape's label beside it; none has a pill or a leader; text wraps to the room the plot leaves | `ml-plot-layouts.js:335` (`plainLabel`), `:351` (`shapeLabel`) |
| PLT-2(A), BAND-1 | a band is its colour at 0.18 over the ground, no outline, clipped under a single series' curve | `ml-plot-layouts.js:336-340` |
| PLT-4 | a line series beside a scatter series draws no markers unless it says `markers: true` (an optional boolean on the series schema); a line marker within 0.5 px of a scatter marker is never drawn twice | `ml-plot-layouts.js:451`, `ml-plot-spec.js:32` |
| PLT-3(A) | a plot of one to three line series names each curve (15 px, 18 px off the curve, at most 3 series) instead of a legend | `ml-plot-layouts.js:114`, `:134`, `:401-403` |
| LEG-1 | a plot of one series draws no legend pill (its title and axes name it); two or more series keep theirs | `ml-plot-layouts.js:463` |
| BAR-1 | vertical bars with an ink L-axis (2 px), dotted gridlines at value ticks, one fill per category in series order, value above each bar (not above 12 bars), square 2 px outlined bars, gap 40% of the bar width; plot height 210; axis ends at the round tick above the largest value | `ml-plot-layouts.js:430-433`, `:434`, `:454` |
| BAR-U | a unit that is only a generic word (value, number, amount, score) is dropped before drawing | `spec.js:397-409` (`GENERIC_UNIT`) |
| MAT-W | a matrix column header carries 8 px of padding around its formula (cells keep 18) and wraps after an operator when plain text | `ml-data-layouts.js:139`, `:153-154`, `:163` |
| VEC-1 | a tuple-shaped formula in a matrix cell (numeric entries only) is drawn as plain text that may wrap after its comma; its column is as wide as the widest piece; any other formula is unchanged | `matrix-tuple.js:1-2`, `ml-data-layouts.js:154`, `:171` |
| TL-1 | numbered steps: a 28 px blue badge per step on a 1.5 px spine, title and detail on the ground, "N steps" muted top right | `layouts.js:66-88` |
| SCN-r3, SCN-n1 | a sum-to-1 bar chart is a bell: gap 0, a monotone-cubic envelope through the bar tops, the warm ramp by value, the peak bar coral; operator strokes use `SQ` | `packages/web/src/AnimatedScene.jsx:47-52`, `:329-342`, `:372-374` |
| TOK-W, TOK-W3, FLOW-N, FLOW-T, TREE-W | see the Flow, Trees and Tensor tables above | `flow.js`, `ml-topology-layouts.js`, `tensor-layout.js`, `token-links-layout.js` |
| ILL-0 v2 | a picture's prompt starts with `FIGURE_STYLE`; Recraft gets the cream background and the palette as controls | `packages/control-plane/src/explanation-figures.js:23-26`, `packages/control-plane/src/image-providers.js:279-282` |
