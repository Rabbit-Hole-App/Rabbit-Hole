# Adaptive Learning Path V1 — architecture (LP0, revision 2)

Status: **LP0 revision 2, with the owner decisions of 2026-10-04 locked in. LP1 is building against this
document.**

- Spec, the source of truth: [rabbit-hole-adaptive-learning-path-v1.md](rabbit-hole-adaptive-learning-path-v1.md).
  This branch carries a verbatim copy, because the original is untracked in the `small-parallel` worktree.
- Branch `feature/adaptive-learning-path-v1`, rebased on `origin/main` 68f02092.
- Owner: Learning Path / Curriculum agent. Parallel integrates. Not merged.

Out of scope for this agent: `/motion`, the HeyGen Avatar Teacher, Shared Canvas, skeleton cards, the CLI,
infrastructure, and canonical main integration.

> **Task-level override of CLAUDE.md (owner, 2026-10-04): LP1 is not deployed.** CLAUDE.md asks that every UI
> change be deployed to a dev clone for visual review. For this task the owner's instruction wins. LP1 is
> reviewed only on the local stack, through browser checks, screenshots and the Figma review. No dev-clone or
> other deployment happens until the owner explicitly authorizes one.

This document is the contract for every sub-agent working on the subsystem. A sub-agent implements its section
as written. It does not redesign: an open question goes back to the primary owner.

---

## 0. Locked owner decisions (2026-10-04)

| # | Decision |
|---|---|
| D1 | **Generalize Tutor v2 first.** On a canvas with an active learning journey, Tutor v2 is the one Tutor. There is no separate journey tutor, and no "Learn chat plus journey probes" brain. A blank canvas without a journey keeps the Learn chat. The nanoGPT Tutor keeps its behaviour exactly. The golden traces and the benchmark gate are re-run before LP1 is accepted. |
| D1b | **Journey evidence is server-side** and is the source of truth for active journeys. The existing event shapes, `reconcile()`, the JEV → larger-evaluator ladder and the locked five states are reused. The nanoGPT `sessionStorage` store stays until it is migrated deliberately. There are no mastery percentages. |
| D2 | **LEARN_DB tables**, as an additive migration numbered with the next unused number: **0006**. It is applied locally only. The shared dev and production LEARN_DB wait for an explicit GO. |
| D3 | **Model roles resolve through `LEARN_TASKS`**; no model id appears in any schema. Intake and diagnostic planner: Sonnet 5.5 at effort low. Diagnostic evaluation: the existing deterministic → JEV → larger ladder. Initial path: Opus 5.5. Section: Sonnet 5.5 at effort low. Adaptation: Sonnet 5.5 at effort low, escalating to the path model on a validator rejection, contradictory evidence or reported ambiguity. Tests run on fixtures; only a few real calls happen once the slice works. |
| D4 | **Home `teach()` starts the journey on the server.** The exact learner request is kept, the journey starts in `intake`, Learn opens and the tray appears. No cards are generated during this handoff. Factual Home questions never start a journey. This agent owns the `AgentBar.jsx` change. |
| D5 | **The Adaptive Contents Rail stays reachable while the Learn agent chat panel is open.** LP1 is desktop-primary. The component is split so that a later Path button → drawer/sheet can render the same state. Narrow and mobile access is required before production. |
| D6 | **Voice is a communication mode.** A voice utterance goes through the same interaction resolver as typed text. An unrelated question gets a normal Tutor answer with journey context, then the journey resumes. Voice has no curriculum logic of its own. |
| D7 | **LP1 is not deployed** (the override above). |
| R1 | **No routing on punctuation.** While a tray is active, every learner turn goes through the interaction resolver. Its categories are `tray_answer`, `path_edit`, `unrelated_question`, `cancel` and `clarification_needed`. It tries deterministic matching first, then a lightweight model call. Free text always comes from the existing composer. |
| R2 | **The rail is a teaching plan.** It renders the LearningPath states: completed, current, upcoming, optional, needs_review and adapted/new. Clicking an upcoming section shows its purpose and never generates anything. |
| R3 | **Identity (owner, 2026-10-05).** Journeys are keyed by the canonical stable internal user id: `users.id` (migration 0026), the session's `uid`. They are never keyed by email. The opaque id is plumbed through the server: control-plane `/api/me` adds `user_id` (taken from the session; null for CLI tokens), `devIdentity` forwards it, and canvas access carries it as `user_id`. Journey routes require it and fail closed without it. It is never returned in journey payloads. Migration 0006 carries it now. |
| R4 | **Diagnostic evidence rule.** `understood` still requires settled transfer evidence. Diagnostic probes are designed so they can genuinely test transfer. A correct self-report is never mastery evidence. |
| R5 | **One section at a time.** Sections contain no generated content. After acceptance, only the current section gets a SectionPlan and teaching artifacts. |
| R6 | **Tutor-core collision pause** (owner, later on 2026-10-04). LP1 must not edit `learn-tutor-validate.js`, `learn-tutor.js`, `agents/learn-tutor.js`, `learn-tutor-routes.js`, `learn-models.js` or `learn-tutor-evidence.js` until Avatar/Media has landed its Tutor changes on main. After that: fetch main, rebase, and make the generalized Tutor changes once (plan Tasks 6, 7, 12). Everything else in LP1 goes ahead first. **Lifted on 2026-10-05:** Avatar core is on main (a87b370a); the branch is rebased onto it, and Tasks 6, 7 and 12 now run on the merged Tutor core. |
| R7 | **One shared Learner Intent Resolver.** Motion's `packages/control-plane/src/learner-intent.js` (`resolveLearnerTurn`, on `feature/motion-v1-harness`, not yet on main) is the canonical resolver; this subsystem does not create a second one. Journey interpretation and tray-interaction interpretation live in an import-free extension, `packages/control-plane/src/learner-intent-journey.js`. It is consumed by `resolveLearnerTurn` as `structured_interpretation.journey` and `structured_interpretation.interaction`, and by the browser (import-free, like `agents/learn-tutor.js`). It never re-implements target binding, selection or deixis. Duration uses Motion's `parseDuration` once that is on main; until then a hyphen-aware minutes fallback is marked `ponytail:`. |

---

## 1. Audit summary (main 68f02092)

The full audit is in revision 1 (commit f0523fe7, §1). These are the facts the design depends on.

**Tutor v2 is hard-wired to the nanoGPT Attention slice.**
- The registry is static: `CONCEPTS`, `CLAIMS`, `PRACTICE`, `CARD_CLAIMS`/`PART_CLAIMS`, `SLICE_CARDS` and the
  attention ladder, all in `learn-tutor-claims.js`.
- The selector's cue phrases are hand-written (`learn-tutor-select.js` `CUES`).
- The validator's resource checks only know the slice: `SLICE_CARDS`, `cardModule`, `partIndex`, `ladderStep`.
- `PLANNER_SYSTEM` says "about nanoGPT attention" and "never generate new artifacts".
- `useTutor` is active only on the supplied course, the slice board and the holes under them.

**Orchestration runs in the browser.** `runTurn` posts to `/api/learn/tutor/evaluate` and
`/api/learn/tutor/plan`; the worker stores nothing. Evidence lives in `sessionStorage` (`small.tutor:<org>:<email>`).

**The evaluate route is registry-agnostic.** It takes the claims in the body (at most 6 claims, 4 gaps, 4 ideas
and 5 misconceptions each). JEV's transfer check reads `claim.drawn`: "a specific case other than the one the
card draws".

**Planner context.** Its key list is pinned by `learn-tutor-context.test.mjs`. The golden traces live in
`learn-tutor.test.mjs` (11/11). The stub corpus runner is `e2e/tutor-corpus-run.mjs`, and the paid gates are
`e2e/tutor-bench-gates.mjs`.

**New on main since revision 1.**
- Skeleton card slots: `canvas.reserve()`, `insertBlock(block, { into })`, `revealBlock`, with `wantsCard` and
  `showableCards` in `learn-tutor.js`. Materialization reuses the slots.
