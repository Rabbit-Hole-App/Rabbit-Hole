# Notebook history and Equation permission safeguards

Implementation follows `2b5be36f` (separate notebook operation identity from transport correlation). The deployed `c0d98915` notebook split candidate was not browser-qualified: review found that transport request IDs replaced split operation IDs. No split pass is attributed to that deployment.

Notebook history now waits for the live workspace's guarded restore/save before consuming or publishing canvas history. Pending restores serialize Undo/Redo; a concurrent canvas change triggers a guarded rollback. Missing topology receipts, newer workspace changes and save failures leave canvas history untouched. A step changing multiple live notebooks is explicitly refused rather than claiming cross-frame atomicity. Frame replacement still loses its bounded topology receipts.

Five focused history tests passed: save refusal, pending serialization, concurrent canvas rollback, refused rollback protecting newer edits, and ordinary synchronous history/multiple-frame refusal. The earlier operation-envelope check exercises the actual parent envelope and frame dispatcher, including exact split IDs.

The actual AdaptiveCanvas Equation editor passed three local deterministic checks against `2b5be36f` plus these uncommitted safeguards: permission revocation during a pending request followed by late resolution, during a valid preview, and after manual draft changes followed by blur. All three retained the original saved equation, removed editing controls and produced no page errors. Results: 3 passed, 0 failed, 0 skipped, 0 interrupted (`e2e/shots/equation-permission/results.json`). No provider requests were made. This is local permission coverage, not deployed model verification.

Both corrected notebook assets and the web candidate still require coordinated dev deployment and the focused embedded-notebook checks. Real-model quality remains unverified.
