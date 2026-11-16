# The explain theme: one palette

DRAFT (THEME-2 prep, branch `feat/visual-sprint-2-theme`). The values below are read from `packages/web/src/tutor-diagrams/theme/palette.js`, the single source. `teaching-theme.js`, `primitives.js` `PALETTE`, `interact-style.js` and the `--viz-*` block of `index.css` take their colours from it (`index.css` through `theme/generate-css.mjs`). `theme/stray-hex-lint.mjs` fails when a hex literal appears anywhere else in `tutor-diagrams/`, `explain-program/`, `interact-style.js` or `learn-scene-author.js`; `theme/palette-guard.test.mjs` fails when any reference renders a colour that is not below. The rendered page with swatches is `docs/features/explain/checks/sprint-2/theme-2/theme.html`.

## Ground and ink

| name | value | use |
|---|---|---|
| GROUND | `#FFFCF0` | the cream ground of every figure and card; a shape with no fill shows it (no white anywhere) |
| INK | `#32211C` | outlines, wires, labels, text on any fill (`FILLED_INK` is the lower-case form) |
| MUTED | `#665951` | captions and muted labels |

## The fills (100%, no tint)

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
| orange | `#F89830` | the ninth fill (tree depth 3, the warm ramp); measured from Wondering's illustrations, approximate |

Series order (a multi-series plot, a legend): blue, coral, teal, olive, lavender, mustard, rose, slate.
Series ink (the darker weight a line is drawn in, markers keep the fill): `#375D92`, `#BB503E`, `#3A7E69`, `#6D7835`, `#7F5EC9`, `#936A25`, `#B82E56`, `#507195`.
Tints exist only for legend pills and plot bands: a fill at 0.18 over the ground.

## Role to fill (scenes, composed cards)

input blue, output teal, observed olive, prediction lavender, operator lavender, learner mustard, tutor rose, code slate, warning coral, success series ink 2 (`#3A7E69`, text on it is the ground `#FFFCF0`, 4.68:1). A neutral role has no fill: transparent with the outline.

## Lines and the pale tokens

grid `#D9D3C3` (dotted guide), zero `#786860` (the one solid line a chart keeps), frame `#dedad4`, wire `#b9c3b9`, hairline `#e3e7e0`, path `#2F80D8` (the highlighted path). Pale and blue tokens the first written layouts took (`inset`, `blue`, `blueSoft`, `warm`, `warmSoft`, `green`, `greenSoft`, `blueInk`, `blueBorder`) stay under their names in `LEGACY`.

## The --viz-* block of index.css

The product's role colours for the legacy scenes, light and dark (`VIZ_LIGHT`, `VIZ_DARK` in `palette.js`). They are app-theme tokens, not the sprint palette; they are generated so the file has no second hand copy: `node theme/generate-css.mjs` reports drift, `--write` rewrites the values.

## Per-kind defaults

### Sprint 1 (released in 149-explain)
- **Wires and arrows** (flow, cycle, relationship, tree, token links): INK, 2 px, 8 px quadratic corners, 12 x 8 head whose tip stops 2 px short; a dashed one 1.5 px; the highlighted path `#2F80D8` at 3 px.
- **Flow**: node minimum width 180 (natural 406 at the narrowest card), nodes 56 high (72 with two lines), capsules for start and end, a decision is a mustard diamond with a one-line label up to 360 px, every decision forks from its bottom centre, labels on the run.
- **Plots**: no axis lines; horizontal guides dashed 4 4 at 1.5 px; lines 4.5 px in the series colour; markers 14 px; tick labels 15 px; legend pills tinted 0.18, 22 px high; a point label stands right of its marker; no numbered note list.
- **Trees**: leaf pitch 26, node 24 px, square 20 px, level 56, centred shorter tree, 10 px arrowheads.
- **Scenes** (composed and static): role fills at 100%, 2 px ink outlines, operator circles, strips with 32 x 28 cells, bars with an 18 px bar on a 24 px pitch.
- **Tensor strips**: cells 36 px, ink outline 1.5 px; a row wider than the budget wraps at group boundaries.

### Sprint 2 (filled at the ship round, as each item lands)
ILL-0 v2 (picture style), SCN-r3 (operators, sum-to-1 bars), TL-1 (numbered steps), PLT-2 (callouts, band under the curve), PLT-5 (smooth by default), BAND-1, PLT-3 (curve labels), PLT-4, LEG-1, BAR-1 (bar chart defaults), BAR-U, VEC-1, GEM-1/TOK-W/TOK-W3 (widths), FLOW-W, FLOW-X, FLOW-N, FLOW-T/T2, TREE-W, MAT-W. This section is written from the evidence READMEs under `docs/features/explain/checks/sprint-2/` when the ship round starts.