- Canvas forking and Shared Canvas v1 (`learn-migrations/0004`, `0005`).

**Learn panels.**
- The Learn agent chat panel is a `ResizableSidePanel` (`LearnPage.jsx:1323`).
- `ContentsRail` is mounted outside the canvas frame and only while that panel is closed (`LearnPage.jsx:1430`).
  It has no statuses and is fed only by heading blocks.

**Home `teach()` drops the learner's words.** It creates a canvas titled with the raw sentence, and
`learnHandoff = false`.

**Voice exists only where `useTutor` is active.** A journey canvas on which Tutor v2 is active therefore gets
Voice with no change to the voice code.

**Identity.** The Learn worker resolves identity through `devIdentity` → `/api/me`, which returns
`{ email, org, orgName }`. Every LEARN_DB table keys on `(org, owner_email)`. That email is the internal account
principal of `users.email` (migration 0026): unique, never updated by any code, and a synthetic
`user@<id>.rabbithole.invalid` for Google- or GitHub-only users. `users.id` exists in DB and in the session
(`uid`), but it does not reach the Learn worker.

---

## 2. Architecture

```
                      ┌──────────── Learning Journey Orchestrator (server, /api/learn/journey) ───────────┐
                      │ Intent Intake · Diagnostic Planner · Learning Path Planner · Section Planner        │
                      │ state machine · path versions · section materializer plan · probe policy          │
                      └───────────────┬───────────────────────────────────────────────▲────────────────────┘
          journey domain (registry,   │                                               │ evidence states,
          current section, context)   ▼                                               │ path adaptation
Learner ─▶ interaction resolver ─▶ LearnerTurn ─▶ Evaluator (det → JEV → larger) ─▶ Evidence Store ─▶ Router
 (chat/voice)  (tray active?)       (Tutor v2)     /api/learn/tutor/evaluate          (server, journey)
                                                                                         ─▶ Tutor Planner ─▶ Validator ─▶ TutorAction ─▶ Canvas
```

- The Orchestrator decides **what** is taught next: setup, path and current section.
- Tutor v2 decides **how** to answer this turn.
- One Tutor, one evaluator ladder and one evidence store serve every journey canvas.
- What changes per canvas is the **TutorDomain**.

Which brain answers:

| Canvas | Responder |
|---|---|
| Blank canvas, no journey | Learn chat (`/api/learn/ask`), unchanged |
| Canvas with a live journey (any state) | Tutor v2 with the journey domain |
| Supplied nanoGPT course, slice board, holes under them | Tutor v2 with the nanoGPT domain, byte-identical |

---

## 3. Generalized Tutor v2: the TutorDomain

Every nanoGPT-specific read in the Tutor modules goes through one injected object. The default is the existing
nanoGPT domain, built from the current constants, so nanoGPT callers change nothing and produce identical output.

```
TutorDomain {
  kind          'nanogpt' | 'journey'
  subject       'nanoGPT attention' | <journey topic>
  concepts      { [id]: { label, names[] } }
  claims        { [id]: { concept, statement, ideas[≤4], misconceptions[{id, check}] ≤5, prerequisites[], drawn, cues?[] } }
  practice(card, taskId, version)       → { claim, transfer, wrong } | null
  targetClaims(target)                  → claim ids                      (card/part/selected object → claims)
  defaultClaims(turn)                   → claim ids                      (nanoGPT: the hole's concept; journey: the current section's)
  conceptOf(text)                       → concept id | null
  cards         showable card ids       (nanoGPT: SLICE_CARDS; journey: the materialized blocks of current + completed sections)
  cardModule(id) / catalogue() / ladderStep(id, dir) / partLabels(card)
  showCard(canvas, id, partId, take)    (nanoGPT: insert the authored module; journey: reveal the existing block, never generate)
  context?      journey_context for the planner (journey only; see §3.3)
  evidence      { mode: 'session' } | { mode: 'journey', journey_id }
}
```

### 3.1 Module changes

These are surgical: every function gains an optional `domain = NANOGPT` parameter.

