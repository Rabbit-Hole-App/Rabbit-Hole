# Curriculum Agent

Scope: decide **what to teach**. Lesson design decides **how to teach it**.
The user's correction supersedes the original shared curriculum/lesson prompt.
This feature runs in regular Small dev, within Learn's existing course setup.

## Standalone outline experiment (not connected to the app)

Owner review found that version 2 still prioritized operating the app over
understanding the underlying subject. The next experiment proposes modules,
lessons, and short topic bullets before detailed instructional planning. It
preserves conceptual scope when the requested duration conflicts with it and
asks the owner to choose depth. No domain topics are hardcoded in its prompt.
The designer works backward from the core method to necessary prerequisite
knowledge, then sequences those concepts forward. A familiar algorithm or
historical precursor belongs only when needed for the audience and goal. The
owner specifically corrected that logistic regression must not be mandatory.
This is prompt refinement; no model weights are trained or fine-tuned.

The next refinement addresses three observed failures with general rules:
introduce necessary concepts and parameter meaning before architectural detail;
distinguish a control's direct operation from its possible downstream effects;
and keep both positive and negative claims scoped to the supported artifact or
operation. The generator checks and corrects these issues before returning its
outline. The generator's self-check remains within its own call; the separate
evaluator described below supplies an additional review. Experiment
JSON now saves the system prompt alongside input, output, and model telemetry
so future comparisons can identify the actual instructions used.

Four authored input/output examples are included in the runtime system prompt,
from [`curriculum-outline-examples.js`](../../packages/control-plane/src/curriculum-outline-examples.js):
sensor smoothing for beginners (20 minutes), the same viewer for experienced
engineers (10 minutes), shortest-path planning with a depth/time conflict
(20 minutes), and qualitative document-search concepts for writers (30 minutes).
They illustrate how audience, goal, prerequisites, and time change scope. The
examples are synthetic and their timings are planning judgments, not measured
results. None is a required syllabus. No vision example supplies the answer to
the current app test. A focused test validates each example against the real
response contract. This API uses system instructions directly; it does not load
coding-agent skills at runtime.

- API: `POST /api/curriculum`, served locally by
  [`scripts/curriculum-api.mjs`](../../scripts/curriculum-api.mjs).
- Prompt and validation:
  [`curriculum-outline.js`](../../packages/control-plane/src/curriculum-outline.js).
- Reproducible caller:
  [`scripts/run-curriculum-experiment.mjs`](../../scripts/run-curriculum-experiment.mjs).
- Input: `brief` (audience, goal, knowledge, duration), optional `clarification`,
  `app` (name, evidence), optional `references` (url, notes). The API does not fetch
  URLs, inspect repositories, read a database, or save a course.
- Output: `curriculum` (title, modules/lessons/topics, prerequisites, scope notes,
  duration fit, owner questions), `workflow` (status and complete candidate/review
  history), and `generation` (per-call model/usage/time plus total elapsed time).

Run `node scripts/run-curriculum-experiment.mjs input.json output-base` with an
explicitly reviewed input file. It starts a loopback API, authenticates with an
ephemeral token, invokes Claude Code through the existing subscription, saves
the actual response as JSON and Markdown, then closes the API. Claude has no
tools, customizations, or saved session for this call. This is a local experiment
adapter, not a hosted subscription-backed service.

For a standalone listener, set `CURRICULUM_API_TOKEN` (at least 24 characters)
and run `node scripts/curriculum-api.mjs`. The printed address uses an available
local port; `CURRICULUM_API_PORT` optionally selects a port. Send the token as
Bearer authorization. Browser-origin requests are rejected. The server permits
one generation at a time and bounds payload size and model execution time.

Focused checks: `node --test packages/control-plane/test/curriculum-outline.test.js packages/control-plane/test/curriculum-workflow.test.js`.
These verify the API contract, access checks, duration-conflict representation,
failure recovery, concurrency, and exclusion of lesson-delivery payloads. They
do not establish educational quality. The app's existing curriculum pipeline
and saved curriculum remain unchanged until the owner reviews this experiment.

## Evaluator-optimizer plan and implementation

This extends only the standalone experiment. The app's saved-course route and
UI are not connected to this workflow.

1. [x] Add a distinct evaluator system prompt and explicitly loaded review skill.
2. [x] Validate the complete checklist, findings, resolutions, and verdict.
3. [x] Implement initial generation plus at most two revisions, stopping early
   for a ready candidate or a consequential owner-input requirement.
4. [x] Persist per-step experiment traces, both prompts, and final/partial history.
5. [x] Test acceptance, revision feedback, exhaustion, missing input, malformed
   reviews, provider failures, and preservation of original context.
6. [x] Run and inspect the real same-input YOLO experiment before app integration.

