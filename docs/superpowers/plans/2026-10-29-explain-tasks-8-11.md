# /explain — Finish the MVP and Ship Tasks 8–11

> **For Parallel and its agents:** Implement this plan in small, independently usable increments. Use the repository's existing parallel-agent or inline implementation workflow; do not introduce another approval ceremony or a new verification platform. The owner will inspect deployed results and give feedback. Preserve unfinished work on remote branches and continue independent work through blockers.

**Goal:** Close the already-built MVP follow-up release, then add the remaining interactions, context/edit integration and compatibility work without rebuilding the shipped sandbox or holding useful increments for polish.

**Architecture:** Keep the existing V2 jobs, signed proposals, private result storage, shared-board authorization, isolated QuickJS Worker, shared Frame renderer and bounded review/repair/accounting. Extend the existing contracts and adapters. State-changing events must be ordered; frame requests may still coalesce. Old accepted artifacts must remain usable under their original supported contracts.

**Tech stack:** Existing JavaScript/React/Vite, Zod, QuickJS/WASM 0.32.0, Cloudflare control plane/Durable Objects and the existing browser render entry. No new engine, UI framework, database service or model provider is required by this plan.

**Spec:** This is document 2, following `EXPLAIN_SANDBOX_IMPLEMENTATION_PLAN.md` and its repository copy, `docs/superpowers/plans/2026-10-28-explain-sandbox.md`. The original Tasks 8–11 are copied unchanged in Appendix A; the implementation steps below update their sequence and distinguish existing code from missing work. This is about **/explain**, not the separate Explain Back answer/sketch feature.

**Suggested repository destination:** `docs/superpowers/plans/2026-10-29-explain-tasks-8-11.md`. Keep the original plan as history, and link this continuation from the repository checklist.

**Evidence checkpoint:** 29 October 2026, approximately 02:00 PT / 09:00 UTC; workflow results refreshed before saving. Refresh remote refs before executing; the SHAs below are inspection checkpoints, not permission to overwrite newer work.

---

## 1. Read this first: what is actually left

The core Tasks 1–7 implementation is already on production. The owner has generated a gravity explanation there. Cooling and sorting acceptance are recorded in the committed checklist. The remaining MVP closeout is the agreed UI/brief/Edit follow-up release and its deployed confirmation—not another runtime rebuild.

### Status update (integrator, 2026-10-29 PT; supersedes the inspection table below)

| Area | State | Evidence |
| --- | --- | --- |
| R0 follow-ups (Focus/pending/Notes, brief before Generate, conversational proposal Edit) | production-deployed | Shipped as release/explain-2 `5fb3197534f8b32f28e93343601032e339549d83` (gate 40859335390), contained in release 5 `f421cc5deb1cbe378a0f7418a3050c4c7e43523f`; main pushed 09:12 AM; production run 40909329910 failed on a Cloudflare assets-upload error (code 10013) and rolled back, its re-run succeeded; app and control plane serve `f421cc5deb1c` since 09:26 AM. |
| `release/all-1` (8bae732fb) | not released | Superseded by release/explain-2. Its only extra content is the canvas header band, which failed fast-e2e on three rounds; reworked separately on `fix/header-band-2`. |
| R0 deployed check | open | Changed-path check on the dev preview with saved cards, after confirming the served SHA. |
| Gravity production receipt | outstanding (owner) | `C:\s\spec\explain-sandbox\prod\explain-prod-verify.cmd`; no new generation to obtain it. |
| Tasks 8-11 paid budget | US$5.00 cap inside the existing US$50 /explain validation budget (owner 2026-10-29) | Ledger reconciled 2026-10-29: US$1.2061 settled (sandbox-ex1-a 0.44, ex1-b 0.346126, ex2-a 0.42), no open holds. Each run reserves its worst case first; no automatic paid retries. |
| Lanes started | implemented: none yet | 9.1 `feat/explain-program-preview`, 8.1 `feat/explain-state-contract`, 9.2 `feat/explain-material-evidence`. |

### Current state inspected for this document

| Area | Evidence at inspection | Meaning |
| --- | --- | --- |
| Remote main | `5966559bfe8c138444c7938acb26c4bb17753815` | Includes the shipped Explain core plus the public-image activation. It does not yet include the Explain follow-ups below. |
| Core Explain release | `fc31f723a3effb6f7d649dcdece574595853fe5e`; production workflow `40828037255` | Core runtime/card/generation/review/shared access shipped. Later main includes it. |
| Focus/pending/Notes follow-up | `240509a594710066544dc81bfee88c7bc37d9e1e` | Implemented; exact-head verify and fast-e2e passed. |
| Brief before Generate | `4735e1f1ee9397af57dd826affb5803c244c6110` | Implemented; exact-head verify and fast-e2e passed. |
| Conversational proposal Edit | `2b98f4f5a15dfc25e4063cc65b3c841c89a1fdf0` | Implemented for Explain/Motion; exact-head verify and fast-e2e passed. This edits a **proposal**, not the completed program's Current/Proposed preview. |
| Combined integration | `release/all-1`, `8bae732fbb9b40ff785ee439726073801b9c4eca` | Contains those follow-ups plus existing landing/Features/product fixes. Verify `40845874826` passed; fast-e2e `40845874842` was running at the final check. Do not call this deployed or fully checked yet. |
| Production receipt | Existing `C:\s\spec\explain-sandbox\prod\explain-prod-verify.cmd` | The read-only receipt for the owner's existing gravity request is still outstanding in the checklist. Do not make a second paid request just to obtain it. |

The combined candidate appeared during this audit; earlier statements that it was not pushed are superseded. Preserve its progress. Do not split or rebase it merely to make the branch names prettier.

This audit read the original plan, current checklist, relevant main source and the follow-up/combined diffs. It did **not** run the application, the production receipt or new model calls. Stored acceptance reports are identified as reports; they are not new browser verification by the document author.

### Already implemented: reuse it

