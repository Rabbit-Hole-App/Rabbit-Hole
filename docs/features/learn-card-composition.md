# Learn card composition: card, sequence, collection

Status: spec (owner direction, 2026-09-24). Nothing below is built yet except
where marked. It sets how Rabbit Hole decides what one card holds, when ideas
become several attached cards, and how the tutor walks a concept adaptively.

The model is **knowledge graph → adaptive path → sequences → cards → stages**.
The unit of learning is not "whatever fits in one card".

## The rule

**A card is one teachable idea with one primary mental model.** It may have
several staged steps, calculations, controls or states only when they all serve
that same idea. When the learner has to form a second, independent mental model,
that is another card.

**One-sentence test.** Every card completes: *"After this card, the learner
should understand ______."* If the blank needs two semantically independent
clauses, split.

- Good: "…how temperature changes a probability distribution."
- Suspicious: "…cross-entropy, validation loss, early stopping and optimizer
  behavior." (a sequence)

**Staging before splitting.** Causally dependent steps stay one card, revealed
progressively (score → scale → mask → softmax → weighted sum). Conceptually
separable ideas become attached cards (cross-entropy + train vs validation +
early stopping). Density alone is not a reason to split: a Deep dive that traces
one causal pipeline (idx → embeddings → attention → MLP → ln_f → logits, "trace
the tensors through GPT.forward") stays one card, because splitting it destroys
the end-to-end relationship it teaches.

## Three levels

1. **Card** — one atomic teaching unit: question → visualization → meaningful
   interaction → consequence/explanation → optional practice. Example: "How does
   temperature reshape next-token probabilities?" (logits → ÷T → softmax →
   sampling is one causal story).
2. **Sequence** — 2–5 cards when understanding needs several distinct ideas in
   order, experienced as one connected learning object, not five unrelated cards.
   It is the *current path* through a concept, never a fixed course. Example,
   self-attention: which tokens can this position see → how similarity scores
   are produced → how softmax turns scores into weights → how weights mix values
   → how NanoGPT does it across heads.
3. **Collection** — the knowledge space for a concept: related cards with no
   strict order (Attention: causal masking, query/key similarity, softmax,
   weighted values, multi-head, memory cost, Flash/SDPA). The tutor picks what
   comes next from what the learner asks or shows.

## Card-boundary rubric

A card should normally be split when **two or more** hold:

1. More than one independent learning objective.
2. The title needs an "and" because it teaches two separate mechanisms.
3. Two or more unrelated visualization regions compete for attention.
4. Multiple unrelated control groups.
5. Changing one interaction has no consequence in the other half of the card.
6. Multiple independent practice questions.
7. The learner must understand concept B before concept A on the same card makes sense.
8. It only fits by shrinking text or cells below the readability floor.
9. The default state needs significant vertical scrolling before the consequence of the interaction is visible.
10. The explanation keeps saying "now separately…" / "another thing happening here…".
11. Removing half the card would still leave a complete, useful lesson.

Keep one card when all the density describes one causal pipeline.

Mechanical today: 8 is enforced for numbers by the cell-floor gate
(`cellLegibilityIssues`, scene-layout.js) and for text by the legibility floors.
The rest are judgement; they become a review checklist and a generation pass.

## Adaptive structure, not a linked list

Do not model `card1.next = card2`. Model a concept with cards and typed
relationships:

```
concept: attention
cards: causal-mask, score-to-weight, weighted-values, multi-head, implementation
relationships: prerequisite | deepens | alternative_explanation | practice_for
```

The tutor builds a path per learner from it:

- learner A: causal-mask → score-to-weight → practice
- learner B: overview → implementation
- learner C: score-to-weight → prerequisite: softmax → return

That supports all four moves: split when too much, skip/compress when already
understood, branch to prerequisites when confused, attach deeper cards on "go
deeper". Depth stays the learner's explicit choice (see nanogpt-depth-ladder).

## UI

- Attached cards read as one object: a connector between them, or a compact
  stack with progress — `Attention · Guided  ✓ 1 What can the token see? ● 2 How
  are weights formed? ○ 3 How are values mixed?` — and "2 of 5" with previous/next
  on the current card. The product never becomes a fixed linear course.
