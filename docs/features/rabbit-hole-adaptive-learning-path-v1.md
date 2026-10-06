# Rabbit Hole — Adaptive Learning Path & Learner Intent V1

## Status

**AUTHORIZE AS A NEW CORE PRODUCT SUBSYSTEM.**

Primary product goal:

> **Rabbit Hole intelligently constructs a full adaptive learning path for what the learner wants to learn, then teaches one section at a time while continuously adapting the path from learner evidence.**

Canonical example:

```text
Learner:
"I want to learn logistic regression."

        ↓

understand learner goal + constraints

        ↓

lightweight diagnostic / learner assessment

        ↓

generate a draft adaptive learning path

        ↓

show Table of Contents in the right-side Contents rail

        ↓

learner accepts / edits / redirects it

        ↓

generate and teach ONLY section 1

        ↓

learner interacts with cards / quizzes / code / Motion / Tutor

        ↓

Evaluator + Evidence Store observe what happened

        ↓

Tutor probes / nudges when useful

        ↓

adapt the remaining Table of Contents

        ↓

generate the next section only when it is actually needed
```

This replaces the bad behavior:

```text
"I want to learn logistic regression"
→ Tutor immediately starts improvising cards on a blank canvas
```

That behavior is **not acceptable** for broad learning intent.

---

# 1. Core product principle

Rabbit Hole is not merely:

> a chatbot that can place teaching cards on a canvas.

Rabbit Hole should behave like:

> an adaptive professor that first understands what the learner is trying to achieve, assesses where the learner currently is, proposes a learning path, then teaches and revises that path based on evidence from the learner's actual work.

The learning path is not a static course generated once.

It is a **living plan**.

The table of contents is therefore not just navigation.

It is the visible representation of the Tutor's current teaching plan.

---

# 2. Communication mode vs learning plan

Communication mode is independent:

```text
Learner communication
├── Chat
└── Voice
```

Learning orchestration is:

```text
Learning Intent
→ Diagnostic
→ Adaptive Learning Path
→ Current Section
→ Evidence
→ Adaptation
```

Learning materials inside a section may include:

```text
- explanation card
- code card
- graph
- interactive visualization
- quiz
- flashcards
- practice task
- notebook/code exercise
- Motion
- Avatar Teacher clip
- Rabbit Hole / dive
```

Chat or Voice determines **how the learner talks to the Tutor**.

The adaptive learning path determines **what the Tutor teaches, in what order, and why**.

---

# 3. When this flow activates

Do NOT trigger the full learning-path bootstrap for every question.

The Learner Intent Resolver should classify the turn.

## Direct question

```text
"What is logistic regression?"
```

Possible handling:
- normal Tutor answer,
- perhaps offer "Learn this as a guided path" if useful.

No mandatory curriculum bootstrap.

## Broad learning journey

```text
"I want to learn logistic regression."
"Teach me transformers."
"I want to understand reinforcement learning."
"Walk me through computer vision."
"I need to learn attention from scratch."
```

Trigger:

```text
learning_journey
```

This should enter the full intake / diagnostic / path flow.

## Focused guided skill

```text
"Show me how to build logistic regression from scratch."
"Teach me how backprop works."
```

Could produce a shorter path, but still goes through the same intent system.

## Explicit quick request

```text
"Just give me a 5-minute visual overview of logistic regression."
```

The learner has already supplied important constraints.

The intake can be minimal and the generated path may contain only 1–3 short sections.

The system should not force a long diagnostic when the learner explicitly asks for a quick overview.

---

# 4. Canonical UI surfaces

## 4.1 Right side: Adaptive Contents Rail

Rabbit Hole already has a right-side contents/navigation surface.

For learning journeys, this becomes the **Adaptive Contents Rail**.

It displays the current learning path / table of contents.

Example:

```text
Logistic Regression

✓ 1. Classification vs regression
● 2. From score to probability
○ 3. The sigmoid function
○ 4. Decision boundary
○ 5. Binary cross-entropy
○ 6. Gradient descent
○ 7. Build a classifier
○ 8. Evaluate it
```

Possible statuses:

```text
completed
current
upcoming
added
reordered
optional
skipped
needs_review
```

