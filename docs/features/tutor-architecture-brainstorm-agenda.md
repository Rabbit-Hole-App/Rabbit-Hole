# Tutor architecture brainstorm — agenda and open decisions (DRAFT)

Status: draft for the Tutor architecture session. Not committed, not a spec, not an implementation
plan. It changes nothing in docs/features/adaptive-tutor-v1.md.

- **adaptive-tutor-v1.md** is the current architecture and spec: the baseline. For this agenda that
  means the reviewed version at `origin/docs/tutor-cards-runtime` 71dc85bf, which adds "Current
  frozen Learn/Card system available to Tutor" and `not_yet_observed`. It is not yet cherry-picked
  into `feature/final-integration` (af572dcc at the time of writing).
- **This file** lists only what we still have to decide together: open questions, candidate options,
  tradeoffs, and acceptance questions. Spec references (T1, J5, …) point into adaptive-tutor-v1.md.

How to read each item: **ID** · the question · *Spec already says* (when the baseline answers part
of it, so we confirm instead of re-deciding) · options and tradeoffs where there is a real choice.
Items marked **[before coding]** block the first Tutor commit; items marked **[deferred integration]**
depend on paused or unmerged work and do not block Tutor coding; the rest can be settled later.

Locked, not reopened here: one Tutor speaks to the learner; the orchestrator (Plato-like planning)
plus Socrates and Feynman specialists plus a global Confucian policy (minimum intervention);
specialists propose and the orchestrator executes; evidence is per concept and claim; no mastery
score; no permanent learner or learning-style labels; the raw learner message is always kept;
bounded context; explicit learner requests outrank inferred preference; the evaluation ladder is
deterministic → JEV → larger evaluator; JEV produces evidence, not policy; card practice stays
deterministic; paid tools need confirmation; no hidden chain-of-thought is stored; the evidence
states are `understood · uncertain · misconception · prerequisite_gap · not_yet_observed`.

---

## 0. Spec inconsistencies to settle first

Found while preparing this agenda. The architecture decisions are **X1, X2, X3 and X6**. X4, X5, X7
and X8 are **editorial / cleanup**: fix them when the files are next edited, not in the session. X9
is a **deferred integration** question.

| ID | Where | Inconsistency | Suggested resolution to confirm |
|---|---|---|---|
| X1 | T9, T12, Runtime loop ("explicit /deeper with a known target → move deeper") vs the Cards-runtime section | The spec treats `/deeper` and `/simplify` as depth moves; today they are slash prompts that generate new content and never navigate the authored ladder. | Decide in §7 (D5) whether they navigate authored cards when a transition exists. Until then, the Runtime-loop bypass is future behaviour. |
| X2 | T1 `result: pass \| fail \| partial \| misconception \| non_attempt` vs card `attemptLog` `result: passed \| failed` | There is no defined mapping from a card attempt to a T1 record, and no rule for whether card practice counts as `demonstrated_in_transfer`. | Settle in §2 (E6). |
| X3 | Resolver `LearnerTurn.intent { … navigate, derive, implement … }` vs the T2 move taxonomy | Intents and moves are two vocabularies with no mapping. `navigate` has no matching move, and there is no navigation runtime. | Settle in §1 (R9). |
| X4 | Resolver example `current_card: attention-mask-step` | Not a real id. Real ids are `scene.id`, for example `c11-causal-mask` or `depth-attention-guided`. | **Editorial / cleanup.** Fix the example when the spec is next edited. |
| X5 | Ownership table and T0 | Written against the pre-integration worktrees (smart-home, smart-parallel, "merged Learn/cards branch"). After the baseline, the Tutor branches from `main` / `rabbit-hole-pre-tutor-baseline`, and some T0 items are already satisfied by final integration. | **Editorial / cleanup.** Re-state T0 as a checklist against the baseline when the spec is next edited. |
| X6 | T8 prerequisite branching ("temporary softmax branch → return") vs future `/dive` child canvases | It is not decided whether a T8 branch is the same thing as a `/dive` child canvas or a lighter in-place detour. | Settle in §8 (N1). |
| X7 | learn-artifact-generation.md §3 says the Resolver contract lives "on feat/canvas-block-conversations until merge" | Stale pointer: the contract is now on `feature/final-integration`. | **Editorial / cleanup.** |
| X8 | docs/rabbit-hole-final-integration-next-steps.md:482 uses the retired spelling of the empty evidence state | Pre-dates the canonical `not_yet_observed`. | **Editorial / cleanup.** Already assigned to the integration owner. |
| X9 | Credits: usage-credits.md (unmerged `feature/usage-credits`) | Usage/Credits currently proposes a separate free-practice evaluation rate limit, but Usage/Credits is paused and not part of the pre-Tutor baseline. | **Deferred integration.** Tutor v1 does not depend on that mechanism. When Usage/Credits resumes, its practice-evaluation limit is reconciled with Tutor behaviour (§11, P6). |

