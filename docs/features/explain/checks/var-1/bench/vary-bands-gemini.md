# VAR-1 variation bands: results-combined.jsonl

For each variation run: (a) every path in the reference's `vary` map: the delivered value, whether it lies in the band [min, max] and whether it equals the value the sampler drew for this requestSeed (the card kept the drawn input); (b) labels: text fields (title, caption, labels, categories, units, kind) of the delivered card that differ from the sampled reference, and (c) whether the array-length structure (series, points, bars, categories) is the reference's.

| item | reference | authored by | in band | equals drawn | out of band (path: value vs band) | text fields changed | structure same |
|---|---|---|---|---|---|---|---|
| 1000 | ensemble-votes | google | 4/4 | 4/4 | none | 0 | yes |
| 1001 | ensemble-votes | google | 4/4 | 4/4 | none | 0 | yes |
| 1002 | log-feature-scale | google | 4/4 | 4/4 | none | 1 | NO |
| 1003 | log-feature-scale | google | 4/4 | 4/4 | none | 2 | yes |
| 1004 | learning-curves | google | 8/8 | 8/8 | none | 0 | yes |
| 1005 | learning-curves | google | 8/8 | 8/8 | none | 0 | yes |
| 1006 | bias-variance-decomposition | google | 4/4 | 4/4 | none | 0 | yes |
| 1007 | bias-variance-decomposition | google | 4/4 | 4/4 | none | 0 | yes |
| 1008 | boosting-signed-corrections | google | 6/6 | 6/6 | none | 0 | yes |
| 1009 | boosting-signed-corrections | google | 6/6 | 6/6 | none | 0 | yes |
| 1010 | search-grid-and-random | google | 6/6 | 6/6 | none | 1 | yes |
| 1011 | search-grid-and-random | google | 6/6 | 6/6 | none | 1 | NO |
| 1012 | probability-calibration | google | 5/5 | 5/5 | none | 0 | yes |
| 1013 | probability-calibration | google | 5/5 | 5/5 | none | 2 | yes |
| 1014 | acf-pacf-stems | google | 6/6 | 6/6 | none | 0 | yes |
| 1015 | acf-pacf-stems | google | 6/6 | 6/6 | none | 2 | yes |
| 1016 | feature-selection-stability | google | 6/6 | 6/6 | none | 1 | yes |
| 1017 | feature-selection-stability | google | 6/6 | 6/6 | none | 1 | yes |
| 1018 | permutation-feature-importance | google | 6/6 | 6/6 | none | 0 | yes |
| 1019 | permutation-feature-importance | google | 6/6 | 6/6 | none | 0 | yes |

Totals: 20 runs with a card; vary paths in band 110/110; equal to the drawn value 110/110; structure same 18/20.

### item 1000 ensemble-votes (bench-1000-1)
text changed: none
shape reference: categories[3] series[2] series[].values[3]
shape card:      categories[3] series[2] series[].values[3]

### item 1001 ensemble-votes (bench-1001-2)
text changed: none
shape reference: categories[3] series[2] series[].values[3]
shape card:      categories[3] series[2] series[].values[3]

### item 1002 log-feature-scale (bench-1002-1)
text changed: caption: "Illustrative values; the geometry shows " -> "Illustrative values; equal multiplicativ"
shape reference: annotations[0] series[1] series[].points[4]
shape card:      series[1] series[].points[4]

### item 1003 log-feature-scale (bench-1003-2)
text changed: title: "A log axis makes ratios comparable" -> "A log axis compresses large values"; caption: "Illustrative values; the geometry shows " -> "Equal multiplicative ratios occupy equal"
shape reference: annotations[0] series[1] series[].points[4]
shape card:      annotations[0] series[1] series[].points[4]

### item 1004 learning-curves (bench-1004-1)
text changed: none
shape reference: annotations[0] series[2] series[].points[4]
shape card:      annotations[0] series[2] series[].points[4]

### item 1005 learning-curves (bench-1005-2)
text changed: none
shape reference: annotations[0] series[2] series[].points[4]
shape card:      annotations[0] series[2] series[].points[4]

### item 1006 bias-variance-decomposition (bench-1006-1)
text changed: none
shape reference: categories[3] series[3] series[].values[3]
shape card:      categories[3] series[3] series[].values[3]

### item 1007 bias-variance-decomposition (bench-1007-2)
text changed: none
shape reference: categories[3] series[3] series[].values[3]
shape card:      categories[3] series[3] series[].values[3]

### item 1008 boosting-signed-corrections (bench-1008-1)
text changed: none
shape reference: categories[3] series[3] series[].values[3]
shape card:      categories[3] series[3] series[].values[3]

### item 1009 boosting-signed-corrections (bench-1009-2)
text changed: none
shape reference: categories[3] series[3] series[].values[3]
shape card:      categories[3] series[3] series[].values[3]

### item 1010 search-grid-and-random (bench-1010-1)
text changed: caption: "Illustrative values; the geometry shows " -> "Illustrative values showing how grid and"
shape reference: annotations[0] series[2] series[].points[6] series[].points[9]
shape card:      annotations[0] series[2] series[].points[6] series[].points[9]

### item 1011 search-grid-and-random (bench-1011-2)
text changed: caption: "Illustrative values; the geometry shows " -> "Illustrative values; grid evaluates fixe"
shape reference: annotations[0] series[2] series[].points[6] series[].points[9]
shape card:      series[2] series[].points[6] series[].points[9]

### item 1012 probability-calibration (bench-1012-1)
text changed: none
shape reference: annotations[0] series[2] series[].points[2] series[].points[5]
shape card:      annotations[0] series[2] series[].points[2] series[].points[5]

### item 1013 probability-calibration (bench-1013-2)
text changed: title: "Calibration compares predicted and obser" -> "Reliability diagram comparing predicted "; caption: "Illustrative values; the geometry shows " -> "Illustrative values; the geometry shows "
shape reference: annotations[0] series[2] series[].points[2] series[].points[5]
shape card:      annotations[0] series[2] series[].points[2] series[].points[5]

### item 1014 acf-pacf-stems (bench-1014-1)
text changed: none
shape reference: annotations[1] series[1] series[].points[7]
shape card:      annotations[1] series[1] series[].points[7]

### item 1015 acf-pacf-stems (bench-1015-2)
text changed: caption: "Illustrative values; the geometry shows " -> "Illustrative ACF stem plot showing value"; annotations.0.label: "Illustrative reference band" -> "Significance band"
shape reference: annotations[1] series[1] series[].points[7]
shape card:      annotations[1] series[1] series[].points[7]

### item 1016 feature-selection-stability (bench-1016-1)
text changed: caption: "Illustrative values; compare categories " -> "Compare feature selection fractions unde"
shape reference: categories[3] series[2] series[].values[3]
shape card:      categories[3] series[2] series[].values[3]

### item 1017 feature-selection-stability (bench-1017-2)
text changed: caption: "Illustrative values; compare categories " -> "Illustrative values comparing features o"
shape reference: categories[3] series[2] series[].values[3]
shape card:      categories[3] series[2] series[].values[3]

### item 1018 permutation-feature-importance (bench-1018-1)
text changed: none
shape reference: categories[3] series[2] series[].values[3]
shape card:      categories[3] series[2] series[].values[3]

### item 1019 permutation-feature-importance (bench-1019-2)
text changed: none
shape reference: categories[3] series[2] series[].values[3]
shape card:      categories[3] series[2] series[].values[3]

