# BAR-1 correction + BAR-1n (sprint 2)

Commit on feat/visual-sprint-2-flow (ml-plot-layouts.js, inside verticalBars only; hunk.diff), on 9d1bf9aa3 (before = 9d1bf9aa3).

(a) Per-category fills take TEACHING_SERIES order (blue, coral, teal, olive, lavender, mustard, rose, slate), the same order grouped bars and the legend use. The BAR_FILLS list of the earlier spec text is removed.
(b) BAR-1n: the value axis ends at the round tick above the largest value, which is not itself a tick: the maximum is rounded up to the next 1, 2, 2.5, 5 or 10 times a power of ten that leaves at most five steps (the plot kind's own step rule), and the ticks come from plotTicks over that range; a negative minimum is rounded down the same way. Binomial: the maximum 24.6 gives an axis 0 to 25 (ticks 0, 10, 20, 25; before 0, 10, 20, 24.6).

| figure | 408 before | 408 after | 720 before | 720 after |
|---|---|---|---|---|
| binomial n=10 p=0.5 k=0..5 (%) | 408 x 332 | 408 x 332 | 720 x 332 | 720 x 332 |
| grouped 2 series x 4 categories | 408 x 366 | 408 x 366 | 720 x 366 | 720 x 366 |
| 12 categories | 408 x 293 | 408 x 293 | 720 x 293 | 720 x 293 |
| softmax stacked bar | markup identical | | markup identical | |
Files: <name>-<408|720>-<before|after>.png/.html, sizes-before.txt, sizes-after.txt. No tests (this round).
