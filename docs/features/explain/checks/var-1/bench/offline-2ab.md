# VAR-1 bench, offline 2a/2b (no spend): old-classifier flags and first-attempt-invalid answers on the Gemini-live slice (items 0 to 154)

## 2a. Old-classifier flags: real mismatch or checker false positive

One flag = one classifier line on one delivered card (a card can carry several). Counts per arm:

| class | before | after |
|---|---|---|
| FP-checker (heatmap mask) | 1 | 1 |
| FP-formula-opening | 2 | 10 |
| FP-cross-class | 13 | 11 |
| FP-minmax-whiskers | 4 | 8 |
| REAL | 4 | 2 |
| cards with at least one flag | 10 | 17 |
| cards with at least one REAL flag | 2 | 1 |

Classes: FP-formula-opening = the prose number is the first operand of a formula whose result equals the figure ("$11.5 + 1.5(6) = 20.5$"); FP-cross-class = a class median compared with the other class's label; FP-minmax-whiskers = whiskers at the data min/max, no fences or outliers drawn, prose never says outlier; FP-checker (heatmap mask) = the causal-mask grid is not weights.

REAL (item ids):
- after item 112 (brief, google): box-whisker-beyond-correct-fence: whiskerLow 40 beyond the correct fence 62 / 86
- after item 112 (brief, google): box-whisker-beyond-correct-fence: whiskerHigh 100 beyond the correct fence 62 / 86
- before item 114 (balanced, google): box-whisker-beyond-correct-fence: whiskerLow 40 beyond the correct fence 58 / 90
- before item 114 (balanced, google): box-whisker-beyond-correct-fence: whiskerHigh 100 beyond the correct fence 58 / 90
- before item 115 (balanced, google): box-whisker-beyond-correct-fence: whiskerLow 40 beyond the correct fence 62 / 86
- before item 115 (balanced, google): box-whisker-beyond-correct-fence: whiskerHigh 100 beyond the correct fence 62 / 86

Fences drawn on the whisker-flagged cards: after 111: no fences, no outliers drawn; before 111: no fences, no outliers drawn; after 112: no fences, no outliers drawn; after 113: no fences, no outliers drawn; before 113: no fences, no outliers drawn; before 114: no fences, no outliers drawn; after 114: no fences, no outliers drawn; after 115: no fences, no outliers drawn; before 115: no fences, no outliers drawn

### Every flag

