# Adaptive Tutor v1 (post-NC10 handoff milestone — not started)

Decided by the owner 2026-09-28. **Do not implement during NanoGPT completion.** The card agent
finishes the NanoGPT card checklist (NC7–NC10, docs/progress.md) first, then hands the completed
tool registry and card system to a dedicated Tutor Agent workstream, branched from the merged
Learn/cards branch.

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
requiresConfirmation, supportedContexts, productionReady. The tutor uses only productionReady=true.

**T4 — Prediction before reveal.** Often ask the learner to predict before showing ("If temperature
drops from 1.0 to 0.5, what happens to the distribution?" → prediction → graph changes → tutor
asks why), when the learner has the prerequisites to make a meaningful prediction; never force a
random guess.

**T5 — Socratic questioning, deliberate withholding.** Know when not to explain at once ("What do
you think row 3 can attend to?", "You said the MLP mixes tokens. What in this diagram would have to
connect for that to happen?", "What changes if the scale becomes zero?"). Rule: ask when learner
effort is likely to reveal useful evidence; explain when questioning no longer has pedagogical
value. Never answer every question with another question.

**T6 — Explain-back loop.** At important conceptual boundaries ("Explain causal masking in your own
words"), evaluate: key ideas present, misconception, non-attempt. JEV may give a cheap grading
signal — evidence, not the tutor. If incomplete: identify the specific missing mental model, choose
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

## Not part of Tutor v1

Perfect long-term mastery scoring; fully autonomous curriculum generation; emotional/personality
profiling; arbitrary unrestricted tool execution; replacing human teachers; learning-style labels.
Start with evidence-driven pedagogical adaptation.
