# Explain on Canvas — Tutor implementation checklist

**Rabbit Hole · Version 1.1 · 6 November 2026 · HOW we build and verify the feature**

**Product authority:** [Tutor roadmap v1.4](tutor-roadmap-v1.4.md). The roadmap describes WHAT the learner receives. This companion supplies exact changes, current files/functions, dependencies, owners, configured or proposed models, local tests and completion evidence. Both supersede the earlier active v1.3/v1.0 pair. Keep the release/task identifiers for traceability; do not execute old contradictory instructions beside these.

**Audited main:** `72d6536657af269bb894511220975fd2254246ed`. Latest slot changes are `b9b2dcf`, `3de7e0a` and `72d6536`; section4 uses their actual code and new tests. The unchanged backend baseline includes `399b4c0` (existing toast, removed invented recovery/status UI), `a1e4094` (whole-document ordinary authoring, no content repair, citation check recorded not run), and `fe2bf0f` (second-card test ordering/revision correction). A fresh integration must compare newer main before editing, not restart completed work.

**This is a documentation update.** No application tests, browser runs, paid calls, migration, deployment or functional acceptance were performed by writing it. Existing suites were read/path-checked; proposed tests are explicitly new work. The source cache used for this audit is not a runnable checkout. HTML designs will be created later in a separate UI folder; this change contains Markdown only.

## Contents

