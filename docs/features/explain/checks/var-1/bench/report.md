# VAR-1 bench: report (partial, see "What ran")

## First line
Gemini stopped working at item 155 of the numeric plan: every google call after that returned provider_error. A direct probe now returns HTTP 402 "Your prepayment credits are depleted" (RESOURCE_EXHAUSTED) on the key in small-deploy/.env. So 207 of the 515 numeric runs, and all 19 variation runs, ran on Fireworks gpt-oss only. Settled spend so far is below US$2.2 (the harness "upper bound" of US$5.8 counts a reservation for each failed Gemini call, which charged nothing). Top-up needed before any google-low measurement (SAME-1 included).

## What ran
- Numeric plan: 515 of 606 runs (before 257, after 258); items 0 to 257 of 302. Items 258 to 302 not run: the stop line (US$5.40 upper bound) was reached, an artifact of the reservations above.
- Variation: 19 of 20 runs (item 1019 not run; the cap raised to US$5.80 to run them, still under the owner's US$6, upper-bound arithmetic only).
- Stop-line note: harness estimate was US$0.0034 a run; the reservation per failed Gemini call is about US$0.018.

## Numeric arms

| slice | runs | delivered | old-classifier flags | 154-rule flags | token failures | cards with tokens | first attempt valid | moved to next provider | planned kind missing | authored by gpt-oss | median ms | settled US$ |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| before, Gemini live (items 0-154) | 155 | 152 | 10 | 0 | 0 | 0 | 132/151 | 15 | 39 | 12 | 2746 | 0.482 |
| before, Gemini dead (items 155-257) | 102 | 100 | 4 | 0 | 0 | 0 | 0/1 | 102 | 30 | 100 | 3875 | 0.213 |
| before, all | 257 | 252 | 14 | 0 | 0 | 0 | 132/152 | 117 | 69 | 112 | 3175 | 0.695 |
| after, Gemini live (items 0-154) | 155 | 150 | 17 | 0 | 0 | 1 | 126/152 | 13 | 37 | 8 | 2876 | 0.496 |
| after, Gemini dead (items 155-257) | 103 | 103 | 2 | 0 | 0 | 0 | 0/0 | 103 | 30 | 103 | 3948 | 0.206 |
| after, all | 258 | 253 | 19 | 0 | 0 | 1 | 126/152 | 116 | 67 | 111 | 3300 | 0.703 |

Only the Gemini-live rows compare both providers. The Gemini-dead rows are Fireworks-only: first attempt valid is not measured there (null).

## Derived-field arithmetic errors

- before: 154-rule flags 0; old-classifier flags 14
  - item 56 audit "How does the transformer decoder avoid looking ahead at late" (detailed, fireworks): heatmap-weights-should-sum-to-1: row sums 0, 0, 0, 0, 0, 0
  - item 90 box "How do IQR fences flag outliers in a box plot? Use the data " (detailed, google): label-value-vs-prose: upper fence: diagram 20.5, prose "upper fence at $11.5"
  - item 99 box "Show a box plot of exam scores 52, 55, 61, 64, 67, 70, 72, 7" (detailed, google): label-value-vs-prose: upper fence: diagram 96, prose "upper fence at $75"
  - item 111 box "Compare the spread of two classes with box plots: class A sc" (brief, google): label-value-vs-prose: median: diagram 75, prose "median of 74"; label-value-vs-prose: median: diagram 74, prose "median of 75"; box-whisker-beyond-correct-fence: whiskerLow 40 beyond the correct fence
  - item 113 box "Compare the spread of two classes with box plots: class A sc" (balanced, google): label-value-vs-prose: median: diagram 75, prose "median is 74,"; label-value-vs-prose: median: diagram 74, prose "median is 75,"; box-whisker-beyond-correct-fence: whiskerLow 40 beyond the correct fen
  - item 114 box "Compare the spread of two classes with box plots: class A sc" (balanced, google): label-value-vs-prose: median: diagram 75, prose "median of 74"; label-value-vs-prose: median: diagram 74, prose "median of 75"; box-whisker-beyond-correct-fence: whiskerLow 40 beyond the correct fence
  - item 115 box "Compare the spread of two classes with box plots: class A sc" (balanced, google): label-value-vs-prose: median: diagram 75, prose "median of 74"; label-value-vs-prose: median: diagram 74, prose "median of 75"; box-whisker-beyond-correct-fence: whiskerLow 40 beyond the correct fence
  - item 116 box "Compare the spread of two classes with box plots: class A sc" (detailed, google): label-value-vs-prose: median: diagram 74, prose "median of $75"
  - item 117 box "Compare the spread of two classes with box plots: class A sc" (detailed, google): label-value-vs-prose: median: diagram 75, prose "median of $74"; label-value-vs-prose: median: diagram 74, prose "median of $75"
  - item 118 box "Compare the spread of two classes with box plots: class A sc" (detailed, google): label-value-vs-prose: median: diagram 75, prose "median of 74,"; label-value-vs-prose: median: diagram 74, prose "median of 75"
  - item 203 audit-repeat "How does the transformer decoder avoid looking ahead at late" (detailed, fireworks): heatmap-weights-should-sum-to-1: row sums 0, 0, 0, 0, 0, 0
  - item 205 audit-repeat "Why does a transformer use more than one attention head?" (detailed, fireworks): bars-should-sum-to-1: values 0.6, 0.55 sum to 1.15, text says a distribution/proportion
  - item 218 audit-repeat "how does a regression tree fit y = sin(x) with a step functi" (balanced, fireworks): plot-point-off-formula: $\sin(x)$: 1/9 points off \sin(x)
  - item 227 audit-repeat "How does rescaling a personality score help explain embeddin" (balanced, fireworks): label-value-vs-prose: Original midpoint: diagram 0, prose "original midpoint (50"
- after: 154-rule flags 0; old-classifier flags 19
  - item 56 audit "How does the transformer decoder avoid looking ahead at late" (detailed, fireworks): heatmap-weights-should-sum-to-1: row sums 0, 0, 0, 0, 0, 0
  - item 87 box "How do IQR fences flag outliers in a box plot? Use the data " (balanced, google): label-value-vs-prose: upper fence: diagram 20.5, prose "upper fence at $11.5"
  - item 88 box "How do IQR fences flag outliers in a box plot? Use the data " (balanced, google): label-value-vs-prose: upper fence: diagram 20.5, prose "upper fence is $11.5"
  - item 89 box "How do IQR fences flag outliers in a box plot? Use the data " (detailed, google): label-value-vs-prose: upper fence: diagram 18.5, prose "upper fence is $11"
  - item 98 box "Show a box plot of exam scores 52, 55, 61, 64, 67, 70, 72, 7" (detailed, google): label-value-vs-prose: IQR: diagram 13.25, prose "IQR is $75.7"; label-value-vs-prose: upper fence: diagram 95.625, prose "upper fence is $75.75"
  - item 99 box "Show a box plot of exam scores 52, 55, 61, 64, 67, 70, 72, 7" (detailed, google): label-value-vs-prose: upper fence: diagram 96, prose "upper fence of $75"
  - item 110 box "Compare the spread of two classes with box plots: class A sc" (brief, google): label-value-vs-prose: median: diagram 74, prose "median of 75"
  - item 111 box "Compare the spread of two classes with box plots: class A sc" (brief, google): label-value-vs-prose: median: diagram 74, prose "median of 75"; box-whisker-beyond-correct-fence: whiskerLow 40 beyond the correct fence 62 / 86; box-whisker-beyond-correct-fence: whiskerHigh 100 beyo
  - item 112 box "Compare the spread of two classes with box plots: class A sc" (brief, google): box-whisker-beyond-correct-fence: whiskerLow 40 beyond the correct fence 62 / 86; box-whisker-beyond-correct-fence: whiskerHigh 100 beyond the correct fence 62 / 86
  - item 113 box "Compare the spread of two classes with box plots: class A sc" (balanced, google): label-value-vs-prose: median: diagram 75, prose "median of 74,"; label-value-vs-prose: median: diagram 74, prose "median is 75,"; box-whisker-beyond-correct-fence: whiskerLow 40 beyond the correct fen
  - item 114 box "Compare the spread of two classes with box plots: class A sc" (balanced, google): label-value-vs-prose: median: diagram 75, prose "median of 74"; box-whisker-beyond-correct-fence: whiskerLow 40 beyond the correct fence 62 / 86; box-whisker-beyond-correct-fence: whiskerHigh 100 beyo
  - item 115 box "Compare the spread of two classes with box plots: class A sc" (balanced, google): label-value-vs-prose: median: diagram 75, prose "median around $74"; label-value-vs-prose: median: diagram 74, prose "median of $75"; box-whisker-beyond-correct-fence: whiskerLow 40 beyond the correct
  - item 116 box "Compare the spread of two classes with box plots: class A sc" (detailed, google): label-value-vs-prose: median: diagram 75, prose "median of $74"; label-value-vs-prose: median: diagram 74, prose "median of $75"
  - item 118 box "Compare the spread of two classes with box plots: class A sc" (detailed, google): label-value-vs-prose: median: diagram 75, prose "median of 74,"; label-value-vs-prose: median: diagram 74, prose "median of 75,"
  - item 132 box "What does the 1.5 x IQR rule do to a box plot of response ti" (balanced, google): label-value-vs-prose: IQR: diagram 14, prose "IQR is $10"
  - item 134 box "What does the 1.5 x IQR rule do to a box plot of response ti" (detailed, google): label-value-vs-prose: upper fence: diagram 125, prose "upper fence at $104"
  - item 135 box "What does the 1.5 x IQR rule do to a box plot of response ti" (detailed, google): label-value-vs-prose: lower fence: diagram 69, prose "lower fence at $9"; label-value-vs-prose: upper fence: diagram 125, prose "upper fence at $104"
  - item 203 audit-repeat "How does the transformer decoder avoid looking ahead at late" (detailed, fireworks): heatmap-weights-should-sum-to-1: row sums 0, 0, 0, 0, 0, 0
  - item 218 audit-repeat "how does a regression tree fit y = sin(x) with a step functi" (balanced, fireworks): plot-point-off-formula: $\sin(x)$: 1/9 points off \sin(x)

## Variation (after arm only)

See variation-diff.md. All 19 variation cards were written by gpt-oss because Gemini was down.

## Token-fill

- after arm: tokenFailure 0; cards with tokens filled 1. Tokens are used by the author only when a reference text carries them; very few cards did.

## Reading notes (what these numbers do and do not say)
- Derived-field arithmetic errors by the 154 rules: 0 in BEFORE and 0 in AFTER. BEFORE is already 0 because release 154 shipped the same recompute-and-reject rule, so this bench cannot show VAR-1 lowering that number; it shows AFTER does not regress it.
- The old-classifier flags are mostly the known label-value-vs-prose checker (BENCH-1: it reads "$75" style prose and compares it with another box's median or a fence), plus box-whisker flags on the two-class box cards. AFTER has 19, BEFORE 14; they cluster on box items 87-135 (Gemini-live) and are the same checker lines in both arms. Not separated into real and false positives here; no card in either arm carries a 154-rule arithmetic flag.
- Tokens: 1 card in AFTER used a token and it filled; 0 token failures. Most cards carry none because only references written with tokens produce them.
- Variation diff caveat: the two cards of a pair differ in titles, captions and labels as well as numbers because gpt-oss rewrites the reference each time. The "numeric-looking" column is therefore the model's own freedom plus the sampled inputs; this bench does not separate the two. It shows only that the inputs differ between requests and the kind and reference are the same in 9 of 9 pairs. The check that the sampled values themselves reach the card (offline, from requestSeed) is in checks/var-1/step-3.
- feature-selection-stability pair: the model wrote a grouped chart once and a plain bar-chart the other time; one card carries the old-classifier flag bars-should-sum-to-1 (values 0.92, 0.55, 0.18, text says a distribution).
- Not run: numeric items 258 to 302 (45 items, 90 runs), variation item 1019. Gemini was down for all of items 155 onward, so a rerun needs a top-up first.