The owner's `/dive` principles (child canvases are separate resources; a tree first, not a general
DAG; no arbitrary recursive canvas JSON) are not written in any spec yet. §8 lists them as locked
for this session so they get recorded.

---

## 1. Learner Intent Resolver — decisions still needed

Locked: the raw message stays intact next to `structured_interpretation`; bounded context; no
permanent labels; explicit request outranks inference; evidence per concept and claim;
`not_yet_observed`.

- **R1 [before coding]** — Which `LearnerTurn` fields are required in v1? The spec's provisional
  contract has 11 fields. Options: **A** all 11, fields empty when unknown. **B** a v1 core of
  `raw_user_message`, `target`, `current_depth`, `intent`, `evidence_context`, `constraints`, with
  the rest added when a consumer needs them. **C** the core plus `prerequisite_context`. Tradeoff:
  every field is a contract other agents (Motion Director, practice planner) will depend on; B is
  cheaper to change but may starve prerequisite recovery.
- **R2 [before coding]** — Which fields are **deterministic** from runtime state? Candidates:
  `target` (selection, chip, card `scene.id`, sub-card part id), `current_depth` (from the card's
  depth), `recent_teaching_moves` (from T18 planner outputs), `source_context` (the card's
  `sources`), and the parts of `evidence_context` that come from `attemptLog`.
- **R3 [before coding]** — Which fields need **model inference**? Candidates: `intent`,
  `requested_modality`, `current_hypothesis.likely_gap`, and `constraints` taken from free text
  ("don't give me another analogy").
- **R4 [before coding]** — Which fields must **never** be inferred? Candidates: `evidence_context`
  (only recorded evidence, never guessed), the learner's identity and workspace, anything
  resembling ability or learning style, and source facts.
- **R5** — How much recent chat? Options: last N turns (N = 3/5/8); turns since the current target
  was selected; a token budget. Tradeoff: recall of "I still don't get it" versus cost and bounded
  context.
- **R6** — How much card/canvas context? Options: the current card's `describeAnimation` /
  `describeActivity` output only; plus the cards it declares as prerequisites; plus a canvas outline
  (titles only). The whole canvas is excluded (locked).
- **R7** — How are prerequisites selected? Options: the card's `plan.prerequisites` plus declared
  `prerequisite` relationships/transitions only (deterministic); plus prerequisites the model
  proposes, marked inferred; plus evidence-driven candidates (concepts with `prerequisite_gap`
  evidence). Tradeoff: determinism and auditability versus coverage of canvases without authored
  relationships.
- **R8** — How is uncertainty in the inferred intent represented? Options: a single confidence
  per field; ranked alternatives (`intent: [{explain: .6}, {practice: .3}]`); an explicit
  `ambiguous` flag that makes the orchestrator ask one clarifying question. Tie-in to discuss: does the
  Confucian policy prefer one cheap clarifying question over risking a wrong artifact?
- **R9 [before coding]** — Intent → move mapping (X3). Is `intent` only an input the orchestrator
  weighs, or does an explicit intent map deterministically to a small set of allowed moves?
- **R10** — When does explicit wording override inferred pedagogical state? The principle is locked;
  the edges are not. Examples to decide: "just tell me" while Socrates has a diagnostic question
  pending; "skip this" on a `prerequisite_gap`; "quiz me" on a concept with `misconception`
  evidence.
