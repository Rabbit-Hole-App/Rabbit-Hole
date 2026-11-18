# VAR-1 variation diff (same prompt asked twice, different requestSeed)

All cards authored by gpt-oss (Gemini 402). Pair counts only if the reference was selected in both runs.

| reference | selected both | kinds same | requestSeeds | paths changed | of which numeric-looking | structure paths changed (labels/kinds/captions) |
|---|---|---|---|---|---|---|
| ensemble-votes | yes | yes | bench-1000-1 / bench-1001-2 | 3 | 3 | 0 |
| log-feature-scale | yes | yes | bench-1002-1 / bench-1003-2 | 5 | 3 | 2 |
| learning-curves | yes | yes | bench-1004-1 / bench-1005-2 | 7 | 7 | 0 |
| bias-variance-decomposition | yes | yes | bench-1006-1 / bench-1007-2 | 2 | 2 | 0 |
| boosting-signed-corrections | yes | yes | bench-1008-1 / bench-1009-2 | 3 | 3 | 0 |
| search-grid-and-random | yes | yes | bench-1010-1 / bench-1011-2 | 7 | 6 | 1 |
| probability-calibration | yes | yes | bench-1012-1 / bench-1013-2 | 7 | 5 | 2 |
| acf-pacf-stems | yes | yes | bench-1014-1 / bench-1015-2 | 6 | 4 | 2 |
| feature-selection-stability | yes | yes | bench-1016-1 / bench-1017-2 | 5 | 4 | 1 |
| permutation-feature-importance | yes | yes | bench-1018-1 / bench-1019-2 | 3 | 3 | 0 |

### ensemble-votes
numeric-looking: 0.series.0.values.0: 4 -> 5; 0.series.1.values.0: 3.5 -> 3; 0.series.1.values.2: 1 -> 0.7
structure: none

### log-feature-scale
numeric-looking: 0.series.0.points.1.y: 1 -> 1.9; 0.series.0.points.2.y: 2.8 -> 3; 0.series.0.points.3.y: 3.8 -> 3.6
structure: 0.title: A log axis makes ratios comparable -> A log axis compresses large values; 0.caption: Illustrative values; equal multiplicativ -> Equal multiplicative ratios occupy equal

### learning-curves
numeric-looking: 0.series.0.points.0.y: 0.03 -> 0.05; 0.series.0.points.1.y: 0.1 -> 0.09; 0.series.0.points.2.y: 0.12 -> 0.14; 0.series.0.points.3.y: 0.18 -> 0.19; 0.series.1.points.0.y: 0.43 -> 0.41; 0.series.1.points.1.y: 0.31 -> 0.34; 0.series.1.points.2.y: 0.23 -> 0.26
structure: none

### bias-variance-decomposition
numeric-looking: 0.series.1.values.1: 3 -> 2; 0.series.1.values.2: 8 -> 6
structure: none

### boosting-signed-corrections
numeric-looking: 0.series.1.values.0: 3 -> 2.5; 0.series.1.values.2: 0.75 -> 0.5; 0.series.2.values.1: -0.75 -> -0.25
structure: none

### search-grid-and-random
numeric-looking: 0.series.1.points.0.x: 0.05 -> 0.04; 0.series.1.points.1.x: 0.28 -> 0.26; 0.series.1.points.2.x: 0.6 -> 0.7; 0.series.1.points.3.x: 4 -> 2.8; 0.series.1.points.4.x: 11 -> 7; 0.series.1.points.5.x: 50 -> 30
structure: 0.caption: Illustrative values showing how grid and -> Illustrative values; grid evaluates fixe

### probability-calibration
numeric-looking: 0.series.0.points.0.y: 0.07 -> 0.08; 0.series.0.points.1.y: 0.26 -> 0.16; 0.series.0.points.2.y: 0.3 -> 0.45; 0.series.0.points.3.y: 0.52 -> 0.56; 0.series.0.points.4.y: 0.76 -> 0.82
structure: 0.title: Calibration compares predicted and obser -> Reliability diagram comparing predicted ; 0.caption: Illustrative values; the geometry shows  -> Illustrative values; the geometry shows 

### acf-pacf-stems
numeric-looking: 0.series.0.points.1.y: 0.7 -> 0.75; 0.series.0.points.2.y: 0.35 -> 0.4; 0.series.0.points.3.y: 0.25 -> 0.3; 0.series.0.points.4.y: -0.1 -> -0.15
structure: 0.caption: Illustrative values; the geometry shows  -> Illustrative ACF stem plot showing value; 0.annotations.0.label: Illustrative reference band -> Significance band

### feature-selection-stability
numeric-looking: 0.series.0.values.0: 0.95 -> 0.9; 0.series.0.values.2: 0.2 -> 0.25; 0.series.1.values.0: 0.85 -> 0.9; 0.series.1.values.2: 0.3 -> 0.25
structure: 0.caption: Compare feature selection fractions unde -> Illustrative values comparing features o

### permutation-feature-importance
numeric-looking: 0.series.0.values.0: 0.15 -> 0.22; 0.series.1.values.0: 0.14 -> 0.19; 0.series.1.values.1: 0.06 -> 0.07
structure: none

