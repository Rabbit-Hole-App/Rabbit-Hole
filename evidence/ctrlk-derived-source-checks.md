# Derived-output source checks — 2026-10-18

Working branch: `feat/ctrlk-image-routing`. These checks do not establish release readiness, deployed browser behavior or real-model quality. No provider requests or costs were incurred.

## Selected-range provenance

Implementation `6b11f502` preserves the frozen selected text range on generated cards, matching the existing note representation. The detached metadata survives transaction application and JSON persistence; repeated Accept adds no duplicate and leaves the source board unchanged. Object IDs/ranges are not a claim that linked files or their complete contents were read.

The new regression first failed: **0 passed / 1 failed / 0 skipped / 0 interrupted**, because card provenance lacked `range`. After the fix, `inline-ai-apply.test.mjs`: **11 passed / 0 failed / 0 skipped / 0 interrupted**. Native diagram integration is separate.

## Bounded context disclosure

Implementation `c5e3d2b5` adds an explicit incomplete-context notice before an oversized artifact-context excerpt. Previously the raw 8,000-character prefix could drop later selected objects and the coverage fields without disclosure. Normal-size payloads are unchanged. The notice does not recover omitted data or prove a complete comparison.

The actual regression first recorded **1 passed / 1 failed / 0 skipped / 0 interrupted**. Two prior module-load failures reached no scenario assertions because this sparse worktree lacked the existing lesson/math schema JSON dependencies; the tracked files were materialized without installing dependencies. After the fix, `inline-artifact-context.test.mjs` plus `inline-ai-review.test.mjs`: **36 passed / 0 failed / 0 skipped / 0 interrupted**.

Commands use `node --test --test-isolation=none` against the named files. Real-model handling of incomplete context, full-source comparison, browser Accept/reload for the new range metadata and source-file/page/revision provenance remain unverified or incomplete; these focused checks do not substitute for them.
