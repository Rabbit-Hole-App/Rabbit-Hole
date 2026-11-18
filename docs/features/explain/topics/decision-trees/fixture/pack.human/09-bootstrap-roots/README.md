# 09-bootstrap-roots: recorded run, not a pass fixture

This recorded run draws 6 rows from 8 (a bootstrap sample draws n = 8). It therefore fails the 154 bootstrap draw-count rule (`checkSamples` in `packages/web/src/tutor-diagrams/ml-statistical-spec.js`) BY DESIGN.

It is a byte-for-byte recorded run copied from `explain/demo-lesson04` at 33ccd9a25, not a pass fixture. Do not correct it.
