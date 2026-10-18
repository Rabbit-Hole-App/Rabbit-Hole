# Image Explain grounding

Implementation: `951690ab0b357608444e57ab4f2f0b18a5e0796a`.

Explicit image Explain now refuses unavailable pixels with `409 source_unavailable` before generation. Existing card-producing Explain routes receive the authorized image alongside their existing context documents, through the same artifact call. Edit behavior and source access checks are unchanged.

The two new regressions failed before the fix: **0 passed / 2 failed**. After the fix, the generation subset passed **7 / 0 / 0 skipped / 0 interrupted**. The expanded run initially had **21 passed / 2 failed**, because this sparse worktree lacked the tracked `repository-schema.sql` fixture. After materializing that unchanged file, the complete inline test file plus image-reader checks passed **23 / 0 / 0 skipped / 0 interrupted**, in 0.461 seconds.

Command: `node --test --test-isolation=none packages/control-plane/test/learn-inline.test.js packages/control-plane/src/learn-image-file-context.test.mjs`.

Independent read-only review found no blocking issue. All model responses and artifact generation here are deterministic fixtures; **zero provider requests**. These checks establish request grounding and refusal behavior, not real-model quality, extraction uncertainty reporting or full screenshot reconstruction. The integrated dev deployment and its browser evidence must be attributed separately.
