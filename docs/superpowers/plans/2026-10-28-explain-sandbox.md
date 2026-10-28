# Generic /explain Sandbox Implementation Plan

> **For Parallel and its agents:** This is the replacement implementation brief. Use the project's subagent-driven development workflow, with one integrator and the scoped owners below. Track the checkboxes as work is completed. Do not restart the previous component-family plan.

**Goal:** Let the AI generate an interactive explanation's calculations, drawings and behavior from the learner's request, without adding application code for each subject.

**Architecture:** Keep the existing /explain jobs, model transport, review/repair loop, ownership checks and saved cards. Add a versioned JavaScript program artifact executed by a restricted interpreter in a dedicated browser Worker; trusted Rabbit Hole code validates and renders its output. The same pinned interpreter and renderer run during preview/review and learner playback.

**Tech stack:** Existing JavaScript/React/Vite, Zod contracts, Explanation renderer, control-plane job pipeline and Browser Rendering. First runtime candidate: QuickJS/WASM using the synchronous quickjs-emscripten distribution, in a dedicated Worker. Version 0.32.0 is the upstream candidate inspected; verify published package integrity, transitive WASM version, license and advisories before installing and lock exact versions.

**Spec:** This file contains both the agreed product specification and execution plan. Save it in the repository as `docs/superpowers/plans/2026-10-28-explain-sandbox.md`.

**Evidence baseline:** Main `1a4434cff466d0648dc274dbb56dc2481a64fbf4`, inspected 2026-10-28. Refresh main and read its authoritative CLAUDE.md before starting. This document records code inspection and a proposed implementation; it does not claim that a sandbox, provider generation or production deployment has passed.

## 1. Direction, authority and scope

- Supersede REPORT.md / REPORT-v2-tightened.md's plan to add swinging-body, gear-train and dedicated pendulumPeriod/gearRate calculators. Keep those reports as historical evidence, marked superseded; do not delete unrelated work.
- Also supersede the earlier assistant proposal to build an extensive custom expression language. Generate ordinary JavaScript within a controlled runtime instead.
- No new prompt keyword switches, topic registries, prepared-card lookup, subject-specific production formulas, or hand-authored response substitution. Existing saved lesson components remain for compatibility; they must not become the implementation of new generic interactive requests. A new subject within supported technical capabilities must require only a newly generated program.
- Examples such as pendulums, springs, energy, economics and algorithms belong in fixtures and evaluation prompts. They must not create product branches. A generated program may naturally contain a subject's formula; the application must not need that formula registered ahead of time.
- Keep existing static and steps cards compatible. Retain the legacy component route for old artifacts and where appropriate existing simple results; the new interactive route must not secretly fall back to a lesson component.
- This is /explain, not /motion, CAD, or the landing capture. Do not add a video-provider dependency or change those products.
- The owner explicitly asks you to push each completed small task to main so its code can be reviewed. Treat that as standing authorization for the scoped, checked incremental integrations below; do not ask the same main-push question repeatedly. Main pushes trigger production releases, so incomplete capability stays server-disabled and backward compatible.
- This does not bypass branch protection, required checks, or expand paid-call, migration, workflow-edit or infrastructure permissions. Reuse existing permissions where they already cover an action. Surface only genuine remaining approval requirements, with a concrete prepared action and its exact reason.
- The MVP is an integration milestone, not a stopping point. Continue through the full-feature tasks without another planning approval loop. Keep independent work moving through genuine blockers.
- The landing-only “no CI” instruction does not apply to executing generated code in the application. Use focused tests and required release checks, not a new elaborate verification platform.

## 2. What exists and where to integrate

Paths below were inspected on the baseline; new paths proposed later are not claims that files already exist.

