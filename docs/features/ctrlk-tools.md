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
