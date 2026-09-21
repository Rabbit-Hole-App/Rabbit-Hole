# Scoring — pass rate by pattern, not by case

A case pass rate tells you how well the runtime does on one source project. A
**pattern** pass rate tells you whether the runtime is becoming general. Only the
second one is the thing we are trying to build.

Report both, and lead with the pattern table:

```text
flow                4/4
matrix_operation    3/4
zoom_drilldown      2/3
routing             1/2
live_computation    1/1
```

A source project is a sampling of patterns, not a goal. Ten cases from one
article that all exercise `flow` prove one thing well and nine things not at all.
Patterns are declared per case in its `target.json`; see `patterns.json` for the
eleven and what each tests.

## What a visual case is scored on

- technical correctness
- conceptual completeness
- hierarchy
- readability
- spatial relationships
- information density
- teaching clarity

## What is never scored

Exact colours, shapes, arrows, wording or coordinates. Every case sets
`visualImitationTarget: false`, and resembling the reference is not the goal —
teaching the same mechanism with comparable clarity is. Copying the reference's
surface is scored as `REFERENCE_OVERFIT`, a failure rather than a success.

Also never scored: anything a case declares in `volatileReferenceFields`. See
`shared/stochastic-references.md`.

## Not every case is a visual case

A source may explain something in prose and never draw it. `illustrated
-transformer/cases/05-causal-masking` is the first such case: the article devotes
one paragraph to masking under "The Decoder Side" and provides no diagram.

Such a case is **text-medium**, marked `referenceMedium: text`, and is **excluded
from visual-parity scoring** until a genuine visual reference is added from
somewhere. Do not fabricate the missing figure to make the case scoreable — an
invented reference is a benchmark measuring our own imagination.

## When a failure stops the run

If a failure is caused by the **reusable system**, stop and fix the system before
running later cases. Carrying a known runtime defect through eight more cases
produces eight reports about the same bug and makes every one of them harder to
read.

If a case wants something the vocabulary cannot express, that is a **vocabulary
gap** — record it. Do not patch the scene around it. A scene-level workaround to a
vocabulary problem is how the language stops improving, and the gap is the single
most valuable thing a benchmark produces.
