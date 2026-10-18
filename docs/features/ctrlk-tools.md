# Ctrl+K tools: contract and wave-one audit

Authoritative brief: `C:/Users/cyudhist/Desktop/ctrl_k_tools.txt`, read in full. Base `d16c3a456b19ad1cb816c5470380e997e102e9a3`; branch `feature/ctrlk-tools-wave1`. Owner: CAD UI lane, isolated `cad-ui/ctrlk-tools` worktree. Existing CAD work remains untouched in its original worktrees. This is a new feature, not CAD release scope.

## Existing mechanisms to extend

| Concern | Existing implementation | Required change |
| --- | --- | --- |
| Editor, eligibility, frozen request, Preview/Accept | `InlineAiEditor.jsx`, `inline-card-edit.js` | Preserve current text/card edit path; capability availability must use actual selection types. Keep requested mode unchanged. |
| Context and freshness | `inline-ai-context.js` | Keep existing bounded semantic context/fingerprints; add layout and source-version preconditions for operations which depend on them. Nearby context never grants mutation scope. |
| Route/validation and signed proceed | `inline-ai-decide.js`, `inline-ai-route.js`, control-plane `learn-inline-route.js` | Existing Edit criterion is text/style only. Extend criterion, allowed route, schemas and request binding together; bind plan and frozen scope to existing short-lived proceed. |
| Server execution/model transport | `learn-inline.js`, `agents/learn-inline.js` | Reuse authenticated access, spend admission and current model transport. No new paid verification authorization. No arbitrary HTTP/filesystem/shell tool. |
| Transactions, validation, Undo | `inline-ai-apply.js`, `AdaptiveCanvas.jsx` | Existing EDIT_OPS are text/range/style/card content. Validate native appearance/layout operations at preview and Accept, preserve unknown fields, produce one transaction/Undo. |
| Native property rules and layout | `learn-style-panel.js`, canvas arrangement helpers | Reuse strokePatch/noStroke/dash/typography semantics and measured bounds. Do not treat image pixels as native style. |
| Source permissions/persistence | `file-access.js`, file source/derivative/client helpers | Authenticate every source/range server-side; immutable new derivatives, original retained, pointer changes only on Accept. |
| Existing Explain outputs | artifact and inline diagram handlers | Reuse handlers, preserve originals and source links. Availability remains explicit. |
| Background removal | No existing removal adapter found | Requires concrete alpha-producing implementation/runtime review. Do not substitute generative recoloring or claim transparency from a fixture. Continue deterministic native work while blocked. |

## Shared contract

`inline-tool-capabilities.js` is browser/worker compatible metadata and pure eligibility/plan validation. Tool IDs are internal; users keep natural-language Edit/Explain.

A descriptor specifies supported modes and selection kinds, readable ranges, allowed mutation families, output, runtime, spend requirements and preview/cancel/recovery semantics. Metadata alone does not enable a tool. An execution adapter must explicitly declare availability; unavailable tools retain a plain-language reason. Server authorization remains authoritative.

A bounded plan is `{mode, targetIds, steps:[{tool, targetIds, input}]}`. At most four steps, twenty targets and one coherent resulting transaction. All step targets must be within the frozen original target IDs. This initial validator rejects implicit scope expansion; later structural graph work must explicitly model additions and dependencies before enabling it. No step changes mode. Read tools can support either mode; mutation capabilities obey their mode-specific destination. No automatic retry or arbitrary execution code is introduced by this foundation.

The editor's frozen package retains its content fingerprint and source IDs/revisions; layout-sensitive operations additionally bind measured bounds/layout fingerprint. Plan parameters must be validated by each adapter's schema; this foundational envelope validator does not establish their safety. The full normalized request and plan must be included in the existing signed proceed binding. Before Accept, re-evaluate permission, lock state, target identity, content/layout/source fingerprints and dependencies against live state. Reject conflicts without overwriting current work.

## Delivery sequence and boundaries

