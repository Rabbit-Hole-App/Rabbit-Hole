> Depth names (renamed 2026-11-08): Brief = Overview, Balanced = Standard, Detailed = Deep. The names in this file below are updated where they name the learner's Depth; stored values written with the old names are read through an alias map (`packages/control-plane/src/chat-depth.js` `DEPTH_ALIASES`).

# Explain on Canvas — Tutor implementation checklist

**Rabbit Hole · Version 1.2 · MVP flow update · 7 November 2026 · HOW we build and verify the feature**

**Product authority:** [Tutor roadmap v1.4](tutor-roadmap-v1.4.md). The roadmap describes WHAT the learner receives. This companion supplies exact changes, current files/functions, dependencies, owners, configured or proposed models, local tests and completion evidence. Both supersede the earlier active v1.3/v1.0 pair. Keep the release/task identifiers for traceability; do not execute old contradictory instructions beside these.

**Audited main:** `e447525a83c6e9809f2f1cdaa27071c31a3a0b3f`, reviewed against the 21 commits after `72d6536657af269bb894511220975fd2254246ed`. The per-commit review, local results and remaining tasks are in section 2.1.1. Keep the working foundations and implement the pending requirements from these docs.

**Latest reviewed implementation SHA** `04219878da7360131138c9059ce74854a51a1c0e` on `main`, against reviewed handoff `19eb73418d4c1cd8657f5aab6e0b659ead09df7a`. The review and release evidence below update the earlier pinned findings. See §2.1.3. Use this SHA as the starting checkpoint for the next implementation audit.

**This revision records source review and focused local tests.** The six [UI references](ui/) remain the implementation targets. The expanded R1–R7 audit passed **496 distinct Node tests across 46 files**, including the original 213-test batch, from pinned main source. The full section 8.0 flow matrix, production UI acceptance and shared Explanation prompt/renderer implementation still need their own evidence.