- before item 56 detailed [FP-checker (heatmap mask)] heatmap-weights-should-sum-to-1: row sums 0, 0, 0, 0, 0, 0 :: causal-mask grid (allowed 0, blocked null), not weights; the card has its own content error (HEAT-1: diagonal blocked, no contrast)
- after item 56 detailed [FP-checker (heatmap mask)] heatmap-weights-should-sum-to-1: row sums 0, 0, 0, 0, 0, 0 :: causal-mask grid (allowed 0, blocked null), not weights; the card has its own content error (HEAT-1: diagonal blocked, no contrast)
- after item 87 balanced [FP-formula-opening] label-value-vs-prose: upper fence: diagram 20.5, prose "upper fence at $11.5" :: prose number 11.5 opens "Fences sit at $1.5 \times \mathrm{IQR}$ beyond the quartiles, setting the upper fence at $11.5 + 1.5(6) = 20.5", result matches the figure
- after item 88 balanced [FP-formula-opening] label-value-vs-prose: upper fence: diagram 20.5, prose "upper fence is $11.5" :: prose number 11.5 opens "In our dataset, the upper fence is $11.5 + 1.5(6) = 20.5$, which clearly flags the value $40$ as an outlier.", result matches the figure
- after item 89 detailed [FP-formula-opening] label-value-vs-prose: upper fence: diagram 18.5, prose "upper fence is $11" :: prose number 11 opens "The upper fence is $11 + 7.5 = 18.5$, and any data point exceeding this limit is flagged as an outlier.", result matches the figure
- before item 90 detailed [FP-formula-opening] label-value-vs-prose: upper fence: diagram 20.5, prose "upper fence at $11.5" :: prose number 11.5 opens "Multiplying by $1.5$ yields $9$, setting the upper fence at $11.5 + 9 = 20.5$.", result matches the figure
- after item 98 detailed [FP-formula-opening] label-value-vs-prose: IQR: diagram 13.25, prose "IQR is $75.7" :: prose number 75.7 opens "Here, the IQR is $75.75 - 62.5 = 13.25$ points.", result matches the figure
- after item 98 detailed [FP-formula-opening] label-value-vs-prose: upper fence: diagram 95.625, prose "upper fence is $75.75" :: prose number 75.75 opens "This upper fence is $75.75 + 19.875 = 95.625$, which means the score of $98$ sits past the fence and is an out", result matches the figure
- after item 99 detailed [FP-formula-opening] label-value-vs-prose: upper fence: diagram 96, prose "upper fence of $75" :: prose number 75 opens "Outliers are values that fall beyond $1.5$ times the IQR above $Q_3$ or below $Q_1$, yielding an upper fence o", result matches the figure
- before item 99 detailed [FP-formula-opening] label-value-vs-prose: upper fence: diagram 96, prose "upper fence at $75" :: prose number 75 opens "Fences extend $1.5 \times \mathrm{IQR} = 21$ past the quartiles, setting the upper fence at $75 + 21 = 96$.", result matches the figure
- after item 110 brief [FP-cross-class] label-value-vs-prose: median: diagram 74, prose "median of 75" :: prose 75 is another box's value (the checker compared a class with the other class's label)
- after item 111 brief [FP-cross-class] label-value-vs-prose: median: diagram 74, prose "median of 75" :: prose 75 is another box's value (the checker compared a class with the other class's label)
- after item 111 brief [FP-minmax-whiskers] box-whisker-beyond-correct-fence: whiskerLow 40 beyond the correct fence 62 / 86 :: no fences, no outliers drawn, prose never calls the points outliers: min-max whiskers by convention
- after item 111 brief [FP-minmax-whiskers] box-whisker-beyond-correct-fence: whiskerHigh 100 beyond the correct fence 62 / 86 :: no fences, no outliers drawn, prose never calls the points outliers: min-max whiskers by convention
- before item 111 brief [FP-cross-class] label-value-vs-prose: median: diagram 75, prose "median of 74" :: prose 74 is another box's value (the checker compared a class with the other class's label)
- before item 111 brief [FP-cross-class] label-value-vs-prose: median: diagram 74, prose "median of 75" :: prose 75 is another box's value (the checker compared a class with the other class's label)
- before item 111 brief [FP-minmax-whiskers] box-whisker-beyond-correct-fence: whiskerLow 40 beyond the correct fence 58 / 90 :: no fences, no outliers drawn, prose never calls the points outliers: min-max whiskers by convention
- before item 111 brief [FP-minmax-whiskers] box-whisker-beyond-correct-fence: whiskerHigh 100 beyond the correct fence 58 / 90 :: no fences, no outliers drawn, prose never calls the points outliers: min-max whiskers by convention
- after item 112 brief [REAL] box-whisker-beyond-correct-fence: whiskerLow 40 beyond the correct fence 62 / 86 :: no fences or outliers drawn but the prose calls the extreme points outliers
- after item 112 brief [REAL] box-whisker-beyond-correct-fence: whiskerHigh 100 beyond the correct fence 62 / 86 :: no fences or outliers drawn but the prose calls the extreme points outliers
- after item 113 balanced [FP-cross-class] label-value-vs-prose: median: diagram 75, prose "median of 74," :: prose 74 is another box's value (the checker compared a class with the other class's label)
- after item 113 balanced [FP-cross-class] label-value-vs-prose: median: diagram 74, prose "median is 75," :: prose 75 is another box's value (the checker compared a class with the other class's label)
- after item 113 balanced [FP-minmax-whiskers] box-whisker-beyond-correct-fence: whiskerLow 40 beyond the correct fence 62 / 86 :: no fences, no outliers drawn, prose never calls the points outliers: min-max whiskers by convention
- after item 113 balanced [FP-minmax-whiskers] box-whisker-beyond-correct-fence: whiskerHigh 100 beyond the correct fence 62 / 86 :: no fences, no outliers drawn, prose never calls the points outliers: min-max whiskers by convention
- before item 113 balanced [FP-cross-class] label-value-vs-prose: median: diagram 75, prose "median is 74," :: prose 74 is another box's value (the checker compared a class with the other class's label)
- before item 113 balanced [FP-cross-class] label-value-vs-prose: median: diagram 74, prose "median is 75," :: prose 75 is another box's value (the checker compared a class with the other class's label)
- before item 113 balanced [FP-minmax-whiskers] box-whisker-beyond-correct-fence: whiskerLow 40 beyond the correct fence 58 / 90 :: no fences, no outliers drawn, prose never calls the points outliers: min-max whiskers by convention
- before item 113 balanced [FP-minmax-whiskers] box-whisker-beyond-correct-fence: whiskerHigh 100 beyond the correct fence 58 / 90 :: no fences, no outliers drawn, prose never calls the points outliers: min-max whiskers by convention
- before item 114 balanced [FP-cross-class] label-value-vs-prose: median: diagram 75, prose "median of 74" :: prose 74 is another box's value (the checker compared a class with the other class's label)
- before item 114 balanced [FP-cross-class] label-value-vs-prose: median: diagram 74, prose "median of 75" :: prose 75 is another box's value (the checker compared a class with the other class's label)
- before item 114 balanced [REAL] box-whisker-beyond-correct-fence: whiskerLow 40 beyond the correct fence 58 / 90 :: no fences or outliers drawn but the prose calls the extreme points outliers
- before item 114 balanced [REAL] box-whisker-beyond-correct-fence: whiskerHigh 100 beyond the correct fence 58 / 90 :: no fences or outliers drawn but the prose calls the extreme points outliers
- after item 114 balanced [FP-cross-class] label-value-vs-prose: median: diagram 75, prose "median of 74" :: prose 74 is another box's value (the checker compared a class with the other class's label)
- after item 114 balanced [FP-minmax-whiskers] box-whisker-beyond-correct-fence: whiskerLow 40 beyond the correct fence 62 / 86 :: no fences, no outliers drawn, prose never calls the points outliers: min-max whiskers by convention
- after item 114 balanced [FP-minmax-whiskers] box-whisker-beyond-correct-fence: whiskerHigh 100 beyond the correct fence 62 / 86 :: no fences, no outliers drawn, prose never calls the points outliers: min-max whiskers by convention
- after item 115 balanced [FP-cross-class] label-value-vs-prose: median: diagram 75, prose "median around $74" :: prose 74 is another box's value (the checker compared a class with the other class's label)
- after item 115 balanced [FP-cross-class] label-value-vs-prose: median: diagram 74, prose "median of $75" :: prose 75 is another box's value (the checker compared a class with the other class's label)
- after item 115 balanced [FP-minmax-whiskers] box-whisker-beyond-correct-fence: whiskerLow 40 beyond the correct fence 62 / 86 :: no fences, no outliers drawn, prose never calls the points outliers: min-max whiskers by convention
- after item 115 balanced [FP-minmax-whiskers] box-whisker-beyond-correct-fence: whiskerHigh 100 beyond the correct fence 62 / 86 :: no fences, no outliers drawn, prose never calls the points outliers: min-max whiskers by convention
- before item 115 balanced [FP-cross-class] label-value-vs-prose: median: diagram 75, prose "median of 74" :: prose 74 is another box's value (the checker compared a class with the other class's label)
- before item 115 balanced [FP-cross-class] label-value-vs-prose: median: diagram 74, prose "median of 75" :: prose 75 is another box's value (the checker compared a class with the other class's label)
- before item 115 balanced [REAL] box-whisker-beyond-correct-fence: whiskerLow 40 beyond the correct fence 62 / 86 :: no fences or outliers drawn but the prose calls the extreme points outliers
- before item 115 balanced [REAL] box-whisker-beyond-correct-fence: whiskerHigh 100 beyond the correct fence 62 / 86 :: no fences or outliers drawn but the prose calls the extreme points outliers
- before item 116 detailed [FP-cross-class] label-value-vs-prose: median: diagram 74, prose "median of $75" :: prose 75 is another box's value (the checker compared a class with the other class's label)
- after item 116 detailed [FP-cross-class] label-value-vs-prose: median: diagram 75, prose "median of $74" :: prose 74 is another box's value (the checker compared a class with the other class's label)
- after item 116 detailed [FP-cross-class] label-value-vs-prose: median: diagram 74, prose "median of $75" :: prose 75 is another box's value (the checker compared a class with the other class's label)
- before item 117 detailed [FP-cross-class] label-value-vs-prose: median: diagram 75, prose "median of $74" :: prose 74 is another box's value (the checker compared a class with the other class's label)
- before item 117 detailed [FP-cross-class] label-value-vs-prose: median: diagram 74, prose "median of $75" :: prose 75 is another box's value (the checker compared a class with the other class's label)
- before item 118 detailed [FP-cross-class] label-value-vs-prose: median: diagram 75, prose "median of 74," :: prose 74 is another box's value (the checker compared a class with the other class's label)
- before item 118 detailed [FP-cross-class] label-value-vs-prose: median: diagram 74, prose "median of 75" :: prose 75 is another box's value (the checker compared a class with the other class's label)
- after item 118 detailed [FP-cross-class] label-value-vs-prose: median: diagram 75, prose "median of 74," :: prose 74 is another box's value (the checker compared a class with the other class's label)
- after item 118 detailed [FP-cross-class] label-value-vs-prose: median: diagram 74, prose "median of 75," :: prose 75 is another box's value (the checker compared a class with the other class's label)
- after item 132 balanced [FP-formula-opening] label-value-vs-prose: IQR: diagram 14, prose "IQR is $10" :: prose number 10 opens "The interquartile range or IQR is $105 - 91 = 14$ ms.", result matches the figure
- after item 134 detailed [FP-formula-opening] label-value-vs-prose: upper fence: diagram 125, prose "upper fence at $104" :: prose number 104 opens "Multiplying by $1.5$ yields $21$ ms, establishing the upper fence at $104 + 21 = 125$ ms.", result matches the figure
- after item 135 detailed [FP-formula-opening] label-value-vs-prose: lower fence: diagram 69, prose "lower fence at $9" :: prose number 9 opens "Multiplying by 1.5 gives 21 ms, setting the upper fence at $104 + 21 = 125$ ms and the lower fence at $90 - 21", result matches the figure
- after item 135 detailed [FP-formula-opening] label-value-vs-prose: upper fence: diagram 125, prose "upper fence at $104" :: prose number 104 opens "Multiplying by 1.5 gives 21 ms, setting the upper fence at $104 + 21 = 125$ ms and the lower fence at $90 - 21", result matches the figure