| Existing location | Reuse / required adjustment |
|---|---|
| `packages/web/src/LearnPage.jsx`, startExplain | Sends ordinary requests as requestClass simple, places pending card. Preserve command, Tutor and context entry points. |
| `packages/control-plane/src/explain-brief.js` | Normal simple requests with configured thresholds skip preparation. Do not add mandatory approval because a card is interactive. Clarify only when a material ambiguity or existing policy requires it. |
| `packages/control-plane/src/agents/explain-author.js`, authorTool | Currently limits output to registered VisualSpec components. Add a program-output variant, using the same author role. |
| `packages/control-plane/src/explain-author.js` | Capability declaration, author call and validation. Add program validation; do not send source code through compileVisual. |
| `packages/web/src/visual-components/compile.js` | Existing component compiler. Preserve it for legacy results; it does not propagate component motion. Do not rebuild it into a second programming language. |
| `packages/control-plane/src/explain-job.js`, explainPipeline, accept, block, editBase | Current job stages, identity, recovery, result storage and revision checks. They assume compiled scenes; add a discriminated artifact rather than bypassing the job. |
| `packages/control-plane/src/explain-render.js` | Actual screenshot capture in a controlled browser, asset interception and capture budgets. Execute the same program/runtime used in the card before capture. |
| `packages/control-plane/src/explain-review.js`, explain-repair.js | Existing independent semantic/visual review, bounded repairs. Expand evidence to include source, runtime results and sampled behavior; remove silent motion-to-static substitution for the new path. |
| `packages/control-plane/src/explain-policy.js`, learn-models.js | Central role models, token/image/call/spend limits. All program calls must pass through this policy and accounting. |
| `packages/web/src/explain-client.js` | Result/edit helpers currently require block.scene. Support program artifacts, stale-result checks, saved inputs and old cards. |
| `packages/web/src/LearningBlocks.jsx` | Explanation card currently renders AnimatedScene; add program dispatch while keeping card shell and edit flow. |
| `packages/web/src/AnimatedScene.jsx` | Contains private Frame renderer, controls, selection, playback and scrubber. Extract/reuse trusted rendering without changing legacy semantics. |
| `packages/web/src/animation-scene.js`, scene-style.js, scene-vocab.js | Existing shapes and brand styles. IMPORTANT: RENDERED_TYPES has no generic path/polyline type. Add bounded polyline output for curves; draw_path's name is not proof of curve support. |
| `packages/control-plane/src/inline-code-runtime.js` | Existing Ctrl+K runner: one-shot server JS returning JSON, 3 s caller deadline, 1 s requested CPU cap; caller timeout does not confirm termination. Reuse lessons/helpers only where appropriate, not as the live player. |
| `packages/control-plane/test/explain-m3.test.js` | Real-worker fixture flow: submit through author/render/review/repair/settle/save/reload. Extend it instead of creating a disconnected demonstration pipeline. |

The committed production config does not bind INLINE_CODE_LOADER or enable INLINE_CODE_ENABLED. Do not claim that paid Workers access or live Ctrl+K execution is proven. The proposed browser interpreter does not depend on activating that service or its 200-run lifetime budget.

## 3. Learner workflow and completion boundaries

1. Learner submits /explain plus optional authorized material.
2. AI chooses an appropriate explanation and authors its program, controls, text and declared assumptions.
3. Runtime executes it; deterministic checks and rendered evidence feed the independent reviewer.
4. Existing bounded repairs address failures. No silent degradation.
5. Accepted artifact is stored, versioned and attached to the existing card.
6. Learner changes inputs, plays, pauses, scrubs or interacts. The saved program executes locally in isolation; there is no LLM request or server round trip for each frame/control movement.
7. Reload restores the same accepted artifact and saved learner state. An edit creates and reviews a new revision before Apply.

**MVP:** Real V2 generation, isolated execution, generic 2D drawings including curves, numeric/select controls, time playback, real review/repair, saved/reloaded artifact, two structurally different genuine generated examples on the same runtime, private preview URL. Fixture evidence is necessary but does not satisfy genuine generation.

**Full feature:** MVP plus bounded stateful events and continuous controls, richer general visual composition, existing Tutor/material/edit integrations, accessibility, supported browser/device coverage, multiple-card resource management, production accounting/observability, backward compatibility and completed rollout. It is not a claim to handle arbitrary 3D worlds, native binaries, unlimited libraries or every scientific model.

## 4. Models and where to use them

Preserve the existing admitted model transport and pricing registry. These are product runtime roles; they are separate from Claude Code agents implementing the feature.

| Responsibility | Model / mechanism | Instructions |
|---|---|---|
| Optional preparation | `explain_brief` → `claude-opus-5-5` | Existing 4,000 output-token cap. No new routine planning call for simple requests. |
| Program author | `explain_author` → `claude-opus-5-5` | Start with existing 10,000 output tokens. Supply the small runtime SDK, output contract, limits and authorized context. Produce one program bundle through the validated tool. |
| Independent review | `explain_review` → `claude-opus-5-5` | Existing 3,000 output tokens. Separate context receives learner request, source/claims, evidence, execution traces and actual captures, not the author's reasoning. Check teaching and behavior, not only appearance. |
| Repair | `explain_repair` → `claude-opus-5-5` | Existing 6,000 output tokens; keep at most three correction rounds. Program repairs may replace source/manifest, but never raise host permissions or limits. |
| Existing typed routing/triage/grading | JEV, only where already applicable | Main pins direct `jev-1.13.0`; gateway uses `typesafe-ai/jev`. Preserve transport and log served model. Do not add a topic classifier or redundant JEV call on every /explain. |
| Execution, protocol enforcement, permissions, quotas | Deterministic application code | Neither Opus nor JEV is a security boundary or proof of mathematical truth. |
| Learner playback | No model | Run the saved program. A deliberate request to revise the lesson is a new authoring/edit job. |

