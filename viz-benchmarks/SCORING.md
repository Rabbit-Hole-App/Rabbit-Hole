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

## Checker coverage debt

A gate that runs and resolves nothing has not verified anything, and must never be
reported as having passed.

**Known debt, 2026-09-21.** `dot-arithmetic` is inert on Illustrated Transformer
case 03. Its regex matches all three equations and resolves **zero** operands,
because `k` is now authored as a grid with `matrixKind: input` while the check
only resolves operands from `strip` objects carrying an `identity`. The very check
that caught the original false `.54` no longer verifies the case it fixed.

This is **debt, not a blocker.** The case is still protected: claiming
`provenance: derived` without a wired derivation throws, so the obvious attack —
a false literal marked derived — is caught by `provenance-required`. That was
tested, not assumed.

The rule it leaves behind: **report a check that resolved no operands as inert,
never as OK.** A green line in a gate report is a claim that something was
verified, and a check with nothing to chew on makes no such claim.

## Coherence at displayed precision — resolved

A caption reading "sums to 1" beside cells displaying `1.01` is a learner-visible
contradiction even when every underlying float is correct. A learner checking the
arithmetic by hand is exactly the learner a teaching tool is for.

**For probability rows, round display-aware.** Distribute the rounding residual
deterministically so the shown values sum to exactly `1.00`, rather than rounding
each cell independently and letting the error accumulate.

Weakening the caption to "approximately 1" was rejected: when the concept being
taught **is** normalisation, the sum being exactly one is the lesson, not a
detail.

This resolves what was an open question. Independent review found one instance in
three comparable rows, which was enough evidence that it reaches a reader.

## Pattern accounting must be honest about what a static case can show

A pattern declared by a case does not count as exercised if the case cannot
demonstrate it. `routing`, `zoom_drilldown` and `coordinated_views` were declared
on static cases that have no way to show branching, drill-down or linked views.

Such a declaration is recorded as:

```json
{ "declared": true, "assessable": false, "reason": "requires the dynamic or interactive phase" }
```

and **excluded from static coverage totals.** The capability does not need
building now; the accounting needs to stop claiming it was tested. A coverage
table that counts unexercised patterns reports progress that did not happen —
which is the same failure the external-versus-synthetic split exists to prevent.

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