## 2b. First-attempt-invalid answers (Gemini, attempt 0) on the Gemini-live slice

First attempt invalid: before 19, after 26 (known first attempt: 151 before, 152 after)

| error code at attempt 0 | before | after | example |
|---|---|---|---|
| explanation_bad_diagram | 8 | 16 | explanation_bad_diagram: the rh-diagram spec is not valid (diagram.title: A diagram needs a title; diagram.nodes: A tree needs one root; diagram.nodes |
| explanation_bad_numbers | 8 | 8 | explanation_bad_numbers: the rh-diagram spec states wrong numbers (diagram.boxes.0.fences: Fences must be Q1 - 1.5 x IQR and Q3 + 1.5 x IQR: with Q1 6 |
| explanation_missing_visual | 3 | 2 | explanation_missing_visual: the card needs one to three visuals, an rh-diagram or an rh-illustration fence, each with prose before and after it; add o |

By planned kind:

| code / planned kind | before | after |
|---|---|---|
| explanation_bad_diagram / sample-set | 3 | 3 |
| explanation_bad_numbers / box-plot | 3 | 3 |
| explanation_bad_numbers / flow | 3 | 3 |
| explanation_missing_visual / token-links | 3 | 2 |
| explanation_bad_diagram / token-links | 1 | 3 |
| explanation_bad_diagram / transformation | 2 | 2 |
| explanation_bad_diagram / box-plot | 1 | 3 |
| explanation_bad_numbers / transformation | 2 | 2 |
| explanation_bad_diagram / tree | 1 | 2 |
| explanation_bad_diagram / flow | 0 | 2 |
| explanation_bad_diagram / comparison | 0 | 1 |
