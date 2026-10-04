# Adaptive Learning Path V1: LP0 audit and architecture

Status: **LP0. Architecture proposal awaiting owner approval. Nothing is implemented.**

- Spec, the source of truth: [rabbit-hole-adaptive-learning-path-v1.md](rabbit-hole-adaptive-learning-path-v1.md).
  This branch carries a verbatim copy, because the original is untracked in the `small-parallel` worktree.
- Branch `feature/adaptive-learning-path-v1`, worktree `workspace/adaptive-learning-path-v1`, cut from
  `origin/main` 74d20468.
- Owner: Learning Path / Curriculum agent. Parallel integrates. Not deployed, not merged.

Out of scope for this agent: `/motion`, the HeyGen Avatar Teacher, Shared Canvas, skeleton cards, the CLI,
infrastructure and deployments, and canonical main integration.

---

## 1. Current behaviour in code (audit, 2026-10-04, main 74d20468)

### 1.1 Broad learning intent today

| Entry | What happens | Code |
|---|---|---|
| Home: "I want to learn logistic regression" | The `LEARN_INTENT` regex returns `mode: 'teach'`. `teach()` creates an empty canvas titled with the raw sentence. `learnAction` is a no-op while `learnHandoff = false`, so the learner's words are dropped and the learner lands on an empty canvas. | `agent/router.js:52,137`, `agent/AgentBar.jsx:291-305`, `agent/learn-hook.js:46-58`, `flags.js:18`, `start.js:25` |
| Same phrase in a generic canvas composer | `AskPanel.send` posts to `/api/learn/ask`, the general Learn chat. The answer appears in the chat sheet. The agent may auto-insert Wikipedia, video or paper cards. If a card is selected, a chat card is placed. | `ask.jsx:546` onward, `LearnPage.jsx:230-267,819-824` |
| Same phrase on the NanoGPT Tutor canvas | `learnerIntent` classifies it as `explanation`. With no card selected, the route is `off_slice` (`respond_text` only). With a card selected, it is sent to evaluation as if it were an answer attempt. | `learn-tutor.js:155,184-191,209-216` |

No code does intake, diagnosis or path planning, and nothing stores the intent. `docs/features/home-ask.md:37`
claims the canvas "keeps the whole question as the learning intent", but it does not.

### 1.2 Tutor v2 (merged on main)

- **Orchestration** runs in the browser, in `runTurn` (`learn-tutor.js:277-409`). The browser makes two worker
  calls: `/api/learn/tutor/evaluate` and `/api/learn/tutor/plan`. Both routes live in
  `learn-tutor-routes.js`, which is mounted in `packages/web/dev-worker.js:214`. The production `app-worker`
  wraps it.
- **The LearnerTurn** is a plain object built by `buildTurn` (`learn-tutor.js:88-118`). There is no Learner
  Intent Resolver module. `learner_intent.kind` is one of `slash | opening | returned | answer | request |
  question | explanation`.
- **The Evaluator** runs deterministic practice, then JEV, then the Opus 5.5 larger evaluator when the
  escalation policy calls for it. `/evaluate` takes the claims in the request body (at most 6 claims, 4 gaps,
  4 ideas per claim and 5 misconceptions; `learn-tutor-routes.js:23-37`), so the endpoint itself is
  registry-agnostic.
- **The Evidence Store** is `learn-tutor-evidence.js`. Its states are exactly `understood | uncertain |
  misconception | prerequisite_gap | not_yet_observed`. `reconcile()` is the only place where evaluator output
  becomes events, and `deriveClaimStates` recomputes every state from all events. The store lives in
  `sessionStorage` under `small.tutor:<org>:<email>`: per user and per tab, not per canvas. Nothing about it is
  stored on the server.
- **Hard-wired to the nanoGPT Attention slice:**
  - static `CONCEPTS`, `CLAIMS` and `SLICE_CARDS` (`learn-tutor-claims.js`);
  - `deriveClaimStates` iterates `Object.keys(CLAIMS)` (`learn-tutor-evidence.js:103`);
  - `PLANNER_SYSTEM` says "a Rabbit Hole learning canvas about nanoGPT attention" (`agents/learn-tutor.js:172`);
  - the validator rejects any card that is not in `SLICE_CARDS`;
  - the Tutor is active only on the supplied `karpathy/nanoGPT` course, its slice board and the holes under
    them (`LearnTutor.jsx:16-20`, `LearnPage.jsx:64,534`).
- **Questions:** the only learner-facing question is the `ask_question` action. It is free text with a claim
  and a `purpose` (`diagnose | predict | explain_back | transfer`), and has no options. The limits are one
  question per turn, at most 3 actions, and no question at all under `no_quiz` or `just_answer`. While
  `store.open` is set, the next message is read as an answer.
