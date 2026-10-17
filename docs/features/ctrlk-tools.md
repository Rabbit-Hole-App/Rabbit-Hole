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