| Module | Change |
|---|---|
| `learn-tutor-claims.js` | Export `NANOGPT` (the domain object over the existing constants). The constants keep their names and values. |
| `learn-tutor-evidence.js` | `deriveClaimStates(events, claims = CLAIMS)`, `reconcile(store, evaluation, ref, claims = CLAIMS)`, `conceptState(states, concept, claims = CLAIMS)`, `practiceEvents(…, domain)`. The locked derivation is unchanged. |
| `learn-tutor-select.js` | `selectClaims(raw, opts, domain = NANOGPT)`. Cues come from `CUES[id]`, else `claim.cues`, else the concept names. |
| `learn-tutor-validate.js` | `validateActions(response, routed, turn, domain = NANOGPT)`. Resource checks go through `domain.cards`, `cardModule`, `ladderStep` and `claims`. |
| `learn-tutor.js` | `buildTurn`, `turnClaims`, `evaluationSpec`, `route`, `plannerContext`, `runTurn` and `executeActions` take `domain`. `runTurn({ …, domain, plan = true })`: `plan: false` stops after evidence reconciliation (diagnostic turns, §6.3). `off_slice` keeps its name: no claim in the domain's scope. |
| `agents/learn-tutor.js` | `plannerSystem(kind)`. `plannerSystem('nanogpt') === PLANNER_SYSTEM`, byte-identical, pinned by a snapshot test. `plannerSystem('journey')` is the same lines with the subject line and the authored-content line made generic (point at the section's cards on the canvas, never invent cards), plus three journey lines: teach inside `context.journey_context.section`; name an upcoming section instead of teaching it early; never mention a level or a score. `TUTOR_TOOL` and `ACTION_TYPES` are unchanged in LP1. |
| `learn-tutor-routes.js` | `/plan`: `context.journey_context` present → `plannerSystem('journey')`, otherwise unchanged. `/evaluate`: a body with `journey_id` takes the journey evidence path (§5). Tiering, caching and streaming are unchanged. The journey prompt is its own stable cached prefix, the same for every journey, because the topic sits in the user message. |
| `LearnTutor.jsx` | `useTutor({ …, domain, journey })`. `active` additionally covers a board with a live journey. The interaction resolver runs at the top of `turn()`, the one entry shared by typed and voice turns (§7). The store hydrates its events from the journey on load. |

### 3.2 Journey domain behaviour

- **Claims in scope for a turn**, in this order:
  1. the open question's claim;
  2. the target block's `journey.claims`, stamped on the block at materialization from the step's claims;
  3. otherwise `defaultClaims`, which is the current section's `expected_evidence` claims (at most 4).

  In the setup states (`intake`, `diagnostic`, `path_review`) nothing is in scope outside an open probe. A free
  question there routes `off_slice` and gets a `respond_text` answer with no cards.
- **Cards are blocks already on the canvas** (current and completed sections).
  - `show_authored_card` / `focus_part` reveal them.
  - `suggest_practice` needs a block with an `activity`.
  - `suggest_depth` has no ladder, so the validator rejects it at the resource stage.
  - `suggest_dive` and `return_from_dive` work as they do today.
  - The Tutor never generates artifacts. Generation belongs to the materializer and to the learner's own slash
    commands.
- **Policy is unchanged:** one question per turn, `no_quiz`, the two-turn Socratic limit, navigation consent and
  the critical-path rules.

### 3.3 `journey_context`, journey turns only

```
journey_context {
  phase            setup | active | paused | dive
  goal             one sentence
  section          { title, purpose, target_concepts: [labels], expected_evidence: [claim ids] } | null
  upcoming         [titles] ≤ 6
  constraints      { depth, minutes, coding, math }
}
```

`dive` (plan Task 14, §13) is a Rabbit Hole opened from a journey section. Its `section` is that section, with the dive's concepts as `target_concepts` and the dive's claims as `expected_evidence`, and `upcoming` is empty.

The context is bounded to about 1.5 KB. It never carries the whole path, evidence history or raw intake answers.
It is the tenth Teaching State key, present only on journey turns. The pinned nine-key test stays as it is for
nanoGPT, and a new test pins the ten keys for journeys.

### 3.4 Preservation gates (run on every Tutor commit; LP1 acceptance needs all of them)

1. `learn-tutor.test.mjs`: golden traces 11/11, unchanged.
2. The whole existing web and control-plane unit suites, unchanged.
3. Snapshot tests: `plannerSystem('nanogpt') === PLANNER_SYSTEM`, and the nanoGPT `plannerContext` output is
   deep-equal to the pre-change output on the corpus inputs.
4. `node e2e/tutor-corpus-run.mjs --stage lp1` (stub, free): 44 turns, pass 1.000, golden 9/9, every gate input
   0, compared with a baseline run from main.
5. `e2e/tutor-slice-check.mjs` in stub mode.
6. The paid benchmark gate needs an explicit GO and budget. Its scope is owner question N2.

---

## 4. Dynamic journey claim registry

- **Who writes it.**
  - The Diagnostic Planner creates it: the concepts of the topic's scope, two or three claims each.
  - The Path Planner may add concepts and claims (`concepts_added`).
  - The Section Planner may add claims for its own section's concepts.
  - Every addition goes through `validateRegistry`.
- **Shape.** The same as the nanoGPT `CLAIMS`, so `/evaluate`, JEV, the larger evaluator and the derivation run
  unchanged.
  - Ids: `<concept-slug>/<claim-slug>`, at most 120 characters.
  - Field limits match `validateEvaluateBody`.
  - Caps: 16 concepts, 40 claims.
  - `cues` is optional: up to 12 lowercase phrases for the selector.
- **`drawn`** is the canonical case the path will teach first, for example "a single-feature spam/not-spam
  example with threshold 0.5". A diagnostic probe set on a different case can therefore earn
  `demonstrated_in_transfer` honestly (R4). When a section materializes, the Section Planner may sharpen `drawn`
  only on claims that have no events yet.
- **Immutable once used.** A claim that has any event is never edited or deleted, because evidence points at it.
  A changed claim is a new id.
- **"Current-section registry"** means the subset in scope for the turn (§3.2). The derivation always runs over
  the whole journey registry.

---

## 5. Server evidence design

- **Store.** `learning_journeys.evidence_json = { seq, events[] }`. Events have the learn-tutor-evidence shape
  `{ seq, concept, claim, result, kind, idea?, misconception_id?, prerequisite?, settled, evaluator, source, ref }`.
  Sources are `free_text` and `journey_probe`; the cap is 500 events (`ponytail:`).
- **The single write path:** `appendJourneyEvidence(env, journey, evaluation, ref)` in
  `control-plane/src/learn-journey-store.js`.
  1. It imports the pure `reconcile()` from `web/src/learn-tutor-evidence.js`.
  2. It reconciles with the journey registry.
  3. It persists with the journey's optimistic `revision`.
  4. It returns `{ events, seq, states, transitions }`.

  No other code writes journey evidence. Under the R6 pause, `reconcile()` is called as it is today. Its event
  writes do not depend on the registry. Registry-scoped `states` and `transitions` come with plan Task 7, once
  `reconcile` takes the claims parameter.
- **Free text:** `POST /api/learn/tutor/evaluate { app, board, journey_id, message, claims: [ids], answering, question? }`.
  1. The worker loads the journey (owner only) and checks that every claim id is in its registry.
  2. It rebuilds the spec from the registry: claim content, gaps from prerequisites, and `prior_misconceptions`
     from the stored events. Client-sent claim content is ignored.
  3. It runs the existing `evaluateFreeText` ladder.
  4. It calls `appendJourneyEvidence` and returns the evaluation plus `journey: { events, seq, revision }` (the
     revision the evidence was saved at, so the browser's next journey action needs no 409 retry; final review A-m6).

  An answer that names an open probe (`probe_id`) is graded on that probe's own claims, all of them (at most 3, in
  probe order); `claims` from the body is never used for probe-tagged evidence (final review A-m4 + C-m2, ruling).
- **Multiple choice and prediction:** the same route with `{ journey_id, probe_id, option_id }`. The answer key
  lives only on the server (`diagnostic_json` / `section_plan_json`). The result is a deterministic claim-level
  event: `evaluator: 'deterministic'`, `source: 'journey_probe'`, `pass` | `fail` | `misconception`, and `kind`
  `demonstrated_in_transfer` only when the probe is marked `transfer: true`.
- **Client.** On a journey turn, `runTurn`'s `settle` adopts `result.journey.events` as the store's events, then
  derives states with the journey registry, so there is no second client-side reconcile. The rest of the
  conversational store stays in `sessionStorage` under a journey key (`small.tutor:<org>:<email>:journey:<id>`):
  open question, turns, Socratic counts and dive bookkeeping. Constraints on the journey are not persisted in LP1
  (`j.constraints` stays `[]`, so a stated `no_quiz` does not reach the path planner); deferred to LP2 (final review
  C-m3, ruling).
- **Evaluator unavailable.** An error adds nothing (existing rule). The diagnostic walker moves on, and the path
  planner is told the evidence is missing, so it keeps prerequisites and skips nothing.

---

## 6. Learning Journey Orchestrator

### 6.1 Intent (deterministic, `journeyIntent(text)`)

`journeyIntent` lives in the resolver extension `control-plane/src/learner-intent-journey.js` (R7). When Motion's
resolver is on main, `resolveLearnerTurn` sets `structured_interpretation.journey = journeyIntent(request_text)`.

It returns `{ kind, topic, constraints: { minutes?, depth?, style?, coding? }, skip_setup }`, where `kind` is one
of `learning_journey | focused_skill | quick_overview | fast_start | direct_question | none`.

- The patterns extend the router's `LEARN_INTENT` ("I want to learn", "teach me", "walk me through", "I want to
  understand", "I need to learn … (from scratch)", "show me how to build … from scratch", "teach me how … works",
  "give me a N-minute … overview of", "skip setup and (just) start").
- "What is X?" and other factual questions give `direct_question`.
- Home keeps its existing negatives: "learn attention" and "how do I learn faster" are not journeys.
- `ponytail:` regex. A missed broad intent falls back to the normal responder, which can offer "Learn this as a
  guided path". A model classifier comes when misses show it is needed.

It runs on the Home teach path and on the Learn composer of a canvas that has no live journey and no nanoGPT
Tutor. A broad intent on a board that already has a live journey opens a `clarification` tray: "Continue <topic>
or start <new topic>?".

### 6.2 Intake (deterministic bank, no model call)

- **Slots:**
  - `goal`: understand the intuition · build it from scratch · use it in a project · prepare for an exam or
    interview · something else (free text);
  - `familiarity`: completely new · seen it before · understand parts of it · fairly comfortable;
  - `depth`, which carries a default time: quick visual overview (~10 min) · guided understanding (~30 min) ·
    deep dive (~1 h) · build-first.
- **At most three questions.** Slots the request already states are skipped, and a slot is never asked twice.
  A quick overview asks at most one question. "Skip" fills the remaining slots with defaults marked `default`.
- **Familiarity is self-report.** It steers the diagnostic. It is never evidence (R4).

### 6.3 Diagnostic

- **Planner** (`LEARN_TASKS.journey_diagnostic`, Sonnet 5.5 at effort low, one call). Input: the topic, intake
  slots and grounding. Output:
  - the registry;
  - an ordered probe ladder of 2-4 probes, from prerequisite to advanced;
  - optionally one topic-specific background question in the tray ("How comfortable are you with probability?").
    It is recorded as self-report only.
- **Probes.** Kinds are `mcq | prediction | explain_back` in LP1. Each probe names 1-3 claims, and a probe meant
  to be strong evidence is set on a case other than `drawn` and marked `transfer: true`.