- **No plan, path or section concept.** The planner context has no outline, course or section field. The
  Teaching State key list is pinned by `learn-tutor-context.test.mjs:21`.

### 1.3 Surfaces

- **Above the composer.** AskPanel's `composerBox` (`ask.jsx:894-952`) stacks, from top to bottom: the chat
  sheet, the mention list, chips, the target pill, then the `LearnSlash` slot. That slot renders the blue
  `data-slash-result` notice box (tones `busy | question | done | info | error`, with an optional embedded
  `PaidConfirm`) and the command picker. No existing component combines a question, option buttons and a
  free-text answer on the canvas. The nearest is `CourseInterview` (`LearnCourse.jsx:62-120`): choice buttons
  plus a `ChatComposer`, but inline, in the right panel, and for owner courses only.
- **Contents rail.** `ContentsRail({ entries, onOpen })` (`ContentsRail.jsx:9-43`):
  - An entry is `{ n, label, available, active }`, fed only from canvas heading blocks (`outlineFrom`).
  - It has no done, current, optional or review states.
  - It opens on hover only, is hidden below `lg`, and is hidden while the right panel is open.
  - The right panel holds a richer table of contents with done, reorder, rename and add
    (`LearnPage.jsx:1301-1387`).
- **Sections** are heading blocks (`type:'heading'`, `level`, `text`, `done`) in the flat block column.
  - Card insertion goes through the `canvasApi` commands `insertBlock`, `updateBlock`, `insertHeading` and so on
    (`AdaptiveCanvas.jsx:1355-1525`).
  - `insertBlock` inserts at the current view, not at the end.
  - `applyOutline` does not return the ids it mints.
- **Canvas persistence.**
  - Blocks are kept in `localStorage`, plus `learn_boards.state_json` on LEARN_DB, but only while the board is
    shared.
  - The AdaptiveCanvas save rebuilds state from a fixed set of keys, so any unknown top-level key is dropped.
  - The `canvases` table has no metadata column.

### 1.4 Existing course and curriculum structures

- **`learn_courses`, curriculum v2** (`curriculum-agent.js:23-70`, `learn-course.js`):
  - Each unit is `{title, objective, topics, principles, requires, rationale, minutes, assessment, evidence}`.
    That is nearly one-to-one with a path section.
  - However, the course is owner-authored and stored per app (primary key `app_id`).
  - Its revision is a counter, not a history.
  - Generation is hard-wired to `lessons[0]`.
  - Any revision clears the generated `lesson`.
- **The outline experiment** (`curriculum-outline.js`, evaluator, workflow) is a standalone tool and is not
  wired into the app.
- **Lesson material plans** (`learn-lesson-plans.md`) describe a plan → approve → build flow, one lesson at a
  time. It is not built.
- **The NanoGPT course** is fully authored and seeded eagerly from static arrays. It contains no runtime
  generation.
- **Migrations:**
  - LEARN_DB: `learn-migrations/0001-0003`, applied by hand with `wrangler d1 execute` and mirrored in
    `repository-schema.sql`.
  - The `DB` migrations reach `0027`.
  - No table exists for learner progress, evidence or paths.

### 1.5 `/dive` and Voice

- **`/dive`:**
  - `canvas_dives` links a child canvas to its parent through a free-form `dive_json` capped at 16 000
    characters.
  - On return, `small.dive.return` restores the parent viewport.
  - Only the Tutor reacts to a return, through `returned_from` on its next turn. Nothing is reconciled on
    generic canvases.
  - Latent bug: `Dive.jsx:193` calls `setLocalHoles`, which is defined nowhere.
- **Voice:**
  - `useVoiceSession` returns null unless the Tutor is active (`LearnVoice.jsx:20,29,76`), so there is no voice
    on generic canvases.
  - Voice turns go through `tutor.voiceTurn` → `runTurn`, the same pipeline as chat.
  - Nothing can answer structured options by voice.

### 1.6 Shared Learner Intent Resolver (coordination)

`docs/features/adaptive-tutor-v1.md:502-664` specifies the Resolver as future work. The Motion agent's branch
(`feature/motion-v1-harness` 7c2e1153, not merged) adds `packages/control-plane/src/learner-intent.js`:
`resolveLearnerTurn`, which is deterministic and returns `{raw_user_message, command,
structured_interpretation{request_text, target, requested_duration, requested_mode}, current_location,
selection, canvas_target, repository_context}`.

This branch will **not** create a second resolver file. The journey classifier is a pure function. When both
branches are on main, the Resolver adds `structured_interpretation.journey = journeyIntent(request_text)`; that
is a one-line integration for Parallel.

### 1.7 Doc drift found (reported, not fixed here)

- `tutor-architecture-v2.md`:
  - The header ("Not merged", "every knob off by default") is out of date. Caching and the Sonnet tier are on
    by default.
  - The G and I sections are superseded by D4.
  - The voice conflicts section is already resolved on main.