Opus 5.5 is verified, not a speculative name. Existing policy uses tool_choice auto, omits manual thinking settings and disallows model fallbacks. Preserve that: do not force tool_choice any/tool or disable thinking. JEV is a typed evaluator, not a code author or the sole visual reviewer. Do not combine a JEV version upgrade with this feature.

Keep existing input-token/image limits initially: author 60,000 input tokens / 4 images; review 40,000 / 6; repair 40,000 / 2. Preflight the actual serialized request with the existing policy estimator BEFORE authoring: subtract mandatory context, schema, image allowance and trace overhead to derive an admissible program budget. Start with at most 16 KiB source and 4 KiB manifest, lowered further if required; those ceilings do not themselves guarantee a request fits. Do not ask the author for a bundle that the reviewer/repairer cannot receive. Runtime logs must be bounded. If required source/evidence cannot fit, return a specific size/capability finding or version and reprice the policy; never silently omit required facts. Reprice and update consent/hold tests before changing token, image or call ceilings. Unknown provider usage remains unknown, not zero.

For development agents, use Opus 5.5 where available in the user's Claude Code environment for runtime/security, integration and independent review. Other agents may use the session's configured coding model; do not invent availability or silently change the user's configuration. More paid model roles are not a speed strategy.

## 5. Runtime decision and interfaces

### 5.1 First candidate to prove

Use a pinned synchronous QuickJS/WASM interpreter in a dedicated browser Worker. Generated JavaScript runs **inside the guest interpreter**, never via native eval, Function, dynamic import or script injection in Rabbit Hole's page or native Worker context.

Give the guest JSON values and a small pure rendering helper library. No host functions that fetch URLs, read cookies/storage, invoke app APIs, access the DOM, install packages or obtain provider keys. Disable module loading except immutable explicitly bundled helpers. No access to actual wall-clock time or unseeded randomness: time and seed are host inputs.

Each artifact instance gets isolated guest state. Host validates bounded output before rendering; no HTML strings or guest DOM. A page Worker alone is not the security argument. The interpreter, tightly controlled bridge, output validation, lifecycle limits and browser platform together define the boundary.

Use the same artifact, engine build and SDK version in the review browser. Avoid an unrelated server JS runtime for “proof” and a different browser runtime for playback. Cloudflare's existing one-shot adapter remains an independent feature.

If this candidate fails measured security/resource/performance requirements, the runtime owner reports the failed case and the smallest alternative. Do not silently replace isolation with same-origin unrestricted JavaScript or start a survey of five platforms.

### 5.2 Proposed contract to freeze in Task 2

Proposed new module family: `packages/web/src/explain-program/`.

- `contract.js`: ProgramArtifact, ProgramManifest, EvaluateRequest, Frame and RuntimeError schemas. Strict versions and bounded values.
- `runtime.js`: QuickJS lifecycle and pure evaluator adapter.
- `worker.js`: trusted Worker bootstrap; it loads trusted runtime code, then gives source to the guest interpreter.
- `host.js`: request IDs, deadlines, cancellation, stale-response suppression, disposal and worker concurrency.
- `frame.js`: output validation and normalization to trusted renderer inputs.
- `sdk.js`: generic geometry/formatting conveniences only; no subject formulas or lesson catalogue.
- `ProgramScene.jsx`: program card wrapper using the shared Frame and existing card controls.
- Adjacent `*.test.mjs` files; proposed browser check `packages/web/e2e/explain-program-check.mjs`.

Artifact fields: kind = explain_program, schemaVersion, runtimeVersion, sdkVersion, rendererVersion, runtimePolicyVersion, permissionProfileVersion, manifest, source, sourceHash, manifestHash, bundleHash. Host computes hashes; never trust hashes supplied by the model. Bundle identity binds source, manifest, engine/SDK/renderer build fingerprints, executable dependencies and runtime/permission policies. Review receipts additionally bind request/context evidence versions and evaluation policy. Missing, unavailable or revoked versions fail explicitly rather than executing with whatever is newest.

Manifest: title, concise summary, assumptions, input definitions (stable id, label, unit, type, default, domain), optional time duration, output/readout definitions, accessible description, required capabilities. Subject names are descriptive data, never routing keys.

