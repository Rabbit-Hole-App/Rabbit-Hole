# 07 — output probabilities

Show the final distribution over candidate next tokens, with magnitude readable before any number is read.

Patterns: live_computation, matrix_operation

Reference captured from the live Transformer Explainer (MIT). Benchmark target is
semantic and pedagogical parity - never visual imitation.

## Capture note

The reference is cropped to the upper column. The tool shows a persistent
onboarding panel over the lower right; the crop keeps every non-zero candidate,
the bars, the selected token and a long run of the zero tail, which is all the
pattern needs.