- `home-ask.md:37`: says the learning intent is kept. It is not.
- `learn-chat-sheet.md:12`: mentions History and New chat. The code has only Clear and Collapse.
- `production-tutor-entry.md:3` and `voice-tutor-mvp.md:3`: their status lines predate the merges.

---

## 2. Conflicts between the spec and the implementation

| # | Spec assumption | Reality | Proposal |
|---|---|---|---|
| C1 | Tutor v2 decides how to respond on any learning canvas, including the blank-canvas case. | Tutor v2 runs only on the NanoGPT slice. A blank canvas is answered by the Learn chat (`/api/learn/ask`), which has no evaluator or evidence. | V1: the journey owns intake, diagnostics and probes. On generic canvases the per-turn responder stays the Learn chat, given a bounded `journey_context`. Generalising Tutor v2 to generated topics is milestone **LP-T**, gated on owner approval because it changes `PLANNER_SYSTEM`, the cached prefix and the benchmark baselines. **Owner decision D1.** |
| C2 | Reuse the Evidence Store. | It is per tab (`sessionStorage`), and states come only from the static nanoGPT registry. | Reuse the event shape, `reconcile` and the locked derivation, given a claims registry as a parameter (the default stays `CLAIMS`, so Tutor v2 is unchanged). Journey evidence is persisted on the server per journey. |
| C3 | Reuse the Evaluator. | `/evaluate` is registry-agnostic, but generated topics have no claims. | The diagnostic planner writes claims in the registry shape (`statement`, `ideas`, `misconceptions`, `drawn`). Free-text answers go through the existing JEV → larger-evaluator path. |
| C4 | "Strong diagnostic → skip prerequisite" (AT-06). | The locked derivation gives `understood` only for a settled transfer pass with idea coverage, so one plain answer is at best `uncertain`. | Write diagnostic probes as transfer items: a new case, a prediction or an application. The path planner receives the per-claim states and settled pass counts, never a score. The locked semantics are not changed. |
| C5 | The Contents rail shows the path with statuses. | The rail has no statuses, is fed only by headings, opens on hover, and is hidden below `lg` and while the panel is open. | Extend `ContentsRail` with a `status` per entry and a path data source, and pin it open during path review. Mobile stays out of V1 (owner decision D5). |
| C6 | A Tutor Prompt Tray already exists, or should be reused. | No such component exists. The `LearnSlash` notice box sits in the right slot, but it has no options and no answer input. | One `TutorPromptTray` in the `LearnSlash` slot, styled like the notice box. Free-text answers use the existing composer, never a second input. The `LearnSlash` notice may move onto it later; that is not needed for LP1. |
| C7 | Voice parity. | Voice exists only where the Tutor is active. | LP5: `useVoiceSession` accepts a journey turn adapter as well as the Tutor. Spoken answers resolve to tray options or free text. **Owner decision D6** covers which general voice questions on generic canvases are answered. |
| C8 | Home "I want to learn X" starts the journey. | The intent is dropped (`learnHandoff = false`, and the handoff only prefills). | `teach()` starts the journey on the server right after creating the canvas, so no prompt handoff is needed. The canvas title becomes the topic. **Owner decision D4**, because it touches `agent/`. |
| C9 | No permanent cards before acceptance. | The Learn chat can auto-insert wiki, video and paper cards, and placing a selected card creates a chat card. | During `intake`, `diagnostic` and `path_review`, composer text goes to the journey. A `?` question goes to chat with `journey_context.phase = 'setup'`, and in that phase the server leaves out the card-inserting tools. |
| C10 | `/dive` reconciliation. | Only the Tutor reacts to a return, and nothing is written to the parent. | The parent journey pauses when a hole opens. On return it offers a return probe or choice. Path changes go only through an `adapt` call on the parent with reason `dive_return`. The child never writes the parent path. |
| C11 | A versioned LearningPath. | `learn_courses` has a revision counter but no history, is per app and owner-authored, and wipes content on revision. | New LEARN_DB tables (section 7). Reuse the unit shape, limits and validation style of curriculum v2, not its table. |
| C12 | Repository grounding parity. | Repository learning is the authored NanoGPT course plus the Tutor. | The schema carries `grounding`. V1 builds topic grounding only. Repository-grounded paths come with LP-T (section 9). |

---

## 3. Components and file plan