Upcoming sections are **provisional**.

The Tutor is allowed to adapt them.

Completed sections should not silently disappear or be rewritten.

---

## 4.2 Above composer: Tutor Prompt Tray

Standardize the product-level name of the surface above the chat composer as:

# **Tutor Prompt Tray**

If the existing code uses a different component name, map onto that existing component rather than creating a duplicate UI primitive.

The Tutor Prompt Tray is a reusable interaction surface.

It can operate in modes such as:

```text
intent_intake
diagnostic_probe
path_preview
check_in
clarification
next_step
branch_choice
generation_proposal
```

This is where the Tutor can ask structured questions without polluting the canvas with permanent cards.

Example:

```text
What do you want to be able to do with logistic regression?

[ Understand the intuition ]
[ Build it from scratch ]
[ Use it in practice ]
[ Prepare for an interview ]
[ Something else... ]
```

Or:

```text
How familiar are you with probability?

[ New to it ]
[ Some familiarity ]
[ Comfortable ]
```

Or:

```text
Quick check:

Why can't a raw linear score be interpreted directly as a probability?

[ learner types answer ]
```

The Tutor Prompt Tray is **ephemeral interaction UI**, not persistent canvas content.

---

# 5. Learning Journey Bootstrap

A broad learning request should enter the following state machine.

```text
DETECT_LEARNING_INTENT
        ↓
INTENT_INTAKE
        ↓
DIAGNOSTIC
        ↓
PATH_DRAFT
        ↓
LEARNER_REVIEW
        ↓
PATH_ACCEPTED
        ↓
SECTION_ACTIVE
```

Only after `PATH_ACCEPTED` should the Tutor begin generating permanent learning cards for the first section.

Exception:

If the learner explicitly says:

```text
"Skip setup and just start."
```

the Tutor may use minimal defaults and begin.

Even then, it should create a lightweight path first rather than improvising unstructured cards.

---

# 6. Intent Intake

Getting the learner's actual intention is paramount.

The Tutor should understand:

```text
target_topic
desired_outcome
current_background
desired_depth
time_budget
preferred_learning_style
coding_preference
math_comfort
practical_context
```

Do not interrogate the learner with ten questions at once.

Use adaptive questioning.

Usually 2–4 high-information questions should be enough before the diagnostic.

Possible initial questions:

## Goal

```text
What do you want to be able to do after learning this?

- understand the intuition
- explain it clearly
- implement it
- use it in a real project
- debug it
- prepare for an exam/interview
```

## Starting point

```text
How familiar are you with this already?

- completely new
- seen it before
- understand parts of it
- fairly comfortable
```

## Depth

```text
What kind of path do you want?

- quick visual overview
- guided understanding
- deep dive
- build-first
```

## Time

Optional:

```text
How much time do you want to spend?

- ~10 minutes
- ~30 minutes
- ~1 hour
- no fixed limit
```

If prior learner evidence already answers one of these questions, do not ask it again unnecessarily.

Do not expose hidden learner labels.

---

# 7. Diagnostic Assessment Before Teaching

Self-report is not enough.

Before generating the first teaching cards, the Tutor should normally perform a **lightweight diagnostic**.

This is not a formal exam.

Its purpose is:

> determine the best starting point and avoid teaching far above or far below the learner.

Diagnostic methods may include:

```text
multiple choice
explain-back
prediction
code reading
tiny code task
concept sorting
confidence + explanation
short calculation
visual interpretation
```

The diagnostic should be selected based on the topic and learner goal.

Example for logistic regression:

```text
Probe 1:
"If a model outputs a raw score of 3.2, is that already a probability? Why?"

Probe 2:
"What does a probability of 0.8 mean in binary classification?"

Probe 3:
[optional]
Given a simple sigmoid plot, identify what happens as x increases.
```

A learner who clearly understands these may skip the earliest prerequisite section.

A learner who struggles may get an added prerequisite such as:

```text
Probability basics
```

Diagnostic interaction can use the Tutor Prompt Tray.

Do not create permanent canvas cards solely to administer the initial diagnostic.

---

# 8. Assessment policy