**Required testing order for this MVP:** Claude Code completes the [local backend flow tests](#80-required-local-backend-flow-tests-before-manual-production-checking) and reports their evidence before asking the owner to check the deployed app manually. This stage uses Node/backend tests, not a browser. The older local-browser instructions below are reference material only unless the owner separately requests them. A documentation/reference push does not mean these tests have run.

## Contents

- [1 Execution rules and the next outcome](#1-execution-rules-and-the-next-outcome)
- [2 Current code, models and ownership](#2-current-code-models-and-ownership)
- [3 Correct the remaining source, author and accounting gaps](#3-correct-the-remaining-source-author-and-accounting-gaps)
- [4 Implement the complete Chat and canvas workflow](#4-implement-the-complete-chat-and-canvas-workflow)
  - [4.5 Chat routing and reply reliability](#45-chat-routing-and-reply-reliability)
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
  - [8.0 Required local backend flow tests before manual production checking](#80-required-local-backend-flow-tests-before-manual-production-checking)
- [9 Actions, expected results and completion record](#9-actions-expected-results-and-completion-record)

## 1 Execution rules and the next outcome

### 1.1 Immediate sprint target

**Current owner decisions — supersede older release/design instructions:** Finish the complete core Tutor MVP first. Claude Code may push docs and code to main, set `MVP_ALLOWED_SHA` for the exact tested release candidate, run the existing release launcher and monitor production without another owner command. Keep the existing isolated clone deployment required by that launcher as release verification; production is the delivery target. No new no-clone mode is requested. Disregard the earlier Contents Q1–Q7 discussion/hold; implement the current docs and file 01 in this sprint. Use five agents with one integrator and separate backend, Chat/ToC, canvas/Explanation and verification ownership. Run affected tests/build per release and finish section 8.0 before the final handoff. Continue implementing and releasing without waiting for owner manual checks between tasks or releases. Local tests use doubles, with no paid model calls. Reuse `chat_message_meta`/`scope_json` where sufficient; an unavoidable production migration still needs the owner's command, while independent work continues. Remaining R7 extensions may be deferred; preserve existing enabled R7a behavior. R8a is next after Core Tutor, starting with the written Explanation card (§6.4). Deliver R10 for **Explanations only**, then add assessed-practice adaptation after R9 qualifies that path (§6.7). Deliver R11 before R12. R12 implementation remains on hold.

Deliver this complete supported flow: **successful Markdown drop → right Chat opens with immediate acknowledgement → Start new chat / Stay here when occupied → Explain on canvas → whole-context planning → draft and parameter box in Chat → Accept roadmap / Edit roadmap → accepted roadmap published in the existing ToC tree with a Chat link → passage-adjacent proposal mirrored in Chat → click/Tab/Chat Accept → persistent same-slot generation and Chat status → saved card with source highlight/icon → one next proposal in both places → second saved card → finite completion**. Section 4 spells out every branch, state, control and placement rule; it is not optional detail. Full-source context, correct charging and no automatic citation/repair loop apply to every ordinary card.

Preserve the backend author corrections already in main. The remaining work covers planner scope, accepted intent, allowance bounds, safety and retry policy, canvas slots, conversation ownership, roadmap revision, passage placement/backlinks and the accepted ToC. The delivered Explanation contract in [CORE.09](#core09-deliver-the-tutor-explanation-card) is part of this core MVP, including backend caps and title binding, the pinned header and downward disclosure layout, and Markdown tables and Mermaid rendering.

No new agent framework, duplicated UI, general pipeline rewrite, all-format qualification, optional reward system or cleanup table drop is needed to finish this slice. Record nonblocking work in `docs/features/explain-on-canvas/OWNER-INBOX.md` with evidence, impact and a next action. A real supported-flow failure, incorrect debit, access leak, data loss or required migration mismatch is not a cosmetic follow-up.

### 1.2 Read this document as executable tasks

- `CORE.*` and `UI.*` are the current correction. [`CHAT.01` and `CHAT.02`](#45-chat-routing-and-reply-reliability) track the routing outage repair and shared reply path. Their owners commit narrow changes; shared integration belongs to the lead.
- Section 5 preserves R1–R6 IDs and maps completed/current behavior to exact implementation and remaining tests. It is not a request to rebuild them.
- R7–R16 remain the feature ladder. A later rung's missing tests/capability are not blockers for an unrelated earlier supported slice. Each adapter can ship independently after its real dependencies.
- `[x]` means the specifically stated implementation has been source-reviewed and locally verified at the audited SHA. `[ ]` remains incomplete or lacks the required evidence. A **partial** rollup has completed foundations and remaining work named separately; **deferred** remains unfinished outside the current sprint. A struck-through requirement is superseded, not completed. Owner manual production acceptance is a separate receipt; its absence does not uncheck verified backend work. Record existing proof and extend only what the change requires.
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
| Chat and ToC | Right-hand Chat owns receipt/choice, roadmap planning, parameters, draft review, edits, statuses and actions. Contents owns the accepted heading tree and its independent outline conversation with the fixed composer. Progress stays in its tab. |
| Delivery | Persist exact card ID and placement before acknowledging; a save/reload/ack problem never requires another author call. Next offer follows acknowledged delivery. |
| Error | Keep the original slot and its Chat entry with truthful status. No ordinary Retry / Replace / Omit, recovery block, from-scratch chip or automatic author redispatch. Reconcile save/ack on the same result; safety refusal stops automatic next offers. |
| Privacy | Pending proposals/results/evidence/feedback stay actor-private. Shares/forks contain permitted delivered content and references, not private state. |
| Testing | Required local backend/Node flow tests first (section 8.0), using real source/plan/generator/money/state/message/persistence seams with external doubles. Owner manual production UI checking follows that receipt. Browser automation is not part of this stage; model quality and visible layout remain separate evidence. |

### 1.4 Local environment and command rules

Use a complete current repository checkout and its lockfiles. Follow root `CLAUDE.md` and package manifests for dependencies. Tests use Node's test runner, including `node:sqlite`; use Node24, as the current verification/browser workflows do. With dependencies installed, commands in this checklist run from repository root unless a task explicitly says `packages/control-plane` or `packages/web`.

Current commands include `node --test <named files>`, `npm --prefix packages/web run build`, and the repository unit entry `bash run.sh test:unit control-plane web`. There is no generic root `npm test` substitute. Prefer the named affected suites; do not repeat every unit/browser suite after each prose or unrelated label change.

For this MVP, section 8.0 is the required local pre-handoff test path and does not launch a browser. The older local browser checks are reference-only unless separately requested; they use a local app/control plane and deterministic route fixtures with paid/model routes intercepted or denied. Existing command-check harnesses name their prerequisites and session setup. A local browser fixture is **not** a deployed dev clone. A supplied `BASE` alone does not prove the check is keyless; inspect its calls before running it. Never point a destructive seed/reset fixture at production. Production smoke uses an authorized test account and bounded actions.

### 1.5 Retained setup task IDs

| Task | Current executable scope | Evidence |
| --- | --- | --- |
| BASE.01 Reconcile active work | Lead reads current main/active branch heads, existing receipts, real imports/callers and migration allocations; preserves unrelated uncommitted work; assigns exact shared-file writers. Only actual shared-interface cleanup dependencies apply. | Baseline/branch/migration map and affected dependency list. New schema uses `node --test scripts/schema-check.test.mjs`; no blanket P7 receipt or repeated new approval. |
| BASE.02 Shared contracts/capabilities | Lead/State/Tools reuse existing nested `roadmap-contract.js`, `roadmap-policy.js`, `roadmap-tools.js` and web facade; update the scoped ordinary-author policy and enabled capability matrix. Preserve distinct generation/validation/decision/delivery/billing dimensions and measured bounds. | Existing `roadmap-contract.test.js`, `roadmap-policy.test.js`, `roadmap-tools.test.js`, `learn-models.test.js` under control-plane tests; disabled tools refused, actual registry/limits logged. No duplicate unmounted core implementation. |

### 1.6 Baseline, release report and checkbox discipline

The earlier handoff began at documentation commit `bf7194dad13706da8fbe6fe8f71f0da88831deb4`. The current review extends docs commit `4e81d42ddbc0da99d7dfd523ffea80cb60804659` on `chatgpt/tutor` using the audited main above. Section 2.1.1 supersedes this historical release report for current source status. The following is the owner's release report, **not independently verified deployment or functional acceptance evidence**:

| Release | Owner-reported position | Reconciliation required before checking work |
| --- | --- | --- |
| 76 | Core deployed; ROADMAP_ENABLED and ROADMAP_AUTO_ENABLED on; unaccepted | Preserve source already present; verify the full revised UI.01–08 flow |
| 79 | R5 edit deployed; ROADMAP_EDIT_ENABLED off; unaccepted | Verify exact Edit card subset and flag state; broader reuse remains separate |
| 80 | R7a deployed; ROADMAP_LONG_MARKDOWN_ENABLED off; unaccepted | Qualify coverage/context before enabling; no full-read claim for unsupported length |
| 81–82 | Failure reasons, Tab, Contents scrolling, Accepting and quote check deployed; unaccepted | Retain useful fixes; replace split ToC/obsolete recovery contracts |
| 84 | Checker evidence contract deployed; unaccepted | Preserve evidence honesty and ordinary grounding not_run |
| 85 | Whole document / one author call / no citation gate; removed chip and recovery block; deployed 15:13 PT; unaccepted | Audit source, then actual first-and-second-card behavior |
| 86 | Slot beside Markdown, generating in place and card fills slot; ready, awaiting owner | Compare pushed SHA against UI.04/06; source existence does not prove geometry/save behavior |
| 87 | No Retry/Replace/Omit; failed step skipped; no auto-offer after safety refusal; ready after 86 | Compare pushed SHA against CORE.04 and UI.04/08, including unknown costs |
| 88 | Remaining passage matching and A1/B1/C1; being verified | Require concrete commit/test evidence; do not infer complete placement/backlink behavior |
| 89 | Tutor in Chat, Depth, Accept in Chat, old panel hidden; being built | Actual persisted message ownership, occupied-thread choice and accepted revision still require explicit proof |
| Not started in report | ToC reference redesign, enabling R5/R7a flags, P6/P7, R8/R9 | Retain the existing tasks; do not check them from this prose update |

When Claude Code pushes an implementation, compare the actual candidate against the specific task and record SHA, file/behavior and appropriate test evidence before changing `[ ]` to `[x]`. A release number, “ready,” merged code, a successful build or deployed flag alone cannot establish the whole workflow. Separate **implemented**, **locally verified**, **deployed**, **enabled** and **owner accepted**. Preserve the checked CORE.01 source facts and the verified R1–R7 foundations below; section 2.1.1 receipt bullets do not add duplicate work. Keep containing flow tasks pending until their full requirements and evidence are met. If a checked item later regresses, reopen that item and record the failing evidence. Do not erase past implementation evidence merely because the extended workflow is still incomplete.



## 2 Current code, models and ownership

### 1.7 Keep reviewed docs and implementation synchronized

The two handoff documents on `rabbit-hole/chatgpt/tutor` are the reviewed WHAT and HOW for this work. At each task boundary, fetch the branch and import its latest handoff documents, the [Ask, Auto and Tutor workflow](ask-auto-tutor-workflow.md), the [Explain on Canvas workflow](explain-on-canvas-workflow.md), UI references and shared routing fixtures into the clean main worktree. Record the fetched handoff commit in the implementation receipt. Preserve any ongoing code work before changing worktrees.

Run these commands from the clean main worktree, using the repository's `rabbit-hole` remote. Check the four shared fixture files against the last imported handoff commit before restoring them. If implementation added or changed cases on main, reconcile those cases by stable ID and stage the merged fixtures. Use the explicit paths below for a first sync or when there are no main-side fixture edits.

```bash
git fetch rabbit-hole
git pull --ff-only rabbit-hole main
git rev-parse rabbit-hole/chatgpt/tutor
routing_fixture_root=packages/control-plane/test/fixtures/chat-routing
routing_fixture_paths=("$routing_fixture_root/intent.json" "$routing_fixture_root/send/ask.json" "$routing_fixture_root/send/auto.json" "$routing_fixture_root/send/tutor.json")
git restore --source=rabbit-hole/chatgpt/tutor -- docs/features/explain-on-canvas/handoff/tutor-roadmap-v1.4.md docs/features/explain-on-canvas/handoff/tutor-implementation-checklist.md docs/features/explain-on-canvas/handoff/ask-auto-tutor-workflow.md docs/features/explain-on-canvas/handoff/explain-on-canvas-workflow.md docs/features/explain-on-canvas/handoff/ui "${routing_fixture_paths[@]}"
git add -- docs/features/explain-on-canvas/handoff/tutor-roadmap-v1.4.md docs/features/explain-on-canvas/handoff/tutor-implementation-checklist.md docs/features/explain-on-canvas/handoff/ask-auto-tutor-workflow.md docs/features/explain-on-canvas/handoff/explain-on-canvas-workflow.md docs/features/explain-on-canvas/handoff/ui "${routing_fixture_paths[@]}"
git diff --cached --stat
git diff --cached --check
git commit -m "Sync Tutor handoff docs, workflows, UI and routing fixtures"
git push rabbit-hole main
```

If the staged sync is empty, continue with the already synchronized docs. A divergent main uses the existing integration workflow. This import copies the listed handoff paths. Add implementation-owned command suites separately during their R12 adapter work.

After syncing, read both documents, the relevant HTML and the fixture sets for the affected routing work before coding. Reuse the reviewed implementations in section 2.1.1 and complete the pending CORE/UI tasks. Each implementation receipt identifies the docs revision, task IDs, code commit, affected behavior, exact local commands/counts, external doubles and unresolved checks. Push the code through the existing main integration path.

For the next review, compare new main commits after the **latest reviewed implementation SHA** above against the relevant task IDs and normal entry points. Mark only the exact requirement with current evidence. Keep partial and regressed behavior open with the failing case. Preserve prior verified receipts and concurrent handoff changes. A handoff-only sync adds no implementation evidence.

### 2.1 Implementation inventory

| Area | Current main implementation | Remaining boundary |
| --- | --- | --- |
| Feedback/settings/references | R1–R3 modules and migrations 0036/0037/0038 present. | Preserve actual hover/Depth/private references while integrating new slots. |
| Roadmap state and core | Mounted `roadmap/` modules, `RoadmapJobs`, migration0039; prod app config enables core. | Full learner flow not accepted solely from code/config. |
| Ordinary author | `roadmap-card-3`, full bounded document + brief, trusted `repairs:0`, `grounding:false`/`not_run`. | Planner's narrow-scope input, accepted-version selection, automatic provider retry and money bounds still need targeted reconciliation; expanded source-safety coverage is a measured follow-up. |
| Canvas slot | `SlotCard.jsx`, `roadmap-canvas.js`, `placeRoadmapCard` and host wiring now exist, with slot/markup tests. | Extend private reload persistence, measured final-save geometry, slot navigation and exact visual contract; do not rebuild the slot framework. |
| Two-card test | `roadmap-document-context.test.js` passed all three existing regressions at the pinned main. | It uses external doubles and direct SQL board writes. It establishes its named backend behavior, with the full BE matrix and physical UI still pending. |
| Automatic next offer | R6 deterministic metadata composition, migration0040; prod auto flag on. | Correct UI visibility, saved delivery and one-offer behavior need integrated proof. No R11 speculation exists. |
| Proposal edits/reuse | Draft/apply/link backend, existing inline editor, migration 0041 and bounded edit previews. | `ROADMAP_EDIT_ENABLED` is true in the production app config. Complete the targeted composer and accepted-edited-brief requirements, then qualify the broader reuse subset. |
| Long Markdown | Index/summary/retrieval and bounded planning loop, migration 0042. | The production app config has `ROADMAP_LONG_MARKDOWN_ENABLED: true`. Current authoring above 40,000 characters uses the step passage. R7a.04 adds bounded supporting excerpts and its own backend qualification. |
| Remaining tools | Standalone Exa/fetch/evidence, PDF extraction, assessment and rich-command engines exist. | Tutor wrappers and R7b/R8–R16 capabilities are not implied by standalone support. |
| Cleanup | P1–P5 removal source/receipts exist; journey archive reads remain. | P6a/backfill/drop/P7 not established complete. Historical cleanup-v0.1 is not a runnable current plan. |

The active application flag source is `packages/web/wrangler.rabbit-hole-prod.jsonc`. Reading only a separate control-plane config would give the wrong activation answer. Migrations present in the repository are not proof they were applied in any remote environment. Allocate new numbers only after inspecting the current tree and remote migration state; do not reuse0036–0042 or blindly follow historical branch reservations.

### 2.1.1 Review of main commits through e447525

This audit covers the 21 commits after `72d6536`. These changes predate the owner's delivery of the newest handoff to Claude Code. Preserve the useful implementation and reconcile it with the newer approved requirements. A completed narrow source change does not complete the containing CORE/UI task.

| Commit | Reviewed change | Result against this handoff |
| --- | --- | --- |
| `b2f5cdc4` | Removes Retry/Replace/Omit routes, projections and controls. Failed steps become skipped and can trigger the next offer. Deletes the old recovery test. | Retain. Source removal is complete. The separate automatic provider retry still needs CORE.04. |
| `11d1ea0e` | Suppresses automatic offers after a policy refusal. | Retain. Safety-stop foundation is locally covered by the backend suites. |
| `9da3eb5d` | Resolves a raw Markdown quote in rendered source text and reveals collapsed content on explicit navigation. | Retain. Source navigation foundation for UI.07. |
| `e9785a07` | Preserves operators, signs, decimals and word boundaries during quote folding, with nearby context and ambiguity handling. | Retain. All seven rendered-anchor tests pass. Finish the approved persistent annotation/icon treatment. |
| `4f3222e0` | Source control on a pending slot, navigation back to that slot, quiet source emphasis. | Retain the locator and quiet emphasis. Apply the approved View section / View card labels and ScanText glyph through UI.07. |
| `8dc3e4e5` | Draws roadmap status inside the existing Chat renderer and unmounts the detached RoadmapChat bar. | Partial UI.01/04. `roadmap-transcript.js` derives lifecycle rows from the current view. Persist a stable step message and retain completed history. |
| `3d2b7eec` | Adds per-source Depth confirmation, Start planning, Chat acceptance and a Contents navigation line. Hides the old welcome entry. | Preserve submitted Depth and shared acceptance. Reconcile the extra Start planning row with the approved Chat parameter/draft flow in UI.03. |
| `98c972df` | Updates browser fixture selectors and hides the saved invitation's rating footer. | Retain the footer fix. Browser selectors describe their older flow and need alignment as UI.01–03 changes. |
| `81171475` | Reuses proposal Edit in Chat, includes Tutor slots in placement obstacles, refreshes re-proposal placement and removes the Chat Tab hint. | Retain. Client/placement tests pass. Pending placement persistence and edited-title continuity still need UI.04/06. |
| `92b4bf0c` | Makes the existing edit overlay visible for an offscreen source and reuses pill corner geometry. | Retain as the current editor foundation. The approved targeted composer behavior is tracked in UI.03–05. |
| `55518736` | Moves RoadmapToc into TableOfContents' one scroller through its top slot. | Partial UI.02. The remaining RoadmapPlan still contains parameters, stopping point, draft steps and action buttons. Implement file 01's accepted-only tree. |
| `a6abc799` | Stores the server Tutor-thread binding in scope_json and uses a guarded first-writer rule. | Retain. All five thread tests pass. Reuse this association for the selected conversation and durable messages. |
| `c77b14a5` | Integrates the Contents change. | Reviewed with `55518736` and the current LearnPage/TableOfContents callers. Integration has the same UI.02 boundary. |
| `37acba4b` | Integrates thread binding, including transcript-test conflict resolution. | Reviewed with the bound-thread code and current caller. Preserve cross-device thread ownership. |
| `670ecbb5` | Sets the production app's R5 edit and R7a long-source flags to true. | Source configuration verified. Remove obsolete flag-absent instructions and qualify the enabled capabilities. |
| `05c2aebd` | Makes thread repair silent, limits fresh fallback threads per session, and binds only the matching invitation. | Retain the safeguards. UI.01 still needs the owner's explicit destination choice on an occupied Chat. |
| `34f42f93` | Adds five edit previews per proposal and 30 per learner per UTC day. | Sequential cap, replay and route tests pass. Preserve those limits while changing the edit UI. Include concurrent quota checks in the integrated edit coverage. |
| `51d357c3` | Adjusts the release source-check pattern for the new ToC top slot. | Retain as a check update. It establishes the wrapper structure, not accepted-tree behavior. |
| `b4cd3b94` | Opens newly imported Markdown in the existing Full content layout. | Retain. The import suite passes and existing saved-card layout stays compatible. |
| `56b53f7a` | Adds the existing-UI reuse rule to CLAUDE.md. | Follow the rule with the numbered HTML references and named existing components. |
| `e447525a` | Moves the UI rule into UI.md with a CLAUDE.md pointer. | Follow current root instructions and UI.md. |

**Locally verified foundations — receipt bullets, not duplicate task checkboxes**

- Run the existing whole-document/two-card backend regression on pinned main. Three tests passed. Retain its explicit limits below.
- Verify the existing server Tutor-thread association. Five thread tests passed, including first-writer behavior, access checks, deletion/rebinding and invitation identity.
- Verify raw-Markdown locator behavior through actual server-rendered Markdown. Seven anchor tests passed with ambiguous, changed and look-alike cases.
- Verify current slot markup/privacy/source-navigation foundation. Eight slot render tests passed. This is Node-rendered markup evidence.
- Verify the client/controller, placement, source-reference and import foundations. Six suites passed 106 tests.
- Confirm source removal of ordinary recovery actions and the safety-refusal successor guard. Retain the new failed/skipped state.
- Confirm the one-scroller ToC wiring and both newly enabled flags in current source. Acceptance of the new Chat/ToC design is pending.

**Remaining correction by task**

| Task | State after review | Required next work |
| --- | --- | --- |
| CORE.01 | Source retained and its focused regression rerun. | Preserve whole-source authoring, trusted repairs:0 and honest grounding not_run. |
| CORE.02 | Pending. | Selected-scope planning still slices source context. Separate full document context from teaching scope. |
| CORE.03 | Pending. | Bind the accepted plan/proposal version, learner revisions, title and frozen settings. Current writer still reads current accepted_plan_version/current.depth and normalized step fields. |
| CORE.04 | Partial. | Keep removed recovery actions and skipped failures. Remove the automatic author redispatch still asserted by current loop/money tests. |
| CORE.05 | Pending. | Quote and bind the exact serialized author request before acceptance. The fixed call envelope is still provisional. |
| CORE.06 | Partial. | Retain schema, access, revision and safety. Bind accepted learner revisions to safety and retain the refusal stop. |
| CORE.07 | Three document-context regressions passed, including two saved card results. | Complete section 8.0 with separate Table output, real board save routes, automatic successor, persistence, failure and race coverage. |
| CORE.08 | Review reconciliation updated. | Complete code integration and release evidence for the changed candidate. |
| CORE.09 | Pending. | Implement shared Explanation teaching/depth instructions, title/cap validation, rich Markdown and the approved delivered frame. |
| UI.01 | Partial. | Reuse server thread binding and Full import. Add immediate metadata acknowledgment, explicit occupied-Chat choice and durable message ownership. |
| UI.02 | Partial. | Reuse TableOfContents' one scroller. Publish only accepted entries into the actual tree. |
| UI.03 | Pending approved layout. | Put parameters, draft and edit target into actual Chat messages using file 03. |
| UI.04 | Partial. | Keep the slot and shared acceptance. Persist one lifecycle message and private geometry, and preserve accepted edited title/brief. |
| UI.05 | Shared accept/controller foundation retained. | Verify normal click, Chat and eligible Tab through the integrated server winner and new edit/composer behavior. |
| UI.06 | Placement/obstacle foundation retained. | Persist actual slot geometry, final bounds and explicit drag through reload and save-before-ack. |
| UI.07 | Matching/navigation foundation retained. | Finish exact highlights and hover/focus View card with reciprocal View section. |
| UI.08 | Automatic successor/refusal foundation retained. | Deliver the viewport-bottom Next card / Cancel, persistent Chat updates and the complete second-card flow. |

**Executed local receipt**

Source was read at the pinned main and loaded into a disposable source snapshot. Node was `v24.22.1`. External models, providers and source services use the repository test doubles. The existing suites completed with **213 passed, 0 failed, 0 skipped** across 17 files. Temporary test dependencies supplied Node/JSX harness imports. Full npm-ci/build parity and authenticated production interaction have separate evidence requirements.

```bash
# 9 backend files, 92 passed
node --test packages/control-plane/test/roadmap-document-context.test.js packages/control-plane/test/roadmap-thread.test.js packages/control-plane/test/roadmap-loop.test.js packages/control-plane/test/roadmap-withheld.test.js packages/control-plane/test/roadmap-auto-proposal.test.js packages/control-plane/test/roadmap-proposal-drafts.test.js packages/control-plane/test/roadmap-planning.test.js packages/control-plane/test/roadmap-generate.test.js packages/control-plane/test/roadmap-money.test.js

# 6 client/state/import files, 106 passed
node --test packages/web/src/roadmap-client.test.mjs packages/web/src/roadmap-controller.test.mjs packages/web/src/roadmap-canvas.test.mjs packages/web/src/canvas-slots.test.mjs packages/web/src/source-refs.test.mjs packages/web/src/learn-file-import.test.mjs

# Existing renderer/source tests, 7 and 8 passed respectively
node --test packages/web/src/markdown-anchor.test.mjs
node --test packages/web/src/canvas-slot-card.test.mjs
```

The three document-context tests pass full-document/anchor/request assertions, honest grounding not_run and first/second card generation with repeat-accept protection. Their board save helper writes SQL directly, and the second proposal is manual. This receipt therefore leaves BE.00–16 pending for the full updated flow. In addition, current loop/money tests explicitly require one transient automatic retry. Revise that behavior and its regression under CORE.04 before accepting the one-author requirement.

The [production release workflow 185](https://github.com/Rabbit-Hole-App/Rabbit-Hole/actions/runs/42331915345) completed successfully for the pinned main. Config has ROADMAP_ENABLED, ROADMAP_AUTO_ENABLED, ROADMAP_EDIT_ENABLED and ROADMAP_LONG_MARKDOWN_ENABLED set to true. The audit has not observed the owner's authenticated manual acceptance of the newly specified UI.

**Expanded R1–R7 verification receipt (7 November 2026, same pinned main):** An additional 206 tests in 24 files plus 77 tests in five files passed, giving **496 distinct tests in 46 files, 0 failures and 0 skips** with the initial 213 tests. Snapshot files were checked against the exact main Git blob hashes (598 source/config/test files matched). Node v24.22.1; existing repository tests; model/provider doubles; Node SSR for render checks; no browser, paid model calls, production mutations or remote migrations. The artifact suite initially needed an omitted snapshot `packages/web/dev-worker.js`; after loading that exact source it passed all 20 tests. No application fix was needed for that setup omission. Source and test counts are evidence for their named foundations, not a full build, every BE case or owner visual acceptance.

```bash
# 24 additional files: 206 passed
node --test packages/control-plane/test/card-feedback.test.js packages/control-plane/test/chat-depth.test.js packages/control-plane/test/explain-depth.test.js packages/control-plane/test/learn-user-settings.test.js packages/control-plane/test/pdf-excerpts.test.js packages/control-plane/test/roadmap-auto-events.test.js packages/control-plane/test/roadmap-events.test.js packages/control-plane/test/roadmap-links.test.js packages/control-plane/test/roadmap-long.test.js packages/control-plane/test/roadmap-source-index.test.js packages/control-plane/test/roadmap-source-reader.test.js packages/control-plane/test/roadmap-source-retrieval.test.js packages/control-plane/test/roadmap-source-version.test.js packages/control-plane/test/source-refs.test.js packages/web/src/card-feedback-render.test.mjs packages/web/src/card-feedback.test.mjs packages/web/src/inline-ai-proposal.test.mjs packages/web/src/learn-progress-feedback.test.mjs packages/web/src/learn-settings.test.mjs packages/web/src/pdf-anchor.test.mjs packages/web/src/roadmap-auto.test.mjs packages/web/src/roadmap-proposal-context.test.mjs packages/web/src/roadmap-source-coverage.test.mjs packages/web/src/source-refs-render.test.mjs

# Five additional files: 77 passed (learn-artifact 20/20 after completing the source snapshot)
node --test packages/control-plane/test/roadmap-safety.test.js packages/control-plane/test/roadmap-contract.test.js packages/control-plane/test/roadmap-source.test.js packages/control-plane/test/roadmap-store.test.js packages/control-plane/test/learn-artifact.test.js
```

### 2.1.2 R1–R7 task reconciliation and counts

The earlier "nine completed" count covered only narrow correction checkboxes. It omitted 18 R1–R3 table tasks and existing R5–R7 work. Every table task and checkbox through R7 is now reviewed. Compound requirements are split where a tested foundation is complete but a new behavior remains. Superseded no-clone work is struck through; receipt bullets and standing constraints are not unfinished implementation tasks. No release rung is declared fully owner-accepted.

| Rung/task group | Checked | Open | Total | Meaning |
| --- | ---: | ---: | ---: | --- |
| R1 | 5 | 1 | 6 | Existing foundations checked; updated slice/manual receipt open. |
| R2 | 5 | 1 | 6 | Existing Depth/settings checked; immutable accepted roadmap settings open. |
| R3 | 5 | 1 | 6 | Existing reference engine checked; new viewer/source-link receipt open. |
| R4 | 2 | 12 | 14 | Rollup tasks; partial rows map to detailed CORE/UI below. |
| R5 | 8 | 7 | 15 | Existing preview/Apply/keyboard/link guards checked; author/composer/reuse/geometry work open. |
| R6 | 6 | 1 | 7 | Existing trigger/composer/delivery guards checked; persistent Chat/offscreen integration open. |
| R7a | 15 | 4 | 19 | Existing index, retrieval and coverage checked. Card authoring context is pending alongside three deferred extensions. |
| R7b | 0 | 15 | 15 | Docling PDF workflow planned as a separate release. R3 excerpts are counted separately. |

R4's detailed correction lists contain **29 / 50 checked CORE items** and **22 / 72 checked UI items** after the 7 November review. These are detailed subtasks of the R4/integration rollup above, not extra completed releases. BE and per-release receipts remain separate evidence tasks. Do not sum overlapping rollups and subtasks into a misleading project percentage. Checked UI foundations mean source/Node verification; owner manual production acceptance is still separate.

**Still required for the core:** complete planner context for selected scope; accepted instruction/title/Depth/version binding; one ordinary author dispatch across terminal failures; actual request quote equality; durable Chat acknowledgment/routing/revision and per-step messages; accepted-only ToC; persisted/final saved geometry; new source highlights/hover links and viewport-bottom Next card; shared Explanation prompts, caps, pinned header, downward sections, tables/Mermaid; then missing BE cases, build and release receipts. Existing safety, access, atomic money, feedback, settings, references and metadata-offer foundations are reused.

The owner permits deferring remaining R7a extensions. R7b is a separate release under §6.3. The current four enabled production config flags stay unchanged. After Core Tutor, take R8a next with the first Explanation slice in §6.4. See §6.7 for staged R10 delivery and §6.8 for R11 before R12.

### 2.1.3 Current implementation review — 7 November 2026

The pinned review spans `e447525a83c6e9809f2f1cdaa27071c31a3a0b3f` → `8deb778fa2b0442b4ac494f9d94e88fffd72a6c3` → `04219878da7360131138c9059ce74854a51a1c0e` (153 reachable commits, including merges and handoff-only syncs). The latest 24 follow `f411c6de`. The current source tree is `7fe6877056f152e5b0a79920b846da9d389f0659`. Main last synced the handoff in `7f579187d` from `0c73b7bd`. Sync the current docs and references through §1.7 before the next task.

| Evidence tier | Current evidence |
| --- | --- |
| Source and deterministic tests | Node v24.22.1 on the exact source, using disposable state and external doubles. Backend workflow 72/72, source/planner 75/75, writer/safety 120/120, state/money/loop 120/120 and privacy/source refs 51/51. The current CI check-map suite passed 22/22. Routing groups passed 105 control-plane and 127 web tests. Canvas groups passed 325 web and 134 backend assertions. Area tests passed 33/33 and the related Learn Chat suite 68/68. R7 index/retrieval/registry passed 38/38. Supplemental controls and terminal reporting groups passed 63 web and 29 backend tests. These suites overlap. Targeted counterexample probes reproduced the open issues below. No paid calls or browser run. |
| Release | [Production run 42382264445](https://github.com/Rabbit-Hole-App/Rabbit-Hole/actions/runs/42382264445) released this exact SHA and build `e9e642a9b76d0d52`. Receipt `42382264445.1` records app Worker `f5d93355-8d5d-4fa6-8867-44be42b0ce63`, control plane `3c475d31-df2a-42a9-aab5-ddd1b1fd34bc`, clone record `e3f24bfdc410e82d`, recovery branch `tutor/core-mvp-rollback-04219878` and five passing production smoke checks. Build, affected tests, smoke and clone were recorded as passing. Broad CI and the broad release gate were bypassed under the owner's MVP policy. |
| Configuration and acceptance | `ROADMAP_ENABLED`, `ROADMAP_AUTO_ENABLED`, `ROADMAP_EDIT_ENABLED` and `ROADMAP_LONG_MARKDOWN_ENABLED` are true in the production app config at this SHA. `CHAT_ANSWER_TOOLS` is unset there. Owner manual UI acceptance and live routing/model quality are pending. The release receipt's old candidate status is superseded by the Actions receipt. Its broad-suite counts remain historical, including the existing no-ellipsis failure and the focused VOICE-08 rerun. |

| Latest implementation families | Review and remaining work |
| --- | --- |
| Bounded source, accepted input, one author and Explanation | `b35afd061`, `10c8ccce6`, `0d204ae90`, `ea22b2e1f` and `e1dee0237` provide the current main path. In `roadmap-planning.js`, only use passage fallback for the supported over-limit case. A changed or missing whole reread must refuse the draft. In `stepInput`, require valid claims and outcome from the accepted plan before quoting, and retain the frozen older accepted snapshot if a later plan is reaccepted. Restore the explicit Standard objective/Depth in the Table author input. Recheck source access/revision before publication as well as before dispatch. Fix `learn-primitives.js` so literal inline code counts its displayed characters and renderer-recognized Mermaid fences use the same validation path. A suffix on the Mermaid opening fence currently bypasses the checks. |
| Chat entry, routing and drafts | `1cf5a8332`, `0bfc02915`, `313737e3b`, `fb323d253`, `4b63e2a79`, `c5e32197c` and `1ff09aaaa` add the durable-entry path and routing changes. Keep the occupied-thread choice actionable after reload, open Chat from the source receipt when its panel is unmounted, and preserve the saved drop/thread binding. Validate route envelope and abort state before taking action and reject edit fields on answer-only requests. Typed lesson dispatch must preserve selected scope and bind to the durable thread before starting. Prior routing report at `84f1c2d9` has 30 matches and 11 misses across 41 cases. The existing live evaluator exercises legacy JEV, so add an eligible native-tool test before qualifying CHAT.02. Keep both CHAT.02 and live routing quality open. |
| Offer, slots, ToC and delivery | `76855ccd9`, `1dc190808`, `dd5870d3c`, `bc61e314f`, `320d7fc3c`, `e9dc5dd85`, `b6e63ee4f` and `3567c0ffa` preserve the core components and add the approved Contents conversation, restore and chip navigation. Return typed offer recovery when the source vanishes at acceptance. Check the saved card's entitlement and actual content before acknowledging it. Restore the saved width as well as x/y and keep accepted ToC/history reachable after completion. Frame the exact pending slot, follow the exact source passage from Chat, bind the edit pill to its captured revision, and allow End to stop new offers while accepted generation finishes. After a first Cancel followed by manual Propose next step, use one action classification for Chat and Canvas. The current real route produces Chat Next card but Canvas Accept. The unknown-provider probe also produced a distinct successor while the first charge outcome was still unresolved. In `roadmap-store.js` and `roadmap-auto.js`, hold successor offers and dispatch until that outcome is reconciled, as required by BE.12. |
| Extra UX and telemetry | `7022ccaa9` delivers the standalone Explanation/Interactive split. `652e5ed62`, `d4a9ce0aa`, `d2686c8e6` and `834819aac` provide shared headers, links, rename and row controls. `090eb61a4`, `bbcf987bb`, `18d337456`, `309d1bd7c`, `c617ca2d0` and `1f624c23a` add Go to plan, shared Ctrl+K Depth, Stop, back-to-top and terminal job reporting. The current composer Stop uses app blue and card Stop uses danger styling. Keep owner layout/interaction acceptance open. Fix the three current additions below before treating their user-visible paths as qualified. |
| Later tool work | Current registry still keeps `research_gap` disabled. The Docling worker/reader, R7a.04 supporting excerpts, R11 preparation and R13 Graphify pin/registry work have no qualifying implementation in this delta. R12 Tutor adapters and per-command suites remain on hold. Existing standalone tools and the selection PDF metadata do not qualify those rungs. |

#### Pending fixes in the latest additions

- [ ] **SEL.01 — Correct the Uploading label and code chip regression** (`f3392e30f`). Move the area upload status in `ContextChips.jsx` to the area selection renderer. Render a repository code chip with a null area selection and an area with an upload pending. Assert the code chip renders, the area chip says **Uploading**, and its matching Send is held only during the upload.
- [ ] **SEL.02 — Bind the per-card report to the actual selection image** (`5a29530ba`, `b06530075`, `0c5175e0a`). Retain the crop clamp, opaque background and per-card evidence. In `ask.jsx` and `learn-ask-context.js`, identify the same selection's uploaded or single-Paper-region bytes before describing the PNG. Cover an unrelated board image, open/attached Paper, failure of the optional upload when the single-Paper crop rides, missing media and an unmounted card. Keep all omission labels ahead of bounded details within the 8,000-character model limit, and include authorized PDF identity or known page reference when available. Assert the outgoing model request.
- [ ] **Go to plan — Resolve the current active review** (`090eb61a4`). Use the proposal revision and active row in `explain-client.js` instead of the first message with a matching job. Expose the canonical server-assigned thread for the Explain and Whiteboard fallback path, as Animation does. Test initial, refined and missing/deleted thread states with the same job.
- [ ] **Terminal job reporting — Cover real CAD and Whiteboard records** (`1f624c23a`). In `job-failure-log.js` accept the CAD numeric call count, retain the Whiteboard stage timings, and log the CAD incomplete-preview terminal branch in `cad-jobs.js`. Add a CAD fixture with at least one completed call and assert exactly one terminal line on replay. Point telemetry operations at the app Worker that hosts the four job bindings.

Continue deterministic fixes and supported releases without waiting for owner manual checking. Production migration approval retains the owner's existing command boundary. Record each next candidate and test result separately.

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
| Web surfaces | `RoadmapInvitation.jsx`, `RoadmapPlan.jsx`, `RoadmapSurfaces.jsx`, `NextStepPill.jsx`, `SlotCard.jsx`; reuse `ChatMessages`/`ProposalSlot`, actual Chat persistence/composer, `TableOfContents` and canvas renderer. Keep the separate Contents discussion in `TocConversation` and the roadmap lifecycle in right-hand Chat. |
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
| Existing interactive engine (internal `explain`) | Current `explain_brief/author/review/repair`, Opus5.5 with existing individual limits. | Its public command becomes `/interactive` in the standalone split. The written `/explain` uses the ordinary Explanation path. |
| Research/adaptation/vision | `roadmap_research`, `roadmap_adapt`, `roadmap_vision_extract` are proposed future roles. | Register only at the owning rung, with bounded input/output, actual requested/served model and focused eval. |
| PDF page reader | Planned `read_pdf_pages` with the private CPU Docling worker in §6.3. | Shared read-only tool for authorized attached PDFs. Reuse stored pages and charge indexing to platform work limits. |
| Codebase reader with Graphify | Existing repository graph and source tools. R13 targets `graphifyy==0.9.103` in the current indexer and shared registry wiring in §6.10. | Read-only graph and source operations on an authorized snapshot. Code extraction and lookup use local deterministic work. |
| Calculator | Deterministic restricted parser/evaluator, no model. | Finite grammar/limits and computational provenance, zero provider call. |
| Image/Motion/Whiteboard/CAD/3D | Reuse each current engine configuration and override logging. | No blanket model replacement. Image provider IDs, CAD Sonnet, Motion/Whiteboard roles and TTS are owned by their existing engines. |

### 2.4 Parallel work and integration ownership

Use the smallest number of lanes that keeps independent work active. For the correction: backend source/state/money, canvas lifecycle/keyboard, and actual Chat/ToC/source navigation; lead owns shared wiring and final integration. Start an independent verifier on the committed candidate. Backend money and request construction must share one exact interface before parallel edits, not independently invent quote semantics.

Lead owns route mounts, shared model/usage registry changes, migrations/configuration/check-map and `LearnPage.jsx` integration. Other lanes send concrete patches for those files. Each lane has its own branch/worktree and named file ownership. Reuse a completed branch only after comparing it with current main; never resurrect old UI or grounding instructions in a rebase.

The explanations-only core does not wait for broader R5 reuse, R7/R8, R9 practice or P6b. The narrow Edit card / Edit roadmap contracts in UI.03–05 are part of this MVP and reuse the relevant R5 foundation. Explanations + practice depends on its real R9 path; keep that dropdown option visibly unavailable and its task unchecked until qualified. Other rungs may be prepared independently and remain disabled until their supported flow is ready. One lead freezes the production candidate and release order; avoid competing restacks of the same source tree. Report action-level results and exact remaining blockers, not speculative clock-time promises.

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

- [x] Preserve the existing authorized revision, complete-read and UTF-16 range checks in `roadmap-source.js`/`roadmap-source-reader.js`. **Evidence:** source/source-reader/source-version and raw-Markdown anchor tests at the audited main.
- [ ] For the same bounded document, whole and selected/visible-section planning must send identical complete source text and different teaching ranges. Require the whole document to fit before claiming full context; resolve selections at the pinned revision with absolute UTF-16 offsets. CORE.02 remains incomplete until the actual planner request proves this.
- [x] Keep the step locator small and independent of context and canvas placement. A reference must still identify the authorized source/revision; it need not contain every fact in the card. Do not enlarge highlights or remove source access checks to obtain full context. **Evidence:** `roadmap-source`, `source-refs`, document-context and Markdown/PDF anchor tests; locator and full author document remain separate.
**Standing source constraint:** Preserve current R7 behavior above 40,000 characters. A short section inside a larger document does not establish that the whole larger document was supplied. No unbounded-context promise and no silent prefix. Remaining R7 extensions are deferred; the existing enabled adapter remains available.
- [ ] Extend `test/roadmap-source.test.js`, `roadmap-planning.test.js` and `roadmap-plan.test.js` using the existing >8k fixture shape, a selected section and a fact outside that section. Assert the actual draft/revise request contains the entire bounded document, explicit teaching scope and original instruction. Retain source-version/access/incomplete and long-source tests.

**Receipt:** synthetic planner request assertions for both choices, context coverage versus teaching scope, source revision, and nonzero focused test counts.

### CORE.03 Bind the writer to its own accepted plan step

**Owner:** Tools with State. **Depends:** CORE.01; independent of CORE.02's planner wiring. Define the accepted-input snapshot jointly with CORE.05 before either implementation: CORE.03 reads that immutable record and CORE.05 quotes/adopts the same record. **Model:** retained artifact role, default `claude-opus-5`, maximum 4,000 output tokens. **Exact targets:** `src/roadmap/roadmap-run.js::generateOne` and `test/roadmap-document-context.test.js` or existing `roadmap-loop.test.js` fixtures.

**Current API stays:** `generateRoadmapCard(env,access,{authorizationId,resultId,resultVersion},deps)` with server-loaded `{cardId,stepId,proposalId,proposalVersion,format,stepTitle,stepGoal,passageText,documentText,claimsToCover,outcome,sourceRef,language,depth,retry}`. Full-context assembly and `repairs: 0` already exist.

- [ ] Replace the plan lookup by `current.accepted_plan_version` with the accepted result's normalized `step.plan_version`; select `plan.steps[step.position - 1]`. Read and validate that row's `plan_json`, accepted status and position/normalized step binding. Missing or inconsistent stored plan data must fail before author dispatch, not silently become empty claims/outcome. Use existing `plan_json`/`plan_hash`; no reconstruction model or duplicate plan table.
- [x] Add a fixture with distinguishable plan versions and repeated positions, verifying the writer uses its own accepted step's claims and roadmap outcome after a later plan is reaccepted. **Evidence.** Real reacceptance fixture retains the accepted v1 claims and outcome while v2 is current. `roadmap-document-context` and writer group on `04219878`.
- [ ] Carry the accepted learner brief into the writer: from the step's own plan row read `instruction_version`, then load `learn_roadmap_instructions` in version order through that version (v1 original plus accepted revision/answer `{version,text,origin}` entries; exclude later unaccepted versions). Extend the server-loaded record with **NEW** `learnerInstruction:{original,revisions}`, `instructionVersion` and `teachingScope`; use the accepted scope/Depth/language snapshot recorded by CORE.05, not mutable `current.depth`. Include that brief/scope in `roadmap-generate.js`'s actual context and frozen Depth/language in `roadmapCardSuffix`, with the same fields in the quote/request fingerprint. No new instruction store or model call is needed.
- [ ] Extend the actual-body test with an original instruction, two accepted revisions, narrow teaching scope and full >8k document; after acceptance add a later unaccepted instruction and change live Depth. Assert the single request contains only accepted history, complete document, chosen scope and frozen Depth, and matches the quote. Current plan rows contain `instruction_version` but do not snapshot scope/Depth; the step-accepted event currently carries only proposal/authorization IDs, so that snapshot is explicitly NEW work in CORE.05.
- [ ] Keep the existing first/second-card test and assert each request carries its own step goal/claims, the same complete document, and the correct accepted plan version/position in the quote/call binding from CORE.05. Do not claim the existing whole-source test proves selected-section planning or all plan-version cases.

**Receipt:** selected plan version/hash, step position, the corresponding synthetic request assertions and a zero-dispatch invalid-binding case.

### CORE.04 Finish one-author behavior across failures and replay

**Owner:** State/Money with Tools. **Depends:** CORE.01 and CORE.03. **Models:** one content-author dispatch; safety calls remain separate. **Exact targets:** `src/roadmap/roadmap-generate.js::generateRoadmapCard`, `roadmap-run.js::generateOne`, `roadmap-money.js::failureWillRetry`, `roadmap-store.js::failCard`, and only the relevant ordinary-roadmap policy values/consumers.

- [x] A known failed first author response terminates and refunds the ordinary slot as applicable after a single attempt. Keep its failed/skipped slot and Chat status and remove ordinary Retry/Replace/Omit. Safety refusal pauses automatic progression. Other settled failures follow UI.04/UI.08. **Evidence.** `roadmap-run.js::generateOne` and the loop/safety/withheld fixtures at `04219878` terminate ordinary failure with one operation and retain the failure state.
- [x] Enforce one call for the ordinary roadmap author adapter and retain `repairs: 0`. Preserve the default repair behavior for separately typed command paths. **Evidence.** The production adapter and `roadmap-generate` tests at `04219878` admit at most one call with `repairs: 0`.
- [x] Apply the ordinary no-automatic-retry decision in State's failure result as well as the caller, so reload cannot turn the same failed slot back into a new purchase. Minimal proposed signature: `failCard(db,access,{roadmapId,resultId,failureClass,retryNo=null,now,allowAutomaticRetry=true})`, where **NEW trusted option** `allowAutomaticRetry` gates the existing `failureWillRetry` result and this ordinary caller supplies `false`. Preserve other callers' default behavior; do not build a new retry framework or expose the option in a request body. **Evidence.** `roadmap-run` passes `allowAutomaticRetry: false`. Exact-main money/state and withheld tests preserve the default behavior for other callers.
- [x] Retain durable operation identity and admitted/dispatched/unknown/reconciling no-blind-send checks. Unknown cost stays unknown until reconciled; known pre-dispatch unavailability with zero author calls may defer. **Evidence:** existing roadmap-money, loop and withheld tests.
- [x] Prevent handler replay from creating a new author operation after a terminal settled ordinary attempt. **Evidence.** Exact-main loop replay and money/withheld tests assert no new author operation after a terminal attempt.
- [x] Extend `test/roadmap-generate.test.js`, `roadmap-money.test.js`, `roadmap-withheld.test.js` and the loop tests: successful output, schema invalid output, zero/multiple tools, malformed response, known 529, unknown transport outcome, duplicate event/accept, and terminal skipped-step progression/safety pause. Assert one author dispatch at most per authorization, no readable failed card, one refund, preserved provider expense and no duplicate debit. Keep platform planning/safety retry tests unchanged where their policy still applies. **Evidence.** Exact-main `roadmap-generate`, `roadmap-money`, `roadmap-withheld` and loop test groups exercise the ordinary author attempt, failure, replay and settlement assertions.

**Transport boundary:** the inspected default author path is `planModel → anthropic → anthropicTransport`, whose non-streaming branch makes one `send`; it has no local author HTTP retry loop to remove. JEV's separate 429/529 retry and contextual safety retry/adjudication are retained. “No automatic author redispatch” does not mean disabling those safety operations or pretending a remote provider's internal execution is observable.

**Receipt:** actual author operation count, failure/replay/skipped-step and safety-pause states and ledger deltas. The existing successful one-call test alone does not establish this failure contract.

### CORE.05 Quote the actual full author request before accepting the slot

**Owner:** State/Money with Tools. **Depends:** the shared accepted-input contract agreed with CORE.03, plus CORE.04's one-call policy; CORE.03 and CORE.05 are one coordinated change, not a circular implementation dependency. CORE.02 does not require a new quote format. **Models:** resolve the same provider/model that will dispatch; quotation itself makes zero model calls. **Exact targets:** `src/learn-artifact.js` first-request construction, `src/roadmap/roadmap-generate.js`, `roadmap-routes.js` acceptance wiring and removal/refusal of obsolete ordinary recovery actions, `roadmap-store.js::acceptRoadmapStep`, `roadmap-money.js::admitStepAuthorization/planCall`; reuse `learn-spend.js::requestSpendBound` and `learn-spend-ledger.js::consumeStepAllocation`.

**Current mismatch:** acceptance supplies no `callMicros`. `cardEnvelopeMicros` uses a provisional 125,000 micro-USD call bound × two calls × two attempts = 500,000 per card. Its comment still assumes an 8k context. Actual transport computes a bound from serialized system/tools/messages, UTF-8 bytes and max output. The fixed envelope is not proof of full-request quotation, even when a particular request fits it.

| Interface | Existing | Proposed narrow seam, explicitly NEW |
| --- | --- | --- |
| First artifact request | Built inside `generateArtifact`; `only`, `systemSuffix`, `repairs` are already trusted options. | **NEW** `prepareArtifactAuthorRequest(env,input,{only,systemSuffix}) → {body,model}` or equivalent extraction of the exact current first-request builder. Both quotation and initial generation use it. Other generators' default repairs and validators stay intact. |
| Server quotation | No real-body roadmap quote. | **NEW** `quoteRoadmapCard(env,access,candidate) → {boundMicros,requestFingerprint,contentFingerprint,provider,model}`. Candidate comes from the pending proposal, its own accepted plan step and authorized pinned document. Resolve actual routing through the same selection logic as `planModel`; do not duplicate a stale price/model table. |
| `admitStepAuthorization(env,access,{...,callMicros,...})` | Multiplies the legacy per-call estimate into a four-call envelope; content fingerprint is only proposal hash. | **NEW trusted fields** `cardBoundMicros` and `contentFingerprint`, passed by the quote path; ordinary one-call allocation uses that exact bound. Retain legacy behavior only for callers still using it. Reject unpriced/mismatched requests before dispatch. |
| `planCall(db,access,{...,provider,model,requestFingerprint,...})` | Fields already exist; author caller omits provider/request fingerprint. | Populate the existing fields from the actual accepted request; no new call table is required. |

- [ ] Hash the actual full outgoing author body, including system suffix, tools, whole Markdown, anchor, step brief, language/Depth and output cap. Bind the quote to source key/revision, actual context coverage, accepted `step.plan_version`/position and plan hash, accepted proposal version/content hash, and actual provider/model. Use existing server-owned authorization/event fields for the minimal IDs/hashes/settings needed to rebuild the accepted input. Do not put raw private source in public views or analytics; do not mandate a schema migration if existing fields suffice.
- [ ] Recheck source access/revision before dispatch and require rebuilt request identity/bound to match acceptance. Freeze the accepted effective settings or reject a changed input before spending; never silently increase the hold, send an unquoted prompt or take extra balance. Ordinary title/goal/claims/outcome assembly remains the already implemented path.
- [x] Keep the whole-step hold, per-card allocation transfer, actual cost settlement and unused-hold release atomic. One-call quotation does not bypass payer derivation, allowance or idempotency. Duplicate acceptance returns its existing receipt without recomputing a new purchase/hold; preserve current authorization checks. **Evidence:** roadmap-store and roadmap-money tests cover atomic aggregate admission, allocation, settlement/release, one-micro refusal and concurrent/replayed acceptance. Exact full-request quotation remains open above.
- [x] Use the actual requested provider/model and captured 4,000-token author request in `test/roadmap-loop-fixture.js::provider`. Preserve the separate synthetic ledger tests and use the same served model in the author fixture. **Evidence.** The exact-main provider double passes its actual `model` argument through `spendTransport` and records the priced author body.
- [ ] Add a stable local-only full-request fixture in `test/roadmap-money.test.js`/`roadmap-store.test.js` or the document-context harness: >8k Markdown with multibyte text and a tail fact; exact quote/dispatch body hash and bound equality; exactly sufficient allowance versus one micro less; no call/hold on refusal; one hold-to-call transfer; duplicate accepts; terminal failure refund and unchanged provider expense. Use scripted responses and the real spend helper, with no paid calls.

**Receipt:** synthetic actual-body hash, accepted source/plan/proposal binding, resolved provider/model, output cap, quoted versus admitted micro-USD, hold/transfer/settlement/refund rows and duplicate-accept result. Prices stay hidden in Tutor UI.

### CORE.06 Preserve the applicable safety/publication boundary

**Owner:** Tools with State. **Depends:** CORE.01 and the accepted-input binding in CORE.03. **Models:** existing JEV safety and eligible bounded `roadmap_safety_adjudicate`; zero ordinary grounding roles. **Exact targets:** `src/roadmap/roadmap-run.js::finish`, `roadmap-check.js::checkRoadmapCard`, existing safety/policy tests. Modify only where a concrete changed-path test fails.

**Already checked in CORE.01:** Keep `grounding:false` and nested `not_run/calls:0`; aggregate validation reflects retained applicable checks. Revision mismatch still blocks, quotation matching no longer gates ordinary publication, and historical held/refunded results do not acquire new entitlements. This is the same implementation requirement, not a second unfinished task.
- [ ] Preserve current learner/source/output role separation, output schema validation, source access/revision and contextual safety before publication. Feed the accepted learner instruction/revisions from CORE.03 to the existing learner-intent screen; do not mistake quoted document text for learner intent. Keep output allow/restrain/unknown/block/personal-risk handling, bounded resolution and correct entitlement/refund behavior.
- [ ] Add focused regression cases to `test/roadmap-withheld.test.js`, `roadmap-safety.test.js` and `roadmap-contract.test.js`: ordinary paraphrase/illustrative examples with zero citation transport calls; educational or quoted sensitive content treated by its actual role; unknown safety not falsely marked prohibited/passed; blocked/withheld body unreadable; source-revision mismatch and terminal refund remain correct. A throwing/counting grounding transport must never be called by this ordinary path.
**Recorded safety coverage / deferred enhancement:** Current `finish` screens the highlighted source passage, original learner input and generated output; it does not screen the whole newly supplied document. Do not claim full-document safety coverage. Expanding source screening is a separately labelled follow-up in OWNER-INBOX, not a core repair gate. Evaluate false refusals, educational/quoted source roles, sequential 24k chunks, repeated screening and adjudication deadlines before enabling that enhancement. Accepted learner revision binding remains CORE.03/06 work.
**Standing sprint constraint:** Do not add a replacement quality/citation reviewer, change global safety categories, truncate output checks or redesign other engines. Existing source/access/schema/entitlement/privacy regressions remain required for the enabled path.

**Receipt:** actual screened roles/coverage and applicable decision, grounding `not_run/calls:0`, aggregate validation/deliverability, nonzero tests and explicitly deferred expanded-coverage work. A generated server result is not yet a board-saved/acknowledged card.

### CORE.07 Verify the integrated first-and-second-card flow

**Owner:** Verifier with UI and State/Money. **Depends:** CORE.02–CORE.06 and CORE.09. **Models:** local doubles for these deterministic tests. Keep `test/roadmap-document-context.test.js` as the existing two-card regression and complete the [required local backend flow matrix](#80-required-local-backend-flow-tests-before-manual-production-checking) before requesting owner production checks. Its current three tests alone do not complete that matrix.

- [x] Run its existing three tests on the candidate: actual >8k body/anchor/brief, honest no-grounding record, and two saved/acknowledged settled cards with duplicate-accept protection. It currently uses two explanations and manually proposes step two; it does not alone prove table delivery, selected-section planner context, R6 automatic successor, retained safety behavior or quote equality.
- [ ] Add only the missing integrated cases: one table through the same author/publication path, selected teaching scope with full document, and the existing R6 `card_delivered` auto-offer enabled. Before accepting step two, assert the offer is metadata only with no author call, authorization or debit. Preserve manual Propose next step, Cancel/End and Ask/Auto-suggest controls.
- [x] Preserve current client/controller save-before-ack, failed-save suppression, reload and same-result idempotency behavior. Identify first/second minted card IDs separately; same-second array order is not stable. **Evidence:** existing `roadmap-controller.test.mjs`, `roadmap-client.test.mjs` and document-context regressions.
- [ ] Complete final-geometry save/reconciliation and persistent same-slot/Chat Saving status through the actual host and board route. A lost ack retries the same saved result without a new author/purchase; no Retry purchase or recovery strip. UI.04/06 and BE.08–12 own the missing integration.
- [x] Update superseded policy/test assertions and relevant `scripts/ci/check-map.json` mappings, without broad unrelated cleanup. Do not rewrite platform planner/safety retry tests to match the author policy. Record any remaining baseline failure separately. **Evidence.** Reviewed `5b9c1dc1e`, `a849de451` and `8bf9a9fca` plus current policy and tests. The current release receipt records the baseline no-ellipsis test failure separately.

**Exact offline commands from repository root, to run during implementation (not executed by this Markdown audit):**

```bash
node --test packages/control-plane/test/roadmap-source.test.js packages/control-plane/test/roadmap-source-reader.test.js packages/control-plane/test/roadmap-source-version.test.js packages/control-plane/test/roadmap-plan.test.js packages/control-plane/test/roadmap-planning.test.js packages/control-plane/test/roadmap-long.test.js
node --test packages/control-plane/test/roadmap-generate.test.js packages/control-plane/test/learn-artifact.test.js packages/control-plane/test/roadmap-policy.test.js packages/control-plane/test/roadmap-safety.test.js packages/control-plane/test/roadmap-withheld.test.js packages/control-plane/test/roadmap-contract.test.js
node --test packages/control-plane/test/roadmap-money.test.js packages/control-plane/test/roadmap-store.test.js packages/control-plane/test/roadmap-sweep.test.js packages/control-plane/test/roadmap-glue.test.js packages/control-plane/test/roadmap-events.test.js packages/control-plane/test/roadmap-loop.test.js packages/control-plane/test/roadmap-document-context.test.js packages/control-plane/test/roadmap-auto-proposal.test.js packages/control-plane/test/roadmap-auto-events.test.js
node --test packages/web/src/roadmap-controller.test.mjs packages/web/src/roadmap-client.test.mjs packages/web/src/roadmap-auto.test.mjs packages/web/src/roadmap-integration-wiring.test.mjs packages/web/src/learn-slash.test.mjs
node --test scripts/ci/check-map.test.mjs
bash run.sh test:unit control-plane web
npm run build --workspace=web
```

Run focused changed tests while iterating, then the required affected tests and build once integrated. The broad `bash run.sh test:unit control-plane web` command is available if the actual change warrants both complete packages; it is not an unconditional extra gate. Root `package.json` has no `npm test` script; `npm test --workspace=web` invokes Playwright, not the offline unit suite. The repository runner guards against a zero-test pass. Run `node --test scripts/schema-check.test.mjs` only if an actual additive migration is chosen. Do not rerun passing suites without a changed dependency or unresolved failure.

**Completion receipt:** candidate SHA; exact commands/nonzero counts; fixture/source revision; plan version/hash and step positions; author request fingerprints/provider/model; author and grounding role counts; bound/hold/transfer/charge/refund evidence; safety coverage/verdict; generated, board-saved and acknowledged milestones for both cards. Separate source implementation, deterministic test execution, approved browser/real-provider evidence, deployment and production activation. No proof tier substitutes for another.

### CORE.08 Replace contradictory HOW requirements and release the small correction

**Owner:** Lead. **Depends:** integrated CORE.02–CORE.07 and CORE.09 candidate. **Models:** none.

- [ ] Replace stale R4.09 ordinary grounding/citation gates and automatic author repair/retry language in R4/R6 contracts and receipts. Carry the exception into R5 edits/reuse, later speculative preparation and commands so a generic “all checks” rule does not restore this ordinary reviewer. Other formats retain their explicit validators/safety. Do not require a new policy framework, unrelated checker polish, or speculative capability before this fix.
- [x] Replace the stale `9b798f7`/all-R4-proposed documentation baseline with the current mounted source and exact incomplete tasks. Preserve source/plan versions, hidden prices and shared controls; document in-Chat/same-slot status in place of obsolete toast recovery. **Evidence:** this reconciliation of both docs at audited main `e447525`. Stale nonfunctional code comments can be cleaned when their files change; they do not justify rebuilding mounted modules.
**Current release policy:** Use the existing clone-backed MVP launcher, successful build/affected tests/smoke/recovery and exact tested SHA authorization, then ship to main/production. Claude Code may set `MVP_ALLOWED_SHA` and push under the owner's 1B/2B decisions. Do not wait for owner manual checking between releases. REL.01–05 retain the actual per-candidate evidence tasks.
~~Build a new no-clone/direct-production compatibility mode to bypass the existing preview predicate.~~ **Superseded by owner decision 2B: keep the clone deploy.** Current tooling already matches that decision; see REL.04. No application code was released by this docs update.

**Receipt:** final small diff and dependencies, verification results, release-tool compatibility, actual release/deployment/activation evidence when executed, and precise unverified items. No fresh product question or routine permission cycle is required for already decided scope.

### CORE.09 Deliver the Tutor Explanation card

**Code inspected for this task:** main at `e447525a83c6e9809f2f1cdaa27071c31a3a0b3f`.

**Required for the core Tutor MVP.** Product behavior is in [roadmap section 3.9](tutor-roadmap-v1.4.md#39-step-9--accept-generate-save-and-fill-the-same-slot). UI and Tools own this with State. Depends on CORE.03/05's accepted-input snapshot and UI.04's same-slot delivery. CORE.07 and BE.06a verify it before owner production review. Open [04 — Explanation card](ui/04-explanation-card.html) and [06 — Explanation depth](ui/06-explanation-depth.html) first. Use [05](ui/05-markdown-source-links.html) for source highlighting and reverse navigation. Example copy, tabs and counters are review aids. The shared teaching guidance, planner and writer changes below are required for this core MVP. Use the selected or accepted Depth for the request.

**Shared Explanation teaching and prompt contract**

- [x] Preserve the existing direct Tutor/`/explain` artifact path accepting a learner question and effective Depth, with optional source context, normal entry-point authorization and charging. Reuse `artifactFetch/generateArtifact` and existing default resolution. **Evidence:** `learn-artifact.test.js`, `chat-depth.test.js` and `explain-depth.test.js`.
- [ ] Apply the new shared Explanation teaching/budget/renderer contract to this path and roadmap generation. Roadmap cards additionally receive the immutable accepted brief/settings from CORE.03/05. Direct-path existence does not establish the new shared prompt, caps or title binding.
- [x] Add the planner guidance to `packages/control-plane/src/agents/roadmap-plan.js::PLAN_RULES`, shared by `PLAN_SYSTEM` and `REVISE_SYSTEM`. Plan one coherent learning idea per step within the selected Explanation budget. An `explanation` step may use prose, a Markdown table or a Mermaid flowchart within one card. Return the existing title, goal and essential claims through `submit_roadmap`. Keep the existing format enum and preserve accepted titles and delivered-step revision rules. **Evidence.** `ea22b2e1f` and exact-main plan/prompt tests verify the shared PLAN/REVISE request guidance and accepted-step schema.
- [x] Put shared teaching guidance with the Explanation primitive in `learn-primitives.js` and attach its request-specific Depth and budget through `learn-artifact.js::generateArtifact`. The tool description for `make_explanation` is an appropriate existing seam. `agents/learn-artifact.js::ARTIFACT_SYSTEM` supplies artifact-wide rules such as structured output, one tool call and factual integrity. Apply the Explanation teaching rules when `make_explanation` is offered. **Evidence.** `learn-primitives.js`, `learn-artifact.js` and current author tests verify shared teaching guidance when the Explanation tool is offered.
- [x] Make the three Explanation Depth objectives explicit. **Brief** gives the central idea and essential mechanism in everyday language. **Balanced** explains how and why, with enough reasoning to apply the idea to another case. **Detailed** develops the reasoning and relevant assumptions, limitations or connections. Use worked calculations and consequences when they help. Supply the selected cap together with the objective. Reconcile `chat-depth.js::depthInstruction` and `agents/roadmap-card.js::roadmapCardSuffix` for Explanation requests so direct and roadmap paths receive the same teaching target, including an explicit Standard target. **Evidence.** Exact-main direct and roadmap Explanation request captures include the selected objective and cap, including Standard.
- [x] Include the following shared author instructions for `make_explanation`. Treat them as a request contract, with selected Depth and budget resolved by the server. **Evidence.** Exact-main shared Explanation request captures include the following instructions. Server validation and visual acceptance remain separate.

> For `make_explanation`, the main body and optional section text support Markdown paragraphs, headings, lists, pipe tables and fenced `mermaid` flowcharts.
>
> Choose the form that makes the idea easiest to understand. Use a table to compare items across shared attributes. Use a Mermaid flowchart to explain branching decisions, relationships or a process. Include enough prose to explain what the learner should notice.
>
> Treat tables and diagrams as optional at every Depth. Choose the structure to suit the question.
>
> The main body must answer the learner's question on its own. Optional sections can add a worked example, prediction or further reasoning.
>
> Apply the requested Depth guidance and total character budget. Include the title, section labels, table cells, diagram labels and collapsed content in that budget.

**Backend and author request**

- [x] Start at `packages/control-plane/src/roadmap/roadmap-run.js::generateOne` and `roadmap-generate.js::generateRoadmapCard`. The adapter calls `learn-artifact.js::generateArtifact` with one accepted format and `repairs: 0`. Read the canonical step title, Depth and language from CORE.03/05's server-owned accepted input. Resolve any authorized pre-acceptance edit through that same accepted version. In the roadmap Explanation adapter, set the final `block.title` from that accepted title before counting or returning the block to `generateOne`. Keep the proposal, generating slot, saved card and reloaded card bound to that title. Depth changes content only. Retain the normal block/card ID, step ID, source reference and result identity. **Evidence.** Exact-main workflow/Explanation author tests show the accepted title is applied before counting and persists through delivery/reload. The cap algorithm itself remains open below.
- [x] Preserve the existing Explanation primitive and compatible block shape `{type,title,body,more?:[{label,text}]}`: raw bounds 120 title, 2,000 body, 40 section label, 800 section text, at most three sections. Body and section text are Markdown strings; main explanation belongs in body. Keep the separate table primitive and older saved cards readable. **Evidence:** current `learn-primitives.js` and artifact contract tests.
- [ ] Add the new shared teaching guidance and inclusive 600/1,000/1,500 caps for newly generated Explanation output through both entry points, as specified below. Existing raw field bounds do not enforce the new display-text budgets.
- [x] Use `packages/control-plane/src/agents/roadmap-card.js::roadmapCardSuffix` for accepted title, goal, claims, language and source grounding. Reuse the shared Explanation guidance above for teaching style and rich Markdown. Give the author the selected cap and accepted title length. Author a table with leading and trailing pipes, a header/separator and consistent columns. Author a diagram with a closed fenced `mermaid` block. Use `flowchart TD` or `flowchart LR`, short quoted node labels and optional plain-text edge labels. Keep generated flowchart syntax to node declarations and arrow edges as in file 06. Exclude HTML, frontmatter, directives, links, click handlers, styling commands and external assets from generated diagrams. Reuse CORE.05's first-request builder for quotation and dispatch and retain the full pinned source and accepted learner brief. **Evidence.** Exact-main quote and author-input tests exercise the suffix and allowed table/Mermaid prompt guidance. The separate render/validation coverage remains open.
- [ ] Enforce the inclusive display-text cap on the server for new Explanation output from both direct and roadmap requests. Resolve the final title first. Roadmap output uses the accepted title, and direct output uses its generated question-appropriate title. Validate before returning a successful artifact or recording/publishing it. **Overview ≤ 600, Standard ≤ 1,000, Deep ≤ 1,500.** Reuse one pure, Worker-compatible counter/validator. Count the title, authored Markdown prose/headings/list text, header and body table cells, Mermaid node and edge labels, and every `more` label and body even while closed. Flatten in reading order, collapse whitespace runs to one space, trim, and count Unicode code points with `Array.from(text).length`. Exclude recognized markup delimiters, table separator rows, Mermaid IDs/arrows and fixed app chrome. Count other rendered code/text as literal content. Match the card's `Md` syntax and keep unsupported syntax from escaping the limit. Keep renderer imports out of the Worker.
- [ ] Treat over-cap output or a generated Mermaid fence outside the supported grammar as a validation failure. In the ordinary roadmap path, map it to `terminal_validation_failure` with a stable internal reason and use CORE.04's single settlement and original failed slot/Chat path. Direct artifact callers use their existing validation/error lifecycle. Retain applicable safety and source checks on valid content. Apply caps to newly authored output, including output reused after the new contract is enabled. Older saved cards remain readable. A table or diagram must survive validation as complete content.

**Canvas UI and rendering**

- [ ] In `packages/web/src/LearningBlocks.jsx::ExplanationBody`, reuse the existing canvas frame and card layout. Put `Kicker`, the larger heading and the authorized `SourceRefChip` row with **View section** in a shrink-resistant header outside the reading scroller. Use main's heading, surface and theme tokens. File 04 shows the visual hierarchy. Use the same ScanText icon as the Markdown **View card** control. Preserve source access/empty states, drag/focus zones and feedback. Inspect `AdaptiveCanvas.jsx`, `SourceRefChip.jsx` and `card-layout.css` together and account for the source row's height once. Keep the existing Full/Focus modes, legacy blocks and topic anchors working.
- [ ] Put `block.body` in the middle `[data-scroll]` region with `min-height: 0`, flexible height and vertical overflow for Scrollable mode. Keep the existing independent `block.more` toggles in a fixed rail below that scroller. Omit the rail when there are no sections. Expose stable `aria-controls` and `aria-expanded`, and keep keyboard focus on the toggle. Mount expanded Markdown below the rail in the same card, in section order. Open/close changes the bottom edge only. Preserve the core area's height and scroll position, the top-left, width and card ID. Keep the expansion within measured canvas bounds as its Markdown/diagram settles. Preserve drag/zoom/placement behavior and leave the camera where it is during a disclosure toggle.
- [ ] Use `packages/web/src/Md.jsx` for the body and each expanded section. It already turns pipe rows into a horizontally scrollable table. Opt into its existing Mermaid fence rendering in those two Explanation regions, using the `fences` option or a scoped flag if needed to preserve unrelated fence behavior. The current renderer path is `Md → Code → MermaidDiagram`. Enable this for Explanation cards from direct questions and roadmap steps using the shared Explanation renderer. Reuse the lazy import, current app light/dark theme and strict security. Keep diagram overflow within card width. If Mermaid fails to load or render, keep the prose and offer escaped source via the existing code/source view. Preserve working source navigation and all other Markdown callers. In file 06 the static diagram depicts the embedded `fixture-deep-body` Mermaid source and the table depicts `fixture-deep-more` Markdown. Use those source strings in the implementation tests.

**Receipt:** BE.06a results for direct questions and roadmap steps, shared planner/writer prompt captures, resolved title/Depth, all three cap boundaries, valid and invalid author outputs, saved/reloaded card identity, and Node render coverage of both rich Markdown regions. Record actual scroll, keyboard, downward growth and Mermaid rendering during the owner's manual check of the matching deployed main build.

## 4 Implement the complete Chat and canvas workflow

**Baseline** `72d6536657af269bb894511220975fd2254246ed` for the original source/slot comparison. Use §2.1.3 for current implementation evidence. These requirements replace the old ToC roadmap planning panel, Chat-adjacent Tutor strips, Retry controls and source-box-first placement. The 7 November owner decision in UI.02 governs the separate Contents composer.

### 4.1 Shared flow, identities and action vocabulary

The [Explain on Canvas workflow](explain-on-canvas-workflow.md) starts with the existing Explain action. A drop opens Chat, acknowledges the source and offers the existing invitation after any needed thread choice. A clear typed lesson request uses the same action once its source and thread are resolved. Plan from authorized context, review the roadmap in Chat, publish its accepted version in ToC, then prepare one qualified card offer for that step. The same Chat entry and Canvas slot follow it through approval, generation, save and acknowledgment before the next offer. A passing author test alone covers only one stage. The R11 branch in that reference is qualified separately in §6.8. Run the Core Tutor flow with preparation disabled.

| Stage | Required state and implementation owner | Task |
| --- | --- | --- |
| Source arrives | Successful source import, source ID/revision, actor/board and active conversation/draft snapshot; no model-read dependency | UI.01 / lead |
| Conversation choice | Pending drop event bound once to Start new chat or Stay here; retain old history/draft | UI.01 / Chat |
| Invitation | One persisted Tutor message in the chosen thread, with source identity and two actions | UI.01 / Chat |
| Planning | Full authorized source, teaching scope, initial instruction, settings and draft revision; one updating Chat entry | CORE.02 / UI.03 |
| Draft review | Learning outcome, Scope, Depth, Roadmap mode, ordered steps, Accept roadmap / Edit roadmap | UI.03 |
| Plan acceptance | Immutable accepted plan version plus settings; ToC projection and Chat navigation link | CORE.03 / CORE.05 / UI.02–03 |
| Step proposal | One step/proposal version; title, description, format and source excerpt shared across two renderers | UI.04 |
| Placement | Verified source passage → canvas world rectangle → collision-free preferred slot, persisted once | UI.06–07 |
| Step acceptance | One server action/authorization shared by click, Chat and eligible Tab | CORE.04–05 / UI.05 |
| Generation and save | Same slot and Chat entry through accepting/generating/checking/saving/ready; exact card ID/geometry saved before ack | UI.04 / UI.06 |
| Passage backlink | Verified passage highlight and accessible icon point to the real delivered card | UI.07 |
| Next step / ending | One successor only after saved acknowledgment; manual/automatic policy and End roadmap stay in Chat | UI.08 |

**Shared state contract to agree before editing shared files:** reuse existing actor, board, roadmap, plan version, step, proposal/version, authorization, result and card IDs. Add a durable private conversation binding and message identity through the existing Chat/store interfaces; do not assume board ID alone identifies the intended conversation. One canonical step state drives Chat, canvas and ToC. The client must not start a second roadmap or generation to mirror another surface.

At the audited SHA, `RoadmapTranscript.jsx` reuses `ChatMessage` and `ChatOutputs` inside Chat, while `roadmap-transcript.js` derives lifecycle rows from the current view. The invitation is saved and `scope_json.tutorThreadId` provides a server-owned association. Reuse `bindTutorThread` with its owner/canvas validation and quiet repair while adding the explicit conversation choice and durable lifecycle metadata. Preserve that scope_json property when adding accepted-input data. `LearnPage` still supplies an empty default instruction. Reuse the real message persistence and composer to complete these requirements. Reuse `ask.jsx` → `ChatMessages.jsx:ChatMessages/ChatMessage/ProposalSlot`: `ProposalSlot` already renders structured `m.meta.proposal` with inline controls and conversation-scoped Edit. Reuse `chat-persist.js:newThreadId/saveMessage/turnSaver/rememberThread`; same `(threadId,client_id)` serializes writes, and `turnSaver` binds late replies to the original thread. The current message POST `/api/learn/chat/threads/:threadId/messages` accepts `{app,client_id,role,content,status?,mode?,title?,command?}`; it does **not** already persist arbitrary roadmap metadata. Extend the server contract and existing `chat_message_meta` read/write seam explicitly. Any new message payload is private structured Tutor metadata, authorized on read/write and versioned with the existing message format. Avoid storing the whole source body in message metadata or browser storage. A schema change is conditional on the existing persistence seams being insufficient; it is not assumed necessary.

| Intent | Exact visible label | Rule |
| --- | --- | --- |
| Select destination | **Start new chat** / **Stay here** | Before the Explain invitation when the current thread or composer is occupied |
| Begin / dismiss invitation | **Explain on canvas** / **Just keep it here** | Same labels on every upload invitation |
| Accept or revise roadmap | **Accept roadmap** / **Edit roadmap** | Never Accept plan, Edit plan or Ask for a change |
| Confirm or revise one proposal | First proposal: **Accept**; subsequent proposal: **Next card**; canvas includes **Tab** badge. **Edit card** / **Cancel** | First/subsequent labels invoke one shared acceptance action. Cancel applies only to a pending proposal |
| Navigate in Chat | **Go to card** / **Go to highlighted text** / **Open table of contents** | Navigation never accepts, generates or charges |
| Navigate between saved card and source | **View section** in the **Source: filename** header / **View card** beside the Markdown highlight | Same ScanText glyph. Use the resolved source range or saved card identity. |
| Continue | **Next card**; **Propose next step** when no proposal exists | Next card accepts the displayed next proposal; Propose next step only creates metadata |
| End active roadmap | **End roadmap** | Chat action; preserve accepted/in-flight and delivered work |
| Submit an edit | **Apply** | Existing edit submission; does not also purchase a card or accept a roadmap |

Implement these in the existing shared action/rendering seam, using a small constants/template module only if one does not already exist. Both surfaces dispatch the same action with the same IDs: reuse `roadmap-client.js:routes/actionKeys/pillOf` and controller `act()` gesture coalescing. Existing mutations carry `{boardId,revision,...fields,actionKey}`; plan acceptance binds `planVersion`, proposal acceptance/cancellation binds proposal ID and `proposalVersion`. Client coalescing does not replace server idempotency. Do not create unrelated strings such as “Ask for a change,” “Change focus,” “Try another,” “Retry,” “Replace” or “Omit” for this MVP. Ordinary unrelated app errors and other command engines keep their own scoped controls.

#### 4.1.1 Lesson entry and offer readiness

- [ ] Reuse `RoadmapTranscript.jsx` and `packages/web/src/roadmap-controller.js::explain` for the known **Explain on canvas** action. In the qualified `CHAT.02` path, route a clear typed request for a lesson to that same action from `AskPanel.send`. Resolve the authorized source ID and revision, teaching scope and intended thread using the existing source and conversation guards before invoking it. Bind the instruction and Depth once. Use the controller's existing create/invitation and action-key seams so repeated sends, an invitation click and a late source event for the same request yield one draft. Leave question replies, standalone card review and explicit edits on their respective paths.
- [ ] Keep the accepted goal, order, scope, Depth and explicit requirements in the versioned plan in `roadmap-planning.js`. A planner-suggested format is an input to offer preparation. At the shared `roadmap-compose.js` / `roadmap-lifecycle.js::proposeNextStep` boundary, confirm the actual eligible format, readiness and required inputs before the first, manual or automatic next offer becomes actionable. Route both the manual handler and `roadmap-auto.js` through the same check. Reuse the current built-in formats and metadata composer for the core. R12 adapter work awaits the owner's go-ahead.
- [ ] Keep recovery in the same Chat and step. Use an eligible alternative that satisfies the goal and requirements, one focused question to resolve the blocker, or useful Chat help and a next step. Require the learner's choice for a material change to the requested output. Revalidate any alternative before offering it and bind the exact approved format, settings and pinned source to the accepted offer and writer request. Preserve one slot, exact revision, one acceptance and existing charge/safety checks. A clarification or partial reply leaves the card undelivered. Once accepted, use existing generation and reconciliation, with the next offer waiting for a successful saved acknowledgment.

### 4.2 Concrete visual contract

Read the approved [01 — Table of contents](ui/01-table-of-contents.html), [02 — Canvas card skeleton](ui/02-canvas-card-skeleton.html) and [03 — Chat roadmap](ui/03-chat-roadmap.html) before implementing their surfaces. They reflect the owner's reviewed changes. Parameters and roadmap actions belong inside Chat; accepted structure belongs in the existing ToC. The bottom-fixed canvas Next card / Cancel pill is an explicit approved exception to the previous ban on floating Next controls.

Use [04 — Explanation card](ui/04-explanation-card.html) and [06 — Explanation depth](ui/06-explanation-depth.html) for the delivered layout and Markdown fixtures. File [05 — Markdown source links](ui/05-markdown-source-links.html) specifies the source highlight and reverse link's hover/focus behavior. File 02 shows the proposal lifecycle.

| Element | Concrete contract | Existing implementation / basis |
| --- | --- | --- |
| Right panel | Reuse saved resizable width; open and select Chat after a successful drop | `ResizableSidePanel`; reference 480px is a demo width |
| Chat ownership | All Tutor narration, settings, draft roadmap, edit pills and activity/action messages are actual conversation entries | No Tutor row above/below the transcript or composer; no floating canvas Chat. Explicit canvas proposal controls remain |
| Draft parameter box and roadmap container | Bordered **Roadmap parameters** with capability text, Scope, Depth and Roadmap mode; separate bordered **Roadmap draft** containing ordered steps; Accept roadmap / Edit roadmap in the same message | Read [03 — Chat roadmap](ui/03-chat-roadmap.html); move/reuse `RoadmapPlan` in the actual message renderer |
| Parameter styling | Existing tokens; 12px text/padding, 1px border, 4px corners; primary action 32px high, 12px horizontal padding | Retained reference values; adapt to Chat width without horizontal overflow |
| Depth | Brief / Balanced / Detailed; direct 0–2 range, step 1; label 12px, input height 20px, 3px top margin, 10px group margin; tick labels 10px/14px | Reuse existing effective settings and accessible Arrow/Home/End behavior; normal Tab inside the control |
| Roadmap mode | Explanations only / Explanations + practice | No fake working practice branch; capability/readiness rule in UI.03 |
| ToC | One title, one scrolling accepted heading tree; `flex:1; min-height:0; overflow-y:auto` | Remove the duplicate `RoadmapToc` list and competing 50vh/45% split. Keep the approved separate fixed Contents composer under UI.02. Roadmap settings, stopping and action controls belong in Chat |
| ToC hierarchy | H1/title 16px/24px weight 600; H2/H3 14px/20px weight 500 | Preserve manual H1/H2/H3 entries and existing fold/navigation semantics |
| ToC descriptions and spacing | H1 14px/21px, H2/H3 13px/19.5px; 4px title gap; H1 gap 28px; nested indent 24px; nested gap 14px; row gap 12px | Actual step descriptions, not repeated titles |
| Tree controls | Marker 16px with 1.5px border in 24px hit area; fold 24px; manual heading add control 28px | Manual completion remains separate from delivery/assessed Progress |
| Slot dimensions | Explanation 440×330 and table 560×610 world px, via existing `slotSize(format, BLOCK_TYPES)` | Preserve current actual production sizes; title/top-left/width stable through generation; content may grow down |
| Slot frame/text | Existing 1px border, 12px corners, shadow; title target 17px/1.35 weight 600; description 13px/1.5; source/format 11px/16px | Extend `SlotCard` with actual highlighted excerpt and labels; current title is 14px and source/format labels are missing |
| Accept/Cancel attachment | One group aligned with the card’s left edge, 8px below frame; 28px high; 1px border, 4px outer radius; 10px horizontal button padding; 8px label/key gap; Cancel divider 1px | Keep current `PILL_BOX` sizing and approved left alignment; reuse the compact action typography/padding |
| Action colors and Tab | Retain compact first Accept / Tab / Cancel action-group geometry; use green Accept and Next card, muted-red Cancel | Match [02](ui/02-canvas-card-skeleton.html); this approved update supersedes the earlier pale-blue/neutral-only rule. No helper sentence below the pill |
| Next card / Cancel placement | One pill anchored bottom-center in the canvas viewport, visible while the source/card world scrolls or pans; never beside the delivered card | Read [02](ui/02-canvas-card-skeleton.html) using Show Next card state; bind it to the same next proposal as Chat. Center within the canvas remaining beside the right panel, not the full browser width |
| Accepted roadmap navigation | Blue filled Open table of contents button, white text, darker hover | Reuse main `ui.jsx` Button primary/sm and `index.css` primary-fill tokens; file [03](ui/03-chat-roadmap.html) shows the intended presentation |
| Focus / motion | Visible 2px focus ring with 2px separation; 16px Tutor spinner; readable stage text under reduced motion | Shimmer/spinner/indeterminate progress only; percentage only from actual measured work; no fake timer |
| Delivered explanation | Fixed Explanation label, prominent accepted title and Source: filename with View section. The main Markdown body scrolls. Disclosure controls stay outside the scroller and expand below it. | Reuse `ExplanationBody`, `Kicker`, `SourceRefChip`, `Md` and the canvas frame. Match [04](ui/04-explanation-card.html) and [06](ui/06-explanation-depth.html). Implement CORE.09. |
| Source relationship | Prose tint, marked code lines, diagram or image outline, or whole-section side rail. Adjacent View card icon appears on hover or keyboard focus. | Match [05](ui/05-markdown-source-links.html). Both directions use ScanText. The exact saved target gets temporary emphasis using the existing blue selection token. |
| Placement spacing | Reuse `placeNote`/`placeResult` collision primitives: GAP 40, PAD 12, STEP 28, REACH 60 | Passage-relative preferred position, source/obstacle bounds and attached controls all matter. A bounded search cannot justify accepting an overlap |
| Feedback | Existing 28×28px thumbs; blue selected; hover/focus reveal only | Keep selection from latching visibility |
| Offscreen proposal | Chat retains Go to card; bottom-fixed Next card / Cancel remains visible for an eligible ready next proposal | No extra navigation-only Next step ready chip, no duplicate attached next pill, no automatic pan/focus or generation |

Use existing `index.css` tokens: surface `#ffffff → #191919`; ink `#37352f → #d4d4d4`; secondary `#63615d → #a1a1a1`; tertiary `#9b9a97 → #6f6f6f`; line `#e9e9e7 → #2f2f2f`; strong line `#d3d1cb → #4a4a4a`; hover `#efefed → #2c2c2c`; accent `#2383e2`. For canvas action colors use the owner-approved [02 reference](ui/02-canvas-card-skeleton.html): green Accept/Next card, muted-red Cancel, including hover and readable text in the active theme. Keep main shared primary fill `--color-primary-fill: #1b6fc2`, hover `--color-primary-fill-hover: #165ca3` and white text for Open table of contents. Reuse deployed main components/tokens, never preview/development styling or newly invented blues.

### 4.2.1 What Claude Code must inspect before implementing

Read roadmap section 4.6 and these approved files together, then implement through the named existing application components:

| Reference | Inspect | Existing components and tasks |
| --- | --- | --- |
| [01-table-of-contents.html](ui/01-table-of-contents.html) | Accepted tree, current header/icons, H1/H2/H3, manual checkboxes, folding, descriptions and one scroller. Add the owner-approved separate Contents composer from UI.02. | `TableOfContents.jsx`, `learn-outline-model.js`, `TocWorkspace.jsx` and the existing resizable panel. |
| [02-canvas-card-skeleton.html](ui/02-canvas-card-skeleton.html) | First skeleton and Accept / Tab / Cancel below it; green affirmative/muted-red cancellation; generation inside the same frame. Click Show Next card state, scroll, and inspect the bottom-center Next card / Cancel pill | `SlotCard.jsx`, `NextStepPill.jsx`, `roadmap-canvas.js`, `canvas-slots.js`, `AdaptiveCanvas.jsx`; UI.04–08. |
| [03-chat-roadmap.html](ui/03-chat-roadmap.html) | Roadmap parameters and Roadmap draft containers; Scope, direct Depth slider, explanations/practice dropdown; Accept roadmap / Edit roadmap; edit target in existing composer; blue accepted navigation; destination reuses 01 | `ChatPane.jsx`, `ask.jsx`, `ChatMessages.jsx`, `RoadmapPlan.jsx`, main `ui.jsx` Button and settings; UI.02–03. |
| [04-explanation-card.html](ui/04-explanation-card.html) | Scroll the main explanation while the header, accepted title and disclosure controls stay in view. Open a section to grow the card downward with the main content in place. Use View section. | `AdaptiveCanvas.jsx`, `LearningBlocks.jsx::ExplanationBody`, `SourceRefChip.jsx`, `card-layout.css`. CORE.09, UI.04 and UI.07. |
| [05-markdown-source-links.html](ui/05-markdown-source-links.html) | Compare all five annotation shapes. Hover and Tab to View card, follow an offscreen target and its brief blue outline, then use View section to return. | `FileDocMarkdown.jsx`, existing highlight/range utilities, `source-refs.js::viewPassage/focusExplanation`, existing canvas focus. UI.07 and BE.13. |
| [06-explanation-depth.html](ui/06-explanation-depth.html) | Review the same title and card frame in all three Depth settings. Deep shows a Mermaid flowchart in the reading area and a Markdown table in the disclosure. Inspect the embedded Markdown source fixtures. | `LearningBlocks.jsx::ExplanationBody`, `Md.jsx`, `MermaidDiagram.jsx`. CORE.09 and BE.06a. |

- [ ] Compare styling and shared controls against **deployed main**, never a dev/preview environment. Record the source SHA/build used; do not claim the running deployment was verified merely because a GitHub main file was read. Reuse the main shared blue primary style, including hover, rather than inventing a hex or text-only link treatment.
- [ ] Use sentence case: **Roadmap parameters**, **Roadmap draft**, **Accept roadmap**, **Edit roadmap**, **Open table of contents**, **Next card**, **Cancel**. Keep the learning capability as content, without restoring Learning outcome as the parameter-box heading. Do not include “Accept or press Tab to generate this card.”
- [ ] Mount one next-card action group in the existing canvas viewport overlay layer, outside transformed/scrolling card-world content. Center it within the canvas excluding the open right panel; reserve pointer events for the pill and preserve canvas interactions elsewhere. Respect panel resize, viewport resize, internal Markdown scrolling, world pan/zoom, safe-area insets and existing bottom chrome. Do not hide a valid ready offer just because its skeleton/card is offscreen.
- [ ] Bind bottom **Next card / Cancel** and the corresponding Chat controls to the current eligible pending proposal/version/action key. Hide/disable stale or busy actions; hide when no next offer exists, while generation is active, after Cancel/pause/end and at completion. Cancel removes only the pending offer and pauses progression, preserving delivered cards and their source links. No duplicate next pill beside a card.
- [ ] Treat HTML scripts as visual demonstrations. Do not copy timers/fake progress, static positioning, source-text mutation, in-place replacement of an earlier delivered card, second-accept demo sequencing, an enabled-but-unqualified practice option, or a generic Chat submit that drops an unsent message. Use existing server-authoritative lifecycle, entitlement, source-reference and persistence seams. Preserve all production composer tools not shown in this focused mockup.
- [ ] Verify first acceptance, scroll-visible next pill, concurrent Chat/canvas acceptance, cancellation, generated-card preservation, ToC identity and the two Chat containers in the real implementation before checking off UI.02–08. HTML approval/publication alone leaves those implementation boxes unchecked. Card proposal/generating/completion Chat designs remain a later separately reviewed UI step.

### 4.3 UI tasks and ownership

Lead owns `LearnPage.jsx`, Chat route/message contracts and any shared store/migration changes. Chat lane owns actual message rendering, conversation selection, parameters and edit targets. Canvas lane owns slot lifecycle, keyboard and measured placement. Source/navigation lane owns verified source anchors and backlink icons. Agree canonical identities/actions first; independent lanes send shared-file patches to the lead.

#### UI.01 — open Chat, acknowledge immediately and choose the conversation (R4.04)

**Current seams:** `LearnPage.jsx:droppedMarkdown` / `readyMarkdownSources` and `roadmap.sourceReady` after board persistence; `chat-panels.js:useChatPanels().openChat()`; `chat-workspace.jsx:useChatWorkspace`; `chat-threads.js:useChatThread` with `newChat/open/adopt/saveState/turnKey/liveKey/lateEvent`; `chat-draft.js:useChatDraft/draftKey/pickDraft`; `RoadmapInvitation.jsx`, `roadmap-controller.js:createWith`, `use-roadmap.js`, `roadmap-invitations.js`. The backend can identify the uploaded source from metadata; it must not wait for planner or whole-document reading. Current `composerTyping`/`idleGrouper`/`invitationOf` defer invitations indefinitely for a nonempty draft; replace that gate for immediate acknowledgement and conversation choice.

- [ ] On successful drop/import onto the canvas, open the right panel and select Chat. Base this on the successful source-created event, not every poll, render or restored source list. Do not steal composer focus, reset selection/draft, move the camera, or reopen a panel the learner subsequently closed. Handle unreadable/failed imports honestly; do not announce successful reading.
- [ ] Capture the thread/draft state associated with the drop. A thread with any messages **or a nonempty unsent composer draft** is occupied. In that thread, immediately acknowledge receipt and show **Start new chat / Stay here**. Do not show the Explain invitation until a destination wins. A fresh thread with no messages and an empty draft skips this chooser.
- [ ] **Start new chat:** use the existing thread creation/switch path, preserving the old conversation and unsent draft. Bind this drop/roadmap to the new thread. **Stay here:** keep the current thread and draft. Treat choice as one guarded action; a double click, delayed response or second tab cannot create two threads or bind the same drop twice.
- [ ] Handle the unsaved-thread edge explicitly: `newChat()` changes the restore key, but `draftKey(canvas,null)` reuses the same `.new` key and there is no server thread until the first saved turn. Before switching, preserve the previous draft/attachments under a distinct durable identity and establish the selected destination. Merely calling `newChat()` is insufficient. Distinguish empty history from history still loading or failed; inspect `thread.restore.messages`, not only currently mounted message DOM.
- [ ] In the selected thread send exactly one invitation: “You’ve added **Decision Trees.md**. Would you like me to explain it on the canvas?” Substitute the actual escaped filename; show **Explain on canvas / Just keep it here**. If the chooser was shown, this is the follow-up after selection, not a second independent invitation before it.
- [ ] **Just keep it here** leaves the material in place and dismisses this teaching invitation. Do not generate a roadmap/card or re-offer automatically on polling/reload. A later explicit learner request can start a roadmap. **Explain on canvas** consumes the selected source/instruction once and begins UI.03. An explicit successful drop receives this invitation in every mode; it does not silently turn Ask into Tutor or turn Auto-suggest on. Ask/off still gate unsolicited subsequent work; the learner's explicit Explain action may proceed.
- [ ] Persist the event/message/conversation relationship with actor/board/source ID+revision. Source duplicates, multiple simultaneous drops, thread changes while reading and reload must not merge unrelated sources or redirect late updates into the visible thread. Queue distinct sources deterministically; never silently make a multi-source roadmap. A message still belongs to its bound thread when another thread is visible.
- [ ] A second dropped source still receives acknowledgement/routing. If a roadmap is already unfinished on this canvas, preserve it and explain the current one-roadmap/one-source boundary in Chat. Do not start a second roadmap or silently include/replace the source under a minimal Edit roadmap. The learner can explicitly use existing **End roadmap** before starting a separate roadmap for the new source; retain prior cards/history. Expanded multi-source incorporation remains R10.
- [x] Keep immediate acknowledgement separate from content understanding. A filename acknowledgement must not claim the document has already been read. Whole-context reading/planning follows the chosen Explain action. **Evidence.** Exact-main BE.01 storage fixture records filename metadata before reading/planning/generation. The actual chooser and thread binding remain separate open checks.

**Verification:** extend existing `roadmap-controller.test.mjs`, `roadmap-integration-wiring.test.mjs`, `chat-persist.test.mjs` and `chat-draft.test.mjs`; add focused tests in the owning existing module if needed. Assert fresh/occupied/draft-only cases; Start new chat and Stay here; draft preservation; exactly one choice/invitation; double-click and reload; closed-panel behavior; late response isolation; no paid request before Explain. Browser proof must inspect actual message history, not a sibling strip.

#### UI.02 — publish only the accepted roadmap in the existing ToC (R4.04)

**Approved UI reference** [01-table-of-contents.html](ui/01-table-of-contents.html) for the accepted tree, checkboxes, hierarchy, folding and heading tools. The owner decision on 7 November, recorded at `e9dc5dd85` in `docs/features/explain-on-canvas/owner-decision-toc-composer.md`, supersedes the no-composer requirement and the corresponding layout in file 01. Reuse the same panel for **Open table of contents**.

**Current seams** `LearnPage.jsx`, `roadmap-client.js::tocOf`, `learn-outline-model.js` and `TableOfContents.jsx` render the accepted projection in the existing outline. `TocWorkspace.jsx`, `TocConversation.jsx` and `chat-workspace.jsx` own the independent Contents conversation below it.


~~Remove the Contents conversation/composer and move its history, draft and attachments into ordinary Chat.~~ Superseded by the 7 November Contents decision. The separate Contents conversation serves the outline. The roadmap uses right-hand Chat.

- [ ] Keep draft plans exclusively in Chat. On **Accept roadmap**, publish the accepted version into the existing ToC tree with hierarchy, step descriptions, format labels, statuses and source/card navigation. Preserve normal manual headings and fold state; use stable distinct IDs so merging the Tutor projection cannot replace ordinary outline entries.
- [x] Send/update Chat confirmation that the roadmap is ready and provide **Open table of contents**. The link opens/selects that panel; acceptance itself must not force a tab switch, pan the canvas or hide the conversation. **Evidence.** Exact-main acceptance path confirms in Chat and opens the existing Contents panel only on the link action. The focused canvas/Chat suite verified the confirmation and navigation contract.
- [ ] Keep roadmap parameters, the Stopping point block and Accept/Edit/End roadmap controls in right-hand Chat. The Contents tree contains accepted roadmap rows and existing manual headings. Keep the finite stopping rule in plan data and Progress in its separate tab.
- [ ] Qualify the owner-approved separate Contents conversation. Keep its own thread, draft and attached row pills. The fixed composer sits below the scrolling tree, with the expandable conversation window and a clear action that creates a new empty thread. Preserve prior conversation history and keep the right-hand Chat thread and draft separate.
- [ ] Reuse one outline scroller and existing H1/H2/H3 controls above the fixed Contents composer. Keep one accepted roadmap projection at every supported flag and lifecycle state, including reload and history.
- [ ] Clicking an accepted pending step navigates to its actual skeleton; clicking a delivered step goes to the actual card; cancelled/skipped/unavailable steps show honest state. Manual done marks do not imply generation, payment, assessment or mastery.
- [x] For an active roadmap edit, retain the currently accepted tree while the revision remains a Chat draft. Replace only the eligible future projection after reacceptance; keep accepted/in-flight/delivered identities and their source/card links. **Evidence.** Exact-main backend and outline/client tests verify the separate draft and accepted trees, retained step identities and future-only reacceptance.

**Verification** Use `roadmap-client.test.mjs`, `roadmap-view.test.mjs`, `learn-outline-model.test.mjs` and the Contents conversation tests. Assert one accepted tree, preserved manual entries and current accepted revision, exact pending/delivered targets, explicit-link-only panel switching, separate Contents draft/history and row pills. Owner production acceptance covers the fixed composer and scrolling layout.

#### UI.03 — render parameters and roadmap edits inside actual Chat (R2.03 / R4.04)

**Approved UI reference:** [03-chat-roadmap.html](ui/03-chat-roadmap.html). Read the two bordered containers, sentence-case headings, parameter controls, edit pill and accepted navigation button. This reference covers the roadmap message. For card lifecycle UI, use the current Tutor Chat step on main. For R12 command review, follow [the shared Tutor lifecycle below](#r12-reuses-the-current-core-tutor-lifecycle).

**Current seams:** `RoadmapPlan.jsx`, `RoadmapInvitation.jsx`, existing Depth settings/store, `ChatPane` message renderer/composer, `use-roadmap.js:editPlan` and `roadmap-controller.js`; backend `roadmap-planning.js`, `roadmap-plan.js` and plan/instruction stores. Current `editPlan` diverts the ToC composer; replace that route with a targeted actual Chat edit. `planningHandler` currently only accepts draft/questioning/proposed; accepted-plan instruction revision is refused; scope edits unsupported; depth-only can mutate current state immediately. Also, `practice_mode` is SQL-constrained to explanations in migration0039, `tocOf()` hardcodes that mode, `planningHandler()` passes `delivered: []`, `recordPlan()` inserts new step IDs and `acceptPlan()` accepts only proposed state. Implement the following missing contract rather than claiming it already exists.

- [ ] Explain starts one Chat activity entry: reading the document / generating roadmap, with spinner/shimmer and truthful stage text. Read the full authorized bounded Markdown before planning. A selected teaching passage still receives complete document context under CORE.02. Above the supported limit, use qualified R7 coverage or an honest limitation; never imply an unread remainder was read.
- [x] Present the generated roadmap in that thread using [03 — Chat roadmap](ui/03-chat-roadmap.html): a bordered **Roadmap parameters** container (capability text, Scope, Depth, Roadmap mode), a separate bordered **Roadmap draft** container (ordered titles/descriptions/formats), then **Accept roadmap / Edit roadmap**. Display the actual source filename and full-content/selected-passage scope. Source card display/collapse/scroll state is independent. **Evidence.** Exact-main `roadmap-flow-render` and transcript SSR render source name, selected/full scope and the separate parameters and draft containers. The Scope change handler and visual acceptance remain open.
- [ ] Use the direct three-position **Overview / Standard / Deep** slider and **Explanations only / Explanations + practice** dropdown. Defaults come from the existing effective learner settings. Changes target the current draft and produce a checked revision. Each revision has one updating activity/draft entry while being prepared; retain an earlier reviewed draft as superseded history with disabled stale actions, then show the new revision in its own entry. This differs from the intentionally single lifecycle entry per card. Disable accepting a stale draft while a change is pending; apply the latest confirmed revision only.
- [x] Do not fake the practice option: R9.01–R9.05 minimum generation, private goal binding, immutable question/key binding, scoring and Progress path must be qualified before **Explanations + practice** is selectable/acceptable. Until then show it disabled with a short truthful explanation in the same control. The explanations-only path can ship independently; the requested practice branch remains unchecked. Do not silently fall back to explanations after accepting practice. **Evidence.** Exact-main renderer disables practice and the route rejects acceptance of that mode until R9 qualifies.
- [x] **Edit roadmap** sets a small targeted pill in the existing Chat composer and preserves its draft text. The learner types the requested change and submits; reuse the existing submit action or **Apply** where a separate edit action is needed. Preserve the previous reviewed roadmap message as superseded history and bind the new draft to its own revision/message identity. The Tutor returns the revised roadmap with **Accept roadmap / Edit roadmap** again. Removing the pill cancels edit targeting and retains the current roadmap; it does not buy a card or clear the composer. **Evidence.** Exact-main Chat component/controller tests verify the Edit roadmap pill, draft preservation and clearing its targeting. Exact captured-revision dispatch is tracked separately below.
- [ ] Route a targeted edit to the specified roadmap/revision in its bound conversation, not to an ordinary Ask answer or a new roadmap. Carry the actual typed learner request through the host/API; replace the existing empty `instruction: () => ''` where applicable. Preserve original instruction plus accepted edit history and distinguish it from unrelated Chat turns.
- [x] Support **Edit roadmap after acceptance** as a new draft revision of future work in this MVP. Do not gate this minimal explicit edit behind R10. Snapshot accepted settings/instructions/scope/mode; draft changes do not mutate accepted or in-flight work. Reacceptance preserves completed/cancelled history, links and charges, then supersedes only eligible unaccepted future proposals with new version guards. Race acceptance versus revision and use a server-authoritative winner. **Evidence.** Exact-main workflow tests and real v1/v2 reacceptance probe preserve accepted and in-flight input, and replan eligible future steps.
- [ ] Separate explicit actions from unsolicited initiative gating. Extend current `invitationOf`, `pillOf`, `canProposeNext`, canvas projection and route policy as needed so an explicit drop/Explain/Accept roadmap/Accept or Next card/Propose next step works in Ask or Auto-suggest off without changing those preferences. Preserve feature capability, actor/access, credits and current-version guards. Only unsolicited successors/preparation are suppressed by Ask/off; do not globally disable the explicit action buttons after accepting a plan in Ask.
- [x] Keep the active plan and revision draft separate in backend and client projections. Reuse current version/instruction tables and event guards; propose a migration only if those cannot retain the necessary snapshot. Prevent the current depth-only path from rewriting accepted work's effective Depth. **Evidence.** Exact-main plan route, view and Chat tests verify distinct accepted and unaccepted versions and frozen Depth.
- [ ] **Accept roadmap** freezes the displayed confirmed draft/version/settings, publishes UI.02 and creates the first eligible metadata proposal. It never pre-authorizes every card or generates every roadmap artifact at once. Every card uses complete source context plus its accepted brief through CORE.03/05; there is no assumption of model conversation memory.
- [ ] Explain finite completion in Chat; expose **End roadmap** there for an active plan. Ending stops future offers/preparation and preserves accepted/in-flight/delivered work and their messages. No End control returns to the ToC.

**Verification:** extend existing `learn-settings.test.mjs` and `settings-model.test.mjs`; use the actual `roadmap-plan.test.js`, `roadmap-planning.test.js`, `roadmap-controller.test.mjs` and message-render tests. Assert full request context, real typed instruction, settings revision and stale Accept rejection, practice gating, pill isolation, original instruction/history, accepted revision with a delivered card and in-flight card, scope/Depth immutability, one purchase despite concurrent edit/accept, reload/thread switching.

#### UI.04 — mirror one proposal and its entire lifecycle in Chat and canvas (R4.10)

**Approved UI reference:** [02-canvas-card-skeleton.html](ui/02-canvas-card-skeleton.html). Read pending, generating and ready states, first Accept [Tab] / Cancel and approved action colors. Keep one live frame; the demo timer is not a production state source.

**Existing:** `roadmap-canvas.js:canvasCardsOf/planSlots/liveCards`, `SlotCard.jsx`, `canvas-slots.js`, `RoadmapSurfaces.jsx`, `NextStepPill.jsx`. Geometry currently lives in `roadmapSpots`/`pendingAt` refs and is not reload-persistent. Extend these components; do not build a parallel slot framework.

- [ ] Render one eligible, checked pending proposal beside its source and one structured Tutor entry inside its bound Chat. Both show the same useful title, description, format and exact highlighted/source excerpt. For the first proposal, canvas has **Accept [Tab] / Cancel** and existing edit access; Chat has **Accept / Edit card / Cancel / Go to card / Go to highlighted text**. Subsequent proposals use **Next card** on both surfaces; on canvas put **Next card / Cancel** in the bottom-fixed viewport pill from [02](ui/02-canvas-card-skeleton.html), not alongside the card. It is the same guarded acceptance action, including eligible Tab. Source links target the verified excerpt, not a guessed generic quotation.
- [ ] Use one logical step/message identity across pending, accepting, generating, checking, saving, ready and failure states. Update that entry on server events/polling rather than appending the same status every poll. Keep the original proposal description/excerpt available while generated content fills the canvas card; the Chat entry reports state rather than duplicating the entire long explanation.
- [ ] After click/Tab/Chat acceptance the exact skeleton stays visible at its existing x/y/width/title. Show Accepting while authorization resolves, then spinner/shimmer/progress and stage text; replace content inside that same frame. No disappearance, duplicate provisional card, camera jump or new slot near the current viewport. Grow downward when actual content requires it.
- [ ] Preserve accepted title/description/source identity through result rendering. Current `canvasCardsOf` can rebuild from the unedited step instead of the accepted proposal; correct this so an applied Edit card is not lost when generation starts. Format-changing pre-acceptance edits may resize the same slot deliberately, with renewed collision checks; ordinary lifecycle transitions cannot change width.
- [x] Keep private proposal/slot projections out of ordinary board JSON, shared output, thumbnails and area crops. Delivered content uses the actual server-minted card ID. **Evidence:** `roadmap-canvas`, `canvas-slot-card`, client and source-reference tests.
- [ ] Persist private actor+board+roadmap placement/version binding and restore pending/generating/failed geometry across reload and thread changes. Do not include raw source/proposal bodies in public board exports.
- [ ] Ready requires readable authorized output **and** durable board save with settled final geometry **and** acknowledgment. Until then use truthful Generating / Checking / Saving stages supported by actual state. Once ready, Chat has **Go to card / Go to highlighted text / Edit card**; remove pending Cancel and do not suggest that cancelling can erase a delivered purchase.
- [ ] Render the delivered Explanation in the same `CanvasNode` slot using [CORE.09](#core09-deliver-the-tutor-explanation-card). Keep the accepted title and source in the fixed header, scroll only the main Markdown reading area in Scrollable mode, and expand optional sections below the controls. Reuse [04](ui/04-explanation-card.html) and [06](ui/06-explanation-depth.html).
- [ ] **Edit card** uses a small targeted pill in the real Chat composer (or the existing explicit canvas Quick Edit entry). A pending edit updates and rechecks the same proposal, then waits for a separate Accept. A delivered-card edit preserves the original and forms a new explicit proposal/version for the requested change; do not silently regenerate, overwrite a saved card, or debit merely for opening/submitting an edit.
- [x] A confirmed pending **Cancel** intentionally removes that unaccepted skeleton, marks the step cancelled and pauses automatic progression; no author call/debit. If acceptance won the race, keep the accepted slot and canonical result. The “never disappears” rule forbids lifecycle removal; it does not prohibit the learner's deliberate cancellation. **Evidence:** pending cancellation, acceptance races and zero-call/no-debit behavior in store/loop/controller tests; persistent Chat presentation remains open.
- [x] Remove ordinary **Retry / Replace / Omit** controls from both surfaces and obsolete recovery projections/routes for this flow. Reviewed at `b2f5cdc4` and pinned main.
- [ ] Complete terminal-failure author-call policy under CORE.04. Keep the original slot and honest failed/skipped state, reconcile unknown outcomes, and save/acknowledge the same result without a new author dispatch or purchase.
- [x] Stop automatic next offers after a safety refusal. The `policy_block` successor guard from `11d1ea0e` is retained and covered by the focused backend suites.
- [ ] Complete the remaining failed/skipped-step progression and original-slot/Chat status cases in BE.12, with canonical ledger settlement and successor eligibility.
- [ ] Stale Chat action buttons remain historical but disabled or resolved against canonical current state; they cannot replay a superseded proposal or generation. Reopening another thread, viewport movement or React remount does not create a new paid operation.

**Verification:** extend existing `roadmap-canvas.test.mjs`, `canvas-slot-card.test.mjs`, `roadmap-view.test.mjs`, `roadmap-client.test.mjs`, `roadmap-controller.test.mjs`. Assert every transition, no remount/removal gap, edited title continuity, message deduplication, reload privacy, Cancel/Accept winner, genuine stage text, no recovery strings/actions and no second author call. Use the owner's deployed-main check for physical geometry after the local backend gate in section 8.0.

#### UI.05 — make keyboard, Chat and canvas actions the same action (R4.10 / R5.02)

**Approved UI reference:** [02-canvas-card-skeleton.html](ui/02-canvas-card-skeleton.html). Read the first attached acceptance pill and bottom Next card / Cancel presentation. Keep existing keyboard ownership guards; do not copy a demo global key handler.

- [ ] Route first-card canvas/Chat **Accept**, subsequent **Next card** and eligible plain Tab to the same controller method with the same pending proposal/version and idempotency key. Disable/reconcile both renderers while one action is in flight. Client guards improve UX; the server must still enforce one winner under two tabs/devices.
- [x] Plain Tab accepts only the active eligible canvas proposal. Preserve normal Tab/Shift+Tab in Chat composer, settings/Depth slider, inputs, contenteditable, Quick Edit, menus/dialogs, widgets, embedded frames and other focus-managed controls. Ignore IME composition and repeats. Never bind global Tab to whichever offscreen stale message happens to exist. **Evidence:** controller keyboard guards and inline-AI editor tests. Verify new controls inherit these guards when mounted.
- [x] Preserve existing `viewPassage`/`focusExplanation` and slot source-navigation callbacks as navigation-only; no accept/generate/debit. **Evidence:** source-reference client and slot renderer tests.
- [ ] Wire every new **Go to card / Go to highlighted text / Open table of contents / View section / View card** control to those navigation-only seams, including actual pending-slot framing. New visible controls remain UI.01–08 work.
- [x] Keep existing Ctrl/Cmd+K proposal editing where valid; use **Edit card** as the visible concept. Edit submit/Apply validates a new proposal version; card Accept remains a second action. Do not overload keyboard focus movement with confirmation. **Evidence:** inline-ai-proposal/controller tests prove preview/Apply is separate from paid Accept. The visible Chat composer Edit card target remains open under UI.04.
- [ ] Reconcile delayed acceptance, Cancel, Edit, roadmap revision and source change using current server versions. If a response is lost, read the existing operation before creating a new identity. Preserve accepted work even when initiative pauses or the roadmap ends.

**Verification:** existing `roadmap-controller.test.mjs`, `roadmap-client.test.mjs`, `roadmap-view.test.mjs` and `canvas-slot-card.test.mjs`, and local browser keyboard/race coverage. Count server authorizations, author calls, board cards and ledger rows; CSS-disabled buttons alone are not duplicate protection.

#### UI.06 — place beside the highlighted passage and save exact geometry (R4.10 / R5.03)

**Approved UI reference:** [02-canvas-card-skeleton.html](ui/02-canvas-card-skeleton.html). Use the passage-adjacent visual relationship only; keep the full measured placement, collision and saved-geometry contract below. Fixed demo offsets/grid columns are not a placement algorithm.

**Existing seams:** `roadmap-placement.js:proposalAnchor/deliveredSpot`, `canvas-slots.js`, `AdaptiveCanvas.jsx:roadmapSpot/placeRoadmapCard`, `roadmapSpots`, `pendingAt`, source DOM measurement in `use-roadmap.js`, host `persist/boardVersion/savedHas` in `LearnPage`. Current live placement primarily uses the outer source box and may fall back to `insertAtView`; that is not sufficient for the requested passage-relative layout.

- [ ] Resolve the step's exact authorized source revision/range using UI.07, measure its rendered rectangle, then convert that rectangle to world coordinates using the existing canvas transform. Distinguish DOM/CSS pixels from world units under pan/zoom. Keep the full source card bounds separately as an obstacle; the passage rectangle must never substitute for the much larger Markdown card.
- [x] Rank candidate positions adjacent to the passage on either side of the Markdown, near the passage's vertical position. Prefer the side with usable space. If both sides conflict, try above/below and then outward free space through existing placement primitives. Left/right/up/down are allowed; there is no always-right rule. **Evidence.** Exact-main placement tests exercise deterministic near-passage left/right, above/below and obstacle fallback. Physical geometry/controls remain open.
- [x] Include all current source/material/card bounds, pending and accepted slots, and their attached action controls in collision checks with the existing padding. Do not move, shrink, cover or delete existing material to make room. Keep source text and the Accept/Cancel group usable; reserve the complete proposed rectangle. **Evidence:** roadmap-canvas/canvas-slots placement tests and current AdaptiveCanvas obstacle assembly. Outer-region fallback and final growth/save remain open below.
- [ ] For successive source passages, choose positions generally from top to bottom along either side of the Markdown. Reuse prior placements as obstacles and prefer vertical alignment to the relevant passage. Do not globally repack the canvas or reorder the accepted teaching sequence merely to force a layout. If the semantic roadmap revisits an earlier passage, place near that passage in available space.
- [ ] Reserve the expected final footprint initially. If actual content later grows down into a learner-created obstacle, preserve accepted top-left/width and do not automatically shove other cards or the result elsewhere; record the best-effort growth limitation. Arbitrary later learner layouts cannot be guaranteed overlap-free.
- [ ] If the bounded local search is exhausted, expand the search deterministically to a free outer region rather than accept an overlap or silently use the current viewport. If passage geometry cannot be resolved because the source is collapsed, unmounted/offscreen, virtualized or ambiguous, use an honest measured outer-source fallback where available; do not expand/pan/read a different passage automatically. If even source bounds are unavailable, wait for valid bounds or use a clearly defined persisted source position fallback, never a guessed quote.
- [ ] Persist the chosen slot once. Internal Markdown scrolling, later DOM measurement, source collapse/expansion, polling, Chat switches and canvas pan/zoom must not reposition an existing slot. Normal canvas transforms still move source and card together on screen. Learner drag is authoritative and persists across reload.
- [ ] Source text scroll can change which new passage is measurable, but it cannot change accepted teaching scope or cause earlier cards to follow the text. Preserve original placement during generation/save/error and restore it when the source is offscreen.
- [ ] Fix the delivery handoff: `placeRoadmapCard` currently inserts a block before `pendingAt` finishes offset measurement, and `persist` may read `boardRef` before those offsets settle. Await final block ID+x/y/width/offsets in board state, save those exact values, verify the saved revision and geometry, then acknowledge. Card presence alone is insufficient. No transient default-column placement may flash before offsets settle.
- [ ] Keep accepted work visible after pause/End roadmap, and do not clear its geometry map until durable ordinary-card geometry has replaced it. Generation error and lost save/ack retain the original slot/result. No author redispatch is permitted for geometry or save repair.

**Verification:** extend `canvas-slots.test.mjs`, `roadmap-canvas.test.mjs`, `roadmap-controller.test.mjs`, actual placement tests and keyless browser checks. Cases: tall full Markdown, top/middle/bottom passages, both sides populated, above/below fallback, nearby images/notes and controls, all local candidates blocked, multiple cards on the same range, pan/zoom, inner scroll, collapsed/offscreen source, user drag/reload, delayed measurement/save and missing/invalid revision. Assert nonintersecting reserved world bounds, passage-relative preferred placement and unchanged existing placements.

#### UI.07 — persistent source highlight and icon back to the generated card (R3.04)

**Approved UI references.** Use file 05 for the Markdown annotation and hover control. File 04 shows the reciprocal explanation header. Follow both directions for the same verified source and saved card identity. [05 — Markdown source links](ui/05-markdown-source-links.html) · [04 — Explanation card](ui/04-explanation-card.html)

**Existing seams:** `FileDocMarkdown.jsx`, `SOURCE_REF_EVENT`, `passageTarget`, `paintHighlights`, `SourceRefChip.jsx:SourceRefLine`, `source-refs.js:viewPassage/focusExplanation`. Extend the actual reference registry and Markdown renderer; do not create a separate source-navigation authority.

**Critical coordinate distinction:** `FileDocMarkdown` quote/range helpers use rendered `[data-file-doc-md]` text, while the backend source reader and minted step references use original Markdown bytes/text offsets. Those offsets are not interchangeable. Formatting, links, headings and code fences change rendered positions. Reuse strict verified quotation/revision resolution or add an explicit raw-source-to-rendered-anchor mapping. The best-scoring wiki highlight locator is not sufficient evidence for a Tutor explanation link.

- [x] Store/reuse the relationship source key+revision+verified quote/range ↔ step/proposal/result/card identity. Confirm permission and current revision before exposing/navigating. Duplicate quote text needs surrounding context or stable explicit anchors; ambiguous/changed/deleted/inaccessible targets must show a truthful limitation, never navigate to a look-alike passage. **Evidence:** source-refs server/client/render tests plus Markdown/PDF anchors. New persistent paint/gutter controls are separate requirements below.
- [ ] Show the verified proposal excerpt and its source emphasis before delivery. After delivery, render the persistent Tutor association for a resolved, accessible source/card pair. Reuse the rendered Markdown boundaries in the pinned source revision. Tint an exact prose range or resolved code lines. Outline the diagram or image block. Use a side rail for a resolved whole section. Preserve code indentation, syntax color and horizontal scrolling, along with image and diagram content. Use a verified source span and rendered block mapping for non-text content. Keep ambiguous ranges unavailable until they resolve. [05 — Markdown source links](ui/05-markdown-source-links.html)
- [ ] Keep the **View card** button in the annotated section’s adjacent gutter. Reveal it on section hover or its own keyboard focus. Hidden buttons retain their space and Tab reachability. Disable pointer events while hidden. Set the tooltip to **View card** and the accessible name to **View card: <title>**. Activate through existing `focusExplanation` and the canvas camera, then briefly outline the actual destination using `--color-select`. Preserve the stored placement. If one section has several authorized cards, use one compact chooser with the actual titles. Pending, failed or unavailable results have no active saved-card link.
- [ ] In the fixed explanation header, render **Source: filename** with **View section** using the same ScanText glyph as the Markdown **View card** button. Reuse `SourceRefChip` status checks and its `viewPassage` callback. Chat **Go to highlighted text** uses the same source identity. On explicit activation, frame the source as needed, scroll its inner Markdown viewer to the verified range or block and show temporary emphasis. Keep camera framing distinct from the inner scroll. [04 — Explanation card](ui/04-explanation-card.html)
- [ ] Separate three layers: learner-created persistent highlights; Tutor source/card association highlights; transient navigation emphasis. Expiring the transient effect must not erase the other two. Re-render/reload restores valid relationships; source revision change/unmount clears stale paint/listeners and disables invalid links. Cancelling a proposal removes only its unaccepted temporary association.
- [x] Preserve normal selection, source Highlight/Explain actions, bounded reader scrolling and existing accessible source-reference navigation. No blanket arrows/circles, forced source expansion or automatic canvas pan merely because a card was generated. **Evidence:** current FileDocMarkdown selection actions, source navigation callbacks and source/slot render tests.
- [ ] A changed/deleted card removes its live icon target; deleting/losing access to the source leaves the delivered card intact but marks the source relationship unavailable. Do not leak private proposal content into shares/forks or expose a target the viewer cannot access.

**Verification.** Extend `source-refs.test.mjs`, `source-refs-render.test.mjs`, `card-layout.test.mjs` and the affected Node suites under section 8.0. Cover verified ranges for all five anchor types, exact card identity, repeated text and media, stale revisions, inaccessible or missing targets, multiple destinations and persistent highlights after temporary emphasis clears. Check header and footer placement in rendered markup. The owner’s later manual check covers scroll containment, hover and focus reveal, keyboard activation and visible target emphasis. [04 — Explanation card](ui/04-explanation-card.html) · [05 — Markdown source links](ui/05-markdown-source-links.html)

#### UI.08 — keep Chat aware of every card and provide the next action in both places (R1.03–R1.05 / R6.03)

**Approved UI reference:** [02-canvas-card-skeleton.html](ui/02-canvas-card-skeleton.html). Use Show Next card state to inspect the bottom-fixed Next card / Cancel pill, including its position while scrolling. Clicking Next card accepts the already-ready next proposal once; no second Accept.

- [ ] After the current card is saved and acknowledged, update its bound Chat entry to ready with title, description and source excerpt, and navigation/edit actions. Then create one next pending proposal when Auto-suggest permits. Show that next proposal in Chat and on canvas with shared metadata and action identity; every roadmap card has a corresponding Chat lifecycle entry.
- [ ] The next proposal offers **Next card** in its Chat entry and the canvas-bottom fixed **Next card / Cancel** pill, using [02](ui/02-canvas-card-skeleton.html), as the same acceptance action; eligible Tab does the same. It does not first buy a hidden next card or create a different proposal on each surface. **Cancel / Edit card** retain the same semantics. First proposal uses **Accept**.
- [x] With Auto-suggest off or paused and no pending proposal, **Propose next step** in Chat requests only metadata; it is followed by proposal review and **Next card** to authorize that subsequent card. Respect Ask/off/pause/end/source validity, remaining steps and ceiling. No speculative artifact call is part of this MVP. **Evidence.** Exact-main BE.11/BE.05a and the real Cancel then manual-next probe show a Chat metadata offer without a new author call. Canvas label parity is tracked in UI.04/05/08.
- [ ] Background proposal arrival updates Chat and canvas quietly: no focus steal, forced tab/thread switch, auto-scroll away from a learner reading older messages, camera jump or repeated invitation. Preserve normal near-bottom Chat behavior and unread affordances. Explicit **Go to card** performs navigation only; do not render a standalone floating Next step ready control.
- [ ] After the final saved card, say the roadmap is complete in Chat and retain its accepted ToC/history/card links. No extra next proposal. **End roadmap** stops future suggestions while accepted work can finish; **Cancel** pauses unaccepted progression. Safety refusal stops automatic next offers; ordinary failed/skipped progression follows UI.04.
- [x] Keep `CardFeedback.jsx` thumbs only on eligible delivered generated content, hover/focus revealed and blue when selected. Imported sources, pending/held/error slots and shared/view-only surfaces remain ineligible. Thumbs are feedback, not mastery, payment, proposal acceptance or manual ToC completion. **Evidence:** card-feedback backend/client/render tests; eligibility, selected blue and hover/focus classes verified without a browser.
- [x] Preserve the existing Progress tab and its independent no-goal feedback loading/error handling. Opening Progress does not teach, generate, pan absent an explicit card link, or rewrite roadmap state. **Evidence:** learn-progress-feedback SSR tests cover no-goal display, independent errors/loading and cross-canvas isolation.

**Verification:** existing `card-feedback.test.mjs`, `card-feedback-render.test.mjs`, `learn-progress-feedback.test.mjs`, `roadmap-auto.test.mjs`, `roadmap-controller.test.mjs` and control-plane `roadmap-auto-proposal.test.js`. Assert one metadata proposal/Chat entry per successor, no author before acceptance, no successor before durable save+ack, both Next card buttons collapse into one operation, safety stop, final completion and quiet background arrival.

### 4.4 Owner manual production UI acceptance — after local backend tests

Claude Code must first complete [section 8.0](#80-required-local-backend-flow-tests-before-manual-production-checking) and provide the passing backend receipt. This UI matrix is then the owner's manual checking reference on the deployed main app. Claude must not substitute a request for owner browser testing for local source, request, state, money or persistence tests. No Playwright, Chromium, browser MCP or local browser harness is commissioned for this stage; the old local setup is retained only in section 8.2 for a later explicitly requested use.

Use ordinary supported actions for manual production review. Reproduce failure injection, races, revoked access and save/ack loss in the local backend tests; do not ask the owner to cause production outages or repeatedly purchase cards to uncover those defects. Record which visible states were actually observed, and leave unobserved UI behavior unverified.

| Scenario | Required observed result |
| --- | --- |
| Fresh drop / occupied thread / draft-only composer | Right Chat opens; immediate honest receipt; occupied cases show Start new chat / Stay here first; existing text survives; invitation appears once in selected actual thread |
| Multiple drops, delayed reads, thread switch, reload | Correct source-to-thread binding and ordered events; no late message in the wrong conversation or duplicate invitation |
| Explain, long read, draft review | Visible in-thread spinner/shimmer; full context request; parameter box and full draft in Chat, no external strip |
| Settings and roadmap edit before/after acceptance | Direct Depth slider and mode dropdown; stale accept blocked; targeted edit pill; explicit reacceptance; delivered/in-flight work unchanged; practice cannot silently fall back |
| Accept roadmap and ToC | Confirmation and explicit link stay in Chat. The link opens one accepted tree with its independent Contents conversation. Roadmap parameters, stopping and approval stay in right-hand Chat. |
| Proposed → accepting → generating → checking → saving → ready | Same visible canvas frame/top-left/width/title/excerpt; matching single Chat lifecycle entry; 28px control, 4px corners, 8px gap and 16px spinner; no disappearance or transient column placement |
| Passage layout | Top/middle/bottom passages; left/right/above/below choices; crowded obstacles; no overlap of source, other material or attached controls; no existing-card rearrangement |
| Inner scroll / collapse / pan / zoom / drag / reload | Existing slot remains at saved world position; canvas transform behaves normally; explicit learner drag persists; no source expansion or camera jump |
| Chat Accept versus canvas Accept versus Tab | One server winner, authorization, author call and saved card; stale buttons cannot replay |
| Keyboard exclusions | Normal Tab/Shift+Tab in all composers/settings/editors/menus/dialogs/widgets/frames; no IME/repeat acceptance |
| Cancel and Edit races | Canonical version/winner; pending cancellation intentional; edit does not buy; delivered edit preserves original |
| Known generation failure / safety refusal / unknown provider / save or ack loss | Honest slot and Chat state; no Retry/Replace/Omit/recovery strip; safety stops auto-next; same result reconciled without generation or duplicate charge |
| Delivered explanation layout and Markdown | Scroll the main explanation while its accepted title, Explanation, source controls and disclosure buttons stay visible. Open a section and confirm the same card grows down with the reading position preserved. Check a rendered Markdown table and Mermaid flowchart against files 04 and 06, including at a narrower card width. |
| Source association icon | Prose, code, diagram, image and whole-section annotations use their approved treatment. View card appears on section hover or keyboard focus. Activate it to briefly outline the exact saved card in blue. View section returns to the verified anchor. Check the multiple-target chooser and persistence after emphasis clears. |
| Changed/ambiguous/deleted/restricted source or card | No guessed passage or dead/leaking link; honest unavailable state; no accidental camera movement |
| Next card and completion | Same pending step in Chat and bottom-fixed canvas Next card / Cancel; pill stays visible during scroll/pan/zoom and beside resized Chat; no pill beside the card; either acceptance generates once with no second Accept; Cancel preserves delivered cards; only after saved ack; quiet arrival; no final extra proposal |
| Feedback / theme / reduced motion | Existing hover/focus-only thumbs and separate Progress; legible light/dark tokens; status remains understandable without animation |

Before the manual review, record the backend receipt required by section 8.0. During the owner's later manual check, associate the deployed SHA/build with the visible results and any geometry/screenshots the owner supplies. Backend evidence does not prove physical scroll containment, focus behavior, placement or appearance. Check each implementation/verification box only against the appropriate evidence; do not mark manual production acceptance from a Node result.



### 4.5 Chat routing and reply reliability

Implement [roadmap section 4.7](tutor-roadmap-v1.4.md#47-ordinary-messages-and-tool-requests) in two independently testable slices. **CHAT.01** is the production outage repair. **CHAT.02** qualifies the shared reply and tool path for Ask, Auto and Tutor. The ordinary Explanation MVP, its section 8.0 verification and the individual R12 adapters have their own acceptance boundaries.

**Focused routing baseline** at main `8deb778fa2b0442b4ac494f9d94e88fffd72a6c3`. `packages/web/src/ask.jsx::AskPanel.send` handles named commands and targeted edits, builds the message/context/Depth payload, then waits for `generation-proposal-chat.js::routeChat/routeOutcome` before `/api/learn/ask` on eligible plain sends. `packages/control-plane/src/chat-capability-route.js::decideChat` handles named capabilities, slash commands, wire Tutor mode and the existing plain explanation shortcut, then calls JEV for other text. The server can return `route: "answer", via: "fallback"` on a classifier failure. The client shows a decision, restores the draft and returns before the answer request. A failed browser route request reaches the same banner. The exact `hi` failure was reproduced with the real route decision and client outcome functions using local doubles. The focused baseline passed 87 Node cases including 9 reproduction cases. This evidence describes the pre-fix behavior. Section 2.1.1 records the full implementation audit checkpoint.

#### CHAT.01 Continue ordinary replies during a router outage

- [x] Extend the client and route tests to reproduce the failure on an ordinary question and a conversational turn. Keep an eligible healthy tool request and a genuine clarification as controls. **Evidence.** Exact-main routing tests cover greeting and ordinary failure replay, healthy signed Motion and clarification controls. The compound client/server restrictions below remain open.
- [ ] In `packages/web/src/generation-proposal-chat.js::routeChat/routeOutcome`, separate recoverable router failure from validation/access errors and from valid clarification, unsupported and capability decisions. Cover timeout, JEV unavailable, malformed decision and a failed or transient route request. Propagate aborts. Distinguish an absent legacy route from a scoped not-found response. Refuse a missing or invalid proposal token as a tool-specific error.
- [ ] In `packages/web/src/ask.jsx::send`, let a recoverable failure on an uncommanded turn reach the existing `/api/learn/ask` fetch once with the original frozen payload and a restrictive `answer_only: true` request field. Check the active flight and thread before continuing. Reuse the optimistic rows and the normal reply/persistence path. Keep permission and request errors visible and preserve the applicable draft. Explicit tool failures retain a specific error and their draft.
- [ ] In `packages/control-plane/src/index.js::apiAsk`, validate the per-turn restriction and enforce it after the existing board/session checks in `packages/web/dev-worker.js`. Accept it only for ordinary canvas replies and reject contradictory command, proposal token, Edit or regeneration inputs. Keep authorized source/canvas context, thread and Depth and ordinary reply accounting. Skip generation and outline instructions and tools, suppress actionable tool suggestions for that turn, and give `researchAnswer` an empty tool list with `arxiv: false`. Keep the existing SSE and Chat persistence callbacks. Prove that a model's attempted tool call in this restricted turn cannot dispatch an action, reserve tool credits or create a job.
- [ ] Remove the fallback banner and its **Answer normally** and **Retry** controls from `packages/web/src/RouteDecision.jsx` and its caller. Retain actual clarification options such as **Answer in chat** and specific refusals. Correlate routing failures using the existing request ID and outcome/error code. Record actionable reasons for missing transport or provider failure without source text or secrets.
- [ ] Verify the focused matrix and build below and release this repair through [section 8](#8-local-verification-and-direct-production-release). Release evidence identifies the exact tested candidate and production build.

#### CHAT.02 Qualify the shared reply and tool path

- [ ] Route ordinary sends through the existing `/api/learn/ask` turn for the qualifying scope. Use current composer context and mode eligibility, including Ask's pause of unsolicited Tutor initiative. `packages/web/src/chat-route.js::askMode` maps ordinary Tutor messages to Auto today. Keep Contents/outline-only wire routing distinct and exercise the normal Tutor composer entry. Send slash commands and explicit roadmap actions through the existing handlers, including `RoadmapTranscript.jsx` and `roadmap-controller.js` for roadmap/step actions. Use [section 4.1.1](#411-lesson-entry-and-offer-readiness) for the typed lesson handoff, keeping single-card requests and ordinary questions distinct.
- [ ] In `apiAsk` and `packages/control-plane/src/learn-research.js::researchAnswer`, use the existing answer model with optional tool calls. Reuse `generation-proposal.js::PROPOSAL_TOOL` for Motion first and use the command IDs and allowed capabilities from `packages/web/src/inline-ai-route.js` and `packages/web/src/agent/slash.js`. Use validated structured tool output. The model can answer with zero tool calls or ask a focused question. User wording, including a greeting or a tool mention, is model input. A selected source provides evidence and context for the learner's request.
- [ ] Expose the eligible functions through the model request's native `tools` definitions, generated from the current command registry and adapter-owned schemas. Bind a stable tool name and command ID to the existing handler. Give each callable function a description of its output, when to use it, its constraints, and a JSON Schema signature for learner-supplied arguments. Use `input_schema` for Claude and the existing OpenAI-compatible `parameters` mapping where applicable. Reuse the review schema and validators for settings. The server supplies known identity, canvas and revision bindings. For generation tools expose proposal/preparation through the existing review contract, with execution gated by approval.
- [ ] Use `tool_choice: auto` for the shared reply path. Keep shared selection policy in the system prompt. Answer questions in Chat, clarify material ambiguity, and request a tool only when the intent and the eligible tool's output match. Keep tool-specific selection guidance and signatures with the definitions so the prompt and dispatch use the same capability facts. During the JEV transition, derive Choice criteria from those same descriptions for the currently qualified routes and keep their existing validators.
- [ ] For a natural-language artifact request, identify the desired output and required behavior from the full prompt and permitted context. Use structured intent to carry the output requirements and selected stable command ID. Compare eligible tools on their actual modality, narration, interactivity, settings and required inputs. Verify the selected capability against the requirements and current server eligibility before showing its review. If a material choice is still unclear, ask one focused question. Keep example topics and phrases in eval fixtures and use capability fit in the routing decision. An explicit command uses its selected capability and validation path.

**Video selection reference at the pinned main.** `agent/slash.js` declares Motion as a timed explainer video, `whiteboard-video` as the typed `/whiteboard` narrated drawing video, and `animation` as live interactive 3D. Use the shared settings in `generation-confirmation-schema.js` and each adapter's real availability and runtime gates as capability facts. Motion's audio field is disabled, so narration required by the request disqualifies it. The generic `CHAT_ROUTES` catalogue at this baseline offers Motion for video; Whiteboard and Animation have named entry points. Qualify a native plan, review and adapter for each before offering it from free-form text. This coverage belongs to CHAT.02, with R12.07, R12.08 and R12.11 governing the separate Tutor bindings.

Provider references for tool descriptions, schemas and selection policy are the [Claude tool definitions](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools#best-practices-for-tool-definitions) and [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling#best-practices-for-defining-functions) guides.

- [ ] Reuse each enabled command's existing preparation, direct dispatch or signed review through its current adapter. Validate user/canvas access, availability, capability, required inputs, context and current revision before handing off. Preserve the existing signed proposal, Edit, Generate and settlement gates and one saved turn. An explicit Edit targets its selected revision. Where a waiting Explain/Animation or Motion plan supports implicit refinement, use the existing plan/revision as context and require an actual refinement intent before invoking its revision handler. Verify both a genuine refinement and ordinary conversation beside the waiting plan.
- [ ] Recover before showing or accepting a tool offer. When the selected capability cannot deliver the requested result, use the same validated catalogue to find a qualified alternative that meets the original goal and explicit requirements. Offer one candidate in its existing review and explain the fit. If a material tradeoff would change a requirement, or a missing input can unlock the request, ask one focused question and use the answer to continue the same request. When no tool is viable, provide useful authorized help in Chat and a concrete next step. Keep this recovery in the original reply and context. Use existing approval, cancellation and revision checks. Revalidate any offered alternative before dispatch. This branch does not authorize generation, a tool credit hold, or a retry of an accepted job. Enforce access and safety before and after selection.
- [ ] Qualify per affected mode and enabled command set before retiring its ordinary-turn JEV preflight. Start with the Motion proposal fixture and pass the relevant learner intent and Send cases below for current natural-language direct commands and signed reviews before switching a scope that offers them. Use the current path with CHAT.01 resilience for scopes without parity. Keep the standalone inline and safety calls separate. R12's selected step, goal, source, eligibility and same-slot lifecycle are governed by [section 6.9](#69-r12--independently-released-command-adapters), independent of this Chat intent decision.
- [ ] Verify fixture behavior and record coverage for every enabled answer transport in the candidate. Use the same labeled messages to compare missed and unnecessary tool requests, and time to first reply against the current JEV path when authorized provider evidence is available. Local doubles establish wiring, authorization, state and action counts. Record live intent quality as unverified where live testing is unavailable. Apply the existing model-spend authorization boundary.

#### Focused Chat routing tests and build

Use [ask-auto-tutor-workflow.md](ask-auto-tutor-workflow.md) to identify the reply, tool handoff and recovery branches these tests cover.

Use the actual `routeChat`, `chatRouteFetch` and Ask request/response path with transport doubles. Extend the existing CR-1 case in `packages/control-plane/test/chat-modes.test.js`, which uses the real `apiAsk` function, `askStream` and disposable SQLite. Capture the outgoing answer tools and real saved rows. Use client tests to assert one Ask request and the composer decision. Run the cases at their normal entry points in Ask, Auto and ordinary Tutor.

| Case | Expected result |
| --- | --- |
| Conversation in varied wording/languages, a normal question, a question about Motion, or “explain this without a video” | A saved reply with zero artifact requests. In the qualifying CHAT.02 path there is no separate JEV preflight. |
| Recoverable JEV/network failure during an ordinary send | One Ask request, one saved user/reply pair, original thread, canvas/context and Depth, zero offered tools, proposals, jobs or tool credit holds. The fallback banner and its buttons are absent. |
| “Hi, make a short video of the tree split”, “find me a video” and typed `/motion` | The full creation request gets one signed Motion review and creates a job only on Generate. Search uses the existing search handler. A typed/picked command follows its named route without semantic classification. |
| Tool blocked before review on a valid turn | Offer a qualified alternative, ask one question that can unblock the request, or give useful partial help and a next step. Preserve the goal, required output and thread. Recovery itself creates zero jobs and tool credit holds. |
| Denied board, invalid/stale token, canceled flight or switched thread | Keep the applicable denial or cancellation. Recovery cannot bypass access or safety, create duplicate rows or land a reply in another thread. |
| Ordinary message beside a waiting plan, real refinement, explicit Edit, Tutor roadmap approval and **Next card** | Conversation stays a reply. A refinement uses its actual target. Tutor actions keep the current revision and one accepted slot through saved delivery and acknowledgment. |

**Selection-only routing checks for CHAT.01 and CHAT.02.** Run both sets before enabling the shared route for the affected modes and capabilities. Treat the prompt, mode and fixture state as separate inputs. Capture the outcome and tool ID, when applicable, after eligibility and input validation. Stop at the reply, question, search, revision, direct action or review handoff decision, before composing a full answer, building a plan, running search, dispatching an adapter, inserting a card, starting a job, rendering or holding credits. The existing delivery and approval suites cover the work after that boundary.

##### Set A — Twenty learner intent cases

Load the [intent fixture](../../../../packages/control-plane/test/fixtures/chat-routing/intent.json). Check whether the full prompt and authorized context lead to the expected result. Use the qualified and enabled tools stated by each case. An acceptable route must meet the requested output and required behavior. Where two routes can fit, record which one was chosen and the relevant capability.

##### Set B — Twenty cases from Send in Ask, Auto or Tutor

Load the Send fixtures by mode.

| Mode | Fixture | Starting cases |
| --- | --- | --- |
| Ask | [send/ask.json](../../../../packages/control-plane/test/fixtures/chat-routing/send/ask.json) | 6 |
| Auto | [send/auto.json](../../../../packages/control-plane/test/fixtures/chat-routing/send/auto.json) | 7 |
| Tutor | [send/tutor.json](../../../../packages/control-plane/test/fixtures/chat-routing/send/tutor.json) | 7 |

Start each case at the existing `AskPanel.send` decision path with the fixture's mode, thread, source and edit state. Follow the actual client and server routing seams through mode, context and capability checks. Capture the final routing decision before its downstream handoff. Use the real guards and dispatcher selection, with external transport and downstream execution doubled. A direct invocation of the classifier alone cannot verify this set. Exercise each case on the rollout path in its fixture.

##### Add cases to the fixture files

Append to the appropriate JSON file's `cases` array and give each case a unique stable `id`. Use `entry` to distinguish a plain `message` from a typed or picked `slash-command`. Keep the actual learner `prompt` separate from the `setup` for source, permissions, tool availability or edit state. Use the file's `mode` to configure the Send harness. `expected.route` and `expected.commandIds` are fixture labels for the outcome and allowed registry IDs. Use `expected.detail` for additional assertions such as required output or a frozen revision. The Send cases can grow independently in each mode with both natural-language and named-command requests. For the same prompt in a different state, add a uniquely identified `variants` entry with its own setup and expected result. Use the same case shape for [individual R12 commands](#r12-routing-tests-for-each-command).

**Record the decision and tune misses.** In the Node suites, capture the actual outgoing tool definitions, input schemas and mode/context, then use transport doubles to exercise routing, access, capability fit, the existing approval destination and cancellation. Inject an incompatible command or invalid arguments and verify validation at the handoff. Use execution spies to assert zero downstream calls and side effects in both sets. For semantic quality, run the actual candidate router with a selection-only stop and an authorized model path. Compare the observed outcome, stable tool ID and required output to each case label. A scripted correct reply proves wiring only. Record expected and observed routes, availability, mismatches and candidate SHA. Report fixture results separately from model routing accuracy. Tune descriptions, system instructions or selection/eligibility logic for misses, then rerun both sets and held-out paraphrases. Keep the existing model-spend authorization boundary. See [OpenAI evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices).

Run from the repository root with lockfile dependencies and Node 24. Extend the existing suites and record actual candidate SHA, commands, test counts and any unverified transport/behavior in the task receipt.

```sh
node --test packages/web/src/chat-route.test.mjs packages/web/src/inline-ai-route.test.mjs packages/web/src/generation-proposal-chat.test.mjs
node --test packages/control-plane/test/chat-capability-route.test.js packages/control-plane/test/chat-modes.test.js
# When proposal, adapter or Tutor action wiring changes
node --test packages/control-plane/test/generation-proposal.test.js packages/web/src/roadmap-workflow-web.test.mjs packages/web/src/roadmap-controller.test.mjs
npm --prefix packages/web run build
```

Use test doubles with denied external provider egress for this local stage. Run the affected [section 8.0](#80-required-local-backend-flow-tests-before-manual-production-checking) tests for any Tutor lifecycle changes. Use the existing clone-backed verification and authorized production launcher. Owner manual checking follows the tested release.

## 5 Reconcile existing R1–R6 tasks

### 5.1 R1–R3: retain completed foundations, verify the changed integration

The old v1.0 tasks below are not a new build queue. Their modules/migrations exist at current main. The table checkboxes below cover the stated existing foundations; new CORE/UI requirements have their own checkboxes and are not silently checked by a baseline row. In particular, a checked existing UI control is not acceptance of the new Chat layout or the final production UI. Use the named source and tests, record prior evidence that still applies, and change only a failing behavior relevant to the candidate. CORE/UI tasks govern new corrections. All web paths below are under `packages/web/src/`; server paths are under `packages/control-plane/src/`, and Learn migrations under `packages/control-plane/learn-migrations/`.

| Task | Owner | Current files / exact retained work | Completion evidence |
| --- | --- | --- | --- |
| [x] R1.01 Feedback contract/schema | State | `card-feedback.js`, `0036-card-feedback.sql`: one up/down/null per actor+canvas+card; generated-card access validation; no feedback in board JSON. | Existing schema/store tests, cross-actor denial and clear/update round trip. No duplicate migration.  **Review:** Locally verified: card-feedback schema/store cases; private scope. |
| [x] R1.02 Authenticated reads/writes | State | `card-feedback.js` and current route mounts: server-derived actor, canvas/card authorization, repeat writes idempotent. | Authenticated fixture route tests, foreign card/board refusal.  **Review:** Locally verified: authenticated route/access/idempotency tests. |
| [x] R1.03 Client/control | UI | `card-feedback.js` web client, `CardFeedback.jsx`: hover/focus reveal, either selected thumb blue, selection alone does not keep it visible. | Existing client/Node SSR control tests passed; new-slot integration is UI.08 and final manual appearance is R1.06.  **Review:** Existing control locally verified by client and Node SSR tests. New-slot/browser appearance remains UI.08/manual receipt. |
| [x] R1.04 Generated-card mount | UI/Lead | `AdaptiveCanvas.jsx` and existing card controls: one pair on delivered generated content; no pair on import/proposal/generating/error. | Existing generated-card mount and eligibility source/SSR checked. New same-slot/reload integration remains UI.04/08 and R1.06.  **Review:** Existing generated-card eligibility/mount source and SSR verified; new lifecycle integration remains UI.04/08. |
| [x] R1.05 No-goal Progress | State/UI | Retained Progress read model and `learn-progress-feedback.test.mjs`: current-canvas self-report distinct from assessed evidence and manual goals. | No personal goal required; private feedback remains navigable or honestly removed.  **Review:** Locally verified: no-goal/with-goal Progress, isolation and independent error/loading tests. |
| [ ] R1.06 Slice receipt | Verifier | Reuse focused feedback checks; no unrelated planning/media run. | Actual SHA/command/case count, UI evidence and deployed/accepted status separately.  **Review:** Partial: local receipt recorded; final changed-UI/production manual acceptance remains open. |
| [x] R2.01 Depth contract/Chat | Tools | `chat-depth.js`, `learn-models.js`, web `learn-settings.js`: Brief/Balanced/Detailed (was Overview/Standard/Deep); actual Chat request uses submitted Depth. | `chat-depth.test.js`, prompt input assertions, default and invalid-depth behavior.  **Review:** Locally verified: submitted/default/invalid Depth and serialized Chat prompt tests. |
| [x] R2.02 Persist settings | State | `learn-user-settings.js`, `0037-learn-user-settings.sql`: global per-learner Auto-suggest; per-learner+canvas Depth. | Cross-user/canvas/board denial, cross-tab/device preference behavior.  **Review:** Locally verified: persisted learner/canvas scope and access tests. |
| [x] R2.03 Settings UI | UI | `ModeSelector.jsx`, `DepthMenu.jsx`, `use-learn-coaching.jsx`, `chat-workspace.jsx`: existing controls and one settings source. | Existing shared settings/control source and state tests passed. New Chat parameter rendering remains UI.03; no claim that layout is complete.  **Review:** Existing shared setting/control source and state tests verified. New Chat parameter layout remains UI.03. |
| [x] R2.04 Artifact Depth | Tools | `learn-slash.js` and `learn-artifact.js`: capture submitted Depth and pass into actual supported generator request. | Existing direct artifact dispatch/Depth tests passed. Immutable roadmap author body remains CORE.03/05, outside this baseline checkbox.  **Review:** Existing direct artifact Depth dispatch locally verified. Roadmap accepted snapshot remains CORE.03/05. |
| [x] R2.05 Both Explain paths | Tools | `startExplain`/Explain job path and legacy artifact fallback keep Depth in job/body/block metadata. | Existing `explain-depth.test.js`; typed/Quick Edit still startExplain-first.  **Review:** Locally verified: Explain job/restart/repair and legacy fallback Depth binding. |
| [ ] R2.06 Integrated settings | Verifier | State, composer and source scope together; accepted request does not mutate when slider changes later. | Settings/request tests and no extra purchase from preference changes.  **Review:** Partial: mutable current.depth still affects roadmap generation; accepted snapshot tests required by CORE.03/05. |
| [x] R3.01 Markdown/PDF-excerpt anchors | Tools/UI | `source-refs.js`, `FileDocMarkdown.jsx`, existing PDF excerpts/page viewers: exact source revision/locations. | Existing source/PDF anchor tests. Whole-PDF Tutor planning remains R7b.  **Review:** Locally verified: Markdown and actual pdf.js selected-excerpt anchors; no whole-PDF adapter claim. |
| [x] R3.02 Authorize/index refs | State | Server `source-refs.js` and board save integration: access and revision checks, not client URL as authority. | Foreign/deleted/changed/ambiguous source cases; safe share/fork output.  **Review:** Locally verified: authorization, changed/ambiguous references and index tests. |
| [x] R3.03 Carry metadata | Tools/State | `sourceRef` through creation/jobs/blocks; CORE.02–03 separate full document from locator. | Tiny anchor + full-context author request; reload keeps reference.  **Review:** Existing sourceRef metadata and full-author-document/tiny-anchor regression verified. New accepted-input snapshot remains CORE.03/05. |
| [x] R3.04 Navigation | UI | `SourceRefChip.jsx`, `source-refs.js::viewPassage/focusExplanation`, `FileDocMarkdown.jsx` highlight handler. | Existing source-identity and navigation callback tests passed. New persistent highlight/reverse gutter controls remain UI.07; viewer/manual integration remains R3.06.  **Review:** Existing bidirectional callbacks/inner-scroll identity verified. Persistent highlight, ScanText and hover-only reverse control remain UI.07. |
| [x] R3.05 Sharing/forks | State/UI | Current shared/fork sanitizers; private pending bindings excluded, permitted delivered refs retained. | No private keys/source data/step metadata leak; revoked source fails access.  **Review:** Existing share/fork sanitizers and inaccessible-source guards verified in source-reference tests. |
| [ ] R3.06 Viewer receipt | Verifier | Current Markdown/PDF viewer plus the new slot integration. | Existing tests and actual scroll/highlight/reload checks; no fabricated full-PDF acceptance.  **Review:** Partial: Node anchors/render tests pass; new source-link UI/reload and owner manual viewer receipt pending. |

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
| [ ] R4.01 Contracts | Existing `roadmap-contract.js`, `roadmap-policy.js`, contracts directory; CORE.01/08 update obsolete ordinary-author expectations. | Lead, before changed interfaces integrate.  **Review:** Partial: contracts exist; CORE.04/05/09 changes remain. |
| [ ] R4.02 Durable records | Existing migration0039/store/actions; preserve one unfinished roadmap, immutable versions and replay guards. Extend records only when a demonstrated new field cannot use an existing trusted field. | State; no blanket new schema migration.  **Review:** Partial: durable store and winner guards tested; accepted settings/brief snapshot remains CORE.03/05. |
| [ ] R4.03 Source/tools | Existing source readers/tools registry. CORE.02 separates whole context from teaching scope; tool availability stays explicit. | Tools; R3 access/reference identity.  **Review:** Partial: readers/registry tested; selected-scope whole planner context remains CORE.02. |
| [ ] R4.04 Invitation/plan/ToC | Existing source-ready/controller/planning modules. UI.01–03 bind actual Chat, move draft/settings/editing there and publish only the accepted ToC tree; CORE.02 supplies complete context. | UI/Tools/Lead; one source readiness flow.  **Review:** Partial: thread/controller foundation tested; approved Chat/accepted ToC/revision loop remains UI.01–03. |
| [x] R4.05 Durable recovery | Existing `roadmap-events.js`, `roadmap-jobs.js`, `roadmap-sweep.js`; retain alarms/read advance/sweep and actual lease/dedupe semantics. | State; no new coordinator framework.  **Review:** Existing durable event/job/lease/replay/auto-event tests pass; no new coordinator required. |
| [x] R4.06 Provider identities/quota | Existing `roadmap-models.js`, `roadmap-quota.js`, `learn-spend.js`. Planning/source work platform-funded; quota reserved after local validation and reconciled on proven pre-dispatch failures. | State; existing D1-safe queries and quota repair must survive.  **Review:** Existing admission/quota/checkpoint/replay tests pass; exact author-request pricing is R4.07/CORE.05. |
| [ ] R4.07 Step money | Existing `roadmap-money.js`, authorization/allocations and consume/transfer. CORE.05 prices actual full input; no double hold. | State/Tools; shared actual request builder.  **Review:** Partial: atomic money path passes; actual full-request quote/snapshot still missing. |
| [ ] R4.08 Ordinary adapter | Current `roadmap-card-3`, full document + step brief, `repairs:0`. CORE.03–04 finish accepted-version/no-redispatch binding. | Tools/State. CORE.09 shares Explanation teaching and content validation with direct artifact callers while retaining each entry point's authorization and lifecycle.  **Review:** Partial: full-document author/repairs:0 implemented; accepted input and one dispatch remain CORE.03/04. |
| [ ] R4.08a Explanation content and renderer | CORE.09 is required for the core Tutor MVP. Update planner guidance and share the Explanation writer rules across direct questions and roadmap steps. Bind title/Depth, enforce caps and deliver Markdown tables and Mermaid in the shared card renderer. | Tools/UI/State. BE.06a before owner manual checking.  **Review:** Pending: new shared Explanation content/caps and approved renderer. |
| [ ] R4.09 Applicable validation | **Superseded title:** no ordinary LLM source-support/citation judge. CORE.06 retains source identity, schema, safety and honest `not_run`; richer/practice tools keep their named checks. | Tools/State; no obsolete reviewer polish.  **Review:** Partial: no-citation policy/schema/safety tests pass; accepted revised-intent binding remains CORE.06. |
| [ ] R4.10 Proposal/placement | UI.04–07: reuse existing skeleton/card, private world slot, exact pill, click/Tab, same-slot save/reload/navigation. | Canvas/UI/Lead; actual host integration, not just helper tests.  **Review:** Partial: slots/collision/Tab exist; durable geometry and new controls remain UI.04–07. |
| [ ] R4.11 Failure/refund | CORE.04–06 and UI.04: known failure versus uncertain response, truthful settlement, same slot plus Chat status, skipped-step progression and safety stop. | State/UI; no ordinary Retry / Replace / Omit or author redispatch.  **Review:** Partial: refund/unknown/refusal paths tested; terminal no-author-retry and durable statuses remain. |
| [ ] R4.12 Next/revise/stop/privacy | Existing lifecycle/client/actions; preserve ended/history/deleted state, ceiling and private shared/fork projection. | State/UI; no automatic mastery or whole-plan purchase.  **Review:** Partial: existing end/ceiling/private projections; new Chat messages/reacceptance integration remains. |
| [ ] R4.13 Complete flow | CORE.07 plus section 8.0 Node/backend matrix and REL tasks, followed by owner manual UI checks: first/second cards, reload, next offer and real production status. | Verifier/Lead; focused evidence, existing clone-backed MVP release verification.  **Review:** Pending full updated backend matrix/build/deployment receipt and subsequent owner UI acceptance. |

**Do not restore stale internals:** browser router/planner, sessionStorage evidence, journey/syllabus schema/UI, JEV learning grades, `learn-grade.js`, retired handoff route or `RoadmapRecovery.jsx`. Current JEV safety, retained assessment and `/api/learn/tutor/attempts` are different capabilities and remain.

### 5.3 R5 proposal editing and reuse: finish the partial feature

The narrow pending/delivered Edit card entry and explicit Edit roadmap loop in UI.03–05 are current MVP work. Broader existing-card reuse and Add to Chat menus below remain their own R5 subset; do not postpone all editing until that subset is complete. Current source contains `roadmap-proposal-drafts.js`, `roadmap-edit.js`, `roadmap-links.js`, migration0041, `inline-ai-proposal.js` and relevant tests. The production app config enables the edit flag at the audited main. Preserve the five-preview-per-proposal and 30-per-learner-per-UTC-day limits. A receipt addendum removed proposal Add to Chat/context references; existing-card chooser/menu and world-placement integration are unfinished. Do not call the entire feature complete from the backend or recreate removed code without checking its current consumers.

#### R5.01 Preserve draft/Apply and complete the actual proposal author input

**Owner:** State/Tools. **Depends:** R4 immutable proposals/acceptance. **Model:** current `roadmap_proposal`, Sonnet5.5 low/max600; platform-funded. **Files:** server `roadmap/roadmap-proposal-drafts.js`, `roadmap-edit.js`, `roadmap-routes.js`; migration0041 already exists.

- [x] Keep draft rows private and separate from immutable proposal versions. Creating/revising a preview does not consume acceptance or generate a card. Esc/discard changes nothing in the original proposal. **Evidence:** roadmap-proposal-drafts/generate and acceptance/source tests at audited main; accepted edited brief remains the third item.
- [x] Apply commits one canonical immutable proposal version under expected source/plan/proposal guards: `pending` only when checks passed, otherwise `held` with unsafe words hidden and no acceptance. Accept/Cancel/Apply use the first server winner; stale previews cannot replace accepted work. **Evidence:** `roadmap-proposal-drafts.test.js` and the current Apply transaction. This records existing behavior; accepted edit-to-author binding remains open below.
- [ ] Preserve latest applied title/description/format/instruction in the actual author binding, not only displayed proposal text. Ordinary authoring inherits the full-document/no-citation-gate policy; retained edit safety/access/schema checks remain.
- [x] Do not change the current accepted/generating card when editing later work. Revoked/missing source or unsupported format returns a typed limitation before paid generation. **Evidence:** roadmap-proposal-drafts/generate and acceptance/source tests at audited main; accepted edited brief remains the third item.

**Tests/evidence:** extend existing `packages/control-plane/test/roadmap-proposal-drafts.test.js` and `roadmap-generate.test.js`; assert draft zero generation/charge, Apply one version, Esc no write, both action-race orderings and applied text reaching the outgoing request. Record the actual model role only if a model call is exercised.

#### R5.02 Reuse Quick Edit and preserve two separate accepts

**Owner:** UI. **Depends:** R5.01 and UI.04–05. **Files:** `packages/web/src/inline-ai-proposal.js`, existing inline AI overlay, `NextStepPill.jsx::ProposalTools`, `roadmap-controller.js`.

- [x] Ctrl/Cmd+K opens the existing proposal editor with exact proposal context. Cmd/Ctrl+Enter applies the edit preview; it is not paid step acceptance. Tab is owned by the editor until it closes. **Evidence:** inline-ai-proposal/controller tests: opening, preview, Apply, Esc, Tab ownership and race guards.
- [ ] Preserve existing canvas card Quick Edit and hover/context actions without cramping the attached Accept/Cancel pill. The required visible **Edit card** action belongs in the corresponding Chat entry and targets the actual Chat composer; reuse the same edit/version semantics. Do not interpret the compact canvas pill as a prohibition on the required Chat action.
- [x] Handle canonical source/proposal changes, cancellation and another device's acceptance while the preview is open by clearing stale previews and honoring server state. **Evidence:** inline-AI proposal/controller race tests.
- [ ] Preserve authoritative world geometry when an edit is applied to the same visual slot. Current editor race handling does not establish UI.06's private reload/final-save geometry contract.

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
- [x] Bind source/card content identity, current access, roadmap step and proposal version. Recheck eligibility at acceptance. Changed/deleted/inaccessible content requires a corrected offer; it cannot be linked using stale client text. **Evidence:** roadmap-links six backend tests plus existing source-reference/private projection tests; explicit chooser UI remains open.
- [x] Link acceptance makes no provider call, hold or learner debit and works at zero balance. It records coverage/reference, not newly demonstrated understanding. Preserve the card's existing world location and content. **Evidence:** roadmap-links six backend tests plus existing source-reference/private projection tests; explicit chooser UI remains open.
- [x] Keep links/private step associations out of unauthorized shares/forks; another learner cannot infer private evidence or pending plans from a copied card ID. **Evidence:** roadmap-links six backend tests plus existing source-reference/private projection tests; explicit chooser UI remains open.

**Focused current command, root:**

```sh
node --test packages/control-plane/test/roadmap-proposal-drafts.test.js packages/control-plane/test/roadmap-links.test.js packages/web/src/inline-ai-proposal.test.mjs packages/web/src/roadmap-proposal-context.test.mjs packages/web/src/roadmap-controller.test.mjs
```

**Receipt:** exact enabled R5 subset, applied-edit-to-author trace, current menu/chooser/browser proof, zero-price link ledger and flag state. Enabling editing does not require R11 speculation or all format adapters.

### 5.4 R6 automatic next proposals: verify current deterministic work

#### R6.01 Keep durable trigger facts and current settings

**Owner:** State. **Depends:** R4 delivery and R2 settings. **Files:** server `roadmap/roadmap-settings-events.js`, `roadmap-events.js`, `roadmap-auto.js`, migration0040 and current settings writes. **Models:** none for trigger handling.

- [x] Retain monotonic settings/mode/delivery facts and deduplicated durable event insertion. Global Auto-suggest reaches each unfinished actor roadmap; off/on/off and Ask/Tutor/Ask remain distinguishable revisions. **Evidence:** roadmap-auto-events/events/auto-proposal and user-settings tests, including reversed facts, cancellation pause, manual/auto concurrency and zero author calls.
- [x] Re-read canonical mode, setting, explicit pause, source revision, remaining ceiling and unfinished work before composition/reveal. Turning Auto-suggest on does not clear a Cancel pause. **Evidence:** roadmap-auto-events/events/auto-proposal and user-settings tests, including reversed facts, cancellation pause, manual/auto concurrency and zero author calls.
- [x] Preserve independent manual **Propose next step** for metadata only. Concurrent manual/automatic/two-device proposal triggers converge on one current offer and never create paid work. **Evidence:** roadmap-auto-events/events/auto-proposal and user-settings tests, including reversed facts, cancellation pause, manual/auto concurrency and zero author calls.

**Evidence:** existing auto-events/events/settings tests, reverse-order facts, replay and no extra model/debit.

#### R6.02 Compose only metadata, reveal after saved delivery

**Owner:** State/Tools/UI. **Depends:** R6.01 and UI.04/06. **Files:** `roadmap-compose.js`, `roadmap-auto.js`, `roadmap-view.js`, web `roadmap-client.js`, `roadmap-controller.js`, `use-roadmap.js`. **Model:** current composer is deterministic, not `roadmap_proposal`.

- [x] Keep one ready title/description/format offer, not a paid artifact. Do not add an unnecessary model call to match older prose. **Evidence:** roadmap-auto-proposal/auto-events and web roadmap-auto tests. Persistent Chat/offscreen geometry integration remains open in the third item.
- [x] The first offer follows explicit plan acceptance. Later automatic offers follow saved and acknowledged delivery, or the agreed explicit resolution of a failed/cancelled dependency; they do not appear while the current card is still generating/saving. **Evidence:** roadmap-auto-proposal/auto-events and web roadmap-auto tests. Persistent Chat/offscreen geometry integration remains open in the third item.
- [ ] Derive offscreen readiness from the actual persistent slot, not the source's screen visibility. Create one synchronized Chat lifecycle entry for each new step as UI.08 requires. No camera/focus move, duplicate polling messages, repeated upload invitation or inactive suggestion flag pretending the work is done.
- [x] Stop at ceiling/stopping point. Current R6 can remain enabled without R5, R7, R9 or speculative R11. **Evidence:** roadmap-auto-proposal/auto-events and web roadmap-auto tests. Persistent Chat/offscreen geometry integration remains open in the third item.

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

**Browser-local prerequisites and receipts.** Every rung below lists its local fixture additions. Reuse the existing checkout and actual application UI; local test prerequisites do not require a clone, demonstration page or extra preview environment. The separate release launcher retains its existing isolated clone check. The existing `packages/web/e2e/roadmap-command-check.mjs`, `roadmap-mvp-check.mjs` and `roadmap-edit-manual.mjs` document local origins `BASE=http://127.0.0.1:8878` and `SMALL_CP=http://127.0.0.1:8879`, Playwright Chromium, a running app/control-plane, local database/storage, and test-session setup using `TEST_BYPASS_SECRET` from `VARS` or the local control-plane vars file. Do not print that secret. Future harnesses below must implement the same explicit local-only inputs, seed the rung’s data and abort unintended provider requests. Start the existing configured stack; do not invent an unverified launch command. A NEW harness invocation below specifies its required contract, not an existing runnable file. Follow the currently authorized execution scope: these instructions do not themselves run browsers or grant paid-call authority.

For each implemented task record the candidate SHA, actual commands/results, fixture/source hashes, supported versus omitted coverage, state/ledger IDs, requested/served model where applicable, screenshots or traces for the actual changed interaction, failures and recovery. Record “not run” where evidence is absent. Follow REL's existing MVP launcher and its required isolated clone release check. These local test instructions do not require another clone or browser stage. Do not add blanket reviewer ceremony or an all-adapter gate. Security, authorization, immutable grading and money failures in the enabled path must still be fixed. The current ordinary Tutor uses semantic status/actions in the actual Chat entry and original canvas slot, with no Retry / Replace / Omit. Other adapters retain only their separately authorized engine-specific recovery. Do not restore RoadmapStatus/RoadmapRecovery widgets or Tutor action strips.

### 6.2 R7a — Long Markdown indexing and explicit coverage

**Current status:** Existing indexing, summaries, retrieval, coverage and long-plan foundations are implemented, locally tested and enabled in the production app config by `670ecbb5`. Completed items are checked below. The owner permits deferring the remaining source-selection outbox/new-UI/manual qualification extensions; preserve the existing enabled capability and its honest limits. The core index, bounded summary and long-plan loop, coverage UI and migration 0042 exist. The later receipt addendum supersedes its earlier “whole-document planning not built” statement. Source replace/detach atomic outbox integration and real current-UI/model evidence remain unfinished. Current long planning is bounded to 4 model turns, 8 evidence reads, 60,000 evidence characters, a 30,000-character outline and 150 outline units. Current ordinary authors receive the full document within the 40,000-character bound and the step passage for longer files. R7a.04 is the pending author-input extension.

**Browser-local prerequisites:** Enable long Markdown only in the local fixture configuration, load migration 0042, and provide late-section, repeated-heading, headingless and over-limit Markdown fixtures. Extend the actual current ToC and source viewer; the NEW source browser harness must use the common local convention above.

**Rung receipt:** Existing indexed/outlined/read/planned coverage, actual author input size, explicitly unread ranges, changed selection history, a historical citation round trip and platform work counts. Record which original ranges reach the writer, including the current passage-only boundary until R7a.04 qualifies.

### R7a.01 Complete deterministic access-scoped source indices

**Owner:** Tools and State/Money. **Depends:** R4.03 source contract, R4.05–R4.06. **Trace:** v1.3 §§3.8, 4.2, 6.2; M4.20 and indexing portion of M4.6. **Model:** none for extraction/chunking.

**Current seams:** `packages/control-plane/src/roadmap/roadmap-source-index.js` (`buildIndex`, `indexSource`, `coverageOf`, `scopeChoices`), `roadmap-source-reader.js` (`readMarkdownForActor`) and `learn-context-docs.js` (`readUpload`, `contextDocumentBlocks`) already exist. `packages/control-plane/learn-migrations/0042-roadmap-source-index.sql` and `test/roadmap-source-index.test.js` are current. `packages/web/src/FileDocMarkdown.jsx` `MarkdownText` is the existing rendered source. **MODIFY:** these current modules for any uncovered cases; do not create a second indexer or reuse migration 0042 for new schema.

- [x] Extend existing `indexSource(env, access, {sourceKey, sourceRevision}, {readSourceForActor, now})`, returning immutable index identity, outline, chunk descriptors and coverage. Resolve bytes through the authorized source reader; neither a cache key nor a client hash establishes access. **Evidence:** roadmap-source-index/source-reader/source-version tests and current immutable index implementation; no new indexer needed.
- [x] Partition deterministically by headings and bounded text windows, preserving byte/character coordinate convention, heading ancestry, ordinal and original source offsets. Repeated headings receive distinct location identities; split oversized/headingless sections without losing text. **Evidence:** roadmap-source-index/source-reader/source-version tests and current immutable index implementation; no new indexer needed.
- [x] Key derivatives by ownership/scope, source hash, extractor version, chunk/index version and relevant prompt version. Store immutable derivatives in the authorized namespace; D1 records durable state and coverage. **Evidence:** roadmap-source-index/source-reader/source-version tests and current immutable index implementation; no new indexer needed.
- [x] Track total source extent, indexed ranges, omitted/unreadable ranges, origin and stop reason from the first batch. Keep successfully indexed ranges when a later batch fails. **Evidence:** roadmap-source-index/source-reader/source-version tests and current immutable index implementation; no new indexer needed.
- [x] Test identical bytes producing identical chunks, late-section access, repeated headings, huge fenced blocks, Unicode offsets, source replacement and unauthorized cache reads. Do not introduce a vector database or agent framework. **Evidence:** roadmap-source-index/source-reader/source-version tests and current immutable index implementation; no new indexer needed.

**Task evidence:** Save a deterministic manifest with complete range accounting and a negative cross-user lookup; the receipt names implementation limits as configuration, not newly approved spending.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/roadmap-source-index.test.js packages/control-plane/test/roadmap-source-reader.test.js`

**NEW unit tests (create, then run from root):** Extend the current suites above; no new unit filename is required by this task.

### R7a.02 Summarize bounded batches and retrieve original evidence

**Owner:** Tools. **Depends:** R7a.01, R4.06, R4.09. **Trace:** v1.3 §§3.8, 6.1–6.2; M4.1–M4.3 long-source extension, M4.20. **Model:** already-registered `roadmap_index`, Sonnet `claude-sonnet-5-5`, low, platform-funded; deterministic lexical retrieval has no model.

**Current seams:** `packages/control-plane/src/roadmap/roadmap-source-summary.js` exports `summarizeIndex`, `readSummaries`, `makeIndexCallModel`; `roadmap-source-index.js` exports `readSourceEvidence`; `roadmap-source-long.js` exports `prepareLongPlan`, `evidenceLoop`, `withLongCoverage`. `packages/control-plane/src/agents/roadmap-index.js` and `LEARN_TASKS.roadmap_index` already exist. `pdf-pages.js` `selectPages` and `explain-evidence.js` `evidenceRecord` remain reusable precedents. **MODIFY:** current source/tool/policy/coverage seams and existing source retrieval/long tests; no new duplicate agent or role.

- [x] Build a whole-source outline from deterministic headings/ranges before model summaries. For long sources, summarize bounded chunk batches under per-document calls, characters and elapsed-time ceilings; never request an unlimited “whole section.” **Evidence:** roadmap-source-retrieval and roadmap-long tests: original late evidence, bounds, checkpoint/replay, partial failures and unknown-cost reconciliation, using model doubles.
- [x] Reserve each summary call before dispatch, persist its input/version checkpoint, and replay its completed result. Unknown provider outcomes reconcile before retry; exhausted quota returns a partial index with the specific reason. **Evidence:** roadmap-source-retrieval and roadmap-long tests: original late evidence, bounds, checkpoint/replay, partial failures and unknown-cost reconciliation, using model doubles.
- [x] Extend existing `readSourceEvidence(env, access, {indexId, anchor, terms, maxChars}, {readSourceForActor})`: exact anchor and neighbors first, then stable lexical ranking, with output bounded by caller purpose. Return original excerpts plus source locations/coverage, not summaries promoted into evidence. **Evidence:** roadmap-source-retrieval and roadmap-long tests: original late evidence, bounds, checkpoint/replay, partial failures and unknown-cost reconciliation, using model doubles.
- [x] Keep an explicit distinction among outlined, summarized, retrieved and unread content. A plan may use an outline for navigation; source-derived content must use the actual supported source text supplied to its author. Keep the full supported author context separate from reference/highlight metadata; an outline or summary alone is not a read of omitted text. **Evidence:** roadmap-source-retrieval and roadmap-long tests: original late evidence, bounds, checkpoint/replay, partial failures and unknown-cost reconciliation, using model doubles.
- [x] Test anchor/term retrieval of late content, deterministic ties, empty queries, single giant sections, summary failure after earlier success, instruction-like source text and bounded total input. Reject impossible character bounds rather than dropping disclosure. **Evidence:** roadmap-source-retrieval and roadmap-long tests: original late evidence, bounds, checkpoint/replay, partial failures and unknown-cost reconciliation, using model doubles.

**Task evidence:** Attach retrieval traces with selected range IDs, actual character counts and one exhausted-budget result; optional live quality measurement stays inside the release's recorded paid-test authorization.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/roadmap-source-retrieval.test.js packages/control-plane/test/roadmap-long.test.js`

**NEW unit tests (create, then run from root):** Extend the current suites above; no new unit filename is required by this task.

### R7a.03 Invalidate changed indices and expose coverage honestly

**Owner:** State/Money and UI; Verifier signs the adapter receipt. **Depends:** R7a.01–R7a.02, R3 references, R4.09/R4.12. **Trace:** v1.3 §§3.8, 6.2; M4.20, source-change portions of M7.3. **Model:** no additional role; registered `roadmap_index` remains only for allowed bounded summary work.

**Current seams:** `packages/web/src/context-docs.js` (`uploadContextSource`, `toggleContextDoc`, `removeContextDoc`, change event); `packages/control-plane/src/roadmap/roadmap-source-index.js`; current `roadmap-store.js`, `roadmap-events.js`, and `packages/web/src/roadmap-source-coverage.js`. Source-version and coverage unit suites already exist. **NEW remaining integration:** make the authoritative selected-source replacement/detach mutation commit its matching versioned outbox fact, then project coverage into the existing ToC/source controls. **NEW browser test:** `packages/web/e2e/roadmap-source-check.mjs`; it does not exist at baseline.

- [x] Keep uploaded source revisions and derivatives immutable; a new upload/revision does not rewrite delivered historical source references. **Evidence:** roadmap-source-version/source-reference tests.
- [ ] Add the authoritative source-selection replacement/detach mutation plus its atomic versioned outbox fact, with old/new source identities and selection revision. An old notification cannot invalidate a newer selection. Existing read-side revision checks do not implement this missing write integration. **Deferred R7 extension.**
- [x] Invalidate only affected unaccepted proposal/check/index bindings. Preserve historical delivered cards, their immutable references and accepted entitlements; show a changed-source status instead of rewriting history. **Evidence:** roadmap-source-version/retrieval tests cover scoped invalidation, historical refs, disabled flags and bounded R4 fallback; atomic selection-write/outbox remains separate and deferred.
- [x] Retain the existing coverage/scope-choice read model: indexed-through, omitted/unreadable ranges, stop reasons, source version and complete versus partial coverage. Whole-source requests do not silently use a prefix. **Evidence:** roadmap-source-version, retrieval and web roadmap-source-coverage tests.
- [ ] Integrate those coverage/limitation choices into the redesigned Chat/source controls and accepted-only ToC, with explicit narrowing/disclosure before acceptance. Existing read-model tests do not prove that new UI. **Deferred R7 extension.**
- [x] Register the long-Markdown capability only when enabled and checked. If disabled or unavailable, the R4 bounded Markdown path remains available for a supported explicit scope. **Evidence:** roadmap-source-version/retrieval tests cover scoped invalidation, historical refs, disabled flags and bounded R4 fallback; atomic selection-write/outbox remains separate and deferred.
- [x] Verify unauthorized cached reads after revocation, same-version reuse, extractor rebuild, late/headless text and budget exhaustion. **Evidence:** current source reader/index/retrieval/version/coverage tests.
- [ ] Record the remaining updated source-navigation UI/manual R7a receipt, including historical reference round trip and bounded-work accounting. **Deferred:** this does not postpone the bounded Markdown core or disable current R7a.

**Task evidence:** The R7a receipt contains a coverage manifest, historical-reference screenshot and bounded-work accounting.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/roadmap-source-version.test.js packages/web/src/roadmap-source-coverage.test.mjs`

**NEW unit tests (create, then run from root):** Extend the current suites above; no new unit filename is required by this task.

**NEW local browser harness (create first; common prerequisites plus this rung’s fixtures):** `BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node packages/web/e2e/roadmap-source-check.mjs`. Record actual assertions and screenshots; a fixture route proves UI behavior only, not live provider quality.


### R7a.04 Pass supporting Markdown to the card writer

**Owner:** Tools and State/Money. **Depends:** R7a.01–02 and the current accepted-input and quote path in CORE.03/05. **Product contract:** [Long Markdown supporting passages](tutor-roadmap-v1.4.md#long-markdown-supporting-passages-r7a). **Model:** deterministic retrieval followed by the existing single author call. Source seams checked at main `f411c6dee88a0f222ac58df638a41009e56c3867`.

**Current seams:** `packages/control-plane/src/roadmap/roadmap-source-index.js::{indexSource,readSourceEvidence}`, `roadmap-run.js::{stepInput,quoteStepAcceptance,generationHandler}` and `roadmap-generate.js::{authorInput,quoteRoadmapCard,generateRoadmapCard}`. `stepInput` already reads the authorized pinned Markdown for both quoting and dispatch. `authorInput` sends the full Markdown within `ROADMAP_LIMITS.source.chars` and the step passage above it. Extend these seams and the existing accepted-input snapshot.

- [ ] Wire the original-text retrieval into the quoted and dispatched long-Markdown card request. Prove the earlier supporting excerpt reaches the actual writer body while the existing focus, source revision, acceptance and accounting contracts hold.
  - **Select the evidence before quoting.** For an enabled R7a Markdown source above 40,000 characters, use the versioned index for the same authorized file. Query with the approved step goal and points to cover. Honor exact supporting section IDs when the accepted step supplies them, then use the existing lexical ranking. Filter candidates that overlap the focus range before applying the cap. Start with configurable bounds of two original excerpts and 6,000 supporting characters in total, within the actual author input budget. Reuse the already authorized source read within this request where possible. Keep original offsets, source revision and omitted coverage.
  - **Bind the exact request.** In `quoteStepAcceptance`, capture the selected ranges and source revision in the existing acceptance snapshot and hash the body built by `authorInput`. At dispatch, revalidate access and revision and rebuild from the same ranges. Use the same input for quote and authoring. Treat earlier snapshots without the supporting-ranges field as their original passage-only request. An edit of the accepted input uses the existing revised offer and quote. A prepared result, when eligible, must match the same request fingerprint.
  - **Keep the focus separate.** Send the step's passage and the supporting excerpts as separate fields or blocks in the single author request, with the approved brief and Depth. The saved card's primary R3 reference continues to identify the focus passage. Treat all retrieved text as source data. The full-file path for bounded Markdown uses the existing context. Use the supported step passage if optional evidence is missing, and the existing Chat recovery for a known essential gap.

**Local backend verification:** Extend the existing long-source integration and generation fixtures. Use a Markdown file over 40,000 characters with a unique definition or formula near the start and its use near the end. Capture the outgoing writer request and assert exact original text from both ranges, the correct focus anchor and accepted settings, and equality of quoted and dispatched request fingerprints. Verify the excerpt cap, absence of duplicated focus text, bounded full-file behavior, empty optional results, legacy snapshots, and changed or revoked sources. Verify one author dispatch for the accepted card and no provider calls for retrieval. Use test doubles for all provider calls.

0
**Run from repository root after adding the assertions:** `node --test packages/control-plane/test/roadmap-long.test.js packages/control-plane/test/roadmap-source-retrieval.test.js packages/control-plane/test/roadmap-generate.test.js packages/control-plane/test/roadmap-money.test.js`.

**Task evidence:** Record the selected source revision/ranges, actual author input size, focus reference, quoted and sent fingerprints, dispatch count and receipt. Keep this task open until the full acceptance-to-author backend fixture passes.

### 6.3 R7b — PDF text and page references

**Status:** Planned, 0 of 15 checked. R3 already covers selected PDF references and navigation. Keep the Core Tutor MVP and R8a Explanation priority above this release. Use the [R7b learner workflow](tutor-roadmap-v1.4.md#541-r7b--pdf-sources-on-canvas) and the [shared tool-call workflow](tutor-roadmap-v1.4.md#931-shared-tool-call-workflow). This plan checked the relevant source seams at main `f411c6dee88a0f222ac58df638a41009e56c3867`. It records design work separately from the implementation audit checkpoint and acceptance receipts.

**Current starting point.** `packages/web/src/LearnPage.jsx` uses `takePdf`, `placePdf` and `drawPages` with `PdfAddDialog.jsx`. A drop opens the PDF with PDF.js, then `context-doc-pages.js::readPageTexts` reads every page before uploading via `/api/learn/paper`, even for **Separate pages → Page range**. `learn-paper.js::putUploadedPaper` requires that derivative for a large file. `pdf-pages.js` assumes a dense page array and caps the whole derivative at 8 Mi characters. `learn-context-docs.js` already separates storage from some page-text updates. Start by separating storage and placement from extraction on the paper path, then use the same reader for authorized PDFs from Sources.

#### R7b tech stack and Docling API

- **Canvas and control plane.** Keep PDF.js, `PdfAddDialog`, the existing PDF and slide renderers, and the original page reader. The JavaScript control plane owns upload validation, scope, access, job admission, status, storage and tool dispatch. Store immutable bytes and bounded per-page derivatives through the existing `learnMedia(env)` R2 seam. Reuse existing source/index records or object metadata before adding a schema. Any unavoidable production migration or new infrastructure follows the owner's approval boundary.
- **Extraction.** Use a private Linux Docker worker with CPython 3.12, the Docling standard PDF pipeline and CPU-only inference. Start local qualification with `docling[rapidocr]==2.148.0`, CPU PyTorch, RapidOCR with ONNX Runtime, and Pillow for bounded PNG crops. Lock the resolved dependencies and model artifact revisions. Stage the approved PDF bytes from Learn storage to a bounded temporary file for the job. Use an authenticated internal job interface, a per-job timeout and isolated temporary storage. Reuse the existing worker hosting and job conventions where they fit. Validate the intended host and resource footprint before release.
- **Models and profiles.** Prefetch the layout, table, and supported OCR language artifacts into `/opt/docling-models` in the image build using `docling-tools models download --output-dir /opt/docling-models` and the pinned CLI's language options. Record artifact and license versions. Run with local `artifacts_path` and `enable_remote_services=False`. Reuse warm converters per profile. Start with native text, accurate table structure, and figure crops. For an image region with no usable text, run a bounded local OCR pass on the needed page. Configure the OCR language from reliable context. Check the supported language before dispatch and retain coverage when an unsupported language needs a readable source. A full-page OCR retry is reserved for a requested page without usable native text. Preserve the native text and mark the OCR regions separately.
- **Code and visuals.** Keep source line breaks and indentation in code blocks. Docling's optional `do_code_enrichment` is code-aware transcription. Qualify it on the specific pages that need it with local models before enabling it, and keep that output separate from reliable native text. Iterate `result.document.iterate_items()` in reading order, preserve table cells and structure, and use `item.prov` for the original `page_no` and `bbox`. Use `PictureItem.get_image(result.document)` with `generate_picture_images=True` for a real figure crop. Preserve captions as their own evidence. Adapt page size, origin and rotation to the current R3 viewer coordinates and test the conversion. Use a page-only link for geometry that has not qualified. R15 retains the broader image, note and dedicated vision-extraction scope.

Example worker setup and one inclusive page-range job. Validate and resolve the path and range in the job adapter before calling Docling.

```python
from pathlib import Path

from docling.datamodel.accelerator_options import AcceleratorDevice, AcceleratorOptions
from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import (
    PdfPipelineOptions, RapidOcrOptions, TableFormerMode, TableStructureOptions,
)
from docling.document_converter import DocumentConverter, PdfFormatOption


def build_converter(*, ocr: bool, language: str = "iso:en") -> DocumentConverter:
    options = PdfPipelineOptions(
        artifacts_path=Path("/opt/docling-models"),
        accelerator_options=AcceleratorOptions(device=AcceleratorDevice.CPU, num_threads=2),
        enable_remote_services=False,
        document_timeout=60.0,
        do_ocr=ocr,
        do_table_structure=True,
        table_structure_options=TableStructureOptions(mode=TableFormerMode.ACCURATE),
        generate_picture_images=True,
        images_scale=1.5,
    )
    if ocr:
        options.ocr_options = RapidOcrOptions(
            backend="onnxruntime", lang=[language], force_full_page_ocr=False,
        )
    return DocumentConverter(
        allowed_formats=[InputFormat.PDF],
        format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=options)},
    )


native_converter = build_converter(ocr=False)
result = native_converter.convert(
    Path(staged_pdf), page_range=(312, 316),
    max_num_pages=2000, max_file_size=25 * 1024 * 1024, raises_on_error=False,
)
```

In the worker, `staged_pdf` is the job's private local file. Construct the converter once per process/profile. The range uses 1-based PDF page positions and includes both endpoints. Pass each contiguous batch to the original PDF. Check the result status, errors, actual `page_no` set and per-region output, including on success. Preserve valid pages from a partial result and record any missing requested page. The control plane owns retries and records them against the same source and work identity.

Official implementation references checked for this plan.

- https://pypi.org/project/docling/2.148.0/
- https://docling-project.github.io/docling/reference/document_converter/
- https://github.com/docling-project/docling/blob/v2.148.0/docling/pipeline/base_pipeline.py
- https://docling-project.github.io/docling/reference/pipeline_options/
- https://docling-project.github.io/docling/usage/advanced_options/
- https://docling-project.github.io/docling/usage/enrichments/
- https://docling-project.github.io/docling/_generated/examples/export_figures/

#### R7b bounds, page records and tool contract

| Policy | Initial qualification setting |
| --- | --- |
| PDF acceptance | Keep the current **25 MiB / 2,000 physical pages** bounds in `pdf-pages.js`. Persist page count even when coverage is empty. Verify the actual count in the trusted PDF worker before extraction. A page count from the browser is a hint until verified. Keep the existing whole-PDF model eligibility checks for legacy callers. Unknown or excessive page count keeps new binary-first uploads out of the whole-PDF model path. |
| Batch and request limits | Start with at most **8 contiguous pages per worker batch** and **8 pages per `read_pdf_pages` call**. Run separate batches for a larger scope. Use one in-flight parse per worker process, two CPU threads, a **60 s** conversion deadline and a **90 s** job deadline. Apply current per-request, learner and platform work admission in addition to these ceilings. |
| Evidence limits | Start with existing **20,000 characters per page** and **32,000 characters per evidence response** as ceilings, with the actual model budget also enforced. Start with up to **2 figure crops per read**, bounded by existing `pdf-excerpts.js::CROP_LIMITS` and the caller's image input budget. State omitted pages, blocks and crops when a bound cuts evidence. |

These are configurable server policy defaults for local qualification. Record cold and warm latency, peak RSS and throughput with the real fixtures before setting release capacity. Measure worker runtime separately from upload, placement and the user-facing wait. Persist sparse page records in bounded chunks, allowing upload and a late-page read independently of the legacy dense browser index limit. Use an owner-scoped identity over original PDF hash, extraction revision and original page. The extraction revision includes the pinned parser, model artifacts and profile policy. Atomically claim each missing page under that identity, group adjacent claimed pages into one batch, and reuse in-flight work for overlaps. Commit page data before advancing coverage, and resume unfinished pages after a reload or retry.

Each page record has original page number, optional printed label, bounds, ordered blocks with local offsets or region IDs, extraction provenance, and explicit coverage. Distinguish `unprocessed`, `pending`, `ready`, `partial`, `blank`, `unreadable` and `failed`. A blank page is distinct from an image-only page or a corrupt parse. A figure can be ready while its text is unavailable. Keep existing validated `.pages` derivatives usable as `browser_pdfjs_text`; identify new native/OCR output separately. Changed bytes or extractor configuration create a new revision. Historical results retain their existing authorized links.

Register a single read-only `read_pdf_pages({ sourceId, fromPage, toPage })` schema with three required fields and closed arguments. `sourceId` identifies an attached PDF supplied by the server. Validate inclusive integer positions with `1 <= fromPage <= toPage <= verifiedPageCount`. Resolve access, pinned version, allowed teaching scope and limits from the trusted caller before dispatch. Use `roadmap-tools.js::{capabilityCatalogue,resolveToolCall,runRoadmapTool}` and the qualified `chat-tools.js`/answer-loop seams. Explicit page scopes can call the same authorized reader from the application. Reuse available excerpts before offering a model call. If the caller needs topical retrieval, use the existing index to choose candidate pages before this reader. Expose the tool only to eligible turns with attached PDF access, including `Ask`, `Auto`, `Tutor`, the roadmap and qualified command briefs. Treat instructions and code inside the PDF as source content. Tools run only on validated caller intent and authorized inputs.

Return the shared tool status with the pinned `sourceId`, source and extractor revisions, requested/returned/omitted page ranges, page or block evidence, stable figure references, and per-page coverage. Use `ok` for a satisfied read and `partial` with a typed reason such as `pdf_pages_pending` or `pdf_pages_unreadable` when admitted work or coverage is incomplete. Map invalid, changed, forbidden and unavailable calls to the existing typed outcomes. Return usable scoped blocks and pending status once; resume through existing status/progress handling. Cap the loop through the shared policy. Keep private PDF bytes, paths and content within the authorized document path. R8a handles independent public gaps and retains its query privacy and fetch rules.

### R7b.01 Store PDFs first and produce versioned page coverage with Docling

**Owner:** Tools and State/Money. **Depends:** R7a index/coverage contract, R3 page navigation. **Trace:** v1.3 §3.8; M4.20 PDF portion, D5/D42. **Model:** local Docling models only for extraction.

**Current seams:** `packages/control-plane/src/learn-paper.js::{putUploadedPaper,readUploadedPaper,uploadedPaperAsDocument}`, `learn-context-docs.js`, `pdf-pages.js::{readPageTexts,putPageTexts,readPageMeta,readPages,pdfStatus}`, `pdf-excerpts.js::{readSource,sourceHash}`. **New work:** `packages/pdf-worker/` for the private Python worker and CPU fixtures. Put the control-plane adapter in `packages/control-plane/src/roadmap/roadmap-source-pdf.js` and share the reader with current callers.

- [ ] Accept authorized PDF bytes and metadata before page parsing through the existing upload/reader paths. Persist verified original count and PDF hash. For uploaded papers and Sources PDFs, use the current ownership/home-canvas rules and guard the legacy whole-file reader while extraction is pending.
- [ ] Package the pinned CPU Docling worker and warm converter profiles. Process only the explicit ranges admitted for the source. Normalize blocks and figure crops, attach page provenance and origin, and enforce the local OCR, time, output and figure bounds above.
- [ ] Store validated sparse derivatives and coverage by immutable source and extractor revisions. Record legacy browser origins, partial and missing pages, unsupported OCR, empty and corrupted pages, and page cuts. Keep readable pages usable through a partial failure.
- [ ] Make worker admission, page commits, retry and index resume idempotent. Reuse cached pages for overlapping work. Recheck access and source revision before commit and readback. Bind existing delivered references to their original input; preserve saved PDFs and legacy derivative compatibility.
- [ ] Test ownership and malformed inputs, a small file with 400 physical pages, single first/last page and inclusive 312–316, mixed native/OCR content, indented code, tables and a figure, partial results and retry. Assert only requested pages enter extraction, the original bytes were stored before it, and original page identities survive. Verify a limit or worker failure retains the viewable PDF and existing saved cards.

**Task evidence:** Keep the mapping from PDF hash to extraction/profile revision, requested and completed page traces and per-page coverage. Run the planned CPU worker suite with `python -m pytest -q packages/pdf-worker/tests` from the pinned worker environment. Include cold/warm time to the first requested page set, peak RSS and artifact counts.

### R7b.02 Retrieve bounded evidence before roadmap and card work

**Owner:** Tools and Lead. **Depends:** R7b.01, R7a.02 and the shared registry/dispatch contract. **Trace:** v1.3 §§3.8, 6.2; M4.20 and R3. **Model:** deterministic reads and ranking. Reuse `roadmap_index` only for approved optional bounded summaries.

**Current seams:** `pdf-pages.js::{namedPages,selectPages,pagesDocument}`, `packages/control-plane/src/roadmap/{roadmap-source.js,roadmap-source-read.js,roadmap-source-reader.js,roadmap-tools.js}`, `learn-ask-context.js`, `chat-tools.js`, and `explain-evidence.js`. Resolve existing `paper_context`/`page_context` and `doc:` context refs to the same authorized stored PDF and original page. Extend current source resolution, evidence and command brief paths. Add `packages/control-plane/test/roadmap-source-pdf.test.js` and `roadmap-pdf-tool.test.js` alongside current tests.

- [ ] Register and validate `read_pdf_pages` in the shared catalogue and expose it through the qualified consumers. Resolve and pin the source once at the trusted boundary. Verify schema gating, closed arguments, current authorization, eligible range and work admission before dispatch. Return typed coverage to the same turn.
- [ ] Implement the same `readSourceEvidence` response for PDFs with versioned source, relevant original excerpts, page and local offsets/regions, returned and omitted coverage, and image refs. Prioritize an explicit authorized page/range, then active page and allowed neighbors, then deterministic relevance. Keep duplicate headers addressable by page. Preserve actual page order and any supplemental printed label.
- [ ] Before **Roadmap Draft**, resolve the exact chosen scope. Read the selected range first. For **Full content**, reuse a verified PDF outline when available and populate page-derived headings and coverage in resumable batches across that scope. Qualify the whole-source plan against that coverage and supporting originals. Route incomplete essential scope to progress or a disclosed narrower draft/revision through Chat.
- [ ] Reuse the pinned excerpt/crop evidence before each step and command offer, and for direct questions in Ask, Auto and Tutor. Bind it to the reviewed version for acceptance and generation. Summaries guide retrieval; use original retrieved blocks for claims. Hydrate the authorized figure crop only when needed through a supported image input, otherwise describe the coverage. Separate PDF reading from R8a public evidence and retain normal safety and output checks.
- [ ] Run late-page, multi-range over-budget, empty, cut, duplicate-header, rotated crop and changed-version fixtures. Test Ask, Auto, Tutor, roadmap draft, roadmap step and eligible slash briefs with doubles, a disabled or unauthorized source, one cached read across calls, and `partial` without a duplicate job. Round-trip returned pages and verified regions through the existing reader.

**Task evidence:** Record call inputs, eligibility, exact pages read and omitted, the evidence actually sent to the planner/writer, and page or figure anchors reopening the original. A whole-document outline is navigation evidence until the corresponding blocks have been read.

### R7b.03 Preserve both Canvas layouts and qualify the learner flow

**Owner:** UI, State/Money and Verifier. **Depends:** R7b.01–R7b.02 and the complete R4 flow. **Trace:** v1.3 §3.8, D5/M4.20. **Model:** existing approved generation path.

**Current seams:** `packages/web/src/PdfAddDialog.jsx`, `LearnPage.jsx::{takePdf,placePdf,drawPages}`, `pdf-source.js`, `context-docs.js::retryContextDoc`, existing PDF card/page renderer and `SourceReader`, `RoadmapPlan.jsx`, the accepted `TableOfContents` and R3 source controls. Lead owns `LearnPage.jsx` integration. Add `packages/web/src/roadmap-pdf-coverage.test.mjs` for the state/placement contract.

- [ ] Exercise the existing dialog for a dropped PDF and one already in Sources. **PDF card** creates one compact card after storage. **Separate pages → Page range** draws just the chosen images, and **All pages** follows the existing drawing path with progress. Preserve the original PDF identity, original numbering, one undoable insert, and cancellation/retry. An unaccepted import leaves no new Canvas cards or extraction work.
- [ ] Use the existing Chat scope/roadmap controls for one page, a range, or **Full content**. Show progress and available/omitted page ranges. Preserve the learner's instruction through retry or narrower scope. For **Just keep it here**, keep the saved source usable and wait for a later request before starting lesson preparation.
- [ ] Surface page ranges in the reviewed draft and accepted ToC steps. Reuse existing source navigation and PDF reader. Place one stable generated slot by the matching page card when available, the compact PDF card otherwise, or the ordinary fallback when the source is only in Sources. Preserve stable coordinates across reader scrolling, page changes and reload. Open the original page, with a verified crop highlight where supported.
- [ ] Gate PDF planning and the registry read independently of R7a and historical R3 links. Exercise feature-off, upload versus existing source, reload, mixed coverage, retry, changed bytes and revoked/shared access. Keep readable sections usable, and use existing Chat recovery for an essential missing page. Prove the large and late-page scopes do not fall back to an unrelated first-page context.
- [ ] Verify local extraction/indexing work uses platform admission, with zero learner debit and zero external extraction/vision provider calls. Verify any existing image-capable writer sees only the approved bounded crop when needed. Keep the accepted card charge, reconciliation and saved result under R4. Record focused local backend results and build before release qualification or owner manual production checking.

**Verification order.** First run the real local CPU worker fixture suite. Then run the existing regressions and the new Node suites from the repository root. Record results separately for worker behavior, mocked callers, release verification and owner acceptance.

```bash
node --test packages/control-plane/test/pdf-pages.test.js packages/control-plane/test/pdf-excerpts.test.js packages/control-plane/test/source-refs.test.js packages/control-plane/test/roadmap-source.test.js packages/control-plane/test/roadmap-tools.test.js packages/control-plane/test/chat-tools.test.js packages/control-plane/test/roadmap-money.test.js packages/web/src/context-doc-pages.test.mjs packages/web/src/pdf-anchor.test.mjs
node --test packages/control-plane/test/roadmap-source-pdf.test.js packages/control-plane/test/roadmap-pdf-tool.test.js packages/web/src/roadmap-pdf-coverage.test.mjs
```

Use the existing browser verification boundary. The proposed `packages/web/e2e/roadmap-pdf-check.mjs` is an optional authorized browser qualification after the local backend pass. Attach page coverage, source jumps, scope transitions, route traces and accounting to an independent R7b receipt. The approved release process and required clone verification remain in §8.

### 6.4 R8a — Scoped web discovery and fetched evidence

**Current status:** NEW shared web evidence capability and proposed `roadmap_research` role. The current `research_gap` capability is disabled. Reuse the existing Exa discovery and guarded fetch paths. Qualify replies in Ask, Auto and Tutor, roadmap drafts and accepted steps, and eligible standalone card briefs under [roadmap §10.2](tutor-roadmap-v1.4.md#102-research-and-calculation).

Complete the three R8a checkpoints in order.

1. **R8a.01–R8a.02** qualify the Exa evidence operation using the existing discovery and page-fetch seams.
2. **R8a.02a** qualifies Exa through the [shared tool-call workflow](tutor-roadmap-v1.4.md#931-shared-tool-call-workflow) with local fixtures.
3. **R8a.03** qualifies and enables the supported callers and source controls. Start with a written Explanation for an accepted Explain on Canvas step, then qualify draft lookup, Chat replies and standalone briefs.

**Local verification prerequisites:** Run focused Node/backend tests first with stubbed Exa and page reads and blocked unintended egress. Use public-gap, private-query refusal, redirect and outage fixtures. Use the UI harness for the corresponding source controls. A separately authorized live sample may use the configured service key without printing it.

**Rung receipt:** Redacted queries, named gap/scope, attempted and refused egress, fetched original evidence and its actual coverage, request/latency/platform-cost totals. No learner debit or required browser-card purchase.

### R8a.01 Validate public-gap queries and reserve work before egress

**Owner:** Tools and State/Money; Lead owns registry/transport seams. **Depends:** Existing server-side dispatcher and shared platform quotas/operation identities. Roadmap callers use R4.03 and R4.06. **Trace:** v1.3 §§3.9, 5.1, 6.3; M4.21/M4.23, D14/D40. **Model:** proposed `roadmap_research`, Sonnet `claude-sonnet-5-5`, low, platform-funded query formation.

**Current seams:** `packages/control-plane/src/learn-search.js` `discoverSources`; `exaSearch`; `packages/control-plane/src/learn-paid-transport.js` `admitTool` currently generates an operation ID internally. **NEW work:** create `packages/control-plane/src/roadmap/roadmap-research.js`, `packages/control-plane/src/agents/roadmap-research.js`, `test/roadmap-research-privacy.test.js`; narrowly extend the paid-tool identity seam with Lead.

- [ ] Define `researchGap(env,access,{scopeRef,gapId,publicConcept})` once for eligible Chat replies, roadmap drafts, accepted steps and standalone card briefs. Resolve the authoritative caller, actor, canvas, source access and output version on the server. Bind a draft to the explicit lesson request and requested scope before drafting. Bind a step to its accepted scope. Bind a standalone brief or reply to its resolved request and authorized context. Require an enabled capability and a named fact that matters to that output.
- [ ] Form a general public query, then validate outgoing text against private excerpts, names, identifiers and secret-like material before any network request. If a safe query cannot be formed, return `needs_clarification`; do not substitute raw learner source text.
- [ ] Check the authorized source and applicable fresh evidence first. Apply source-only instructions and keep zero egress when the evidence already covers the output. Honor an authorized request for a fresh check within budget. Reuse eligible evidence across draft and step boundaries and stop when the needed facts have direct support.
- [ ] Define and load the versioned server-side `research` parameters in `roadmap-policy.js` using the [R8a policy table in roadmap §10.2.1](tutor-roadmap-v1.4.md#1021-exa-research-tool). Validate units, supported ranges and the approved caller, policy version and pilot allocation before enabling live research. Use the effective parameters in preflight and dispatch. Apply a new approved version to later admissions using the same durable usage counters and reservations.
- [ ] Reserve paid research work across every applicable cap before query formation or outbound search. Use `maxCandidatesPerSearch` for the quoted discovery request, track `maxPageReadsPerPass` across the entire pass, and bound each outbound timeout by the remaining `passTimeoutMs`. Apply `usageWindowSeconds` to the learner and R8a platform window counters. Reuse `admitTool`, the existing spend ledger and the platform-wide `USAGE_PLATFORM_DAY_USD` guard. Check the actual Exa `auto` request quote against the current price registry and approved account terms. Include optional paid research model work in the same R8a budget and keep ordinary card generation on its own authorization. Settle provider-reported cost, release confirmed unused reservations, and retain unknown reservations until reconciliation.

- [ ] Thread a trusted server-only stable operation identity into the actual Exa admission path, with stage checkpoint and reconciliation. The current `admitTool` signature does not already provide this; reject caller-supplied arbitrary ledger IDs.
- [ ] Test rejected sensitive query causing zero requests, concurrent quota exhaustion, disabled flag, missing key, replay after timeout and unknown search cost. No learner charge is created. Test all four scope kinds, cross-learner or stale scope refusal, source-only requests and sufficient evidence with zero Exa calls. Use local fixtures to exhaust each pass, lesson, learner, daily and pilot limit. Race two requests at a shared remaining cap. Verify revisions, reloads and release redeploys preserve the applicable counters, late operations respect the remaining pass deadline, and each refused call has zero outbound requests and zero learner research debit. Run two approved policy versions against the same usage. Lower a limit after a counted call, verify the next admission observes the new limit, and confirm existing reservations reconcile under their original identities.

**Task evidence:** Capture redacted egress fixtures, reservation rows and request counts, including an unknown outcome that does not blindly dispatch again.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/learn-search.test.js`

**NEW unit tests (create, then run from root):** `node --test packages/control-plane/test/roadmap-research-privacy.test.js`

### R8a.02 Fetch candidates through existing guards and retain provenance

**Owner:** Tools. **Depends:** R8a.01 plus shared source access and safety. Roadmap callers use the R4 source integrity and delivery boundary. **Trace:** v1.3 §§3.9, 6.3; M4.21. **Model:** none for discovery/fetch plumbing; the bounded research role may select candidates but cannot certify unread content.

**Current seams:** `packages/control-plane/src/explain-fetch.js` `evidenceFetcher` enforces URL/redirect checks, size/time/type limits and no credentials; `packages/control-plane/src/explain-evidence.js` `evidenceRecord`, `untrustedBlock`; `packages/control-plane/src/learn-search.js` returns candidates with `read:false`. **NEW work:** extend `roadmap-research.js`; create `test/roadmap-research-evidence.test.js`.

- [ ] Search a bounded number of candidates, select relevant primary pages, then actually fetch them. Search titles/snippets and model-authored citations are never evidence records.
- [ ] Preserve final URL, title, retrieval time, applicable date or version, hash of bytes read, original excerpt, discovery origin, access class and limitations. Distinguish partial body from complete-page reading.
- [ ] Reuse public-network/DNS and every-redirect validation. No credential forwarding, paywall bypass, local network access or arbitrary download path is added by the Tutor wrapper.
- [ ] Route fetched public PDF candidates through the guarded R8a fetch path and a qualified document adapter. Return the unsupported limitation when that adapter is unavailable. Keep HTML research independent of R7b. The R7b registry reader is scoped to authorized attached PDFs.
- [ ] Treat fetched instructions as untrusted source data. Page access failure, scripted empty body, content-type refusal, provider timeout and conflicting sources produce typed limitations or clarification, not fabricated answers.
- [ ] Test malicious redirects, paywall response, oversized/truncated text, unsupported PDF, duplicate candidate and contradictory evidence. Supply retained excerpts with the caller's authorized context to the planner, reply writer or approved card author. Keep the cited references and coverage separately. Do not introduce a blocking LLM citation pass for ordinary Markdown text/table.

**Task evidence:** Keep request/evidence pairs showing every cited page was fetched and each refused page remained unavailable.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/explain-evidence.test.js packages/control-plane/test/learn-search.test.js packages/control-plane/test/explain-fetch.test.js`

**NEW unit tests (create, then run from root):** `node --test packages/control-plane/test/roadmap-research-evidence.test.js`

### R8a.02a Wire the shared tool-call workflow

**Owner:** Lead, Tools, State/Money and Verifier. **Depends:** R8a.01–R8a.02 and the existing dispatcher and usage seams. Use the [shared tool-call workflow](tutor-roadmap-v1.4.md#931-shared-tool-call-workflow) as the common reference.

**Current seams:** `packages/control-plane/src/roadmap/roadmap-tools.js` for `capabilityCatalogue`, `resolveToolCall` and typed argument validation. Use the existing `learn-research.js` result loop for eligible Chat callers and the current planner and command brief paths for their own scopes. Reuse `roadmap-policy.js` for configured bounds and the shared platform admission and reconciliation in R8a.01.

- [ ] Register the read-only `research_gap` name, schema, scope, readiness and result contract in the existing catalogue. Filter offered schemas by the authorized caller and known readiness. Qualify the dispatcher with fixtures before enabling learner-facing callers.
- [ ] Preflight known requirements, source access, capability readiness and remaining owner-configured limits before exposing eligible tool schemas. When the resolved request needs learner input, ask for the known required details together. Send known unavailable cases through the existing supported reply or alternative path.
- [ ] At dispatch validate the exact tool name and arguments, current access and scope, and remaining limits. Route Exa through its trusted platform research admission and preserve the existing paid-command acceptance boundary. Bind each provider operation to one reservation and reconciliation identity. Keep research accounting separate from learner generation authorization.
- [ ] Return the typed result or refusal to the same request and refresh eligibility and remaining limits. Reuse the evidence for the requested output. A follow-up tool must serve an essential remaining gap within the same budget. Reconcile unknown outcomes before an eligible retry.
- [ ] Run focused local fixtures for a supported output with zero calls, grouped missing inputs, an omitted disabled schema, refused name or arguments, scope loss, a reservation race, a typed result feeding the same request and a follow-up blocked at the budget. Assert no outbound call on preflight or admission refusal and no duplicate provider operation on replay.

**Task evidence:** Record the offered schemas, refusal or admitted operation, budget and result handoff for the fixture runs. Use `node --test packages/control-plane/test/roadmap-tools.test.js packages/control-plane/test/roadmap-research-tool.test.js` from the root after adding the planned research tool test.

### R8a.03 Integrate research as an independent bounded tool release

**Owner:** Tools, UI and Verifier. **Depends:** R8a.02a. Use R4.03/R4.09 for roadmap callers and the existing answer or command handler for the other callers. **Trace:** v1.3 §§3.9, 6.1–6.3; M4.21 and new-tool M4.23 checks. **Model:** proposed `roadmap_research`, Sonnet `claude-sonnet-5-5`, low; ordinary Markdown text/table uses its one author call with supported source context and accepted brief; no additional citation checker/escalation. Follow the [Ask, Auto and Tutor workflow](ask-auto-tutor-workflow.md) and [Explain on Canvas workflow](explain-on-canvas-workflow.md) for the caller checkpoints.

**Current seams:** `packages/control-plane/src/explain-evidence.js` `learnerCitation` is the citation-label seam; `packages/control-plane/src/learn-models.js` central task registry. Use the authorized Chat tool seam in `learn-research.js` and the current command brief/review path. `packages/web/src/Md.jsx` provides the existing neutral Sources disclosure pattern. **NEW work:** connect qualified callers to the R8a.02a registry path and expose source/evidence UI. Extend `test/roadmap-research-tool.test.js` and create `e2e/roadmap-research-check.mjs`.

- [ ] Return the shared typed statuses `ok/partial/needs_clarification/unsupported/unavailable` with bounded evidence and coverage. Retain the named gap and source/policy version in the tool result.
**First caller after Core Tutor.** Use the ordinary written Explanation adapter for an accepted roadmap step. Run the research fixtures with Exa and page reads stubbed, then exercise the local R4 offer, acceptance, author request, save and acknowledgement path in §8.0. Use the CORE.09 Explanation renderer and the R8a source controls for the visible result.

- [ ] For a supported Markdown step, prove the same accepted Explanation path with zero Exa calls with R8a on and off. Assert that the author receives the approved step, Depth and full supported pinned Markdown, and that the saved card follows the ordinary one-author and settlement rules.
- [ ] For a step with one needed public fact, exercise the shared tool preflight and admission with stubbed search and page evidence. Bind only applicable passages and citation IDs to the exact offer, verify one approved author dispatch with that evidence and pinned Markdown, then save and acknowledge one card in the same slot. Assert zero learner research debit and one applicable generation charge. Verify the saved card's **Sources** popover and per-source **Copy link** after reload.
- [ ] For an unresolved essential gap, cover a blocked query or unavailable evidence. Assert zero author calls and zero learner debit while the gap blocks acceptance. Use the existing supported reply or focused clarification. Qualify this caller separately from roadmap-draft, Chat and standalone integration.

- [ ] Feed selected excerpts and citation IDs into qualified replies, roadmap drafts, accepted step briefs and standalone command reviews. Bind evidence to the exact output version and carry it into approved authoring. Enforce deterministic access, version, schema and citation-ID checks and existing contextual safety. Ordinary Explanation retains the one author call and existing publication checks. If research is unavailable, continue with source-supported work or clarify an essential gap.
- [ ] Reuse the closed **Sources (n)** disclosure in Chat replies, researched **Roadmap Draft** entries and command review when sources were used. On saved cards, reuse the existing hover/focus action area and anchored popover for the **Sources** icon, with touch access and a **Copy link** button for each cited page. Deduplicate final URLs and apply the configurable five-link cap per output version. Store the cited evidence with its reply, draft or card and verify access and persistence on reload.
- [ ] Keep browser/source-card creation optional and separate: completing research never buys or requires a browser card.
- [ ] Register `ROADMAP_WEB_RESEARCH` only with the verified adapter, the owner-recorded policy version and effective parameter values, pilot allocation, eligible caller and relevant release receipt. Flag-off, permission loss and revision changes stop new tool work without deleting delivered citations. Record per-pass, rolling-day and cumulative pilot reservations and settled costs separately from learner generation.
- [ ] Smoke an undefined public concept, refused private query and provider outage in the current UI. Assert no hidden query continuation beyond the bounded reformulation policy and no learner debit for research. In local fixtures verify a scoped draft lookup before approval, reuse in a later step, standalone and Chat callers, version-bound citations, deduplication and the link cap. Assert research creates zero learner debits and required external claims trace to a page actually read.

**Task evidence:** Record requested/served model, exact calls, latency, platform cost and citation trace for authorized live samples; record R8a independently of calculation and additional formats.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/roadmap-tools.test.js`

**R8a integration tests (extend the R8a.02a fixture file, then run from root):** `node --test packages/control-plane/test/roadmap-research-tool.test.js`

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
- [ ] Deliver an event for terminal evidence availability with outcome/validity, not an invented success for failed/unavailable grading. The R10 assessed-practice extension reads canonical evidence rather than trusting model-written notification payloads.
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
- [ ] Keep thumbs visible as self-reports, distinct from assessed observations. Already understood is an R10 control and becomes available when the R10 explanations-only coverage action is qualified. Store it separately from assessed observations. Accepting/viewing flashcards or a quiz produces no demonstrated-mastery count.
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

**Current status:** Minimal explicit Edit roadmap of future unaccepted work is required now by UI.03; it is not deferred to this rung. This rung adds NEW evidence-triggered adaptation and expanded multi-source revisions; `roadmap_adapt` is not registered. Current plan revision/lifecycle and R5 immutable version machinery are extension points. `roadmap_revise` already exists. Preserve explicit learner intent and the earliest unaccepted boundary; accepted and delivered work is immutable.

**Delivery order**

1. **Explanations only first.** After Core Tutor, qualify R10.01–R10.03 for learner instructions, private thumbs feedback and delivered context with R9 disabled. Reuse the same bound Chat, checked offer and card slot. Keep every new card behind the usual approval. Use the existing qualified explanation and table formats.
2. **Assessed practice after R9.** Once R9.01–R9.05 qualify real practice and private assessed evidence, add the R9.03 event and version-bound evidence reader to the same R10 decisions and guards. Keep the two receipts separate. R10.04 expanded revisions have their own dependencies and receipt.

**Verification prerequisites:** Run deterministic local Node/backend fixtures first with R9 disabled and no private goal, attempt or assessed-evidence rows. Cover a bound Chat instruction, thumbs, a paused/Ask roadmap, an adjustable estimate and concurrent acceptance. Exercise the existing Chat, NextStepPill and learner-invoked Rabbit Hole navigation with the R10 UI harness. Add wrong, conflicting and missing assessed evidence fixtures when R9 qualifies.

**Rung receipts:** The explanations-only trace shows the signal provenance, one applicable successor, a focused question, Already understood as self-report, explicit Go deeper/return, an acceptance race, unchanged delivered cards and no unsolicited resumption after Cancel. The later assessed-practice trace shows canonical evidence fingerprints and applicability across versions, absent or conflicting evidence, and replay/late-result protection.

### R10.01 Define bounded adaptation decisions from distinct evidence types

**Owner:** Tools. **Depends:** Core Tutor's accepted roadmap and Chat binding, R1 feedback and R5 version contract for the explanations-only slice. The assessed input additionally depends on qualified R9 evidence. **Trace:** v1.3 §§3.11, 6.2; M10.1. **Model:** proposed `roadmap_adapt`, Opus `claude-opus-5-5`, no fallback, platform-funded; no new assessment role.

**Current seams:** `packages/control-plane/src/learn-attempt-store.js` `goalEvidence`; `packages/web/src/learn-coaching-contract.js` `applicable` filters completed/valid criterion-version evidence; `packages/control-plane/src/learn-progress.js` private read model. **NEW work:** create `packages/control-plane/src/agents/roadmap-adapt.js`, `test/roadmap-adapt.test.js`, `tests/evals/roadmap/adapt-cases.mjs`; extend current roadmap decision validator.

- [ ] Define a small output union: `none`, `revise_unaccepted`, `insert_prerequisite`, `ask`, or `adjust_coverage`, with target IDs, bounded reason and evidence references. The output proposes a transition; it never writes observations or authorizes generation.
- [ ] For explanations-only, build inputs from explicit learner instructions, private self-reports and relevant prior delivered content in separate fields. Bind them to the current roadmap, card and source versions. Leave the offer as it is for an absent or irrelevant signal. Ask one focused question when a relevant signal leaves the learner's intent unclear.
- [ ] After R9 qualifies, add applicable assessed evidence as a separate input with criterion, activity and source versions, assistance, and unresolved or conflicting evidence. Keep it independent from learner instructions and self-reports.
- [ ] Make cancellation, acceptance, card viewing and unanswered practice neutral about mastery. Already understood may change coverage by learner instruction but cannot become a successful quiz/rubric observation.
- [ ] Write explanations-only evaluation cases before tuning. Cover a Chat correction, thumbs without a stated cause, an irrelevant card, an already-understood declaration, a missing prerequisite, and uncertainty requiring one question.
- [ ] Add practice-enabled cases for conflicting thumbs and quiz evidence, wrong answers with several plausible causes, and unavailable or stale assessment.
- [ ] Bound calls/candidates and compare decisions with a recorded rubric: relevance, proportionate change, evidence fidelity, preserved learner control and no repeated irrelevant remediation. Fail schema/unsupported target outputs closed.
- [ ] Enforce the earliest unaccepted boundary and finite execution limits in the validator. Treat the planned card count as an adjustable estimate for same-goal future work. Retain per-card authorization, and route a material plan change through **Edit roadmap** and reacceptance.

**Task evidence:** Implement an offline-fixture default. Live candidates require recorded bounded authorization and log actual served model/cost; retain scored cases and rejected transitions.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/learn-progress.test.js packages/control-plane/test/roadmap-contract.test.js`

**NEW unit tests (create, then run from root):** `node --test packages/control-plane/test/roadmap-adapt.test.js`

**NEW offline evaluation (create an offline-fixture default first):** `node tests/evals/roadmap/adapt-cases.mjs`. Live model mode is a separate bounded authorized sample and must record served model/cost.

### R10.02 Apply evidence-triggered changes through replayable version guards

**Owner:** State/Money. **Depends:** R10.01, R1 feedback event integration and R4.05. The assessed-practice branch additionally depends on the qualified R9.03 event. **Trace:** v1.3 §§3.11, 5.4; M10.2 and adaptation portions of M11. **Model:** R10.01's proposed adaptation role, no extra model in the event writer.

**Current seams:** `packages/control-plane/src/learn-attempt-store.js` guarded assessment commit; `packages/control-plane/src/learn-coaching-store.js` `applyCoachingAction` is the existing revision-guarded batch precedent. **NEW work:** modify current `roadmap-jobs.js`, `roadmap-store.js`, feedback store and outbox consumer; create `test/roadmap-adapt-events.test.js`.

- [ ] Enter an adapting stage only for a relevant durable feedback or explicit instruction event. Keep the feedback fact and outbox write atomic. Once the R9 path qualifies, consume its applicable assessment events through the same claim and application guards.
- [ ] Claim the event, read canonical latest evidence and persist the input fingerprint/stage before a bounded model call. Coalesce superseded observations while preserving audit identity; a claim alone is never completion.
- [ ] Guard application with expected roadmap and signal versions and the current accepted mode. If a learner accepted the target while adaptation ran, do not rewrite that accepted generation; re-evaluate the earliest still-unaccepted work or return no change.
- [ ] Supersede only the affected unaccepted proposal and invalidate its checks/drafts. Keep delivered card IDs, assets, original accepted result binding and charges intact.
- [ ] Commit the chosen transition and processed marker together through `commitRoadmapEventEffect`; external composition/check stages keep resumable checkpoints. Before unsolicited adaptation and again before applying/revealing it, require Auto-suggest on, eligible Auto/Tutor mode and no explicit Cancel/pause/End. Turning Auto-suggest back on never clears an explicit Cancel; only the learner’s explicit resume does. Learner-requested revision actions keep their separate authorization.
- [ ] With R9 disabled, test duplicate events, lease crash, newer contradictory signals, feedback toggles, concurrent acceptance, stale source, reversed event order and Auto-suggest off/on after Cancel. The roadmap stays paused until explicit resume. Assert one applicable successor, unchanged accepted work, and zero assessment calls, invented mastery or extra debits.
- [ ] With R9 qualified, test duplicate, late, stale and conflicting assessment events. Use only valid evidence for the applicable criterion version and only revise eligible unaccepted work.

**Task evidence:** Save a conflicting-evidence trace and a race proving earlier delivered content and entitlements survive adaptation.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/roadmap-events.test.js`

**NEW unit tests (create, then run from root):** `node --test packages/control-plane/test/roadmap-adapt-events.test.js`

### R10.03 Add prerequisites, focused questions and learner-chosen Rabbit Holes

**Owner:** UI and Tools; Lead integrates Chat routing. **Depends:** R10.01–R10.02, R4.12. **Trace:** v1.3 §3.11; M10.3–M10.5. **Model:** use the proposed adaptation role for complex choice; reuse the retained qualified routing path for explicit Chat intent. No new routing framework.

**Current seams:** `packages/web/src/canvas-actions.js` current action registry, `packages/control-plane/src/chat-modes.js` `chatSystem`; `packages/web/src/learn-progress-question.js` `askTutorAbout` preserves prefill behavior. **NEW work:** extend current `TableOfContents` in the existing ToC integration and `RoadmapPlan.jsx`, `NextStepPill.jsx`, Chat action adapter and `roadmap-store.js`; create `packages/web/src/roadmap-adapt-ui.test.mjs`, `e2e/roadmap-adapt-check.mjs`.

- [ ] Offer a justified prerequisite or a shorter future path at the earliest eligible unaccepted step on the same canvas. Show the estimate change and reason in the existing checked offer and keep normal card approval. Stay within the accepted goal, scope, Depth, mode, explicit order, learner-set limit and stopping point. At a server execution bound, offer explicit bounded continuation.
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

**Owner:** State/Money, Tools and UI. **Depends:** R5.01/R5.04 and R10.02 for explanation revisions. Practice-specific revisions also require qualified R9. Use shipped source adapters. Qualify this expanded slice separately from the first R10 delivery. **Trace:** v1.3 §§3.11, 4.3–4.4; M11.1, M11.3–M11.4, grouped-source M4 extensions. **Model:** registered `roadmap_revise`, Opus `claude-opus-5-5`, platform-funded; subsequent accepted generation keeps its adapter's existing model.

**Current seams:** `packages/web/src/context-docs.js` `uploadContextSource`; `packages/control-plane/src/learn-context-docs.js` source/hash authorization; `packages/control-plane/src/learn-attempt-store.js` immutable attempt precedent. **NEW work:** extend current `roadmap-store.js`, `roadmap-routes.js`, `roadmap-lifecycle.js` / `roadmap-planning.js` (NEW expanded-revision behavior), `TableOfContents` in the existing ToC integration and `RoadmapPlan.jsx`; create `test/roadmap-expanded-revisions.test.js`, `e2e/roadmap-revise-check.mjs`.

- [ ] Define `proposeRoadmapRevision(access,{roadmapId,expectedRevision,change,actionKey})` for `include_source`, settings/scope changes and `redo_step`. Resolve any additional source with access, immutable version and declared coverage before composition.
- [ ] If source relationship is unclear, ask one focused question and keep a durable questioning revision. Incorporation changes the proposed plan only; require its explicit acceptance before using the expanded scope.
- [ ] Preserve original learner instruction and version later edits. Show what changes and account for delivered and prerequisite steps in the revised estimate and finite execution bound. Require explicit reacceptance for a material roadmap change or continuation past the agreed stopping point.
- [ ] Different version creates a fresh checked proposal at the relevant position and requires fresh acceptance. Earlier delivered cards/assets remain usable; only private ToC relationship metadata indicates replacement, never deletion or accepted-result expiry.
- [ ] Supersede affected unaccepted drafts/results only. Do not activate speculative preparation here; R11 later extends the same invalidation rules. No charge occurs for drafting/revising, and new accepted generation uses R4 atomic full-step admission.
- [ ] Test duplicate revision action, concurrent acceptance, changed/deleted second source, unsupported adapter, cancelled redo, delivered-asset survival, cross-device resume and explicit bounded continuation.

**Task evidence:** The expanded revision receipt includes original/new plan versions, original card still accessible, one new accepted action where generation occurred and a stopped-at-outcome case.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/roadmap-money.test.js`

**NEW unit tests (create, then run from root):** `node --test packages/control-plane/test/roadmap-expanded-revisions.test.js`

**NEW local browser harness (create first; common prerequisites plus this rung’s fixtures):** `BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node packages/web/e2e/roadmap-revise-check.mjs`. Record actual assertions and screenshots; a fixture route proves UI behavior only, not live provider quality.


### 6.8 R11 — Platform-funded preparation with separate learner settlement

**Current status:** NEW platform-funded preparation and prepared-result learner settlement. R6 currently composes metadata only. Initial eligibility is qualified lightweight text/table in **Explanations only**. Expensive media and paid content-plan stages remain acceptance-first. Reuse is scoped to the same authorized learner/result; do not implement cross-user reuse. Platform speculation cost and learner charge for accepted content are separate. No Tutor prices are displayed.

**Browser-local prerequisites:** Implement NEW preparation harness with fixture provider operations, a local private result store and deterministic clocks; use two sessions of the same learner for race/replay. Test direct pending-body/asset URLs before acceptance and known/unknown reconciliation. Use real paid work only where already authorized for a bounded specific sample.

**Rung receipt:** N pending/N+1 privately prepared with one next position, operation-to-result mapping, platform expense, accepted learner charge/refund exactly once, zero provider expense at prepared acceptance, denied preaccept reads, invalidation/expiry races and latency hit/miss measurements.

R11 starts only after R6 automatic proposals and R5’s immutable proposal-version contract work. It builds on R4’s identity, whole-step authorization, publication and outbox contracts. A prepared result may be generated and checked while its decision remains `none`; that never grants access. Preparation expense belongs to the platform. Acceptance creates learner accounting once, without a second provider operation. Deliver R11 after Core Tutor and before R12. Use the [Explain on Canvas workflow](explain-on-canvas-workflow.md) as the learner-flow reference. The approval action, Chat entry and Canvas slot are shared between a prepared hit and ordinary generation.

### R11.01 Schedule only eligible preparation under platform usage

**Owner:** State/Money and Tools. **Depends:** R4.05–R4.09, R5.01 version contract, R6.01–R6.03. **v1.3:** §§3.12, 5.1, 5.5; D14, D20, D25. **Legacy:** M7.1, M7.3–M7.4/M7.8 preparation portion. **Model:** reuse the eligible adapter’s current generation role; all speculative calls use `withSystemUsage`. Ordinary Markdown text/table keeps one author call with `repairs: 0`, full supported source context plus accepted brief, and no LLM citation checker/escalation. Retain contextual safety and deterministic format/access/version/billing checks.

**Current seams:** `packages/control-plane/src/learn-usage.js`; `packages/control-plane/src/learn-artifact.js`; `packages/control-plane/src/explain-job.js` illustrates paid brief gating that must not be bypassed. **MODIFY current seams:** `roadmap-policy.js`, `roadmap-jobs.js`, `roadmap-generate.js`, `roadmap-money.js`; add `roadmap-preparation.test.js`.

- [ ] Add a separate speculative capability flag and explicit per-adapter eligibility registry. Initially permit only qualified lightweight text/table paths in **Explanations only**. Require Auto-suggest on, eligible Auto or Tutor mode, remaining work and a roadmap eligible to continue. Expensive media and paid planning remain acceptance-first; a command label such as `/explain` does not imply every path is eligible.
- [ ] Add a separate trusted `prepareRoadmapResult(env,access,{preparationPermitId,resultId,resultVersion})` entry. Validate speculative eligibility, current source/proposal fingerprint, platform quota and decision `none`; never weaken accepted-only `generateRoadmapCard` or expose a public `skipAcceptance` option. While Card N is on offer, prepare only the eligible bounded N+1 candidate identified by R6. Keep N+1's output private. Reveal its offer only after N is saved and acknowledged and successor eligibility is confirmed, even if preparation completed earlier. Persist candidate/version/source/Depth/instruction fingerprints, card slots and call checkpoints before work. No preparation can implicitly accept its own result or the current proposal.
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
- [ ] On **Next card** or eligible Tab, check the exact current offer for a matching prepared result. During a bounded wait for matching in-flight work, use the same **Accepting** slot and Chat entry. Reuse only a checked, reconciled result with current versions and access. After a resolved miss, admit ordinary generation under R4 only for the same still-valid approved offer. Serialize these paths so one approval consumes one acceptance and at most one applicable charge. Keep an unresolved attempt in the existing reconciliation path and require fresh approval for a revised offer.
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
- [ ] Pause, Cancel, Ask, Auto-suggest off or End stops new preparation and unnecessary queued work and attempts transport cancellation where possible. A cancellation signal does not establish no provider cost; reconcile dispatched calls and preserve their operations. Already accepted work follows the delivery/refund deadline, and disabling speculation does not disable ordinary accepted generation.
- [ ] Define retention clocks exactly: cancelled/superseded unaccepted results use decision time; undecided preparation uses last learner activity. Thirty days is the carried proposed configurable default, not a claim of operational approval. Pause/completion/end alone never immediately expires bytes.
- [ ] Use daily retention cleanup to select only unaccepted eligible results and immutable associated objects. Guard expiry against concurrent acceptance in the durable store before deleting bytes; if acceptance wins, deletion must not run. Accepted assets always follow delivered-card lifecycle, including when their position gets a later version.
- [ ] Delete eligible bytes idempotently and retain minimal decision/cost/mapping records plus deletion checkpoint. Retry failed R2 deletion safely without making expired content deliverable. Scheduled event/check retries stay on R4’s timely dispatcher/alarms; do not replace them with a daily scan of idle roadmaps.
- [ ] Run the focused unit commands below: fake-clock each retention origin, pause/resume, end, replacement, accepted old media, acceptance-versus-expiry race, missing object, partial delete and unknown canceled call. Assert accepted assets survive every speculative cleanup path.

**Done evidence:** deletion selection query, race trace and retained audit rows. An ordinary pause never destroys learner content or refunds a valid delivered card.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/roadmap-events.test.js packages/control-plane/test/roadmap-sweep.test.js`

**NEW unit tests (create, then run from root):** `node --test packages/control-plane/test/roadmap-expiry.test.js packages/control-plane/test/roadmap-preparation.test.js`

### R11.05 Report preparation costs and verify reuse under failures

**Owner:** Verifier and State/Money; Lead prepares capability receipt. **Depends:** R11.01–R11.04. **v1.3:** §§3.12, 8; D15, D20, D39. **Legacy:** M7.1/M7.6/M7.8, prepared accounting matrix. **Model:** current eligible adapter and safety roles; real evaluation uses only an already-authorized bounded sample and records actual spend. Ordinary text/table has no citation-check role.

**Current seams:** `packages/control-plane/src/telemetry-provider-spend.js` (`providerSpend`), `packages/control-plane/src/learn-models.js` logging. **Modify:** existing owner telemetry projection/routes, proposed runtime capability flag and evidence harness; **NEW files/contracts:** proposed `roadmap-prepared-check.mjs`, report tests. No new learner-facing price display.

- [ ] Extend the established owner telemetry surface with platform preparation expense by day, decision and eligible adapter; show settled expense, reserved/unknown bounds, learner charges and refunds separately. Count original provider operations once before joining sidecars, avoiding fan-out multiplication from result and charge mappings.
- [ ] Measure N-delivery→proposal-ready, preparation-start→checked-result-ready, Accept→delivered, prepared hit/miss rate, invalidation/waste, unknown rate and provider versus learner micro-cost. Report cold and reused flows separately; do not credit speculative generation for a proposal-only speedup.
- [ ] Run the focused local Node/backend fixtures first. Cover R11 off, N+1 ready early with one visible offer, prepared hit, bounded wait for a matching running attempt, resolved miss to ordinary generation, stale edit requiring new approval, and Cancel or Ask/Auto-suggest off before acceptance. Verify the same offer, slot, result and charge identities across retries, with platform-only unused work.
- [ ] Implement and run the NEW local browser harness below: prepare one card, attempt direct body/asset reads before acceptance, accept from two devices, receive one card/charge, lose acknowledgement, reload and confirm no new debit or provider expense. Cancel a second prepared candidate and verify zero learner charge.
- [ ] Exercise crash points before/after provider admission, response persistence, reconciliation, atomic acceptance, placement save and refund; include unknown operations, insufficient aggregate balance, stale source/Depth/proposal, concurrent expiry and a flag-off restoration. Reconcile each trace to persisted operation, charge and card IDs.
- [ ] Run the focused unit commands below plus the checks affected by the changed files. Have Verifier independently compute provider totals from unique operation rows and learner totals from usage/refund records, rather than trusting the new report’s own implementation.
- [ ] Enable the separate preparation capability for its implemented eligible paths using the adopted MVP launcher (including its existing clone check) and this rung’s actual version, privacy and accounting evidence; do not add another preview tier, unrelated adapter, or broad release gate. If preparation is disabled or fails qualification, leave supported R4 generation and R6 proposals usable. Additional formats qualify independently; Animation remains with its existing owner.

**Done evidence:** one complete prepared acceptance from two devices, canceled preparation without learner debit, unchanged provider totals at acceptance and old delivered assets preserved after revision. Report remaining classifier uncertainty and measured latency honestly; do not manufacture zero-cost or instant-readiness guarantees.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/telemetry-provider-spend.test.js`

**NEW unit tests (create, then run from root):** `node --test packages/control-plane/test/roadmap-prepared-report.test.js packages/control-plane/test/roadmap-prepared-money.test.js packages/control-plane/test/roadmap-expiry.test.js`

**NEW local browser harness (create first; common prerequisites plus this rung’s fixtures):** `BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node packages/web/e2e/roadmap-prepared-check.mjs`. Record actual assertions and screenshots; a fixture route proves UI behavior only, not live provider quality.


### 6.9 R12 — Independently released command adapters

**Current status:** All R12 Tutor adapter bindings are NEW at this baseline; existing standalone commands and engines are present. Enable and verify one adapter at a time using its own prerequisites and relevant checks. `roadmap-adapters/` is a proposed directory under the current roadmap module namespace. Do not create a second contract/payer/publication authority.

**Browser-local prerequisites:** For each chosen adapter, use its existing current renderer/command service and a NEW Tutor binding fixture, with services/images/workers provisioned only where that adapter needs them. Existing R4 browser harnesses exercise core UI, not these adapters; some old MVP recovery assertions predate the removed duplicate status/recovery UI and must be updated without restoring that UI.

**Rung receipt:** Per adapter: accepted offer and material-review fingerprint, requested/served models, every provider operation and phase payer, actual output/modality evidence, one placement after replay/reload, denied private reads, refund/recovery and disabled unsupported formats. A disabled unrelated adapter is not a release blocker.

The command paths below were reconciled to main `fe2bf0f79c6a355a36c9b958bd82933a966620fc`. All Tutor adapters in this rung are **NEW**; existing standalone engines do not establish a completed Tutor integration. Each enabled adapter has its own focused implementation and receipt. R11, R13–R16 and other R12 adapters are dependencies only where the specific behavior needs them. No all-adapter gate or extra preview/clone beyond the existing MVP release check is required.

The planned catalogue has separate entries for written **Explanation** (`/explain`, R4) and playable **Interactive** (`/interactive`, R12.09). `/practice`, `/quiz` and `/flashcards` belong to R9 and retain their immutable-activity and free-assessment requirements. R12.02–R12.08 and R12.10–R12.17 cover the remaining fifteen commands. `/goal` is learner-only and excluded. Command labels must follow the actual catalogue: `/image` uses ID `generate-image`; `/photos` uses ID `image`; `/whiteboard` uses ID `whiteboard-video`. The legacy internal editable-whiteboard tool is not this video command. Existing definitions: `packages/web/src/agent/slash.js`; Learn dispatch: `packages/web/src/learn-slash.js`.

The standalone split gives `/explain` a distinct internal ID and reuses the [CORE.09 writer and renderer](#core09-deliver-the-tutor-explanation-card), including Depth, source context, Markdown tables and Mermaid. `/interactive` uses the existing `explain` registry ID and interactive engine. Preserve saved command, draft, proposal and job bindings across the typed-name change. On the reviewed main the old public `/explain` still covers multiple formats. Qualify the standalone split independently of the Tutor adapter.

#### R12 reuses the current core Tutor lifecycle

Follow [roadmap section 9.4](tutor-roadmap-v1.4.md#94-r12-command-selection-and-the-shared-tutor-flow). The three paths are command plans (`/whiteboard`, `/motion`, `/animation`, `/cad`, `/image`, `/interactive`), simple briefs (`/code`, `/graph`, `/diagram`, `/3d`), and source/workspace insertion (`/browser`, `/photos`, `/youtube`, `/arxiv`, `/wikipedia`, `/notebook`). Retain each command's requirements in R12.02–17. Use the accepted step to choose its format. Reuse the [output and capability distinctions](tutor-roadmap-v1.4.md#47-ordinary-messages-and-tool-requests) for Motion, Whiteboard and interactive Animation. The [ordinary Chat routing work](#45-chat-routing-and-reply-reliability) qualifies separately. The initial verification slices can use `/notebook` for zero-charge insertion, `/diagram` for a source-grounded artifact, and `/whiteboard` for native plan revision and approval. Each adapter qualifies and releases independently.

**UI reference map:** [02](ui/02-canvas-card-skeleton.html) for the slot, actions and progress, [03](ui/03-chat-roadmap.html) for the surrounding Chat flow, [05](ui/05-markdown-source-links.html) for source/card navigation, and [01](ui/01-table-of-contents.html) for accepted ToC rows. In the current `RoadmapTranscript` step, render the existing `GenerationProposalCard` as its review state. Keep the step title, description and source excerpt, and use the review card's actions for the current command revision. Reuse conversational Edit or the command's existing Edit details form. The final result uses the command's existing canvas renderer. [04](ui/04-explanation-card.html) and [06](ui/06-explanation-depth.html) are the core Explanation renderer references.

**Current core reference at main `8deb778fa2b0442b4ac494f9d94e88fffd72a6c3`.** `SlotCard.jsx` and `NextStepPill.jsx` display the pending slot and canvas actions. `RoadmapTranscript.jsx` renders the existing Tutor Chat entry and its revision-bound actions. `roadmap-controller.js` coordinates acceptance and delivery, waits for final placement, saves the board, verifies the saved card and acknowledges. `roadmap-slots.js` persists the pending geometry. Use those seams for R12. Reuse `generation-confirmation-schema.js` and `GenerationProposalCard.jsx` in the same Tutor Chat entry for command review. `ChatMessages.jsx::ProposalSlot` and `generation-proposal-chat.js` show how the existing card connects review, edit and job status to a command. Bind those callbacks to the Tutor step's existing slot and acceptance, including for native jobs that normally allocate their own card.

**Focused core reference checks:** `node --test packages/web/src/roadmap-workflow-web.test.mjs packages/web/src/roadmap-controller.test.mjs` passed 29 tests in the pinned source snapshot. These verify shared Chat/canvas/Tab acceptance, persisted slot placement and save-before-ack behavior with local fixtures. R12 has its own acceptance checks below.

#### R12 command checklist

Each checkbox tracks one working Tutor adapter. Start with the shared [R12.01 acceptance contract](#r1201-register-the-accepted-command-boundary-and-per-adapter-release-checks), then implement and release commands independently as their prerequisites are met. Close each item with its linked acceptance evidence. Record the implementation SHA, focused verification, deployment, enablement and owner acceptance separately.

- [ ] `/code` — Python snippet. [R12.02](#r1202-add-the-code-snippet-adapter)
- [ ] `/graph` — Function graph or data plot. [R12.03](#r1203-add-graph-with-checked-function-and-data-provenance)
- [ ] `/diagram` — Node and arrow diagram or Mermaid. [R12.04](#r1204-add-diagram-with-topology-and-rendered-checks)
- [ ] `/notebook` — Empty notebook. [R12.05](#r1205-add-notebook-as-an-empty-workspace)
- [ ] `/image` — Generated image. [R12.06](#r1206-add-image-through-the-existing-signed-image-plan)
- [ ] `/motion` — Animated explainer video. [R12.07](#r1207-add-motion-preserving-duration-and-recovery-authorization)
- [ ] `/whiteboard` — Narrated whiteboard video. [R12.08](#r1208-add-whiteboard-narrated-video-adapter)
- [ ] `/interactive` — Interactive. [R12.09](#r1209-add-interactive-using-the-narrow-d2b-override)
- [ ] `/cad` — Dimensioned CAD model. [R12.10](#r1210-add-cad-without-changing-its-modelling-engine)
- [ ] `/animation` — Live 3D animation through the Animation owner’s qualified interface. [R12.11](#r1211-specify-the-animation-tutor-handoff-with-the-existing-owner)
- [ ] `/3d` — Technical 3D scene. [R12.12](#r1212-add-3d-technical-blender-scene-adapter)
- [ ] `/browser` — Saved webpage. [R12.13](#r1213-add-browser-saved-webpage-adapter)
- [ ] `/photos` — Photo search and credited insertion. [R12.14](#r1214-add-photos-with-explicit-choice-and-credit)
- [ ] `/youtube` — YouTube video selection and insertion. [R12.15](#r1215-add-youtube-using-actual-search-and-caption-coverage)
- [ ] `/arxiv` — Versioned paper selection and insertion. [R12.16](#r1216-add-arxiv-with-versioned-paper-selection)
- [ ] `/wikipedia` — Article selection and insertion. [R12.17](#r1217-add-wikipedia-with-retained-article-revision-and-sections)

The `/animation` item closes when Tutor can use the qualified interface to deliver the real Animation result. The handoff and contract fixtures are milestones in R12.11. The written `/explain` card uses R4. The `/interactive` adapter qualifies the playable card. `/practice`, `/quiz` and `/flashcards` stay in R9, and `/goal` remains learner-operated.

### R12.01 Register the accepted-command boundary and per-adapter release checks

**Owner:** Lead, State/Money, Tools; **Depends:** R4 accepted-step, reservation, publication and placement contracts; R5 proposal/version/review contract; R2 Depth/settings; R3 references. Qualified R8a is required only for an offer with an essential external fact gap. **Trace:** v1.3 §3.13, §§4–6, D24/D38; M5.3/M5.14, M8.2–M8.6. **Model:** none in registry; retain each command's actual route below.

**Current seams:** `packages/control-plane/src/learn-artifact.js` `artifactPlan/generateArtifact`; `packages/web/src/learn-slash.js` `generateCommand`, `packages/web/src/agent/slash.js`; `packages/control-plane/src/learn-models.js`. **NEW files/contracts:** `packages/control-plane/src/roadmap/roadmap-adapters.js`, `packages/control-plane/src/roadmap/roadmap-adapters/contract.js` as a narrow adapter facade importing the canonical `packages/control-plane/src/roadmap/roadmap-contract.js` (no duplicated enums or authorization schema), `packages/control-plane/test/roadmap-adapters.test.js`; **Modify:** current R4 generation coordinator and Lead-owned capability registry/check-map; reuse canonical `packages/control-plane/src/roadmap/roadmap-policy.js` limits.

- [ ] Extend the existing roadmap planner and validator with a server-filtered catalogue of enabled command/primitive variants. Record the proposed learning outcome as an observable learner action and separately the card behavior needed to teach it. Return the suggested command, source/evidence requirements and a concrete condition the output must satisfy. Confirm the actual command at offer preparation as specified in section 4.1.1. Compare required behavior to the exact variant's declared features. Keep JEV on its existing intent and safety paths and reuse the roadmap draft/revision call for R12 selection.
- [ ] Before showing an actionable offer, validate required source evidence and authorized inputs, actual engine/renderer availability, supported interactions and exact command settings with the native readiness/validation and quote functions where applicable. Require measured plot data when the card promises measured results, consequential dimensions for CAD and working narration for a narrated offer. Recheck at acceptance and dispatch. When a tool cannot be offered, apply [the recovery cases in section 4.5](#focused-chat-routing-tests-and-build) to the same Tutor Chat step. Preserve its learning goal, source and required format. A partial reply leaves the step undelivered. Route a qualified alternative through the existing step, revision and approval checks. Stale source/settings, disabled commands, unsupported interactions and unavailable quotes fail before paid dispatch.
- [ ] Use one shared R8a evidence check after format fit and before the current offer is actionable. Reuse valid source and fetched evidence. Call R8a under the platform research budget only for a required public fact gap. Treat an unresolved essential gap as a pre-approval recovery in the same step. Offer a qualified version with the available evidence or ask one focused question. Source-backed and creative offers can qualify with R8a disabled. Explicit source and workspace actions use their existing handlers.
- [ ] Build typed adapter input on the server from the accepted instruction and step, pinned source and actual evidence, source anchor, Depth, language and approved command parameters. Keep highlight/navigation metadata separate from authoring context. Compose simple briefs deterministically, use native plan preparation for command plans, and bind a real learner-selected source or validated URL for source insertion. Empty notebook insertion uses zero learner charge and zero model operations. Include scoped excerpt and citation IDs with their versions in the native brief and review fingerprint. The approved author receives those inputs. A material evidence change before acceptance creates a revised review. Keep evidence attached to the saved result for the card Sources control.
- [ ] Mount the pending slot before the shared review is actionable. Render the command's schema and **Generate / Edit** in the existing Tutor Chat step. Bind Edit and settings to the current revision, retain the slot and update the same entry. Chat Generate and eligible canvas Accept/Next card/Tab share the same acceptance action for a ready offer. Enforce native review and current revision server-side on all entry points. Start paid plan preparation only under the accepted bound, show its phase in the same slot and Chat entry, then use the required command review there. A required Generate approval within that bound uses the existing authorization. Material changes require a revised approval before further paid work. Keep the scoped R12.09 D2(b) rule.
- [ ] Project actual generation/check/save state into the same `SlotCard` and `RoadmapTranscript` entry. Use existing progress components with a measured bar only when the job reports measured progress and a spinner/shimmer for indeterminate work. Validate the actual result against the promised behavior and the command's schema, render and safety checks. Publish through the core delivery controller with the same card ID and settled slot geometry, save before acknowledgement, then update Chat/ToC and allow the next offer. Preserve an honest failed state and use the command's accepted recovery/refund policy if delivery fails.
- [ ] Define `startAcceptedCommand(access,binding,payload)` returning typed status, command job ID, result ID and provider-operation IDs. Bind board, learner, plan/proposal revision, acceptance, card, phase and authorization bound; request-body identities cannot replace server values.
- [ ] Declare command, supported primitive, explanation/practice purpose, review stages, phase payer, check policy and eligibility per adapter. Tutor proposal composition, checks and R8a research use platform usage. Keep research operation IDs separate from command authorization. Existing paid command planning and generation start only after bound acceptance and use its accepted learner allocation. Deterministic plan signing creates no provider operation. Register text/table and three R9 practice commands by reference; prevent unknown/disabled commands entering proposals.
- [ ] Consume R4's full-step allowance authorization once. Adapt nested command admission without a second learner reservation. Persist every contributing operation through R4's call/result bindings; if a command needs an additional result-to-operation sidecar, add its CREATE-only migration here and let R11 reuse it. This independent adapter must not require the later R11 schema. Retain command-specific refund reconciliation and separate provider expense from learner price.
- [ ] Route every job/result/asset read through the same accepted-entitlement and check predicate. Keep unsigned public `allowedPrimitives` ineffective; compare material review/format/duration changes before additional spending. Suppress prices throughout desktop Tutor, including typed paid-command reviews in Tutor; preserve existing price display in Auto/Ask and standalone command flows outside Tutor.
- [ ] Create parameterized duplicate-acceptance, stale-version, cancellation, insufficient-allowance and direct-result-read fixtures, then run each only for its enabled adapter. Add a receipt template recording exact supported checks and disabled modalities.
- [ ] Test the shared evidence path with local fixtures. Cover sufficient source with zero Exa calls, a material gap resolved through R8a and cited in the exact brief, reuse without another lookup, and disabled or unavailable research with an essential gap. Assert no paid generation while that gap blocks the offer, no learner charge for research, and rejection of a stale reviewed evidence version.

- [ ] Qualify routing before enabling each adapter. Fixtures must reject a learning goal whose required card interaction is unsupported, missing input/source, disabled engine, unsupported exact settings, stale plan or hidden/unapproved review. Invalid offers start zero paid calls. A stale or unapproved review after authorized plan preparation starts zero further paid calls. For the decision-tree interactive fixture, verify the delivered control moves an age-30 sample from the left branch at cutoff 30 to the right branch at cutoff 29. Reject a static result for that interaction requirement. Test an explicit request for unsupported Motion narration before Generate. For each selected adapter exercise one source-to-offer-to-delivered path, revision editing, the same Chat entry and slot through progress, concurrent Chat Generate/canvas/Tab, reload, one bounded authorization, one saved card and acknowledgement only after save.

##### R12 routing tests for each command

Store each command's cases in its own `packages/control-plane/test/fixtures/chat-routing/commands/<command-id>.json` when that adapter is built. Use the same JSON `cases` format as the [shared routing fixtures](#add-cases-to-the-fixture-files). Set `suite` to `command`, add `commandId` to identify the adapter, and set the mode per case when testing different modes. Use the registry ID for the filename, such as `explain.json` for `/interactive` with command ID `explain`, `whiteboard-video.json` for `/whiteboard`, `generate-image.json` for `/image` and `image.json` for `/photos`.

- [ ] During each command's R12 implementation, label and run **20 realistic prompts for that command**. Include requests with its familiar words, paraphrases that omit the slash name and obvious keywords, and nearby requests that should be answered, clarified or routed to a different qualified capability. Exercise the mode and accepted Tutor step context that adapter supports. Carry the authorized source and learning goal where applicable and label the desired output and required behavior. Use named command controls to verify the explicit path.
- [ ] Capture the selected route and command ID at the validated handoff with the same selection-only stop as the [Chat routing sets](#focused-chat-routing-tests-and-build). Log expected versus observed for each prompt, tune the router or its tool descriptions when it misses, and rerun that command's cases and held-out paraphrases before enabling the adapter. Stop before research, preparation or generation. Keep routing evidence separate from the R8a integration fixtures and the adapter's generation, acceptance, billing and delivery checks.

**Task evidence:** Assert all twenty catalogue commands have one release assignment, no unsupported primitive executes, and simultaneous accepts yield one card. **Done evidence:** registry diff plus one adapter's receipt can merge independently; an unrelated disabled adapter does not block the selected implemented adapter.

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

### R12.09 Add /interactive using the narrow D2(b) override

**Owner:** Tools, State/Money, UI; **Depends:** R12.01 and the adopted D2(b) interaction contract; R4 text/table remains separate. **Trace:** §3.13, D2/D38; M8.1/M8.3–M8.6. **Model:** existing `explain_brief/author/review/repair`, all `claude-opus-5-5`.

**Current seams:** `packages/web/src/learn-slash.js` `startExplain` first; `packages/control-plane/src/explain-job.js` route/jobs/refine/generate; `packages/control-plane/src/learn-models.js`. **NEW files/contracts:** `packages/control-plane/src/roadmap/roadmap-adapters/explain-interactive.js`, `packages/control-plane/test/roadmap-explain-interactive.test.js`; **Modify:** explicit Tutor authorization seam in existing Explain job.

- [ ] Require Tab acceptance of the Tutor offer and its aggregate bound before any paid explanation-brief preparation. Start the existing brief stage under that accepted card allocation, then retain the actual brief and its hash/revision for review. Apply D2(b) only to this roadmap path under that adopted contract.
- [ ] Retain the content-plan review while D2(b) lets the bound Tab acceptance replace the redundant Generate wait when the brief remains within the accepted offer. A material brief/content/format/bound change returns a revised proposal requiring new acceptance before further spending. Never charge an unaccepted offer for its brief or accept public `prepare:false` or equivalent as a bypass.
- [ ] Bind newly typed and picked `/interactive` to the existing `explain` ID and interactive `startExplain` path, including Quick Edit. Test its normal review and approval plus the separate written `/explain` writer and renderer. Replay saved mixed-command bindings with their original formats and settings.
- [ ] Use the shared registry to show **Explanation** and **Interactive** under **Tutor** in the `/` picker, Ctrl+K and **View → Slash Commands**. Verify that the playable coffee-cooling preview uses `/interactive`. For **Explanation**, show the real written renderer and the example `/explain Why does coffee cool faster at first? Include a small table comparing early and late cooling.` Confirm that **Use example** fills the composer with the matching public command for review.
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

**Owner:** Tools, UI; **Depends:** R12.01; R7b (§6.3) for structured PDF evidence beyond existing supported retrieval. **Trace:** §3.13/§6.3; M5/M8. **Model:** none for metadata search and insertion; optional research uses its explicit role.

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

**Current status:** Project imports and Project Chat already use Graphify-backed snapshots and code tools. At main `f411c6dee88a0f222ac58df638a41009e56c3867`, the worker pins `graphifyy==0.9.63` and the roadmap source reader accepts owned Markdown. The upgrade to `0.9.103` and the R13 Tutor/shared registry wiring are pending. See [the product workflow](tutor-roadmap-v1.4.md#95-r13-repository-evidence-with-graphify).

**Browser-local prerequisites:** Provide a locally authorized repository snapshot at an immutable commit, Main and child Project canvases, missing/excluded file fixtures and a second unauthorized session. Implement the NEW Project/reference harness against existing RepositorySource and Project surfaces.

**Rung receipt:** Commit/path/range/hash manifests, original-line navigation, refresh/revocation races, zero retired journey creation, accepted text delivery and share/fork privacy with media disabled.

These tasks extend R4's shared source identity, coverage and access boundary with the repository adapter; they do not require R7 long-Markdown/PDF delivery or media adapters. Reuse R7 helpers when already available without making that optional reuse a release gate. Current repository seams were rechecked at the audit baseline. NEW Tutor repository files are implementation targets; existing repository reading does not mean the Tutor adapter is complete.

### R13.00 Upgrade and qualify the existing Graphify indexer

**Owner:** Tools and Lead. Qualify the worker update before enabling the R13 registry adapter. Use `graphifyy==0.9.103`, the latest stable pin verified at handoff (tag `v0.9.103`, 5 November 2026). Its Python floor is 3.10. The tagged package supports the existing `extract(paths, root=..., cache_root=..., parallel=False)` API for extracting code nodes and edges.

**Current seams:** `packages/lesson-renderer/Dockerfile`, `index_repository.py::{VERSION,index,unpack}`, `repository_jobs.py` and `packages/control-plane/src/repositories.js::{RepositoryImports,repositorySnapshot,readableVersion}`. Reuse the existing CPU worker, file allowlist, import jobs and R2 `REPOSITORY_SNAPSHOTS` binding.

- [ ] Update the indexer image to `graphifyy==0.9.103` and tag normalized output `graphifyy-0.9.103-small-1`. Use the local `graphify.extract.extract` API with the current bounded code-file set. Preserve archive validation, excluded-file reports, timeout and inert code parsing. Record resolved dependency versions and the pinned release's license/notice.
- [ ] Validate repo, full commit, graph/file shape and the known extractor version in `RepositoryImports`. Accept old and new known worker versions during rollout. Select the versioned R2 object name from a server-owned mapping and record it in `repository_versions.storage_key`. New builds record the new version. Existing `(app_id, commit_sha)` rows keep their stored keys, including on same-commit reimport. Retain `repositorySnapshot` reads through those keys so saved graph node IDs and code links still resolve.
- [ ] Qualify a local archive with the real pinned CPU extractor. Assert definitions and cross-file calls in TypeScript or JavaScript and Python, correct repo-relative paths and original lines, confidence labels, repeated symbols and skipped files. Check the normalized output against the existing Project graph and reader. Exercise import limits and read both a saved 0.9.63 snapshot and a new 0.9.103 snapshot.

**Local checks:** Extend `packages/lesson-renderer/test_repository.py`. Run `python -m unittest test_repository.py` from `packages/lesson-renderer` in the pinned worker environment, then `node --test packages/control-plane/test/repositories.test.js` from the repo root. Use zero paid model calls. Record package and candidate SHA, emitted snapshot version, source anchors and old-snapshot readback. Use the supported release sequence and worker rollback path.

- https://github.com/Graphify-Labs/graphify/releases/tag/v0.9.103
- https://pypi.org/project/graphifyy/0.9.103/
- https://github.com/Graphify-Labs/graphify/blob/v0.9.103/graphify/extract.py

### R13.01 Resolve authorized repository snapshots for Tutor

**Owner:** Tools; Lead integrates registry. **Depends:** R13.00, R4 source-tool/access and immutable source/coverage contracts, and the relevant cleanup interface receipt. R7 helper reuse is optional. **v1.3:** §§3.14, 4.1, 6.2; **legacy:** M12.4, M4.23. **Model:** none for reads; reuse the R4 registered planner only after evidence resolves.

**Current seams:** `packages/control-plane/src/repositories.js` `repositoryAccess`, `readableVersion`, `repositorySnapshot`; `packages/control-plane/src/canvases.js` `projectRepository`. **NEW files/contracts:** `packages/control-plane/src/roadmap/roadmap-source-repository.js`, `test/roadmap-source-repository.test.js`; **modify:** current `roadmap-tools.js` catalogue and typed dispatcher plus the qualified `chat-tools.js` answer and command paths through Lead.

- [ ] Implement `readRepositoryScope(access, {repo, commit, paths, ranges}, limits)` returning the shared typed tool result, immutable source identity, read ranges and omissions. Resolve the repository from authorized project/board relationships before loading R2; client repository IDs are selectors only.
- [ ] Preserve explicit commit selection and `readableVersion` authorization. Distinguish not indexed, missing snapshot, excluded path and permission denial; do not copy `projectRepository`'s quiet `null` fallback into a Tutor claim of successful reading.
- [ ] Bind cache keys to repository, commit, extractor version and authorization scope. Recheck access before serving cached text; a public snapshot becoming unavailable does not become readable merely because it was cached.
- [ ] Register the adapter independently in the shared capability catalogue. Offer schemas only after the caller's mode, scope, permissions, pinned snapshot and remaining work limits qualify. Resolve repo and commit in trusted request context. Validate name and arguments before dispatching the existing repository operation. Keep imported files inert and Tutor actions owner-only until R14.

**Task evidence:** Cover exact commit, public readable version, unauthorized private import, missing index, missing R2, forged path and revoked cache access. **Done:** fixture records show the requested commit and explicit coverage, with zero model calls on refused reads.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/repositories.test.js`

**NEW unit tests (create, then run from root):** `node --test packages/control-plane/test/roadmap-source-repository.test.js`

### R13.02 Connect Graphify-backed code evidence to the shared registry

**Owner:** Tools. **Depends:** R13.01 and R4 shared coverage/support contracts; optional reuse of already-shipped R7 indexing helpers. **v1.3:** §§3.14, 6.2; **legacy:** M12.4. **Model:** deterministic retrieval; reuse registered `roadmap_index` only for enabled bounded navigation summaries. Ordinary code-source explanations use the supported original source context plus accepted brief and one author call; no mandatory source quotation reviewer or new codebase tutor model.

**Current seams:** `packages/control-plane/src/repository-context.js` `repositoryTool`, bounded `read_source`; `packages/control-plane/src/learn-codebase-source-map.js` `learningSourceMap`, `sourceDrift`. The legacy map requires a known goal at its goal lookup and its route creates old coaching activities; it is not the new roadmap entry point. **NEW files/contracts:** `packages/control-plane/src/roadmap/roadmap-repository-evidence.js`, `test/roadmap-repository-evidence.test.js`; **modify:** R13.01 adapter.

Use `repository-context.js::{REPOSITORY_TOOLS,repositoryTool}` behind the registry. Reuse the schemas and limits for `get_repo_overview`, `search_code`, `query_graph`, `get_relationships`, `explain_symbol` and `find_connection_path`. Expose the repository line reader as `read_code_source`, mapping to its existing `read_source` implementation with `{path, start?, end?}`. The alias keeps the shared Markdown `read_source` schema unambiguous. Project Chat can use its existing tool names.

Resolve the authorized snapshot before each call. Use the graph or search to locate candidates, then read exact numbered lines as evidence. Adapt results to the typed contract with `repo`, full `commit`, snapshot version, returned source ranges and omitted coverage. Retain edge confidence and distinguish graph-only relationships from original text read. Use `partial` when scoped evidence has omissions and the current typed unavailable outcomes for missing, unindexed or revoked sources.

Connect eligible tools to Ask, Auto, Tutor, roadmap preparation and supported command briefs. An explicit file or range selection can use the same reader from the application. Resolve code evidence before the draft or offer. Bind the actual file ranges and snapshot identity to the reviewed brief and accepted writer request. Reuse the existing single author call for ordinary explanations.

- [ ] Reuse retained pure range/hash/omission helpers, extracting them only if cleanup removed their old owner. Accept learner instruction and selected scope without requiring a personal goal or invoking `codebaseActivity`.
- [ ] Retrieve original numbered lines for claims; preserve the 120-line/16,000-character reader bounds and report subsequent ranges needed. Treat graph edges as structural evidence, not runtime execution.
- [ ] Persist `{repo,commit,path,start,end,fileHash,readStatus}` and explicit excluded/unread ranges; only actual reads count as source coverage; `source_supported` is a proposed provenance label, not a required LLM review verdict for ordinary prose. Preserve tentative graph relationships separately.
- [ ] Add fixtures for repeated symbols, missing files, skipped secrets and a selected body exceeding one range. Exercise Ask, Auto, Tutor draft and step authoring, and an eligible slash brief through the registry. Capture offered schemas, graph lookup, original lines in the actual writer request and a typed refused or partial call. Use model doubles. Verify disabled or unauthorized contexts refuse dispatch and omitted lines cannot support an answer or quiz key.

**Task evidence:** The retained source-map suite is current at this baseline; keep the legacy implementation’s activity-creation side effects out of the Tutor adapter. **Done:** evidence manifests distinguish graph-only, read and unavailable material; no retired journey/goal is created.

**Current unit regressions (exist at baseline; root working directory):** `node --test packages/control-plane/test/learn-codebase-source-map.test.js`

**Registry and evidence checks from the repo root:** Extend `roadmap-tools.test.js` and `chat-tools.test.js`. After creating the evidence suite, run `node --test packages/control-plane/test/repositories.test.js packages/control-plane/test/roadmap-tools.test.js packages/control-plane/test/chat-tools.test.js packages/control-plane/test/roadmap-repository-evidence.test.js`.

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

**Owner:** Tools, State/Money; **Depends:** R15.02; reuse the R7b page/crop records for PDFs. R15 extends the bounded local PDF OCR path with dedicated visual interpretation and uncertainty. **Trace:** §§3.16, 6.2; M13/M4.20, D42. **Model:** dedicated proposed extraction role. Resolve consequential OCR ambiguity through explicit uncertainty/clarification and relevant extraction checks; do not add a blocking citation checker/escalation to ordinary Markdown text/table generated from that supported context.

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
- [ ] Make check-map deletion executable on the actual runner. At this baseline, `scripts/ci/affected.mjs` automatically selects registered `packages/web/e2e/*-check.mjs` paths even for deletion before consulting `none`, and `run-part.sh` then tries to execute the missing file. Keeping registration selects a nonexistent check; removing it alone leaves the deleted path unclassified. Implement/test the minimal deletion-aware selection/classification change in the same deletion candidate, or keep the still-runnable file until a compatible transition exists. A historical Windows staged-registration recipe is not Linux proof. Verify actual D-status selection, mapping validation and runner behavior; no missing file or zero-assertion pass.
- [ ] Windows-only checks do not become Linux execution evidence merely because they are mapped. Rewrite/promote only the affected checks needed by the release and record actual runs; unrelated coverage expansion goes in OWNER-INBOX. Do not reintroduce a full CI wait.
- [ ] P7 records current phase SHA, applied environment evidence and limitations. It does not become a blanket dependency blocking unrelated already-authorized Tutor repairs.

**Existing focused regression commands, root cwd:**

```sh
node --test packages/control-plane/test/learn-coaching-store.test.js packages/control-plane/test/learn-attempt-store.test.js packages/control-plane/test/learn-assessment.test.js packages/control-plane/test/learn-assessment-charging.test.js packages/control-plane/test/learn-progress.test.js
node --test scripts/ci/check-map.test.mjs scripts/ci/run-part.test.mjs
```

Extend or add exact archive-backfill/join-free/drop-window tests when those scripts are implemented; mark new test files as NEW in that phase receipt. Existing general store green results are not proof a destructive migration is safe.

## 8 Local verification and direct production release

### 8.0 Required local backend flow tests before manual production checking

**Order and responsibility:** Claude Code owns this local test stage. Complete it before asking the owner to open the deployed app for manual review, including when the candidate has already been deployed. If the deployed source differs from the locally tested source, identify that difference and test the actual candidate before making a readiness claim. The owner checks appearance, interaction and real lesson usefulness afterward; the owner is not the backend regression runner.

**Scope:** the current supported Markdown → Chat roadmap → first card → automatic/manual next proposal → second card flow, including its edits, persistence, billing and failure branches. This is required focused integration evidence, not an all-R7–R16 gate or a request to implement every optional tool. This section overrides the earlier requirement to run local browser automation for this MVP handoff. Do not launch a browser, use Playwright/Chromium/CUA, create a preview deployment or point seed/reset fixtures at production to satisfy it. No live model/API spending is required or authorized by this test section.

#### 8.0.1 Use the real local backend seams

At the inspected main `72d6536657af269bb894511220975fd2254246ed`, the starting point exists: `packages/control-plane/test/roadmap-document-context.test.js`, `roadmap-loop-fixture.js`, `roadmap-fixture.js`, `roadmap-routes.test.js`, `chat-persist.test.js` and `canvas-chat-threads.test.js`. Confirm their current interfaces on the implementation candidate before editing them.

The loop fixture calls the real `roadmapRoute`, `roadmapDeps`/registered handlers, source reader, planner/generator glue, `generateArtifact`, `spendTransport`, state store and money logic with a disposable SQLite/D1-compatible database. It doubles external planner/provider/classifier transports, session identity and R2 bytes. This is an appropriate starting boundary. Its `models()` records role names but not complete planner request bodies; extend the capture to assert the actual planner input. Its current `deliverAndAck()` writes the board by SQL directly; that proves a stored record, not the ordinary board-save API. Add route-level persistence coverage for the integrated acceptance case rather than treating that helper as full save-route proof. The current Chat message feedback route tests do not prove Tutor lifecycle metadata persistence; extend the real thread/message write/read seam.

- [ ] **BE.00 — Prepare one reproducible local fixture.** Use the repository lockfile and Node 24 (`node:sqlite` is required); log `node --version` and the exact candidate SHA. Use disposable local data and synthetic Markdown longer than 8,000 but at most 40,000 characters, a distinctive fact well outside the highlighted range, at least two different planned steps, an explanation and a table, two users/boards, and fresh/occupied/draft-only Chat fixtures. Give each source revision, thread, plan, proposal, operation, result and card a distinct traceable ID. Deny unexpected network/provider calls and record counters; never print keys or private source text. Apply candidate local schema/migrations to this fixture; use local workerd/D1 via API tests only if a changed runtime/transaction behavior cannot be represented faithfully by the Node adapter. Do not require an unnecessary server stack for in-process route tests.

**Test doubles are limited to the outside.** Script valid/invalid/timeout/refusal provider responses, classifier results, transport latency and synthetic source bytes. Keep the real input assembly, route/version validation, source-access checks, SQL persistence, authorization/allowance, result validation, settlement, events/outbox and delivery reconciliation. A fabricated final roadmap/card/status returned before those modules run is not the flow test. Spy on the actual serialized planner and author requests and read the resulting database rows. Seed data through fixture helpers; perform the workflow under test through its production routes/services. Test the ordinary board-save and Chat write/read paths, not only direct table insertion. Existing fixture model/budget constants are test inputs, not proof of the production model or allowance; separately assert the candidate's production resolver/config selection with safe overrides and no live call.

#### 8.0.2 Required flow cases and assertions

Extend the named existing suites and use one integrated route-level fixture for the sequence. Each item is required for its supported current MVP branch; report an unimplemented branch as failing/incomplete rather than replacing it with a mock success. Unsupported optional formats/practice/long-source capabilities stay honestly disabled and outside the ordinary core gate.

- [ ] **BE.01 — Drop acknowledgment and conversation choice (UI.01).** Simulate successful source import in fresh, existing-message and draft-only conversations, including an unsaved `.new` draft and attachments. Hold source-body reading/planning unresolved and assert that the receipt/choice message can already be persisted, with zero planner/author calls or learner debit. Start new chat creates a distinct durable destination while retaining the old draft/history; Stay here keeps that thread. The Explain invitation appears once in the selected thread, after the occupied-chat choice. Replay/drop duplication, multiple drops, thread switch and reload retain the original source→thread binding; Just keep it here creates no roadmap purchase. Use actual Chat write/read storage plus pure thread/draft helpers; opening the panel visually remains the later manual check.

- [ ] **BE.01a — One Explain on Canvas entry (UI.01, CHAT.02).** Extend the controller and Send routing tests. Compare a button click with a clear typed lesson request that has an authorized source. Assert both reach the same guarded create path with the correct source revision, thread, scope, instruction and Depth. Replay the same request from both entry points and assert one draft. Cover a normal question, a single-card request and an ambiguous source. The first two use their own paths. The ambiguous case asks one question before any roadmap is created. Use transport doubles and exercise the existing qualified routing paths.

- [ ] **BE.02 — Whole-context planning and selected teaching scope (CORE.02, UI.03).** Explain invokes the real source reader and planner request constructor. Assert full exact pinned Markdown and the outside-highlight marker, filename/source revision, original learner instruction, selected teaching scope, language, Depth and mode reach the serialized planner request. Test whole content and selected passage without clipping context; the selection remains its own stable anchor. Draft creation, parameter changes and plan acceptance have zero artifact-author calls and no learner card authorization/debit. An unreadable/missing, changed or over-limit source is rejected/qualified honestly; no fabricated full-read status.

- [ ] **BE.03 — Roadmap edits, revision guards and practice readiness (UI.03, R5).** Change Depth/scope/mode and submit typed Edit roadmap before acceptance; assert updated canonical parameters/instruction history and refusal of stale or out-of-order draft acceptance. After a delivered first card and an accepted in-flight card, editing creates a separate unaccepted future revision; accepted ToC, frozen author inputs, saved cards and costs stay unchanged until reacceptance. Dismissing edit targeting preserves the ordinary unsent draft/attachments in the pure composer state model. Reject unqualified practice at the server capability boundary as well as disabling its projected action; never silently accept practice and deliver explanations only.

- [x] **BE.04 — Accept roadmap and accepted-only ToC (UI.02–03).** Accept the confirmed version through the real route. Assert exactly one immutable accepted plan/settings snapshot and one first metadata proposal when the first format qualifies, no author dispatch/card charge, accepted-only outline projection and preserved manual heading identities/done/fold state. Repeated plan acceptance is idempotent. Draft revisions do not leak into the accepted projection. The Chat confirmation/navigation action targets this same accepted tree; navigation invokes no mutation/provider/debit. Use pure outline/route tests to establish data behavior; container styling remains manual. **Evidence.** Exact-main workflow route and outline/Chat tests verify accepted-only version projection, first metadata offer, idempotence and the explicit navigation action. Layout, pending-slot jump and completed-history retrieval remain separate checks.

- [ ] **BE.05 — First proposal and one guarded acceptance (CORE.03–05, UI.04–05).** Assert the pending payload supplies the same proposal/version, title, description, format, exact source excerpt, message/slot identity and placement to Chat/canvas projections. Send the same production accept payload via independent simulated Chat and canvas callers; a pure controller test maps eligible Tab to that payload and excludes composer/settings/editing/IME/repeat contexts without using a browser. Test repeated same-key acceptance, distinct keys racing on the same proposal, two sessions, stale version and Cancel/Edit races. Only the canonical winner can create one authorization/result and one billable author dispatch; do not rely on disabled CSS controls or only same-key replay.

- [ ] **BE.05a — Tool readiness and recovery at the card offer (CORE.03–05, UI.04, R6).** Extend the real first/manual/automatic offer path tests with a supported ready format and a suggested format whose readiness or input changes after roadmap approval. Assert the accepted goal and scope remain the inputs. Check the same eligibility guard for all offer paths. An eligible alternative keeps one step and receives its own current review. A missing detail or blocked requirement routes to Chat recovery with the step undelivered. Repeat at acceptance with a stale or no-longer-eligible offer. Assert zero author dispatch, reservation or debit for an unready offer and one approved tool/settings/source binding for a ready one. Check the approved binding reaches the writer and that saving and acknowledgment precede a successor. **Evidence.** Exact-main readiness tests pass eight backend cases. The real disabled-Table probe authorized Explanation on the same step with zero author calls, while Chat still labeled the offer Table. Render the resolved offer format in `roadmap-transcript.js` and include source revision/availability in the excerpt freshness guard. Acceptance-time source disappearance must also reach Chat as recovery.

- [ ] **BE.06 — Actual author request and both output formats (CORE.03–07).** Run the real generation and validation pipeline for an explanation and a table. Capture each serialized author request and assert whole pinned Markdown including the distant marker, accepted outcome/step/claims, original and accepted edits, format, language, Depth and proposal version. Each accepted card uses exactly one ordinary content-author call, no ordinary citation-review/escalation/content-repair or automatic author retry; the grounding record is `not_run`, not `passed`. Preserve applicable schema, access and safety checks. Test malformed output, incorrect tool/format and returned model mismatch against the candidate's actual policy. Do not insert a ready-made card in place of running the generator.

- [ ] **BE.06a — Tutor Explanation authoring, saved output and renderer (CORE.09).** Extend `packages/control-plane/test/roadmap-generate.test.js` and the integrated flow in `roadmap-document-context.test.js` or the actual workflow route fixture. Send the accepted record through the real request, tool schema, adapter and save/reload path with a deterministic provider reply. For each Depth, prove the same canonical title wins over a distinct model title, later setting changes leave the accepted Depth intact, and one call's quoted and dispatched body carries the matching cap. Assert pass exactly at 600/1,000/1,500 and terminal failure one code point over each. Include Unicode, normalized whitespace, a table header/row, Mermaid node/edge labels and collapsed `more` content. Cover absent/empty `more`, malformed/unsupported Mermaid, invalid artifact shape and over-cap failure with no ready/saved card, one applicable settlement and no redispatch. Assert successful output still carries the same card/result/source identity and survives reload. Keep the separate Table and standalone Explanation tests passing.
  - [ ] **Shared prompt and direct-question checks.** Extend `packages/control-plane/test/learn-artifact.test.js`, `learn-prompts.test.js` and `roadmap-plan.test.js`, updating their expected prompt fingerprints when changed. For each Depth, exercise the real direct artifact request builder with a question, empty optional source context and a deterministic `make_explanation` reply. Assert the question, explicit Depth objective, cap and shared rich-Markdown guidance in the actual author request. Match the teaching guidance against a roadmap request with the same Depth and verify that its accepted source/goal/title is present. Check planner draft and revise request instructions for coherent step scope and embedded table/flowchart eligibility. Exercise the shared cap validator at and one code point over each limit through both generation paths. Check valid tables and supported Mermaid in body and optional sections, prose-only output at every Depth, and existing non-Explanation artifact behavior. Verify each path uses its own authorization, charging and failure lifecycle.
  - [ ] **Node renderer checks.** Use the existing web Node JSX/render harness and `card-layout.test.mjs`. Render the embedded file 06 fixtures and swap their locations so tables and Mermaid are checked in both `body` and an expanded `more` section. Assert the real table markup, Mermaid render selection and safe code fallback on a stubbed renderer error. Check the header/scroller/rail/expansion hierarchy, a direct-question card without a source reference, a legacy card with no sections, and existing source reference hooks. Run the affected suites and build with no browser. Use the owner's later deployed-main check for rendered SVG, physical scrolling, size and focus.

- [ ] **BE.07 — Real reservation, debit and settlement (CORE.04–06).** Assert request-budget/aggregate allowance checks precede dispatch, one hold/authorization/action identity per accepted card and a bound covering the actual serialized request. Planning/proposal review/navigation/next metadata do not spend the learner's card allowance. Duplicate acceptance/polling/restore adds no debit. Insufficient credits/oversized request returns a truthful non-started state with zero author calls; known failed generation releases/refunds as applicable once; unknown outcomes remain reconciling without a second author call. Read holds, usage actions, result/billing rows and totals; do not assert a hardcoded price divorced from configured request bounds.

- [ ] **BE.08 — Same identity, board save, acknowledgment and reload (CORE.07, UI.04/06).** Follow the actual deliver/result entitlement and normal board-save API/service, then acknowledgment in order. Read the board back through its authorized path and restore the roadmap/message state from fresh local client/controller instances. Assert exact server-minted result/card ID, source relationship, persisted slot top-left/width and accepted edited title across pending→accepted→generating→generated→saved→acknowledged. Inject failed save and lost save/ack responses: no premature ack, ready message or successor; reconcile the same existing card/result without another generation/debit or duplicate board block. Distinguish a generated output from a board-saved/acknowledged delivery. Node evidence proves stored geometry/state, not a frame's physical continuity on screen.

- [ ] **BE.09 — Durable Chat lifecycle and late events (UI.01/04/08).** Create/read/update real persisted Tutor metadata using the thread/message endpoints and their authorization checks. Assert one logical Chat entry per card advances through pending/accepting/generating/checking-if-applicable/saving/ready or failure; duplicate outbox/poll events do not append copies or regress a ready entry. A delayed result after switching threads is saved to its original thread. Restore activity, edit target and card/source IDs from storage; do not test only a transient `RoadmapChat` strip or a client-only array. Preserve older history and unsent drafts. Validate metadata round-trip and isolation, not just a feedback side-table migration.

- [ ] **BE.10 — Automatic next offer and actual second card (CORE.07, UI.08, R6).** Enable the candidate's real automatic delivery/event handlers and Auto-suggest policy. Acknowledging the first saved card causes exactly one checked next metadata proposal; before its acceptance, author calls remain one and no second card hold/debit exists. Double delivery/outbox events converge on that same offer. Next card uses the ready proposal's existing accept route once, directly, without Propose then another Accept. Generate, save, acknowledge and restore a **second distinct card** with its own accepted context, source anchor and message, preserving the first card and original highlight. Assert two author dispatches total, two distinct settled results/card IDs and two learner card-action identities, with no extras. A cancelled second offer is not proof that a second card can be generated.

- [ ] **BE.11 — Manual pacing, cancellation, end and finite completion (UI.08, R6).** Test Ask, Auto-suggest off, explicit pause/Cancel and End. Explicit drop/Explain/Accept roadmap/eligible card acceptance work without changing those settings; unsolicited successors do not. Propose next step creates metadata only, then Next card directly accepts the ready subsequent offer. Cancel before acceptance removes only that pending offer and pauses automatic progression, with zero new author/debit; delivered cards remain. Accepted work survives a losing Cancel/end race. Final delivery/accepted ceiling yields completion with no extra offer. The projected bottom pill targets the current eligible proposal and is absent/disabled when stale/busy/no offer/end/final; its physical bottom placement/scroll visibility is checked manually later against [02](ui/02-canvas-card-skeleton.html).

- [ ] **BE.12 — Terminal failures, refusals and uncertain outcomes (CORE.04/06, UI.04/08).** Inject provider 4xx/5xx/timeout, validly classified safety refusal, classifier unknown and save/ack faults locally. Assert truthful stage/error plus original slot/message/result identity, applicable single settlement/refund and zero ordinary automatic author redispatch. Retry/Replace/Omit/recovery-strip actions are not advertised or newly purchasable for this ordinary flow. A safety refusal stops automatic successors; an ordinary failed/skipped step can continue only after settled state and the actual prerequisite/automatic policy decision. Reconcile uncertain outcomes before any further dispatch. Update superseded ordinary-flow recovery tests; preserve legitimate unrelated/platform retry policies.

- [ ] **BE.13 — Source anchors, placement data and invalidation (CORE.02, UI.06–07).** Test exact source revision/range/quotation and source↔card IDs for both delivered cards, repeated/ambiguous quotations, Markdown raw/rendered offset distinctions, multiple card targets, replacement/deletion and revoked access. Reject guessed/dead/unauthorized targets while preserving delivered card/history. Pure placement tests may use supplied world rectangles to test collision avoidance, left/right/above/below choices and saved geometry, including occupied bounds/pill reserves; do not call that a browser measurement. Scroll/pan state must not mutate frozen source scope/context or reassign existing slot geometry. No source-text rewrite may destroy the first card's anchor when the second is offered.

  Exercise prose spans, code lines, rendered diagrams, images and heading-scoped sections through verified revision and block/range fixtures. Assert resolved references and target IDs in both directions, including repeated media names and changed revisions. Check the rendered tooltip and accessible labels. The owner observes hover, scrolling and the temporary blue outline later using files 04 and 05.

- [ ] **BE.14 — Access, entitlement and private projections (CORE.05, UI.01–08).** Use missing identity, second user/board/thread, forged proposal/result/card IDs and source revocation. Assert route-appropriate 401/403/404/409 or actual documented denial without author/hold/charge or access to private payloads; assert exact error contract on the candidate instead of treating every response as a generic failure. Unaccepted/unentitled bodies, private roadmap metadata, drafts and evidence do not leak via status/share/fork/export/thumbnail projections. Authorized restore/navigation works after flag/state changes according to current entitlement policy. Preserve unrelated source material/manual ToC data.

#### 8.0.3 Extend existing tests and run exact non-browser commands

**Integrated test target:** extend `packages/control-plane/test/roadmap-document-context.test.js` for the two-card context path. For missing cross-route Chat→roadmap→board persistence coverage, add **NEW/proposed** `packages/control-plane/test/roadmap-workflow.test.js` only if an equivalent integrated file is not already on the candidate. Reuse `roadmap-loop-fixture.js` and current board/Chat route fixtures, adding external request capture and fault injection. Never create a second mocked roadmap implementation. At the inspected baseline the proposed workflow file does not exist; create/import/register it through the existing test mapping before running its command. If an equivalent current file is used, put its exact path in the receipt and substitute that actual file below. A missing file, skipped file, zero-case pass or the original three tests alone is not completion of BE.01–14.

From repository root, with lockfile dependencies installed and Node 24, run the relevant existing tests while developing, then the affected groups once on the final integrated candidate. These filenames exist at the pinned main; recheck them on a later candidate and record intentional replacements rather than executing deleted paths.

```sh
# Source/context, planning, edits and request construction
node --test packages/control-plane/test/roadmap-source.test.js packages/control-plane/test/roadmap-source-reader.test.js packages/control-plane/test/roadmap-source-version.test.js packages/control-plane/test/roadmap-plan.test.js packages/control-plane/test/roadmap-planning.test.js packages/control-plane/test/roadmap-proposal-drafts.test.js

# Real route/generator/lifecycle and first + second saved cards
node --test packages/control-plane/test/roadmap-routes.test.js packages/control-plane/test/roadmap-loop.test.js packages/control-plane/test/roadmap-glue.test.js packages/control-plane/test/roadmap-document-context.test.js packages/control-plane/test/roadmap-generate.test.js packages/control-plane/test/learn-artifact.test.js

# Holds, settlement, failures, event replay and successor policy
node --test packages/control-plane/test/roadmap-money.test.js packages/control-plane/test/roadmap-store.test.js packages/control-plane/test/roadmap-policy.test.js packages/control-plane/test/roadmap-safety.test.js packages/control-plane/test/roadmap-withheld.test.js packages/control-plane/test/roadmap-sweep.test.js packages/control-plane/test/roadmap-events.test.js packages/control-plane/test/roadmap-auto-events.test.js packages/control-plane/test/roadmap-auto-proposal.test.js

# Real local Chat/board/source/privacy persistence seams
node --test packages/control-plane/test/chat-persist.test.js packages/control-plane/test/canvas-chat-threads.test.js packages/control-plane/test/learn-boards.test.js packages/control-plane/test/canvas-persistence.test.js packages/control-plane/test/source-refs.test.js packages/control-plane/test/roadmap-privacy.test.js

# NEW: run only after creating the actual integrated route-level test described above
node --test packages/control-plane/test/roadmap-workflow.test.js

# Pure Node client/controller/state tests: no browser process
node --test packages/web/src/roadmap-client.test.mjs packages/web/src/roadmap-controller.test.mjs packages/web/src/roadmap-workflow-web.test.mjs packages/web/src/roadmap-auto.test.mjs packages/web/src/roadmap-view.test.mjs packages/web/src/roadmap-canvas.test.mjs packages/web/src/roadmap-integration-wiring.test.mjs packages/web/src/chat-persist.test.mjs packages/web/src/chat-threads.test.mjs packages/web/src/chat-draft.test.mjs packages/web/src/learn-outline-model.test.mjs packages/web/src/source-refs.test.mjs packages/web/src/learn-settings.test.mjs packages/web/src/settings-model.test.mjs

# Shared Explanation writer and planner prompt checks (BE.06a)
node --test packages/control-plane/test/learn-artifact.test.js packages/control-plane/test/learn-prompts.test.js packages/control-plane/test/roadmap-plan.test.js

# Delivered Explanation layout and source-link checks in Node (BE.06a)
node --test packages/web/src/card-layout.test.mjs packages/web/src/source-refs-render.test.mjs

# Build the final UI candidate; this does not launch or verify a browser
npm --prefix packages/web run build
```

For Chat routing changes, run the [CHAT.01/CHAT.02 cases and commands](#focused-chat-routing-tests-and-build) with the affected groups above. Keep the same receipt and candidate SHA.

Do not run `npm test --workspace=web` or the web package's generic `npm test` here: they invoke Playwright. Do not make a full unrelated suite/preview gate mandatory. Run `node --test scripts/schema-check.test.mjs` if the actual candidate adds/changes schema, and `node --test scripts/ci/check-map.test.mjs` if its test mapping changed. If local workerd/D1 is needed for changed SQL/runtime behavior, use the existing supported local API runtime with disposable state and denied provider egress; report the exact command and assertions, with no browser and no remote migration.

#### 8.0.4 Receipt and handoff rule

- [ ] **BE.15 — Produce the local results before requesting manual production checks.** Record the exact implementation candidate SHA/tree, Node version, commands, per-file/nonzero test counts, exit codes, all BE.00–14 case names including BE.01a, BE.05a and BE.06a and their actual pass/fail evidence, fixture source hash, request/context captures with synthetic markers, thread/message/plan/proposal/result/card IDs, both saved board states, author-role counts and hold/debit/refund totals. State exactly where external doubles were used. Record a local runtime test when required, or explain why the Node adapter covers the changed persistence behavior. Include build success and any skipped/unavailable check; mark missing evidence `not run`, never passed. No new receipt framework is needed: use the task/release receipt from section 9.2.
- [ ] **BE.16 — Fix blockers locally and hand over the matching deployment.** Resolve required backend failures, wrong/missing context, duplicate operations/charges, lost Chat/card data, access leaks and save/ack errors before saying the flow is ready for the owner's manual check. Retain the regression and rerun only affected failed/changed tests plus the integrated flow on the repaired candidate. An already deployed backend defect is still Claude's problem to reproduce and fix locally; do not ask the owner to keep retrying it in production. Follow the existing authorized release path for a code fix; this documentation update deploys nothing. Before handoff, identify the served app/control-plane SHA/build and enabled subset and its relationship to the locally tested SHA. If a runtime/candidate mismatch prevents this proof, report that blocker instead of a readiness claim.

**Only then ask the owner to check the deployed main UI.** Provide the deployed link/build, backend receipt and manual sequence. Drop into the intended fresh or occupied Chat, choose the destination, Explain, inspect **Roadmap parameters** and **Roadmap draft**, make one edit, accept the roadmap and open its ToC. Accept the first skeleton. Check the delivered card's pinned title, reading scroll and downward disclosure with the text kept in place. Check the table and Mermaid rendering using a suitable fixture, then follow **View section** and hover **View card**. Use the bottom-fixed **Next card** or **Cancel**, and verify the second card and first card survive reload. Use separate manual runs for mutually exclusive Cancel and Next actions. Include [01](ui/01-table-of-contents.html), [02](ui/02-canvas-card-skeleton.html), [03](ui/03-chat-roadmap.html), [04](ui/04-explanation-card.html), [05](ui/05-markdown-source-links.html) and [06](ui/06-explanation-depth.html). Backend fault injection belongs to the local test stage.

### 8.1 Evidence tiers and the first two cards

| Evidence | Required use | What it does not establish |
| --- | --- | --- |
| Source/contract inspection | Name current files, configured roles/flags and exact changed seam. | That tests ran, flags are deployed, or a learner flow passed. |
| Deterministic Node tests | Real source/plan/generator/state/money/entitlement modules, scripted external responses, actual request/ledger assertions. | Model quality, D1-only runtime limits or physical browser layout. |
| Local workerd/D1 test | Exercise changed SQL/runtime behavior where sqlite doubles cannot represent production. | Live account credentials or external provider behavior. |
| Local browser fixture (reference only for this handoff) | May supply DOM/geometry evidence if separately requested later; not required by section 8.0. | A backend gate pass, real generated explanation, owner production acceptance or permission to run browser automation now. |
| Authorized real model test | Actual requested/served model, content/usefulness, call count, latency and real costs for a small representative case. | All future source types/formats or untested edge cases. |
| Deployment/smoke | Served SHA/build/flags and application/feature access behavior. | An authenticated two-card outcome if only signed-out HTTP was exercised. |

For the immediate sprint, `roadmap-document-context.test.js` is the existing server two-card starting point. Extend it for the accepted version, actual production model/body quotation, selected-scope planner input, output table case and no automatic author retry. Do not replace it with a provider stub that bypasses `generateArtifact`. Keep the body/source synthetic in checked-in fixtures; inspect private user records only through authorized, redacted diagnostics.

After section 8.0 passes, the owner’s manual production UI check observes the normal intermediate states; a backend receipt or start/end screenshots alone cannot establish them: pending → accepting → generating → applicable checking → actual body → board saved → acknowledgement → next proposal. Assert the same slot/card identity, world top-left and width throughout. Generate **both** cards; cancelling the second does not prove it can be generated. Reload after each saved delivery and verify no extra model operation, debit or card. Inject terminal failed/skipped generation, safety-refusal stop and lost-save/ack cases locally in BE.08/12; no ordinary Retry purchase. Do not make the owner induce production faults to prove those backend branches.

### 8.2 Optional local browser setup — reference only, not the pre-handoff gate

**Not commissioned for the current test stage.** Section 8.0 and the owner’s subsequent manual production review govern this handoff. Keep the commands below as existing infrastructure documentation only; run them only if the owner later explicitly requests browser automation. They are not a dependency for completing the required backend tests.

Use the existing **local** Linux/Git Bash-compatible test infrastructure, not a Cloudflare clone deployment. `scripts/ci/stack.sh` is documented for Linux; on Windows use an available compatible local runtime or the existing narrowly selected runner rather than claiming an unrun check passed. Node unit tests remain independently runnable in the repository's supported Node environment. Do not wait for the owner to click through every state if local fixture evidence is available.

Current stack facts checked in source:

- `scripts/ci/stack.sh start|stop|restart <persist-dir>` starts local app8878/control-plane8879, local D1/DO state and provider tripwire. It uses local bootstrap/schema, never remote migrations.
- It **refuses** to overwrite existing `packages/control-plane/.dev.vars` or `packages/web/.dev.vars`. Use a clean disposable local worktree for this harness; do not delete the developer's credentials to make it run.
- It generates random local test-session/master values and no model keys. It writes the local vars file the checks read and removes its own files on stop. Do not print/upload those values.
- It builds `dist`/`dist-dev` only if absent. For a changed candidate, rebuild the bundles explicitly so stale prior assets do not masquerade as current-source browser proof.
- `roadmap-command-check.mjs` and `roadmap-mvp-check.mjs` refuse non-local BASE/CP, seed a local test session and fake roadmap responses, and intercept model-capable calls. Their current comments include stale recovery wording; current assertions use the existing toast. Update those assertions to the actual Chat/same-slot failure contract and accepted-only ToC; do not preserve the obsolete toast action.

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
- [ ] Compare all imports, route mounts, environment bindings and required migrations. Check existing file classifications; register genuinely new executable/test files with the smallest relevant mapping. Follow the deletion-aware selector/runner rule in section 7; do not retain a registration that executes a deleted file.
- [ ] Complete section 8.0’s required local backend flow cases and successful build once on the final candidate before requesting owner manual production checks. Repeat only if relevant changes/failures warrant it. Record nonzero test counts and skipped/unavailable checks honestly.
- [ ] Separate blockers from nonblocking inbox items. No release dependency on optional tools, unrelated cleanup drop, mockup completion or full broad CI/gate.

**Receipt:** exact diff/files, candidate identities, affected checks/results, actual migration/flag prerequisites, and recovery target. No “green” shorthand that hides known feature failures.

### 8.4 REL.02 Verify the supported flow locally before owner UI acceptance

**Owner:** Claude Code/Verifier, with the implementer supplying an executable backend fixture. **Depends:** section 8.0 for current changed feature behavior. **Models:** local external doubles; no browser for this pre-handoff stage.

- [ ] Run BE.00–16 against the current candidate’s real backend/routes and pure Node state/controller seams. Prove persisted conversation/version/context/entitlement/geometry data, first and second saved cards, next policy, races and failure reconciliation. After the receipt passes, the owner checks visible UI.01–08 behavior on deployed main; no agent-run browser or preview is required for this stage.
- [ ] Verify current request/response and persisted data, not only screenshots. Stale/duplicate action cases must have one winner and one charge identity; hidden/unapproved body never enters the visible or shared surface.
- [ ] Record local runtime blockers precisely and keep required backend evidence incomplete until resolved; continue independent fixes. Browser availability does not block this Node/backend stage. Leave visual/production acceptance to the owner’s later check and never demand repeated manual testing of a backend error Claude can reproduce locally.

**Receipt:** candidate/build, commands and nonzero assertions, screenshots/geometry/state records, zero unexpected paid calls, unresolved failures. Reuse valid existing evidence for unchanged paths.

### 8.5 REL.03 Qualify only the changed model/tool capability

**Owner:** Tools and Verifier. **Depends:** deterministic core/adapter tests. **Models:** actual configured roles, never invented availability. **Spend:** existing explicitly authorized cap only; record settled/reserved/unknown separately. **Order:** case selection, authorized budget and local readiness are predeployment work. The new candidate's live production run happens after deployment inside REL.05; its result is not a prerequisite for deploying that same candidate.

- [ ] Choose a small representative case for the current release, including the reported real source/job when authorized. State the supported scope and expected outcome before running it. For the ordinary core use two different planned steps from one bounded document, including a fact outside the highlight.
- [ ] Capture source/plan/proposal/prompt versions, actual request coverage and requested/served model. Record author/check/tool call counts and real cost. Do not log private raw source or hidden model reasoning in public receipts.
- [ ] Score instruction fidelity, scope, usefulness, repetition, source honesty, valid output, stopping and applicable safety. Ordinary text does not regain a blocking citation reviewer because evaluation records content quality.
- [ ] Verify provider/infrastructure failures separately from authored-content failures. Reconcile an unknown outcome before another paid call. No automatic retry loop, no multiplying a prior approved cap by the number of rungs.
- [ ] Run a live paid qualification only within separately recorded authorization and budget. Current section 8.0 testing uses doubles and no paid model calls. The retained clone release verification is separate; production is the final delivery target. If a live operation lacks credentials/budget, record it as not run and continue independent authorized local work.

**Receipt:** actual results/limits, first and second delivery, spend ledger, relevant quality result and known untested cases. This task does not require qualifying every future command before the current fix ships.

### 8.6 REL.04 Reuse the existing clone-backed MVP release path

**Owner:** Lead/release operator. **Current owner decision 2B:** keep the clone deployment. No release-tool implementation change is requested.

~~Earlier task: implement/test a no-clone evidence mode, bypass preview, and introduce a compatible direct-production command.~~ **Superseded.** Its five former implementation checkboxes are retired rather than counted as completed work. Do not execute that obsolete plan or fabricate a preview receipt.

- [x] Inspect the existing tool predicates against the current owner decision. `scripts/mvp-fast-path.mjs::REQUIRED` requires `build`, `affected-tests`, `smoke`, `preview`; `mvpVerdict` checks exact SHA/tree/build, clone target and recovery. `scripts/prod-release.mjs::checkPrepare` requires an acceptable MVP record and the matching `MVP_ALLOWED_SHA`. **Evidence:** pinned-main source review. This is a compatibility finding, not a release or a newly executed tooling test.

Reuse the supported launcher and its real recorded clone deployment for each candidate. Claude may set the exact candidate allowance and push under owner decision 1B. A docs sync is not proof of a code release; do not invent a new paid test or deployment to make a docs-only workflow green. Keep schema/secrets preflight, no implicit production migrations, recovery, smoke and rollback. Production migrations still require the owner's concrete command when unavoidable; other work continues.

**Per-release evidence remains open in REL.01/02/05:** exact tested candidate, existing launcher commands, clone/build/check record, correct allowance, production identity and smoke. Tool tests need rerunning only if actual tool code changes. This docs reconciliation changes no tool code.

### 8.7 REL.05 Deploy once, verify production and keep moving

**Owner:** Lead/release operator under existing authorization. **Depends:** REL.01–02, REL.03 predeployment readiness where authorized and the existing release contract reviewed in REL.04. **Models:** no paid calls in the current local verification; a focused live call requires separately recorded authorization.

- [x] Use the existing supported clone-backed MVP launcher for the exact verified candidate, set `MVP_ALLOWED_SHA` under owner 1B and push to main/production. Apply only separately authorized required migrations to the named environment, with receipts. Keep release work moving while owner manual verification is pending. **Evidence:** exact-SHA clone record, allowance, recovery branch and released Actions receipt in §2.1.3.
- [ ] Verify served app/control-plane SHA/version/build, relevant flags, route authorization and signed-in feature outcome separately. A signed-out401 proves access enforcement, not successful generation. Report any unexpected400/5xx accurately.
- [ ] Exercise the two-card saved/reload flow on production when authorized/session available. Keep the same IDs for diagnosis. If a required functional blocker appears, fix/recover it; do not say deployed means accepted.
- [ ] Use available recovery for actual failure. Keep its target/current ancestry correct; do not let an unrelated recovery preview become another clone gate. Reconcile paid operations/accepted state before claiming rollback erased costs.
- [ ] Write the release receipt and update OWNER-INBOX. Continue the next independent complete MVP. Nonblocking polish, optional formats and future coverage do not hold the sprint.

**Receipt:** released SHA/version/build, required migration evidence, enabled subset, build/affected checks, production smoke, authenticated result or precise remaining limitation, recovery and next ready task. Remove temporary release authorization according to the supported tool procedure.

## 9 Actions, expected results and completion record

### 9.1 Required test assertions by learner action

The backend/storage/charge assertions below must pass locally under [section 8.0](#80-required-local-backend-flow-tests-before-manual-production-checking) before owner production review. The visible expectation column is then checked manually on deployed main; do not treat a mocked route or Node class assertion as visual acceptance.

| Action | Visible expectation | Backend/storage/charge assertion | Owning tasks |
| --- | --- | --- | --- |
| Drop into fresh empty Chat | Right Chat opens; immediate filename acknowledgement and Explain on canvas / Just keep it here | Successful import/revision only; no full-read prerequisite, author call or debit | UI.01 |
| Drop into thread with messages or unsent text | Acknowledgement then Start new chat / Stay here, before invitation | Snapshot and bind event to source/actor/board; preserve draft, attachments and old history | UI.01 |
| Choose Start new chat / Stay here | Invitation appears once in selected actual conversation | Durable distinct thread/draft identity, including unsaved .new edge; race/reload dedupe | UI.01 |
| Change threads while work is running | Existing conversation remains usable; late Tutor entries stay in their original thread | Persisted thread/message binding; no active-thread lookup redirects results | UI.01/04 |
| Choose Just keep it here | Material remains; teaching invitation dismissed | No plan/card purchase or automatic re-offer for that drop | UI.01 |
| Choose Explain on canvas | Reading/generating state and draft appear inside Chat | Complete authorized bounded context; original typed instruction retained; platform-funded planning | CORE.02, UI.03 |
| Change Scope, Depth or Roadmap mode | A new revision entry shows requested values; prior reviewed draft stays superseded with stale actions disabled; source display unchanged | Version guard, frozen accepted settings, stale Accept refused; practice capability genuinely available | CORE.02–03/05, UI.03, R9 |
| Edit roadmap before acceptance | Target pill; revised draft with Accept roadmap / Edit roadmap | Original instruction plus edits retained; no card authorization | UI.03 |
| Accept roadmap | Accepted tree published in ToC; Chat offers Open table of contents and first proposal | Freeze confirmed plan/settings; one metadata proposal; no whole-plan/card purchase | UI.02–04 |
| Open table of contents | One accepted tree with descriptions/statuses above the separate Contents composer | Preserve manual headings and the distinct Contents draft. Keep roadmap settings, stopping and approval in right-hand Chat. | UI.02 |
| Edit roadmap after acceptance | Revision draft in Chat; accepted ToC remains until reacceptance | Replace future eligible work only; preserve delivered/in-flight identities, frozen settings and charges | UI.03, CORE.03/05 |
| Review proposed card | Same title/description/excerpt/format in Chat and source-adjacent skeleton | One step/proposal version and one persisted message/slot identity | UI.04/06 |
| Accept first card / Next card on later proposal / eligible Tab | Same frame fills with actual content and matching Chat updates | One guarded authorization/author dispatch; full accepted context; no citation roles; actual body fits hold | CORE.03–07, UI.04–06 |
| Tab inside composer/settings/editor | Normal keyboard navigation | No acceptance or generation request | UI.05 |
| Generate beside top/middle/bottom passage | Nearby left/right/above/below free slot, generally top-to-bottom along source | World-space passage measurement and full obstacle/control collision bounds; no global repacking | UI.06 |
| Scroll source, collapse, pan/zoom, drag, reload | Existing slot stays at its persisted world geometry; deliberate drag retained | No scope change, source clipping, placement recomputation, author call or debit | UI.06–07 |
| Hover or Tab to a Markdown annotation’s View card button, then activate | Show its matching icon and frame the exact saved card with temporary blue emphasis. Use a chooser for multiple targets. | Validate revision, block or range and authorization. Preserve persistent highlights and card placement. | UI.07, BE.13 |
| View section / Go to highlighted text / Go to card | Explanation or Chat navigates to its verified source or actual slot/card. The explanation header and dropdowns stay visible during body scroll. | Use the stored relationship. No navigation debit or generation. | UI.04–05/07 |
| Terminal failure / safety refusal / uncertain response | Same slot and Chat entry show honest state; no Retry/Replace/Omit | Known failure settles once; unknown reconciles; no blind author redispatch; safety stops automatic next | CORE.04/06, UI.04/08 |
| Save failure / lost ack / reload | One restored result/card at same position | Final geometry saved before ack; same IDs, zero extra author/debit and no premature successor | UI.06, CORE.07 |
| Second offer and Next card from either surface | One proposal in Chat/canvas after saved first delivery; second card actually renders | Own accepted step/version/context; one purchase/call/saved result despite dual clicks | CORE.07, UI.08, R6 |
| Propose next step when no offer exists | One pending metadata proposal; then Next card authorizes the subsequent card | Propose itself makes no author call or debit; respects pause/end/source/ceiling | UI.08 |
| Cancel pending card | Intentional slot removal and cancelled/paused history | No author/debit if Cancel wins; accepted result retained if Accept wins; no mastery inference | UI.04–05/08 |
| Edit card pending / delivered | Targeted Chat pill or existing Quick Edit; revised offer / original delivered content retained | Edit is not acceptance; new version guarded; actual accepted edit reaches writer | UI.04–05, R5.01–03 |
| Link existing card | Existing card stays in place; ToC points to it | Zero author/hold/debit; revalidated accessible identity | R5.04 |
| Thumbs / answer practice | Hover/focus blue feedback; real assessment separately in Progress | Self-report distinct from immutable scored observation; no personal goal prerequisite | UI.08, R9 |
| Source/card changed, deleted or inaccessible | Honest unavailable association; no guessed passage or dead icon | Authorization/revision safeguards; no private leakage or silent regeneration | CORE.02–06, UI.07, R3 |
| Finish final card / End roadmap | Completion/end message in Chat; accepted tree and cards remain | No extra unsolicited offer; preserve accepted entitlement and valid prior costs | UI.08, R4.12, R6 |



### 9.2 Per-task receipt template

Use this shape in the actual task/release receipt, not a new mandatory paperwork system:

```text
Task/release:
Candidate SHA / source baseline:
Learner action now supported:
Existing components/functions reused:
Exact changed files and interfaces:
Enabled source/format/mode subset:
Implementation / locally verified / deployed / enabled / owner accepted (separate):
Conversation/message/roadmap/step/result/card binding if exercised:
Commands run; nonzero case counts; failures/skips:
Actual model/provider/call counts if exercised:
Source/plan/proposal versions and context coverage:
Charge/hold/refund evidence if exercised:
Local backend flow cases BE.00–16, commands/nonzero counts and result:
First/second card IDs, real board-save/ack/Chat persistence and model/ledger counters:
UI geometry/focus/save/reload evidence if exercised (owner manual UI, separate):
Deployed app/control-plane SHA/build versus locally tested candidate:
Deployment identity and owner functional acceptance (separate):
Blocking issue, or nonblocking OWNER-INBOX item and next action:
```

### 9.3 Documentation review completion

Before handing this pair to an implementer, verify that every requested action has an expected visible result, state transition, authorization/cost effect and test owner. Check current main again for completed work. Remove conflicting older instructions rather than hiding them under a vague addendum. Ensure the task tells the engineer which existing component/function to reuse, which new file is only proposed, and exactly what evidence counts.

Section 2.1.1 records the reviewed source, executed local tests and narrow completed items. The containing CORE/UI tasks stay pending until their full requirements and appropriate evidence are met. Future commits are reviewed through section 1.7 before the next task-list update. Record implementation, local verification, deployment and owner acceptance at their actual evidence levels.