- **Walker** (deterministic):
  1. Ask the middle-information probe first.
  2. On settled transfer evidence, step up the ladder. On a fail, uncertain result, gap or `non_attempt`, step
     down.
  3. Stop after 3 probes, on two consistent results, or on "Skip the assessment".

  On a skip, every concept stays `not_yet_observed` (spec §8).
- **Answers are Tutor turns.** Showing a probe sets the Tutor store's `open = { action_id: probe.id, claim,
  text: prompt }`.
  - A typed or spoken answer runs `runTurn({ answering, plan: false, domain })`: LearnerTurn → evaluate (journey
    path, §5) → server evidence → derived states, with no planner call.
  - An option click posts `probe_id`/`option_id` to the same evaluate route.
  - Either way the walker then picks the next probe. No per-answer grading is shown, because this is placement.

### 6.4 Path Planner

- **Initial draft:** `LEARN_TASKS.journey_path` (Opus 5.5). **Revisions and adaptations:** `journey_adapt`
  (Sonnet 5.5 at effort low).
- `journey_adapt` escalates to `journey_path` when:
  - `validatePath` or the invariants reject the result;
  - the evidence the change rests on is contradictory (an `uncertain` claim with both settled passes and
    negatives);
  - the planner returns `ambiguous: true`.
- **Input:** the topic, intake (raw request kept), derived states per claim plus settled pass counts (never a
  score), constraints, the previous version for a revision, and any pending learner edit text.
- **Output:** a full LearningPath version, plus `concepts_added` and a `learner_note` when something changed.
- **The server enforces the invariants (§9.2) before it writes.** A violating draft is rejected and the previous
  version stays.

### 6.5 Section Planner and materializer

1. On accept, and after each section completes (following any adaptation), the current section is planned with
   `LEARN_TASKS.journey_section` (Sonnet 5.5 at effort low), giving a SectionPlan.
2. The server stores only the **current** section's plan.
3. The browser materializes it:
   - It appends a level-1 heading `{ type: 'heading', text: title, journey_section_id }` at the end of the flow.
   - It reserves one skeleton slot (`canvas.reserve`).
   - Each step runs through the existing `/api/learn/artifact` (`generateArtifact`) with the step's slash
     command and request.
   - The resulting block is inserted under the heading, stamped `journey: { section_id, step_id, claims }`.
4. Paid primitives come back as proposals and become a tray `generation_proposal`. They are never generated
   automatically.
5. **Save before commit (owner LP1 blocker, 2026-10-05).** `section_materialized` is posted only after `canvasApi.persist()` confirms that the board is saved (locally, and remotely when shared). The journey row then records `generation_state: 'generated'`. A crash in between leaves the section resumable from the stamped blocks, with no false built state and no regeneration (plan Task 15).
   **In-app leave (final review B-C1).** A learner who leaves mid-section inside the app (Home, the sidebar, a Rabbit
   Hole remounting the page) is covered too: before the save, every block the run reports must be on the canvas, or the
   section fails as `canvas`; an unmounted canvas inserts nothing (null) and saves nothing (`{ ok: false }`); and
   `useJourney`'s unmount disposes the controller, which then sends nothing more (no paid artifact call, no post). The
   next visit resumes from the stored copy and records the section once. A recorded heading is never replaced: a
   `section_materialized` with another heading id is refused (409, same id idempotent; final review B-M1).
   **Heading slot (final review B-M2).** LP1 reserves the heading's slot at the view (`canvas.reserve`, then the heading
   inserted into it), which is equivalent to appending at the end of the flow while section 1 lands on an empty flow.
   LP2 must append each later section after the previous section's last block.
6. A failed step leaves the section current with `generation_state: 'planning'`, the steps already done stay,
   and the tray offers Retry. Nothing is generated for any other section.

### 6.6 State machine (server `journeyStep`, shared pure module)

```
(none) ── intent learning_journey | focused_skill | quick_overview ─▶ intake
(none) ── fast_start ─▶ intake(defaults) ─▶ path drafted ─▶ auto-accept ─▶ active(section 1)
intake ── slots done | skip ─▶ diagnostic          (pending: diagnostic)
         quick_overview: diagnostic skipped ─▶ path_review
