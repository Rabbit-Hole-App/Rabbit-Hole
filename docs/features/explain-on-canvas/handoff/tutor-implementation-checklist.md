# Tutor implementation checklist

**Executable companion to Tutor roadmap v1.3 · Version 1.0 · 6 November 2026**

**Goal:** implement Explain on Canvas as small usable production releases, with a task-level record of changes, owners, dependencies, models, checks and delivery evidence.

**Architecture:** the current React/Vite canvas consumes authenticated server-owned roadmap state. Workers, D1, R2 and a proposed RoadmapJobs Durable Object coordinate versioned proposals, accepted generation, source grounding and recovery. Existing artifact generators, job engines, assessment and usage transports are reused through narrowly scoped adapters.

**Tech stack:** repository JavaScript/JSX, React, Vite, Cloudflare Workers/Durable Objects, D1 and R2; Node test runner for deterministic checks and the repository's approved browser-check runner. No new agent framework or vector database is required. R16 introduces a separately qualified execution service only when that release is implemented.

**Read with:** `tutor-roadmap-v1.3.md`, especially sections 2–6 and its decision register. This checklist supplies the missing engineering detail; it does not replace those product requirements. Later explicit owner decisions take precedence over both. Keep the existing five-role workflow and ownership manifest; do not create an additional approval layer or a fresh advisor chain for every checkbox.

## Contents

