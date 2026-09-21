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

## Open question — coherence at displayed precision

**Not yet a rule. Deliberately unresolved pending evidence that it matters.**

Case 04's displayed cells can fail to hand-sum by 0.01 while the underlying values
are entirely consistent: each term is an independently rounded two-decimal view of
a correct three-decimal number, so `.16 + .00 + .34` reads as `.50` on screen
beside a result shown as `.49`.

This is a **different class** from the arithmetic defects that preceded it. Those
were data inconsistencies — a scene displaying a number its own inputs contradict.
This one has one numerical truth and a presentation artefact on top of it.

The candidate rule, if it turns out to matter:

> When a visualization presents an arithmetic relationship using rounded operands
> and a rounded result, the displayed values should remain arithmetically coherent
> **at the displayed precision**.

Possible answers include residual-aware rounding, or deriving one displayed term
or the result from the rounded presentation values rather than from the precise
ones.

**Do not widen scope to fix this before a critic has looked at the rendered
image and said whether it actually impedes comprehension.** A learner may never
notice; a learner checking the arithmetic by hand certainly will. That is an
empirical question about the picture, not a question to settle by reasoning about
it.

## Calibrating the critic without contaminating the cases

An independent critic must be blind — no prior scores, no prior findings, not even
confirmed ones. But a blind critic's clean report is ambiguous: the scenes may be
clean, or the critic may not have looked. Handing it a known defect as a
calibration check solves that and reintroduces anchoring.

The answer is a **separate calibration case**, at `viz-benchmarks/critic-calibration/`.
It is **excluded from pattern coverage, from Phase 1 acceptance, and from every
reported score.** It exists only to measure the critic.

One or two defects are planted in it — an arrow crossing a label, a deliberately
wrong numeric result, a duplicated output that should differ. It must look like an
ordinary case; a critic that can tell which one is the test is not being tested.

**The answer key is never written anywhere the critic can read.** During a critic
run it lives only in the controller's hands — the author reports what it planted
and the file is committed for the record only *after* the critic has reported. A
"do not read this file" note in the repository is not isolation; a thorough critic
greps.

The run becomes:

```text
clean real cases  +  one hidden calibration case  ->  fresh blind critic
```

Two signals come back, in opposite directions:

| observation | reading |
|---|---|
| planted defect **missed** | the critic is too weak to trust a clean report from |
| a **disproven** finding repeated | the critic is overclaiming |

The second is free once a finding has been disproven. The Illustrated Transformer
case 09 "decoder columns are never chained" finding was checked against the
committed scene and the chaining arrow is there — that finding is retained
precisely so a later critic repeating it exposes itself.

Both together bound the critic from either side, and the real cases stay blind.

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
