# The explain theme: one palette

DRAFT (THEME-2 prep, branch `feat/visual-sprint-2-theme`). The colours below are read from `packages/web/src/tutor-diagrams/theme/palette.js`, the single source. `teaching-theme.js`, `primitives.js` `PALETTE`, `interact-style.js` and the `--viz-*` block of `index.css` take their colours from it (`index.css` through `theme/generate-css.mjs`). `theme/stray-hex-lint.mjs` fails when a hex literal appears anywhere else in `tutor-diagrams/`, `explain-program/`, `interact-style.js`, `IllustrationFigure.jsx` or `learn-scene-author.js`, or in the `[data-explain-table]` rules of `index.css`; `theme/palette-guard.test.mjs` fails when any reference renders a colour that is not below. The rendered page with swatches is `docs/features/explain/checks/sprint-2/theme-2/theme.html` (made at build time).

Every default in this file is a constant read from the code with its file and line, at `feat/visual-sprint-2` commit `1d04bc70213e56a892134ad04b242a4569deac1e`. Paths are under `packages/web/src/tutor-diagrams/` unless stated. Nothing here comes from session notes.

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

Series order (a multi-series plot, a legend): blue, coral, teal, olive, lavender, mustard, rose, slate (`SERIES`; today `TEACHING_SERIES`, `teaching-theme.js:35`).
Series ink (the darker weight a line's text is drawn in): `#375D92`, `#BB503E`, `#3A7E69`, `#6D7835`, `#7F5EC9`, `#936A25`, `#B82E56`, `#507195`.
Tints exist only for legend pills and plot bands: a fill at 0.18 over the ground (`TINT`).

## Role to fill (scenes, composed cards)

`ROLE_FILL`: input blue, output teal, observed olive, prediction lavender, operator lavender, learner mustard, tutor rose, code slate, warning coral, success series ink 2 (`#3A7E69`; text on it is the ground `#FFFCF0`). A neutral role has no fill: transparent with the outline.

## Lines and the pale tokens

`LINES`: grid `#D9D3C3` (dotted guide), zero `#786860` (the one solid line a chart keeps), frame `#dedad4`, wire `#b9c3b9`, hairline `#e3e7e0`, path `#2F80D8` (the highlighted path). The pale and blue tokens the first written layouts took (`inset`, `blue`, `blueSoft`, `warm`, `warmSoft`, `green`, `greenSoft`, `blueInk`, `blueBorder`) stay under their names in `LEGACY`.

## The --viz-* block of index.css

The product's role colours for the legacy scenes, light and dark (`VIZ_LIGHT`, `VIZ_DARK` in `palette.js`). They are app-theme tokens, not the sprint palette. `node theme/generate-css.mjs` reports drift between `index.css` and `palette.js`; `--write` rewrites the values. The table header rule `[data-explain-table] th` in `index.css` names the slate fill: at build time it reads a generated custom property instead of a hex.

## Per-kind defaults at the tip

### Wires, text, frame (all kinds)

| default | value | file:line |
|---|---|---|
| wire width | 2 px, INK; 3 px and the path colour when active | `primitives.js:258` |
| elbow radius | 8 | `primitives.js:254` (`WIRE_CORNER`) |
| arrow head | 12 wide, 8 long; the tip stops 2 px short | `primitives.js:254` (`WIRE_HEAD_WIDTH`, `WIRE_HEAD_LENGTH`, `WIRE_STOP_SHORT`) |
| body label | 15 px, weight 500; text on a fill weight 600 | `primitives.js:146-148` |
| line height | ceil(size x 1.25) | `primitives.js:22` |
| figure frame | rx 12; title 17 px, weight 700 | `TutorDiagram.js:40`, `:42` |
| text classes | display 17/700, heading 16/600, body 15/500 | `teaching-theme.js:30-31` |
| box | rx 9, 1.5 px outline (3 px active) | `teaching-theme.js:58` |
| connector widths | 3 active, 1 guide, 1.5 dashed, 2 otherwise | `teaching-theme.js:66` |

### Flow

| default | value | file:line |
|---|---|---|
| pad, node gap | 14, 18 | `flow.js:7-8` |
| node width | minimum 180, maximum 220 | `flow.js:9`, `:13` |
| node width of a row of 4 or more that would pass the budget | down to 120 | `flow.js:12` |
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
| top-down tree node width | cap 150, floor 100 | `ml-topology-layouts.js:37`, `:64`, `:9` |

### Tensor strips, token links, block stacks

| default | value | file:line |
|---|---|---|
| tensor cell | 36 high, rx 4, 1.5 px outline; width max(36, text + 12) | `tensor-layout.js:7`, `:25`, `:56` |
| token-links chip | row gap 44, cell pad 8, minimum cell 58, minimum width 320 | `token-links-layout.js:10-14` |
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
| line smoothing | smooth unless `smooth: false` | `ml-plot-layouts.js:213` |

## Sprint 2 defaults: TODO at build time

Fill each row from the code at the final tip (constant, file and line), after the lanes' commits are in. Evidence READMEs are under `docs/features/explain/checks/sprint-2/<item>/`.

| item | what to document | file |
|---|---|---|
| PLT-2(B) callouts | the callout label, leader and ring (replacing the numbered badge) | `ml-plot-layouts.js` |
| PLT-5 | the smooth-by-default rule and the marker rule for smooth series | `ml-plot-layouts.js` |
| PLT-2(A), BAND-1 | the band under a single curve, its tint and no outline | `ml-plot-layouts.js` |
| PLT-4, LEG-1 | the coinciding-marker rule, no legend for one series | `ml-plot-layouts.js` |
| PLT-3(A) | the curve labels for 3 or fewer series, the leader, the legend fallback | `ml-plot-layouts.js` |
| BAR-1, BAR-U | the bar chart defaults (L-axis, dotted guides, one fill per category, gap, value labels) and the unit rule | `ml-plot-layouts.js` (`barChart`), `content-contract.js` |
| VEC-1 | the flipped vector label | `ml-plot-layouts.js` |
| SCN-r3, SCN-n1 | operator strokes, the sum-to-1 envelope | `packages/web/src/AnimatedScene.jsx` |
| TL-1 | the numbered-step timeline (badge, spine) | `layouts.js` |
| TOK-W, TOK-W3 | the tensor row wrap, the token-links chip wrap | `tensor-layout.js`, `block-stack-layout.js`, `token-links-layout.js` |
| FLOW-W, FLOW-X, FLOW-N, FLOW-T, FLOW-T2 | the decision wrap, the lane order, the node minimum of a row, the wrapped tier | `flow.js` |
| TREE-W | the tree node cap and floor | `ml-topology-layouts.js` |
| MAT-W | the matrix header padding and wrap | `ml-data-layouts.js` |
| ILL-0 v2 | the picture style preamble and Recraft controls | `packages/control-plane/src/explanation-figures.js`, `packages/control-plane/src/image-providers.js` |
