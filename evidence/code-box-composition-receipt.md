# CodeBox composition and concurrent-update follow-up

Tested source HEAD `2b5be36f292f07621683ad42b42c5f122e563a40` in cad-ui/ctrlk-tools. CodeBoxEditor.jsx clean. Concurrent AdaptiveCanvas integration diff Git blob hash `6e8d0e6407fd09928a502212bc1a88b42078c5da` was not loaded by this isolated fixture.

Run 3: **8 passed / 0 failed / 0 skipped**. Clean remote update keeps the editor instance and advances the expected commit baseline; Enter/Tab retain established semantics; dirty remote update retains local draft and refuses stale commit; discard loads latest remote text; synthetic composition suppresses completion/exit/inline-AI actions; completion resumes afterward; zero network requests/browser exceptions.

[Run 1](code-box-composition-run1.log) and [Run 2](code-box-composition-run2.log) each reported **5 passed / 1 failed / 0 skipped**; later cases interrupted, not passed. Run 1 incorrectly asserted source immutability after synthetic ArrowLeft/Delete, beyond the specified no-completion/no-canvas-action requirement. Run 2 incorrectly equated DOM bubbling with canvas actions. Both diagnostic failures remain recorded. [Run 3](code-box-composition-run3.log) retains observed six bubbled key events as diagnostics, not a passing canvas-action assertion.

The actual canvas global key handler at AdaptiveCanvas.jsx:3285?3287 returns immediately for focus inside `[data-rich-editor],[data-code-box-editor]`, before canvas commands; later typing guards add protection. That is code-review evidence, not actual-app IME verification. Synthetic DOM events are not trusted OS composition: physical IME and actual-app composition/canvas interactions remain unverified. No new product code, model calls, network calls, deployment, or broad suite.

Validation: Node syntax check and BUILD_ONLY esbuild fixture compilation passed (1,811,686 bytes before final diagnostic adjustment); final focused browser run passed. Command: COMPONENT_SRC=<candidate>/packages/web/src node packages/web/e2e/code-box-enter-conflict-component.mjs. Browser released after completion.
