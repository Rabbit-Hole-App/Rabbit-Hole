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

## The evaluation stack

Five separate questions. Keeping them separate is what makes a result actionable
rather than just a number.

| layer | question |
|---|---|
| **pattern coverage** | what capability are we testing? |
| **failure taxonomy** | what went wrong? |
| **cause axis** | where does the fix belong? |
| **recurrence tally** | is it local or systemic? |
| **bespoke workaround?** | did we cheat around the vocabulary? |

The **cause axis** is `content`, `layout`, `primitive` or `template`. It is not
the same axis as the taxonomy and both are reported: a `LAYOUT` finding caused by
a missing `template` and one caused by careless authoring read identically in the
taxonomy and need completely different fixes.

The **recurrence tally** is what makes the stop rule usable. A failure appearing
once is a scene problem; the same failure across three cases is a system problem
wearing a disguise. Notice it at the interval, not in the final report.

The **bespoke-workaround question** is a plain yes or no per case, and it exists
because a superficially passing case can hide a vocabulary failure. A workaround
is a gap that got absorbed instead of recorded. Prefer the gap and a failing case.

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
