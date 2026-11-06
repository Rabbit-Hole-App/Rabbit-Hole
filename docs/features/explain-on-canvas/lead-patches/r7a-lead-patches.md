# R7a lead patches (Lead-only files). Nothing here is applied by the lane; no migration is applied to any database.

Order: R4 rows already in `scripts/ci/check-map.json` at the base (`rabbit-hole/main` e90b47083 or later); the R7a patches apply on top of it, in any order.

| Lead-only file | Patch | Apply |
| --- | --- | --- |
| `scripts/ci/check-map.json` | 4 new rows + 6 appended rows (no new e2e check) | `node docs/features/explain-on-canvas/lead-patches/apply-r7a-check-map.mjs`; proven on the worktree: `scripts/ci/check-map.test.mjs` 22/22 with it, 21/22 without (the one failure is "every tracked executable file has a class" for the four new files) |
| `packages/control-plane/repository-schema.sql` | append `learn-migrations/0042-roadmap-source-index.sql` | `node docs/features/explain-on-canvas/lead-patches/apply-r7a-schema.mjs` (idempotent, CRLF kept; sqlite load of the result creates the 2 tables and 2 indexes) |
| `packages/control-plane/src/learn-models.js` (+ its test) | register `roadmap_index` (Sonnet 5.5, low, maxTokens 2000, platform-funded, one tool, no fallback) | `git apply docs/features/explain-on-canvas/lead-patches/r7a-learn-models-roadmap-index.patch` (checked with `git apply --check`; `learn-models.test.js` 15/15 with it) |
| `wrangler*.jsonc` | none required. `ROADMAP_LONG_MARKDOWN_ENABLED` is read from `env`; unset is off. To make it explicit in a dev config add `"ROADMAP_LONG_MARKDOWN_ENABLED": "false"` next to `ROADMAP_ENABLED` | optional |
| route mounts, `LearnPage.jsx`, `learn-usage.js` | none. R7a adds no route: the create route already passes `source.scope` to `makeReadSource`, which now understands `{ kind: 'section', locationId, part }` when the switch is on | - |

## Decisions the Lead owns

1. **Summary trigger.** Nothing in R7a calls `summarizeIndex` (no schedule, no route). Section choices work without summaries. If the Lead wants summaries, mount one job that calls
   `summarizeIndex(env, access, indexId, { readSourceForActor, callModel: makeIndexCallModel(env) })` (both in `roadmap-source-summary.js`) after the oversize limitation is shown.
   Bounded by `INDEX_LIMITS.summary` (12 calls, 480,000 characters, 3 attempts per batch, 240 s per index) and cached per source revision, so a repeat costs nothing.
2. **Call identity and quota.** `learn_roadmap_calls` (migration 0039) is per roadmap and its `stage` list is closed, so index calls are checkpointed in `learn_source_index_batches` instead
   (reserved before dispatch; a crash leaves `reserved`, which the next run marks `unknown` and never retries blind). `makeIndexCallModel` takes an optional `reserve()` hook for a per-learner quota; R7a
   adds none because `QUOTA_STAGES` is R4 State's. If a per-learner index quota is wanted, add an `index` stage to `roadmap-quota.js` and `ROADMAP_LIMITS.quotas`, and pass `reserve`.
   Whether the usage ledger needs an operation id for platform-funded index calls (as `withRoadmapProviderCall` gives roadmap stages) is unverified; no real call was made.
3. **Switch name.** `ROADMAP_LONG_MARKDOWN_ENABLED` (beneath `ROADMAP_ENABLED`). Rename freely; it is one function, `longMarkdownEnabled` in `roadmap-source-index.js`.
