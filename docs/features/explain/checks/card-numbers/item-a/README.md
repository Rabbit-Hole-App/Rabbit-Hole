# Item A: restore the axis-domain rules for summary values and outliers

Before (3ecab0496): checkBoxes in ml-statistical-spec.js had dropped all three axis rules.
After: 'Summary is outside the shared axis domain' and 'Outlier is outside the shared axis domain' are back; only 'Fences are outside the shared axis domain' stays dropped (a computed fence can legitimately fall outside the author's axis, the renderer widens for it).

Tests (ml-statistical.test.mjs):
- reject test again has the two cases removed earlier: x.min = 2 and an outlier at 13, same expectation (parse fails).
- 'true fences passes with an outlier beyond them': outlier 25 now needs room, axis max 20 -> 25.
- widening test renamed to "a computed fence below x.min": same trial card (fences -3/21, outlier 25) on axis 0..25; asserts the axis widens to -3 on the left, outlier at the right edge (25), no clipping. The fence below x.min still passes.
Also restored the two lines in scripts/topic-pipeline/agents/inputs/renderer-constraints.md; README and layout comment reworded.