Guest module exports a synchronous `evaluate({inputs, time, seed, state}) -> {frame, quantities}`. MVP state is null. Functions, loops and mathematical expressions are generated JavaScript, not a new expression grammar. Imports, timers and asynchronous guest APIs are unavailable.

Frame contains bounded visual objects, finite coordinates, plain text/math runs, semantic style roles and optional readouts. Quantities are named values reused by the program for motion and readouts; telemetry records them for checking. This records what the program calculates, not a certification that its model is scientifically correct.

Host API:
- `createProgramHost({artifact, limits}) -> {evaluate(request), dispose(reason)}`
- `evaluate({requestId, inputs, time, seed, state}) -> Promise<{requestId, frame, quantities, metrics}>`
- Errors use stable codes: invalid_program, unsupported_capability, runtime_limit, runtime_error, invalid_output, version_unavailable. Sensitive source/context is not put into user error text or URLs.
- A response is accepted only for the current artifact hash, card instance and input revision. One request in flight; coalesce newer slider/time requests to the newest pending value.
- Start the initialization watchdog before evaluating any SDK or guest source. Source upload/load/evaluation/serialization are all under resource limits. Serialize in the guest under the interrupt; check encoded length before copying into host memory, then perform bounded-depth parsing and schema validation. Do not dump an unbounded guest object graph into host JavaScript first. Guest getters, toJSON and proxy traps remain inside this deadline. Disposal rejects pending promises exactly once, terminates the Worker and ignores late messages.

Full-feature extension in Task 8: synchronous `initialState({inputs,seed}) -> JSON` and `reduce({state,event,inputs,seed}) -> JSON`. State stays bounded and explicit; evaluate must not depend on hidden mutable globals. Reinitialize guest context per operation or prove an equally strong reset mechanism. Distinguish numeric control changes from state-changing actions and define resets in the manifest.

### 5.3 Initial limits to measure, not measured promises

Keep a single versioned policy file, proposed `limits.js`. Starting values:
- Source at most 16 KiB and manifest 4 KiB, further reduced by model-request preflight; explicit state 32 KiB; serialized output 256 KiB and JSON nesting depth 32. These are independent limits; aggregate guest and host allocations must also be bounded.
- Guest heap 16 MiB, stack 256 KiB; bounded WASM memory/build and documented total Worker memory.
- One evaluation interrupt budget 50 ms; host hard watchdog 250 ms followed by Worker.terminate and disposal. Interrupts also cover initialization and serialization. Cold runtime boot has a separate 2 s watchdog.
- At most 240 objects total, 60 per visible part, matching existing scene limits; at most 10,000 total polyline points, not per object.
- MVP at most four scalar controls; finite option combinations capped at the existing 64-state limit. Full continuous controls use sampled evidence, never a claim of exhaustive coverage.
- Shared scheduler initially permits at most two active playing/evaluating cards, suspends offscreen/hidden cards, and disposes idle runtimes. Persist inputs/state outside the guest so disposal is safe.

Measure warm evaluation + transfer p95 against 16 ms on the nominated desktop for a 30 fps playback target; measure total render/frame time too. Report cold start, Worker memory, mobile timings and actual limitations. These values are proposed engineering starting points, not existing product guarantees; change them only with evidence and a recorded rationale.

## 6. Agent ownership and work order

Start three scoped implementation owners and one short independent review assignment. Reuse existing idle agents if their context fits; do not create duplicate owners.

| Owner | Exclusive area | Work |
|---|---|---|
| Parallel / integrator | main, cross-layer contracts, policy, release manifest | Task 0; resolve interfaces; integrate one checked slice at a time; update checklist and receipts |
| Agent A: runtime | explain-program runtime/worker/host/limits | Tasks 1, 3; resource portions of 8 and 10 |
| Agent B: card/renderer | shared Frame extraction, ProgramScene, client integration | Tasks 2 and 4; UI portions of 8–10 |
| Agent C: generation | control-plane author/job/render/review/repair | Tasks 5–7 and 9 |
| Independent reviewer | read-only review of boundary and end-to-end evidence | At Task 1/3 boundary and before activation; no competing implementation |

Agent A and B can begin together after Task 0's interface agreement. Agent C can prepare author schemas, fixture responses and accounting tests against the agreed contract while A/B build. Do not have two agents edit the same shared file; integrator owns any cross-lane conflict.

Critical path: runtime proof + contract/renderer → host/card → real job pipeline + preview/review → genuine MVP → full interaction/context/browser completion → activation. Prepare downstream scripts and evidence while waiting on CI. Each background run has a named owner who checks it; do not leave detached watchers with no completion notification.