The diagnostic should adapt.

Do not always ask the same fixed quiz.

Conceptually:

```text
start with one high-information probe
        ↓
evaluate
        ↓
enough evidence?
    yes → build path
    no  → ask another probe
```

Default target:

```text
1–3 diagnostic probes
```

Avoid turning setup into a long exam.

The learner can say:

```text
"Skip the assessment."
```

If they do, create the path using explicit self-report and mark relevant concepts as:

```text
not_yet_observed
```

Do not infer mastery.

---

# 9. Evidence model

Reuse the existing Tutor evidence semantics.

Allowed evidence states remain things such as:

```text
understood
uncertain
misconception
prerequisite_gap
not_yet_observed
```

Do NOT add:

```text
mastery_percentage
IQ
beginner_score
permanent learner level
```

One wrong answer is not automatically a misconception.

A weak answer may simply be:

```text
uncertain
```

or:

```text
not_yet_observed
```

Transfer evidence is stronger than repetition.

---

# 10. Adaptive Learning Path Planner

After intent intake + diagnostic, a dedicated Learning Path Planner produces the initial plan.

Example:

```text
Goal:
Build and reason about a binary logistic regression classifier.

Path:

1. Classification vs regression
2. From a linear score to probability
3. Sigmoid / logistic intuition
4. Decision boundaries and thresholds
5. Binary cross-entropy
6. Training with gradient descent
7. Build logistic regression from scratch
8. Evaluate the classifier
```

If the learner already understands probability and sigmoid:

```text
1. Quick classification framing
2. Decision boundaries and thresholds
3. Binary cross-entropy
4. Gradient descent
5. Build it
6. Evaluate it
```

If prerequisite gaps appear:

```text
1. Probability refresher
2. Classification vs regression
...
```

The path is a teaching hypothesis, not a permanent syllabus.

---

# 11. LearningPath data model

Conceptual structure:

```text
LearningPath {
  id
  version
  goal
  target_topic

  learner_intent_ref
  diagnostic_evidence_refs[]

  sections[]

  current_section_id
  created_at
  updated_at
}
```

Section:

```text
LearningPathSection {
  id
  title
  purpose

  prerequisites[]
  target_concepts[]
  expected_evidence[]

  estimated_minutes?

  status:
    upcoming
    current
    completed
    optional
    skipped
    needs_review

  generation_state:
    not_generated
    planning
    generated

  adaptation_reason?
}
```

Do not store arbitrary psychological profiling.

Store only pedagogically necessary evidence and path state.

---

# 12. Path Preview

Before permanent content generation, show the draft path.

Use:

- Adaptive Contents Rail for the full Table of Contents.
- Tutor Prompt Tray for acceptance/edit controls.

Example:

```text
I drafted this path based on your goal and the quick check.

[ Start ]
[ Make it shorter ]
[ Go deeper ]
[ More practical ]
[ More mathematical ]

You can also tell me what to change.
```

The learner can type:

```text
"Skip gradient descent, I already know it."

"Add more on interpretation."

"I care about implementation in Python."

"Make this a 20-minute path."
```

The planner revises the path before starting.

---

# 13. Generate ONE section at a time

This is a hard V1 rule.

After the path is accepted:

```text
DO NOT generate all lesson cards for all sections.
```

Only generate the currently active section.

Example:

```text
Path accepted

Section 1:
Classification vs regression

→ generate Section 1 teaching sequence
→ learner interacts
→ collect evidence
→ adapt path
→ then plan/generate Section 2
```

Why:

- learner behavior may change the path,
- generating ahead wastes model calls,
- pre-generated content becomes stale,
- the learner may skip or dive,
- Tutor should react to misconceptions and curiosity,
- course order is adaptive.

Upcoming sections should exist as **titles/purposes**, not fully materialized card sets.

---

# 14. Section Planner

Each active section gets a just-in-time Section Plan.

Conceptually:

```text
SectionPlan {
  learning_objective
  target_concepts[]
  prerequisite_evidence[]
  teaching_sequence[]
  checks[]
  completion_evidence[]
}
```

Possible teaching sequence:

```text
1. short framing
2. interactive visual
3. explanation
4. learner prediction
5. practice
6. check for transfer
```

The Section Planner chooses appropriate materials.

Not every section should have the same template.

---

# 15. Tutor probes and nudges

The Tutor must not passively wait for the learner to ask questions.

It should actively probe when pedagogically useful.

Examples:

```text
"Before we move on, what do you think happens to the probability if this coefficient becomes negative?"

"Can you explain in your own words why the sigmoid is useful here?"

"You changed the threshold from 0.5 to 0.8. What trade-off did that create?"

"You seem comfortable with the intuition. Want to see the derivation, or move to building it?"
```

Avoid low-information repetitive prompts such as:

```text
"Did you understand?"
```

unless paired with a useful action.

Better:

```text
"Want a quick check, a deeper explanation, or keep going?"
```

---

# 16. Tutor Prompt Tray for probes

Use the Tutor Prompt Tray for lightweight interventions.

## Check-in

```text
What should we do next?

[ Quick check ]
[ Go deeper ]
[ Keep going ]
```

## Explain-back

```text
In one sentence, why does logistic regression use a sigmoid?

[ text input ]
```

## Prediction

```text
If β1 changes from positive to negative, what happens?

[ The curve flips ]
[ It gets steeper ]
[ Not sure ]
```

## Branch

```text
You seem comfortable with the intuition.

[ Derive the loss ]
[ Start implementing ]
[ More examples ]
```

The tray should disappear when resolved.

It should not become permanent canvas content unless the resulting learning material itself deserves to be saved.

---

# 17. When to probe

Do not nudge after every card.

Useful triggers:

```text
- after a key concept
- before a major transition
- evidence is uncertain
- learner makes repeated errors
- learner rapidly clicks through without interaction
- learner asks "continue" after passive consumption
- prerequisite knowledge is unclear
- learner completes a practice task
- learner returns from a Rabbit Hole
```

Avoid:
- nagging,
- repeated "did you understand?",
- interrupting active manipulation,
- interrupting Voice while learner is speaking,
- unnecessary probes when evidence is already strong.

---

# 18. Path adaptation

After meaningful evidence, the Learning Path Planner may update only the **future** path.

Allowed:

```text
insert prerequisite
remove redundant upcoming section
merge sections
split difficult section
reorder upcoming sections
mark optional
add practice
add review section
change expected depth
```

Example:

Original:

```text
4. Decision boundary
5. Binary cross-entropy
6. Gradient descent
```

Learner struggles with probability interpretation.

Adapted:

```text
4. Probability and odds refresher   [added]
5. Decision boundary
6. Binary cross-entropy
7. Gradient descent
```

Or learner demonstrates strong understanding:

```text
3. Sigmoid intuition                [completed quickly]
4. Decision boundary
5. Loss + gradient descent          [merged]
6. Build classifier
```

---

# 19. Adaptation transparency

Do not silently reshuffle the course in confusing ways.

When the path materially changes, show a lightweight explanation.

Example:

```text
"I added a short probability refresher before decision boundaries because the last example showed some uncertainty around probability interpretation."

[ Sounds good ]
[ Skip it ]
```

Or:

```text
"You handled the sigmoid transfer question well, so I shortened the next section."
```

Do not say:

```text
"You mastered sigmoid."
```

Use evidence-specific wording.

---

# 20. Path versioning

Every meaningful path change should create a new version.

Conceptually:

```text
LearningPath v1
→ initial draft

LearningPath v2
→ learner requested more practical focus

LearningPath v3
→ inserted probability refresher after evidence
```

Persist:

```text
reason
triggering evidence refs
sections changed
timestamp
```

This supports debugging and later product analytics.

Do not expose all internal version metadata to the learner.

---

# 21. Completed sections

Completed sections become stable historical anchors.

The Tutor should not silently rewrite completed content.

Future sections can adapt freely.

If a completed concept later proves shaky:

```text
add a review/revisit section
```

rather than pretending the prior section never happened.

---

# 22. Rabbit Holes / `/dive`

A Rabbit Hole remains a child learning canvas.

If the learner dives into a concept during a section:

```text
parent section pauses
→ child Rabbit Hole
→ learner explores
→ return to parent
```