diagnostic ── walker stops | skip ─▶ path_review   (pending: path)
path_review ── edit ─▶ path_review v+1             (pending: revise)
path_review ── accept ─▶ active: section 1 current (pending: section → materialize)
active ── continue past section s ─▶ s completed ─▶ adapt? (0-1 call) ─▶ next current (pending: section)
active ── path edit ─▶ active v+1 (future sections only)
active ── dive opened ─▶ paused ── return ─▶ active
active ── last section completed ─▶ completed
any   ── planner failure ─▶ same state, error set, inputs kept, Retry (never random cards)
```

A transition is legal only if `journeyStep(journey, event)` returns a next state. The server refuses anything
else with 409.

---

## 7. Tutor Prompt Tray and interaction resolver

### 7.1 Tray

The tray is one component, `TutorPromptTray`. It renders in the `LearnSlash` slot above the composer
(`ask.jsx:950`), styled like the `data-slash-result` box. It is not persisted: `trayFor(journey, signals)`
recomputes it after every event and reload.

```
tray: null | { id, mode, prompt, options[{id,label}] 0-5, free_text, probe_id?, slot?, busy?, error?, dismissible }
mode: intent_intake | diagnostic_probe | path_preview | check_in | clarification | next_step | branch_choice | generation_proposal
```

- `path_preview` offers Start · Make it shorter · Go deeper · More practical · More mathematical.
- On resume, `next_step` offers Continue · Quick recap · Revisit <previous concept>.
- Tray prompts are spoken only from LP5 (ruling; final review C-m3): in LP1 the tray is read, not spoken, because
  `voice.say` runs a Tutor turn, not speech alone.

### 7.2 Interaction resolver (R1, D6)

`resolveTurn(text, tray, journey)` → `{ kind, option_id?, edit? }`. It runs at the top of `useTutor.turn()`, so
typed and voice turns share it. The deterministic rules (`resolveTurnRules`) are part of the resolver extension
`learner-intent-journey.js` (R7) and surface as `structured_interpretation.interaction`. Since plan Task 12, typed and spoken turns on a journey canvas enter `useTutor.turn()`, which runs it once per turn. The only other caller is the topic tray of a journey that is still being started.

| Order | Rule | Result |
|---|---|---|
| 1 | Normalized text equals an option label, an ordinal ("the first one", "option 2", "B") or a unique option-label prefix | `tray_answer` |
| 2 | Accept words in `path_preview` ("start", "looks good", "let's go", "go ahead", "yes") | `tray_answer` (start) |
| 3 | A bare skip or cancel ("skip", "skip this", "skip the assessment", "skip setup", "not now", "cancel", "never mind") | `cancel`, which means skip the current step and is never a path change |
| 4 | An edit verb with a path object ("skip probability", "move implementation earlier", "add Python", "make it 20 minutes", "make it shorter", "more practical", "less maths", "go deeper", "do Python first") | `path_edit` |
| 5 | Tray open and none of the above matched | a model call, `LEARN_TASKS.journey_resolver` (Sonnet 5.5 at effort low), giving one of the five categories (`clarification_needed` when unsure) |
| — | No tray open | rule 4 only; anything else is a normal Tutor turn |

Punctuation never decides. "Can we skip this?", "Why is this section here?" and "Could we do Python first?" go
through rules 3-5 like any other text.

Results:
- **`tray_answer`:** the journey event (intake slot, probe answer, preview choice).
- **`path_edit`:** a path revision. During `intake` or `diagnostic` the edit is stored as `pending_edits` and
  applied when the path is drafted.
- **`unrelated_question`:** a normal Tutor v2 turn with the journey domain. The tray stays open and the journey
  state is unchanged.
- **`cancel`:** skip or dismiss the current step.
- **`clarification_needed`:** a `clarification` tray: [Answer the question] [Change the path] [Ask the Tutor].

---

## 8. Adaptive Contents Rail (D5, R2)

- **Model:** `pathEntries(path, prevPath, blocks)` → `[{ id, n, title, purpose, status, changed, heading_block_id }]`.
  - `status` is one of `completed | current | upcoming | optional | skipped | needs_review`.
  - `changed` (`added | moved | changed | null`) comes from diffing the version with the previous one, and
    clears once the learner has seen it.
- **View.** One presentational `PathList` is used by the rail now and by the later Path button → drawer/sheet.
- **Placement.** For a live journey with a path, the rail mounts **inside the canvas frame** at its right edge
  (`LearnPage.jsx:1290` frame, `edgeInset` reserved whether or not the panel is open). It therefore sits next to
  the Learn agent chat panel instead of disappearing under it.
  - Collapsed, it is a narrow strip of status glyphs: ✓ completed, ● current, ○ upcoming, a dashed ring for
    optional, ↺ needs_review, a highlight dot for changed.
  - Expanded, it shows titles, on hover or focus, or with a "Path" button so it works by keyboard.
  - It is pinned open during `path_review` and for one viewing after an adaptation.
- **Clicks.**
  - A materialized section (completed or current) calls `canvasApi.showSection(heading_block_id)`.
  - An upcoming section expands its purpose inline and never generates anything.
- **Canvases without a journey** keep today's heading rail, unchanged.
- **Narrow layouts.** The LP1 journey rail is desktop (`lg` and up). Below `lg`, the tray still works and a Path
  sheet comes before production (N3).

---

## 9. Schemas

### 9.1 LearningJourney (`learning_journeys` row, API shape)

```
LearningJourney {
  id                 "lj_<uuid>"
  scope              { org, owner_user_id, app, board }   (§10.2; owner_user_id = users.id)
  state              intake | diagnostic | path_review | active | paused | completed
  pending            null | diagnostic | path | revise | section | adapt | resolve
  error              null | { op, message, retryable: true }
  request            { raw_user_message, topic, intent, channel: text | voice }      raw_user_message never in analytics
  grounding          { kind: 'topic' }   (repository grounding: LP-T)
  intake             { slots { goal?, familiarity?, depth?, minutes?, coding?, math?, background? }, source { <slot>: stated | answered | default }, goal_text? }
  constraints        Tutor CONSTRAINTS (no_quiz …), persisted for the journey
  pending_edits      [text] ≤ 5                         (edits made before a path exists)
  registry           { concepts { [id]: { label, names[], prerequisites[] } }, claims { [id]: claim } }
  diagnostic         { probes [Probe + server-only key], asked [{ probe_id, result }], skipped, background? }
  evidence           { seq, events[] }
  path_version       0 until the first draft
  active_section_id  null until accepted
  section_plan       SectionPlan | null     (current section only)
  paused_for?        { child_app, concept }
  revision, created_at, updated_at, archived_at?
}
```

### 9.2 LearningPath (`learning_path_versions` row; immutable)

```
LearningPath {
  journey_id, version, goal, target_topic, grounding
  intake_ref { journey_revision }
  diagnostic_evidence_refs [seq]
  sections [1-12 LearningPathSection]
  current_section_id | null
  change { source: draft | learner_edit | evidence | dive_return, reason, learner_note?, evidence_refs [seq],
           sections_changed [{ id, op: added | removed | merged | split | reordered | optional | depth | retitled }] }
  created_at
}
LearningPathSection {
  id (stable across versions), title ≤80, purpose ≤240, kind: core | refresher | bridge | review,
  target_concepts [ids], prerequisites [ids], expected_evidence [{ claim, kind: explain | predict | apply | transfer }] ≤4,
  estimated_minutes?, depth: overview | guided | deep,
  status: upcoming | current | completed | optional | skipped | needs_review,
  generation_state: not_generated | planning | generated,
  heading_block_id?, adaptation_reason?, from? [ids]
}
```

**Invariants**, in `validatePath(next, prev)`, shared by the browser and the worker:
1. A completed section keeps its `title`, `purpose`, `target_concepts`, `heading_block_id` and its order among
   the completed sections. A shaky completed concept gets a new `review` section.
2. At most one section is `current`, and none before acceptance.
3. Only the current or a completed section may have `generation_state ≠ not_generated`.
4. **A section has no content fields.** Any key outside the schema, such as `blocks`, `cards` or `steps`, is
   rejected.
5. Every referenced concept and claim exists in the registry.
6. The version increments by exactly 1 and carries a `change`.

### 9.3 SectionPlan (current section only)

```
SectionPlan {
  section_id, path_version, learning_objective, target_concepts [ids],
  prerequisite_evidence [{ concept, state }],
  teaching_sequence [2-6 { step_id, role: framing | interactive_visual | explanation | worked_example | prediction | practice | code | transfer_check,
                           make: { command: explain | code | graph | diagram | walkthrough | animate | practice | flashcards, request } | { text },
                           claims [ids] }],
  checks [0-3 Probe with trigger { after_step } | 'before_transition'],
  completion_evidence [{ claim, minimum: attempted | demonstrated_here | demonstrated_in_transfer }]
}
```

### 9.4 Probe

```
Probe { id, kind: mcq | prediction | explain_back | choice, prompt ≤300, options? [{ id, label }] ≤4 (+ "Not sure"),
        claims [ids] ≤3, purpose: diagnose | predict | explain_back | transfer | choose, transfer: boolean, trigger? }