The first completed real run returned `ready` after one candidate and two role
calls, with three minor findings and remaining owner decisions. See the
[results and limitations](../testing/curriculum-evaluator-loop.md), including
the distinction between readiness for review and factual correctness.

Runtime pieces:

- [`curriculum-evaluator.js`](../../packages/control-plane/src/curriculum-evaluator.js)
  owns the evaluator prompt, seven criterion IDs, and review validation.
- [`curriculum-review.md`](../../packages/control-plane/prompts/curriculum-review.md)
  is the review skill, loaded by the local adapter into the evaluator's system
  prompt. It covers scope/dependencies, evidence/precision, and contrasting
  synthetic review examples, including legitimate passes and owner choices.
- [`curriculum-workflow.js`](../../packages/control-plane/src/curriculum-workflow.js)
  owns the hard three-candidate limit. A model cannot extend it.

Each generator and evaluator invocation starts a fresh subscription call. Both
receive the original brief, clarification, app evidence, and reference excerpts.
The evaluator gets the candidate, iteration number, and previous findings. It
does not receive the generator's system prompt, examples, or self-assessment.
Revisions receive the original input, prior candidate, and evaluator feedback.

Every review includes subject coverage, foundations, prerequisite ordering,
scope/depth, accuracy/evidence, time realism, and curriculum boundary. Failed or
unknown checks require linked blocking findings. A ready verdict requires all
checks pass and no blockers. Prior blocking findings cannot silently disappear:
they must remain active or be explicitly resolved. Optional minor findings and
honest owner decisions do not automatically force rejection. There is no
confidence threshold or numeric model score.

Final statuses are `ready`, `needs_input`, and `exhausted`. A completed workflow
returns HTTP 200 even when not ready; callers must inspect `workflow.status`.
Exhaustion never implies approval. `ready` means readiness for owner review, not
approval to generate lessons. Invalid reviews and provider failures return 502,
retain local trace/failure artifacts, and are never silently accepted or retried.

The runner saves `.request.json` before execution, `.trace.json` after each
event, `.failure.json` on failure, and `.json`/`.md` on completion. A single
candidate's model call is bounded to three minutes; the local HTTP caller allows
19 minutes for up to six such calls plus overhead. Model telemetry is recorded
per role and iteration, including any CLI auxiliary calls. Evaluation is a
separate call with the same model family; this reduces direct anchoring but
does not provide independent factual ground truth or prove educational value.

### Calibration follow-up

The [calibration study](../testing/curriculum-evaluator-calibration.md) freezes
ten synthetic cases before model calls and keeps expected judgments out of
model input. Four development defects and two held-out defects were blocked;
all four acceptable curricula passed. The baseline already passed its six
development cases, so this does not establish an accuracy gain from refinement.
The held-out cases share subject families with development and are not
independently annotated gold.

The review skill now distinguishes misleading factual claims from optional
clarity, avoids asking owners to reconfirm explicit goals, and limits findings
to supported objections. A seeded report curriculum exercised a real rejection
and generator repair: candidate two was accepted with the missing run goal
covered. The same-input YOLO rerun first failed the eight-lesson limit; one
explicit retry reached evaluation. The evaluator still classified a misleading
fixed-input-size claim as minor and returned ready. Manual review disagrees:
automatic readiness is not yet reliable enough for app integration.

Runners: [`calibrate-curriculum-evaluator.mjs`](../../scripts/calibrate-curriculum-evaluator.mjs)
and [`run-curriculum-repair.mjs`](../../scripts/run-curriculum-repair.mjs).
Cases and scoring live in [`tests/evals/curriculum/`](../../tests/evals/curriculum/).
The report links all raw reviews, matched findings, counts, the repaired course,
and both YOLO attempts. Add `packages/control-plane/test/curriculum-calibration.test.js`
to the focused test command above (19 tests total). No app or BYOC deployment
was performed for this study.

## Research and design decisions