On return, the Tutor should assess whether the detour changed the parent path.

Possible outcomes:

```text
no path change
skip an upcoming prerequisite
add a bridge section
add a transfer check
```

The Rabbit Hole itself should not arbitrarily rewrite the parent path while the learner is inside it.

Reconciliation happens on return.

---

# 23. Repository vs no-repository learning

The architecture must support both.

## No repository

```text
"I want to learn logistic regression."
```

Target grounding:

```text
topic-based
```

The path is built from the learner goal and topic knowledge.

## Repository connected

```text
"I want to understand attention in nanoGPT."
```

Target grounding:

```text
repo + commit + source symbols
```

The path may include:

```text
1. Attention intuition
2. nanoGPT CausalSelfAttention.forward
3. mask + softmax fallback
4. SDPA path
5. build/modify/test
```

Same orchestration:

```text
intent
→ diagnostic
→ adaptive path
→ one section at a time
```

Only grounding differs.

---

# 24. Learning goal states

Add explicit learning-journey state.

Conceptually:

```text
LearningJourney {
  state:
    intake
    diagnostic
    path_review
    active
    paused
    completed

  learning_path_id
  active_section_id
}
```

This is distinct from an ordinary Tutor conversation.

A blank canvas may have:

```text
no journey
```

until broad learning intent is detected.

---

# 25. Entry behavior on blank canvas

Canonical example:

```text
Blank canvas
No GitHub
No code

Learner:
"I want to learn logistic regression."
```

Correct V1 behavior:

```text
1. Detect learning_journey intent.
2. Do NOT generate explanation cards yet.
3. Open Tutor Prompt Tray.
4. Ask high-value intent question(s).
5. Run lightweight diagnostic.
6. Generate draft LearningPath.
7. Populate Adaptive Contents Rail.
8. Let learner accept/edit.
9. Mark section 1 current.
10. Generate ONLY section 1.
11. Teach and collect evidence.
12. Adapt future path as needed.
```

---

# 26. Example full flow

```text
Learner:
"I want to learn logistic regression."

Tutor Prompt Tray:
"What do you want to be able to do?"

[ Understand it visually ]
[ Build it from scratch ]
[ Use it in a project ]
[ Interview prep ]

Learner:
"Build it from scratch."

Tutor Prompt Tray:
"How comfortable are you with probability?"

[ New ]
[ Some familiarity ]
[ Comfortable ]

Learner:
"Some familiarity."

Diagnostic:
"A model outputs a raw score of 2.3.
Can we call that a probability yet? Why?"

Learner explains.

Evaluator:
evidence = uncertain on probability mapping
not a misconception

Learning Path draft:

1. Classification framing
2. From linear score to probability
3. Sigmoid intuition
4. Decision boundary
5. Binary cross-entropy
6. Gradient descent
7. Implement logistic regression
8. Evaluate it

Adaptive Contents Rail shows the path.

Tutor Prompt Tray:

[ Start ]
[ Shorter ]
[ Deeper math ]
[ More visual ]

Learner:
"Start."

ONLY section 1 is generated.

During section 1:

Tutor:
"Before we move on, what makes this a classification problem rather than a regression problem?"

Learner answers well.

Evidence updates.

Future path may shorten classification review.

Section 2 generated only after section 1 finishes.
```

---

# 27. Learning path acceptance

Default:

The learner should see the draft before permanent teaching cards begin.

Acceptance can be:

```text
Start
```

or natural language:

```text
"Looks good."
"Let's go."
"Start with section 1."
```

If the learner modifies the path:

```text
"Make this more visual."
"Skip the basics."
"Add Python."
```

update the draft before beginning.

For explicit fast-start requests:

```text
"Don't ask me setup questions, just start."
```

the Tutor may create a minimal path and begin immediately.

The Contents Rail should still show that path.

---

# 28. Adaptive Table of Contents UX

The Contents Rail should communicate:

```text
completed
current
upcoming
adapted
optional
```

But avoid excessive internal detail.

Possible UX:

```text
✓ Classification framing
● From score to probability
○ Sigmoid intuition
○ Decision boundary
○ Loss
○ Training
○ Build
○ Evaluate
```

