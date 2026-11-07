# Tutor cleanup: retiring the old Tutor system

**Rabbit Hole cleanup plan** · Draft v0.1 · November 5, 2026 · read on `main` at `0918439271866790d21282c9aea0bc040c9bdf99`

This plan removes the old Tutor–learner system so that the rebuilt Tutor mode (`explain-on-canvas` v0.14) is built on one system, not two. Every statement about callers, routes, tables and flags was read from the code at the commit above; where something could not be settled from the repo it is marked **not determinable** or placed under [Decide](#5-owner-decisions-needed). It is a plan for review: nothing has been deleted.

Not to be confused with `docs/features/learn-cleanup.md` (the 2026-09 Learn cleanup C0–C11 on `feature/learn-cleanup`, with its `learn-cleanup` trigger word). That workflow is separate and untouched by this plan.

## Table of contents

0. [Summary](#0-summary)
1. [Decisions this plan rests on](#1-decisions-this-plan-rests-on)
2. [Keep: retained components](#2-keep-retained-components)
3. [Change: retained files that lose Tutor-era parts](#3-change-retained-files-that-lose-tutor-era-parts)
4. [Remove](#4-remove)
5. [Owner decisions needed](#5-owner-decisions-needed)
6. [Shared code to relocate before anything is deleted](#6-shared-code-to-relocate-before-anything-is-deleted)
7. [Database](#7-database)
8. [Configuration, flags, secrets, model tasks, usage and telemetry](#8-configuration-flags-secrets-model-tasks-usage-and-telemetry)
9. [Order of operations](#9-order-of-operations)
10. [Verification](#10-verification)
11. [Risks](#11-risks)
- [Appendix A. Complete removal list](#appendix-a-complete-removal-list)
- [Appendix B. Docs to mark retired](#appendix-b-docs-to-mark-retired)

## 0. Summary

- **What goes.** The browser-owned Tutor turn pipeline (intent regex, router, planner call, validation, trace, `sessionStorage` evidence), its server routes (`/api/learn/tutor/plan`, `/evaluate`), the planner prompts and tool, the journey system (intake, diagnostic, path, sections, planners, store, two tables), syllabus generation in Chat, the JEV shadow grade and the stateless visible grade, the nanoGPT claim registry, the dormant avatar Tutor, the Tutor decision telemetry and evaluation archive, the offline Tutor benches and corpora, and roughly 80 unit tests, 20 browser checks and 25 docs that exist only for them. About **130 source and test files** in all (Appendix A).
- **What stays.** The slash commands and their generation paths, skeleton cards, Quick Edit and Add to chat, the Auto / Ask / Tutor selector and the suggestions switch, the ToC and its conversation, Progress and its records (goals, criteria, activities, attempts, assessments, observations, Explain-back assets), the saved-attempt assessment (rubric, visual, Explain-back), Rabbit Holes, canvas references and the Markdown / PDF anchors, Professor Next Steps, the repository handoff and research answers, the `/explain` v2 job, voice notes for Explain-back, the Project learn-course, and `learn-grade-jev.js` (a shared utility, despite its name).
- **What must happen first.** Seven pieces of retained code import from files that will be deleted. They are moved or cut first ([6](#6-shared-code-to-relocate-before-anything-is-deleted)), so that no deletion step ever breaks the build. The largest is Professor Next Steps, which today reads the Tutor's claim states, journey sections and hole-entry logic.
- **Data.** Two tables are dropped (`learning_journeys`, `learning_path_versions`) with their rows, the shadow-grade table (`learn_grades`) with its rows, and the evaluation archive (three `tutor_eval_*` tables) with its rows. Everything Progress reads is kept. Production data deletion needs the owner's explicit GO ([7](#7-database)).
- **Owner decisions still open:** the supplied nanoGPT course, the voice Tutor, the dev-only coaching panel, the curriculum experiment scripts, and what Progress's "next activity" becomes before the rebuild ([5](#5-owner-decisions-needed)).

## 1. Decisions this plan rests on

All from the owner, in the Explain on canvas review rounds of November 5, 2026, unless dated otherwise.

1. **Cleanup first; one Tutor system.** Review the old Tutor, reuse what fits, retire the rest; no two Tutors side by side.
2. **Keep Auto, Ask and Tutor; rebuild Tutor mode.** Keep the selector; reuse the suggestions switch as Auto-suggest.
3. **Reuse:** slash commands and generation paths, `/api/learn/artifact`, cards and skeletons, the ToC and its conversation, Progress, practice assessment, nested Rabbit Holes, the codebase activities (not the five-goal entry flow), the capability router, repository handoff and research answers, the paid-command approval flows.
4. **Retire:** the old mode semantics, browser-owned Tutor planning, `sessionStorage` as the evidence store, the nanoGPT-specific claim registry, mandatory journey intake and diagnostics, syllabus generation in Chat, duplicate grading (no shadow grade), the automatic Socratic loop, the "next Chat message answers a graded question" assumption, the forced return message after leaving a hole, the Tutor-dispatched dive suggestion, the mandatory five-goal codebase entry.
5. **Check callers first** for `learn-milestones.js`, `coaching/*`, `curriculum-*` and the journey tables.
6. **Legacy journeys:** once callers are removed, retire and delete the journeys, path versions and journey-only evidence; no export or migration. Scope deletion to the retired journey system.
7. **Preserve** learner-created canvases, cards, deliberate personal goals, and the assessment records retained features still use.
8. **Standing rules** (`CLAUDE.md`): never guess identifiers or state; every `main` push and every production D1 migration needs the owner's explicit approval; no browser automation by Claude; `ponytail:` marks deliberate skips; removing retired areas is a dependency-checked task, never a side effect.

## 2. Keep: retained components

These are untouched by the cleanup, or touched only to remove an import ([3](#3-change-retained-files-that-lose-tutor-era-parts)).

| Area | Files (web = `packages/web/src`, cp = `packages/control-plane/src`) | Why it stays |
| --- | --- | --- |
| Slash commands and generation | web `agent/slash.js`, `learn-slash.js`, `LearnSlash.jsx`, `SlashCommandPreview.jsx`, `SlashCommandsSheet.jsx`, `slash-sheet.js`, `slash-practice-service.js`, `slash-examples/`; cp `learn-artifact*.js`, `learn-primitives.js`, the `/api/learn/artifact` route | The formats a step can propose. |
| `/explain` v2 job | cp `explain-job.js`, `explain-*.js`, `agents/explain-*.js`, `ExplainJobs` DO | A generation path, not the Tutor. (`cp/test/explain-tutor.test.js` tests the Tutor's `create_material` entry into the job and goes with the Tutor, [10](#10-verification).) |
| Skeleton cards, Quick Edit, Add to chat | web `canvas-skeleton*`, `InlineAiEditor.jsx`, `SelectionActions.jsx`, `canvas-menus.js`, `shortcuts.js` | The proposal's and the card's action rail. |
| Chat modes and threads | web `ModeSelector.jsx`, `chat-threads.js`, `chat-workspace.jsx`, `chat-persist.js`, `ChatPane.jsx`, `AskPanel` in `ask.jsx`; cp `chat-modes.js` (minus syllabus), `chat-message-routes.js`, `canvas-conversation.js`, `chat-answer-meta.js`, `chat-capability-route.js` | Kept; mode semantics change in the rebuild. |
| Tutor controls | web `use-learn-coaching.jsx` (`TutorSwitch`), `learn-coaching-client.js`, `learn-coaching-contract.js`, `learn-coaching-entry.js`; cp `learn-coaching-routes.js`, `learn-coaching-store.js` | The switch becomes Auto-suggest; goals, activities and criteria are Progress's records. |
| ToC | web `TableOfContents.jsx`, `TocConversation.jsx`, `learn-outline-model.js`; cp `learn-outline-tool.js` | Displays the roadmap; its conversation revises the plan. |
| Progress | web `LearnProgress.jsx`, `learn-progress-client.js`, `learn-progress-question.js`, `GoalManager.jsx`, `learn-goals.js`; cp `learn-progress.js`, `learn-progress-context.js` | Reported and demonstrated evidence on the current canvas. |
| Saved-attempt assessment | cp `learn-attempt-routes.js`, `learn-attempt-store.js`, `learn-attempt-assets.js`, `learn-assessment.js` (minus the journey routes), `learn-rubric-assessment.js`, `learn-visual-assessment.js`, `learn-explain-assessment.js`, `learn-explain-evidence.js`, `learn-codebase-source-map.js` | One recorded assessment per submission. |
| Explain-back | web `ExplainBackPanel.jsx`, `explain-back-*.js`, `VoiceNote.jsx`; cp `learn-explain-*.js`, transcription | The `/practice` explain-back path and its assessor. |
| Rabbit Holes | web `Dive.jsx` (minus the Tutor dispatch), `dive.js`; cp `dives.js`, `canvas_dives` | Opened on the learner's explicit choice. |
| Source anchors | web `pdf-anchor.js`, `pdf-excerpt.js`, `file-doc-highlights.js`, `learn-wiki-highlights.js`, `CanvasRefChips.jsx`; cp `canvas-refs.js`, `learn_canvas_refs` | The anchors the two-way source link will use. |
| Codebase activities and citations | web `TutorCodebase.jsx`, `TutorCitations.jsx`, `tutor-citations.js`, `learn-codebase-goals.js` (minus the entry flow); cp `learn-codebase-source-map.js` | Tracing, predicting and explaining tasks for Project canvases. |
| Repository handoff and research | cp `learn-tutor-handoff.js` (re-mounted, [6](#6-shared-code-to-relocate-before-anything-is-deleted)), `learn-research.js`, `repository-context.js`, `learn-shared-ask.js` | Chat's repository-grounded answers. |
| Professor Next Steps | web `learn-next-steps.js`, `LearnNextSteps.jsx`, `learn-opening.js`; cp `agents/learn-next-steps.js`, `learn-next-steps-routes.js`, `next_steps_telemetry` (0012) | A retained canvas feature (CONTEXT.md "Next steps"); decoupled in [6](#6-shared-code-to-relocate-before-anything-is-deleted). |
| JEV utility | cp `learn-grade-jev.js` | `sha256Hex` is imported by 15 modules and `askJev` by the inline route, the capability router, `webpage-screen.js` and `learn-inline.js`. Only the shadow-grade routes, store and report go. |
| Project learn-course | cp `learn-course.js`, `curriculum-agent.js`, `repositories.js` (`/api/apps/repo-*/learn-course`); web `LearnCourse.jsx`, `LearnOutline.jsx`; the `lesson-renderer` Fly app | A Project feature, not the Tutor. |
| Models, spend, usage | cp `learn-models.js` (minus retired tasks), `learn-spend*.js`, `learn-usage*.js` | Shared accounting. |
| Telemetry framework | cp `telemetry-contract.js`, `telemetry-delivery.js`, `telemetry-projection.js`, `telemetry-learning-*.js`, `owner-telemetry-routes.js`, `telemetry-events/{client,stars,support,weekly}.js` | Only the `tutor` event module and route go. |

## 3. Change: retained files that lose Tutor-era parts

Each row is one edit in the cleanup; the rebuild adds the new behavior later.

| File | What is removed or changed | Why |
| --- | --- | --- |
| web `LearnPage.jsx` | The `useTutor` wiring (`LearnTutor.jsx`), `useJourney` / `journeyDiveContext` / `inJourneySetup` (`LearnJourney.jsx`), `pathEntries`, `registeredCourse` and the `suppliedCourse` branches (pending [5.1](#5-owner-decisions-needed)), `nanoLesson` / `NanoLessonReading` (already rendered under `{false && …}` at line 2566), `LessonPlanPreview`, the visible grade and shadow grade (`gradeAnswer`, `parseVerdict`, `recordBaseline`, `shadowGrade` from `learn-grade.js`), `explainMaterial` from `learn-coaching-materials.js` | The browser Tutor, journeys, the nanoGPT lesson and the duplicate graders. The Challenge/Practice card keeps its answer UI; its grading moves to the saved-attempt assessment in the rebuild. |
| web `ask.jsx` | `TutorPromptTray`, `journeyStartsHere` (`LearnJourney.jsx`); the Tutor path in `send` (`tutor.ask`), the `canvas_seed` Tutor branch; keep `TutorCoaching`, `openGuided`, `TutorActivity` pending [5.5](#5-owner-decisions-needed) | Every Learn turn posts to `/api/learn/ask` until the rebuild adds the roadmap. |
| web `chat-route.js` | `tutorTurn` always false; `askMode` no longer rewrites `tutor` to `auto`; the TOC `mode: 'tutor'` syllabus meaning goes | No Tutor path to route to; no syllabus. |
| web `chat-threads.js`, `ModeSelector.jsx` | Default mode stays Auto; the Auto menu line "Answers, or starts a syllabus when you ask for a course" and the Tutor line are rewritten to the v0.14 meanings | The syllabus is gone; Tutor mode is being rebuilt. |
| web `learn-coaching-contract.js` | `PROACTIVE_ACTIONS` (`hook`, `opening_turn`, `hole_opening_turn`, `unrequested_question`, `suggest_practice`, `unrequested_material`, `next_step_offer`, `assess_unsubmitted`) and `mayRun` shrink to what Next Steps and the switch still need | The actions belonged to the Tutor turn. |
| web `use-learn-coaching.jsx` | `TutorSwitch` label and copy become **Auto-suggest**; the `resolveTutorEntry` / `guidedOpening` entry flow (hole opening turn, checkpoints) goes | Decision 2 and 4. |
| web `Dive.jsx` | `DiveSuggestion` loses its Tutor dispatch (`suggest_dive`); the component stays for the learner's explicit choice; `markGuidedEntry` goes with the guided entry | Decision 4. |
| web `learn-outline-model.js`, `TableOfContents.jsx`, `LearnPage.jsx` (lines 79, 1384-1390, 2604) | `outlinePlan`, `planRevisionOf`, the plan props (`plan`, `planRevision`, `evidence`, `onResume` Start/Resume) and the per-heading evidence badges (`evidenceOf`) that are derived from the learner's journey and path; keep `outlineTree`, `linkedHeadings`, `proposalProblem`, the outline ops and the Apply/Discard proposal flow | The ToC's "plan" today *is* the journey path (its own comment: "the plan stays the learner's own journey path"). The rebuild replaces it with the roadmap display. Headings the journey materializer stamped (`journey_section_id`, `journey_id` on saved boards) stay as inert fields; no board rewrite. |
| web `learn-slash.js` | The Tutor material eligibility helpers used only by `create_material` (`materialCommands` stays for `TutorActivity`) | Called by the deleted planner. |
| web `demo-scenes.js` | `TUTOR_BOARD` / `tutorSliceBlocks` review board (from `learn-tutor-claims.js`) | Review tooling for the retired slice. |
| web `TutorActivity.jsx` | `drawingContent` from `learn-tutor-image.js` is inlined or moved | `learn-tutor-image.js` is deleted. |
| web `learn-codebase-goals.js` | The five fixed goals and the entry flow (`CODEBASE_GOALS`, `CODEBASE_PROMPT`, `goalOf`); keep `CODEBASE_RUBRIC`, `REPOSITORY_SOURCE`, `isRepositorySource`, `repositoryRelevance`, `snapshotIndex`, `linesText`, `isCitation`, `citationLabel` | Decision 3 and 4 (keep activities, retire the entry). |
| web `SharePage.jsx` | `CoachingPanel` import (dev-only) | Pending [5.3](#5-owner-decisions-needed). |
| cp `chat-modes.js` | `courseIntent`, `TUTOR_SYSTEM`, `TUTOR_OUTLINE_SYSTEM`, `MAYBE_SYSTEM`, `syllabusPath`, `validateSyllabus` and the `syllabus` branch of `recordAnswer`; the import of `JOURNEY_LIMITS` / `validatePath` from web `learn-journey.js`; `resolveMode` becomes: a command, Ask or a progress ref → `ask`; everything else → `auto` | Syllabus generation in Chat is retired. `chat_message_meta.mode` keeps its column; old `syllabus` metas stay readable as data. |
| cp `index.js` (`apiAsk`) | The `resolved.mode === 'tutor'` branch (outline tool only, syllabus trailer) and the `propose_lesson_outline`-only tool set | Same. |
| cp `learn-assessment.js` | The `jev` route (`evaluateFreeText`, `journeySpec`, `probeEvaluation`, `appendJourneyEvidence`, `loadJourneyById`, `feedJourney`) and the `choice` route keyed on `journey_probe`; keep `rubric`, `visual` and Explain-back; `TUTOR_PROTOCOL_VERSION` moves ([6](#6-shared-code-to-relocate-before-anything-is-deleted)) | Journey-only. **Note for the rebuild:** multiple-choice keyed assessment today exists only for journey probes; the rebuild must supply the `/quiz` card's own answer key. |
| cp `learn-attempt-store.js`, `learn-coaching-store.js` | The `LEFT JOIN learning_journeys` reads (`journey_archived_at`), `goalForJourneySql` / `parkJourneySql` / `unparkJourneySql`, the backfill that points a new coaching row at a live journey's goal | The table is dropped. A goal's `journey_id` column stays but is always null for new rows. |
| cp `learn-models.js` | The `tutor`, `tutor_evaluator`, `avatar_director`, `avatar_script_reviewer`, `journey_resolver`, `journey_diagnostic`, `journey_path`, `journey_section`, `journey_adapt` tasks; keep `tutor_rubric`, `tutor_visual` (the saved-attempt assessors), `tutor_next_steps*`, `grading` pending [3: LearnPage]; keep the `sha256Hex` import | No caller after the deletions. |
| cp `learn-usage.js` | `FEATURES` entries `tutor`, `tutor_evaluate`, `journey`, `grade`, `assess`; the `/api/learn/tutor/evaluate`, `/api/learn/assess`, `/api/learn/grade` route patterns; keep `/api/learn/tutor/attempts` → an attempts feature name (today it maps to `tutor_evaluate`) | The routes are gone; attempts need their own name. |
| cp `learn-research.js` | The `arxiv: false` note for the Tutor handoff stays valid; no code change expected | Comment only. |
| `packages/web/dev-worker.js` | The mounts for `/api/telemetry/tutor`, `/api/learn/assess`, `/api/learn/tutor-eval/`, `/api/learn/tutor/` (planner), `/api/learn/journey`, `/api/learn/grade`; re-mount the handoff and keep `/api/learn/tutor/attempts` ([6](#6-shared-code-to-relocate-before-anything-is-deleted)) | The deleted routes. `app-worker.js` imports `dev-worker.js`, so production follows. |
| `scripts/ci/check-map.json` | Every entry naming a deleted source or check (listed in [4.6](#46-browser-checks-benches-and-corpora)); the `broad` globs for `coaching/**`, `learn-milestones.js`, `SyllabusMessage.jsx`, `lesson-*.js`, `nanogpt-*.js`, `nanogpt/**` as those go | A stale map selects nothing and reports green. |
| `run.sh` | The `tests/evals/tutor-session/*.test.mjs` suite line; the `tests/evals/learn-grade/*.test.mjs` line | The suites are deleted. |
| `CONTEXT.md`, `CLAUDE.md` | Add the v0.14 terms; remove the `learn-cleanup` trigger word only if the owner closes that workflow (it is unrelated) | Vocabulary. |

## 4. Remove

Every file here was checked for non-test importers at the pinned commit. "No callers" means no `import` outside its own tests and the files deleted with it. Paths are relative to `packages/web/src` (web) and `packages/control-plane/src` (cp) unless given in full.

### 4.1 The browser Tutor pipeline (web)

| File | Role | Callers outside this group |
| --- | --- | --- |
| `learn-tutor.js` (869 lines) | `runTurn`: intent regex, router, planner call, execute | `learn-next-steps.js` (`enterHole`, `markOpened`, `openingQuestion`, `sameCanvas`) → cut in [6.1](#61-professor-next-steps) |
| `LearnTutor.jsx` | `useTutor`, the Tutor's page wiring | `LearnPage.jsx` → [3](#3-change-retained-files-that-lose-tutor-era-parts) |
| `learn-tutor-actions.js` | Action helpers | none |
| `learn-tutor-select.js` | Claim selection | none |
| `learn-tutor-validate.js` | Four-stage plan validation | none |
| `learn-tutor-trace.js`, `tutor-telemetry.js` | `tutor.decision` events, hooks events, `safely` | `learn-next-steps.js`, `LearnNextSteps.jsx` (`safely`, `emitDecision`, `hooksEvent`, `shownEvent`, `tracing`, `inputSummary`), cp `learn-next-steps-routes.js` → [6.1](#61-professor-next-steps) |
| `learn-tutor-evidence.js` | The `sessionStorage` evidence store, claim states | `learn-next-steps.js`, `LearnNextSteps.jsx`, cp `agents/learn-next-steps.js`, cp `learn-next-steps-routes.js`, `learn-journey.js` → [6.1](#61-professor-next-steps) |
| `learn-tutor-claims.js` | The nanoGPT claim registry, `TUTOR_BOARD`, slice board | `demo-scenes.js`, `learn-next-steps.js`, cp `learn-avatar-cache.js` → [3](#3-change-retained-files-that-lose-tutor-era-parts), [6.1](#61-professor-next-steps), [4.5](#45-the-avatar-tutor) |
| `learn-tutor-domains.js` | `TUTOR_DOMAINS`, `registeredCourse`, `tutorContext` | `LearnPage.jsx` (`registeredCourse`), `learn-next-steps.js`, cp `learn-next-steps-routes.js` → [5.1](#5-owner-decisions-needed), [6.1](#61-professor-next-steps) |
| `learn-tutor-image.js` | `drawingContent` for image context | `TutorActivity.jsx` → inline it ([3](#3-change-retained-files-that-lose-tutor-era-parts)) |
| `learn-grade.js`, `learn-grade-shadow.js`, `learn-grade-prompts.js` | The visible grade call and the JEV shadow grade | `LearnPage.jsx` → [3](#3-change-retained-files-that-lose-tutor-era-parts) |
| `learn-milestones.js` | Imported only by its own test (checked: 0 importers) | none |
| `coaching/` (`CoachingPanel.jsx`, `CaptureStep.jsx`, `Inspector.jsx`, `SourcePreview.jsx`, `coaching.css`, `sample-data.js`) | Dev-only sample inspector behind `VITE_COACHING_DEV`, stripped from production builds | `SharePage.jsx` → [5.3](#5-owner-decisions-needed) |

Unit tests deleted with them (web): `learn-tutor.test.mjs`, `learn-tutor-auto`, `-avatar`, `-context`, `-critical`, `-domain`, `-domains`, `-gates`, `-gating`, `-handoff`, `-image`, `-image-context`, `-next-step`, `-page-context`, `-questions`, `-reconcile`, `-rescore`, `-select`, `-skeleton`, `-stream`, `-submit`, `-trace`, `-validate` (23 files), `tutor-telemetry.test.mjs`, `learn-grade-shadow.test.mjs`, `learn-milestones.test.mjs`.

### 4.2 The server Tutor (cp)

| File | Role | Callers outside this group |
| --- | --- | --- |
| `learn-tutor-routes.js` | `POST /api/learn/tutor/plan`, `/evaluate`, the planner tiers, `readPlannerStream`, `spendCallModel` | `learn-assessment.js`, `learn-rubric-assessment.js` (`spendCallModel`, `evaluateFreeText`, `journeySpec`, `probeEvaluation`) → [6.2](#62-spendcallmodel) |
| `agents/learn-tutor.js` (605 lines) | The planner prompts (`PLANNER_SYSTEM`, `CANVAS_SYSTEM`, `JOURNEY_SYSTEM`, `NEXT_STEP_SYSTEM`, `EXPLICIT_MODE`, `HANDOFF_SYSTEM`, `NEXT_SECTION_SYSTEM`), the `tutor_response` tool, the evaluator protocol | `agents/learn-chat.js` (`REQUEST_FIRST`), `agents/learn-next-steps.js` (`LEARNING_GOAL_MAX`, `STATE_RULES`, `learningGoalProblem`, `tagged`), `learn-assessment.js` (`TUTOR_PROTOCOL_VERSION`), `learn-tutor-handoff.js` (`HANDOFF_REQUEST_MAX`), `learn-avatar-brief.js` → [6.3](#63-constants-exported-from-agentslearn-tutorjs) |
| `agents/learn-tutor-escalation.js` | JEV → Opus escalation policy | `learn-tutor-routes.js`, `learn-assessment.js` (jev route) only |
| `telemetry-events/tutor.js`, `telemetry-tutor-route.js` | `tutor.decision` event contract and `POST /api/telemetry/tutor` | `telemetry-events/index.js` → remove the entry |
| `tutor-eval-archive.js`, `tutor-eval-routes.js` | Owner-only import of the offline session simulator (`/api/learn/tutor-eval/`) | none |

Tests deleted with them (cp `test/`): `learn-tutor.test.js`, `learn-tutor-auto`, `-escalation`, `-handoff-action`, `-image-context`, `-journey`, `-next-step`, `-no-persistence`, `-speed`, `-stream`, `telemetry-tutor-route.test.js`, `tutor-eval-archive.test.js`, `tutor-eval-routes.test.js`, `explain-tutor.test.js` (the Tutor's `create_material` entry into the `/explain` job). (`learn-tutor-handoff.test.js` stays with the handoff, re-pointed at its new mount.)

### 4.3 Journeys (web and cp)

| File | Role | Callers outside this group |
| --- | --- | --- |
| web `learn-journey.js` (442), `learn-journey-domain.js`, `learn-journey-materialize.js`, `LearnJourney.jsx` (462) | Intake, diagnostic, path review, sections, the journey Tutor domain, `TutorPromptTray` | `LearnPage.jsx`, `ask.jsx`, `learn-next-steps.js` (`nextSectionOf`, `sectionCompletion`), cp `chat-modes.js` (`validatePath`, `JOURNEY_LIMITS`) → [3](#3-change-retained-files-that-lose-tutor-era-parts), [6.1](#61-professor-next-steps) |
| cp `learn-journey.js` (344), `learn-journey-store.js`, `learn-journey-planners.js`, `learn-journey-fixtures.js`, `learner-intent-journey.js`, `agents/learn-journey.js` (417) | `/api/learn/journey` routes, the store, the five planners, fixtures | `learn-next-steps-routes.js` (`planNextSteps`), `learn-assessment.js`, `learn-coaching-store.js`, `learn-attempt-store.js`, `learn-tutor-routes.js` → [6.1](#61-professor-next-steps), [6.4](#64-journey-reads-in-the-coaching-and-attempt-stores) |
| web `SyllabusMessage.jsx`, `syllabus-outline.js`; cp `chat-syllabus-route.js` | The syllabus message, "Use as table of contents", `PUT /api/learn/chat/messages/:id/syllabus` | `ChatMessages.jsx`, `dev-worker.js` → remove the render branch and the mount. Saved `chat_message_meta.syllabus` JSON stays as data; an old message without the component renders as its text. |

Tests deleted with them: web `learn-journey.test.mjs`, `learn-journey-anti-hardcoding`, `-materialize`, `-ui` (1,731 lines), `syllabus-message.test.mjs`, `syllabus-outline.test.mjs`, `learn-outline-progress.test.mjs` (the journey-derived outline plan, [10](#10-verification)); cp `learn-journey-anti-hardcoding.test.js`, `-planners`, `-prompts`, `-route`, `-store`, `learner-intent-journey.test.js`; `packages/web/e2e/journey-local-stack.md`.

### 4.4 Duplicate grading (cp)

| File | Role | Callers outside this group |
| --- | --- | --- |
| `learn-grade-routes.js` | `/api/learn/assess` (the visible grade) and `/api/learn/grade*` (the JEV shadow grade and report) | `dev-worker.js` only |
| `learn-grade-store.js`, `learn-grade-report.js`, `agents/learn-grade.js` | `learn_grades` writes, the agreement report, the challenge prompt | `learn-grade-routes.js` only |

**Kept:** `learn-grade-jev.js` (see [2](#2-keep-retained-components)). Tests deleted: cp `learn-grade-routes.test.js`, `learn-grade-store`, `learn-grade-report`, `learn-grade-fixture.js`, `learn-assess.test.js`, `learn-assess-sketch.test.js` (the deleted `/assess` route with a sketch, [10](#10-verification)); `tests/evals/learn-grade/` (the 72-case benchmark and its results); the `run.sh` suite line. `learn-grade-jev.test.js` and `learn-grade-jev-transport.test.js` stay.

### 4.5 The avatar Tutor

`learn-avatar-cache.js` has **0 non-test importers**; `learn-avatar-brief.js` and `learn-avatar-provider.js` are imported only by it. The avatar actions (`suggest_avatar_clip`, `AVATAR_MOMENTS`, `avatarSlotId`) live in `agents/learn-tutor.js`. Remove all three cp files, the two `avatar_*` model tasks, `tests/evals/avatar-director.mjs`, `tests/evals/heygen-prototype.mjs`, cp `test/learn-avatar.test.js`, web `learn-tutor-avatar.test.mjs`, and `docs/features/rabbit-hole-avatar-teacher-v1-spec.md` (marked retired). The voice Tutor is a separate decision ([5.2](#5-owner-decisions-needed)).

### 4.6 Browser checks, benches and corpora

Delete (`packages/web/e2e/`): `tutor-loop-check.mjs`, `tutor-entry-check.mjs`, `tutor-slice-check.mjs`, `tutor-image-context-check.mjs`, `tutor-telemetry-check.mjs`, `journey-check.mjs`, `journey-switch-check.mjs`, `journey-corpus.mjs`, `journey-corpus-run.mjs`, `tutor-corpus.mjs`, `tutor-corpus-run.mjs`, `tutor-live-rungs.mjs`, `tutor-bench.mjs`, `tutor-bench-driver.mjs`, `tutor-bench-gates.mjs`, `tutor-bench-report.mjs`, `tutor-bench-rescore.mjs`, `tutor-bench-rescore-report.mjs`, `grade-shadow-check.mjs`, `coaching.preview.js`, and `tests/evals/tutor-session/` (the session simulator the archive imported; `run.sh` runs its tests).

Rewrite, because they import deleted modules but test retained behavior: `next-steps-check.mjs` (imports `LearnTutor.jsx`, `learn-tutor-claims`, `-domains`, `-evidence`, `learn-journey-domain`), `practice-card-check.mjs` (`learn-tutor-claims`, `-evidence`), `canvas-skeleton-check.mjs` (`learn-tutor-claims`), `toc-tutor-check.mjs` (asserts the syllabus flow), `tutor-controls-check.mjs` (the switch, now Auto-suggest), `tutor-codebase-check.mjs` (the five-goal entry), `tutor-progress-check.mjs` (Progress's next activity). Keep as they are: `goal-command-check.mjs`, `progress-chat-check.mjs`, `dive-check.mjs`, the Explain-back checks, `chat-workspace-shell-check.mjs`. `voice-check.mjs`, `voice-tts-stream-check.mjs`, `nanogpt-*-check.mjs`, `lesson-progress.test.mjs` follow [5.1](#5-owner-decisions-needed) and [5.2](#5-owner-decisions-needed).

The `check-map.json` entries for every deleted or rewritten check are updated in the same commit; `fast-e2e` selects by that map.

### 4.7 Scripts, evals and prompts

| Path | Role | Decision |
| --- | --- | --- |
| `tests/evals/coaching/` (Python bench, corpus, retrieval) | The 2026-09 coaching benchmark | Remove with `docs/features/coaching-benchmark.md`, `coaching-retrieval-benchmark.md`; check `pyproject.toml` for dependencies only it used |
| `tests/evals/tutor-session/` | Session simulator | Remove ([4.6](#46-browser-checks-benches-and-corpora)) |
| `tests/evals/learn-grade/` | Grader benchmark | Remove ([4.4](#44-duplicate-grading-cp)) |
| `tests/evals/curriculum/`, `scripts/curriculum-api.mjs`, `run-curriculum-experiment.mjs`, `run-curriculum-repair.mjs`, `calibrate-curriculum-evaluator.mjs`, cp `curriculum-outline.js`, `curriculum-outline-examples.js`, `curriculum-evaluator.js`, `curriculum-workflow.js`, cp `test/curriculum-*.test.js`, `packages/control-plane/prompts/curriculum-review.md` | Curriculum experiments; **script-only** (no app caller; `curriculum-agent.js` is the one the live learn-course uses and stays) | [5.4](#5-owner-decisions-needed) |
| `scripts/generate-lesson-audio.mjs`, web `nanogpt-audio.json`, `packages/web/public/audio/**`, `learn-audio.js` | nanoGPT lesson narration | [5.1](#5-owner-decisions-needed) |
| `docs/features/adaptive-learning-path-v1-evidence/`, `tutor-v2-benchmark-20261001/`, `tutor-v2-rescore-20261001/` | Evidence corpora | Keep as history or delete with their docs (Appendix B) |

## 5. Owner decisions needed

1. **The supplied nanoGPT course.** `learn-tutor-domains.js` registers `karpathy/nanoGPT` as the one supplied course; `LearnPage.jsx` gates 14 `suppliedCourse` branches on it (the lesson, its audio, `LessonPlanPreview`, the depth-ladder review boards); the 2 MB `nanogpt/` directory holds the course boards and fixtures; `NanoLessonReading` is already dead code. The claim registry goes regardless. Options: **(a)** retire the supplied course with the registry (delete `nanogpt/`, `nanogpt-lesson.js`, `lesson-progress.js`, `NanoLessonReading.jsx`, `LessonPlanPreview.jsx`, the audio, `docs/courses/nanogpt/`, the `nanogpt-*` checks); **(b)** keep the course as content and move `registeredCourse` into a small `learn-supplied-course.js`. Recommended: **(a)**; it exists to demonstrate the retired Tutor, and the rebuilt flow explains any source.
2. **The voice Tutor.** `LearnVoice.jsx`, `VoiceMode.jsx`, `voice-session.js`, `voice-stt.js`, `voice-tts.js`, `voice-telemetry.js`; cp `learn-voice-routes.js`, `learn-voice-scribe.js`, `learn-voice-tts.js`, `voice-availability.js`. Live Voice Mode is paused (FX-71, `wrangler.rabbit-hole-prod.jsonc:103`) and exists to speak Tutor turns (the planner's streaming path is voice-only). `VoiceNote.jsx` (Explain-back voice notes, OpenAI transcription) is separate and stays. Options: **(a)** remove the voice Tutor now and bring voice back on the rebuilt Tutor later; **(b)** keep the modules dormant and only cut their `useTutor` binding in `LearnPage.jsx`. Recommended: **(a)**, since nothing can drive them once the pipeline is gone and dormant code is maintained code.
3. **`coaching/*`.** Dev-only, behind `VITE_COACHING_DEV`, stripped from production, imported only by `SharePage.jsx`. Recommended: remove.
4. **The curriculum experiment scripts** ([4.7](#47-scripts-evals-and-prompts)). Script-only; not Tutor code. Recommended: remove unless the owner still runs them; otherwise leave them out of this cleanup.
5. **Progress's "next activity" before the rebuild.** `TutorActivity.jsx` and `learn-coaching-materials.js` (`chooseNextActivity`, `applyTutorAction`) render an activity in Chat and in Progress from goal criteria. They survive the cleanup (no deleted import after [3](#3-change-retained-files-that-lose-tutor-era-parts)), but their behavior is the old Tutor's. Options: **(a)** leave them in place until the rebuild replaces them; **(b)** hide the activity surfaces now. Recommended: **(a)**, to keep Progress usable for codebase goals in the personal beta.
6. **The evaluation archive data** (`tutor_eval_*`, three tables): delete with the routes, or export first. Recommended: delete; it holds simulator runs, not learner data.

## 6. Shared code to relocate before anything is deleted

These are the steps that make every later deletion safe. Each is one small commit with the touched package's unit tests.

### 6.1 Professor Next Steps

Next Steps is retained but reads the old Tutor's state. Today `learn-next-steps.js` takes: claim states (`deriveClaimStates`, `claimsOfConceptIn`, `holeConcept`) from the evidence store and registry; journey sections (`nextSectionOf`, `sectionCompletion`); hole entry (`enterHole`, `markOpened`, `openingQuestion`, `sameCanvas`) from `learn-tutor.js`; `safely` from the trace; `TUTOR_DOMAINS`. `LearnNextSteps.jsx` emits Tutor decision events and reads the store. cp `agents/learn-next-steps.js` takes `STATES`, `claimCoverage` from the web evidence module and `LEARNING_GOAL_MAX`, `STATE_RULES`, `learningGoalProblem`, `tagged` from the planner prompts; `learn-next-steps-routes.js` takes `planNextSteps` from the journey planners, `TUTOR_DOMAINS`, `STATES`, `inputSummary`.

Change, in this order:
1. Move `planNextSteps`, `journeyCallModel`'s logging wrapper and the `PlannerInvalid` class into a new cp `learn-next-steps-planner.js` (or into `agents/learn-next-steps.js`), with their test cases from `learn-journey-planners.test.js`.
2. Move `tagged`, `STATE_RULES`, `LEARNING_GOAL_MAX`, `learningGoalProblem`, `goalWords`, `repeatsLearnerWords` into `agents/learn-next-steps.js` (they are prompt-section helpers the hook planner owns).
3. Move `safely` and the small `inputSummary` into `learn-next-steps.js` itself; drop `emitDecision` / `hooksEvent` / `shownEvent` / `tracing` with the Tutor telemetry (the hook telemetry row in `next_steps_telemetry` is written by the route and stays).
4. Cut the claim-state, journey-section and hole-opening inputs: the planner input keeps canvas content, title, the hole record and its parent goal; `claims`, `states`, `prerequisites`, `journey.next` and `completion` become absent (the planner already handles the plain-canvas case, `goalOf` `source === 'canvas'`). The hole opening turn (`holeOpening`, `learn-opening.js` `openOnce`) is retired with the forced opening (decision 4); `learn-opening.js` keeps `takeGuidedEntry` only if `use-learn-coaching.jsx` still needs it after [3](#3-change-retained-files-that-lose-tutor-era-parts), else it goes too.
5. Replace `TUTOR_DOMAINS` / `viewerStates` with a canvas-only domain (`source: 'canvas'`); delete `learn-tutor-domains.js` afterwards.
6. Rewrite `next-steps-check.mjs` and the cp `learn-next-steps*.test.js` for the reduced input.

The rebuild later feeds Next Steps from the roadmap and thumbs; that is outside this cleanup.

### 6.2 `spendCallModel`

Exported from `learn-tutor-routes.js`, imported by `learn-assessment.js` and `learn-rubric-assessment.js`. Move it to `learn-spend.js` (it wraps `spendTransport`), re-point the two imports, then delete the routes.

### 6.3 Constants exported from `agents/learn-tutor.js`

| Export | Used by | Move to |
| --- | --- | --- |
| `REQUEST_FIRST` | `agents/learn-chat.js` | `agents/learn-chat.js` |
| `LEARNING_GOAL_MAX`, `STATE_RULES`, `learningGoalProblem`, `tagged`, `goalWords`, `repeatsLearnerWords` | `agents/learn-next-steps.js` | `agents/learn-next-steps.js` ([6.1](#61-professor-next-steps)) |
| `TUTOR_PROTOCOL_VERSION` | `learn-assessment.js` (provenance of the jev route) | Goes with the jev route; if the rubric provenance still records it, keep the string in `learn-assessment.js` |
| `HANDOFF_REQUEST_MAX`, `HANDOFF_CAPABILITY_NAMES`, `handoffProblem` | `learn-tutor-handoff.js` | `learn-tutor-handoff.js` |
| `AVATAR_*`, `avatarSlotId`, `PERSONALIZABLE_MOMENTS` | `learn-avatar-brief.js` | Deleted with the avatar ([4.5](#45-the-avatar-tutor)) |

### 6.4 Journey reads in the coaching and attempt stores

`learn-coaching-store.js` joins `learning_journeys` to derive a goal's archived status and backfills a new coaching row with the live journey's goal; `learn-attempt-store.js` joins it for `journey_archived_at` and refuses attempts on a journey-archived goal; `learn-assessment.js` `feedJourney` appends evidence to the journey. Remove the joins and the backfill (a goal's lifecycle is then its own `lifecycle` column), delete `feedJourney`, and re-run `learn-coaching-store.test.js`, `learn-attempt-store.test.js`, `learn-assessment.test.js`. Only then can migration [7.2](#72-migrations) drop the table.

### 6.5 The repository handoff mount

`POST /api/learn/tutor/handoff` is served inside `tutorRoute`. Give it its own mount in `dev-worker.js` at the same path (so saved clients and the e2e check keep working), or at `/api/learn/chat/handoff` with the check updated; `learn-tutor-handoff.js` keeps its name until the rebuild renames it. `learn-tutor-handoff.test.js` stays.

### 6.6 The attempts mount order

`/api/learn/tutor/attempts` is matched **after** `/api/learn/tutor/` in `dev-worker.js` (lines 314 and 316); it works today only because `tutorRoute` returns nothing for unknown paths. When `tutorRoute` goes, the attempts mount stays at its path with nothing in front of it. No client change.

### 6.7 Smaller moves

`registeredCourse` ([5.1](#5-owner-decisions-needed)); `drawingContent` into `TutorActivity.jsx`; `materialCommands` stays in `learn-slash.js`; `TUTOR_BOARD` out of `demo-scenes.js`; `cardBlock` / `partIndex` imports from `nanogpt/` disappear with `learn-tutor.js`.

## 7. Database

All on `LEARN_DB` (dev: the shared dev D1; production: `rabbit-hole-learn-prod` per `packages/web/wrangler.rabbit-hole-prod.jsonc:61`). Whether migrations 0006, 0017, 0025, 0026, 0034 and the `learn_grades` DDL are applied in production is **not determinable from the repo** (each header says production waits for an owner GO): read the remote state (`wrangler d1 migrations list`, or the owner's receipts) before writing any production command.

### 7.1 Tables

| Table (migration) | Decision | Why |
| --- | --- | --- |
| `learning_journeys`, `learning_path_versions` (0006) | **Drop, with rows** | Decision 6. Readers after [6.4](#64-journey-reads-in-the-coaching-and-attempt-stores): none. |
| `learn_grades` (`repository-schema.sql:37`, on the control plane's DB, pruned after 90 days) | **Drop, with rows** | The shadow grade is retired; only `learn-grade-store.js` reads it. |
| `tutor_eval_executions`, `tutor_eval_artifacts`, `tutor_eval_artifact_chunks` (0017) | **Drop, with rows** (pending [5.6](#5-owner-decisions-needed)) | Only `tutor-eval-archive.js` reads them. |
| `learn_coaching_state`, `learn_goals`, `learn_goal_criteria`, `learn_activities` (0025) | **Keep** | Progress, the switch, deliberate goals. `learn_goals.journey_id` stays as a column, null from now on; the `lg_eb_*` Explain-back goals stay. |
| `learn_attempts`, `learn_assessments`, `learn_observations` (0026) | **Keep** | Decision 7: assessment records retained features use. Rows whose `route` is `jev` or `keyed` (journey probes) are history and stay. |
| `learn_attempt_assets`, `learn_attempt_transcripts`, `learn_explain_drafts` (0034) | **Keep** | Explain-back. |
| `chat_message_meta` (0019) | **Keep** | Chat; `mode = 'tutor'` and `kind = 'syllabus'` rows stay as data. |
| `next_steps_telemetry` (0012) | **Keep** | Next Steps. |
| `canvas_dives` (0001) | **Keep** | Rabbit Holes. |
| `learn_moments` (`migrations/0027`) | **Keep** | Unrelated (video moments). |

### 7.2 Migrations

Three additive, re-runnable migrations in `packages/control-plane/learn-migrations/`, numbered after the current last (`0035`), each applied to dev first and to production only on the owner's explicit GO:

- `0036-drop-learning-journeys.sql`: `DROP TABLE IF EXISTS learning_path_versions; DROP TABLE IF EXISTS learning_journeys;` — after [6.4](#64-journey-reads-in-the-coaching-and-attempt-stores) is on `main`.
- `0037-drop-tutor-eval-archive.sql`: the three `tutor_eval_*` tables — after [4.2](#42-the-server-tutor-cp).
- `learn_grades`: the DDL lives in `repository-schema.sql` (the control plane's own schema, not `learn-migrations`); remove the `CREATE TABLE` and indexes there and add one drop statement in the control plane's `migrations/`, following whatever that directory's convention is (read it first; do not assume `learn-migrations`).

Order matters: code that stops reading a table ships before the migration that drops it; a migration never ships in the same deploy as the last reader's removal unless the gate runs them in that order.

### 7.3 Data scope

Only the rows of the dropped tables are deleted. No `DELETE` runs against the kept tables. In particular `learn_goals` rows with a non-null `journey_id` (goals that were created from a journey) are kept: they are the learner's goals with criteria the learner accepted, and Progress still reads them.

## 8. Configuration, flags, secrets, model tasks, usage and telemetry

| Item | Where | Change |
| --- | --- | --- |
| `TUTOR_PLANNER_*`, `TUTOR_AVATAR`, `TUTOR_HANDOFF_*` | read in `learn-tutor-routes.js`, `learn-tutor-handoff.js`; none set in prod | Planner and avatar ones disappear with the code; `TUTOR_HANDOFF_*` (rate limits) stay with the handoff |
| `TUTOR_CODEBASE_ASSESSMENT_ENABLED` (`"true"`), `TUTOR_RUBRIC_ASSESSMENT_ENABLED`, `TUTOR_VISUAL_ASSESSMENT_ENABLED` (unset), `TUTOR_EXPLAIN_BACK_ENABLED` (`"true"`) | `wrangler.rabbit-hole-prod.jsonc:157-160`, `learn-assessment.js` | Keep; they gate retained assessors |
| `TYPESAFE_API_KEY` | secret, required (`:190`) | **Keep**: `askJev` is used by the inline route, the capability router, `webpage-screen.js` and `learn-inline.js`, not only by grading |
| `OPENAI_API_KEY`, `TRANSCRIBE_ENABLED` | Explain-back voice notes | Keep |
| `EXPLAIN_V2_ENABLED` | `/explain` v2 | Keep |
| `JOURNEY_MODEL_STUB`, `SMALL_ENV === 'test'` fixture paths | `learn-journey-planners.js`, `learn-journey-fixtures.js` | Go with the planners; check `packages/web/e2e/keyless-guard.mjs` and `dev-cp.mjs`, which the check-map ties to the journey checks |
| `VITE_RABBIT_HOLE` (`learnPreview`), `VITE_COACHING_DEV` (`reviewTools`), `VITE_EXPLAIN_BACK` | `flags.js`, `scripts/prod-release.mjs` | Keep `learnPreview` and `VITE_EXPLAIN_BACK`; `VITE_COACHING_DEV` keeps gating review tools even after `coaching/*` goes (rename later, not now) |
| Model tasks | `learn-models.js` | Remove `tutor`, `tutor_evaluator`, `avatar_director`, `avatar_script_reviewer`, `journey_resolver`, `journey_diagnostic`, `journey_path`, `journey_section`, `journey_adapt`; `grading` goes when `LearnPage.jsx` stops calling `/api/learn/assess` |
| Usage features | `learn-usage.js` `FEATURES`, `FREE_FEATURES`, route patterns | Remove `tutor`, `tutor_evaluate`, `journey`, `grade`, `assess`; name the attempts route's feature; `usage_operations` rows with the old names stay as history |
| Telemetry events | `telemetry-events/index.js` | Remove `tutor`; `telemetry-contract.js` keeps its generic validation |
| PostHog | web `learn-tutor.js` `rh_tutor_used` | Goes with the file; no dashboard change is in the repo |
| npm dependencies | `packages/*/package.json` | **None** are Tutor-specific (checked: cp has `@cloudflare/puppeteer`, `jose`; the web list has no Tutor-only package). JEV is a `fetch` client. |
| Python dependencies | `pyproject.toml` | Check for packages used only by `tests/evals/coaching/` before removing that bench |

## 9. Order of operations

Each phase is one PR to `main` (or one MVP-labelled candidate if the owner labels the cleanup MVP), based on current `main`, with the checks in [10](#10-verification). A later phase never starts on a branch that lacks the earlier one.

| Phase | Work | Unlocks |
| --- | --- | --- |
| **P0 Decisions** | Owner answers [5](#5-owner-decisions-needed); `CONTEXT.md` gets the v0.14 terms | Everything |
| **P1 Relocate** | [6.1](#61-professor-next-steps)–[6.7](#67-smaller-moves): Next Steps decoupled, `spendCallModel` moved, planner constants moved, journey joins removed from the stores, handoff re-mounted | All deletions |
| **P2 Browser Tutor off** | `LearnPage.jsx`, `ask.jsx`, `chat-route.js`, `use-learn-coaching.jsx`, `Dive.jsx`, `learn-coaching-contract.js`, `ModeSelector.jsx` edits ([3](#3-change-retained-files-that-lose-tutor-era-parts)); delete [4.1](#41-the-browser-tutor-pipeline-web) and its tests; rewrite the checks in [4.6](#46-browser-checks-benches-and-corpora); update `check-map.json` | P3 |
| **P3 Server Tutor off** | Delete [4.2](#42-the-server-tutor-cp), [4.5](#45-the-avatar-tutor); remove the mounts; `learn-models.js`, `learn-usage.js`, `telemetry-events/index.js` edits | P4 |
| **P4 Journeys and syllabus off** | Delete [4.3](#43-journeys-web-and-cp); `chat-modes.js`, `index.js` edits; remove the `/api/learn/journey` and syllabus mounts; `learn-assessment.js` loses its jev and keyed routes | P6 migration 0036 |
| **P5 Duplicate grading off** | Delete [4.4](#44-duplicate-grading-cp); remove the `/assess` and `/grade` mounts; `run.sh` line | P6 `learn_grades` drop |
| **P6 Data** | Migrations [7.2](#72-migrations): dev first; production on the owner's GO, one command each, prepared only when ready to run | — |
| **P7 Docs and scripts** | Appendix B; [4.7](#47-scripts-evals-and-prompts); `CLAUDE.md` map if a listed area changed | — |

P2–P5 can be prepared in parallel lanes on top of P1, but merge in order so that `main` always builds and every deleted route has already lost its callers.

## 10. Verification

What counts, per `CLAUDE.md` "Verification and evidence":

- **Per phase (deterministic).** `npm run test:unit` in `packages/web`; `node --test` in `packages/control-plane`; `npm run build` in `packages/web` when web code changed; `make test-unit` at the root for the release candidate. A removed test is listed in the hand-back as removed, never as passing.
- **No dangling imports.** After each deletion phase, `grep -rn "from './<deleted basename>" packages scripts` returns nothing, and the web build completes (Vite fails on a missing module).
- **No dangling routes.** `grep -rn "/api/learn/tutor/plan\|/api/learn/tutor/evaluate\|/api/learn/journey\|/api/learn/assess\|/api/learn/grade\|/api/telemetry/tutor\|/api/learn/tutor-eval" packages/web/src packages/web/e2e packages/control-plane/src` returns only the attempts and handoff mounts.
- **Browser checks** run only in the approved CI (`fast-e2e`, the release gate); confirm that the rewritten checks were *selected and executed*, not merely that the run was green. Claude does not run them.
- **Representative flow** before calling a phase release-ready: a signed-in canvas with a dropped Markdown source, Chat in Auto and Ask, a `/quiz` and an Explain-back submission, the Progress tab, a Rabbit Hole opened and left, a shared canvas with Next Steps. Tested by the owner in the browser.
- **Three tests whose names are broader than their subject**, read during this review: `cp/test/explain-tutor.test.js` asserts that the Tutor's `create_material { command: explain }` reaches the `/explain` job with `source: 'tutor'` (delete with the Tutor; the job's `source` field stays); `cp/test/learn-assess-sketch.test.js` tests `POST /api/learn/assess` with a sketch, the deleted visible grade, not the retained visual assessor (`learn-visual-assessment.test.js` covers that; delete); web `learn-outline-progress.test.mjs` asserts the journey-derived `outlinePlan` and badges (delete with that code, [3](#3-change-retained-files-that-lose-tutor-era-parts)).
- **Data.** Before 0036 in production: row counts of `learning_journeys` and `learning_path_versions` recorded in the receipt, with the owner's GO quoted.

## 11. Risks

1. **Next Steps regresses silently.** It is the one retained feature that loses inputs. Its hook planner must still produce hooks on a plain canvas and a shared canvas; `next-steps-check.mjs` is the evidence, and it must be rewritten, not deleted.
2. **Progress loses its "next activity" source.** `chooseNextActivity` reads goal criteria, not journeys, so it survives; but a goal created from a journey keeps criteria with `journey_probe` source refs that the keyed assessor can no longer grade. Those activities should degrade to "not assessable" (the `no_answer_key` path already exists), not crash. Covered by `learn-assessment.test.js` after [6.4](#64-journey-reads-in-the-coaching-and-attempt-stores).
3. **The green gate that selected nothing.** Deleting checks without updating `check-map.json` makes `fast-e2e` report green with zero relevant checks. Update the map in the same commit, and read the run's selection list.
4. **Old chat messages.** Messages saved with `kind: 'syllabus'` render as plain text once `SyllabusMessage.jsx` is gone; the owner's own threads may contain some. Acceptable in personal beta; noted so it is not mistaken for a bug.
5. **Production migration state is unknown.** If 0006 was never applied in production, 0036 is a no-op there (`IF EXISTS`); if 0025/0026 were never applied, Progress has never worked in production and nothing in this plan changes that. Read the remote state first.
6. **Two Tutors during P2–P4.** Between P2 (browser Tutor off) and the rebuild, Tutor mode is Ask-like with a renamed switch. That is intended: the owner chose cleanup first, and the selector stays for the rebuild to fill.

## Appendix A. Complete removal list

Grouped for the PR author; every path checked to exist at the pinned commit. Items under a decision number are conditional on [5](#5-owner-decisions-needed).

```
# web (packages/web/src)
learn-tutor.js  LearnTutor.jsx  learn-tutor-actions.js  learn-tutor-select.js  learn-tutor-validate.js
learn-tutor-trace.js  tutor-telemetry.js  learn-tutor-evidence.js  learn-tutor-claims.js  learn-tutor-domains.js
learn-tutor-image.js  learn-grade.js  learn-grade-shadow.js  learn-grade-prompts.js  learn-milestones.js
learn-journey.js  learn-journey-domain.js  learn-journey-materialize.js  LearnJourney.jsx
SyllabusMessage.jsx  syllabus-outline.js
coaching/CaptureStep.jsx  coaching/CoachingPanel.jsx  coaching/Inspector.jsx  coaching/SourcePreview.jsx  coaching/coaching.css  coaching/sample-data.js   # 5.3
# web tests
learn-tutor.test.mjs  learn-tutor-auto.test.mjs  learn-tutor-avatar.test.mjs  learn-tutor-context.test.mjs  learn-tutor-critical.test.mjs
learn-tutor-domain.test.mjs  learn-tutor-domains.test.mjs  learn-tutor-gates.test.mjs  learn-tutor-gating.test.mjs  learn-tutor-handoff.test.mjs
learn-tutor-image.test.mjs  learn-tutor-image-context.test.mjs  learn-tutor-next-step.test.mjs  learn-tutor-page-context.test.mjs
learn-tutor-questions.test.mjs  learn-tutor-reconcile.test.mjs  learn-tutor-rescore.test.mjs  learn-tutor-select.test.mjs
learn-tutor-skeleton.test.mjs  learn-tutor-stream.test.mjs  learn-tutor-submit.test.mjs  learn-tutor-trace.test.mjs  learn-tutor-validate.test.mjs
tutor-telemetry.test.mjs  learn-grade-shadow.test.mjs  learn-milestones.test.mjs
learn-journey.test.mjs  learn-journey-anti-hardcoding.test.mjs  learn-journey-materialize.test.mjs  learn-journey-ui.test.mjs
syllabus-message.test.mjs  syllabus-outline.test.mjs  learn-outline-progress.test.mjs
# web, decision 5.1 (supplied nanoGPT course)
nanogpt/  nanogpt-lesson.js  lesson-progress.js  NanoLessonReading.jsx  LessonPlanPreview.jsx  lesson-plan-preview.test.mjs
nanogpt-audio.json  learn-audio.js  ../public/audio/
# web, decision 5.2 (voice Tutor)
LearnVoice.jsx  VoiceMode.jsx  voice-session.js  voice-session.test.mjs  voice-stt.js  voice-stt.test.mjs  voice-tts.js  voice-tts.test.mjs
voice-telemetry.js  voice-ui.test.mjs

# control plane (packages/control-plane/src)
learn-tutor-routes.js  agents/learn-tutor.js  agents/learn-tutor-escalation.js
telemetry-events/tutor.js  telemetry-tutor-route.js  tutor-eval-archive.js  tutor-eval-routes.js
learn-journey.js  learn-journey-store.js  learn-journey-planners.js  learn-journey-fixtures.js  learner-intent-journey.js  agents/learn-journey.js
chat-syllabus-route.js
learn-grade-routes.js  learn-grade-store.js  learn-grade-report.js  agents/learn-grade.js
learn-avatar-brief.js  learn-avatar-cache.js  learn-avatar-provider.js
# control plane, decision 5.2
learn-voice-routes.js  learn-voice-scribe.js  learn-voice-tts.js  voice-availability.js
# control plane, decision 5.4
curriculum-outline.js  curriculum-outline-examples.js  curriculum-evaluator.js  curriculum-workflow.js  ../prompts/curriculum-review.md
# control plane tests (packages/control-plane/test)
learn-tutor.test.js  learn-tutor-auto.test.js  learn-tutor-escalation.test.js  learn-tutor-handoff-action.test.js  learn-tutor-image-context.test.js
learn-tutor-journey.test.js  learn-tutor-next-step.test.js  learn-tutor-no-persistence.test.js  learn-tutor-speed.test.js  learn-tutor-stream.test.js
telemetry-tutor-route.test.js  tutor-eval-archive.test.js  tutor-eval-routes.test.js  explain-tutor.test.js
learn-journey-anti-hardcoding.test.js  learn-journey-planners.test.js  learn-journey-prompts.test.js  learn-journey-route.test.js  learn-journey-store.test.js
learner-intent-journey.test.js
learn-grade-routes.test.js  learn-grade-store.test.js  learn-grade-report.test.js  learn-grade-fixture.js  learn-assess.test.js
learn-assess-sketch.test.js
learn-avatar.test.js
learn-voice.test.js  learn-voice-scribe.test.js  learn-voice-tts.test.js   # 5.2
curriculum-calibration.test.js  curriculum-outline.test.js  curriculum-workflow.test.js   # 5.4

# browser checks (packages/web/e2e)
tutor-loop-check.mjs  tutor-entry-check.mjs  tutor-slice-check.mjs  tutor-image-context-check.mjs  tutor-telemetry-check.mjs
journey-check.mjs  journey-switch-check.mjs  journey-corpus.mjs  journey-corpus-run.mjs  journey-local-stack.md
tutor-corpus.mjs  tutor-corpus-run.mjs  tutor-live-rungs.mjs
tutor-bench.mjs  tutor-bench-driver.mjs  tutor-bench-gates.mjs  tutor-bench-report.mjs  tutor-bench-rescore.mjs  tutor-bench-rescore-report.mjs
grade-shadow-check.mjs  coaching.preview.js
nanogpt-audio-check.mjs  nanogpt-board-check.mjs  nanogpt-canvas-shots.mjs  lesson-progress.test.mjs   # 5.1
voice-check.mjs  voice-tts-stream-check.mjs   # 5.2

# evals and scripts
tests/evals/tutor-session/  tests/evals/learn-grade/  tests/evals/coaching/  tests/evals/avatar-director.mjs  tests/evals/heygen-prototype.mjs
tests/evals/curriculum/  scripts/curriculum-api.mjs  scripts/run-curriculum-experiment.mjs  scripts/run-curriculum-repair.mjs  scripts/calibrate-curriculum-evaluator.mjs   # 5.4
scripts/generate-lesson-audio.mjs  docs/courses/nanogpt/   # 5.1
```

Rewritten, not deleted (`packages/web/e2e`): `next-steps-check.mjs`, `practice-card-check.mjs`, `canvas-skeleton-check.mjs`, `toc-tutor-check.mjs`, `tutor-controls-check.mjs`, `tutor-codebase-check.mjs`, `tutor-progress-check.mjs`; cp `learn-next-steps*.test.js`, `learn-tutor-handoff.test.js`, `learn-assessment.test.js`, `learn-coaching-store.test.js`, `learn-attempt-store.test.js`, `chat-modes.test.js`.

## Appendix B. Docs to mark retired

Per `CLAUDE.md`, shipped-versus-retired status lives in each feature's spec. Add a one-line retired header pointing at `explain-on-canvas` v0.14 and this plan; delete only the evidence corpora the owner does not want as history. In `docs/features/`: `adaptive-tutor-v1.md`, `adaptive-learning-path-v1-architecture.md`, `adaptive-learning-path-v1-anti-hardcoding-audit.md`, `adaptive-learning-path-v1-evidence/`, `rabbit-hole-adaptive-learning-path-v1.md`, `rabbit-hole-adaptive-demo.md`, `tutor-architecture-v2.md`, `tutor-architecture-brainstorm-agenda.md`, `tutor-v1-locked-decisions.md`, `tutor-v1-implementation-map.md`, `tutor-golden-traces-nanogpt.md`, `tutor-decision-eval.md`, `tutor-eval-archive.md`, `tutor-v2-benchmark-20261001/`, `tutor-v2-rescore-20261001/`, `production-tutor-entry.md`, `voice-tutor-mvp.md`, `rabbit-hole-avatar-teacher-v1-spec.md`, `coaching-benchmark.md`, `coaching-retrieval-benchmark.md`, `learn-lesson-plans.md`, `curriculum-agent.md` (only its experiment sections; the agent stays). Keep and update: `coaching.md` (`CLAUDE.md` requires it current before any Coaching change; it describes the goals, switch and Progress that stay), `professor-next-steps.md` (document the reduced input), `explain-back*`, `dive-v1.md`, `canvas-skeleton-cards.md`, `rabbit-hole-commands.md`.