## 7. Small tasks and acceptance checklist

Each numbered task is a coherent, checked main integration. A task may contain multiple working commits; do not run an entire gate for every individual edit or checkbox. If a task grows, split by an independently verifiable behavior and update the checklist.

### Task 0 — Replace the plan and pin the baseline

**Owner:** integrator. **Dependencies:** none.

- [ ] Read fresh main, CLAUDE.md, current model policy and deployment scripts. Record the exact baseline and current release state.
- [ ] Commit this plan and `docs/features/explain-sandbox-checklist.md`; mark prior /explain family-component implementation plans superseded.
- [ ] Record owners, dependencies, feature-off behavior, runtime candidate and proposed limits. Use additive `EXPLAIN_PROGRAM_ENABLED=false` as the server generation default and a separate server-controlled execution eligibility/kill policy from the first playable slice; do not change EXPLAIN_V2_ENABLED globally. CI/dev fixtures have explicit nonproduction admission, never a production approval bypass. Production execution requires a server-owned accepted artifact and an authorized audience; an imported block, copied hash or client flag is insufficient.
- [ ] Reserve one clear integration sequence. Capture active jobs before any rollout that could affect them.

**Done:** plan/checklist are on main with links, all implementation owners named; no feature activation or paid generation claimed.

### Task 1 — Prove the interpreter boundary before building on it

**Owner:** A, independent boundary review. **Dependencies:** 0.
**Files:** proposed runtime.js, worker.js, limits.js, runtime.test.mjs; pinned web package/lockfile; approved CI feasibility check.

- [ ] Verify the actual published synchronous package, integrity and WASM dependency versions. Bundle locally as immutable assets; no runtime CDN fetch or arbitrary npm installation.
- [ ] Implement the smallest `evaluate` adapter and real interruption/disposal. Test source initialization, evaluation and output extraction separately.
- [ ] Prove denied fetch/XHR/WebSocket/import, DOM/cookies/storage/process/credentials, host Function escape attempts, cross-card globals and host callbacks. Prove no network side effect with an external observer; undefined globals alone are insufficient evidence.
- [ ] Exercise infinite loops, recursion, heap growth, huge/cyclic output, getters/toJSON loops, microtask attempts, repeated initialization and worker disposal. Timeout must stop execution, not merely stop waiting.
- [ ] Run production-bundle/CSP/WASM loading in approved CI on the actual build; benchmark finite representative programs. Follow every abuse case with a valid program that succeeds.

**Done:** exact version/limits plus executable receipt: pass/fail per case, termination behavior, peak memory and timings. Adversarial fixtures running in the actual packaged interpreter are valid evidence; mocked runtime responses alone are not. Prove the production headers/build in an approved browser environment.
**Main:** checked disabled runtime foundation. If feasibility fails, commit evidence and move independent work forward; no dependent execution is enabled.

### Task 2 — Freeze a subject-independent artifact and render contract

**Owner:** B with integrator. **Dependencies:** 0; parallel with 1.
**Files:** contract.js, frame.js, sdk.js and tests; shared Frame extracted from AnimatedScene.jsx; animation-scene.js only for additive generic primitive support.

- [ ] Implement strict artifact and host-frame validation. Reject source masquerading as HTML, URLs, external images, unsupported imports, functions in output, nonfinite coordinates, forbidden keys and over-budget structures.
- [ ] Extract Frame without changing old cards. Preserve scene-style.js/scene-vocab.js roles, math rendering, selection and accessibility.
- [ ] Add one generic finite-point polyline primitive with point/count bounds, clipping and stable IDs. Use it for curves, coils and plotted series; do not introduce spring/gear/energy components.
- [ ] Keep all math rendering on the hardened math-run path (KaTeX trust false and bounded expansion), including newly emitted equations.
- [ ] Verify old fixtures render identically; new generated-like frames with altered point counts, geometry and labels render correctly.

**Done:** two unrelated fixture programs can use the same contract; those fixtures are labelled hand-authored test data, not generation evidence.
**Main:** compatible renderer/contract slice; new program generation disabled.

### Task 3 — Host programs safely and keep the canvas responsive

**Owner:** A. **Dependencies:** 1, 2.
**Files:** host.js, worker.js, runtime.js; host.test.mjs and browser check.

