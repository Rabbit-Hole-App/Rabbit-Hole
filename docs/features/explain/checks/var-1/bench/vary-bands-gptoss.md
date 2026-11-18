# VAR-1 variation bands: results.jsonl

For each variation run: (a) every path in the reference's `vary` map: the delivered value, whether it lies in the band [min, max] and whether it equals the value the sampler drew for this requestSeed (the card kept the drawn input); (b) labels: text fields (title, caption, labels, categories, units, kind) of the delivered card that differ from the sampled reference, and (c) whether the array-length structure (series, points, bars, categories) is the reference's.

| item | reference | authored by | in band | equals drawn | out of band (path: value vs band) | text fields changed | structure same |
|---|---|---|---|---|---|---|---|
| 1000 | ensemble-votes | fireworks | 0/4 | 0/4 | series.0.values.0: missing vs [4, 5]; series.0.values.1: missing vs [2, 3]; series.1.values.0: missing vs [3, 3.6]; series.1.values.2: missing vs [0.6, 1] | 11 | NO |
| 1001 | ensemble-votes | fireworks | 0/4 | 0/4 | series.0.values.0: missing vs [4, 5]; series.0.values.1: missing vs [2, 3]; series.1.values.0: missing vs [3, 3.6]; series.1.values.2: missing vs [0.6, 1] | 12 | NO |
| 1002 | log-feature-scale | fireworks | 4/4 | 4/4 | none | 5 | NO |
| 1003 | log-feature-scale | fireworks | 4/4 | 4/4 | none | 3 | NO |
| 1004 | learning-curves | fireworks | 8/8 | 8/8 | none | 2 | NO |
| 1005 | learning-curves | fireworks | 4/8 | 1/8 | series.0.points.1.y: 0.12 vs [0.09, 0.11]; series.0.points.2.y: 0.18 vs [0.12, 0.15]; series.0.points.3.y: 0.22 vs [0.16, 0.19]; series.1.points.3.y: 0.22 vs [0.2, 0.21] | 2 | NO |
| 1006 | bias-variance-decomposition | fireworks | 0/4 | 0/4 | series.0.values.0: missing vs [7, 9]; series.0.values.1: missing vs [2, 3]; series.1.values.1: missing vs [2, 3]; series.1.values.2: missing vs [6, 8] | 13 | NO |
| 1007 | bias-variance-decomposition | fireworks | 0/4 | 0/4 | series.0.values.0: missing vs [7, 9]; series.0.values.1: missing vs [2, 3]; series.1.values.1: missing vs [2, 3]; series.1.values.2: missing vs [6, 8] | 13 | NO |
| 1008 | boosting-signed-corrections | fireworks | 2/6 | 1/6 | series.1.values.1: 0 vs [-2, -1]; series.1.values.2: 1.5 vs [0.5, 1]; series.2.values.1: -2 vs [-0.75, -0.25]; series.2.values.2: -0.5 vs [0.25, 0.5] | 5 | yes |
| 1009 | boosting-signed-corrections | fireworks | 6/6 | 6/6 | none | 0 | yes |
| 1010 | search-grid-and-random | fireworks | 6/6 | 6/6 | none | 6 | NO |
| 1011 | search-grid-and-random | fireworks | 6/6 | 6/6 | none | 3 | NO |
| 1012 | probability-calibration | fireworks | 5/5 | 5/5 | none | 2 | NO |
| 1013 | probability-calibration | fireworks | 5/5 | 5/5 | none | 2 | NO |
| 1014 | acf-pacf-stems | fireworks | 6/6 | 6/6 | none | 3 | yes |
| 1015 | acf-pacf-stems | fireworks | 6/6 | 6/6 | none | 3 | yes |
| 1016 | feature-selection-stability | fireworks | 6/6 | 6/6 | none | 1 | yes |
| 1017 | feature-selection-stability | fireworks | 0/6 | 0/6 | series.0.values.0: missing vs [0.85, 1]; series.0.values.1: missing vs [0.55, 0.75]; series.0.values.2: missing vs [0.1, 0.3]; series.1.values.0: missing vs [0.85, 1]; series.1.values.1: missing vs [0.55, 0.75]; series.1.values.2: missing vs [0.1, 0.3] | 11 | NO |
| 1018 | permutation-feature-importance | fireworks | 6/6 | 6/6 | none | 4 | yes |

Totals: 19 runs with a card; vary paths in band 74/104; equal to the drawn value 70/104; structure same 6/19.

