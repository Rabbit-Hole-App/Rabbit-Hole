# Project notes — The Illustrated Transformer

Findings that hold across every case in this project. A finding that applies to
one case belongs in that case's `reference-notes.md`, not here.

## Source

Jay Alammar, The Illustrated Transformer — https://jalammar.github.io/illustrated-transformer/

## What this project is for

The article teaches a sequence of distinct capabilities, and each one is its own
benchmark case. The unit of evaluation is **project → case → mode → iteration**,
so `illustrated-transformer → 05-causal-masking → dynamic → v003` names one run.
Static, dynamic and interactive are modes of a single conceptual case, never
separate cases: the same idea taught in one frame and taught over time is the
same idea, and splitting it hides whether the language can do both.

## Standing constraint

The evaluation target is semantic and pedagogical parity. `visualImitationTarget`
is false in every case. A generated scene may look nothing like the reference and
still pass, provided it teaches the same mechanism with comparable clarity; a
scene that copies the reference's palette, typography, node shapes, arrow style,
coordinates or wording fails on originality even if it looks better.

## Cross-case observations

Nothing recorded yet. This section fills as cases are run.