1. Registry and bounded plan foundations, then one integrated native appearance + arrangement request using existing editor/Preview/Accept. Extend eligibility, router criteria, schemas, server validation and transaction handling together. Verify unrelated objects, topology, one Undo and stale target rejection.
2. Background-removal adapter with actual alpha/original persistence/reload/cancellation checks, plus existing Explain handlers exposed through the registry. Any new runtime/provider requires its own access/cost proposal and authorization.
3. Wave two: deterministic image transforms, regional edit, annotations, extraction/reconstruction, diagram changes, comparison and evidence retrieval.
4. Wave three: table computation, notebook cell edits/output invalidation, computation and explicitly requested isolated code execution.

No wave-one completion claim until integrated user journeys pass. Fixtures, actual deterministic execution, deployed browser evidence and real-provider quality remain distinct. CAD production activation and historical Undo investigations are separate tasks. Pinned Study, simulations, expanded audio/video and additional CAD refinement remain excluded.

## Current checkpoint

Audit, contract and pure registry/plan foundations are implemented. `inline-native-tools.js` adds fail-closed native appearance previews and translation-only alignment/equal-gap calculations from verified measured bounds, preserving input objects. Styling reuses native property keys and paste semantics. Resizing/same-width, actual canvas transactions and UI execution remain unimplemented. Focused run: **39 passed / 0 failed / 0 skipped** (9 new contract/native checks, 30 existing style-panel checks); deterministic JavaScript only. Product route wiring, dev deployment and PR are not complete. No provider calls, runtime provisioning or production changes. No completion ETA is confirmed: measure the first integrated native operation and runtime feasibility before estimating remaining delivery.


## Native integration checkpoint (2026-10-18)

The original Edit route now accepts an optional bounded native plan through its signed request and model tool schema. Native appearance and one measured alignment/equal-gap operation share one Preview, Accept and Undo transaction. The first adapter supports native shapes/connectors for appearance; arrangement supports boxed shapes and standalone text/sticky notes. Card movement/resizing, same-width, image operations and structural edits remain unavailable in this checkpoint. Text/card editing and existing Explain routes retain their original contracts.

The editor freezes selected objects and measured bounds at submission; the server validates plan inputs and IDs; Preview and Accept recheck live state. Arbitrary coordinates, external targets, locked objects, unsupported image recoloring, changed layout and malformed snapshots are rejected. Shape previews reuse the canvas ShapeView; source objects remain unchanged until Accept. The optional native context belongs only to this inline request, not normal Chat or TOC.

Validation against the implementation working tree: 36 focused web/native tests and 36 existing server tests passed; actual-app local browser check passed 5/5 cases (frozen context, combined change, one Undo/Redo, server reload, no model calls/errors). Existing stale-preview browser checks passed 7/7 assertions. First three native browser attempts reached zero assertions and interrupted all five cases: Chrome sandbox spawn denial; missing local dev flags; Vite worker compiler subprocess denial. Corrected local environment completed run 4. Existing card-edit browser check remains **0 passed / 0 failed / 0 skipped / 7 interrupted**, blocked by setup PUT /api/profile HTTP403. Assertions were not weakened. Dev build passed in 8.26 seconds with existing CSS/chunk-size warnings. No real model requests were made; model routing quality and background removal remain unverified. This is not completion of wave one or the full brief.

### Deployed native checkpoint

Implementation `c96687ab` is deployed at https://rabbit-hole-web-dev-ctrlk-tools.tryrabbithole.workers.dev (Worker version `d1ff78e9-0287-47fe-9f4a-1d6bf77117fa`). The actual deployed app passed the same five fixture-wired acceptance cases in **16.923 seconds**, with zero failures, skips, interruptions, browser exceptions or real model requests. Upload took 20.20 seconds plus 0.36 seconds for triggers. This demonstrates deployed wiring and persistence, not real-provider routing quality.

The existing card-edit harness setup 403 was diagnosed: its Origin header named the Vite frontend while proxy `changeOrigin` made the profile handler receive the local app-worker origin. The harness now accepts an explicit local `APP_API` and sends that exact origin; no application authorization or assertions changed. The final rerun on the existing stack passed **7/7** checks, including structured content, Refine, Accept, one Undo/Redo and server reload. Historical interrupted setup runs remain: 7 interrupted on origin mismatch, 7 interrupted when the owned Vite watcher exited with EBUSY on generated output, and an ENOSPC setup interruption whose final receipt could not be written. Only this worktree's generated `dist-dev` (135,329,317 bytes) was removed after successful deployment to reclaim space; sources and screenshots remain.