| Capability | Actual files/behavior | Remaining difference |
| --- | --- | --- |
| Isolated execution | `explain-program/runtime.js`, `worker.js`, `host.js` | Do not replace QuickJS or remove its bounds. |
| Numeric/select controls | `contract.js`, `ProgramScene.jsx`, `SceneControls.jsx` | Continuous numeric input and select already exist. General action buttons/shape selections/drags do not. |
| Playback and stale-frame handling | `playback.js`, `ProgramScene.jsx` | Current scheduler coalesces frame evaluations. It is not an ordered reducer-action queue. |
| Inputs/time reload | `program-card.js`, `explain-client.js` | Current evaluation always supplies `state: null`. No persistent guest interaction state yet. |
| Stored artifacts and sharing | `resolveProgram`, owner result route, shared program client | Source stays outside canvas JSON. Preserve this. |
| Same-card program edit backend | `ExplainJobs.editBase`, `authorStage`, `applyExplainEdit`, `discardExplainEdit` | Backend accepts a stored program base. The UI's Proposed branch only renders `candidate.scene`; a program candidate needs a real preview. |
| Program context helper | `describeProgram(block, manifest)` | Current callers in `LearningBlocks.jsx` and `learn-tutor.js` omit the manifest, so rich controls/state context is missing. |
| Material references | `resolveExplainRefs` reads code and file refs under access checks | Other kinds are listed, not read. Resolved text is not automatically an EvidenceRecord used by review. |
| Runtime version checks | `stamps.js`, `host.js::verify` | Strictly compares with the current build's one stamp set. No multi-version compatibility/retention registry exists yet. |
| Resource lifecycle | Two live Workers, idle eviction, dispose, hidden-tab pause | Offscreen-card suspension and broader lifecycle qualification remain. |
| Rollout controls | Generation flag and execution kill are separate | Do not create another public activation project for a feature already enabled. Refresh release/rollback pins as needed. |

## 2. Shipping rules and boundaries

1. **Close the MVP first.** Release the existing follow-ups as R0. Tasks 8–11 are subsequent work, not new prerequisites for calling the MVP done.
2. **Develop in parallel, release in usable slices.** Task 9 improvements can ship before the larger Task 8 event system. Task numbers describe scope, not a requirement to serialize every agent.
3. **Preserve the current release while it runs.** Work for the next increment goes on a separate branch. Do not repeatedly push onto a candidate and cancel its checks.
4. **No topic-specific product code.** Examples belong in fixtures/evaluation prompts. Do not add cooling, sorting, gravity or other subject branches to application helpers.
5. **No redesign.** Keep card shell, Focus, Notes, toolbar, Chat, fonts, math rendering and existing controls. No new full-page explainer application.
6. **No unlimited testing or spend.** Use existing approved ledgers, reservations and per-run caps. Do not copy stale remaining-budget numbers from this conversation. No automatic paid retries.
7. **Honest state labels:** implemented, pushed, integrated, checks passed, preview-deployed, production-deployed, owner-checked. Never collapse them into “done”.
8. **Owner deployment timing:** while the owner is asleep, keep production unchanged and prepare the checked main-push/deploy launcher. Main pushes currently start production automatically. Merge frequently into the release branch, not remote main, during that hold.
9. **After the owner resumes deployment:** merge/release each ready vertical slice through the existing procedure. Do not wait for all of Tasks 8–11.
10. **Review must not create idle time.** Push a bounded diff for ChatGPT to inspect and continue independent work. Do not claim ChatGPT reviewed it until a review actually returns.
11. Keep legacy scene cards and accepted v1 programs working. Never rewrite stored source, hashes, stamps or review receipts just to make a new parser accept them.
12. Do not add migrations, new infrastructure, engine upgrades or budget increases as routine implementation choices for this plan.

### Limits that remain in force

Verified in current `contract.js` and `limits.js`:

| Limit | Current value / interpretation |
| --- | --- |
| Source / manifest | 16 KiB / 4 KiB |
| Explicit state | 32 KiB is already reserved in `LIMITS.stateBytes`, but state is currently prohibited by the request schema |
| Serialized guest output / depth | 256 KiB / depth 32 |
| Runtime | 50 ms generated-operation budget; 250 ms host watchdog; 2 s boot watchdog |
| Memory | 32 MiB WASM cap; 16 MiB QuickJS heap setting is not sufficient by itself |
| Live Workers | 2; idle disposal after 30 s |
| Drawing | 60 objects in a frame; 2,000 points per polyline; 10,000 points total |
| Inputs | 4 scalar controls; at most 8 options per select; at most 64 select combinations |
| Review | Existing six-capture round allowance and existing model/request/spend limits |

The original plan mentions 240 objects across parts. That is not permission to send 240 objects in one frame. If a pager/parts capability is later implemented, preserve 60 visible objects and separately enforce its total. Do not add a pager merely to use a dormant constant.

### Review focus

- Stateful actions must not disappear through the frame scheduler's “newest request wins” behavior.
- A new contract/stamp must not strand already accepted v1 cards or reinterpret them with an unreviewed engine.
- Proposed program previews must not overwrite the accepted card before Apply.
- A source attached in Chat must not be described as evidence when it was only named, unavailable or omitted.
- Viewer interaction must stay local; shared tokens must not unlock owner routes, board writes or private source material.

Each item has a focused check in its owning task below.

## 3. Release sequence and ownership

| Release/checkpoint | Contents | Can develop alongside | Push/review point |
| --- | --- | --- | --- |
| **R0 — close current MVP follow-up** | Existing Focus/pending/Notes + brief/Edit integrations | Read-only gap work and Task 9 preparation | Existing combined candidate; preserve running checks |
| **R1 — program revision preview** | Task 9.1; add 9.2 only if ready without delaying it | Task 8 contract/runtime, context work | Push once the real program candidate can be previewed and safely applied/discarded |
| **R2 — context and Tutor** | Tasks 9.2–9.4 | Task 8 implementation | Push working material → author/reviewer → card/Tutor path |
| **R3 — stateful buttons and selections** | Tasks 8.1–8.3, with compatible v1 loading and review integration | Task 10 resource checks | Do not expose author capability until the whole slice works |
| **R4 — drag interaction** | Task 8.4 plus its review/persistence coverage | Remaining Task 10 qualification | Push generic drag implementation, not a subject demonstration branch |
| **R5 — remaining qualification/docs** | Tasks 10–11 gaps not already closed by earlier releases | Evidence gathering and docs throughout | Small fixes ship when ready; no artificial final “polish release” |

R1/R2 may combine if both are ready. R3/R4 may combine if dragging is ready without holding usable buttons/selections. These are release boundaries, not a requirement for six launches or six full-suite runs.

**Start with:** finish R0 preparation; assign the card owner to 9.1, the context owner to 9.2, and the runtime owner to 8.1 on separate branches. The checkboxes below are implementation steps, not separate approval gates or compulsory standalone commits. Complete related steps together and ship each usable slice. This document does not promise that all four later tasks fit into one night.