```
packages/web/src/learn-journey.js         pure, shared with the worker: journeyIntent, journeyStep (state machine),
                                          intake bank, diagnostic walker, probe policy, path invariants, trayFor,
                                          railEntries. Tests: learn-journey.test.mjs
packages/web/src/LearnJourney.jsx         useJourney hook (like useTutor) + TutorPromptTray
packages/web/src/ContentsRail.jsx         + status per entry, + open prop
packages/web/src/ask.jsx                  composer routing while a tray is open; tray in the LearnSlash slot
packages/web/src/learn-tutor-evidence.js  deriveClaimStates / reconcile take an optional claims registry
packages/web/src/learn-tutor-claims.js    claimsOfConcept takes an optional registry (default unchanged)
packages/control-plane/src/learn-journey.js         GET/POST /api/learn/journey: authorize, validate, run journeyStep,
                                                    call planners, persist
packages/control-plane/src/agents/learn-journey.js  the three planner prompts and tool schemas
packages/control-plane/learn-migrations/0004-learning-journeys.sql  (+ repository-schema.sql mirror)
packages/web/dev-worker.js                one route line next to tutorRoute
packages/web/e2e/journey-check.mjs        browser acceptance, local stack, stubbed planners
```

Server modules can import `packages/web/src` pure modules; `learn-artifact.js` already imports `agent/slash.js`.
Both sides therefore run the same state machine and invariants.

**The server is authoritative.** The browser posts learner events, and the worker:
1. validates the event;
2. runs `journeyStep`;
3. makes any planner or evaluator call;
4. checks the invariants;
5. persists, with an optimistic `revision`;
6. returns `{ journey, path, tray }`.

Chat and Voice call the same endpoint, which is how channel parity works. Answer keys for diagnostic multiple
choice stay on the server.

---

## 4. Schemas (final proposal)

### 4.1 LearningJourney

```
LearningJourney {
  id                        "lj_<uuid>"
  scope { org, owner_email, app, board }      at most one live journey per learner per board
  state                     intake | diagnostic | path_review | active | paused | completed
  pending                   null | diagnostic | path | revise | section | adapt      (planner call in flight)
  error                     null | { op, message, retryable: true }                 (answers and path are kept)
  request {
    raw_user_message        verbatim, never in analytics
    topic                   "logistic regression"
    intent                  learning_journey | focused_skill | quick_overview | fast_start
    channel                 text | voice                                             (first message only)
  }
  grounding                 { kind: 'topic' }  |  { kind: 'repository', repo, commit }     (V1: topic)
  intake {
    slots { goal?, familiarity?, depth?, minutes?, coding?, math? }
    source { <slot>: stated | answered | default }
    goal_text?              the learner's own words for "Something else…"
  }
  concepts {                the per-journey claim registry, the same shape as learn-tutor-claims CLAIMS
    concepts [{ id, name, prerequisites[] }]                               ≤ 16
    claims   { <id>: { concept, statement, ideas[≤4], misconceptions[{id, check}] ≤5, drawn: '' } }   ≤ 40
  }
  diagnostic { probes: Probe[] (answer keys server-only), asked[probe_id], skipped: bool }
  evidence { seq, events[] }   the learn-tutor-evidence event shape; source 'journey_probe'; ≤ 500 events
  path_version              0 until the first draft
  active_section_id         null until accepted
  section_plan              SectionPlan | null      (current section only)
  paused_for?               { child_app, concept }
  revision, created_at, updated_at
}
```

Nothing else about the learner is stored: no level, no score, no profile.

### 4.2 LearningPath (one immutable row per version)

```
LearningPath {
  id                        "lp_<journey>_v<version>"
  journey_id, version
  goal                      one learner-facing sentence
  target_topic
  grounding
  intake_ref                the journey's intake at draft time (journey_id + revision)
  diagnostic_evidence_refs[]   event seqs
  sections[]                1-12 LearningPathSection
  current_section_id        null in path_review
  change {                  why this version exists
    source                  draft | learner_edit | evidence | dive_return | resume
    reason                  internal sentence
    learner_note?           short, evidence-specific, shown once in the tray ("I added … because …")
    evidence_refs[]
    sections_changed[{ id, op: added | removed | merged | split | reordered | optional | depth | retitled }]
  }
  created_at
}

LearningPathSection {
  id                        stable across versions; merge/split mint new ids and keep from[]
  title                     ≤ 80
  purpose                   ≤ 240, learner-facing
  kind                      core | refresher | bridge | review
  target_concepts[]         registry concept ids
  prerequisites[]           registry concept ids
  expected_evidence[]       [{ claim, kind: explain | predict | apply | transfer }] ≤ 4
  estimated_minutes?
  depth                     overview | guided | deep
  status                    upcoming | current | completed | optional | skipped | needs_review
  generation_state          not_generated | planning | generated
  heading_block_id?         set when the section materializes on the canvas
  adaptation_reason?        learner-facing, evidence-specific
  from?[]
}
```

`added`, `reordered` and `adapted` from spec section 4.1 are not stored statuses. The rail derives them as
transient highlights by diffing a version against the one before it.

