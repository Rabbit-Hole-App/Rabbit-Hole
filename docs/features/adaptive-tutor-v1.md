# Adaptive Tutor v1 (post-NC10 handoff milestone — not started)

Decided by the owner 2026-09-28. **Do not implement during NanoGPT completion.** The card agent
finishes the NanoGPT card checklist (NC7–NC10, docs/progress.md) first, then hands the completed
tool registry and card system to a dedicated Tutor Agent workstream, branched from the merged
Learn/cards branch — once the T0 readiness gate passes.

**Spec status: approved in direction and frozen (owner, 2026-09-28).** No further tutor design until
the NanoGPT/card work finishes. No new major scope for v1: the exclusions at the end stay exactly as
written, and the v1 target remains evidence-driven pedagogical adaptation.

The goal is not another chatbot: observe the learner → decide the next pedagogical move → choose
the best learning tool → evaluate what happened → adapt.

## Ownership

```
Tutor orchestration / pedagogy   → future Tutor Agent, based on Learn/cards
Canvas learning tools            → Learn/cards
Slash-command shared contract    → smart-home
Notebook/runtime                 → smart-parallel
JEV grading signals              → smart-parallel
Project/Map context              → smart-home
```

smart-parallel stays a provider of capabilities (Jupyter/notebook runtime, JEV grading and
evaluation, other backend execution services). The tutor calls them; it does not live there.

## Checklist for the Tutor Agent

**T0 — Readiness gate.** Tutor work does not start merely because the NanoGPT cards are finished.
Every dependency below must exist as a merged, explicit interface first:
- Learn/cards tool registry merged;
- smart-home slash/learnRequest contract merged;
- smart-parallel JEV evaluator interface available (J5, J18);
- notebook runtime available;
- Project/Map context contract available;
- selection-context schema available for whatever selections exist.

Selection types that don't exist yet may be optional, but their interfaces must be explicit. The
tutor depends on capabilities, never on code imported opportunistically from three worktrees.

**T1 — Learner evidence model.** Never reduce learning to completed=true or fake mastery
percentages. Per concept: understood · uncertain · misconception · prerequisite_gap ·
not_yet_observed. Evidence from challenge responses, explain-back, quizzes, practice transfer, code
exercises, notebook experiments, the learner's questions, repeated requests to simplify, successful
deeper questions. Store why the tutor believes something, not only the label:

```
causal_mask:
  state: understood
  evidence:
    - challenge c11 correct
    - explained row-99 transfer correctly
weighted_values:
  state: misconception
  evidence:
    - said output selects one value rather than mixes values
```

Evidence is a record, never a permanent label:

```
evidence:
  concept             weighted_values
  claim/skill         "the output mixes all values by weight"
  result              pass | fail | partial | misconception | non_attempt
  confidence          from the evaluator (deterministic = certain; JEV status, J5)
  source              challenge | explain_back | quiz | practice | code | notebook | question | ...
  artifactId
  timestamp
  kind                demonstrated_here | demonstrated_in_transfer
  difficulty / transfer distance
```

`demonstrated_here` is recognition or repetition on the case the learner was shown;
`demonstrated_in_transfer` is success on an unseen case, a larger dimension, a counterfactual, a
different representation or code. Transfer evidence counts more than recognition/repetition.

Aggregation rules — the concept state is derived from the whole evidence set and recomputed on each
new record, never overwritten by the last event:
- Per claim first, then per concept: a concept is understood only when each of its key claims is.
- understood (claim): at least one settled `demonstrated_in_transfer` pass, and no later settled
  fail or misconception on that claim. One correct answer on the drawn case never makes a claim
  understood.
- misconception (claim): a settled misconception not superseded by a later settled transfer pass on
  the same claim.
- uncertain: conflicting evidence (e.g. challenge correct, explain-back incomplete, transfer
  problem wrong), only `demonstrated_here` evidence, or only uncertain evaluator results.
