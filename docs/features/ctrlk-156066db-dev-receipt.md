# Main-preserving dev checkpoint: 156066db

Merged verified main `6962d35179e9ead3159402b4f9abb8c82cc1eb5c` into the feature branch at `1d2a3b9c`; `156066db` corrects a CI check name. Production CAD app/worker configuration, job/model/global budget modules and executor production budget/configuration are unchanged from main. No main push or production deployment occurred.

Dev: https://rabbit-hole-web-dev-ctrlk-tools.tryrabbithole.workers.dev

Web version `ba9bd6cf-6649-4734-ae6c-2e9b31f67446`: build 11.83 seconds, upload 8.49 seconds, triggers 0.33 seconds. Exact tracked sparse design inputs were restored byte-for-byte before building. Embedded notebook assets remain version `29d0b428-b342-4354-95b5-a1dbeebd21ba`.

Affected actual-image checks: **5 passed, 0 failed, 0 skipped, 0 interrupted**, 15.340 seconds, canvas `canvas-c57bb917`. The browser transformed actual pixels and stored an immutable derivative, preserved original source access, exercised Undo/Redo and reload, then verified that Explain's decision request carries the accepted source ID/revision without a retained legacy media ID. Model responses were fixtures; the final decision was deliberately blocked after inspecting its context. No model call was made. Evidence: `e2e/shots/ctrlk-image-current-run1/results.json`.

The backend current-image permission reader, context and production-configuration tests passed **29/29** after integration. They cover unauthorized/stale/malformed revision refusal and no legacy fallback. This is deterministic authorization coverage, not a real vision model or screenshot extraction claim.

Unaffected notebook and Equation evidence remains attributed to [28015081](ctrlk-28015081-dev-receipt.md); autocomplete remains attributed to [51e11889](../../evidence/autocomplete-51e11889-receipt.md). Reuse does not imply those browser scenarios reran at this SHA. Full release readiness is pending CI mapping correction and the applicable gate. The complete Ctrl+K brief and real-model quality verification are not declared complete.
