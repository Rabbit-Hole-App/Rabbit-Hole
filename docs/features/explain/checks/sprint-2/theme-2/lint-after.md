# THEME-2 lint after the build

Scope: tutor-diagrams/, explain-program/, interact-style.js, IllustrationFigure.jsx, learn-scene-author.js and the [data-explain-table] rules of index.css (45 literals in 7 files before; see lint-before.md).

```
0 stray hex literals in 0 files
exit=0
index.css matches palette.js
✔ every reference and every kind gallery shape renders with palette colours only, at 408 (5575.0299ms)
✔ no hex colour literal lives outside theme/palette.js in tutor-diagrams, explain-program, interact-style.js and learn-scene-author.js (232.0323ms)
✔ the --viz-* declarations of index.css are the ones theme/palette.js generates (664.2673ms)
ℹ tests 3
ℹ pass 3
ℹ fail 0
```