- prerequisite_gap: failures traced to a claim of a prerequisite concept.
- not_yet_observed: no evidence.
- Newer settled evidence on the same claim outweighs older, so a state can move back (understood →
  uncertain after a later failure). Evaluator `uncertain` or `error` results are stored but never
  settle a state on their own.

The Tutor Agent may refine these against the golden trace suite (T19); it must not replace them
with a single score.

**T2 — Pedagogical move taxonomy.** Choose a move before a tool: diagnose, ask_for_prediction,
hint, explain, simplify, demonstrate, give_example, compare, let_learner_experiment, practice,
explain_back, show_source, revisit_prerequisite, go_deeper, summarize. Never learner message →
renderer primitive directly:

```
learner state + current concept + conversation + selection
  → pedagogical move → tool family → validated primitive
```

**T3 — Tutor tool registry.** Consume the primitives already built:
- Diagnose / check understanding: Challenge, Explain back, Quiz, Flashcards.
- Explain: Explanation, Table, Narration.
- Code: Code sample, Code exercise, Notebook.
- Visualize: Interactive graph, Data plot, Flow diagram, Mermaid, Knowledge graph, Vector
  explorer, Walkthrough, Animation, Reference attention, Maths animation.
- Create / inspect: Whiteboard, Paper, Image, Video, 3D model, Blender scene.

Every entry carries pedagogicalUses, prerequisites, interactionType, costClass,
requiresConfirmation, supportedContexts, productionReady, and the tool-choice economics:
latencyClass, evidenceYield (what evidence using it can produce), persistenceType,
interruptible, deterministicEvaluatorAvailable, reuseExistingArtifact. The tutor uses only
productionReady=true.

Policy: **reuse before generate.** Use the lowest-cost, lowest-latency tool that achieves the
pedagogical move well — reuse the existing graph rather than generate another; a cheap interactive
activity over paid video when both teach the same thing. Paid media still needs confirmation (T15).

**T4 — Prediction before reveal.** Often ask the learner to predict before showing ("If temperature
drops from 1.0 to 0.5, what happens to the distribution?" → prediction → graph changes → tutor
asks why), when the learner has the prerequisites to make a meaningful prediction; never force a
random guess.

