# Card editing and reversible layout implementation plan

Goal: implement the two features in the owner's Card-scroll.txt through the existing inline editor, card renderer, board persistence and Undo paths.

Architecture: retain card records and their identity. A structured edit adapter validates supported fields and rejects incomplete inputs before inference. Per-card immutable cardLayout preferences select bounded scrolling or naturally measured Full content. Preserve the original column slot so natural height changes cannot move neighbours. Derived height remains DOM geometry, not repeated persisted changes.

Spec: C:/Users/cyudhist/Desktop/Card-scroll.txt, copied exactly to card-scroll-int/docs/features/card-scroll.md. The final content-aware minimum correction supersedes fixed 320–1200 bounds. No paid-model calls, production actions, automatic movement, collision checks or new save path.

Execution: owner explicitly requested autonomous parallel implementation and no routine review pauses. Use existing approved scope; only concrete conflicts require questions. Start from completed Search e9e9a2fc; main remains owner-only.

## Ownership and interfaces

- Coordinator: card-scroll-int / release/card-scroll. LearnPage context, integration hooks in AdaptiveCanvas after layout handoff, shared interfaces, final verification/release.
- UI: card-layout / feature/card-layout. AdaptiveCanvas, LearningBlocks, card-layout helper/tests and scoped CSS. Start with explanation vertical slice; expand snippet/table/image only after complete-content fit works.
- Editing: card-edit / feature/card-edit. inline-card-edit adapter, inline-ai context/apply/session/editor, existing server editing protocol and tests. No AdaptiveCanvas or LearningBlocks edits.
- Verification: card-checks / feature/card-scroll-checks. Deterministic card-scroll-check browser acceptance, no production code. Coordinate selectors with UI. One browser suite at a time; no extra stack without freeing coordinator's owned stack.

Shared record: cardLayout:{mode:'scrollable'|'full',scrollableSize:{w,h},fullWidth,slot:{w,h}}. Preferences immutable; no persisted derived height. Slot records original flow dimensions, not new content dimensions. Layout helper owns supported-type and sizing policy. Editing patches only allowed content fields against latest record, preserving layout and geometry.

## Tasks and acceptance

- [ ] Layout: extend existing CanvasNode and LessonBlockCard. Persist mode/preferences, sync dimensions on Undo, preserve original world top/left and column footprint. Mode switch is one Undo. Full mode uses only left/right width resizing; mixed selections cannot bypass constraints. Read-only and locked guards apply at mutation APIs.
- [ ] Fit: scope styles to full mode. Natural text/URL wrapping; code soft wrapping without source mutation; images proportional; tables readable with content-aware minimum; equations readable. Observe rendered content/assets/fonts/disclosures without save loops. Unsupported embedded or incomplete source renderers expose a clear disabled control.
- [ ] Editing: reuse model/preview/Accept/Refine. Structured whitelist for safe explanation/snippet/table/heading representations. Whole target and structure included or explicit budget refusal before model. Stale content/deleted/locked/readonly Accept rejected. Preserve ID/type/position/refs/layout; one Undo. Refine uses complete current proposal or explicit budget refusal. Original claim citations cannot be silently attributed to new claims; unsupported sourced rewrites explain the limitation.
- [ ] Context integration: add relevant existing conversation and intentionally supplied context to existing LearnPage extras, within budgets; never authorize edits to surrounding objects. Keep complete target separate from budgeted supporting material.
- [ ] Focused verification: exact content round-trip, width constraints at several zooms, no neighbour/camera movement, both modes after editing, stale/cancel/refine, one Undo, source copy, loaded assets, table/math overflow, reload/fork/trash metadata, readonly, Search long-match navigation and Back. Fixtures are wiring evidence, not real-model verification.
- [ ] Release: focused tests while iterating, exact candidate units/build/bundle and affected existing browser suites; integration skips reported separately. Isolated dev deployment and guarded browser/visual proof; release branch CI/gate under existing policy. Shared preview retains explicit promotion boundary. Never push main or run production D1.

Review focus: flex-column neighbour movement; stale measurement overwriting newer content; asynchronous loaded assets changing minimum; source citation misattribution; stale Accept after layout-only versus content changes. All require direct tests, not superficial state assertions.

Baseline: completed Search e9e9 has exact readiness and 45-stage gate/preview evidence. Reuse unaffected evidence only under release policy; do not claim it covers new code.
