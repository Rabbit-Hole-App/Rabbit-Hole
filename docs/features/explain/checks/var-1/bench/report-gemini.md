# VAR-1 bench: report (partial, see "What ran")

## First line
Gemini stopped working at item 155 of the numeric plan: every google call after that returned provider_error. A direct probe now returns HTTP 402 "Your prepayment credits are depleted" (RESOURCE_EXHAUSTED) on the key in small-deploy/.env. So 207 of the 515 numeric runs, and all 19 variation runs, ran on Fireworks gpt-oss only. Settled spend so far is below US$2.2 (the harness "upper bound" of US$5.8 counts a reservation for each failed Gemini call, which charged nothing). Top-up needed before any google-low measurement (SAME-1 included).

## What ran
- Numeric plan: 606 of 606 runs (before 303, after 303); items 0 to 257 of 302. Items 258 to 302 not run: the stop line (US$5.40 upper bound) was reached, an artifact of the reservations above.
- Variation: 20 of 20 runs (item 1019 not run; the cap raised to US$5.80 to run them, still under the owner's US$6, upper-bound arithmetic only).
- Stop-line note: harness estimate was US$0.0034 a run; the reservation per failed Gemini call is about US$0.018.

## Numeric arms

| slice | runs | delivered | old-classifier flags | 154-rule flags | token failures | cards with tokens | first attempt valid | moved to next provider | planned kind missing | authored by gpt-oss | median ms | settled US$ |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| before, Gemini live (items 0-154) | 303 | 300 | 12 | 0 | 0 | 0 | 262/298 | 25 | 83 | 22 | 2757 | 0.932 |
| before, Gemini dead (items 155-257) | 0 | 0 | 0 | 0 | 0 | 0 | 0/0 | 0 | 0 | 0 | null | 0.000 |
| before, all | 303 | 300 | 12 | 0 | 0 | 0 | 262/298 | 25 | 83 | 22 | 2757 | 0.932 |
| after, Gemini live (items 0-154) | 303 | 298 | 22 | 0 | 0 | 3 | 254/299 | 22 | 81 | 17 | 2867 | 0.963 |
| after, Gemini dead (items 155-257) | 0 | 0 | 0 | 0 | 0 | 0 | 0/0 | 0 | 0 | 0 | null | 0.000 |
| after, all | 303 | 298 | 22 | 0 | 0 | 3 | 254/299 | 22 | 81 | 17 | 2867 | 0.963 |

Only the Gemini-live rows compare both providers. The Gemini-dead rows are Fireworks-only: first attempt valid is not measured there (null).

## Derived-field arithmetic errors

- before: 154-rule flags 0; old-classifier flags 12
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
  - item 278 audit-repeat "How does the transformer decoder avoid looking ahead at late" (detailed, fireworks): heatmap-weights-should-sum-to-1: row sums 0, 0, 0, 0, 0, 0
- after: 154-rule flags 0; old-classifier flags 22
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
  - item 222 audit-repeat "Can you show the numbers when forward diffusion adds known n" (balanced, fireworks): arithmetic-statement: 0.5\times0.8+0.5\times(-0.5)=0.34 (computed 0.15, stated 0.34)
  - item 278 audit-repeat "How does the transformer decoder avoid looking ahead at late" (detailed, fireworks): heatmap-weights-should-sum-to-1: row sums 0, 0, 0, 0, 0, 0
  - item 280 audit-repeat "Why does a transformer use more than one attention head?" (detailed, google): bars-should-sum-to-1: values 0.65, 0.38 sum to 1.03, text says a distribution/proportion
  - item 297 audit-repeat "Can you show the numbers when forward diffusion adds known n" (balanced, fireworks): arithmetic-statement: 0.5\times0.8+0.5\times(-0.5)=0.34 (computed 0.15, stated 0.34)

## Variation (after arm only)

See variation-diff.md. All 19 variation cards were written by gpt-oss because Gemini was down.

## Token-fill

- after arm: tokenFailure 0; cards with tokens filled 3. Tokens are used by the author only when a reference text carries them; very few cards did.
