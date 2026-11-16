# PLT-4 no line marker under a scatter point (ml-plot-layouts.js)

Rule: a line series draws no marker at a sample whose (x, y) is within 0.5 px of a point of a scatter series in the same plot; scatter markers are drawn after every line marker (on top).

Spec: "Model fit showing overfitting", reconstructed from the owner's description (the library's ml-fit-quality-comparison is three panels, not this one plot): Observed points (scatter: (0,1) (1,2.2) (2,4.8) (3,7.2) (4,9)), Reasonable fit (dashed coral line, 5 points), Overfit curve (dotted teal line, the nine samples (0,1) (0.5,4) (1,2.2) (1.5,1) (2,4.8) (2.5,9) (3,7.2) (3.5,5) (4,9)), x 0-4, y 0-10. render.mjs, job "overfit".

Files: overfit-before/after-408/720.png. Before = the tip without this commit (after PLT-2(A)+BAND-1, with PLT-5 smooth): the observed circles are hidden under the Overfit curve's diamonds (first and last sample, the only ones marked on a 9-sample series now) and the Reasonable fit's squares. After: the observed circles are drawn last and show at all five x; the Overfit curve's diamonds at x = 0 and 4 are gone. The Reasonable fit's squares are not coincident (their y differs from the observations by more than 0.5 px) and stay, under the circles. The curve through the nine samples is smooth (PLT-5).