- Evidence is not duplicated: a sequence can carry concept-level Sources &
  evidence once, while each card keeps only its directly relevant sources.

## Generation architecture

The content agent does **not** decide one card vs five from token length.

1. **Concept decomposition** first: `teaching_goal`, `prerequisite_concepts`,
   `causal_steps`, `interactions`, `checks`.
2. **card_boundary pass** decides: one card · one staged card · ordered sequence ·
   adaptive collection, applying the rule, the one-sentence test, staging-before-
   splitting and the rubric.
3. Only then do cards reach the scene author and the renderer. Overcrowding is
   solved before rendering, not after.

Hook points in today's code: the tutor's existing `plan_explanation` (see
learn-teaching-planner.md) gains the decomposition and the boundary decision;
the curriculum agent (curriculum-agent.md) owns collections as concept graphs.

## Phases (proposed)

1. **Authoring and review** (no product UI): every hand-authored card declares
   its one-sentence objective; the review rubric becomes a checklist the
   reviewer runs; mechanical rubric checks run as gates where they can (title
   "and", more than one practice activity, default-state height, cell/text
   floors). NanoGPT cards 11–26 are authored under this.
2. **Data model**: blocks carry `concept` and card identity; boards carry
   collections with typed relationships and optional ordered sequences.
3. **UI**: attached sequences on the canvas (connector or stack, "2 of 5",
   previous/next) and shared concept-level evidence.
4. **Generation**: decomposition + card_boundary in the planner before scenes
   are generated.
5. **Adaptive paths**: the tutor composes and re-plans the path through a
   collection from what the learner asks or demonstrates.

## Phase 1 — in place (2026-09-24)

Authoring and review only. No sequence UI, graph schema, planner change or
adaptive routing; no next-links between cards.

**Before a batch is built**, every proposed card is written down as a plan and
reviewed (the batch's plan goes in the board's plan doc): concept,
one-sentence objective, prerequisites, causal steps, primary interaction,
check/practice, boundary decision (`single` · `staged` · `sequence`) and the
reason. A card that belongs to a sequence records its sequence name, its
position of 2–5 and typed relationships (`prerequisite`, `deepens`,
`alternative_explanation`, `practice_for`) to the other cards; on the board the
sequence's cards sit next to each other in path order. A collection candidate is
noted in the plan doc, not built.

**The card module exports the same plan** (`plan`), validated by
`planProblems` in `packages/web/src/card-plan.js`. The reviewer runs the
11-point rubric by hand; `boundaryFlags` raises the signals a scene shows
reliably:

| Flag | Rubric |
|---|---|
| `title-and` | 2 — the card's own title joins two things with "and" |
| `objective-two-clauses` | one-sentence test — the objective reads as two clauses |
| `many-controls` | 4 — three or more visible controls |
| `tall-default` | 9 — the scene is taller than 900 units |
| `separately-language` | 10 — "separately" / "another thing" on the card |

A flag asks for review; it never splits a card. The plan acknowledges each
raised flag with the reviewer's reason in `plan.boundary.reviewed` (for
example "staged: one causal pipeline"), and `assertCardPlan` fails on an
unacknowledged or stale flag. Readability (rubric 8) is not a flag: the text
floors and the cell-number floor are hard gates. Density alone raises nothing.

**Scope.** The gate runs on cards authored after Phase 1 (nanogpt-deep-dive's
`NANOGPT_LATER_BATCHES`, checked by `src/nanogpt/board.test.mjs`). Cards
approved before it are not reopened; `scripts/card-boundary-report.mjs` reports
the flags on them for calibration only:

- Training · Guided raises `title-and` — the borderline case the rubric exists
  for, approved as a staged card.
- Transformer · Deep dive raises nothing — a dense single causal pipeline.
- Attention · Deep dive raises `title-and`, `many-controls`, `tall-default` —
  one forward pass with what-if branches; a reviewer would acknowledge all
  three.

## Existing cards against the rule

- Training · Guided is at the upper limit: staging made it one card, but it
  teaches −ln p, averaging and early stopping; under this rule it is a candidate
  for a two-card sequence.
- The Transformer · Deep dive (GPT.forward shape trace) is the model case of a
  dense card that must stay one card.