Independent table, image-transform, structural-diagram, notebook-cell and annotation helpers are integrated as foundation commits after this deployed checkpoint. Their user-facing routing, preview/application and source permission flows are not yet integrated or deployed. Equation work remains separately queued. The CI planner's tracked-executable classification test also exposes preexisting unmapped file-import/converter files at this branch's base; the native check is explicitly registered as Windows-only/manual, not asserted as Linux-qualified coverage.


### Table and structural diagram integration checkpoint

The shared `inline-tool-plan.js` controller extends the same Edit preview with deterministic table sorting/deduplication/explicit-factor scaling and selected native diagram label/add/remove/rewire operations. Requests freeze selected objects plus bounded read-only incident graph evidence; dependencies never enlarge mutation scope. Table source/citation restrictions remain enforced. Annotation connectors cannot be treated as structural diagram edges. A structural step must be last, with at most one per preview. Unsupported tools stay unavailable.

Table changes reuse the existing structured card comparison. Structural previews show explicit additions/removals and native shape ghosts; connector ghosts are indicative dashed lines, while accepted connectors use the normal canvas renderer. Accept rechecks the selection, dependencies and measured layout; table/diagram edits share one Undo transaction. Refine retains the complete bounded tool plan or refuses an oversized previous result.

Focused frontend/controller/session/annotation verification: **41 passed / 0 failed / 0 skipped**. Actual local app fixture run `ctrlk-tools-run2`: **5 passed / 0 failed / 0 skipped / 0 interrupted**, covering complete table context, preview isolation, Accept, one Undo, fresh diagram node/connector IDs, and no provider requests or browser exceptions. Earlier run1 also passed five cases before structural ghosts were added. Backend schema integration and updated deployed verification are pending at this checkpoint; the deployed native receipt above remains attributed to `c96687ab`. No real-model quality claim. Image transforms, annotation plans and notebook cell edits remain pure adapters without the full UI/source/runtime path.


### Deployed combined checkpoint

Implementation **73b18e2e** (frontend dede7789 plus backend signed-plan integration) is deployed to the same isolated clone, Worker version **9f6af7b8-a75a-4019-a36d-aeb73b9a418f**. Complete public assets were reused read-only from a clean existing checkout with identical tree `099323904512a55b1d75857a4d1e779811cc4e73`. Build passed in **7.87 seconds**; upload **11.14 seconds**, triggers **0.44 seconds**. Existing CSS/chunk warnings remain.

On that exact deployed SHA, expanded table/diagram fixtures passed **5/5 in 15.069 seconds**, and existing native appearance/arrangement fixtures passed **5/5 in 13.030 seconds**, both with zero failures, skips, interruptions or provider calls. Expanded fixtures prove table sorting and graph additions in the actual app with preview isolation and one Undo; they do not establish real-model quality or every transform variant in a browser. The first expanded deployed attempt used the local stack's test credential against the remote dev control plane and returned session401: **0 passed / 0 failed / 0 skipped / 5 interrupted**. The rerun used the already-existing named dev test credential; no secrets or infrastructure were changed.

Combined focused validation passed **42 checks** (35 shared/server checks plus 7 new signed-plan server checks), zero failed/skipped. Frontend focused41 remains separately attributed to the frontend working tree preceding its commit. Source-backed/citation-bearing tables, scope expansion, annotation-as-structural-edge, stale dependencies and unknown adapters fail closed. No broad release suite or real model check was run for this checkpoint.


### Annotation frontend checkpoint

Explain can now preview native anchored callouts/highlights through a distinct `annotations` result and transaction; it never silently becomes Edit. Selected source-backed or locked cards can receive explanations without rewriting their content. Edit annotation plans change only selected existing native callout text. The shared controller enforces frozen intent, targets and measured bounds, supports one annotation step per preview, and preserves the existing plain-note path.