If adaptation occurs:

```text
+ Probability refresher
```

may briefly animate/highlight.

The learner should be able to click an upcoming section to inspect its goal.

V1 should NOT fully pre-generate that section merely because it was clicked.

---

# 29. Learner editing the path

The user should not need a separate complicated curriculum editor in V1.

Primary editing surface:

```text
Chat / Voice
```

Examples:

```text
"Move implementation earlier."
"Skip probability."
"Add an interview section."
"Make this shorter."
```

Optional lightweight TOC controls may support:
- skip,
- optional,
- revisit.

But natural language remains the primary editor.

---

# 30. Planner boundaries

Use separate responsibilities.

## Learner Intent Resolver

Determines:
- direct question vs learning journey,
- named target,
- learner request constraints,
- explicit depth/time/style hints.

## Learner Intake / Diagnostic Planner

Determines:
- what is still unknown about the learner's goal,
- what diagnostic probe would be most informative.

## Learning Path Planner

Determines:
- sections,
- order,
- prerequisites,
- section purposes,
- future adaptation.

## Section Planner

Determines:
- teaching sequence for CURRENT section only.

## Evaluator / Evidence Store

Determines:
- what evidence the learner produced.

## Tutor Planner

Determines:
- response/action now,
- whether to probe/nudge,
- when to continue.

Do not put all of this in one giant Tutor prompt.

---

# 31. No full-course card generation

Hard invariant:

```text
LearningPath != generated course contents
```

The path contains:

```text
section plans / intentions
```

not:

```text
all cards for all sections
```

Permanent artifacts are generated just in time.

Test this explicitly.

A newly accepted 8-section path must not result in 8 sections' worth of canvas cards.

Only the active section may materialize.

---

# 32. Nudge policy

The Tutor should feel proactive, not annoying.

Good nudge:

```text
"You've seen the curve move. Predict what happens if β1 becomes negative."

[ It flips ]
[ It gets steeper ]
[ Not sure ]
```

Bad nudge:

```text
"Did you understand?"
```

Good choice:

```text
"You've got the basic mechanism in this example. Want to:

[ Try one ]
[ See the math ]
[ Keep going ]
"
```

Nudges should produce evidence or give the learner meaningful control.

---

# 33. Voice Mode

Everything in this flow must work through both Chat and Voice.

Voice can answer intent questions.

Example:

Tutor asks verbally:

```text
"Are you mostly trying to understand logistic regression, or do you want to build it?"
```

The same options may appear in the Tutor Prompt Tray.

Learner may:
- click,
- type,
- answer by voice.

The learning journey state is channel-independent.

Do not create separate curricula for Voice vs Chat.

---

# 34. Resume behavior

If the learner leaves and returns:

Persist:
- LearningPath,
- current section,
- completed sections,
- path versions,
- relevant evidence,
- active journey state.

Do not persist transient Tutor Prompt Tray UI unnecessarily.

On resume:

```text
Tutor:
"You were in Decision Boundaries. Want to continue, do a quick recap, or revisit the sigmoid?"
```

This is a useful nudge.

---

# 35. Failure behavior

If Learning Path generation fails:

- do not silently fall back to random card generation,
- tell the learner the setup failed,
- retry safely,
- preserve intake/diagnostic answers.

If a Section Planner fails:

- path remains intact,
- current section remains current,
- no corrupted partial card sequence.

If evidence evaluation is unavailable:

- continue conservatively,
- avoid making strong learner-state claims,
- do not aggressively rewrite the path.

---

# 36. Initial V1 scope

V1 should implement:

1. broad learning-intent detection,
2. Tutor Prompt Tray modes for intake/diagnostic/path preview/check-in,
3. lightweight diagnostic,
4. Adaptive Learning Path generation,
5. Adaptive Contents Rail rendering,
6. learner acceptance/editing,
7. one-section-at-a-time materialization,
8. evidence-driven future path updates,
9. proactive Tutor probes/nudges,
10. resume state,
11. tests proving no full-course pre-generation.

