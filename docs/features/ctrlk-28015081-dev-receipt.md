# Integrated dev checkpoint: 28015081

Dev app: https://rabbit-hole-web-dev-ctrlk-tools.tryrabbithole.workers.dev

- Web version `c08d99c9-009b-42d3-a307-55890b89e446`; build 10.24 seconds, upload 8.53 seconds, triggers 0.37 seconds.
- Embedded static notebook version `29d0b428-b342-4354-95b5-a1dbeebd21ba`; upload 4.84 seconds, triggers 0.47 seconds.
- Application code was committed at `28015081`. Sparse design-page restoration normalized trailing newlines in 18 unrelated design assets during this build; their exact tracked bytes were restored afterward. No application implementation diff was present.

Focused shared-plan, history, provenance and context tests: **33 passed, 0 failed, 0 skipped**.

Actual deployed embedded-notebook checks: **8 passed, 0 failed, 0 skipped, 0 interrupted**, 30.258 seconds, canvas `canvas-6c2a6abb`. The checks exercised explicit selected-cell source replacement and exact source partition into new cells, unchanged preview state, Accept, live-frame and saved-canvas Undo/Redo, and reload. Dependent outputs were cleared; no cells were executed. Two generation responses were deterministic fixtures. Evidence: `e2e/shots/ctrlk-notebook-split-run1/results.json`.

Equation deployed run: **10 passed, 1 failed, 0 skipped, 0 interrupted**, 34.991 seconds, canvas `canvas-06d7fe2c`. Toolbar insertion, replacement, Undo/Redo, reload, clarification, cancellation/late response, blocked spend and long-formula containment passed. The final view-only check failed before its doubleclick: the readonly canvas defaults to Hand and disables item pointer events, so Playwright's object locator could not receive the click. A focused correction uses actual pointer coordinates over the visible equation, preserving the no-edit assertions. Original failure retained in `e2e/shots/equation-integrated-run1/results.json`.

These are deterministic fixture checks, not real-model quality verification. The local dynamic Equation permission checks remain separately attributed in [the safeguard receipt](ctrlk-notebook-history-receipt.md). Earlier image and autocomplete results remain attributed to `51e11889`; see [autocomplete evidence](../../evidence/autocomplete-51e11889-receipt.md). The earlier `c0d98915` notebook deployment remains unqualified.

The corrected focused view-only Equation check passed **1 passed, 0 failed, 0 skipped, 0 interrupted** on unchanged `28015081` (`e2e/shots/equation-readonly-run2/results.json`). It sends an actual mouse doubleclick at the visible equation coordinates, preserving the canvas Hand tool's hit handling and all original no-edit assertions. The ten earlier passes are reused from the original run, not relabelled as a new uninterrupted eleven-check pass. Dynamic revocation still has its separate local three-check evidence.

The combined notebook transport/history regression tests also passed **16/16**, including operation identity, stale workspace refusal, guarded topology restoration and failed-save handling. The broader CI classification check was not green before main integration: historical import/converter files were unmapped; this is a release-readiness gap, not feature coverage.

Main `6962d351` is not an ancestor of this feature checkpoint. Reviewed integration preserving production CAD changes and the affected release checks are still required before a release PR can be considered ready. No main or production deployment occurred in this lane.
