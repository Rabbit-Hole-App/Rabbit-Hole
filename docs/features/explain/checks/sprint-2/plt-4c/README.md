# PLT-4 amendment: a line beside a scatter draws no markers unless markers: true

Rule: when a coordinate plot has a scatter series, a line series draws no markers (it is the fit through the points) unless it says markers: true. The series schema gains one optional boolean, markers (ml-plot-spec.js), the owner's amendment text. Before = the PLT-4 version (a line marker is skipped only where it sits within 0.5 px of a scatter point); After = this commit.

Files: overfit (the Model fit showing overfitting spec) at 408 and 720, before and after. hunk.diff.
