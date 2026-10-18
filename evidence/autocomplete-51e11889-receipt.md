# Actual-app autocomplete acceptance

Deployed implementation: `51e11889`, version `40549dc7-a458-46eb-9a05-5a4564460264`, clean integrated deployment at https://rabbit-hole-web-dev-ctrlk-tools.tryrabbithole.workers.dev.

- Run 8: **7 passed / 1 failed / 0 skipped / 2 interrupted**, 45.042 seconds. The first seven scenarios passed: active-editor/Plain text default; keyword completion/editor Undo; identifier and keyboard behavior; one canvas Undo/Redo; literal Text/Code roundtrip/language/reload; duplicate persistence; exact selected Ctrl+K context without generation.
- Run 9: **1 passed / 1 failed / 7 skipped / 1 interrupted**. Search/popup passed; locator double-click could not target the deliberately noninteractive shared object because the read-only surface receives pointer events.
- Run 10: **3 passed / 0 failed / 7 skipped / 0 interrupted**, 9.928 seconds. Covers popup visibility/size/framing with Search open at two zooms, signed-out read-only interaction, and forbidden-request/browser-exception checks. Seven skipped cases explicitly reuse Run 8 at the same deployed SHA. This is ten scenarios covered across two runs, not ten newly passing tests in Run 10.

Evidence: [Run 8 JSON](autocomplete-51e11889-run8/results.json), [Run 9 JSON](autocomplete-51e11889-run9/results.json), [Run 10 JSON](autocomplete-51e11889-run10/results.json). Screenshots and prior failed diagnostics remain in these local evidence directories.

Harness corrections followed observed application semantics: language metadata changes finish editing; language tooling loads asynchronously; CodeMirror has a 75ms popup keyboard interaction guard; Text mode persists as an absent field; native items normalize fresh=false; duplicate placement overlaps the original; Search is selected using its existing Find tab; read-only pointer behavior is exercised using actual mouse coordinates. No force-click or product changes were used. Original failures remain preserved.

Provider/model and execution requests were blocked. No source-file upload was requested; normal board-save and board-thumbnail requests remain in the write log and are not described as zero network writes. There were zero paid/model calls. Synthetic public-view shares were revoked in finally. Authentication values were not recorded.

Limits: IME, remote concurrent draft conflict, fork/trash-restore, complete cross-user permission matrices, and real-model Ctrl+K behavior are not established by this acceptance run. Prior isolated component checks cover additional editor behavior separately; do not count fixtures as real-model verification.

Command: named dev auth mapped to TEST_BYPASS_SECRET; CANDIDATE_SHA=51e11889 REMAINING_ONLY=1 node packages/web/e2e/code-box-autocomplete-check.mjs. Node syntax check also passed. No broad suite repeated for this test-only correction.
