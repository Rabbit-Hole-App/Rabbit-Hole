# Readiness diagnosis at fd36ac72

Initial required unit groups, using existing dependencies and bounded concurrency:

| Group | Passed | Failed | Skipped | Duration |
| --- | ---: | ---: | ---: | --- |
| Web | 3164 | 9 | 6 | 81.714 s |
| Control plane | 1851 | 1 | 1 | 67.454 s |
| Python unit | 31 | 0 | 0 | 13.11 s |
| Remaining run.sh Node groups | 368 | 2 | 32 | See retained log |

No skipped case counts as coverage. Logs remain `packages/web/ctrlk-final-web-unit.log`, `packages/control-plane/ctrlk-final-cp-unit.log`, `ctrlk-final-python-unit.log`, and `ctrlk-final-remaining-unit.log` in this worktree.

Diagnosed failures:

- Bare React lazy loading for CodeBox bypassed the app's import-recovery mechanism. It now uses the existing lazyFeature helper; its original invariant test is unchanged.
- The board-link reader audit exposed the new vertical graph helper. Inspection found annotation connectors could influence structural ranks. A regression using an annotation-only edge failed before excluding annotation edges from rank inputs; annotation dependencies remain protected.
- Equation source assertions still required immediate saved blank insertion and blur commit during Generate. The authorized provisional placement and generation transaction now have explicit assertions; manual change/deletion Undo and typing guards remain asserted. Actual deployed insertion/Undo and local dynamic permission evidence are recorded separately.
- Card eligibility source assertions now include the separately validated image and explicit notebook-cell routes, retaining general file/card/CAD restrictions.
- Equation's authorized capability is added to the pinned capability list; Flashcards remain explicit-only and the existing rejection assertions remain.
- The authorized static notebook clone was missing from the dev-config inventory. The inventory now includes it and explicitly asserts no Worker entry, service, database, bucket, Durable Object, queue or AI binding.
- Sparse-checkout fixture assets were absent. Only missing committed favicon/demo assets were restored byte-for-byte; unchanged asset checks passed 10/10.
- Legacy guard tests lacked Git Bash on PATH. Using the already-installed Git Bash, unchanged tests passed 2/2; no deployment was attempted.
- The notebook Code extraction test expected implicit Python for an unspecified language. Its independent correction explicitly verifies Python extraction and refuses Plain text/missing/unknown language, matching the requested default. See its separate commit.

Focused owned corrections passed **46/46**, zero failures/skips. These focused passes do not rewrite the initial full-run failures; a final candidate run remains required after integrating all corrections. No paid calls or new infrastructure were used.