- **R11** — Resolver cost path: is it a model call on every learner message, deterministic-first
  with a model only for free text, or merged into the orchestrator's call for v1?

## 2. Learner evidence and state

Locked: the five states; no mastery score; no permanent labels; transfer outranks repetition;
epistemic honesty.

*Spec already says (T1, confirm rather than re-decide):* evidence is a record list and the state is
derived from all of it (so history is stored, not only the current state); records carry
`confidence` from the evaluator; a claim is `understood` only with a settled
`demonstrated_in_transfer` pass and no later settled fail; newer settled evidence outweighs older;
evaluator `uncertain`/`error` results are stored but never settle a state on their own.

- **E1 [before coding]** — Which events create a record? Candidate list: card practice attempt;
  challenge; explain-back; quiz; code exercise result; notebook experiment result; the learner's
  own question (as a signal, not a result); repeated "simplify" requests; successful deeper
  question. Decide which of these are v1.
- **E2** — Persistence and decay. Options: no decay (records are permanent, state recomputed);
  time-based decay that moves `understood` to `uncertain` after a period; decay only when the
  content revision changes (see §13). Tradeoff: decay models forgetting, but invents evidence we
  don't have.
- **E3** — One failed attempt: `uncertain` or `misconception`? Options: a single fail is
  `uncertain` unless the answer matches a *named* misconception (J6); or `misconception` only after
  repeated fails on the same claim with a consistent wrong model; or a threshold per evaluator.
- **E4** — What is enough for `understood`? The spec requires transfer. Decide whether one transfer
  pass is enough, or one transfer pass plus one explain-back or articulation.
- **E5** — Contradictory evidence: the spec says derive `uncertain`. Decide whether the Tutor must
  resolve the contradiction (ask a targeted question) or may leave it until the concept comes up
  again.
- **E6 [before coding]** — Card practice to T1 (X2). Card practice asks about a case the card does
  not draw ("commit before you see"). Options: **A** every card pass is `demonstrated_in_transfer`;
  **B** a pass is `demonstrated_here` unless the practice is tagged as transfer; **C** tag each
  card's practice once (transfer or recognition) in its card data. Tradeoff: A is simplest but
  over-credits; C is precise but touches frozen card data (a later Cards change, not now). Also:
  which claim does a card attempt evidence? The nearest key today is `plan.concept`.
- **E7 [before coding]** — JEV to T1: how do per-idea checks (idea_0…, misconception, non_attempt)
  become claim-level records? One record per check, or one per response with check detail inside?
- **E8** — The `partial` result: when does the ladder produce it, and how does it aggregate?

## 3. Tutor Orchestrator / Plato-like planning

Locked: one Tutor speaks; no agent swarm; specialists are roles under orchestration; minimum
intervention; the planner runs only on real pedagogical choices (J11); structured, inspectable
planner output (T18).

- **O1 [before coding]** — What exactly does the orchestrator decide on a turn? Candidate decision
  set: stay on the concept · remediate a prerequisite · ask a question · explain · practice · use
  or reuse an artifact · change depth · (later) propose `/dive` · end or summarize. Is this the T2
  move taxonomy, or a coarser layer above it?
- **O2 [before coding]** — Inputs: the `LearnerTurn`, derived evidence states for the target and
  its prerequisites, the last K teaching moves, and available tools with their economics (T3). What
  else, if anything?
- **O3 [before coding]** — What is deterministic before any model reasoning? Candidates: routine
  transitions (J11); explicit slash commands; practice grading; prerequisite lookup from declared
  relationships; paid-tool gating; "learner said stop / skip / just tell me".
- **O4** — Planning horizon for v1. Options: **A** one move at a time; **B** a short plan (≤3
  moves) re-validated each turn; **C** a lesson path. Tradeoff: A is easiest to test with golden
  traces and least prone to over-planning; B gives coherence for branch-and-return (T8).
- **O5** — When is a plan reconsidered? For example on any new evidence, on an explicit request, on
  a failed move, or on the learner leaving the target.
- **O6** — How is minimum intervention enforced? Options: a policy check the orchestrator must pass
  ("would a question or hint on an existing artifact produce the evidence?") before any
  generation; a cost ordering over moves; golden-trace forbidden moves only.

