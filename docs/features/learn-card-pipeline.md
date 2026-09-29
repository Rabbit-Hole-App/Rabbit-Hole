# Learn card pipeline (locked by the owner, 2026-09-28)

How every NanoGPT Learn card is made from batch 5 on. Review the artifact, never the author's
argument for why it is good: no generator or fixer self-report ever reaches a reviewer, verifier
or visual reviewer.

```
PLAN            planner → adversarial critic → cross-card judge
BUILD           fresh Opus 5.5 author per card
REVIEW          fresh correctness reviewer · fresh pedagogy/composition reviewer (concurrent)
FIX             fresh fixer (gets findings + files)
VERIFY          fresh verifier (finding + current files + acceptance condition)
SEQUENCE        fresh cross-card reviewer (final files only)
DEPLOYED CHECKS interaction · sources · practice · persistence/readability
VISUAL          fresh reviewer on deployed full-card captures
FIGMA           owner review
```

All roles run Claude Opus 5.5 in fresh contexts; context separation matters more than model
diversity. A correctness or pedagogy issue that survives two independent reviewers goes to the
owner as that specific issue — no automatic extra review layer.

## Author

Receives exactly: the approved plan, the one-sentence objective, prerequisites, causal steps, the
intended interaction, the practice requirement, the pinned NanoGPT revision, and the renderer's
capabilities and constraints. May not change the shared renderer or engine to make one card
easier; a genuine gap is reported (it stops the batch for the owner).

## Correctness reviewer

Independently verifies: every NanoGPT source claim against the pinned revision (a citation must
actually support the teaching claim, not merely exist); tensor shapes; equations; numeric examples
— recomputed, never trusted from fixture output; calculated vs recorded vs source-value vs
What-if labels; edge-case claims; the practice answer.

## Pedagogy/composition reviewer

Asks: what exactly should the learner understand after this card; is there one primary mental
model; is the prerequisite knowledge actually available on the board; does the visual make the
causal relationship easier to understand; does the interaction reveal a meaningful
counterfactual or consequence; does practice require transfer rather than reading the visible
answer; single, staged or sequence; is anything technically correct but likely to mislead. It does
not recheck source-line minutiae (that is the correctness reviewer's job).

## Fixer and verifier

The fixer gets the findings and the files. The verifier gets, per finding, the finding, the
current files and an expected acceptance condition — never the fixer's explanation — and answers
only: fixed · not fixed · regression introduced.

## Sequence reviewer

Reviews the final batch as a learner journey: does card N rely on something N−1 never established;
are two cards teaching essentially the same thing; is a conceptual bridge missing; are sequence
names accurate rather than overclaiming; does the learner know why the next card follows.

## Visual reviewer

Only deployed full-UI captures (never scene-only renders): card header and sequence label, main
scene, Replay, INTERACT, Practice (opened and answered), Sources collapsed, sub-card navigation.
Checks first-glance hierarchy, where the learner looks, density and readability, whether the
active state is obvious, whether controls correspond clearly to the visual, whether Practice
overwhelms the card after the reveal, and whether anything looks like an error when it is a
What-if.

## Throughput and stops

Card authors run concurrently once plans are approved; a card's two reviewers run concurrently;
fixes go card by card; the sequence review waits for the final batch. Routine clean findings need
no owner approval. Stop only for: unresolved correctness, real pedagogical ambiguity, a proposed
renderer/shared-engine change, and the Figma visual gate.

JEV is not part of acceptance and is not imported here; if it later becomes shared infrastructure it
may raise warnings a reviewer investigates, never approve.