- [ ] Implement hash/revision/request binding, one-in-flight queue, latest-input coalescing, hard termination and structured error handling.
- [ ] Use explicit time/seed/input data and reinitialize the guest context before every evaluate operation from the MVP onward. Test repeated and shuffled-order evaluations. A different reset mechanism requires a documented independent review; tests alone do not prove that hidden globals are absent. Include SDK/source initialization and output conversion in each evaluation's bounded lifetime.
- [ ] Enforce per-card isolation and the shared active-runtime budget. Test hiding, deleting, navigating away, repeated mount/unmount and rapid slider changes.
- [ ] Record runtime metrics without prompt/source leakage. Drop stale responses; disposal is idempotent.

**Done:** a malicious or expensive card cannot keep the app busy indefinitely; another card remains usable; newest inputs win.
**Main:** disabled host slice with cleanup proof, no orphan Workers.

### Task 4 — Put a real interactive program inside the existing card

**Owner:** B. **Dependencies:** 2, 3.
**Files:** ProgramScene.jsx; LearningBlocks.jsx; explain-client.js; existing controls/style modules.

- [ ] Dispatch by artifact kind. Production resolves an accepted program reference through the existing authorized result route and server execution policy; do not execute source pasted into canvas JSON or admit it from a client-provided approval flag. Pass validated frames to trusted rendering; never evaluate generated source in React.
- [ ] Connect existing Play/Pause/Replay and scrubber, numeric/select controls and reset behavior. Time cards start at zero on first creation; reopening restores the saved state under the established card policy.
- [ ] Implement no-model input updates, readout updates and program error/retry handling. A local restart runs the same artifact, not generation or billing.
- [ ] Verify old scene cards, proposed edit preview and pending-job state remain functional.

**Done:** a fixture card plays, scrubs, changes inputs and survives reload in the real app using CI/dev-only seeded board fixtures and test receipts. This does not claim production persistence or acceptance; Task 5 owns the real validated storage path. Provide a private preview URL for owner feedback and label fixture evidence in the internal receipt.
**Main:** compatible card plumbing disabled for new production generation.

### Task 5 — Author and persist programs through the real V2 job

**Owner:** C. **Dependencies:** 2; integration depends on 3, 4.
**Files:** agents/explain-author.js; explain-author.js; explain-job.js; explain-policy.js; explain-client.js; explain-m3.test.js; proposed shared program-stage helper.

- [ ] Add a discriminated author result: legacy VisualSpec or ProgramArtifact. Route by requested capability and supported output kind, never a topic keyword.
- [ ] Offer Opus the small SDK, artifact schema, declared runtime limits and authorized context. Request generated source, manifest and explicit assumptions. No prepared JSON, intercepted route or implicit old-artifact fallback.
- [ ] Validate source/manifest and host-computed hashes before preview. Extend accept/block/editBase/result helpers for both artifact kinds; existing scene-only assumptions must not drop program cards.
- [ ] Store source, manifest, runtime/SDK versions, hashes, model identity and context provenance behind existing ownership checks. Never expose private artifacts through public asset URLs.
- [ ] Keep normal requests on the existing direct author path. A request requiring unsupported capability returns an explicit gap; requested motion cannot be silently rewritten static.

**Done:** real-route fixture tests show pending → program artifact → reload with identity/ACL intact; replayed request produces one job, one admitted author attempt and one mocked settlement. Genuine provider/spend evidence belongs to Task 7.
**Main:** new generation path still server-disabled until Task 6 evidence.

### Task 6 — Preview, review, repair and account for the exact program

**Owner:** C with A/B interfaces. **Dependencies:** 3–5.
**Files:** explain-render.js; render entry; explain-review.js; agents/explain-repair.js; explain-repair.js; explain-policy.js and associated tests.

- [ ] Execute the same pinned guest engine and trusted renderer in Browser Rendering. Existing allowedAsset/interceptor accepts only trusted versioned assets; explicitly add required WASM MIME/path handling. Guest execution cannot use browser/server credentials.
- [ ] Capture meaningful time/input states and execution traces, not just endpoint screenshots. Traces contain chosen inputs, time, quantities, duration and runtime errors; reviewer also sees source and assumptions as untrusted material.
- [ ] Preserve original requested capabilities independently of whatever kind the author returned. Reject unnoticed loss of requested behavior and ask for an honest repair or capability gap.
- [ ] Keep code/security failures deterministic. Reviewer reports semantic and visual findings; its assertions and model-provided “tests” never substitute for independent runtime enforcement.
- [ ] Source, manifest, dependency or permission changes invalidate earlier review. Every repaired candidate is re-executed and re-reviewed. Stop on repeated/no-progress failure within the existing three corrections.
- [ ] Recompute bounds from actual transmitted source/text/images and central pricing. Preserve provider spend separately from learner charge. Reuse existing failed-work/refund rules; identify any genuinely new billing-policy choice explicitly rather than changing it accidentally.