## 4. Socrates and Feynman specialist boundaries

Intended split (not final policy): Socrates diagnoses, questions, challenges and exposes a
misconception; Feynman gives a concrete explanation, asks for explain-back, sets transfer, and uses
code or an experiment.

- **S1** — When does the orchestrator choose Socrates? Candidate triggers: misconception evidence;
  a confident wrong statement; `uncertain` with a cheap diagnostic available.
- **S2** — When Feynman? Candidate triggers: `prerequisite_gap` resolved and a concept to build;
  explicit "explain"; a correct but shallow answer that needs articulation or transfer.
- **S3** — Both in one turn: allowed occasionally (spec). Decide the rule, e.g. only
  misconception-plus-counterexample.
- **S4** — When does Socrates stop questioning and explain? Options: after N unproductive questions;
  when the learner shows frustration; when the missing piece is a fact, not a model.
- **S5** — When does Feynman ask for explain-back? At concept boundaries (T6) only, or after every
  explanation?
- **S6** — What counts as minimum intervention for each (one question versus one example)?
- **S7** — "Just tell me": does it switch to Feynman for that turn, suspend Socrates for the
  concept, or only for the session? Where is that preference stored (session scope, T17)?
- **S8** — Specialist gate (spec): a specialist must beat inline handling on the golden traces.
  Decide the metric and the pass threshold.

## 5. Minimum-intervention policy (Confucian)

Keep this a policy with open parameters for now, not a rigid ladder.

- **M1** — Failed attempts before a stronger hint: 1, 2, or evidence-dependent (a misconception gets
  a counterexample at once)?