Frontend/controller/session checks: **44 passed / 0 failed / 0 skipped**. Actual-app local fixture run3: **4 passed / 0 failed / 0 skipped / 0 interrupted in 10.824 seconds**, including Explain intent, native preview isolation, Accept preserving the original, one Undo/Redo and reload. Runs1 and2 each recorded 0 passed / 1 failed / 3 interrupted: the fixture incorrectly used note outcome instead of the existing required text outcome, then its assertion read mode from the transport envelope instead of request.mode. Corrected fixture fields retained the intended assertions. Backend annotation schema integration and deployment are pending at this checkpoint. No real-model calls.


### Deployed annotation checkpoint

Implementation **beff3b7c** (frontend818f9d87, backend4e436261, reader-audit registration) is deployed to the same isolated dev clone, Worker version **15975f2d-95df-4ba3-891b-d2453e44fb4d**. Build passed in **11.03 seconds**; upload **8.51 seconds**, triggers **0.33 seconds**. Combined focused checks passed **50/50**, zero failed/skipped, after registering the backend tool schema as a schema-only link reader in the existing annotation audit.

The exact deployed annotation scenario passed **4/4 in 16.035 seconds**, zero failures/skips/interruptions/provider calls/browser errors. This verifies Explain intent, native callout preview, source-preserving Accept, one Undo/Redo and reload with deterministic model responses. Valid Explain snapshots use one structured generation response that can return an ordinary note or an explicit annotation plan; clients without the snapshot keep the existing streamed note path. Real-model selection/output quality remains unverified.

Build infrastructure finding: public-asset junctions combined with sparse Git operations can remove tracked files in the shared target. Public junction use has stopped; the final search-int junction was detached non-recursively before any Git mutation, and its target asset was verified present. Prior cad-integration/card-scroll-int targets require coordinated restoration of proven-clean tracked assets. This is a workspace incident, separate from application behavior; no repository source change should be inferred from generated build cleanup. Future builds must use owned assets or staging copies.


### Notebook selected-cell checkpoint (2026-10-18, pending browser verification)

The notebook header and iframe Ctrl+K now capture actual selected cell IDs from the active Jupyter document. Whole-card selection does not imply cell selection. Preparation refreshes the frame document; Preview is source-only; Accept rechecks document, path, workspace and selected IDs, saves the guarded source change into the existing workspace, then applies one canvas transaction. Edited and downstream code outputs become stale and are cleared. No cell or kernel command is executed by this editing path. Canvas Undo/Redo restores the frame only when its expected revision still matches; save failures do not overwrite concurrent changes.

Focused deterministic checks: 39 passed, 0 failed, 0 skipped; three changed JSX modules compile. These results do not establish actual Jupyter browser integration or model quality. Backend selected-cell-only prompt redaction is a separate dependent checkpoint. Browser verification is pending the shared browser resource window.

An isolated static-only notebook review site is available at https://rabbit-hole-canvas-notebook-dev-ctrlk-tools.tryrabbithole.workers.dev, initial version `5e125280-51fa-4c5e-8b50-a412c6eae617`. It has no Worker script, service/storage bindings or new executor. It serves a copy of existing public JupyterLite assets plus the source-edit bridge on its own origin, preserving iframe origin isolation. The latest local save/Undo guards still require a static update; this initial version is not their evidence. The owned static manifest records 808 files; no user notebooks, workspace data or credentials are included. Shared notebook hosting is unchanged.

Session cleanup after review: from `packages/web`, run `node ../../node_modules/wrangler/bin/wrangler.js delete --config wrangler.ctrlk-notebook-dev.jsonc --name rabbit-hole-canvas-notebook-dev-ctrlk-tools`. Do not delete it while the review web clone uses it. No production site is changed by this checkpoint.


### Deployed notebook acceptance ? implementation `707b52f0`

Web preview https://rabbit-hole-web-dev-ctrlk-tools.tryrabbithole.workers.dev, version `1f6e3090-89b0-400a-a8fb-b789d6e3b65f`, includes frontend `ac181a6e` and selected-cell-only backend context `707b52f0` (original backend checkpoint `c080fbca`). Static notebook origin version `6eed0fcf-7b3d-4196-a98b-ea061e41dffb` includes the guarded save and Undo bridge. Build passed in 9.17 seconds; web upload 8.17 seconds and triggers 0.36 seconds. The initial build attempts failed on missing sparse-checkout design inputs, then disk space; no application code changed to pass the build. Only generated caches/staging were removed; public source assets were read without filesystem links.