**T5 — Socratic questioning, deliberate withholding.** Know when not to explain at once ("What do
you think row 3 can attend to?", "You said the MLP mixes tokens. What in this diagram would have to
connect for that to happen?", "What changes if the scale becomes zero?"). Rule: ask when learner
effort is likely to reveal useful evidence; explain when questioning no longer has pedagogical
value. Never answer every question with another question.

**T5a — Minimum intervention (overarching rule).** Do not create a new artifact when a question, a
hint, a manipulation of an existing artifact or a brief response would produce the needed evidence.
Learner misses one detail: not another 800px card, but highlight the existing element and ask one
question. Optimize for learning, not content generation — Rabbit Hole must not become an infinite
stream of AI cards.

**T6 — Explain-back loop.** At important conceptual boundaries ("Explain causal masking in your own
words"), evaluate: key ideas present, misconception, non-attempt. JEV is the default fast grader
here (J3) — evidence, not the tutor. If incomplete: identify the specific missing mental model, choose
another representation, never repeat the previous explanation.

**T7 — Representation switching.** Text didn't work → animation; animation understood →
implementation; implementation confusing → simpler concrete example; learner claims mastery →
transfer challenge. Track which representations were tried. Avoid explain → confused → longer
explanation → more confused.

**T8 — Prerequisite branching.** Blocked on a prerequisite (Attention → doesn't understand softmax)
→ temporary softmax branch → check understanding → return to Attention. Preserve return context;
never derail the path permanently.

**T9 — Adaptive depth.** Use Overview / Guided / Deep dive. The learner controls /deeper and
/simplify; Auto may suggest a change from evidence but never labels the person ("You seem
comfortable with the mechanism. Want to see how NanoGPT implements it?", not "You are an advanced
learner").

**T10 — Practice policy.** Practice tests transfer: unseen values, larger dimensions,
counterfactuals, a different representation, application to code — never "what number did the card
just show?". The tutor decides when practice is useful rather than attaching it to every artifact.

**T11 — Tool selection policy.** Intuition → explanation / animation / example; causal exploration
→ interactive graph / vector explorer; architecture → flow diagram / graph; implementation → code
sample / source; experimentation → notebook / code exercise; transfer evidence → challenge;
articulation evidence → explain-back. Start with explicit deterministic rules plus model choice
within allowed families; no unrestricted permission to invent tool behavior.

**T12 — Learner control.** The learner can always override Auto: /deeper /simplify /example
/practice /quiz /compare /research /graph /diagram /animate /code /notebook … Adaptation never
traps the learner in its chosen path.

**T13 — Selection-aware tutoring.** Context eventually includes the selected card, equation, canvas
object, graph node, notebook cell/file, source region. The learner circles the attention matrix and
asks "Why is this zero?" → the tutor receives the semantic object, not merely a screenshot, when
structured context exists.

**T14 — Map → Tutor → Learn.** Project Map → select CausalSelfAttention → "Why was this built this
way?" → graph context + decisions/sessions → Learn this → adaptive Learn canvas. The tutor accepts
Project/Map context from smart-home.

**T15 — Cost-aware behavior.** Cheap/local tools freely. Paid generation (images, video, Manim
render, Blender render) needs confirmation ("An animation could make this easier to see. Generate
one?"). Never spend credits because richer media would look nice.

**T16 — Epistemic honesty.** Distinguish source fact, calculated result, recorded run, What-if,
recorded project decision, inferred explanation, model uncertainty. Without a recorded rationale:
"I can explain what this code does, but I don't have a recorded decision explaining why the team
chose it." Never invent institutional history.

**T17 — Session memory.** Remember learning-relevant, learner-visible, evidence-based state:
concepts discussed, misconceptions, questions, depth choices, completed evidence, artifacts
created, prerequisites visited. Never store hidden reasoning.

Every memory record has an explicit scope: learner · workspace · project · canvas · concept ·
session. Evidence never leaks Project A → Project B, workspace A → workspace B or learner A →
learner B. When a canvas, project or session is deleted, or the learner loses access to it,
dependent tutor memory follows that lifecycle (deleted or made unreachable with it); the same holds
for Project/Map decision and session evidence.

**T18 — Planner output.** Structured and inspectable:
`{ currentConcept, evidence, learningGoal, move, reason, toolFamily, allowedPrimitives,
expectedEvidenceAfter }` — reason is an operational explanation for debugging/evaluation, not
private chain-of-thought.

**T19 — Evaluation framework.** Scripted learner scenarios before free adaptation:
- Confidently wrong ("Attention just selects the most similar token.") → detect misconception →
  counterexample/interactive activity → practice.
- Asks for implementation at once ("Show me where this happens in NanoGPT.") → don't force Overview
  → code/source/deep dive.
- Repeatedly confused → change representation, not more prose.
- Already understands → skip redundant cards → transfer/deeper.
- Missing prerequisite → branch → teach prerequisite → return.

These are executable, not illustrative. Each scripted scenario declares: initial learner evidence;
the learner message/action; the expected evaluator outcome; acceptable pedagogical moves; forbidden
moves; acceptable tool families; expected evidence afterwards. Example:

```
scenario: learner confidently says "Attention picks the single most similar token."
expected evidence:   misconception = weighted_values/select-one
acceptable moves:    ask_for_prediction, demonstrate, give_example
acceptable tools:    interactive visualization, the existing weighted-values card
forbidden:           mark understood, go deeper, repeat the same prose explanation
```

A golden tutor trace suite is built before free adaptation is enabled. It grades whether the tutor
chose a pedagogically valid action, avoided known-bad actions, and moved the evidence in the
intended direction — not whether it picked exactly one favourite action.

**T20 — Metrics.** Never optimize time on platform, cards generated, message count or completion
percentage. Primary: can the learner predict, explain, transfer, use it in code; did the
misconception disappear. Secondary: fewer hints requested, successful deeper questions, retention
later.

**T21 — Acceptance.** Done when the same concept produces meaningfully different paths for
different learner evidence, all from the same architecture, not hardcoded per-concept flows:
- A: prediction → Guided visualization → correct transfer → Deep implementation.
- B: prediction reveals misconception → simple example → animation → explain-back → Guided
  visualization.
- C: already knows the mechanism → source/code → notebook experiment.

Paths must differ because of observable learner evidence, not random model variation. If an
identical learner state and request produce completely different pedagogical behaviour on each run,
that is randomness, not adaptation. Byte-for-byte determinism is not required, but the reason for
every branch must be inspectable — the structured planner output (T18) is that mechanism.

## Runtime loop (implementation invariant)

```
OBSERVE
  ↓
EVALUATE                (deterministic → JEV → general evaluator, J16)
  ↓
ROUTINE TRANSITION?
  ├─ yes → deterministic rule
  └─ no  → PLAN
             ↓
           EXECUTE TOOL
             ↓
           WAIT FOR LEARNER
             ↓
           EVALUATE
```

**The planner does not run on every turn.** It runs only when there is a real pedagogical choice
(J11: misconception, uncertainty, repeated failure, a learner question, a representation change, a
prerequisite branch, a depth transition). These bypass it:
- quiz correct → continue;
- challenge prediction correct → reveal;
- explicit /notebook → insert a notebook;
- explicit /deeper with a known target → move deeper.

## Fast evaluation with JEV (core architectural rule)

JEV is the tutor's fast evaluator, not the tutor. Use it for learner-state evaluation whenever the
judgment reduces to a small set of concrete questions; call the larger tutor model only when
interpretation, teaching strategy or generation is actually needed. The performance win comes less
from JEV being faster than the tutor model than from designing the loop so many learner turns never
need the heavyweight model at all.

```
                         ┌─ deterministic evaluator
learner action ──────────┼─ JEV fast evaluator
                         └─ general evaluator (fallback)
                                    ↓
                             learner evidence
                                    ↓
                              Tutor planner
                                    ↓
                           pedagogical move
                                    ↓
                              learning tool
```

Not: learner action → expensive general model grades everything → next step.

**J1 — JEV-first rule.** If the evaluation reduces to explicit questions with known criteria, use
JEV first: did the learner state idea A / idea B; is there a factual misconception; is this a
non-attempt; did the prediction match the expected qualitative outcome; did they identify the
correct dependency; does the explanation include the causal mechanism.

**J2 — Challenge grading.** Prompt + key ideas + learner answer → ask JEV idea_0?, idea_1?, …,
misconception?, non_attempt? and turn the probabilities into learner evidence. The tutor model
never rereads and grades every one-sentence prediction.

**J3 — Explain-back.** JEV is the default fast grader ("Explain causal masking in your own
words" → ✓ future positions are hidden · ✓ each position attends to itself and the past · ✗ mask
applied before softmax · misconception: false). The tutor is called afterwards only to decide:
continue, clarify the missing idea, switch representation, ask another question.

**J4 — Quiz / prediction checks.** No model when a deterministic check suffices. Multiple choice,
numeric with tolerance, code tests (runtime/tests) → deterministic. Free-form conceptual answer →
JEV. Nuanced explanation needing interpretation → JEV first, escalate if uncertain.

**J5 — Confidence and escalation.** Three outcomes: settled (strong probabilities → update evidence
at once), uncertain (middling or contradictory → escalate to the tutor model), error (transport
failure → tutor model or deterministic path). JEV uncertainty triggers escalation; it never silently
becomes a confident label.

One contract, so no caller invents its own interpretation:

```
evaluateLearnerResponse(...) → {
  status:   settled | uncertain | error,
  checks:   { ... },
  evidence: [ ... ]      // T1 records
}
```

The shared evaluator service owns the threshold semantics (what counts as strong, middling or
contradictory). The tutor consumes `status` and never duplicates TypeSafe/JEV threshold logic.

Fast-path SLO: deterministic evaluation effectively immediate; JEV fast evaluation p95 ≤ 400 ms.
Latency is measured; if the evaluator becomes slow or unreliable, escalate or fall back rather than
letting tutoring feel stuck. Still one batched JEV request per meaningful free-form response (J12).

**J6 — Misconception detector.** For every important free-form response ask whether it contains a
factual misconception about concept X; if yes, ask narrower follow-ups (attention selects exactly
one token? the MLP mixes positions? temperature changes token ordering?) and record the specific
misconception, not "answer = wrong".

**J7 — Evidence, not paths.** JEV outputs evidence the planner consumes:
`{ concept: "weighted_values", evidence: { ideaPresent: 0.94, misconception: 0.88, nonAttempt:
0.02 }, source: "explain_back", artifactId, timestamp }`. Never store "mastery = 73%" unless a
principled mastery model is built later.

**J8 — After interactions too.** Turn structured learner actions into evaluation questions where
useful: the selected mask indices are graded deterministically; JEV grades the learner's
explanation of why ("The largest probability will increase" after a temperature change).

**J9 — Evaluation ladder.** Deterministic checks → JEV → tutor model, never the tutor model for
everything. Applies to Challenge, Explain back, Quiz, Code exercise, graph prediction, diagram
selection, notebook result explanation and transfer practice.

**J10 — Response generation stays with the tutor.** JEV supplies evidence (missing idea =
weighted values; misconception = false); the tutor supplies pedagogy ("show the weighted-values
interactive card instead of explaining again", or one Socratic question).

**J11 — No tutor call after every successful grade.** Rules handle routine transitions: prediction
correct + prerequisites satisfied → reveal experiment; explain-back has all required ideas → record
evidence and continue; quiz correct → continue. Call the planner only for an actual adaptive
decision: misconception, uncertainty, repeated failure, a learner question, a representation
change, a prerequisite branch, a depth transition.

**J12 — Batch the checks.** One JEV request per meaningful free-form learner action, carrying every
check (idea_0, idea_1, idea_2, misconception, non_attempt) where supported — not five calls.

**J13 — Latency.** Deterministic check ~instant; JEV the fast path; the general tutor model the
slow path, only when needed; generative media an explicit long-running path. Never block simple UI
feedback on long-running content generation.

**J14 — Background pre-evaluation.** Where the visible flow doesn't depend on the grade, JEV may run
concurrently. When the next move depends on correctness, wait for JEV before choosing it — never
show a contradictory next card and revise it afterwards.

**J15 — JEV does not approve complex pedagogy.** Which representation suits this learner, whether an
explanation is pedagogically elegant, whether to branch to a prerequisite, whether a card is
visually comprehensible — these stay tutor/planner or strong-reviewer decisions. JEV's job is fast,
narrow evidence extraction.

**J16 — Fallback hierarchy (everywhere).** Can code decide exactly? → deterministic. Otherwise, can
the question be expressed as explicit semantic checks? → JEV. Otherwise, or uncertain → general
tutor model.

**J17 — Metrics.** Track % of learner evaluations handled deterministically, % by JEV, % escalated,
JEV latency, escalation rate, grader disagreement rate. Most routine grading/evidence extraction
should not invoke the general tutor model — but never lower correctness to raise the JEV share.

**J18 — Source.** Consume JEV from the smart-parallel/shared backend once available; never
duplicate it in the Tutor branch. The Tutor sees one evaluator interface, conceptually
`evaluateLearnerResponse({ prompt, expectedIdeas, answer, checks })`, independent of the transport
(TypeSafe Direct, Vercel or anything else).

This is learner evaluation inside the tutor. It does not change card acceptance: JEV stays out of
the NanoGPT card review pipeline (docs/features/learn-card-pipeline.md).

## Not part of Tutor v1

Perfect long-term mastery scoring; fully autonomous curriculum generation; emotional/personality
profiling; arbitrary unrestricted tool execution; replacing human teachers; learning-style labels.
Start with evidence-driven pedagogical adaptation.