- [1 Execution rules and the next outcome](#1-execution-rules-and-the-next-outcome)
- [2 Current code, models and ownership](#2-current-code-models-and-ownership)
- [3 Correct the remaining source, author and accounting gaps](#3-correct-the-remaining-source-author-and-accounting-gaps)
- [4 Implement the exact existing-UI integration](#4-implement-the-exact-existing-ui-integration)
- [5 Reconcile existing R1–R6 tasks](#5-reconcile-existing-r1r6-tasks)
- [6 Continue the remaining R7–R16 ladder](#6-continue-the-remaining-r7r16-ladder)
  - [6.1 Later release implementation rules](#61-later-release-implementation-rules)
  - [6.2 R7a — Long Markdown indexing and explicit coverage](#62-r7a--long-markdown-indexing-and-explicit-coverage)
  - [6.3 R7b — PDF text and page references](#63-r7b--pdf-text-and-page-references)
  - [6.4 R8a — Scoped web discovery and fetched evidence](#64-r8a--scoped-web-discovery-and-fetched-evidence)
  - [6.5 R8b — Restricted deterministic calculation](#65-r8b--restricted-deterministic-calculation)
  - [6.6 R9 — Optional practice and assessed Progress](#66-r9--optional-practice-and-assessed-progress)
  - [6.7 R10 — Evidence-based adaptation and expanded revisions](#67-r10--evidence-based-adaptation-and-expanded-revisions)
  - [6.8 R11 — Platform-funded preparation with separate learner settlement](#68-r11--platform-funded-preparation-with-separate-learner-settlement)
  - [6.9 R12 — Independently released command adapters](#69-r12--independently-released-command-adapters)
  - [6.10 R13 Project canvases](#610-r13-project-canvases)
  - [6.11 R14 Editors and shared canvases](#611-r14-editors-and-shared-canvases)
  - [6.12 R15 — Images, notes and OCR](#612-r15--images-notes-and-ocr)
  - [6.13 R16 — A separate bounded execution service](#613-r16--a-separate-bounded-execution-service)
- [7 Finish cleanup without blocking the core](#7-finish-cleanup-without-blocking-the-core)
- [8 Local verification and direct production release](#8-local-verification-and-direct-production-release)
- [9 Actions, expected results and completion record](#9-actions-expected-results-and-completion-record)

## 1 Execution rules and the next outcome

### 1.1 Immediate sprint target

Deliver this complete supported flow: **readable Markdown drop → one Chat invitation → accepted roadmap in the existing ToC tree → proposal beside the source → click/Tab → same-slot first explanation → saved reload → one next proposal → same-slot second explanation**. Full-source context, correct charging and no automatic citation/repair loop apply to both cards.

The latest backend author changes are already in main. Preserve them. The remaining corrective tasks reconcile planner scope, immutable accepted intent, request/allowance bounds, applicable safety and retry policy, and completion of the newly landed canvas slot plus the still-missing unified ToC integration. Tests must exercise the real seams, not substitute a ready-made card before source loading or model-request construction.

No new agent framework, duplicated UI, general pipeline rewrite, all-format qualification, optional reward system or cleanup table drop is needed to finish this slice. Record nonblocking work in `docs/features/explain-on-canvas/OWNER-INBOX.md` with evidence, impact and a next action. A real supported-flow failure, incorrect debit, access leak, data loss or required migration mismatch is not a cosmetic follow-up.

### 1.2 Read this document as executable tasks

- `CORE.*` and `UI.*` are the current correction. Their owners commit narrow changes; shared integration belongs to the lead.
- Section 5 preserves R1–R6 IDs and maps completed/current behavior to exact implementation and remaining tests. It is not a request to rebuild them.
- R7–R16 remain the feature ladder. A later rung's missing tests/capability are not blockers for an unrelated earlier supported slice. Each adapter can ship independently after its real dependencies.
- `[ ]` means work/evidence to verify on the integration candidate, not proof the current implementation is absent. Record existing proof and extend only what the change requires.
- **Existing** means present at the audited SHA. **NEW / proposed** means create only if necessary for that task. Do not run a missing test filename and count a zero-test result as passed.
- Function names are locators; preserve an equivalent existing seam rather than adding a duplicate because the plan suggests an extraction. Core modules live under `packages/control-plane/src/roadmap/`; do not create stale flat `src/roadmap-*.js` copies.
- Every task receipt records actual candidate SHA, changed behavior, command, nonzero test count, assertion evidence and unresolved limitation. Status is one of implemented / locally verified / deployed / enabled / functionally accepted.

### 1.3 Contracts that every lane must share

| Contract | Invariant |
| --- | --- |
| Source context | For complete authorized Markdown ≤40,000 characters, the entire pinned document is planner/author context. Teaching scope and highlight range are independent. Actual request budget still applies. |
| Accepted intent | Use the accepted step's plan/proposal version, original instruction and revisions, outcome/goal/claims, language and Depth. Do not read whichever plan happens to be latest. |
| Ordinary author | One content-author dispatch; no automatic content repair or author redispatch, zero ordinary citation-review/escalation calls. Existing safety/schema/access/billing remain. |
| Publication | Aggregate validation means all checks required by the selected policy passed; grounding says `not_run`, never invented `passed`. Other adapters keep their own applicable checks. |
| Purchase | Click and eligible Tab use one immutable acceptance identity and aggregate allowance. Actual request fits the reserved bound. Duplicate or resumed actions do not buy again. |
| Slot | One private visual identity maps proposal/version → accepted result/card ID. Same world x/y/width through generation, error and saved delivery; no camera re-placement. |
| ToC | Existing heading tree, descriptions/status/navigation, one scroller and existing composer. No second roadmap list or split pane. Progress stays its existing tab. |
| Delivery | Persist exact card ID and placement before acknowledging; a save/reload/ack problem never requires another author call. Next offer follows acknowledged delivery. |
| Error | Keep original slot, truthful short status, existing `ui.jsx` toast/allowed action. Do not recreate removed recovery block/status chip. |
| Privacy | Pending proposals/results/evidence/feedback stay actor-private. Shares/forks contain permitted delivered content and references, not private state. |
| Testing | Real source/plan/generator/money/state modules with external doubles locally; geometry/focus in keyless local browser tests; live model/production evidence labelled separately. |

### 1.4 Local environment and command rules

Use a complete current repository checkout and its lockfiles. Follow root `CLAUDE.md` and package manifests for dependencies. Tests use Node's test runner, including `node:sqlite`; use Node24, as the current verification/browser workflows do. With dependencies installed, commands in this checklist run from repository root unless a task explicitly says `packages/control-plane` or `packages/web`.

Current commands include `node --test <named files>`, `npm --prefix packages/web run build`, and the repository unit entry `bash run.sh test:unit control-plane web`. There is no generic root `npm test` substitute. Prefer the named affected suites; do not repeat every unit/browser suite after each prose or unrelated label change.

Local browser checks use a local app/control plane and deterministic route fixtures with paid/model routes intercepted or denied. Existing command-check harnesses name their prerequisites and session setup. A local browser fixture is **not** a deployed dev clone. A supplied `BASE` alone does not prove the check is keyless; inspect its calls before running it. Never point a destructive seed/reset fixture at production. Production smoke uses an authorized test account and bounded actions.

### 1.5 Retained setup task IDs

| Task | Current executable scope | Evidence |
| --- | --- | --- |
| BASE.01 Reconcile active work | Lead reads current main/active branch heads, existing receipts, real imports/callers and migration allocations; preserves unrelated uncommitted work; assigns exact shared-file writers. Only actual shared-interface cleanup dependencies apply. | Baseline/branch/migration map and affected dependency list. New schema uses `node --test scripts/schema-check.test.mjs`; no blanket P7 receipt or repeated new approval. |
| BASE.02 Shared contracts/capabilities | Lead/State/Tools reuse existing nested `roadmap-contract.js`, `roadmap-policy.js`, `roadmap-tools.js` and web facade; update the scoped ordinary-author policy and enabled capability matrix. Preserve distinct generation/validation/decision/delivery/billing dimensions and measured bounds. | Existing `roadmap-contract.test.js`, `roadmap-policy.test.js`, `roadmap-tools.test.js`, `learn-models.test.js` under control-plane tests; disabled tools refused, actual registry/limits logged. No duplicate unmounted core implementation. |

## 2 Current code, models and ownership

### 2.1 Implementation inventory

| Area | Current main implementation | Remaining boundary |
| --- | --- | --- |
| Feedback/settings/references | R1–R3 modules and migrations 0036/0037/0038 present. | Preserve actual hover/Depth/private references while integrating new slots. |
| Roadmap state and core | Mounted `roadmap/` modules, `RoadmapJobs`, migration0039; prod app config enables core. | Full learner flow not accepted solely from code/config. |
| Ordinary author | `roadmap-card-3`, full bounded document + brief, trusted `repairs:0`, `grounding:false`/`not_run`. | Planner's narrow-scope input, accepted-version selection, automatic provider retry and money bounds still need targeted reconciliation; expanded source-safety coverage is a measured follow-up. |
| Canvas slot | `SlotCard.jsx`, `roadmap-canvas.js`, `placeRoadmapCard` and host wiring now exist, with slot/markup tests. | Extend private reload persistence, measured final-save geometry, slot navigation and exact visual contract; do not rebuild the slot framework. |
| Two-card test | `roadmap-document-context.test.js` uses real state/glue/generator with external doubles and now exercises two saved/acknowledged cards. | This audit did not run it; fixture still uses a different model/budget from production, and DOM/world-position behavior is not covered. |
| Automatic next offer | R6 deterministic metadata composition, migration0040; prod auto flag on. | Correct UI visibility, saved delivery and one-offer behavior need integrated proof. No R11 speculation exists. |
| Proposal edits/reuse | Draft/apply/link backend, inline edit code, migration0041. | `ROADMAP_EDIT_ENABLED` absent in checked prod config. Reuse chooser/menu/Add-to-Chat/drag integration not complete. |
| Long Markdown | Index/summary/retrieval and bounded planning loop, migration0042. | Long flag absent in checked prod config; author for >40k still falls back to passage. Coverage/author context and source selection changes need qualification before enablement. |
| Remaining tools | Standalone Exa/fetch/evidence, PDF extraction, assessment and rich-command engines exist. | Tutor wrappers and R7b/R8–R16 capabilities are not implied by standalone support. |
| Cleanup | P1–P5 removal source/receipts exist; journey archive reads remain. | P6a/backfill/drop/P7 not established complete. Historical cleanup-v0.1 is not a runnable current plan. |

The active application flag source is `packages/web/wrangler.rabbit-hole-prod.jsonc`. Reading only a separate control-plane config would give the wrong activation answer. Migrations present in the repository are not proof they were applied in any remote environment. Allocate new numbers only after inspecting the current tree and remote migration state; do not reuse0036–0042 or blindly follow historical branch reservations.

### 2.2 Current seams instead of obsolete proposed files

| Responsibility | Modify/reuse current implementation |
| --- | --- |
| Source/read/access | `roadmap-source.js`, `roadmap-source-read.js`, `roadmap-source-reader.js`, `roadmap-access.js` under `src/roadmap/`. |
| Plan/version/state | `roadmap-plan.js`, `roadmap-planning.js`, `roadmap-store.js`, `roadmap-lifecycle.js`, `roadmap-routes.js`. |
| Proposal composition/edit | `roadmap-compose.js`, `roadmap-edit.js`, `roadmap-proposal-drafts.js`; no new parallel `roadmap-proposal.js`. |
| Publication/entitlement | `roadmap-contract.js::{canDeliver,resultReadable,entitledRoadmapResult}`, `roadmap-store.js::readEntitledResult`, route/job boundaries; no duplicate `roadmap-publish.js` authority. |
| Work/recovery | `roadmap-events.js`, `roadmap-jobs.js`, `roadmap-run.js`, `roadmap-sweep.js`; `eventStatement` is the current store writer seam. |
| Quotas/paid calls | `roadmap-quota.js`, `roadmap-models.js`, `roadmap-money.js`, `learn-spend.js`, `learn-spend-ledger.js`. |
| Author/checks | `roadmap-generate.js`, `agents/roadmap-card.js`, `learn-artifact.js`, `roadmap-check.js`, `roadmap-safety.js`. |
| Web state | `roadmap-client.js`, `roadmap-controller.js`, `use-roadmap.js`, `roadmap-canvas.js`, `roadmap-contract.js` facade. |
| Web surfaces | `RoadmapInvitation.jsx`, `RoadmapPlan.jsx`, `RoadmapSurfaces.jsx`, `NextStepPill.jsx`, `SlotCard.jsx`; reuse `TableOfContents`, `TocConversation`, canvas card/skeleton renderer. |
| Removed UI | `RoadmapRecovery.jsx`, `RoadmapStatus` and `statusOf` were removed; do not import or restore them from stale tasks. |

Paths in the first eight rows are under `packages/control-plane/src/` unless the nested `roadmap/` convention is stated; web rows are under `packages/web/src/`. The individual tasks give full paths or define a clear local prefix.

### 2.3 Model and tool registry

These are repository configuration facts at the pinned SHA, not proof of live provider availability. Do not replace the model to satisfy a stale fixture or call a future role registered before it exists.

| Role/capability | Current or proposed choice | Use and verification |
| --- | --- | --- |
| `artifact` ordinary text/table | Current `ASK_MODELS.auto` / `claude-opus-5`, max output4,000; existing provider plan/explicit opt-in routing retained. | Price and test the actual outgoing body/model. Current loop fixture's Opus5.5/200-token estimate is not production-envelope proof. |
| `roadmap_subject` | Current `claude-sonnet-5-5`, low,1,000. | Bounded subject identification, platform payer. |
| `roadmap_draft` / `roadmap_revise` | Current `claude-opus-5-5`,12,000. | Accepted instruction/source/scope/Depth and finite plan validation. |
| R6 proposal metadata | Current deterministic composer. | Zero extra model call; do not add one because an older plan said composition model. |
| `roadmap_proposal` | Current Sonnet5.5 low,600. | R5 applied proposal edits, not ordinary R6 automatic metadata. |
| `roadmap_index` | Current Sonnet5.5 low,2,000. | Bounded navigation summaries; not original evidence. |
| Ordinary citation roles | Old Sonnet checker/Opus escalation still registered. | **Not called** for the owner-authorized ordinary Markdown path. Keep historical/other legitimate callers scoped; no needless checker polish in this release. |
| JEV + `roadmap_safety_adjudicate` | Existing JEV screening mechanics; adjudication Opus5.5,1,500. | Separate safety decision, explicit unknown, finite deadline and enforcement. No grading from safety. |
| `tutor_rubric` / `tutor_visual` | Current Opus5.5,4,000. | Retained assessments. Visual assessment is not an OCR source reader. |
| Rich `/explain` | Current `explain_brief/author/review/repair`, Opus5.5 with existing individual limits. | Existing interactive engine; ordinary adapter correction must not rewrite it. |
| Research/adaptation/vision | `roadmap_research`, `roadmap_adapt`, `roadmap_vision_extract` are proposed future roles. | Register only at the owning rung, with bounded input/output, actual requested/served model and focused eval. |
| Calculator | Deterministic restricted parser/evaluator, no model. | Finite grammar/limits and computational provenance, zero provider call. |
| Image/Motion/Whiteboard/CAD/3D | Reuse each current engine configuration and override logging. | No blanket model replacement. Image provider IDs, CAD Sonnet, Motion/Whiteboard roles and TTS are owned by their existing engines. |

### 2.4 Parallel work and integration ownership

Use the smallest number of lanes that keeps independent work active. For the correction: backend source/state/money, canvas lifecycle/keyboard, and ToC/settings/navigation; lead owns shared wiring and final integration. Start an independent verifier on the committed candidate. Backend money and request construction must share one exact interface before parallel edits, not independently invent quote semantics.

Lead owns route mounts, shared model/usage registry changes, migrations/configuration/check-map and `LearnPage.jsx` integration. Other lanes send concrete patches for those files. Each lane has its own branch/worktree and named file ownership. Reuse a completed branch only after comparing it with current main; never resurrect old UI or grounding instructions in a rebase.

The core does not wait for R5/R7/R8/R9 or P6b. They may be prepared independently and remain disabled until their selected supported flow is ready. One lead freezes the production candidate and release order; avoid competing restacks of the same source tree. Report action-level results and exact remaining blockers, not speculative clock-time promises.

## 3 Correct the remaining source, author and accounting gaps


**Priority:** finish this small R4/R6 correction before more Tutor rungs. **Audited main:** `72d6536657af269bb894511220975fd2254246ed`; backend changes through `fe2bf0f` are unchanged in the subsequent three canvas-slot commits. This is an implementation checklist, not a claim that the documentation task changed or deployed the app. Paths beginning `src/` or `test/` below are relative to `packages/control-plane/`.

**Owner contract:** plan from the Markdown, then write each accepted ordinary explanation/table from the same whole bounded document plus its accepted step. Full Content versus a visible section chooses **what to teach**, not which parts of that document the backend may understand. `teachingScope`, `contextCoverage`, the highlight `sourceRef`/passage, and canvas placement have different purposes. A complete pinned Markdown document at most 40,000 characters is full context; the 8,000-character step range is an anchor limit, not a knowledge limit. Over-bound sources keep their separately qualified R7 outline/evidence workflow and honest limits.

One accepted ordinary slot permits one content-author dispatch, zero repairs, zero automatic author redispatch, and no LLM citation/support reviewer or escalation as a publication blocker. Keep source access/revision, deterministic schemas, safety, atomic money/idempotency, reconciliation, reload and saved-board acknowledgement. Other formats' existing validators and safety behavior remain unchanged. Keep prices hidden. No new rung, UI redesign, general hardening framework, grounding-checker polishing, HTML prototype or R7 redesign is a dependency.

### CORE.01 Preserve the correction already implemented

**Owner:** Lead with Tools. **Depends:** none. **Models:** no new role. **Status:** implemented in source; execution/release evidence is separate.

- [x] `roadmap-run.js::generateOne` reads the authorized document and supplies `documentText`, `claimsToCover` and roadmap `outcome`; the step slice remains a separate `passageText` anchor.
- [x] `roadmap-generate.js::generateRoadmapCard` passes the intact document when its length is within `ROADMAP_LIMITS.source.chars`, with a structured step title/goal/claims/outcome brief. It uses the existing long-source passage fallback above that bound rather than truncating a prefix.
- [x] `agents/roadmap-card.js`, now `ROADMAP_CARD_VERSION = 'roadmap-card-3'`, instructs the writer to use the whole document and treat document/step text as data. It allows paraphrase and clearly identified examples without invented quotations or claimed execution.
- [x] `learn-artifact.js::generateArtifact` now accepts the trusted third-argument option `repairs = ARTIFACT_REPAIRS`. The roadmap supplies `repairs: 0`. Do not introduce a competing `maxRepairs` option or change public `artifactFetch` limits (8,000 context characters; 20,000 raw request characters).
- [x] `roadmap-run.js::finish` passes `grounding: false` to `checkRoadmapCard`. The check records `{validation: 'not_run', reason: 'owner_mvp_policy', calls: 0, ...}` and permits aggregate `passed` only when retained safety is publishable. Source revision mismatch still blocks. Do not fake grounding success, add `not_run` to the aggregate SQL enum, or rewrite entitlements that already use aggregate validation.
- [x] `test/roadmap-document-context.test.js` now exercises the real routes/store/generator with local external doubles: >8k intact document in the actual author request, a separately named tiny anchor, claims/outcome, duplicate acceptance, and first and second cards saved and acknowledged. Keep this test; extend only the missing cases below.

**Receipt:** link the implemented commits `a1e4094bd94ed213dbed2de679849cfe71cde3fd` and `fe2bf0f79c6a355a36c9b958bd82933a966620fc`, and record which assertions were actually run on the candidate. Checked boxes mean source implementation exists, not production activation.

### CORE.02 Give selected-scope planning the whole bounded document

**Owner:** Tools. **Depends:** CORE.01 contract. **Models:** existing `roadmap_draft`/`roadmap_revise`; no new call. **Exact targets:** `src/roadmap/roadmap-source.js::readRoadmapSource`, `roadmap-source-read.js::makeReadSource`, `roadmap-planning.js::planningHandler`, `roadmap-plan.js::plan`; planner prompt/validator only where the separate fields require it. Retain `roadmap-source-reader.js::readMarkdownForActor`, `roadmap-access.js::revalidateSourceAsJob` and `roadmap-source-refs.js::mintStepRefs`.

| Interface | Current at audited main | Remaining change |
| --- | --- | --- |
| `readRoadmapSource(env,access,{ref,scope},deps)` | A passage scope returns only `text.slice(start,end)` and fingerprints that selected range. | Preserve existing scoped/R7 callers. **NEW optional helper** `readBoundedRoadmapContext(env,access,{ref,teachingScope},deps) → {status,source,teachingScope,contextCoverage,contextFingerprint}` or equivalent local reuse returns full pinned text and separate scope/coverage. Do not redefine a stored scope fingerprint as a whole-context fingerprint. |
| `planningHandler(env,event,ctx,deps)` | Selects the passage reader for passage scope, then passes `{instruction,depth,source,language}`. | For documents ≤40,000 characters, pass full `source` and explicit `scope: teachingScope`. Preserve the stored selection fingerprint check independently. |
| `draftRoadmap(input,deps)` / `reviseRoadmap(input,deps)` | Already support `input.scope`; `plan` defaults to `source.coverage` when omitted. | Reuse the existing seam. `source.coverage` describes the complete supplied document; `input.scope` describes the absolute range to teach. No new planner API/model is necessary. |

- [ ] Keep the existing authorized revision/complete-read checks; require the **whole** document to fit before claiming full context. For the same bounded document, whole and visible-section choices must send identical source text and different teaching ranges. Resolve selections at the pinned revision with absolute UTF-16 offsets.
- [ ] Keep the step locator small and independent of context and canvas placement. A reference must still identify the authorized source/revision; it need not contain every fact in the card. Do not enlarge highlights or remove source access checks to obtain full context.
- [ ] Preserve current R7 behavior above 40,000 characters. A short section inside a larger document does not establish that the whole larger document was supplied. No unbounded-context promise and no silent prefix.
- [ ] Extend `test/roadmap-source.test.js`, `roadmap-planning.test.js` and `roadmap-plan.test.js` using the existing >8k fixture shape, a selected section and a fact outside that section. Assert the actual draft/revise request contains the entire bounded document, explicit teaching scope and original instruction. Retain source-version/access/incomplete and long-source tests.

**Receipt:** synthetic planner request assertions for both choices, context coverage versus teaching scope, source revision, and nonzero focused test counts.

### CORE.03 Bind the writer to its own accepted plan step

**Owner:** Tools with State. **Depends:** CORE.01; independent of CORE.02's planner wiring. **Model:** retained artifact role, default `claude-opus-5`, maximum 4,000 output tokens. **Exact targets:** `src/roadmap/roadmap-run.js::generateOne` and `test/roadmap-document-context.test.js` or existing `roadmap-loop.test.js` fixtures.

**Current API stays:** `generateRoadmapCard(env,access,{authorizationId,resultId,resultVersion},deps)` with server-loaded `{cardId,stepId,proposalId,proposalVersion,format,stepTitle,stepGoal,passageText,documentText,claimsToCover,outcome,sourceRef,language,depth,retry}`. Full-context assembly and `repairs: 0` already exist.

- [ ] Replace the plan lookup by `current.accepted_plan_version` with the accepted result's normalized `step.plan_version`; select `plan.steps[step.position - 1]`. Read and validate that row's `plan_json`, accepted status and position/normalized step binding. Missing or inconsistent stored plan data must fail before author dispatch, not silently become empty claims/outcome. Use existing `plan_json`/`plan_hash`; no reconstruction model or duplicate plan table.
- [ ] Add a fixture with distinguishable plan versions and repeated positions, verifying the writer uses its own accepted step's claims and roadmap outcome. Current public instruction revision refuses active-plan changes, so the wrong-version lookup is a binding defect rather than evidence that normal users can already reaccept an active plan.
- [ ] Carry the accepted learner brief into the writer: from the step's own plan row read `instruction_version`, then load `learn_roadmap_instructions` in version order through that version (v1 original plus accepted revision/answer `{version,text,origin}` entries; exclude later unaccepted versions). Extend the server-loaded record with **NEW** `learnerInstruction:{original,revisions}`, `instructionVersion` and `teachingScope`; use the accepted scope/Depth/language snapshot recorded by CORE.05, not mutable `current.depth`. Include that brief/scope in `roadmap-generate.js`'s actual context and frozen Depth/language in `roadmapCardSuffix`, with the same fields in the quote/request fingerprint. No new instruction store or model call is needed.
- [ ] Extend the actual-body test with an original instruction, two accepted revisions, narrow teaching scope and full >8k document; after acceptance add a later unaccepted instruction and change live Depth. Assert the single request contains only accepted history, complete document, chosen scope and frozen Depth, and matches the quote. Current plan rows contain `instruction_version` but do not snapshot scope/Depth; the step-accepted event currently carries only proposal/authorization IDs, so that snapshot is explicitly NEW work in CORE.05.
- [ ] Keep the existing first/second-card test and assert each request carries its own step goal/claims, the same complete document, and the correct accepted plan version/position in the quote/call binding from CORE.05. Do not claim the existing whole-source test proves selected-section planning or all plan-version cases.

**Receipt:** selected plan version/hash, step position, the corresponding synthetic request assertions and a zero-dispatch invalid-binding case.

### CORE.04 Finish one-author behavior across failures and replay

**Owner:** State/Money with Tools. **Depends:** CORE.01 and CORE.03. **Models:** one content-author dispatch; safety calls remain separate. **Exact targets:** `src/roadmap/roadmap-generate.js::generateRoadmapCard`, `roadmap-run.js::generateOne`, `roadmap-money.js::failureWillRetry`, `roadmap-store.js::failCard`, and only the relevant ordinary-roadmap policy values/consumers.

- [ ] Close the concrete remaining retry path: `generateOne` still loops on `failCard(...).body.retry`; policy still permits one automatic transient retry. `generateArtifact` throws on non-OK responses, malformed JSON and zero/multiple tool calls, and the adapter maps most throws to transient failure. A known failed first author response must terminate/refund the ordinary slot with no second author call. Preserve explicit user Retry as a separately accepted proposal/authorization.
- [ ] Enforce a one-call adapter guard, not its current `generationPerCard = 2` guard. Retain the existing `repairs: 0`. Update the stale test that deliberately injects three calls and currently expects two admissions before refusal. Keep default repair behavior for typed commands and other formats untouched.
- [ ] Apply the ordinary no-automatic-retry decision in State's failure result as well as the caller, so reload cannot turn the same failed slot back into a new purchase. Minimal proposed signature: `failCard(db,access,{roadmapId,resultId,failureClass,retryNo=null,now,allowAutomaticRetry=true})`, where **NEW trusted option** `allowAutomaticRetry` gates the existing `failureWillRetry` result and this ordinary caller supplies `false`. Preserve other callers' default behavior; do not build a new retry framework or expose the option in a request body.
- [ ] Retain existing durable operation identity and admitted/dispatched/unknown/reconciling no-blind-send checks. Unknown outcome stays unknown until reconciled; do not relabel provider cost as zero or resend. Known pre-dispatch unavailability with zero author calls may still defer. Handler replay must not create a fresh author operation after an author call already settled.
- [ ] Extend `test/roadmap-generate.test.js`, `roadmap-money.test.js`, `roadmap-recovery.test.js` and the loop tests: successful output, schema invalid output, zero/multiple tools, malformed response, known 529, unknown transport outcome, duplicate event/accept, and explicit Retry. Assert one author dispatch at most per authorization, no readable failed card, one refund, preserved provider expense and no duplicate debit. Keep platform planning/safety retry tests unchanged where their policy still applies.

**Transport boundary:** the inspected default author path is `planModel → anthropic → anthropicTransport`, whose non-streaming branch makes one `send`; it has no local author HTTP retry loop to remove. JEV's separate 429/529 retry and contextual safety retry/adjudication are retained. “No automatic author redispatch” does not mean disabling those safety operations or pretending a remote provider's internal execution is observable.

**Receipt:** actual author operation count, failure/replay/explicit-Retry states and ledger deltas. The existing successful one-call test alone does not establish this failure contract.

### CORE.05 Quote the actual full author request before accepting the slot

**Owner:** State/Money with Tools. **Depends:** CORE.03–CORE.04; CORE.02 does not require a new quote format. **Models:** resolve the same provider/model that will dispatch; quotation itself makes zero model calls. **Exact targets:** `src/learn-artifact.js` first-request construction, `src/roadmap/roadmap-generate.js`, `roadmap-routes.js` acceptance/retry wiring, `roadmap-store.js::acceptRoadmapStep`, `roadmap-lifecycle.js::retryStep`, `roadmap-money.js::admitStepAuthorization/planCall`; reuse `learn-spend.js::requestSpendBound` and `learn-spend-ledger.js::consumeStepAllocation`.

**Current mismatch:** acceptance supplies no `callMicros`. `cardEnvelopeMicros` uses a provisional 125,000 micro-USD call bound × two calls × two attempts = 500,000 per card. Its comment still assumes an 8k context. Actual transport computes a bound from serialized system/tools/messages, UTF-8 bytes and max output. The fixed envelope is not proof of full-request quotation, even when a particular request fits it.

| Interface | Existing | Proposed narrow seam, explicitly NEW |
| --- | --- | --- |
| First artifact request | Built inside `generateArtifact`; `only`, `systemSuffix`, `repairs` are already trusted options. | **NEW** `prepareArtifactAuthorRequest(env,input,{only,systemSuffix}) → {body,model}` or equivalent extraction of the exact current first-request builder. Both quotation and initial generation use it. Other generators' default repairs and validators stay intact. |
| Server quotation | No real-body roadmap quote. | **NEW** `quoteRoadmapCard(env,access,candidate) → {boundMicros,requestFingerprint,contentFingerprint,provider,model}`. Candidate comes from the pending proposal, its own accepted plan step and authorized pinned document. Resolve actual routing through the same selection logic as `planModel`; do not duplicate a stale price/model table. |
| `admitStepAuthorization(env,access,{...,callMicros,...})` | Multiplies the legacy per-call estimate into a four-call envelope; content fingerprint is only proposal hash. | **NEW trusted fields** `cardBoundMicros` and `contentFingerprint`, passed by the quote path; ordinary one-call allocation uses that exact bound. Retain legacy behavior only for callers still using it. Reject unpriced/mismatched requests before dispatch. |
| `planCall(db,access,{...,provider,model,requestFingerprint,...})` | Fields already exist; author caller omits provider/request fingerprint. | Populate the existing fields from the actual accepted request; no new call table is required. |

- [ ] Hash the actual full outgoing author body, including system suffix, tools, whole Markdown, anchor, step brief, language/Depth and output cap. Bind the quote to source key/revision, actual context coverage, accepted `step.plan_version`/position and plan hash, accepted proposal version/content hash, and actual provider/model. Use existing server-owned authorization/event fields for the minimal IDs/hashes/settings needed to rebuild the accepted input. Do not put raw private source in public views or analytics; do not mandate a schema migration if existing fields suffice.
- [ ] Recheck source access/revision before dispatch and require rebuilt request identity/bound to match acceptance. Freeze the accepted effective settings or reject a changed input before spending; never silently increase the hold, send an unquoted prompt or take extra balance. Ordinary title/goal/claims/outcome assembly remains the already implemented path.
- [ ] Keep the whole-step hold, per-card allocation transfer, actual cost settlement and unused-hold release atomic. One-call quotation does not bypass payer derivation, allowance or idempotency. Duplicate acceptance returns its existing receipt without recomputing a new purchase/hold; preserve current authorization checks.
- [ ] Correct `test/roadmap-loop-fixture.js::provider`: it now captures bodies but still ignores its `model` argument and calls `spendTransport(..., MODEL, ...)`, where `test/roadmap-fixture.js` pins Opus 5.5. Its generic `NEED` uses a synthetic 200-token request. Keep generic ledger tests, but make author-path quotation tests use the actual requested provider/model and captured 4,000-token body; synthetic responses must report the matching served model.
- [ ] Add a stable local-only full-request fixture in `test/roadmap-money.test.js`/`roadmap-store.test.js` or the document-context harness: >8k Markdown with multibyte text and a tail fact; exact quote/dispatch body hash and bound equality; exactly sufficient allowance versus one micro less; no call/hold on refusal; one hold-to-call transfer; duplicate accepts; terminal failure refund and unchanged provider expense. Use scripted responses and the real spend helper, with no paid calls.

**Receipt:** synthetic actual-body hash, accepted source/plan/proposal binding, resolved provider/model, output cap, quoted versus admitted micro-USD, hold/transfer/settlement/refund rows and duplicate-accept result. Prices stay hidden in Tutor UI.

### CORE.06 Preserve the applicable safety/publication boundary

**Owner:** Tools with State. **Depends:** CORE.01 and the accepted-input binding in CORE.03. **Models:** existing JEV safety and eligible bounded `roadmap_safety_adjudicate`; zero ordinary grounding roles. **Exact targets:** `src/roadmap/roadmap-run.js::finish`, `roadmap-check.js::checkRoadmapCard`, existing safety/policy tests. Modify only where a concrete changed-path test fails.

- [ ] Keep the already implemented `grounding: false` and nested `not_run/calls:0` record. Aggregate `passed` means the retained applicable checks passed. The current local reference scan uses only revision mismatch when grounding is off; quote mismatch no longer gates the card. Historical held/refunded results remain historical, not automatically newly entitled.
- [ ] Preserve current learner/source/output role separation, output schema validation, source access/revision and contextual safety before publication. Feed the accepted learner instruction/revisions from CORE.03 to the existing learner-intent screen; do not mistake quoted document text for learner intent. Keep output allow/restrain/unknown/block/personal-risk handling, bounded resolution and correct entitlement/refund behavior.
- [ ] Add focused regression cases to `test/roadmap-withheld.test.js`, `roadmap-safety.test.js` and `roadmap-contract.test.js`: ordinary paraphrase/illustrative examples with zero citation transport calls; educational or quoted sensitive content treated by its actual role; unknown safety not falsely marked prohibited/passed; blocked/withheld body unreadable; source-revision mismatch and terminal refund remain correct. A throwing/counting grounding transport must never be called by this ordinary path.
- [ ] Record actual safety coverage. Current `finish` screens the highlighted source passage, original learner input and generated output; it does not screen the whole newly supplied document. Do not claim full-document safety coverage. Expanding source screening is a separately labelled follow-up in OWNER-INBOX, not a silent new publication gate or prerequisite for the core repair. Its design must measure false refusals for unrelated/educational source content and account for sequential24k chunks, repeat screening and adjudication deadlines before enablement.
- [ ] Do not add a replacement quality/citation reviewer, change global safety categories, truncate output checks, or redesign other engines in this sprint. Existing source/access/schema/entitlement/privacy regressions stay required for the enabled path.

**Receipt:** actual screened roles/coverage and applicable decision, grounding `not_run/calls:0`, aggregate validation/deliverability, nonzero tests and explicitly deferred expanded-coverage work. A generated server result is not yet a board-saved/acknowledged card.

### CORE.07 Verify the integrated first-and-second-card flow

**Owner:** Verifier with UI and State/Money. **Depends:** only CORE.02–CORE.06's actual changed interfaces. **Models:** local doubles for these deterministic tests. Keep the new `test/roadmap-document-context.test.js` as the primary two-card regression.

- [ ] Run its existing three tests on the candidate: actual >8k body/anchor/brief, honest no-grounding record, and two saved/acknowledged settled cards with duplicate-accept protection. It currently uses two explanations and manually proposes step two; it does not alone prove table delivery, selected-section planner context, R6 automatic successor, retained safety behavior or quote equality.
- [ ] Add only the missing integrated cases: one table through the same author/publication path, selected teaching scope with full document, and the existing R6 `card_delivered` auto-offer enabled. Before accepting step two, assert the offer is metadata only with no author call, authorization or debit. Preserve manual Next, Cancel/End and Ask/Auto-suggest controls.
- [ ] Retain `roadmap-controller.test.mjs`/`roadmap-client.test.mjs` save-before-ack and reload/idempotency checks. Verify the first and second minted card IDs separately; results created in the same second have no stable array order. A failed board save sends no ack; a lost ack retries delivery/ack of the same saved card without regeneration or new debit. Use the existing error toast/Retry control; the latest UI commit removed the separate recovery strip.
- [ ] Update superseded policy/test assertions and relevant `scripts/ci/check-map.json` mappings, without broad unrelated cleanup. Do not rewrite platform planner/safety retry tests to match the author policy. Record any remaining baseline failure separately.

**Exact offline commands from repository root, to run during implementation (not executed by this Markdown audit):**

```bash
node --test packages/control-plane/test/roadmap-source.test.js packages/control-plane/test/roadmap-source-reader.test.js packages/control-plane/test/roadmap-source-version.test.js packages/control-plane/test/roadmap-plan.test.js packages/control-plane/test/roadmap-planning.test.js packages/control-plane/test/roadmap-long.test.js
node --test packages/control-plane/test/roadmap-generate.test.js packages/control-plane/test/learn-artifact.test.js packages/control-plane/test/roadmap-policy.test.js packages/control-plane/test/roadmap-safety.test.js packages/control-plane/test/roadmap-withheld.test.js packages/control-plane/test/roadmap-contract.test.js
node --test packages/control-plane/test/roadmap-money.test.js packages/control-plane/test/roadmap-store.test.js packages/control-plane/test/roadmap-recovery.test.js packages/control-plane/test/roadmap-glue.test.js packages/control-plane/test/roadmap-events.test.js packages/control-plane/test/roadmap-loop.test.js packages/control-plane/test/roadmap-document-context.test.js packages/control-plane/test/roadmap-auto-proposal.test.js packages/control-plane/test/roadmap-auto-events.test.js
node --test packages/web/src/roadmap-controller.test.mjs packages/web/src/roadmap-client.test.mjs packages/web/src/roadmap-auto.test.mjs packages/web/src/roadmap-integration-wiring.test.mjs packages/web/src/learn-slash.test.mjs
node --test scripts/ci/check-map.test.mjs
bash run.sh test:unit control-plane web
npm run build --workspace=web
```

Run focused changed tests while iterating, then the required affected tests and build once integrated. The broad `bash run.sh test:unit control-plane web` command is available if the actual change warrants both complete packages; it is not an unconditional extra gate. Root `package.json` has no `npm test` script; `npm test --workspace=web` invokes Playwright, not the offline unit suite. The repository runner guards against a zero-test pass. Run `node --test scripts/schema-check.test.mjs` only if an actual additive migration is chosen. Do not rerun passing suites without a changed dependency or unresolved failure.

**Completion receipt:** candidate SHA; exact commands/nonzero counts; fixture/source revision; plan version/hash and step positions; author request fingerprints/provider/model; author and grounding role counts; bound/hold/transfer/charge/refund evidence; safety coverage/verdict; generated, board-saved and acknowledged milestones for both cards. Separate source implementation, deterministic test execution, approved browser/real-provider evidence, deployment and production activation. No proof tier substitutes for another.

### CORE.08 Replace contradictory HOW requirements and release the small correction

**Owner:** Lead. **Depends:** integrated CORE.02–CORE.07 candidate. **Models:** none.

- [ ] Replace stale R4.09 ordinary grounding/citation gates and automatic author repair/retry language in R4/R6 contracts and receipts. Carry the exception into R5 edits/reuse, later speculative preparation and commands so a generic “all checks” rule does not restore this ordinary reviewer. Other formats retain their explicit validators/safety. Do not require a new policy framework, unrelated checker polish, or speculative capability before this fix.
- [ ] Replace the old `9b798f7`/“all R4 proposed” baseline with the actual source status. Some code comments still say “unmounted”; actual callers are mounted. Preserve source/plan versions, hidden prices, proposal controls and the latest existing-toast recovery pattern.
- [ ] Use the owner's direct main/production MVP direction: no clone/preview wait. Broad CI/gate/preview may be bypassed only as explicitly recorded; build, affected tests, focused smoke, exact candidate/build, preflight, recovery and rollback remain concrete evidence. Do not label skipped work passed.
- [ ] Resolve the separate release-tool mismatch below if still present in the candidate. Do not claim that prose bypasses a tool predicate or that this Markdown task deployed anything.

**Receipt:** final small diff and dependencies, verification results, release-tool compatibility, actual release/deployment/activation evidence when executed, and precise unverified items. No fresh product question or routine permission cycle is required for already decided scope.

## 4 Implement the exact existing-UI integration

**Current source baseline: `72d6536657af269bb894511220975fd2254246ed`.** Compare `fe2bf0f` → `72d6536`: `b9b2dcf` adds the Tutor canvas slot and `LearnPage` host wiring; `3de7e0a` corrects privacy, offer gating, duplicate skeletons and the 4px pill check; `72d6536` hides proposal words while that offer is still being checked. These are implemented source changes, not a claim of deployed or browser-accepted behavior. Do not rebuild their slot framework or reapply the already-applied lead patches.

| Area | Existing at this baseline | Remaining correction / proof |
| --- | --- | --- |
| Canvas lifecycle | `roadmap-canvas.js:canvasCardsOf`, `planSlots`, `liveCards`; `SlotCard.jsx`; `canvas-slots.js:anchoredSlots`; `AdaptiveCanvas` mounts world-positioned Tutor slots outside column flow. | Preserve these implementations. Private geometry is still held only in `roadmapSpots`/`pendingAt` refs, so reload persistence is not implemented. |
| State/privacy | Same step key through pending/result states; no unchecked offer; Ask/flag/editor gate; no stale-view duplicate after a card is placed; thumbnail and area-crop exclusion. | Preserve every guard. Extend tests for version-bound reload, actor/board isolation, held output, exact title/width continuity and accepted work while initiative is paused/ended. |
| Delivery | `LearnPage` calls `placeRoadmapCard`; it uses the slot/map position, inserts the server card ID and computes offsets after measurement without the ordinary reveal path when an anchor exists. | Prove/correct first paint and saved geometry: `pendingAt` applies offsets later, `persist()` reads `boardRef`, and the current save check only establishes card presence/revision. An unanchored fallback still calls `insertAtView`. |
| Slot visuals | 12px frame, 16px Tutor spinner, no Tutor elapsed timer, same-frame error, 8px action gap, 28px/4px neutral pill. | The pill remains left-aligned, white, 12px text/8px padding/6px key gap; the approved centered pale-blue treatment and exact compact values below remain. Format/source text and stable proposal-to-result title need completion. |
| ToC and navigation | Existing `RoadmapToc` still precedes `TableOfContents`; source-based `use-roadmap` indicator/navigation remains. | One existing heading tree; measure/navigate actual slot, keep the composer and Progress tab. |
| Tests | **Existing now:** `roadmap-canvas.test.mjs`, `canvas-slot-card.test.mjs`, updated `roadmap-view.test.mjs` and `roadmap-command-check.mjs`. | Extend these real suites. Do not create the previously proposed parallel `roadmap-visual-slots.js`/test just to follow an older checklist. No tests were run in this documentation audit. |

### 4.1 Concrete visual contract — reference values versus implementation choices

No browser measurement was performed in this documentation pass. **Reference CSS** means a literal value read from the approved HTML; **current code** means a value read at the audited SHA; **owner override** means the latest instruction supersedes the older reference; **chosen default** is the minimal proposed implementation choice, not a claim of approval for unrelated redesign. HTML design files, if requested later, belong in the separate UI folder; this task changes only Markdown.

| Element | Concrete value/placement | Basis and implementation rule |
| --- | --- | --- |
| Right panel | Existing `ResizableSidePanel` width and saved learner preference; no new fixed width | Current code. Reference CSS's 480px is demo width only. |
| ToC layout | One title; one `flex:1; min-height:0; overflow-y:auto` body; existing nonshrinking composer footer | Approved reference layout. Remove competing 50vh/45% outline allocations. |
| ToC title and H1 | 16px/24px, weight 600 | Reference CSS and existing `TableOfContents` text-base hierarchy. |
| H2/H3 title | 14px/20px, weight 500 | Reference CSS and current renderer. Preserve H1/H2/H3 controls. |
| Descriptions | H1 14px/21px; H2/H3 13px/19.5px; 4px title-to-description gap | Reference CSS/current classes. Every Tutor step has its actual description. |
| Tree spacing | 28px between H1 items; nested indent 24px; nested row/top gap 14px; row gap 12px | Reference CSS, matching existing hierarchy spacing. |
| Tree marker/fold | 16px marker with 1.5px border in 24px hit area; fold control 24px; H1/H2/H3 add buttons 28px | Reference CSS/current renderer. Manual checkbox stays separate from delivery state. |
| ToC settings/actions | 12px settings text; 12px settings padding; 1px border; 4px settings corners; plan buttons 32px high with 12px horizontal padding | Reference CSS. Reuse existing component styles/tokens; do not grow another settings panel. |
| ToC Depth slider | Three positions 0–2/step 1; margin-top 10px; label 12px; full-width input height 20px, 3px top margin; labels 10px/14px | Approved reference CSS. Direct range in existing learning parameters; same store as composer DepthMenu. Preserve Arrow/Home/End and normal Tab navigation. |
| ToC composer footer | `flex:0 0 auto`, separator; compact existing entry and actual composer remain | Approved layout; reference CSS is 12px vertical padding/minimum 50px, not a 45% panel reservation. Preserve real component's contents/draft behavior. |
| Proposal/result width and starting height | Explanation 440×330 world px; table 560×610 world px, via `slotSize(format, BLOCK_TYPES)` | **Current Tutor implementation** in `AdaptiveCanvas`; retain it. Reference 364px max-width/255px min-height is a demo size. Prove delivered width/top-left match and content grows down; the existing tests use synthetic 380×420 slots and do not establish actual production dimensions. |
| Card frame | Existing 1px `border-line`, 12px (`rounded-xl`) corners and `shadow-sm` | Current `AdaptiveCanvas.jsx:CanvasNode` and extracted `SlotCard.jsx`; retain the consistent wrapper. Reference card radius 7px is not a command to restyle all existing cards. |
| Initial source spacing | `deliveredSpot(size, sourceBox, obstacles, null)` uses `placeNote`; GAP 40, collision PAD 12, search STEP 28 and reach 60, all world units except the dimensionless reach | **Current live wiring** in `AdaptiveCanvas:roadmapSpot`. A source box tries right/left/bottom/top and outward free spots; this is not a mandatory side or guaranteed final 40px margin. Point fallback uses `placeResult` with REACH 60. Include the attached control in reserved bounds and persist the chosen position. |
| Proposal text | Approved reference title 17px/1.35, weight 600; description target 13px/1.5; source/format label target 11px/16px | Reference title is 17px, description 12.5px, source 10.5px; the latter two targets are the existing chosen readable rounding. **Current SlotCard** title is 14px/20px weight 600; description is 13px/1.5; source/format labels are absent. Complete this existing frame; do not add another card component. Preserve its accepted useful title through result transitions. |
| Accept/Cancel attachment | 8px below frame; horizontally centered as one attached group | Reference CSS + owner instruction. Current `gap-2` supplies the 8px gap, but `self-start` left-aligns it; center the existing group and include it in collision/hit bounds. |
| Accept/Cancel group | 28px high; 1px border; 4px outer radius; content-sized width; 10px horizontal button padding; 8px label/key gap; 1px Cancel divider | Height/gap/padding from reference CSS; 4px is the latest **owner override**. Current `PILL_BOX` already has `h-7 rounded`; retain those. Current `ACTION` uses 8px padding/6px gap/12px text, so adjust only those remaining values. At zoom 1 these are CSS pixels; normal canvas scaling applies. |
| Accept/Cancel typography | 11px, weight 500; pale-blue Accept; neutral Cancel | Reference CSS: Accept fill `#f0f3ff`, label `#4056b0`, hover `#e6ebff`; Cancel label `#626874`, neutral white surface, hover `#f3f4f6`/`#333944`; border `#d1d5dd`, divider `#d8dce5`. These are approved light reference values translated through the current theme tokens below. Current pill uses neutral `bg-white`/`text-ink` for both actions and already has no green/red; add only the specified pale-blue distinction, not a new color direction. |
| Tab key badge | 10px/15px; 17px high; minimum width 26px; 1px token border; square badge | Reference CSS; current badge is rounded with no explicit minimum width/height. Apply these small remaining values. The 4px requirement applies to the action group. |
| Keyboard focus | 2px visible focus outline/ring with 2px separation | **Chosen default** using repository accent/select tokens; retain visible focus in both themes. |
| Generation spinner | 16×16px; status beside title/body; indeterminate unless real progress exists | **Implemented for Tutor** in `SlotCard.jsx`; plain non-Tutor slots retain 14px and their elapsed timer. Preserve no timer/percentage in Tutor. Respect reduced motion without hiding state. |
| Next step ready | Existing bottom-right quiet control, 16px viewport inset and 32px height; neutral surface/border; no auto-navigation | Current `NextStepIndicator` geometry, **chosen retention**. Reference uses 23px inset and ≥32px height only for its demo stage. It is the one viewport control; the slot itself stays in world coordinates. |
| Thumbs | Existing 28×28px buttons; blue selected state; hover/focus-visible reveal only | Current `CardFeedback.jsx`. Do not latch opacity after selection. |

Use the existing CSS variables from `packages/web/src/index.css`; values are documented here to remove ambiguity, not to duplicate hardcoded styles:

| Purpose | Existing token / concrete light → dark value | Proposed use |
| --- | --- | --- |
| Surface | `--color-surface`: `#ffffff` → `#191919` | Card/control background and neutral Cancel. |
| Main text | `--color-ink`: `#37352f` → `#d4d4d4` | Titles and action labels. |
| Secondary text | `--color-ink-2`: `#63615d` → `#a1a1a1` | Descriptions, source/status text and Tab badge. |
| Tertiary text | `--color-ink-3`: `#9b9a97` → `#6f6f6f` | Existing decorative/disabled treatment; do not use as the only accessible status text. |
| Border | `--color-line`: `#e9e9e7` → `#2f2f2f`; `--color-line-strong`: `#d3d1cb` → `#4a4a4a` | Frame/divider and stronger action/badge border. |
| Hover | `--color-hover`: `#efefed` → `#2c2c2c` | Neutral Cancel and existing row/control hover. |
| Accent | `--color-accent`: `#2383e2` in both themes | Blue feedback, active navigation and focus. |
| Pale-blue Accept | **Chosen token derivation:** `color-mix(in srgb, var(--color-accent) 10%, var(--color-surface))`; hover 16% | Neutral `ink` label keeps contrast; do not copy reference `#f0f3ff/#4056b0` into dark mode. |
| Plan primary action | `--color-primary-fill`: `#1b6fc2`; hover `#165ca3` | Preserve existing Accept plan control. It is separate from the compact step acceptance group. |

| Visual state | Same-slot rendering and allowed action | Persistence/transition rule |
| --- | --- | --- |
| Offer still being checked | No proposal words or slot are shown | **Implemented in `canvasCardsOf`**: a proposal must be `pending` and pass the existing pill gate. Do not confuse this with an already accepted result being checked. |
| Proposed/ready | Title, description, source/format, placeholder; attached Accept [Tab] / Cancel | Existing pending slot; finish missing source/format and approved visual details. No result or learner charge is implied. |
| Accept request in flight | Frame stays; Accepting/disabled state; no duplicate action | Retain exact proposal/version and reconcile uncertain response before retry. |
| Accepted/generating | Same frame/title/x/y/width; 16px spinner and server stage | Bind existing `stepId`, `proposalVersion`, result `id` and `slot.cardId`; no viewport re-placement. |
| Accepted result checking/held | Same slot; actual checking/limitation text | Existing slot remains and shows the spinner/Generating today. Add truthful stage text when server state supports it; never reveal withheld body. |
| Authorized body, board not yet saved | Actual body in same slot; truthful pending-save status if needed | No delivery ack or successor until saved card and real board revision are confirmed. |
| Delivered | Actual content replaces placeholder; width/top-left fixed; grow downward; eligible feedback appears | Persist ordinary card geometry using `block.id === slot.cardId`; preserve private step relationship separately. |
| Recoverable error/retry | Short actual status inside original slot; existing `toast(message,{tone:'error',action})` carries authorized Retry | Retry keeps geometry; no automatic new accepted operation from rerender/reload; no recreated `RoadmapRecovery` or `RoadmapStatus`. |
| Cancel confirmed | Remove only cancelled pending slot; retain ToC cancellation/pause | If Accept already won, keep accepted generating slot and render server conflict response. |
| Explicit edit Apply | Same position; deliberate new checked title/version becomes current | Drop stale previews; new version requires its own acceptance. Esc preserves original. |
| Next proposal offscreen | World slot persists; one quiet Next step ready control | Click navigates only; no acceptance, recomposition or camera movement on arrival. |

### 4.2 UI task ownership and implementation

| UI task | File writer / dependencies |
| --- | --- |
| UI.01 Invitation | Chat/ToC lane; existing saved-source/idle contract. Lead integrates LearnPage wiring. |
| UI.02 Unified ToC | Chat/ToC lane; actual plan view/description contract, preserve manual headings. |
| UI.03 Composer/settings | Chat/ToC lane; existing R2 store, CORE.02 teaching scope. |
| UI.04 Persistent slot | Canvas lane; canonical R4 result/card identities and applicable entitlement. |
| UI.05 Tab/actions | Canvas lane with Chat reviewer; UI.04 plus existing shortcut ownership. |
| UI.06 Placement/save | Canvas lane, Lead owns host integration; UI.04 and board save/ack contract. |
| UI.07 Source navigation | Chat/ToC or source-reference lane with Canvas reviewer; retained R3. |
| UI.08 Next/feedback | Canvas + State coordination; UI.04/06, retained R1/R6. |

UI tasks add no model role or paid call. Core metadata, navigation and fixture interactions are free. Coordinate exact named writers before editing shared files; do not run all UI lanes against LearnPage independently.

Reconcile against the current ordinary-explanation path before integrating this small UI slice: `a1e4094`/`fe2bf0f` already pass the fitting whole document plus step brief to one authoring call and record the per-card citation gate as `not_run`, while keeping source revision, schema, safety, billing and idempotency checks. Do not describe this source change as future work or label an intentionally unrun citation check as passed. Reuse the code that already exists. Do not restart R1–R3 or build another Chat/settings/progress surface. Optional animation polish, richer layout presets, mobile redesign and generalized reusable slot infrastructure belong in `OWNER-INBOX.md`, not as prerequisites for this fix.

All commands below run from the repository root in a complete checkout with Node 24 and lockfile dependencies installed; SSR suites require the existing React/esbuild dependencies. Existing test files are identified explicitly. A proposed file/extension must be implemented before its command can pass; it is not evidence of existing coverage. Offline Node assertions and browser geometry/focus checks are separate.

#### UI.01 — preserve the Markdown-to-Chat invitation (R4.04)

**Existing:** `packages/web/src/LearnPage.jsx` tracks `droppedMarkdown`, calls `readyMarkdownSources` after a successful board save and supplies `composerTyping`; `roadmap-client.js` exports `readyMarkdownSources`, `idleGrouper`, `invitationOf`; `roadmap-controller.js` exports `createRoadmapController`, whose `sourceReady`, `idleTick`, `explain` and `dismiss` methods drive the flow. `RoadmapSurfaces.jsx:RoadmapChat` uses `RoadmapInvitation.jsx`. Modify these seams only where the current fix needs them.

- [ ] Keep readiness tied to the saved source ID+revision, not merely the file picker resolving, visible text appearing or the source card entering the viewport. Coalesce ready sources within an idle window; R4 still selects one supported scope.
- [ ] Recheck active board/actor, server invitation eligibility, Auto/Tutor mode, Auto-suggest and unfinished roadmap state. Queue while either Chat/ToC contains a draft or an answer is streaming; include active IME composition even when the draft has not committed characters.
- [ ] Keep the exact two choices, free typing and invitation-scoped dismissal. Reload reads the canonical invitation; explicit teaching requests remain available when automatic invitations are suppressed. Preserve Home's ordinary Chat handoff and the existing independent Next Steps suppression while a roadmap is active.
- [ ] Keep the existing Chat/ToC routing and `/explain` paths outside this invitation flow intact. Do not create an extra middle-of-canvas Chat or make a source display-mode change to trigger planning.

**Offline command — existing suites, extend for empty-draft IME and scope/display independence:**

```sh
node --test packages/web/src/roadmap-client.test.mjs packages/web/src/roadmap-controller.test.mjs packages/web/src/roadmap-integration-wiring.test.mjs
```

Assert zero invitation before stored+saved revision, one grouped report after idle, no interruption during composition/streaming, exact choices, one-invitation dismissal, Ask/Auto-suggest suppression, unchanged source layout and the selected Depth in the create request. Current wiring tests inspect source text and are not browser proof.

#### UI.02 — unify the existing ToC tree (R4.04)

**Existing:** `LearnPage.jsx` currently mounts `RoadmapToc` before `TableOfContents`; `RoadmapSurfaces.jsx:RoadmapToc` owns a `max-h-[50vh]` region; `RoadmapPlan.jsx` renders a separate numbered list. `TableOfContents.jsx` already uses `outlineTree`, H1/H2/H3, `Circle`, descriptions, folding and editing. `learn-outline-model.js` keeps `toc` entries separate from canvas blocks. `TocConversation.jsx` and `chat-workspace.jsx:TocWorkspace` own the existing ToC thread/draft. `roadmap-client.js:tocOf` currently drops each server step's `goal` description. **Proposed new pure adapter/test, only if extraction makes this integration simpler:** `packages/web/src/roadmap-toc.js` and `roadmap-toc.test.mjs`; these do not exist at the audited SHA.

- [ ] Replace the separate roadmap list with actor-private roadmap-backed rows in `TableOfContents`. Keep one Table of contents title, one hierarchy and one outline scroll owner. Move outcome/assumptions/scope/stopping/actions into that same scroll body. Keep the real existing composer below it; remove the conflicting fixed-percentage ToC/conversation allocation for this flow without deleting saved messages or drafts.
- [ ] Give each step a stable relationship to its tree entry and retain its description from validated plan data (`step.goal` exists in the current server view). Keep row identity independent of its display number. Reordering/folding must not create new step IDs or duplicate rows after reload.
- [ ] The current server view is a flat step list, not an implemented nested step contract. Render flat steps as H1 entries in the existing H1/H2/H3-capable tree; preserve existing H2/H3 headings and any verified hierarchy supplied by the plan. Do not invent child steps or imply extra generated work to make the tree look deeper. Any later nested planner schema must name actual parent/level fields and remain a separate contract change.
- [ ] Preserve manual ToC additions, linked headings, descriptions, folding, editing, drag, deletion/undo and saved scroll position. A roadmap material edit routes through checked plan revision and acceptance; do not let a generic outline mutation silently rewrite accepted/delivered work. Ordinary manual ToC edits remain contents-only and do not move/delete canvas objects.
- [ ] Keep actor-private roadmap row bindings in the private projection/sidecar; do not serialize private roadmap IDs or pending titles into the shared board `toc`. Merge permitted plain headings into the one tree, with deterministic identity-based deduplication. Preserve source-supported headings in shared/forked content under the existing access rules.
- [ ] Preserve distinct fields/semantics for manual `done`, current navigation, proposed/generating/delivered/removed state and assessed learning. Delivery does not tick a checkbox. Rows navigate only to an actual proposal slot or present delivered card; an ungenerated row does not accept/generate on title click. Multi-card steps retain independent card identities and an honest route to their surviving cards.
- [ ] Keep Accept plan separate from paid-step acceptance. Edit plan opens/focuses the existing ToC composer. Keep Propose next step, End roadmap, stopping point and clarification reachable on long plans without a second outline scrollbar. Preserve the current existing-toast Retry path; do not restore a recovery block inside the tree. Progress remains its own tab and retains its mounted state.

**Offline commands — existing suites to update, plus the proposed adapter suite if created:**

```sh
node --test packages/web/src/learn-outline-model.test.mjs packages/web/src/ask-toc-view.test.mjs packages/web/src/roadmap-client.test.mjs packages/web/src/roadmap-view.test.mjs
node --test packages/web/src/roadmap-toc.test.mjs
```

Add behavior assertions for one tree/title, H1/H2/H3 ordering, per-step descriptions, same row ID across poll/reload, preserved ordinary headings, no duplicate roadmap row, private binding stripping, manual done unchanged by delivery, no navigation to absent content and material edit requiring a revised acceptance. Replace the old `roadmap-view.test.mjs` assertion that requires the separate sized plan region; passing the old test would preserve the defect. Omit the second command if this logic stays in an existing pure module and put the same assertions there.

#### UI.03 — retain composer controls and make scope independent of display (R2.03)

**Existing:** `ModeSelector.jsx` mounts `AutoSuggestSwitch` from `use-learn-coaching.jsx` and `DepthMenu.jsx`; `learn-settings.js` supplies `DEPTHS`, `createSettingsSync`, `autoSuggestShown` and `depthField`; `chat-workspace.jsx` shares settings. `card-layout.js:fullContent`/`switchCardLayout` control card display and are unrelated to roadmap evidence scope. Modify these existing modules; do not create the obsolete planned `DepthControl.jsx`.

- [ ] Retain Auto/Ask/Tutor and the existing command/microphone/send arrangement. The Depth menu has only Overview/Standard/Deep; the Auto-suggest switch remains adjacent to the mode selector, shown in Auto/Tutor and hidden in Ask. Keep useful keyboard labels, focus return and error/retry copy.
- [ ] Implement the owner-requested direct three-position Depth slider in the existing ToC learning-parameters container, with Overview/Standard/Deep labels and no intermediate button/popover. Reuse `DEPTHS`, existing settings setters and current range-control styling; the composer keeps its working `DepthMenu` shell in this core correction. A small extracted presentation helper is permitted if needed, not a second settings store. Slider reference layout: margin-top10px, 12px heading label, input height20px with3px top margin, Overview/Standard/Deep labels10px/14px; use full available container width and three discrete values0–2/step1. Keep existing accent/surface/border/focus tokens; any larger hit wrapper must preserve that visible layout. Arrow keys/Home/End select the three positions; Tab remains navigation and never accepts a step from this control. Assert the slider is directly present in the ToC and writes the same pending-plan setting as the composer.
- [ ] Read one persisted Depth per learner+canvas and one Auto-suggest preference per learner. Any ToC setting reads/writes that same source, not component-local shadow state. Preserve cross-tab updates, other-learner isolation and saved-versus-this-tab-only status.
- [ ] Capture Depth at submit and freeze accepted request settings through CORE.03/05. Current `roadmap-planning.js::revisePlan` rejects scope changes, refuses active-plan instruction edits and applies Depth directly to an active plan. That does **not** implement accepted-plan revision/reacceptance. R10.04 owns the full active revision flow. Until it is ready, expose only supported draft-plan edits; keep active roadmap scope/outcome/Depth controls read-only rather than falsely promising revision. Ordinary Chat's preference can still change for Chat/future plans, but the accepted roadmap displays its frozen accepted setting, not a second mutable preference. Add the narrow server guard needed to prevent Depth-only revision silently changing an active accepted plan/ceiling; test `roadmap-planning.test.js` and controller behavior. This guard is part of preserving the accepted contract, not a request to implement all R10 now. Turning Auto-suggest on never clears a Cancel pause.
- [ ] Do not claim a currently unavailable initiative feature through an inert toggle. Reconcile `SUGGESTION_CAPABILITIES` with actually enabled integrations; the existing constant alone is not deployment evidence.
- [ ] Scope handlers must not call `switchCardLayout`, force Full content, alter source outer dimensions, expand a collapsed source or continually recapture the viewport. Confirm visible-section offsets/revision are frozen and whole scope reads supported source content regardless of display.

**Offline command — all existing suites, extend with scope/layout isolation:**

```sh
node --test packages/web/src/learn-settings.test.mjs packages/web/src/learn-coaching-controls.test.mjs packages/web/src/card-layout.test.mjs packages/web/src/roadmap-controller.test.mjs
```

Assert mode visibility, one preference writer, global Auto-suggest versus canvas Depth, cross-learner rejection, reload, stale response handling, preserved cancellation pause, immutable submitted Depth and unchanged `cardLayout`/source bounds when scope changes. These checks verify request/state wiring, not the quality of model output.

#### UI.04 — finish the existing persistent visual slot (R4.10)

**Reuse current code:** `SlotCard.jsx:SlotCard`; `NextStepPill.jsx:StepPill`/`PILL_BOX`; `roadmap-canvas.js:canvasCardsOf`, `planSlots`, `slotIdOf`, `liveCards`; `canvas-slots.js:anchoredSlots`; `AdaptiveCanvas.jsx:roadmapSpot`, `placeRoadmapCard`, `roadmapSpots`, `pendingAt`; `LearnPage.jsx:roadmapCanvas`/`canvasHosts`; `RoadmapSurfaces.jsx:RoadmapCanvas`; `ui.jsx:toast`/`Toasts`. `SlotCard` is now an extracted existing component, not a proposed extraction. `RoadmapStatus`, `statusOf` and `RoadmapRecovery.jsx` remain removed.

- [ ] Preserve the current `roadmap:<stepId>` visual key and pending → accepting → generating/checking → failure/delivery transitions. Bind version/authorization separately: actual wire fields are `proposal.id`, `proposal.stepId`, `proposal.version`; results have `id`, `stepId`, `proposalVersion`, `slot.index`, `slot.cardId`; generated `block.id = rec.cardId` and `block.stepId = rec.stepId`. Do not rename browser fields to SQL snake_case or create a second slot identity system. One-card R4 is the current implementation; keep independent `slot.index`/card identities when future multi-card formats ship.
- [ ] Extend the existing geometry state with a small versioned browser persistence adapter, tested in `roadmap-canvas.test.mjs`. `roadmapSpots` and `pendingAt` are only `useRef(new Map())` today. Persist only world x/y, width, initial height, source/anchor identity and immutable version bindings, keyed by authenticated learner+board+roadmap+step/proposal identity. `GET /api/learn/user-settings?app=&board=` already returns the opaque org/user-bound `learner`; expose it through the existing settings/host snapshot rather than adding an API or migration for this fix. Do not cache source/body/answer text or treat local state as authorization.
- [ ] Restore only after canonical authenticated status; validate finite/bounded geometry and matching versions, isolate account/board changes, and clear stale unaccepted versions. Same-browser reload restores pending, accepted, held, failed and delivery-pending positions without accepting/regenerating. Another device without the cache chooses source-relative geometry once; saved delivered-card geometry remains authoritative. Cross-device pre-delivery geometry sync is an `OWNER-INBOX.md` follow-up. Storage failure must be reported truthfully and must not trigger new work.
- [ ] Retain the implemented card frame, placeholder, 8px action gap, 28px group, 4px corners, 16px Tutor spinner, no elapsed timer and in-frame error. Finish the table's centered pale-blue Accept / neutral Cancel values, source/format label, and accessible focus/disabled/busy states in these same components. The new tests have already removed green/red/zero-radius expectations; extend them instead of restoring old assertions.
- [ ] Keep one useful accepted title and exact frame top-left/width through state updates. `canvasCardsOf` currently uses proposal title/format while pending and step title/format for results; test an applied proposal edit that differs from the plan and prevent a silent title/width switch at acceptance. Do not expose unchecked offer words or withheld result body. An unknown duration uses the existing indeterminate spinner; a checking/held state uses actual server status, not fake percent/countdown.
- [ ] Complete same-slot editing: today `canvasCardsOf` removes the pending slot while editing and `RoadmapCanvas` falls back to `ProposalOverlay`. Reuse `ProposalTools`/the current editor at the existing world slot, keep that frame/geometry visible and avoid switching to a fixed-screen proposal. Preserve the old overlay only for separately supported cases outside this corrected ordinary flow; do not add another overlay/widget or leave a measured-source fallback as the final solution.
- [ ] Preserve failure inside the existing `SlotCard` plus the existing toast. `RoadmapCanvas` already calls `toast(item.message,{tone:'error',action:{label:STRINGS.retry,run:()=>c.recover(item.stepId,'retry')}})` only when Retry is server-permitted. Its `told` Set deduplicates per result per mount, not across reload. Reconcile a delayed toast action with the current actor/board/step; Retry reuses the slot. No recreated recovery panel, status chip or new button strip.
- [ ] **NEW routing work, not a new UI:** bind explicit Replace/Omit requests in the existing Chat/ToC conversation to current `controller.recover` guarded actions. Current `recoveryOf` exposes those actions, but unused `onRecover` props do not establish a conversation binding. Test permitted action mapping, ambiguity/confirmation where the learner's intent is unclear, stale/cross-board rejection, and a replacement's own checked proposal/acceptance. Do not auto-retry or invent a refund sentence.
- [ ] Preserve `liveCards` stale-poll suppression, `data-thumbnail-hide`, area-crop exclusion and absence from shared board/undo state. Persisted geometry stays private; delivered content remains ordinary permitted content. Initiative pause/Ask/End cannot erase already accepted entitlement: test active accepted slots against these state changes before relying on the current roadmap-state filter.

**Offline command — every named suite exists at this baseline; extend them:**

```sh
node --test packages/web/src/roadmap-canvas.test.mjs packages/web/src/canvas-slot-card.test.mjs packages/web/src/roadmap-client.test.mjs packages/web/src/roadmap-view.test.mjs packages/web/src/canvas-slots.test.mjs
```

Existing new suites cover view projection/gating, stable step keys, anchored non-column placement, duplicate suppression, slot markup/spinner/error and thumbnail/crop exclusion. Add reload/version/actor isolation, edited-title continuity, exact format width, same-slot editor, failure/retry, theme and approved action geometry assertions. Keep existing no-unchecked-proposal, no-price and no-Chat/ToC-recovery-block assertions. Pure/SSR tests do not prove physical pixels, focus, first-paint continuity or saved geometry; use the browser matrix.

#### UI.05 — keyboard and competing-action correctness (R4.10 / R5.02)

**Existing:** `roadmap-controller.js:act` deduplicates a gesture; `acceptProposal` is used by click and Tab; `roadmap-client.js:tabAccepts`, `keyboardOwned`, `claimsFocus`; `shortcut-owner.js:pageKeyAllowed`, `fieldKind`, `modalOpen`; `inline-ai-proposal.js`; `NextStepPill.jsx:ProposalTools`. Preserve these boundaries; the new pending `SlotCard` already uses the same `[data-roadmap-overlay]` keyboard-owner marker. Extend tests for it rather than introducing a second key handler.

- [ ] Claim only plain Tab (`!shiftKey && !ctrlKey && !altKey && !metaKey`) for the selected/current accept-ready proposal with canvas/proposal keyboard ownership. Exclude inputs, textareas, select, contenteditable, Markdown/code editors, CodeMirror/Monaco, iframes, Chat/ToC composers, menus/dialogs, active viewer/card widgets, an open editor/modal, read-only/presentation, key repeats and IME (`isComposing` or keyCode 229). Shift+Tab remains focus navigation. When excluded, do not prevent default or stop propagation.
- [ ] Click/Tab must join the same action keyed by proposal ID+version and send one request. A second in-flight Tab may remain locally consumed to avoid focus jump but cannot send another accept. The first proposal may receive focus only from the explicit Accept plan handoff while focus is still unowned; no later background proposal steals focus.
- [ ] Serialize local Accept/Cancel/Edit-Apply intent for the same version, keep controls truthful while pending, and still rely on server revision/version guards across devices. If Cancel wins, clear only the cancelled pending slot after canonical confirmation and ignore late draft/accept responses for that version. If Accept wins, keep the generating slot; a losing Cancel is not a generation cancellation or refund. An uncertain network response triggers reconciliation, not a fresh paid operation.
- [ ] Keep Ctrl/Cmd+K proposal targeting, preview without generation, Ctrl/Cmd+Enter Apply, Esc discard and editor-owned Tab. Apply creates a new checked version; only after that response may the slot bind to the new version and its deliberate content change. Drop stale previews on accept/cancel/source change from another device. Preserve geometry across an explicitly applied edit; do not silently carry a stale acceptance key into the new version.
- [ ] Keep existing-card linking zero-generation/zero-charge and ordinary card Quick Edit separate. Proposal Add to Chat remains a real authorized reference task (R5.03), not a claim that its current screen-offset drag map implements it.

**Offline commands — all existing files, extend client Cancel/Accept/draft race assertions:**

```sh
node --test packages/web/src/roadmap-client.test.mjs packages/web/src/roadmap-controller.test.mjs packages/web/src/shortcut-owner.test.mjs packages/web/src/inline-ai-proposal.test.mjs
node --test packages/control-plane/test/roadmap-proposal-drafts.test.js packages/control-plane/test/roadmap-store.test.js
```

Assert one accept for simultaneous click+Tab; no action or event cancellation in every excluded focus/composition case; both orderings of Accept↔Cancel and Accept↔Apply; late stale preview ignored; no second version/purchase by the loser; existing accepted state still displayed after conflict. Existing server draft tests already exercise Accept-versus-Apply; extend missing visual-slot/race assertions instead of assuming the frontend shares that coverage.

#### UI.06 — complete source-relative placement, navigation and saved delivery (R4.10 / R5.03)

**Existing now:** `LearnPage` uses `placeRoadmapCard`; `AdaptiveCanvas:roadmapSpot` chooses once beside the measured outer source box with `deliveredSpot`, stores world x/y in `roadmapSpots`, and draws `anchoredSlots` under the normal canvas transform. `deliveredSpot` now accepts a source box via `placeNote` or point via `placeResult`. `proposalAnchor` can derive a passage slab, but the live host currently passes the outer source bounds. `placeRoadmapCard` uses the slot/map anchor; `pendingAt` calculates final block offsets after measurement. These are implemented seams, not future wiring.

- [ ] Preserve current source-relative placement and no camera move for anchored reserve/delivery. Reuse measured source outer bounds and obstacles, including collapsed bounds; source internal scroll must never recompute world geometry. `proposalAnchor` is optional initial alignment only, never a requirement that a paragraph be visible. Include the action group's exterior 8px+28px bounds when checking collision, rather than only current frame width/height.
- [ ] Close missing-bounds/reload holes without creating a competing fixed overlay or teleport. Current `roadmapSpot` waits when a known source lacks measured bounds, and falls back to `viewCenter()` if the source card is absent. Prefer restored/saved source or slot bounds; a missing source needs its actual availability state. Current unanchored `placeRoadmapCard` still delegates to `insertAtView`, which can reveal/move the camera. Remove that fallback from accepted Tutor delivery; retain its ordinary non-Tutor callers.
- [ ] Persist geometry through UI.04. The current slot wrapper stops pointer propagation and supplies no drag handler; complete deliberate learner dragging through the existing canvas interaction code, updating the same private world position. Do not claim the old `createDragStore` screen-offset overlay map implements world drag/reload. Source display changes, viewport scroll, pan/zoom, status polls and title updates do not relocate an established slot.
- [ ] Prove/correct the handoff to actual content before calling it stable: today the slot is removed when the card is inserted with dx/dy zero; a later `bounds` layout effect applies `pendingAt` offsets and clears the cached spot. Preserve the slot or equivalent wrapper until real content occupies its exact top-left/width, without an intermediate column flash. Ensure final content grows downward and does not alter unrelated card placement. Complete the offset/measurement state before considering geometry durable.
- [ ] Strengthen save-before-ack at this real seam. `roadmap-controller:deliverOne` calls `host.persist()` after insertion, while `AdaptiveCanvas:persist` reads `boardRef`; `savedHas` checks card identity, not its final offsets. Gate acknowledgement on the saved card having the final promised world position/width as well as a real revision. A delayed layout/save, lost ack or reload retains the same server card/result and retries persistence/ack without author redispatch. Do not discard the private anchor while final geometry is unsaved.
- [ ] Replace only the stale source-based navigation seam: `use-roadmap` still derives indicator/focus eligibility from `sourceElement`/`anchorState`, and `go({kind:'proposal'})` focuses the source block. Expose the actual current slot bounds/navigation through the existing canvas host; the offscreen indicator tests the slot, and explicit ToC/Next step ready frames that slot. The already drawn world slot need not disappear when its source is offscreen. Backend generation never depends on either DOM visibility.
- [ ] Keep `liveCards`/server-card-ID deduplication through delayed views, save retry and two clients. Preserve removed-card history, real user-moved delivered geometry and ordinary card deletion. A new delivery must not overwrite or reposition an existing historical card. Clean private cache entries only after a canonical cancelled state or durable delivered geometry makes them unnecessary.

**Offline command — all existing files; extend integrated geometry/save tests:**

```sh
node --test packages/web/src/roadmap-canvas.test.mjs packages/web/src/canvas-slot-card.test.mjs packages/web/src/roadmap-controller.test.mjs packages/web/src/roadmap-proposal-context.test.mjs packages/web/src/inline-placement.test.mjs packages/web/src/canvas-slots.test.mjs
```

Assert current source-box noncollision and anchored/non-column behavior remain; add collapsed/offscreen/unmeasured-source restore, fixed world x/y/width through scroll/pan/zoom, user drag reload, no lifecycle camera callback, actual-slot navigation, no transient column placement, final saved geometry before ack, and no ack on save failure/missing card/invalid revision or unsettled offsets. Existing deterministic placement tests and SSR snapshots alone cannot prove the new `pendingAt`/measurement/save sequence; exercise it in the local browser too.

#### UI.07 — scroll/highlight inside the Markdown source (R3.04)

**Existing:** `FileDocMarkdown.jsx` has `scroller`, `[data-scroll][data-file-doc-text]`, `SOURCE_REF_EVENT`, `passageTarget`, `paintHighlights` and a temporary source highlight. It currently calls the quote element's `scrollIntoView({block:'center'})`. `SourceRefChip.jsx:SourceRefLine` offers `View passage`; `source-refs.js:viewPassage` explicitly focuses the source then emits the event; `focusExplanation` navigates the other direction. Modify these actual files, not the absent planned `source-ref-navigation.js`.

- [ ] Keep explicit card→source and passage→explanation navigation. Resolve permission/revision/quote first; changed, missing, inaccessible or ambiguous references display the limitation without relocating to a look-alike passage. Preserve duplicate-quote context matching and removed-target filtering.
- [ ] When the verified passage is inside a bounded Markdown card, scroll that card's `scroller` to the range. Avoid unbounded ancestor `scrollIntoView` side effects that can scroll the canvas/page or alter proposal placement. Explicit source navigation may frame the card through the existing canvas API; internal passage scrolling itself must not move the canvas.
- [ ] Keep temporary highlight painting separate from persistent learner highlights. Clear its timeout/paint on source revision change, replacement and unmount. Preserve normal text selection, Highlight/Explain actions and useful `View explanation` interaction; no blanket arrows or source expansion.
- [ ] Keep scope frozen independently: internal scrolling after visible-section selection does not change accepted input. Whole-source planning and generation stay possible when the relevant passage is outside the reader viewport. Preserve a collapsed source without expanding it just to place/generate a Tutor card; any explicit expand/navigation remains a learner action.
- [ ] Retain a subtle source affordance with a keyboard-reachable action. The current `View passage` line is always shown and tested for accessibility; do not replace it with a mouse-only interaction or duplicate it with another required source-control row.

**Offline command — all named suites exist, including the current roadmap-canvas suite; extend inner-scroller behavior:**

```sh
node --test packages/web/src/source-refs.test.mjs packages/web/src/source-refs-render.test.mjs packages/web/src/card-layout.test.mjs packages/web/src/roadmap-canvas.test.mjs
```

Assert exact source/version target, ambiguity refusal, no arrival-driven navigation, separate persistent/temporary highlights, timeout cleanup, deleted targets excluded, inner scroll only, unchanged scope/layout/slot coordinates and no source-body leak on denial. Pixel scroll containment requires browser proof, not just quote-offset tests.

#### UI.08 — preserve feedback, Progress and quiet next-step behavior (R1.03–R1.05 / R6.03)

**Existing:** `CardFeedback.jsx:Thumbs`/`CardFeedbackSummary`, `card-feedback.js`, `LearnProgress.jsx`, `AdaptiveCanvas.jsx:LessonBlockCard`; `roadmap-controller.js:deliverOne` saves before ack and `afterDelivery` schedules follow-up reads; `roadmap-auto.js` records delivery-to-next-proposal samples; `NextStepPill.jsx:NextStepIndicator` and `roadmap-client.js:canProposeNext`/`indicatorOf` exist.

- [ ] Keep one eligible thumbs pair under real generated content, hidden at rest and after pointer/keyboard focus leaves even if selected. Either choice uses blue; keyboard focus reveals controls with visible focus. Imported sources, pending/held/error slots and shared/view-only surfaces stay ineligible. Keep private persistence and late-response/scope isolation; do not put ratings on the block.
- [ ] Keep Progress as the existing tab and retain independent no-goal feedback loading/error/retry. Thumbs must not create observations, increment demonstrated counts, accept proposals, trigger generation or mark the ToC manually done. Opening Progress sends no teaching request and does not pan absent a selected card link.
- [ ] Create/show one next pending proposal only after the current accepted cards are durably saved+acknowledged or failure resolved. A failed board save must not advance. Preserve server-driven mode/settings/pause gating, manual next, ceiling, ending and cancellation semantics; no repeated invitation or speculative artifact call before acceptance.
- [ ] For offscreen slots, Next step ready navigates only. Keep viewport and focus unchanged on arrival and reload. Measure acknowledgement→visible latency separately from composition/checking/provider stages; a target is not a guarantee and no fake progress timer is shown.

**Offline commands — all existing suites, extend for restored persistent-slot geometry:**

```sh
node --test packages/web/src/card-feedback.test.mjs packages/web/src/card-feedback-render.test.mjs packages/web/src/learn-progress-feedback.test.mjs packages/web/src/roadmap-auto.test.mjs packages/web/src/roadmap-controller.test.mjs
node --test packages/control-plane/test/roadmap-auto-proposal.test.js
```

Assert eligibility, toggle/clear, blue pressed state, no selection-only visibility, no-goal Progress, no assessment writes, board/actor isolation, no successor on failed save, one next offer under replay/manual-vs-auto race, Ask/off/pause/end gating, no generation before acceptance, and zero camera/focus callbacks on background arrival. Browser checks establish actual hover/focus visibility.

## Browser acceptance — separate from offline Node tests

Do not run browsers, production or paid generation as part of this documentation update. The existing commands below use local stack/fakes and should be extended on the implementation candidate by its authorized UI verifier. They are not proof of real model grounding or live activation. Use installed browser dependencies, local app `127.0.0.1:8878`, local control plane `127.0.0.1:8879`, and the documented local test-session setup; model-capable routes must remain intercepted/blocked.

```sh
BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node packages/web/e2e/roadmap-command-check.mjs
BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node packages/web/e2e/roadmap-mvp-check.mjs
BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node packages/web/e2e/depth-settings-command-check.mjs
BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node packages/web/e2e/source-ref-command-check.mjs
BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node packages/web/e2e/card-feedback-command-check.mjs
```

The current `roadmap-command-check.mjs` now checks 4px group corners and that the pill follows a frame, but does not yet assert the exact 8px gap, 28px measured height, real source placement or the full slot-to-delivery/save sequence. Extend the fixture to draw a real source and hosted slot; its former fixed-overlay-only case is not complete acceptance.

Extend those existing checks with this focused matrix; do not invent a passed `roadmap-reload-check.mjs`, `roadmap-keyboard.test.mjs`, `roadmap-auto-check.mjs` or `composer-controls-check.mjs`.

| Scenario | Required browser observation |
| --- | --- |
| Drop Markdown, type/compose while save finishes | One invitation in right Chat after idle, exact two choices, no extra canvas Chat, no scope/display change. |
| Long plan at short/tall panel sizes | One Table of contents title and tree; H1/H2/H3 and descriptions; one scrolling outline body; reachable stopping/actions; existing footer composer; retained panel width and tab state. |
| Pending → click/Tab → generation → checking → actual content | Same visible frame/title/top-left/width throughout, including the `pendingAt` handoff and before saved acknowledgement; 28px control, 4px corners, 8px gap; 16px spinner; no fake percentage; final content grows down; no camera/focus jump. Capture intermediate states, not only before/after screenshots. |
| Source internal scroll, source collapse, source offscreen | Bounded source scroll changes neither slot world geometry nor camera; collapsed placement uses collapsed bounds; generation proceeds offscreen; no forced Full content or expansion. |
| Canvas pan/zoom, deliberate slot drag, reload | Use an actual source plus `data-roadmap-slot`, not the legacy overlay fallback; source and slot share normal canvas transform; saved slot world position/width restored; actual content replaces it without recomputing current-view placement. |
| Cancel/Accept/Apply across delayed response and second tab | One server winner, canonical UI state, no orphan/duplicate slot, no stale preview, no second action/purchase. |
| Keyboard focus exclusions | Normal Tab/Shift+Tab in composer/ToC fields/editors/menu/dialog/widget/iframe; IME/repeat inert; selected current proposal accepts once from its eligible canvas context. |
| Generation error, retry, save failure, lost ack, reload | Delay bounds/offset measurement and board save to establish final-position-before-ack; short error status remains inside original slot; existing `[data-toast-error] [data-toast-action]` Retry sends one permitted request and reuses slot; no `[data-roadmap-recovery]` or `[data-roadmap-status]`; failed save does not ack/advance; restored result/card identity/position remain singular. |
| Explicit View passage/View explanation | Exact verified source range highlighted; only inner Markdown reader scrolls after explicit framing; timeout cleans paint; changed/ambiguous source stays put. |
| Next proposal offscreen | One quiet indicator for actual slot; no automatic pan or Chat repeat; clicking only navigates, with zero accept/propose/generate requests. |
| Feedback/Progress | Hover or keyboard focus reveals one blue-selectable pair only on delivered generated cards; pointer/focus leave hides it; no-goal feedback works; ToC manual done and assessed Progress remain unchanged. |
| Light/dark/reduced motion | Existing repository theme tokens remain legible; action geometry holds; reduced motion does not hide status or remount the slot. |

Record candidate SHA, exact commands, nonzero case counts, request/camera spies, geometry before/during/after, screenshots/video and failures. A build or SSR class assertion is not completion of this matrix. This documentation task runs none of these implementation/browser checks and changes no product or HTML file.


## 5 Reconcile existing R1–R6 tasks

### 5.1 R1–R3: retain completed foundations, verify the changed integration

The old v1.0 tasks below are not a new build queue. Their modules/migrations exist at current main. Use the named source and tests, record prior evidence that still applies, and change only a failing behavior relevant to the candidate. CORE/UI tasks govern new corrections. All web paths below are under `packages/web/src/`; server paths are under `packages/control-plane/src/`, and Learn migrations under `packages/control-plane/learn-migrations/`.

| Task | Owner | Current files / exact retained work | Completion evidence |
| --- | --- | --- | --- |
| R1.01 Feedback contract/schema | State | `card-feedback.js`, `0036-card-feedback.sql`: one up/down/null per actor+canvas+card; generated-card access validation; no feedback in board JSON. | Existing schema/store tests, cross-actor denial and clear/update round trip. No duplicate migration. |
| R1.02 Authenticated reads/writes | State | `card-feedback.js` and current route mounts: server-derived actor, canvas/card authorization, repeat writes idempotent. | Authenticated fixture route tests, foreign card/board refusal. |
| R1.03 Client/control | UI | `card-feedback.js` web client, `CardFeedback.jsx`: hover/focus reveal, either selected thumb blue, selection alone does not keep it visible. | UI.08 and existing render/client tests plus focused hover/keyboard browser proof. |
| R1.04 Generated-card mount | UI/Lead | `AdaptiveCanvas.jsx` and existing card controls: one pair on delivered generated content; no pair on import/proposal/generating/error. | Same-slot completion reveals one pair; no duplication after reload. |
| R1.05 No-goal Progress | State/UI | Retained Progress read model and `learn-progress-feedback.test.mjs`: current-canvas self-report distinct from assessed evidence and manual goals. | No personal goal required; private feedback remains navigable or honestly removed. |
| R1.06 Slice receipt | Verifier | Reuse focused feedback checks; no unrelated planning/media run. | Actual SHA/command/case count, UI evidence and deployed/accepted status separately. |
| R2.01 Depth contract/Chat | Tools | `chat-depth.js`, `learn-models.js`, web `learn-settings.js`: Overview/Standard/Deep; actual Chat request uses submitted Depth. | `chat-depth.test.js`, prompt input assertions, default and invalid-depth behavior. |
| R2.02 Persist settings | State | `learn-user-settings.js`, `0037-learn-user-settings.sql`: global per-learner Auto-suggest; per-learner+canvas Depth. | Cross-user/canvas/board denial, cross-tab/device preference behavior. |
| R2.03 Settings UI | UI | `ModeSelector.jsx`, `DepthMenu.jsx`, `use-learn-coaching.jsx`, `chat-workspace.jsx`: existing controls and one settings source. | UI.03; all three modes and no source-layout side effects. |
| R2.04 Artifact Depth | Tools | `learn-slash.js` and `learn-artifact.js`: capture submitted Depth and pass into actual supported generator request. | Existing dispatch tests plus CORE.03/05 actual ordinary author body. |
| R2.05 Both Explain paths | Tools | `startExplain`/Explain job path and legacy artifact fallback keep Depth in job/body/block metadata. | Existing `explain-depth.test.js`; typed/Quick Edit still startExplain-first. |
| R2.06 Integrated settings | Verifier | State, composer and source scope together; accepted request does not mutate when slider changes later. | Settings/request tests and no extra purchase from preference changes. |
| R3.01 Markdown/PDF-excerpt anchors | Tools/UI | `source-refs.js`, `FileDocMarkdown.jsx`, existing PDF excerpts/page viewers: exact source revision/locations. | Existing source/PDF anchor tests. Whole-PDF Tutor planning remains R7b. |
| R3.02 Authorize/index refs | State | Server `source-refs.js` and board save integration: access and revision checks, not client URL as authority. | Foreign/deleted/changed/ambiguous source cases; safe share/fork output. |
| R3.03 Carry metadata | Tools/State | `sourceRef` through creation/jobs/blocks; CORE.02–03 separate full document from locator. | Tiny anchor + full-context author request; reload keeps reference. |
| R3.04 Navigation | UI | `SourceRefChip.jsx`, `source-refs.js::viewPassage/focusExplanation`, `FileDocMarkdown.jsx` highlight handler. | UI.07 exact passage, reader scroll only, reverse navigation, no automatic camera jump. |
| R3.05 Sharing/forks | State/UI | Current shared/fork sanitizers; private pending bindings excluded, permitted delivered refs retained. | No private keys/source data/step metadata leak; revoked source fails access. |
| R3.06 Viewer receipt | Verifier | Current Markdown/PDF viewer plus the new slot integration. | Existing tests and actual scroll/highlight/reload checks; no fabricated full-PDF acceptance. |

**Focused existing commands, repository root:**

```sh
node --test packages/control-plane/test/card-feedback.test.js packages/web/src/card-feedback.test.mjs packages/web/src/card-feedback-render.test.mjs packages/web/src/learn-progress-feedback.test.mjs
node --test packages/control-plane/test/chat-depth.test.js packages/control-plane/test/explain-depth.test.js packages/control-plane/test/learn-user-settings.test.js packages/web/src/learn-settings.test.mjs
node --test packages/control-plane/test/source-refs.test.js packages/control-plane/test/pdf-excerpts.test.js packages/web/src/source-refs.test.mjs packages/web/src/source-refs-render.test.mjs packages/web/src/pdf-anchor.test.mjs
```

Run the affected subset. These commands verify existing foundations; they do not establish a live browser's hover, canvas geometry or actual model quality.

### 5.2 R4 task reconciliation: no second implementation

| Existing task ID | Current implementation / revised HOW | Owner and dependency |
| --- | --- | --- |
| R4.01 Contracts | Existing `roadmap-contract.js`, `roadmap-policy.js`, contracts directory; CORE.01/08 update obsolete ordinary-author expectations. | Lead, before changed interfaces integrate. |
| R4.02 Durable records | Existing migration0039/store/actions; preserve one unfinished roadmap, immutable versions and replay guards. Extend records only when a demonstrated new field cannot use an existing trusted field. | State; no blanket new schema migration. |
| R4.03 Source/tools | Existing source readers/tools registry. CORE.02 separates whole context from teaching scope; tool availability stays explicit. | Tools; R3 access/reference identity. |
| R4.04 Invitation/plan/ToC | Existing source-ready/controller/planning modules. UI.01–03 unify ToC and retain composer; CORE.02 supplies complete context. | UI/Tools/Lead; one source readiness flow. |
| R4.05 Durable recovery | Existing `roadmap-events.js`, `roadmap-jobs.js`, `roadmap-sweep.js`; retain alarms/read advance/sweep and actual lease/dedupe semantics. | State; no new coordinator framework. |
| R4.06 Provider identities/quota | Existing `roadmap-models.js`, `roadmap-quota.js`, `learn-spend.js`. Planning/source work platform-funded; quota reserved after local validation and reconciled on proven pre-dispatch failures. | State; existing D1-safe queries and quota repair must survive. |
| R4.07 Step money | Existing `roadmap-money.js`, authorization/allocations and consume/transfer. CORE.05 prices actual full input; no double hold. | State/Tools; shared actual request builder. |
| R4.08 Ordinary adapter | Current `roadmap-card-3`, full document + step brief, `repairs:0`; CORE.03–04 finish accepted-version/no-redispatch binding. | Tools/State; keep public/standalone engines unchanged. |
| R4.09 Applicable validation | **Superseded title:** no ordinary LLM source-support/citation judge. CORE.06 retains source identity, schema, safety and honest `not_run`; richer/practice tools keep their named checks. | Tools/State; no obsolete reviewer polish. |
| R4.10 Proposal/placement | UI.04–07: reuse existing skeleton/card, private world slot, exact pill, click/Tab, same-slot save/reload/navigation. | Canvas/UI/Lead; actual host integration, not just helper tests. |
| R4.11 Failure/refund | CORE.04–06 and UI.04: known failure versus uncertain response, truthful settlement, same slot, existing toast. | State/UI; explicit retry is separate from auto repair. |
| R4.12 Next/revise/stop/privacy | Existing lifecycle/client/actions; preserve ended/history/deleted state, ceiling and private shared/fork projection. | State/UI; no automatic mastery or whole-plan purchase. |
| R4.13 Complete flow | CORE.07 plus UI browser matrix and REL tasks: first and second cards, reload, next offer and real production status. | Verifier/Lead; focused evidence, no clone gate. |

**Do not restore stale internals:** browser router/planner, sessionStorage evidence, journey/syllabus schema/UI, JEV learning grades, `learn-grade.js`, retired handoff route or `RoadmapRecovery.jsx`. Current JEV safety, retained assessment and `/api/learn/tutor/attempts` are different capabilities and remain.

### 5.3 R5 proposal editing and reuse: finish the partial feature

Current source contains `roadmap-proposal-drafts.js`, `roadmap-edit.js`, `roadmap-links.js`, migration0041, `inline-ai-proposal.js` and relevant tests. The prod edit flag is absent. A receipt addendum removed proposal Add to Chat/context references; existing-card chooser/menu and world-placement integration are unfinished. Do not call the entire feature complete from the backend or recreate removed code without checking its current consumers.

#### R5.01 Preserve draft/Apply and complete the actual proposal author input

**Owner:** State/Tools. **Depends:** R4 immutable proposals/acceptance. **Model:** current `roadmap_proposal`, Sonnet5.5 low/max600; platform-funded. **Files:** server `roadmap/roadmap-proposal-drafts.js`, `roadmap-edit.js`, `roadmap-routes.js`; migration0041 already exists.

- [ ] Keep draft rows private and separate from immutable proposal versions. Creating/revising a preview does not consume acceptance or generate a card. Esc/discard changes nothing in the original proposal.
- [ ] Apply commits one new checked pending version under expected source/plan/proposal revision. Accept/Cancel/Apply races use the first server winner; stale previews cannot replace an accepted step.
- [ ] Preserve latest applied title/description/format/instruction in the actual author binding, not only displayed proposal text. Ordinary authoring inherits the full-document/no-citation-gate policy; retained edit safety/access/schema checks remain.
- [ ] Do not change the current accepted/generating card when editing later work. Revoked/missing source or unsupported format returns a typed limitation before paid generation.

**Tests/evidence:** extend existing `packages/control-plane/test/roadmap-proposal-drafts.test.js` and `roadmap-generate.test.js`; assert draft zero generation/charge, Apply one version, Esc no write, both action-race orderings and applied text reaching the outgoing request. Record the actual model role only if a model call is exercised.

#### R5.02 Reuse Quick Edit and preserve two separate accepts

**Owner:** UI. **Depends:** R5.01 and UI.04–05. **Files:** `packages/web/src/inline-ai-proposal.js`, existing inline AI overlay, `NextStepPill.jsx::ProposalTools`, `roadmap-controller.js`.

- [ ] Ctrl/Cmd+K opens the existing proposal editor with exact proposal context. Cmd/Ctrl+Enter applies the edit preview; it is not paid step acceptance. Tab is owned by the editor until it closes.
- [ ] Preserve existing card Quick Edit separately. No always-visible new Edit button inside a proposal; existing hover/context actions share the established action area without cramping the attached acceptance pill.
- [ ] Handle source changes, cancellation and another device's acceptance while preview is open by showing canonical state and ignoring stale response. Geometry remains fixed for an applied edit of the same visual position.

**Tests/evidence:** existing `packages/web/src/inline-ai-proposal.test.mjs`, `roadmap-controller.test.mjs`, `roadmap-client.test.mjs`; focused local keyboard/browser case proves editor Tab never purchases. Changes to static class strings alone are not enough.

#### R5.03 Complete Add to Chat and learner-directed placement

**Owner:** UI with State/Tools for context validation. **Depends:** R5.01–02; UI.06 owns world placement. **Files:** existing `roadmap-proposal-context.js`, current context-reference parsing/Chat host, `NextStepPill.jsx`, `LearnPage.jsx` lead integration.

- [ ] Reuse the existing Add to Chat affordance and context-reference contract. Add a versioned proposal reference only after server access validation; it identifies the actual pending proposal and preserves the learner's draft. Do not pretend the removed reference/menu is currently wired.
- [ ] The reference describes an offer, not a delivered card or permission to generate. Sending clarification keeps original instruction plus the new scoped intent, and material changes produce a new proposal/plan version as appropriate.
- [ ] Reuse canvas dragging to update the private slot's world position. The current screen-offset drag store alone does not implement accepted placement; UI.06 must carry the saved position into real insertion and reload.

**Tests/evidence:** existing `packages/web/src/roadmap-proposal-context.test.mjs`, `inline-ai-proposal.test.mjs`, `roadmap-controller.test.mjs`, plus NEW proposal-context access tests only if a new server seam is needed. Assert forged/stale/cross-board reference denial, no charge from attaching context, preserved draft and same dropped position after generation. UI.06 geometry proof is reused, not rerun as a separate broad gate.

#### R5.04 Link an existing card as a zero-generation step

**Owner:** State/Tools/UI. **Depends:** R4 delivery/entitlement, R5.01. **Files:** server `roadmap/roadmap-links.js`, routes/store; current canvas card menu and proposal UI. **Models:** none for deterministic linking; any later recommendation uses its bounded platform policy.

- [ ] Expose explicit selection of a suitable accessible existing card, and later a Tutor-proposed link through the same accepted versioned contract. No hidden automatic substitution of newly purchased work.
- [ ] Bind source/card content identity, current access, roadmap step and proposal version. Recheck eligibility at acceptance. Changed/deleted/inaccessible content requires a corrected offer; it cannot be linked using stale client text.
- [ ] Link acceptance makes no provider call, hold or learner debit and works at zero balance. It records coverage/reference, not newly demonstrated understanding. Preserve the card's existing world location and content.
- [ ] Keep links/private step associations out of unauthorized shares/forks; another learner cannot infer private evidence or pending plans from a copied card ID.

**Focused current command, root:**

```sh
node --test packages/control-plane/test/roadmap-proposal-drafts.test.js packages/control-plane/test/roadmap-links.test.js packages/web/src/inline-ai-proposal.test.mjs packages/web/src/roadmap-proposal-context.test.mjs packages/web/src/roadmap-controller.test.mjs
```

**Receipt:** exact enabled R5 subset, applied-edit-to-author trace, current menu/chooser/browser proof, zero-price link ledger and flag state. Enabling editing does not require R11 speculation or all format adapters.

### 5.4 R6 automatic next proposals: verify current deterministic work

#### R6.01 Keep durable trigger facts and current settings

**Owner:** State. **Depends:** R4 delivery and R2 settings. **Files:** server `roadmap/roadmap-settings-events.js`, `roadmap-events.js`, `roadmap-auto.js`, migration0040 and current settings writes. **Models:** none for trigger handling.

- [ ] Retain monotonic settings/mode/delivery facts and deduplicated durable event insertion. Global Auto-suggest reaches each unfinished actor roadmap; off/on/off and Ask/Tutor/Ask remain distinguishable revisions.
- [ ] Re-read canonical mode, setting, explicit pause, source revision, remaining ceiling and unfinished work before composition/reveal. Turning Auto-suggest on does not clear a Cancel pause.
- [ ] Preserve independent manual Next. Concurrent manual/automatic/two-device triggers converge on one current offer and never create paid work.

**Evidence:** existing auto-events/events/settings tests, reverse-order facts, replay and no extra model/debit.

#### R6.02 Compose only metadata, reveal after saved delivery

**Owner:** State/Tools/UI. **Depends:** R6.01 and UI.04/06. **Files:** `roadmap-compose.js`, `roadmap-auto.js`, `roadmap-view.js`, web `roadmap-client.js`, `roadmap-controller.js`, `use-roadmap.js`. **Model:** current composer is deterministic, not `roadmap_proposal`.

- [ ] Keep one ready title/description/format offer, not a paid artifact. Do not add an unnecessary model call to match older prose.
- [ ] The first offer follows explicit plan acceptance. Later automatic offers follow saved and acknowledged delivery, or the agreed explicit resolution of a failed/cancelled dependency; they do not appear while the current card is still generating/saving.
- [ ] Derive offscreen readiness from the actual persistent slot, not the source's screen visibility. No camera/focus move, repeated Chat prompt or inactive suggestion flag pretending the work is done.
- [ ] Stop at ceiling/stopping point. Current R6 can remain enabled without R5, R7, R9 or speculative R11.

**Evidence:** first/second-card fixture, one event/offer, zero author calls before its acceptance, UI.08 offscreen navigation and delivery-to-visible latency measured separately from generation.

#### R6.03 Record the integrated result and limits

**Owner:** Verifier/Lead. **Depends:** R6.01–02 changed behavior only. **Models:** local doubles first; actual authorized production result separately.

```sh
node --test packages/control-plane/test/roadmap-auto-events.test.js packages/control-plane/test/roadmap-auto-proposal.test.js packages/control-plane/test/roadmap-events.test.js packages/control-plane/test/learn-user-settings.test.js packages/web/src/roadmap-auto.test.mjs
```

Extend with the CORE.07/UI matrix rather than another artificial broad suite. Record pending versus delivered times, current modes/settings/pause, one offer, no card before acceptance, and correct reload. The 1–2 second next-suggestion goal is a measurement target, not a fabricated ETA or permission to show the next card before the current one is saved.

## 6 Continue the remaining R7–R16 ladder

All later ordinary text-producing paths inherit the current full-context/accepted-intent policy, one author call for fresh ordinary generation, and no per-card LLM citation gate. Prepared or existing-card reuse has zero new author dispatch at acceptance. Preserve actual safety, source coverage, research provenance, calculation, quiz-key, OCR, renderer and sandbox checks where applicable. Do not read a later task's phrase “applicable checks” as permission to restore the retired ordinary citation reviewer.

The next sections retain exact task IDs and implementable subtasks, not a commitment to ship every tool at once. Current code and NEW files are distinguished. New tests must be written before their named commands become executable evidence. A current regression suite is a starting baseline, not acceptance of an unbuilt adapter.


### 6.1 Later release implementation rules

Later-module baseline: `fe2bf0f79c6a355a36c9b958bd82933a966620fc`, verified unchanged in the diff through main `72d6536657af269bb894511220975fd2254246ed`. These are executable remaining tasks, not a claim that later capabilities are enabled or that any command below has passed. A current source file, a historical receipt, and a successful workflow are implementation evidence only; functional acceptance needs the relevant observed result. Preserve the task IDs. Historical v1.3/M/D traces below are provenance, interpreted through the adopted v1.4 contract and current CORE/UI/REL sections.

**Current versus NEW.** Current symbols below were checked in the baseline source; all new API signatures, records and tests are explicitly implementation targets. All bare server `roadmap-*.js` names refer to `packages/control-plane/src/roadmap/`; `agents/roadmap-*.js` remains under `packages/control-plane/src/agents/`. NEW server modules/adapters follow that nested roadmap namespace. Allocate a new migration number only after inspecting the current manifest; existing 0042 is the R7a migration. Unit commands run from the repository root in the existing checkout with its locked dependencies installed. Current tests are path-verified, not run in this documentation audit. NEW commands become runnable only after their listed test files and implementation exist. Do not recreate absent legacy `roadmap-quotas.test.js`, `roadmap-jobs.test.js`, `explain-tutor.test.js` or `shared-privacy.test.js` merely to satisfy stale instructions; the current replacements appear in the relevant task.

**Ordinary author contract throughout the ladder.** When fresh authoring is needed for a later source, revision or preparation operation, send the full supported source context plus accepted title/goal/claims/outcome brief to one ordinary author call. Reusing a valid prepared result or linking existing content makes zero new author calls at acceptance. Source-reference/highlight metadata does not reduce that context. Keep the accepted skeleton visible through generation, placement and delivery. Use `repairs: 0` and no blocking LLM citation checker/escalation; preserve contextual safety, schema/format validation, source/access/version integrity, accepted entitlement, billing and replay. The baseline implements this for documents within 40,000 characters; expanding the supported context beyond that is still work. Relevant practice-key, calculation, research-egress, OCR-uncertainty, sandbox and actual rich-output checks remain. Do not apply their checks as a generic second reviewer for ordinary prose.

**Browser-local prerequisites and receipts.** Every rung below lists its local fixture additions. Reuse the existing checkout and actual application UI; no clone, demonstration page or mandatory extra preview environment. The existing `packages/web/e2e/roadmap-command-check.mjs`, `roadmap-mvp-check.mjs` and `roadmap-edit-manual.mjs` document local origins `BASE=http://127.0.0.1:8878` and `SMALL_CP=http://127.0.0.1:8879`, Playwright Chromium, a running app/control-plane, local database/storage, and test-session setup using `TEST_BYPASS_SECRET` from `VARS` or the local control-plane vars file. Do not print that secret. Future harnesses below must implement the same explicit local-only inputs, seed the rung’s data and abort unintended provider requests. Start the existing configured stack; do not invent an unverified launch command. A NEW harness invocation below specifies its required contract, not an existing runnable file. Follow the currently authorized execution scope: these instructions do not themselves run browsers or grant paid-call authority.

For each implemented task record the candidate SHA, actual commands/results, fixture/source hashes, supported versus omitted coverage, state/ledger IDs, requested/served model where applicable, screenshots or traces for the actual changed interaction, failures and recovery. Record “not run” where evidence is absent. Follow the adopted direct-production/focused-check release path in REL; do not reintroduce the old clone/preview tiers, blanket reviewer ceremony, or an all-adapter gate. Security, authorization, immutable grading and money failures in the enabled path must still be fixed. The existing `toast()` and semantic conversation/action paths handle recovery; do not restore the removed RoadmapStatus/RoadmapRecovery widgets.

### 6.2 R7a — Long Markdown indexing and explicit coverage

**Current status:** Implemented in main in part; disabled in repository production config because `ROADMAP_LONG_MARKDOWN_ENABLED` is absent. The core index, bounded summary and long-plan loop, coverage UI and migration 0042 exist. The later receipt addendum supersedes its earlier “whole-document planning not built” statement. Source replace/detach atomic outbox integration and real current-UI/model evidence remain unfinished. Current long planning is bounded to 4 model turns, 8 evidence reads, 60,000 evidence characters, a 30,000-character outline and 150 outline units. Current ordinary authors receive the full document only within the 40,000-character supported bound; longer sources still use passage fallback. Do not claim complete long-source author context.

**Browser-local prerequisites:** Enable long Markdown only in the local fixture configuration, load migration 0042, and provide late-section, repeated-heading, headingless and over-limit Markdown fixtures. Extend the actual current ToC and source viewer; the NEW source browser harness must use the common local convention above.

**Rung receipt:** Existing indexed/outlined/read/planned coverage, actual author input size, explicitly unread ranges, changed selection history, a historical citation round trip and platform work counts. Record the unsupported long-author boundary rather than pretending that a heading outline is full document reading.

### R7a.01 Complete deterministic access-scoped source indices

**Owner:** Tools and State/Money. **Depends:** R4.03 source contract, R4.05–R4.06. **Trace:** v1.3 §§3.8, 4.2, 6.2; M4.20 and indexing portion of M4.6. **Model:** none for extraction/chunking.

**Current seams:** `packages/control-plane/src/roadmap/roadmap-source-index.js` (`buildIndex`, `indexSource`, `coverageOf`, `scopeChoices`), `roadmap-source-reader.js` (`readMarkdownForActor`) and `learn-context-docs.js` (`readUpload`, `contextDocumentBlocks`) already exist. `packages/control-plane/learn-migrations/0042-roadmap-source-index.sql` and `test/roadmap-source-index.test.js` are current. `packages/web/src/FileDocMarkdown.jsx` `MarkdownText` is the existing rendered source. **MODIFY:** these current modules for any uncovered cases; do not create a second indexer or reuse migration 0042 for new schema.

- [ ] Extend existing `indexSource(env, access, {sourceKey, sourceRevision}, {readSourceForActor, now})`, returning immutable index identity, outline, chunk descriptors and coverage. Resolve bytes through the authorized source reader; neither a cache key nor a client hash establishes access.
- [ ] Partition deterministically by headings and bounded text windows, preserving byte/character coordinate convention, heading ancestry, ordinal and original source offsets. Repeated headings receive distinct location identities; split oversized/headingless sections without losing text.
- [ ] Key derivatives by ownership/scope, source hash, extractor version, chunk/index version and relevant prompt version. Store immutable derivatives in the authorized namespace; D1 records durable state and coverage.
- [ ] Track total source extent, indexed ranges, omitted/unreadable ranges, origin and stop reason from the first batch. Keep successfully indexed ranges when a later batch fails.
- [ ] Test identical bytes producing identical chunks, late-section access, repeated headings, huge fenced blocks, Unicode offsets, source replacement and unauthorized cache reads. Do not introduce a vector database or agent framework.

**Task evidence:** Save a deterministic manifest with complete range accounting and a negative cross-user lookup; the receipt names implementation limits as configuration, not newly approved spending.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/roadmap-source-index.test.js packages/control-plane/test/roadmap-source-reader.test.js`

**NEW unit tests (create, then run from root):** Extend the current suites above; no new unit filename is required by this task.

### R7a.02 Summarize bounded batches and retrieve original evidence

**Owner:** Tools. **Depends:** R7a.01, R4.06, R4.09. **Trace:** v1.3 §§3.8, 6.1–6.2; M4.1–M4.3 long-source extension, M4.20. **Model:** already-registered `roadmap_index`, Sonnet `claude-sonnet-5-5`, low, platform-funded; deterministic lexical retrieval has no model.

**Current seams:** `packages/control-plane/src/roadmap/roadmap-source-summary.js` exports `summarizeIndex`, `readSummaries`, `makeIndexCallModel`; `roadmap-source-index.js` exports `readSourceEvidence`; `roadmap-source-long.js` exports `prepareLongPlan`, `evidenceLoop`, `withLongCoverage`. `packages/control-plane/src/agents/roadmap-index.js` and `LEARN_TASKS.roadmap_index` already exist. `pdf-pages.js` `selectPages` and `explain-evidence.js` `evidenceRecord` remain reusable precedents. **MODIFY:** current source/tool/policy/coverage seams and existing source retrieval/long tests; no new duplicate agent or role.

- [ ] Build a whole-source outline from deterministic headings/ranges before model summaries. For long sources, summarize bounded chunk batches under per-document calls, characters and elapsed-time ceilings; never request an unlimited “whole section.”
- [ ] Reserve each summary call before dispatch, persist its input/version checkpoint, and replay its completed result. Unknown provider outcomes reconcile before retry; exhausted quota returns a partial index with the specific reason.
- [ ] Extend existing `readSourceEvidence(env, access, {indexId, anchor, terms, maxChars}, {readSourceForActor})`: exact anchor and neighbors first, then stable lexical ranking, with output bounded by caller purpose. Return original excerpts plus source locations/coverage, not summaries promoted into evidence.
- [ ] Keep an explicit distinction among outlined, summarized, retrieved and unread content. A plan may use an outline for navigation; source-derived content must use the actual supported source text supplied to its author. Keep the full supported author context separate from reference/highlight metadata; an outline or summary alone is not a read of omitted text.
- [ ] Test anchor/term retrieval of late content, deterministic ties, empty queries, single giant sections, summary failure after earlier success, instruction-like source text and bounded total input. Reject impossible character bounds rather than dropping disclosure.

**Task evidence:** Attach retrieval traces with selected range IDs, actual character counts and one exhausted-budget result; optional live quality measurement stays inside the release's recorded paid-test authorization.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/roadmap-source-retrieval.test.js packages/control-plane/test/roadmap-long.test.js`

**NEW unit tests (create, then run from root):** Extend the current suites above; no new unit filename is required by this task.

### R7a.03 Invalidate changed indices and expose coverage honestly

**Owner:** State/Money and UI; Verifier signs the adapter receipt. **Depends:** R7a.01–R7a.02, R3 references, R4.09/R4.12. **Trace:** v1.3 §§3.8, 6.2; M4.20, source-change portions of M7.3. **Model:** no additional role; registered `roadmap_index` remains only for allowed bounded summary work.

**Current seams:** `packages/web/src/context-docs.js` (`uploadContextSource`, `toggleContextDoc`, `removeContextDoc`, change event); `packages/control-plane/src/roadmap/roadmap-source-index.js`; current `roadmap-store.js`, `roadmap-events.js`, and `packages/web/src/roadmap-source-coverage.js`. Source-version and coverage unit suites already exist. **NEW remaining integration:** make the authoritative selected-source replacement/detach mutation commit its matching versioned outbox fact, then project coverage into the existing ToC/source controls. **NEW browser test:** `packages/web/e2e/roadmap-source-check.mjs`; it does not exist at baseline.

- [ ] Treat uploaded source versions as immutable. Commit a source-selection replacement or detach and its outbox event with the authoritative roadmap/context-selection mutation, naming old/new source identities and selection revision. An upload alone does not mutate the previously selected source or invalidate its historical references. An old notification cannot invalidate a newer selection.
- [ ] Invalidate only affected unaccepted proposal/check/index bindings. Preserve historical delivered cards, their immutable references and accepted entitlements; show a changed-source status instead of rewriting history.
- [ ] Surface “indexed through …,” unread ranges and budget/extraction limits beside supported scope choices. A whole-document request with incomplete coverage must narrow explicitly or disclose the gap before acceptance.
- [ ] Register the long-Markdown capability only when enabled and checked. If disabled or unavailable, the R4 bounded Markdown path remains available for a supported explicit scope.
- [ ] Test unauthorized cached reads after access revocation, same-version reuse, extractor-version rebuild, a late chapter, headingless text and budget exhaustion. Browser checks must navigate to the exact original passage through R3.

**Task evidence:** The R7a receipt contains a coverage manifest, historical-reference screenshot and bounded-work accounting.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/roadmap-source-version.test.js packages/web/src/roadmap-source-coverage.test.mjs`

**NEW unit tests (create, then run from root):** Extend the current suites above; no new unit filename is required by this task.

**NEW local browser harness (create first; common prerequisites plus this rung’s fixtures):** `BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node packages/web/e2e/roadmap-source-check.mjs`. Record actual assertions and screenshots; a fixture route proves UI behavior only, not live provider quality.


### 6.3 R7b — PDF text and page references

**Current status:** NEW Tutor PDF planning adapter. Existing PDF.js extraction, page-text storage/selection and R3 selected-PDF references are reusable; they do not enable whole-PDF Tutor planning. No OCR/vision fallback belongs to this rung.

**Browser-local prerequisites:** Use a local saved PDF with readable text, a mixed scanned/text PDF, failed extraction and late-page fixtures; current PDF viewer/page extraction must be available. Implement the NEW PDF coverage harness before invoking it.

**Rung receipt:** PDF byte hash plus extraction revision, per-page readable/unreadable coverage, selected-page source navigation, no vision requests, and separate platform indexing versus accepted-generation accounting.

### R7b.01 Adapt existing PDF extraction into versioned coverage records

**Owner:** Tools and State/Money. **Depends:** R7a retrieval/coverage contract; R3 page navigation. **Trace:** v1.3 §3.8; M4.20 PDF portion, D5/D42. **Model:** none; no OCR or vision role in this release.

**Current seams:** `packages/web/src/context-doc-pages.js` `readPageTexts`; `packages/control-plane/src/pdf-pages.js` page-array validation, `putPageTexts`, `readPages`; `packages/control-plane/src/learn-context-docs.js` `readOwnDocument` and upload handling. **NEW work:** create `packages/control-plane/src/roadmap/roadmap-source-pdf.js`; extend source index/coverage modules and PDF ingestion as needed; create `test/roadmap-source-pdf.test.js`.

- [ ] Resolve the learner's immutable PDF bytes and associated extracted page text through the same ownership rules as the existing reader. Bind derivative identity to both PDF source revision and extraction-version/text hash.
- [ ] Record `origin:'browser_pdfjs_text'`, PDF-order page number, original byte hash, per-page text status and extraction limits. Browser-produced text is a declared derivative, not a claim of server extraction or visual verification.
- [ ] Convert empty/scanned/damaged pages, cut markers and incomplete extraction into unreadable/partial coverage. Existing extraction may throw at its total time/text limit; record that failure rather than inventing unreturned page text.
- [ ] Validate page arrays, page counts and text bounds server-side. Re-extraction creates a new derivative revision and coverage record, leaving already delivered references bound to their historical input.
- [ ] Test uploaded PDF ownership, mixed text/scans, first/last page, corrupt text payload, cut pages and retry. Do not silently route unreadable pages to assessment vision or an unshipped OCR provider.

**Task evidence:** Keep the PDF-to-derivative hash mapping and page coverage list.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/pdf-pages.test.js packages/web/src/context-doc-pages.test.mjs`

**NEW unit tests (create, then run from root):** `node --test packages/control-plane/test/roadmap-source-pdf.test.js`

### R7b.02 Retrieve page text with intact references and bounded evidence

**Owner:** Tools. **Depends:** R7b.01, R7a.02. **Trace:** v1.3 §§3.8, 6.2; M4.20; extends M3 page anchors. **Model:** registered `roadmap_index` Sonnet `claude-sonnet-5-5`, low, only for optional bounded summaries; page ranking/reading is deterministic.

**Current seams:** `packages/control-plane/src/pdf-pages.js` `namedPages`, `selectPages`, `pagesDocument`; `packages/control-plane/src/explain-evidence.js` permits page-bearing evidence records. **NEW work:** modify `roadmap-source-pdf.js`, current `roadmap-source.js` and source-reference adapter; add retrieval cases to `test/roadmap-source-pdf.test.js`.

- [ ] Implement the same `readSourceEvidence` response for PDFs: immutable source/derivative versions, page plus local offsets, original extracted excerpt, selected/omitted pages and limitations.
- [ ] Prefer the requested page and neighbors, then explicit page ranges and lexical relevance. Reuse the existing selector where compatible; adapt its fixed request limit deliberately rather than assuming it proves full-document coverage.
- [ ] Preserve the distinction between a page's PDF order and printed page labels. Keep repeated headers and same text on separate pages addressable.
- [ ] Bind claims only to excerpts actually returned and read. Pages represented only by outline or summary remain unavailable as direct evidence until retrieval.
- [ ] Test a relevant page near the end of a long PDF, multiple requested ranges exceeding the bound, empty requested page, page cut, duplicate headers and changed extraction. Round-trip each returned reference through the existing viewer.

**Task evidence:** Retain selected-page traces and evidence records whose page/offsets reopen the intended text; demonstrate exact character bounds without truncating the coverage explanation.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/pdf-pages.test.js`

**NEW unit tests (create, then run from root):** `node --test packages/control-plane/test/roadmap-source-pdf.test.js`

### R7b.03 Ship PDF scope and limitations without widening the adapter

**Owner:** UI and Verifier. **Depends:** R7b.01–R7b.02, R4 complete flow. **Trace:** v1.3 §3.8, D5; PDF portion of M4.20. **Model:** none additional.

**Current seams:** `packages/web/src/context-doc-pages.js` `processing` exposes reading progress; `packages/web/src/context-docs.js` `retryContextDoc`; `packages/control-plane/src/pdf-pages.js` `pdfStatus` distinguishes ready/failed page extraction. **NEW work:** modify current `TableOfContents` in the existing ToC integration and `RoadmapPlan.jsx`/scope UI and source client; create `packages/web/src/roadmap-pdf-coverage.test.mjs`, `e2e/roadmap-pdf-check.mjs`.

- [ ] Present readable page scope, extraction progress and unavailable pages using the current document controls. A scanned page asks for a readable source or later supported OCR path; it never promises text the adapter has not read.
- [ ] Let the learner narrow an incomplete whole-document request to explicit supported pages. Preserve the original instruction and show resulting coverage in the proposed revision before acceptance.
- [ ] Gate PDF planning independently from long Markdown and R3 selected-excerpt navigation. Turning PDF planning off must not break historical page links or the supported Markdown loop.
- [ ] Exercise extraction retry/reload, page near the end, mixed readable/unreadable document, changed source and revoked access. Verify the explanation cites the requested original pages.
- [ ] Prove no vision endpoint, general execution service or unrelated media command is called. Confirm platform index work and learner accepted generation retain their separate accounting.

**Task evidence:** Use the shared R4 money tests for accepted delivery. Attach current-UI screenshots, coverage and route traces to an independent R7b receipt.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/pdf-pages.test.js packages/control-plane/test/roadmap-money.test.js`

**NEW unit tests (create, then run from root):** `node --test packages/web/src/roadmap-pdf-coverage.test.mjs`

**NEW local browser harness (create first; common prerequisites plus this rung’s fixtures):** `BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node packages/web/e2e/roadmap-pdf-check.mjs`. Record actual assertions and screenshots; a fixture route proves UI behavior only, not live provider quality.


### 6.4 R8a — Scoped web discovery and fetched evidence

**Current status:** NEW Tutor web research tool and NEW `roadmap_research` role; current `research_gap` capability is disabled. Reuse existing Exa discovery/fetch guards. An outgoing query must represent a public concept; private source passages never become an implicit search query.

**Browser-local prerequisites:** Default the local harness to stubbed Exa/search/fetch results and blocked unintended egress; use named public-gap, private-query refusal, redirect and outage fixtures. A separately authorized live sample may use the configured service key without printing it.

**Rung receipt:** Redacted queries, named gap/scope, attempted and refused egress, fetched original evidence and its actual coverage, request/latency/platform-cost totals. No learner debit or required browser-card purchase.

### R8a.01 Validate public-gap queries and reserve work before egress

**Owner:** Tools and State/Money; Lead owns registry/transport seams. **Depends:** R4.03 dispatcher, R4.06 quotas/identities. **Trace:** v1.3 §§3.9, 5.1, 6.3; M4.21/M4.23, D14/D40. **Model:** proposed `roadmap_research`, Sonnet `claude-sonnet-5-5`, low, platform-funded query formation.

**Current seams:** `packages/control-plane/src/learn-search.js` `discoverSources`; `exaSearch`; `packages/control-plane/src/learn-paid-transport.js` `admitTool` currently generates an operation ID internally. **NEW work:** create `packages/control-plane/src/roadmap/roadmap-research.js`, `packages/control-plane/src/agents/roadmap-research.js`, `test/roadmap-research-privacy.test.js`; narrowly extend the paid-tool identity seam with Lead.

- [ ] Define `researchGap(env,access,{roadmapId,revision,gapId,publicConcept})`. Require a named gap within accepted scope and the separately enabled research capability; the tool cannot broaden the learning goal.
- [ ] Form a general public query, then validate outgoing text against private excerpts, names, identifiers and secret-like material before any network request. If a safe query cannot be formed, return `needs_clarification`; do not substitute raw learner source text.
- [ ] Reserve shared platform spend and per-learner/window work quota before query generation, search and bounded page reads. Settle/release accurately; provisional old numeric budgets require an owner-recorded configuration.
- [ ] Thread a trusted server-only stable operation identity into the actual Exa admission path, with stage checkpoint and reconciliation. The current `admitTool` signature does not already provide this; reject caller-supplied arbitrary ledger IDs.
- [ ] Test rejected sensitive query causing zero requests, concurrent quota exhaustion, disabled flag, missing key, replay after timeout and unknown search cost. No learner charge is created.

**Task evidence:** Capture redacted egress fixtures, reservation rows and request counts, including an unknown outcome that does not blindly dispatch again.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/learn-search.test.js`

**NEW unit tests (create, then run from root):** `node --test packages/control-plane/test/roadmap-research-privacy.test.js`

### R8a.02 Fetch candidates through existing guards and retain provenance

**Owner:** Tools. **Depends:** R8a.01, R4 source integrity, safety and delivery boundary. **Trace:** v1.3 §§3.9, 6.3; M4.21. **Model:** none for discovery/fetch plumbing; the bounded research role may select candidates but cannot certify unread content.

**Current seams:** `packages/control-plane/src/explain-fetch.js` `evidenceFetcher` enforces URL/redirect checks, size/time/type limits and no credentials; `packages/control-plane/src/explain-evidence.js` `evidenceRecord`, `untrustedBlock`; `packages/control-plane/src/learn-search.js` returns candidates with `read:false`. **NEW work:** extend `roadmap-research.js`; create `test/roadmap-research-evidence.test.js`.

- [ ] Search a bounded number of candidates, select relevant primary pages, then actually fetch them. Search titles/snippets and model-authored citations are never evidence records.
- [ ] Preserve final URL, retrieval time, hash of bytes read, original excerpt, discovery origin, access class and limitations. Distinguish partial body from complete-page reading.
- [ ] Reuse public-network/DNS and every-redirect validation. No credential forwarding, paywall bypass, local network access or arbitrary download path is added by the Tutor wrapper.
- [ ] Route PDF candidates only through a shipped supported document adapter; when unavailable, return the unsupported limitation. Research does not depend on R7b shipping, and must still handle HTML sources.
- [ ] Treat fetched instructions as untrusted source data. Page access failure, scripted empty body, content-type refusal, provider timeout and conflicting sources produce typed limitations or clarification, not fabricated answers.
- [ ] Test malicious redirects, paywall response, oversized/truncated text, unsupported PDF, duplicate candidate and contradictory evidence. Supply the retained fetched text and accepted brief to the author; keep cited references/coverage separately. Do not introduce a blocking LLM citation pass for ordinary Markdown text/table.

**Task evidence:** Keep request/evidence pairs showing every cited page was fetched and each refused page remained unavailable.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/explain-evidence.test.js packages/control-plane/test/learn-search.test.js packages/control-plane/test/explain-fetch.test.js`

**NEW unit tests (create, then run from root):** `node --test packages/control-plane/test/roadmap-research-evidence.test.js`

### R8a.03 Integrate research as an independent bounded tool release

**Owner:** Tools, UI and Verifier. **Depends:** R8a.01–R8a.02; R4.03/R4.09. **Trace:** v1.3 §§3.9, 6.1–6.3; M4.21 and new-tool M4.23 checks. **Model:** proposed `roadmap_research`, Sonnet `claude-sonnet-5-5`, low; ordinary Markdown text/table uses its one author call with supported source context and accepted brief; no additional citation checker/escalation.

**Current seams:** `packages/control-plane/src/explain-evidence.js` `learnerCitation` is the citation-label seam; `packages/control-plane/src/learn-models.js` central task registry. **NEW work:** register research in current `roadmap-tools.js`, `roadmap-policy.js` and source/evidence UI; create `test/roadmap-research-tool.test.js`, `e2e/roadmap-research-check.mjs`.

- [ ] Return the shared typed statuses `ok/partial/needs_clarification/unsupported/unavailable` with bounded evidence and coverage. Retain the named gap and source/policy version in the tool result.
- [ ] Feed fetched source context into the accepted proposal/author path, with clear external citations and uncertainty. Preserve deterministic access/version/schema checks and contextual safety; source citations are metadata, not a second blocking LLM quality gate. A failed research call must leave source-supported explanation paths available.
- [ ] Keep browser/source-card creation optional and separate: completing research never buys or requires a browser card.
- [ ] Register `ROADMAP_WEB_RESEARCH` only with the verified adapter, quota configuration and relevant release receipt. Flag-off, permission loss and revision changes stop new tool work without deleting delivered citations.
- [ ] Smoke an undefined public concept, refused private query and provider outage in the current UI. Assert no hidden query continuation beyond the bounded reformulation policy and no learner debit for research.

**Task evidence:** Record requested/served model, exact calls, latency, platform cost and citation trace for authorized live samples; record R8a independently of calculation and additional formats.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/roadmap-tools.test.js`

**NEW unit tests (create, then run from root):** `node --test packages/control-plane/test/roadmap-research-tool.test.js`

**NEW local browser harness (create first; common prerequisites plus this rung’s fixtures):** `BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node packages/web/e2e/roadmap-research-check.mjs`. Record actual assertions and screenshots; a fixture route proves UI behavior only, not live provider quality.


### 6.5 R8b — Restricted deterministic calculation

**Current status:** NEW deterministic restricted calculator; current `calculator` capability is disabled. This tool is distinct from R16 execution and does not need a model role or research deployment.

**Browser-local prerequisites:** The local tool fixture must use the real parser with numerical and malicious-expression fixtures; no network/model service is needed. Implement the NEW calculator harness against the current lesson/citation display.

**Rung receipt:** Expression, versioned inputs/units, exact evaluator output and limitations, domain/resource refusal and zero paid provider operations for evaluation.

### R8b.01 Implement a deliberately small expression grammar

**Owner:** Tools. **Depends:** R4.03 typed dispatcher. **Trace:** v1.3 §§3.9, 6.1, 6.3; M4.22, D41. **Model:** none.

**Current seams:** `packages/control-plane/src/explain-evidence.js` `sha256Hex` is reusable for result fingerprints; the baseline evidence contract is not a calculator. **NEW work:** create `packages/control-plane/src/roadmap/roadmap-calculate.js`, `test/roadmap-calculate.test.js`; register only after validation.

- [ ] Define `calculateExpression({expression,variables},limits)` using a tokenizer and parser for a documented arithmetic grammar. Initially permit finite numbers, bounded named numeric variables, parentheses and explicitly listed operators/functions.
- [ ] Refuse property access, strings, assignments, imports, network access, function construction and unlisted identifiers. Do not use `eval`, `new Function`, arbitrary package installation or uploaded code execution.
- [ ] Bound source characters, tokens, nesting, AST nodes, operation count, variable count and exponent/domain behavior before evaluation. Check every intermediate/result for finiteness and safe resource consumption.
- [ ] Specify precedence, associativity, unary minus, precision/rounding policy and division-by-zero handling; document that a finite floating-point answer is not an exact-arithmetic proof.
- [ ] Test precedence, signed powers, decimal values, variables, domain errors, overflow, NaN/Infinity literals, deep nesting and adversarial long expressions. Keep deterministic golden results and refusal codes.

**Task evidence:** The receipt includes the accepted grammar and concrete limit table plus tests proving prohibited syntax never reaches a dynamic execution primitive.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/roadmap-tools.test.js`

**NEW unit tests (create, then run from root):** `node --test packages/control-plane/test/roadmap-calculate.test.js`

### R8b.02 Bind computations to inputs, versions and checked claims

**Owner:** Tools; State/Money reviews evidence persistence. **Depends:** R8b.01, R4.09. **Trace:** v1.3 §§3.9, 6.2; M4.22/M4.23. **Model:** none for evaluation; validate premise/source bindings and deterministic tool results without adding an ordinary-text citation-review call.

**Current seams:** `packages/control-plane/src/explain-evidence.js` `evidenceRecord` hashes read bytes and `valueConflict` preserves disagreements; neither currently declares a computational-evidence schema. **NEW work:** extend current shared roadmap contract with `ComputationEvidence`; modify `roadmap-calculate.js`, `roadmap-tools.js`; create `test/roadmap-computation-evidence.test.js`.

- [ ] Return `{expression,inputs,result,evaluatorVersion,limitsVersion,inputHash,precision,limitations}` in an explicitly computational record. Use a discriminator validated independently of source excerpts; do not force a fake URL into the existing web evidence shape.
- [ ] Preserve input units and source/evidence references when supplied. Verify that variable values used by the evaluator equal the cited premises, and distinguish an arithmetic result from a claim that the model's assumptions are correct.
- [ ] Canonicalize/hash the exact expression, values and evaluator version; repeated inputs replay deterministically. A new source value produces a new computation identity.
- [ ] Allow checks to cite a verified derivation only after both premises and calculation pass. Unsupported or ambiguous unit conversion returns clarification/limitation rather than invented precision.
- [ ] Test tampered result, mismatched input hash, stale premise revision, unsupported units, rounding boundary and replay. No successful record may contain a non-finite value.

**Task evidence:** Attach an original source quantity → input binding → evaluated result trace and a rejected altered result; record no provider operation for deterministic evaluation itself.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/explain-evidence.test.js`

**NEW unit tests (create, then run from root):** `node --test packages/control-plane/test/roadmap-computation-evidence.test.js`

### R8b.03 Enable calculator independently and verify learner disclosure

**Owner:** Tools, UI and Verifier. **Depends:** R8b.01–R8b.02; R4 complete flow. **Trace:** v1.3 §3.9; M4.22, D41. **Model:** none additional.

**Current seams:** `packages/control-plane/src/learn-models.js` establishes central model roles; this deterministic tool requires no new role. **NEW work:** extend current `roadmap-tools.js`, `roadmap-policy.js`, computational-evidence output and citation display; create `test/roadmap-calculator-tool.test.js`, `e2e/roadmap-calculator-check.mjs`.

- [ ] Expose a separately flagged calculator capability with typed argument validation, current access/scope, deadline and bounded computational output. Its absence leaves source-supported R4 work available.
- [ ] Show the expression and meaningful precision/assumptions when they support the lesson; do not clutter ordinary content with internal evaluator IDs.
- [ ] Keep code examples clearly unexecuted unless they use this supported arithmetic tool. A JavaScript/Python snippet, uploaded script or arbitrary shell command is outside R8b.
- [ ] Exercise a derived numerical answer, invalid expression, exhausted operation bound, disabled capability and source value change. Verify errors lead to an honest limitation rather than a false “verified” label.
- [ ] Record tool invocation/count separately from model composition cost. Calculator operation itself creates no learner charge or paid provider operation.

**Task evidence:** Attach displayed derivation and refusal evidence. R8b's receipt is independent of R8a, arbitrary sandbox execution and rich-format adapters.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/roadmap-tools.test.js packages/control-plane/test/roadmap-policy.test.js`

**NEW unit tests (create, then run from root):** `node --test packages/control-plane/test/roadmap-calculator-tool.test.js`

**NEW local browser harness (create first; common prerequisites plus this rung’s fixtures):** `BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node packages/web/e2e/roadmap-calculator-check.mjs`. Record actual assertions and screenshots; a fixture route proves UI behavior only, not live provider quality.


### 6.6 R9 — Optional practice and assessed Progress

**Current status:** NEW Tutor practice/hidden-goal/keyed-snapshot integration. Current roadmap formats enable only explanation/table; quiz, Explain-back and flashcards are not enabled by their existing standalone UI. Retained Explain-back/rubric/visual assessment exists; deterministic roadmap quiz scoring is new. Accept/view/unanswered/flashcard reveal/self-rating never establish mastery; context/outcome/evidence, not a fixed 2:1 rhythm, chooses whether practice is useful.

**Browser-local prerequisites:** Use fixture generated cards with saved immutable quiz keys and supported Explain-back assessment doubles, plus two authenticated learner sessions. Keep the existing right-panel Progress tab separate from the ToC heading tree. Add NEW practice/flashcard harness assertions to current card renderers.

**Rung receipt:** One answered quiz, Explain-back, answer-later return, unsupported key with no adverse observation, a flashcard reveal/self-rate with no assessed evidence, private Progress reload and distinct accepted-generation versus free-assessment ledgers.

### R9.01 Bind delivered practice to a hidden private roadmap goal

**Owner:** State/Money. **Depends:** R4.02/R4.09, retained attempts/assessment interfaces. **Trace:** v1.3 §§3.10, 4.2; M9.1; D3/D26. **Model:** none.

**Current seams:** `packages/control-plane/src/learn-attempt-store.js` `bindExplainBackCard` is the content-addressed private binding precedent; `packages/control-plane/src/learn-coaching-store.js` `NOT_CARD_GOAL` hides only `lg_eb_`; reads goal state; `packages/control-plane/learn-migrations/0025-tutor-coaching-state.sql` constrains goal origin. **NEW work:** create `packages/control-plane/src/roadmap/roadmap-goal.js`, `test/roadmap-goal.test.js`; modify coaching-store predicates and attempt binding integration.

- [ ] Implement `ensureRoadmapGoal(access,{roadmapId,revision,targets})` using deterministic learner/board-scoped `lg_rm_` IDs and `origin:'coaching'`. Reuse goals, criteria and activities rather than adding a new origin or a second assessment system.
- [ ] Map each accepted outcome target to versioned criteria with explicit requirements. Keep unchanged criteria stable across a revision; changed requirements receive a new version so old evidence is not misapplied.
- [ ] Add `bindRoadmapActivity(access,{roadmapId,stepId,cardId,resultVersion})` for authorized delivered practice only. Recheck saved card/result binding; a browser-supplied prompt/key cannot replace server-owned assessment inputs.
- [ ] Widen the hidden-goal predicate to exclude both `lg_eb_` and `lg_rm_` from goal selectors, goal limits and personal-goal management. Never change the learner's active personal-goal pointer to this internal container.
- [ ] Provide a private roadmap-to-goal lookup for Progress even when the personal goal list is empty. Sharing/forks contain no inherited hidden goal, attempt, observation or private binding.
- [ ] Test idempotent creation, concurrent bind, criterion revision, crossed learner/canvas, forged card and empty personal-goal list. If additional binding storage is needed, allocate an additive `<NNNN>` migration only after inspecting the current schema.

**Task evidence:** Evidence shows private rows and no “Set a goal” prerequisite.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/learn-coaching-store.test.js packages/control-plane/test/learn-explain-attempts.test.js`

**NEW unit tests (create, then run from root):** `node --test packages/control-plane/test/roadmap-goal.test.js`

### R9.02 Bind quizzes to immutable question/options/key snapshots

**Owner:** State/Money and Tools. **Depends:** R9.01, R4.09 checks. **Trace:** v1.3 §§3.10, 6.2; M9.2; D32. **Model:** none for keyed scoring.

**Current seams:** `packages/web/src/LearningBlocks.jsx` `QuizBody` grades from local `option.correct`; `packages/control-plane/src/learn-assessment.js` `assess` retains Explain-back/rubric/visual handling and its fallback makes old journey-probe choices unavailable; P1 removed journey keyed/JEV grading; `packages/web/src/learn-coaching-contract.js` requires integer `activityRevision`; `packages/control-plane/src/learn-attempt-store.js` `acceptAttempt` preserves immutable submissions. **NEW work:** create `packages/control-plane/src/roadmap/roadmap-quiz.js`, `test/roadmap-quiz-snapshot.test.js`; add a scoped immutable-roadmap quiz scorer after retained Explain-back handling and before the generic unavailable fallback. Use the existing `keyed` route vocabulary with `checker:'roadmap_quiz_snapshot'` provenance; do not restore journey grading, JEV assessment or planner imports.

- [ ] Define `bindQuizCard(access,{cardId,resultVersion})` from authoritative delivered data. Canonicalize question, ordered stable option IDs/text, answer key, rationale and relevant source/check versions; put the content hash in `activityId`, for example `la_rq_<card-scope-hash>_<snapshot-hash>`.
- [ ] Keep `activityRevision` an integer, initially 1 for each immutable activity. Never put the hash into the integer revision column. Store the complete immutable key privately, separately from learner-visible prompt/options. Strip `correct` flags and private rationale from published roadmap quiz blocks and their Chat context; preserve ordinary legacy quiz behavior on its existing path.
- [ ] Return a binding with the displayed question snapshot. Submit its `activityId/activityRevision` with `optionId`; grade that saved snapshot if valid, even if a new card version now exists.
- [ ] If the named snapshot is unavailable or no longer safely assessable, return 409 `question_changed` with a fresh displayed question and require a new answer. Never automatically bind the old choice to a new key or option order.
- [ ] Unsupported/unknown evidence for a graded key yields unscored feedback and no negative observation. An invalid option is not a wrong-answer observation. Record checker provenance without exposing key internals in attempt responses.
- [ ] Test reordered options, changed key, render/submit race, retained old outcome, missing snapshot, duplicate submission and unsupported key. Keep the current legacy journey-probe cases unavailable with `no_answer_key` and no observations/provider call; a forged/non-roadmap choice cannot enter the new scorer. Inspect `describeBlock` at `packages/web/src/LearningBlocks.jsx` so roadmap Chat context cannot reveal private keys through existing quiz annotations.

**Task evidence:** Keep original/new snapshot IDs and unchanged old grading as proof.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/learn-assessment.test.js packages/web/src/learn-coaching-contract.test.mjs`

**NEW unit tests (create, then run from root):** `node --test packages/control-plane/test/roadmap-quiz-snapshot.test.js`

### R9.03 Commit assessment evidence and notification in one guarded batch

**Owner:** State/Money. **Depends:** R9.01–R9.02, R4.05. **Trace:** v1.3 §§3.10, 5.4; M9.5–M9.6. **Model:** deterministic keyed quiz: none. Explain-back: retain `tutor_rubric` → `claude-opus-5-5`; supported existing visual answers retain `tutor_visual`, not a new OCR capability.

**Current seams:** `packages/control-plane/src/learn-attempt-store.js` `claimAssessment`, `commitAssessment`, final status UPDATE; `packages/control-plane/src/learn-assessment.js` `assessAttempt`; `packages/control-plane/src/learn-explain-assessment.js` retained assessor; free-assessment test `packages/control-plane/test/learn-assessment-charging.test.js`, and keyless legacy-choice test. `packages/control-plane/src/learn-rubric-assessment.js` now imports the retained transport from `packages/control-plane/src/learn-spend.js` `spendCallModel`. **NEW work:** modify these narrow commit/routing points and create `test/roadmap-assessment-outbox.test.js`.

- [ ] Reuse accepted-attempt and single-claim semantics; no second rubric/quiz service and no extra paid assessment generated by the roadmap coordinator. Assessment remains free even when learner allowance is exhausted. Retain its free assessment usage context and `learn-spend.js` provider wrapper; do not recreate the removed Tutor planner dependency.
- [ ] Extend the existing `roadmap-store.js` `eventStatement` builder or introduce a narrowly scoped **NEW** `appendRoadmapEventStatements(fact)` builder; the latter name is a proposed interface, not a current export. Append the outbox statement inside `commitAssessment`'s observation/status batch, guarded by the same assessment ID, pending status and claim token. Insert before the terminal UPDATE while that guard remains true.
- [ ] Preserve the existing `results.at(-1)` success assumption by keeping status UPDATE last, or explicitly track its result index. A lost/reconciled claim must write neither observations nor an event.
- [ ] Deduplicate on actor/roadmap/assessment identity and actual fact revision. After commit, the R4 durable dispatcher owns retry; do not depend on a route-side call after `assessAttempt` returns.
- [ ] Deliver an event for terminal evidence availability with outcome/validity, not an invented success for failed/unavailable grading. R10 reads canonical evidence rather than trusting model-written notification payloads.
- [ ] Inject crashes after database commit and after outbox claim; test duplicate assessment replay, invalid observations, changed claim, platform-cap refusal and unknown evaluator outcome. Assert one assessment, applicable observations once, one replayable event and zero learner debit. Extend the current charging suite with the new deterministic roadmap-keyed path: no provider operation/usage row, unchanged learner balance; preserve its legacy keyless-choice regression and existing retained rubric/visual guards.

**Task evidence:** Retain the guarded batch and crash-recovery rows; a successful route response alone is insufficient proof.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/learn-assessment-charging.test.js packages/control-plane/test/learn-attempt-store.test.js`

**NEW unit tests (create, then run from root):** `node --test packages/control-plane/test/roadmap-assessment-outbox.test.js`

### R9.04 Support answer later and private Progress without conflating thumbs

**Owner:** UI; State/Money supplies reads. **Depends:** R9.01–R9.03, R1 feedback. **Trace:** v1.3 §§3.10, 2.5; M9.3–M9.4, M9.6. **Model:** none for reads/rendering; assessment calls remain R9.03.

**Current seams:** `packages/web/src/LearningBlocks.jsx` Explain-back submission, `QuizBody`; `packages/web/src/explain-back-service.js` binder and submit service; `packages/control-plane/src/learn-attempt-routes.js` ordinary binding route; `packages/control-plane/src/learn-attempt-store.js` history lookup; `packages/web/src/LearnProgress.jsx` holds the existing private-goal view and current-canvas self-report section; `packages/control-plane/src/learn-progress.js` `readProgress`; `packages/web/src/learn-coaching-contract.js` five statuses. **NEW work:** modify these UI/read integrations; add `packages/web/src/roadmap-practice.test.mjs`, `e2e/roadmap-practice-check.mjs`.

- [ ] Bind the shown quiz before answer submission and retain a stable submission key for retries of the same answer. Render server feedback; on 409 show the changed question and clear the selected answer only with an explicit new-answer state.
- [ ] Route roadmap Explain-back submission through the authorized `bindRoadmapActivity` result rather than the ordinary `/attempts/bind` path that creates `lg_eb_`. Extend attempt-history lookup to resolve the same authorized roadmap binding instead of unconditionally deriving `lg_eb_`; ordinary Practice keeps its existing path. Test answer → reload → Progress and assert the stored attempt belongs to the roadmap `lg_rm_` goal with matching criteria.
- [ ] Keep delivered practice answerable later. ToC answered/unanswered metadata is separate from delivery state; unanswered practice does not block the next context-based step or imply a failed assessment.
- [ ] Add a roadmap evidence section to existing Progress with outcome/criteria, evidence count and the retained five statuses. Read its private evidence container even with no personal goals; preserve pending/error display without fabricating a new status.
- [ ] Keep thumbs visible as self-reports, distinct from assessed observations. Already understood is an R10 control and stays unavailable until R10 ships; its later self-report must remain separate. Accepting/viewing flashcards or a quiz produces no demonstrated-mastery count.
- [ ] Test reload, a second device, answer-later return, duplicate submit, failed grading, privacy across boards and source revocation. Do not put private attempt state or answer drafts onto shared card content.
- [ ] Extend existing response leak assertions for quiz key/rationale and private provenance fields, while showing only the feedback intended for the learner.

**Task evidence:** Include private Progress screenshots and attempts/charges counts.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/web/src/learn-progress-client.test.mjs packages/web/src/explain-back-service.test.mjs`

**NEW unit tests (create, then run from root):** `node --test packages/web/src/roadmap-practice.test.mjs`

**NEW local browser harness (create first; common prerequisites plus this rung’s fixtures):** `BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node packages/web/e2e/roadmap-practice-check.mjs`. Record actual assertions and screenshots; a fixture route proves UI behavior only, not live provider quality.

### R9.05 Activate practice only through complete checked generation and scoring

**Owner:** Tools and Verifier; Lead owns registry updates. **Depends:** R9.01–R9.04, R4.07–R4.11. **Trace:** v1.3 §3.10; M4 practice activation, M5 practice extensions, M9.6. **Model:** retain deterministic proposal metadata where sufficient; if this practice extension needs model-authored metadata, reuse already-registered `roadmap_proposal`, Sonnet `claude-sonnet-5-5`, low, under an explicit bounded platform call. Accepted content reuses the existing `artifact` generator configuration, currently `claude-opus-5`; keep its existing transport/provider configuration and verify served model. Scoring uses R9.03.

**Current seams:** `packages/control-plane/src/learn-models.js` artifact task (using `ASK_MODELS.auto`) and retained `tutor_rubric`/`tutor_visual` roles; `packages/web/src/LearningBlocks.jsx` `QuizBody`, `FlashFace`, `RateButtons`; `packages/control-plane/src/learn-primitives.js` flashcards schema and `artifactBlock` validation. **NEW work:** extend current proposal/generation allowlist and checks for supported quiz/Explain-back/flashcards primitives; create `test/roadmap-practice-policy.test.js`, `test/roadmap-flashcards.test.js`, and `packages/web/src/roadmap-flashcards.test.mjs`. This adds bounded practice support; it does not wait for every R12 command adapter.

- [ ] Add Explanations plus practice to accepted roadmap settings only when its proposal, generation, immutable binding and assessment paths work end to end. Persist the setting with the accepted revision.
- [ ] Choose practice from context, outcome and evidence; no fixed two-explanations-to-one-practice rhythm. Allow explanations-only throughout, and avoid offering an unsupported practice format.
- [ ] Add `flashcards` explicitly to the trusted server practice allowlist. Reuse `PRIMITIVES.flashcards`: 2–12 cards, each exactly `{front,back}`, front 1–300 and back 1–600 characters; retain unknown-property refusal and add trimmed nonblank checks. Check each question/answer pair against retrieved original evidence, record coverage/limitations, and hold or omit unsupported answers rather than presenting them as verified. This requires no separate rich-command adapter.
- [ ] Extend full-step admission and publication checks to practice output. Validate key/rubric support before a practice result is offered as assessable; use existing hold/finite-resolution/refund behavior for unknown safety or failed cards.
- [ ] Separate chargeable accepted card creation from free later grading. The same accepted step cannot reserve twice, and assessment must not accidentally inherit its learner-funded usage context.
- [ ] Test flashcard accept, initial view, reveal/flip, Next and self-rating in both stepped and full-deck views. Those interactions create no attempt, assessment, assessed observation or demonstrated-mastery count, and no debit after accepted generation. Existing Got it/Not yet ratings remain self-report. Flashcard backs are intended delivered content, already present in the current DOM; do not treat reveal as a private-key gate. Add malformed/blank Q&A, excessive length/count, extra-property, unsupported-answer and public `allowedPrimitives` escape fixtures.
- [ ] Add deterministic policy fixtures for early/late practice, no meaningful check needed, unanswered prior practice and unsupported key. Test insufficient whole-step allowance, failure/refund and duplicate acceptance alongside the quiz/Explain-back flow.

**Task evidence:** R9 receipt includes one answered quiz, one Explain-back, one answer-later case, a grounded flashcard deck with reveal/self-rate producing no assessed evidence, separate generation/assessment accounting and no fixed-rhythm assertion.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/learn-artifact.test.js packages/control-plane/test/roadmap-money.test.js packages/control-plane/test/learn-assessment-charging.test.js`

**NEW unit tests (create, then run from root):** `node --test packages/control-plane/test/roadmap-practice-policy.test.js packages/control-plane/test/roadmap-flashcards.test.js packages/web/src/roadmap-flashcards.test.mjs`


### 6.7 R10 — Evidence-based adaptation and expanded revisions

**Current status:** NEW evidence-triggered adaptation and expanded revisions; `roadmap_adapt` is not registered. Current plan revision/lifecycle and R5 immutable version machinery are extension points. `roadmap_revise` already exists. Preserve explicit learner intent and the earliest unaccepted boundary; accepted and delivered work is immutable.

**Browser-local prerequisites:** Use deterministic adaptation decisions over wrong/conflicting/absent evidence, a paused/Ask roadmap and concurrent acceptance. Exercise current ToC conversation, NextStepPill and existing learner-invoked Rabbit Hole navigation; implement NEW adaptation/revision harnesses before running them.

**Rung receipt:** Canonical evidence fingerprints, accepted/unaccepted revision race, a focused question, Already understood as self-report, explicit Go deeper/return, original cards still usable, and no unsolicited resumption after Cancel.

### R10.01 Define bounded adaptation decisions from distinct evidence types

**Owner:** Tools. **Depends:** R1, R5 version contract, R9 assessed evidence. **Trace:** v1.3 §§3.11, 6.2; M10.1. **Model:** proposed `roadmap_adapt`, Opus `claude-opus-5-5`, no fallback, platform-funded; no new assessment role.

**Current seams:** `packages/control-plane/src/learn-attempt-store.js` `goalEvidence`; `packages/web/src/learn-coaching-contract.js` `applicable` filters completed/valid criterion-version evidence; `packages/control-plane/src/learn-progress.js` private read model. **NEW work:** create `packages/control-plane/src/agents/roadmap-adapt.js`, `test/roadmap-adapt.test.js`, `tests/evals/roadmap/adapt-cases.mjs`; extend current roadmap decision validator.

- [ ] Define a small output union: `none`, `revise_unaccepted`, `insert_prerequisite`, `ask`, or `adjust_coverage`, with target IDs, bounded reason and evidence references. The output proposes a transition; it never writes observations or authorizes generation.
- [ ] Build inputs from applicable assessed evidence, explicit learner instructions and self-reports in separate fields. Include criterion/source versions, assistance, unresolved/conflicting evidence and relevant prior delivered content.
- [ ] Make cancellation, acceptance, card viewing and unanswered practice neutral about mastery. Already understood may change coverage by learner instruction but cannot become a successful quiz/rubric observation.
- [ ] Write evaluation cases before tuning: conflicting thumbs and quiz evidence, wrong answer with several plausible causes, irrelevant card, already-understood declaration, missing prerequisite and uncertainty requiring one question.
- [ ] Bound calls/candidates and compare decisions with a recorded rubric: relevance, proportionate change, evidence fidelity, preserved learner control and no repeated irrelevant remediation. Fail schema/unsupported target outputs closed.
- [ ] Preserve the earliest unaccepted boundary and accepted ceiling in the validator, not just the prompt.

**Task evidence:** Implement an offline-fixture default. Live candidates require recorded bounded authorization and log actual served model/cost; retain scored cases and rejected transitions.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/learn-progress.test.js packages/control-plane/test/roadmap-contract.test.js`

**NEW unit tests (create, then run from root):** `node --test packages/control-plane/test/roadmap-adapt.test.js`

**NEW offline evaluation (create an offline-fixture default first):** `node tests/evals/roadmap/adapt-cases.mjs`. Live model mode is a separate bounded authorized sample and must record served model/cost.

### R10.02 Apply evidence-triggered changes through replayable version guards

**Owner:** State/Money. **Depends:** R10.01, R9.03, R1 feedback event integration, R4.05. **Trace:** v1.3 §§3.11, 5.4; M10.2 and adaptation portions of M11. **Model:** R10.01's proposed adaptation role, no extra model in the event writer.

**Current seams:** `packages/control-plane/src/learn-attempt-store.js` guarded assessment commit; `packages/control-plane/src/learn-coaching-store.js` `applyCoachingAction` is the existing revision-guarded batch precedent. **NEW work:** modify current `roadmap-jobs.js`, `roadmap-store.js`, feedback store and outbox consumer; create `test/roadmap-adapt-events.test.js`.

- [ ] Enter an adapting stage only for relevant durable assessment, feedback or explicit instruction events. Feedback's own fact/outbox write stays atomic; no route-after-return notification pattern is introduced.
- [ ] Claim the event, read canonical latest evidence and persist the input fingerprint/stage before a bounded model call. Coalesce superseded observations while preserving audit identity; a claim alone is never completion.
- [ ] Guard application with expected roadmap revision, evidence version and current mode. If a learner accepted the target while adaptation ran, do not rewrite that accepted generation; re-evaluate the earliest still-unaccepted work or return no change.
- [ ] Supersede only the affected unaccepted proposal and invalidate its checks/drafts. Keep delivered card IDs, assets, original accepted result binding and charges intact.
- [ ] Commit the chosen transition and processed marker together through `commitRoadmapEventEffect`; external composition/check stages keep resumable checkpoints. Before unsolicited adaptation and again before applying/revealing it, require Auto-suggest on, eligible Auto/Tutor mode and no explicit Cancel/pause/End. Turning Auto-suggest back on never clears an explicit Cancel; only the learner’s explicit resume does. Learner-requested revision actions keep their separate authorization.
- [ ] Test duplicate event, lease crash, newer contradictory evidence, feedback toggles, concurrent acceptance, stale source, reversed event order and Auto-suggest off/on after Cancel. The latter must remain paused until explicit resume. Assert one applicable successor and no invented mastery/extra debit.

**Task evidence:** Save a conflicting-evidence trace and a race proving earlier delivered content and entitlements survive adaptation.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/roadmap-events.test.js`

**NEW unit tests (create, then run from root):** `node --test packages/control-plane/test/roadmap-adapt-events.test.js`

### R10.03 Add prerequisites, focused questions and learner-chosen Rabbit Holes

**Owner:** UI and Tools; Lead integrates Chat routing. **Depends:** R10.01–R10.02, R4.12. **Trace:** v1.3 §3.11; M10.3–M10.5. **Model:** use the proposed adaptation role for complex choice; reuse the retained qualified routing path for explicit Chat intent. No new routing framework.

**Current seams:** `packages/web/src/canvas-actions.js` current action registry, `packages/control-plane/src/chat-modes.js` `chatSystem`; `packages/web/src/learn-progress-question.js` `askTutorAbout` preserves prefill behavior. **NEW work:** extend current `TableOfContents` in the existing ToC integration and `RoadmapPlan.jsx`, `NextStepPill.jsx`, Chat action adapter and `roadmap-store.js`; create `packages/web/src/roadmap-adapt-ui.test.mjs`, `e2e/roadmap-adapt-check.mjs`.

- [ ] Insert a justified prerequisite before the earliest unaccepted step on the same canvas, with a visible reason and checked proposal. Include it in the accepted step ceiling; a larger plan requires the learner's revised-plan acceptance.
- [ ] When evidence cannot distinguish causes, ask one focused question linked to the relevant step/source. Keep the roadmap questioning state durable; a focused question is not an implicit generation authorization.
- [ ] Add Already understood as a versioned learner coverage action. Keep its provenance as self-report and preserve any contrary assessed evidence.
- [ ] Wire Go deeper only to the learner-invoked existing Rabbit Hole flow. Store a return point containing roadmap/step/version and navigation context; the Tutor must never open a new canvas or branch automatically.
- [ ] Preserve Chat drafts and require Send for prefills. Test cancel/back from the Rabbit Hole flow, missing return target, a revised roadmap on return and no duplicate proposal.
- [ ] Exercise prerequisite, clarification, Already understood and voluntary deeper exploration in the actual current UI, with keyboard and mode behavior preserved.

**Task evidence:** Capture the learner action that opened the Rabbit Hole and the successful return, alongside unchanged assessed-evidence rows.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/web/src/roadmap-controller.test.mjs packages/web/src/roadmap-view.test.mjs`

**NEW unit tests (create, then run from root):** `node --test packages/web/src/roadmap-adapt-ui.test.mjs`

**NEW local browser harness (create first; common prerequisites plus this rung’s fixtures):** `BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node packages/web/e2e/roadmap-adapt-check.mjs`. Record actual assertions and screenshots; a fixture route proves UI behavior only, not live provider quality.

### R10.04 Include additional sources and request different versions safely

**Owner:** State/Money, Tools and UI. **Depends:** R5.01/R5.04, R9, R10.02; use only shipped source adapters. **Trace:** v1.3 §§3.11, 4.3–4.4; M11.1, M11.3–M11.4, grouped-source M4 extensions. **Model:** registered `roadmap_revise`, Opus `claude-opus-5-5`, platform-funded; subsequent accepted generation keeps its adapter's existing model.

**Current seams:** `packages/web/src/context-docs.js` `uploadContextSource`; `packages/control-plane/src/learn-context-docs.js` source/hash authorization; `packages/control-plane/src/learn-attempt-store.js` immutable attempt precedent. **NEW work:** extend current `roadmap-store.js`, `roadmap-routes.js`, `roadmap-lifecycle.js` / `roadmap-planning.js` (NEW expanded-revision behavior), `TableOfContents` in the existing ToC integration and `RoadmapPlan.jsx`; create `test/roadmap-expanded-revisions.test.js`, `e2e/roadmap-revise-check.mjs`.

- [ ] Define `proposeRoadmapRevision(access,{roadmapId,expectedRevision,change,actionKey})` for `include_source`, settings/scope changes and `redo_step`. Resolve any additional source with access, immutable version and declared coverage before composition.
- [ ] If source relationship is unclear, ask one focused question and keep a durable questioning revision. Incorporation changes the proposed plan only; require its explicit acceptance before using the expanded scope.
- [ ] Preserve original learner instruction and version later edits. Show what changes and include all delivered/prerequisite steps in the ceiling calculation; explicit continuation is required past the agreed stopping point.
- [ ] Different version creates a fresh checked proposal at the relevant position and requires fresh acceptance. Earlier delivered cards/assets remain usable; only private ToC relationship metadata indicates replacement, never deletion or accepted-result expiry.
- [ ] Supersede affected unaccepted drafts/results only. Do not activate speculative preparation here; R11 later extends the same invalidation rules. No charge occurs for drafting/revising, and new accepted generation uses R4 atomic full-step admission.
- [ ] Test duplicate revision action, concurrent acceptance, changed/deleted second source, unsupported adapter, cancelled redo, delivered-asset survival, cross-device resume and continuation at the ceiling.

**Task evidence:** R10 receipt includes original/new plan versions, original card still accessible, one new accepted action where generation occurred and a stopped-at-outcome case.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/roadmap-money.test.js`

**NEW unit tests (create, then run from root):** `node --test packages/control-plane/test/roadmap-expanded-revisions.test.js`

**NEW local browser harness (create first; common prerequisites plus this rung’s fixtures):** `BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node packages/web/e2e/roadmap-revise-check.mjs`. Record actual assertions and screenshots; a fixture route proves UI behavior only, not live provider quality.


### 6.8 R11 — Platform-funded preparation with separate learner settlement

**Current status:** NEW platform-funded preparation and prepared-result learner settlement. R6 currently composes metadata only. Initial eligibility is lightweight ordinary text/table; expensive media and paid content-plan stages remain after acceptance. Reuse is scoped to the same authorized learner/result; do not implement cross-user reuse. Platform speculation cost and learner charge for accepted content are separate. No Tutor prices are displayed.

**Browser-local prerequisites:** Implement NEW preparation harness with fixture provider operations, a local private result store and deterministic clocks; use two sessions of the same learner for race/replay. Test direct pending-body/asset URLs before acceptance and known/unknown reconciliation. Use real paid work only where already authorized for a bounded specific sample.

**Rung receipt:** N pending/N+1 privately prepared with one next position, operation-to-result mapping, platform expense, accepted learner charge/refund exactly once, zero provider expense at prepared acceptance, denied preaccept reads, invalidation/expiry races and latency hit/miss measurements.

R11 starts only after R6 automatic proposals and R5’s immutable proposal-version contract work. It builds on R4’s identity, whole-step authorization, publication and outbox contracts. A prepared result may be generated and checked while its decision remains `none`; that never grants access. Preparation expense belongs to the platform. Acceptance creates learner accounting once, without a second provider operation.

### R11.01 Schedule only eligible preparation under platform usage

**Owner:** State/Money and Tools. **Depends:** R4.05–R4.09, R5.01 version contract, R6.01–R6.03. **v1.3:** §§3.12, 5.1, 5.5; D14, D20, D25. **Legacy:** M7.1, M7.3–M7.4/M7.8 preparation portion. **Model:** reuse the eligible adapter’s current generation role; all speculative calls use `withSystemUsage`. Ordinary Markdown text/table keeps one author call with `repairs: 0`, full supported source context plus accepted brief, and no LLM citation checker/escalation. Retain contextual safety and deterministic format/access/version/billing checks.

**Current seams:** `packages/control-plane/src/learn-usage.js`; `packages/control-plane/src/learn-artifact.js`; `packages/control-plane/src/explain-job.js` illustrates paid brief gating that must not be bypassed. **MODIFY current seams:** `roadmap-policy.js`, `roadmap-jobs.js`, `roadmap-generate.js`, `roadmap-money.js`; add `roadmap-preparation.test.js`.

- [ ] Add a separate speculative capability flag and explicit per-adapter eligibility registry. Initially permit only qualified lightweight text/table paths. Expensive media and paid planning remain acceptance-first; a command label such as `/explain` does not imply every path is eligible.
- [ ] Add a separate trusted `prepareRoadmapResult(env,access,{preparationPermitId,resultId,resultVersion})` entry. Validate speculative eligibility, current source/proposal fingerprint, platform quota and decision `none`; never weaken accepted-only `generateRoadmapCard` or expose a public `skipAcceptance` option. While N is pending, prepare only the eligible bounded N+1 candidate identified by R6, within the one-next-position contract. Persist candidate/version/source/Depth/instruction fingerprints, card slots and call checkpoints before work. No preparation can implicitly accept its own result or the current proposal.
- [ ] Reserve platform dollar/call/token and per-learner work quotas before every preparation call, using trusted stable identities distinct from ordinary accepted generation. A platform context is real usage context; a ledger category is merely labeling. Admit concurrent calls against the same caps and release known unused quotas.
- [ ] Store output privately, run the applicable actual-output safety/schema/tool checks and keep decision `none`. Recheck current source/proposal/settings/access fingerprint before reuse; if nothing relevant changed, reuse valid cached checks. Unknown safety or invalid format/access/version remains held with finite resolution. A missing citation-quality verdict must never hold ordinary Markdown text/table; its citation check remains `not_run` under the adopted contract.
- [ ] Add preparation timing separately from R6 proposal-readiness and R4 accepted-generation time. A 1–2 second goal does not skip validation or reserve unlimited background work. Test zero preparation with flag off, Ask/Auto-suggest paused, quota refusal, unsupported command and expensive planning; assert zero learner usage during successful preparation. Prove preparation cannot consume a learner allocation and an ordinary accepted call cannot spoof a preparation permit.
- [ ] Run the focused unit commands below and retain call/usage traces for N-pending/N+1-prepared without a second offer or unbounded sequence.

**Done evidence:** eligible-path matrix, platform payer proof, private polling response and separate latency/cost measurements. Automatic proposal composition alone remains a supported R6 capability when preparation is disabled.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/roadmap-quota-repair.test.js packages/control-plane/test/roadmap-events.test.js packages/control-plane/test/roadmap-loop.test.js`

**NEW unit tests (create, then run from root):** `node --test packages/control-plane/test/roadmap-preparation.test.js`

### R11.02 Persist every contributing provider operation and reconcile before sale

**Owner:** State/Money; Verifier reviews attribution. **Depends:** R11.01 and R4.06. **v1.3:** §5.3; D15, D31. **Legacy:** corrected M7.2, M7.3. **Model:** none for accounting/reconciliation.

**Current seams:** `packages/control-plane/src/learn-usage.js` writes `usage_attempt_detail` pricing data and provides `refundAttempt`/`refundActionByKey`; `packages/control-plane/src/telemetry-provider-spend.js` `providerSpend` reads `usage_operations`. These existing usage projections do not establish the NEW prepared-result-to-operation reconciliation/charge sidecars below; first reuse any operation mapping supplied by an independently implemented adapter. **NEW files/contracts:** `<NNNN>-roadmap-prepared-accounting.sql`, proposed `learn_result_provider_operations`, `learn_result_reconciliations`, `learn_result_learner_charges`, `learn_learner_charge_operations`; extend `roadmap-money.js`.

- [ ] Map each result version to all contributing operations: provider op ID, stage/call/retry identity, requested/served model, immutable response/output fingerprint, provider-cost state, attributed micro-cost, charge eligibility and price-policy version. Use compound uniqueness to prevent duplicate links. A rich adapter result with multiple authorized generation/repair/safety operations is never reduced to one `providerOpId` column. Ordinary text/table preparation still has one author call and no citation-review or repair call.
- [ ] Define `reconcilePreparedResult(access,resultVersion)` to perform provider/ledger reconciliation outside the final charge transaction, then persist a reconciliation revision and fingerprint over the complete operation set and relevant terminal states. Distinguish settled measured expense, documented estimate, reserved and unknown; unchanged reservation value is not proof of measured cost.
- [ ] Mark calls designated platform-only, including checks and failed work according to the approved policy, as excluded from learner price. Name the included successful generation calls and deterministic price policy explicitly; do not automatically charge the sum of every background attempt. Shared call attribution must never multiply original provider expense when one call contributes to multiple result rows.
- [ ] Make reconciliation changes invalidate the old fingerprint. An unknown/admitted operation prevents consumption of prepared acceptance until resolved; failed unusable preparation cannot be sold as a successful result. A fallback to ordinary generation is a separately authorized bounded path, not a hidden second provider call inside prepared settlement.
- [ ] Add database constraints and fixtures for ordinary single-author preparation plus a separately eligible multi-operation rich adapter, one call attributed across same-learner outputs, missing mapping, duplicated stage/call, model mismatch, late reconciliation, unknown cost and policy-version mismatch. Preserve minimal mapping/audit information after later asset expiry.
- [ ] Run the focused unit commands below. Assert global provider totals count unique operations once, learner eligible cost excludes platform-only work and acceptance observes a complete immutable mapping snapshot.

**Done evidence:** a sample result-to-many-operations table and reproducible reconciliation hash. No network request remains inside the atomic learner-charge boundary.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/telemetry-provider-spend.test.js`

**NEW unit tests (create, then run from root):** `node --test packages/control-plane/test/roadmap-prepared-reconciliation.test.js`

### R11.03 Charge the complete prepared step atomically without provider expense

**Owner:** State/Money; Verifier reviews the focused accounting change. **Depends:** R4.07/R4.09/R4.11, R11.02. **v1.3:** §5.3; D6, D24, D31, D38. **Legacy:** corrected M7.2 and M5 billing/replay extensions. **Model:** none; no provider transport is invoked by prepared acceptance.

**Current seams:** `packages/control-plane/src/learn-usage.js` balance/refund calculation and `packages/control-plane/src/learn-spend-ledger.js` `admitSpend` atomic per-call admission pattern. **MODIFY current seams:** `roadmap-money.js`, `roadmap-store.js`, usage statement-building seam through Lead. **NEW tests:** `roadmap-prepared-money.test.js` and concurrency/crash fixtures.

- [ ] Implement `admitLearnerCharge` as a statement builder/transaction participant within `acceptPreparedStep`, never a helper that commits independently. One guarded batch validates actor/access, current proposal/result versions, passing applicable safety/schema/access checks (ordinary citation status `not_run` is valid under the adopted policy), accepted-content fingerprint and persisted complete reconciliation fingerprint before any debit or decision is consumed.
- [ ] Check entire offered step allowance including all prepared cards and any ordinary-generation allocations. Either atomically settle every included prepared charge with the accepted decision, or reserve the whole mixed step before card settlement. Insufficient balance leaves proposal pending and acceptance unconsumed with no partial purchase. A true existing-card link records explicit zero price without a balance requirement.
- [ ] Insert learner `usage_attempts` under the stable accepted usage action using a learner-charge identity distinct from provider op IDs; record charge/result and charge-to-all-operation mappings in the same batch. Do not insert `usage_operations`. Include settled learner amounts/refunds in the existing common balance calculation, with price-policy provenance separate from provider expense.
- [ ] Read existing charge status and refunds on replay; row existence is not evidence that the result remains paid. A refunded charge returns refunded/unavailable state and cannot authorize publication or be silently recharged. Historical accepted versions remain valid after later proposals when their own billing/check/access conditions hold.
- [ ] After whole-step acceptance, settle/refund by card. Lost placement acknowledgement reconciles the existing board/card and reuses entitlement. A terminal failed card is refunded without altering delivered siblings or original platform expense. Explicit recovery follows R4.11 with new authorization rather than resurrecting the former charge.
- [ ] Run the focused unit commands below. Race two devices; inject failure at every batch boundary; test stale checks/reconciliation, balance enough for one card only, mixed prepared/unprepared step, zero link, replay after refund and lost acknowledgement. Assert net learner usage changes once while provider operation count and dollar totals are exactly unchanged by acceptance.

**Done evidence:** independently reviewed SQL/transaction proof and before/after learner/provider totals. The implementation must fail if a charge survives without its accepted decision, or decision survives without its complete financial authorization.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/roadmap-money.test.js packages/control-plane/test/learn-usage.test.js`

**NEW unit tests (create, then run from root):** `node --test packages/control-plane/test/roadmap-prepared-money.test.js`

### R11.04 Invalidate precisely and expire only unaccepted preparation

**Owner:** State/Money with UI status integration. **Depends:** R5.01 immutable versions, R4.05/R4.12, R11.01–R11.03. **v1.3:** §§3.12, 4.3, 5.4–5.5; D16, D25, D35. **Legacy:** M7.3–M7.5/M7.9, speculative M11.1/M11.4. **Model:** none for invalidation/retention; any required new checks use existing platform check roles.

**Current seams:** `packages/web/dev-worker.js` daily cleanup hook and `packages/control-plane/src/learn-boards.js` `getAsset`/`boardAsset` boundaries. **NEW files/contracts:** `packages/control-plane/src/roadmap/roadmap-expiry.js`, `roadmap-expiry.test.js`; modify current event/job/result stores and Lead’s existing cron integration.

- [ ] On relevant source, instruction, Depth, scope or applied proposal revision, mark affected unaccepted result/check fingerprints stale and supersede their binding. Retain unaffected cached work only when its complete dependency fingerprint still matches. Earlier delivered cards/results remain accepted and keep assets/history.
- [ ] Pause/Cancel/Ask/end stops unnecessary queued work and attempts transport cancellation where possible. A cancellation signal does not establish no provider cost; reconcile dispatched calls and preserve their operations. Already accepted work follows the delivery/refund deadline, and disabling speculation does not disable ordinary accepted generation.
- [ ] Define retention clocks exactly: cancelled/superseded unaccepted results use decision time; undecided preparation uses last learner activity. Thirty days is the carried proposed configurable default, not a claim of operational approval. Pause/completion/end alone never immediately expires bytes.
- [ ] Use daily retention cleanup to select only unaccepted eligible results and immutable associated objects. Guard expiry against concurrent acceptance in the durable store before deleting bytes; if acceptance wins, deletion must not run. Accepted assets always follow delivered-card lifecycle, including when their position gets a later version.
- [ ] Delete eligible bytes idempotently and retain minimal decision/cost/mapping records plus deletion checkpoint. Retry failed R2 deletion safely without making expired content deliverable. Scheduled event/check retries stay on R4’s timely dispatcher/alarms; do not replace them with a daily scan of idle roadmaps.
- [ ] Run the focused unit commands below: fake-clock each retention origin, pause/resume, end, replacement, accepted old media, acceptance-versus-expiry race, missing object, partial delete and unknown canceled call. Assert accepted assets survive every speculative cleanup path.

**Done evidence:** deletion selection query, race trace and retained audit rows. An ordinary pause never destroys learner content or refunds a valid delivered card.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/roadmap-events.test.js packages/control-plane/test/roadmap-recovery.test.js`

**NEW unit tests (create, then run from root):** `node --test packages/control-plane/test/roadmap-expiry.test.js packages/control-plane/test/roadmap-preparation.test.js`

### R11.05 Report preparation costs and verify reuse under failures

**Owner:** Verifier and State/Money; Lead prepares capability receipt. **Depends:** R11.01–R11.04. **v1.3:** §§3.12, 8; D15, D20, D39. **Legacy:** M7.1/M7.6/M7.8, prepared accounting matrix. **Model:** current eligible adapter and safety roles; real evaluation uses only an already-authorized bounded sample and records actual spend. Ordinary text/table has no citation-check role.

**Current seams:** `packages/control-plane/src/telemetry-provider-spend.js` (`providerSpend`), `packages/control-plane/src/learn-models.js` logging. **Modify:** existing owner telemetry projection/routes, proposed runtime capability flag and evidence harness; **NEW files/contracts:** proposed `roadmap-prepared-check.mjs`, report tests. No new learner-facing price display.

- [ ] Extend the established owner telemetry surface with platform preparation expense by day, decision and eligible adapter; show settled expense, reserved/unknown bounds, learner charges and refunds separately. Count original provider operations once before joining sidecars, avoiding fan-out multiplication from result and charge mappings.
- [ ] Measure N-delivery→proposal-ready, preparation-start→checked-result-ready, Accept→delivered, prepared hit/miss rate, invalidation/waste, unknown rate and provider versus learner micro-cost. Report cold and reused flows separately; do not credit speculative generation for a proposal-only speedup.
- [ ] Implement and run the NEW local browser harness below: prepare one card, attempt direct body/asset reads before acceptance, accept from two devices, receive one card/charge, lose acknowledgement, reload and confirm no new debit or provider expense. Cancel a second prepared candidate and verify zero learner charge.
- [ ] Exercise crash points before/after provider admission, response persistence, reconciliation, atomic acceptance, placement save and refund; include unknown operations, insufficient aggregate balance, stale source/Depth/proposal, concurrent expiry and a flag-off restoration. Reconcile each trace to persisted operation, charge and card IDs.
- [ ] Run the focused unit commands below plus the checks affected by the changed files. Have Verifier independently compute provider totals from unique operation rows and learner totals from usage/refund records, rather than trusting the new report’s own implementation.
- [ ] Enable the separate preparation capability for its implemented eligible paths using the adopted direct-production/focused-check workflow and this rung’s actual version, privacy and accounting evidence; do not require a clone, preview tier, unrelated adapter, or broad release gate. If preparation is disabled or fails qualification, leave supported R4 generation and R6 proposals usable. Additional formats qualify independently; Animation remains with its existing owner.

**Done evidence:** one complete prepared acceptance from two devices, canceled preparation without learner debit, unchanged provider totals at acceptance and old delivered assets preserved after revision. Report remaining classifier uncertainty and measured latency honestly; do not manufacture zero-cost or instant-readiness guarantees.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/telemetry-provider-spend.test.js`

**NEW unit tests (create, then run from root):** `node --test packages/control-plane/test/roadmap-prepared-report.test.js packages/control-plane/test/roadmap-prepared-money.test.js packages/control-plane/test/roadmap-expiry.test.js`

**NEW local browser harness (create first; common prerequisites plus this rung’s fixtures):** `BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node packages/web/e2e/roadmap-prepared-check.mjs`. Record actual assertions and screenshots; a fixture route proves UI behavior only, not live provider quality.


### 6.9 R12 — Independently released command adapters

**Current status:** All R12 Tutor adapter bindings are NEW at this baseline; existing standalone commands and engines are present. Enable and verify one adapter at a time using its own prerequisites and relevant checks. `roadmap-adapters/` is a proposed directory under the current roadmap module namespace. Do not create a second contract/payer/publication authority.

**Browser-local prerequisites:** For each chosen adapter, use its existing current renderer/command service and a NEW Tutor binding fixture, with services/images/workers provisioned only where that adapter needs them. Existing R4 browser harnesses exercise core UI, not these adapters; some old MVP recovery assertions predate the removed duplicate status/recovery UI and must be updated without restoring that UI.

**Rung receipt:** Per adapter: accepted offer and material-review fingerprint, requested/served models, every provider operation and phase payer, actual output/modality evidence, one placement after replay/reload, denied private reads, refund/recovery and disabled unsupported formats. A disabled unrelated adapter is not a release blocker.

The command paths below were reconciled to main `fe2bf0f79c6a355a36c9b958bd82933a966620fc`. All Tutor adapters in this rung are **NEW**; existing standalone engines do not establish a completed Tutor integration. Each enabled adapter has its own focused implementation and receipt. R11, R13–R16 and other R12 adapters are dependencies only where the specific behavior needs them. No all-adapter gate or extra preview/clone is required.

The catalogue is complete: `/explain` text/table belongs to R4, while its interactive addition is R12.09; `/practice`, `/quiz` and `/flashcards` belong to R9 and retain their immutable-activity and free-assessment requirements. R12.02–R12.08 and R12.10–R12.17 cover the remaining fifteen commands. `/goal` is learner-only and excluded. Command labels must follow the actual catalogue: `/image` uses ID `generate-image`; `/photos` uses ID `image`; `/whiteboard` uses ID `whiteboard-video`. The legacy internal editable-whiteboard tool is not this video command. Existing definitions: `packages/web/src/agent/slash.js`; Learn dispatch: `packages/web/src/learn-slash.js`.

### R12.01 Register the accepted-command boundary and per-adapter release checks

**Owner:** Lead, State/Money, Tools; **Depends:** R4 accepted-step, reservation, publication and placement contracts; R5 proposal/version/review contract; R2 Depth/settings; R3 references. **Trace:** v1.3 §3.13, §§4–6, D24/D38; M5.3/M5.14, M8.2–M8.6. **Model:** none in registry; retain each command's actual route below.

**Current seams:** `packages/control-plane/src/learn-artifact.js` `artifactPlan/generateArtifact`; `packages/web/src/learn-slash.js` `generateCommand`, `packages/web/src/agent/slash.js`; `packages/control-plane/src/learn-models.js`. **NEW files/contracts:** `packages/control-plane/src/roadmap/roadmap-adapters.js`, `packages/control-plane/src/roadmap/roadmap-adapters/contract.js` as a narrow adapter facade importing the canonical `packages/control-plane/src/roadmap/roadmap-contract.js` (no duplicated enums or authorization schema), `packages/control-plane/test/roadmap-adapters.test.js`; **Modify:** current R4 generation coordinator and Lead-owned capability registry/check-map; reuse canonical `packages/control-plane/src/roadmap/roadmap-policy.js` limits.

- [ ] Define `startAcceptedCommand(access,binding,payload)` returning typed status, command job ID, result ID and provider-operation IDs. Bind board, learner, plan/proposal revision, acceptance, card, phase and authorization bound; request-body identities cannot replace server values.
- [ ] Declare command, supported primitive, explanation/practice purpose, review stages, phase payer, check policy and eligibility per adapter. Tutor proposal composition and checks use platform usage; existing paid command planning/generation starts only after bound acceptance and uses its accepted learner allocation. Deterministic plan signing creates no provider operation. Register text/table and three R9 practice commands by reference; prevent unknown/disabled commands entering proposals.
- [ ] Consume R4's full-step allowance authorization once. Adapt nested command admission without a second learner reservation. Persist every contributing operation through R4's call/result bindings; if a command needs an additional result-to-operation sidecar, add its CREATE-only migration here and let R11 reuse it. This independent adapter must not require the later R11 schema. Retain command-specific refund reconciliation and separate provider expense from learner price.
- [ ] Route every job/result/asset read through the same accepted-entitlement and check predicate. Keep unsigned public `allowedPrimitives` ineffective; compare material review/format/duration changes before additional spending. Suppress prices throughout desktop Tutor, including typed paid-command reviews in Tutor; preserve existing price display in Auto/Ask and standalone command flows outside Tutor.
- [ ] Create parameterized duplicate-acceptance, stale-version, cancellation, insufficient-allowance and direct-result-read fixtures, then run each only for its enabled adapter. Add a receipt template recording exact supported checks and disabled modalities.

**Task evidence:** Assert all nineteen catalogue commands have one release assignment, no unsupported primitive executes, and simultaneous accepts yield one card. **Done evidence:** registry diff plus one adapter's receipt can merge independently; an unrelated disabled adapter does not block the selected implemented adapter.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/roadmap-tools.test.js packages/control-plane/test/roadmap-money.test.js`

**NEW unit tests (create, then run from root):** `node --test packages/control-plane/test/roadmap-adapters.test.js`

### R12.02 Add the /code snippet adapter

**Owner:** Tools, UI; **Depends:** R12.01; R9 only for scored practice. **Trace:** §3.13, D41; M5 non-text/M8. **Model:** existing `LEARN_TASKS.artifact`, configured `claude-opus-5` through `planModel`; explicit configured OpenAI opt-in is preserved and logged, not silently claimed as Opus.

**Current seams:** `packages/control-plane/src/learn-primitives.js` `code_sample` (under 60 lines, no output claim); `packages/control-plane/src/learn-artifact.js`; `packages/web/src/agent/slash.js`. **NEW files/contracts:** `packages/control-plane/src/roadmap/roadmap-adapters/code.js`, `packages/control-plane/test/roadmap-code.test.js`; **Modify:** proposed registry and current snippet renderer only for execution-state metadata.

- [ ] Freeze prompt, supported Python language, source ranges and purpose into accepted payload; allow only ready `code_sample`, since `code_exercise` remains unavailable at `packages/control-plane/src/learn-primitives.js`.
- [ ] Call existing artifact generation and validation under the accepted card identity; preserve Depth without changing snippet limits or allowing arbitrary extra primitives.
- [ ] Persist `executionStatus:unexecuted` and source references; omit fabricated stdout, timing and success claims. A practice-purpose snippet is an exercise prompt, not evidence of mastery.
- [ ] Validate code text and explanatory claims before publication; retain failed-card refund and replacement behavior.
- [ ] Test code longer than sixty lines, wrong-language output, duplicated acceptance and text claiming execution; verify a practice snippet creates no assessment without R9's explicit attempt route.

**Task evidence:** **Done:** one explanation snippet and one unscored practice snippet survive reload with stable IDs; R16 stays disabled and no execution service is invoked.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/learn-artifact.test.js`

**NEW unit tests (create, then run from root):** `node --test packages/control-plane/test/roadmap-code.test.js`

**Adapter browser record:** With the R12 common local prerequisites and only this adapter enabled, exercise its current renderer and the acceptance/reload/refusal cases above. Add a narrowly scoped harness to the selected adapter or record the same focused manual steps; no existing Tutor browser filename is asserted for this NEW adapter. Record actual modality coverage and the accepted card/job/operation IDs.

### R12.03 Add /graph with checked function and data provenance

**Owner:** Tools, UI; **Depends:** R12.01; R8b only when calculator evidence is actually used. **Trace:** §3.13/§6.2; M5/M8. **Model:** reuse `LEARN_TASKS.artifact` as R12.02.

**Current seams:** `packages/control-plane/src/learn-primitives.js` `interactive_graph/data_plot`; `packages/web/src/agent/slash.js`; `packages/control-plane/src/learn-artifact.js`. **NEW files/contracts:** `packages/control-plane/src/roadmap/roadmap-adapters/graph.js`, `packages/control-plane/test/roadmap-graph.test.js`; `packages/web/src/roadmap-graph.test.mjs`.

- [ ] Classify `/graph` as explanation only and admit only Desmos function graphs and supported Plotly traces; do not enable unavailable `knowledge_graph` merely because it appears in the command family.
- [ ] Freeze axes, domains, units, slider ranges and numeric-data source into the accepted payload. An increase in scope or a changed dataset revises the proposal.
- [ ] Keep illustrative data explicitly labelled; require original-passage or computation references for numbers presented as measured or derived. Do not convert an illustrative trace into learning evidence.
- [ ] Run existing graph schema checks and the current renderer against finite/domain-boundary fixtures; screen labels, annotations and rendered content rather than only the brief.
- [ ] Persist interaction defaults independently of the source snapshot; reloading or changing a slider does not regenerate or charge. Test malformed traces, NaN/infinity, missing units and forbidden remote script data.

**Task evidence:** **Done:** receipt shows a supported function and source-backed plot rendered in the current canvas; failed graphs remain unpublished and the adapter flag can ship alone.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/learn-artifact.test.js`

**NEW unit tests (create, then run from root):** `node --test packages/control-plane/test/roadmap-graph.test.js packages/web/src/roadmap-graph.test.mjs`

**Adapter browser record:** With the R12 common local prerequisites and only this adapter enabled, exercise its current renderer and the acceptance/reload/refusal cases above. Add a narrowly scoped harness to the selected adapter or record the same focused manual steps; no existing Tutor browser filename is asserted for this NEW adapter. Record actual modality coverage and the accepted card/job/operation IDs.

### R12.04 Add /diagram with topology and rendered checks

**Owner:** Tools, UI; **Depends:** R12.01. **Trace:** §3.13/§6.4; M5/M8. **Model:** reuse `LEARN_TASKS.artifact`.

**Current seams:** `packages/control-plane/src/learn-primitives.js` validates flow endpoints and Mermaid restrictions; `packages/web/src/agent/slash.js`; `packages/control-plane/src/learn-artifact.js`. **NEW files/contracts:** `packages/control-plane/src/roadmap/roadmap-adapters/diagram.js`, `packages/control-plane/test/roadmap-diagram.test.js`; `packages/web/src/roadmap-diagram.test.mjs`.

- [ ] Classify `/diagram` as explanation only and bind each accepted card to either flow or Mermaid, with source claims for labels and directed relationships. A changed diagram type or materially different process requires revised acceptance.
- [ ] Reuse unique-node/edge checks and Mermaid type allowlist; preserve the prohibition on click handlers, init directives and scripts.
- [ ] Add deterministic render qualification for the formats actually enabled. Parse success alone does not establish that node labels, order and arrows are legible or faithful.
- [ ] Check semantic assertions in relationships against selected passages; retain unresolved connections as explicit limitations instead of inventing arrows.
- [ ] Test unknown endpoints, duplicate IDs, hostile Mermaid directives, unsupported type and a valid multi-branch graph; duplicate acceptance reuses one stable canvas card.

**Task evidence:** **Done:** store validator/render evidence and source-bound claim results with the card; demonstrate readable output in the existing canvas without creating a separate UI mock.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/learn-artifact.test.js`

**NEW unit tests (create, then run from root):** `node --test packages/control-plane/test/roadmap-diagram.test.js packages/web/src/roadmap-diagram.test.mjs`

**Adapter browser record:** With the R12 common local prerequisites and only this adapter enabled, exercise its current renderer and the acceptance/reload/refusal cases above. Add a narrowly scoped harness to the selected adapter or record the same focused manual steps; no existing Tutor browser filename is asserted for this NEW adapter. Record actual modality coverage and the accepted card/job/operation IDs.

### R12.05 Add /notebook as an empty workspace

**Owner:** UI, State/Money; **Depends:** R12.01; execution explicitly separate. **Trace:** §3.13, D41; M5/M8. **Model:** none for insertion.

**Current seams:** `packages/web/src/agent/slash.js` deterministic `insert_notebook`; `packages/web/src/learn-slash.js` direct insertion; `packages/control-plane/src/learn-primitives.js` direct notebook primitive. **NEW files/contracts:** `packages/control-plane/src/roadmap/roadmap-adapters/notebook.js`, `packages/control-plane/test/roadmap-notebook.test.js`; `packages/web/src/roadmap-notebook.test.mjs`; **Modify:** current notebook placement bridge through its owner.

- [ ] Create a deterministic empty notebook payload with explanation or practice purpose; bind its stable card ID to acceptance and preserve references to the learning task.
- [ ] Reuse existing canvas insertion, persistence and notebook state; a replay reveals the original notebook, preserving learner edits instead of replacing it with a fresh empty one.
- [ ] Persist billing `zero_priced` for empty insertion, with no allowance hold, debit or provider operation; zero balance does not block the accepted empty notebook. Any future authored cells use a separately declared generation contract.
- [ ] Keep opening/importing the notebook from running cells. Do not describe existing browser notebook execution as the proposed server execution service or evidence that R16 is qualified.
- [ ] Test two-device acceptance, zero-balance insertion, zero allowance/provider ledger delta, reload after learner edits, cancellation before placement and a notebook offered for practice without an attached grade.

**Task evidence:** **Done:** one accepted empty notebook persists once, keeps edits, records no provider spend and truthfully exposes its current execution state.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/roadmap-money.test.js packages/web/src/roadmap-client.test.mjs`

**NEW unit tests (create, then run from root):** `node --test packages/control-plane/test/roadmap-notebook.test.js packages/web/src/roadmap-notebook.test.mjs`

**Adapter browser record:** With the R12 common local prerequisites and only this adapter enabled, exercise its current renderer and the acceptance/reload/refusal cases above. Add a narrowly scoped harness to the selected adapter or record the same focused manual steps; no existing Tutor browser filename is asserted for this NEW adapter. Record actual modality coverage and the accepted card/job/operation IDs.

### R12.06 Add /image through the existing signed image plan

**Owner:** Tools, State/Money, UI; **Depends:** R12.01; image output checks qualified for this adapter. **Trace:** §3.13, §§5–6, D25/D38; M8.2–M8.6. **Model:** signed image plan has no model call; generation uses the exact accepted `IMAGE_MODELS` selection: `gpt-image-2.5-sunburst`, `gpt-image-2.5-flare`, `gemini-nano-banana-2.1` or `gemini-3-pro-image`; availability is deployment-verified.

**Current seams:** `packages/control-plane/src/image-jobs.js` `imageJobsRoute`; `packages/control-plane/src/image-providers.js` allowlist/settings/quote; `packages/web/src/generate-image.js` `requestImagePlan` (deterministic signing). **NEW files/contracts:** `packages/control-plane/src/roadmap/roadmap-adapters/image.js`, `packages/control-plane/test/roadmap-image.test.js`; **Modify:** image job's Tutor-only metadata/publication seam.

- [ ] Map `generate-image` to the existing signed plan and bind prompt, references, model, aspect ratio, resolution, quality, quote and card identity.
- [ ] Preserve the existing deterministic image plan with no invented planning call or charge; wait for accepted authorization before image generation, compare the live quote with its accepted bound and return a revised proposal on changes.
- [ ] Reuse provider unknown-outcome handling and `retry-save`; never resubmit a timed-out image request merely to recover storage.
- [ ] Decode and inspect actual supported image output, including factual labels where present; file-signature validation alone at `image-providers.js` is not Tutor output qualification.
- [ ] Test direct status/asset leakage, repeated accept, changed resolution, storage failure, unknown provider outcome and failed-card refund without double provider settlement.

**Task evidence:** **Done:** one separately authorized real result plus duplicate/refund evidence; Desktop Tutor omits price labels, including typed image-command review in Tutor; standalone image review outside Tutor and existing Auto/Ask price displays remain unchanged.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/image-jobs.test.js packages/control-plane/test/image-public-gates.test.js`

**NEW unit tests (create, then run from root):** `node --test packages/control-plane/test/roadmap-image.test.js`

**Adapter browser record:** With the R12 common local prerequisites and only this adapter enabled, exercise its current renderer and the acceptance/reload/refusal cases above. Add a narrowly scoped harness to the selected adapter or record the same focused manual steps; no existing Tutor browser filename is asserted for this NEW adapter. Record actual modality coverage and the accepted card/job/operation IDs.

### R12.07 Add /motion preserving duration and recovery authorization

**Owner:** Tools, State/Money, UI; **Depends:** R12.01 and a qualified existing Motion deployment. **Trace:** §3.13/§5, D25/D38; M8.2–M8.6. **Model:** existing chat proposal uses `LEARN_TASKS.chat`/picker (Auto `claude-opus-5`); Motion Director, Author, Visual Review and Pedagogical Review default to `claude-opus-5-5`; record actual environment overrides.

**Current seams:** `packages/control-plane/src/learn-video.js` `LearnVideos/startMotion`; `packages/control-plane/src/learn-video.js` `serveClip`; `packages/learn-render/motion/model-config.js`; `packages/web/src/learn-slash.js`. **NEW files/contracts:** `packages/control-plane/src/roadmap/roadmap-adapters/motion.js`, `packages/control-plane/test/roadmap-motion.test.js`; **Modify:** Tutor-only job linkage and publication seam.

- [ ] Bind the reviewed Motion plan, duration, selected context and accepted ceiling before starting the existing `motion_request` path; do not substitute another video renderer.
- [ ] Treat a longer duration or changed content plan as a revision requiring acceptance before the next paid phase, including recovery that exceeds the previous bound.
- [ ] Preserve existing checkpoint/resume, stop, provider-cost and zero-learner-charge failure classes; phase identities include card identity.
- [ ] Gate both clip serving and job/artifact reads on Tutor entitlement. Qualify actual video, audio and frame coverage; script approval alone is insufficient.
- [ ] Test duplicate accepts, stale plans, paid-preparation refusal before authorization, recover-after-render failure, revocation before delivery and accepted-asset retention on pause.

**Task evidence:** **Done:** focused Motion receipt records the actual model configuration, output coverage and bounded real smoke; no dependency on other media adapters.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/motion-admission-settlement.test.js packages/control-plane/test/motion-recovery.test.js`

**NEW unit tests (create, then run from root):** `node --test packages/control-plane/test/roadmap-motion.test.js`

**Adapter browser record:** With the R12 common local prerequisites and only this adapter enabled, exercise its current renderer and the acceptance/reload/refusal cases above. Add a narrowly scoped harness to the selected adapter or record the same focused manual steps; no existing Tutor browser filename is asserted for this NEW adapter. Record actual modality coverage and the accepted card/job/operation IDs.

### R12.08 Add /whiteboard narrated-video adapter

**Owner:** Tools, State/Money, UI; **Depends:** R12.01 and qualified Whiteboard service. **Trace:** §3.13, §6.4; M8.2–M8.6. **Model:** `whiteboard_plan/whiteboard_author` = `claude-opus-5-5`, medium effort; existing Fish TTS model `s1` and narrator selection.

**Current seams:** `packages/control-plane/src/whiteboard-routes.js`; `packages/control-plane/src/whiteboard-job.js`; `packages/control-plane/src/learn-models.js`; `packages/control-plane/src/whiteboard-tts.js`. **NEW files/contracts:** `packages/control-plane/src/roadmap/roadmap-adapters/whiteboard.js`, `packages/control-plane/test/roadmap-whiteboard.test.js`; **Modify:** Tutor linkage on existing route/job.

- [ ] Use ID `whiteboard-video`, retaining the reviewed scene plan and allowed duration. Never route to the editable drawing-board tool.
- [ ] Bind planning, per-scene authorship, narration, timing and rendering to the accepted card; associate all contributing provider operations with its result.
- [ ] Preserve explicit plan review and revised acceptance for changed duration/content. Adapt learner admission once across nested stages while retaining existing service budgets.
- [ ] Gate video, poster, audio, transcript and status content; inspect delivered narration and rendered drawings, with recorded coverage limits for sampled frames.
- [ ] Exercise narration failure, render failure, duration change, duplicate generation and orphan cleanup; refunds use the existing failed-job behavior without expiring accepted media.

**Task evidence:** **Done:** qualified video and narration are attached to one card after reload; the independent receipt records model/TTS operations, checks and refund reconciliation.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/whiteboard-job.test.js packages/control-plane/test/whiteboard-media.test.js`

**NEW unit tests (create, then run from root):** `node --test packages/control-plane/test/roadmap-whiteboard.test.js`

**Adapter browser record:** With the R12 common local prerequisites and only this adapter enabled, exercise its current renderer and the acceptance/reload/refusal cases above. Add a narrowly scoped harness to the selected adapter or record the same focused manual steps; no existing Tutor browser filename is asserted for this NEW adapter. Record actual modality coverage and the accepted card/job/operation IDs.

### R12.09 Add interactive /explain using the narrow D2(b) override

**Owner:** Tools, State/Money, UI; **Depends:** R12.01 and the adopted D2(b) interaction contract; R4 text/table remains separate. **Trace:** §3.13, D2/D38; M8.1/M8.3–M8.6. **Model:** existing `explain_brief/author/review/repair`, all `claude-opus-5-5`.

**Current seams:** `packages/web/src/learn-slash.js` `startExplain` first; `packages/control-plane/src/explain-job.js` route/jobs/refine/generate; `packages/control-plane/src/learn-models.js`. **NEW files/contracts:** `packages/control-plane/src/roadmap/roadmap-adapters/explain-interactive.js`, `packages/control-plane/test/roadmap-explain-interactive.test.js`; **Modify:** explicit Tutor authorization seam in existing Explain job.

- [ ] Require Tab acceptance of the Tutor offer and its aggregate bound before any paid explanation-brief preparation. Start the existing brief stage under that accepted card allocation, then retain the actual brief and its hash/revision for review. Apply D2(b) only to this roadmap path under that adopted contract.
- [ ] Retain the content-plan review while D2(b) lets the bound Tab acceptance replace the redundant Generate wait when the brief remains within the accepted offer. A material brief/content/format/bound change returns a revised proposal requiring new acceptance before further spending. Never charge an unaccepted offer for its brief or accept public `prepare:false` or equivalent as a bypass.
- [ ] Keep typed and Quick Edit `/explain` startExplain-first and preserve their existing review behavior; test both entry paths alongside Tutor.
- [ ] Reuse existing author/static/render/review/repair stages; attach actual check results and provider operations to the Tutor result, with bounded failure and refund.
- [ ] Test zero paid brief calls before Tab, one accepted brief allocation without double reservation, and refusal of a changed brief/material review output before further spend; prevent legacy job result reads from revealing a checked but unaccepted result.

**Task evidence:** **Done:** one bound acceptance produces one checked interactive card; R4 text/table routing exception and D2(b) interactive exception are recorded separately and ordinary commands retain their behavior.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/explain-job.test.js packages/control-plane/test/explain-depth.test.js packages/web/src/explain-client.test.mjs`

**NEW unit tests (create, then run from root):** `node --test packages/control-plane/test/roadmap-explain-interactive.test.js`

**Adapter browser record:** With the R12 common local prerequisites and only this adapter enabled, exercise its current renderer and the acceptance/reload/refusal cases above. Add a narrowly scoped harness to the selected adapter or record the same focused manual steps; no existing Tutor browser filename is asserted for this NEW adapter. Record actual modality coverage and the accepted card/job/operation IDs.

### R12.10 Add /cad without changing its modelling engine

**Owner:** Tools, State/Money, UI; **Depends:** R12.01 and qualified CAD deployment. **Trace:** §3.13, D38; M8.2–M8.6. **Model:** existing `CAD_MODEL=claude-sonnet-5-5`, dedicated-credential behavior preserved.

**Current seams:** `packages/control-plane/src/cad-jobs.js` route/jobs; `packages/control-plane/src/cad-model.js` model/request/approvedDesign. **NEW files/contracts:** `packages/control-plane/src/roadmap/roadmap-adapters/cad.js`, `packages/control-plane/test/roadmap-cad.test.js`; **Modify:** Tutor acceptance linkage/publication seam only.

- [ ] Carry units, dimensions, required checks, assumptions and approved brief hash into the accepted card. Missing consequential dimensions return clarification rather than guessed fabrication requirements.
- [ ] Reuse brief-first generation and fixed approved checks; a change to units, parameters, dimensions or unsupported requirements produces revised acceptance.
- [ ] Bind interpretation, generation, repair, executor and review operations separately under one learner authorization; preserve dedicated credential refusal and unknown-outcome recovery.
- [ ] Require existing independent STEP measurements and rendered-review evidence before exposing model files/previews. Report unchecked requirements honestly; no manufacturing-certification claim.
- [ ] Test stale brief, unsupported topology check, failed render/measurement, duplicate generation, private source reads and no-leak export URLs.

**Task evidence:** **Done:** a single bounded qualified part has retained references, measurement evidence and one accepted card; no general code-execution capability is inferred from CAD.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/cad-publication-gates.test.js packages/control-plane/test/cad-model-admission.test.js`

**NEW unit tests (create, then run from root):** `node --test packages/control-plane/test/roadmap-cad.test.js`

**Adapter browser record:** With the R12 common local prerequisites and only this adapter enabled, exercise its current renderer and the acceptance/reload/refusal cases above. Add a narrowly scoped harness to the selected adapter or record the same focused manual steps; no existing Tutor browser filename is asserted for this NEW adapter. Record actual modality coverage and the accepted card/job/operation IDs.

### R12.11 Specify the /animation Tutor handoff with the existing owner

**Owner:** Lead and Tools coordinate with the existing Animation owner; Verifier checks the boundary. **Depends:** R12.01 and that owner's interface/qualification receipt. **Trace:** §3.13 final paragraph; M8.2, scope exclusion in §10. **Model:** reuse owner's existing `animation_*` roles configured in `packages/control-plane/src/learn-models.js`; no model change commissioned.

**Current boundary only:** `packages/web/src/agent/slash.js`, `packages/web/src/learn-slash.js` `canvas.startAnimation`; `packages/web/src/LearnPage.jsx` job routing. **NEW files/contracts:** proposed `packages/control-plane/src/roadmap/roadmap-adapters/animation-contract.js`, `packages/control-plane/test/roadmap-animation-contract.test.js`, integration handoff record; **no Animation internals modified by this checklist**.

- [ ] Agree request/response boundary with the existing owner: immutable scene-plan hash, accepted card/phase identity, bound, source refs, cancellation, check receipt and provider-operation list.
- [ ] Document who performs the existing reviewed-plan authorization, private job/result serving, publication and refunds. Tutor must receive the real feature outcome, not synthesize a successful scene from a status string.
- [ ] Define adapter-only conformance fixtures for duplicate acceptance, changed plan, unavailable service, cancelled/revoked access and checked-but-unaccepted reads.
- [ ] Leave the capability disabled until the owner supplies and qualifies the implementation seam. A contract stub must return unavailable, never replace the feature or bypass its review.
- [ ] Record a separate handoff receipt identifying responsibilities and the candidate interface version; do not assign Animation engine, rendering, authoring or repair work to Tutor agents.

**Task evidence:** Use against fixtures and, when supplied, the owner's adapter harness. **Done:** recorded boundary plus passing owner-supplied conformance evidence; this task alone makes no claim of shipped Animation integration.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/roadmap-tools.test.js`

**NEW unit tests (create, then run from root):** `node --test packages/control-plane/test/roadmap-animation-contract.test.js`

**Adapter browser record:** With the R12 common local prerequisites and only this adapter enabled, exercise its current renderer and the acceptance/reload/refusal cases above. Add a narrowly scoped harness to the selected adapter or record the same focused manual steps; no existing Tutor browser filename is asserted for this NEW adapter. Record actual modality coverage and the accepted card/job/operation IDs.

### R12.12 Add /3d technical Blender-scene adapter

**Owner:** Tools, State/Money, UI; **Depends:** R12.01 and provisioned existing scene worker. **Trace:** §3.13/§6.4; M8.2–M8.6. **Model:** existing artifact planner for `blender_scene`; deterministic existing Blender worker builds the validated operation.

**Current seams:** `packages/control-plane/src/learn-primitives.js` `blender_scene`; `packages/control-plane/src/learn-scene.js` `sceneFetch/LearnScenes`; `packages/web/src/agent/slash.js`. **NEW files/contracts:** `packages/control-plane/src/roadmap/roadmap-adapters/technical-3d.js`, `packages/control-plane/test/roadmap-technical-3d.test.js`; **Modify:** Tutor metadata/publication seam on scene job.

- [ ] Limit Tutor output to the existing validated technical-scene operation; keep unsupported `3d_model` disabled and preserve the distinction from live `/animation`.
- [ ] Freeze geometry, labels, coordinate assumptions and accepted render settings. Model planning does not authorize arbitrary Blender scripts or an expanded object set.
- [ ] Bind scene job/cache identity to accepted card/source revision, so an existing cache object cannot confer entitlement to another learner.
- [ ] Gate model, textures/previews and scene status reads; validate actual exported geometry and displayed labels before publication, preserving unsupported checks.
- [ ] Test failed worker, malformed operation, cross-user cache read, repeat acceptance and a changed technical scene requiring new acceptance.

**Task evidence:** Current scene regressions are listed below. **Done:** one technical scene renders and reloads with correct source/charge linkage; receipt independently qualifies this adapter without claiming general execution or live Animation support.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/learn-scene.test.js packages/control-plane/test/learn-scene-author.test.js packages/control-plane/test/learn-scene-presentation.test.js`

**NEW unit tests (create, then run from root):** `node --test packages/control-plane/test/roadmap-technical-3d.test.js`

**Adapter browser record:** With the R12 common local prerequisites and only this adapter enabled, exercise its current renderer and the acceptance/reload/refusal cases above. Add a narrowly scoped harness to the selected adapter or record the same focused manual steps; no existing Tutor browser filename is asserted for this NEW adapter. Record actual modality coverage and the accepted card/job/operation IDs.

### R12.13 Add /browser saved-webpage adapter

**Owner:** Tools, UI; **Depends:** R12.01; use the existing capture safety path. **Trace:** §3.13/§6.3; M5/M8, source-card expansion. **Model:** none to insert/capture; reuse existing direct JEV `jev-1.13.0` screening (`webpage-screen.js`), recording its policy version.

**Current seams:** `packages/web/src/learn-slash.js` `insertWebpage`; `packages/control-plane/src/webpage-capture.js` routes/capture/screen/fetch. **NEW files/contracts:** `packages/control-plane/src/roadmap/roadmap-adapters/browser.js`, `packages/control-plane/test/roadmap-browser.test.js`; **Modify:** Tutor lineage on capture request/result.

- [ ] Accept only a full validated public URL or an explicit learner URL-selection step; do not interpret arbitrary search words as a URL or silently perform research.
- [ ] Bind source URL, capture version, title and intended explanation purpose to acceptance; distinguish an unread candidate from fetched page evidence.
- [ ] Reuse redirect/public-network checks, no credentials and capture quarantine. Inaccessible, authenticated or paywalled pages yield a truthful unavailable/partial result.
- [ ] Keep screenshots, text and manifest private until screening and Tutor entitlement pass; a metadata route must not leak a usable asset URL.
- [ ] Test redirects to private addresses, unsafe capture, partial height coverage, duplicate acceptance and changed capture hashes.

**Task evidence:** **Done:** one supported saved webpage and one refused inaccessible page have explicit coverage; adapter receipt states that a browser card is not unrestricted browsing or a paywall bypass.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/webpage-capture.test.js packages/control-plane/test/webpage-screen.test.js`

**NEW unit tests (create, then run from root):** `node --test packages/control-plane/test/roadmap-browser.test.js`

**Adapter browser record:** With the R12 common local prerequisites and only this adapter enabled, exercise its current renderer and the acceptance/reload/refusal cases above. Add a narrowly scoped harness to the selected adapter or record the same focused manual steps; no existing Tutor browser filename is asserted for this NEW adapter. Record actual modality coverage and the accepted card/job/operation IDs.

### R12.14 Add /photos with explicit choice and credit

**Owner:** Tools, UI; **Depends:** R12.01; no R8a-wide research prerequisite. **Trace:** §3.13; M5/M8 source-card expansion. **Model:** none for the existing photo-search/insertion path.

**Current seams:** `packages/web/src/learn-slash.js` `imageSearchBlock`; `packages/web/src/LearningBlocks.jsx` `ImageBody` calls `/api/learn/photos`; `packages/web/src/agent/slash.js`. **NEW files/contracts:** `packages/control-plane/src/roadmap/roadmap-adapters/photos.js`, `packages/control-plane/test/roadmap-photos.test.js`; `packages/web/src/roadmap-photos.test.mjs`.

- [ ] Map typed `/photos` to stable command ID `image`, keeping it separate from generated `/image`. Freeze a public-safe query and explanation purpose.
- [ ] Reuse photo search and the learner's choice; represent unresolved selection explicitly rather than silently taking the first result. Bind the selected provider photo ID and source URL before placement.
- [ ] Preserve creator credit, attribution links and supported image metadata through persistence and sharing; use server-authorized asset handling where storage is required.
- [ ] Check actual displayed image and caption under the enabled modality policy; never present a stock photo as measured evidence of a specific factual event.
- [ ] Test no results, unavailable credit, changed selection, duplicate placement and a query containing private source text blocked before egress.

**Task evidence:** **Done:** a credited selected photo persists as one card, remains distinguishable from generated imagery and incurs no invented model generation charge.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/roadmap-tools.test.js`

**NEW unit tests (create, then run from root):** `node --test packages/control-plane/test/roadmap-photos.test.js packages/web/src/roadmap-photos.test.mjs`

**Adapter browser record:** With the R12 common local prerequisites and only this adapter enabled, exercise its current renderer and the acceptance/reload/refusal cases above. Add a narrowly scoped harness to the selected adapter or record the same focused manual steps; no existing Tutor browser filename is asserted for this NEW adapter. Record actual modality coverage and the accepted card/job/operation IDs.

### R12.15 Add /youtube using actual search and caption coverage

**Owner:** Tools, UI; **Depends:** R12.01; no other source-card adapter. **Trace:** §3.13/§6.3; M5/M8. **Model:** none for deterministic finder/search; any optional ranking or explanation uses the separately enabled roadmap role and its budget.

**Current seams:** `packages/control-plane/src/learn-search.js` `directResult/searchCanvasSource`; `packages/control-plane/src/learn-youtube.js` search/selection validation/passages; `packages/web/src/learn-slash.js` source finder. **NEW files/contracts:** `packages/control-plane/src/roadmap/roadmap-adapters/youtube.js`, `packages/control-plane/test/roadmap-youtube.test.js`; **Modify:** current finder-to-proposal binding.

- [ ] Keep direct video URLs distinct from topic search; preserve existing preview and learner selection instead of automatically adding a candidate.
- [ ] Bind video ID, selected window, retrieval time and caption revision/hash to acceptance; execute only the safe public query within the applicable search budget.
- [ ] Use timestamp windows only when actual retrieved transcript passages support them; captions absent means no invented timestamp or claim that the video was watched.
- [ ] Validate embed URL/window and preserve provider title/channel attribution. Report transcript evidence separately from unseen visual content.
- [ ] Test missing captions, fabricated window, invalid video ID, removed video, duplicate acceptance and publication/access checks for stored excerpts.

**Task evidence:** **Done:** receipt shows one selected video and a caption-unavailable case; unsupported visual claims remain unresolved and no generated-video job is invoked.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/learn-youtube.test.js`

**NEW unit tests (create, then run from root):** `node --test packages/control-plane/test/roadmap-youtube.test.js`

**Adapter browser record:** With the R12 common local prerequisites and only this adapter enabled, exercise its current renderer and the acceptance/reload/refusal cases above. Add a narrowly scoped harness to the selected adapter or record the same focused manual steps; no existing Tutor browser filename is asserted for this NEW adapter. Record actual modality coverage and the accepted card/job/operation IDs.

### R12.16 Add /arxiv with versioned paper selection

**Owner:** Tools, UI; **Depends:** R12.01; R7b only for whole-PDF planning/reading beyond existing supported retrieval. **Trace:** §3.13/§6.3; M5/M8. **Model:** none for metadata search and insertion; optional research uses its explicit role.

**Current seams:** `packages/control-plane/src/arxiv.js` ID/search/read/PDF/selection validation; `packages/control-plane/src/learn-search.js`; `packages/web/src/agent/slash.js`. **NEW files/contracts:** `packages/control-plane/src/roadmap/roadmap-adapters/arxiv.js`, `packages/control-plane/test/roadmap-arxiv.test.js`; **Modify:** finder selection and existing paper-card metadata.

- [ ] Preserve topic search versus direct ID/link entry and learner preview; bind exact arXiv version, title and selected source to acceptance.
- [ ] Treat metadata and abstract retrieval as their actual coverage. Full-paper claims require original page text; figure claims require a qualified image read, not the metadata title.
- [ ] Persist paper URL, retrieved version/hash and page anchors with the delivered card; a newer preprint is a new source revision, not a silent replacement.
- [ ] Reuse safe bounded PDF retrieval and supported paper-card rendering; return partial/unavailable for encrypted, failed or unsupported content.
- [ ] Test version changes, invalid IDs, unread figures, failed PDF fetch, duplicate acceptance and exact-page citation navigation.

**Task evidence:** **Done:** a selected paper is added with honest retrieval coverage and immutable source identity; this adapter does not wait for YouTube, Wikipedia or the full media ladder.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/arxiv.test.js`

**NEW unit tests (create, then run from root):** `node --test packages/control-plane/test/roadmap-arxiv.test.js`

**Adapter browser record:** With the R12 common local prerequisites and only this adapter enabled, exercise its current renderer and the acceptance/reload/refusal cases above. Add a narrowly scoped harness to the selected adapter or record the same focused manual steps; no existing Tutor browser filename is asserted for this NEW adapter. Record actual modality coverage and the accepted card/job/operation IDs.

### R12.17 Add /wikipedia with retained article revision and sections

**Owner:** Tools, UI; **Depends:** R12.01; no other source-card adapter. **Trace:** §3.13/§6.3; M5/M8. **Model:** none for existing article search/read/insertion.

**Current seams:** `packages/control-plane/src/learn-wiki.js` title/ToC/section/search/read/article; `packages/control-plane/src/learn-search.js`; `packages/web/src/agent/slash.js`. **NEW files/contracts:** `packages/control-plane/src/roadmap/roadmap-adapters/wikipedia.js`, `packages/control-plane/test/roadmap-wikipedia.test.js`; **Modify:** current article-card source metadata.

- [ ] Keep the existing English-Wikipedia scope (`WIKI_LANG`) and disambiguation/selection behavior; do not silently choose an unrelated article or another language.
- [ ] Bind canonical article, captured revision/hash and selected section to acceptance. Later edits invalidate affected source-dependent proposals without rewriting delivered cards.
- [ ] Reuse stripped/sanitized article content and ToC anchors, storing coverage of the actual read. Do not label a search snippet as a read article.
- [ ] Preserve article attribution and useful source links; describe Wikipedia claims with their source status rather than implying independent verification.
- [ ] Test disambiguation, redirects, repeated headings, changed revision, unsafe embedded markup and duplicate acceptance.

**Task evidence:** **Done:** the selected article opens at the cited section, survives reload and records the exact retrieved version; its flag and focused receipt can ship independently.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/learn-wiki.test.js`

**NEW unit tests (create, then run from root):** `node --test packages/control-plane/test/roadmap-wikipedia.test.js`

**Adapter browser record:** With the R12 common local prerequisites and only this adapter enabled, exercise its current renderer and the acceptance/reload/refusal cases above. Add a narrowly scoped harness to the selected adapter or record the same focused manual steps; no existing Tutor browser filename is asserted for this NEW adapter. Record actual modality coverage and the accepted card/job/operation IDs.


### 6.10 R13 Project canvases

**Current status:** NEW Tutor repository source adapter. Repository snapshots/readers and Project surfaces already exist; current roadmap source access is owned Markdown only. Reuse source coverage helpers without requiring all of R7, R12 or R16. Imports remain inert.

**Browser-local prerequisites:** Provide a locally authorized repository snapshot at an immutable commit, Main and child Project canvases, missing/excluded file fixtures and a second unauthorized session. Implement the NEW Project/reference harness against existing RepositorySource and Project surfaces.

**Rung receipt:** Commit/path/range/hash manifests, original-line navigation, refresh/revocation races, zero retired journey creation, accepted text delivery and share/fork privacy with media disabled.

These tasks extend R4's shared source identity, coverage and access boundary with the repository adapter; they do not require R7 long-Markdown/PDF delivery or media adapters. Reuse R7 helpers when already available without making that optional reuse a release gate. Current repository seams were rechecked at the audit baseline. NEW Tutor repository files are implementation targets; existing repository reading does not mean the Tutor adapter is complete.

### R13.01 Resolve authorized repository snapshots for Tutor

**Owner:** Tools; Lead integrates registry. **Depends:** R4 source-tool/access and immutable source/coverage contracts; relevant cleanup interface receipt. R7 helper reuse is optional. **v1.3:** §§3.14, 4.1, 6.2; **legacy:** M12.4, M4.23. **Model:** none for reads; reuse the R4 registered planner only after evidence resolves.

**Current seams:** `packages/control-plane/src/repositories.js` `repositoryAccess`, `readableVersion`, `repositorySnapshot`; `packages/control-plane/src/canvases.js` `projectRepository`. **NEW files/contracts:** `packages/control-plane/src/roadmap/roadmap-source-repository.js`, `test/roadmap-source-repository.test.js`; **modify:** current `roadmap-tools.js` registry through Lead.

- [ ] Implement `readRepositoryScope(access, {repo, commit, paths, ranges}, limits)` returning the shared typed tool result, immutable source identity, read ranges and omissions. Resolve the repository from authorized project/board relationships before loading R2; client repository IDs are selectors only.
- [ ] Preserve explicit commit selection and `readableVersion` authorization. Distinguish not indexed, missing snapshot, excluded path and permission denial; do not copy `projectRepository`'s quiet `null` fallback into a Tutor claim of successful reading.
- [ ] Bind cache keys to repository, commit, extractor version and authorization scope. Recheck access before serving cached text; a public snapshot becoming unavailable does not become readable merely because it was cached.
- [ ] Register the adapter independently; refuse unsupported source scopes before planning. Keep imported files inert and Tutor actions owner-only until R14.

**Task evidence:** Cover exact commit, public readable version, unauthorized private import, missing index, missing R2, forged path and revoked cache access. **Done:** fixture records show the requested commit and explicit coverage, with zero model calls on refused reads.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/repositories.test.js`

**NEW unit tests (create, then run from root):** `node --test packages/control-plane/test/roadmap-source-repository.test.js`

### R13.02 Build code evidence without restoring retired activities

**Owner:** Tools. **Depends:** R13.01 and R4 shared coverage/support contracts; optional reuse of already-shipped R7 indexing helpers. **v1.3:** §§3.14, 6.2; **legacy:** M12.4. **Model:** deterministic retrieval; reuse registered `roadmap_index` only for enabled bounded navigation summaries. Ordinary code-source explanations use the supported original source context plus accepted brief and one author call; no mandatory source quotation reviewer or new codebase tutor model.

**Current seams:** `packages/control-plane/src/repository-context.js` `repositoryTool`, bounded `read_source`; `packages/control-plane/src/learn-codebase-source-map.js` `learningSourceMap`, `sourceDrift`. The legacy map requires a known goal at its goal lookup and its route creates old coaching activities; it is not the new roadmap entry point. **NEW files/contracts:** `packages/control-plane/src/roadmap/roadmap-repository-evidence.js`, `test/roadmap-repository-evidence.test.js`; **modify:** R13.01 adapter.

- [ ] Reuse retained pure range/hash/omission helpers, extracting them only if cleanup removed their old owner. Accept learner instruction and selected scope without requiring a personal goal or invoking `codebaseActivity`.
- [ ] Retrieve original numbered lines for claims; preserve the 120-line/16,000-character reader bounds and report subsequent ranges needed. Treat graph edges as structural evidence, not runtime execution.
- [ ] Persist `{repo,commit,path,start,end,fileHash,readStatus}` and explicit excluded/unread ranges; only actual reads count as source coverage; `source_supported` is a proposed provenance label, not a required LLM review verdict for ordinary prose. Preserve tentative graph relationships separately.
- [ ] Add fixtures for repeated symbols, missing files, skipped secrets and a selected body exceeding one range; demonstrate that omitted lines never support an answer or quiz key.

**Task evidence:** The retained source-map suite is current at this baseline; keep the legacy implementation’s activity-creation side effects out of the Tutor adapter. **Done:** evidence manifests distinguish graph-only, read and unavailable material; no retired journey/goal is created.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/learn-codebase-source-map.test.js`

**NEW unit tests (create, then run from root):** `node --test packages/control-plane/test/roadmap-repository-evidence.test.js`

### R13.03 Preserve commit-bound navigation and source changes

**Owner:** UI with Tools; Lead owns LearnPage integration. **Depends:** R13.02 and R3 source references. **v1.3:** §§3.14, 4.3; **legacy:** M12.4, M3 extension. **Model:** none.

**Current seams:** `packages/web/src/RepositorySource.jsx` component, commit-bound file request, range selection; `packages/control-plane/src/repositories.js` card-source route; `packages/control-plane/src/learn-codebase-source-map.js` drift. **NEW files/contracts:** `packages/web/src/roadmap-repository-references.js`, the corresponding **NEW** `.test.mjs`; **modify:** R3 citation resolver and R4 proposal-source validation through their owners.

- [ ] Convert repository evidence to R3 references while retaining full commit and file hash; open the existing reader with exact line range and `byRepository` where appropriate.
- [ ] Recheck source version at proposal acceptance and generation. A changed relevant source supersedes unaccepted work; a harmless change in another file does not invalidate unrelated evidence.
- [ ] Keep delivered citations pointing to their original commit. Show changed/unavailable status and offer explicit replanning rather than silently resolving old lines against current code.
- [ ] Preserve source-to-card navigation and existing Project headings, Files, graph and course surfaces; supply a Lead-owned mount patch instead of replacing the Project UI.

**Task evidence:** Assert full-SHA retention, exact range, unavailable historical commit and changed-source labeling. **Done:** captured current-UI smoke navigates a delivered citation and retains the original reference after refresh.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/web/src/repo-context.test.mjs`

**NEW unit tests (create, then run from root):** `node --test packages/web/src/roadmap-repository-references.test.mjs`

### R13.04 Qualify the Project loop independently

**Owner:** Verifier with Tools/UI fixes. **Depends:** R13.01–R13.03; enabled text delivery. **v1.3:** §§3.14, 8; **legacy:** M12.5 Project portion. **Model:** mocks for regression; any real planner/delivery run requires the existing bounded paid-test authorization.

**Current seams:** `packages/control-plane/src/canvases.js` Project context; `packages/control-plane/src/repositories.js` snapshot/file routes. **NEW files/contracts:** `test/roadmap-project.test.js`, `packages/web/e2e/roadmap-project-check.mjs`; **modify:** Lead-owned check map and release receipt.

- [ ] Exercise explicit “teach this scope” with no goal, accepted plan, proposal, Tab, delivered text and source navigation on both repository Main and a child Project canvas.
- [ ] Inject snapshot refresh between planning and acceptance, source deletion before delivery and repository-access loss after caching; assert typed recovery without fabricated code evidence or duplicate debit.
- [ ] Repeat reload/duplicate acceptance and sharing/fork checks for commit references; private roadmap/evidence state must not enter copied board state.
- [ ] Add focused classification for these files and record R13 capability, exact candidate, retained cleanup interfaces and unsupported scopes; media-disabled configuration must pass.

**Task evidence:** **Done:** passing focused receipt plus one authorized current-UI Project smoke; no assertion that production was activated from local checks.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/repositories.test.js packages/control-plane/test/roadmap-money.test.js`

**NEW unit tests (create, then run from root):** `node --test packages/control-plane/test/roadmap-project.test.js`

**NEW local browser harness (create first; common prerequisites plus this rung’s fixtures):** `BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node packages/web/e2e/roadmap-project-check.mjs`. Record actual assertions and screenshots; a fixture route proves UI behavior only, not live provider quality.


### 6.11 R14 Editors and shared canvases

**Current status:** NEW editor support extending the existing owner-only roadmap access module. Keep board owner, authenticated learner and payer distinct; current main is not proof of editor authorization. Current memberships do not establish the required canvas-to-app grant mapping.

**Browser-local prerequisites:** Create local owner, editors A/B, reader/commenter, stranger and revoked grant fixtures; exercise two actual authenticated sessions. Use R9 quiz evidence only when R9 is enabled; its absence must not block a separately implemented text-only editor scope. Implement the NEW editor harness and record the actually enabled route/format matrix.

**Rung receipt:** Concrete grant mapping, actor/owner/payer joins, independent private roadmaps/evidence, no owner debit for editor generation, revoked reads/dispatch, terminal refund where delivery becomes unauthorized and preserved legitimate shared cards.

**Current access boundary:** `packages/control-plane/src/roadmap/roadmap-access.js` already exports `accessForRoadmap` and `revalidateSourceAsJob`; it reconstructs an owner actor/payer and rechecks owned Markdown sources. Extend this module. Primary-app `memberRole`/`canEdit` and canvas membership/storage are different resource systems; do not infer a canvas editor grant from a primary app ID or promote a commenter. `canvasAccess`, board ownership checks and `canvas-permissions.js` require a concrete editor-grant mapping before this new scope is enabled.

### R14.01 Establish one explicit editor authorization path

**Owner:** State/Money; Lead owns route/auth integration. **Depends:** R4 access contract; owner-confirmed grant mapping; relevant retained-interface receipt. **v1.3:** §§3.15, 4.1; **legacy:** M12.6, D27. **Model:** none.

**Current seams:** owner-only access module above; `packages/web/src/canvas-permissions.js` writer capabilities. **MODIFY current:** `packages/control-plane/src/roadmap/roadmap-access.js` (`accessForRoadmap`, `revalidateSourceAsJob`) and request-side access wiring. **NEW test:** `test/roadmap-editor-access.test.js`; **modify:** `packages/control-plane/src/canvases.js`, `packages/control-plane/src/learn-board.js` via Lead; schema only if the grant decision needs it.

- [ ] Produce the concrete grant decision first: reuse primary `members.role='edit'` only through a proven server-side binding of organization, canvas and owner to the actual primary app. Test mismatched owner/name and colliding numeric IDs. If no binding exists, specify an additive canvas-specific editor grant with owner grant/revoke lifecycle for the implementation decision; do not silently promote commenters or invent the mapping.
- [ ] Define the **NEW editor-capable extension/interface** `resolveRoadmapAccess(req, env, {app,board})`, or an equivalent narrow extension of existing request/job access helpers, returning `{org,app,board,boardId,boardOwnerEmail,actorUserId,actorEmail,payerUserId,role,grantRevision}`. These are proposed normalized fields, not today's `canvasAccess` shape.
- [ ] Require a stable authenticated actor; derive payer from that actor. Resolve owner board storage independently; client fields cannot override any principal, role or grant revision.
- [ ] Preserve current owner-only behavior until this release is enabled. Reserve any required `<NNNN>-canvas-editor-grants.sql` only after manifest reconciliation; never apply production migration as part of checklist work.

**Task evidence:** Cover owner, explicit editor, view member, commenter, stranger, revoked and ID collision. **Done:** recorded grant decision and passing resolver matrix, with no unproven authorization equivalence.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/roadmap-privacy.test.js packages/web/src/canvas-permissions.test.mjs`

**NEW unit tests (create, then run from root):** `node --test packages/control-plane/test/roadmap-editor-access.test.js`

### R14.02 Thread owner, learner and payer through every state boundary

**Owner:** State/Money; Lead reviews usage changes. **Depends:** R14.01. **v1.3:** §§3.15, 4.1, 5.1; **legacy:** M12.6. **Model:** none; existing command models unchanged.

**Current seams:** `packages/control-plane/src/learn-boards.js` `ownerRow`; `packages/control-plane/src/learn-usage.js` `noteUsageIdentity`, `payerOf`, `usagePayer`; learner records use `owner_user_id` in `repository-schema.sql`. **NEW files/contracts:** `test/roadmap-editor-identities.test.js`; **modify:** current roadmap store/jobs, feedback/attempt readers, accepted-generation adapters and Lead-owned usage integration.

- [ ] Resolve board rows and authorized placed content by `boardOwnerEmail`; key roadmap, proposals, drafts, feedback, attempts, Progress and private results by `actorUserId`. Never substitute the owner's email throughout an editor request.
- [ ] Bind admission/settlement to the editor's authenticated usage context and accepted step authorization; planner/checker operations keep explicit platform funding and assessments remain free.
- [ ] Persist actor/owner/authorization fingerprints in job checkpoints, outbox and provider-operation bindings. Resume reconstructs the same identity and revalidates the grant before another stage.
- [ ] Prove two editors create independent private roadmaps on one board and identical client action keys cannot cross actors; each editor's delivery remains idempotent within the shared board's version checks.

**Task evidence:** Assert owner ledger unchanged, editor-only charge/refund, private evidence separation and lost-ack replay. **Done:** joined test ledger traces identify board owner, actor and payer separately for acceptance, generation, assessment and refund.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/roadmap-money.test.js packages/control-plane/test/learn-usage.test.js`

**NEW unit tests (create, then run from root):** `node --test packages/control-plane/test/roadmap-editor-identities.test.js`

### R14.03 Enforce revocation and shared-result privacy

**Owner:** State/Money with UI. **Depends:** R14.02, R4 publication contract, enabled adapter inventories. **v1.3:** §§3.15, 4.4; **legacy:** M12.3/M12.6. **Model:** none.

**Current seams:** `packages/control-plane/src/shared-privacy.js` `sharedState`, `linkAccess`; `packages/control-plane/src/learn-boards.js` `boardAsset`, `forkState`; `packages/web/src/canvas-permissions.js` personal-panel restriction. **NEW files/contracts:** `test/roadmap-editor-publication.test.js`; **modify:** proposed result/source/asset gates, adapter readers, shared privacy and existing UI permission model.

- [ ] Recheck live permission at accept, dispatch, each resumed paid stage, publication and direct result/asset read. Revocation halts new actions/debits and records the cause. Reconcile already-incurred work within the bounded delivery deadline; an accepted card that can no longer be authorized for delivery reaches terminal unavailable with one refund of its affected learner charges. Do not leave it charged in indefinite reconciliation. Preserve provider expense and legitimate already-delivered shared cards without leaking private output.
- [ ] Cover legacy command job/status/asset URLs as well as roadmap routes. An editor with board access still cannot read another learner's pending proposal, unaccepted prepared result, answer key or assessment.
- [ ] Expose actor-private Tutor/Progress only on the authorized editor workspace surface. Keep public/link visitor surfaces sanitized; source visibility does not imply access to owner's Materials or Files.
- [ ] Preserve already-delivered shareable cards and source citations; strip private step bindings, feedback and evidence on fork/duplicate. Do not delete accepted assets through pause, revocation or speculative expiry.

**Task evidence:** Assert direct-ID attacks, revoke during generation, source reads, fork and legacy endpoints. **Done:** every enabled adapter has a recorded read-path inventory and no unauthorized body/asset bytes.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/shared-canvas-privacy.test.js packages/control-plane/test/roadmap-privacy.test.js`

**NEW unit tests (create, then run from root):** `node --test packages/control-plane/test/roadmap-editor-publication.test.js`

### R14.04 Run the mandatory editor release matrix

**Owner:** Verifier; UI implements harness; Lead classifies. **Depends:** R14.01–R14.03 and R9 only for the separately enabled quiz evidence slice. **v1.3:** §§3.15, 8, D44(b); **legacy:** M12.5 editor portion/M12.6. **Model:** fixture models; bounded authorized real smoke only.

**Current seams:** `packages/web/src/canvas-permissions.js` `can`; `packages/control-plane/src/learn-boards.js` versioned saves. **NEW files/contracts:** `packages/web/e2e/roadmap-editor-check.mjs`, `test/roadmap-editor-matrix.test.js`; **modify:** check-map through Lead and R14 receipt.

- [ ] Exercise owner, editor A, editor B, reader, commenter, stranger and revoked member across source read, plan, proposal, acceptance, job poll, result, asset, save, answer and Progress.
- [ ] In two actual authenticated test sessions, let the editor receive an enabled card on the owner's board; when R9 is enabled, also answer its immutable quiz. Verify the owner sees permitted cards and none of that editor's private learning state. Text-only editor support does not wait for an unimplemented quiz capability.
- [ ] Revoke between acceptance/dispatch and between generated/delivery; assert no new unauthorized debit, bounded terminal refund for accepted-but-undeliverable cards, retained provider expense and already-delivered cards, and a truthful UI stop. Race two editors' placements against board versions without losing either authorized card.
- [ ] Record actual enabled formats, exact SHA/build, focused results and recovery branch. Apply the adopted MVP policy without reinstating a broad gate; A failed editor-access assertion in the enabled scope must be fixed. Later adapters must extend this same matrix before editor enablement.

**Task evidence:** **Done:** passing role/route matrix and second-session smoke with separate payer/evidence traces; unqualified formats remain owner-only or disabled for editors.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/roadmap-privacy.test.js packages/control-plane/test/shared-canvas-v1.test.js`

**NEW unit tests (create, then run from root):** `node --test packages/control-plane/test/roadmap-editor-matrix.test.js`

**NEW local browser harness (create first; common prerequisites plus this rung’s fixtures):** `BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node packages/web/e2e/roadmap-editor-check.mjs`. Record actual assertions and screenshots; a fixture route proves UI behavior only, not live provider quality.


### 6.12 R15 — Images, notes and OCR

**Current status:** NEW note-source and image/OCR adapters, separately enabled. Current actual-image readers and extraction uncertainty schema exist; `roadmap_vision_extract` and Tutor-specific OCR/source checks are new. Existing visual assessment is not source OCR. Uncertain recognition is never promoted to a verified answer key.

**Browser-local prerequisites:** Use explicitly selected note snapshots and actual image bytes with crop/page geometry; provide benign anatomy/scientific images, noisy scans and policy fixtures. Use extraction/safety doubles by default, an authorized served-vision sample only when needed, and local owner/editor/stranger sessions for access checks.

**Rung receipt:** Original pixel/source receipt, crop/page lineage, extraction/model versions and uncertainty, exact navigation, OCR coverage, privacy/fork denial and bounded safety resolution. A readable note/text-only release remains independent of OCR.

Readable note sources and image extraction are separately enabled adapters. Neither is a reason to hold a previously qualified text-only release. The existing image reader supplies actual bytes and a read receipt; that receipt proves what was supplied, not that OCR is correct. Existing visual assessment roles grade learner attempts and must not be repurposed as source extraction.

### R15.01 Add versioned note sources with explicit private-note selection

**Owner:** Tools, UI; **Depends:** R7 source adapter contract, R3 references, R4 access/publication. **Trace:** v1.3 §§3.16, 6.2; M13, M3/M4.23 extensions; D5. **Model:** none for text extraction; reuse the registered roadmap indexing role for bounded navigation work; ordinary explanations retain the one-author contract.

**Current seams:** `packages/web/src/focus-adapter-note.js` identifies sticky/text canvas items, not blocks; `packages/web/src/learn-notes.js` stores personal notes in scoped IndexedDB. **NEW files/contracts:** `packages/control-plane/src/roadmap/roadmap-source-notes.js`, `packages/control-plane/test/roadmap-source-notes.test.js`; `packages/web/src/roadmap-note-source.js`, its `.test.mjs`; **Modify:** source registry and current source-selection UI through owners.

- [ ] Define supported canvas note items explicitly and read their saved authorized text; preserve item ID, board revision, text hash and offsets. Do not assume notes have ordinary block IDs.
- [ ] For personal IndexedDB notes, require explicit selection and import of a scoped immutable source snapshot. The server cannot claim to read unsent device-local notes or silently upload an entire notebook.
- [ ] Return empty, partial, unsupported drawing-only and missing-local-note states; readable text survives even when attached handwriting needs the separate image adapter.
- [ ] Invalidate only affected unaccepted work after edits; delivered references retain their old snapshot and show source changes instead of silently switching text.
- [ ] Test another user's note scope, offline/local-only content, text mutation during acceptance, Unicode offsets, no-goal entry and explicit import cancellation.

**Task evidence:** **Done:** one selected note supports a delivered explanation with exact source navigation; unselected personal notes remain private and unavailable to server planning.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/learn-context-docs.test.js packages/web/src/learn-notes-view.test.mjs`

**NEW unit tests (create, then run from root):** `node --test packages/control-plane/test/roadmap-source-notes.test.js packages/web/src/roadmap-note-source.test.mjs`

### R15.02 Register a dedicated vision extraction role and actual-image reader

**Owner:** Tools; Lead owns model registry; State/Money reviews admission. **Depends:** R15.01 only when a note image is selected; otherwise R7/R4 source and budget contracts. **Trace:** §§3.16, 6.1/6.2, D42; M13/M4.23. **Model:** proposed `LEARN_TASKS.roadmap_vision_extract` = `claude-sonnet-5-5`, low effort, no silent fallback; qualifier must verify actual served vision capability.

**Current seams:** `packages/control-plane/src/learn-image-context.js` `boardImageContext/tutorImageContext`; `packages/control-plane/src/file-access.js` `authorizeFileSource`; `packages/control-plane/src/learn-media.js` limits/sniff/read; `packages/control-plane/src/inline-image-extraction.js` uncertainty contract. **NEW files/contracts:** `packages/control-plane/src/roadmap/roadmap-source-image.js`, `packages/control-plane/src/roadmap/roadmap-vision-extract.js`, `packages/control-plane/test/roadmap-vision-extract.test.js`; **Modify:** Lead-owned `learn-models.js` and typed-tool registry.

- [ ] Read selected image bytes under authorized board/source identity and expected revision; reject arbitrary client URLs, R2 keys and mismatched source IDs before model dispatch.
- [ ] Define `extractFigure(access,sourceRef,{page,crop},limits)` with source hash, coordinate frame, original dimensions, extracted text/relationships, uncertain regions and coverage. Crop coordinates must originate in real selection/extraction geometry.
- [ ] Send actual pixels, with bounded caption/text context, through the new logged role and platform budget admission. Do not call `tutor_visual`, a grading endpoint, or infer figures from alt text alone.
- [ ] Retain immutable original/crop lineage and extraction/prompt/model versions; treat empty uncertainty arrays as no accuracy guarantee.
- [ ] Test missing bytes, stale transforms, unauthorized upload, unsupported MIME, oversized images, provider unavailability and forged crop coordinates.

**Task evidence:** **Done:** image read receipt and extraction manifest identify the actual pixels and requested/served model, with no assessment side effects.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/src/inline-image-extraction.test.mjs`

**NEW unit tests (create, then run from root):** `node --test packages/control-plane/test/roadmap-vision-extract.test.js`

### R15.03 Preserve OCR uncertainty and page/crop coverage in reasoning

**Owner:** Tools, State/Money; **Depends:** R15.02; R7b for scanned PDF pages. **Trace:** §§3.16, 6.2; M13/M4.20, D42. **Model:** dedicated proposed extraction role. Resolve consequential OCR ambiguity through explicit uncertainty/clarification and relevant extraction checks; do not add a blocking citation checker/escalation to ordinary Markdown text/table generated from that supported context.

**Current seams:** `packages/control-plane/src/inline-image-extraction.js` validates uncertainty locations; `packages/control-plane/src/learn-image-context.js` distinguishes source receipt from recognition; `packages/control-plane/src/learn-files.js` verifies uploaded bytes. **NEW files/contracts:** `packages/control-plane/src/roadmap/roadmap-ocr-evidence.js`, `packages/control-plane/test/roadmap-ocr-evidence.test.js`; **Modify:** R7 coverage records, R3 reference conversion and, when R9 is enabled, its key-support checker through owners. R9 is not an additional prerequisite for image-source explanations.

- [ ] Persist recognized text beside the original image reference, never as a silent replacement of the source. Mark origin as OCR, including page/crop and extractor version.
- [ ] Preserve alternative readings of consequential symbols, missing legends, unreadable handwriting and partly scanned pages. Only measured region coordinates are clickable; descriptive uncertainty locations remain descriptive.
- [ ] Build claims from supported readable regions while exposing omissions. If an ambiguous exponent, sign or unit changes the answer, ask a focused clarification instead of guessing.
- [ ] Prevent uncertain extracted values from becoming graded answer keys. When R9 practice is enabled, a source correction creates a new activity snapshot/revision under that contract; an existing answer never silently binds to the changed key. Without R9, do not expose scored practice.
- [ ] Test a minus/plus ambiguity, superscript confusion, mixed readable/unreadable pages, a caption contradicting the figure and a document whose text extraction missed its scanned pages.

**Task evidence:** **Done:** fixture evidence shows supported content retained, explicit coverage gaps and unscored uncertain keys; neither an image hash nor a successful OCR response is treated as factual verification.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/src/inline-image-extraction.test.mjs`

**NEW unit tests (create, then run from root):** `node --test packages/control-plane/test/roadmap-ocr-evidence.test.js`

### R15.04 Qualify multimodal safety, cache privacy and current-UI navigation

**Owner:** Verifier, Tools, UI; **Depends:** R15.02–R15.03 and R14 when editors are enabled. **Trace:** §§3.16, 6.4, 8; M13 and M5.14 extension. **Model:** reuse qualified direct JEV `jev-1.13.0` screening under a dedicated modality policy; extraction remains the separate Sonnet role.

**Current seams:** `packages/control-plane/src/webpage-screen.js` bounded image/text screening; `packages/control-plane/src/learn-grade-jev.js` direct transport configuration; `packages/control-plane/src/learn-image-context.js` authorized source read. **NEW files/contracts:** `packages/control-plane/src/roadmap/roadmap-visual-source-checks.js`, `packages/control-plane/test/roadmap-visual-source-checks.test.js`; `packages/web/e2e/roadmap-visual-source-check.mjs`; **Modify:** R3 navigation and release capability registry.

- [ ] Establish source/output checks for actual image bytes, associated text and extracted claims. Reuse transport mechanics without blindly copying webpage thresholds to OCR or broadening supported image sizes.
- [ ] Evaluate ordinary educational anatomy, scientific diagrams, benign noisy scans and disallowed content; retain qualified usefulness and measured false-refusal/coverage limits.
- [ ] Key derivative caches by source/version/crop/policy plus authorized scope; recheck source access on every read and prevent guessable thumbnail/OCR URLs from leaking private material.
- [ ] Resolve unknown screening through bounded retry/contextual adjudication and finite limitation/refund, never indefinite hidden paid preparation.
- [ ] Show exact page/crop references, uncertainty and changed-source states in current UI; test owner/editor/stranger and fork behavior for derivatives.

**Task evidence:** **Done:** independent receipt includes image/notes flags, evaluation corpus, access results and one authorized uncertain-scan smoke; unknown cases remain unavailable without false success.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/webpage-screen.test.js packages/control-plane/test/roadmap-safety.test.js`

**NEW unit tests (create, then run from root):** `node --test packages/control-plane/test/roadmap-visual-source-checks.test.js`

**NEW local browser harness (create first; common prerequisites plus this rung’s fixtures):** `BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node packages/web/e2e/roadmap-visual-source-check.mjs`. Record actual assertions and screenshots; a fixture route proves UI behavior only, not live provider quality.


### 6.13 R16 — A separate bounded execution service

**Current status:** NEW separate execution service and Tutor adapter. No current Tutor sandbox exists; CAD is a precedent to inspect, not a ready general-purpose service. Snippets, empty notebooks and deterministic calculation remain independently usable. Import/index/preview never executes source contents.

**Browser-local prerequisites:** Use a disposable provisioned local Linux execution service with the pinned runtime image, actual required kernel controls and no application/provider credentials. The new Node contract tests can use fixtures, but isolation/cleanup tests must run on the intended runtime. Add a NEW current-UI harness for truthful execution status and output.

**Rung receipt:** Runtime/image/package digest, accepted code/input hashes, measured kernel/network limits, actual output/truncation, cleanup proof, fault/replay results and recorded infrastructure-payer/learner-pricing policy. Enable only the tested runtime/package subset, through focused adopted release checks.

This release proposes new service code. Existing CAD isolation demonstrates specific mechanisms to audit; it is not a ready general-purpose Tutor sandbox. Earlier code examples, notebooks and deterministic calculation remain independently releasable. Importing or indexing a repository, upload or notebook never executes its contents.

### R16.01 Define an accepted computation contract and inert import boundary

**Owner:** Tools, State/Money; Lead owns registry. **Depends:** R4 accepted authorization/tool and shared evidence-identity contracts; R14 if editor execution is enabled. **Activation:** service qualification in R16.02–R16.04 must complete before enabling execution; those tasks depend on this contract, not vice versa. R7 is not a prerequisite. **Trace:** v1.3 §§3.17, 6.3, D41; M15/M4.23. **Model:** none in execution dispatch; reuse an explicitly enabled authoring role only if generating a new code proposal.

**Current precedent:** `packages/control-plane/src/cad-model.js` bounded model request/admission; `packages/cad-execute/server.mjs` bounded request/service boundary. **NEW files/contracts:** `packages/control-plane/src/roadmap/roadmap-execution-contract.js` importing canonical `packages/control-plane/src/roadmap/roadmap-contract.js`, `packages/control-plane/src/roadmap/roadmap-execution-client.js`, `packages/control-plane/test/roadmap-execution-contract.test.js`; **Modify:** current `roadmap-tools.js` through Lead; reuse `packages/control-plane/src/roadmap/roadmap-policy.js` for versioned limits and funding policy.

- [ ] Define `executeComputation(access,acceptance,{code,inputRefs,runtimeDigest,limits})` with immutable code/input hashes, explicit purpose, accepted bound and unique execution ID. Validate schema and source access before reserving work.
- [ ] Freeze runtime/package allowlist and output schema in the proposal; a materially changed program, input set, package or limit requires new acceptance.
- [ ] Record the infrastructure payer and learner-pricing policy before enablement. Execution-service expense is recorded once in the platform ledger, separately from learner price. If the adopted policy is platform-funded, use `zero_priced` with no learner hold; if learner-billed, price the complete bounded computation in R4's aggregate authorization before dispatch and transfer allocations without double reservation. Missing/unpriced policy returns unavailable; do not infer free execution or a new charge from existing CAD pricing.
- [ ] Return typed queued/running/completed/failed/cancelled/unknown outcomes; transport timeout is not proof that execution stopped.
- [ ] Keep all file import/index/preview paths inert. Code from a source or model is untrusted data until this separately accepted service call.
- [ ] Test arbitrary service URL, unknown runtime, tampered hash, stale acceptance, repeated dispatch and import of a file containing executable hooks.

**Task evidence:** **Done:** zero execution requests occur during imports; a valid accepted computation creates one durable job and an altered request is refused before spend or dispatch.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/roadmap-tools.test.js packages/control-plane/test/roadmap-contract.test.js`

**NEW unit tests (create, then run from root):** `node --test packages/control-plane/test/roadmap-execution-contract.test.js`

### R16.02 Build and measure isolation in the new execution service

**Owner:** Tools; independent Verifier reviews isolation. **Depends:** R16.01 and approved measured service configuration. **Trace:** §§3.17, 6.3; M15. **Model:** none.

**Current audit precedents:** `packages/cad-execute/sandbox/cad-sandbox` namespaces/process wait; `packages/cad-execute/sandbox/resource-control.mjs` limits/detection/cleanup; `packages/cad-execute/server.mjs` rejects missing cleanup proof. **NEW files/contracts:** proposed `packages/tutor-execute/` with `Dockerfile`, locked runtime dependencies, `server.mjs`, `sandbox/`, `contract.test.mjs` and `isolation.linux.test.mjs`. These are new service files.

- [ ] Pin runtime image digest and dependency versions; mount a read-only root, read-only accepted input set and one quota-limited per-job temporary workspace. Do not inject application, provider or cloud credentials.
- [ ] Deny network by default at the isolation boundary, including DNS, loopback access to host services, metadata addresses and IPv6; never rely only on application-level URL filters.
- [ ] Apply kernel-enforced CPU, memory, process-count, file-size, disk and wall-time limits before untrusted code starts. Fail closed when required controls are absent; measure settings rather than copying CAD's 2 GiB/512-task values.
- [ ] Isolate concurrent jobs by identity/workspace; reject path traversal, symlink/hardlink escapes, arbitrary mounts and package installation.
- [ ] Kill the full process tree and verify workspace/control-group cleanup after completion, timeout, cancellation and crash. Quarantine a worker whose cleanup proof fails.

**Task evidence:** Run isolation evidence on the intended Linux runtime; mocks do not establish isolation. **Done:** machine-readable kernel-limit/egress/cleanup evidence plus independent review; no claim that existing CAD deployment already satisfies this release.

**Current unit regressions (exist at baseline; root working directory):** No directly applicable current test is asserted for this NEW service boundary; create the tests below. Existing neighboring services are precedents, not proof of this behavior.

**NEW unit tests (create, then run from root):** `node --test packages/tutor-execute/contract.test.mjs packages/tutor-execute/isolation.linux.test.mjs`

### R16.03 Store reproducible computational evidence and reconcile recovery

**Owner:** State/Money, Tools; **Depends:** R16.01–R16.02, R4 durable outbox and publication. **Trace:** §§3.17, 4.3, 5.4, 6.2; M15/M5.14. **Model:** none for execution; optional explanation uses only its qualified roadmap generation role.

**Current precedents:** `packages/cad-execute/server.mjs` execution/cleanup handling; `packages/control-plane/src/learn-video.js` separate provider cost/outcome records. **NEW files/contracts:** `packages/control-plane/src/roadmap/roadmap-execution-jobs.js`, `packages/control-plane/src/roadmap/roadmap-computation-evidence.js`, `packages/control-plane/test/roadmap-execution-recovery.test.js`; proposed additive `<NNNN>-roadmap-executions.sql` after manifest allocation.

- [ ] Store execution ID, accepted code/input hashes, runtime/image/package versions, limits, exit status, stdout/stderr hashes, output artifacts, truncation, resource measurements and cleanup proof; keep sensitive bodies out of telemetry.
- [ ] Commit terminal outcome and replayable notification atomically; retries reconcile the existing job before considering a new execution. Lost acknowledgements cannot start a second paid run.
- [ ] Preserve actual outputs and failure reasons. Mark an example unexecuted, a successful completed run computed, and a partial/failed run according to its real limits; an exit-zero result does not validate all educational claims.
- [ ] Apply accepted-entitlement and modality checks before serving stdout, files or plots. Quarantine unsafe/oversized outputs; preserve an explicit truncation marker rather than pretending complete evidence.
- [ ] Reconcile reservations and refunds under R16.01's recorded payer/pricing policy without erasing platform infrastructure expense; unknown worker outcomes remain held for finite recovery with no blind redispatch. A terminal undeliverable accepted execution refunds any affected learner charge once.

**Task evidence:** **Done:** crash-injection traces show one execution and one terminal notification/charge outcome; reproduced output matches a small deterministic fixture under the pinned runtime.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/roadmap-events.test.js`

**NEW unit tests (create, then run from root):** `node --test packages/control-plane/test/roadmap-execution-recovery.test.js`

### R16.04 Qualify adversarial limits and truthful user-visible results

**Owner:** independent Verifier with Tools/UI fixes; Lead handles activation. **Depends:** R16.01–R16.03. **Trace:** §§3.17, 8; M15, D41. **Model:** fixtures for authoring; no paid model required for isolation tests.

**Current UI precedent:** `packages/control-plane/src/learn-primitives.js` explicitly unexecuted snippets; audit precedent `packages/cad-execute/sandbox/resource-control.mjs` cleanup proof. **NEW files/contracts:** `packages/tutor-execute/acceptance.linux.test.mjs`, `packages/control-plane/test/roadmap-execution-publication.test.js`, `packages/web/e2e/roadmap-execution-check.mjs`; **Modify:** current result renderer and Lead-owned check-map/receipt.

- [ ] Run adversarial fixtures for outbound sockets, DNS/metadata access, filesystem traversal, fork storms, memory exhaustion, infinite loops, huge stdout, oversized files and child processes surviving parent exit.
- [ ] Crash the service between admission/start, start/output and output/commit; cancel queued/running jobs and prove cleanup plus eventual durable outcome. Missing controls or cleanup proof blocks availability.
- [ ] Test revoked editor access, forged input references, shared-board identity isolation and direct output URLs; preserve already-delivered authorized evidence without allowing new unauthorized work.
- [ ] Show execution status, source/runtime provenance, actual output and concise failure limits in current UI. Never render generated “expected output” as execution evidence.
- [ ] Record exact service image, limit measurements, focused security review, adopted infrastructure-payer/learner-pricing policy, measured cost reconciliation and recovery switch; missing funding policy blocks enablement. Activate only the audited runtime/package subset.

**Task evidence:** **Done:** small reproducible computation succeeds, every isolation fixture has recorded outcome, and failure UI states limitations truthfully; broader execution remains disabled.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/roadmap-contract.test.js`

**NEW unit tests (create, then run from root):** `node --test packages/tutor-execute/acceptance.linux.test.mjs packages/control-plane/test/roadmap-execution-publication.test.js`

**NEW local browser harness (create first; common prerequisites plus this rung’s fixtures):** `BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node packages/web/e2e/roadmap-execution-check.mjs`. Record actual assertions and screenshots; a fixture route proves UI behavior only, not live provider quality.



## 7 Finish cleanup without blocking the core

### 7.1 Preserve the retained code and current phase boundaries

**Owner:** cleanup lane; lead integrates shared stores/check-map. **Depends:** only the named cleanup writers/reads, not new Tutor source/slot work. **Models:** none. Historical `handoff/cleanup-v0.1.md` remains an archive copy. It is not cleanup v0.4/v0.5, and its migration numbering/early join-removal proposal is superseded.

| Phase | Current reconciliation / next task | Evidence required |
| --- | --- | --- |
| P1 | Retained `learn-spend.js`, ordinary Next Steps, rubric/Explain-back assessment, Progress and repositories. Archive-sensitive joins deliberately remain. | Current import graph and focused retained-flow tests. No old Tutor transport dependency restored. |
| P2 | Browser Tutor/planner retired. Keep Auto/Ask/Tutor, ordinary Chat, source views, manual Rabbit Holes and Quick Edit. | Home/Next Steps plain Chat handoff, no dead former Tutor invocation. |
| P3 | Server planner/evaluator/handoff removed. The retained tutor-attempts assessment route is not a legacy planner. | Route callers and retained repository/source-map/assessment tests. |
| P4 | Journeys/syllabus removed; Home teach pre-fills the original request into Chat and waits for Send. Accept raw request title where already decided; do not spend automatically. | Home prefill/draft test, removed journey callers, retained voice/audio users. |
| P5 | Duplicate grading retired. Keep attempts, assessments, observations, rubric/visual assessment and their shared paid transport. | Free-assessment, no-key legacy choice, immutable attempt and Progress tests. |
| P6a | After writers are gone and per-environment archived-goal backfill is verified, deploy code that no longer reads journey tables. Tables still exist during this release. | Fresh archive-count/lifecycle evidence, join-free code and retained-store tests; deployed SHA before drops. |
| P6b | Separate controlled schema-source/drop window only after P6a is live. Allocate current migration number and exact allowed tables. | Environment-specific GO where required, backup/export/recovery, pre/post counts/schema and no live old-reader code. |
| P7 | Accurate cleanup docs/receipt and genuinely retired files/checks/corpora. | Imports/routes/check selectors reconciled; retained feature behavior preserved; no false browser/model claim. |

### 7.2 Executable P6/P7 work

- [ ] Inspect `packages/control-plane/src/learn-coaching-store.js` and `learn-attempt-store.js`: current archive joins/status checks still exist. Keep archive semantics until the backfill is verified in the target environment. Move retained SQL builders into the retained store before removing their old defining module; do not revive a deleted journey module to share helpers.
- [ ] Separate the code release removing reads from the later table drop. Never deploy live join SQL against already-dropped tables or remove the join before archived goals have equivalent persisted state.
- [ ] Preserve `learn_goals`, criteria, activities, attempts, assessments, observations, Explain-back assets and new roadmap tables. The owner's old personal journey data may be retired as decided, but that does not authorize dropping retained shared learning tables.
- [ ] Build/verify export, backfill, count and drop scripts against disposable local copies first, with exact table/environment allowlists and refusal outside scope. No documentation update applies a remote migration; production preflight is read-only.
- [ ] Re-scan current call sites before removing files, including Home `AgentBar.jsx`/`teach-plan.js`, voice/audio hooks, grading serialization, retained Next Steps, repository context and tests that formerly seeded via journey routes. Do not retain a dead route merely to keep an obsolete fixture green; rewrite the fixture to use retained APIs.
- [ ] Stage check-map deletion correctly: a deleted registered check keeps its `checks` entry in the deleting push and loses it in the following push; retain relevant `none` entries for their required transition push. Verify against `scripts/ci/affected.mjs`, `check-map.json` and `run-part.sh` at the actual candidate. A missing check file or zero assertions is never a pass.
- [ ] Windows-only checks do not become Linux execution evidence merely because they are mapped. Rewrite/promote only the affected checks needed by the release and record actual runs; unrelated coverage expansion goes in OWNER-INBOX. Do not reintroduce a full CI wait.
- [ ] P7 records current phase SHA, applied environment evidence and limitations. It does not become a blanket dependency blocking unrelated already-authorized Tutor repairs.

**Existing focused regression commands, root cwd:**

```sh
node --test packages/control-plane/test/learn-coaching-store.test.js packages/control-plane/test/learn-attempt-store.test.js packages/control-plane/test/learn-assessment.test.js packages/control-plane/test/learn-assessment-charging.test.js packages/control-plane/test/learn-progress.test.js
node --test scripts/ci/check-map.test.mjs scripts/ci/run-part.test.mjs
```

Extend or add exact archive-backfill/join-free/drop-window tests when those scripts are implemented; mark new test files as NEW in that phase receipt. Existing general store green results are not proof a destructive migration is safe.

## 8 Local verification and direct production release

### 8.1 Evidence tiers and the first two cards

| Evidence | Required use | What it does not establish |
| --- | --- | --- |
| Source/contract inspection | Name current files, configured roles/flags and exact changed seam. | That tests ran, flags are deployed, or a learner flow passed. |
| Deterministic Node tests | Real source/plan/generator/state/money/entitlement modules, scripted external responses, actual request/ledger assertions. | Model quality, D1-only runtime limits or physical browser layout. |
| Local workerd/D1 test | Exercise changed SQL/runtime behavior where sqlite doubles cannot represent production. | Live account credentials or external provider behavior. |
| Keyless local browser fixture | Current DOM, canvas transform, focus, intermediate states, source scroll, persistence and replay. | A real generated explanation; the fake roadmap server is explicitly a fake. |
| Authorized real model test | Actual requested/served model, content/usefulness, call count, latency and real costs for a small representative case. | All future source types/formats or untested edge cases. |
| Deployment/smoke | Served SHA/build/flags and application/feature access behavior. | An authenticated two-card outcome if only signed-out HTTP was exercised. |

For the immediate sprint, `roadmap-document-context.test.js` is the existing server two-card starting point. Extend it for the accepted version, actual production model/body quotation, selected-scope planner input, output table case and no automatic author retry. Do not replace it with a provider stub that bypasses `generateArtifact`. Keep the body/source synthetic in checked-in fixtures; inspect private user records only through authorized, redacted diagnostics.

The actual UI acceptance trace must show intermediate states, not just start/end screenshots: pending → accepting → generating → applicable checking → actual body → board saved → acknowledgement → next proposal. Assert the same slot/card identity, world top-left and width throughout. Generate **both** cards; cancelling the second does not prove it can be generated. Reload after each saved delivery and verify no extra model operation, debit or card. Include one recoverable generation failure and one lost-save/ack case with correct same-slot state.

### 8.2 Exact keyless local browser setup

Use the existing **local** Linux/Git Bash-compatible test infrastructure, not a Cloudflare clone deployment. `scripts/ci/stack.sh` is documented for Linux; on Windows use an available compatible local runtime or the existing narrowly selected runner rather than claiming an unrun check passed. Node unit tests remain independently runnable in the repository's supported Node environment. Do not wait for the owner to click through every state if local fixture evidence is available.

Current stack facts checked in source:

- `scripts/ci/stack.sh start|stop|restart <persist-dir>` starts local app8878/control-plane8879, local D1/DO state and provider tripwire. It uses local bootstrap/schema, never remote migrations.
- It **refuses** to overwrite existing `packages/control-plane/.dev.vars` or `packages/web/.dev.vars`. Use a clean disposable local worktree for this harness; do not delete the developer's credentials to make it run.
- It generates random local test-session/master values and no model keys. It writes the local vars file the checks read and removes its own files on stop. Do not print/upload those values.
- It builds `dist`/`dist-dev` only if absent. For a changed candidate, rebuild the bundles explicitly so stale prior assets do not masquerade as current-source browser proof.
- `roadmap-command-check.mjs` and `roadmap-mvp-check.mjs` refuse non-local BASE/CP, seed a local test session and fake roadmap responses, and intercept model-capable calls. Their current comments include stale recovery wording; current assertions use the existing toast. Update tests to the new slot/ToC rather than preserving the defect.

From a complete clean test worktree, after lockfile dependencies are installed (`npm ci` when needed) and Chromium is installed for Playwright:

```sh
npm --prefix packages/web run build
VITE_COACHING_DEV=true VITE_BYOC_DEV=true npm --prefix packages/web run build -- --outDir dist-dev
bash scripts/ci/stack.sh start /tmp/rh-tutor-keyless
BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node packages/web/e2e/roadmap-command-check.mjs /tmp/rh-tutor-keyless/command-shots
BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node packages/web/e2e/roadmap-mvp-check.mjs /tmp/rh-tutor-keyless/flow-shots
bash scripts/ci/stack.sh stop /tmp/rh-tutor-keyless
```

Use a task-specific unused path and ensure the fixed ports8878/8879 and inspectors9318/9319 are free, and ensure `stop` runs even on a failed check (a shell trap in the task launcher is appropriate). Keep the harness's provider-tripwire result at zero and retain request logs/assertion totals. If startup fails, report that exact runtime failure, not “UI passed.” The older journey-local-stack manual includes obsolete journey-schema instructions; do not copy its table drops into current source testing or production.

Existing `scripts/ci/run-part.sh <selection.json> <output-dir>` can run a deliberately narrow selected pair with the same keyless stack, logs and cleanup. It rejects unsupported runner classes and zero assertions. This is a local selected-check helper, not a reason to rerun the broad gate. Never point seed/reset fixtures at `digrabbithole.com`.

### 8.3 REL.01 Classify and freeze the exact candidate

**Owner:** Lead. **Depends:** a complete small learner outcome. **Models:** none.

- [ ] Read current main and candidate diff; integrate only the selected complete fix/capability. Pin SHA/tree/build and actual enabled flags. Keep independent later branch work out of this frozen candidate.
- [ ] Compare all imports, route mounts, environment bindings and required migrations. Check existing file classifications; register genuinely new executable/test files with the smallest relevant mapping. Follow staged deletion rules.
- [ ] Run affected local unit/contract checks and successful build once on the final candidate. Repeat only if relevant changes/failures warrant it. Record nonzero test counts and skipped/unavailable checks honestly.
- [ ] Separate blockers from nonblocking inbox items. No release dependency on optional tools, unrelated cleanup drop, mockup completion or full broad CI/gate.

**Receipt:** exact diff/files, candidate identities, affected checks/results, actual migration/flag prerequisites, and recovery target. No “green” shorthand that hides known feature failures.

### 8.4 REL.02 Verify the complete supported current UI

**Owner:** independent Verifier, with the implementer supplying an executable fixture. **Depends:** only current changed feature behavior. **Models:** local doubles.

- [ ] Run the relevant UI.01–08 matrix against the current candidate bundles. Capture slot/pill dimensions/theme and state transitions, single ToC tree, Tab exclusions, source scrolling, save/reload and the second card.
- [ ] Verify current request/response and persisted data, not only screenshots. Stale/duplicate action cases must have one winner and one charge identity; hidden/unapproved body never enters the visible or shared surface.
- [ ] If a browser/runtime is unavailable, record the exact missing tier and retain passing lower-tier evidence. Continue independent work; do not claim browser acceptance or demand repeated manual owner testing of a reproduced backend error.

**Receipt:** candidate/build, commands and nonzero assertions, screenshots/geometry/state records, zero unexpected paid calls, unresolved failures. Reuse valid existing evidence for unchanged paths.

### 8.5 REL.03 Qualify only the changed model/tool capability

**Owner:** Tools and Verifier. **Depends:** deterministic core/adapter tests. **Models:** actual configured roles, never invented availability. **Spend:** existing explicitly authorized cap only; record settled/reserved/unknown separately. **Order:** case selection, authorized budget and local readiness are predeployment work. The new candidate's live production run happens after deployment inside REL.05; its result is not a prerequisite for deploying that same candidate.

- [ ] Choose a small representative case for the current release, including the reported real source/job when authorized. State the supported scope and expected outcome before running it. For the ordinary core use two different planned steps from one bounded document, including a fact outside the highlight.
- [ ] Capture source/plan/proposal/prompt versions, actual request coverage and requested/served model. Record author/check/tool call counts and real cost. Do not log private raw source or hidden model reasoning in public receipts.
- [ ] Score instruction fidelity, scope, usefulness, repetition, source honesty, valid output, stopping and applicable safety. Ordinary text does not regain a blocking citation reviewer because evaluation records content quality.
- [ ] Verify provider/infrastructure failures separately from authored-content failures. Reconcile an unknown outcome before another paid call. No automatic retry loop, no multiplying a prior approved cap by the number of rungs.
- [ ] Use production for the owner's sprint qualification direction under the authorized account/budget; no new clone deployment. If credentials or paid authorization are unavailable, finish local proof and record the exact missing operation instead of inventing a pass.

**Receipt:** actual results/limits, first and second delivery, spend ledger, relevant quality result and known untested cases. This task does not require qualifying every future command before the current fix ships.

### 8.6 REL.04 Make the existing MVP tooling support the direct-production instruction

**Owner:** release tooling owner/Lead. **Depends:** actual current tool predicates and existing owner authorization. **Models:** none. **Existing exact targets:** `scripts/mvp-fast-path.mjs::{REQUIRED,mvpVerdict,runPreview}`, `scripts/prod-release.mjs::checkPrepare`, their current tests and the workflow consumers they actually call.

At the audited source, the tool still requires preview/dev-clone evidence and does not accept `--no-deploy` as production evidence. Prose does not bypass that predicate. The owner has superseded the clone/preview wait for this sprint; implement the smallest explicit compatible MVP evidence mode if the current candidate still needs it. Do not reintroduce a dev clone just to satisfy an obsolete doc line.

- [ ] Inspect all actual consumers before editing the schema/predicate. Bind the new direct-production mode to exact candidate/tree/build, existing per-release authorization and a named focused-check receipt.
- [ ] Mark omitted preview/broad CI/gate as **bypassed/not run**, never passed. Keep ordinary release modes unchanged; no public request field or fabricated note grants release authority.
- [ ] Preserve schema/secrets preflight, target identity, affected tests/build, available recovery and actual production smoke. Resolve required migration status before release; preflight must not secretly apply a migration.
- [ ] Test the mode entirely offline with stub external commands and no production credential/network side effects. Include wrong SHA/build/environment, missing required evidence, falsely claimed preview, failed check and ordinary-mode regression cases.
- [ ] Produce the exact supported release command only after the implementation and receipt exist. Do not invent a `--direct`/`--skip` flag in the handoff, silently set arbitrary variables, or replace the release workflow with bare wrangler.

```sh
node --test scripts/mvp-fast-path.test.mjs scripts/prod-release.test.mjs
```

**Receipt:** concrete current-tool finding, minimal compatibility diff, tests, preserved constraints and exact candidate command. This is one implementation task, not a new general approval round. If a documented release-specific owner command remains necessary, make that single concrete handoff while other authorized work continues.

### 8.7 REL.05 Deploy once, verify production and keep moving

**Owner:** Lead/release operator under existing authorization. **Depends:** REL.01–02, REL.03 predeployment readiness and REL.04 only where applicable. **Models:** only the authorized focused live check.

- [ ] Use the supported direct-production MVP procedure and exact verified candidate. Apply only separately authorized required migrations to the named environment, with receipts; do not bundle P6b into a core release.
- [ ] Verify served app/control-plane SHA/version/build, relevant flags, route authorization and signed-in feature outcome separately. A signed-out401 proves access enforcement, not successful generation. Report any unexpected400/5xx accurately.
- [ ] Exercise the two-card saved/reload flow on production when authorized/session available. Keep the same IDs for diagnosis. If a required functional blocker appears, fix/recover it; do not say deployed means accepted.
- [ ] Use available recovery for actual failure. Keep its target/current ancestry correct; do not let an unrelated recovery preview become another clone gate. Reconcile paid operations/accepted state before claiming rollback erased costs.
- [ ] Write the release receipt and update OWNER-INBOX. Continue the next independent complete MVP. Nonblocking polish, optional formats and future coverage do not hold the sprint.

**Receipt:** released SHA/version/build, required migration evidence, enabled subset, build/affected checks, production smoke, authenticated result or precise remaining limitation, recovery and next ready task. Remove temporary release authorization according to the supported tool procedure.

## 9 Actions, expected results and completion record

### 9.1 Required test assertions by learner action

| Action | Visible expectation | Backend/storage/charge assertion | Owning tasks |
| --- | --- | --- | --- |
| Drop source; continue typing | One invitation after saved/readable revision and idle; exact two choices. | No author call/debit; no invitation on unsaved bytes. | UI.01, R4.04 |
| Choose whole/visible teaching scope | Same source display/outer size; scope captured once. | Entire bounded source reaches planner and writer; scope/anchor/coverage distinct. | CORE.02–03, UI.03 |
| Accept plan | One same-source proposal with title/description/format. | No artifact purchase from plan acceptance. | R4.04, UI.04 |
| Tab in canvas vs composer/editor | Canvas accepts current eligible proposal; editor Tab stays ordinary. | Click/Tab share one action/version; no request in excluded contexts. | UI.05 |
| Accept first explanation/table | Same frame/position/width, spinner, then actual content. | At most one author dispatch, no citation roles, applicable safety/schema/access; actual body fits hold. | CORE.03–07, UI.04/06 |
| Scroll source or pan/zoom | Inner scroll never moves slot; canvas transform moves source/slot together. | No re-placement, context clipping, generation or charge. | UI.06–07 |
| Failure or uncertain response | Original slot remains with truthful state and existing toast. | Known failure refunded/released once; unknown reconciles; no blind author redispatch. | CORE.04/06, UI.04 |
| Save failure/lost ack/reload | One restored result/card at same location. | Save before ack; same cardID/resultID, zero new author/debit. | UI.06, CORE.07 |
| Second offer and acceptance | One next proposal after saved first delivery; second card actually renders. | Its own accepted step/version/context; exactly one purchase/call and one saved result. | CORE.07, R6.02–03 |
| Cancel | Pending slot removed intentionally; ToC cancelled/pause. | No mastery inference or automatic reoffer; next independent step only by explicit request. | UI.05/08, R4.12 |
| Edit proposal | Existing Ctrl/Cmd+K preview, Apply new version, geometry stable. | Preview/Apply no generation; latest accepted edit reaches writer; action races guarded. | R5.01–03 |
| Link existing card | Existing card stays in place, ToC links it. | Zero author/hold/debit, revalidated accessible identity. | R5.04 |
| Thumbs/practice | Hover-only blue feedback; assessment shown separately. | Private self-report vs immutable assessed observation; no goal prerequisite. | UI.08, R9 |
| Source changed/access revoked | Honest unavailable/changed state; no guessed highlight. | No unauthorized read/dispatch/publication; historical delivered refs preserved as allowed. | CORE.02–06, R3, future R14 |
| Stop/end | No more automatic offers; content remains. | Finite ceiling, no implicit scope expansion, accepted assets retained. | R4.12, R6, R10 |

### 9.2 Per-task receipt template

Use this shape in the actual task/release receipt, not a new mandatory paperwork system:

```text
Task/release:
Candidate SHA / source baseline:
Learner action now supported:
Existing components/functions reused:
Exact changed files and interfaces:
Enabled source/format/mode subset:
Commands run; nonzero case counts; failures/skips:
Actual model/provider/call counts if exercised:
Source/plan/proposal versions and context coverage:
Charge/hold/refund evidence if exercised:
UI geometry/focus/save/reload evidence if exercised:
Deployment identity and functional acceptance (separate):
Blocking issue, or nonblocking OWNER-INBOX item and next action:
```

### 9.3 Documentation review completion

Before handing this pair to an implementer, verify that every requested action has an expected visible result, state transition, authorization/cost effect and test owner. Check current main again for completed work. Remove conflicting older instructions rather than hiding them under a vague addendum. Ensure the task tells the engineer which existing component/function to reuse, which new file is only proposed, and exactly what evidence counts.

This checklist intentionally separates build work from proof and production status. It does not turn a documentation push into an application deployment, nor make later optional tools prerequisites for the corrected Markdown core.
