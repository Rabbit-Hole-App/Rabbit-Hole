# Real saved CAD browser: first pass

Candidate `9e24ea7bae0227c9257ddddee9c3af94cdfe3de9`, isolated CAD dev clone, 2026-10-17. No model or executor requests issued.

Initial browser result: **2 passed / 1 failed / 0 skipped / 2 interrupted**. The real generated plate restored, its GLB loaded and orbit/Escape worked without changing its card. The board-scoped source read returned404 while owner-direct access succeeded and anonymous access was denied.

The harness waited only for the recovered card to appear, not for debounced autosave. Subsequent read-only inspection showed the accepted revision and matching fileRef source saved normally. At20:06:43–45UTC all five identical board-scoped artifact URLs returned200 without code changes, a redeploy or a manual save. Authorization derives from file_source_refs inserted in the same guarded batch as board persistence.

The harness now explicitly waits for persisted accepted revisions and matching source references before recording the layout baseline or testing board-scoped permissions. It also records persistence observations and board PUT response timestamps. This is a synchronization correction; the original failed receipt is retained. A passing follow-up is still required.

Evidence: acceptance worktree cad-runtime-browser-first/results.json and screenshot. This is distinct from synthetic fixture checks and from trusted geometry validation.
Corrected follow-up: **5 passed / 0 failed / 0 skipped / 0 interrupted**, same candidate, evidence `cad-runtime-browser-first-synchronized/results.json`. Persisted source/revision observed before checks; actual GLB interaction succeeded; all five stored artifacts returned owner200 and board-scoped200 while anonymous reads were denied; reload retained the same job, revision, attempt and layout. No page error or CAD mutation. This result covers the first simple model only, not the unstarted featured/edit/clarification scenarios.