Backward design starts with desired learning results, then evidence that those
results have been achieved. Instructional activities come afterward. We use the
first two steps to define the curriculum boundary; lesson delivery remains a
separate stage. [ASCD: The Fundamentals of Backward Planning](https://ascd.org/el/articles/the-fundamentals-of-backward-planning).

Course structure includes topic selection and content sequencing. This supports
making subjects and dependencies explicit rather than treating repository files
or interface screens as the syllabus. [Carnegie Mellon: Course Content & Schedule](https://www.cmu.edu/teaching/designteach/design/contentschedule.html).

Learning objectives should specify observable learner capabilities; assessment
should reveal those capabilities. We therefore ask for both a unit outcome and
evidence with success criteria. These are planning decisions, not a script for
presenting or teaching the material. [Carnegie Mellon: Learning Objectives](https://www.cmu.edu/teaching/designteach/design/learningobjectives.html),
[Alignment](https://www.cmu.edu/teaching/assessment/basics/alignment.html).

Our application of this guidance: the audience and desired outcome determine
which concepts are necessary. The app supplies verified application context,
constraints, and examples of where the knowledge is used. Its implementation
does not automatically determine the course structure.

## Agent responsibility

Runtime instructions and review rubric live in
[`curriculum-agent.js`](../../packages/control-plane/src/curriculum-agent.js).
This is a dedicated system prompt used by the application, not a `SKILL.md` for
the coding agent and not a new model provider or external service.

The agent:

1. Interprets audience, intended outcome, prior knowledge, and duration together.
2. Defines observable course outcomes and required knowledge/skills.
3. Selects essential topics and principles; excludes irrelevant material.
4. Names prerequisites and assumptions for owner confirmation.
5. Orders units by dependencies and states each unit's relevance.
6. Defines assessment evidence and success criteria for the objective.
7. Allocates time, including assessment, within the owner's budget.
8. Reviews and corrects the candidate before returning a draft to the owner.

The second model call reviews scope, outcome alignment, subject matter versus
delivery instructions, dependencies, assessment criteria, timing, grounding,
and assumptions. It returns a corrected curriculum, not a self-awarded score.
This is a model review, not independent educational validation.

Excluded from this agent: lesson openings, intuition-building sequences,
storytelling, analogies, worked-example presentation, slides, narration,
animations, or imitation of a named teacher. No domain-specific course is
hardcoded. Principles mean subject-matter relationships, not teaching rules.

## Output and UI

Version 2 course JSON contains title, total minutes, outcomes, entry prerequisites,
assumptions, excluded topics, and ordered units (stored under `lessons` for the
existing course container). Each unit contains title, objective, topics,
principles, required prior knowledge, sequence rationale, minutes, assessment
criteria, and supporting app evidence. It contains no `pages` field.

The existing Curriculum view displays those fields. Owner editing, reordering,
removal, saving, approval, and revision protections continue to apply. Supporting
app evidence is collapsed so the subject matter is prominent. The setup panel
is explicitly titled **Curriculum Agent**; lesson Q&A remains **Learn Agent**.

An ambiguous brief such as “Know the basics” produces explicit assumptions for
the owner to confirm; the agent does not claim these prerequisites were verified.
Free-text answers and editable brief fields allow specifying actual knowledge.

Validation rejects missing concepts/principles/assessment, page-based version-2
plans, invalid limits, and unit totals above the course budget. Recognized
minute/hour durations also bound that budget. Semantic relevance, prerequisite
coverage, and realistic workload require agent and owner review; JSON validation
cannot prove them.

## Existing outlines and lesson generation

No saved course is deleted or silently regenerated. An older outline shows
**Rebuild with Curriculum Agent**. Rebuilding retains the owner's brief but does
not feed the old page outline into the new planner. A successful rebuild replaces
the saved draft and clears approval/generated content, as any curriculum revision
does. Failure leaves the prior course intact. No database migration is required.

**Delete curriculum** is an explicit owner action with a Delete/Cancel dialog.
It clears the saved brief, curriculum, approval, source version, and generated
lesson. Unsaved curriculum edits and course-owned canvas shapes are cleared;
learner drawings, the scripted demo, app data, and Learn chat history remain.
Cancel makes no request and keeps unsaved edits. Failures keep the current course.
An empty record retains only its revision and update time, preventing a delayed
generation or stale browser tab from restoring content after deletion or restart.

Draft/review and lesson generation show an animated working indicator and elapsed
time. The progress bar is indeterminate, without a numeric percentage. A pending
request scrolls its indicator into view. It disappears on success or failure;
request errors still appear in the existing error area. Remaining time is not
known; the drafting copy says it can take a couple of minutes.

The previous lesson generator, its teaching prompt, and canvas are retained.
At its existing API boundary, approved unit topics are used as initial page-title
seeds; this is a compatibility adapter, not a page plan produced by Curriculum
Agent. A dedicated lesson-design stage is future work. This release neither
redesigns that stage nor generates lessons on the owner's behalf.

## Verification and next decision

- [x] Dedicated curriculum system prompt and separate review pass.
- [x] Versioned subject-matter schema and editable curriculum view.
- [x] Old outlines preserved; explicit owner-triggered rebuild.
- [x] Tests for contract separation, duration limits, persisted state, auth,
  stale responses, and unchanged lesson generation compatibility.
- [x] Browser checks of rebuild, subject fields, edit/save, budget errors,
  approval/reload, and existing Learn interactions.
- [ ] Owner review of the rebuilt real-app curriculum.

See [verification results](../testing/learn-curriculum-results.md) for the real
model checks, their limits, and release identifiers. The next step is judging
curriculum quality with the owner, before changing lesson presentation.