**Review coverage:** MVP fixtures and first acceptance can use two finite control states within the existing six-image budget. Full multiple-control/continuous cards require a stated sampling manifest: defaults, boundaries, selected combinations and intermediate motion poses. Samples are not exhaustive proof. Do not remove requested controls just to fit six captures. If eight or more captures are justified, implement the bounded program-policy increase with reservation/quote/consent tests in the same slice; no silent budget overflow.

**Done:** tested incorrect source is repaired or refused; captured hash equals played hash; unknown costs are never reported as zero. Any observed runtime violation blocks readiness; resource and output limits remain enforced on every later evaluation, including inputs/times not sampled in review.
**Main:** checked review pipeline; still no broad activation.

### Task 7 — Complete the genuine MVP and continue

**Owner:** integrator + C; independent review. **Dependencies:** 1–6.
**Files:** explain-m3.test.js, new e2e/explain-program-check.mjs, scripts/ci/check-map.json, checklist and evidence receipt.

- [ ] Register the real browser check and verify it was actually selected on the exact candidate. Exercise submit, execute, review, repair, ready, inputs, scrubbing, save/reload and failed execution.
- [ ] Use two genuine model-generated examples with different structures and formulas, under the already-approved validation budget. State the bounded cost before running; if no approval covers it, prepare that final action while continuing free work.
- [ ] Pick the second prompt after the generic runtime is built. Change wording, values and arrangement without a new topic component. Record request, generated source hash, model, candidate, reviewer receipt and actual usage.
- [ ] Supply the working dev URL, clear limits and MVP receipt. Confirm that controls/playback make no LLM calls.

**Done:** real generated examples, not the landing fixture, work on the same runtime. Mark MVP accepted only with the actual evidence. Continue Tasks 8–11 without waiting for the owner to rediscover the remaining backlog.

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

## 8. UI contract: reuse the current card

No new UI design is requested. Use LearningBlocks' existing animation card shell and shared Frame; do not create a separately styled mini-site per explanation.

- Inherit card dimensions/resizing, existing typography and `--viz-*` / ink/line tokens. Preserve AnimatedScene's flex-column layout and gap-2 control spacing; no custom model-written CSS, fonts, colors or HTML.
- Reuse existing Play/Pause icons from lucide-react, Replay/reset behavior and scrubber geometry. Never display both old and new control rows.
- Use existing input widgets, labels and keyboard focus treatment; new controls wrap inside the card at phone width without horizontal page overflow.
- Default first time-mode frame is t=0, stopped. User Play advances real simulation time; display-speed changes must not falsify numerical readouts.
- Static cards have no meaningless playback controls. Reduced motion starts paused and supports manual stepping/scrubbing.
- Reuse current pending/review/edit messages. Proposed runtime errors: “This explanation stopped because it exceeded its runtime limit.” / “This explanation could not run. Your saved version is kept.” / “This explanation needs a capability that is not available yet.”
- “Restart explanation” reinitializes the saved artifact. It must not regenerate, charge credits or erase an accepted revision. Requesting an AI repair is a distinct intentional action.
- Mathematical text uses the hardened renderer; arbitrary src/href/HTML is never accepted. Future media support must resolve authorized asset IDs through host-owned code.
- Deliver the actual private preview URL by Task 4, then the genuine-generation URL by Task 7. The owner provides visual feedback; automated evidence stays honestly separated.

## 9. Main integration, testing and speed rules

1. Each completed numbered task lands on main through the existing supported release path. One integrator owns main. Agent branches are isolated worktrees; no agent force-pushes main.
2. Keep new generation off until its complete path is verified. Server/model/renderer changes and dependencies still need their required full gates. Use existing gate reuse only when `notReusableBetween` in `scripts/dev-deploy.mjs` permits it.
3. Every deploy needs newest exact-SHA verify and fast-e2e successes, the production build and bundle check, and the required gate/dev receipt. A green ancestor is not proof for a changed candidate.
4. `gate-sharded.yml` was not present on inspected main. Resolve the approved gate workflow/ref from the current release tooling; do not copy a historical dispatch command or invent a run ID.
5. Start downstream development from the agreed contract; do not wait for a production release to prepare tests/scripts. Freeze a candidate while its checks run, then integrate the next coherent slice. Avoid repeated rebases caused by unrelated releases.
6. Do not start the giant old motion harness for this work. Use affected unit tests, real program/browser checks and repository-mandated gates. Reuse unchanged evidence only under the actual policy.
7. Every background task has an owner and a finish notification. Dispose Workers/VMs, browser sessions and test processes in finally paths. Test failure must still close resources.
8. Keep the old project's browser rule: agents write checks and inspect approved CI results; no local browser automation unless the owner has explicitly granted that exception. `npm test` in packages/web is Playwright, not a unit command.
9. Do not make the owner paste environments, SHAs or several shell lines. If an owner action is genuinely needed, prepare and verify one launcher. Claude Code commands begin with `!`; an interactive Windows launcher is one absolute .cmd path runnable from any directory. Preserve required typed confirmations.
10. Continue independent authorized work after a blocker. Do not leave an agent waiting on an unowned background command or end with only “waiting for agents.”

