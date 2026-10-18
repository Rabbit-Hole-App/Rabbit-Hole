# Existing Explain routes and derived-card provenance

Implementation `28015081`; deployed web version `c08d99c9-009b-42d3-a307-55890b89e446` at https://rabbit-hole-web-dev-ctrlk-tools.tryrabbithole.workers.dev. Includes selected-range provenance fix f662eab6 equivalent to 6b11f502.

[Final run 3](explain-28015081-run3/results.json): **5 passed / 0 failed / 0 skipped / 0 interrupted**, 11.023 seconds.

- Two selected native Code text objects reach the existing natural-language Compare route with both IDs; preview does not mutate either source.
- Accept creates one comparison table; two synchronous Accept clicks remain one insertion. Both source IDs and route/mode persist after server reload.
- Explicit /flashcards from a selected code range creates a separate flashcard artifact, preserves its source and records exact id/from/to provenance through Accept and reload.
- Cancelling a prepared comparison leaves the board unchanged; a cancelled in-flight response is discarded when it arrives.
- Four deterministic fixture generations, zero provider/execution requests, zero browser exceptions.

[Preview screenshot](explain-28015081-run3/compare-preview.png).

Historical diagnostics preserved: [Run 1](explain-28015081-run1/results.json) and [Run 2](explain-28015081-run2/results.json), each **0 passed / 1 failed / 0 skipped / 4 interrupted**. Run 1 assumed /compare existed as a slash command; the app correctly refused it. Compare is an existing natural-language routed capability. Run 2 supplied the native-result SSE envelope to the card handler; the existing card transport requires JSON `{result:'artifact',block,primitive}`. Corrections changed the fixture, not product behavior or assertions.

Scope: actual deployed app selection, preview, Accept and persistence with intercepted deterministic decide/generate results. This does not verify real model quality, server generation validators, all learning-artifact kinds, registry-only adapters, actual snippet-card selection, native-diagram provenance, or remote-content staleness rejection. The sources here are native Code text objects; do not relabel them code-sample cards. Cancel/late-response coverage is not stale concurrent-content coverage.

Command: named authorized dev auth mapped to TEST_BYPASS_SECRET; CANDIDATE_SHA recorded above; node packages/web/e2e/ctrlk-explain-provenance-check.mjs. Node syntax passed. No new services, model calls, product edits or broad suite. Browser released to UI after final run.