- [1 Current baseline and use of this checklist](#1-current-baseline-and-use-of-this-checklist)
- [2 Shared contracts models and preparation tasks](#2-shared-contracts-models-and-preparation-tasks)
- [3 Executable release tasks](#3-executable-release-tasks)
- [4 Verification integration and production evidence](#4-verification-integration-and-production-evidence)
- [5 Coverage and source audit](#5-coverage-and-source-audit)


### Release navigation

- [R1 — Private card feedback and usable Progress](#r1--private-card-feedback-and-usable-progress)
- [R2 — Depth and persistent suggestion settings](#r2--depth-and-persistent-suggestion-settings)
- [R3 — Two-way passage navigation with authorized source identity](#r3--two-way-passage-navigation-with-authorized-source-identity)
- [R4 — Complete bounded Markdown explanation flow, progressed manually](#r4--complete-bounded-markdown-explanation-flow-progressed-manually)
- [R5 — Proposal editing, positioning and existing-card reuse](#r5--proposal-editing-positioning-and-existing-card-reuse)
- [R6 — Automatic next proposals, without card preparation](#r6--automatic-next-proposals-without-card-preparation)
- [R7a — Long Markdown indexing and explicit coverage](#r7a--long-markdown-indexing-and-explicit-coverage)
- [R7b — PDF text and page references](#r7b--pdf-text-and-page-references)
- [R8a — Scoped web discovery and fetched evidence](#r8a--scoped-web-discovery-and-fetched-evidence)
- [R8b — Restricted deterministic calculation](#r8b--restricted-deterministic-calculation)
- [R9 — Optional practice and assessed Progress](#r9--optional-practice-and-assessed-progress)
- [R10 — Evidence-based adaptation and expanded revisions](#r10--evidence-based-adaptation-and-expanded-revisions)
- [R11 — Platform-funded preparation with separate learner settlement](#r11--platform-funded-preparation-with-separate-learner-settlement)
- [R12 — Independently released command adapters](#r12--independently-released-command-adapters)
- [R13 Project canvases](#r13-project-canvases)
- [R14 Editors and shared canvases](#r14-editors-and-shared-canvases)
- [R15 — Images, notes and OCR](#r15--images-notes-and-ocr)
- [R16 — A separate bounded execution service](#r16--a-separate-bounded-execution-service)

## 1 Current baseline and use of this checklist

### 1.1 What was checked

**Final checked main: `9b798f7760b7af5aa2446d281a07eebfc4e10b84`**, in `Rabbit-Hole-App/Rabbit-Hole`. The initial inspection used v1.3’s baseline `4102f8ea0a0a38783e5b79144ef9748152f9ddc1`; main then advanced by eight cleanup-P1 commits during preparation. The complete 55-file delta and new tree were checked, changed files were fetched at the new SHA, and affected task instructions/line references were reconciled. Unchanged source references retain their verified contents. These are source-code findings, not evidence that a Tutor lane or production capability has shipped.

Canonical source prefix: `https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/9b798f7760b7af5aa2446d281a07eebfc4e10b84/`. Append the repository-relative path and `#L<line>` to inspect a cited location. Function/component names remain the primary locator after cleanup shifts lines. Before touching a task, reconcile its references against the actual integration commit.

The reported Windows worktrees, local commits and `C:\Users\cyudhist\Desktop\tutor-ladder-manifest.md` are not visible through GitHub while unpushed. Their status is owner/lead-reported, not independently verified here. Do not replace their working code from this checklist. Compare it, retain completed correct work, and record the actual implementation SHA and test evidence.

All checkboxes start unchecked because this is an execution plan. A proposed path, signature or test is an implementation target, not a claim it exists. A command listed as a future verification step has not been run merely because it appears here.

**Changes incorporated from the final main check:**

- `learn-spend.js:150` now owns `spendCallModel`; new callers must not import it from retiring Tutor routes.
- Next Steps planning and its authenticated route have been extracted. R4 suppresses that retained independent initiative while a roadmap is active. Plain-Chat hook forwarding is still required work: `ask.jsx` still calls `tutor.askStep` at the checked commit.
- `learn-assessment.js` no longer contains the journey keyed/JEV grading branch. R9 adds only a scoped immutable-roadmap quiz scorer before the current unavailable fallback, preserving the removed legacy route behavior and the retained Explain-back/rubric paths.
- Cleanup P1 has merged; that alone is not a P2/P4 interface receipt or the final M0 receipt. Local R1–R3 work remains unverified until its actual commits are supplied.

### 1.2 Decision precedence and cleanup integration

Carry the newer conversation instructions into the implementation records explicitly:

- The Tutor ladder has an owner-provided MVP label, acknowledged by the lead. Use the explicit MVP path; broad CI and the broad gate are recorded as bypassed, never passed. Required affected tests, feature smoke, access/billing checks, preflight and recovery still apply.
- v1.3 requires the applicable **M0 cleanup receipt** before integration. The lead subsequently proposed narrower receipts: P2 plus verified retained interfaces for R1/R3, and P4 plus verified mode/Chat interfaces for R2. That proposal is not an owner decision in the supplied record. If adopted and recorded, use it without waiting for unrelated database-drop phases; otherwise retain v1.3's integration requirement. Independent contracts, components and fixtures continue now. Check actual imports, callers, data and authorization rather than declaring compatibility from filenames alone.
- The Tutor label does not automatically label cleanup P1–P7 as MVP. The supplied lead report keeps cleanup on its ordinary path; record any later explicit owner override before changing that. Cleanup's backfill/drop sequence remains separate from Tutor feature migrations.
- Home teach requests prefill Chat and preserve the full request/context; they do not auto-send. A display title may be truncated without truncating the prompt. No new topic-extraction call is required for that entry point.
- R4 activates only after R1–R3's required behavior is integrated and its relevant D2 routing exception, D43 policy and paid-testing authorization are recorded. Building contracts, fixtures and other independent releases continues meanwhile. The later interactive-explanation D2 override is a separate R12 activation dependency.
- No document edit sets `MVP_ALLOWED_SHA`, runs a migration, drops a table, enables a paid service or raises a spending cap. Prepare concrete candidate-bound owner actions only where current policy actually requires them.

### 1.3 Owners and task states

| Role | Implementation ownership |
| --- | --- |
| Lead | Integration, contract decisions, migration allocation, manifest, shared mounts/configuration and releases. Owns `learn-models.js`, `learn-usage.js`, `LearnPage.jsx`, wrangler files and `check-map.json` unless explicitly delegated. |
| State/Money | Stores, routes, coordinator, authorization, transactions, reservations, settlement, outbox and recovery. Sends exact patches for lead-owned files. |
| UI | Canvas proposal/card controls, Chat/ToC/Progress wiring, keyboard behavior and placement. R1 owns edits to `AdaptiveCanvas.jsx`; other lanes supply coordinated patches. |
| Tools | Source/tool adapters, planner prompts, grounding, safety, typed validation and model-facing inputs. |
| Verifier | Independent review of the integrated candidate and evidence. Engineers also write and run their own relevant tests. |

Use the existing manifest as the one file-writer registry. A task mentioning two roles means coordinated interfaces, not simultaneous writes to the same file. Exact shared-file edits must be assigned before integration. Do not start a duplicate implementation because a branch already contains an equivalent file under another name; reconcile the contract and update this checklist's locator.

A task's status is one of `not_started`, `in_progress`, `implemented`, `locally_verified`, `release_verified`, `production_activated`, or `blocked`. A task can be implemented without being released. The task record stores owner, base SHA, implementation SHA, check commands/executor/results, artifact or log paths and any actual blocker. Unrelated ready tasks continue.

### 1.4 Global constraints

- Keep Auto, Ask and Tutor. Desktop first. Existing Chat controls and right-panel tabs remain; no new standalone demo UI.
- A proposal is an offer with title and description. An accepted skeleton represents committed creation. One Tab accepts one coherent step, not every step in a plan, and does not imply understanding.
- No price is displayed in desktop Tutor proposals. Accept/Tab can charge under the agreed policy. Platform work and unaccepted preparation cost the learner zero; assessment is free. A zero-priced action is explicit, not inferred from its format.
- Whole-step allowance admission is atomic. Existing per-call admission consumes/transfers its allocated hold instead of reserving the learner amount twice. Provider cost, learner charges and refunds remain separate.
- No generated body, answer key or asset is exposed before applicable checks, current authorization and the accepted result's billing entitlement permit it. A checked speculative result remains private before acceptance.
- Hover-only per-card thumbs remain blue when selected; selected state alone does not permanently expose the controls. Imported sources and proposals have no understanding rating.
- ToC records scope, roadmap coverage and navigation; Progress records private self-report or assessed evidence. No personal goal is required.
- No fixed explanation/practice ratio. Answer-later practice does not block independent next content. No inferred mastery from acceptance, cancellation or watching a video.
- Ask, Auto-suggest off, cancellation and End stop the applicable initiative. Accepted work follows documented completion/recovery; pause itself never deletes accepted assets.
- Read the chosen source scope or report incomplete coverage. Source text is data, never tool authority. Do not invent knowledge, citations, execution or answer keys.
- Cache/result versions include relevant content, source, prompt, model and policy identities. Revisions invalidate affected unaccepted work and preserve delivered cards.
- Future rich tools, research, OCR and sandboxing cannot block a source-supported R4. Each enabled capability must bring its own required money, privacy, grounding and safety checks.

### 1.5 Review focus and owning tests

| Failure condition | Required observable behavior | Owning tasks |
| --- | --- | --- |
| Two devices accept/edit/cancel the same version | One valid transition and one purchase; conflicting action receives current state, never duplicate cards | R4 acceptance/store/UI; R5 editing; R11 prepared charge |
| Source changed, repeated quotation, incomplete extraction or private material in a search query | No guessed anchor or fabricated whole-source coverage; no private data egress | R3 anchors; R7 coverage; R8a research; R15 OCR |
| Crash between fact write, event delivery, provider response and board save | Recover from durable state without losing observations or repeating charges/calls blindly | R4 outbox/money/placement; R9 assessment; R11 reconciliation |
| Sharing, forking, revoked access or actor different from board owner | Only permitted delivered content is exposed; progress, proposals and payer remain actor-scoped | R4 privacy; R13 repository access; R14 editor matrix |
| Unsupported claim/key, malicious source, sensitive educational content or uncertain safety result | Grounded or explicitly limited answer; unsupported key unscored; uncertainty held then bounded recovery/refund | R4 validation; R8 tools; R9 assessment; R12 output checks |

## 2 Shared contracts models and preparation tasks

### 2.1 Common identifiers and interface ownership

Keep repository-native JavaScript modules and JSDoc contracts. Names below are proposed integration interfaces unless explicitly marked existing. If a local lane already has a compatible name, the lead records one mapping and all callers use it; do not create parallel implementations.

| Contract | Owner and required fields or semantics |
| --- | --- |
| `RoadmapAccess` | State/Money: authenticated organization, acting learner, board identity, board owner, allowed role and payer. Actor/payer come from the session and policy, never an untrusted request body. R14 expands actual permission resolution. |
| `Depth` | R2: `overview`, `standard`, `deep`; default `standard`. Same setting reaches Chat, appropriate slash paths and roadmap inputs. |
| `SourceRef` | R3: `{source_key, source_rev, kind, anchor}`. Locator only. Resolve through authorized source reading, with `resolved`, `changed`, `missing`, `inaccessible`, `unsupported` outcomes. |
| `acceptRoadmapStep` | R4: `(access, {roadmapId, revision, proposalId, proposalVersion, actionKey})`; validates bound content and commits the accepted transition and whole-step authorization atomically. |
| `admitStepAuthorization` and `consumeStepAllocation` | R4: one aggregate learner hold, per-card allocation and per-call transfer integrated with existing admission. No duplicate held allowance. |
| `withRoadmapProviderCall` | R4: trusted server binding `{proposalVersion, cardId, stage, call, retry, authorizationId}`; deterministic operation identity reaches the transport performing admission. Public clients cannot select an operation ID. |
| `entitledRoadmapResult` | R4: `(access, result)`; checks publication, accepted result version and billing entitlement. Use consistently for polling and every asset/result endpoint. |
| `appendRoadmapEventStatements` | R4: adds an outbox event to the same guarded write/batch as its fact. Assessment integration uses the actual observation commit in R9. |
| `claimRoadmapEvent` / `commitRoadmapEventEffect` | R4: replayable claim lease; processed marker only with/after durable effect. Scheduler recovers commit-before-notify gaps. |
| `saveProposalDraft` / `applyProposalDraft` | R5: preview stored separately; only Apply makes a new proposal version. Esc has no accepted-state mutation. |
| `indexSource` / `readSourceEvidence` | R7: versioned bounded derivatives plus actual authorized original passages and coverage. |
| `researchGap` / `calculateExpression` | R8: bounded public research / restricted deterministic computation. Neither function authorizes arbitrary generation or execution. |
| `bindRoadmapActivity` | R9: content-addressed question/options/key snapshot ID plus integer activity revision. |
| `admitLearnerCharge` | R11: produces/participates in the guarded acceptance batch for already prepared results; never creates another provider operation and never commits independently before acceptance. |
| `startAcceptedCommand` | R12: `(access, binding, payload)` returns typed job/result identity and provider-operation references. Existing job engine retains its generation/rendering responsibility. |

Tool results use `ok`, `partial`, `needs_clarification`, `unsupported`, or `unavailable`, with authorized provenance, coverage and cost metadata where applicable. Only assessment writes graded observations. The runtime registry must reject unavailable formats as well as omit them from model instructions.

### 2.2 Model and transport register

Current facts were checked in `packages/control-plane/src/learn-models.js`: `MODEL` at line 14, `LEARN_TASKS` at line 40, rubric/visual assessment at lines 56–57, explanation roles at lines 88–91, artifact at line 113, `planUsesOpenAI` at line 121, `loggedModel` at line 143 and `promptVersion` at line 230. Locate the named export again after cleanup. `packages/control-plane/src/learn-grade-jev.js:139` is the existing `askJev` transport; its admission currently mints operation IDs at line 150. These are repository configurations, not proof of live provider credentials or availability.

| Work | Proposed or retained role | Model and dispatch |
| --- | --- | --- |
| R1 storage/feedback; source anchors; keyboard; state; calculator; keyed scoring | Deterministic | No LLM. Do not add a call to implement these operations. |
| Subject identification | New `roadmap_subject` | `claude-sonnet-5-5`, effort `low`, logged central task. |
| Roadmap draft and substantial revision | New `roadmap_draft`, `roadmap_revise` | `claude-opus-5-5`, existing default-thinking convention, no silent fallback. |
| Proposal composition and proposal Quick Edit | New `roadmap_proposal` | `claude-sonnet-5-5`, effort `low`; edit mode consumes the current proposal and learner instruction. |
| Index summaries and scoped research planning | New `roadmap_index`, `roadmap_research` | `claude-sonnet-5-5`, effort `low`; deterministic chunking/fetching remains outside the model. |
| Targeted support verdict | New `roadmap_grounding_check` | `claude-sonnet-5-5`, effort `low`; at most one logged Opus escalation for an ambiguous support question. |
| Evidence-informed adaptation | New `roadmap_adapt` | `claude-opus-5-5`; no model call is needed when a deterministic no-change rule applies. |
| Teach-intent routing / contextual safety screening | New Tutor question sets on retained JEV transport | Direct configuration includes `jev-1.13.0`; routing fallback and safety `unknown` have different enforcement. Multi-category safety uses independent questions, not the existing exclusive safe/explicit/graphic choice unchanged. |
| Contextual safety adjudication | New `roadmap_safety_adjudicate` | Proposed `claude-opus-5-5`, one bounded adjudication after eligible screening retry; deterministic policy decides publication. |
| R4 text/table authoring | Retained `artifact` through trusted narrow adapter | Current `LEARN_TASKS.artifact` uses provider `plan` and model `claude-opus-5`; `planModel` can use the explicit OpenAI configuration. Do not claim it already uses Sonnet 5.5. Preserve actual transport/rates unless an explicitly measured task-role change is made. |
| Explain-back assessment | Retained `tutor_rubric` and existing Explain-back assessor | Current `claude-opus-5-5`; assessment is free to learner and remains the single assessed-evidence path. |
| Later interactive explanation | Retained `explain_brief/author/review/repair` | Current Opus 5.5 command roles; own token ceilings and validators, roadmap acceptance adapter only. |
| Later media and source cards | Existing command-specific configuration | Follow each R12 task's actual command path; no universal Tutor model override. Deterministic empty notebook is not a model call. |
| Image/figure extraction | New `roadmap_vision_extract` | Proposed Sonnet 5.5 low with actual image input, qualified in R15; do not send extraction through the grading role. |
| Arbitrary code execution | No LLM for executing submitted code | Separate bounded service in R16; any generated code still has its own authoring and grounding provenance. |

New role token/deadline limits are engineering settings to freeze with the owning task's fixtures and bounded real-model qualification. They are not implied paid-testing approvals. Log role, requested/served model, prompt/policy version, stage, timeout, stop reason, provider operation and measured cost. Explicitly distinguish existing limits from proposed ones in the policy file. Do not copy old numeric budgets into a new approved spending ledger.

### BASE.01 Reconcile active work and prerequisite receipts

**Owner:** Lead. **Depends:** none for inspection; before integrating the first affected release. **Model:** none. **Existing references:** `CLAUDE.md:13` later-decision precedence, `:140` parallel ownership, `:305` MVP policy; `scripts/schema-check.test.mjs:39` CREATE-only Learn migrations. **Files:** read actual manifest and branches; create/update `docs/features/explain-on-canvas/{STATUS.md,checklist.md}` and a release-specific prerequisite receipt. This is not a new feature branch replacing active work.

- [ ] Fetch `rabbit-hole/main`, record its SHA, and compare the affected symbols with this checklist's baseline. Record actual current heads of R1/R2/R3/R4 and cleanup branches; do not reset or checkout over an agent's uncommitted work.
- [ ] Reconcile task IDs below to work already present. Preserve existing compatible modules and tests; record renamed proposed files in one locator map.
- [ ] Record which cleanup changes each release needs. For R1/R3 inspect P2's retained canvas/Chat interfaces; for R2 inspect P4's mode, dispatch and settings interfaces. Add a dependency only for an actual import, caller, data or authorization contract.
- [ ] Allocate additive migration files against current main and active branches. Claude reported 0036/0037/0038 reservations; verify them before using them. Update the consolidated Learn schema and relevant `learnDb()` fixtures in the same feature change. No lane assumes a number in an old draft is available.
- [ ] Assign one writer per shared file, including the R3 mount patch into R1-owned `AdaptiveCanvas.jsx`; record integration patches for lead-owned files.
- [ ] Confirm the lead has recorded the applicable MVP/cleanup instructions and the existing browser, budget, migration and production boundaries. Resolve only the imminent missing record; continue unrelated implementation.

**Checks:** root `node --test scripts/schema-check.test.mjs` after a migration/schema edit; inspect the actual import/caller diff and new migration filename collision. **Completion evidence:** baseline/branch/migration inventory and per-release prerequisite receipt. The compatibility check can be prepared now; it does not itself waive the recorded M0 integration prerequisite.

### BASE.02 Freeze shared contracts and capability registration

**Owner:** Lead + State/Money + Tools. **Depends:** BASE.01 inspection; implementation consumed by R4.01. **Model:** no calls. **Proposed files:** `packages/control-plane/src/roadmap-contract.js`, `roadmap-policy.js`, `roadmap-tools.js`; any web contract facade imports/re-exports the pure shared contract and never duplicates it; exact local names may already exist on the R4 contracts branch. **Existing references:** `learn-models.js:40` task registry; `webpage-screen.js:13–27` thresholds, timeouts and exclusive classification mechanics.

- [ ] Commit one shared schema/enum module matching v1.3's separate roadmap, step, proposal, generation, validation, decision, delivery and billing dimensions. Consumers import it rather than redeclaring strings.
- [ ] Freeze the common IDs, source reference, depth, action replay and result-entitlement contracts with the implementing lanes. Keep external result fields distinct from private audit/usage fields.
- [ ] Put every operational limit in a versioned `ROADMAP_LIMITS`: steps, cards, input/summary bounds, platform quotas, call/token limits, stage deadlines, retries and retention. Treat v1.3's 5/10/15 step ceilings and three-card ceiling as provisional maximums, never generation quotas.
- [ ] Specify an overall checking deadline that includes admitted provider retry and adjudication. A per-call 20-second timeout cannot fit two retries and adjudication inside an unaccounted 30-second job promise. Publish measured readiness separately from card-generation time.
- [ ] Add only enabled capabilities to both the model tool catalogue and server dispatch allowlist. Register source reading/text checks for R4; later adapters append their own entries when qualified.
- [ ] Add central model roles from section 2.2 only when their task is implemented. Preserve existing command roles and logging; inspect prompt fingerprints when behavior changes.

**Checks:** proposed control-plane `test/roadmap-contract.test.js`, `test/roadmap-policy.test.js`, `test/roadmap-tools.test.js`; existing `test/learn-models.test.js`. Assert enum validity, disabled-tool rejection, bounded resource policy, logged role selection and no unsolicited paid dispatch. **Evidence:** shared-contract commit, per-role limits and capability matrix; R4 contracts alone remain unmounted and unreleased.

## 3 Executable release tasks

Each task below is implemented under the shared constraints above. Add meaningful failing fixtures first for new state, permission, money or correctness behavior; then implement and run the named focused checks. Do not write mirror tests for trivial display edits, rerun all broad suites by default, or claim a passing fixture proves real provider quality. Existing and proposed tests are distinguished in the task; proposed checks become executable only after their file and runner setup are implemented.

## R1 — Private card feedback and usable Progress

**Baseline and execution convention for R1–R3.** Existing-code references below were verified against `Rabbit-Hole-App/Rabbit-Hole` final main `9b798f7760b7af5aa2446d281a07eebfc4e10b84`; paths are repository-relative. A test named under **Create** is a proposed deliverable, not a claim that it already passes. Run commands in the specified working directory of the reconciled implementation checkout, never in this source-only audit cache. Browser commands below are for approved CI or an authorized runner: the current repository restriction on Claude local browser automation still applies, and a waived owner try neither waives functional verification nor grants browser-automation permission. These tasks are an implementation companion; no product changes, model calls, migration applications or production checks were performed while writing it.

Claude's user-relayed report says R1–R3 and R4 contracts build on unpushed local branches. Obtain their diffs, ownership manifest, receipts and migration reservations; reuse verified work instead of rebuilding it. This document has not inspected those Windows branches. At the pinned main, the old Tutor remains: `packages/control-plane/src/chat-modes.js:TUTOR_SYSTEM:168`, `packages/web/src/ModeSelector.jsx:70` and `packages/web/src/use-learn-coaching.jsx:TutorSwitch:49`. Consequently local implementation, merge readiness and production activation must have separate statuses. The relayed report proposes release-specific prerequisites: P2 plus retained-interface verification for R1/R3, and P4 mode cleanup plus interface verification for R2. Use those narrower integration prerequisites only after recorded owner adoption; until then v1.3's applicable M0 receipt remains the integration requirement. Independent components, contracts and fixtures can proceed meanwhile. Cleanup has no additional MVP label established by this checklist; follow the recorded owner instruction. Tutor's MVP label is recorded in the relayed report. Production migration and exact-SHA authorization remain owner controlled.

### R1.01 Reconcile the feedback contract and additive schema

**Owner:** State/Money; Lead allocates migration number. **Depends:** local R1 reconciliation; applicable M0/interface receipt before integration, or the proposed P2/interface substitute after recorded owner adoption. **Trace:** v1.3 §§3.2, 4.2, 7; M1.1, M1.6. **Model:** none.

**Existing:** `packages/control-plane/src/chat-message-routes.js:validateFeedback:13` establishes separate answer-feedback validation; `packages/control-plane/src/learn-board.js:authorizedBoardApp:358` delegates access; `packages/control-plane/src/canvases.js:canvasAccess:123` uses owned-canvas access; `packages/control-plane/src/learn-boards.js:saveOwn:234` stores board content independently. **Create:** `packages/control-plane/learn-migrations/<NNNN>-card-feedback.sql`, `packages/control-plane/src/card-feedback.js`, `packages/control-plane/test/card-feedback.test.js`. **Modify:** the current migration manifest/schema inputs only where the checked schema tooling requires them. `<NNNN>` is deliberately unresolved: reported local 0036/0037/0038 reservations are not available-main evidence.

- [ ] Inventory the local schema and implementation, retaining already correct work; assign one migration filename after checking current migration files and all active reservations. Use additive tables/indexes only, with the repository's migration restrictions, and no production execution.
- [ ] Define `FeedbackValue = 'up' | 'down' | null`; store one current value under `(org, learner_user_id, board_id, card_id)`, with server timestamps and a monotonic revision. Null clears the visible rating without creating a mastery observation.
- [ ] Implement `readCardFeedback(env, actor, boardId)` and `setCardFeedback(env, actor, {boardId, cardId, value})`; actor identity comes from authentication, never a posted learner ID. Keep feedback outside `state_json`, card JSON and exportable source metadata.
- [ ] Validate card existence and generated-card eligibility against the authorized saved board. Imported Markdown/PDF/excerpt cards and pending proposals are ineligible even if their visual type overlaps an ordinary generated text/image kind. Document the predicate used for legacy cards.
- [ ] Make repeated writes idempotent in their meaning; use committed server revision/order for last-write-wins behavior. Preserve feedback rows when a card is removed while excluding missing cards from the navigable read model.

**Tests/commands:** in repository root, `node --test scripts/schema-check.test.mjs`; in `packages/control-plane`, `node --test test/card-feedback.test.js`. Named cases: `up-down-clear retains one scoped row`, `same card ID on two boards stays separate`, `imported excerpt cannot be rated`, `deleted card has no navigation target`, and `no model or usage side effect`. **Evidence/done:** migration diff, local schema output and fixture row snapshots show independent privacy keys, default empty state and additive-only behavior. Record the resolved filename before dependent patches merge.

### R1.02 Expose authenticated feedback reads and writes

**Owner:** State/Money; Lead owns route mount. **Depends:** R1.01. **Trace:** v1.3 §§3.2, 4.1–4.2; M1.2. **Model:** none.

**Existing:** `packages/control-plane/src/chat-message-routes.js:chatMessageFetch:42`, `packages/control-plane/src/learn-board.js:authorizedBoardApp:358`, `packages/control-plane/src/canvases.js:canvasAccess:123`. **Create:** `packages/control-plane/src/card-feedback-routes.js`, `packages/control-plane/test/card-feedback-routes.test.js`. **Modify:** Lead applies an explicit mount patch to the actual worker entry point after refreshing its source.

- [ ] Implement `PUT /api/learn/cards/:cardId/feedback` with `{app, board, value}` and `GET /api/learn/cards/feedback?app=&board=`. Return only the acting learner's authorized board entries plus revision; reject unknown properties that pretend to supply ownership or assessment.
- [ ] Resolve app access and the concrete saved board, then validate the card in that board. An accessible app is not sufficient proof of a guessed `board` or `cardId`; retain an owner-only release boundary until a later explicitly qualified editor path.
- [ ] Enforce method, same-origin mutation, JSON size and enum validation before store writes. Return consistent not-available responses for absent versus unauthorized targets, preventing a card existence oracle.
- [ ] Mount independently of `ROADMAP_ENABLED`: feedback is useful before R4 and remains available when roadmap generation is disabled. Set private/no-store response behavior; never expose feedback through shared-board routes.
- [ ] Verify unauthenticated, reader, comment-member, different-org and forged-board requests leave no rows. A revoked owner/session cannot use a stale client snapshot to write; network failure returns an actionable retry state without falsely confirming persistence.

**Tests/commands:** working directory `packages/control-plane`, `node --test test/card-feedback.test.js test/card-feedback-routes.test.js`. Named cases: `owner rates saved generated card`, `foreign board rejects before mutation`, `shared reader cannot enumerate feedback`, `invalid enum and forged actor refused`, `ROADMAP_ENABLED false leaves feedback usable`. Include assertion that injected model and billing spies receive zero calls. **Evidence/done:** request/response fixture transcript and database assertions prove access on both GET and PUT; Lead's reviewed mount diff is part of the receipt, not an untracked instruction.

### R1.03 Build the feedback state client and hover/focus control

**Owner:** UI. **Depends:** R1.01–R1.02 API fixture. **Trace:** v1.3 §§2.5, 3.2; M1.3. **Model:** none.

**Existing:** `packages/web/src/AdaptiveCanvas.jsx:CanvasNode:302`, hover ports at `:439` and keyboard-visible resize at `:454`; `packages/web/src/use-learn-coaching.jsx:useLearnCoaching:19` demonstrates lifecycle-safe subscriptions. **Create:** `packages/web/src/card-feedback.js`, `packages/web/src/CardFeedback.jsx`, `packages/web/src/card-feedback.test.mjs`, `packages/web/src/card-feedback-render.test.mjs`.

- [ ] Implement a learner/board-scoped cache and mutation queue with `value`, saving/error state and server revision. Switching account or board discards the old view; a late response from a previous scope cannot populate the current canvas.
- [ ] Clicking the selected thumb sends null; clicking the other thumb replaces the value. Serialize or version optimistic writes so a delayed first response cannot undo a later click. On failure restore the last confirmed value and expose retry.
- [ ] Render exactly one pair using `data-card-thumbs`, `data-card-thumb="up|down"`, `aria-pressed` and meaningful accessible labels. Use the application's blue selected treatment for either direction; neither assessment green nor red represents this self-report.
- [ ] Match the required presentation precisely: hover reveals the pair; keyboard focus within the pair reveals it; selection alone never keeps it visible after pointer and focus leave. Keep buttons reachable by normal focus navigation and show a visible focus ring.
- [ ] Stop card-drag/selection event propagation where needed without swallowing ordinary Tab. Do not make feedback accept a proposal, mutate generated content, invoke a planner or emit an assessed-evidence event.

**Tests/commands:** working directory `packages/web`, `node --test src/card-feedback.test.mjs src/card-feedback-render.test.mjs`. Named cases: `toggle selected value clears`, `late response cannot reverse newer choice`, `scope switch ignores old response`, `selection does not force opacity`, `focus-visible buttons have pressed labels`. Browser visibility is checked in R1.06 rather than inferred from SSR classes alone. **Evidence/done:** deterministic state transition assertions plus rendered semantics; the recorded UI reference explicitly distinguishes pointer hover, keyboard focus and selected state so later browser checks cannot inadvertently demand permanent visibility.

### R1.04 Mount feedback on generated cards without changing content

**Owner:** UI; this R1 lane owns `AdaptiveCanvas.jsx`. **Depends:** R1.03; Lead-provided learner/board/access props. **Trace:** v1.3 §§2.5–2.6, 3.2; M1.4. **Model:** none.

**Existing:** `packages/web/src/AdaptiveCanvas.jsx:LessonBlockCard:905`, `PdfCard:631`, `FileCard:670`, top-level component `:1591`; `packages/web/src/learn-slash.js:CARD_OF:71`; `packages/control-plane/src/shared-privacy.js:sharedBlock:24` and `sharedState:35`. **Modify:** `packages/web/src/AdaptiveCanvas.jsx`, `packages/web/src/card-feedback.js`; Lead applies any required `LearnPage.jsx` prop wiring. **Create:** generated-card eligibility cases within `packages/web/src/card-feedback.test.mjs`.

- [ ] Centralize the generated-card eligibility predicate and mirror its server rules. `CARD_OF` is a starting inventory, not provenance: a PDF excerpt can look like a text card and must remain excluded.
- [ ] Pass scoped feedback state to the card host without writing `feedback`, `understood`, learner IDs or cache data into blocks. Mount after the generated body and reserve appropriate interaction space without changing source card placement.
- [ ] Hide controls on shared/view-only surfaces, unaccepted proposals and imported source cards. Pending generation placeholders do not claim that there is completed content to rate; after successful delivery the same generated card identity becomes eligible.
- [ ] Support reload, undo and deletion using the actual card ID. Deletion hides its entry without creating a charge reversal; undo can recover the existing self-report when the same card returns.
- [ ] Give the R3 lane a reviewed component mount seam for its chip and temporary source highlight. It submits a patch to the owner rather than editing `AdaptiveCanvas.jsx` concurrently; verify both controls remain discoverable and do not obstruct resize/ports.

**Tests/commands:** working directory `packages/web`, `node --test src/card-feedback.test.mjs src/card-feedback-render.test.mjs`; run the proposed browser script in R1.06 on the integrated candidate. Named fixtures cover generated text/table/quiz/explanation, imported Markdown/PDF/excerpt, pending proposal, failed placeholder, shared reader and restored card. **Evidence/done:** before/after saved-board JSON has no feedback fields; screenshots show the pair only under eligible generated cards and confirm existing canvas actions continue to work.

### R1.05 Add current-canvas self-reports to Progress without a goal

**Owner:** UI. **Depends:** R1.02–R1.04. **Trace:** v1.3 §§2.5, 3.2; M1.5. **Model:** none.

**Existing:** `packages/web/src/LearnProgress.jsx:LearnProgress:28`, goal-dependent `read:49`, `no_goal` rendering at `:82`, existing assessed rows at `:125`; private stripping in `packages/control-plane/src/shared-privacy.js:sharedState:35`. **Modify:** `packages/web/src/LearnProgress.jsx`. **Create:** `packages/web/src/learn-progress-feedback.test.mjs` and, if extraction aids testing, `packages/web/src/learn-progress-feedback.js`.

- [ ] Render a distinct “Your feedback” section from the feedback read model, not `fetchProgress(goalId)`. It is present for no-goal, loading, error and ready goal states; no goal must not suppress the independent feedback request.
- [ ] List current-canvas generated card title/kind and Understood or Still unclear, with navigation only to currently present cards. Null ratings disappear; deleted cards produce no dead link; use an explicit empty message when there are no ratings.
- [ ] Preserve the existing no-goal explanation and Set a goal action. Keep assessed skill counts, evidence history and pending assessment messages unchanged; a thumb does not increment demonstrated skills or create an observation.
- [ ] Refresh the section after a confirmed mutation, reload and another tab's update. A feedback fetch failure has its own retry/error state and must not replace previously loaded assessed Progress or suggest that saved answers were lost.
- [ ] Keep ToC and Progress as separate tabs. Do not make opening Progress send Chat, enable Tutor, create a goal or navigate the camera unless the learner activates a card link.

**Tests/commands:** working directory `packages/web`, `node --test src/learn-progress-feedback.test.mjs src/card-feedback.test.mjs`. Named SSR/model cases: `no_goal contains feedback and Set a goal`, `feedback does not change mastery counts`, `two canvases do not mix ratings`, `removed card has no focus action`, `feedback error leaves assessed panel intact`. **Evidence/done:** no-goal and goal screenshots, zero assessment-write spy calls, and a fixture showing the same self-report rendered with clearly separate assessed evidence.

### R1.06 Verify and record the independently releasable feedback slice

**Owner:** Verifier; Lead owns classification and release receipt. **Depends:** R1.01–R1.05, applicable M0 receipt plus retained-interface verification; P2 substitutes only after recorded owner adoption. **Trace:** v1.3 §§3.2, 8, 11.3; M1.6. **Model:** none.

**Existing:** `scripts/schema-check.test.mjs:2` documents its command; `scripts/ci/check-map.test.mjs:7` loads executable classifications; `packages/web/e2e/canvas-skeleton-check.mjs:1` supplies a local-only, keyless browser harness pattern. **Create:** `packages/web/e2e/card-thumbs-check.mjs`, `docs/features/explain-on-canvas/receipts/r1.md` and evidence assets. **Modify:** `scripts/ci/check-map.json` through Lead, feature STATUS/checklist/parked records.

- [ ] Build a real saved-board browser fixture with generated and imported cards, two learner sessions, no-goal and goal states. Intercept model endpoints and fail the run if a model request escapes the fixture.
- [ ] Assert hidden-before-hover, visible-on-hover, blue selected state, hidden-after-leave despite selection, visible-on-keyboard-focus, click/reload persistence and clear/reload behavior. Test actual computed visibility and interaction, not only class names.
- [ ] Exercise a second tab, source/card deletion, unauthorized GET/PUT, share page and fork. Inspect shared response JSON as well as screenshots; no feedback value or learner identity may leak.
- [ ] Register new executables with the appropriate local/keyless tier; record retained-interface verification for canvas card rendering, access, Progress and board sharing. A missing cleanup receipt blocks integration of affected code, not independent fixture work.
- [ ] Produce a receipt with exact candidate SHA/build, migration filename/state, test logs, screenshots, no-model statement and recovery preparation. Mark local proof separately from preview/production smoke and apply the common owner-controlled release procedure.

**Tests/commands:** root: `node --test scripts/schema-check.test.mjs scripts/ci/check-map.test.mjs`; `packages/web`: `npm run build`, then `BASE=http://127.0.0.1:8848 SMALL_CP=http://127.0.0.1:8849 node e2e/card-thumbs-check.mjs`. The local stack must already be configured as the checked harness requires; do not relabel a local-only check as a production smoke. **Evidence/done:** focused assertions pass at the integrated SHA, and a separate environment-appropriate authenticated smoke demonstrates the deployed value when deployment is authorized.

## R2 — Depth and persistent suggestion settings

### R2.01 Define Depth once and carry it into actual Chat prompts

**Owner:** Tools; State/Money integrates request validation; Lead owns registry changes. **Depends:** reconciled R2 work; P4 mode cleanup and retained prompt interfaces, plus the applicable M0 receipt unless the narrower release prerequisite is adopted by the owner. **Trace:** v1.3 §§2.2, 3.3, 6.1; M2.1–M2.2. **Model:** reuse `LEARN_TASKS.chat` and the existing picker (`ASK_MODELS`); no new role or paid call required for deterministic tests.

**Existing:** `packages/control-plane/src/chat-modes.js:chatFields:106`, `chatSystem:179`; `packages/control-plane/src/learn-models.js:ASK_MODELS:25`, `LEARN_TASKS:40`, `promptVersion:230`. **Create:** `packages/control-plane/src/agents/chat-depth.js`, `packages/control-plane/test/chat-depth.test.js`. **Modify:** `packages/control-plane/src/chat-modes.js` and its existing test; refresh and modify the actual ordinary-Chat call sites that construct `resolved`/`chatSystem` input.

- [ ] Export `DEPTHS`, `normalizeDepth(value)` and `depthSystem(depth)` for `overview|standard|deep`, default Standard only when omitted. Reject unsupported explicit values rather than silently normalizing them.
- [ ] Define Overview as concise orientation/key relationships, Standard as an appropriately complete explanation with useful examples, and Deep as additional reasoning, prerequisites and nuance within the requested scope. Do not translate Depth into mandatory verbosity, a step quota or irrelevant advanced material.
- [ ] Include `depth` in `chatFields`' early presence check as well as returned validated fields; today a depth-only request would return null. Thread it through every surviving Chat path to the actual system input after P4 cleanup.
- [ ] Preserve the learner's instruction verbatim and keep source text as data. Depth augments style/content depth; it must not override Ask's answer-only behavior, manufacture a roadmap or restore the retired syllabus planner.
- [ ] Version the prompt change through the existing `promptVersion` mechanism and capture actual model-request bodies in tests. Explicit model selections and transport/billing roles remain unchanged.

**Tests/commands:** working directory `packages/control-plane`, `node --test test/chat-depth.test.js test/chat-modes.test.js`. Named cases: `depth-only body is retained`, `invalid depth rejected`, `default standard`, `overview/deep changes outgoing system`, `learner instruction survives`, `Ask remains answer only`. **Evidence/done:** request snapshots show distinct snippets at the final transport seam, with a prompt-hash change when snippet text changes. A toolbar screenshot alone does not satisfy this task.

### R2.02 Persist per-canvas Depth and per-learner Auto-suggest

**Owner:** State/Money; Lead allocates migrations/mounts. **Depends:** R2.01; retained coaching actor/revision contract. **Trace:** v1.3 §§3.3, 4.2; M2.3–M2.4. **Model:** none.

**Existing:** `packages/control-plane/src/learn-coaching-store.js:readCoachingState:56`, controls at `:74`, `applyCoachingAction:336` and revision-guarded batch at `:352`. **Create:** `packages/control-plane/src/learn-user-settings.js`, `<NNNN>-user-settings.sql`, `<NNNN>-canvas-depth.sql` under the current migration directory, and `packages/control-plane/test/learn-user-settings.test.js`. **Modify:** coaching store/routes and `test/learn-coaching-store.test.js` after reading the retained candidate versions.

- [ ] Add a learner-scoped Auto-suggest sidecar and an `(org, learner, board)` Depth sidecar. Resolve stable authenticated user IDs; explicitly document organization scope for identity isolation while keeping the preference consistent across that learner's canvases.
- [ ] Implement authenticated `GET/PUT /api/learn/settings` with `{autoSuggest:boolean}` and revision. No supplied user ID changes whose row is updated. Sidecar defaults are explicit and deterministic for existing learners.
- [ ] Return settings alongside retained coaching controls and Depth for the requested board. Add `set_depth` through the retained guarded action mechanism, writing sidecar and relevant revision together; stale actions must not partially update the sidecar.
- [ ] Keep old `tutor_enabled` state distinct from the new preference during reconciliation. Do not copy one arbitrary canvas's toggle into a global setting without a documented deterministic migration decision, and never reactivate removed planner behavior.
- [ ] Reserve unique migration filenames against the local manifest; avoid altering historical CHECK constraints. Complete local schema verification and route tests, leaving remote application to the authorized owner procedure.

**Tests/commands:** root: `node --test scripts/schema-check.test.mjs`; `packages/control-plane`: `node --test test/learn-user-settings.test.js test/learn-coaching-store.test.js`. Named cases: `Depth differs across canvases`, `Auto-suggest follows learner across canvases`, `other learner isolated`, `stale set_depth writes nothing`, `replayed action stable`, `unauthenticated settings refused`. **Evidence/done:** fixture database records and API responses prove the two different scopes; explicit default/backfill policy and resolved migration numbers are attached to the receipt.

### R2.03 Synchronize settings and show controls only for deployed behavior

**Owner:** UI. **Depends:** R2.02 fixtures; P4 mode/interface receipt and applicable M0 receipt unless the owner adopts the narrower release prerequisite. **Trace:** v1.3 §§2.1, 3.3; M2.5–M2.7. **Model:** none.

**Existing:** `packages/web/src/ModeSelector.jsx:MODES:13`, component `:19`, Tutor-only switch `:70`; `packages/web/src/use-learn-coaching.jsx:useLearnCoaching:19` uses BroadcastChannel/visibility refresh; `packages/web/src/ask.jsx:AskPanel:273`. **Create:** `packages/web/src/DepthControl.jsx`, `packages/web/src/depth-control.test.mjs`. **Modify:** mode selector, coaching hook/client and composer; extend existing `learn-coaching-controls.test.mjs` after refreshing it.

- [ ] Place a three-option Depth control beside existing composer controls with keyboard operation and accessible current selection. Retain Auto, Ask and Tutor and the existing ToC conversation treatment; avoid new mock layouts or a second settings panel.
- [ ] Rename the applicable switch to Auto-suggest, bind it to `settings.autoSuggest`, show it in Auto/Tutor and hide it in Ask. Keep any temporary test alias only with an explicit removal task.
- [ ] First identify the deployed suggestion behavior surviving cleanup. If none exists before R4, persist the preference but hide the toggle until it controls an available capability; R2 must not imply automatic roadmap steps or speculative generation exist.
- [ ] Extend synchronization with learner-scoped settings messages plus board-scoped Depth messages. Clear caches on sign-out/account switch, ignore other identities, refresh on visibility, and ensure second-device settings are re-read at the server's next initiative boundary.
- [ ] Update saved/offline/error/undo copy to the right field: “Auto-suggest off” refers to the global preference; “Suggestions paused” remains the independent explicit-pause state. Switching the preference on must not erase a cancellation pause.

**Tests/commands:** working directory `packages/web`, `node --test src/depth-control.test.mjs src/learn-coaching-controls.test.mjs`. Named cases: `Auto and Tutor show applicable toggle`, `Ask hides toggle`, `no capability hides inert toggle`, `global update reaches second canvas`, `Depth stays on original canvas`, `pause remains after enable`, `other learner broadcast ignored`. **Evidence/done:** component captures and state tests record visibility against real capability state, not a permanently enabled mock; cross-tab persistence is demonstrated in R2.06.

### R2.04 Pass Depth through supported artifact dispatch

**Owner:** Tools; UI supplies dispatch values. **Depends:** R2.01–R2.03. **Trace:** v1.3 §3.3; M2.2, M2.5. **Model:** reuse `LEARN_TASKS.artifact` (`provider: plan`, configured `ASK_MODELS.auto`, currently `claude-opus-5`), through existing `loggedModel`; no new role.

**Existing:** `packages/web/src/learn-slash.js:generateCommand:190`, `runLearnCommand:210`; `packages/control-plane/src/learn-artifact.js:artifactFetch:168`, `generateArtifact:77`, model input/system at `:87–93`; registry artifact entry `packages/control-plane/src/learn-models.js:113`. **Modify:** those dispatch/route modules and existing artifact/slash tests. **Create:** `packages/control-plane/test/artifact-depth.test.js` if an isolated seam test is clearer.

- [ ] Snapshot the selected Depth when the learner submits a supported command and send it in `generateCommand`; later toolbar changes do not mutate an in-flight request. Ordinary Chat body wiring uses the same captured value.
- [ ] Validate Depth at `artifactFetch`, pass it to `generateArtifact`, and add the shared snippet to actual author input. Do not merely store a field in an unused context object.
- [ ] Enumerate which deployed artifact commands use semantic Depth and test representative text/table paths. For unsupported deterministic/media commands, document no-op behavior explicitly; Depth is not permission to change paid duration, format or accepted bound.
- [ ] Preserve existing command selection, clarification and brief/Generate flows. Material changes requested after a reviewed brief follow that command's revision rules; R2 introduces no alternate generation approval path.
- [ ] Ensure retry/repair receives the same Depth and learner request as the original attempt. Keep usage feature and provider operation identities unchanged; adding a prompt snippet must not invoke an extra model call.

**Tests/commands:** `packages/control-plane`: `node --test test/artifact-depth.test.js`; `packages/web`: `node --test src/learn-slash.test.mjs`. Add named cases `captured Deep reaches artifact system`, `repair keeps original Depth`, `invalid depth rejected before model`, `unsupported deterministic command unchanged`, `explicit learner args preserved`. **Evidence/done:** captured outgoing request demonstrates the Depth snippet at the transport seam and exactly the original number of calls; the receipt lists the supported command subset instead of promising all future adapters.

### R2.05 Persist Depth through both `/explain` paths, including v2

**Owner:** Tools/State; Lead owns `LearnPage.jsx`. **Depends:** R2.01, R2.04. **Coordination:** R3.03 edits the same job record; freeze the shared metadata patch together, not as a mutual prerequisite. **Trace:** v1.3 §3.3; M2.5. **Model:** reuse `explain_brief` and `explain_author`, both `claude-opus-5-5`, existing reviewed `/explain` transport; no new role.

**Existing:** `packages/web/src/learn-slash.js:runLearnCommand:311`, `packages/web/src/LearnPage.jsx:startExplain:1120`, `packages/control-plane/src/explain-job.js:validateCreate:180`, `create:319`, `packages/control-plane/src/explain-brief.js:prepareStage:49`, `packages/control-plane/src/explain-author.js:authorStage:138` and `authorCall:109`. **Modify:** these modules, `packages/web/src/explain-client.js`, existing `test/explain-job.test.js`, brief/author tests and web dispatch tests.

- [ ] Extend `startExplain(prompt, {depth,...})`, client payload and `validateCreate`. Persist validated Depth in the durable job before work starts, defaulting only older jobs or omitted requests to Standard.
- [ ] Include Depth in the creation request fingerprint at `create:321`. Reusing a request ID with different Depth must conflict rather than silently replay a differently specified job.
- [ ] Append the shared snippet to both `prepareStage`'s brief request and `authorCall`'s request. Carry it through approval, refinement, restart, retry and edit; a job's captured setting is not rebound to a later canvas preference.
- [ ] Preserve typed/Quick Edit `startExplain`-first dispatch and existing reviewed brief/Generate semantics. V2-disabled fallback still carries Depth through the artifact path; no R4/R12 exception is implied by this task.
- [ ] Have Lead integrate the `LearnPage.jsx` patch alongside R3 metadata once. Verify the persisted server job, final brief input and final author input, not only the initial browser request.

**Tests/commands:** `packages/control-plane`: `node --test test/explain-job.test.js test/explain-brief.test.js test/explain-author.test.js`; `packages/web`: `node --test src/explain-client.test.mjs src/learn-slash.test.mjs`. Named cases: `Deep survives durable restart`, `brief and author both see Deep`, `changed-depth replay conflicts`, `v2 disabled fallback retains Overview`, `approval still required`. **Evidence/done:** recorded mocked transport bodies and restart fixtures prove both paths. Any small real-output Depth comparison is separately bounded under existing paid-test authorization; no unapproved spend is required to finish deterministic implementation.

### R2.06 Verify settings scope, actual prompt inputs and cleanup integration

**Owner:** Verifier; Lead integrates classification/receipt. **Depends:** R2.01–R2.05, applicable M0 receipt and P4 retained-interface verification; P4 alone suffices only after recorded owner adoption. **Trace:** v1.3 §§3.3, 8; M2.7. **Model:** deterministic checks use none; optional authorized output comparison reuses the exact existing Chat/artifact/explanation roles.

**Existing:** `packages/web/e2e/canvas-skeleton-check.mjs:1` documents keyless local harness; `packages/web/src/ask.jsx:AskPanel:907` sends multipart and `:909` JSON request bodies; `scripts/ci/check-map.test.mjs:7`. **Create:** `packages/web/e2e/composer-controls-check.mjs`, `docs/features/explain-on-canvas/receipts/r2.md`. **Modify:** check-map through Lead.

- [ ] Record Ask payload and final mocked model input for Overview/Deep; test JSON and applicable attached-context request paths. Exercise ordinary Chat without accepting a Tutor offer and assert no roadmap initiation.
- [ ] Run `/explain` with v2 enabled through brief, approval and result, then with v2 disabled through the fallback. Fail if the claimed setting disappears at any seam or the brief approval is bypassed.
- [ ] Change Auto-suggest on canvas A, open B, reload and use a second tab/session. Verify one learner's global preference and independent canvas Depth; include stale write and offline recovery without another learner's contamination.
- [ ] Verify Auto/Ask/Tutor labels, suggestion-toggle capability gating, cancellation pause and existing composer controls against the current UI. Do not reintroduce old syllabus/Tutor route callers removed by P4.
- [ ] Record local branch reconciliation, resolved migrations, applicable cleanup receipt, supported depth paths and the actual model-sample allowance/result if one was run. Do not treat an unexecuted budget proposal as paid-test permission.

**Tests/commands:** root: `node --test scripts/schema-check.test.mjs scripts/ci/check-map.test.mjs`; `packages/web`: `npm run build` and `BASE=http://127.0.0.1:8848 SMALL_CP=http://127.0.0.1:8849 node e2e/composer-controls-check.mjs`. Run the focused server/unit commands from R2.01–R2.05 once on the integrated candidate. **Evidence/done:** exact-SHA logs, request-body captures, screenshots, and scoped database snapshots distinguish persistence proof, prompt-input proof and any real-output comparison. Integration readiness does not claim production activation.

## R3 — Two-way passage navigation with authorized source identity

### R3.01 Capture exact Markdown and selected-PDF anchors

**Owner:** UI/Tools. **Depends:** reconciled local R3 work; retained source viewer interfaces. **Trace:** v1.3 §§2.4, 3.4, 6.2; M3.1. **Model:** none.

**Existing:** `packages/web/src/file-doc-highlights.js:markdownHighlightSource:7`, `markdownHighlightBody:14`; `packages/web/src/learn-wiki-highlights.js:quoteFromRange:12`, `locateQuote:26`; `packages/web/src/pdf-anchor.js:textAnchor:71`; `packages/web/src/pdf-excerpt.js:excerptOf:46`, `excerptChatRef:147`; `packages/web/src/AdaptiveCanvas.jsx:addToChat:4045`. **Create:** `packages/web/src/source-ref.js`, `packages/web/src/source-ref.test.mjs`.

- [ ] Define `SourceRef = {source_key,source_rev,kind,anchor}` and `sourceRefFromSelection(board, selection)`. Markdown uses immutable stored file identity/revision plus exact quote and context; PDF uses the existing source hash, page and normalized text/rectangle anchor.
- [ ] Capture at the actual selection/submit moment, before selection disappears. Keep viewport position separate from source location; dragging, resize or later scroll never changes the frozen anchor.
- [ ] Implement `resolveSourceRef(ref, source)` as a discriminated result: `resolved`, `changed`, `missing`, `inaccessible` or `unsupported`. Require matching immutable identity and revision before using quote placement.
- [ ] Correct the legacy reuse hazard: `locateQuote` currently chooses the first best-scoring occurrence even when context does not match. Wrap or extend it with uniqueness/context checks; ambiguous duplicates or mismatched source versions cannot produce a guessed jump.
- [ ] Support readable Markdown and existing selected PDF text excerpts only. Preserve PDF extraction-origin limitations; a rectangle/crop alone does not authorize OCR or claim whole-document reading. Keep code/image/source extensions for their later adapters.

**Tests/commands:** `packages/web`: `node --test src/source-ref.test.mjs`. Named cases: `Markdown survives rerender`, `repeated quote requires context`, `ambiguous duplicate unresolved`, `changed hash never relocates`, `PDF page and rectangle survive zoom`, `unsupported crop has no invented text`. **Evidence/done:** fixtures captured from actual current Markdown/PDF viewer data, immutable input/output snapshots and strict duplicate tests demonstrate exact anchoring without a model or a new retrieval subsystem.

### R3.02 Authorize, validate and index references with board saves

**Owner:** State/Money. **Depends:** R3.01 contract; Lead migration allocation. **Trace:** v1.3 §§3.4, 4.2, 6.2; M3.2. **Model:** none.

**Existing:** `packages/control-plane/src/pdf-excerpts.js:readSource:39`, `highlightAnchor:87`; `packages/control-plane/src/learn-boards.js:saveOwn:234`, save/index batch seam at `:247`; `packages/control-plane/src/canvas-refs.js:indexStatements:52`. **Create:** `packages/control-plane/src/source-refs.js`, `packages/control-plane/test/source-refs.test.js`, migration `<NNNN>-source-refs.sql` in the current migration directory. **Modify:** board-save path; Lead applies any route/schema-manifest patch.

- [ ] Implement `validateSourceRef(value)` for bounded structural input and a separate authorized resolver. Reuse PDF geometry limits where appropriate, but do not mistake structural anchor validation for access authorization.
- [ ] Verify source identity/revision against authorized server readers and board ownership. Client-provided quotes, hashes or source IDs are claims to check; a `source_ref` never grants access to source bytes.
- [ ] Store a derived source-to-card index with board identity, generated card ID, source identity/revision, anchor and resolution status. It is rebuilt from validated saved relationships and contains no feedback, assessment or private roadmap binding.
- [ ] Add index statements to the same guarded save batch as board content. A stale save updates neither card reference nor index; a deleted card/source removes or invalidates its navigable entry without rewriting historical delivered content.
- [ ] Support multiple explanation cards per passage and deterministic return-target ordering. Bound reference count/anchor payloads before database writes; a failed validation does not leave half an index.

**Tests/commands:** root: `node --test scripts/schema-check.test.mjs`; `packages/control-plane`: `node --test test/source-refs.test.js`. Named cases: `source and index commit together`, `stale board save changes neither`, `foreign source refused`, `hash mismatch marked changed`, `card deletion removes return target`, `multiple cards retain separate identities`. **Evidence/done:** local schema and transaction fixtures show no partial index after conflict/error; the receipt records the resolved migration number and does not imply remote application.

### R3.03 Carry source metadata through creation, jobs and delivery

**Owner:** UI/Tools/State by manifest; Lead owns `LearnPage.jsx`. **Depends:** R3.01–R3.02. **Coordination:** R2.05 shares the job-record patch; neither task waits for the other’s completion. **Trace:** v1.3 §3.4; M3.3. **Model:** reuse existing artifact and explanation roles; tests use injected transports, no new role.

**Existing:** `packages/web/src/InlineAiEditor.jsx:submit:302`, frozen request at `:313`; `packages/web/src/learn-slash.js:generateCommand:190`, v2 branch `:311`; `packages/web/src/LearnPage.jsx:startExplain:1120`; `packages/control-plane/src/explain-job.js:validateCreate:180`, `create:319`; `packages/web/src/explain-client.js:explainPendingBlock:54`, `explainResultBlock:72`; `packages/control-plane/src/learn-artifact.js:artifactFetch:168`. **Modify:** these modules and corresponding tests; no unrelated Animation implementation.

- [ ] Extend both typed selected-source and Ctrl/Cmd+K Explain requests with frozen `source_ref`. Preserve ordinary Add to Chat builders, selected text and the original learner instruction; do not substitute a whole-board reference.
- [ ] Validate and authorize the source at job/artifact creation. Normalize server-verified metadata before persist/dispatch; refuse unavailable/changed selections with a recoverable limitation instead of silently stripping provenance.
- [ ] Include normalized source reference in explain-job request fingerprint and persisted record. A replay with different anchor/revision conflicts; a durable restart retains the exact original relationship.
- [ ] Stamp pending and delivered blocks with the validated reference through both v2 and fallback. Verify `explainResultBlock` merges preserve it while honoring existing card/board/job identity checks, and reload reconstructs the same relationship.
- [ ] Coordinate one Lead patch for `startExplain` carrying Depth and source reference together. Preserve reviewed brief/Generate behavior and existing result publication controls; adding a navigation field cannot make an unaccepted result public.

**Tests/commands:** `packages/control-plane`: `node --test test/explain-job.test.js test/source-refs.test.js`; `packages/web`: `node --test src/explain-client.test.mjs src/learn-slash.test.mjs src/source-ref.test.mjs`. Also run `node --test src/inline-ai-session.test.mjs` with the new `selection snapshot survives editor close` case. Named cases include `source ref survives restart and result`, `different-anchor request replay conflicts`, `v2 disabled artifact stamps same ref`, `unavailable source refuses before generation`. **Evidence/done:** end-to-end request/job/block snapshots show the same verified identity at every seam; model spies confirm no extra generation or publication bypass.

### R3.04 Add card-to-source and passage-to-card navigation

**Owner:** UI; R1 owner/Lead applies canvas mount patch. **Depends:** R3.01–R3.03. **Trace:** v1.3 §§2.4, 3.4; M3.4–M3.5. **Model:** none.

**Existing:** `packages/web/src/AdaptiveCanvas.jsx:LessonBlockCard:905`, `FileCard:670`, `PdfCard:631`; `packages/web/src/learn-wiki-highlights.js:rangeFromOffsets:39`, `paintHighlights:60`; `packages/web/src/file-doc-highlights.js:placeHighlights:22`; `packages/web/src/pdf-anchor.js:toViewport:13`. **Create:** `packages/web/src/SourceRefChip.jsx`, `packages/web/src/source-ref-navigation.js`, `packages/web/src/source-ref-navigation.test.mjs`. **Modify:** actual Markdown/PDF viewer components after refreshing their source; submit narrow `AdaptiveCanvas.jsx` patch to its assigned owner.

- [ ] Show a subtle hover/focus source chip with “Go to source” for a reference-bearing delivered card; expose equivalent keyboard-accessible card action without overcrowding feedback, resize or other existing controls.
- [ ] Resolve access/version first, then focus the correct source card/page and temporarily highlight only the verified range. Clear the temporary highlight on timeout, source switch and unmount; do not write it as the learner's persistent highlight.
- [ ] Add “View explanation” on passage interaction using the derived index. Navigate to an existing permitted delivered card; multiple matches choose the newest still-present eligible card deterministically, with a usable route to other matches if shown.
- [ ] On changed, missing, inaccessible or unsupported source, display the specific available limitation and keep the learner in place. Never substitute a same-named document or closest quote, and do not reveal unauthorized source title/body in error copy.
- [ ] Do not add automatic camera motion merely because a reference/card arrives, and do not draw a connection for every source relationship. Preserve source/body selection, existing highlight editing and ordinary canvas navigation.

**Tests/commands:** `packages/web`: `node --test src/source-ref-navigation.test.mjs src/source-ref.test.mjs`. Named cases: `explicit action focuses exact page`, `temporary highlight clears`, `newest live explanation wins`, `deleted target excluded`, `changed ref does not move camera`, `no arrival-driven navigation`. **Evidence/done:** integration screenshots and callback assertions prove both directions on current viewers; keyboard operation works without requiring a mouse hover.

### R3.05 Sanitize source references for sharing and forks

**Owner:** State/Money; Verifier checks privacy. **Depends:** R3.02–R3.04. **Trace:** v1.3 §§2.6, 3.4, 4.2; M3.2, reusable source portion of M12.3. **Model:** none.

**Existing:** `packages/control-plane/src/shared-privacy.js:sharedBlock:24`, `sharedState:35`; `packages/control-plane/src/learn-boards.js:forkState:474`, `forkSource:533`, `fork:587`; `packages/control-plane/src/pdf-excerpts.js:readSource:39`. **Modify:** shared sanitization and fork reference handling; extend `packages/control-plane/test/source-refs.test.js`, `test/shared-canvas-privacy.test.js` and `test/canvas-forking.test.js` after reading their current fixtures.

- [ ] Treat the reference's location metadata and its quote/context as separately reviewable data. Share only the source information the reader is permitted to see; never assume a source reference is universally shareable because generated content is shared.
- [ ] Recheck source access on navigation/body reads. A copied source key or learned hash cannot bypass private file authorization; return an unavailable state without fetching private bytes on the viewer's behalf.
- [ ] When a fork legitimately copies a source, repoint its reference through the actual authorized old-to-new mapping and preserve revision/anchor only when identity is equivalent. Otherwise retain a safe inaccessible/changed locator or omit it according to the contract; never infer a copy from a filename match.
- [ ] Strip private roadmap/step, feedback and assessment fields while preserving permitted delivered content and headings. A source link does not cause a fork to inherit an owner's private teaching state.
- [ ] Cover owner duplicate, signed-in fork, anonymous shared reader, revoked source access and source deletion. Previously delivered explanations remain content under normal access; historical references visibly lose resolution instead of rewriting the explanation.

**Tests/commands:** `packages/control-plane`: `node --test test/source-refs.test.js test/shared-canvas-privacy.test.js test/canvas-forking.test.js`. Required named cases: `shared ref cannot reveal private quote`, `fork repoints only authorized copied source`, `same name different hash is not a match`, `source revoked before navigation`, `private learner fields absent`. **Evidence/done:** inspect raw shared/fork JSON and authorized source-read logs, not screenshots alone; zero private bytes are returned across the negative matrix.

### R3.06 Verify current viewers, reload and immutable-source failure states

**Owner:** Verifier; Lead owns check map and release receipt. **Depends:** R3.01–R3.05; applicable M0 and retained source/access/interface receipt; P2 substitutes only after recorded owner adoption. **Trace:** v1.3 §§3.4, 8; M3.6. **Model:** none in fixtures; any real generation smoke uses the existing authorized command allowance.

**Existing:** `packages/web/e2e/source-references.test.mjs` exists but is not proof of this new passage contract; `packages/web/src/source-references.js:sourceReference:7` is a different existing citation utility, not the proposed `source-ref.js`; local harness precedent `packages/web/e2e/canvas-skeleton-check.mjs:1`. **Create:** `packages/web/e2e/source-ref-check.mjs`, `docs/features/explain-on-canvas/receipts/r3.md`. **Modify:** check-map through Lead.

- [ ] Use real rendered Markdown and a supported PDF excerpt fixture, select exact passages, submit through typed and Quick Edit `/explain`, complete the mocked v2 brief/Generate/result path and verify two-way navigation after reload.
- [ ] Repeat the selected-source contract with v2 disabled to prove fallback coverage. Test duplicate paragraphs, multi-page PDF text, source-card movement, resizing and highlight cleanup without claiming whole-PDF planning.
- [ ] Upload a new immutable source/version and test deliberate replacement/deletion/reference resolution. Uploading another file alone does not magically mutate the old immutable source; the test must name the replacement mapping or retained historical-source state it exercises.
- [ ] Exercise revoked access, shared-reader and fork cases from R3.05 and inspect returned source bodies. Check multiple explanations, removed targets and keyboard focus; no broken link may silently navigate elsewhere.
- [ ] Register executables, record integration with R1 card controls and R2 metadata, and attach exact SHA/build, source fixture hashes, screenshots, cleanup/interface receipt and remaining source limitations. Keep whole-PDF planning in R7b and OCR in R15.

**Tests/commands:** root: `node --test scripts/schema-check.test.mjs scripts/ci/check-map.test.mjs`; `packages/web`: `npm run build`, then `BASE=http://127.0.0.1:8848 SMALL_CP=http://127.0.0.1:8849 node e2e/source-ref-check.mjs`. Run R3's focused server/unit commands once on that candidate. **Evidence/done:** both navigation directions, both explanation routes, reload and each failure state have named passing assertions; a source-reference screenshot without verified version/access behavior does not close the release.

## R4 — Complete bounded Markdown explanation flow, progressed manually

R4 is one usable release: invitation → accepted plan → a checked text/table proposal → one authorized purchase → delivered independent cards → manual continuation and stopping. Its backend contracts can be built while R1–R3 integrate. R5 editing, R6 automatic proposals, long-source/PDF indexing, research, calculation, practice, speculative preparation and richer commands are not prerequisites. All APIs, `roadmap-*` modules, tables and tests below are **proposed implementation targets**, unless explicitly identified as existing. Existing references were first inspected at `4102f8ea0a0a38783e5b79144ef9748152f9ddc1`, then checked against the final main delta through `9b798f7760b7af5aa2446d281a07eebfc4e10b84` (cleanup P1). Changed spend, Next Steps, Tutor-route, worker and LearnPage modules were freshly fetched at the latter SHA; unchanged references retain their verified lines. Re-open the candidate versions before implementing; P1 extraction does not establish completion of later cleanup stages. Commands below run from the repository root and name tests to create where marked proposed; their presence here is not a claim they have run. Node fixture tests may run locally. All browser/e2e commands below are instructions for CI or an explicitly authorized runner, respecting the repository’s local browser-automation restriction; an owner try remains required where release policy requires it.

### R4.01 Freeze the state, access, budget and model contracts

**Owner:** Lead, with State/Money and Tools review. **Depends:** relevant cleanup interface receipt; R1–R3 local contract reconciliation. **v1.3:** §§3.5, 4.1–4.3, 5.5, 6; D2, D10, D14, D30, D35, D38, D43, D45. **Legacy:** M4.1–M4.4, M4.23, M5.1. **Model:** no calls; register proposed `roadmap_subject`/`roadmap_proposal`/`roadmap_grounding_check` as `claude-sonnet-5-5`, low effort; `roadmap_draft`/`roadmap_revise` and bounded support adjudication as `claude-opus-5-5`; JEV screening/routing uses a separately qualified contract.

**Existing:** `packages/control-plane/src/learn-models.js:40` (`LEARN_TASKS`), `:113` (`artifact`), `:143` (`loggedModel`); `packages/control-plane/src/learn-board.js:358` (`authorizedBoardApp`). **Create:** `packages/control-plane/src/roadmap-contract.js`, `packages/control-plane/src/roadmap-policy.js`, `packages/control-plane/src/roadmap-validate.js`. A web facade may import/re-export the pure shared contract, but must not maintain separate enums or validation. **Modify:** registry only through Lead.

- [ ] Define the exact independent state dimensions in §4.3. Do not collapse generated, checked, accepted, paid and delivered into `publishable`. Include monotonic roadmap revision, integer proposal/result versions, content hashes, original instruction and immutable source-scope fingerprint. Shared validation accepts only checked current `pending` proposals for acceptance.
- [ ] Define `RoadmapAccess = {org, actorUserId, actorEmail, boardId, boardOwnerEmail, role, payerUserId}` from authenticated server access. Before R14, require owner execution; never derive payer or ownership from request JSON. Reject attempts to name another learner’s roadmap even if the board is visible.
- [ ] Specify `acceptRoadmapStep(access,{roadmapId,revision,proposalId,proposalVersion,actionKey})` and common conflict replies `{code,currentRevision,currentProposalVersion}`. Server IDs, actor/version fingerprints and one acceptance identity per proposal version are mandatory. A new client key cannot purchase an already accepted version again.
- [ ] Make one versioned runtime policy cover source bytes, tokens, step/card ceilings, call counts, stage deadlines, work deadline, retry ceilings and retention. Keep 5/10/15 steps and maximum three cards provisional; use fewer when sufficient. Deadline arithmetic includes every admitted screening retry and optional adjudication; no 30-second envelope hiding repeated 20-second fetches.
- [ ] Define the capability registry with R4 local Markdown, text/table generation and text checks only. Unsupported formats return typed limitations and remain absent from UI. Record scoped D2 text/table routing exception and D43 adoption as activation receipts, while contract implementation proceeds without those future activations.
- [ ] Add proposed control-plane `roadmap-contract.test.js` and `roadmap-policy.test.js`, plus a web import/compatibility `roadmap-contract.test.mjs`: exhaust state transitions, rejected enum values, crossed actor fingerprints, stale revisions, false flags, unsupported primitives, deadline sums and provisional ceiling semantics. Run `node --test packages/control-plane/test/roadmap-contract.test.js packages/control-plane/test/roadmap-policy.test.js packages/web/src/roadmap-contract.test.mjs`.

**Done evidence:** reviewed shared schema and API ledger, registry diff, owner-decision references where required, and passing contract output. Configuration is not evidence that any requested provider model is available or actually served.

### R4.02 Add durable records and replay-safe action storage

**Owner:** State/Money. **Depends:** R4.01. **v1.3:** §§4.2–4.4; D6, D8, D9, D30. **Legacy:** M4.4–M4.7, M5.1–M5.2. **Model:** none.

**Existing:** `packages/control-plane/learn-migrations/0022-usage-accounting.sql:12` and `:30` show existing action/attempt tables; `packages/control-plane/src/learn-attempt-store.js:89`/`:157` demonstrate guarded acceptance batching. **Create:** `packages/control-plane/learn-migrations/<NNNN>-roadmap-core.sql`, `packages/control-plane/src/roadmap-store.js`, `packages/control-plane/test/roadmap-store.test.js`. `<NNNN>` is allocated against the current manifest by Lead; reported local 0036–0038 are reserved work, not reusable numbers.

- [ ] Add CREATE-only `learn_roadmaps`, `learn_roadmap_invitations`, `learn_roadmap_steps`, `learn_step_proposals`, `learn_step_results`, `learn_roadmap_actions`, `learn_roadmap_calls` and `learn_roadmap_outbox`. Store org/actor/board on scoped rows, explicit version/hash fields, timestamps and minimal reason codes. Create result records and stable card IDs before any generator can write output.
- [ ] Add a partial uniqueness constraint for one unfinished roadmap per learner/board, including `questioning` and `paused`, plus one current offered position covering `checking`, `held` and `pending`. A held offer must not free the position for a second offer. Historical proposals/results remain addressable by their immutable accepted bindings.
- [ ] Specify `applyRoadmapAction(access, action)` as a guarded D1 batch. The winning action receipt binds actor, operation, expected versions and payload fingerprint; subordinate writes are guarded by that receipt. An identical replay returns its recorded outcome; a changed payload with the same key, or a stale competing action, returns 409 without effects.
- [ ] Store invitation dismissal by invitation ID. Preserve instruction text unchanged through create/draft/revision inputs, with explicit edits forming a new version. Plan acceptance records plan revision only; it creates no future paid authorization. Add explicit step removal/omission metadata separately from step delivery status.
- [ ] Test schema application twice against a migrated SQLite/D1 test fixture, independent learner uniqueness, paused-roadmap conflicts, simultaneous plan actions, replay after response loss, mismatched action payloads and stable earlier accepted results after later proposals. Assert no generated result references a nonexistent slot or foreign actor.
- [ ] Run `node --test packages/control-plane/test/roadmap-store.test.js`. Inject a batch failure and verify no acceptance receipt, proposal transition or orphan slot survives alone; test a guard that matches zero rows to prove the batch does not accidentally perform unguarded later writes.

**Done evidence:** migration manifest allocation, table/key inventory, transaction boundaries and test database snapshots before/after races. Production migration application remains a separate owner-controlled release action.

### R4.03 Read the declared Markdown scope and expose bounded tools

**Owner:** Tools. **Depends:** R4.01–R4.02 and R3 source-reference contract. **v1.3:** §§3.5, 6.1–6.2; D5, D13, D29. **Legacy:** bounded M4.1–M4.3, M4.18–M4.20, M4.23. **Model:** source/access/offset checks none; proposed subject/support roles use Sonnet 5.5 low; optional one Opus 5.5 support escalation only for ambiguity, funded by platform.

**Existing:** `packages/control-plane/src/learn-context-docs.js:90` (`readOwnDocument`), `:289` (`contextDocumentBlocks`); existing general context aggregation has attachment budgets and cannot itself certify whole-document coverage. **Create:** `packages/control-plane/src/roadmap-source.js`, `packages/control-plane/src/roadmap-tools.js`, proposed source/tool tests. **Modify:** authorized reader adapters only if a missing immutable metadata field requires them.

- [ ] Implement `readRoadmapSource(access,{sourceId,sourceVersion,scope})` returning a typed `{status,passages,coverage,sourceFingerprint}`. Accept one readable Markdown source and either its full declared bounded scope or an explicit captured passage. Measure before reading for planning; over-bound whole-document requests return a limitation with a selectable supported scope, never a silent prefix.
- [ ] Persist visible-section selection as source ID, immutable revision/hash, start/end offsets and heading context at selection time. Later scrolling, another tab or a live document edit cannot redefine it. Validate quote/offset matches server-side; inaccessible or changed sources produce explicit stale/unavailable status.
- [ ] Implement `runRoadmapTool(access,{name,args,purpose,contextVersion,budget})` with a closed typed registry. Return `ok`, `partial`, `needs_clarification`, `unsupported` or `unavailable`; include coverage and provenance. There is no SQL/shell/credential/arbitrary-write endpoint, and a tool result cannot authorize generation or write assessed observations.
- [ ] Label source material as quoted untrusted data. Preserve learner instruction priority, requested language and source-only language fallback. Missing private acronyms, missing appendices or consequential contradictions require one focused clarification; unsupported images/PDFs or unexecuted code are never described as inspected or run.
- [ ] Test exact-bound and over-bound documents, headingless Markdown, repeated headings, Unicode offsets, large sections, capture-then-scroll, capture-then-edit, foreign source IDs, missing bytes and prompt-injection passages. Assert every claimed fully covered byte/character range was actually supplied and unsupported tool names produce zero provider calls.
- [ ] Run `node --test packages/control-plane/test/roadmap-source.test.js packages/control-plane/test/roadmap-tools.test.js`. Include an instruction case “I already know X, teach me Y” and assert Y remains the planning target rather than the source’s dominant topic.

**Done evidence:** source coverage fixtures, exact input/output fingerprints, reader authorization trace and limitation screenshots. R7 indexing and R8 research/calculation can extend this contract later without blocking supported R4 sources.

### R4.04 Connect invitations, draft plans and ToC revision conversation

**Owner:** Tools for planner/prompt; UI for Chat and ToC; Lead owns `LearnPage.jsx` integration. **Depends:** R4.01–R4.03, R4.06 provider/quota boundary, R2 mode/settings contract. **v1.3:** §§2.1–2.3, 3.5, 5.1; D1, D13, D22–D24, D28–D29, D34. **Legacy:** M4.8–M4.17, initial M11.1/M11.3. **Model:** JEV for bounded optional intent routing; Sonnet 5.5 low for subject/proposal; Opus 5.5 for substantial plan draft/revision. All platform-funded.

**Existing at final main:** `packages/control-plane/src/learn-next-steps-planner.js:69` (`planNextSteps`), `packages/control-plane/src/learn-next-steps-routes.js:119` (`ownedNextStepsRoute`), mounted independently at `packages/web/dev-worker.js:316`; `packages/web/src/LearnNextSteps.jsx:35` (`ownedSteps`), `:82` (`useNextSteps`); `packages/web/src/LearnPage.jsx:1335`/`:2535` hook mounting/forwarding and `:2600` ToC; `packages/web/src/ask.jsx:1008`/`:1026` still routes a selected hook through `tutor.askStep`. `packages/control-plane/src/learn-tutor-routes.js:445` no longer owns Next Steps. `packages/web/src/TocConversation.jsx:13`; `packages/control-plane/src/learn-models.js:143`. **Create:** `packages/control-plane/src/agents/roadmap-draft.js`, `packages/control-plane/src/agents/roadmap-revise.js`, `packages/control-plane/src/agents/roadmap-proposal.js`, `packages/control-plane/src/roadmap-proposal.js` (validated composition coordinator), `packages/web/src/RoadmapInvitation.jsx`, `packages/web/src/RoadmapView.jsx`. **Modify:** current Chat/ToC through their assigned owners; do not restore removed Tutor callers from baseline.

- [ ] Queue a source-ready invitation only after supported Markdown import/read readiness is confirmed. Present it in the existing right-side Chat when the composer is idle and no answer is active; typing, composition and streaming keep it queued. Coalesce sources becoming ready within the same idle window into one invitation with a deduplicated source/version set. R4 still plans from one supported selected scope: a grouped invitation does not silently enable multi-source planning. Recheck the active canvas, mode, Auto-suggest and source access before showing it.
- [ ] Offer exactly **Explain on canvas** and **Just keep it here**, retaining free typing. The first opens the proposed-plan flow; the second dismisses only that invitation. Auto-suggest off suppresses unsolicited invitations but preserves explicit teaching requests; Ask answers in Chat without starting a roadmap. Home “teach” pre-fills the composer without auto-sending. Never interrupt a learner or re-prompt the same declined invitation on reload.
- [ ] Draft a finite roadmap containing outcome, assumptions, instruction, source scope, supported formats, Depth, stopping condition and proposed steps. Group Scope, a direct Depth slider and roadmap mode in the existing ToC learning-settings container with its separator; retain ToC, Progress, Find and Comments as existing tabs. Initial practice mode is Explanations only; omit practice controls until R9. Validate complete structured output before `proposed`, not merely JSON parse success.
- [ ] Route ToC conversation edits into versioned draft/revision operations, showing the changed plan for acceptance. Preserve delivered records, avoid spending authorization from plan acceptance, and require a new checked proposal for each paid step. Generic context asks one focused question rather than inventing a curriculum.
- [ ] Use actual `withSystemUsage` context and logged registered roles for invitation/draft/revision/proposal calls; reserve quotas through R4.06. Routing ambiguity may return ordinary Chat or clarification; safety uncertainty must use R4.09’s held result, never that permissive routing fallback.
- [ ] Integrate suppression with the now-independent Next Steps planner/route/hook modules: suppress its initiative while a roadmap is active and restore ordinary hooks when none is active. Do not move Next Steps back into `learn-tutor-routes.js` or feed roadmap state into its content-only planner. Complete/verify cleanup’s hook-click bridge so the exact `hook.hook` becomes a plain Chat turn through the retained composer path; final-main `ask.jsx` still invokes `tutor.askStep`, so P1 alone is not evidence this correction shipped. A roadmap does not seize typed slash commands or Quick Edit `/explain`.
- [ ] Add and run `node --test packages/control-plane/test/roadmap-planners.test.js packages/web/src/roadmap-invitation.test.mjs packages/web/src/roadmap-view.test.mjs`: dismissal versus global preference, Ask isolation, instruction preservation, language choice, malformed output, finite stopping, duplicate invitation, source-ready/Chat-idle ordering, grouped readiness, typing/streaming interruption prevention, exact two choices, plain-Chat hook text with no old Tutor call, and revision acceptance. Add an explicitly flagged title-only follow-up fixture, excluded from bounded-Markdown activation.

**Checks:** the named planner/invitation/view suites above, including grouped ToC settings and retained panel tabs. **Done evidence:** planner fixture transcripts and current-UI screenshots showing invitation, clarification, proposed plan and revision acceptance. Real paid model evaluation waits for the applicable approved cap; mocks establish wiring, not teaching quality.

### R4.05 Commit durable events and coordinate recovery with alarms

**Owner:** State/Money; Lead mounts routes/DO/bindings. **Depends:** R4.01–R4.02. **v1.3:** §§4.1, 5.4; D30, D35. **Legacy:** M4.5–M4.8, M7.5 and R4 portion of M7.9. **Model:** none for coordination; dispatched stages use their assigned roles.

**Existing:** `packages/control-plane/src/explain-job.js:264` (`ExplainJobs`), `:601` (`alarm`); `packages/control-plane/src/learn-attempt-store.js:279` (`commitAssessment`), whose final guarded batch is at `:295`; `packages/web/dev-worker.js:102` currently schedules daily cleanup. **Create:** `packages/control-plane/src/roadmap-jobs.js`, `roadmap-events.js`, `roadmap-routes.js`, proposed DO/outbox tests. **Modify:** Lead’s route mounts and Wrangler configuration; integrate R2/feedback/source writers at their fact transactions.

- [ ] Implement `appendRoadmapEventStatements(fact)` returning guarded statements to append to the originating transaction. Event identity includes org, actor, the applicable board/roadmap scope, fact ID and fact revision. Learner-global settings use one learner-scoped event with durable bounded fan-out to all affected unfinished roadmaps, as implemented in R6.01; they are not limited to the current canvas. Delivery acknowledgement, mode revision, feedback revision and explicit source-selection revision each commit their event with their fact. Ask→Tutor→Ask produces three distinct events.
- [ ] Define `claimRoadmapEvent({eventId,leaseToken,leaseUntil})` and `commitRoadmapEventEffect(...)`. A leased claim is replayable after expiry, not processed. State effects and processed markers share one batch; external generation uses persisted stage/call checkpoints and marks processed only after a durable known outcome.
- [ ] Introduce `RoadmapJobs` per org/learner/board using D1 as authority. Persist active stage, expected versions, call identities, attempt count, next wakeup and absolute deadline before dispatch. An alarm rereads authoritative state and does only still-applicable work; duplicate notifications cannot reverse newer mode/source changes.
- [ ] Close the commit-before-notify gap with a bounded recurring pending-outbox scan whose scheduler is durable before writes can be enabled. Scan indexed pending rows, not every idle roadmap; use DO alarms for second/minute stage retries. Daily cleanup is a final backstop and cannot satisfy these deadlines.
- [ ] Add crash injection after fact commit, after claim, before/after effect, before processed marker and before alarm setup; use a fake clock to prove lease replay and bounded retry. Add contract fixture for future R9: observation event belongs inside `commitAssessment`’s existing guarded batch, before its final status invalidates the pending claim guard, not after `assessAttempt` returns.
- [ ] Run `node --test packages/control-plane/test/roadmap-events.test.js packages/control-plane/test/roadmap-jobs.test.js packages/control-plane/test/roadmap-routes.test.js`. Assert flag-off routes return 404, no unsolicited jobs start, accepted work can finish internally and pending work is recovered within its deadline after restoration.

**Done evidence:** durable wakeup design, event/lease SQL receipts and fault-test timeline showing no lost fact or duplicated external effect. R9 plugs into this infrastructure later; its assessment implementation is not an R4 dependency.

### R4.06 Carry stable provider identities to admission and reserve platform work

**Owner:** State/Money, coordinated with Lead on shared usage files. **Depends:** R4.01–R4.02, R4.05. **v1.3:** §§5.1, 5.4–5.5; D14, D29–D31. **Legacy:** M4.6, M5.3–M5.4, M7.5. **Model:** no new model; wraps every selected R4 role, including JEV.

**Existing:** `packages/control-plane/src/learn-spend.js:66` (`spendTransport`) still mints an ID at `:78`; final-main `:150` now owns `spendCallModel`, extracted from Tutor routes during P1; `packages/control-plane/src/learn-spend-ledger.js:64` (`admitSpend`); `packages/control-plane/src/learn-usage.js:117` (`withSystemUsage`); `packages/control-plane/src/learn-grade-jev.js:139` (`askJev`) independently mints IDs at `:150`. **Create:** `packages/control-plane/src/roadmap-money.js` identity/quota helpers. **Modify:** the actual transport admission seams, not caller-only unused options.

- [ ] Add trusted `withRoadmapProviderCall(env,{proposalId,proposalVersion,cardId,stage,call,retry,authorizationId})`. Derive a stable server-owned provider-operation ID from those fields plus scoped action identity; bind the serialized request/model/provider fingerprint. Public headers or JSON cannot select arbitrary existing operations, funded context or allocation IDs.
- [ ] Pass that identity through the retained `learn-spend.js` `spendCallModel` wrapper and `spendTransport` to `admitSpend`; do not import it from the retiring Tutor routes. Keep its private single-call nested-admission token so wrapper and underlying transport still admit once. Extend JEV’s independent admission path with the same trusted convention and distinguish its internal capacity retry. A caller’s unused `attemptId` parameter is not completion.
- [ ] Record durable call checkpoints: planned → admitted → dispatched → response-recorded → settled, with explicit unknown/reconciling states. Replaying settled calls returns persisted output/checkpoint, not another provider request. An admitted or dispatched unknown result blocks blind retry; timeout is not evidence of zero cost.
- [ ] Reserve platform-work quota rows by learner/time window and stage before invitation, planning, checking or other platform calls. Use `withSystemUsage`, not `userId:'provider:platform'` as a payer selector. Settle/release per-call quotas on known outcomes; retain conservative provider liability for unknown outcomes under existing guard behavior.
- [ ] Fail closed if cap/config/schema/request bound is missing. Independently cap concurrency, calls, tokens and overall work; record policy version and measurement. The carried suggested quotas are provisional, not authorization to run a new paid evaluation budget.
- [ ] Add and run `node --test packages/control-plane/test/roadmap-provider-identity.test.js packages/control-plane/test/roadmap-quotas.test.js packages/control-plane/test/learn-spend.test.js packages/control-plane/test/learn-usage.test.js`. Prove duplicate nested transports, concurrent quota contenders, forged IDs, request-fingerprint collisions, JEV retry IDs, restart after admission and unknown settlement produce the expected unique ledger rows and call counts.

**Checks:** the named identity/quota/usage suites above must assert actual admitted operation IDs. **Done evidence:** a trace joins persisted stage/call identity to the actual `usage_operations.op_id`, usage attempt and provider response identity. Provider cost and learner balance remain separately interpretable.

### R4.07 Reserve the entire accepted step and transfer its per-call allocation

**Owner:** State/Money; independent Verifier review required. **Depends:** R4.02, R4.06. **v1.3:** §§5.1–5.2; D6, D24, D31, D38. **Legacy:** M5.2–M5.4, M8.3/M8.6 core. **Model:** none; generation cannot begin until this contract admits it.

**Existing:** `packages/control-plane/src/learn-spend-ledger.js:35` allowance clause and `:87` transactional admission; `packages/control-plane/src/learn-usage.js:447` (`BALANCE_SCOPE`), `:451` (`USED_SUM`), `:465` (`heldSum`), `:482` (`usageTotals`). These currently account for per-attempt holds, not a whole accepted step. **Create:** `<NNNN>-roadmap-authorizations.sql` with `learn_step_authorizations`, `learn_step_allocations`, `learn_step_allocation_transfers`; focused money tests. **Modify:** `roadmap-money.js`, store acceptance and shared usage/admission queries through Lead.

- [ ] Implement `admitStepAuthorization(access,proposalVersion)` as the winning acceptance batch: validate current checked proposal/access/immutable bounds; atomically test full-step allowance; create authorization, card allocations, acceptance binding and replay outcome. Insufficient allowance writes no consumed acceptance or purchased card. All writes share the same conditional winning receipt, not a prior standalone balance read.
- [ ] Store integer-micro amounts, payer/period, aggregate bound, per-card bound, remaining unallocated balance, immutable content/format bounds and authorization deadline. Calculate the offered worst-case envelope across permitted generation/repair/retry stages; separate platform-paid checks. Material expansion stops for a revised proposal and new acceptance.
- [ ] Integrate outstanding step holds into both runtime allowance admission and usage display. Available balance is allowance minus settled net charges, outstanding ordinary call holds and remaining untransferred step holds. Keep one shared SQL/accounting definition so another ordinary Chat call cannot spend credits reserved by a roadmap.
- [ ] Implement `consumeStepAllocation` inside `admitSpend`’s atomic batch for trusted authorized calls: verify allocation ownership/version/bound, admit platform expense, decrease that allocation’s untransferred hold, create exactly one per-call learner reservation and unique transfer. The transfer replaces an equal part of the hold; it never adds the same amount twice. Platform refusal or a failed guard transfers nothing. Replays cannot transfer again.
- [ ] Release unused allocation on card completion/terminal failure; preserve reservations for other in-flight cards. Integrate lapse handling and reconciliation so a late response cannot resurrect a released hold or silently charge beyond authorization. Finite failure refunds belong to R4.11, without deleting provider expense or valid sibling charges.
- [ ] Run `node --test packages/control-plane/test/roadmap-money.test.js packages/control-plane/test/learn-allowance.test.js packages/control-plane/test/learn-usage.test.js`. Required fixtures: allowance exactly equals aggregate bound; enough for card one but not whole step; simultaneous accepts; competing ordinary call; one transfer replay; platform refusal; failed second batch statement; per-card release; stale hold; month boundary. Assert acceptance, total held and net used at every boundary, not just final row counts.

**Done evidence:** transaction receipt and balance arithmetic proving `remaining step hold + transferred call holds` never exceeds the original admitted amount merely because of transfer. No per-card partial purchase may substitute for aggregate admission.

### R4.08 Deliver text/table through a trusted narrow artifact adapter

**Owner:** Tools with State/Money integration. **Depends:** R4.03, R4.06–R4.07. **v1.3:** §§3.5, 4.1; D2, D38. **Legacy:** text/table M5.3–M5.4. **Model:** reuse existing `LEARN_TASKS.artifact`, currently `provider:'plan'`, `model:ASK_MODELS.auto` → `claude-opus-5`, maxTokens 4000 (`learn-models.js:113`). A future Sonnet role is a separate measured change; do not silently claim existing generator uses Sonnet 5.5.

**Existing:** `packages/control-plane/src/learn-artifact.js:64` (`artifactPlan`), `:77` (`generateArtifact`), `:168` (`artifactFetch`); `packages/web/src/learn-slash.js:311` (`startExplain` first); `packages/web/src/LearnPage.jsx:1120` (`startExplain`); `packages/control-plane/src/explain-job.js:661` retains Generate wait. **Create:** `packages/control-plane/src/roadmap-generate.js`. **Modify:** trusted generator options and tests, preserving public routes.

- [ ] Implement `generateRoadmapCard(env,access,{authorizationId,resultId,resultVersion})`. Load the accepted immutable proposal/source/instruction/Depth from durable records; never generate from the request’s editable text. Recheck access and accepted bounds immediately before dispatch, then acquire its stage identity and allocation.
- [ ] Add a server-only generator restriction option separate from public input, validated against the command family and hard-limited to `explanation` and `table`. Intersect before constructing tools, compute maxTokens from that restricted set and validate returned primitive afterward. An empty intersection or unknown primitive is a limitation, not a fallback to another family.
- [ ] Reuse artifact schemas, `artifactBlock`, renderer and repair machinery. Expose each initial/repair model call to the R4.06 stage wrapper so durable checkpoints and per-call spending cover the actual repair. A generic “generate” stage ID reused for two provider calls is insufficient.
- [ ] Keep typed and Quick Edit `/explain` `startExplain`-first and keep v2 reviewed brief/Generate behavior. The narrow roadmap path is server orchestration, not a public `body.allowedPrimitives` override or a broad removal of review. Do not implement Animation or other command adapters here.
- [ ] Treat clarification, unsupported format, schema failure and provider failure distinctly. A model asking for clarification does not create a deliverable card; settle/refund its applicable generation charge and return a question/revision path. Enforce card/source/instruction hashes before persisting generated output for R4.09 checking.
- [ ] Add and run `node --test packages/control-plane/test/roadmap-generate.test.js packages/control-plane/test/learn-artifact.test.js packages/web/src/learn-slash.test.mjs`. Test explanation/table success, all other artifact families rejected, forged public `allowedPrimitives`, changed accepted text, repair operation IDs, ordinary v2 success and v2-disabled legacy fallback. No test may skip the actual server allowlist assertion.

**Done evidence:** trusted-call trace and regression results, plus the recorded D2 R4 exception before activation. A `generateArtifact` result alone is not permission to expose its body.

### R4.09 Check source support and contextual text safety at every delivery boundary

**Owner:** Tools for checks; State/Money for entitlement; Verifier for adversarial corpus. **Depends:** R4.03, R4.06, R4.08. **v1.3:** §§4.4, 6.2, 6.4; D29, D43. **Legacy:** M4.19, M5.14. **Model:** proposed support Sonnet 5.5 low, one Opus 5.5 adjudication when justified; JEV direct configured `jev-1.13.0` for separately versioned contextual screening. Platform-funded.

**Existing:** `packages/control-plane/src/webpage-screen.js:51`/`:53` text request/chunks, `:61` response validation, `:94` screening; current exclusive safe/explicit/graphic choice is not multi-label. `packages/control-plane/src/learn-grade-jev.js:19` transport registry. **Create:** `roadmap-grounding.js`, `roadmap-safety.js`, `roadmap-publish.js`, support/safety prompt modules and tests.

- [ ] Validate references deterministically for access, immutable source version, offsets and quoted text; then target material claims for support/contradiction/insufficiency. Store evidence class (`source_supported`, `externally_supported`, `computed`, `inferred`, `unresolved`) and checked premises/derivation. R4 must not claim external research or computation that did not run.
- [ ] Build an independent-category safety request or explicit multi-label adapter over the existing transport. Consider learner intent, quoted passage, transformation and text modality together; educational anatomy/history does not fail merely for topic words. Personal imminent-risk signals pause unsolicited teaching and produce supportive help; a quoted passage alone must not trigger that personal-risk action. Return deterministic `allow`, `restrain`, `block`, `unknown` from validated category probabilities, coverage and policy version.
- [ ] Bind cached verdicts to output/content hash, source versions, prompt/model/policy and complete screening coverage. Malformed output, timeout, missing chunks and uncertain context produce held work; they are neither prohibition findings nor publication permission. Allow one bounded retry and, when appropriate, one adjudication within a finite deadline, then invoke terminal refund.
- [ ] Implement `entitledRoadmapResult(access,result)` requiring successful generation, passing applicable checks, immutable accepted proposal/result binding, billing `settled` or explicit `zero_priced`, current access and enabled serving route. Pending/refunded/failed billing is not valid entitlement. Re-evaluate at body and asset reads, acknowledgement and resume.
- [ ] Return proposal metadata only before entitlement: no generated body, raw storage key, signed asset URL, answer key or command job result. Test every roadmap result route plus any reused lower-level delivery route; sharing cannot become an alternate unpublished-content endpoint. Previously delivered bindings survive later proposal versions; a cache-policy change alone does not delete historical cards.
- [ ] Run `node --test packages/control-plane/test/roadmap-grounding.test.js packages/control-plane/test/roadmap-safety.test.js packages/control-plane/test/roadmap-publish.test.js`. Cover contradictory citations, source instructions, educational versus exploitative intent, quoted versus personal self-harm risk (including paused initiative and supportive response), incomplete screen, retry exhaustion, refunded result, foreign actor and direct asset access. Evaluate a small held-out text corpus only within approved spend; report false allowances, false refusals and unknown rate separately.

**Done evidence:** publication predicate matrix, denied-response payload inspection, verdict provenance and finite-resolution proof. Mocked categories demonstrate enforcement, not classifier quality.

### R4.10 Implement one private proposal, keyboard acceptance and idempotent placement

**Owner:** UI; Lead integrates page and R1 owner coordinates canvas edits. **Depends:** R1–R3 integration contracts, R4.02, R4.07–R4.09. **v1.3:** §§2.3–2.4, 4.4; D8–D9, D18–D19, D24, D37. **Legacy:** M5.5–M5.10, M6.4. **Model:** none.

**Existing:** `packages/web/src/AdaptiveCanvas.jsx:2286` (`insertBlock`), `:2346` (`reserve`), `:2379` (`focusBlock`), `:3907` keyboard capture; `packages/web/src/shortcut-owner.js:47` (`pageKeyAllowed`); `packages/web/src/inline-placement.js:76` (`placeResult`). **Create:** `packages/web/src/use-roadmap.js`, `packages/web/src/StepProposal.jsx`, `packages/web/src/NextStepPill.jsx`, `packages/web/src/roadmap-placement.js` and focused tests. **Modify:** current canvas/Chat/ToC components, not a new mocked UI.

- [ ] Render the current pending proposal as a private selectable overlay outside saved board blocks, undo history and shared/forked JSON. Show title, description and source relationship, with the compact square **Accept [Tab] | Cancel** control attached to the proposal: zero corner radius, green Accept with its Tab key label, red Cancel separated by a left border. Use approved wording, no price/estimate/maximum and no dead Edit placeholder. A held or blocked version cannot masquerade as accept-ready.
- [ ] Add plain Tab handling in the canvas key handler after ownership/busy/read-only checks and only for the selected current proposal with no inline/text editor, dialog, widget or composer owning focus. Leave Shift+Tab, browser field navigation, IME and repeated keys intact. Mouse Accept and Tab submit the same guarded action.
- [ ] On accepted receipt, reserve its server-minted stable card slots; do not mint new client IDs during polling/reload. Place independent cards near their source/anchor using free-space helpers without forced camera jumps, compulsory side or automatic arrows. Insert each authorized result idempotently by immutable card/result identity.
- [ ] Persist board state before acknowledging placement through `acknowledgeRoadmapDelivery(access,{resultId,resultVersion,cardId,boardRevision})`. Verify saved board presence server-side where available. Lost acknowledgement restores the same card and sends the same acknowledgement; it does not generate again, charge again or prematurely refund.
- [ ] Add the offscreen Next step ready indicator now: it navigates to the existing pending overlay only. Hover step labels derive from the learner’s private index, never a copied `step_id`. Newly delivered cards expose working R1 feedback, R2 Depth effects and R3 source navigation.
- [ ] Run `node --test packages/web/src/roadmap-placement.test.mjs packages/web/src/roadmap-keyboard.test.mjs packages/web/src/inline-placement.test.mjs packages/web/src/shortcut-owner.test.mjs`. Proposed browser checks `node packages/web/e2e/roadmap-reload-check.mjs` and `node packages/web/e2e/roadmap-cross-device-check.mjs` assert one card per ID after two accepts, one accept versus Cancel, save-before-ack crash and offscreen navigation without calls. Render assertions verify the attached square green/red control, Tab label, left divider and absence of every Tutor price field.

**Done evidence:** actual desktop interaction recording, saved board/receipt identifiers and cross-device screenshots. Mouse Accept uses the same server checks as Tab; phone layout and touch qualification remain out of scope.

### R4.11 Classify failures, refund failed cards and expose bounded recovery

**Owner:** State/Money; UI connects existing conversations; Verifier audits money traces. **Depends:** R4.05–R4.10. **v1.3:** §§5.2, 6.4; D6, D31, D36, D38. **Legacy:** M5.11, M5.13–M5.14. **Model:** existing generation/check roles for eligible retries; proposed proposal role for replacement. No model decides authorization or refund amounts.

**Existing:** `packages/control-plane/src/learn-spend.js:58` (`providerUnavailable`); `packages/control-plane/src/learn-usage.js:311` (`settleAttempt`), `:409` (`refundAttempt`), `:425` (`refundActionByKey`). `refundAttempt` documents a separate audit-write gap at `:407`; action-wide refund is unsafe for a step with delivered siblings. **Modify:** `roadmap-money.js`, `roadmap-jobs.js`, store/UI recovery; add guarded refund receipt helper/sidecar if needed.

- [ ] Persist failure class and stage: clarification, unsupported capability, denied access, policy block, unknown provider outcome, transient provider failure, checking unavailable or terminal validation failure. Only eligible transient failure receives one automatic retry; unknown provider outcomes reconcile first. A schema/policy/permission failure never triggers an indiscriminate paid loop.
- [ ] Associate each generation/repair/retry attempt with its card allocation. Refund that failed card’s measured learner charges before its automatic retry, release unused hold as appropriate, and retain provider operations unchanged. After a second failure mark card failed/step incomplete and refund affected charges; valid delivered siblings retain their charges and slots.
- [ ] Make refund plus result billing transition and its replay receipt atomic. If extending the generic refund writer, preserve other callers and close its audit gap for this critical path; do not call a separately committed refund and describe the following result update as atomic. Unknown learner attempts remain zero charged under current balance rules while provider uncertainty is tracked separately.
- [ ] Bound held checking to retry/adjudication deadlines. Terminal inability to deliver refunds the card and marks result unavailable. Recovery of a previously refunded result cannot silently republish or debit it: require a new explicit recovery authorization with fresh operation identity and bounded allowance.
- [ ] Route Chat/ToC Retry, Replace and Omit to common authorized actions. Explicit Retry gets its own bounded authorization; Replace creates a new checked proposal for only the failed card; Omit records the omission and preserves siblings/history. The agent’s natural-language interpretation may propose the action but cannot authorize paid replacement itself.
- [ ] Run `node --test packages/control-plane/test/roadmap-money.test.js packages/control-plane/test/roadmap-recovery.test.js packages/control-plane/test/roadmap-jobs.test.js`. Inject crashes before/after refund, retry admission, settlement, output write, check pass and placement acknowledgement. Assert unknown cost is never rewritten as zero provider expense, refunds happen once, delivered siblings survive, retry count is finite and replay after refund reports refunded state.

**Checks:** the named money/recovery/job suites above must exercise atomic refund and failed-card boundaries. **Done evidence:** per-card ledger reconciliation and user-visible incomplete/recovery flow. Settlement with a lost placement acknowledgement is first reconciled against saved board state; it is not automatically classified as failed delivery.

### R4.12 Finish manual progression, revision, stopping, deletion and privacy

**Owner:** UI and State/Money; Lead owns shared page integration. **Depends:** R4.02, R4.04–R4.11. **v1.3:** §§2.4, 3.5, 4.3–4.4; D1, D4, D7–D9, D19, D28, D35–D37. **Legacy:** M5.8/M5.10/M5.12, M6.4, essential M7.9, M11.1/M11.3, M12.2–M12.3/M12.5. **Model:** platform-funded Sonnet 5.5 proposal composition, Opus 5.5 accepted-plan revisions; no calls for pause/end/deletion.

**Existing:** `packages/web/src/AdaptiveCanvas.jsx:3196` (`deleteSelection`); `packages/control-plane/src/shared-privacy.js:22` (`EVERY_CARD`), `:35` (`sharedState`); `packages/control-plane/src/learn-boards.js:474` (`forkState`), `:587` (`fork`); `packages/web/src/LearnPage.jsx:2600` ToC. **Modify:** roadmap store/view/hook, share/fork sanitizers and existing analytics allowlist; create proposed lifecycle/privacy tests, including the new `packages/control-plane/test/shared-privacy.test.js` (not present at baseline).

- [ ] Make Propose next step explicitly create at most one next independent proposal after current accepted delivery completes or its failure is resolved. Cancel records **Proposal cancelled**, pauses automatic progression and never automatically re-offers that cancelled proposal on mode resume, reload or another trigger. A manual next-step request advances to the next independent roadmap entry; it does not recreate the same position. Revisiting the cancelled position requires an explicit learner request through Chat/plan revision and a fresh checked proposal version. If the next entry depends on the cancelled content, resolve that prerequisite explicitly with a focused question or accepted plan revision before proceeding; cancellation proves neither misunderstanding nor mastery. ToC navigation distinguishes incomplete, omitted and removed content; invitation dismissal never globally disables Tutor.
- [ ] Persist Ask-mode pause transactionally with a revisioned event; stop new initiative while accepted generation may finish. Resume uses current state without duplicate offers and respects an explicit cancellation pause. End roadmap preserves delivered cards, decisions and evidence; an ended record no longer prevents a new roadmap.
- [ ] Implement Scope/Depth revision preview and acceptance, counting already delivered steps toward the ceiling. Reaching outcome/ceiling shows a coherent stopping point; explicit continuation creates the bounded next revision. Do not turn provisional ceilings into mandatory quotas or add a fixed explanation/practice rhythm.
- [ ] On deletion or undo removing a delivered card, record `delivery:'removed'`, keep accepted billing/history and navigate to survivors. Deletion does not refund a valid completed purchase. Duplicate remove/restore notifications must not create duplicate events or lose the original delivery receipt.
- [ ] Strip private `step_id`, roadmap relation, proposal, feedback and assessment data through shares/forks in this same release; retain only permitted source references, re-pointed according to R3. Assert pending overlays and unpublished results never enter saved/shared payloads. Emit content-free `rh_roadmap_step` IDs/enums through existing analytics, excluding source/instruction text.
- [ ] Run `node --test packages/control-plane/test/roadmap-lifecycle.test.js packages/control-plane/test/shared-privacy.test.js packages/control-plane/test/canvas-forking.test.js packages/web/src/roadmap-view.test.mjs packages/web/src/usage-analytics.test.mjs`; proposed `node packages/web/e2e/roadmap-fork-check.mjs` inspects real fork/share JSON and confirms no private sidecar rows are copied. Lifecycle fixtures cover Cancel→reload/resume without re-offer, explicit next-independent continuation, explicit same-position revision, and unresolved prerequisite handling without inferred mastery or duplicate purchase.

**Done evidence:** complete manual session ending at its stopping point; pause/revision/deletion receipts; real share/fork payload proof. Rich source inclusion and different-version adaptation expand in R10; this release already supports essential settings changes and stopping.

### R4.13 Verify the complete supported flow and activate only this capability

**Owner:** Verifier; Lead assembles receipt. **Depends:** R4.01–R4.12 and integrated R1–R3. **v1.3:** §§3.5, 8–9; D2, D35, D39, D43. **Legacy:** M4.1–M4.3 bounded corpus, M5.9, core M12.5. **Model:** frozen role matrix from earlier tasks; only approved bounded real-provider evaluation, with no silent model substitutions.

**Existing:** `packages/web/dev-worker.js:340` Explain route and `:367` artifact route; `packages/control-plane/src/learn-models.js:143` logging; existing test execution is Node’s test runner (`packages/control-plane/package.json:7`). **Create:** proposed `tests/evals/roadmap-session/`, `packages/web/e2e/roadmap-step-check.mjs`, `roadmap-flag-recovery-check.mjs` and a release-specific evidence directory. **Modify:** affected-check classification and fixture guard through Lead.

- [ ] Add keyless fixture generation and failure injection allowed only in test environments. Exercise bounded Markdown invitation/dismissal, original instruction, plan revision/acceptance, text/table Tab delivery, R1 feedback, R2 Depth, R3 navigation, Cancel, manual next step, offscreen readiness, reload, second device and stopping. A planning-only transcript fails this release.
- [ ] Execute proposed smoke commands `node packages/web/e2e/roadmap-step-check.mjs`, `node packages/web/e2e/roadmap-cross-device-check.mjs`, `node packages/web/e2e/roadmap-flag-recovery-check.mjs` against the designated dev fixture environment with the harness’s explicit base URL/session inputs. Record the exact invocation, fixture identity and candidate SHA; do not invent unspecified credentials or pretend these scripts already exist.
- [ ] Include real D1 transactional fixtures for duplicate acceptance, aggregate shortage, transfer without double hold, stale version, unknown provider cost, failed-card refund, lost acknowledgement and private asset reads. Test `ROADMAP_ENABLED` unset/false during generation and after settlement: routes remain 404, hidden UI leaks nothing, restore delivers once or deadline recovery refunds once.
- [ ] Run the repository build and current affected checks classified by Lead, plus the named release tests. Review the supported Markdown/text corpus for grounding, unsafe false allowances, educational false refusals, language/instruction adherence, latency and spend. Record actual requested/served model, policy versions and unknown rates; no 64-draft multi-format matrix is required for R4.
- [ ] Assemble the relevant cleanup prerequisite receipt and retained-interface verification, including Next Steps exact Chat forwarding and cleaned Auto/Ask/Tutor behavior. Use the lead’s proposed P2/P4 substitute receipts only after recorded owner adoption; otherwise retain v1.3’s applicable M0 receipt. Continue independent implementation meanwhile. Reconcile reported local implementations before modifying shared files.
- [ ] Activation receipt must name integrated SHA, focused evidence, scoped D2 R4 exception, D43 policy adoption, approved new learner strings where required, actual bounded paid-test authorization and owner-controlled migration/production release actions. Keep `ROADMAP_ENABLED` off until the complete slice qualifies; no demand for R7/R8/R9/R11 or Animation work may be added.

**Done evidence:** independently reviewed end-to-end receipt and concrete recovery plan. This checklist authoring does not deploy, migrate, spend, set a release variable or assert local unpublished branches were inspected.


## R5 — Proposal editing, positioning and existing-card reuse

**Release boundary:** R4 is the only release prerequisite. Reconcile the R4 proposal/version interfaces with the actual integration commit before implementation. No rich-format adapter, speculative generation or later cleanup drop is a prerequisite. The retained-interface receipt covers inline targeting, keyboard ownership, Chat references and owner-scoped board reads. Throughout R5–R10, existing-file references were reconciled against final main `9b798f7760b7af5aa2446d281a07eebfc4e10b84`. Files introduced by earlier releases are explicitly called **release-created**, never claimed present on that baseline. Commands below are implementation checks to run from a full checkout after creating the named proposed tests, not claims of checks already run. Every browser/e2e command in this fragment is for approved CI or another explicitly authorized runner: the retained repository restriction on Claude local browser automation still applies. Owner try may be waived under the release policy; functional verification is still required. All new tools inherit `RoadmapAccess`, the shared typed-result and enabled-capability boundaries; no capability in this fragment authorizes a later command adapter.

### R5.01 Store proposal edit drafts without consuming acceptance

**Owner:** State/Money; Tools composes edits. **Depends:** R4.01, R4.02, R4.06, R4.09. **Trace:** v1.3 §§3.6, 4.2–4.3, 5.1; M6.1–M6.2. **Model:** proposed `roadmap_proposal`, Sonnet `claude-sonnet-5-5`, low effort, platform-funded; reuse the R4 composition role with an edit instruction.

**Existing:** `packages/web/src/inline-ai-session.js:54` `createInlineSession` supplies preview/accept separation; `packages/web/src/inline-ai-context.js:265` `staleness` checks frozen input. **Proposed:** create `learn-migrations/<NNNN>-roadmap-proposal-drafts.sql` and `packages/control-plane/src/roadmap-proposal-drafts.js`; modify release-created `roadmap-store.js`, `roadmap-routes.js`, `roadmap-proposal.js`. Lead resolves the migration number from the current manifest.

- [ ] Define `saveProposalDraft(access,{roadmapId,proposalId,proposalVersion,instruction,actionKey})` and `applyProposalDraft(access,{draftId,expectedRevision,proposalVersion,actionKey})`. Store owner, source/input fingerprint, original version, bounded instruction, draft revision, check status and expiry.
- [ ] POST the draft through a dedicated proposal-draft route. Reserve platform work before composition; repeated action keys replay the same draft. A draft never changes the original pending proposal, authorizes generation or places a card.
- [ ] Apply with a guarded batch: require the original proposal still unaccepted and current, consume the draft once, create the next immutable proposal version, supersede the old version and append its event. Only a version whose current checks pass becomes `pending`; unresolved checks retain `checking/held`.
- [ ] Delete or invalidate drafts on acceptance/supersession; a stale Apply returns 409 with current state. Esc's best-effort draft deletion is housekeeping, never the correctness boundary.
- [ ] Add proposed `test/roadmap-proposal-drafts.test.js`: concurrent Apply/Accept, duplicate Apply, expired draft, crossed actor/board, edited source, preview cancellation and held validation. Assert zero learner debit and zero generation dispatch.

**Run/evidence:** from `packages/control-plane`, `node --test test/roadmap-proposal-drafts.test.js`. Keep before/after rows demonstrating unchanged original data before Apply and one new version afterward, plus the race result.

### R5.02 Extend Ctrl/Cmd+K with a proposal target and explicit Apply

**Owner:** UI; State/Money reviews action binding. **Depends:** R5.01, R4.10. **Trace:** v1.3 §3.6; M6.1–M6.2; D33. **Model:** none in the browser; R5.01 owns the platform call.

**Existing:** `packages/web/src/inline-ai-context.js:274` `freezeTarget` currently accepts entities/links from board lists; `packages/web/src/InlineAiEditor.jsx:94` component, `:496` acceptance handler and `:603` keyboard handler; `packages/web/src/inline-ai-apply.js:277` `applyTx`. **Proposed:** modify those target/editor integration points without running board-edit transactions for proposals; create `packages/web/src/inline-ai-proposal.js`, `packages/web/src/inline-ai-proposal.test.mjs`; modify release-created `StepProposal.jsx`.

- [ ] Add a discriminated target `{kind:'roadmap_proposal',roadmapId,stepId,proposalId,proposalVersion}`; do not sneak `proposal:<id>` through the ordinary saved-card lookup or expose a fake board block.
- [ ] Freeze the displayed version and input fingerprint when opening. Render the returned draft beside the still-pending original using the current editor, with Apply and discard behavior; an edit request must never use the ordinary paid-card Generate branch.
- [ ] Ctrl/Cmd+Enter applies the draft and closes only after the server confirms; Esc closes/discards the preview. Tab remains owned by the open editor or its picker and must not bubble into step acceptance.
- [ ] After Apply, refresh the canonical proposal and its checked status. An acceptance from another device makes Apply fail safely, clears the stale preview and displays the actual accepted state.
- [ ] Test keyboard precedence, IME composition, repeated Apply, network retry, stale source and closing during composition. Preserve existing inline note/card edit behavior.

**Run/evidence:** from `packages/web`, `node --test src/inline-ai-proposal.test.mjs src/inline-ai-session.test.mjs`. Add a real-current-UI browser case to proposed `e2e/roadmap-edit-check.mjs`; capture Esc preserving version, Apply incrementing it, then one Tab acceptance after closure.

### R5.03 Position proposals and attach their context to Chat

**Owner:** UI; Lead integrates any `LearnPage.jsx` patch. **Depends:** R5.02, R4.10, R4.12. **Trace:** v1.3 §§3.6, 10.1; M6.3, M6.7; retain R4's M6.4. **Model:** none for drag/attachment; an independently sent Chat turn uses its existing configured role.

**Existing:** `packages/web/src/SelectionActions.jsx:23` provider and `:44` actions; `packages/web/src/canvas-actions.js:140` Add to chat and `:143` Quick Edit rows; `packages/control-plane/src/chat-modes.js:59` `contextRefs` validates a bounded known-kind reference. **Proposed:** modify these files and release-created `StepProposal.jsx`, `NextStepPill.jsx`, `roadmap-client.js`; create `packages/web/src/roadmap-proposal-context.test.mjs`.

- [ ] Add learner drag on the proposal's own strip. Keep a position keyed to immutable proposal identity/version until acceptance, and pass the chosen world-space anchor to R4 slot reservation. Moving it neither changes content/version nor generates work.
- [ ] Preserve offscreen Next step ready navigation to the existing proposal. Click only reveals that proposal; it must never call a composer or acceptance route.
- [ ] Define the exact ContextRef `{kind:'proposal',sourceId:'proposal:'+proposalId,name:title,version:String(proposalVersion),range:null}`. Extend the kind/range allowlist and preserve this existing reconstructed shape; do not send arbitrary roadmap/step fields that `contextRefs` drops. The server resolves roadmap/step from the actor-scoped proposal row after access checks; descriptive context comes from that row, not browser-supplied text.
- [ ] Ctrl/Cmd+L and Add to chat attach the reference and focus the composer without sending. A question such as “why this step?” reads context but cannot accept, charge or rewrite the plan.
- [ ] Extend ref validation, sanitization and render tests for wrong board, stale version, oversized fields, forged body text and unsupported ranges. Reopen Chat with the same reference without leaking draft or answer-key data.

**Run/evidence:** from `packages/web`, `node --test src/roadmap-proposal-context.test.mjs`; from `packages/control-plane`, `node --test test/chat-modes.test.js` after adding proposal cases. Browser proof records drag/zoom, offscreen reveal and attachment with no network mutation until the learner explicitly acts.

### R5.04 Link an existing card through the same checked acceptance contract

**Owner:** State/Money and Tools; UI renders the link offer. **Depends:** R5.01 version contract, R4.07, R4.09–R4.10. **Trace:** v1.3 §3.6, §4.4; M6.5–M6.6, M6.8. **Model:** proposed `roadmap_proposal`, Sonnet `claude-sonnet-5-5`, low, only for Tutor-selected reuse; learner-selected linking is deterministic.

**Existing:** `packages/web/src/canvas-actions.js:140` demonstrates action-registry wiring; `packages/web/src/inline-ai-context.js:499` `boardObjects` supplies an existing inventory shape. **Proposed:** modify release-created `roadmap-proposal.js`, `roadmap-store.js`, `roadmap-routes.js`, `StepProposal.jsx`; create `test/roadmap-links.test.js`.

- [ ] Add `kind:'link'` proposals naming one existing accessible card and a content fingerprint. Permit both “Use as my next step” and bounded proposer-selected reuse; retain an explicit reason that this card covers the intended step.
- [ ] Validate source support, ownership and card availability before offering, then re-read the card at acceptance. An ID or previously read inventory is not ongoing access.
- [ ] Use `acceptRoadmapStep` with an explicit zero-priced billing outcome and ordinary action replay. Dispatch no model or command generation; do not copy the card or create a fake purchased artifact.
- [ ] If the card was deleted or materially edited, reject the stale link and issue a newly checked proposal for fresh acceptance. Do not silently convert the learner's zero-priced acceptance into a chargeable generation.
- [ ] Show Existing card and navigate to it; keep a private roadmap linkage. Reusing it is delivery, not assessed understanding. Preserve the accepted count/ceiling rules and request a revised plan when an additional step would exceed them.
- [ ] Test duplicate acceptance, cross-board access, deletion between offer/accept, card edit, fork sanitization and zero-debit accounting, alongside the R5 edit/browser cases.

**Run/evidence:** from `packages/control-plane`, `node --test test/roadmap-links.test.js test/roadmap-money.test.js`; from `packages/web`, `node e2e/roadmap-edit-check.mjs`. The receipt includes the zero-priced outcome and absence of provider dispatch.

## R6 — Automatic next proposals, without card preparation

### R6.01 Commit versioned trigger facts to the durable outbox

**Owner:** State/Money; Lead coordinates settings/mode writer ownership. **Depends:** R4.05, R4.12 and R2 persisted settings; R5 is not required. **Trace:** v1.3 §§3.7, 5.4; M7.7–M7.9. **Model:** none.

**Existing:** `packages/control-plane/src/learn-coaching-store.js:145` `PLANS.save_controls` reduces mode changes; `:336` `applyCoachingAction` commits them in its guarded batch at `:350`. The read/claim/commit contract comes from release-created R4 outbox modules. **Proposed:** modify `packages/control-plane/src/learn-coaching-store.js` at its `save_controls` mutation, release-created settings store, delivery store, `roadmap-events.js` and `roadmap-jobs.js`; create `test/roadmap-auto-events.test.js`. Reconcile the exact mode writer with cleanup's retained interface before patching it.

- [ ] Append `appendRoadmapEventStatements(fact)` in the same database batch as delivered-card, mode and Auto-suggest preference changes, under the same successful fact-version guard. For the existing coaching batch, insert before its final revision UPDATE and preserve its last-result success check. Include organization, actor, roadmap, fact identity and a monotonic fact revision in the dedupe identity.
- [ ] Distinguish Ask → Tutor → Ask transitions even though the last value repeats. Do not deduplicate on the mode string, browser timestamp alone or a generic “settings changed” key. For global Auto-suggest, commit one learner-scoped settings event; durably expand it in bounded pages to every unfinished roadmap for that learner. Persist expansion cursor/child inserts together and mark the parent complete only after expansion, so restart cannot omit a canvas. Child keys include the settings revision and roadmap ID; new roadmaps read the latest preference directly.
- [ ] Make any newly persistent preference revision additive under the migration rules; do not casually alter a retained CHECK constraint. Name the actual writer and revision field in the integration receipt.
- [ ] Consume through `claimRoadmapEvent/commitRoadmapEventEffect`; after a crash, an expired claim may replay. Re-read current mode/settings before the effect, so an old Tutor event cannot resume work after a newer Ask.
- [ ] Test crash after fact commit before notification, crash after claim before effect, duplicate deliveries, two-device settings writes, two active canvases and lease/expansion recovery. Changing global Auto-suggest on either device must affect both canvases without duplicating proposals. Existing accepted generation remains permitted to finish under R4's access/publication rules.

**Run/evidence:** from `packages/control-plane`, `node --test test/roadmap-auto-events.test.js test/roadmap-events.test.js` (new/extended R4 tests). Retain database snapshots proving one fact with one event, recovered effect and no lost work; measure recovery against configured dispatcher deadlines rather than citing a daily sweep.

### R6.02 Compose and reveal one automatic next proposal

**Owner:** Tools and State/Money. **Depends:** R6.01, R4.04–R4.06, R4.09–R4.10. **Trace:** v1.3 §3.7; M7.1, M7.7–M7.8. **Model:** proposed `roadmap_proposal`, Sonnet `claude-sonnet-5-5`, low effort, platform-funded.

**Existing:** `packages/control-plane/src/learn-models.js:40` central `LEARN_TASKS` is the registry seam, not evidence that this role exists. **Proposed:** modify release-created `roadmap-jobs.js`, `roadmap-proposal.js`, `roadmap-store.js`; add `test/roadmap-auto-proposal.test.js`.

- [ ] Implement `ensureNextProposal(access,{roadmapId,expectedRevision,triggerEventId})` as a guarded coordinator action. Eligible state requires active roadmap, shipped automatic-proposal flag, enabled preference and current Auto/Tutor mode.
- [ ] Allow bounded private pre-composition of metadata for the immediate successor while the accepted step finishes. Do not call any artifact/media generator, create prepared body/assets or create learner authorization as a side effect.
- [ ] Recheck delivered-step completion, remaining ceiling, source versions, current revision and applicable checks before revealing. Incomplete/retrying accepted work must not be treated as finished; invoke the R4 terminal resolution rules.
- [ ] Reserve the one proposal position across checking/held/pending states. Concurrent manual Next, event replay and two devices converge on the same proposal or a stale 409, not competing offers.
- [ ] Cancel, End, Auto-suggest off or Ask prevent further unsolicited work. Resume evaluates the existing durable state and reuses the valid offer; it does not interpret prior acceptance as mastery.
- [ ] Test concurrency, budget refusal, source invalidation during composition, mode change before reveal and no-next-step completion. Assert zero generation transport calls and zero learner debits throughout.

**Run/evidence:** from `packages/control-plane`, `node --test test/roadmap-auto-proposal.test.js`. Save a provider-spy transcript that distinguishes permitted proposal-model calls from forbidden card-generation calls.

### R6.03 Verify automatic proposal timing and current-UI behavior

**Owner:** Verifier and UI. **Depends:** R6.02. **Trace:** v1.3 §3.7, D20/D22; M7.1, M7.8–M7.9. **Model:** no additional role; test the configured proposer only in separately authorized bounded live checks.

**Existing:** `packages/web/src/inline-ai-session.js:345` `stageTimings` is a timing precedent; `packages/control-plane/src/chat-modes.js:19` lists Auto/Ask/Tutor. **Proposed:** modify release-created `roadmap-client.js`, `StepProposal.jsx`, `NextStepPill.jsx`; create `packages/web/src/roadmap-auto.test.mjs` and `e2e/roadmap-auto-check.mjs`.

- [ ] Record delivered acknowledgment, successor composition start/end, validation end and proposal-visible times separately. Report delivery-to-visible p50/p95 and sample size; the 1–2 second target remains a measured goal.
- [ ] Show the next pending proposal without moving the camera, repeating a Chat invitation or stealing focus from an unanswered practice card. An offscreen proposal uses the existing ready indicator.
- [ ] Preserve manual Next with Auto-suggest off. Repeated toggle/mode changes, reload and a second tab render the server's latest state instead of restarting local timers.
- [ ] Exercise Cancel then explicit resume, End then blocked automatic resumption, Ask during accepted generation and restored Tutor after delivery. Pausing must not expire accepted assets or undo delivered cards.
- [ ] Add assertions for one visible proposal, unchanged viewport, no duplicate Chat messages and no card generator request before acceptance. Capture actual current UI; no new demonstration mock substitutes for integration.

**Run/evidence:** from `packages/web`, `node --test src/roadmap-auto.test.mjs` and `node e2e/roadmap-auto-check.mjs`. Attach the event timeline, screenshots and ledger delta to R6's receipt. R6 may ship independently of R5, R7–R10, R11 and rich-command adapters once its own prerequisites pass.

## R7a — Long Markdown indexing and explicit coverage

### R7a.01 Create deterministic access-scoped source indices

**Owner:** Tools and State/Money. **Depends:** R4.03 source contract, R4.05–R4.06. **Trace:** v1.3 §§3.8, 4.2, 6.2; M4.20 and indexing portion of M4.6. **Model:** none for extraction/chunking.

**Existing:** `packages/control-plane/src/learn-context-docs.js:53` `readUpload` validates Markdown/text; `:289` `contextDocumentBlocks` provides existing authorized document context; `packages/web/src/FileDocMarkdown.jsx:15` `MarkdownText` is the current rendering seam. **Proposed:** extend release-created `packages/control-plane/src/roadmap-source.js`; create `packages/control-plane/src/roadmap-source-index.js`, `learn-migrations/<NNNN>-roadmap-source-index.sql`, `test/roadmap-source-index.test.js`.

- [ ] Define `indexSource(env,access,{sourceKey,sourceRevision})` returning immutable index identity, outline, chunk descriptors and coverage. Resolve bytes through the authorized source reader; neither a cache key nor a client hash establishes access.
- [ ] Partition deterministically by headings and bounded text windows, preserving byte/character coordinate convention, heading ancestry, ordinal and original source offsets. Repeated headings receive distinct location identities; split oversized/headingless sections without losing text.
- [ ] Key derivatives by ownership/scope, source hash, extractor version, chunk/index version and relevant prompt version. Store immutable derivatives in the authorized namespace; D1 records durable state and coverage.
- [ ] Track total source extent, indexed ranges, omitted/unreadable ranges, origin and stop reason from the first batch. Keep successfully indexed ranges when a later batch fails.
- [ ] Test identical bytes producing identical chunks, late-section access, repeated headings, huge fenced blocks, Unicode offsets, source replacement and unauthorized cache reads. Do not introduce a vector database or agent framework.

**Run/evidence:** from `packages/control-plane`, `node --test test/roadmap-source-index.test.js`. Save a deterministic manifest with complete range accounting and a negative cross-user lookup; the receipt names implementation limits as configuration, not newly approved spending.

### R7a.02 Summarize bounded batches and retrieve original evidence

**Owner:** Tools. **Depends:** R7a.01, R4.06, R4.09. **Trace:** v1.3 §§3.8, 6.1–6.2; M4.1–M4.3 long-source extension, M4.20. **Model:** proposed `roadmap_index`, Sonnet `claude-sonnet-5-5`, low, platform-funded; deterministic lexical retrieval has no model.

**Existing:** `packages/control-plane/src/pdf-pages.js:80` `selectPages` supplies lexical ranking and neighbor-first precedent; `packages/control-plane/src/explain-evidence.js:15` `evidenceRecord` hashes what was actually read. **Proposed:** create `packages/control-plane/src/agents/roadmap-index.js`; extend release-created `roadmap-source.js`, `roadmap-tools.js`, `roadmap-policy.js`; create `test/roadmap-source-retrieval.test.js`.

- [ ] Build a whole-source outline from deterministic headings/ranges before model summaries. For long sources, summarize bounded chunk batches under per-document calls, characters and elapsed-time ceilings; never request an unlimited “whole section.”
- [ ] Reserve each summary call before dispatch, persist its input/version checkpoint, and replay its completed result. Unknown provider outcomes reconcile before retry; exhausted quota returns a partial index with the specific reason.
- [ ] Define `readSourceEvidence(access,{indexId,anchor,terms,maxChars})`: exact anchor and neighbors first, then stable lexical ranking, with output bounded by caller purpose. Return original excerpts plus source locations/coverage, not summaries promoted into evidence.
- [ ] Keep an explicit distinction among outlined, summarized, retrieved and unread content. A plan may use an outline for navigation while claims require the original retrieved passage.
- [ ] Test anchor/term retrieval of late content, deterministic ties, empty queries, single giant sections, summary failure after earlier success, instruction-like source text and bounded total input. Reject impossible character bounds rather than dropping disclosure.

**Run/evidence:** from `packages/control-plane`, `node --test test/roadmap-source-retrieval.test.js`. Attach retrieval traces with selected range IDs, actual character counts and one exhausted-budget result; optional live quality measurement stays inside the release's recorded paid-test authorization.

### R7a.03 Invalidate changed indices and expose coverage honestly

**Owner:** State/Money and UI; Verifier signs the adapter receipt. **Depends:** R7a.01–R7a.02, R3 references, R4.09/R4.12. **Trace:** v1.3 §§3.8, 6.2; M4.20, source-change portions of M7.3. **Model:** none beyond the prior index task.

**Existing:** `packages/web/src/context-docs.js:16` change event and `:88` `uploadContextSource`; `packages/control-plane/src/learn-context-docs.js:208` lookup pins stored file source hash. **Proposed:** modify release-created `roadmap-source.js`, `roadmap-store.js`, `RoadmapView.jsx`; add `test/roadmap-source-version.test.js`, `packages/web/src/roadmap-source-coverage.test.mjs`, `e2e/roadmap-source-check.mjs`.

- [ ] Treat uploaded source versions as immutable. Commit a source-selection replacement or detach and its outbox event with the authoritative roadmap/context-selection mutation, naming old/new source identities and selection revision. An upload alone does not mutate the previously selected source or invalidate its historical references. An old notification cannot invalidate a newer selection.
- [ ] Invalidate only affected unaccepted proposal/check/index bindings. Preserve historical delivered cards, their immutable references and accepted entitlements; show a changed-source status instead of rewriting history.
- [ ] Surface “indexed through …,” unread ranges and budget/extraction limits beside supported scope choices. A whole-document request with incomplete coverage must narrow explicitly or disclose the gap before acceptance.
- [ ] Register the long-Markdown capability only when enabled and checked. If disabled or unavailable, the R4 bounded Markdown path remains available for a supported explicit scope.
- [ ] Test unauthorized cached reads after access revocation, same-version reuse, extractor-version rebuild, a late chapter, headingless text and budget exhaustion. Browser checks must navigate to the exact original passage through R3.

**Run/evidence:** from `packages/control-plane`, `node --test test/roadmap-source-version.test.js`; from `packages/web`, `node --test src/roadmap-source-coverage.test.mjs`, then `node e2e/roadmap-source-check.mjs`. The R7a receipt contains a coverage manifest, historical-reference screenshot and bounded-work accounting.

## R7b — PDF text and page references

### R7b.01 Adapt existing PDF extraction into versioned coverage records

**Owner:** Tools and State/Money. **Depends:** R7a retrieval/coverage contract; R3 page navigation. **Trace:** v1.3 §3.8; M4.20 PDF portion, D5/D42. **Model:** none; no OCR or vision role in this release.

**Existing:** `packages/web/src/context-doc-pages.js:20` `readPageTexts`; `packages/control-plane/src/pdf-pages.js:22` page-array validation, `:35` `putPageTexts`, `:48` `readPages`; `packages/control-plane/src/learn-context-docs.js:90` `readOwnDocument` and `:220` upload handling. **Proposed:** create `packages/control-plane/src/roadmap-source-pdf.js`; extend source index/coverage modules and PDF ingestion as needed; create `test/roadmap-source-pdf.test.js`.

- [ ] Resolve the learner's immutable PDF bytes and associated extracted page text through the same ownership rules as the existing reader. Bind derivative identity to both PDF source revision and extraction-version/text hash.
- [ ] Record `origin:'browser_pdfjs_text'`, PDF-order page number, original byte hash, per-page text status and extraction limits. Browser-produced text is a declared derivative, not a claim of server extraction or visual verification.
- [ ] Convert empty/scanned/damaged pages, cut markers and incomplete extraction into unreadable/partial coverage. Existing extraction may throw at its total time/text limit; record that failure rather than inventing unreturned page text.
- [ ] Validate page arrays, page counts and text bounds server-side. Re-extraction creates a new derivative revision and coverage record, leaving already delivered references bound to their historical input.
- [ ] Test uploaded PDF ownership, mixed text/scans, first/last page, corrupt text payload, cut pages and retry. Do not silently route unreadable pages to assessment vision or an unshipped OCR provider.

**Run/evidence:** from `packages/control-plane`, `node --test test/roadmap-source-pdf.test.js test/pdf-pages.test.js`; from `packages/web`, `node --test src/context-doc-pages.test.mjs`. Keep the PDF-to-derivative hash mapping and page coverage list.

### R7b.02 Retrieve page text with intact references and bounded evidence

**Owner:** Tools. **Depends:** R7b.01, R7a.02. **Trace:** v1.3 §§3.8, 6.2; M4.20; extends M3 page anchors. **Model:** proposed `roadmap_index` Sonnet `claude-sonnet-5-5`, low, only for optional bounded summaries; page ranking/reading is deterministic.

**Existing:** `packages/control-plane/src/pdf-pages.js:69` `namedPages`, `:80` `selectPages`, `:110` `pagesDocument`; `packages/control-plane/src/explain-evidence.js:15` permits page-bearing evidence records. **Proposed:** modify `roadmap-source-pdf.js`, release-created `roadmap-source.js` and source-reference adapter; add retrieval cases to `test/roadmap-source-pdf.test.js`.

- [ ] Implement the same `readSourceEvidence` response for PDFs: immutable source/derivative versions, page plus local offsets, original extracted excerpt, selected/omitted pages and limitations.
- [ ] Prefer the requested page and neighbors, then explicit page ranges and lexical relevance. Reuse the existing selector where compatible; adapt its fixed request limit deliberately rather than assuming it proves full-document coverage.
- [ ] Preserve the distinction between a page's PDF order and printed page labels. Keep repeated headers and same text on separate pages addressable.
- [ ] Bind claims only to excerpts actually returned and read. Pages represented only by outline or summary remain unavailable as direct evidence until retrieval.
- [ ] Test a relevant page near the end of a long PDF, multiple requested ranges exceeding the bound, empty requested page, page cut, duplicate headers and changed extraction. Round-trip each returned reference through the existing viewer.

**Run/evidence:** from `packages/control-plane`, `node --test test/roadmap-source-pdf.test.js test/pdf-pages.test.js`. Retain selected-page traces and evidence records whose page/offsets reopen the intended text; demonstrate exact character bounds without truncating the coverage explanation.

### R7b.03 Ship PDF scope and limitations without widening the adapter

**Owner:** UI and Verifier. **Depends:** R7b.01–R7b.02, R4 complete flow. **Trace:** v1.3 §3.8, D5; PDF portion of M4.20. **Model:** none additional.

**Existing:** `packages/web/src/context-doc-pages.js:57` `processing` exposes reading progress; `packages/web/src/context-docs.js:100` `retryContextDoc`; `packages/control-plane/src/pdf-pages.js:52` `pdfStatus` distinguishes ready/failed page extraction. **Proposed:** modify release-created `RoadmapView.jsx`/scope UI and source client; create `packages/web/src/roadmap-pdf-coverage.test.mjs`, `e2e/roadmap-pdf-check.mjs`.

- [ ] Present readable page scope, extraction progress and unavailable pages using the current document controls. A scanned page asks for a readable source or later supported OCR path; it never promises text the adapter has not read.
- [ ] Let the learner narrow an incomplete whole-document request to explicit supported pages. Preserve the original instruction and show resulting coverage in the proposed revision before acceptance.
- [ ] Gate PDF planning independently from long Markdown and R3 selected-excerpt navigation. Turning PDF planning off must not break historical page links or the supported Markdown loop.
- [ ] Exercise extraction retry/reload, page near the end, mixed readable/unreadable document, changed source and revoked access. Verify the explanation cites the requested original pages.
- [ ] Prove no vision endpoint, general execution service or unrelated media command is called. Confirm platform index work and learner accepted generation retain their separate accounting.

**Run/evidence:** from `packages/web`, `node --test src/roadmap-pdf-coverage.test.mjs` and `node e2e/roadmap-pdf-check.mjs`; use the shared R4 money tests for accepted delivery. Attach current-UI screenshots, coverage and route traces to an independent R7b receipt.

## R8a — Scoped web discovery and fetched evidence

### R8a.01 Validate public-gap queries and reserve work before egress

**Owner:** Tools and State/Money; Lead owns registry/transport seams. **Depends:** R4.03 dispatcher, R4.06 quotas/identities. **Trace:** v1.3 §§3.9, 5.1, 6.3; M4.21/M4.23, D14/D40. **Model:** proposed `roadmap_research`, Sonnet `claude-sonnet-5-5`, low, platform-funded query formation.

**Existing:** `packages/control-plane/src/learn-search.js:167` `discoverSources`; `:138` `exaSearch`; `packages/control-plane/src/learn-paid-transport.js:59` `admitTool` currently generates an operation ID internally. **Proposed:** create `packages/control-plane/src/roadmap-research.js`, `packages/control-plane/src/agents/roadmap-research.js`, `test/roadmap-research-privacy.test.js`; narrowly extend the paid-tool identity seam with Lead.

- [ ] Define `researchGap(env,access,{roadmapId,revision,gapId,publicConcept})`. Require a named gap within accepted scope and the separately enabled research capability; the tool cannot broaden the learning goal.
- [ ] Form a general public query, then validate outgoing text against private excerpts, names, identifiers and secret-like material before any network request. If a safe query cannot be formed, return `needs_clarification`; do not substitute raw learner source text.
- [ ] Reserve shared platform spend and per-learner/window work quota before query generation, search and bounded page reads. Settle/release accurately; provisional old numeric budgets require an owner-recorded configuration.
- [ ] Thread a trusted server-only stable operation identity into the actual Exa admission path, with stage checkpoint and reconciliation. The current `admitTool` signature does not already provide this; reject caller-supplied arbitrary ledger IDs.
- [ ] Test rejected sensitive query causing zero requests, concurrent quota exhaustion, disabled flag, missing key, replay after timeout and unknown search cost. No learner charge is created.

**Run/evidence:** from `packages/control-plane`, `node --test test/roadmap-research-privacy.test.js`. Capture redacted egress fixtures, reservation rows and request counts, including an unknown outcome that does not blindly dispatch again.

### R8a.02 Fetch candidates through existing guards and retain provenance

**Owner:** Tools. **Depends:** R8a.01, R4.09 grounding boundary. **Trace:** v1.3 §§3.9, 6.3; M4.21. **Model:** none for discovery/fetch plumbing; the bounded research role may select candidates but cannot certify unread content.

**Existing:** `packages/control-plane/src/explain-fetch.js:46` `evidenceFetcher` enforces URL/redirect checks, size/time/type limits and no credentials; `packages/control-plane/src/explain-evidence.js:15` `evidenceRecord`, `:41` `untrustedBlock`; `packages/control-plane/src/learn-search.js:167` returns candidates with `read:false`. **Proposed:** extend `roadmap-research.js`; create `test/roadmap-research-evidence.test.js`.

- [ ] Search a bounded number of candidates, select relevant primary pages, then actually fetch them. Search titles/snippets and model-authored citations are never evidence records.
- [ ] Preserve final URL, retrieval time, hash of bytes read, original excerpt, discovery origin, access class and limitations. Distinguish partial body from complete-page reading.
- [ ] Reuse public-network/DNS and every-redirect validation. No credential forwarding, paywall bypass, local network access or arbitrary download path is added by the Tutor wrapper.
- [ ] Route PDF candidates only through a shipped supported document adapter; when unavailable, return the unsupported limitation. Research does not depend on R7b shipping, and must still handle HTML sources.
- [ ] Treat fetched instructions as untrusted source data. Page access failure, scripted empty body, content-type refusal, provider timeout and conflicting sources produce typed limitations or clarification, not fabricated answers.
- [ ] Test malicious redirects, paywall response, oversized/truncated text, unsupported PDF, duplicate candidate and contradictory evidence. Ensure R4 claim checking reads the retained original excerpts.

**Run/evidence:** from `packages/control-plane`, `node --test test/roadmap-research-evidence.test.js test/explain-evidence.test.js test/learn-search.test.js`. Keep request/evidence pairs showing every cited page was fetched and each refused page remained unavailable.

### R8a.03 Integrate research as an independent bounded tool release

**Owner:** Tools, UI and Verifier. **Depends:** R8a.01–R8a.02; R4.03/R4.09. **Trace:** v1.3 §§3.9, 6.1–6.3; M4.21 and new-tool M4.23 checks. **Model:** proposed `roadmap_research`, Sonnet `claude-sonnet-5-5`, low; use existing R4 targeted support checker for resulting claims.

**Existing:** `packages/control-plane/src/explain-evidence.js:128` `learnerCitation` is the citation-label seam; `packages/control-plane/src/learn-models.js:40` central task registry. **Proposed:** register research in release-created `roadmap-tools.js`, `roadmap-policy.js` and source/evidence UI; create `test/roadmap-research-tool.test.js`, `e2e/roadmap-research-check.mjs`.

- [ ] Return the shared typed statuses `ok/partial/needs_clarification/unsupported/unavailable` with bounded evidence and coverage. Retain the named gap and source/policy version in the tool result.
- [ ] Feed fetched evidence into the existing proposal/generation checks, with clear external citations and uncertainty. A failed research call must leave source-supported explanation paths available.
- [ ] Keep browser/source-card creation optional and separate: completing research never buys or requires a browser card.
- [ ] Register `ROADMAP_WEB_RESEARCH` only with the verified adapter, quota configuration and relevant release receipt. Flag-off, permission loss and revision changes stop new tool work without deleting delivered citations.
- [ ] Smoke an undefined public concept, refused private query and provider outage in the current UI. Assert no hidden query continuation beyond the bounded reformulation policy and no learner debit for research.

**Run/evidence:** from `packages/control-plane`, `node --test test/roadmap-research-tool.test.js`; from `packages/web`, `node e2e/roadmap-research-check.mjs`. Record requested/served model, exact calls, latency, platform cost and citation trace for authorized live samples; approve R8a independently of calculation and additional formats.

## R8b — Restricted deterministic calculation

### R8b.01 Implement a deliberately small expression grammar

**Owner:** Tools. **Depends:** R4.03 typed dispatcher. **Trace:** v1.3 §§3.9, 6.1, 6.3; M4.22, D41. **Model:** none.

**Existing:** `packages/control-plane/src/explain-evidence.js:12` `sha256Hex` is reusable for result fingerprints; the baseline evidence contract is not a calculator. **Proposed:** create `packages/control-plane/src/roadmap-calculate.js`, `test/roadmap-calculate.test.js`; register only after validation.

- [ ] Define `calculateExpression({expression,variables},limits)` using a tokenizer and parser for a documented arithmetic grammar. Initially permit finite numbers, bounded named numeric variables, parentheses and explicitly listed operators/functions.
- [ ] Refuse property access, strings, assignments, imports, network access, function construction and unlisted identifiers. Do not use `eval`, `new Function`, arbitrary package installation or uploaded code execution.
- [ ] Bound source characters, tokens, nesting, AST nodes, operation count, variable count and exponent/domain behavior before evaluation. Check every intermediate/result for finiteness and safe resource consumption.
- [ ] Specify precedence, associativity, unary minus, precision/rounding policy and division-by-zero handling; document that a finite floating-point answer is not an exact-arithmetic proof.
- [ ] Test precedence, signed powers, decimal values, variables, domain errors, overflow, NaN/Infinity literals, deep nesting and adversarial long expressions. Keep deterministic golden results and refusal codes.

**Run/evidence:** from `packages/control-plane`, `node --test test/roadmap-calculate.test.js`. The receipt includes the accepted grammar and concrete limit table plus tests proving prohibited syntax never reaches a dynamic execution primitive.

### R8b.02 Bind computations to inputs, versions and checked claims

**Owner:** Tools; State/Money reviews evidence persistence. **Depends:** R8b.01, R4.09. **Trace:** v1.3 §§3.9, 6.2; M4.22/M4.23. **Model:** none for evaluation; existing R4 grounding may check premise/source bindings.

**Existing:** `packages/control-plane/src/explain-evidence.js:15` `evidenceRecord` hashes read bytes and `:57` `valueConflict` preserves disagreements; neither currently declares a computational-evidence schema. **Proposed:** extend release-created shared roadmap contract with `ComputationEvidence`; modify `roadmap-calculate.js`, `roadmap-tools.js`; create `test/roadmap-computation-evidence.test.js`.

- [ ] Return `{expression,inputs,result,evaluatorVersion,limitsVersion,inputHash,precision,limitations}` in an explicitly computational record. Use a discriminator validated independently of source excerpts; do not force a fake URL into the existing web evidence shape.
- [ ] Preserve input units and source/evidence references when supplied. Verify that variable values used by the evaluator equal the cited premises, and distinguish an arithmetic result from a claim that the model's assumptions are correct.
- [ ] Canonicalize/hash the exact expression, values and evaluator version; repeated inputs replay deterministically. A new source value produces a new computation identity.
- [ ] Allow checks to cite a verified derivation only after both premises and calculation pass. Unsupported or ambiguous unit conversion returns clarification/limitation rather than invented precision.
- [ ] Test tampered result, mismatched input hash, stale premise revision, unsupported units, rounding boundary and replay. No successful record may contain a non-finite value.

**Run/evidence:** from `packages/control-plane`, `node --test test/roadmap-computation-evidence.test.js`. Attach an original source quantity → input binding → evaluated result trace and a rejected altered result; record no provider operation for deterministic evaluation itself.

### R8b.03 Enable calculator independently and verify learner disclosure

**Owner:** Tools, UI and Verifier. **Depends:** R8b.01–R8b.02; R4 complete flow. **Trace:** v1.3 §3.9; M4.22, D41. **Model:** none additional.

**Existing:** `packages/control-plane/src/learn-models.js:40` establishes central model roles; this deterministic tool requires no new role. **Proposed:** extend release-created `roadmap-tools.js`, `roadmap-policy.js`, grounding output and citation display; create `test/roadmap-calculator-tool.test.js`, `e2e/roadmap-calculator-check.mjs`.

- [ ] Expose a separately flagged calculator capability with typed argument validation, current access/scope, deadline and bounded computational output. Its absence leaves source-supported R4 work available.
- [ ] Show the expression and meaningful precision/assumptions when they support the lesson; do not clutter ordinary content with internal evaluator IDs.
- [ ] Keep code examples clearly unexecuted unless they use this supported arithmetic tool. A JavaScript/Python snippet, uploaded script or arbitrary shell command is outside R8b.
- [ ] Exercise a derived numerical answer, invalid expression, exhausted operation bound, disabled capability and source value change. Verify errors lead to an honest limitation rather than a false “verified” label.
- [ ] Record tool invocation/count separately from model composition cost. Calculator operation itself creates no learner charge or paid provider operation.

**Run/evidence:** from `packages/control-plane`, `node --test test/roadmap-calculator-tool.test.js`; from `packages/web`, `node e2e/roadmap-calculator-check.mjs`. Attach displayed derivation and refusal evidence. R8b's receipt is independent of R8a, arbitrary sandbox execution and rich-format adapters.

## R9 — Optional practice and assessed Progress

### R9.01 Bind delivered practice to a hidden private roadmap goal

**Owner:** State/Money. **Depends:** R4.02/R4.09, retained attempts/assessment interfaces. **Trace:** v1.3 §§3.10, 4.2; M9.1; D3/D26. **Model:** none.

**Existing:** `packages/control-plane/src/learn-attempt-store.js:349` `bindExplainBackCard` is the content-addressed private binding precedent; `packages/control-plane/src/learn-coaching-store.js:25` `NOT_CARD_GOAL` hides only `lg_eb_`; `:56` reads goal state; `packages/control-plane/learn-migrations/0025-tutor-coaching-state.sql:29` constrains goal origin. **Proposed:** create `packages/control-plane/src/roadmap-goal.js`, `test/roadmap-goal.test.js`; modify coaching-store predicates and attempt binding integration.

- [ ] Implement `ensureRoadmapGoal(access,{roadmapId,revision,targets})` using deterministic learner/board-scoped `lg_rm_` IDs and `origin:'coaching'`. Reuse goals, criteria and activities rather than adding a new origin or a second assessment system.
- [ ] Map each accepted outcome target to versioned criteria with explicit requirements. Keep unchanged criteria stable across a revision; changed requirements receive a new version so old evidence is not misapplied.
- [ ] Add `bindRoadmapActivity(access,{roadmapId,stepId,cardId,resultVersion})` for authorized delivered practice only. Recheck saved card/result binding; a browser-supplied prompt/key cannot replace server-owned assessment inputs.
- [ ] Widen the hidden-goal predicate to exclude both `lg_eb_` and `lg_rm_` from goal selectors, goal limits and personal-goal management. Never change the learner's active personal-goal pointer to this internal container.
- [ ] Provide a private roadmap-to-goal lookup for Progress even when the personal goal list is empty. Sharing/forks contain no inherited hidden goal, attempt, observation or private binding.
- [ ] Test idempotent creation, concurrent bind, criterion revision, crossed learner/canvas, forged card and empty personal-goal list. If additional binding storage is needed, allocate an additive `<NNNN>` migration only after inspecting the current schema.

**Run/evidence:** from `packages/control-plane`, `node --test test/roadmap-goal.test.js test/learn-coaching-store.test.js test/learn-explain-attempts.test.js`. Evidence shows private rows and no “Set a goal” prerequisite.

### R9.02 Bind quizzes to immutable question/options/key snapshots

**Owner:** State/Money and Tools. **Depends:** R9.01, R4.09 checks. **Trace:** v1.3 §§3.10, 6.2; M9.2; D32. **Model:** none for keyed scoring.

**Existing:** `packages/web/src/LearningBlocks.jsx:1336` `QuizBody` grades from local `option.correct`; `packages/control-plane/src/learn-assessment.js:83` `assess` retains Explain-back/rubric/visual handling and its `:100`–`:105` fallback makes old journey-probe choices unavailable; P1 removed journey keyed/JEV grading; `packages/web/src/learn-coaching-contract.js:111` requires integer `activityRevision`; `packages/control-plane/src/learn-attempt-store.js:89` `acceptAttempt` preserves immutable submissions. **Proposed:** create `packages/control-plane/src/roadmap-quiz.js`, `test/roadmap-quiz-snapshot.test.js`; add a scoped immutable-roadmap quiz scorer after retained Explain-back handling and before the generic unavailable fallback. Use the existing `keyed` route vocabulary with `checker:'roadmap_quiz_snapshot'` provenance; do not restore journey grading, JEV assessment or planner imports.

- [ ] Define `bindQuizCard(access,{cardId,resultVersion})` from authoritative delivered data. Canonicalize question, ordered stable option IDs/text, answer key, rationale and relevant source/check versions; put the content hash in `activityId`, for example `la_rq_<card-scope-hash>_<snapshot-hash>`.
- [ ] Keep `activityRevision` an integer, initially 1 for each immutable activity. Never put the hash into the integer revision column. Store the complete immutable key privately, separately from learner-visible prompt/options. Strip `correct` flags and private rationale from published roadmap quiz blocks and their Chat context; preserve ordinary legacy quiz behavior on its existing path.
- [ ] Return a binding with the displayed question snapshot. Submit its `activityId/activityRevision` with `optionId`; grade that saved snapshot if valid, even if a new card version now exists.
- [ ] If the named snapshot is unavailable or no longer safely assessable, return 409 `question_changed` with a fresh displayed question and require a new answer. Never automatically bind the old choice to a new key or option order.
- [ ] Unsupported/unknown grounding for a key yields unscored feedback and no negative observation. An invalid option is not a wrong-answer observation. Record checker provenance without exposing key internals in attempt responses.
- [ ] Test reordered options, changed key, render/submit race, retained old outcome, missing snapshot, duplicate submission and unsupported key. Keep the current legacy journey-probe cases unavailable with `no_answer_key` and no observations/provider call; a forged/non-roadmap choice cannot enter the new scorer. Inspect `cardContext` at `packages/web/src/LearningBlocks.jsx:2295` so roadmap Chat context cannot reveal private keys through existing quiz annotations.

**Run/evidence:** from `packages/control-plane`, `node --test test/roadmap-quiz-snapshot.test.js test/learn-assessment.test.js`; from `packages/web`, `node --test src/learn-coaching-contract.test.mjs`. Keep original/new snapshot IDs and unchanged old grading as proof.

### R9.03 Commit assessment evidence and notification in one guarded batch

**Owner:** State/Money. **Depends:** R9.01–R9.02, R4.05. **Trace:** v1.3 §§3.10, 5.4; M9.5–M9.6. **Model:** deterministic keyed quiz: none. Explain-back: retain `tutor_rubric` → `claude-opus-5-5`; supported existing visual answers retain `tutor_visual`, not a new OCR capability.

**Existing:** `packages/control-plane/src/learn-attempt-store.js:261` `claimAssessment`, `:279` `commitAssessment`, `:292` final status UPDATE; `packages/control-plane/src/learn-assessment.js:114` `assessAttempt`; `packages/control-plane/src/learn-explain-assessment.js:457` retained assessor; free-assessment test `packages/control-plane/test/learn-assessment-charging.test.js:89`, and `:141` keyless legacy-choice test. `packages/control-plane/src/learn-rubric-assessment.js:31` now imports the retained transport from `packages/control-plane/src/learn-spend.js:150` `spendCallModel`. **Proposed:** modify these narrow commit/routing points and create `test/roadmap-assessment-outbox.test.js`.

- [ ] Reuse accepted-attempt and single-claim semantics; no second rubric/quiz service and no extra paid assessment generated by the roadmap coordinator. Assessment remains free even when learner allowance is exhausted. Retain its free assessment usage context and `learn-spend.js` provider wrapper; do not recreate the removed Tutor planner dependency.
- [ ] Add `appendRoadmapEventStatements(fact)` inside `commitAssessment`'s observation/status batch, guarded by the same assessment ID, pending status and claim token. Insert before the terminal UPDATE while that guard remains true.
- [ ] Preserve the existing `results.at(-1)` success assumption by keeping status UPDATE last, or explicitly track its result index. A lost/reconciled claim must write neither observations nor an event.
- [ ] Deduplicate on actor/roadmap/assessment identity and actual fact revision. After commit, the R4 durable dispatcher owns retry; do not depend on a route-side call after `assessAttempt` returns.
- [ ] Deliver an event for terminal evidence availability with outcome/validity, not an invented success for failed/unavailable grading. R10 reads canonical evidence rather than trusting model-written notification payloads.
- [ ] Inject crashes after database commit and after outbox claim; test duplicate assessment replay, invalid observations, changed claim, platform-cap refusal and unknown evaluator outcome. Assert one assessment, applicable observations once, one replayable event and zero learner debit. Extend the current charging suite with the new deterministic roadmap-keyed path: no provider operation/usage row, unchanged learner balance; preserve its legacy keyless-choice regression and existing retained rubric/visual guards.

**Run/evidence:** from `packages/control-plane`, `node --test test/roadmap-assessment-outbox.test.js test/learn-attempt-store.test.js test/learn-assessment-charging.test.js`. Retain the guarded batch and crash-recovery rows; a successful route response alone is insufficient proof.

### R9.04 Support answer later and private Progress without conflating thumbs

**Owner:** UI; State/Money supplies reads. **Depends:** R9.01–R9.03, R1 feedback. **Trace:** v1.3 §§3.10, 2.5; M9.3–M9.4, M9.6. **Model:** none for reads/rendering; assessment calls remain R9.03.

**Existing:** `packages/web/src/LearningBlocks.jsx:1098` Explain-back submission, `:1336` `QuizBody`; `packages/web/src/explain-back-service.js:78` binder and `:92` submit service; `packages/control-plane/src/learn-attempt-routes.js:122` ordinary binding route; `packages/control-plane/src/learn-attempt-store.js:441` history lookup; `packages/web/src/LearnProgress.jsx:28` currently derives its view from personal goals; `packages/control-plane/src/learn-progress.js:93` `readProgress`; `packages/web/src/learn-coaching-contract.js:49` five statuses. **Proposed:** modify these UI/read integrations; add `packages/web/src/roadmap-practice.test.mjs`, `e2e/roadmap-practice-check.mjs`.

- [ ] Bind the shown quiz before answer submission and retain a stable submission key for retries of the same answer. Render server feedback; on 409 show the changed question and clear the selected answer only with an explicit new-answer state.
- [ ] Route roadmap Explain-back submission through the authorized `bindRoadmapActivity` result rather than the ordinary `/attempts/bind` path that creates `lg_eb_`. Extend attempt-history lookup to resolve the same authorized roadmap binding instead of unconditionally deriving `lg_eb_`; ordinary Practice keeps its existing path. Test answer → reload → Progress and assert the stored attempt belongs to the roadmap `lg_rm_` goal with matching criteria.
- [ ] Keep delivered practice answerable later. ToC answered/unanswered metadata is separate from delivery state; unanswered practice does not block the next context-based step or imply a failed assessment.
- [ ] Add a roadmap evidence section to existing Progress with outcome/criteria, evidence count and the retained five statuses. Read its private evidence container even with no personal goals; preserve pending/error display without fabricating a new status.
- [ ] Keep thumbs visible as self-reports, distinct from assessed observations. Already understood is an R10 control and stays unavailable until R10 ships; its later self-report must remain separate. Accepting/viewing flashcards or a quiz produces no demonstrated-mastery count.
- [ ] Test reload, a second device, answer-later return, duplicate submit, failed grading, privacy across boards and source revocation. Do not put private attempt state or answer drafts onto shared card content.
- [ ] Extend existing response leak assertions for quiz key/rationale and private provenance fields, while showing only the feedback intended for the learner.

**Run/evidence:** from `packages/web`, `node --test src/roadmap-practice.test.mjs src/learn-progress-client.test.mjs src/explain-back-service.test.mjs`; approved browser runner: `node e2e/roadmap-practice-check.mjs`. Include private Progress screenshots and attempts/charges counts.

### R9.05 Activate practice only through complete checked generation and scoring

**Owner:** Tools and Verifier; Lead owns registry updates. **Depends:** R9.01–R9.04, R4.07–R4.11. **Trace:** v1.3 §3.10; M4 practice activation, M5 practice extensions, M9.6. **Model:** metadata uses proposed `roadmap_proposal`, Sonnet `claude-sonnet-5-5`, low. Accepted content reuses the existing `artifact` generator configuration, currently `claude-opus-5`; keep its existing transport/provider configuration and verify served model. Scoring uses R9.03.

**Existing:** `packages/control-plane/src/learn-models.js:113` artifact task (using `ASK_MODELS.auto`), and retained assessment roles `:56`–`:57`; `packages/web/src/LearningBlocks.jsx:1336` quiz renderer, `:2189` `FlashFace`, `:2202` `RateButtons`; `packages/control-plane/src/learn-primitives.js:56` flashcards schema and `:255` `artifactBlock` validation. **Proposed:** extend release-created proposal/generation allowlist and checks for supported quiz/Explain-back/flashcards primitives; create `test/roadmap-practice-policy.test.js`, `test/roadmap-flashcards.test.js`, and `packages/web/src/roadmap-flashcards.test.mjs`. This adds bounded practice support; it does not wait for every R12 command adapter.

- [ ] Add Explanations plus practice to accepted roadmap settings only when its proposal, generation, immutable binding and assessment paths work end to end. Persist the setting with the accepted revision.
- [ ] Choose practice from context, outcome and evidence; no fixed two-explanations-to-one-practice rhythm. Allow explanations-only throughout, and avoid offering an unsupported practice format.
- [ ] Add `flashcards` explicitly to the trusted server practice allowlist. Reuse `PRIMITIVES.flashcards`: 2–12 cards, each exactly `{front,back}`, front 1–300 and back 1–600 characters; retain unknown-property refusal and add trimmed nonblank checks. Check each question/answer pair against retrieved original evidence, record coverage/limitations, and hold or omit unsupported answers rather than presenting them as verified. This requires no separate rich-command adapter.
- [ ] Extend full-step admission and publication checks to practice output. Validate key/rubric support before a practice result is offered as assessable; use existing hold/finite-resolution/refund behavior for unknown safety or failed cards.
- [ ] Separate chargeable accepted card creation from free later grading. The same accepted step cannot reserve twice, and assessment must not accidentally inherit its learner-funded usage context.
- [ ] Test flashcard accept, initial view, reveal/flip, Next and self-rating in both stepped and full-deck views. Those interactions create no attempt, assessment, assessed observation or demonstrated-mastery count, and no debit after accepted generation. Existing Got it/Not yet ratings remain self-report. Flashcard backs are intended delivered content, already present in the current DOM; do not treat reveal as a private-key gate. Add malformed/blank Q&A, excessive length/count, extra-property, unsupported-answer and public `allowedPrimitives` escape fixtures.
- [ ] Add deterministic policy fixtures for early/late practice, no meaningful check needed, unanswered prior practice and unsupported key. Test insufficient whole-step allowance, failure/refund and duplicate acceptance alongside the quiz/Explain-back flow.

**Run/evidence:** from `packages/control-plane`, `node --test test/roadmap-practice-policy.test.js test/roadmap-flashcards.test.js test/learn-artifact.test.js test/roadmap-money.test.js test/learn-assessment-charging.test.js`; from `packages/web`, `node --test src/roadmap-flashcards.test.mjs`. R9 receipt includes one answered quiz, one Explain-back, one answer-later case, a grounded flashcard deck with reveal/self-rate producing no assessed evidence, separate generation/assessment accounting and no fixed-rhythm assertion.

## R10 — Evidence-based adaptation and expanded revisions

### R10.01 Define bounded adaptation decisions from distinct evidence types

**Owner:** Tools. **Depends:** R1, R5 version contract, R9 assessed evidence. **Trace:** v1.3 §§3.11, 6.2; M10.1. **Model:** proposed `roadmap_adapt`, Opus `claude-opus-5-5`, no fallback, platform-funded; no new assessment role.

**Existing:** `packages/control-plane/src/learn-attempt-store.js:305` `goalEvidence`; `packages/web/src/learn-coaching-contract.js:264` `applicable` filters completed/valid criterion-version evidence; `packages/control-plane/src/learn-progress.js:93` private read model. **Proposed:** create `packages/control-plane/src/agents/roadmap-adapt.js`, `test/roadmap-adapt.test.js`, `tests/evals/roadmap/adapt-cases.mjs`; extend release-created roadmap decision validator.

- [ ] Define a small output union: `none`, `revise_unaccepted`, `insert_prerequisite`, `ask`, or `adjust_coverage`, with target IDs, bounded reason and evidence references. The output proposes a transition; it never writes observations or authorizes generation.
- [ ] Build inputs from applicable assessed evidence, explicit learner instructions and self-reports in separate fields. Include criterion/source versions, assistance, unresolved/conflicting evidence and relevant prior delivered content.
- [ ] Make cancellation, acceptance, card viewing and unanswered practice neutral about mastery. Already understood may change coverage by learner instruction but cannot become a successful quiz/rubric observation.
- [ ] Write evaluation cases before tuning: conflicting thumbs and quiz evidence, wrong answer with several plausible causes, irrelevant card, already-understood declaration, missing prerequisite and uncertainty requiring one question.
- [ ] Bound calls/candidates and compare decisions with a recorded rubric: relevance, proportionate change, evidence fidelity, preserved learner control and no repeated irrelevant remediation. Fail schema/unsupported target outputs closed.
- [ ] Preserve the earliest unaccepted boundary and accepted ceiling in the validator, not just the prompt.

**Run/evidence:** from `packages/control-plane`, `node --test test/roadmap-adapt.test.js`; from repository root, `node tests/evals/roadmap/adapt-cases.mjs` after implementing an offline-fixture default. Live candidates require recorded bounded authorization and log actual served model/cost; retain scored cases and rejected transitions.

### R10.02 Apply evidence-triggered changes through replayable version guards

**Owner:** State/Money. **Depends:** R10.01, R9.03, R1 feedback event integration, R4.05. **Trace:** v1.3 §§3.11, 5.4; M10.2 and adaptation portions of M11. **Model:** R10.01's proposed adaptation role, no extra model in the event writer.

**Existing:** `packages/control-plane/src/learn-attempt-store.js:279` guarded assessment commit; `packages/control-plane/src/learn-coaching-store.js:336` `applyCoachingAction` is the existing revision-guarded batch precedent. **Proposed:** modify release-created `roadmap-jobs.js`, `roadmap-store.js`, feedback store and outbox consumer; create `test/roadmap-adapt-events.test.js`.

- [ ] Enter an adapting stage only for relevant durable assessment, feedback or explicit instruction events. Feedback's own fact/outbox write stays atomic; no route-after-return notification pattern is introduced.
- [ ] Claim the event, read canonical latest evidence and persist the input fingerprint/stage before a bounded model call. Coalesce superseded observations while preserving audit identity; a claim alone is never completion.
- [ ] Guard application with expected roadmap revision, evidence version and current mode. If a learner accepted the target while adaptation ran, do not rewrite that accepted generation; re-evaluate the earliest still-unaccepted work or return no change.
- [ ] Supersede only the affected unaccepted proposal and invalidate its checks/drafts. Keep delivered card IDs, assets, original accepted result binding and charges intact.
- [ ] Commit the chosen transition and processed marker together through `commitRoadmapEventEffect`; external composition/check stages keep resumable checkpoints. Before unsolicited adaptation and again before applying/revealing it, require Auto-suggest on, eligible Auto/Tutor mode and no explicit Cancel/pause/End. Turning Auto-suggest back on never clears an explicit Cancel; only the learner’s explicit resume does. Learner-requested revision actions keep their separate authorization.
- [ ] Test duplicate event, lease crash, newer contradictory evidence, feedback toggles, concurrent acceptance, stale source, reversed event order and Auto-suggest off/on after Cancel. The latter must remain paused until explicit resume. Assert one applicable successor and no invented mastery/extra debit.

**Run/evidence:** from `packages/control-plane`, `node --test test/roadmap-adapt-events.test.js test/roadmap-events.test.js`. Save a conflicting-evidence trace and a race proving earlier delivered content and entitlements survive adaptation.

### R10.03 Add prerequisites, focused questions and learner-chosen Rabbit Holes

**Owner:** UI and Tools; Lead integrates Chat routing. **Depends:** R10.01–R10.02, R4.12. **Trace:** v1.3 §3.11; M10.3–M10.5. **Model:** use the proposed adaptation role for complex choice; reuse the retained qualified routing path for explicit Chat intent. No new routing framework.

**Existing:** `packages/web/src/canvas-actions.js:140` current action registry, `packages/control-plane/src/chat-modes.js:179` `chatSystem`; `packages/web/src/learn-progress-question.js:65` `askTutorAbout` preserves prefill behavior. **Proposed:** extend release-created `RoadmapView.jsx`, `StepProposal.jsx`, Chat action adapter and `roadmap-store.js`; create `packages/web/src/roadmap-adapt-ui.test.mjs`, `e2e/roadmap-adapt-check.mjs`.

- [ ] Insert a justified prerequisite before the earliest unaccepted step on the same canvas, with a visible reason and checked proposal. Include it in the accepted step ceiling; a larger plan requires the learner's revised-plan acceptance.
- [ ] When evidence cannot distinguish causes, ask one focused question linked to the relevant step/source. Keep the roadmap questioning state durable; a focused question is not an implicit generation authorization.
- [ ] Add Already understood as a versioned learner coverage action. Keep its provenance as self-report and preserve any contrary assessed evidence.
- [ ] Wire Go deeper only to the learner-invoked existing Rabbit Hole flow. Store a return point containing roadmap/step/version and navigation context; the Tutor must never open a new canvas or branch automatically.
- [ ] Preserve Chat drafts and require Send for prefills. Test cancel/back from the Rabbit Hole flow, missing return target, a revised roadmap on return and no duplicate proposal.
- [ ] Exercise prerequisite, clarification, Already understood and voluntary deeper exploration in the actual current UI, with keyboard and mode behavior preserved.

**Run/evidence:** from `packages/web`, `node --test src/roadmap-adapt-ui.test.mjs`; approved browser runner: `node e2e/roadmap-adapt-check.mjs`. Capture the learner action that opened the Rabbit Hole and the successful return, alongside unchanged assessed-evidence rows.

### R10.04 Include additional sources and request different versions safely

**Owner:** State/Money, Tools and UI. **Depends:** R5.01/R5.04, R9, R10.02; use only shipped source adapters. **Trace:** v1.3 §§3.11, 4.3–4.4; M11.1, M11.3–M11.4, grouped-source M4 extensions. **Model:** proposed `roadmap_revise`, Opus `claude-opus-5-5`, platform-funded; subsequent accepted generation keeps its adapter's existing model.

**Existing:** `packages/web/src/context-docs.js:88` `uploadContextSource`; `packages/control-plane/src/learn-context-docs.js:208` source/hash authorization; `packages/control-plane/src/learn-attempt-store.js:89` immutable attempt precedent. **Proposed:** extend release-created `roadmap-store.js`, `roadmap-routes.js`, `roadmap-revise.js`, `RoadmapView.jsx`; create `test/roadmap-expanded-revisions.test.js`, `e2e/roadmap-revise-check.mjs`.

- [ ] Define `proposeRoadmapRevision(access,{roadmapId,expectedRevision,change,actionKey})` for `include_source`, settings/scope changes and `redo_step`. Resolve any additional source with access, immutable version and declared coverage before composition.
- [ ] If source relationship is unclear, ask one focused question and keep a durable questioning revision. Incorporation changes the proposed plan only; require its explicit acceptance before using the expanded scope.
- [ ] Preserve original learner instruction and version later edits. Show what changes and include all delivered/prerequisite steps in the ceiling calculation; explicit continuation is required past the agreed stopping point.
- [ ] Different version creates a fresh checked proposal at the relevant position and requires fresh acceptance. Earlier delivered cards/assets remain usable; only private ToC relationship metadata indicates replacement, never deletion or accepted-result expiry.
- [ ] Supersede affected unaccepted drafts/results only. Do not activate speculative preparation here; R11 later extends the same invalidation rules. No charge occurs for drafting/revising, and new accepted generation uses R4 atomic full-step admission.
- [ ] Test duplicate revision action, concurrent acceptance, changed/deleted second source, unsupported adapter, cancelled redo, delivered-asset survival, cross-device resume and continuation at the ceiling.

**Run/evidence:** from `packages/control-plane`, `node --test test/roadmap-expanded-revisions.test.js test/roadmap-money.test.js`; approved browser runner from `packages/web`: `node e2e/roadmap-revise-check.mjs`. R10 receipt includes original/new plan versions, original card still accessible, one new accepted action where generation occurred and a stopped-at-outcome case.


## R11 — Platform-funded preparation with separate learner settlement

R11 starts only after R6 automatic proposals and R5’s immutable proposal-version contract work. It builds on R4’s identity, whole-step authorization, publication and outbox contracts. A prepared result may be generated and checked while its decision remains `none`; that never grants access. Preparation expense belongs to the platform. Acceptance creates learner accounting once, without a second provider operation.

### R11.01 Schedule only eligible preparation under platform usage

**Owner:** State/Money and Tools. **Depends:** R4.05–R4.09, R5.01 version contract, R6.01–R6.03. **v1.3:** §§3.12, 5.1, 5.5; D14, D20, D25. **Legacy:** M7.1, M7.3–M7.4/M7.8 preparation portion. **Model:** reuse the eligible adapter’s frozen generation role and R4 checking roles; all preparation/check calls use `withSystemUsage`.

**Existing:** `packages/control-plane/src/learn-usage.js:117`; `packages/control-plane/src/learn-artifact.js:77`; `packages/control-plane/src/explain-job.js:661` illustrates paid brief gating that must not be bypassed. **Modify proposed:** `roadmap-policy.js`, `roadmap-jobs.js`, `roadmap-generate.js`, `roadmap-money.js`; add `roadmap-preparation.test.js`.

- [ ] Add a separate speculative capability flag and explicit per-adapter eligibility registry. Initially permit only qualified lightweight text/table paths. Expensive media and paid planning remain acceptance-first; a command label such as `/explain` does not imply every path is eligible.
- [ ] Add a separate trusted `prepareRoadmapResult(env,access,{preparationPermitId,resultId,resultVersion})` entry. Validate speculative eligibility, current source/proposal fingerprint, platform quota and decision `none`; never weaken accepted-only `generateRoadmapCard` or expose a public `skipAcceptance` option. While N is pending, prepare only the eligible bounded N+1 candidate identified by R6, within the one-next-position contract. Persist candidate/version/source/Depth/instruction fingerprints, card slots and call checkpoints before work. No preparation can implicitly accept its own result or the current proposal.
- [ ] Reserve platform dollar/call/token and per-learner work quotas before every preparation call, using trusted stable identities distinct from ordinary accepted generation. A platform context is real usage context; a ledger category is merely labeling. Admit concurrent calls against the same caps and release known unused quotas.
- [ ] Store output privately, run the same actual-output checks and keep decision `none`. Recheck current source/proposal/settings/access fingerprint before reuse; if nothing relevant changed, reuse valid cached checks. Unknown recheck remains held with finite resolution rather than using routing’s permissive fallback.
- [ ] Add preparation timing separately from R6 proposal-readiness and R4 accepted-generation time. A 1–2 second goal does not skip validation or reserve unlimited background work. Test zero preparation with flag off, Ask/Auto-suggest paused, quota refusal, unsupported command and expensive planning; assert zero learner usage during successful preparation. Prove preparation cannot consume a learner allocation and an ordinary accepted call cannot spoof a preparation permit.
- [ ] Run `node --test packages/control-plane/test/roadmap-preparation.test.js packages/control-plane/test/roadmap-quotas.test.js packages/control-plane/test/roadmap-jobs.test.js` and retain call/usage traces for N-pending/N+1-prepared without a second offer or unbounded sequence.

**Done evidence:** eligible-path matrix, platform payer proof, private polling response and separate latency/cost measurements. Automatic proposal composition alone remains a supported R6 capability when preparation is disabled.

### R11.02 Persist every contributing provider operation and reconcile before sale

**Owner:** State/Money; Verifier reviews attribution. **Depends:** R11.01 and R4.06. **v1.3:** §5.3; D15, D31. **Legacy:** corrected M7.2, M7.3. **Model:** none for accounting/reconciliation.

**Existing:** `packages/control-plane/src/learn-usage.js:223` writes `usage_attempt_detail` pricing data; `:409` refunds; `packages/control-plane/src/telemetry-provider-spend.js:16` provider report reads `usage_operations`. None supplies a result’s one-to-many provider mapping. **Create:** `<NNNN>-roadmap-prepared-accounting.sql`, proposed `learn_result_provider_operations`, `learn_result_reconciliations`, `learn_result_learner_charges`, `learn_learner_charge_operations`; extend `roadmap-money.js`.

- [ ] Map each result version to all contributing operations: provider op ID, stage/call/retry identity, requested/served model, immutable response/output fingerprint, provider-cost state, attributed micro-cost, charge eligibility and price-policy version. Use compound uniqueness to prevent duplicate links. A result with generation plus repair/checks is never reduced to one `providerOpId` column.
- [ ] Define `reconcilePreparedResult(access,resultVersion)` to perform provider/ledger reconciliation outside the final charge transaction, then persist a reconciliation revision and fingerprint over the complete operation set and relevant terminal states. Distinguish settled measured expense, documented estimate, reserved and unknown; unchanged reservation value is not proof of measured cost.
- [ ] Mark calls designated platform-only, including checks and failed work according to the approved policy, as excluded from learner price. Name the included successful generation calls and deterministic price policy explicitly; do not automatically charge the sum of every background attempt. Shared call attribution must never multiply original provider expense when one call contributes to multiple result rows.
- [ ] Make reconciliation changes invalidate the old fingerprint. An unknown/admitted operation prevents consumption of prepared acceptance until resolved; failed unusable preparation cannot be sold as a successful result. A fallback to ordinary generation is a separately authorized bounded path, not a hidden second provider call inside prepared settlement.
- [ ] Add database constraints and fixtures for generation+repair+check, one call attributed across outputs, missing mapping, duplicated stage/call, model mismatch, late reconciliation, unknown cost and policy-version mismatch. Preserve minimal mapping/audit information after later asset expiry.
- [ ] Run `node --test packages/control-plane/test/roadmap-prepared-reconciliation.test.js packages/control-plane/test/telemetry-provider-spend.test.js`. Assert global provider totals count unique operations once, learner eligible cost excludes platform-only work and acceptance observes a complete immutable mapping snapshot.

**Done evidence:** a sample result-to-many-operations table and reproducible reconciliation hash. No network request remains inside the atomic learner-charge boundary.

### R11.03 Charge the complete prepared step atomically without provider expense

**Owner:** State/Money; independent Verifier required. **Depends:** R4.07/R4.09/R4.11, R11.02. **v1.3:** §5.3; D6, D24, D31, D38. **Legacy:** corrected M7.2 and M5 billing/replay extensions. **Model:** none; no provider transport is invoked by prepared acceptance.

**Existing:** `packages/control-plane/src/learn-usage.js:447`–`:465` balance/refund calculation, `packages/control-plane/src/learn-spend-ledger.js:87` existing atomic per-call admission pattern. **Modify proposed:** `roadmap-money.js`, `roadmap-store.js`, usage statement-building seam through Lead. **Create proposed tests:** `roadmap-prepared-money.test.js` and concurrency/crash fixtures.

- [ ] Implement `admitLearnerCharge` as a statement builder/transaction participant within `acceptPreparedStep`, never a helper that commits independently. One guarded batch validates actor/access, current proposal/result versions, passing checks, accepted-content fingerprint and persisted complete reconciliation fingerprint before any debit or decision is consumed.
- [ ] Check entire offered step allowance including all prepared cards and any ordinary-generation allocations. Either atomically settle every included prepared charge with the accepted decision, or reserve the whole mixed step before card settlement. Insufficient balance leaves proposal pending and acceptance unconsumed with no partial purchase. A true existing-card link records explicit zero price without a balance requirement.
- [ ] Insert learner `usage_attempts` under the stable accepted usage action using a learner-charge identity distinct from provider op IDs; record charge/result and charge-to-all-operation mappings in the same batch. Do not insert `usage_operations`. Include settled learner amounts/refunds in the existing common balance calculation, with price-policy provenance separate from provider expense.
- [ ] Read existing charge status and refunds on replay; row existence is not evidence that the result remains paid. A refunded charge returns refunded/unavailable state and cannot authorize publication or be silently recharged. Historical accepted versions remain valid after later proposals when their own billing/check/access conditions hold.
- [ ] After whole-step acceptance, settle/refund by card. Lost placement acknowledgement reconciles the existing board/card and reuses entitlement. A terminal failed card is refunded without altering delivered siblings or original platform expense. Explicit recovery follows R4.11 with new authorization rather than resurrecting the former charge.
- [ ] Run `node --test packages/control-plane/test/roadmap-prepared-money.test.js packages/control-plane/test/roadmap-money.test.js packages/control-plane/test/learn-usage.test.js`. Race two devices; inject failure at every batch boundary; test stale checks/reconciliation, balance enough for one card only, mixed prepared/unprepared step, zero link, replay after refund and lost acknowledgement. Assert net learner usage changes once while provider operation count and dollar totals are exactly unchanged by acceptance.

**Done evidence:** independently reviewed SQL/transaction proof and before/after learner/provider totals. The implementation must fail if a charge survives without its accepted decision, or decision survives without its complete financial authorization.

### R11.04 Invalidate precisely and expire only unaccepted preparation

**Owner:** State/Money with UI status integration. **Depends:** R5.01 immutable versions, R4.05/R4.12, R11.01–R11.03. **v1.3:** §§3.12, 4.3, 5.4–5.5; D16, D25, D35. **Legacy:** M7.3–M7.5/M7.9, speculative M11.1/M11.4. **Model:** none for invalidation/retention; any required new checks use existing platform check roles.

**Existing:** `packages/web/dev-worker.js:102` daily cleanup hook; `packages/control-plane/src/learn-boards.js:73`/`:110` asset-serving boundaries. **Create:** `packages/control-plane/src/roadmap-expiry.js`, `roadmap-expiry.test.js`; modify proposed event/job/result stores and Lead’s existing cron integration.

- [ ] On relevant source, instruction, Depth, scope or applied proposal revision, mark affected unaccepted result/check fingerprints stale and supersede their binding. Retain unaffected cached work only when its complete dependency fingerprint still matches. Earlier delivered cards/results remain accepted and keep assets/history.
- [ ] Pause/Cancel/Ask/end stops unnecessary queued work and attempts transport cancellation where possible. A cancellation signal does not establish no provider cost; reconcile dispatched calls and preserve their operations. Already accepted work follows the delivery/refund deadline, and disabling speculation does not disable ordinary accepted generation.
- [ ] Define retention clocks exactly: cancelled/superseded unaccepted results use decision time; undecided preparation uses last learner activity. Thirty days is the carried proposed configurable default, not a claim of operational approval. Pause/completion/end alone never immediately expires bytes.
- [ ] Use daily retention cleanup to select only unaccepted eligible results and immutable associated objects. Guard expiry against concurrent acceptance in the durable store before deleting bytes; if acceptance wins, deletion must not run. Accepted assets always follow delivered-card lifecycle, including when their position gets a later version.
- [ ] Delete eligible bytes idempotently and retain minimal decision/cost/mapping records plus deletion checkpoint. Retry failed R2 deletion safely without making expired content deliverable. Scheduled event/check retries stay on R4’s timely dispatcher/alarms; do not replace them with a daily scan of idle roadmaps.
- [ ] Run `node --test packages/control-plane/test/roadmap-expiry.test.js packages/control-plane/test/roadmap-preparation.test.js packages/control-plane/test/roadmap-events.test.js`: fake-clock each retention origin, pause/resume, end, replacement, accepted old media, acceptance-versus-expiry race, missing object, partial delete and unknown canceled call. Assert accepted assets survive every speculative cleanup path.

**Done evidence:** deletion selection query, race trace and retained audit rows. An ordinary pause never destroys learner content or refunds a valid delivered card.

### R11.05 Report preparation costs and verify reuse under failures

**Owner:** Verifier and State/Money; Lead prepares capability receipt. **Depends:** R11.01–R11.04. **v1.3:** §§3.12, 8; D15, D20, D39. **Legacy:** M7.1/M7.6/M7.8, prepared accounting matrix. **Model:** frozen qualified adapter/check roles; real evaluation only within the existing explicitly approved spend ledger.

**Existing:** `packages/control-plane/src/telemetry-provider-spend.js:31` (`providerSpend`), `packages/control-plane/src/learn-models.js:143` logging. **Modify:** existing owner telemetry projection/routes, proposed runtime capability flag and evidence harness; **create:** proposed `roadmap-prepared-check.mjs`, report tests. No new learner-facing price display.

- [ ] Extend the established owner telemetry surface with platform preparation expense by day, decision and eligible adapter; show settled expense, reserved/unknown bounds, learner charges and refunds separately. Count original provider operations once before joining sidecars, avoiding fan-out multiplication from result and charge mappings.
- [ ] Measure N-delivery→proposal-ready, preparation-start→checked-result-ready, Accept→delivered, prepared hit/miss rate, invalidation/waste, unknown rate and provider versus learner micro-cost. Report cold and reused flows separately; do not credit speculative generation for a proposal-only speedup.
- [ ] Run proposed `node packages/web/e2e/roadmap-prepared-check.mjs` against the explicit dev harness: prepare one card, attempt direct body/asset reads before acceptance, accept from two devices, receive one card/charge, lose acknowledgement, reload and confirm no new debit or provider expense. Cancel a second prepared candidate and verify zero learner charge.
- [ ] Exercise crash points before/after provider admission, response persistence, reconciliation, atomic acceptance, placement save and refund; include unknown operations, insufficient aggregate balance, stale source/Depth/proposal, concurrent expiry and a flag-off restoration. Reconcile each trace to persisted operation, charge and card IDs.
- [ ] Run `node --test packages/control-plane/test/roadmap-prepared-report.test.js packages/control-plane/test/roadmap-prepared-money.test.js packages/control-plane/test/roadmap-expiry.test.js` plus affected checks/build. Have Verifier independently compute provider totals from unique operation rows and learner totals from usage/refund records, rather than trusting the new report’s own implementation.
- [ ] Activate the separate preparation flag only with its eligible-path receipt, R6/R5 version dependencies, denied-read proof, accounting/fault matrix and measured approved-cost evidence. If preparation is disabled or fails qualification, leave supported R4 generation and R6 proposals usable. Additional formats qualify independently; Animation remains with its existing owner.

**Done evidence:** one complete prepared acceptance from two devices, canceled preparation without learner debit, unchanged provider totals at acceptance and old delivered assets preserved after revision. Report remaining classifier uncertainty and measured latency honestly; do not manufacture zero-cost or instant-readiness guarantees.

## R12 — Independently released command adapters

Existing references below were checked against final main `9b798f7760b7af5aa2446d281a07eebfc4e10b84`; the comparison confirmed these adapter paths unchanged. Abbreviations: **CP** = `packages/control-plane`; **WEB** = `packages/web`. A path under `roadmap-adapters/` is proposed. Tests named `roadmap-*.test.js` below are proposed tests to create, not checks already run. Commands run from the repository root unless a working directory is stated. Browser/E2E commands are instructions for CI or an explicitly authorized runner under the repository browser-automation restriction; do not run them locally without that authorization. Each adapter has its own feature flag, implementation candidate, qualification evidence and release receipt. R11, R13–R16 and other R12 adapters are dependencies only where explicitly named.

The catalogue is complete: `/explain` text/table belongs to R4, while its interactive addition is R12.09; `/practice`, `/quiz` and `/flashcards` belong to R9 and retain their immutable-activity and free-assessment requirements. R12.02–R12.08 and R12.10–R12.17 cover the remaining fifteen commands. `/goal` is learner-only and excluded. Command labels must follow the actual catalogue: `/image` uses ID `generate-image`; `/photos` uses ID `image`; `/whiteboard` uses ID `whiteboard-video`. The legacy internal editable-whiteboard tool is not this video command. Existing definitions: `packages/web/src/agent/slash.js:46–95`; Learn dispatch: `packages/web/src/learn-slash.js:215–349`.

### R12.01 Register the accepted-command boundary and per-adapter release checks

**Owner:** Lead, State/Money, Tools; **Depends:** R4 accepted-step, reservation, publication and placement contracts; R5 proposal/version/review contract; R2 Depth/settings; R3 references. **Trace:** v1.3 §3.13, §§4–6, D24/D38; M5.3/M5.14, M8.2–M8.6. **Model:** none in registry; retain each command's actual route below.

**Existing:** `packages/control-plane/src/learn-artifact.js:64–77` `artifactPlan/generateArtifact`; `packages/web/src/learn-slash.js:190–193` `generateCommand`, `packages/web/src/agent/slash.js:46–95`; `packages/control-plane/src/learn-models.js:112–121`. **Create:** `packages/control-plane/src/roadmap-adapters.js`, `packages/control-plane/src/roadmap-adapters/contract.js` as a narrow adapter facade importing the canonical `packages/control-plane/src/roadmap-contract.js` (no duplicated enums or authorization schema), `packages/control-plane/test/roadmap-adapters.test.js`; **Modify:** proposed R4 generation coordinator and Lead-owned capability registry/check-map; reuse canonical `packages/control-plane/src/roadmap-policy.js` limits.

- [ ] Define `startAcceptedCommand(access,binding,payload)` returning typed status, command job ID, result ID and provider-operation IDs. Bind board, learner, plan/proposal revision, acceptance, card, phase and authorization bound; request-body identities cannot replace server values.
- [ ] Declare command, supported primitive, explanation/practice purpose, review stages, phase payer, check policy and eligibility per adapter. Tutor proposal composition and checks use platform usage; existing paid command planning/generation starts only after bound acceptance and uses its accepted learner allocation. Deterministic plan signing creates no provider operation. Register text/table and three R9 practice commands by reference; prevent unknown/disabled commands entering proposals.
- [ ] Consume R4's full-step allowance authorization once. Adapt nested command admission without a second learner reservation. Persist every contributing operation through R4's call/result bindings; if a command needs an additional result-to-operation sidecar, add its CREATE-only migration here and let R11 reuse it. This independent adapter must not require the later R11 schema. Retain command-specific refund reconciliation and separate provider expense from learner price.
- [ ] Route every job/result/asset read through the same accepted-entitlement and check predicate. Keep unsigned public `allowedPrimitives` ineffective; compare material review/format/duration changes before additional spending. Suppress prices throughout desktop Tutor, including typed paid-command reviews in Tutor; preserve existing price display in Auto/Ask and standalone command flows outside Tutor.
- [ ] Create parameterized duplicate-acceptance, stale-version, cancellation, insufficient-allowance and direct-result-read fixtures, then run each only for its enabled adapter. Add a receipt template recording exact supported checks and disabled modalities.

**Verify:** `node --test packages/control-plane/test/roadmap-adapters.test.js`; assert all nineteen catalogue commands have one release assignment, no unsupported primitive executes, and simultaneous accepts yield one card. **Done evidence:** registry diff plus one adapter's receipt can merge independently; a failing disabled adapter does not block a qualified one.

### R12.02 Add the /code snippet adapter

**Owner:** Tools, UI; **Depends:** R12.01; R9 only for scored practice. **Trace:** §3.13, D41; M5 non-text/M8. **Model:** existing `LEARN_TASKS.artifact`, configured `claude-opus-5` through `planModel`; explicit configured OpenAI opt-in is preserved and logged, not silently claimed as Opus.

**Existing:** `packages/control-plane/src/learn-primitives.js:84–92` `code_sample` (under 60 lines, no output claim); `packages/control-plane/src/learn-artifact.js:77–132`; `packages/web/src/agent/slash.js:64`. **Create:** `packages/control-plane/src/roadmap-adapters/code.js`, `packages/control-plane/test/roadmap-code.test.js`; **Modify:** proposed registry and current snippet renderer only for execution-state metadata.

- [ ] Freeze prompt, supported Python language, source ranges and purpose into accepted payload; allow only ready `code_sample`, since `code_exercise` remains unavailable at `packages/control-plane/src/learn-primitives.js:204`.
- [ ] Call existing artifact generation and validation under the accepted card identity; preserve Depth without changing snippet limits or allowing arbitrary extra primitives.
- [ ] Persist `executionStatus:unexecuted` and source references; omit fabricated stdout, timing and success claims. A practice-purpose snippet is an exercise prompt, not evidence of mastery.
- [ ] Validate code text and explanatory claims before publication; retain failed-card refund and replacement behavior.
- [ ] Test code longer than sixty lines, wrong-language output, duplicated acceptance and text claiming execution; verify a practice snippet creates no assessment without R9's explicit attempt route.

**Verify:** `node --test packages/control-plane/test/roadmap-code.test.js packages/control-plane/test/learn-artifact.test.js`. **Done:** one explanation snippet and one unscored practice snippet survive reload with stable IDs; R16 stays disabled and no execution service is invoked.

### R12.03 Add /graph with checked function and data provenance

**Owner:** Tools, UI; **Depends:** R12.01; R8b only when calculator evidence is actually used. **Trace:** §3.13/§6.2; M5/M8. **Model:** reuse `LEARN_TASKS.artifact` as R12.02.

**Existing:** `packages/control-plane/src/learn-primitives.js:139–155` `interactive_graph/data_plot`; `packages/web/src/agent/slash.js:65`; `packages/control-plane/src/learn-artifact.js:77`. **Create:** `packages/control-plane/src/roadmap-adapters/graph.js`, `packages/control-plane/test/roadmap-graph.test.js`; `packages/web/src/roadmap-graph.test.mjs`.

- [ ] Classify `/graph` as explanation only and admit only Desmos function graphs and supported Plotly traces; do not enable unavailable `knowledge_graph` merely because it appears in the command family.
- [ ] Freeze axes, domains, units, slider ranges and numeric-data source into the accepted payload. An increase in scope or a changed dataset revises the proposal.
- [ ] Keep illustrative data explicitly labelled; require original-passage or computation references for numbers presented as measured or derived. Do not convert an illustrative trace into learning evidence.
- [ ] Run existing graph schema checks and the current renderer against finite/domain-boundary fixtures; screen labels, annotations and rendered content rather than only the brief.
- [ ] Persist interaction defaults independently of the source snapshot; reloading or changing a slider does not regenerate or charge. Test malformed traces, NaN/infinity, missing units and forbidden remote script data.

**Verify:** `node --test packages/control-plane/test/roadmap-graph.test.js packages/web/src/roadmap-graph.test.mjs`. **Done:** receipt shows a supported function and source-backed plot rendered in the current canvas; failed graphs remain unpublished and the adapter flag can ship alone.

### R12.04 Add /diagram with topology and rendered checks

**Owner:** Tools, UI; **Depends:** R12.01. **Trace:** §3.13/§6.4; M5/M8. **Model:** reuse `LEARN_TASKS.artifact`.

**Existing:** `packages/control-plane/src/learn-primitives.js:93–120` validates flow endpoints and Mermaid restrictions; `packages/web/src/agent/slash.js:66`; `packages/control-plane/src/learn-artifact.js:117–132`. **Create:** `packages/control-plane/src/roadmap-adapters/diagram.js`, `packages/control-plane/test/roadmap-diagram.test.js`; `packages/web/src/roadmap-diagram.test.mjs`.

- [ ] Classify `/diagram` as explanation only and bind each accepted card to either flow or Mermaid, with source claims for labels and directed relationships. A changed diagram type or materially different process requires revised acceptance.
- [ ] Reuse unique-node/edge checks and Mermaid type allowlist; preserve the prohibition on click handlers, init directives and scripts.
- [ ] Add deterministic render qualification for the formats actually enabled. Parse success alone does not establish that node labels, order and arrows are legible or faithful.
- [ ] Check semantic assertions in relationships against selected passages; retain unresolved connections as explicit limitations instead of inventing arrows.
- [ ] Test unknown endpoints, duplicate IDs, hostile Mermaid directives, unsupported type and a valid multi-branch graph; duplicate acceptance reuses one stable canvas card.

**Verify:** `node --test packages/control-plane/test/roadmap-diagram.test.js packages/web/src/roadmap-diagram.test.mjs`. **Done:** store validator/render evidence and source-bound claim results with the card; demonstrate readable output in the existing canvas without creating a separate UI mock.

### R12.05 Add /notebook as an empty workspace

**Owner:** UI, State/Money; **Depends:** R12.01; execution explicitly separate. **Trace:** §3.13, D41; M5/M8. **Model:** none for insertion.

**Existing:** `packages/web/src/agent/slash.js:67` deterministic `insert_notebook`; `packages/web/src/learn-slash.js:226–233` direct insertion; `packages/control-plane/src/learn-primitives.js:215` direct notebook primitive. **Create:** `packages/control-plane/src/roadmap-adapters/notebook.js`, `packages/control-plane/test/roadmap-notebook.test.js`; `packages/web/src/roadmap-notebook.test.mjs`; **Modify:** current notebook placement bridge through its owner.

- [ ] Create a deterministic empty notebook payload with explanation or practice purpose; bind its stable card ID to acceptance and preserve references to the learning task.
- [ ] Reuse existing canvas insertion, persistence and notebook state; a replay reveals the original notebook, preserving learner edits instead of replacing it with a fresh empty one.
- [ ] Persist billing `zero_priced` for empty insertion, with no allowance hold, debit or provider operation; zero balance does not block the accepted empty notebook. Any future authored cells use a separately declared generation contract.
- [ ] Keep opening/importing the notebook from running cells. Do not describe existing browser notebook execution as the proposed server execution service or evidence that R16 is qualified.
- [ ] Test two-device acceptance, zero-balance insertion, zero allowance/provider ledger delta, reload after learner edits, cancellation before placement and a notebook offered for practice without an attached grade.

**Verify:** `node --test packages/control-plane/test/roadmap-notebook.test.js packages/web/src/roadmap-notebook.test.mjs`. **Done:** one accepted empty notebook persists once, keeps edits, records no provider spend and truthfully exposes its current execution state.

### R12.06 Add /image through the existing signed image plan

**Owner:** Tools, State/Money, UI; **Depends:** R12.01; image output checks qualified for this adapter. **Trace:** §3.13, §§5–6, D25/D38; M8.2–M8.6. **Model:** signed image plan has no model call; generation uses the exact accepted `IMAGE_MODELS` selection: `gpt-image-2.5-sunburst`, `gpt-image-2.5-flare`, `gemini-nano-banana-2.1` or `gemini-3-pro-image`; availability is deployment-verified.

**Existing:** `packages/control-plane/src/image-jobs.js:74–138` `imageJobsRoute`; `packages/control-plane/src/image-providers.js:22–39,76–97` allowlist/settings/quote; `packages/web/src/generate-image.js:20–25` `requestImagePlan` (deterministic signing). **Create:** `packages/control-plane/src/roadmap-adapters/image.js`, `packages/control-plane/test/roadmap-image.test.js`; **Modify:** image job's Tutor-only metadata/publication seam.

- [ ] Map `generate-image` to the existing signed plan and bind prompt, references, model, aspect ratio, resolution, quality, quote and card identity.
- [ ] Preserve the existing deterministic image plan with no invented planning call or charge; wait for accepted authorization before image generation, compare the live quote with its accepted bound and return a revised proposal on changes.
- [ ] Reuse provider unknown-outcome handling and `retry-save`; never resubmit a timed-out image request merely to recover storage.
- [ ] Decode and inspect actual supported image output, including factual labels where present; file-signature validation alone at `image-providers.js:177` is not Tutor output qualification.
- [ ] Test direct status/asset leakage, repeated accept, changed resolution, storage failure, unknown provider outcome and failed-card refund without double provider settlement.

**Verify:** `node --test packages/control-plane/test/roadmap-image.test.js packages/control-plane/test/image-jobs.test.js packages/control-plane/test/image-public-gates.test.js`. **Done:** one separately authorized real result plus duplicate/refund evidence; Desktop Tutor omits price labels, including typed image-command review in Tutor; standalone image review outside Tutor and existing Auto/Ask price displays remain unchanged.

### R12.07 Add /motion preserving duration and recovery authorization

**Owner:** Tools, State/Money, UI; **Depends:** R12.01 and a qualified existing Motion deployment. **Trace:** §3.13/§5, D25/D38; M8.2–M8.6. **Model:** existing chat proposal uses `LEARN_TASKS.chat`/picker (Auto `claude-opus-5`); Motion Director, Author, Visual Review and Pedagogical Review default to `claude-opus-5-5`; record actual environment overrides.

**Existing:** `packages/control-plane/src/learn-video.js:181,379–469` `LearnVideos/startMotion`; `packages/control-plane/src/learn-video.js:135` `serveClip`; `packages/learn-render/motion/model-config.js:8–15`; `packages/web/src/learn-slash.js:268–271`. **Create:** `packages/control-plane/src/roadmap-adapters/motion.js`, `packages/control-plane/test/roadmap-motion.test.js`; **Modify:** Tutor-only job linkage and publication seam.

- [ ] Bind the reviewed Motion plan, duration, selected context and accepted ceiling before starting the existing `motion_request` path; do not substitute another video renderer.
- [ ] Treat a longer duration or changed content plan as a revision requiring acceptance before the next paid phase, including recovery that exceeds the previous bound.
- [ ] Preserve existing checkpoint/resume, stop, provider-cost and zero-learner-charge failure classes; phase identities include card identity.
- [ ] Gate both clip serving and job/artifact reads on Tutor entitlement. Qualify actual video, audio and frame coverage; script approval alone is insufficient.
- [ ] Test duplicate accepts, stale plans, paid-preparation refusal before authorization, recover-after-render failure, revocation before delivery and accepted-asset retention on pause.

**Verify:** `node --test packages/control-plane/test/roadmap-motion.test.js packages/control-plane/test/motion-admission-settlement.test.js packages/control-plane/test/motion-recovery.test.js`. **Done:** focused Motion receipt records the actual model configuration, output coverage and bounded real smoke; no dependency on other media adapters.

### R12.08 Add /whiteboard narrated-video adapter

**Owner:** Tools, State/Money, UI; **Depends:** R12.01 and qualified Whiteboard service. **Trace:** §3.13, §6.4; M8.2–M8.6. **Model:** `whiteboard_plan/whiteboard_author` = `claude-opus-5-5`, medium effort; existing Fish TTS model `s1` and narrator selection.

**Existing:** `packages/control-plane/src/whiteboard-routes.js:1–45`; `packages/control-plane/src/whiteboard-job.js:45,105,147,168,289–300`; `packages/control-plane/src/learn-models.js:107–111`; `packages/control-plane/src/whiteboard-tts.js:9–24`. **Create:** `packages/control-plane/src/roadmap-adapters/whiteboard.js`, `packages/control-plane/test/roadmap-whiteboard.test.js`; **Modify:** Tutor linkage on existing route/job.

- [ ] Use ID `whiteboard-video`, retaining the reviewed scene plan and allowed duration. Never route to the editable drawing-board tool.
- [ ] Bind planning, per-scene authorship, narration, timing and rendering to the accepted card; associate all contributing provider operations with its result.
- [ ] Preserve explicit plan review and revised acceptance for changed duration/content. Adapt learner admission once across nested stages while retaining existing service budgets.
- [ ] Gate video, poster, audio, transcript and status content; inspect delivered narration and rendered drawings, with recorded coverage limits for sampled frames.
- [ ] Exercise narration failure, render failure, duration change, duplicate generation and orphan cleanup; refunds use the existing failed-job behavior without expiring accepted media.

**Verify:** `node --test packages/control-plane/test/roadmap-whiteboard.test.js packages/control-plane/test/whiteboard-job.test.js packages/control-plane/test/whiteboard-media.test.js`. **Done:** qualified video and narration are attached to one card after reload; the independent receipt records model/TTS operations, checks and refund reconciliation.

### R12.09 Add interactive /explain using the narrow D2(b) override

**Owner:** Tools, State/Money, UI; **Depends:** R12.01 and owner-recorded D2(b); R4 text/table remains separate. **Trace:** §3.13, D2/D38; M8.1/M8.3–M8.6. **Model:** existing `explain_brief/author/review/repair`, all `claude-opus-5-5`.

**Existing:** `packages/web/src/learn-slash.js:306–317` `startExplain` first; `packages/control-plane/src/explain-job.js:194,264,478–529` route/jobs/refine/generate; `packages/control-plane/src/learn-models.js:89–92`. **Create:** `packages/control-plane/src/roadmap-adapters/explain-interactive.js`, `packages/control-plane/test/roadmap-explain-interactive.test.js`; **Modify:** explicit Tutor authorization seam in existing Explain job.

- [ ] Require Tab acceptance of the Tutor offer and its aggregate bound before any paid explanation-brief preparation. Start the existing brief stage under that accepted card allocation, then retain the actual brief and its hash/revision for review. Apply D2(b) only to this roadmap path after its decision receipt exists.
- [ ] Retain the content-plan review while D2(b) lets the bound Tab acceptance replace the redundant Generate wait when the brief remains within the accepted offer. A material brief/content/format/bound change returns a revised proposal requiring new acceptance before further spending. Never charge an unaccepted offer for its brief or accept public `prepare:false` or equivalent as a bypass.
- [ ] Keep typed and Quick Edit `/explain` startExplain-first and preserve their existing review behavior; test both entry paths alongside Tutor.
- [ ] Reuse existing author/static/render/review/repair stages; attach actual check results and provider operations to the Tutor result, with bounded failure and refund.
- [ ] Test zero paid brief calls before Tab, one accepted brief allocation without double reservation, and refusal of a changed brief/material review output before further spend; prevent legacy job result reads from revealing a checked but unaccepted result.

**Verify:** `node --test packages/control-plane/test/roadmap-explain-interactive.test.js packages/control-plane/test/explain-job.test.js packages/control-plane/test/explain-tutor.test.js`. **Done:** one bound acceptance produces one checked interactive card; R4 text/table routing exception and D2(b) interactive exception are recorded separately and ordinary commands retain their behavior.

### R12.10 Add /cad without changing its modelling engine

**Owner:** Tools, State/Money, UI; **Depends:** R12.01 and qualified CAD deployment. **Trace:** §3.13, D38; M8.2–M8.6. **Model:** existing `CAD_MODEL=claude-sonnet-5-5`, dedicated-credential behavior preserved.

**Existing:** `packages/control-plane/src/cad-jobs.js:19,52,88` route/jobs; `packages/control-plane/src/cad-model.js:8–15,63–85,109–114` model/request/approvedDesign. **Create:** `packages/control-plane/src/roadmap-adapters/cad.js`, `packages/control-plane/test/roadmap-cad.test.js`; **Modify:** Tutor acceptance linkage/publication seam only.

- [ ] Carry units, dimensions, required checks, assumptions and approved brief hash into the accepted card. Missing consequential dimensions return clarification rather than guessed fabrication requirements.
- [ ] Reuse brief-first generation and fixed approved checks; a change to units, parameters, dimensions or unsupported requirements produces revised acceptance.
- [ ] Bind interpretation, generation, repair, executor and review operations separately under one learner authorization; preserve dedicated credential refusal and unknown-outcome recovery.
- [ ] Require existing independent STEP measurements and rendered-review evidence before exposing model files/previews. Report unchecked requirements honestly; no manufacturing-certification claim.
- [ ] Test stale brief, unsupported topology check, failed render/measurement, duplicate generation, private source reads and no-leak export URLs.

**Verify:** `node --test packages/control-plane/test/roadmap-cad.test.js packages/control-plane/test/cad-publication-gates.test.js packages/control-plane/test/cad-model-admission.test.js`. **Done:** a single bounded qualified part has retained references, measurement evidence and one accepted card; no general code-execution capability is inferred from CAD.

### R12.11 Specify the /animation Tutor handoff with the existing owner

**Owner:** Lead and Tools coordinate with the existing Animation owner; Verifier checks the boundary. **Depends:** R12.01 and that owner's interface/qualification receipt. **Trace:** §3.13 final paragraph; M8.2, scope exclusion in §10. **Model:** reuse owner's existing `animation_*` roles configured in `packages/control-plane/src/learn-models.js:93–104`; no model change commissioned.

**Existing boundary only:** `packages/web/src/agent/slash.js:74–76`, `packages/web/src/learn-slash.js:250–258` `canvas.startAnimation`; `packages/web/src/LearnPage.jsx:144–145` job routing. **Create:** proposed `packages/control-plane/src/roadmap-adapters/animation-contract.js`, `packages/control-plane/test/roadmap-animation-contract.test.js`, integration handoff record; **no Animation internals modified by this checklist**.

- [ ] Agree request/response boundary with the existing owner: immutable scene-plan hash, accepted card/phase identity, bound, source refs, cancellation, check receipt and provider-operation list.
- [ ] Document who performs the existing reviewed-plan authorization, private job/result serving, publication and refunds. Tutor must receive the real feature outcome, not synthesize a successful scene from a status string.
- [ ] Define adapter-only conformance fixtures for duplicate acceptance, changed plan, unavailable service, cancelled/revoked access and checked-but-unaccepted reads.
- [ ] Leave the capability disabled until the owner supplies and qualifies the implementation seam. A contract stub must return unavailable, never replace the feature or bypass its review.
- [ ] Record a separate handoff receipt identifying responsibilities and the candidate interface version; do not assign Animation engine, rendering, authoring or repair work to Tutor agents.

**Verify:** `node --test packages/control-plane/test/roadmap-animation-contract.test.js` against fixtures and, when supplied, the owner's adapter harness. **Done:** approved boundary plus passing owner-supplied conformance evidence; this task alone makes no claim of shipped Animation integration.

### R12.12 Add /3d technical Blender-scene adapter

**Owner:** Tools, State/Money, UI; **Depends:** R12.01 and provisioned existing scene worker. **Trace:** §3.13/§6.4; M8.2–M8.6. **Model:** existing artifact planner for `blender_scene`; deterministic existing Blender worker builds the validated operation.

**Existing:** `packages/control-plane/src/learn-primitives.js:170–176` `blender_scene`; `packages/control-plane/src/learn-scene.js:15–30,84` `sceneFetch/LearnScenes`; `packages/web/src/agent/slash.js:83`. **Create:** `packages/control-plane/src/roadmap-adapters/technical-3d.js`, `packages/control-plane/test/roadmap-technical-3d.test.js`; **Modify:** Tutor metadata/publication seam on scene job.

- [ ] Limit Tutor output to the existing validated technical-scene operation; keep unsupported `3d_model` disabled and preserve the distinction from live `/animation`.
- [ ] Freeze geometry, labels, coordinate assumptions and accepted render settings. Model planning does not authorize arbitrary Blender scripts or an expanded object set.
- [ ] Bind scene job/cache identity to accepted card/source revision, so an existing cache object cannot confer entitlement to another learner.
- [ ] Gate model, textures/previews and scene status reads; validate actual exported geometry and displayed labels before publication, preserving unsupported checks.
- [ ] Test failed worker, malformed operation, cross-user cache read, repeat acceptance and a changed technical scene requiring new acceptance.

**Verify:** `node --test packages/control-plane/test/roadmap-technical-3d.test.js`; add the candidate's existing scene tests to its check-map after inspecting current names. **Done:** one technical scene renders and reloads with correct source/charge linkage; receipt independently qualifies this adapter without claiming general execution or live Animation support.

### R12.13 Add /browser saved-webpage adapter

**Owner:** Tools, UI; **Depends:** R12.01; use the existing capture safety path. **Trace:** §3.13/§6.3; M5/M8, source-card expansion. **Model:** none to insert/capture; reuse existing direct JEV `jev-1.13.0` screening (`webpage-screen.js:15,48`), recording its policy version.

**Existing:** `packages/web/src/learn-slash.js:235–240` `insertWebpage`; `packages/control-plane/src/webpage-capture.js:30,91,217,323` routes/capture/screen/fetch. **Create:** `packages/control-plane/src/roadmap-adapters/browser.js`, `packages/control-plane/test/roadmap-browser.test.js`; **Modify:** Tutor lineage on capture request/result.

- [ ] Accept only a full validated public URL or an explicit learner URL-selection step; do not interpret arbitrary search words as a URL or silently perform research.
- [ ] Bind source URL, capture version, title and intended explanation purpose to acceptance; distinguish an unread candidate from fetched page evidence.
- [ ] Reuse redirect/public-network checks, no credentials and capture quarantine. Inaccessible, authenticated or paywalled pages yield a truthful unavailable/partial result.
- [ ] Keep screenshots, text and manifest private until screening and Tutor entitlement pass; a metadata route must not leak a usable asset URL.
- [ ] Test redirects to private addresses, unsafe capture, partial height coverage, duplicate acceptance and changed capture hashes.

**Verify:** `node --test packages/control-plane/test/roadmap-browser.test.js`. **Done:** one supported saved webpage and one refused inaccessible page have explicit coverage; adapter receipt states that a browser card is not unrestricted browsing or a paywall bypass.

### R12.14 Add /photos with explicit choice and credit

**Owner:** Tools, UI; **Depends:** R12.01; no R8a-wide research prerequisite. **Trace:** §3.13; M5/M8 source-card expansion. **Model:** none for the existing photo-search/insertion path.

**Existing:** `packages/web/src/learn-slash.js:182,285–288` `imageSearchBlock`; `packages/web/src/LearningBlocks.jsx:1700,1732–1733` `ImageBody` calls `/api/learn/photos`; `packages/web/src/agent/slash.js:90`. **Create:** `packages/control-plane/src/roadmap-adapters/photos.js`, `packages/control-plane/test/roadmap-photos.test.js`; `packages/web/src/roadmap-photos.test.mjs`.

- [ ] Map typed `/photos` to stable command ID `image`, keeping it separate from generated `/image`. Freeze a public-safe query and explanation purpose.
- [ ] Reuse photo search and the learner's choice; represent unresolved selection explicitly rather than silently taking the first result. Bind the selected provider photo ID and source URL before placement.
- [ ] Preserve creator credit, attribution links and supported image metadata through persistence and sharing; use server-authorized asset handling where storage is required.
- [ ] Check actual displayed image and caption under the enabled modality policy; never present a stock photo as measured evidence of a specific factual event.
- [ ] Test no results, unavailable credit, changed selection, duplicate placement and a query containing private source text blocked before egress.

**Verify:** `node --test packages/control-plane/test/roadmap-photos.test.js packages/web/src/roadmap-photos.test.mjs`. **Done:** a credited selected photo persists as one card, remains distinguishable from generated imagery and incurs no invented model generation charge.

### R12.15 Add /youtube using actual search and caption coverage

**Owner:** Tools, UI; **Depends:** R12.01; no other source-card adapter. **Trace:** §3.13/§6.3; M5/M8. **Model:** none for deterministic finder/search; any optional ranking or explanation uses the separately enabled roadmap role and its budget.

**Existing:** `packages/control-plane/src/learn-search.js:112,179` `directResult/searchCanvasSource`; `packages/control-plane/src/learn-youtube.js:91,148,197` search/selection validation/passages; `packages/web/src/learn-slash.js:225–228` source finder. **Create:** `packages/control-plane/src/roadmap-adapters/youtube.js`, `packages/control-plane/test/roadmap-youtube.test.js`; **Modify:** current finder-to-proposal binding.

- [ ] Keep direct video URLs distinct from topic search; preserve existing preview and learner selection instead of automatically adding a candidate.
- [ ] Bind video ID, selected window, retrieval time and caption revision/hash to acceptance; execute only the safe public query within the applicable search budget.
- [ ] Use timestamp windows only when actual retrieved transcript passages support them; captions absent means no invented timestamp or claim that the video was watched.
- [ ] Validate embed URL/window and preserve provider title/channel attribution. Report transcript evidence separately from unseen visual content.
- [ ] Test missing captions, fabricated window, invalid video ID, removed video, duplicate acceptance and publication/access checks for stored excerpts.

**Verify:** `node --test packages/control-plane/test/roadmap-youtube.test.js packages/control-plane/test/learn-youtube.test.js`. **Done:** receipt shows one selected video and a caption-unavailable case; unsupported visual claims remain unresolved and no generated-video job is invoked.

### R12.16 Add /arxiv with versioned paper selection

**Owner:** Tools, UI; **Depends:** R12.01; R7b only for whole-PDF planning/reading beyond existing supported retrieval. **Trace:** §3.13/§6.3; M5/M8. **Model:** none for metadata search and insertion; optional research uses its explicit role.

**Existing:** `packages/control-plane/src/arxiv.js:8,61–75,116` ID/search/read/PDF/selection validation; `packages/control-plane/src/learn-search.js:112,179`; `packages/web/src/agent/slash.js:92`. **Create:** `packages/control-plane/src/roadmap-adapters/arxiv.js`, `packages/control-plane/test/roadmap-arxiv.test.js`; **Modify:** finder selection and existing paper-card metadata.

- [ ] Preserve topic search versus direct ID/link entry and learner preview; bind exact arXiv version, title and selected source to acceptance.
- [ ] Treat metadata and abstract retrieval as their actual coverage. Full-paper claims require original page text; figure claims require a qualified image read, not the metadata title.
- [ ] Persist paper URL, retrieved version/hash and page anchors with the delivered card; a newer preprint is a new source revision, not a silent replacement.
- [ ] Reuse safe bounded PDF retrieval and supported paper-card rendering; return partial/unavailable for encrypted, failed or unsupported content.
- [ ] Test version changes, invalid IDs, unread figures, failed PDF fetch, duplicate acceptance and exact-page citation navigation.

**Verify:** `node --test packages/control-plane/test/roadmap-arxiv.test.js packages/control-plane/test/arxiv.test.js`. **Done:** a selected paper is added with honest retrieval coverage and immutable source identity; this adapter does not wait for YouTube, Wikipedia or the full media ladder.

### R12.17 Add /wikipedia with retained article revision and sections

**Owner:** Tools, UI; **Depends:** R12.01; no other source-card adapter. **Trace:** §3.13/§6.3; M5/M8. **Model:** none for existing article search/read/insertion.

**Existing:** `packages/control-plane/src/learn-wiki.js:22,138,152,170,211,239` title/ToC/section/search/read/article; `packages/control-plane/src/learn-search.js:112,179`; `packages/web/src/agent/slash.js:93`. **Create:** `packages/control-plane/src/roadmap-adapters/wikipedia.js`, `packages/control-plane/test/roadmap-wikipedia.test.js`; **Modify:** current article-card source metadata.

- [ ] Keep the existing English-Wikipedia scope (`WIKI_LANG`, line 14) and disambiguation/selection behavior; do not silently choose an unrelated article or another language.
- [ ] Bind canonical article, captured revision/hash and selected section to acceptance. Later edits invalidate affected source-dependent proposals without rewriting delivered cards.
- [ ] Reuse stripped/sanitized article content and ToC anchors, storing coverage of the actual read. Do not label a search snippet as a read article.
- [ ] Preserve article attribution and useful source links; describe Wikipedia claims with their source status rather than implying independent verification.
- [ ] Test disambiguation, redirects, repeated headings, changed revision, unsafe embedded markup and duplicate acceptance.

**Verify:** `node --test packages/control-plane/test/roadmap-wikipedia.test.js packages/control-plane/test/learn-wiki.test.js`. **Done:** the selected article opens at the cited section, survives reload and records the exact retrieved version; its flag and focused receipt can ship independently.


## R13 Project canvases

These tasks extend R4's shared source identity, coverage and access boundary with the repository adapter; they do not require R7 long-Markdown/PDF delivery or media adapters. Reuse R7 helpers when already available without making that optional reuse a release gate. Existing-code references below were confirmed unchanged in final main `9b798f7760b7af5aa2446d281a07eebfc4e10b84`. Proposed files are implementation targets, not baseline capabilities.

### R13.01 Resolve authorized repository snapshots for Tutor

**Owner:** Tools; Lead integrates registry. **Depends:** R4 source-tool/access and immutable source/coverage contracts; relevant cleanup interface receipt. R7 helper reuse is optional. **v1.3:** §§3.14, 4.1, 6.2; **legacy:** M12.4, M4.23. **Model:** none for reads; reuse the R4 registered planner only after evidence resolves.

**Existing:** `packages/control-plane/src/repositories.js:98` `repositoryAccess`, `:108` `readableVersion`, `:136` `repositorySnapshot`; `packages/control-plane/src/canvases.js:517` `projectRepository`. **Create:** `packages/control-plane/src/roadmap-source-repository.js`, `test/roadmap-source-repository.test.js`; **modify:** proposed `roadmap-tools.js` registry through Lead.

- [ ] Implement `readRepositoryScope(access, {repo, commit, paths, ranges}, limits)` returning the shared typed tool result, immutable source identity, read ranges and omissions. Resolve the repository from authorized project/board relationships before loading R2; client repository IDs are selectors only.
- [ ] Preserve explicit commit selection and `readableVersion` authorization. Distinguish not indexed, missing snapshot, excluded path and permission denial; do not copy `projectRepository`'s quiet `null` fallback into a Tutor claim of successful reading.
- [ ] Bind cache keys to repository, commit, extractor version and authorization scope. Recheck access before serving cached text; a public snapshot becoming unavailable does not become readable merely because it was cached.
- [ ] Register the adapter independently; refuse unsupported source scopes before planning. Keep imported files inert and Tutor actions owner-only until R14.

**Tests/command:** from `packages/control-plane`, `node --test test/roadmap-source-repository.test.js` (proposed): exact commit, public readable version, unauthorized private import, missing index, missing R2, forged path and revoked cache access. **Done:** fixture records show the requested commit and explicit coverage, with zero model calls on refused reads.

### R13.02 Build code evidence without restoring retired activities

**Owner:** Tools. **Depends:** R13.01 and R4 shared coverage/support contracts; optional reuse of already-shipped R7 indexing helpers. **v1.3:** §§3.14, 6.2; **legacy:** M12.4. **Model:** deterministic retrieval; reuse R4 proposed Sonnet `claude-sonnet-5-5` low-effort support roles, and R7 indexing only when already enabled, where semantic checking is needed; no new codebase tutor model.

**Existing:** `packages/control-plane/src/repository-context.js:58` `repositoryTool`, `:117` bounded `read_source`; `packages/control-plane/src/learn-codebase-source-map.js:59` `learningSourceMap`, `:221` `sourceDrift`. The legacy map requires a known goal at lines 60–61 and its route creates old coaching activities; it is not the new roadmap entry point. **Create:** `packages/control-plane/src/roadmap-repository-evidence.js`, `test/roadmap-repository-evidence.test.js`; **modify:** R13.01 adapter.

- [ ] Reuse retained pure range/hash/omission helpers, extracting them only if cleanup removed their old owner. Accept learner instruction and selected scope without requiring a personal goal or invoking `codebaseActivity`.
- [ ] Retrieve original numbered lines for claims; preserve the 120-line/16,000-character reader bounds and report subsequent ranges needed. Treat graph edges as structural evidence, not runtime execution.
- [ ] Persist `{repo,commit,path,start,end,fileHash,readStatus}` and explicit excluded/unread ranges; only actual reads produce `source_supported` claims. Preserve tentative graph relationships separately.
- [ ] Add fixtures for repeated symbols, missing files, skipped secrets and a selected body exceeding one range; demonstrate that omitted lines never support an answer or quiz key.

**Tests/command:** from `packages/control-plane`, `node --test test/roadmap-repository-evidence.test.js test/learn-codebase-source-map.test.js`; rerun the legacy file only while retained. **Done:** evidence manifests distinguish graph-only, read and unavailable material; no retired journey/goal is created.

### R13.03 Preserve commit-bound navigation and source changes

**Owner:** UI with Tools; Lead owns LearnPage integration. **Depends:** R13.02 and R3 source references. **v1.3:** §§3.14, 4.3; **legacy:** M12.4, M3 extension. **Model:** none.

**Existing:** `packages/web/src/RepositorySource.jsx:15` component, `:33` commit-bound file request, `:42` range selection; `packages/control-plane/src/repositories.js:229` card-source route; `packages/control-plane/src/learn-codebase-source-map.js:221` drift. **Create:** `packages/web/src/roadmap-repository-references.js`, its `.test.mjs`; **modify:** R3 citation resolver and R4 proposal-source validation through their owners.

- [ ] Convert repository evidence to R3 references while retaining full commit and file hash; open the existing reader with exact line range and `byRepository` where appropriate.
- [ ] Recheck source version at proposal acceptance and generation. A changed relevant source supersedes unaccepted work; a harmless change in another file does not invalidate unrelated evidence.
- [ ] Keep delivered citations pointing to their original commit. Show changed/unavailable status and offer explicit replanning rather than silently resolving old lines against current code.
- [ ] Preserve source-to-card navigation and existing Project headings, Files, graph and course surfaces; supply a Lead-owned mount patch instead of replacing the Project UI.

**Tests/command:** from `packages/web`, `node --test src/roadmap-repository-references.test.mjs src/repo-context.test.mjs` (first file proposed). Assert full-SHA retention, exact range, unavailable historical commit and changed-source labeling. **Done:** captured current-UI smoke navigates a delivered citation and retains the original reference after refresh.

### R13.04 Qualify the Project loop independently

**Owner:** Verifier with Tools/UI fixes. **Depends:** R13.01–R13.03; enabled text delivery. **v1.3:** §§3.14, 8; **legacy:** M12.5 Project portion. **Model:** mocks for regression; any real planner/delivery run requires the existing bounded paid-test authorization.

**Existing:** `packages/control-plane/src/canvases.js:517` Project context; `packages/control-plane/src/repositories.js:276` snapshot/file routes. **Create:** `test/roadmap-project.test.js`, `packages/web/e2e/roadmap-project-check.mjs`; **modify:** Lead-owned check map and release receipt.

- [ ] Exercise explicit “teach this scope” with no goal, accepted plan, proposal, Tab, delivered text and source navigation on both repository Main and a child Project canvas.
- [ ] Inject snapshot refresh between planning and acceptance, source deletion before delivery and repository-access loss after caching; assert typed recovery without fabricated code evidence or duplicate debit.
- [ ] Repeat reload/duplicate acceptance and sharing/fork checks for commit references; private roadmap/evidence state must not enter copied board state.
- [ ] Add focused classification for these files and record R13 capability, exact candidate, retained cleanup interfaces and unsupported scopes; media-disabled configuration must pass.

**Tests/command:** from `packages/control-plane`, `node --test test/roadmap-project.test.js`; from `packages/web`, `node e2e/roadmap-project-check.mjs` (proposed harness uses the repository's existing E2E environment convention). **Done:** passing focused receipt plus one authorized current-UI Project smoke; no assertion that production was activated from local checks.

## R14 Editors and shared canvases

**Verified access gap:** primary-app `memberRole`/`canEdit` already support `edit` in `packages/control-plane/src/index.js:86` and `:183`, but `members.app_id` references primary `apps.id` (`packages/control-plane/schema.sql:87`). Canvas access instead reads LEARN_DB canvases and remains owner-only (`packages/control-plane/src/canvases.js:111`–126; `packages/control-plane/src/learn-board.js:365`). `canvas_members` has no editor-role column (`repository-schema.sql:304`–320), and active membership maps to commenter (`packages/web/src/canvas-permissions.js:16`). No canvas-to-primary-app mapping was established by this inspection. Do not revive the legacy M12.6 instruction by treating similarly numbered IDs as the same resource.

### R14.01 Establish one explicit editor authorization path

**Owner:** State/Money; Lead owns route/auth integration. **Depends:** R4 access contract; owner-confirmed grant mapping; relevant retained-interface receipt. **v1.3:** §§3.15, 4.1; **legacy:** M12.6, D27. **Model:** none.

**Existing:** access gap above; `packages/web/src/canvas-permissions.js:27` writer capabilities. **Create:** `packages/control-plane/src/roadmap-access.js`, `test/roadmap-editor-access.test.js`; **modify:** `packages/control-plane/src/canvases.js`, `packages/control-plane/src/learn-board.js` via Lead; schema only if the grant decision needs it.

- [ ] Produce the concrete grant decision first: reuse primary `members.role='edit'` only through a proven server-side binding of organization, canvas and owner to the actual primary app. Test mismatched owner/name and colliding numeric IDs. If no binding exists, specify an additive canvas-specific editor grant with owner grant/revoke lifecycle for approval; do not silently promote commenters or invent the mapping.
- [ ] Implement `resolveRoadmapAccess(req, env, {app,board})` returning `{org,app,board,boardId,boardOwnerEmail,actorUserId,actorEmail,payerUserId,role,grantRevision}`. These are proposed normalized fields, not today's `canvasAccess` shape.
- [ ] Require a stable authenticated actor; derive payer from that actor. Resolve owner board storage independently; client fields cannot override any principal, role or grant revision.
- [ ] Preserve current owner-only behavior until this release is enabled. Reserve any required `<NNNN>-canvas-editor-grants.sql` only after manifest reconciliation; never apply production migration as part of checklist work.

**Tests/command:** from `packages/control-plane`, `node --test test/roadmap-editor-access.test.js`. Cover owner, explicit editor, view member, commenter, stranger, revoked and ID collision. **Done:** recorded grant decision and passing resolver matrix, with no unproven authorization equivalence.

### R14.02 Thread owner, learner and payer through every state boundary

**Owner:** State/Money; Lead reviews usage changes. **Depends:** R14.01. **v1.3:** §§3.15, 4.1, 5.1; **legacy:** M12.6. **Model:** none; existing command models unchanged.

**Existing:** `packages/control-plane/src/learn-boards.js:227` `ownerRow`; `packages/control-plane/src/learn-usage.js:99` `noteUsageIdentity`, `:107` `payerOf`, `:139` `usagePayer`; learner records use `owner_user_id` in `repository-schema.sql:916`. **Create:** `test/roadmap-editor-identities.test.js`; **modify:** proposed roadmap store/jobs, feedback/attempt readers, accepted-generation adapters and Lead-owned usage integration.

- [ ] Resolve board rows and authorized placed content by `boardOwnerEmail`; key roadmap, proposals, drafts, feedback, attempts, Progress and private results by `actorUserId`. Never substitute the owner's email throughout an editor request.
- [ ] Bind admission/settlement to the editor's authenticated usage context and accepted step authorization; planner/checker operations keep explicit platform funding and assessments remain free.
- [ ] Persist actor/owner/authorization fingerprints in job checkpoints, outbox and provider-operation bindings. Resume reconstructs the same identity and revalidates the grant before another stage.
- [ ] Prove two editors create independent private roadmaps on one board and identical client action keys cannot cross actors; each editor's delivery remains idempotent within the shared board's version checks.

**Tests/command:** from `packages/control-plane`, `node --test test/roadmap-editor-identities.test.js`. Assert owner ledger unchanged, editor-only charge/refund, private evidence separation and lost-ack replay. **Done:** joined test ledger traces identify board owner, actor and payer separately for acceptance, generation, assessment and refund.

### R14.03 Enforce revocation and shared-result privacy

**Owner:** State/Money with UI. **Depends:** R14.02, R4 publication contract, enabled adapter inventories. **v1.3:** §§3.15, 4.4; **legacy:** M12.3/M12.6. **Model:** none.

**Existing:** `packages/control-plane/src/shared-privacy.js:35` `sharedState`, `:46` `linkAccess`; `packages/control-plane/src/learn-boards.js:110` `boardAsset`, `:474` `forkState`; `packages/web/src/canvas-permissions.js:34` personal-panel restriction. **Create:** `test/roadmap-editor-publication.test.js`; **modify:** proposed result/source/asset gates, adapter readers, shared privacy and existing UI permission model.

- [ ] Recheck live permission at accept, dispatch, each resumed paid stage, publication and direct result/asset read. Revocation halts new actions/debits and records the cause. Reconcile already-incurred work within the bounded delivery deadline; an accepted card that can no longer be authorized for delivery reaches terminal unavailable with one refund of its affected learner charges. Do not leave it charged in indefinite reconciliation. Preserve provider expense and legitimate already-delivered shared cards without leaking private output.
- [ ] Cover legacy command job/status/asset URLs as well as roadmap routes. An editor with board access still cannot read another learner's pending proposal, unaccepted prepared result, answer key or assessment.
- [ ] Expose actor-private Tutor/Progress only on the authorized editor workspace surface. Keep public/link visitor surfaces sanitized; source visibility does not imply access to owner's Materials or Files.
- [ ] Preserve already-delivered shareable cards and source citations; strip private step bindings, feedback and evidence on fork/duplicate. Do not delete accepted assets through pause, revocation or speculative expiry.

**Tests/command:** from `packages/control-plane`, `node --test test/roadmap-editor-publication.test.js test/shared-privacy.test.js`. Assert direct-ID attacks, revoke during generation, source reads, fork and legacy endpoints. **Done:** every enabled adapter has a recorded read-path inventory and no unauthorized body/asset bytes.

### R14.04 Run the mandatory editor release matrix

**Owner:** Verifier; UI implements harness; Lead classifies. **Depends:** R14.01–R14.03 and R9 for quiz evidence smoke. **v1.3:** §§3.15, 8, D44(b); **legacy:** M12.5 editor portion/M12.6. **Model:** fixture models; bounded authorized real smoke only.

**Existing:** `packages/web/src/canvas-permissions.js:106` `can`; `packages/control-plane/src/learn-boards.js:234` versioned saves. **Create:** `packages/web/e2e/roadmap-editor-check.mjs`, `test/roadmap-editor-matrix.test.js`; **modify:** check-map through Lead and R14 receipt.

- [ ] Exercise owner, editor A, editor B, reader, commenter, stranger and revoked member across source read, plan, proposal, acceptance, job poll, result, asset, save, answer and Progress.
- [ ] In two real test sessions, let the editor receive a card and answer the immutable quiz on the owner's board; verify the owner sees permitted cards and none of that editor's private learning state.
- [ ] Revoke between acceptance/dispatch and between generated/delivery; assert no new unauthorized debit, bounded terminal refund for accepted-but-undeliverable cards, retained provider expense and already-delivered cards, and a truthful UI stop. Race two editors' placements against board versions without losing either authorized card.
- [ ] Record actual enabled formats, exact SHA/build, focused results and recovery branch. Apply the adopted MVP policy without reinstating a broad gate; a failed editor-access assertion remains blocking. Later adapters must extend this same matrix before editor enablement.

**Tests/command:** from `packages/control-plane`, `node --test test/roadmap-editor-matrix.test.js`; from `packages/web`, `node e2e/roadmap-editor-check.mjs` (proposed). **Done:** passing role/route matrix and second-session smoke with separate payer/evidence traces; unqualified formats remain owner-only or disabled for editors.


## R15 — Images, notes and OCR

Readable note sources and image extraction are separately enabled adapters. Neither is a reason to hold a previously qualified text-only release. The existing image reader supplies actual bytes and a read receipt; that receipt proves what was supplied, not that OCR is correct. Existing visual assessment roles grade learner attempts and must not be repurposed as source extraction.

### R15.01 Add versioned note sources with explicit private-note selection

**Owner:** Tools, UI; **Depends:** R7 source adapter contract, R3 references, R4 access/publication. **Trace:** v1.3 §§3.16, 6.2; M13, M3/M4.23 extensions; D5. **Model:** none for text extraction; reuse the registered roadmap indexing/support roles for bounded semantic work.

**Existing:** `packages/web/src/focus-adapter-note.js:1–8` identifies sticky/text canvas items, not blocks; `packages/web/src/learn-notes.js:1–10,17–35` stores personal notes in scoped IndexedDB. **Create:** `packages/control-plane/src/roadmap-source-notes.js`, `packages/control-plane/test/roadmap-source-notes.test.js`; `packages/web/src/roadmap-note-source.js`, its `.test.mjs`; **Modify:** source registry and current source-selection UI through owners.

- [ ] Define supported canvas note items explicitly and read their saved authorized text; preserve item ID, board revision, text hash and offsets. Do not assume notes have ordinary block IDs.
- [ ] For personal IndexedDB notes, require explicit selection and import of a scoped immutable source snapshot. The server cannot claim to read unsent device-local notes or silently upload an entire notebook.
- [ ] Return empty, partial, unsupported drawing-only and missing-local-note states; readable text survives even when attached handwriting needs the separate image adapter.
- [ ] Invalidate only affected unaccepted work after edits; delivered references retain their old snapshot and show source changes instead of silently switching text.
- [ ] Test another user's note scope, offline/local-only content, text mutation during acceptance, Unicode offsets, no-goal entry and explicit import cancellation.

**Verify:** `node --test packages/control-plane/test/roadmap-source-notes.test.js packages/web/src/roadmap-note-source.test.mjs`. **Done:** one selected note supports a delivered explanation with exact source navigation; unselected personal notes remain private and unavailable to server planning.

### R15.02 Register a dedicated vision extraction role and actual-image reader

**Owner:** Tools; Lead owns model registry; State/Money reviews admission. **Depends:** R15.01 only when a note image is selected; otherwise R7/R4 source and budget contracts. **Trace:** §§3.16, 6.1/6.2, D42; M13/M4.23. **Model:** proposed `LEARN_TASKS.roadmap_vision_extract` = `claude-sonnet-5-5`, low effort, no silent fallback; qualifier must verify actual served vision capability.

**Existing:** `packages/control-plane/src/learn-image-context.js:26,47` `boardImageContext/tutorImageContext`; `packages/control-plane/src/file-access.js:25` `authorizeFileSource`; `packages/control-plane/src/learn-media.js:15,25,61` limits/sniff/read; `packages/control-plane/src/inline-image-extraction.js:4,20` uncertainty contract. **Create:** `packages/control-plane/src/roadmap-source-image.js`, `packages/control-plane/src/roadmap-vision-extract.js`, `packages/control-plane/test/roadmap-vision-extract.test.js`; **Modify:** Lead-owned `learn-models.js` and typed-tool registry.

- [ ] Read selected image bytes under authorized board/source identity and expected revision; reject arbitrary client URLs, R2 keys and mismatched source IDs before model dispatch.
- [ ] Define `extractFigure(access,sourceRef,{page,crop},limits)` with source hash, coordinate frame, original dimensions, extracted text/relationships, uncertain regions and coverage. Crop coordinates must originate in real selection/extraction geometry.
- [ ] Send actual pixels, with bounded caption/text context, through the new logged role and platform budget admission. Do not call `tutor_visual`, a grading endpoint, or infer figures from alt text alone.
- [ ] Retain immutable original/crop lineage and extraction/prompt/model versions; treat empty uncertainty arrays as no accuracy guarantee.
- [ ] Test missing bytes, stale transforms, unauthorized upload, unsupported MIME, oversized images, provider unavailability and forged crop coordinates.

**Verify:** `node --test packages/control-plane/test/roadmap-vision-extract.test.js packages/control-plane/src/inline-image-extraction.test.mjs`. **Done:** image read receipt and extraction manifest identify the actual pixels and requested/served model, with no assessment side effects.

### R15.03 Preserve OCR uncertainty and page/crop coverage in reasoning

**Owner:** Tools, State/Money; **Depends:** R15.02; R7b for scanned PDF pages. **Trace:** §§3.16, 6.2; M13/M4.20, D42. **Model:** dedicated proposed extraction role; existing roadmap support checker, with its one bounded escalation for genuinely ambiguous claims.

**Existing:** `packages/control-plane/src/inline-image-extraction.js:20–41` validates uncertainty locations; `packages/control-plane/src/learn-image-context.js:15–22` distinguishes source receipt from recognition; `packages/control-plane/src/learn-files.js:90–112` verifies uploaded bytes. **Create:** `packages/control-plane/src/roadmap-ocr-evidence.js`, `packages/control-plane/test/roadmap-ocr-evidence.test.js`; **Modify:** R7 coverage records, R3 reference conversion and, when R9 is enabled, its key-support checker through owners. R9 is not an additional prerequisite for image-source explanations.

- [ ] Persist recognized text beside the original image reference, never as a silent replacement of the source. Mark origin as OCR, including page/crop and extractor version.
- [ ] Preserve alternative readings of consequential symbols, missing legends, unreadable handwriting and partly scanned pages. Only measured region coordinates are clickable; descriptive uncertainty locations remain descriptive.
- [ ] Build claims from supported readable regions while exposing omissions. If an ambiguous exponent, sign or unit changes the answer, ask a focused clarification instead of guessing.
- [ ] Prevent uncertain extracted values from becoming graded answer keys. When R9 practice is enabled, a source correction creates a new activity snapshot/revision under that contract; an existing answer never silently binds to the changed key. Without R9, do not expose scored practice.
- [ ] Test a minus/plus ambiguity, superscript confusion, mixed readable/unreadable pages, a caption contradicting the figure and a document whose text extraction missed its scanned pages.

**Verify:** `node --test packages/control-plane/test/roadmap-ocr-evidence.test.js`. **Done:** fixture evidence shows supported content retained, explicit coverage gaps and unscored uncertain keys; neither an image hash nor a successful OCR response is treated as factual verification.

### R15.04 Qualify multimodal safety, cache privacy and current-UI navigation

**Owner:** Verifier, Tools, UI; **Depends:** R15.02–R15.03 and R14 when editors are enabled. **Trace:** §§3.16, 6.4, 8; M13 and M5.14 extension. **Model:** reuse qualified direct JEV `jev-1.13.0` screening under a dedicated modality policy; extraction remains the separate Sonnet role.

**Existing:** `packages/control-plane/src/webpage-screen.js:13–16,41,94` bounded image/text screening; `packages/control-plane/src/learn-grade-jev.js:18–21` direct transport configuration; `packages/control-plane/src/learn-image-context.js:26–44` authorized source read. **Create:** `packages/control-plane/src/roadmap-visual-source-checks.js`, `packages/control-plane/test/roadmap-visual-source-checks.test.js`; `packages/web/e2e/roadmap-visual-source-check.mjs`; **Modify:** R3 navigation and release capability registry.

- [ ] Establish source/output checks for actual image bytes, associated text and extracted claims. Reuse transport mechanics without blindly copying webpage thresholds to OCR or broadening supported image sizes.
- [ ] Evaluate ordinary educational anatomy, scientific diagrams, benign noisy scans and disallowed content; retain qualified usefulness and measured false-refusal/coverage limits.
- [ ] Key derivative caches by source/version/crop/policy plus authorized scope; recheck source access on every read and prevent guessable thumbnail/OCR URLs from leaking private material.
- [ ] Resolve unknown screening through bounded retry/contextual adjudication and finite limitation/refund, never indefinite hidden paid preparation.
- [ ] Show exact page/crop references, uncertainty and changed-source states in current UI; test owner/editor/stranger and fork behavior for derivatives.

**Verify:** `node --test packages/control-plane/test/roadmap-visual-source-checks.test.js`; WEB working directory: `node e2e/roadmap-visual-source-check.mjs`. **Done:** independent receipt includes image/notes flags, evaluation corpus, access results and one authorized uncertain-scan smoke; unknown cases remain unavailable without false success.

## R16 — A separate bounded execution service

This release proposes new service code. Existing CAD isolation demonstrates specific mechanisms to audit; it is not a ready general-purpose Tutor sandbox. Earlier code examples, notebooks and deterministic calculation remain independently releasable. Importing or indexing a repository, upload or notebook never executes its contents.

### R16.01 Define an accepted computation contract and inert import boundary

**Owner:** Tools, State/Money; Lead owns registry. **Depends:** R4 accepted authorization/tool and shared evidence-identity contracts; R14 if editor execution is enabled. **Activation:** service qualification in R16.02–R16.04 must complete before enabling execution; those tasks depend on this contract, not vice versa. R7 is not a prerequisite. **Trace:** v1.3 §§3.17, 6.3, D41; M15/M4.23. **Model:** none in execution dispatch; reuse an explicitly enabled authoring role only if generating a new code proposal.

**Existing precedent:** `packages/control-plane/src/cad-model.js:63–85` bounded model request/admission; `packages/cad-execute/server.mjs:27,48` bounded request/service boundary. **Create:** `packages/control-plane/src/roadmap-execution-contract.js` importing canonical `packages/control-plane/src/roadmap-contract.js`, `packages/control-plane/src/roadmap-execution-client.js`, `packages/control-plane/test/roadmap-execution-contract.test.js`; **Modify:** proposed `roadmap-tools.js` through Lead; reuse `packages/control-plane/src/roadmap-policy.js` for versioned limits and funding policy.

- [ ] Define `executeComputation(access,acceptance,{code,inputRefs,runtimeDigest,limits})` with immutable code/input hashes, explicit purpose, accepted bound and unique execution ID. Validate schema and source access before reserving work.
- [ ] Freeze runtime/package allowlist and output schema in the proposal; a materially changed program, input set, package or limit requires new acceptance.
- [ ] Record the infrastructure payer and learner-pricing policy before enablement. Execution-service expense is recorded once in the platform ledger, separately from learner price. If the adopted policy is platform-funded, use `zero_priced` with no learner hold; if learner-billed, price the complete bounded computation in R4's aggregate authorization before dispatch and transfer allocations without double reservation. Missing/unpriced policy returns unavailable; do not infer free execution or a new charge from existing CAD pricing.
- [ ] Return typed queued/running/completed/failed/cancelled/unknown outcomes; transport timeout is not proof that execution stopped.
- [ ] Keep all file import/index/preview paths inert. Code from a source or model is untrusted data until this separately accepted service call.
- [ ] Test arbitrary service URL, unknown runtime, tampered hash, stale acceptance, repeated dispatch and import of a file containing executable hooks.

**Verify:** `node --test packages/control-plane/test/roadmap-execution-contract.test.js`. **Done:** zero execution requests occur during imports; a valid accepted computation creates one durable job and an altered request is refused before spend or dispatch.

### R16.02 Build and measure isolation in the new execution service

**Owner:** Tools; independent Verifier reviews isolation. **Depends:** R16.01 and approved measured service configuration. **Trace:** §§3.17, 6.3; M15. **Model:** none.

**Existing audit precedents:** `packages/cad-execute/sandbox/cad-sandbox:2–17` namespaces/process wait; `sandbox/resource-control.mjs:20,58,180,200` limits/detection/cleanup; `server.mjs:20–24` rejects missing cleanup proof. **Create:** proposed `packages/tutor-execute/` with `Dockerfile`, locked runtime dependencies, `server.mjs`, `sandbox/`, `contract.test.mjs` and `isolation.linux.test.mjs`. These are new service files.

- [ ] Pin runtime image digest and dependency versions; mount a read-only root, read-only accepted input set and one quota-limited per-job temporary workspace. Do not inject application, provider or cloud credentials.
- [ ] Deny network by default at the isolation boundary, including DNS, loopback access to host services, metadata addresses and IPv6; never rely only on application-level URL filters.
- [ ] Apply kernel-enforced CPU, memory, process-count, file-size, disk and wall-time limits before untrusted code starts. Fail closed when required controls are absent; measure settings rather than copying CAD's 2 GiB/512-task values.
- [ ] Isolate concurrent jobs by identity/workspace; reject path traversal, symlink/hardlink escapes, arbitrary mounts and package installation.
- [ ] Kill the full process tree and verify workspace/control-group cleanup after completion, timeout, cancellation and crash. Quarantine a worker whose cleanup proof fails.

**Verify:** in `packages/tutor-execute`, `node --test contract.test.mjs isolation.linux.test.mjs` on the intended Linux runtime, never merely a mocked laptop. **Done:** machine-readable kernel-limit/egress/cleanup evidence plus independent review; no claim that existing CAD deployment already satisfies this release.

### R16.03 Store reproducible computational evidence and reconcile recovery

**Owner:** State/Money, Tools; **Depends:** R16.01–R16.02, R4 durable outbox and publication. **Trace:** §§3.17, 4.3, 5.4, 6.2; M15/M5.14. **Model:** none for execution; optional explanation uses only its qualified roadmap generation role.

**Existing precedents:** `packages/cad-execute/server.mjs:60–98` execution/cleanup handling; `packages/control-plane/src/learn-video.js:455–469` separate provider cost/outcome records. **Create:** `packages/control-plane/src/roadmap-execution-jobs.js`, `packages/control-plane/src/roadmap-computation-evidence.js`, `packages/control-plane/test/roadmap-execution-recovery.test.js`; proposed additive `<NNNN>-roadmap-executions.sql` after manifest allocation.

- [ ] Store execution ID, accepted code/input hashes, runtime/image/package versions, limits, exit status, stdout/stderr hashes, output artifacts, truncation, resource measurements and cleanup proof; keep sensitive bodies out of telemetry.
- [ ] Commit terminal outcome and replayable notification atomically; retries reconcile the existing job before considering a new execution. Lost acknowledgements cannot start a second paid run.
- [ ] Preserve actual outputs and failure reasons. Mark an example unexecuted, a successful completed run computed, and a partial/failed run according to its real limits; an exit-zero result does not validate all educational claims.
- [ ] Apply accepted-entitlement and modality checks before serving stdout, files or plots. Quarantine unsafe/oversized outputs; preserve an explicit truncation marker rather than pretending complete evidence.
- [ ] Reconcile reservations and refunds under R16.01's recorded payer/pricing policy without erasing platform infrastructure expense; unknown worker outcomes remain held for finite recovery with no blind redispatch. A terminal undeliverable accepted execution refunds any affected learner charge once.

**Verify:** `node --test packages/control-plane/test/roadmap-execution-recovery.test.js`. **Done:** crash-injection traces show one execution and one terminal notification/charge outcome; reproduced output matches a small deterministic fixture under the pinned runtime.

### R16.04 Qualify adversarial limits and truthful user-visible results

**Owner:** independent Verifier with Tools/UI fixes; Lead handles activation. **Depends:** R16.01–R16.03. **Trace:** §§3.17, 8; M15, D41. **Model:** fixtures for authoring; no paid model required for isolation tests.

**Existing UI precedent:** `packages/control-plane/src/learn-primitives.js:84–92` explicitly unexecuted snippets; audit precedent `packages/cad-execute/sandbox/resource-control.mjs:180–214` cleanup proof. **Create:** `packages/tutor-execute/acceptance.linux.test.mjs`, `packages/control-plane/test/roadmap-execution-publication.test.js`, `packages/web/e2e/roadmap-execution-check.mjs`; **Modify:** current result renderer and Lead-owned check-map/receipt.

- [ ] Run adversarial fixtures for outbound sockets, DNS/metadata access, filesystem traversal, fork storms, memory exhaustion, infinite loops, huge stdout, oversized files and child processes surviving parent exit.
- [ ] Crash the service between admission/start, start/output and output/commit; cancel queued/running jobs and prove cleanup plus eventual durable outcome. Missing controls or cleanup proof blocks availability.
- [ ] Test revoked editor access, forged input references, shared-board identity isolation and direct output URLs; preserve already-delivered authorized evidence without allowing new unauthorized work.
- [ ] Show execution status, source/runtime provenance, actual output and concise failure limits in current UI. Never render generated “expected output” as execution evidence.
- [ ] Record exact service image, limit measurements, focused security review, adopted infrastructure-payer/learner-pricing policy, measured cost reconciliation and recovery switch; missing funding policy blocks enablement. Activate only the audited runtime/package subset.

**Verify:** new service working directory: `node --test acceptance.linux.test.mjs`; root: `node --test packages/control-plane/test/roadmap-execution-publication.test.js`; WEB: `node e2e/roadmap-execution-check.mjs`. **Done:** small reproducible computation succeeds, every isolation fixture has recorded outcome, and failure UI states limitations truthfully; broader execution remains disabled.


## 4 Verification integration and production evidence

### 4.1 Parallel work and release order

Keep the existing lead and file-writer manifest. The useful steady-state team is **one lead/integrator, three implementation lanes and one independent verifier**, with an additional bounded source/tool lane only when its inputs and output files are independent. This is a staffing recommendation, not a requirement to replace the six agents already reported running across cleanup and Tutor. A role may serve several releases sequentially; do not spawn a separate agent for every checkbox.

| Window | Parallel implementation | Integration constraint |
| --- | --- | --- |
| Existing work | R1 feedback; R2 settings; R3 references; R4 unmounted contracts | Reconcile already-created branches. Applicable cleanup receipts and retained interfaces govern integration; see §1.2. |
| First complete Tutor | R4 state/money, UI, source/planning/checking modules | Freeze interfaces first; integrate all required R4 behavior as one complete Markdown explanation flow. R1–R3 are prerequisites. |
| After R4 | R5 editing; R6 automatic proposals; a chosen R7/R8/R9 capability | Release each completed capability independently. R6 does not wait for R5. Choose based on user value, not numeric position alone. |
| Later | R10 after evidence/editing; R11 after automatic proposals/versioning; individual R12 adapters; R13 | R11 and rich media are independent. A ready format does not wait for every adapter, research or OCR. |
| Access and advanced inputs | R14 after R4/R9 and its access matrix; R15 after retrieval; R16 after execution qualification | Each release brings its own applicable checks. No broad “all tools ready” dependency. |

The verifier starts on a committed candidate while implementation lanes work on nonconflicting subsequent tasks. A review failure returns to its owning lane; the lead integrates corrections and reruns the relevant checks. Never have two lanes edit the same shared file or amend a candidate undergoing release. When main changes, reconcile once and regenerate candidate-bound evidence affected by that change; do not reuse a receipt for another SHA.

### REL.01 Classify changes and freeze the actual candidate

**Owner:** Lead; Verifier reviews coverage. **Depends:** the selected release's implementation tasks and applicable prerequisite receipt. **Model:** none. **Existing files/functions:** `scripts/ci/affected.mjs:15` `classify`, `:25` `select`, `:74` `plan`; `scripts/ci/check-map.test.mjs:146` mandatory executable classification; `scripts/mvp-fast-path.mjs:98` `affectedTests` (locate by symbol after edits). **Modify:** `scripts/ci/check-map.json` only for the actual changed paths, plus release receipt/manifest.

- [ ] Resolve and record current main, candidate SHA/tree, parent, integrated release IDs and migration set. Confirm a clean candidate worktree and a main fast-forward path. Separate unrelated unfinished capabilities with the established capability flags, not half-mounted routes.
- [ ] Check every added or moved executable against the current classification map. Add a real covering check or documented existing CI-unit/preview classification. Do not use `none` to conceal untested runtime code.
- [ ] For a deleted registered `*-check.mjs`, preserve its required `checks` entry in the deleting push; remove the entry in the following push. Preserve necessary `none` mappings for the transition push as the current selector requires. Validate the actual deletion diff with `plan()`; do not assume a missing file is silently skipped.
- [ ] Inspect `affectedTests` output: it follows direct relative imports only. Explicitly add the task's required transitive/interface/money/access tests where the heuristic misses them. Investigate `uncovered`; a nonzero list is not proof that coverage is sufficient. The fallback may run a whole package, so report what it actually selected.
- [ ] Confirm check commands run at the documented working directory and produce a nonzero test count. A Node glob that expands to no tests is a failed verification attempt even if a wrapper exits zero.

**Checks:** from repository root, `node --test scripts/ci/affected.test.mjs scripts/ci/check-map.test.mjs`; add `scripts/schema-check.test.mjs` when schema/migrations change. If the release tooling itself changes, also run `node --test scripts/mvp-fast-path.test.mjs scripts/prod-release.test.mjs`. Do not rerun those tool suites for every pure UI correction unless implicated. **Evidence:** candidate manifest, classified diff, test-selection output, migration collision check and exact required-check list.

### REL.02 Verify the current UI and complete feature contract

**Owner:** Implementers run focused checks; Verifier independently reviews the integrated candidate. **Depends:** REL.01. **Model:** fixtures/stubs only unless REL.03 authorizes actual calls. **Existing entry points:** root/package `package.json`, task-named Node suites and browser-check files. **Proposed:** add the release's explicitly named test files and a keyless feature-smoke fixture where absent; do not claim a proposed test already passed.

- [ ] Run the selected tasks' Node suites at their specified package cwd, record counts and exit codes, and inspect failures rather than retrying repeatedly without diagnosis. State/concurrency, access, money and publication tests must exercise production entry points and realistic storage semantics, not merely a duplicate implementation in a fake.
- [ ] Exercise keyboard ownership, hover behavior, ToC navigation, source highlighting, proposal/delivery and reload on the real integrated UI using the repository-approved browser-check runner. Existing `CLAUDE.md` browser restrictions still apply: a command below is not authorization for an agent to launch local or remote browser automation. Use approved CI/designated execution or the owner's existing authorized path.
- [ ] Run multi-device/action replay and crash fixtures for a release that changes those contracts. For R4/R11/R12 include exact provider-operation counts, reservations, learner debit, partial failure/refund and body/asset publication. R14 requires the full actor/owner/payer/revocation matrix.
- [ ] Inspect representative visual results at the supported desktop size: no duplicate Chat, no card rail crowding, no automatic camera movement, correct selected-blue thumbs and one current proposal. Check the actual production-bound build configuration rather than a demonstration mockup alone.
- [ ] Record any owner browser-try waiver separately. A waived manual try is neither a passed functional check nor permission to run otherwise prohibited browser automation. A Windows-only check that no approved executor ran remains unverified; assign a concrete executor or add a meaningful supported check for the required behavior.

**Check command conventions:** `node --test test/<name>.test.js` from `packages/control-plane`; `node --test src/<name>.test.mjs` from `packages/web`; `node packages/web/e2e/<name>-check.mjs` from the root **only on the approved browser-check executor with that check's documented environment**. The exact test/fixture names and assertions appear in each release task. **Evidence:** run/executor, SHA, counts, results, screenshots/logs and identified unsupported paths. A signed-out generic HTTP smoke alone does not establish private Tutor behavior.

### REL.03 Qualify a new model role or changed tool using a bounded sample

**Owner:** Tools prepares corpus and rubric; Verifier scores; Lead records applicable paid-test authorization. **Depends:** relevant deterministic tests and the implemented role/policy. R1 and deterministic portions of R2/R3 do not wait for future planning/media evaluations. **Model:** only the exact role under qualification from §2.2 or its retained command registry entry. **Proposed files:** `packages/control-plane/test/fixtures/roadmap/<capability>/`, `scripts/roadmap-eval.mjs`, versioned rubric and result receipt, unless the active branch already has a compatible evaluation harness.

- [ ] Freeze a small capability-specific corpus and scoring rubric before calls: requested instruction, supported scope, suitable depth, nonredundancy, source support, uncertainty, usable output and stopping point. Include ambiguous/private-source and applicable safety cases. Use a held-out subset for material prompt/model changes; do not require the entire future multimodal corpus for R4.
- [ ] Name the requested and served model, effort, prompt/policy version, limits, number of calls, repair bound, maximum platform cost and payer. Use the existing authorized ledger. An old proposed cap or this document is not a new spending authorization.
- [ ] Prove deterministic enforcement with mocked verdicts, then separately measure the classifier/grounding/model's real failure rates. Record false refusal, false allowance, unsupported claims/keys, invalid output, latency and costs; never describe model checking as a guarantee of truth.
- [ ] Keep instruction/reference injection, invented sources, inaccessible sources and educational sensitive material distinct. Unsupported or insufficient evidence must result in clarification/limitation; an unresolved safety result must finish through the finite hold/recovery policy.
- [ ] Report first-pass and repaired outcomes separately. Critical access, charging, publication or unsupported-answer-key failures prevent enabling the affected capability. After two candidates fail for the same family, diagnose and state the next targeted change before another paid retry; continue unrelated ready work.

**Checks/evidence:** harness tests run keylessly; authorized live invocation records exact CLI/config, candidate, corpus hash, rubric/threshold, outputs, scores, provider ledger IDs and measured spend. Use local saved artifacts for repeatable rendering when possible. No new call is needed merely to reformat a receipt.

### REL.04 Produce an exact-SHA MVP preview and recovery record

**Owner:** Lead; Verifier checks record and focused acceptance. **Depends:** REL.01–REL.02 and REL.03 when applicable; owner MVP label recorded for the release. **Model:** none in release plumbing; a smoke must not create hidden paid calls. **Existing functions:** `scripts/mvp-fast-path.mjs` `checkRecovery`, `runPreview`, `preview`, `mvpVerdict`, `verify`; `docs/features/mvp-fast-path.md` §§1–2; `packages/web/dev-worker.js` imports the control-plane Learn routes and job classes into the dev worker.

- [ ] Prepare a working forward-recovery change on a branch that is a strict descendant of the candidate, push that recovery branch under the existing authorization and fetch its exact tip. A branch pointing at the candidate itself is insufficient. Recovery preserves compatible stored state/assets; it is not an untested table deletion.
- [ ] Reconcile D1 schema, R2/DO bindings, exports, feature flags and any required secret **names** for the named dev clone. Use the repo's existing isolated-clone procedure; never a bare deploy to the shared worker. Record whether a command executes in the clone or forwards to another service, including that service's identity.
- [ ] At the clean exact candidate, run the existing preview command with named checks. It runs build → affected tests → smoke → deployment. Therefore the supplied smoke must run against a fixture/local approved runner or another correctly candidate-bound target; it cannot truthfully claim it tested the newly deployed clone before deployment occurred.
- [ ] After deployment, verify actual feature behavior on the returned clone and record its Worker version, build and enabled capabilities. The launcher's `GET /library` check proves the served entry, not completion of the Tutor acceptance flow. If a required credential/service is absent, exercise its unavailable path and record the missing live qualification honestly.
- [ ] Verify the newest receipt for the exact SHA and live recovery tip. `--no-deploy` is useful for checks but never yields a production-acceptable MVP record. Broad CI/gate remain `bypassed`, regardless of their independent status.

**Command template, repository root:** resolve the placeholders to exact values in the release record; do not execute the angle-bracket placeholders.

```bash
node scripts/mvp-fast-path.mjs preview --mvp --sha <full-candidate-sha> \
  --smoke "<approved focused check command with root-relative paths>" \
  --recovery <pushed-forward-recovery-branch> --worker rabbit-hole-web-dev-<worktree> \
  --base <recorded-base-ref>
node scripts/mvp-fast-path.mjs verify --sha <full-candidate-sha> --fetch --json
```

`--smoke` is a shell command executed from the repository root. Use `node packages/web/e2e/<check>.mjs`, not a package-relative `node e2e/...`, if the approved executor runs it there. Do not put credentials in the command/receipt. **Evidence:** preview record plus separate post-deploy feature acceptance, served identity, recovery descendant proof and unsupported configuration. A locally verified branch is not a deployed preview.

### REL.05 Prepare the owner action once and verify production

**Owner:** Lead prepares the complete handoff; owner performs the actions reserved by current policy; Verifier checks the release result. **Depends:** REL.04 and the release-specific outstanding activation records. **Model:** no automatic paid smoke. **Existing:** `scripts/prod-release.mjs:259` `prepare`, `:284` release function; `.github/workflows/deploy-prod.yml`; `docs/features/mvp-fast-path.md` owner's steps. Check symbols again after any tooling edit.

- [ ] Present the concrete candidate, passed focused evidence, preview, recovery, capability flags and exact pending migration/environment statements together. The release preflight never applies migrations. Do not bundle cleanup backfill/drop approval into a Tutor additive migration or describe merely proposed schema as applied.
- [ ] Prepare the existing exact-SHA `MVP_ALLOWED_SHA` command and owner launcher/check invocation. The owner-only variable boundary remains; no agent sets it. Reuse existing authorization and do not reopen general design decisions. Request only an actually missing imminent owner action with the concrete result ready.
- [ ] Preserve candidate identity through the main fast-forward. A squash/merge/rebase that changes the SHA needs its own bound preview/record. Confirm the release selects MVP mode; an ignored MVP note is an error to resolve, not a reason to silently wait for the broad gate.
- [ ] Let the unchanged production preparation/release verify bundles, secret names, schema, stale-candidate/HOLD rules, deploy the control plane and app, and execute production smoke/recovery. Inspect served SHA/version on both Workers and required DO/binding/flag state. Do not declare production from a successful push alone.
- [ ] Verify the release's actual new behavior through the authorized feature check. Prefer nonbillable fixtures/read-only inspection where sufficient. Any real generation smoke needs the applicable bounded authorization and a clean test plan. R1 can verify persistence/no-goal feedback; R4 must already have qualified its generation flow on the candidate and must verify production wiring.
- [ ] Remove temporary exact-SHA allowance through the owner procedure. Record `production_activated` only for enabled and verified capabilities, keep later flags off, and continue the next independent release. On failure report the exact failed requirement and execute the prepared recovery under existing authorization.

**Prepared owner-action template:** use the current launcher, not a newly invented gate waiver. The launcher path is documented in the repository; its external local file was not inspected here.

```text
gh variable set MVP_ALLOWED_SHA --body <full-candidate-sha> -R Rabbit-Hole-App/Rabbit-Hole
C:\s\spec\release-queue\release-mvp.cmd <release-name> --check
C:\s\spec\release-queue\release-mvp.cmd <release-name>
gh variable delete MVP_ALLOWED_SHA -R Rabbit-Hole-App/Rabbit-Hole
```

For a repository-script preparation check, the existing entry point is `node scripts/prod-release.mjs prepare --mvp --sha <sha>` with the policy-required exact-SHA allowance and record environment; this is not permission for an agent to supply its own owner allowance. **Evidence:** release run, prepared build, served pair, schema/flag identity, production smoke, recovery availability and cleared temporary authorization.

### 4.2 Task and release receipt template

Use the same fields in the active manifest/receipt instead of creating a competing progress database:

```yaml
release: R1
status: not_started
source_roadmap: tutor-roadmap-v1.3.md
source_checklist: tutor-implementation-checklist.md
owner: assigned-role-and-agent
base_sha: null
implementation_sha: null
candidate_sha: null
candidate_tree: null
prerequisite_receipt: null
completed_task_ids: []
capabilities_enabled: []
capabilities_deferred: []
migrations: []  # file/hash, environment, authorization, applied schema evidence
checks: []      # exact command, cwd, executor, SHA, nonzero count, result, log
model_evaluation: null  # role/model/prompt/policy/corpus/budget/actual spend
billing_evidence: null # reservation, provider IDs, learner charge, refund/replay
preview: null          # URL, Worker version, build, MVP record, feature acceptance
recovery: null         # branch, descendant tip, recovery behavior
production: null      # run, served CP/app SHA+versions, flags, feature smoke
broad_ci: bypassed    # only for an actually MVP-labelled release
release_gate: bypassed
open_blocker: null
```

`null`, `not_run`, `failed`, `passed` and `not_applicable` must remain distinct. “Implemented” is not “tested,” “preview verified” is not “live,” and a docs-only contract commit is not an activated capability. Cite the evidence that changes each status.

## 5 Coverage and source audit

### 5.1 How this maps to v1.3

The roadmap remains the product/release authority. This companion expands its tasks without reactivating superseded v1/v1.1/v1.2 implementation wording. In particular it preserves whole-step allowance admission, separate provider/learner accounting, immutable quiz snapshots, transactional outbox delivery, strict publication entitlement, one-format-at-a-time releases and the existing UI. The P2/P4 cleanup receipt proposal is explicitly conditional, not silently recorded as an owner decision.

The table below maps every one of the **98 numbered v1.2 subtasks already assigned by v1.3 §10.1** to executable work here. A range includes its endpoints. Additional BASE/REL tasks supply common integration and delivery evidence. M0 and M13–M15 have no numbered checkbox series in that source; they are covered separately below.

| Legacy task IDs | Executable tasks in this companion | v1.3 assignment and boundary |
| --- | --- | --- |
| M1.1–M1.6 | R1.01–R1.06 | R1 — Complete feedback release, including private persistence, no-goal Progress and its focused checks. |
| M2.1–M2.7 | R2.01–R2.06; R4.04; R6.01–R6.03 | R2; integration R4/R6 — Controls and existing answer paths first; roadmap behavior consumes them in R4, automatic proposals in R6. |
| M3.1–M3.6 | R3.01–R3.06; R7b.01–R7b.03; R13.03; R15.01–R15.04 | R3; extensions R7b/R13/R15 — Markdown and existing selected-PDF-excerpt anchors/navigation ship in R3. R7b adds whole-PDF planning, not the first PDF reference. Code and visual-source adapters extend the contract later. |
| M4.1–M4.3 | R4.01–R4.04, R4.09, R4.13; REL.03; capability-specific qualification | R4; expanded R7–R10/R15 — Measure and evaluate the bounded Markdown planner, grounding and supported safety cases in R4. Add corpus, index and tool cases with each capability; do not require every later-format case for R4. |
| M4.4–M4.8 | R4.01–R4.06; R7a.01–R7a.03 | R4; index stage R7 — Core schema, coordinator, replay, routes, messages and durable event delivery. M4.6 adds the long-source indexing stage in R7. |
| M4.9–M4.12 | R4.04, R4.12; R9.05; R10.04 | R4; practice R9; multisource R10 — Single-source invitation, accepted plan, ToC and revision conversation in R4. Practice mode becomes selectable with working practice; grouped/new-source planning expands in R10. |
| M4.13–M4.17 | R4.03–R4.04, R4.13; R10.03–R10.04 | R4; grouped-source cases R10 — Modes, teach intent, learner instruction and focused questions belong to the first flow. Empty/title-only entry may be an R4 follow-up; it must not claim source evidence. Expand multi-source test cases in R10. |
| M4.18 | R4.03; R3.01–R3.03 | R4 — Visible-section scope is captured with its source revision at selection time; later scrolling never changes it. |
| M4.19 | R4.09, R4.13; each enabled adapter’s output checks | R4; expanded per capability — The contextual safety screen is required for the first supported inputs and outputs. Add modality tests before enabling later commands. |
| M4.20 | R4.03; R7a.01–R7a.03; R7b.01–R7b.03 | R7a/R7b; bounded subset R4 — R4 reads the supported bounded Markdown fully and reports unsupported coverage. R7a adds versioned chunks, coverage, summaries, budgets and retrieval for long Markdown; R7b adds PDF pages and unreadable-region records. |
| M4.21 | R8a.01–R8a.03 | R8a — Scoped web discovery and guarded fetching; available independently of completing the media ladder. |
| M4.22 | R8b.01–R8b.03 | R8b — Restricted deterministic calculator. This task does not authorize general code execution. |
| M4.23 | R4.03, R4.06, R4.09; R7–R8 adapters; R13.01; R15.02; R16.01 | R4; new adapters R7/R8/R13/R15/R16 — Ship the authorization, typed-result, budget and deadline boundary with the first local-source tools; register later tools only with their release. |
| M5.1–M5.4 | R4.01–R4.02, R4.06–R4.09; R9.05; R11.01–R11.03; R12.01 | R4; extensions R9/R11/R12 — First text/table proposal, versioned store and coordinator. M5.3 uses the proposed R4 server-only adapter, never public `allowedPrimitives`. R9 adds practice, R11 prepared-result accounting, R12 command stages. Corrected identity/publication contracts govern all. |
| M5.5–M5.10 | R4.10, R4.12–R4.13; R9.04; per-command R12 tests | R4; modality extensions R9/R12 — Proposal display, keyboard acceptance, independent delivered cards, ToC navigation, cross-device checks and private step labels ship together. No rich-format prerequisite is implied. |
| M5.11–M5.12 | R4.11–R4.13 | R4 — Bounded retry/refund behavior and content-free lifecycle telemetry exist on first delivery. |
| M5.13 | R4.11–R4.12 | R4 — Retry/Replace/Omit recovery through the existing conversations is available when a card can first fail. |
| M5.14 | R4.09; R9.02, R9.05; R12.01 and each enabled adapter | R4; modality extensions R9/R12 — Grounding/safety and accepted entitlement gate every publication path. Extend checks for practice keys and assets before those outputs ship. |
| M6.1–M6.3 | R5.01–R5.03 | R5 — Draft versus Apply and proposal drag. |
| M6.4 | R4.10 | R4 — Offscreen Next step ready only navigates to an existing proposal; it does not generate another. R6 can therefore ship independently of R5. |
| M6.5–M6.8 | R5.03–R5.04 | R5 — Explicit existing-card links, Add to Chat and editing checks. A link reuses a card without claiming newly generated work. |
| M7.1 | R6.03; R11.05 | R6/R11 — Measure delivery-to-next-proposal latency in R6; separately measure speculative-result readiness and cost in R11. |
| M7.2–M7.4 | R11.01–R11.04 | R11 — Prepared-result charging, background preparation, invalidation and bounded recheck. Provider cost is reconciled once and kept separate from the learner charge. |
| M7.5 | R4.05–R4.06, R4.11; R11.04 | R4/R11 — R4 needs durable event retries and job recovery with timely alarms; the sweep is a backstop. R11 adds unaccepted-result retention/expiry. Accepted assets never expire through this path. |
| M7.6 | R11.05 | R11 — Owner report for platform-funded speculative work, using the established provider-cost ledger. |
| M7.7 | R6.01–R6.03 | R6 — Automatic next proposal after delivery, with manual next preserved when Auto-suggest is off. |
| M7.8 | R6.03; R11.05 | R6/R11 — Split automated-proposal timing tests from speculative-preparation timing and money tests. |
| M7.9 | R4.12; R6.01–R6.03; R11.04 | R4/R6/R11 — R4: Ask pauses unsolicited work; already accepted generation may finish. R6: pause/resume of automatic proposals. R11: cancellation/reconciliation of speculative work. Neither pause nor resume expires accepted assets. |
| M8.1 | R12.09 | R12 interactive-explanation adapter — Roadmap-created interactive explanation adapter, using D2(b) only after its narrow override is recorded. Keep the ordinary explanation brief behavior. |
| M8.2 | R12.06–R12.08, R12.10–R12.12 | Individual R12 command adapters — One adapter per command: image, motion, whiteboard, CAD, interactive Animation and Blender 3D; release the smallest ready adapter without requiring interactive explanation first. Preserve each existing review flow; phase identities include card identity. |
| M8.3 | R4.07; R12.01 and each enabled adapter | R4/R12 — Core insufficient-allowance refusal is required by the first paid acceptance. Reuse and test it for every later paid adapter. |
| M8.4 | R4.10; R12.01 and Tutor-only command reviews | R4/R12 — R4 proposals show no prices. Extend the Tutor-specific suppression to each enabled command review without removing existing ordinary-mode behavior. |
| M8.5 | R12.01–R12.17, individually | Each individual R12 adapter — Run the focused priced-path checks for the adapter being enabled; no all-media batch prerequisite. |
| M8.6 | R4.07, R4.11–R4.12; R12.01 and each paid adapter | R4/R12 — R4 binds the accepted authorization and requires new acceptance for material changes. Each later command adds its plan/quote/duration comparison before additional spend. |
| M9.1–M9.4 | R9.01–R9.04 | R9 — Private evidence container, immutable quiz binding, free assessment, answer-later behavior and canvas-scoped Progress. |
| M9.5 | R9.03 | R9 — Correct v1.2: write the observation notification in the same atomic assessment commit/batch, then deliver it through the outbox. A separate route-side write after assessment leaves a crash gap. |
| M9.6 | R9.05; REL.02–REL.03 | R9 — Practice and free-assessment checks, including snapshot, replay and outbox recovery cases. |
| M10.1–M10.5 | R10.01–R10.03 | R10 — Evidence-informed adaptation, prerequisite handling, focused questions and learner-controlled Rabbit Holes; preserve uncertainty in self-reports. |
| M11.1 | R4.12; R10.04; R11.04 | R4/R10/R11 — R4: settings revision, delivered-count ceiling and explicit continuation. R10: include/clarify additional sources. R11: invalidate only affected unaccepted prepared work. |
| M11.3 | R4.12; R10.04 | R4/R10 — R4: editable settings, revision acceptance, pause and stopping states. R10: include-source and associated revised-plan display. |
| M11.4 | R10.04; R11.04 | R10/R11 — R10: Different version keeps earlier delivered cards and requires fresh acceptance. R11: retain or retire unaccepted prepared results under the same rules. |
| M12.2–M12.3 | R4.12–R4.13; R14.03–R14.04 | R4; access expansion R14 — Deletion/undo records, fork stripping and shared-view privacy ship before first roadmap delivery. R14 repeats and expands the matrix for editors; privacy is never deferred to R14. |
| M12.4 | R13.01–R13.04 | R13 — Project/repository snapshot inputs and commit-bound code references. |
| M12.5 | R4.13; R13.04; R14.04 | R4/R13/R14 — Split its existing checks: fork/share in R4, Project flow in R13, editor flow in R14. |
| M12.6 | R14.01–R14.04 | R14 — Editor authorization, actor-private state and evidence, payer separation and membership revocation throughout every participating route/job. |

- **M0 cleanup:** BASE.01 and the release’s prerequisite receipt. Retain backfill-before-join-removal-before-table-drop sequencing in the separate cleanup plan; this checklist does not commission or apply the drop.
- **M13 images/notes:** R15.01–R15.04, including note snapshots, actual-image extraction, uncertainty, navigation and modality checks.
- **M14 research:** R8a.01–R8a.03, available without waiting for all source/media formats.
- **M15 computation:** R8b.01–R8b.03 for restricted arithmetic; R16.01–R16.04 for a separately qualified execution service.
- **Cross-release verification:** REL.01–REL.05. Every capability’s own mandatory checks remain required; an unshipped unrelated adapter is not a blocker.

### 5.2 Complete Tutor command assignment

| Command | Teaching purpose | Executable owner task |
| --- | --- | --- |
| `/explain` | Explanation: text/table first; interactive later | R4.08; R12.09 |
| `/practice` | Explain-back / supported practice variants | R9.01, R9.03, R9.05 |
| `/quiz` | Multiple-choice assessment | R9.02–R9.05 |
| `/flashcards` | Question/answer practice; no mastery from reveal | R9.05 |
| `/code` | Explanation or unscored exercise; no invented execution | R12.02 |
| `/graph` | Explanation: interactive function graph or data plot | R12.03 |
| `/diagram` | Explanation: node-and-arrow or Mermaid diagram | R12.04 |
| `/notebook` | Empty workspace, either purpose; later execution separate | R12.05 |
| `/image` | Generated explanatory image | R12.06 |
| `/motion` | Animated explainer video | R12.07 |
| `/whiteboard` | Narrated whiteboard video, current catalogue addition | R12.08 |
| `/cad` | Dimensioned CAD model | R12.10 |
| `/animation` | Live interactive 3D scene, existing owner’s adapter contract only | R12.11 |
| `/3d` | Technical Blender scene | R12.12 |
| `/browser` | Saved explanatory webpage | R12.13 |
| `/photos` | Selected credited photo | R12.14 |
| `/youtube` | Existing selected video with honest caption/visual coverage | R12.15 |
| `/arxiv` | Research paper with actual-read coverage | R12.16 |
| `/wikipedia` | Article with retained revision/section | R12.17 |

`/goal` remains learner-only. The original removed internal `compare`, `walkthrough`, `animate`, editable `whiteboard` and generated `video` tool names are not restored by this table. The now-existing `/whiteboard` slash command represents the narrated-video engine. Practice timing remains context/evidence-driven, never a fixed two-to-one quota.

### 5.3 Decisions and engineering limits to record at their point of use

These are explicit implementation/activation boundaries, not reasons to stop unrelated tasks or ask for a general approval round.

| Record | Action and when it matters |
| --- | --- |
| Applicable cleanup receipt | BASE.01 records actual retained interfaces. P2/P4 integration relaxation requires recorded owner adoption if it replaces v1.3’s M0 receipt. |
| Existing local implementation and migrations | Reconcile the reported unpushed R1–R3 branches and reserved migration numbers; no duplicate work or claimed remote verification. |
| D2 narrow routing exceptions | Record R4 trusted text/table exception before R4 activation; separately record bound brief/Generate exception before interactive R12.09. Typed/Quick Edit routes stay unchanged. |
| D43 contextual policy | Record owner adoption and qualified policy version before first relevant generation/preparation activation. Enforce uncertainty and finite recovery; expand checks with each modality. |
| Model/service limits and paid testing | Freeze measured configuration and use the existing applicable authorization; do not invent approved caps or model availability. No paid budget needed for deterministic R1. |
| R14 actual editor grant | Establish a real resource-to-permission mapping; if none exists, specify the minimal additive grant/revoke design for the existing approved editor capability. Never treat commenter membership or an unrelated app ID as edit authority. |
| R16 execution payer | Record infrastructure-cost admission and the accepted pricing outcome before enabling execution; no fabricated fee or assumption that infrastructure is costless. |
| Candidate release action | Exact-SHA allowance and required migration application remain owner-controlled under current repository policy; prepare one concrete candidate handoff. |

### 5.4 Audit limits and completion status

This document was built from the supplied v1.3 roadmap and freshly fetched GitHub source at the stated main SHA, with independent cross-review of state/money, source/tool, UI and release dependencies. Existing file paths were checked against the commit’s repository tree; new modules/test paths are marked as targets. Named symbols and baseline line references explain where to make changes. They must be refreshed when cleanup or another release moves the code.

The Windows local-only branches, external owner launcher, live database schema, live model credentials and current production feature state were not inspected. No implementation tests were run against the source-only cache, no paid model calls were made, and no product code, migration, permission or deployment was changed. Commands and checkboxes are work to execute, not evidence that the feature already passes.

Source roadmap SHA-256: `58ab36be4af89cfbe994f6b071b54e16e0c352a58626f4926c9841b98d6c9b0b`. Pin this value in the integration receipt; if the roadmap is subsequently revised, reconcile changed requirements before marking their tasks complete.