**Invariants**, enforced by the shared module on both sides and re-checked by the server before any write:
1. A completed section's `title`, `purpose`, `target_concepts`, position relative to the other completed
   sections, and `heading_block_id` never change. A shaky completed concept gets a new `review` section.
2. At most one section is `current`. It is null before acceptance.
3. A section may reach `generation_state != not_generated` only while it is current or completed.
4. A section carries no content fields: no `blocks`, `cards` or `steps`. This is the hard rule that
   "LearningPath != generated course content".
5. Every concept a section references exists in the registry.
6. `version` increments by exactly 1, and every version has a `change`.

### 4.3 SectionPlan (current section only, planned just in time)

```
SectionPlan {
  section_id, path_version
  learning_objective
  target_concepts[]
  prerequisite_evidence[]   [{ concept, state }]   snapshot of the derived states at planning time
  teaching_sequence[]       2-6 steps, no fixed template
    { step_id,
      role: framing | interactive_visual | explanation | worked_example | prediction | practice | code | transfer_check,
      make: { command, request } | { text },
      claims[] }
  checks[]                  0-3 Probe, each with a trigger: { after_step } | 'before_transition'
  completion_evidence[]     [{ claim, minimum: attempted | demonstrated_here | demonstrated_in_transfer }]
}
```

- **`command`** is a slash command from `agent/slash.js`: `explain | code | graph | diagram | walkthrough |
  animate | practice | flashcards`.
- **Materialization:**
  - A level-1 heading block bound to the section (`journey_section_id`) is appended at the end of the flow.
  - Each step then goes through the existing `generateArtifact` and is inserted under that heading.
- **Paid primitives:**
  - `PAID` in `slash.js` is `maths_animation`, `image_generate`, `video_generate`, `blender_scene` and
    `narration`.
  - Paid primitives come back as proposals and appear as a tray `generation_proposal`. They are never generated
    automatically.
- **Completion evidence is soft.** If it is missing, one `before_transition` probe is offered. The learner can
  always continue.

### 4.4 Probe

```
Probe {
  id
  kind      mcq | prediction | explain_back | short_calculation | confidence_explain | code_reading | choice
  prompt    ≤ 300
  options?  [{ id, label }] ≤ 4, plus "Not sure"      (server keeps correct / misconception_id)
  claims[]  ≤ 3 registry ids                          (empty for kind 'choice')
  purpose   diagnose | predict | explain_back | transfer | choose
  trigger?  section checks only
}
```

- V1 builds `mcq`, `prediction`, `explain_back` and `choice`. The other kinds wait for a later milestone.
- Multiple-choice and prediction probes are evaluated deterministically, as claim-level pass or fail. Choosing
  an option tagged with a misconception records a `misconception` result with that id.
- Free text is evaluated by JEV via the existing evaluate path, with `answering: true` and `question:
  probe.prompt`.

---

## 5. State machine

```
            journeyIntent = learning_journey | focused_skill | quick_overview
 (none) ───────────────────────────────────────────────────────────▶ intake
            fast_start ("skip setup and start") ──▶ path drafted with defaults ──▶ active (section 1)

 intake      ── next unknown slot ──▶ ask (≤ 3 questions, minus slots already stated)
             ── slots enough | "skip" ──▶ diagnostic        [pending: diagnostic → 1 planner call]
 diagnostic  ── walk probes (1-3) ──▶ enough evidence | 3 asked | "skip the assessment"
             ──▶ path_review                                  [pending: path → 1 planner call]
             quick_overview: diagnostic skipped (concepts not_yet_observed)
 path_review ── edit (button or words) ──▶ path_review v+1   [pending: revise]
             ── accept ("Start", "looks good", "let's go") ──▶ active
 active      ── section s current: planning ──▶ generated     [pending: section → 1 call + N artifact calls]
             ── learner continues ──▶ s completed ──▶ adapt?  [0-1 call; only if evidence changed upcoming
                                                               concepts or an edit is pending]
                                    ──▶ next upcoming section current ──▶ planning …
             ── path edit in words ──▶ active v+1 (future sections only)
             ── dive opened ──▶ paused ── return ──▶ active (return probe or choice; adapt only via evidence)
             ── last section completed ──▶ completed
 any         ── planner failure ──▶ same state, error set, inputs kept, Retry in tray (never random cards)
```

- A broad intent on a board with a live journey does not start a second journey. The tray asks: "Continue
  <topic> or start <new topic>?". Starting the new one archives the old journey.
- The NanoGPT course canvases, where the Tutor is active, do not start journeys in V1.

---

## 6. Tutor Prompt Tray state model

The tray is not persisted. `trayFor(journey, signals)` recomputes it after every reload or event.

