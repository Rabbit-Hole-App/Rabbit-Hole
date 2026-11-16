# THEME-2 render diff: before (feat/visual-sprint-2 c7d9a664d) vs after the build

Method: every reference of the library (`diagramReferences`, 472) and every kind-gallery shape (22), 494 ids, rendered at width 408 with `renderTutorDiagram` + `renderToStaticMarkup`, once from the rebased tip before any edit (`render-before.json`) and once after the rewire (`render-after.json`); the SVG strings are compared id by id.

Result: **494 identical, 0 different** (0 render errors on either side).

Also compared: every non-function export of `teaching-theme.js` and `primitives.js` (18 exports: TEACHING, TEACHING_FILL, TEACHING_DEPTH_FILLS, TEACHING_ACCENT, TEACHING_SERIES, TEACHING_SERIES_INK, TEACHING_ROLE_FILL, TEACHING_GRID, TEACHING_ZERO, TEACHING_STYLE, TEACHING_TEXT, TEACHING_FONT, PALETTE, PATH, SURFACE, INK, MUTED, FILLED_INK) as JSON before and after (`consts-before.json`, `consts-after.json`): identical.

Not an SVG diagram, so not in the diff:
- `IllustrationFigure.jsx`: the callout leader stroke `#1f2937` is now `INK` (`#32211C`, the nearest palette colour; the only intended visual change of the build), and the frame class `bg-[var(--viz-surface,#FFFCF0)]` is `bg-[var(--viz-surface)]` (`--viz-surface` is defined in `:root` and `.dark` of `index.css`, so the fallback was never reached).
- `index.css`: one new declaration `--viz-fill-slate: #A8BBD0` (light and dark, generated from `palette.js`); the `[data-explain-table] th` colour-mix reads it, the same slate colour as before.
- `explain-program/sdk-raster.js` and `raster-fixtures.js`: the mask default `#E5AA46` is the interpolated `FILLS.mustard`; the guest source strings are byte-identical.
- `interact-style.js` had no hex literals and is unchanged: it reads the palette through `teaching-theme.js` and `primitives.js`.
