# theme r9 amendment: no white, ever (owner 17:03)

## Done
1. Ground. `TEACHING.surface` and `SURFACE` resolve to the cream ground #FFFCF0 (fallback in `primitives.js` was #fbfbfa); the three literals #ffffff, #fbfbfa and #fffefa are gone from tutor-diagrams (only the README table still named #fffefa; fixed). Outside tutor-diagrams, in the scene renderer: `IllustrationFigure.jsx` frame fallback #fbfbfa -> #FFFCF0, `AnimatedScene.jsx` `bg-white` -> `bg-[var(--viz-surface)]`, `index.css` light-theme `--viz-surface` #fbfbfa -> #FFFCF0 (the dark theme value is unchanged).
2. Unfilled shapes are `fill: none` with the 1.5 px outline: `box()` and `dot()` without a role fill, `teachingBox` plain, block-stack `norm`, the legacy tree card, the plot area, the heatmap's empty cell. This covers matrix body cells, comparison rows, relationship nodes without a role, flow plain nodes, tree cards. Shapes that must hide a line behind them stay ground-coloured on purpose: the legend pill (tinted), plot note badges, annotation rings, token-links weight badges, dendrogram merge dots, edge-label gaps, sequence and cycle label gaps.
3. Matrix header row and comparison column headers: already take a role fill (blue, then olive, coral or teal) from `HEADER_ROLES`; body cells are now transparent.

## Check
No white literal in any of the 14 r9 SVGs (`#fff`, `#ffffff`, `#fbfbfa`, `#fffefa`, `white`).

## Files touched
packages/web/src/tutor-diagrams: primitives.js, teaching-theme.js, block-stack-layout.js, ml-plot-layouts.js, ml-statistical-layouts.js, teaching-layouts.js, README.md; packages/web/src: IllustrationFigure.jsx, AnimatedScene.jsx, index.css.

## Hard-coded whites found and left alone (outside the figures)
- Scene renderer text on dark fills: `--viz-on-observed`, `--viz-on-success`, `--viz-ink-high`, `--viz-ink-mid`, `--viz-heat-positive-ink-mid` in index.css are white ink chosen for measured contrast on dark fills, and the dark theme depends on them; changing them is a separate decision.
- The rest of the app (landing pages' CSS, canvas handles, CAD viewer background, charts, mermaid theme) is not part of the figures and was not touched.
- `tutor-diagrams` test files and references still contain the old literals where they pin colours; they are part of the ship round's pin updates.
