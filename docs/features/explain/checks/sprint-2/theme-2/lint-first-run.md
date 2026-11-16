# THEME-2 stray-hex lint, first run

Tip: feat/visual-sprint-2 6a28dd722 code (worktree feat/visual-sprint-2-theme; scope updated by the owner decision: IllustrationFigure.jsx and the [data-explain-table] rules of index.css added). Scope: tutor-diagrams/, explain-program/, interact-style.js, IllustrationFigure.jsx, learn-scene-author.js, and the [data-explain-table] lines of index.css; comments and test files skipped; theme/palette.js is the only allowed home. Command: node packages/web/src/tutor-diagrams/theme/stray-hex-lint.mjs

## Total: 45 hex literals in 7 files (exit 1)

| file | count | in-palette | near-palette | non-palette |
|---|---|---|---|---|
| packages/web/src/tutor-diagrams/primitives.js | 13 | 13 | 0 | 0 |
| packages/web/src/tutor-diagrams/teaching-theme.js | 26 | 26 | 0 | 0 |
| packages/web/src/tutor-diagrams/TutorDiagram.js | 1 | 1 | 0 | 0 |
| packages/web/src/explain-program/raster-fixtures.js | 1 | 1 | 0 | 0 |
| packages/web/src/explain-program/sdk-raster.js | 1 | 1 | 0 | 0 |
| packages/web/src/IllustrationFigure.jsx | 2 | 1 | 0 | 1 |
| packages/web/src/index.css | 1 | 1 | 0 | 0 |

Grouping: in-palette 44, near-palette 0, non-palette 1. The one non-palette literal is #1f2937 in IllustrationFigure.jsx (the stroke of an illustration callout leader): it needs a palette decision at build time (INK is the nearest palette colour). Every other violation already is a palette value (the palette's own definitions and var() fallbacks); the build step replaces each with an import from theme/palette.js.

## Violations

### packages/web/src/tutor-diagrams/primitives.js

- line 6 #8DBFEF [in-palette] `process: '#8DBFEF',`
- line 7 #E5AA46 [in-palette] `decision: '#E5AA46',`
- line 8 #67B9A0 [in-palette] `outcome: '#67B9A0',`
- line 9 #95A448 [in-palette] `olive: '#95A448',`
- line 10 #F58371 [in-palette] `coral: '#F58371',`
- line 11 #B9A4E8 [in-palette] `lavender: '#B9A4E8',`
- line 12 #E8A3B7 [in-palette] `rose: '#E8A3B7',`
- line 13 #A8BBD0 [in-palette] `slate: '#A8BBD0',`
- line 16 #2F80D8 [in-palette] `export const PATH = '#2F80D8';`
- line 17 #FFFCF0 [in-palette] `export const SURFACE = 'var(--viz-surface, #FFFCF0)';`
- line 18 #32211c [in-palette] `export const INK = 'var(--color-ink, #32211c)';`
- line 19 #665951 [in-palette] `export const MUTED = 'var(--color-ink-2, #665951)';`
- line 20 #32211c [in-palette] `export const FILLED_INK = '#32211c';`

### packages/web/src/tutor-diagrams/teaching-theme.js