### item 1000 ensemble-votes (bench-1000-1)
text changed: title: "Hard votes and confidence-weighted votes" -> "Votes per class from three weak classifi"; caption: "Illustrative values; compare categories " -> "Illustrative counts of votes each class "; unit: "undefined" -> "votes"; bars.0.label: "undefined" -> "Class A"; bars.1.label: "undefined" -> "Class B"; variant: "grouped" -> "undefined"; categories.0: "Class A" -> "undefined"; categories.1: "Class B" -> "undefined"; categories.2: "Class C" -> "undefined"; series.0.label: "Hard votes" -> "undefined"
shape reference: categories[3] series[2] series[].values[3]
shape card:      bars[2]

### item 1001 ensemble-votes (bench-1001-2)
text changed: title: "Hard votes and confidence-weighted votes" -> "Votes per classifier"; caption: "Illustrative values; compare categories " -> "Illustrative counts of each weak classif"; unit: "undefined" -> "votes"; bars.0.label: "undefined" -> "C1"; bars.1.label: "undefined" -> "C2"; bars.2.label: "undefined" -> "C3"; variant: "grouped" -> "undefined"; categories.0: "Class A" -> "undefined"; categories.1: "Class B" -> "undefined"; categories.2: "Class C" -> "undefined"
shape reference: categories[3] series[2] series[].values[3]
shape card:      bars[3]

### item 1002 log-feature-scale (bench-1002-1)
text changed: title: "A log axis makes ratios comparable" -> "Effect of log axis on skewed data"; caption: "Illustrative values; the geometry shows " -> "Illustrative: points before (linear) and"; x.label: "Positive feature" -> "Feature value"; y.label: "Response" -> "Frequency (arbitrary)"; series.0.label: "Observed" -> "Observed (log)"
shape reference: annotations[0] series[1] series[].points[4]
shape card:      series[1] series[].points[4]

### item 1003 log-feature-scale (bench-1003-2)
text changed: title: "A log axis makes ratios comparable" -> "Log axis reshapes a skewed positive feat"; caption: "Illustrative values; the geometry shows " -> "Illustrative: points on a log‑scaled x‑a"; x.label: "Positive feature" -> "Feature value"
shape reference: annotations[0] series[1] series[].points[4]
shape card:      series[1] series[].points[4]

### item 1004 learning-curves (bench-1004-1)
text changed: title: "Learning curves compare error as data in" -> "Learning curves illustrate error vs. tra"; caption: "Illustrative values; the geometry shows " -> "Illustrative values; the plot shows how "
shape reference: annotations[0] series[2] series[].points[4]
shape card:      series[2] series[].points[4]

### item 1005 learning-curves (bench-1005-2)
text changed: title: "Learning curves compare error as data in" -> "Training vs Validation error"; caption: "Illustrative values; the geometry shows " -> "Illustrative curves; note where validati"
shape reference: annotations[0] series[2] series[].points[4]
shape card:      series[2] series[].points[5]

### item 1006 bias-variance-decomposition (bench-1006-1)
text changed: title: "Expected error changes with model comple" -> "Bias‑variance‑noise decomposition"; caption: "Illustrative values; compare categories " -> "Illustrative contributions to expected s"; unit: "undefined" -> "error"; bars.0.label: "undefined" -> "Bias²"; bars.1.label: "undefined" -> "Variance"; bars.2.label: "undefined" -> "Noise"; variant: "stacked" -> "undefined"; categories.0: "Low complexity" -> "undefined"; categories.1: "Medium complexity" -> "undefined"; categories.2: "High complexity" -> "undefined"
shape reference: categories[3] series[3] series[].values[3]
shape card:      bars[3]

### item 1007 bias-variance-decomposition (bench-1007-2)
text changed: title: "Expected error changes with model comple" -> "Illustrative error contributions"; caption: "Illustrative values; compare categories " -> "Notice the three stacked bars representi"; unit: "undefined" -> "error"; bars.0.label: "undefined" -> "Bias²"; bars.1.label: "undefined" -> "Variance"; bars.2.label: "undefined" -> "Noise"; variant: "stacked" -> "undefined"; categories.0: "Low complexity" -> "undefined"; categories.1: "Medium complexity" -> "undefined"; categories.2: "High complexity" -> "undefined"
shape reference: categories[3] series[3] series[].values[3]
shape card:      bars[3]