server-only key: key { correct: option_id, misconceptions: { <option_id>: <misconception_id> } }  (probe-level; toClient strips `key`)
```

---

## 10. Persistence

### 10.1 Migration `learn-migrations/0006-learning-journeys.sql`

The migration is additive and re-runnable, and is mirrored into `repository-schema.sql`.

```sql
CREATE TABLE IF NOT EXISTS learning_journeys (
  id TEXT PRIMARY KEY, org TEXT NOT NULL, owner_user_id TEXT NOT NULL, app TEXT NOT NULL, board TEXT NOT NULL,
  state TEXT NOT NULL, topic TEXT NOT NULL, raw_request TEXT NOT NULL,
  request_json TEXT NOT NULL, grounding_json TEXT NOT NULL DEFAULT '{"kind":"topic"}',
  intake_json TEXT NOT NULL, constraints_json TEXT NOT NULL DEFAULT '[]', pending_edits_json TEXT NOT NULL DEFAULT '[]',
  registry_json TEXT NOT NULL, diagnostic_json TEXT NOT NULL, evidence_json TEXT NOT NULL,
  path_version INTEGER NOT NULL DEFAULT 0, active_section_id TEXT, section_plan_json TEXT,
  pending TEXT, error_json TEXT, paused_json TEXT,
  revision INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, archived_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS learning_journeys_live ON learning_journeys (org, owner_user_id, app, board) WHERE archived_at IS NULL;
CREATE TABLE IF NOT EXISTS learning_path_versions (
  journey_id TEXT NOT NULL, version INTEGER NOT NULL, path_json TEXT NOT NULL,
  source TEXT NOT NULL, reason TEXT NOT NULL, evidence_refs TEXT NOT NULL, changes_json TEXT NOT NULL,
  created_at TEXT NOT NULL, PRIMARY KEY (journey_id, version)
);
```

0006 was checked as unused on main 68f02092 (the highest there is 0005) and on every remote branch.

**Applied:** locally only. The shared dev (`rabbit-hole-learn-dev`) and production LEARN_DB wait for an explicit
GO.

**Canvas binding.** Section headings are ordinary heading blocks with a `journey_section_id`; generated blocks
carry `journey`. Extra block fields already survive saves, so the canvas needs no new top-level key.

### 10.2 Identity (R3), resolved by the owner on 2026-10-05

- **The key.** Journeys are scoped by `(org, owner_user_id, app, board)`, where `owner_user_id` is `users.id`: the opaque, stable internal user id that sessions carry as `uid` (auth.js `sessionOf`).
- **Where the id comes from.** Control-plane `/api/me` returns `user_id` beside `{ email, org, orgName }`. For a browser session it is the session `uid`; for a CLI token it is null. The dev and app worker's `devIdentity` forwards it as `userId`. `canvasAccess` (an owned canvas or a pending hole) attaches it to the access object only, as `user_id`. Canvas listings and responses never carry it, and the dev worker's `/api/apps` catalog strips it.
- **Fail closed.** With no id — a CLI token, or the legacy small-cp fallback that answers `/api/me` with 404 — journey GET returns nulls and POST returns 401 `identity_unavailable`.
- **Never shown.** The id never appears in a journey response, telemetry or logs.
- **Canvas ownership is separate.** It stays on the canvas's own `owner_email` check through `authorizedBoardApp`. That is the canvas system's identity, not the journey's key.

**Access.** Only the journey's owner reads or writes it. Viewers of a shared board see the canvas, not the tray
or the path.

---

## 11. Model roles (`LEARN_TASKS`; no ids in schemas)

| Task key | Role | Model | Effort |
|---|---|---|---|
| `journey_resolver` | tray interaction classification, only after the deterministic rules miss | `claude-sonnet-5-5` | low |
| `journey_diagnostic` | registry + probe ladder (+ one background question) | `claude-sonnet-5-5` | low |
| (existing) | diagnostic evaluation: deterministic → JEV → `tutor_evaluator` only on escalation | unchanged | — |
| `journey_path` | initial path; escalation target | `claude-opus-5-5` | default |
| `journey_section` | SectionPlan | `claude-sonnet-5-5` | low |
| `journey_adapt` | revisions and adaptations; escalates to `journey_path` | `claude-sonnet-5-5` | low |
| (existing) `tutor` | per-turn planner, F tiering | unchanged | — |

`LEARN_TASKS` entries gain an `effort` field (additive; `test/learn-models.test.js` is extended). Because of the R6
pause, the five journey roles first live as `JOURNEY_TASKS` in `learn-journey-planners.js`, with the identical
shape. They move into `LEARN_TASKS` in plan Task 7, after the rebase. Every planner
takes an injected `callModel`. Tests and the e2e harness use fixtures through a local-only stub flag
(`JOURNEY_MODEL_STUB=fixtures`, refused unless the worker runs locally, as `OAUTH_MOCK` is).

---

## 12. Voice (D6)

- Voice turns enter `useTutor.turn()` and pass the same resolver as typed turns.
- Tray prompts are not spoken in LP1; they are spoken from LP5 (ruling; final review C-m3). Spoken words are matched
  to option labels by rule 1, then classified by rules 3-5.
- An unrelated spoken question gets a Tutor answer with journey context (two short sentences, the existing voice
  rule), and the tray stays.
- There is one journey state and no voice-only curriculum.
- Voice on journey canvases comes from `useTutor` being active there. The voice code itself is unchanged in LP1;
  the parity e2e is LP5.

## 13. `/dive`

**LP1 minimal context (owner, 2026-10-05):** a hole opened from an active journey section stores `journey: { journey_id, section_id, concept_ids, claim_ids }` in its `dive_json`, beside `origin` (plan Task 14). The child Tutor reads the parent journey read-only and plans around those claims. Its evidence store is keyed per journey (`:dive:<journey_id>`), so holes opened from the same journey share evidence until LP5 (ruling; final review C-m3). It never writes the parent's path or evidence; reconciliation on return is LP5.

### LP5 (full reconciliation)

- A journey hole starts without the parent's evidence for the claim that caused it (LP1, final review C-m4); LP5
  carries that evidence down when the hole opens.
- When a hole opens from a journey canvas, the journey becomes `paused` (`paused_for`).
- The child canvas has no journey and never writes the parent's path.
- On return, the existing Tutor `returned_from` re-check runs with the journey domain, and its evidence goes to
  the parent journey's server store.
- After that, the orchestrator may run one `journey_adapt` with `source: 'dive_return'`.

## 14. Telemetry

- Events follow spec §38, sent as a `small:journey` window event, with the worker logging ids.
- Properties are limited to `journey_id`, `path_version`, `section_index`, `probe_kind`, `result` and `channel`.
- Raw learner text, tutor text and transcripts never appear in events.

---

## 15. Milestones and execution

| Milestone | Scope | Acceptance |
|---|---|---|
| **LP1** | TutorDomain generalization; journey evidence route; `learn-journey.js` pure module (intent, intake, walker, resolver rules 1-4, `journeyStep`, `validatePath`, `validateRegistry`, `trayFor`, `pathEntries`); migration 0006 (local); `/api/learn/journey` with the diagnostic, path and section planners (stub-injectable); resolver model fallback; `TutorPromptTray`; `useJourney`; the journey rail inside the canvas frame; composer and voice routing through `useTutor`; Home `teach()` start; materialization of section 1 | §16, plus the preservation gates in §3.4 |
| LP2 | Path edits during `active`, section completion → next section, retry and failure UX | AT-05, AT-15 complete |
| LP3 | Evidence-driven adaptation, versions shown with learner notes, `needs_review` and review sections | AT-06, AT-09 |
| LP4 | Section checks and the probe policy; `ask_question` with options for the tray (a `TUTOR_TOOL` change, which needs a re-baseline) | AT-07, AT-08 |
| LP5 | Voice parity e2e, resume nudges, `/dive` pause and reconcile | AT-10, AT-11, AT-12 |
| LP-T | Repository-grounded journeys; migrating nanoGPT evidence to the server | owner GO |

**Execution: sub-agent-driven.** One primary owner (this agent) holds this document, integrates and commits each
checkpoint. Focused sub-agents implement contracts and never redesign:

- **SA-Tutor:** §3 and §5, the client-side Tutor modules plus the `/evaluate` journey path. It owns the
  preservation gates in §3.4.
- **SA-State:** §6, §9 and §10, the `learn-journey.js` pure module, migration 0006, the
  `control-plane/src/learn-journey.js` routes, the planners with fixtures, and `LEARN_TASKS`.
- **SA-UI:** §7, §8 and §6.5 on the browser side: tray, `useJourney`, rail, `LearnPage` and `ask.jsx` wiring,
  Home `teach()`, materializer.

**Order (revised for R6/R7):**
1. Before the rebase: plan Tasks 1, 2, 3, 4, 5, 8, 9 and 10. None of them touches the six Tutor-core files.
2. Wait until Avatar/Media's Tutor changes are on main, then fetch, rebase and resolve.
3. After the rebase: plan Task 6 (Tutor domain, browser), Task 7 (Tutor server, plus `JOURNEY_TASKS` →
   `LEARN_TASKS`, plus registry-scoped reconcile), Task 12 (`useTutor` wiring on journey canvases, voice), then
   Task 11 (e2e and gates).
4. If Motion's `learner-intent.js` is on main by then, Task 12 also wires `structured_interpretation.journey` and
   `.interaction` into `resolveLearnerTurn`. Otherwise Parallel does that one-line wiring at integration.

Every checkpoint gets `make test-unit` green and a commit made with `git commit --only` on its own files. The
branch is pushed per checkpoint, and nothing is merged.

---

## 16. LP1 tests

**Unit** (`node --test`, no model):
- **U1 `journeyIntent`:**
  - the spec's broad phrasings give `learning_journey` or `focused_skill`;
  - "What is logistic regression?" gives `direct_question`;
  - "Give me a 10-minute visual overview of logistic regression" gives `quick_overview { minutes: 10, style: visual }`;
  - "Skip setup and start" gives `fast_start`;
  - Home's negatives stay non-journey.
- **U2 intake:** at most 3 questions; stated slots are skipped; nothing is asked twice; a quick overview asks at
  most 1.
- **U3 walker:**
  - 1-3 probes, with step-up and step-down;
  - a skip leaves everything `not_yet_observed`;
  - an evaluator error adds nothing;
  - one multiple-choice fail gives `uncertain`, never `misconception`;
  - a correct non-transfer answer is not `understood`;
  - a settled transfer pass with idea coverage is `understood`.
- **U4 `validatePath` / `validateRegistry`:**
  - every invariant in §9.2;
  - a section carrying `blocks`, `cards` or `steps` is rejected;
  - a claim with events cannot be edited.
- **U5 `journeyStep`:**
  - illegal transitions are refused (a section planned before acceptance, materializing a section that is not
    current);
  - a planner failure keeps the answers.
- **U6 resolver:**
  - "Can we skip this?" gives `cancel`;
  - "Could we do Python first?" gives `path_edit`;
  - "Why is this section here?" with an open tray goes to the model rule (stubbed);
  - exact labels and ordinals give `tray_answer`;
  - accept words give start;
  - punctuation never changes a result.
- **U7 `pathEntries`:** status and changed mapping; an upcoming entry never asks for generation.
- **U8 TutorDomain:**
  - the nanoGPT snapshot tests (system prompt, planner context);
  - the journey domain derives states over its own registry;
  - the journey context has exactly ten keys;
  - the validator rejects a non-canvas card, and `suggest_depth`, in the journey domain.

**Routes** (control-plane, stubbed `callModel`):
- start → intake → diagnostic → path → accept → section plan;
- the journey `/evaluate` path builds its spec from the registry (client claim content ignored), appends events
  server-side and rejects claims that are not in the registry;
- multiple-choice keys never leave the server;
- a path planner failure keeps the answers and gives a retryable error;
- the adapt-to-path escalation conditions;
- owner-only access;
- a revision conflict gives 409;
- the migration applies twice cleanly to an in-memory D1.

**Browser** (`e2e/journey-check.mjs`: local stack, mock sign-in, `JOURNEY_MODEL_STUB=fixtures`, no paid call):
- **J1:** a blank canvas, then "I want to learn logistic regression".
  - Expect: the tray in `intent_intake`, 0 canvas blocks, and no `/api/learn/ask` or `/api/learn/artifact`
    request.
- **J2:** the learner answers intake by clicking, then a diagnostic probe by typing and one by clicking.
  - Expect: `/api/learn/tutor/evaluate` called with `journey_id`, and the server journey holds the events.
- **J3:** the path draft.
  - Expect: the rail lists the sections as upcoming, the path is visible with the Learn agent chat panel open
    (D5), still 0 blocks, and every `generation_state` is `not_generated`.
- **J4:** Start.
  - Expect: section 1 current; exactly one bound heading plus section 1's blocks; one section-plan request; no
    heading, plan or artifact for sections 2..N.
- **J5:** "What is logistic regression?" on a blank canvas.
  - Expect: no tray, and one `/api/learn/ask` request.
- **J6:** "Give me a 10-minute visual overview of logistic regression".
  - Expect: at most 1 intake question and at most 3 sections.
- **J7:** "Skip setup and start".
  - Expect: a minimal path in the rail before any block, then section 1 materializes.
- **J8:** Home "I want to learn logistic regression".
  - Expect: a canvas titled with the topic, `journey.request.raw_user_message` equal to the exact text, and the
    tray open on arrival.

Screenshots of J1-J4, J7 and J8 go to the Figma review page for owner visual approval (D7: no deploy).

---

## 17. New conflicts and owner questions

- **N1 Identity:** resolved on 2026-10-05. Journeys are keyed by `users.id`, plumbed through the server (§10.2).
- **N2 Benchmark gate scope:** resolved on 2026-10-05. There is no paid benchmark now. After Avatar's core lands and Tasks 6-7 generalize the Tutor, run the golden traces, J1-J8 and a small real-model journey corpus, for a total paid spend of at most $2.
- *(superseded)* **N2 Benchmark gate scope.** The free gates in §3.4 run always. The paid corpus benchmark is about $18-30 for
  the full run, and about $3-5 for the routine group on one arm. Which scope, if any, is required before LP1 is
  accepted, given that the nanoGPT prompt and context are byte-identical by test?
- **N3 Narrow layout:** resolved on 2026-10-05. A Path sheet after LP2 is acceptable for LP1, and it is required before production.
- *(superseded)* **N3 Narrow layout.** The journey rail is `lg` and up in LP1. The Path sheet is required before production,
  scheduled after LP2 unless the owner wants it sooner.
- **N4 Tutor cannot generate cards on journey canvases** (unchanged policy). A learner who asks the Tutor to "show
  me a visual of the sigmoid" gets a pointer to the existing section card or to `/graph`. A Tutor
  `suggest_artifact` action would be a `TUTOR_TOOL` change, considered at LP4 together with the tray options.

## 18. LP1 status

**Resolver integration note for Parallel.** Motion's `packages/control-plane/src/learner-intent.js`
(`resolveLearnerTurn`) is not on main (checked at a87b370a), so LP1 Task 12 runs the journey resolver from the
import-free extension directly: `useTutor.turn()` → `journey.handleText` → `interactionInterpretation` (rules 1-4),
then the journey route's rule 5. When Motion lands, the wiring is one line in `resolveLearnerTurn`:
`structured_interpretation.journey = journeyInterpretation(request)`, plus
`structured_interpretation.interaction = interactionInterpretation(text, tray)` when a `tray` input is given. At the
same time the extension's minutes fallback (`OVERVIEW` and `IN_MINUTES` in `learner-intent-journey.js`, marked
`ponytail:`) switches to Motion's `parseDuration`, with hyphen support ("a 10-minute overview") added there.

**Browser acceptance J1-J8 (§16), 2026-10-05, code at ab77965f.** `e2e/journey-check.mjs` on the keyless local stack
(`e2e/journey-local-stack.md`: `alp1-local-app` 8868, `alp1-local-cp` 8869, `JOURNEY_MODEL_STUB=fixtures`,
`SMALL_ENV=test`, the LEARN DB reset for the current 0006), with the generalized Tutor live on journey canvases. Three full
runs, no page error: 57/57 checks twice, then 58/58 after review round 1 added the both-probe-kinds check. The page answers `/api/learn/ask`, `/api/learn/home-ask` and
`/api/learn/tutor/plan` itself (canned) and refuses artifact, voice, assess and image; `/api/learn/tutor/evaluate`
reaches the stack.

| Check | Result | What was asserted |
|---|---|---|
| J1 | PASS | `intent_intake` tray; 0 blocks (storage and DOM); no ask or artifact request; tray clear of the composer. |
| J2 | PASS | Goal, familiarity, depth → `diagnostic_probe`. The typed explain-back goes resolver → rule 5 (`tray_answer`) → the Tutor's plan:false probe turn: one evaluate with `journey_id`, `claims`, `probe_id` and the Tutor's `turn_id`, no planner request, no ask; it answers status `error` (no JEV key, the conservative path) and the GET's stored events stay 0. The mcq and prediction options post evaluate with `journey_id` and `probe_id`, answer `settled`, and the GET shows one event tagged with each probe (2 stored, every one tagged). Both the explain-back and the mcq must have been asked and answered. |
| J3 | PASS | `path_preview`, 8 rail entries all `upcoming`, 0 blocks. A setup question is one Tutor plan request with `journey_context`, answered in the sheet, no card, the tray stays. The pinned list covers nothing at 1440 and 1720, panel open and closed (320 px wide at 1440 open). |
| J4 | PASS | While `section_materialized` is in flight this browser's copy is already saved (4 blocks; private board, no server board PUT) and the GET reads section 1 `planning`; afterwards section 1 is `current` and `generated` with its heading, `section_plan.generation_state` is `generated`, sections 2-8 are `not_generated` with no heading (route or canvas), one heading and 3 explanations, one section plan, no artifact request, no ask in J1-J4. |
| J5 | PASS | Blank canvas question: no tray, no journey, exactly one `/api/learn/ask` (canned). |
| J6 | PASS | 1 intake question, then `path_preview` with 3 entries; no ask. |
| J7 | PASS | No setup tray; the rail shows the path about 30 ms before the first block; section 1 drawn; no ask. |
| J8 | PASS | Home Agent Bar → Learn on the intake tray; canvas titled "Logistic regression"; `raw_user_message` is the typed request; no home-ask or ask. |

**Preservation gates.**
- `make test-unit`: green, 1713 + 948 + 1 + 1 + 26, 0 failures.
- Golden traces (`node --test src/learn-tutor.test.mjs`): 18/18 (the corpus counts 9/9 golden traces).
- Free corpus (`node e2e/tutor-corpus-run.mjs --stage lp1-final`): 33 traces, 44 turns, 0 errored, pass rate 1,
  `failed: []`; against the Task 6 baseline (`corpus-before`), with timings, stage and ids removed, 0 of 44 rows differ
  and the summaries are equal.
- `node e2e/tutor-slice-check.mjs` (stub mode, the Tutor routes scripted in the browser) runs keyless: pointed at the
  stack with `TUTOR_BASE`/`SMALL_CP` and the stack's `TEST_BYPASS_SECRET` in the environment (the script now prefers it
  to `packages/control-plane/.dev.vars`, which is never created or touched for this), it passed: 9 planner turns, 11
  evaluations.

**What the stack lacked.** No model key of any kind (`ANTHROPIC_API_KEY`, `TYPESAFE_API_KEY`,
`VERCEL_TYPESAFE_API_KEY`, `OPENAI_API_KEY`, `FISH_AUDIO_API_KEY`, `ELEVENLABS_*`: checked by name in the vars files and
the binding tables; `/api/learn/home-ask` answered 503). So the journey planners ran their fixtures, no free-text answer
was graded (JEV `error` every time), no Tutor plan came from a model (canned in the page), and nothing was spoken.
Real-model journey corpus: the first attempt was refused at its first call ($0.00, missing workspace header; runner fixed 3c0c670e). The owner then gave GO RERUN for exactly one run (four domains, no fast-start case, $1.90 ceiling); it ran at 6db841fb. Anthropic refused the French Revolution path call: the account credit balance was too low (HTTP 400). This was not the budget guard. Spend: $0.52. 20 model calls, 25 stages, 18 passed. Done: the resolver (3/3 kinds right), logistic regression, binary search and photosynthesis (path failed, so 5 dependent stages were skipped). French Revolution: diagnostic only. Every assertion that ran passed: no cross-domain leakage, clean wording (no mastery, level or ability labels), completed sections byte-identical, only the current section carries generation state, future sections plans only, the path edit respected (skip; added practice), evidence changing future sections only, the Tutor turn on the journey prompt with journey_context and no nanoGPT ids, and the dive context (journey, section, concept and claim ids; origin unchanged). Two validation failures, both prompt gaps, now fixed (66005c2c) with prompt-regression tests: (1) a logistic-regression section check keyed two wrong options to free-text descriptions instead of registered misconception ids; (2) the photosynthesis path named section ids as section prerequisites. Repair use: one binary-search edit adapt said ambiguous and escalated to Opus journey_path, which answered. Prompt caching hit on repeated roles. Not run on real models: the French Revolution path, section, adapt and Tutor stages, and photosynthesis after its path. Section save atomicity is model-independent: it is covered by the unit regressions and J4, not by this corpus. Any further paid run needs the owner's approval and account credit. After the rebase onto main fc8baab0, a targeted API validation (55cb64e5) was again refused at its first call for low credit ($0.00). Under the owner's GO SUBSCRIPTION, the same targeted plan then ran through the Claude Max subscription bridge (e9c13062). This is labelled bridge evidence, not production-exact: tool use is emulated, effort, max_tokens and caching are not applied, and only the model alias is reported. Results: the logistic-regression section validates, with key_ids_registered 1 wrong option mapped and 2 omitted (fix 1 proven on Sonnet via the bridge). The photosynthesis path validates, with 6 sections whose prerequisites and targets are all concept ids (fix 2 proven on Opus via the bridge). The photosynthesis section validates (1 mapped, 2 omitted). Wording and leakage checks are clean throughout. The run stopped at photosynthesis adapt_edit, where the bridge returned HTTP 503 "Invalid subscription model response" (the CLI reply did not parse as JSON). This is a bridge emulation failure, not a validator rejection, and it was not retried. Not run: photosynthesis adapt_edit, adapt_evidence, Tutor and dive; the French Revolution from path onward. Total API spend stays $0.52. Resume (owner GO, 2026-10-06, bridge at baca6935 with parse diagnostics): the photosynthesis adapt_edit failed bridge parsing a second time, and the run stopped as instructed. The preserved diagnostic (2f99e477) shows that Sonnet, through the CLI, emitted tool-call markup (<invoke name="journey_adapt"><parameter name="path">...) rather than the bridge JSON. The emulation asks for one JSON object, while the journey prompts tell the model to call the tool. This is a bridge-format failure, not a validator result. Still not run: photosynthesis adapt_edit, adapt_evidence, Tutor and dive; the French Revolution from path onward.

**Final review fix round, 2026-10-05, code at 1903e7ee.** One dispatch covered the three whole-branch reviews:
B-C1 (an in-app leave mid-section recorded the section built: §6.5 item 5), B-I1 (a section's Retry can no longer be
dismissed or typed away), B-I2 (a cancel at path review hides the tray only until the next turn), C-I1 (a journey hole's
opening question is sent from the dock only, never again from each block composer), A-I1 (`journey_diagnostic` 8000 and
`journey_path` 12000 max_tokens, so an empty-registry draft fits with Opus thinking; `journey_adapt`'s escalation runs
with the `journey_path` cap), B-M1, A-m3 (a planner's output is re-applied once to the reloaded row after a revision
conflict while the same step is still pending, else dropped), A-m4/C-m2 (§5), A-m5 (no production config names
`JOURNEY_MODEL_STUB`; the app Worker sets no `SMALL_ENV`), A-m6 (§5) and C-m5 (`journey-check.mjs` refuses a vars file
with an `_API_KEY=` or `ELEVENLABS_` line).
- J1-J8 again on the keyless stack (LEARN DB reset): 58/58, no page error.
- `make test-unit` green (1721 + 951 + 1 + 1 + 26); golden traces 18/18; free corpus `lp1-final2` against
  `corpus-before`: 0 of 44 rows differ, summaries equal; Avatar pins 8/8 (web) and 17/17 (control plane).
- The journey corpus gains a fifth case, last: a fast start (no diagnostic, empty registry; path, section 1 and one Tutor
  turn). Stub mode: 36 stages, 30 passed, the 4 failures the fixture artefacts listed above. With the new caps the
  pessimistic worst case of every call the run always makes is about $2.61 with fixture-sized inputs (about $3.0 with
  live-sized registries), above the $1.90 ceiling: the per-call guard stops the run before it would pass the ceiling, and
  the owner's four domains run before the fast-start case. The largest single call (a `journey_path` draft) is priced at
  about $0.27-0.30, so the guard refuses only once real spend passes about $1.60.

**Deploy order (release notes; final review A-I2).** LP1 adds learn migration 0006 (`learning_journeys`,
`learning_path_versions`) and a `user_id` field on the control plane's `/api/me`, which the app's journey identity reads.
Before any app deploy of a main that contains LP1:
1. The owner's GO for 0006 on the target `LEARN_DB` comes first. `repository-schema.sql` now includes 0006, so the
   runbooks' `repository-schema.sql --remote` commands (`rabbit-hole-dev.md`, `rabbit-hole-production.md`) apply it too
   and carry that warning.
2. The control plane with `/api/me` `user_id` deploys next.
3. Only then the app.
None of these commands was run by LP1.