**Owners:** one integrator; one runtime/event owner; one card/edit owner; one context/Tutor owner. Reuse active agents. Give `ProgramScene.jsx`, `LearningBlocks.jsx` and `explain-job.js` one merge owner each; those files are shared by multiple lanes.

Parallelism is for independent code and preparation. Respect the machine's one-heavy-build/capture-at-a-time constraint. A waiting CI run is time to integrate the next branch, update evidence or clean up a finished worktree.

---

## 4. R0: finish the agreed MVP release

**Reuse, do not rewrite:**
- `ExplainPending.jsx`, `LearningBlocks.jsx`, `AdaptiveCanvas.jsx`.
- `explain-program/ProgramScene.jsx`, `ProgramNotes.jsx`, `frame.js`.
- `focus-controller.js`, `focus-host.js`, existing Focus adapters and CSS.
- `explain-brief.js`, `explain-job.js`, `GenerationProposalCard.jsx`, `ChatMessages.jsx`, `generation-proposal-chat.js`.
- Existing release/receipt tooling under `C:\s\spec\explain-sandbox\`; operator files may be outside git.

- [ ] Refresh `main`, `release/all-1` and the follow-up refs; record exact SHAs.
- [ ] Confirm existing follow-ups are in the candidate; do not cherry-pick duplicates.
- [ ] Resolve only actual integration/check failures. The header hit-target fix already appears in the combined history; inspect its current result before assigning it again.
- [ ] Complete the candidate's required checks and build. Keep Tasks 8–11 off this release.
- [ ] Prepare one checked owner launcher. Do not request another activation decision: /explain is already enabled and the follow-up release is already requested.
- [ ] After deployment, confirm exact served version and perform the bounded changed-path check: pending activity, brief/Generate/Edit, ready transition, Focus, Notes, shared interaction. Use saved artifacts wherever generation is unnecessary.
- [ ] Record the owner's gravity receipt when their terminal is available. Do not regenerate gravity for a read-only receipt.
- [ ] Update the checklist: core shipped; follow-ups deployed; actual owner feedback; receipt status separate.

**Closeout:** once the owner sees the agreed follow-ups live, mark the MVP finished under the owner's criterion. An uncollected receipt stays an explicit verification item; it is not evidence that the runtime/cards still need building.

**Do not wait for:** all 18 slash commands, Features pictures, future events/dragging, five-subject qualification, cross-browser polish or Tasks 8–11 completion.

---

## 5. Task 8 — general interactions and time

### 8.1 Freeze a small state/event extension with v1 compatibility

**Existing files:** `packages/web/src/explain-program/contract.js`, `limits.js`, `stamps.js`, `runtime.js`, `host.js`, `worker.js`, `page-worker.js`; `packages/control-plane/src/explain-program.js`.

**Add only if needed:** `packages/web/src/explain-program/compatibility.js` and its test; `state.js` and its test. These are proposed new files, not existing implementation.

**Current interface:** generated modules export `evaluate({ inputs, time, seed, state })` returning `{ frame, quantities }`; request state is strictly null; each operation uses a fresh QuickJS context.

**Proposed extension for this plan:**
- Keep v1 artifacts and evaluate behavior unchanged.
- Introduce a distinct stateful contract version; use schema v2 only for artifacts requiring the new state/event capability.
- Generated v2 modules export:
  - `initialState({ inputs, seed }) -> JSON state`
  - `reduce({ state, event, inputs, time, seed }) -> JSON state`
  - `evaluate({ inputs, time, seed, state }) -> { frame, quantities }`
- Initializing and reducing happen inside the same isolated runtime, never by native page/Node evaluation.
- Add host operations `initialize(request)` and `reduce(request)` alongside `evaluate(request)`. All return tagged, validated results and use existing disposal/watchdogs.
- State is plain JSON, finite numbers, bounded strings/arrays/objects, depth at most 32 and total UTF-8 size at most 32 KiB. Centralize that limit; do not have a looser browser or storage copy.
- Manifest-declared action/target IDs are validated. Proposed initial limits: at most 8 action declarations and 8 interactive targets within the existing 4 KiB manifest. These are implementation choices for the new capability, not claims about existing support.
- For new v2 artifacts, declare one bounded viewport in the manifest and require evaluated frame dimensions to match it; reuse the current Frame dimension limits. User resizing/Focus scales that viewport. Changing inputs or actions must not change the card's intrinsic aspect ratio. Leave v1 parsing unchanged.
- Events are a strict union: button action, declared selection, numeric/select input change, and later drag start/move/end. Only bounded IDs, approved values and coordinates cross the boundary. No DOM events, elements, URLs, callbacks or arbitrary object payloads.

**Compatibility prerequisite:** current `host.js::verify` accepts one stamp set only. Before stamping new v2 artifacts, add an explicit allowlist for the actually supported v1/v2 tuples. Preserve the old SDK/renderer/engine path where required. Do not accept “same major version” or ignore fingerprint differences. The WASM version remains 0.32.0 unless a separate change is justified.

- [ ] Add meaningful schema tests: maximum valid state passes; one byte/depth over fails; non-finite/non-JSON values fail; unknown events/targets fail.
- [ ] Verify v1 saved cooling fixture still parses, hashes and runs without rewriting it.
- [ ] Implement version dispatch and bounded initialize/reduce operations.
- [ ] Apply the existing operation deadline to source load, function call and serialization for each operation.
- [ ] Check an infinite reducer, oversized returned state and broken initialization fail cleanly; a valid subsequent card still works.
- [ ] Push the contract/runtime commit with proposed API and compatibility table for review. Keep new author capability unadvertised until 8.3 is ready.

**Done:** a bounded pure state transition works through the real host; existing v1 cards remain compatible. No UI redesign or genuine model run is needed for this contract checkpoint.

### 8.2 Add ordered state transitions and persistence

**Modify:** `program-card.js`, `playback.js`, `host.js`, `ProgramScene.jsx`, `explain-client.js` where Apply resets learner state.

**Suggested new pure module:** `interaction.js` with `createInteractionController(...)`. It should own event ordering and committed state, not React layout.

**State envelope proposal:** persist a bounded `programState` containing artifact bundle hash, state value, state revision and seed. Keep inputs/time in their current fields. A mismatched artifact hash means incompatible state; reinitialize for the new artifact rather than passing it into unrelated source. Never store program source in this envelope.

**Behavior decisions:**
- Button/selection actions are ordered and never silently dropped.
- Existing newest-frame-wins logic remains appropriate for pure evaluate requests; it must not discard reducers.
- Coalesce only consecutive input updates for the same control, or consecutive drag moves for the same active drag. Never coalesce across another action, start or end.
- Use a bounded pending action queue (proposed initial cap: 16); apply backpressure/temporarily disable the action when full instead of creating an unbounded queue.
- A result must match artifact identity, state revision and input revision before it can be published.
- Publish a new state/frame only after validating both; retain the last accepted state if the operation fails.
- Time scrubbing evaluates the current state at another time. It does not replay or undo button actions.
- Reset restores default inputs, initial state and time zero using the original seed.
- Restart after a runtime disposal rehydrates the last accepted state; it is not Generate.
- A seed plus the same ordered event sequence must reproduce the same state. If a program needs a random sequence counter, that counter belongs in its explicit JSON state, not module globals.
- Owners save through the existing board update/debounce path. Shared viewers/guests keep changes in memory and never write the source board.
- Do not save a board on every animation frame. Save settled state/input changes and the current existing time persistence behavior.

- [ ] Add a regression that three fast button clicks apply three transitions exactly once.
- [ ] Add an old-frame-after-new-state test, including reset and artifact replacement.
- [ ] Implement the controller and state envelope.
- [ ] Test disposal/recreation and owner reload restore the accepted state.
- [ ] Test shared reload returns to the saved shared card and produces no board write.
- [ ] Test Apply of a new program revision clears incompatible old interaction state; Discard preserves it.
- [ ] Push the controller/persistence checkpoint.

**Done:** state survives the supported owner lifecycle; rapid actions are not lost and viewer play stays local.

### 8.3 Ship buttons/selections through authoring, rendering and review

**Modify:** `ProgramScene.jsx`, shared controls/renderer adapters as needed; `agents/explain-author.js`, `agents/explain-brief.js`, `explain-program.js`, `explain-program-stage.js`, `explain-render.js`, `explain-review.js`, `explain-repair.js`; `packages/web/render/program-render.jsx`.

Do not stop at a fixture-only button. The model, validator, real review renderer and learner card must agree.

- [ ] Render declared buttons/selections with existing UI primitives and keyboard behavior. Show them only when declared.
- [ ] Reuse Frame validation for changing plot/shape arrays on every result. Enforce the declared viewport, stable IDs for interactive targets, per-frame object limits and total polyline-point limits. Dynamic arrays do not bypass the renderer contract.
- [ ] Extend the author/brief capability descriptions from the shared contract. Retain the current signed brief/Generate flow.
- [ ] Update source-format checks for the v2 exports. Do not rely on regex as the security boundary.
- [ ] Extend review requests to include seed, initial state and bounded event sequences. The review page must initialize/reduce/evaluate through the same host as the card.
- [ ] Bind sampled event sequences, state hashes, inputs/time and resulting frames to the accepted bundle hash.
- [ ] Preserve the six-capture allowance. Sample deterministic meaningful transitions and report omissions. Bound reducer replay work as well as screenshot count; do not allow unbounded events before one capture.
- [ ] If default time captures consume the budget, report insufficient transition coverage or request a simpler presentation; never claim event behavior was reviewed when it was not.
- [ ] Extend traces/repair preflight and accounting. A transition failure should reach the existing bounded repair path with an actionable operation/phase; no unchanged automatic model retry.
- [ ] Add one algorithm/decision fixture with ordered actions and one continuous numeric simulation fixture using the same generic runtime.
- [ ] Enable new author capability only when host, UI, capture/review and repair all support it.
- [ ] Push R3 as a complete vertical slice; provide its preview when available. Genuine capability evidence can be collected once under Task 10.4, not after every internal commit.

**Done:** the real pipeline can author, review and deliver a stateful button/selection explanation. Interacting does not call a model or charge.

### 8.4 Add generic drag targets, then stop

**Modify:** `ProgramScene.jsx`, `AnimatedScene.jsx` only at the shared Frame adapter, `frame.js`, event contract/controller and review sampler.

- [ ] Allow a declared target to reference an actual frame object ID. Reject nonexistent, duplicate or undeclared targets.
- [ ] Convert pointer coordinates using the actual SVG/frame transform, including canvas zoom, Focus scaling and letterboxing. Do not use page coordinates as program coordinates.
- [ ] Host controls pointer capture and emits bounded start/move/end events. Cancel cleanly on pointer cancellation, lost capture, reset, artifact change and unmount.
- [ ] Coalesce intermediate drag moves while preserving the latest position and the final end event.
- [ ] Keep canvas panning/selection available outside the declared interactive targets.
- [ ] Provide a keyboard-operable equivalent through the existing control primitives for a meaningful drag value/selection. Do not make the interaction pointer-only.
- [ ] Extend the bounded review event sequence with a representative drag and its resulting state/frame.
- [ ] Test scaled coordinates, outside-target pan, rapid drag end, cancellation, and local-only shared interaction.
- [ ] Push R4. No general drawing editor, constraint solver, physics engine, freehand sketch system or subject-specific drag code.

**Done:** the same event API supports a declared drag target and its accessible alternative.

### 8.5 Close Task 8 with one compact evidence record

- [ ] Record v1 compatibility, state/action tests, reload/disposal, no model calls and the two different interaction fixtures.
- [ ] Link the real-pipeline evidence when obtained; distinguish fixtures from genuine model generation.
- [ ] Record any omitted interaction types explicitly. Do not mark them implemented because the contract reserves a field.
- [ ] Update the checklist and proceed. Do not add more interactions just because the first ones work.

---

## 6. Task 9 — context, Tutor and edits

### 9.1 Finish the completed program's Proposed preview

**Existing files:** `ExplainEditBar.jsx`, `LearningBlocks.jsx::AnimationBody`, `explain-client.js::applyExplainEdit/discardExplainEdit`, `program-card.js::resolveProgram`, `ProgramScene.jsx`; backend `explain-job.js::editBase/acceptProgram/programResult`.

**Confirmed gap:** `AnimationBody` only switches to a proposed `candidate.scene`. A program candidate currently leaves the accepted program on screen.

Do not confuse this with the new proposal card's conversational Edit. Both flows must retain their distinct identities.

- [ ] Add a regression for a ready edit result whose candidate has `program` but no `scene`.
- [ ] Construct a preview block using the candidate's own result identity/bundle hash and the existing card ID. Resolve through the authorized result path.
- [ ] Add an explicit ephemeral-preview mode to ProgramScene or a small wrapper. Preview controls may change local preview state, but must never call the accepted card's save callbacks.
- [ ] Current/Proposed switches render the correct artifact and dispose the previous preview host.
- [ ] Apply reuses the existing board/card/baseRevision checks and one undoable update. Do not weaken stale revision rejection.
- [ ] Discard removes the proposed edit and preserves original artifact, inputs, time and future programState.
- [ ] Confirm production/shared authorization cannot read another card's candidate by changing a result ID.
- [ ] Push R1 as soon as this works. No new edit API, compare dashboard or side-by-side diff editor is needed.

**Tests:** extend `explain-client.test.mjs`, `explain-program/program-card.test.mjs`, `control-plane/test/explain-edit.test.js`; add a targeted program preview assertion to the existing card/browser check.

**Done:** the user can see the actual edited program before Apply; rejecting it changes nothing.

### 9.2 Preserve material context as real evidence

**Reuse:** `explain-context-refs.js`, `file-context.js`, `repositories.js`, `generation-review-refs.js`, `explain-evidence.js`, `explain-job.js`, `explain-author.js`, `explain-review.js`.

**Current behavior:** code/file contents reach `context.refText`; other kinds are merely listed. New jobs start with `evidence: []`. Existing `evidenceRecord`, `repositoryEvidence`, `codeRefEvidence` and paper adapters already exist. Connect them; do not invent a second evidence format.

- [ ] Preserve the selected source identity, revision/page/line range and read status from existing authorized readers.
- [ ] Extend `resolveExplainRefs` to return bounded EvidenceRecords alongside refs/text for material actually read.
- [ ] Carry the same records through preparation, authoring, review, repair and the accepted result's private provenance.
- [ ] At Generate, preserve the existing re-read/reference freshness behavior. A changed, deleted or inaccessible required source must not silently become general knowledge.
- [ ] Handle PDF excerpts explicitly. The current chat schema allows learner-provided excerpt text; distinguish that quoted content from server-verified source bytes. Use the existing authorized PDF/source reader when possible. Do not invent a server-backed citation for text the server never verified.
- [ ] For unread kinds, preserve a clear “attached but not read” limitation. Do not add arbitrary file execution, web crawling or new upload support.
- [ ] Bound excerpts to the existing evidence/model/context limits and report omitted/truncated ranges.
- [ ] Treat source instructions as quoted data; they cannot change runtime permissions, model policy or available tools.
- [ ] Preserve source lineage on program edits, rechecking authorization/freshness through existing readers instead of dropping all provenance.

**Tests:** extend `explain-context-refs.test.js`, `explain-evidence.test.js`, `explain-author.test.js`, `explain-review.test.js`, `explain-edit.test.js`. Cover a read PDF/file, pinned code lines, inaccessible ref, changed revision, omitted range and instruction-like source text.

**Done:** author and reviewer receive the same authorized material and attribution. A filename alone is never treated as evidence.

### 9.3 Give Tutor useful program context

**Reuse:** `LearningBlocks.jsx::describeBlock`, `learn-tutor.js::cardText`, `program-card.js::describeProgram`, `ProgramScene.jsx`, `LearnPage.jsx::startExplain`, existing canvas/context adapters.

**Confirmed gap:** `describeProgram` can include a manifest, but current callers pass only the block. Do not send source code to Tutor just to fill this gap.

- [ ] Expose a bounded trusted description derived from the resolved artifact: title, summary, assumptions, control labels/current values, displayed time and current readouts when available.
- [ ] Tie the description to bundle/result identity. Invalidate it when the artifact changes.
- [ ] Use a small canvas-level cache or the existing context adapter to reuse loaded metadata; do not fetch the program on every chat keystroke.
- [ ] After reload/unloaded state, provide an honest partial description or resolve the authorized result once. Never invent values from an unexecuted frame.
- [ ] For Task 8 stateful cards, include a bounded learner-visible state summary/selected action information, not raw arbitrary state or hidden source.
- [ ] Ensure explicit /explain, Ctrl+K's Explain handoff and Tutor-created explanations call the same `startExplain`/job implementation.
- [ ] Coordinate the Ctrl+K entry change with the slash-command owner. Do not implement another command parser or wait for all 18 commands.
- [ ] Keep active-Tutor mode from consuming an explicit Explain request as an ordinary learner answer.

**Tests:** `learn-tutor-context.test.mjs`, `learn-tutor.test.mjs`, `explain-program/program-card.test.mjs`, `control-plane/test/explain-tutor.test.js`, existing `e2e/explain-entry-check.mjs` and `ctrlk-explain-provenance-check.mjs`.

**Done:** asking about a saved program supplies its actual explanation/control context and goes through existing authorization, without a generation call merely to describe it.

### 9.4 Source links and revision persistence

- [ ] Reuse the card's source UI and existing source-reference routes. Do not add a new source drawer solely for Explain.
- [ ] Persist enough authorized lineage to reconstruct links after reload; private evidence bodies remain server-owned.
- [ ] Opening a source rechecks access. A publicly shared explanation does not automatically publish a private PDF or repository.
- [ ] Test edit → Proposed → Apply → reload and edit → Discard → reload with correct source identity and program revision.
- [ ] Keep failure text actionable when the source is no longer available.
- [ ] Push the completed context/Tutor slice and update the checklist.

**Task 9 closeout:** one source-grounded explanation and an edited program revision preserve ownership/provenance/history. Use fixtures for wiring; reuse authorized real runs for genuine evidence rather than launching a redundant batch.

---

## 7. Task 10 — quality, compatibility and resources without a polish marathon

### 10.1 Finish lifecycle limits and offscreen behavior

**Reuse:** `host.js`, `playback.js`, `ProgramScene.jsx`, relevant Focus state.

Current code already enforces a shared two-Worker limit, idle eviction, host disposal and hidden-tab pause. Extend the missing offscreen behavior instead of replacing that scheduler.

- [ ] Detect whether the actual card/Focus surface is visible. Focused content counts as visible even if its canvas position is offscreen.
- [ ] Pause offscreen playback and stop requesting frames; preserve the last accepted inputs/state/time. Do not fast-forward through invisible wall time.
- [ ] Re-entering the view redraws that state. Default to paused unless existing behavior explicitly preserves play intent; keep the policy consistent and documented.
- [ ] Verify delete, canvas navigation, Proposed/Current switches and artifact replacement dispose hosts/listeners.
- [ ] Use a small three-card fixture to demonstrate the existing two-Worker budget and no unbounded waiter/resource growth.
- [ ] Measure cold start, operation/frame latency and UI responsiveness from actual runs. Report device/browser and limitations, not a universal FPS claim.
- [ ] Fix demonstrated leaks/races. Do not increase the 50 ms bound or memory limit solely to avoid investigating a failure.

**Focused checks:** host/playback/runtime unit tests and the existing program browser check. No new benchmark platform.

### 10.2 Small usability/support matrix

**Modify only where a check demonstrates a problem:** shared renderer/controls, ProgramScene, Focus adapters and existing CSS.

Check a short matrix, using approved browser execution:
- Desktop 1440×900.
- Short desktop 1280×720 with Chat open.
- Narrow viewport 390×844.
- Owner and shared interaction; one signed-out/shared path where supported.
- Light/dark, keyboard controls and reduced motion.
- The current supported browser(s); add another supported engine run only where tooling already permits it.

Inspect the visualization itself, not just a timer or DOM count: axes/labels visible, pointer hits controls, Play draws changed positions, Pause holds, scrub/input state matches the picture, Notes expands without crushing the graph, Back/Focus preserve state.

Do not claim a 390 px Chromium viewport is an actual iPhone/WebKit test. Record untested environments explicitly. Do not delay each earlier release until every browser combination has been qualified.

Use the existing shared card styles and hardened math rendering. No new icon system, themes, per-topic styling or layout redesign.

**Done:** the support matrix states passed/failed/not tested with exact build and evidence. Fix functional accessibility and reachability issues; cosmetic improvements remain feedback-driven.

### 10.3 Version retention, revocation and rollback

**Reuse:** `stamps.js`, `host.js`, `page-worker.js`, `worker.js`, `program-card.js`, `explain-program.js`, `explain-job.js`, Vite build inputs and existing release tooling.

The minimum v1/v2 compatibility needed for Task 8 belongs in 8.1, before new versions are emitted. This task completes its operational policy.

- [ ] Maintain a trusted, explicit mapping from supported artifact version/fingerprint tuples to bundled runtime/SDK/renderer assets. No guest-controlled URLs or fallback to “latest”.
- [ ] Use one declared current version for new generation and retain previous versions while saved cards require them. With only v1/v2, a small static map is enough; do not build a general plugin package manager.
- [ ] Ensure normal card loading and the review renderer resolve the same version tuple.
- [ ] Test saved v1 after the v2 release, unknown version, corrupted source/hash, missing WASM and revoked execution.
- [ ] Distinguish generation-off, execution-kill and emergency Worker rollback. Document that the current kill check is evaluated when the result is loaded; it does not currently promise immediate termination of every already-open card.
- [ ] Preserve accepted artifacts through job pruning. Define retention/cleanup separately for transient history and durable accepted results; do not delete accepted results during routine worktree/disk cleanup.
- [ ] Refresh rollback tooling against the final candidate and record its actual compatibility with old/new artifacts.

A rollback to a build that cannot parse newly created v2 artifacts is a real compatibility issue. Resolve it through the supported-version strategy or an explicit limited/unavailable state; never silently execute under v1. Do not promise saved-card continuity that the rollback cannot provide.

### 10.4 Complete the original five-subject transfer evidence once

This original requirement remains part of Task 10; it is **not** a new MVP gate or a requirement to run five paid jobs for each release.

- [ ] Inventory existing genuine evidence: cooling, sorting and the owner's gravity run. Count only qualifying, accessible results, with source/artifact/build identity and actual behavior observed.
- [ ] Build a five-subject coverage table. Include at least one non-physics case and one request chosen after implementation. Reuse qualifying existing cases; run only missing cases under existing authorization.
- [ ] Include a stateful action example and a continuous-control example for the newly released capability. If all old cases are v1, they prove v1 transfer, not v2 events.
- [ ] Record model identity from API/receipt where exposed, request, bundle hash, review outcome, interaction evidence, limitations, spend and timing.
- [ ] Use subjects as generated programs and fixture data only. No application branch gets an answer-specific formula to make a test pass.
- [ ] If a case fails, retain its artifact/diagnostic. Reproduce locally from saved evidence and fix the generic defect. No blind retry loop or renamed prompt that hides the failure.
- [ ] Report a limited success honestly; do not claim “100% generic”.

**Done:** five-subject evidence and known limits are documented. A missing receipt is marked missing, not replaced by an invented number.

---

## 8. Task 11 — release and documentation, largely ongoing

### 11.1 Keep releases small and reviewable

- [ ] For each R1–R4 slice, commit the focused implementation/tests and push to a named remote branch.
- [ ] Hand back the full SHA, base SHA, compare URL, changed files, check results and short behavioral difference immediately.
- [ ] Integrate ready work once; resolve conflicts against the current deployed/integration base.
- [ ] Freeze the candidate and run the existing required exact-SHA checks/dev gate/build. Reuse evidence only when the repository's real rules allow it.
- [ ] While it runs, develop the next increment separately.
- [ ] Prepare one checked owner launcher. While the owner is asleep, stop short of remote-main push because it deploys production.
- [ ] After authorization/operator action, confirm served SHA and changed behavior. Hand back the live URL promptly.

**ChatGPT review points:** after 8.1 contract/runtime; after 9.1 preview; after 9.2–9.4 context integration; after complete R3/R4; and after each final merge diff. These are remote-diff checkpoints, not permission to leave agents idle waiting for ChatGPT. A review is not claimed until returned; required repo checks remain required.

### 11.2 Update docs from actual receipts

**Update existing:**
- `docs/features/explain-sandbox-checklist.md`.
- `docs/superpowers/plans/2026-10-28-explain-sandbox.md`: link this continuation and mark superseded policy text.
- `docs/features/focus-study.md` only for changed Focus behavior.
- `docs/features/generation-review-contract.md` only for changed proposal behavior.

**Create if absent:** `docs/features/explain-program-support.md` for version support, current limitations, controls/state semantics and recovery. One short support page is enough.

- [ ] Document initialState/reduce/evaluate, action ordering, reset/restart/seek, owner versus viewer persistence.
- [ ] Document exact runtime/model policy versions from code/receipts, not an agent's claimed model identity.
- [ ] Update “implemented / checks / main / deployed / enabled / owner checked” separately.
- [ ] Retain a short known-gap list with concrete owner/next step. Do not copy obsolete failure statuses forward as current.
- [ ] Update the existing checklist on each hand-back; do not create a new status dashboard or unattended polling service.

### 11.3 Close operational work and preserve data

- [ ] Use existing production verification and release receipts. Verify released SHA, flags and one authorized real journey; do not make a paid request solely to improve a status sentence.
- [ ] Record current generation-off, execution-kill and emergency rollback commands/pins.
- [ ] Preserve operator scripts, ledgers, source kits and useful evidence outside git; never blanket-commit credentials or historical untracked files.
- [ ] Remove completed, clean, preserved worktrees using the existing safe closeout procedure. Protect small-parallel and its nested worktrees; no forced removal.
- [ ] Report free space and retained-worktree blockers.
- [ ] Close Tasks 8–11 only item by item from evidence. A deferred row stays deferred; it does not become a reason to reopen the already shipped MVP.

---

## 9. Focused checks and exact files

These commands are for the implementer, not a request for the owner to paste multiple commands. Use the checked checkout with its real dependencies.

### Existing quick commands

From `packages/web`:

~~~bash
node --test src/explain-program/contract.test.mjs src/explain-program/contract-safety.test.mjs src/explain-program/runtime.test.mjs src/explain-program/host.test.mjs
node --test src/explain-program/program-card.test.mjs src/explain-program/playback.test.mjs src/explain-client.test.mjs
~~~

From `packages/control-plane`:

~~~bash
node --test test/explain-edit.test.js test/explain-context-refs.test.js test/explain-tutor.test.js
node --test test/explain-m3.test.js test/explain-render.test.js test/explain-review.test.js test/explain-repair.test.js test/explain-program-budget.test.js
~~~

Run only the relevant group while implementing. Include newly added tests in that group's command. Judge the Node process exit status and nonzero test count; avoid absolute-glob/Git Bash zero-test traps.

For an integrated candidate, use the repository-required affected suites/build and release procedure:
- Web unit suite: `npm run test:unit` from `packages/web`.
- Control plane: `npm test` from `packages/control-plane`.
- Root full suite when required by release policy: `make test-unit`.
- Web `npm test` means Playwright, **not** unit tests.

Browser checks to extend, rather than multiplying new harnesses:
- `packages/web/e2e/explain-program-check.mjs` — actual Worker/runtime.
- `packages/web/e2e/explain-program-card-check.mjs` — card controls/state.
- `packages/web/e2e/explain-program-render-check.mjs` — real server-sealed render path.
- `packages/web/e2e/explain-entry-check.mjs` — entry/ready path.
- `packages/web/e2e/explain-proposal-card-check.mjs` — proposal Edit/Generate.
- `packages/web/e2e/ctrlk-explain-provenance-check.mjs` — editing/provenance entry.
- `scripts/ci/check-map.json` — ensure relevant checks are selected for any new modules.

Use the owner's existing browser exception where it covers this work; otherwise use approved CI. Do not reopen a permission debate for already-authorized checks or stall unrelated work.

### File map: where to start

| Responsibility | Exact location |
| --- | --- |
| Artifact/state/event schemas | `packages/web/src/explain-program/contract.js` |
| Execution/resource bounds | `packages/web/src/explain-program/limits.js`, `runtime.js`, `worker.js` |
| Hashes/stamps and worker admission | `packages/web/src/explain-program/stamps.js`, `host.js`, `page-worker.js` |
| Card state/load/description | `packages/web/src/explain-program/program-card.js` |
| Frame scheduling | `packages/web/src/explain-program/playback.js` |
| Card UI | `packages/web/src/explain-program/ProgramScene.jsx`, `ProgramNotes.jsx` |
| Shared renderer | `packages/web/src/AnimatedScene.jsx`, `SceneControls.jsx`, `explain-program/frame.js` |
| Existing pending/edit/result attachment | `packages/web/src/ExplainPending.jsx`, `ExplainEditBar.jsx`, `explain-client.js` |
| Card dispatch and context extraction | `packages/web/src/LearningBlocks.jsx` |
| Entry and existing edit command | `packages/web/src/LearnPage.jsx` |
| Tutor context | `packages/web/src/learn-tutor.js`, `learn-tutor-actions.js` |
| Job/revision/ownership/storage | `packages/control-plane/src/explain-job.js` |
| Program draft validation/sealing | `packages/control-plane/src/explain-program.js`, `explain-program-stage.js` |
| Author/brief prompts | `packages/control-plane/src/agents/explain-author.js`, `agents/explain-brief.js` |
| Author/brief execution | `packages/control-plane/src/explain-author.js`, `explain-brief.js` |
| Material refs/evidence | `packages/control-plane/src/explain-context-refs.js`, `explain-evidence.js`, `file-context.js`, `generation-review-refs.js` |
| Capture/review/repair | `packages/control-plane/src/explain-render.js`, `explain-review.js`, `explain-repair.js` |
| Review's actual program player | `packages/web/render/program-render.jsx` |
| Cost/model policy | `packages/control-plane/src/explain-policy.js`, `learn-models.js` |
| Versioned build assets | `packages/web/vite.config.js` and existing render asset resolution |
| Shared saved-program regression | `packages/control-plane/test/shared-program-card.test.js` |

The new `state.js`, `interaction.js` and `compatibility.js` names are suggested cohesive modules, not a requirement to split working existing code just for style.

## 10. Speed and hand-back contract

### What warrants stopping a release

A demonstrated permission leak, unbounded execution/state, loss of accepted data, wrong artifact/revision applied, broken primary interaction, or required-check failure.

### What does not warrant holding every release

Another example, a prettier transition, more whitespace adjustments, a new UI system, a broader benchmark set than the slice needs, unrelated Features/slash work, or an owner-only receipt that can be collected after the code is ready.

### Every completed slice must be pushed

Use a hand-back like this:

~~~text
Slice: R1 / Task 9.1 program Proposed preview
Base SHA:
Head SHA:
Compare URL:
Changed behavior:
Checks run / exit status / count:
Not tested:
Preview URL + served SHA, if deployed:
Ready for integration: yes/no, concrete blocker
Next independent work already started:
~~~

When a check or owner action blocks one lane, preserve its state and move to the next independent task. Do not bury completed work in a worktree. Do not hold all later development until the owner personally clicks the previous preview.

**Deployment cadence:** push coherent task commits; integrate a usable slice; deploy through the existing route; let the owner inspect; iterate from feedback. Keep the MVP release and post-MVP releases separately identifiable.

---

## Appendix A — Original Tasks 8–11, copied unchanged

The following is the original scope, retained for traceability. Its broad dependencies and historical rollout assumptions are refined by the shipping sequence above. In particular: the MVP is already live; brief-first approval now supersedes the old direct-author policy; the owner currently wants to run production deployment after returning. None of the original rows is silently marked complete.

### Task 8 — Complete general interactions and time behavior

**Owner:** B for UI/event contract; A for execution. **Dependencies:** 7; design/fixtures can start earlier.
**Files:** contract/runtime/host/ProgramScene; corresponding unit and browser checks.

- [ ] Add explicit bounded initialState/reduce event handling for buttons, selections and drag events. Host supplies only approved event fields and target IDs; guest never receives raw browser objects.
- [ ] Support continuous numeric controls and validated changing plot/shape arrays; stable frame bounds and bounded points. No topic-specific interaction handlers.
- [ ] Separate input changes, actions, playback time and reset. Preserve reproducible random seeds; stateful actions use explicit JSON state. Seeking changes time for the current state; it does not silently invent undo of actions.
- [ ] Persist necessary state and restore it after runtime disposal/reload; reject stale edits and stale output. Ensure saved state cannot exceed limits.

**Done:** an algorithm/decision-style interaction and a continuous simulation use the same generic event API; exact state reloads; no model call occurs on interaction.

### Task 9 — Finish context, Tutor and edits

**Owner:** C with B. **Dependencies:** 7; independent of most of 8.
**Files:** LearnPage/startExplain integration; explain-author/job/client; existing context-reference and edit handlers.

- [ ] Preserve authorized selected PDF/repository/material context and evidence IDs through authoring and review. Untrusted document instructions cannot change runtime privileges.
- [ ] Tutor-created explanations and slash commands use the same implementation; verify active-Tutor modes do not swallow the request.
- [ ] Existing Ctrl+K/edit flow creates a new program revision, previews it and supports Apply/Discard. Discard preserves the old artifact; stale Apply is rejected; edits cannot upgrade permissions.
- [ ] Keep original sources visible/attributable where current cards provide source links. No automatic new web research, arbitrary uploads or guest network access.

**Done:** a source-grounded explanation and its edited revision retain correct ownership, provenance and history through reload.

### Task 10 — Complete quality, compatibility and resource qualification

**Owner:** A+B; independent review. **Dependencies:** 8, 9.
**Files:** shared renderer/controls and program host; browser checks; artifact/runtime compatibility registry.

- [ ] Verify supported desktop browsers and a real mobile-width browser run in approved CI. Inspect dark/light themes, keyboard navigation, reduced motion, labels, clipping and resize.
- [ ] Match the existing card shell, fonts, style roles and controls. Keep layout tokens; no landing redesign or new visual system.
- [ ] Exercise multi-card playback, background/foreground, repeated edits, engine disposal, unavailable WASM, corrupt source, old runtime version and canceled jobs.
- [ ] Pin runtime assets per saved artifact; define retention and revocation. Generation-off, execution-kill and rollback are separate controls. Turning off new generation must not silently destroy old accepted cards; emergency execution kill may show a saved poster and explicit unavailable message.
- [ ] Produce a transfer evaluation across at least five subjects, including one non-physics example and an unseen request selected after implementation. Fixtures/benchmarks may contain formulas; production helpers may not acquire topic branches to pass them.

**Done:** supported devices, limits and gaps are documented from evidence; no “100% generic” claim. A formerly accepted artifact cannot run under a different unreviewed engine by accident.

### Task 11 — Finish rollout, documentation and outstanding list

**Owner:** integrator. **Dependencies:** 10 and exact candidate readiness.

- [ ] Complete required exact-SHA CI/gate/build checks and dev acceptance. Update feature docs, support matrix and model/runtime/version policy.
- [ ] Prepare one reversible activation with health checks and a rollback that preserves saved data. Reuse existing authorization where applicable; if public enablement lacks approval, present this final concrete command once. Do not hold unrelated code off main.
- [ ] Verify the released SHA, flag state and one authorized production journey; preserve real spend, timing and receipt. No new paid call merely to prove a status line.
- [ ] Close only individually evidenced checklist items. List all outstanding gaps, owner actions, rollout state and limits. Keep the checklist current automatically.

**Done:** full scoped feature is implemented, on main, released, enabled for the stated audience and verified—or the single remaining explicit activation requirement is identified with a ready command. Do not label “on main” as production acceptance.


## Appendix B — Source and review provenance

- Original Library document: [EXPLAIN_SANDBOX_IMPLEMENTATION_PLAN.md](https://chatgpt.com/library?file_id=libfile_05eea373878081918cab238aee7a5004&account_id=personal).
- Original repository plan: [2026-10-28-explain-sandbox.md](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/5966559bfe8c138444c7938acb26c4bb17753815/docs/superpowers/plans/2026-10-28-explain-sandbox.md).
- Main source checkpoint: [5966559bf](https://github.com/Rabbit-Hole-App/Rabbit-Hole/tree/5966559bfe8c138444c7938acb26c4bb17753815).
- Combined candidate: [8bae732fb](https://github.com/Rabbit-Hole-App/Rabbit-Hole/commit/8bae732fbb9b40ff785ee439726073801b9c4eca).
- Combined diff: [main checkpoint → release/all-1 checkpoint](https://github.com/Rabbit-Hole-App/Rabbit-Hole/compare/5966559bfe8c138444c7938acb26c4bb17753815...8bae732fbb9b40ff785ee439726073801b9c4eca).
- Current candidate checklist: [explain-sandbox-checklist.md](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/8bae732fbb9b40ff785ee439726073801b9c4eca/docs/features/explain-sandbox-checklist.md).
- Production-on-main behavior: [.github/workflows/deploy-prod.yml](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/5966559bfe8c138444c7938acb26c4bb17753815/.github/workflows/deploy-prod.yml).
- Repository working rules: [CLAUDE.md](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/5966559bfe8c138444c7938acb26c4bb17753815/CLAUDE.md).

Code conclusions in this plan come from the named source files and bounded follow-up diffs, not a certification of every historical commit. No code was changed, deployed or paid-tested to create this document. Proposed interfaces and limits are labeled as proposals; actual current behavior is listed separately.