### item 1008 boosting-signed-corrections (bench-1008-1)
text changed: categories.0: "Sample A" -> "Model 1"; categories.1: "Sample B" -> "Model 2"; categories.2: "Sample C" -> "Model 3"; series.1.label: "First correction" -> "Positive correction"; series.2.label: "Second correction" -> "Negative correction"
shape reference: categories[3] series[3] series[].values[3]
shape card:      categories[3] series[3] series[].values[3]

### item 1009 boosting-signed-corrections (bench-1009-2)
text changed: none
shape reference: categories[3] series[3] series[].values[3]
shape card:      categories[3] series[3] series[].values[3]

### item 1010 search-grid-and-random (bench-1010-1)
text changed: title: "Search candidates in hyperparameter spac" -> "Hyperparameter coverage by grid and rand"; caption: "Illustrative values; the geometry shows " -> "Illustrative points showing a 3×3 regula"; x.label: "Regularization" -> "Regularization (log)"; y.label: "Depth" -> "Tree depth"; series.0.label: "Grid candidates" -> "Grid points"; series.1.label: "Random candidates" -> "Random points"
shape reference: annotations[0] series[2] series[].points[6] series[].points[9]
shape card:      series[2] series[].points[6] series[].points[9]

### item 1011 search-grid-and-random (bench-1011-2)
text changed: title: "Search candidates in hyperparameter spac" -> "Grid and Random Search Coverage"; caption: "Illustrative values; the geometry shows " -> "Illustrative points showing how each met"; x.label: "Regularization" -> "Regularization (log)"
shape reference: annotations[0] series[2] series[].points[6] series[].points[9]
shape card:      series[2] series[].points[6] series[].points[9]

### item 1012 probability-calibration (bench-1012-1)
text changed: title: "Calibration compares predicted and obser" -> "Calibration plot"; caption: "Illustrative values; the geometry shows " -> "Illustrative predicted vs observed frequ"
shape reference: annotations[0] series[2] series[].points[2] series[].points[5]
shape card:      series[2] series[].points[2] series[].points[5]

### item 1013 probability-calibration (bench-1013-2)
text changed: title: "Calibration compares predicted and obser" -> "Calibration plot (illustrative)"; caption: "Illustrative values; the geometry shows " -> "Look for how observed frequencies compar"
shape reference: annotations[0] series[2] series[].points[2] series[].points[5]
shape card:      series[2] series[].points[2] series[].points[5]

### item 1014 acf-pacf-stems (bench-1014-1)
text changed: title: "Autocorrelation by lag" -> "ACF stem plot"; caption: "Illustrative values; the geometry shows " -> "Illustrative ACF values; note the lag ax"; annotations.0.label: "Illustrative reference band" -> "Typical significance bounds"
shape reference: annotations[1] series[1] series[].points[7]
shape card:      annotations[1] series[1] series[].points[7]

### item 1015 acf-pacf-stems (bench-1015-2)
text changed: title: "Autocorrelation by lag" -> "ACF stem plot example"; caption: "Illustrative values; the geometry shows " -> "Illustrative ACF values for lags 0‑6"; annotations.0.label: "Illustrative reference band" -> "Significance band"
shape reference: annotations[1] series[1] series[].points[7]
shape card:      annotations[1] series[1] series[].points[7]

### item 1016 feature-selection-stability (bench-1016-1)
text changed: caption: "Illustrative values; compare categories " -> "Illustrative values; compare features on"
shape reference: categories[3] series[2] series[].values[3]
shape card:      categories[3] series[2] series[].values[3]

### item 1017 feature-selection-stability (bench-1017-2)
text changed: caption: "Illustrative values; compare categories " -> "Illustrative bar‑chart; each bar shows t"; unit: "undefined" -> "proportion"; bars.0.label: "undefined" -> "Feature A"; bars.1.label: "undefined" -> "Feature B"; bars.2.label: "undefined" -> "Feature C"; variant: "grouped" -> "undefined"; categories.0: "Feature A" -> "undefined"; categories.1: "Feature B" -> "undefined"; categories.2: "Feature C" -> "undefined"; series.0.label: "L1 selector" -> "undefined"
shape reference: categories[3] series[2] series[].values[3]
shape card:      bars[3]

### item 1018 permutation-feature-importance (bench-1018-1)
text changed: title: "Permutation importance is a drop in scor" -> "Permutation importance across repeats"; caption: "Illustrative values; compare categories " -> "Illustrative drop in model score for two"; series.0.label: "Shuffle 1" -> "Shuffle 1"; series.1.label: "Shuffle 2" -> "Shuffle 2"
shape reference: categories[3] series[2] series[].values[3]
shape card:      categories[3] series[2] series[].values[3]