- **M2** — When does the Tutor reveal the answer? After N attempts, on explicit request, or never on
  card practice (the card's own feedback already reveals after Check)?
- **M3** — When is prediction first (T4)? Only when prerequisites are satisfied (spec). Decide how
  that is checked.
- **M4** — When should the learner struggle longer? For example while a correct direction is
  visible in their attempts.
- **M5** — How do explicit requests constrain the policy ("don't quiz me", "give me the answer")?
  Per turn, per concept, or per session?
- **M6** — Accessibility: how do stated accessibility needs change intervention (fewer multi-step
  questions, text alternatives to motion, no time pressure)? Is it a stored, learner-set
  preference (never inferred)?

## 6. Evaluation ladder

Locked: deterministic → JEV → larger evaluator; JEV is evidence not policy; card practice is
deterministic; one batched JEV request per meaningful free-form response (J12); the
`evaluateLearnerResponse` status contract (settled / uncertain / error, J5).

- **V1 [before coding]** — Which response types are always deterministic? Candidates: card
  practice; multiple choice; numeric with tolerance; code tests; selection-based answers (J8).
- **V2 [before coding]** — Which free-form answers go to JEV? Challenge, explain-back, short
  predictions, "why" follow-ups.
- **V3** — What triggers the larger evaluator? J5 says `uncertain`. Decide what else counts:
  contradictory checks, answers over a length limit, or code plus prose.
- **V4 [before coding]** — What does JEV return? Options: **A** per-check booleans or probabilities
  only, with the Tutor mapping them to T1; **B** JEV also proposes an evidence state. Tradeoff: B
  moves pedagogy into the evaluator, against "JEV is not the path-selection brain" (J10, J15).
- **V5** — Timeouts and fallback: the spec gives a p95 ≤ 400 ms SLO. Decide the hard timeout, and
  what the learner sees while waiting (J14: never show a contradictory next card).
- **V6** — Who owns the expected ideas and misconception list per concept: authored with the card,
  generated and reviewed, or generated at runtime?

## 7. Overview / Guided / Deep dive navigation

Locked: the depth names describe content, never learner ability. The NC8 transitions exist as data
(`simplifies_to`, `deepens_to`, `prerequisite`, `related`) with a sub-card fallback to the whole
card, and only declared `transferable_inputs` travel. No navigation is implemented today.

- **D1** — When does the Tutor move Overview → Guided? For example after a correct prediction, or on
  request only.
- **D2** — When does it suggest Deep dive? For example on a transfer pass, or when the learner asks
  "where is this in NanoGPT?" (T19 scenario).
- **D3** — When does it simplify back up? For example on `prerequisite_gap`, or after repeated
  confusion.
- **D4 [before coding]** — Navigate automatically, or suggest only? Options: suggest only (the
  learner clicks); navigate on explicit request, suggest otherwise; navigate automatically with an
  undo. Tradeoff: learner control (T12) versus friction.
- **D5 [before coding]** — `/deeper` and `/simplify` (X1): use the authored transition when one
  exists and generate only when none does, or keep them generative and add a separate navigation
  action? (See T-8 for authored versus generated content.)
- **D6** — A missing `target_part`: the fallback (open the whole card) is locked. Decide whether the
  Tutor tells the learner the part is gone.
- **D7** — Which `transferable_inputs` move automatically, and does the Tutor ever set card inputs
  itself (for example to show the learner's own wrong case)?

## 8. Nested Rabbit Holes / `/dive`

Sequencing is decided and not reopened: Tutor architecture session → build the `/dive` structural
primitive → Tutor v1 implementation. Tutor v1 must be architected to understand `/dive`; the initial
Tutor implementation does not necessarily invoke it automatically (see §15). Locked, to record: child canvases are separate resources; a tree first, not a general
DAG; no arbitrary recursive canvas JSON. No implementation here.

- **N1 [before coding]** — Is a T8 prerequisite branch a `/dive` child canvas, or a lighter in-place
  detour (X6)? Options: always a child; a detour by default, promoted to a child when it grows;
  a child only on explicit `/dive`.
- **N2** — When does the Tutor *suggest* a child canvas, and when only on an explicit `/dive`?
- **N3** — What deserves a child canvas versus a one-line clarification (size, reuse, the learner
  wanting to keep it)?
- **N4** — Return to the parent: what context is restored (the parent target, the pending question,
  the practice state)?
- **N5** — Evidence across parent and child: evidence is per concept, so it is shared by concept,
  not by canvas. Confirm, and decide how canvas deletion interacts with T17 lifecycle rules.
- **N6** — Does a child inherit the parent's sources? All, the pinned revision only, or on demand?
- **N7** — How do breadcrumbs or the surface path enter Tutor context (a `LearnerTurn.target` path)?
- **N8 [before coding]** — The canonical semantic target of a dive: selected card, sub-card,
  equation, source region, graph object, or concept. One primary type with the others as
  attributes, or a union?

## 9. Tutor tool selection

Locked: reuse before generate; no unnecessary generation; latency-aware; paid tools need explicit
confirmation (T3, T5a, T15). Tools available or planned: card, practice, graph, diagram, notebook,
code sample/exercise, whiteboard, paper/source; later motion, visual summary and `/dive`.

- **T-1** — What minimum evidence justifies a tool rather than text (for example: text failed once;
  the concept is spatial or dynamic; a transfer check needs an unseen case)?
- **T-2** — When is a text-only answer right (a factual question, `understood` evidence, explicit
  request)?
- **T-3** — Reuse detection: how does the Tutor know an existing artifact already teaches this
  (card `plan.concept`, relationships, or the canvas outline)?
- **T-4** — Latency and cost ordering: a fixed order, or a score from T3's economics fields?
- **T-5** — Interactive graph versus motion, and notebook versus explanation: decision rules, or
  golden-trace examples only?
- **T-6** — Which generations need confirmation beyond paid media (for example anything slower than
  N seconds, or anything that adds more than one block to the canvas)?
- **T-7** — The T3 registry fields (costClass, latencyClass, evidenceYield, …): who fills them for
  the existing primitives, and where do they live?
- **T-8** — Authored versus generated content: when an authored Rabbit Hole card already exists for
  a concept, when may the Tutor generate a new explanation instead of reusing it? Candidate principle
  for discussion, not locked: authored and reviewed content first → adapt or reuse it → generate new
  content only when the existing material does not meet the learner's need. The frozen card set is
  large; the point is to keep the Tutor from regenerating weaker duplicates of it. (Also shapes D5.)

## 10. Tutor → Motion Director relationship

Locked (learn-artifact-generation.md §4): the Tutor decides WHETHER motion is the right move; the
Resolver supplies bounded context; the Motion Director designs the MotionBrief and storyboard; the
Motion Author executes. The storyboard comes before any expensive render. No implementation here.

- **MD1** — What Tutor intent justifies `/motion`? For example `intuition_first` after text and
  static visuals failed, or an explicit "show me visually".
- **MD2** — May the Tutor trigger planning (MotionBrief plus storyboard) without rendering, as a
  cheap step?
- **MD3** — Must the learner approve the storyboard before a paid render (the spec requires
  confirmation for paid generation; decide whether the storyboard is that confirmation point)?
- **MD4** — Which learner evidence reaches the Motion Director: the target concept's states only,
  or prerequisites too, and never the raw history?

## 11. Practice policy

Preserved: practice and evaluation are free to the learner. Usage/Credits currently proposes a
separate free-practice evaluation rate limit, but Usage/Credits is paused, and Tutor v1 does not
depend on that mechanism. No Usage/Credits work here.

- **P1** — When does the Tutor ask for a prediction (T4)?
- **P2** — When does it launch deterministic card practice versus its own challenge?
- **P3** — When does it ask for explain-back (T6)?
- **P4** — When does it request transfer to a new example (T10)?
- **P5** — Retries before intervention (links to M1).
- **P6 [deferred integration]** — When Usage/Credits resumes, reconcile its practice-evaluation limit
  with Tutor behaviour (X9): fall back to deterministic-only checks, tell the learner, or stop
  evaluating free-form answers? Not a Tutor v1 dependency.
- **P7** — Should the Tutor distinguish retrieval failure, misconception, prerequisite gap and
  accidental mistake? If yes, which evidence separates an accidental mistake from uncertainty (for
  example a pass on the same claim right before)?

## 12. Context architecture

Locked: bounded context; the raw question kept separate from card and source context; no giant
conversation dump.

- **C1 [before coding]** — What does every turn always receive? A candidate minimum: the
  `LearnerTurn`, the target card's serializer output, the target's evidence states, and the last K
  moves.
- **C2** — What is fetched on demand (tools): sources, prerequisites' cards, the canvas outline,
  notebook state, Map/project context (T14)?
- **C3** — The current-card context: the serializer output only, or plus `plan` (objective,
  prerequisites) and `evidence.concept`?
- **C4** — The learner-evidence subset: the target, its declared prerequisites, and anything with
  `misconception` evidence in the session?
- **C5** — The number of prerequisites included (direct only, or two hops)?
- **C6** — Source snippets: bounded by the card's pinned ranges, with a per-turn character budget?
- **C7** — The total budget per turn (tokens), and what is dropped first when it is exceeded.

## 13. Tutor persistence

Locked: no hidden chain-of-thought is stored; only structured learner and product state; memory
scopes and lifecycle per T17.

- **PS1 [before coding]** — What is persisted in v1? Candidates: evidence events · current target
  or concept · recent teaching moves (T18 outputs) · open misconceptions · unresolved prerequisite
  with its return point · explicit session preferences ("don't quiz me").
- **PS2** — What is never stored: model reasoning, raw inferred hypotheses once superseded, and
  ability or style labels. Anything else?
- **PS3** — Reload: resume the pending move, or re-plan from evidence?
- **PS4** — Stale evidence: when a card's content or pinned source revision changes, is the
  evidence on its claims kept, kept but marked stale, or dropped? (`evidence.sourceRevision` exists
  on cards.)
- **PS5** — Where does it live: per-canvas blocks (like `attemptLog` today), a learner-scoped store,
  or both?

## 14. Golden trace scenarios to review together

Discussion scenarios, not final expected policy. For each we agree the acceptable moves, the
forbidden moves and the evidence afterwards (T19 format).

1. The learner understands the Overview; move to Guided.
2. The learner fails causal-mask practice (`c11-causal-mask`) twice; diagnose prerequisite versus
   misconception.
3. "Just show me the math"; the explicit request is respected.
4. The learner asks for the implementation; Deep dive or source.
5. The learner cannot understand softmax; an intuition-first explanation, or a motion candidate.
6. The learner has a prerequisite gap; a future `/dive` suggestion.
7. The learner gives a strong transfer explanation; the evidence is upgraded.
8. The learner gives an ambiguous free-form answer; JEV, then the larger evaluator only if needed.
9. The learner repeatedly succeeds; do not over-teach.
10. "Don't quiz me"; the preference is respected.
11. The learner is on Overview and says "Don't simplify this. Show me the implementation." Question:
    explicit intent overrides any inferred depth preference, and the Tutor moves toward Deep dive or
    source without classifying the learner. Tests explicit intent, depth navigation, no learner
    labels, and source/tool selection.

Candidate additions: 12. a stale-source case (PS4); 13. a contradiction between a card pass and a
failed explain-back (E5). Deferred until Usage/Credits resumes: the practice-evaluation limit is
reached (P6).

## 15. What is the smallest Tutor v1?

Options with tradeoffs only; no combination is picked. They are not four competing versions:
**V1-A** is the base functional cut, and **B, C and D** are independent modifiers of it (a
capability, a specialist implementation strategy, a persistence strategy). An eventual v1 could be,
for example, V1-A + V1-B + V1-C + session-only persistence; the combination is decided in the
session.

| Option | Kind | Contents | For | Against |
|---|---|---|---|---|
| **V1-A** | Base functional cut | Resolver + simple orchestrator (one move at a time) + Socrates/Feynman + deterministic/JEV evaluation + existing card, practice and artifact tools. No `/dive` automation, no visual summary, no motion. | Smallest surface; every behaviour is golden-traceable; reuses frozen cards as they are. | `/deeper` and `/simplify` stay generative (X1), so the authored depth ladder goes unused by the Tutor. |
| **V1-B** | Optional capability | Adds runtime depth navigation along the declared NC8 transitions. | Uses the 18 authored depth cards; directly serves T9 and the Runtime-loop bypass. | Adds a navigation surface and learner-control questions (D4) to v1. |
| **V1-C** | Specialist implementation strategy | Runs the specialists inline in the orchestrator (the spec's evaluation-gate fallback), promoted to specialist calls only if they beat inline on the golden traces. | Cheaper and faster to first trace; the spec already allows it. | The Socrates/Feynman split is unproven until the gate runs. |
| **V1-D** | Persistence strategy | Persistence limited to the session (evidence not kept across sessions). | Avoids the stale-evidence and lifecycle questions (PS4, N5) for the first release. | T21 paths across sessions cannot be shown; less adaptive on return. |

`/dive` infrastructure exists before Tutor implementation (sequencing decided, §8). Decide whether
Tutor v1 only understands and suggests `/dive`, or actively invokes it (N1, N2).

## 16. Questions that must be answered before Tutor coding starts

A walkthrough checklist for one session. Each links to its item above.

- [ ] X1, X2, X3, X6: the architecture inconsistencies. (X4, X5, X7 and X8 are editorial cleanup;
      X9 is deferred integration. Neither needs session time.)
- [ ] R1–R4: the v1 `LearnerTurn` fields, and which are deterministic, inferred or never inferred.
- [ ] R9: intent → move mapping.
- [ ] E1: the v1 evidence-producing events.
- [ ] E6: card practice → T1 (transfer or recognition, and which claim).
- [ ] E7: JEV checks → T1 records.
- [ ] O1–O3: the orchestrator's decision set, inputs, and deterministic pre-steps.
- [ ] O4: the planning horizon.
- [ ] V1, V2, V4: the evaluation split, and what JEV returns.
- [ ] D4, D5: navigate or suggest, and what `/deeper` and `/simplify` mean.
- [ ] N1, N8: a T8 branch versus `/dive`, and the canonical dive target.
- [ ] C1: the per-turn context minimum.
- [ ] PS1: what v1 persists.
- [ ] The golden trace set (§14): the eleven scenarios plus which additions.
- [ ] The v1 combination (§15): V1-A plus which of B, C and D, and whether Tutor v1 invokes `/dive`.
- [ ] S8: the specialist evaluation-gate metric.

Everything not on this list can be decided during implementation planning, or later.