```
tray: null | {
  id
  mode        intent_intake | diagnostic_probe | path_preview | check_in | clarification
              | next_step | branch_choice | generation_proposal
  prompt      string (spoken by voice when Voice is on)
  options     [{ id, label }] 0-5
  free_text   true → the main composer answers it (its placeholder says so); never a second input
  probe_id?, slot?
  busy?       "Drafting your path…" (no options while pending)
  error?      { message } + Retry option
  dismissible
}
```

| Journey state | Tray |
|---|---|
| intake | `intent_intake`: the next unknown slot, with topic-templated options from spec section 6 |
| diagnostic | `diagnostic_probe`, plus "Skip the assessment" |
| path_review | `path_preview`: Start · Make it shorter · Go deeper · More practical · More mathematical, plus free-text edits |
| active | `check_in`, `branch_choice`, `next_step` or `generation_proposal`, only when the probe policy fires |
| resume (active, on load) | `next_step`: Continue · Quick recap · Revisit <previous concept> |
| back from dive | `next_step` or a return probe |

**How composer text is routed while a tray is open:**
1. Acceptance words in `path_preview` mean accept.
2. Text ending in `?` goes to chat as a question, and the tray stays open.
3. Any other text in `path_preview` is a path edit.
4. Any other text in intake or diagnostic is the answer.

Voice transcripts follow the same rules. A spoken answer is first matched to an option label (normalised token
overlap) and is treated as free text otherwise.

**Probe policy** is deterministic: `probeDue(journey, signals)`.
- Fire on any of:
  - a key step (`interactive_visual` or `practice`) that the learner interacted with;
  - a section transition;
  - uncertain evidence on a section claim;
  - two fails on the same claim;
  - passive click-through: steps seen with no interaction, then "continue";
  - practice completed;
  - a return from a dive.
- Suppress when any of these holds:
  - card input changed less than 8 s ago;
  - Voice is speaking or listening;
  - a probe was resolved or dismissed less than 2 min ago;
  - two probes have already run this section and the evidence is not uncertain;
  - the claim is already `understood`;
  - the learner set `no_quiz` (choice nudges only).
- Never more than one tray at a time. Never "Did you understand?".

---

## 7. Integration with the Evaluator and Evidence Store

- **Free-text answers.** The worker calls the existing evaluation function behind `/api/learn/tutor/evaluate`
  (JEV, the explicit escalation policy, the Opus 5.5 larger evaluator). It sends the journey's registry claims,
  as allowed by `validateEvaluateBody`.
- **Multiple choice and prediction** are evaluated deterministically, with `evaluator: 'deterministic'` and
  `source: 'journey_probe'`.
- **Reconciliation.** Results go through `reconcile(store, evaluation, ref, claims)`. `deriveClaimStates(events,
  claims = CLAIMS)` and `claimsOfConcept(name, claims = CLAIMS)` gain an optional registry parameter. The
  default keeps Tutor v2 byte-identical, and its existing tests pin that.
- **Locked semantics, unchanged:**
  - one fail is `uncertain`, never a misconception;
  - two settled events naming the same misconception are a `misconception`;
  - a later transfer pass supersedes;
  - a gap needs a named prerequisite;
  - there are no percentages.
- **Evaluator unavailable.** An error adds no events. The diagnostic walker moves on, and the path planner is
  told that evidence is missing, so it keeps prerequisites and skips nothing. Adaptation never runs on missing
  evidence.
- **Learner-facing wording** quotes the evidence ("the last answer mixed up a score and a probability"). It never
  says "mastered" or reports a level.

---

## 8. Integration with the Tutor Planner

- **Generic canvases (V1):**
  - The journey decides what to teach next, whether to probe, and which section materializes.
  - The Learn chat still answers the learner's free questions. While a section is active, `/api/learn/ask`
    receives `journey_context { phase, goal, section { title, purpose, target concepts, expected evidence },
    upcoming titles, constraints }`. That context is bounded to about 1.5 KB, never the full path or evidence.
  - Its system prompt gains one rule: teach inside the current section, and point at an upcoming section
    instead of teaching it early.
  - In `setup` phase the card-inserting tools are left out.
- **The NanoGPT Tutor canvases are unchanged.** No `PLANNER_SYSTEM`, `TUTOR_TOOL`, Teaching State or validator
  change happens before LP-T.
- **LP-T (gated):** Tutor v2 becomes the per-turn responder on journey canvases.
  - The journey registry replaces `CLAIMS`.
  - Materialized section blocks replace `SLICE_CARDS`.
  - The Teaching State gains `journey_context`; the pinned key test changes.
  - `ask_question` gains options so the tray can render them.
  - Section checks become `ask_question` actions.

  This needs a benchmark re-baseline and owner approval.

---

## 9. Persistence and migration