Verified unit commands (agent internal use, at the indicated working directory):
- `packages/web`: `npm run test:unit`
- `packages/control-plane`: `npm test`
- Repository root before release: `make test-unit`
- Production build and `packages/web/e2e/production-bundle-check.mjs`: use current repository procedure and arguments; do not guess a shell line.

For a direct deterministic runtime regression, use Node's test runner on the new exact file, e.g. `node --test src/explain-program/runtime.test.mjs` from packages/web. Never run generated malicious fixtures natively in Node; the test harness may be Node, but guest source must execute inside the isolated interpreter. Browser termination/network/rendering proof belongs in the approved browser checks.

Meaningful regression names/assertions to include with their owning task:
- `guest_loop_is_terminated_and_next_card_runs`: infinite guest loop stops; host remains responsive; valid follow-up completes.
- `guest_cannot_reach_credentials_network_or_other_card`: external observer sees no guest request and unrelated state is unchanged.
- `serialization_is_also_bounded`: malicious getter/toJSON and huge output stop before reaching React.
- `stale_frame_cannot_replace_new_inputs`: older request/revision output is ignored.
- `review_hash_matches_played_artifact`: altering source, manifest, SDK or engine invalidates review.
- `real_v2_program_survives_reload_without_regeneration`: same result/program identity, saved inputs, zero new author calls after reload.
- `input_change_and_replay_do_not_charge`: no provider calls or generation writes during normal interaction.
- `legacy_card_and_edit_flow_remain_compatible`: old scene rendering unchanged, stale edit refused, Discard preserves the old result.

## 10. Checklist, evidence and ETA reporting

Maintain `docs/features/explain-sandbox-checklist.md` on main with UTC date/time and PT when reporting to the owner:

| Task | Owner | Implemented | Checked (kind/run) | Main SHA/link | Deployed | Enabled audience | Accepted evidence | Next action/blocker |
|---|---|---|---|---|---|---|---|---|

Each hand-back includes: changed files; exact candidate/main SHA; what ran and what did not; preview URL if relevant; runtime/model versions; cost reserved/actual/unknown; limitations; next executable action. Add a GitHub link to the small task diff so ChatGPT can inspect it.

Give estimates from measured step durations after Tasks 1 and 4. Report runtime proof, MVP, full feature and activation separately. Do not equate agent-days with human engineer-days or repeat the old 9–18-day estimate. Do not promise a same-day finish without evidence.

Independent review priorities: boundary escapes; unbounded serialization; changed source played under an old review; misleading scientific readouts despite valid execution; legacy/edit/rollback breakage. Each is covered by tasks and tests above.

## 11. Source references

Repository baseline: https://github.com/Rabbit-Hole-App/Rabbit-Hole/tree/1a4434cff466d0648dc274dbb56dc2481a64fbf4

- Current job/policy: packages/control-plane/src/explain-job.js, explain-policy.js, learn-models.js.
- Current component restriction: packages/control-plane/src/agents/explain-author.js and packages/web/src/visual-components/compile.js.
- Existing one-shot sandbox: packages/control-plane/src/inline-code-runtime.js; docs/features/ctrlk-code-loader-retest.md. It is not evidence of live interactive playback.
- Opus API identity/compatibility: https://platform.claude.com/docs/en/models/opus-5-5/whats-new-opus-5-5
- JEV versions and alias behavior: https://docs.typesafe.ai/models
- QuickJS/WASM implementation and lifetime guidance: https://github.com/justjake/quickjs-emscripten
- Candidate package metadata: https://github.com/justjake/quickjs-emscripten/blob/main/packages/quickjs-emscripten/package.json
- Runtime interrupt/heap/stack controls: https://github.com/justjake/quickjs-emscripten/blob/main/doc/quickjs-emscripten-core/classes/QuickJSRuntime.md
- Browser Worker termination: https://developer.mozilla.org/en-US/docs/Web/API/Worker/terminate

Public documentation establishes available mechanisms, not that Rabbit Hole's proposed implementation is secure, fast or deployed. Those claims require the task receipts.

