# Local autocomplete in canvas Code text boxes

The toolbar's existing Text/Code object now opens a lazy CodeMirror editor while editing Code. Ordinary text retains its existing editor. Content, identity and placement remain unchanged; language is stored on the existing object. Unspecified language defaults to Plain text. No model, execution, repository fetch or language server is involved.

Python, JavaScript, TypeScript, JSON, HTML, CSS and SQL load local language support. Keywords/snippets and current-box identifiers are local suggestions, not type-aware or library-aware completion. Unsupported languages and sources over 100,000 characters remain editable without these suggestions. Indentation currently uses the editor's default two spaces; inferred indentation is not claimed.

Enter inserts a newline; Tab accepts a visible suggestion or indents. Escape dismisses completion before finishing editing. Active-editor Undo stays within the editor. Accepted text is one canvas Undo transaction. Opening an unchanged local draft preserves canvas Redo. Formatting changes are independent canvas transactions. Remote text conflicts retain the local draft for copying/discarding and reject stale commits.

## Working-candidate verification, 2026-10-18

Base `7d6ec5356d5185da45c93676fd80c0f207254e89` plus this commit's integration changes:

- Focused unit checks: 7 passed, 0 failed, 0 skipped.
- Local canvas code checks: 22 passed, 0 failed; before the final completion-source identity correction. Those results do not prove completion behavior.
- Final local draft history regression: 4 passed, 0 failed (formatting-only Undo, unchanged-open Redo and no browser errors).
- Final isolated component checks: 13 passed; focused Enter/Tab/conflict/discard checks: 5 passed. Zero network requests. Detailed fixture and failed-run evidence is on `test/code-box-autocomplete-app` at `77d390e7`; source diff fingerprint is recorded there.
- Earlier canvas text-family checks: 35 passed before the final history/completion fixes; retained as earlier regression evidence only.

The focused completion regression initially failed because a newly created completion-source function on every lookup invalidated CodeMirror's query identity. The corrected effect retains a stable function. Separate harness corrections wait for lazy language readiness, use the configured two-space indentation, and reproduce the app's flex/min-height CSS. Original failures are retained in the diagnostic receipt.

Sandbox process-launch restrictions and missing local dependencies prevented earlier starts; they did not exercise product assertions. Disk exhaustion interrupted a write; the task-owned editor was restored and re-reviewed before the final component and history checks.

Deployed integrated app verification, shared-view access, panel/zoom popup bounds, duplicate/reload and Ctrl+K selection checks remain pending. Component checks alone are not a release-readiness claim. No production changes are included.