**Proposed `learn-migrations/0004-learning-journeys.sql`**, mirrored into `repository-schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS learning_journeys (
  id TEXT PRIMARY KEY,
  org TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  app TEXT NOT NULL,
  board TEXT NOT NULL,
  state TEXT NOT NULL,
  topic TEXT NOT NULL,
  raw_request TEXT NOT NULL,
  intake_json TEXT NOT NULL,
  concepts_json TEXT NOT NULL,
  diagnostic_json TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  path_version INTEGER NOT NULL DEFAULT 0,
  active_section_id TEXT,
  section_plan_json TEXT,
  pending TEXT,
  error_json TEXT,
  revision INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS learning_journeys_live
  ON learning_journeys (org, owner_email, app, board) WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS learning_path_versions (
  journey_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  path_json TEXT NOT NULL,
  source TEXT NOT NULL,
  reason TEXT NOT NULL,
  evidence_refs TEXT NOT NULL,
  changes_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (journey_id, version)
);
```

**Why LEARN_DB and not the alternatives:**
- **`learn_courses`:** owner-authored and per app, with no history, and it wipes generated content on revision.
- **Board `state_json`:** browser-local unless shared, visible to every viewer, and unreachable by server-side
  planners.
- **`sessionStorage`:** per tab.

**Canvas binding.** Materialized sections are ordinary heading blocks with an extra `journey_section_id` field.
Extra block fields already survive saves. Card blocks under a heading belong to that section by the existing
heading-range rule, so the canvas needs no new top-level key.

**Rollout:**
1. Local first.
2. The dev LEARN_DB `rabbit-hole-learn-dev` is shared by every dev clone. The migration is announced before it
   is applied there, by hand with `wrangler d1 execute --file`, as for 0001-0003.
3. Production `rabbit-hole-learn-prod` belongs to Parallel and Home, and needs an explicit GO.

**Resume.** Load reads the live journey for `(org, email, app, board)` and the latest path version. The tray is
recomputed from them.

**Access.** Only the journey's owner sees it. Viewers of a shared board see the canvas headings, not the tray
or the path. `ponytail:` per-viewer journeys on shared boards come when sharing needs them.

---

## 10. Planners and model calls

| Planner | When | Calls | Output |
|---|---|---|---|
| Intent | every composer or Home message, deterministic | 0 | `journeyIntent`: kind, topic, constraints (minutes, depth, style, coding), skip_setup |
| Intake | deterministic question bank, templated with the topic | 0 | the next slot question |
| Diagnostic planner | intake → diagnostic | 1 | registry (concepts and claims) plus a probe ladder of 2-4 probes, from prerequisite to advanced |
| Diagnostic walker | each answer, deterministic | 0 (+ JEV for free text) | next probe or stop |
| Learning Path planner | draft, revise, adapt | 1 per draft, edit or adaptation | a full LearningPath version plus `concepts_added` |
| Section planner | a section becomes current | 1 | SectionPlan |
| Materializer | after a SectionPlan | N (`generateArtifact`) | canvas blocks for the current section only |

- Every planner takes an injected `callModel`, as `generateArtifact` does, so unit, route and e2e tests run on
  fixtures.
- No paid call is made without an owner GO.
- The model ids are owner decision D3. Proposed: `claude-opus-5-5` for the diagnostic and path planners,
  `claude-sonnet-5-5` for the section planner. All are recorded in `LEARN_TASKS`.
- `ponytail:` the intent classifier and edit detection are regexes. A model classifier comes if the miss rate
  shows it is needed. A missed broad intent falls back to normal chat, which can offer "Learn this as a guided
  path".

---

## 11. Telemetry

Event names follow spec section 38 (`learning_journey_started` … `journey_completed`). Properties are ids and
categories only: `journey_id`, `path_version`, `section_index`, `probe_kind`, `result` (pass, fail, uncertain,
skipped), `channel`.

Events are emitted as a `small:journey` window event, and the worker logs ids. Raw learner text, tutor text,
code and transcripts never appear in events.

---

## 12. Milestones

| Milestone | Scope | Acceptance |
|---|---|---|
| **LP0** (this) | Audit, conflicts, schemas, state machine, plan | owner approval |
| **LP1** | `journeyIntent`, the tray, intake, the diagnostic (multiple choice and explain-back, JEV), path draft, the rail with statuses, migration 0004 (local), the `/api/learn/journey` route, the evidence registry parameter, Home `teach()` start (if D4 is approved) | AT-01, AT-02, AT-13, AT-14; unit suites |
| **LP2** | Accept and edit (buttons and words), section planner, materialization of the current section only, failure policy | AT-03, AT-04, AT-05, AT-15 |
| **LP3** | Evidence-driven adaptation at section boundaries, versions with learner notes, `needs_review` and review sections | AT-06, AT-09 |
| **LP4** | Probe policy, section checks, choice nudges | AT-07, AT-08 |
| **LP5** | Voice adapter, resume nudges, `/dive` pause and return reconciliation | AT-10, AT-11, AT-12 |
| **LP-T** (gated) | Tutor v2 on journey canvases; repository-grounded paths | new Tutor corpus traces and a re-baseline |

