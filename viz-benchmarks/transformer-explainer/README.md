# transformer-explainer

**The first benchmark project with real external reference material.** Captures
come from the live Transformer Explainer, which is MIT-licensed — see `SOURCE.md`
for attribution and licence.

Everything benchmark-specific lives in a case under `cases/`. This root holds
project-wide files only.

## Cases

| case | patterns | status |
|---|---|---|
| `01-embedding-and-positional` | flow, matrix operations | ready |
| `02-qkv-projection` | matrix operations, flow | ready |
| `03-masked-attention-matrix` | matrix operations | ready |
| `04-multi-head-stacking` | routing, flow | ready |
| `05-mlp-expansion` | flow, matrix operations | ready |
| `06-temperature-sampling` | parameter exploration, live computation | **blocked** — `input_axis` |
| `07-output-probabilities` | live computation, matrix operations | ready |
| `08-architecture-drilldown` | zoom and drill-down | **blocked** — `input_axis` |

Two cases are blocked because they need a learner input that changes the picture,
and the runtime has no input axis until Plan B. Their references are captured now;
running them would measure something that does not exist.

## Why this project first

It is MIT-licensed, so its reference material can live in a commercial repository
without a NonCommercial or ShareAlike problem. It also runs a real GPT-2, so the
references are states of a working system rather than a drawing of one.

It settled one open question outright: its attention matrix is drawn triangular,
with the masked upper half greyed, which makes it a genuine external reference for
causal masking — something the CC-licensed alternatives could not provide.

## Capture notes

Captured 2026-09-19 at 1600x1000, deviceScaleFactor 2, from the live deployment.

`07-output-probabilities/reference/probabilities-column.png` is cropped to the
upper part of the column: the tool shows a persistent onboarding panel over the
lower right, and the crop keeps every non-zero candidate, the bars, the selected
token and a long run of the zero tail. The sliver of that panel still visible at
the bottom edge is the tool's own chrome, not part of what is benchmarked.

The tool re-samples on load, so the highlighted token differs between captures.
That is the model working, not capture drift.
