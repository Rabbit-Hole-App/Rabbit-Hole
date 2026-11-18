# VAR-1 variation diff (same prompt asked twice, different requestSeed)

All cards authored by gpt-oss (Gemini 402). Pair counts only if the reference was selected in both runs.

| reference | selected both | kinds same | requestSeeds | paths changed | of which numeric-looking | structure paths changed (labels/kinds/captions) |
|---|---|---|---|---|---|---|
| ensemble-votes | yes | yes | bench-1000-1 / bench-1001-2 | 8 | 3 | 5 |
| log-feature-scale | yes | yes | bench-1002-1 / bench-1003-2 | 7 | 3 | 4 |
| learning-curves | yes | yes | bench-1004-1 / bench-1005-2 | 21 | 19 | 2 |
| bias-variance-decomposition | yes | yes | bench-1006-1 / bench-1007-2 | 4 | 2 | 2 |
| boosting-signed-corrections | yes | yes | bench-1008-1 / bench-1009-2 | 10 | 5 | 5 |
| search-grid-and-random | yes | yes | bench-1010-1 / bench-1011-2 | 11 | 6 | 5 |
| probability-calibration | yes | yes | bench-1012-1 / bench-1013-2 | 7 | 5 | 2 |
| acf-pacf-stems | yes | yes | bench-1014-1 / bench-1015-2 | 7 | 4 | 3 |
| feature-selection-stability | yes | yes | bench-1016-1 / bench-1017-2 | 20 | 9 | 11 |
| permutation-feature-importance | only one run (item 1019 not run) | | | | | |

### ensemble-votes
numeric-looking: 0.bars.0.value: 2 -> 3; 0.bars.1.value: 1 -> 2; 0.bars.2.value: undefined -> 4
structure: 0.title: Votes per class from three weak classifi -> Votes per classifier; 0.caption: Illustrative counts of votes each class  -> Illustrative counts of each weak classif; 0.bars.0.label: Class A -> C1; 0.bars.1.label: Class B -> C2; 0.bars.2.label: undefined -> C3

### log-feature-scale
numeric-looking: 0.series.0.points.1.y: 1 -> 1.9; 0.series.0.points.2.y: 2.8 -> 3; 0.series.0.points.3.y: 3.8 -> 3.6
structure: 0.title: Effect of log axis on skewed data -> Log axis reshapes a skewed positive feat; 0.caption: Illustrative: points before (linear) and -> Illustrative: points on a log‑scaled x‑a; 0.y.label: Frequency (arbitrary) -> Response; 0.series.0.label: Observed (log) -> Observed

### learning-curves
numeric-looking: 0.x.max: 100 -> 200; 0.series.0.points.0.y: 0.03 -> 0.05; 0.series.0.points.1.x: 25 -> 50; 0.series.0.points.1.y: 0.1 -> 0.12; 0.series.0.points.2.x: 50 -> 100; 0.series.0.points.2.y: 0.12 -> 0.18; 0.series.0.points.3.x: 100 -> 150; 0.series.0.points.3.y: 0.18 -> 0.22; 0.series.1.points.0.y: 0.43 -> 0.4; 0.series.1.points.1.x: 25 -> 50; 0.series.1.points.1.y: 0.31 -> 0.3; 0.series.1.points.2.x: 50 -> 100
structure: 0.title: Learning curves illustrate error vs. tra -> Training vs Validation error; 0.caption: Illustrative values; the plot shows how  -> Illustrative curves; note where validati

### bias-variance-decomposition
numeric-looking: 0.bars.1.value: 3 -> 2; 0.bars.2.value: 2 -> 1
structure: 0.title: Bias‑variance‑noise decomposition -> Illustrative error contributions; 0.caption: Illustrative contributions to expected s -> Notice the three stacked bars representi

### boosting-signed-corrections
numeric-looking: 0.series.1.values.0: 2 -> 2.5; 0.series.1.values.1: 0 -> -2; 0.series.1.values.2: 1.5 -> 0.5; 0.series.2.values.1: -2 -> -0.25; 0.series.2.values.2: -0.5 -> 0.25
structure: 0.categories.0: Model 1 -> Sample A; 0.categories.1: Model 2 -> Sample B; 0.categories.2: Model 3 -> Sample C; 0.series.1.label: Positive correction -> First correction; 0.series.2.label: Negative correction -> Second correction

### search-grid-and-random
numeric-looking: 0.series.1.points.0.x: 0.05 -> 0.04; 0.series.1.points.1.x: 0.28 -> 0.26; 0.series.1.points.2.x: 0.6 -> 0.7; 0.series.1.points.3.x: 4 -> 2.8; 0.series.1.points.4.x: 11 -> 7; 0.series.1.points.5.x: 50 -> 30
structure: 0.title: Hyperparameter coverage by grid and rand -> Grid and Random Search Coverage; 0.caption: Illustrative points showing a 3×3 regula -> Illustrative points showing how each met; 0.y.label: Tree depth -> Depth; 0.series.0.label: Grid points -> Grid candidates; 0.series.1.label: Random points -> Random candidates

### probability-calibration
numeric-looking: 0.series.0.points.0.y: 0.07 -> 0.08; 0.series.0.points.1.y: 0.26 -> 0.16; 0.series.0.points.2.y: 0.3 -> 0.45; 0.series.0.points.3.y: 0.52 -> 0.56; 0.series.0.points.4.y: 0.76 -> 0.82
structure: 0.title: Calibration plot -> Calibration plot (illustrative); 0.caption: Illustrative predicted vs observed frequ -> Look for how observed frequencies compar

### acf-pacf-stems
numeric-looking: 0.series.0.points.1.y: 0.7 -> 0.75; 0.series.0.points.2.y: 0.35 -> 0.4; 0.series.0.points.3.y: 0.25 -> 0.3; 0.series.0.points.4.y: -0.1 -> -0.15
structure: 0.title: ACF stem plot -> ACF stem plot example; 0.caption: Illustrative ACF values; note the lag ax -> Illustrative ACF values for lags 0‑6; 0.annotations.0.label: Typical significance bounds -> Significance band

### feature-selection-stability
numeric-looking: 0.series.0.values.0: 0.95 -> undefined; 0.series.0.values.1: 0.7 -> undefined; 0.series.0.values.2: 0.2 -> undefined; 0.series.1.values.0: 0.85 -> undefined; 0.series.1.values.1: 0.7 -> undefined; 0.series.1.values.2: 0.3 -> undefined; 0.bars.0.value: undefined -> 0.92; 0.bars.1.value: undefined -> 0.55; 0.bars.2.value: undefined -> 0.18
structure: 0.caption: Illustrative values; compare features on -> Illustrative bar‑chart; each bar shows t; 0.variant: grouped -> undefined; 0.categories.0: Feature A -> undefined; 0.categories.1: Feature B -> undefined; 0.categories.2: Feature C -> undefined; 0.series.0.label: L1 selector -> undefined; 0.series.1.label: Recursive elimination -> undefined; 0.unit: undefined -> proportion; 0.bars.0.label: undefined -> Feature A; 0.bars.1.label: undefined -> Feature B; 0.bars.2.label: undefined -> Feature C