Combined focused checks: **63 passed / 0 failed / 0 skipped**. Deployed actual Jupyter acceptance (`e2e/shots/ctrlk-notebook-deployed-run3/results.json`): **5 passed / 0 failed / 0 skipped / 0 interrupted**. Verified actual selected cells, source-only preview, unchanged saved source before Accept, guarded workspace plus canvas persistence, downstream output invalidation, one canvas Undo/Redo synchronized into the live notebook, and reload. No notebook cells executed, no real provider requests, no browser exceptions. Generation is a deterministic network fixture; mathematical/code quality and real-model behavior remain unverified.

Preserved earlier browser evidence: run1 **2 passed / 1 failed / 0 skipped / 2 interrupted** because the harness clicked beyond the canvas into Chat before Undo. Run2 **4 passed / 1 failed / 0 skipped / 0 interrupted**: all source/Undo/reload assertions passed, but the harness blocked JupyterLite's PyPI fallback for its `comm` kernel support package, producing browser errors. The checked-in piplite wheel documents this fallback. Run3 allows only the additional PyPI metadata/wheel hosts and retains the zero-error assertion; product code and behavioral assertions are unchanged.

Source-only limitations remain explicit: no cell splitting, execution, kernel debugging or arbitrary filesystem edits; a notebook needs stable cell IDs and must fit the complete signed-context limit. Existing toolbar Run all/Restart controls are preserved but never invoked by Ctrl+K. A real-model check still requires its separately approved budget. The broader Ctrl+K image and arrangement scope is not complete.

## Combined Equation and Code dev checkpoint

Implementation `e00294b3` deployed to `https://rabbit-hole-web-dev-ctrlk-tools.tryrabbithole.workers.dev`, version `65b50c6d-568c-427b-846e-8cd52db52cf6`. Build 11.90s; upload 8.71s; triggers 0.30s. Nine focused Code/Equation tests passed after using the existing verified CodeMirror dependency cache. Actual deployed autocomplete verification is tracked separately by its browser receipt; this deployment alone is not a pass.

## Immutable image transforms: implementation checkpoint

`36b9f741` plus backend `148279bf` connects one explicitly selected editable image to crop, quarter-turn rotation, resize or padding. The shared schema validates bounded operation fields without reading bytes. The browser reads the authorized original, prepares an immutable PNG derivative, shows a preview and rechecks source/selection/permissions before Accept. One canvas transaction replaces the image while preserving its identity and geometry; original file-source provenance is retained permanently, including after Undo. Cancel disposes the local preview but may leave an unused uploaded source, because deduplicated source storage must not be deleted.

Initial scope is materialized owner main canvases only. Named review boards, pending holes, shared/member viewers, locked images and images with citations/references remain unavailable. Background removal, generative image edits, inferred crop regions and image reconstruction are not implemented by this deterministic adapter. Source dimensions are checked against actual bytes; the model must not invent pixel coordinates. Focused helper/plan/apply coverage: 33 passed; backend schema/route/plan integration: 16 passed, each with zero failures/skips. JSX compilation passed. Image browser, deployment and real-model checks remain pending.

### Deployed image acceptance: 51e11889

Dev version `40549dc7-a458-46eb-9a05-5a4564460264` on the same session clone. Build 9.66s; upload 9.13s; triggers 0.34s. Focused route/schema/helper checks: **27 passed / 0 failed / 0 skipped**. Actual-app acceptance: **4 passed / 0 failed / 0 skipped / 0 interrupted**, 11.894s, canvas `canvas-630a1c73`. Receipt and screenshots: `e2e/shots/ctrlk-image-run1/`.

The browser transformed real two-color PNG pixels from 2x1 to 1x2, uploaded an immutable derivative through existing dev file storage, and kept the original canvas unchanged until Accept. Identity and geometry, original source retention/read access, one Undo/Redo and reload all passed. Generation was a deterministic network fixture; this does not verify model choice of crop coordinates or natural-language quality. Cancellation, revoked access, duplicate Accept and stale inputs have focused helper coverage, not full browser coverage. The check-map classification test currently has historical unmapped file-import/media helpers; classification remains a release-readiness gap rather than bypassed coverage.