- line 9 #FFFCF0 [in-palette] `surface: '#FFFCF0', inset: '#f6f8f4', line: '#e3e7e0', wire: '#b9c3b9',`
- line 9 #f6f8f4 [in-palette] `surface: '#FFFCF0', inset: '#f6f8f4', line: '#e3e7e0', wire: '#b9c3b9',`
- line 9 #e3e7e0 [in-palette] `surface: '#FFFCF0', inset: '#f6f8f4', line: '#e3e7e0', wire: '#b9c3b9',`
- line 9 #b9c3b9 [in-palette] `surface: '#FFFCF0', inset: '#f6f8f4', line: '#e3e7e0', wire: '#b9c3b9',`
- line 10 #32211C [in-palette] `ink: '#32211C', muted: '#665951', blue: '#426db2', blueSoft: '#eaf1fb',`
- line 10 #665951 [in-palette] `ink: '#32211C', muted: '#665951', blue: '#426db2', blueSoft: '#eaf1fb',`
- line 10 #426db2 [in-palette] `ink: '#32211C', muted: '#665951', blue: '#426db2', blueSoft: '#eaf1fb',`
- line 10 #eaf1fb [in-palette] `ink: '#32211C', muted: '#665951', blue: '#426db2', blueSoft: '#eaf1fb',`
- line 11 #b86232 [in-palette] `warm: '#b86232', warmSoft: '#f8ece3', green: '#267657', greenSoft: '#e7f3ed',`
- line 11 #f8ece3 [in-palette] `warm: '#b86232', warmSoft: '#f8ece3', green: '#267657', greenSoft: '#e7f3ed',`
- line 11 #267657 [in-palette] `warm: '#b86232', warmSoft: '#f8ece3', green: '#267657', greenSoft: '#e7f3ed',`
- line 11 #e7f3ed [in-palette] `warm: '#b86232', warmSoft: '#f8ece3', green: '#267657', greenSoft: '#e7f3ed',`
- line 15 #FFFCF0 [in-palette] `ground: '#FFFCF0', outline: FILLED_INK.toUpperCase(),`
- line 16 #F89830 [in-palette] `orange: '#F89830', // measured from Wondering's illustrations, approximate`
- line 26 #375d92 [in-palette] `export const TEACHING_ACCENT = Object.freeze({ blueInk: '#375d92', blueBorder: '#adc4e5' });`
- line 26 #adc4e5 [in-palette] `export const TEACHING_ACCENT = Object.freeze({ blueInk: '#375d92', blueBorder: '#adc4e5' });`
- line 38 #375D92 [in-palette] `export const TEACHING_SERIES_INK = Object.freeze(['#375D92', '#BB503E', '#3A7E69', '#6D7835', '#7F5EC9', '#936`
- line 38 #BB503E [in-palette] `export const TEACHING_SERIES_INK = Object.freeze(['#375D92', '#BB503E', '#3A7E69', '#6D7835', '#7F5EC9', '#936`
- line 38 #3A7E69 [in-palette] `export const TEACHING_SERIES_INK = Object.freeze(['#375D92', '#BB503E', '#3A7E69', '#6D7835', '#7F5EC9', '#936`
- line 38 #6D7835 [in-palette] `export const TEACHING_SERIES_INK = Object.freeze(['#375D92', '#BB503E', '#3A7E69', '#6D7835', '#7F5EC9', '#936`
- line 38 #7F5EC9 [in-palette] `export const TEACHING_SERIES_INK = Object.freeze(['#375D92', '#BB503E', '#3A7E69', '#6D7835', '#7F5EC9', '#936`
- line 38 #936A25 [in-palette] `export const TEACHING_SERIES_INK = Object.freeze(['#375D92', '#BB503E', '#3A7E69', '#6D7835', '#7F5EC9', '#936`
- line 38 #B82E56 [in-palette] `export const TEACHING_SERIES_INK = Object.freeze(['#375D92', '#BB503E', '#3A7E69', '#6D7835', '#7F5EC9', '#936`
- line 38 #507195 [in-palette] `export const TEACHING_SERIES_INK = Object.freeze(['#375D92', '#BB503E', '#3A7E69', '#6D7835', '#7F5EC9', '#936`
- line 45 #D9D3C3 [in-palette] `export const TEACHING_GRID = '#D9D3C3';`
- line 49 #786860 [in-palette] `export const TEACHING_ZERO = '#786860';`

### packages/web/src/tutor-diagrams/TutorDiagram.js

- line 41 #dedad4 [in-palette] `fill: SURFACE, stroke: 'var(--color-line, #dedad4)' }),`

### packages/web/src/explain-program/raster-fixtures.js

- line 36 #E5AA46 [in-palette] `sdk.mask('mask',{x:312,y:44,w:240,h:240,rows,cols,values,color:'#E5AA46',opacity:0.7}),`

### packages/web/src/explain-program/sdk-raster.js

- line 28 #E5AA46 [in-palette] `const object = layout(id, options), { values, color='#E5AA46', opacity=1 } = options;`

### packages/web/src/IllustrationFigure.jsx

- line 59 #FFFCF0 [in-palette] `<div data-illustration-frame style={{ aspectRatio: String(ratio) }} className="relative w-full overflow-hidden`
- line 65 #1f2937 [non-palette] `{callouts.map((c, i) => <line key={i} x1={c.lx} y1={c.ly} x2={c.px} y2={c.py} stroke="#1f2937" strokeWidth="1"`

### packages/web/src/index.css

- line 1106 #a8bbd0 [in-palette] `[data-explain-table] th { font-weight: 600; background: color-mix(in srgb, #a8bbd0 24%, var(--viz-surface)); }`

## Clean already

- interact-style.js: 0 hex literals; control-plane learn-scene-author.js: 0 (both only need to keep reading the palette).
- The rest of packages/web/src/index.css (307 hex literals in the whole app stylesheet) stays out of scope; its --viz-* declarations are generated from palette.js and generate-css.mjs reports no drift today.