Each milestone is several small commits, each with `make test-unit` green. `make test-integration` runs before
any merge request. A visual review on a dev clone (`rabbit-hole-web-dev-adaptive-learning-path-v1`) needs the
owner's go; this branch does not deploy now.

---

## 13. First vertical-slice tests (LP1)

**Unit tests** (`node --test`, no model):
- **U1 `journeyIntent`:**
  - The five spec phrasings resolve to `learning_journey` or `focused_skill`.
  - "What is logistic regression?" resolves to `direct_question`.
  - "Give me a 10-minute visual overview of logistic regression" resolves to `quick_overview {minutes: 10,
    style: 'visual'}`.
  - "Skip setup and start" resolves to `fast_start`.
  - Home's existing negatives, "learn attention" and "how do I learn faster", stay non-journey.
- **U2 intake:**
  - At most 3 questions.
  - Stated constraints remove their slots.
  - An answered slot is never re-asked.
  - A quick overview asks at most 1 question.
- **U3 diagnostic walker:**
  - 1-3 probes; stops early on consistent evidence.
  - "Skip the assessment" leaves every concept `not_yet_observed`.
  - A JEV error adds no evidence.
  - One multiple-choice fail gives `uncertain`, not `misconception`.
- **U4 path validator:**
  - Limits, unique ids, concept references, no `current` before acceptance.
  - A section with `blocks`, `cards` or `steps` is rejected.
- **U5 `journeyStep`:**
  - Illegal transitions are rejected, for example planning a section before acceptance, or materializing a
    section that is not current.
  - A planner failure keeps the intake and diagnostic answers.
- **U6 invariants:** a revise that touches a completed section is rejected; versions advance by 1 and carry a
  `change`.
- **U7 `railEntries`:** status mapping; upcoming entries are not generation triggers.
- **U8 evidence:** the existing Tutor v2 suites pass unchanged, and a journey registry derives states for its own
  claims only.

**Route tests** (control-plane, stubbed `callModel`):
- start → intake → diagnostic → path;
- a path planner failure gives `error` with the answers kept and no other model call;
- auth and owner-only checks;
- revision conflict gives 409.

**Browser acceptance** (`e2e/journey-check.mjs`): a local stack, a mock sign-in, stubbed planners through a
local-only env flag (as `OAUTH_MOCK` is). No paid call.
- **AT-01:**
  - On a blank canvas, typing "I want to learn logistic regression" opens `[data-tutor-prompt-tray]` in mode
    `intent_intake`.
  - The canvas block count stays 0.
  - No request goes to `/api/learn/ask` or `/api/learn/artifact`.
- **AT-02:**
  - The learner answers intake by clicking and the diagnostic by typing.
  - The rail then lists the drafted sections as `upcoming`.
  - The block count is still 0, and GET journey returns path v1 with every `generation_state = not_generated`.
- **AT-13:** "What is logistic regression?" opens no tray, and one `/api/learn/ask` request is made.
- **AT-14:** a quick overview asks at most 1 intake question, and the path has at most 3 sections.
- **LP2 preview of AT-03 and AT-04:**
  - Start leads to exactly one bound heading plus section 1's blocks.
  - One section-plan request is made, for section 1 only.
  - Sections 2-8 stay `not_generated`, with no heading on the canvas.

---

## 14. Owner decisions needed before LP1

- **D1. Per-turn responder on generic canvases.**
  - Recommended: Learn chat plus journey-owned probes in V1, with Tutor v2 generalisation as gated LP-T.
  - Alternative: generalise Tutor v2 first. This is larger and re-baselines the benchmarked planner.
- **D2. Server-authoritative journeys in LEARN_DB** (migration 0004), applied locally in LP1. It is announced
  before it is applied to the shared dev LEARN_DB.
- **D3. Planner models.** Opus 5.5 for the diagnostic and path planners, Sonnet 5.5 for the section planner. No
  paid call until GO; fixtures until then.
- **D4. Home entry.** `teach()` starts the journey on the server and titles the canvas with the topic. This
  touches `agent/AgentBar.jsx` and replaces the dropped-intent fallback for teach only.
- **D5. Mobile.** The rail is hidden below `lg`. V1 stays desktop-only for the path view (the tray still works
  on phones), in line with the deferred mobile work.
- **D6. Voice on generic canvases (LP5).** Voice answers the tray and journey turns. Free spoken questions get a
  short spoken Learn-chat answer, or stay unavailable.
- **D7. Visual review.** CLAUDE.md asks for a dev-clone deploy for every UI change, and this task says not to
  deploy. Which wins at LP1?