Do not require in V1:
- perfect curriculum generation for every topic,
- complex drag-and-drop TOC editor,
- mastery scoring,
- global learner profiles,
- automated certification,
- fully autonomous long courses.

---

# 37. Acceptance tests

## AT-01 — blank canvas broad learning intent

Given:

```text
blank canvas
no repository
```

When:

```text
"I want to learn logistic regression."
```

Then:
- no teaching cards are immediately generated,
- Tutor Prompt Tray opens,
- learner intent intake begins.

## AT-02 — path before cards

After intake + diagnostic:
- a LearningPath exists,
- Contents Rail shows the path,
- no section cards exist yet.

## AT-03 — accept path

When learner accepts:
- only section 1 becomes active,
- only section 1 may generate permanent cards.

## AT-04 — no eager generation

An 8-section path:
- does not produce content/cards for sections 2–8.

## AT-05 — learner edits path

Learner says:

```text
"Make it more practical and add Python."
```

Then:
- path version changes,
- future sections update,
- no completed history is rewritten.

## AT-06 — diagnostic adapts starting point

Strong diagnostic:
- prerequisite section may be skipped/shortened.

Weak/uncertain evidence:
- prerequisite/refresher may be added.

## AT-07 — proactive probe

After a key concept:
- Tutor may show a useful probe in the Prompt Tray.

The probe must produce evidence or offer meaningful choice.

## AT-08 — no nagging

The Tutor does not show a check-in after every card.

## AT-09 — path adaptation

New evidence may alter only future sections.

Completed sections remain stable.

## AT-10 — Rabbit Hole return

After returning from `/dive`:
- Tutor can reconcile evidence,
- future path may adapt.

## AT-11 — Voice parity

Same learning journey works when user interacts by Voice.

## AT-12 — resume

Reload/reopen:
- path,
- current section,
- completion state survive.

## AT-13 — direct question stays direct

```text
"What is logistic regression?"
```

does not necessarily force learning-journey setup.

## AT-14 — explicit quick overview

```text
"Give me a 10-minute visual overview."
```

creates a short path with minimal intake.

## AT-15 — skip setup

```text
"Skip setup and start."
```

creates a minimal path and begins section 1 without random unstructured teaching.

---

# 38. Telemetry

Safe product events may include:

```text
learning_journey_started
learning_intake_answered
diagnostic_completed
learning_path_created
learning_path_accepted
learning_path_edited
learning_path_adapted
section_started
section_completed
tutor_probe_shown
tutor_probe_answered
journey_resumed
journey_completed
```

Do not put:
- raw learner answers,
- raw Tutor text,
- private code,
- transcripts

into ordinary analytics event properties.

Use safe IDs and categories.

---

# 39. Architecture relationship to existing Tutor v2

Existing Tutor architecture:

```text
Learner
→ LearnerTurn
→ Evaluator
→ Evidence Store
→ Tutor Planner
→ TutorAction
→ Canvas
```

Extend around it:

```text
                ┌───────────────────────────────┐
                │ Learning Journey Orchestrator │
                │                               │
                │ Intent Intake                 │
                │ Diagnostic                    │
                │ Learning Path Planner         │
                │ Section Planner               │
                └───────────────┬───────────────┘
                                │
                                ↓
Learner
→ LearnerTurn
→ Evaluator
→ Evidence Store
→ Tutor Planner
→ TutorAction
→ Canvas

                                ↑
                                │
                    future-path adaptation
```

Do not replace Tutor v2.

The learning-journey subsystem orchestrates **what should be taught next**.

Tutor v2 continues deciding **how to respond and act in the current turn**.

---

# 40. Product rule summary

The intended Rabbit Hole behavior is:

```text
Learner:
"I want to learn X."

NOT:
→ immediately dump teaching cards

YES:
→ understand what they mean
→ assess where they are
→ propose an adaptive path
→ let them shape it
→ teach section 1
→ observe what happens
→ probe when useful
→ adapt the future path
→ generate section 2 only when needed
```

Primary goal:

> **Rabbit Hole intelligently constructs a full adaptive learning path for the learner's goal and continuously reshapes that path as the learner demonstrates understanding, uncertainty, curiosity, and prerequisite gaps.**
